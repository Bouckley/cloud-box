package blobs

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"time"

	"github.com/Bouckley/cloud-box/box/internal/hal"
)

// LooseBlobTTL is how long a completed blob may wait to be attached to an
// item before cleanup removes it.
const LooseBlobTTL = 24 * time.Hour

// CleanupUploads removes, and counts:
//   - unfinished uploads past their expiry, with their data files (finished
//     uploads past expiry lose their rows too, uncounted: the blob stays);
//   - files under uploads/ with no upload row;
//   - files in tmp/ on the main and backup drives older than 24 h;
//   - completed blobs not attached to an item after LooseBlobTTL (rows, then
//     main and backup files).
func (s *Service) CleanupUploads(ctx context.Context) (int, error) {
	root, _, err := s.mainRoot(ctx)
	if err != nil {
		return 0, err
	}
	now := s.hal.Clock.Now()
	total := 0

	n, err := s.cleanupExpired(ctx, root, now)
	total += n
	if err != nil {
		return total, err
	}
	n, err = s.cleanupOrphanFiles(ctx, root)
	total += n
	if err != nil {
		return total, err
	}
	n, err = s.cleanupLooseBlobs(ctx, now)
	total += n
	if err != nil {
		return total, err
	}
	for _, role := range []string{hal.RoleMain, hal.RoleBackup} {
		d, err := s.hal.Drive(ctx, role)
		if errors.Is(err, hal.ErrDriveMissing) {
			continue
		}
		if err != nil {
			return total, err
		}
		total += removeOld(filepath.Join(d.Path, "tmp"), now.Add(-UploadTTL))
	}
	return total, nil
}

func (s *Service) cleanupExpired(ctx context.Context, root string, now time.Time) (int, error) {
	rows, err := s.db.DB().QueryContext(ctx,
		"SELECT id FROM uploads WHERE blob_id IS NULL AND expires_at <= ?", now.UnixMilli())
	if err != nil {
		return 0, err
	}
	ids, err := scanIDs(rows)
	if err != nil {
		return 0, err
	}
	n := 0
	for _, id := range ids {
		l := s.lock(id)
		l.Lock()
		err := s.db.Tx(ctx, func(tx *sql.Tx) error {
			if _, err := tx.ExecContext(ctx, "DELETE FROM upload_parts WHERE upload_id = ?", id); err != nil {
				return err
			}
			_, err := tx.ExecContext(ctx, "DELETE FROM uploads WHERE id = ? AND blob_id IS NULL", id)
			return err
		})
		if err == nil {
			if rmErr := os.Remove(dataPath(root, id)); rmErr != nil && !errors.Is(rmErr, os.ErrNotExist) {
				err = rmErr
			}
		}
		l.Unlock()
		if err != nil {
			return n, err
		}
		n++
	}
	// Finished uploads only matter for retrying complete; drop them too.
	_, err = s.db.DB().ExecContext(ctx, "DELETE FROM uploads WHERE blob_id IS NOT NULL AND expires_at <= ?", now.UnixMilli())
	return n, err
}

func (s *Service) cleanupOrphanFiles(ctx context.Context, root string) (int, error) {
	entries, err := os.ReadDir(filepath.Join(root, "uploads"))
	if errors.Is(err, os.ErrNotExist) {
		return 0, nil
	}
	if err != nil {
		return 0, err
	}
	n := 0
	for _, e := range entries {
		id := e.Name()
		l := s.lock(id)
		l.Lock()
		var exists int
		err := s.db.DB().QueryRowContext(ctx, "SELECT COUNT(*) FROM uploads WHERE id = ?", id).Scan(&exists)
		if err == nil && exists == 0 {
			if err = os.RemoveAll(filepath.Join(root, "uploads", id)); err == nil {
				n++
			}
		}
		l.Unlock()
		if err != nil {
			return n, err
		}
	}
	return n, nil
}

func (s *Service) cleanupLooseBlobs(ctx context.Context, now time.Time) (int, error) {
	rows, err := s.db.DB().QueryContext(ctx, `SELECT id FROM blobs b WHERE stored_at <= ?
		AND NOT EXISTS (SELECT 1 FROM item_blobs ib WHERE ib.blob_id = b.id)`, now.Add(-LooseBlobTTL).UnixMilli())
	if err != nil {
		return 0, err
	}
	ids, err := scanIDs(rows)
	if err != nil {
		return 0, err
	}
	n := 0
	for _, id := range ids {
		// Re-check in the delete itself: an item may have claimed it since.
		res, err := s.db.DB().ExecContext(ctx, `DELETE FROM blobs WHERE id = ?
			AND NOT EXISTS (SELECT 1 FROM item_blobs ib WHERE ib.blob_id = blobs.id)`, id)
		if err != nil {
			return n, err
		}
		if k, _ := res.RowsAffected(); k == 1 {
			_ = s.Remove(ctx, id) // a leftover file is ciphertext; M4's scrub finds it
			n++
		}
	}
	return n, nil
}

// removeOld deletes regular files in dir last modified before cutoff.
func removeOld(dir string, cutoff time.Time) int {
	entries, err := os.ReadDir(dir)
	if err != nil {
		return 0
	}
	n := 0
	for _, e := range entries {
		info, err := e.Info()
		if err != nil || !info.Mode().IsRegular() || !info.ModTime().Before(cutoff) {
			continue
		}
		if os.Remove(filepath.Join(dir, e.Name())) == nil {
			n++
		}
	}
	return n
}

func scanIDs(rows *sql.Rows) ([]string, error) {
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}
