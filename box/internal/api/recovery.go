package api

import (
	"net/http"

	"github.com/Bouckley/cloud-box/box/internal/auth"
)

// recoveryChallenge and recoveryReset are public: they serve a browser or
// phone that has no device on the box left (ADR 0005).
func (h *handlers) recoveryChallenge(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RecoveryPublicKey []byte `json:"recoveryPublicKey"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	if err := checkLen("recoveryPublicKey", req.RecoveryPublicKey, publicKeyBytes, publicKeyBytes); err != nil {
		badRequest(w, err.Error())
		return
	}
	ch, expires, err := h.d.Auth.RecoveryChallenge(r.Context(), req.RecoveryPublicKey)
	if err != nil {
		h.serviceError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, challengeResponse{Challenge: ch, ExpiresAt: expires.UTC()})
}

func (h *handlers) recoveryReset(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RecoveryPublicKey []byte         `json:"recoveryPublicKey"`
		Challenge         string         `json:"challenge"`
		Signature         []byte         `json:"signature"`
		Device            auth.NewDevice `json:"device"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	if !validHex(req.Challenge, 32) {
		badRequest(w, "challenge must be 64 lowercase hex characters")
		return
	}
	if err := firstErr(
		checkLen("recoveryPublicKey", req.RecoveryPublicKey, publicKeyBytes, publicKeyBytes),
		checkLen("signature", req.Signature, signatureBytes, signatureBytes),
		validatePairDevice(req.Device),
	); err != nil {
		badRequest(w, err.Error())
		return
	}
	if err := h.d.Auth.RecoveryReset(r.Context(), req.RecoveryPublicKey, req.Challenge, req.Signature, req.Device); err != nil {
		h.serviceError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *handlers) changePassword(w http.ResponseWriter, r *http.Request, sess auth.Session) {
	var req struct {
		KDF                 auth.KDF `json:"kdf"`
		MasterKeyByPassword []byte   `json:"masterKeyByPassword"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	if err := h.d.Auth.ChangePassword(r.Context(), sess.UserID, req.KDF, req.MasterKeyByPassword); err != nil {
		h.serviceError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
