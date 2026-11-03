package library

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/Bouckley/cloud-box/box/internal/store"
)

// ErrInvalidParent means the parent is not one of the user's folders, the
// collection is an album (albums are never nested), or a move would make a
// folder its own ancestor (409 invalid_parent).
var ErrInvalidParent = errors.New("invalid parent")

// ErrCollectionNotEmpty means a delete was asked for a collection that still
// holds an item outside Trash or an undeleted child (409 collection_not_empty).
var ErrCollectionNotEmpty = errors.New("collection not empty")

// maxDepth bounds the walk up the parents, so a damaged database can never
// make it loop forever.
const maxDepth = 10_000

// Collection is an album or a folder. NameEnc and KeyEnc are ciphertext;
// KeyEnc is the collection key wrapped for the requesting user. DeletedAt is
// set once the collection is deleted; it stays listed while trashed items
// still need its key.
type Collection struct {
	ID        string
	Kind      string
	ParentID  *string
	NameEnc   []byte
	KeyEnc    []byte
	DeletedAt *time.Time
	Seq       int64
}

// CreateCollection stores a new collection and the user's wrapped key for it.
// A used id (by anyone) is store.ErrIDTaken.
func (s *Service) CreateCollection(ctx context.Context, userID string, c Collection) (Collection, error) {
	err := s.db.Tx(ctx, func(tx *sql.Tx) error {
		if err := checkParent(ctx, tx, userID, c.ID, c.Kind, c.ParentID); err != nil {
			return err
		}
		seq, err := store.NextSeq(ctx, tx)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO collections (id, owner_id, kind, parent_id, name_enc, seq, created_at)
			VALUES (?, ?, ?, ?, ?, ?, ?)`, c.ID, userID, c.Kind, c.ParentID, c.NameEnc, seq, s.clock.Now().UnixMilli()); err != nil {
			if store.IsUniqueViolation(err) {
				return store.ErrIDTaken
			}
			return err
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO collection_keys (collection_id, user_id, wrapped_key)
			VALUES (?, ?, ?)`, c.ID, userID, c.KeyEnc); err != nil {
			return err
		}
		c.Seq = seq
		return nil
	})
	if err != nil {
		return Collection{}, err
	}
	return c, nil
}

// Collections returns every collection the user holds a key for.
func (s *Service) Collections(ctx context.Context, userID string) ([]Collection, error) {
	rows, err := s.db.DB().QueryContext(ctx, `SELECT `+collectionColumns+`
		FROM collections c JOIN collection_keys k ON k.collection_id = c.id AND k.user_id = ?
		ORDER BY c.seq`, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []Collection{}
	for rows.Next() {
		c, err := scanCollection(rows)
		if err != nil {
			return nil, err
		}
		list = append(list, c)
	}
	return list, rows.Err()
}

// UpdateCollection renames (nameEnc != nil) and/or moves (parentID != nil;
// *parentID == nil means the root) one of the user's collections. Either
// change gives it a new seq. Another user's collection is store.ErrNotFound.
func (s *Service) UpdateCollection(ctx context.Context, userID, id string, nameEnc []byte, parentID **string) (Collection, error) {
	var out Collection
	err := s.db.Tx(ctx, func(tx *sql.Tx) error {
		c, err := getCollection(ctx, tx, userID, id)
		if err != nil {
			return err
		}
		if parentID != nil {
			if err := checkParent(ctx, tx, userID, id, c.Kind, *parentID); err != nil {
				return err
			}
			c.ParentID = *parentID
		}
		if nameEnc != nil {
			c.NameEnc = nameEnc
		}
		if c.Seq, err = store.NextSeq(ctx, tx); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, "UPDATE collections SET parent_id = ?, name_enc = ?, seq = ? WHERE id = ?",
			c.ParentID, c.NameEnc, c.Seq, id); err != nil {
			return err
		}
		out = c
		return nil
	})
	return out, err
}

// checkParent enforces the nesting rules for collection id of the given kind
// placed under parentID (nil = root), inside the caller's transaction.
func checkParent(ctx context.Context, tx *sql.Tx, userID, id, kind string, parentID *string) error {
	if parentID == nil {
		return nil
	}
	if kind != "folder" || *parentID == id {
		return ErrInvalidParent
	}
	var parentKind string
	err := tx.QueryRowContext(ctx, "SELECT kind FROM collections WHERE id = ? AND owner_id = ? AND deleted_at IS NULL",
		*parentID, userID).Scan(&parentKind)
	if errors.Is(err, sql.ErrNoRows) || (err == nil && parentKind != "folder") {
		return ErrInvalidParent
	}
	if err != nil {
		return err
	}
	// Walk up from the new parent; meeting id means id would contain itself.
	cur := *parentID
	for range maxDepth {
		var up sql.NullString
		if err := tx.QueryRowContext(ctx, "SELECT parent_id FROM collections WHERE id = ?", cur).Scan(&up); err != nil {
			return err
		}
		if !up.Valid {
			return nil
		}
		if up.String == id {
			return ErrInvalidParent
		}
		cur = up.String
	}
	return ErrInvalidParent
}

