package blobs

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"path/filepath"
	"testing"

	"github.com/Bouckley/cloud-box/box/internal/auth"
	"github.com/Bouckley/cloud-box/box/internal/hal/sim"
	"github.com/Bouckley/cloud-box/box/internal/store"
)

type fixture struct {
	svc  *Service
	db   *store.Store
	sim  *sim.Sim
	dir  string
	sess auth.Session
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	dir := filepath.Join(t.TempDir(), "with space")
	db, err := store.Open(context.Background(), filepath.Join(dir, "db", "box.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	s := sim.New(dir)
	f := &fixture{svc: New(db, s.HAL()), db: db, sim: s, dir: dir}
	f.sess = f.addUser(t)
	return f
}

// addUser inserts a user with one device directly (setup is auth's job).
func (f *fixture) addUser(t *testing.T) auth.Session {
	t.Helper()
	sess := auth.Session{UserID: newID(), DeviceID: newID()}
	if _, err := f.db.DB().Exec(`INSERT INTO users (id, role, kdf_salt, kdf_ops, kdf_mem, master_key_password,
		master_key_recovery, identity_public_key, identity_key_enc, dedupe_key_enc, created_at)
		VALUES (?, 'owner', x'00', 2, 1, x'00', x'00', x'00', x'00', x'00', 0)`, sess.UserID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.DB().Exec(`INSERT INTO devices (id, user_id, name_enc, sign_public_key, created_at, last_seen)
		VALUES (?, ?, x'00', x'00', 0, 0)`, sess.DeviceID, sess.UserID); err != nil {
		t.Fatal(err)
	}
	return sess
}

func randBytes(n int) []byte {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return b
}

func newID() string { return hex.EncodeToString(randBytes(16)) }

func sha(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

// part returns part n of data (PartBytes each, last one shorter).
func part(data []byte, n int) []byte {
	start := n * PartBytes
	end := min(start+PartBytes, len(data))
	return data[start:end]
}
