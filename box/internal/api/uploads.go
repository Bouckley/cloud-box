package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/Bouckley/cloud-box/box/internal/auth"
	"github.com/Bouckley/cloud-box/box/internal/blobs"
)

// partReadTimeout lets an 8 MiB part arrive over slow Wi-Fi; the server's
// default 60 s read timeout is too short for that.
const partReadTimeout = 10 * time.Minute

type uploadResponse struct {
	ID        string    `json:"id"`
	Size      int64     `json:"size"`
	SHA256    string    `json:"sha256"`
	PartBytes int       `json:"partBytes"`
	PartCount int       `json:"partCount"`
	Received  []int     `json:"received"`
	ExpiresAt time.Time `json:"expiresAt"`
}

func toUploadResponse(u blobs.Upload) uploadResponse {
	received := u.Received
	if received == nil {
		received = []int{}
	}
	return uploadResponse{
		ID: u.ID, Size: u.Size, SHA256: u.SHA256, PartBytes: blobs.PartBytes,
		PartCount: u.PartCount, Received: received, ExpiresAt: u.ExpiresAt.UTC(),
	}
}

type blobResponse struct {
	ID     string `json:"id"`
	Size   int64  `json:"size"`
	SHA256 string `json:"sha256"`
	State  string `json:"state"`
}

func (h *handlers) createUpload(w http.ResponseWriter, r *http.Request, sess auth.Session) {
	var req struct {
		Size   int64  `json:"size"`
		SHA256 string `json:"sha256"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	if req.Size < 1 || req.Size > blobs.MaxBlobBytes {
		badRequest(w, "size must be 1 byte to 64 GiB")
		return
	}
	if !validHex(req.SHA256, 32) {
		badRequest(w, "sha256 must be 64 lowercase hex characters")
		return
	}
	up, err := h.d.Blobs.CreateUpload(r.Context(), sess, req.Size, req.SHA256)
	if err != nil {
		h.serviceError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, toUploadResponse(up))
}

func (h *handlers) getUpload(w http.ResponseWriter, r *http.Request, sess auth.Session) {
	id := r.PathValue("id")
	if !validID(id) {
		badRequest(w, "id must be 32 lowercase hex characters")
		return
	}
	up, err := h.d.Blobs.GetUpload(r.Context(), sess.UserID, id)
	if err != nil {
		h.serviceError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toUploadResponse(up))
}

func (h *handlers) putUploadPart(w http.ResponseWriter, r *http.Request, sess auth.Session) {
	id := r.PathValue("id")
	n, err := strconv.Atoi(r.PathValue("n"))
	if !validID(id) || err != nil || n < 0 {
		badRequest(w, "upload id or part number has the wrong format")
		return
	}
	// Not every ResponseWriter supports deadlines (tests); ignore that error.
	_ = http.NewResponseController(w).SetReadDeadline(time.Now().Add(partReadTimeout))
	body := http.MaxBytesReader(w, r.Body, blobs.PartBytes)
	if err := h.d.Blobs.PutPart(r.Context(), sess.UserID, id, n, body); err != nil {
		h.serviceError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *handlers) completeUpload(w http.ResponseWriter, r *http.Request, sess auth.Session) {
	id := r.PathValue("id")
	if !validID(id) {
		badRequest(w, "id must be 32 lowercase hex characters")
		return
	}
	b, created, err := h.d.Blobs.Complete(r.Context(), sess.UserID, id)
	if err != nil {
		h.serviceError(w, r, err)
		return
	}
	status := http.StatusOK
	if created {
		status = http.StatusCreated
	}
	writeJSON(w, status, blobResponse{ID: b.ID, Size: b.Size, SHA256: b.SHA256, State: b.State()})
}
