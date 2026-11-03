// Package store opens boxd's SQLite database and applies migrations.
// Domain packages own their SQL and run it through Store.Tx.
package store

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"fmt"
	"io/fs"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"modernc.org/sqlite"
	sqlite3 "modernc.org/sqlite/lib"

	"github.com/Bouckley/cloud-box/box/migrations"
)

// ErrNotFound means the row does not exist or belongs to another user.
var ErrNotFound = errors.New("not found")

// ErrIDTaken means a client-generated id is already in use (409 id_taken).
var ErrIDTaken = errors.New("id already taken")

// Store is an open database.
type Store struct {
	db *sql.DB
}

// Open creates the database (and its directory, mode 0700) if needed, sets
// WAL mode and foreign keys, and applies pending migrations.
func Open(ctx context.Context, path string) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return nil, fmt.Errorf("create db dir: %w", err)
	}
	dsn := "file:" + path +
		"?_pragma=journal_mode(WAL)&_pragma=foreign_keys(1)" +
		"&_pragma=busy_timeout(5000)&_pragma=synchronous(NORMAL)"
	db, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("open db: %w", err)
	}
	// One connection: a single writer is simple and enough for one home.
	// Every transaction is therefore serialized. Read-then-write checks (for
	// example "setup only while no user exists") rely on this; if the pool is
	// ever widened, switch those transactions to BEGIN IMMEDIATE first.
	db.SetMaxOpenConns(1)
	s := &Store{db: db}
	if err := s.migrate(ctx); err != nil {
		_ = db.Close()
		return nil, err
	}
	return s, nil
}

// Close closes the database.
func (s *Store) Close() error { return s.db.Close() }

// DB returns the underlying handle for read queries.
func (s *Store) DB() *sql.DB { return s.db }

// Tx runs fn in a transaction, committing if fn returns nil.
func (s *Store) Tx(ctx context.Context, fn func(*sql.Tx) error) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	if err := fn(tx); err != nil {
		_ = tx.Rollback()
		return err
	}
	return tx.Commit()
}

// NextSeq returns the next value of the global sync sequence.
func NextSeq(ctx context.Context, tx *sql.Tx) (int64, error) {
	var v int64
	err := tx.QueryRowContext(ctx,
		"UPDATE counters SET value = value + 1 WHERE name = 'seq' RETURNING value").Scan(&v)
	return v, err
}

// IsUniqueViolation reports whether err is a UNIQUE or PRIMARY KEY conflict.
func IsUniqueViolation(err error) bool {
	var se *sqlite.Error
	if !errors.As(err, &se) {
		return false
	}
	switch se.Code() {
	case sqlite3.SQLITE_CONSTRAINT_UNIQUE, sqlite3.SQLITE_CONSTRAINT_PRIMARYKEY:
		return true
	}
	return false
}

func (s *Store) migrate(ctx context.Context) error {
	if _, err := s.db.ExecContext(ctx, `CREATE TABLE IF NOT EXISTS schema_migrations (
		version INTEGER PRIMARY KEY, name TEXT NOT NULL, sha256 TEXT NOT NULL,
		applied_at INTEGER NOT NULL) STRICT`); err != nil {
		return fmt.Errorf("create schema_migrations: %w", err)
	}
	names, err := fs.Glob(migrations.FS, "*.sql")
	if err != nil {
		return err
	}
	sort.Strings(names)
	for _, name := range names {
		version, err := strconv.Atoi(strings.SplitN(name, "_", 2)[0])
		if err != nil {
			return fmt.Errorf("migration %s: name must start with a number", name)
		}
		body, err := migrations.FS.ReadFile(name)
		if err != nil {
			return err
		}
		sum := sha256.Sum256(body)
		digest := hex.EncodeToString(sum[:])

		var applied string
		err = s.db.QueryRowContext(ctx,
			"SELECT sha256 FROM schema_migrations WHERE version = ?", version).Scan(&applied)
		switch {
		case err == nil:
			if applied != digest {
				return fmt.Errorf("migration %04d was edited after it was applied; add a new migration instead", version)
			}
			continue
		case !errors.Is(err, sql.ErrNoRows):
			return err
		}
		err = s.Tx(ctx, func(tx *sql.Tx) error {
			if _, err := tx.ExecContext(ctx, string(body)); err != nil {
				return fmt.Errorf("apply migration %s: %w", name, err)
			}
			_, err := tx.ExecContext(ctx,
				"INSERT INTO schema_migrations (version, name, sha256, applied_at) VALUES (?, ?, ?, ?)",
				version, name, digest, time.Now().UnixMilli())
			return err
		})
		if err != nil {
			return err
		}
	}
	return nil
}
