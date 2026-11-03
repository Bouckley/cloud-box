// Package library holds a user's collections (albums and folders) and items.
// Names, keys and metadata arrive encrypted; the box stores them as opaque
// bytes and checks only structure (ownership, nesting, sizes).
package library

import (
	"github.com/Bouckley/cloud-box/box/internal/hal"
	"github.com/Bouckley/cloud-box/box/internal/store"
)

// Service manages collections and items.
type Service struct {
	db    *store.Store
	clock hal.Clock
}

// New returns the library service.
func New(db *store.Store, clock hal.Clock) *Service {
	return &Service{db: db, clock: clock}
}
