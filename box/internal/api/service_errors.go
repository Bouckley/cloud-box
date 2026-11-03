package api

import (
	"errors"
	"net/http"

	"github.com/Bouckley/cloud-box/box/internal/auth"
	"github.com/Bouckley/cloud-box/box/internal/store"
)

// serviceError maps a service error to the JSON error shape. Unknown errors
// are logged (without request data) and become 500 internal_error.
func (h *handlers) serviceError(w http.ResponseWriter, r *http.Request, err error) {
	switch {
	case errors.Is(err, auth.ErrUnauthorized):
		unauthorized(w)
	case errors.Is(err, store.ErrNotFound):
		notFound(w, r)
	case errors.Is(err, store.ErrIDTaken):
		writeError(w, http.StatusConflict, apiError{
			Code:    "id_taken",
			Message: "That id is already in use on the box.",
			Action:  "Try again; the app will pick a new id.",
		})
	case errors.Is(err, auth.ErrLastDevice):
		writeError(w, http.StatusConflict, apiError{
			Code:    "last_device",
			Message: "This is the last device that can sign in to the box.",
			Action:  "Pair another device first, then remove this one.",
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
