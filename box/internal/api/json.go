package api

import (
	"encoding/json"
	"errors"
	"io"
	"net/http"
)

const maxJSONBytes = 1 << 20

// readJSON decodes the request body into v. Bodies over 1 MiB get 413,
// unknown fields or malformed JSON get 400. On failure it writes the error
// response and returns false.
func readJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	dec := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxJSONBytes))
	dec.DisallowUnknownFields()
	err := dec.Decode(v)
	if err == nil {
		if dec.Decode(&struct{}{}) != io.EOF {
			err = errors.New("trailing data after JSON body")
		}
	}
	if err == nil {
		return true
	}
	var tooBig *http.MaxBytesError
	if errors.As(err, &tooBig) {
		writeError(w, http.StatusRequestEntityTooLarge, apiError{
			Code:    "payload_too_large",
			Message: "The request is too large.",
			Action:  "Update the app, then try again.",
		})
		return false
	}
	badRequest(w, "The request is not valid JSON for this endpoint.")
	return false
}

// badRequest writes 400 invalid_request with message (which must not echo
// request data).
func badRequest(w http.ResponseWriter, message string) {
	writeError(w, http.StatusBadRequest, apiError{
		Code:    "invalid_request",
		Message: message,
		Action:  "Update the app, then try again.",
	})
}
