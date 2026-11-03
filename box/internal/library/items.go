package library

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/Bouckley/cloud-box/box/internal/auth"
	"github.com/Bouckley/cloud-box/box/internal/store"
)

var (
	// ErrAlreadyStored means the user already has an item with this dedupe
	// hash (409 already_stored); lookupItems returns it.
	ErrAlreadyStored = errors.New("already stored")
	// ErrBlobInUse means a blob is already attached to an item (409 blob_in_use).
	ErrBlobInUse = errors.New("blob in use")
	// ErrRewrapRequired means a move to another collection came without the
	// file key wrapped for that collection (409 rewrap_required).
	ErrRewrapRequired = errors.New("rewrap required")
	// ErrBadBlob means the blob list is wrong: no original, an unknown role,
	// a repeated role or blob, or a blob that is not the user's (400).
	ErrBadBlob = errors.New("bad blob list")
	// ErrTooManyHashes means a lookup asked for more than MaxLookup hashes (400).
	ErrTooManyHashes = errors.New("too many hashes")
)

// MaxLookup is the most dedupe hashes one lookup may ask about.
const MaxLookup = 1000

// Item is an encrypted file and its blobs. State is computed, never stored.
type Item struct {
	ID           string
	CollectionID string
	DeviceID     string
	DedupeHash   string
	State        string
	FileKeyEnc   []byte
	MetadataEnc  []byte
	Blobs        []ItemBlob
	CreatedAt    time.Time
	TrashedAt    *time.Time
	Seq          int64
}

// ItemBlob is one of an item's blobs.
type ItemBlob struct {
	Role   string
	BlobID string
	Size   int64
}

// ItemPatch changes an item; nil fields are left alone.
type ItemPatch struct {
	CollectionID *string
	FileKeyEnc   []byte
	MetadataEnc  []byte
}

// Changes is one page of sync.
type Changes struct {
	Items  []Item
	Purged []string
	Cursor int64
	More   bool
}

// LookupResult is an item found by dedupe hash.
type LookupResult struct {
	DedupeHash string
	ItemID     string
	State      string
	Trashed    bool
}

// StateCounts counts the user's items (not in Trash) by state.
type StateCounts struct {
	Stored, Verified, Replicated int
}

// itemState is the item's state as one SQL expression over item i: the
// lowest state of its blobs, where a blob is replicated only with a verified
// replica, verified only after its re-read matched, and stored otherwise.
func itemState() string {
	return `(SELECT CASE MIN(CASE
			WHEN b.verified_at IS NULL THEN 1
			WHEN EXISTS (SELECT 1 FROM replicas r WHERE r.blob_id = b.id AND r.verified_at IS NOT NULL) THEN 3
			ELSE 2 END)
		WHEN 3 THEN 'replicated' WHEN 2 THEN 'verified' ELSE 'stored' END
		FROM item_blobs ib JOIN blobs b ON b.id = ib.blob_id WHERE ib.item_id = i.id)`
}

var itemColumns = `i.id, i.collection_id, i.device_id, i.dedupe_hash, ` + itemState() + `,
	i.file_key_enc, i.metadata_enc, i.created_at, i.trashed_at, i.seq`

var validRoles = map[string]bool{"original": true, "preview": true, "thumb": true}

