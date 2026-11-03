package auth

import (
	"bytes"
	"context"
	"crypto/rand"
	"database/sql"
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

// assertNotInDB fails if secret appears in any TEXT or BLOB cell of any table.
func assertNotInDB(t *testing.T, db *sql.DB, secret []byte) {
	t.Helper()
	tables, err := db.Query("SELECT name FROM sqlite_master WHERE type = 'table'")
	if err != nil {
		t.Fatal(err)
	}
	var names []string
	for tables.Next() {
		var n string
		_ = tables.Scan(&n)
		names = append(names, n)
	}
	tables.Close()
	for _, table := range names {
		rows, err := db.Query("SELECT * FROM " + table)
		if err != nil {
			t.Fatal(err)
		}
		cols, _ := rows.Columns()
		for rows.Next() {
			vals := make([]any, len(cols))
			ptrs := make([]any, len(cols))
			for i := range vals {
				ptrs[i] = &vals[i]
			}
			if err := rows.Scan(ptrs...); err != nil {
				t.Fatal(err)
			}
			for i, v := range vals {
				var b []byte
				switch x := v.(type) {
				case []byte:
					b = x
				case string:
					b = []byte(x)
				}
				if bytes.Contains(b, secret) {
					t.Errorf("secret found in %s.%s", table, cols[i])
				}
			}
		}
		rows.Close()
	}
}
