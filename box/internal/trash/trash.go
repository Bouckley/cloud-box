// Package trash moves items to Trash, restores them, deletes them for good
// (only from Trash) and purges items that have been in Trash for 30 days.
package trash

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/Bouckley/cloud-box/box/internal/blobs"
	"github.com/Bouckley/cloud-box/box/internal/hal"
	"github.com/Bouckley/cloud-box/box/internal/library"
	"github.com/Bouckley/cloud-box/box/internal/store"
)

// Retention is how long an item stays in Trash before it is purged.
const Retention = 30 * 24 * time.Hour

// ErrNotInTrash means a permanent delete was asked for an item that is not
// in Trash (409 not_in_trash). Deletes always go through Trash.
var ErrNotInTrash = errors.New("not in trash")

// Service runs Trash.
type Service struct {
	db    *store.Store
	hal   hal.HAL
	blobs *blobs.Service
}

// New returns the Trash service.
func New(db *store.Store, h hal.HAL, b *blobs.Service) *Service {
	return &Service{db: db, hal: h, blobs: b}
}

// Entry is an item in Trash.
type Entry struct {
	ItemID    string
	TrashedAt time.Time
	DaysLeft  int
}

// trashedAt returns whether the user's item is in Trash, or store.ErrNotFound.
func trashedAt(ctx context.Context, tx *sql.Tx, userID, itemID string) (sql.NullInt64, error) {
	var t sql.NullInt64
	err := tx.QueryRowContext(ctx, "SELECT trashed_at FROM items WHERE id = ? AND owner_id = ?", itemID, userID).Scan(&t)
	if errors.Is(err, sql.ErrNoRows) {
		return t, store.ErrNotFound
	}
	return t, err
}

// Trash moves the item to Trash and gives it a new seq. Already in Trash: no-op.
func (s *Service) Trash(ctx context.Context, userID, itemID string) error {
	return s.setTrashed(ctx, userID, itemID, true)
}

// Restore takes the item out of Trash and gives it a new seq. Its collection
// and that collection's deleted ancestors are un-deleted. Not in Trash: no-op.
func (s *Service) Restore(ctx context.Context, userID, itemID string) error {
	return s.setTrashed(ctx, userID, itemID, false)
}

func (s *Service) setTrashed(ctx context.Context, userID, itemID string, trash bool) error {
	return s.db.Tx(ctx, func(tx *sql.Tx) error {
		t, err := trashedAt(ctx, tx, userID, itemID)
		if err != nil || t.Valid == trash {
			return err
		}
		seq, err := store.NextSeq(ctx, tx)
		if err != nil {
			return err
		}
		var at any
		if trash {
			at = s.hal.Clock.Now().UnixMilli()
		}
		if _, err := tx.ExecContext(ctx, "UPDATE items SET trashed_at = ?, seq = ? WHERE id = ?", at, seq, itemID); err != nil {
			return err
		}
		if trash {
			return nil
		}
		var col string
		if err := tx.QueryRowContext(ctx, "SELECT collection_id FROM items WHERE id = ?", itemID).Scan(&col); err != nil {
			return err
		}
		return library.UndeleteCollection(ctx, tx, col)
	})
}

