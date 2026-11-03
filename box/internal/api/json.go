package api

import (
	"bytes"
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

// readOptionalJSON is readJSON for a body that may be left out: an empty
// body leaves v as it is.
func readOptionalJSON(w http.ResponseWriter, r *http.Request, v any) bool {
	raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxJSONBytes))
	if err == nil && len(bytes.TrimSpace(raw)) == 0 {
		return true
	}
	if err == nil {
		r.Body = io.NopCloser(bytes.NewReader(raw))
	} else {
		r.Body = io.NopCloser(errReader{err})
	}
	return readJSON(w, r, v)
}

type errReader struct{ err error }

func (e errReader) Read([]byte) (int, error) { return 0, e.err }

// badRequest writes 400 invalid_request with message (which must not echo
// request data).
func badRequest(w http.ResponseWriter, message string) {
	writeError(w, http.StatusBadRequest, apiError{
		Code:    "invalid_request",
		Message: message,
		Action:  "Update the app, then try again.",
	})
}
