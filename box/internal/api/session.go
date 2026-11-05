package api

import (
	"net/http"
	"strings"
	"time"

	"github.com/Bouckley/cloud-box/box/internal/auth"
)

const signatureBytes = 64

type challengeResponse struct {
	Challenge string    `json:"challenge"`
	ExpiresAt time.Time `json:"expiresAt"`
}

type sessionResponse struct {
	Token     string    `json:"token"`
	ExpiresAt time.Time `json:"expiresAt"`
}

func (h *handlers) createChallenge(w http.ResponseWriter, r *http.Request) {
	var req struct {
		DeviceID string `json:"deviceId"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	if !validID(req.DeviceID) {
		badRequest(w, "deviceId must be 32 lowercase hex characters")
		return
	}
	ch, expires, err := h.d.Auth.Challenge(r.Context(), req.DeviceID)
	if err != nil {
		h.serviceError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, challengeResponse{Challenge: ch, ExpiresAt: expires.UTC()})
}

func (h *handlers) verifyChallenge(w http.ResponseWriter, r *http.Request) {
	var req struct {
		DeviceID       string `json:"deviceId"`
		Challenge      string `json:"challenge"`
		Signature      []byte `json:"signature"`
		OwnerSignature []byte `json:"ownerSignature"`
	}
	if !readJSON(w, r, &req) {
		return
	}
	if !validID(req.DeviceID) || !validHex(req.Challenge, 32) {
		badRequest(w, "deviceId or challenge has the wrong format")
		return
	}
	if err := checkLen("signature", req.Signature, signatureBytes, signatureBytes); err != nil {
		badRequest(w, err.Error())
		return
	}
	if req.OwnerSignature != nil {
		if err := checkLen("ownerSignature", req.OwnerSignature, signatureBytes, signatureBytes); err != nil {
			badRequest(w, err.Error())
			return
		}
	}
	token, expires, err := h.d.Auth.Verify(r.Context(), req.DeviceID, req.Challenge, req.Signature, req.OwnerSignature)
	if err != nil {
		h.serviceError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, sessionResponse{Token: token, ExpiresAt: expires.UTC()})
}

func (h *handlers) getAccount(w http.ResponseWriter, r *http.Request, sess auth.Session) {
	acct, err := h.d.Auth.Account(r.Context(), sess.UserID)
	if err != nil {
		h.serviceError(w, r, err)
		return
	}
	writeJSON(w, http.StatusOK, acct)
}

// requireSession runs next only with a valid `Authorization: Bearer <token>`.
func (h *handlers) requireSession(next func(http.ResponseWriter, *http.Request, auth.Session)) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		scheme, token, ok := strings.Cut(r.Header.Get("Authorization"), " ")
		if !ok || !strings.EqualFold(scheme, "Bearer") || !validToken(token) {
			unauthorized(w)
			return
		}
		sess, err := h.d.Auth.Authenticate(r.Context(), token)
		if err != nil {
			h.serviceError(w, r, err)
			return
		}
		next(w, r, sess)
	}
}

// requireOwner is requireSession for actions that need the master key
// (ADR 0010): an ordinary session, from the device key alone, gets 403.
func (h *handlers) requireOwner(next func(http.ResponseWriter, *http.Request, auth.Session)) http.HandlerFunc {
	return h.requireSession(func(w http.ResponseWriter, r *http.Request, sess auth.Session) {
		if !sess.Owner {
			writeError(w, http.StatusForbidden, apiError{
				Code:    "owner_required",
				Message: "Unlock with your password to do this.",
				Action:  "Unlock Cloud Box on this device, then try again.",
			})
			return
		}
		next(w, r, sess)
	})
}

// endSession ends this session at once (Lock).
func (h *handlers) endSession(w http.ResponseWriter, r *http.Request, sess auth.Session) {
	if err := h.d.Auth.EndSession(r.Context(), sess); err != nil {
		h.serviceError(w, r, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

// validToken checks the token format: 43 base64url characters (32 bytes).
func validToken(s string) bool {
	if len(s) != 43 {
		return false
	}
	for i := 0; i < len(s); i++ {
		c := s[i]
		if !(c >= 'A' && c <= 'Z' || c >= 'a' && c <= 'z' || c >= '0' && c <= '9' || c == '-' || c == '_') {
			return false
		}
	}
	return true
}

func unauthorized(w http.ResponseWriter) {
	w.Header().Set("WWW-Authenticate", "Bearer")
	writeError(w, http.StatusUnauthorized, apiError{
		Code:    "unauthorized",
		Message: "This device is not signed in, or its session has ended.",
		Action:  "Sign in again. If that fails, this device may have been removed: pair it again.",
	})
}