func getCollection(ctx context.Context, tx *sql.Tx, userID, id string) (Collection, error) {
	row := tx.QueryRowContext(ctx, `SELECT `+collectionColumns+`
		FROM collections c JOIN collection_keys k ON k.collection_id = c.id AND k.user_id = c.owner_id
		WHERE c.id = ? AND c.owner_id = ?`, id, userID)
	c, err := scanCollection(row)
	if errors.Is(err, sql.ErrNoRows) {
		return Collection{}, store.ErrNotFound
	}
	return c, err
}

const collectionColumns = `c.id, c.kind, c.parent_id, c.name_enc, k.wrapped_key, c.deleted_at, c.seq`

func scanCollection(r interface{ Scan(...any) error }) (Collection, error) {
	var c Collection
	var parent sql.NullString
	var deleted sql.NullInt64
	if err := r.Scan(&c.ID, &c.Kind, &parent, &c.NameEnc, &c.KeyEnc, &deleted, &c.Seq); err != nil {
		return Collection{}, err
	}
	if parent.Valid {
		c.ParentID = &parent.String
	}
	if deleted.Valid {
		at := time.UnixMilli(deleted.Int64).UTC()
		c.DeletedAt = &at
	}
	return c, nil
}

// DeleteCollection deletes one of the user's collections when no item
// outside Trash and no undeleted child collection is in it, else
// ErrCollectionNotEmpty. It only sets deleted_at (with a new seq): trashed
// items still need its key. Already deleted: no-op.
func (s *Service) DeleteCollection(ctx context.Context, userID, id string) error {
	return s.db.Tx(ctx, func(tx *sql.Tx) error {
		c, err := getCollection(ctx, tx, userID, id)
		if err != nil || c.DeletedAt != nil {
			return err
		}
		var busy int
		if err := tx.QueryRowContext(ctx, `SELECT
			(SELECT COUNT(*) FROM items WHERE collection_id = ? AND trashed_at IS NULL) +
			(SELECT COUNT(*) FROM collections WHERE parent_id = ? AND deleted_at IS NULL)`, id, id).Scan(&busy); err != nil {
			return err
		}
		if busy > 0 {
			return ErrCollectionNotEmpty
		}
		seq, err := store.NextSeq(ctx, tx)
		if err != nil {
			return err
		}
		_, err = tx.ExecContext(ctx, "UPDATE collections SET deleted_at = ?, seq = ? WHERE id = ?",
			s.clock.Now().UnixMilli(), seq, id)
		return err
	})
}

// UndeleteCollection un-deletes collection id and its deleted ancestors,
// giving each a new seq, inside the caller's transaction. Trash calls it
// when an item is restored.
func UndeleteCollection(ctx context.Context, tx *sql.Tx, id string) error {
	cur := id
	for range maxDepth {
		var parent sql.NullString
		var deleted sql.NullInt64
		err := tx.QueryRowContext(ctx, "SELECT parent_id, deleted_at FROM collections WHERE id = ?", cur).
			Scan(&parent, &deleted)
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		if deleted.Valid {
			seq, err := store.NextSeq(ctx, tx)
			if err != nil {
				return err
			}
			if _, err := tx.ExecContext(ctx, "UPDATE collections SET deleted_at = NULL, seq = ? WHERE id = ?", seq, cur); err != nil {
				return err
			}
		}
		if !parent.Valid {
			return nil
		}
		cur = parent.String
	}
	return nil
}

// RemoveDeletedEmpty removes collection id, and then each deleted ancestor,
// while it is deleted and holds no items and no child collections at all,
// inside the caller's transaction. Trash calls it after an item is deleted
// for good. An undeleted collection is never removed.
func RemoveDeletedEmpty(ctx context.Context, tx *sql.Tx, id string) error {
	cur := id
	for range maxDepth {
		var parent sql.NullString
		var deleted sql.NullInt64
		err := tx.QueryRowContext(ctx, "SELECT parent_id, deleted_at FROM collections WHERE id = ?", cur).
			Scan(&parent, &deleted)
		if errors.Is(err, sql.ErrNoRows) {
			return nil
		}
		if err != nil {
			return err
		}
		if !deleted.Valid {
			return nil
		}
		var held int
		if err := tx.QueryRowContext(ctx, `SELECT
			(SELECT COUNT(*) FROM items WHERE collection_id = ?) +
			(SELECT COUNT(*) FROM collections WHERE parent_id = ?)`, cur, cur).Scan(&held); err != nil {
			return err
		}
		if held > 0 {
			return nil
		}
		if _, err := tx.ExecContext(ctx, "DELETE FROM collection_keys WHERE collection_id = ?", cur); err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, "DELETE FROM collections WHERE id = ?", cur); err != nil {
			return err
		}
		if !parent.Valid {
			return nil
		}
		cur = parent.String
	}
	return nil
}
