// Package api holds boxd's HTTP handlers. The contract is api/openapi.yaml.
package api

import (
	"io"
	"log/slog"
	"net/http"
	"strings"

	"github.com/Bouckley/cloud-box/box/internal/auth"
	"github.com/Bouckley/cloud-box/box/internal/blobs"
	"github.com/Bouckley/cloud-box/box/internal/hal/sim"
	"github.com/Bouckley/cloud-box/box/internal/jobs"
	"github.com/Bouckley/cloud-box/box/internal/library"
	"github.com/Bouckley/cloud-box/box/internal/status"
	"github.com/Bouckley/cloud-box/box/internal/trash"
)

// Deps are the services the handlers use. Each milestone task adds the
// service it builds; a nil service's routes are not registered.
type Deps struct {
	Version string
	Logger  *slog.Logger
	Auth    *auth.Service
	Blobs   *blobs.Service
	Library *library.Service
	Trash   *trash.Service
	Status  *status.Service

	// Sim and Jobs are used only by the dev API, which exists only in
	// builds with the sim tag.
	Sim  *sim.Sim
	Jobs *jobs.Runner

	// Web serves every path outside /v1 and /dev (the web app). Nil: those
	// paths are 404 like any unknown route.
	Web http.Handler
}

// handlers holds the dependencies every handler method uses.
type handlers struct {
	d   Deps
	log *slog.Logger
}

// NewRouter returns the handler for every /v1 endpoint, with every other
// path (except /dev) going to d.Web, wrapped with request logging (no
// secrets) and panic recovery.
func NewRouter(d Deps) http.Handler {
	logger := d.Logger
	if logger == nil {
		logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	mux := http.NewServeMux()
	h := &handlers{d: d, log: logger}
	mux.HandleFunc("GET /v1/health", healthHandler(d.Version))
	if d.Auth != nil {
		mux.HandleFunc("GET /v1/info", h.getInfo)
		mux.HandleFunc("POST /v1/setup", h.setup)
		mux.HandleFunc("POST /v1/auth/challenge", h.createChallenge)
		mux.HandleFunc("POST /v1/auth/verify", h.verifyChallenge)
		mux.HandleFunc("GET /v1/account", h.requireSession(h.getAccount))
		mux.HandleFunc("PUT /v1/account/password", h.requireOwner(h.changePassword))
		mux.HandleFunc("DELETE /v1/auth/session", h.requireSession(h.endSession))
		mux.HandleFunc("POST /v1/recovery/challenge", h.recoveryChallenge)
		mux.HandleFunc("POST /v1/recovery/reset", h.recoveryReset)
		mux.HandleFunc("GET /v1/devices", h.requireSession(h.listDevices))
		mux.HandleFunc("POST /v1/devices/pairing-codes", h.requireOwner(h.createPairingCode))
		mux.HandleFunc("POST /v1/devices/pair", h.pairDevice)
		mux.HandleFunc("DELETE /v1/devices/{id}", h.requireOwner(h.revokeDevice))
		mux.HandleFunc("PATCH /v1/devices/{id}", h.requireSession(h.renameDevice))
	}
	if d.Auth != nil && d.Blobs != nil {
		mux.HandleFunc("POST /v1/uploads", h.requireSession(h.createUpload))
		mux.HandleFunc("GET /v1/uploads/{id}", h.requireSession(h.getUpload))
		mux.HandleFunc("PUT /v1/uploads/{id}/parts/{n}", h.requireSession(h.putUploadPart))
		mux.HandleFunc("POST /v1/uploads/{id}/complete", h.requireSession(h.completeUpload))
		mux.HandleFunc("GET /v1/blobs/{id}", h.requireSession(h.getBlob))
	}
	if d.Auth != nil && d.Library != nil {
		mux.HandleFunc("GET /v1/collections", h.requireSession(h.listCollections))
		mux.HandleFunc("POST /v1/collections", h.requireSession(h.createCollection))
		mux.HandleFunc("PATCH /v1/collections/{id}", h.requireSession(h.updateCollection))
		mux.HandleFunc("DELETE /v1/collections/{id}", h.requireSession(h.deleteCollection))
		mux.HandleFunc("GET /v1/items", h.requireSession(h.listItemChanges))
		mux.HandleFunc("POST /v1/items", h.requireSession(h.createItem))
		mux.HandleFunc("POST /v1/items/lookup", h.requireSession(h.lookupItems))
		mux.HandleFunc("PATCH /v1/items/{id}", h.requireSession(h.updateItem))
	}
	if d.Auth != nil && d.Library != nil && d.Trash != nil {
		mux.HandleFunc("DELETE /v1/items/{id}", h.requireSession(itemIDHandler(h.trashItem)))
		mux.HandleFunc("POST /v1/items/{id}/restore", h.requireSession(itemIDHandler(h.restoreItem)))
		mux.HandleFunc("GET /v1/trash", h.requireSession(h.listTrash))
		mux.HandleFunc("DELETE /v1/trash/{id}", h.requireOwner(itemIDHandler(h.deleteFromTrash)))
	}
	if d.Auth != nil && d.Status != nil {
		mux.HandleFunc("GET /v1/status", h.requireSession(h.getStatus))
	}
	registerDevSim(mux, h)
	var root http.Handler = &jsonErrors{mux: mux}
	if d.Web != nil {
		root = &splitWeb{api: root, web: d.Web}
	}
	return withLogging(logger, withRecover(logger, root))
}

// splitWeb sends /v1 and /dev to the API and everything else to the web app,
// so no web route can ever shadow an API path.
type splitWeb struct {
	api, web http.Handler
}

func (s *splitWeb) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	p := r.URL.Path
	for _, prefix := range []string{"/v1", "/dev"} {
		if p == prefix || strings.HasPrefix(p, prefix+"/") {
			s.api.ServeHTTP(w, r)
			return
		}
	}
	s.web.ServeHTTP(w, r)
}

// jsonErrors turns the mux's plain-text 404 and 405 into the JSON error shape.
type jsonErrors struct {
	mux *http.ServeMux
}

func (j *jsonErrors) ServeHTTP(w http.ResponseWriter, r *http.Request) {
	h, pattern := j.mux.Handler(r)
	if pattern != "" {
		j.mux.ServeHTTP(w, r)
		return
	}
	probe := &headerProbe{header: http.Header{}}
	h.ServeHTTP(probe, r)
	if probe.status == http.StatusMethodNotAllowed {
		w.Header().Set("Allow", probe.header.Get("Allow"))
		writeError(w, http.StatusMethodNotAllowed, apiError{
			Code:    "method_not_allowed",
			Message: "The box does not accept this request method here.",
			Action:  "Update the app, then try again.",
		})
		return
	}
	notFound(w, r)
}

// headerProbe records what the mux's fallback handler would send.
type headerProbe struct {
	header http.Header
	status int
}

func (p *headerProbe) Header() http.Header         { return p.header }
func (p *headerProbe) Write(b []byte) (int, error) { return len(b), nil }
func (p *headerProbe) WriteHeader(status int)      { p.status = status }
