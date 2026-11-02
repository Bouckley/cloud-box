package api

import (
	"encoding/json"
	"net/http"
)

// apiError is the one error shape every endpoint returns (docs/04-box-api.md).
// Action is plain-language text the apps can show as-is.
type apiError struct {
	Code    string `json:"code"`
	Message string `json:"message"`
	Action  string `json:"action"`
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeError(w http.ResponseWriter, status int, e apiError) {
	writeJSON(w, status, e)
}

func notFound(w http.ResponseWriter, _ *http.Request) {
	writeError(w, http.StatusNotFound, apiError{
		Code:    "not_found",
		Message: "This address does not exist on the box.",
		Action:  "Update the app, then try again.",
	})
}

// only wraps h so that other methods get a JSON 405 with an Allow header.
func only(method string, h http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != method {
			w.Header().Set("Allow", method)
			writeError(w, http.StatusMethodNotAllowed, apiError{
				Code:    "method_not_allowed",
				Message: "The box does not accept this request method here.",
				Action:  "Update the app, then try again.",
			})
			return
		}
		h(w, r)
	}
}
