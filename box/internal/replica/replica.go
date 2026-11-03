// Package replica copies blobs to the backup drive and records each copy
// only after it has been read back from that drive and its SHA-256 matched.
// M1's minimal backup: one target, "backup" (doc 05 has the full design).
package replica

import (
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"path/filepath"
	"time"

	"github.com/Bouckley/cloud-box/box/internal/blobs"
	"github.com/Bouckley/cloud-box/box/internal/hal"
	"github.com/Bouckley/cloud-box/box/internal/store"
)

// Target is the replicas.target name of the backup drive.
const Target = "backup"

// ErrBackupMissing means the backup drive is not plugged in.
var ErrBackupMissing = errors.New("backup drive missing")

// errCopyBad means a copy did not match the blob's recorded SHA-256.
var errCopyBad = errors.New("copy does not match")

// Service copies blobs to the backup drive.
type Service struct {
	db  *store.Store
	hal hal.HAL
}

// New returns the replica service.
func New(db *store.Store, h hal.HAL) *Service {
	return &Service{db: db, hal: h}
}

// Result counts one run's blobs.
type Result struct {
	Copied int
	Failed int
}

type pending struct {
	id, sha256 string
}

// Run copies every blob without a verified backup copy. A blob whose copy
// fails (unreadable, or not matching its SHA-256) counts as Failed, gets no
// replica row and is tried again next run. Items whose blobs were copied get
// a new seq so apps learn their state changed.
func (s *Service) Run(ctx context.Context) (Result, error) {
	var res Result
	backup, err := s.hal.Drive(ctx, hal.RoleBackup)
	if errors.Is(err, hal.ErrDriveMissing) {
		return res, ErrBackupMissing
	}
	if err != nil {
		return res, err
	}
	main, err := s.hal.Drive(ctx, hal.RoleMain)
	if err != nil {
		return res, err
	}
	rows, err := s.db.DB().QueryContext(ctx, `SELECT b.id, b.sha256 FROM blobs b
		WHERE NOT EXISTS (SELECT 1 FROM replicas r WHERE r.blob_id = b.id AND r.target = ? AND r.verified_at IS NOT NULL)
		ORDER BY b.stored_at`, Target)
	if err != nil {
		return res, err
	}
	var todo []pending
	for rows.Next() {
		var p pending
		if err := rows.Scan(&p.id, &p.sha256); err != nil {
			rows.Close()
			return res, err
		}
		todo = append(todo, p)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return res, err
	}
	for _, p := range todo {
		if err := ctx.Err(); err != nil {
			return res, err
		}
		if err := copyBlob(main.Path, backup.Path, p); err != nil {
			res.Failed++
			continue
		}
		if err := s.record(ctx, p.id); err != nil {
			return res, err
		}
		res.Copied++
	}
	return res, nil
}

// copyBlob copies one blob into <backup>/tmp while hashing, fsyncs it,
// renames it into place and reads it back from the drive. On any mismatch
// the copy is removed.
func copyBlob(mainRoot, backupRoot string, p pending) error {
	src, err := os.Open(blobs.BlobPath(mainRoot, p.id))
	if err != nil {
		return err
	}
	defer src.Close()
	tmpDir := filepath.Join(backupRoot, "tmp")
	if err := os.MkdirAll(tmpDir, 0o700); err != nil {
		return err
	}
	tmp, err := os.CreateTemp(tmpDir, "copy-*")
	if err != nil {
		return err
	}
	defer os.Remove(tmp.Name()) // no-op after a successful rename
	h := sha256.New()
	if _, err := io.Copy(io.MultiWriter(tmp, h), src); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Sync(); err != nil {
		tmp.Close()
		return err
	}
	if err := tmp.Close(); err != nil {
		return err
	}
	if hex.EncodeToString(h.Sum(nil)) != p.sha256 {
		return errCopyBad // the main copy is damaged; M4's scrub reports it
	}
	dest := blobs.BlobPath(backupRoot, p.id)
	if err := os.MkdirAll(filepath.Dir(dest), 0o700); err != nil {
		return err
	}
	if err := os.Rename(tmp.Name(), dest); err != nil {
		return err
	}
	if d, err := os.Open(filepath.Dir(dest)); err == nil {
		_ = d.Sync()
		d.Close()
	}
	if got, err := blobs.HashFileUncached(dest); err != nil || got != p.sha256 {
		_ = os.Remove(dest)
		if err == nil {
			err = errCopyBad
		}
		return err
	}
	return nil
}

// record marks the blob's backup copy verified and bumps its item's seq.
func (s *Service) record(ctx context.Context, blobID string) error {
	now := s.hal.Clock.Now().UnixMilli()
	return s.db.Tx(ctx, func(tx *sql.Tx) error {
		if _, err := tx.ExecContext(ctx, `INSERT INTO replicas (blob_id, target, copied_at, verified_at)
			VALUES (?, ?, ?, ?) ON CONFLICT (blob_id, target) DO UPDATE
			SET copied_at = excluded.copied_at, verified_at = excluded.verified_at`,
			blobID, Target, now, now); err != nil {
			return err
		}
		var itemID string
		err := tx.QueryRowContext(ctx, "SELECT item_id FROM item_blobs WHERE blob_id = ?", blobID).Scan(&itemID)
		if errors.Is(err, sql.ErrNoRows) {
			return nil // not attached to an item (yet)
		}
		if err != nil {
			return err
		}
		seq, err := store.NextSeq(ctx, tx)
		if err != nil {
			return err
		}
		_, err = tx.ExecContext(ctx, "UPDATE items SET seq = ? WHERE id = ?", seq, itemID)
		return err
	})
}

// LastCopyAt is when the most recent backup copy was made, or nil if none.
func (s *Service) LastCopyAt(ctx context.Context) (*time.Time, error) {
	var ms sql.NullInt64
	if err := s.db.DB().QueryRowContext(ctx, "SELECT MAX(copied_at) FROM replicas WHERE target = ?", Target).Scan(&ms); err != nil {
		return nil, err
	}
	if !ms.Valid {
		return nil, nil
	}
	t := time.UnixMilli(ms.Int64).UTC()
	return &t, nil
}
