package auth

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"path/filepath"
	"testing"

	"github.com/Bouckley/cloud-box/box/internal/hal/sim"
	"github.com/Bouckley/cloud-box/box/internal/store"
)

func newService(t *testing.T) (*Service, *store.Store, *sim.Sim) {
	t.Helper()
	dir := filepath.Join(t.TempDir(), "with space")
	db, err := store.Open(context.Background(), filepath.Join(dir, "db", "box.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	s := sim.New(dir)
	return New(db, s.HAL().Clock), db, s
}

func randBytes(n int) []byte {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return b
}

func newID() string { return hex.EncodeToString(randBytes(16)) }

// testUser and testDevice are valid setup inputs with random ciphertext.
func testUser() NewUser {
	return NewUser{
		ID:                  newID(),
		KDF:                 KDF{Salt: randBytes(16), OpsLimit: 3, MemLimitBytes: 268435456},
		MasterKeyByPassword: randBytes(72),
		MasterKeyByRecovery: randBytes(72),
		IdentityPublicKey:   randBytes(32),
		IdentityKeyEnc:      randBytes(72),
		DedupeKeyEnc:        randBytes(72),
	}
}

func testDevice(signPublicKey []byte) NewDevice {
	return NewDevice{ID: newID(), NameEnc: randBytes(60), SignPublicKey: signPublicKey}
}
