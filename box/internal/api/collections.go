package api

import (
	"encoding/json"
	"net/http"

	"github.com/Bouckley/cloud-box/box/internal/auth"
	"github.com/Bouckley/cloud-box/box/internal/library"
)

type collectionResponse struct {
	ID       string  `json:"id"`
	Kind     string  `json:"kind"`
	ParentID *string `json:"parentId"` // null at the root, never omitted
	NameEnc  []byte  `json:"nameEnc"`
	KeyEnc   []byte  `json:"keyEnc"`
	Seq      int64   `json:"seq"`
}

func toCollectionResponse(c library.Collection) collectionResponse {
	return collectionResponse{ID: c.ID, Kind: c.Kind, ParentID: c.ParentID, NameEnc: c.NameEnc, KeyEnc: c.KeyEnc, Seq: c.Seq}
}

func (h *handlers) listCollections(w http.ResponseWriter, r *http.Request, sess auth.Session) {
	list, err := h.d.Library.Collections(r.Context(), sess.UserID)
	if err != nil {
		h.serviceError(w, r, err)
		return
	}
	out := make([]collectionResponse, len(list))
	for i, c := range list {
		out[i] = toCollectionResponse(c)
	}
	writeJSON(w, http.StatusOK, map[string]any{"collections": out})
}

func (h *handlers) createCollection(w http.ResponseWriter, r *http.Request, sess auth.Session) {
	var req struct {
		ID       string  `json:"id"`
		Kind     string  `json:"kind"`
		ParentID *string `json:"parentId"`
		NameEnc  []byte  `json:"nameEnc"`
		KeyEnc   []byte  `json:"keyEnc"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	switch {
	case !validID(req.ID):
		badRequest(w, "id must be 32 lowercase hex characters")
		return
	case req.Kind != "album" && req.Kind != "folder":
		badRequest(w, "kind must be album or folder")
		return
	case req.ParentID != nil && !validID(*req.ParentID):
		badRequest(w, "parentId must be null or 32 lowercase hex characters")
		return
	}
	for _, err := range []error{
		checkLen("nameEnc", req.NameEnc, minNameEncBytes, maxNameEncBytes),
		checkLen("keyEnc", req.KeyEnc, wrappedKeyBytes, wrappedKeyBytes),
	} {
		if err != nil {
			badRequest(w, err.Error())
			return
		}
	}
	c, err := h.d.Library.CreateCollection(r.Context(), sess.UserID, library.Collection{
		ID: req.ID, Kind: req.Kind, ParentID: req.ParentID, NameEnc: req.NameEnc, KeyEnc: req.KeyEnc,
	})
	if err != nil {
		h.serviceError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, toCollectionResponse(c))
}

func (h *handlers) updateCollection(w http.ResponseWriter, r *http.Request, sess auth.Session) {
	id := r.PathValue("id")
	if !validID(id) {
		badRequest(w, "id must be 32 lowercase hex characters")
		return
	}
	// parentId distinguishes "absent" (keep the parent) from null (move to
	// the root), so it is decoded in two steps.
	var req struct {
		NameEnc  []byte          `json:"nameEnc"`
		ParentID json.RawMessage `json:"parentId"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	if req.NameEnc == nil && req.ParentID == nil {
		badRequest(w, "send nameEnc, parentId or both")
		return
	}
	if req.NameEnc != nil {
		if err := checkLen("nameEnc", req.NameEnc, minNameEncBytes, maxNameEncBytes); err != nil {
			badRequest(w, err.Error())
			return
		}
	}
	var move **string
	if req.ParentID != nil {
		var parent *string
		if err := json.Unmarshal(req.ParentID, &parent); err != nil || (parent != nil && !validID(*parent)) {
			badRequest(w, "parentId must be null or 32 lowercase hex characters")
			return
		}
		move = &parent
	}
	c, err := h.d.Library.UpdateCollection(r.Context(), sess.UserID, id, req.NameEnc, move)
	if err != nil {
		h.serviceError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toCollectionResponse(c))
}
