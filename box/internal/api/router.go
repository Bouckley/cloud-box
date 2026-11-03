// Package api holds boxd's HTTP handlers. The contract is api/openapi.yaml.
package api

import (
	"io"
	"log/slog"
	"net/http"

	"github.com/Bouckley/cloud-box/box/internal/auth"
	"github.com/Bouckley/cloud-box/box/internal/blobs"
)

// Deps are the services the handlers use. Each milestone task adds the
// service it builds; a nil service's routes are not registered.
type Deps struct {
	Version string
	Logger  *slog.Logger
	Auth    *auth.Service
	Blobs   *blobs.Service
}

// handlers holds the dependencies every handler method uses.
type handlers struct {
	d   Deps
	log *slog.Logger
}

// NewRouter returns the handler for every /v1 endpoint, wrapped with
// request logging (no secrets) and panic recovery.
func NewRouter(d Deps) http.Handler {
	logger := d.Logger
	if logger == nil {
		logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	mux := http.NewServeMux()
	h := &handlers{d: d, log: logger}
	mux.HandleFunc("GET /v1/health", healthHandler(d.Version))
	if d.Auth != nil {
		mux.HandleFunc("POST /v1/setup", h.setup)
		mux.HandleFunc("POST /v1/auth/challenge", h.createChallenge)
		mux.HandleFunc("POST /v1/auth/verify", h.verifyChallenge)
		mux.HandleFunc("GET /v1/account", h.requireSession(h.getAccount))
		mux.HandleFunc("GET /v1/devices", h.requireSession(h.listDevices))
		mux.HandleFunc("POST /v1/devices/pairing-codes", h.requireSession(h.createPairingCode))
		mux.HandleFunc("POST /v1/devices/pair", h.pairDevice)
		mux.HandleFunc("DELETE /v1/devices/{id}", h.requireSession(h.revokeDevice))
	}
	if d.Auth != nil && d.Blobs != nil {
		mux.HandleFunc("POST /v1/uploads", h.requireSession(h.createUpload))
		mux.HandleFunc("GET /v1/uploads/{id}", h.requireSession(h.getUpload))
		mux.HandleFunc("PUT /v1/uploads/{id}/parts/{n}", h.requireSession(h.putUploadPart))
		mux.HandleFunc("POST /v1/uploads/{id}/complete", h.requireSession(h.completeUpload))
	}
	return withLogging(logger, withRecover(logger, &jsonErrors{mux: mux}))
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
