// Package auth handles first-run setup, device login, sessions, pairing and
// revocation. It stores only wrapped keys, public keys and token hashes.
package auth

import (
	"github.com/Bouckley/cloud-box/box/internal/hal"
	"github.com/Bouckley/cloud-box/box/internal/store"
)

// Roles (doc 04). M1 creates only owners.
const (
	RoleOwner = "owner"
)

// Service is the auth service.
type Service struct {
	db    *store.Store
	clock hal.Clock
}

// New returns the auth service.
func New(db *store.Store, clock hal.Clock) *Service {
	return &Service{db: db, clock: clock}
}
