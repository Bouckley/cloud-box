package api

import (
	"net/http"
	"regexp"
	"strconv"
	"time"

	"github.com/Bouckley/cloud-box/box/internal/auth"
	"github.com/Bouckley/cloud-box/box/internal/library"
)

const (
	maxMetadataEncBytes = 64 << 10
	defaultChangesLimit = 500
	maxChangesLimit     = 1000
)

var cursorPattern = regexp.MustCompile(`^[0-9]{1,18}$`)

type itemBlobResponse struct {
	Role   string `json:"role"`
	BlobID string `json:"blobId"`
	Size   int64  `json:"size"`
}

type itemResponse struct {
	ID           string             `json:"id"`
	CollectionID string             `json:"collectionId"`
	DeviceID     string             `json:"deviceId"`
	FileKeyEnc   []byte             `json:"fileKeyEnc"`
	MetadataEnc  []byte             `json:"metadataEnc"`
	DedupeHash   string             `json:"dedupeHash"`
	Blobs        []itemBlobResponse `json:"blobs"`
	State        string             `json:"state"`
	CreatedAt    time.Time          `json:"createdAt"`
	TrashedAt    *time.Time         `json:"trashedAt"` // null unless in Trash, never omitted
	Seq          int64              `json:"seq"`
}

func toItemResponse(it library.Item) itemResponse {
	blobs := make([]itemBlobResponse, len(it.Blobs))
	for i, b := range it.Blobs {
		blobs[i] = itemBlobResponse{Role: b.Role, BlobID: b.BlobID, Size: b.Size}
	}
	return itemResponse{
		ID: it.ID, CollectionID: it.CollectionID, DeviceID: it.DeviceID, FileKeyEnc: it.FileKeyEnc,
		MetadataEnc: it.MetadataEnc, DedupeHash: it.DedupeHash, Blobs: blobs, State: it.State,
		CreatedAt: it.CreatedAt, TrashedAt: it.TrashedAt, Seq: it.Seq,
	}
}

func (h *handlers) listItemChanges(w http.ResponseWriter, r *http.Request, sess auth.Session) {
	q := r.URL.Query()
	since := int64(0)
	if s := q.Get("since"); q.Has("since") {
		if !cursorPattern.MatchString(s) {
			badRequest(w, "since must be a cursor returned by the box")
			return
		}
		since, _ = strconv.ParseInt(s, 10, 64)
	}
	limit := defaultChangesLimit
	if s := q.Get("limit"); q.Has("limit") {
		n, err := strconv.Atoi(s)
		if err != nil || n < 1 || n > maxChangesLimit {
			badRequest(w, "limit must be 1 to 1000")
			return
		}
		limit = n
	}
	ch, err := h.d.Library.Changes(r.Context(), sess.UserID, since, limit)
	if err != nil {
		h.serviceError(w, r, err)
		return
	}
	items := make([]itemResponse, len(ch.Items))
	for i, it := range ch.Items {
		items[i] = toItemResponse(it)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"items": items, "purged": ch.Purged, "cursor": strconv.FormatInt(ch.Cursor, 10), "more": ch.More,
	})
}

