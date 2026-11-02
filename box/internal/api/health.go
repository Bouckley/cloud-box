package api

import "net/http"

type health struct {
	Status  string `json:"status"`
	Version string `json:"version"`
}

func healthHandler(version string) http.HandlerFunc {
	return func(w http.ResponseWriter, _ *http.Request) {
		writeJSON(w, http.StatusOK, health{Status: "ok", Version: version})
	}
}
