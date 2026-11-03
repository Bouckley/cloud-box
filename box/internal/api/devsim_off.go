//go:build !sim

package api

import "net/http"

// registerDevSim does nothing without the sim build tag (S5).
func registerDevSim(*http.ServeMux, *handlers) {}
