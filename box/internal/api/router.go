// Package api holds boxd's HTTP handlers. The contract is api/openapi.yaml.
package api

import "net/http"

// NewRouter returns the handler for every /v1 endpoint.
func NewRouter(version string) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("/v1/health", only(http.MethodGet, healthHandler(version)))
	mux.HandleFunc("/", notFound)
	return mux
}
