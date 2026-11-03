package api

import (
	"net/http"
	"time"

	"github.com/Bouckley/cloud-box/box/internal/auth"
)

// blobWriteTimeout lets a large video stream to a phone; the server's
// default 60 s write timeout is too short for that.
const blobWriteTimeout = time.Hour

func (h *handlers) getBlob(w http.ResponseWriter, r *http.Request, sess auth.Session) {
	id := r.PathValue("id")
	if !validID(id) {
		badRequest(w, "id must be 32 lowercase hex characters")
		return
	}
	f, b, err := h.d.Blobs.Open(r.Context(), sess.UserID, id)
	if err != nil {
		h.serviceError(w, r, err)
		return
	}
	defer f.Close()
	// Not every ResponseWriter supports deadlines (tests); ignore that error.
	_ = http.NewResponseController(w).SetWriteDeadline(time.Now().Add(blobWriteTimeout))
	hdr := w.Header()
	hdr.Set("Content-Type", "application/octet-stream")
	hdr.Set("X-Content-Type-Options", "nosniff")
	hdr.Set("Cache-Control", "private, no-store")
	hdr.Set("ETag", `"`+b.SHA256+`"`)
	// ServeContent handles Range, If-Range and If-None-Match.
	http.ServeContent(&rangeErrorWriter{ResponseWriter: w}, r, "", b.StoredAt, f)
}

// rangeErrorWriter replaces ServeContent's plain-text 416 with the API's
// JSON error shape, keeping its Content-Range: bytes */<size> header.
type rangeErrorWriter struct {
	http.ResponseWriter
	swallow bool
}

func (w *rangeErrorWriter) WriteHeader(status int) {
	if status != http.StatusRequestedRangeNotSatisfiable {
		w.ResponseWriter.WriteHeader(status)
		return
	}
	w.swallow = true
	w.Header().Del("Content-Length")
	writeError(w.ResponseWriter, status, apiError{
		Code:    "range_not_satisfiable",
		Message: "The requested byte range is outside this file.",
		Action:  "Update the app, then try again.",
	})
}

func (w *rangeErrorWriter) Write(b []byte) (int, error) {
	if w.swallow {
		return len(b), nil // drop ServeContent's plain-text body
	}
	return w.ResponseWriter.Write(b)
}

func (w *rangeErrorWriter) Unwrap() http.ResponseWriter { return w.ResponseWriter }
