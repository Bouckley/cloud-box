// Package api holds boxd's HTTP handlers. The contract is api/openapi.yaml.
package api

import (
	"io"
	"log/slog"
	"net/http"
)

// Deps are the services the handlers use. Each milestone task adds the
// service it builds; a nil service's routes are not registered.
type Deps struct {
	Version string
	Logger  *slog.Logger
}

// NewRouter returns the handler for every /v1 endpoint, wrapped with
// request logging (no secrets) and panic recovery.
func NewRouter(d Deps) http.Handler {
	logger := d.Logger
	if logger == nil {
		logger = slog.New(slog.NewTextHandler(io.Discard, nil))
	}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /v1/health", healthHandler(d.Version))
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
