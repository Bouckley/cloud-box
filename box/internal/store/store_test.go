package store

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func open(t *testing.T) (*Store, string) {
	t.Helper()
	path := filepath.Join(t.TempDir(), "with space", "db", "box.sqlite")
	s, err := Open(context.Background(), path)
	if err != nil {
		t.Fatalf("Open: %v", err)
	}
	t.Cleanup(func() { _ = s.Close() })
	return s, path
}

func TestOpenCreatesAndMigrates(t *testing.T) {
	s, path := open(t)
	if _, err := os.Stat(path); err != nil {
		t.Fatalf("db file: %v", err)
	}
	fi, err := os.Stat(filepath.Dir(path))
	if err != nil {
		t.Fatal(err)
	}
	if fi.Mode().Perm() != 0o700 {
		t.Errorf("db dir mode = %v, want 0700", fi.Mode().Perm())
	}

	ctx := context.Background()
	var mode string
	if err := s.DB().QueryRowContext(ctx, "PRAGMA journal_mode").Scan(&mode); err != nil || mode != "wal" {
		t.Errorf("journal_mode = %q (%v), want wal", mode, err)
	}
	var fk int
	if err := s.DB().QueryRowContext(ctx, "PRAGMA foreign_keys").Scan(&fk); err != nil || fk != 1 {
		t.Errorf("foreign_keys = %d (%v), want 1", fk, err)
	}

	for _, table := range []string{
		"counters", "users", "devices", "sessions", "pairing_codes", "collections",
		"collection_keys", "blobs", "uploads", "upload_parts", "items", "item_blobs",
		"replicas", "tombstones", "schema_migrations",
	} {
		var n int
		err := s.DB().QueryRowContext(ctx,
			"SELECT count(*) FROM sqlite_master WHERE type = 'table' AND name = ?", table).Scan(&n)
		if err != nil || n != 1 {
			t.Errorf("table %s missing (%v)", table, err)
		}
	}
	if n := migrationCount(t, s); n != 1 {
		t.Errorf("schema_migrations rows = %d, want 1", n)
	}
}

func migrationCount(t *testing.T, s *Store) int {
	t.Helper()
	var n int
	if err := s.DB().QueryRow("SELECT count(*) FROM schema_migrations WHERE version = 1").Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func TestOpenTwiceIsIdempotent(t *testing.T) {
	s, path := open(t)
	if err := s.Close(); err != nil {
		t.Fatal(err)
	}
	s2, err := Open(context.Background(), path)
	if err != nil {
		t.Fatalf("reopen: %v", err)
	}
	defer s2.Close()
	if n := migrationCount(t, s2); n != 1 {
		t.Errorf("schema_migrations rows = %d, want 1", n)
	}
}

func TestEditedMigrationIsRefused(t *testing.T) {
	s, path := open(t)
	if _, err := s.DB().Exec("UPDATE schema_migrations SET sha256 = 'x' WHERE version = 1"); err != nil {
		t.Fatal(err)
	}
	if err := s.Close(); err != nil {
		t.Fatal(err)
	}
	s2, err := Open(context.Background(), path)
	if err == nil {
		s2.Close()
		t.Fatal("Open succeeded with an edited migration")
	}
	if want := "migration 0001 was edited"; !strings.Contains(err.Error(), want) {
		t.Errorf("error = %q, want it to contain %q", err, want)
	}
}

func TestNextSeqIncrements(t *testing.T) {
	s, _ := open(t)
	ctx := context.Background()
	next := func() int64 {
		var v int64
		if err := s.Tx(ctx, func(tx *sql.Tx) (err error) { v, err = NextSeq(ctx, tx); return }); err != nil {
			t.Fatal(err)
		}
		return v
	}
	if a := next(); a != 1 {
		t.Fatalf("first seq = %d, want 1", a)
	}
	rollback := errors.New("rollback")
	err := s.Tx(ctx, func(tx *sql.Tx) error {
		if _, err := NextSeq(ctx, tx); err != nil {
			return err
		}
		return rollback
	})
	if !errors.Is(err, rollback) {
		t.Fatalf("Tx error = %v, want rollback", err)
	}
	if b := next(); b != 2 {
		t.Fatalf("seq after rollback = %d, want 2", b)
	}
}

func TestIsUniqueViolation(t *testing.T) {
	s, _ := open(t)
	insert := func() error {
		_, err := s.DB().Exec(`INSERT INTO users (id, role, kdf_salt, kdf_ops, kdf_mem,
			master_key_password, master_key_recovery, identity_public_key, identity_key_enc,
			dedupe_key_enc, created_at) VALUES ('u1', 'owner', x'00', 2, 1, x'00', x'00', x'00', x'00', x'00', 0)`)
		return err
	}
	if err := insert(); err != nil {
		t.Fatal(err)
	}
	if err := insert(); !IsUniqueViolation(err) {
		t.Errorf("IsUniqueViolation(%v) = false, want true", err)
	}
	if IsUniqueViolation(errors.New("plain")) || IsUniqueViolation(nil) {
		t.Error("IsUniqueViolation true for a non-constraint error")
	}
}

// A commit the box acknowledged (for example a 201 for a new blob) must
// survive a power cut: synchronous=FULL.
func TestSynchronousFull(t *testing.T) {
	s, _ := open(t)
	var mode int
	if err := s.DB().QueryRow("PRAGMA synchronous").Scan(&mode); err != nil || mode != 2 {
		t.Errorf("synchronous = %d (%v), want 2 (FULL)", mode, err)
	}
}
