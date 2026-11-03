package api

import (
	"net/http"
	"time"

	"github.com/Bouckley/cloud-box/box/internal/auth"
)

type pairingCodeResponse struct {
	Code      string    `json:"code"`
	ExpiresAt time.Time `json:"expiresAt"`
}

func (h *handlers) createPairingCode(w http.ResponseWriter, r *http.Request, sess auth.Session) {
	code, expires, err := h.d.Auth.CreatePairingCode(r.Context(), sess)
	if err != nil {
		h.serviceError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, pairingCodeResponse{Code: code, ExpiresAt: expires.UTC()})
}

func (h *handlers) pairDevice(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Code   string         `json:"code"`
		Device auth.NewDevice `json:"device"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	if !validToken(req.Code) {
		badRequest(w, "code has the wrong format")
		return
	}
	if err := validatePairDevice(req.Device); err != nil {
		badRequest(w, err.Error())
		return
	}
	userID, err := h.d.Auth.Pair(r.Context(), req.Code, req.Device)
	if err != nil {
		h.serviceError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, map[string]string{"userId": userID, "deviceId": req.Device.ID})
}

func (h *handlers) listDevices(w http.ResponseWriter, r *http.Request, sess auth.Session) {
	devices, err := h.d.Auth.Devices(r.Context(), sess.UserID)
	if err != nil {
		h.serviceError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"devices": devices})
}

func (h *handlers) revokeDevice(w http.ResponseWriter, r *http.Request, sess auth.Session) {
	id := r.PathValue("id")
	if !validID(id) {
		badRequest(w, "id must be 32 lowercase hex characters")
		return
	}
	if err := h.d.Auth.Revoke(r.Context(), sess.UserID, id); err != nil {
		h.serviceError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *handlers) renameDevice(w http.ResponseWriter, r *http.Request, sess auth.Session) {
	id := r.PathValue("id")
	if !validID(id) {
		badRequest(w, "id must be 32 lowercase hex characters")
		return
	}
	var req struct {
		NameEnc []byte `json:"nameEnc"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	if err := checkLen("nameEnc", req.NameEnc, minNameEncBytes, maxNameEncBytes); err != nil {
		badRequest(w, err.Error())
		return
	}
	d, err := h.d.Auth.RenameDevice(r.Context(), sess.UserID, id, req.NameEnc)
	if err != nil {
		h.serviceError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, d)
}
