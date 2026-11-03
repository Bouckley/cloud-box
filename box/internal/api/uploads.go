package api

import (
	"net/http"
	"strconv"
	"time"

	"github.com/Bouckley/cloud-box/box/internal/auth"
	"github.com/Bouckley/cloud-box/box/internal/blobs"
)

// partTimeout lets an 8 MiB part arrive over slow Wi-Fi; the server's 60 s
// read and write timeouts are too short for that. The write deadline must be
// extended too: it runs from the start of the request, so a slow body would
// otherwise lose the 204 although the part was stored.
const partTimeout = 10 * time.Minute

// completeTimeout covers hashing a 64 GiB blob twice on the Pi.
const completeTimeout = time.Hour

// extendDeadlines gives one request longer read and write deadlines. Not
// every ResponseWriter supports deadlines (tests), so errors are ignored.
func extendDeadlines(w http.ResponseWriter, d time.Duration) {
	rc := http.NewResponseController(w)
	_ = rc.SetReadDeadline(time.Now().Add(d))
	_ = rc.SetWriteDeadline(time.Now().Add(d))
}

type uploadResponse struct {
	ID        string    `json:"id"`
	Size      int64     `json:"size"`
	SHA256    *string   `json:"sha256"`
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
	var hash *string
	if u.SHA256 != "" {
		hash = &u.SHA256
	}
	return uploadResponse{
		ID: u.ID, Size: u.Size, SHA256: hash, PartBytes: blobs.PartBytes,
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
		Size   int64   `json:"size"`
		SHA256 *string `json:"sha256"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	if req.Size < 1 || req.Size > blobs.MaxBlobBytes {
		badRequest(w, "size must be 1 byte to 64 GiB")
		return
	}
	hash := ""
	if req.SHA256 != nil {
		if !validHex(*req.SHA256, 32) {
			badRequest(w, "sha256 must be 64 lowercase hex characters")
			return
		}
		hash = *req.SHA256
	}
	up, err := h.d.Blobs.CreateUpload(r.Context(), sess, req.Size, hash)
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
	extendDeadlines(w, partTimeout)
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
	var req struct {
		SHA256 *string `json:"sha256"`
	}
	if !readOptionalJSON(w, r, &req) {
		return
	}
	hash := ""
	if req.SHA256 != nil {
		if !validHex(*req.SHA256, 32) {
			badRequest(w, "sha256 must be 64 lowercase hex characters")
			return
		}
		hash = *req.SHA256
	}
	extendDeadlines(w, completeTimeout)
	b, created, err := h.d.Blobs.Complete(r.Context(), sess.UserID, id, hash)
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