// CreateItem stores an item made from the user's completed, unattached blobs.
func (s *Service) CreateItem(ctx context.Context, sess auth.Session, it Item) (Item, error) {
	if err := checkBlobList(it.Blobs); err != nil {
		return Item{}, err
	}
	var out Item
	err := s.db.Tx(ctx, func(tx *sql.Tx) error {
		if err := ownCollection(ctx, tx, sess.UserID, it.CollectionID); err != nil {
			return err
		}
		var taken int
		if err := tx.QueryRowContext(ctx, `SELECT (SELECT COUNT(*) FROM items WHERE id = ?)
			+ (SELECT COUNT(*) FROM tombstones WHERE item_id = ?)`, it.ID, it.ID).Scan(&taken); err != nil {
			return err
		}
		if taken > 0 {
			return store.ErrIDTaken
		}
		var dup int
		if err := tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM items WHERE owner_id = ? AND dedupe_hash = ?",
			sess.UserID, it.DedupeHash).Scan(&dup); err != nil {
			return err
		}
		if dup > 0 {
			return ErrAlreadyStored
		}
		for _, b := range it.Blobs {
			var owned, used int
			if err := tx.QueryRowContext(ctx, `SELECT
				(SELECT COUNT(*) FROM blobs WHERE id = ? AND owner_id = ?),
				(SELECT COUNT(*) FROM item_blobs WHERE blob_id = ?)`, b.BlobID, sess.UserID, b.BlobID).Scan(&owned, &used); err != nil {
				return err
			}
			if owned == 0 {
				return ErrBadBlob
			}
			if used > 0 {
				return ErrBlobInUse
			}
		}
		seq, err := store.NextSeq(ctx, tx)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `INSERT INTO items (id, owner_id, device_id, collection_id, file_key_enc,
			metadata_enc, dedupe_hash, seq, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
			it.ID, sess.UserID, sess.DeviceID, it.CollectionID, it.FileKeyEnc, it.MetadataEnc, it.DedupeHash,
			seq, s.clock.Now().UnixMilli()); err != nil {
			return err
		}
		for _, b := range it.Blobs {
			if _, err := tx.ExecContext(ctx, "INSERT INTO item_blobs (item_id, blob_id, role) VALUES (?, ?, ?)",
				it.ID, b.BlobID, b.Role); err != nil {
				return err
			}
		}
		out, err = getItem(ctx, tx, sess.UserID, it.ID)
		return err
	})
	return out, err
}

func checkBlobList(list []ItemBlob) error {
	roles, ids := map[string]bool{}, map[string]bool{}
	for _, b := range list {
		if !validRoles[b.Role] || roles[b.Role] || ids[b.BlobID] {
			return ErrBadBlob
		}
		roles[b.Role], ids[b.BlobID] = true, true
	}
	if !roles["original"] {
		return ErrBadBlob
	}
	return nil
}

// ownCollection is store.ErrNotFound unless the user owns the collection and
// it is not deleted.
func ownCollection(ctx context.Context, tx *sql.Tx, userID, id string) error {
	var n int
	if err := tx.QueryRowContext(ctx, "SELECT COUNT(*) FROM collections WHERE id = ? AND owner_id = ? AND deleted_at IS NULL",
		id, userID).Scan(&n); err != nil {
		return err
	}
	if n == 0 {
		return store.ErrNotFound
	}
	return nil
}

// UpdateItem moves an item or replaces its metadata, giving it a new seq.
// A move to another collection needs FileKeyEnc re-wrapped for it.
func (s *Service) UpdateItem(ctx context.Context, userID, id string, p ItemPatch) (Item, error) {
	var out Item
	err := s.db.Tx(ctx, func(tx *sql.Tx) error {
		cur, err := getItem(ctx, tx, userID, id)
		if err != nil {
			return err
		}
		col, key, meta := cur.CollectionID, cur.FileKeyEnc, cur.MetadataEnc
		if p.CollectionID != nil && *p.CollectionID != cur.CollectionID {
			if err := ownCollection(ctx, tx, userID, *p.CollectionID); err != nil {
				return err
			}
			if p.FileKeyEnc == nil {
				return ErrRewrapRequired
			}
			col = *p.CollectionID
		}
		if p.FileKeyEnc != nil {
			key = p.FileKeyEnc
		}
		if p.MetadataEnc != nil {
			meta = p.MetadataEnc
		}
		seq, err := store.NextSeq(ctx, tx)
		if err != nil {
			return err
		}
		if _, err := tx.ExecContext(ctx, `UPDATE items SET collection_id = ?, file_key_enc = ?, metadata_enc = ?,
			seq = ? WHERE id = ?`, col, key, meta, seq, id); err != nil {
			return err
		}
		out, err = getItem(ctx, tx, userID, id)
		return err
	})
	return out, err
}

// GetItem returns one of the user's items.
func (s *Service) GetItem(ctx context.Context, userID, id string) (Item, error) {
	var out Item
	err := s.db.Tx(ctx, func(tx *sql.Tx) error {
		var err error
		out, err = getItem(ctx, tx, userID, id)
		return err
	})
	return out, err
}

func getItem(ctx context.Context, tx *sql.Tx, userID, id string) (Item, error) {
	items, err := queryItems(ctx, tx, 1, "i.id = ? AND i.owner_id = ?", id, userID)
	if err != nil {
		return Item{}, err
	}
	if len(items) == 0 {
		return Item{}, store.ErrNotFound
	}
	return items[0], nil
}

// queryItems loads at most limit items matching where (over alias i), in
// seq order, with their blobs.
func queryItems(ctx context.Context, tx *sql.Tx, limit int, where string, args ...any) ([]Item, error) {
	rows, err := tx.QueryContext(ctx, "SELECT "+itemColumns+" FROM items i WHERE "+where+" ORDER BY i.seq LIMIT ?",
		append(args, limit)...)
	if err != nil {
		return nil, err
	}
	items := []Item{}
	index := map[string]int{}
	for rows.Next() {
		var it Item
		var created int64
		var trashed sql.NullInt64
		if err := rows.Scan(&it.ID, &it.CollectionID, &it.DeviceID, &it.DedupeHash, &it.State,
			&it.FileKeyEnc, &it.MetadataEnc, &created, &trashed, &it.Seq); err != nil {
			rows.Close()
			return nil, err
		}
		it.CreatedAt = time.UnixMilli(created).UTC()
		if trashed.Valid {
			t := time.UnixMilli(trashed.Int64).UTC()
			it.TrashedAt = &t
		}
		it.Blobs = []ItemBlob{}
		index[it.ID] = len(items)
		items = append(items, it)
	}
	rows.Close()
	if err := rows.Err(); err != nil || len(items) == 0 {
		return items, err
	}
	ids := make([]any, 0, len(items))
	for _, it := range items {
		ids = append(ids, it.ID)
	}
	brows, err := tx.QueryContext(ctx, `SELECT ib.item_id, ib.role, ib.blob_id, b.size
		FROM item_blobs ib JOIN blobs b ON b.id = ib.blob_id
		WHERE ib.item_id IN (`+placeholders(len(ids))+`) ORDER BY ib.item_id, ib.role`, ids...)
	if err != nil {
		return nil, err
	}
	defer brows.Close()
	for brows.Next() {
		var itemID string
		var b ItemBlob
		if err := brows.Scan(&itemID, &b.Role, &b.BlobID, &b.Size); err != nil {
			return nil, err
		}
		i := index[itemID]
		items[i].Blobs = append(items[i].Blobs, b)
	}
	return items, brows.Err()
}

func placeholders(n int) string {
	return strings.TrimSuffix(strings.Repeat("?,", n), ",")
}

// Changes returns up to limit items and purged ids with seq above since, in
// seq order. Cursor is the seq of the last entry returned (since when none).
// It reads in one transaction, so a page is a consistent snapshot.
func (s *Service) Changes(ctx context.Context, userID string, since int64, limit int) (Changes, error) {
	ch := Changes{Items: []Item{}, Purged: []string{}, Cursor: since}
	err := s.db.Tx(ctx, func(tx *sql.Tx) error {
		items, err := queryItems(ctx, tx, limit+1, "i.owner_id = ? AND i.seq > ?", userID, since)
		if err != nil {
			return err
		}
		type tomb struct {
			id  string
			seq int64
		}
		var tombs []tomb
		rows, err := tx.QueryContext(ctx, `SELECT item_id, seq FROM tombstones WHERE owner_id = ? AND seq > ?
			ORDER BY seq LIMIT ?`, userID, since, limit+1)
		if err != nil {
			return err
		}
		for rows.Next() {
			var t tomb
			if err := rows.Scan(&t.id, &t.seq); err != nil {
				rows.Close()
				return err
			}
			tombs = append(tombs, t)
		}
		rows.Close()
		if err := rows.Err(); err != nil {
			return err
		}
		// Merge the two seq-ordered lists, taking at most limit entries.
		i, j := 0, 0
		for n := 0; n < limit && (i < len(items) || j < len(tombs)); n++ {
			if j >= len(tombs) || (i < len(items) && items[i].Seq < tombs[j].seq) {
				ch.Items = append(ch.Items, items[i])
				ch.Cursor = items[i].Seq
				i++
			} else {
				ch.Purged = append(ch.Purged, tombs[j].id)
				ch.Cursor = tombs[j].seq
				j++
			}
		}
		ch.More = i < len(items) || j < len(tombs)
		return nil
	})
	return ch, err
}

// Lookup returns the user's items with any of the given dedupe hashes.
func (s *Service) Lookup(ctx context.Context, userID string, hashes []string) ([]LookupResult, error) {
	if len(hashes) > MaxLookup {
		return nil, ErrTooManyHashes
	}
	found := []LookupResult{}
	if len(hashes) == 0 {
		return found, nil
	}
	args := []any{userID}
	for _, h := range hashes {
		args = append(args, h)
	}
	rows, err := s.db.DB().QueryContext(ctx, `SELECT i.dedupe_hash, i.id, `+itemState()+`, i.trashed_at IS NOT NULL
		FROM items i WHERE i.owner_id = ? AND i.dedupe_hash IN (`+placeholders(len(hashes))+`)`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	for rows.Next() {
		var r LookupResult
		if err := rows.Scan(&r.DedupeHash, &r.ItemID, &r.State, &r.Trashed); err != nil {
			return nil, err
		}
		found = append(found, r)
	}
	return found, rows.Err()
}

// StateCounts counts the user's items outside Trash by computed state.
func (s *Service) StateCounts(ctx context.Context, userID string) (StateCounts, error) {
	var c StateCounts
	rows, err := s.db.DB().QueryContext(ctx, `SELECT `+itemState()+` AS state, COUNT(*) FROM items i
		WHERE i.owner_id = ? AND i.trashed_at IS NULL GROUP BY state`, userID)
	if err != nil {
		return c, err
	}
	defer rows.Close()
	for rows.Next() {
		var state string
		var n int
		if err := rows.Scan(&state, &n); err != nil {
			return c, err
		}
		switch state {
		case "replicated":
			c.Replicated = n
		case "verified":
			c.Verified = n
		default:
			c.Stored = n
		}
	}
	return c, rows.Err()
}