func (h *handlers) createItem(w http.ResponseWriter, r *http.Request, sess auth.Session) {
	var req struct {
		ID           string `json:"id"`
		CollectionID string `json:"collectionId"`
		FileKeyEnc   []byte `json:"fileKeyEnc"`
		MetadataEnc  []byte `json:"metadataEnc"`
		DedupeHash   string `json:"dedupeHash"`
		Blobs        struct {
			Original string  `json:"original"`
			Preview  *string `json:"preview"`
			Thumb    *string `json:"thumb"`
		} `json:"blobs"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	blobs := []library.ItemBlob{{Role: "original", BlobID: req.Blobs.Original}}
	if req.Blobs.Preview != nil {
		blobs = append(blobs, library.ItemBlob{Role: "preview", BlobID: *req.Blobs.Preview})
	}
	if req.Blobs.Thumb != nil {
		blobs = append(blobs, library.ItemBlob{Role: "thumb", BlobID: *req.Blobs.Thumb})
	}
	switch {
	case !validID(req.ID) || !validID(req.CollectionID):
		badRequest(w, "id and collectionId must be 32 lowercase hex characters")
		return
	case !validHex(req.DedupeHash, 32):
		badRequest(w, "dedupeHash must be 64 lowercase hex characters")
		return
	}
	for _, b := range blobs {
		if !validID(b.BlobID) {
			badRequest(w, "blobs must include an original, and every blob id must be 32 lowercase hex characters")
			return
		}
	}
	if !checkItemKeys(w, req.FileKeyEnc, req.MetadataEnc, true) {
		return
	}
	it, err := h.d.Library.CreateItem(r.Context(), sess, library.Item{
		ID: req.ID, CollectionID: req.CollectionID, FileKeyEnc: req.FileKeyEnc,
		MetadataEnc: req.MetadataEnc, DedupeHash: req.DedupeHash, Blobs: blobs,
	})
	if err != nil {
		h.serviceError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, toItemResponse(it))
}

// checkItemKeys checks ciphertext sizes; when required is false, nil fields
// (not sent) are allowed.
func checkItemKeys(w http.ResponseWriter, fileKeyEnc, metadataEnc []byte, required bool) bool {
	if required || fileKeyEnc != nil {
		if err := checkLen("fileKeyEnc", fileKeyEnc, wrappedKeyBytes, wrappedKeyBytes); err != nil {
			badRequest(w, err.Error())
			return false
		}
	}
	if required || metadataEnc != nil {
		if err := checkLen("metadataEnc", metadataEnc, minNameEncBytes, maxMetadataEncBytes); err != nil {
			badRequest(w, err.Error())
			return false
		}
	}
	return true
}

func (h *handlers) updateItem(w http.ResponseWriter, r *http.Request, sess auth.Session) {
	id := r.PathValue("id")
	if !validID(id) {
		badRequest(w, "id must be 32 lowercase hex characters")
		return
	}
	var req struct {
		CollectionID *string `json:"collectionId"`
		FileKeyEnc   []byte  `json:"fileKeyEnc"`
		MetadataEnc  []byte  `json:"metadataEnc"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	if req.CollectionID == nil && req.FileKeyEnc == nil && req.MetadataEnc == nil {
		badRequest(w, "send collectionId, fileKeyEnc, metadataEnc or a combination")
		return
	}
	if req.CollectionID != nil && !validID(*req.CollectionID) {
		badRequest(w, "collectionId must be 32 lowercase hex characters")
		return
	}
	if !checkItemKeys(w, req.FileKeyEnc, req.MetadataEnc, false) {
		return
	}
	it, err := h.d.Library.UpdateItem(r.Context(), sess.UserID, id, library.ItemPatch{
		CollectionID: req.CollectionID, FileKeyEnc: req.FileKeyEnc, MetadataEnc: req.MetadataEnc,
	})
	if err != nil {
		h.serviceError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toItemResponse(it))
}

func (h *handlers) lookupItems(w http.ResponseWriter, r *http.Request, sess auth.Session) {
	var req struct {
		DedupeHashes []string `json:"dedupeHashes"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	if req.DedupeHashes == nil {
		badRequest(w, "dedupeHashes is required")
		return
	}
	if len(req.DedupeHashes) > library.MaxLookup {
		badRequest(w, "send at most 1000 dedupeHashes")
		return
	}
	for _, h := range req.DedupeHashes {
		if !validHex(h, 32) {
			badRequest(w, "each dedupeHash must be 64 lowercase hex characters")
			return
		}
	}
	found, err := h.d.Library.Lookup(r.Context(), sess.UserID, req.DedupeHashes)
	if err != nil {
		h.serviceError(w, r, err)
		return
	}
	type result struct {
		DedupeHash string `json:"dedupeHash"`
		ItemID     string `json:"itemId"`
		State      string `json:"state"`
		Trashed    bool   `json:"trashed"`
	}
	out := make([]result, len(found))
	for i, f := range found {
		out[i] = result{DedupeHash: f.DedupeHash, ItemID: f.ItemID, State: f.State, Trashed: f.Trashed}
	}
	writeJSON(w, http.StatusOK, map[string]any{"found": out})
}
