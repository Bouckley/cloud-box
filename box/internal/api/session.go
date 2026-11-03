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
		DeviceID  string `json:"deviceId"`
		Challenge string `json:"challenge"`
		Signature []byte `json:"signature"`
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
	token, expires, err := h.d.Auth.Verify(r.Context(), req.DeviceID, req.Challenge, req.Signature)
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
		token, ok := strings.CutPrefix(r.Header.Get("Authorization"), "Bearer ")
		if !ok || !validToken(token) {
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