// List returns the user's items in Trash, most recently trashed first.
func (s *Service) List(ctx context.Context, userID string) ([]Entry, error) {
	rows, err := s.db.DB().QueryContext(ctx, `SELECT id, trashed_at FROM items
		WHERE owner_id = ? AND trashed_at IS NOT NULL ORDER BY trashed_at DESC, id`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	now := s.hal.Clock.Now()
	list := []Entry{}
	for rows.Next() {
		var e Entry
		var at int64
		if err := rows.Scan(&e.ItemID, &at); err != nil {
			return nil, err
		}
		e.TrashedAt = time.UnixMilli(at).UTC()
		e.DaysLeft = daysLeft(e.TrashedAt, now)
		list = append(list, e)
	}
	return list, rows.Err()
}

// daysLeft rounds the time until purge up to whole days, between 0 and 30.
func daysLeft(trashed, now time.Time) int {
	left := trashed.Add(Retention).Sub(now)
	if left <= 0 {
		return 0
	}
	return min(int((left+24*time.Hour-1)/(24*time.Hour)), int(Retention/(24*time.Hour)))
}

// Delete deletes an item in Trash for good: its rows, its blobs (main and
// backup copies) and a tombstone so other devices drop it on their next sync.
func (s *Service) Delete(ctx context.Context, userID, itemID string) error {
	var blobIDs []string
	err := s.db.Tx(ctx, func(tx *sql.Tx) error {
		t, err := trashedAt(ctx, tx, userID, itemID)
		if err != nil {
			return err
		}
		if !t.Valid {
			return ErrNotInTrash
		}
		blobIDs, err = deleteItem(ctx, tx, userID, itemID)
		return err
	})
	if err != nil {
		return err
	}
	s.removeFiles(ctx, blobIDs)
	return nil
}

// Purge deletes for good every item that has been in Trash for Retention,
// for all users, and returns how many.
func (s *Service) Purge(ctx context.Context) (int, error) {
	cutoff := s.hal.Clock.Now().Add(-Retention).UnixMilli()
	rows, err := s.db.DB().QueryContext(ctx,
		"SELECT id, owner_id FROM items WHERE trashed_at IS NOT NULL AND trashed_at <= ?", cutoff)
	if err != nil {
		return 0, err
	}
	type due struct{ id, owner string }
	var list []due
	for rows.Next() {
		var d due
		if err := rows.Scan(&d.id, &d.owner); err != nil {
			rows.Close()
			return 0, err
		}
		list = append(list, d)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return 0, err
	}
	n := 0
	for _, d := range list {
		var blobIDs []string
		err := s.db.Tx(ctx, func(tx *sql.Tx) error {
			// Re-check inside the transaction: it may have been restored since.
			t, err := trashedAt(ctx, tx, d.owner, d.id)
			if err != nil || !t.Valid || t.Int64 > cutoff {
				return err
			}
			blobIDs, err = deleteItem(ctx, tx, d.owner, d.id)
			return err
		})
		if errors.Is(err, store.ErrNotFound) {
			continue // deleted meanwhile
		}
		if err != nil {
			return n, err
		}
		if blobIDs != nil {
			s.removeFiles(ctx, blobIDs)
			n++
		}
	}
	return n, nil
}

// deleteItem removes the item, its blobs' rows (and their replica rows) and
// writes a tombstone, returning the blob ids whose files must go. A deleted
// collection it leaves empty goes too, with its deleted ancestors.
func deleteItem(ctx context.Context, tx *sql.Tx, userID, itemID string) ([]string, error) {
	var col string
	if err := tx.QueryRowContext(ctx, "SELECT collection_id FROM items WHERE id = ?", itemID).Scan(&col); err != nil {
		return nil, err
	}
	rows, err := tx.QueryContext(ctx, "SELECT blob_id FROM item_blobs WHERE item_id = ?", itemID)
	if err != nil {
		return nil, err
	}
	blobIDs := []string{}
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			rows.Close()
			return nil, err
		}
		blobIDs = append(blobIDs, id)
	}
	rows.Close()
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, "DELETE FROM items WHERE id = ?", itemID); err != nil {
		return nil, err
	}
	for _, id := range blobIDs {
		if _, err := tx.ExecContext(ctx, "DELETE FROM blobs WHERE id = ?", id); err != nil {
			return nil, err
		}
	}
	seq, err := store.NextSeq(ctx, tx)
	if err != nil {
		return nil, err
	}
	if _, err := tx.ExecContext(ctx, "INSERT INTO tombstones (item_id, owner_id, seq) VALUES (?, ?, ?)", itemID, userID, seq); err != nil {
		return nil, err
	}
	return blobIDs, library.RemoveDeletedEmpty(ctx, tx, col)
}

// removeFiles deletes blob files after the rows are gone. A failure (or a
// crash before this runs) leaves an orphan file holding only ciphertext;
// M4's scrub reports and removes orphans.
func (s *Service) removeFiles(ctx context.Context, blobIDs []string) {
	for _, id := range blobIDs {
		_ = s.blobs.Remove(context.WithoutCancel(ctx), id)
	}
}
