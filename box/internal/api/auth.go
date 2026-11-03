package api

import (
	"errors"
	"net/http"

	"github.com/Bouckley/cloud-box/box/internal/auth"
)

// Ciphertext sizes the box checks (ADR 0004). It never sees inside them.
const (
	wrappedKeyBytes = 72 // nonce 24 + key 32 + tag 16
	publicKeyBytes  = 32
	saltBytes       = 16
	minNameEncBytes = 41 // nonce 24 + tag 16 + at least 1 byte
	maxNameEncBytes = 4 << 10
)

// KDF limits clients accept (ADR 0002); the box refuses anything outside them.
const (
	minOpsLimit = 2
	maxOpsLimit = 10
	minMemLimit = 64 << 20
	maxMemLimit = 1 << 30
)

type setupRequest struct {
	User   auth.NewUser   `json:"user"`
	Device auth.NewDevice `json:"device"`
}

func (h *handlers) setup(w http.ResponseWriter, r *http.Request) {
	var req setupRequest
	if !readJSON(w, r, &req) {
		return
	}
	if err := validateNewUser(req.User); err != nil {
		badRequest(w, err.Error())
		return
	}
	if err := validateNewDevice(req.Device); err != nil {
		badRequest(w, err.Error())
		return
	}
	acct, err := h.d.Auth.Setup(r.Context(), req.User, req.Device)
	if err != nil {
		h.serviceError(w, r, err)
		return
	}
	writeJSON(w, http.StatusCreated, acct)
}

func validateNewUser(u auth.NewUser) error {
	if !validID(u.ID) {
		return errors.New("user.id must be 32 lowercase hex characters")
	}
	if u.KDF.OpsLimit < minOpsLimit || u.KDF.OpsLimit > maxOpsLimit {
		return errors.New("kdf.opsLimit must be 2 to 10")
	}
	if u.KDF.MemLimitBytes < minMemLimit || u.KDF.MemLimitBytes > maxMemLimit {
		return errors.New("kdf.memLimitBytes must be 64 MiB to 1 GiB")
	}
	return firstErr(
		checkLen("kdf.salt", u.KDF.Salt, saltBytes, saltBytes),
		checkLen("masterKeyByPassword", u.MasterKeyByPassword, wrappedKeyBytes, wrappedKeyBytes),
		checkLen("masterKeyByRecovery", u.MasterKeyByRecovery, wrappedKeyBytes, wrappedKeyBytes),
		checkLen("identityPublicKey", u.IdentityPublicKey, publicKeyBytes, publicKeyBytes),
		checkLen("identityKeyEnc", u.IdentityKeyEnc, wrappedKeyBytes, wrappedKeyBytes),
		checkLen("dedupeKeyEnc", u.DedupeKeyEnc, wrappedKeyBytes, wrappedKeyBytes),
	)
}

func validateNewDevice(d auth.NewDevice) error {
	if !validID(d.ID) {
		return errors.New("device.id must be 32 lowercase hex characters")
	}
	return firstErr(
		checkLen("device.nameEnc", d.NameEnc, minNameEncBytes, maxNameEncBytes),
		checkLen("device.signPublicKey", d.SignPublicKey, publicKeyBytes, publicKeyBytes),
	)
}

func firstErr(errs ...error) error {
	for _, err := range errs {
		if err != nil {
			return err
		}
	}
	return nil
}
