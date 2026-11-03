package api

import (
	"net/http"
	"time"

	"github.com/Bouckley/cloud-box/box/internal/auth"
)

// itemIDHandler validates the {id} path value before calling fn.
func itemIDHandler(fn func(w http.ResponseWriter, r *http.Request, sess auth.Session, id string)) func(http.ResponseWriter, *http.Request, auth.Session) {
	return func(w http.ResponseWriter, r *http.Request, sess auth.Session) {
		id := r.PathValue("id")
		if !validID(id) {
			badRequest(w, "id must be 32 lowercase hex characters")
			return
		}
		fn(w, r, sess, id)
	}
}

func (h *handlers) trashItem(w http.ResponseWriter, r *http.Request, sess auth.Session, id string) {
	if err := h.d.Trash.Trash(r.Context(), sess.UserID, id); err != nil {
		h.serviceError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *handlers) restoreItem(w http.ResponseWriter, r *http.Request, sess auth.Session, id string) {
	if err := h.d.Trash.Restore(r.Context(), sess.UserID, id); err != nil {
		h.serviceError(w, r, err)
		return
	}
	it, err := h.d.Library.GetItem(r.Context(), sess.UserID, id)
	if err != nil {
		h.serviceError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, toItemResponse(it))
}

func (h *handlers) listTrash(w http.ResponseWriter, r *http.Request, sess auth.Session) {
	list, err := h.d.Trash.List(r.Context(), sess.UserID)
	if err != nil {
		h.serviceError(w, r, err)
		return
	}
	type entry struct {
		ItemID    string    `json:"itemId"`
		TrashedAt time.Time `json:"trashedAt"`
		DaysLeft  int       `json:"daysLeft"`
	}
	out := make([]entry, len(list))
	for i, e := range list {
		out[i] = entry{ItemID: e.ItemID, TrashedAt: e.TrashedAt, DaysLeft: e.DaysLeft}
	}
	writeJSON(w, http.StatusOK, map[string]any{"items": out})
}

func (h *handlers) deleteFromTrash(w http.ResponseWriter, r *http.Request, sess auth.Session, id string) {
	if err := h.d.Trash.Delete(r.Context(), sess.UserID, id); err != nil {
		h.serviceError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
