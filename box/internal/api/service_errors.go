package api

import (
	"errors"
	"net/http"
	"strings"

	"github.com/Bouckley/cloud-box/box/internal/auth"
	"github.com/Bouckley/cloud-box/box/internal/blobs"
	"github.com/Bouckley/cloud-box/box/internal/library"
	"github.com/Bouckley/cloud-box/box/internal/store"
	"github.com/Bouckley/cloud-box/box/internal/trash"
)

// serviceError maps a service error to the JSON error shape. Unknown errors
// are logged (without request data) and become 500 internal_error.
func (h *handlers) serviceError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, auth.ErrUnauthorized):
		unauthorized(w)
	case errors.Is(err, auth.ErrInvalid):
		badRequest(w, strings.TrimPrefix(err.Error(), auth.ErrInvalid.Error()+": "))
	case errors.Is(err, store.ErrNotFound):
		notFound(w, r)
	case errors.Is(err, store.ErrIDTaken):
		writeError(w, http.StatusConflict, apiError{
			Code:    "id_taken",
			Message: "That id is already in use on the box.",
			Action:  "Try again; the app will pick a new id.",
		})
	case errors.Is(err, blobs.ErrStorageFull):
		writeError(w, http.StatusInsufficientStorage, apiError{
			Code:    "storage_full",
			Message: "The box is full. Nothing already on it was lost.",
			Action:  "Delete things you no longer need and empty Trash, or add a bigger drive, then try again.",
		})
	case errors.Is(err, blobs.ErrBadRequest):
		badRequest(w, strings.TrimPrefix(err.Error(), blobs.ErrBadRequest.Error()+": "))
	case errors.Is(err, blobs.ErrBadPart):
		badRequest(w, "This part has the wrong number or size.")
	case errors.Is(err, blobs.ErrUploadIncomplete):
		writeError(w, http.StatusConflict, apiError{
			Code:    "upload_incomplete",
			Message: "Some parts of this upload have not arrived yet.",
			Action:  "The app will send the missing parts and try again.",
		})
	case errors.Is(err, blobs.ErrHashMismatch):
		writeError(w, http.StatusUnprocessableEntity, apiError{
			Code:    "hash_mismatch",
			Message: "The uploaded file was damaged on the way.",
			Action:  "The app will upload it again.",
		})
	case errors.Is(err, library.ErrCollectionNotEmpty):
		writeError(w, http.StatusConflict, apiError{
			Code:    "collection_not_empty",
			Message: "This album or folder still has things in it.",
			Action:  "Move or delete what is inside it first, then try again.",
		})
	case errors.Is(err, library.ErrInvalidParent):
		writeError(w, http.StatusConflict, apiError{
			Code:    "invalid_parent",
			Message: "A collection cannot go there: albums stay at the top, and a folder cannot go inside itself.",
			Action:  "Choose another folder, then try again.",
		})
	case errors.Is(err, library.ErrAlreadyStored):
		writeError(w, http.StatusConflict, apiError{
			Code:    "already_stored",
			Message: "This file is already on the box.",
			Action:  "Nothing to do; the app will show the copy that is already stored.",
		})
	case errors.Is(err, library.ErrBlobInUse):
		writeError(w, http.StatusConflict, apiError{
			Code:    "blob_in_use",
			Message: "This upload already belongs to another item.",
			Action:  "Upload the file again.",
		})
	case errors.Is(err, library.ErrRewrapRequired):
		writeError(w, http.StatusConflict, apiError{
			Code:    "rewrap_required",
			Message: "Moving this item needs its key for the new album or folder.",
			Action:  "Update the app, then try again.",
		})
	case errors.Is(err, library.ErrBadBlob):
		badRequest(w, "blobs must include an original, and each blob must be one of your completed uploads, used once.")
	case errors.Is(err, library.ErrTooManyHashes):
		badRequest(w, "send at most 1000 dedupeHashes")
	case errors.Is(err, trash.ErrNotInTrash):
		writeError(w, http.StatusConflict, apiError{
			Code:    "not_in_trash",
			Message: "Only items in Trash can be deleted for good.",
			Action:  "Move it to Trash first.",
		})
	case errors.Is(err, auth.ErrLastDevice):
		writeError(w, http.StatusConflict, apiError{
			Code:    "last_device",
			Message: "This is the last device that can sign in to the box.",
			Action:  "Pair another device first, then remove this one.",
		})
	case errors.Is(err, auth.ErrPressButton):
		writeError(w, http.StatusConflict, apiError{
			Code:    "press_button",
			Message: "Setup is not open yet.",
			Action:  "Press the button on the front of your box once, then try again.",
		})
	case errors.Is(err, auth.ErrAlreadySetUp):
		writeError(w, http.StatusConflict, apiError{
			Code:    "already_set_up",
			Message: "This box is already set up.",
			Action:  "Sign in with a device that is already paired, or ask the owner to pair this one.",
		})
	default:
		h.log.Error("request failed", "route", r.Pattern, "err", err)
		writeError(w, http.StatusInternalServerError, apiError{
			Code:    "internal_error",
			Message: "Something went wrong on the box.",
			Action:  "Try again. If it keeps happening, restart the box.",
		})
	}
}
