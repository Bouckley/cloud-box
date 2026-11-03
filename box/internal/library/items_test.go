package library

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"testing"

	"github.com/Bouckley/cloud-box/box/internal/auth"
	"github.com/Bouckley/cloud-box/box/internal/store"
)

// addSession inserts a user with one device.
func (f *fixture) addSession(t testing.TB) auth.Session {
	t.Helper()
	sess := auth.Session{UserID: f.addUserTB(t), DeviceID: newID()}
	if _, err := f.db.DB().Exec(`INSERT INTO devices (id, user_id, name_enc, sign_public_key, created_at, last_seen)
		VALUES (?, ?, x'00', x'00', 0, 0)`, sess.DeviceID, sess.UserID); err != nil {
		t.Fatal(err)
	}
	return sess
}

// addBlob inserts a stored blob row for user (uploads are blobs' job).
func (f *fixture) addBlob(t testing.TB, userID string, verified bool) string {
	t.Helper()
	id := newID()
	var v any
	if verified {
		v = int64(1)
	}
	if _, err := f.db.DB().Exec(`INSERT INTO blobs (id, owner_id, size, sha256, stored_at, verified_at)
		VALUES (?, ?, 1234, ?, 1, ?)`, id, userID, newID()+newID(), v); err != nil {
		t.Fatal(err)
	}
	return id
}

func (f *fixture) newItem(t testing.TB, sess auth.Session, collectionID string, blobs ...ItemBlob) Item {
	t.Helper()
	if len(blobs) == 0 {
		blobs = []ItemBlob{{Role: "original", BlobID: f.addBlob(t, sess.UserID, true)}}
	}
	return Item{
		ID: newID(), CollectionID: collectionID, FileKeyEnc: randBytes(72),
		MetadataEnc: randBytes(100), DedupeHash: newID() + newID(), Blobs: blobs,
	}
}

func (f *fixture) album(t testing.TB, userID string) string {
	t.Helper()
	c, err := f.svc.CreateCollection(context.Background(), userID, Collection{
		ID: newID(), Kind: "album", NameEnc: randBytes(50), KeyEnc: randBytes(72),
	})
	if err != nil {
		t.Fatal(err)
	}
	return c.ID
}

func TestCreateItem(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	sess := f.addSession(t)
	col := f.album(t, sess.UserID)
	in := f.newItem(t, sess, col,
		ItemBlob{Role: "original", BlobID: f.addBlob(t, sess.UserID, true)},
		ItemBlob{Role: "thumb", BlobID: f.addBlob(t, sess.UserID, true)})

	it, err := f.svc.CreateItem(ctx, sess, in)
	if err != nil {
		t.Fatal(err)
	}
	if it.State != "verified" || it.DeviceID != sess.DeviceID || it.Seq == 0 || it.TrashedAt != nil ||
		it.CreatedAt.IsZero() || !bytes.Equal(it.MetadataEnc, in.MetadataEnc) || it.CollectionID != col {
		t.Errorf("item = %+v", it)
	}
	roles := map[string]ItemBlob{}
	for _, b := range it.Blobs {
		roles[b.Role] = b
	}
	if len(roles) != 2 || roles["original"].BlobID != in.Blobs[0].BlobID || roles["thumb"].Size != 1234 {
		t.Errorf("blobs = %+v", it.Blobs)
	}
	got, err := f.svc.GetItem(ctx, sess.UserID, it.ID)
	if err != nil || got.Seq != it.Seq || len(got.Blobs) != 2 {
		t.Errorf("GetItem = %+v, %v", got, err)
	}

	// An unverified blob makes the whole item only "stored".
	in2 := f.newItem(t, sess, col,
		ItemBlob{Role: "original", BlobID: f.addBlob(t, sess.UserID, true)},
		ItemBlob{Role: "preview", BlobID: f.addBlob(t, sess.UserID, false)})
	if it2, err := f.svc.CreateItem(ctx, sess, in2); err != nil || it2.State != "stored" {
		t.Errorf("item with an unverified blob: state %q, %v; want stored", it2.State, err)
	}
}

func TestItemStateIsLowestOfBlobs(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	sess := f.addSession(t)
	col := f.album(t, sess.UserID)
	orig, thumb := f.addBlob(t, sess.UserID, true), f.addBlob(t, sess.UserID, true)
	it, err := f.svc.CreateItem(ctx, sess, f.newItem(t, sess, col,
		ItemBlob{Role: "original", BlobID: orig}, ItemBlob{Role: "thumb", BlobID: thumb}))
	if err != nil {
		t.Fatal(err)
	}
	replicate := func(blobID string, verified bool) {
		var v any
		if verified {
			v = int64(2)
		}
		if _, err := f.db.DB().Exec(`INSERT INTO replicas (blob_id, target, copied_at, verified_at)
			VALUES (?, 'backup', 1, ?)`, blobID, v); err != nil {
			t.Fatal(err)
		}
	}
	state := func() string {
		got, err := f.svc.GetItem(ctx, sess.UserID, it.ID)
		if err != nil {
			t.Fatal(err)
		}
		return got.State
	}
	replicate(orig, true)
	if s := state(); s != "verified" {
		t.Errorf("one of two blobs replicated: %s, want verified", s)
	}
	replicate(thumb, false)
	if s := state(); s != "verified" {
		t.Errorf("unverified replica counts: %s, want verified", s)
	}
	if _, err := f.db.DB().Exec("UPDATE replicas SET verified_at = 3 WHERE blob_id = ?", thumb); err != nil {
		t.Fatal(err)
	}
	if s := state(); s != "replicated" {
		t.Errorf("both replicas verified: %s, want replicated", s)
	}
}

func TestCreateItemRejects(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	sess, other := f.addSession(t), f.addSession(t)
	col := f.album(t, sess.UserID)
	first, err := f.svc.CreateItem(ctx, sess, f.newItem(t, sess, col))
	if err != nil {
		t.Fatal(err)
	}

	cases := map[string]struct {
		edit func(*Item)
		want error
	}{
		"no original":  {func(it *Item) { it.Blobs[0].Role = "thumb" }, ErrBadBlob},
		"no blobs":     {func(it *Item) { it.Blobs = nil }, ErrBadBlob},
		"bad role":     {func(it *Item) { it.Blobs[0].Role = "poster" }, ErrBadBlob},
		"unknown blob": {func(it *Item) { it.Blobs[0].BlobID = newID() }, ErrBadBlob},
		"their blob":   {func(it *Item) { it.Blobs[0].BlobID = f.addBlob(t, other.UserID, true) }, ErrBadBlob},
		"same blob twice": {func(it *Item) {
			it.Blobs = append(it.Blobs, ItemBlob{Role: "thumb", BlobID: it.Blobs[0].BlobID})
		}, ErrBadBlob},
		"role twice": {func(it *Item) {
			it.Blobs = append(it.Blobs, ItemBlob{Role: "original", BlobID: f.addBlob(t, sess.UserID, true)})
		}, ErrBadBlob},
		"blob in use":        {func(it *Item) { it.Blobs[0].BlobID = first.Blobs[0].BlobID }, ErrBlobInUse},
		"same dedupe hash":   {func(it *Item) { it.DedupeHash = first.DedupeHash }, ErrAlreadyStored},
		"same id":            {func(it *Item) { it.ID = first.ID }, store.ErrIDTaken},
		"unknown collection": {func(it *Item) { it.CollectionID = newID() }, store.ErrNotFound},
		"their collection":   {func(it *Item) { it.CollectionID = f.album(t, other.UserID) }, store.ErrNotFound},
	}
	for name, c := range cases {
		it := f.newItem(t, sess, col)
		c.edit(&it)
		if _, err := f.svc.CreateItem(ctx, sess, it); !errors.Is(err, c.want) {
			t.Errorf("%s: %v, want %v", name, err, c.want)
		}
	}
	// Nothing half-created by the rejected attempts.
	var n int
	_ = f.db.DB().QueryRow("SELECT COUNT(*) FROM items").Scan(&n)
	if n != 1 {
		t.Errorf("items = %d, want 1", n)
	}
	// Another user may store the same content (dedupe is per user).
	theirs := f.newItem(t, other, f.album(t, other.UserID))
	theirs.DedupeHash = first.DedupeHash
	if _, err := f.svc.CreateItem(ctx, other, theirs); err != nil {
		t.Errorf("same dedupe hash for another user: %v", err)
	}
}

func TestMoveNeedsRewrap(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	sess := f.addSession(t)
	a, b := f.album(t, sess.UserID), f.album(t, sess.UserID)
	it, err := f.svc.CreateItem(ctx, sess, f.newItem(t, sess, a))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.UpdateItem(ctx, sess.UserID, it.ID, ItemPatch{CollectionID: &b}); !errors.Is(err, ErrRewrapRequired) {
		t.Fatalf("move without key: %v, want ErrRewrapRequired", err)
	}
	key := randBytes(72)
	moved, err := f.svc.UpdateItem(ctx, sess.UserID, it.ID, ItemPatch{CollectionID: &b, FileKeyEnc: key})
	if err != nil || moved.CollectionID != b || !bytes.Equal(moved.FileKeyEnc, key) || moved.Seq <= it.Seq {
		t.Fatalf("move = %+v, %v", moved, err)
	}
	meta := randBytes(80)
	edited, err := f.svc.UpdateItem(ctx, sess.UserID, it.ID, ItemPatch{MetadataEnc: meta})
	if err != nil || !bytes.Equal(edited.MetadataEnc, meta) || edited.Seq <= moved.Seq || edited.CollectionID != b {
		t.Errorf("metadata edit = %+v, %v", edited, err)
	}
	// "Moving" to the current collection needs no new key.
	if _, err := f.svc.UpdateItem(ctx, sess.UserID, it.ID, ItemPatch{CollectionID: &b}); err != nil {
		t.Errorf("same collection: %v", err)
	}
	other := f.addSession(t)
	if _, err := f.svc.UpdateItem(ctx, other.UserID, it.ID, ItemPatch{MetadataEnc: meta}); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("other user's item: %v, want ErrNotFound", err)
	}
	if _, err := f.svc.UpdateItem(ctx, sess.UserID, it.ID, ItemPatch{CollectionID: ptr(f.album(t, other.UserID)), FileKeyEnc: key}); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("move into their collection: %v, want ErrNotFound", err)
	}
}

func TestLookup(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	sess := f.addSession(t)
	col := f.album(t, sess.UserID)
	kept, _ := f.svc.CreateItem(ctx, sess, f.newItem(t, sess, col))
	trashed, _ := f.svc.CreateItem(ctx, sess, f.newItem(t, sess, col))
	if _, err := f.db.DB().Exec("UPDATE items SET trashed_at = 5 WHERE id = ?", trashed.ID); err != nil {
		t.Fatal(err)
	}
	missing := newID() + newID()
	got, err := f.svc.Lookup(ctx, sess.UserID, []string{kept.DedupeHash, missing, trashed.DedupeHash})
	if err != nil || len(got) != 2 {
		t.Fatalf("Lookup = %+v, %v", got, err)
	}
	by := map[string]LookupResult{}
	for _, r := range got {
		by[r.DedupeHash] = r
	}
	if r := by[kept.DedupeHash]; r.ItemID != kept.ID || r.State != "verified" || r.Trashed {
		t.Errorf("kept = %+v", r)
	}
	if r := by[trashed.DedupeHash]; r.ItemID != trashed.ID || !r.Trashed {
		t.Errorf("trashed = %+v", r)
	}
	other := f.addSession(t)
	if got, _ := f.svc.Lookup(ctx, other.UserID, []string{kept.DedupeHash}); len(got) != 0 {
		t.Errorf("other user found %v", got)
	}
	tooMany := make([]string, 1001)
	for i := range tooMany {
		tooMany[i] = missing
	}
	if _, err := f.svc.Lookup(ctx, sess.UserID, tooMany); !errors.Is(err, ErrTooManyHashes) {
		t.Errorf("1001 hashes: %v, want ErrTooManyHashes", err)
	}
}

func TestChangesPaging(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	sess := f.addSession(t)
	col := f.album(t, sess.UserID)
	for range 5 {
		if _, err := f.svc.CreateItem(ctx, sess, f.newItem(t, sess, col)); err != nil {
			t.Fatal(err)
		}
	}
	var cursor int64
	var pages []Changes
	for {
		ch, err := f.svc.Changes(ctx, sess.UserID, cursor, 2)
		if err != nil {
			t.Fatal(err)
		}
		if ch.Cursor <= cursor {
			t.Fatalf("cursor did not advance: %d → %d", cursor, ch.Cursor)
		}
		cursor = ch.Cursor
		pages = append(pages, ch)
		if !ch.More {
			break
		}
	}
	if len(pages) != 3 || len(pages[0].Items) != 2 || len(pages[2].Items) != 1 {
		t.Errorf("pages = %d, sizes %d/%d", len(pages), len(pages[0].Items), len(pages[len(pages)-1].Items))
	}
	if ch, err := f.svc.Changes(ctx, sess.UserID, cursor, 2); err != nil || len(ch.Items) != 0 || ch.More || ch.Cursor != cursor {
		t.Errorf("after the end = %+v, %v", ch, err)
	}
	// Another user's changes are invisible.
	other := f.addSession(t)
	if ch, _ := f.svc.Changes(ctx, other.UserID, 0, 10); len(ch.Items) != 0 {
		t.Errorf("other user sees %d items", len(ch.Items))
	}
}

// A full page that ends on an item must still say More when purges follow.
func TestChangesMoreWhenOnlyPurgesRemain(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	sess := f.addSession(t)
	col := f.album(t, sess.UserID)
	a, _ := f.svc.CreateItem(ctx, sess, f.newItem(t, sess, col))
	b, _ := f.svc.CreateItem(ctx, sess, f.newItem(t, sess, col))
	start, _ := f.svc.Changes(ctx, sess.UserID, 0, 10)
	if _, err := f.svc.UpdateItem(ctx, sess.UserID, b.ID, ItemPatch{MetadataEnc: randBytes(60)}); err != nil {
		t.Fatal(err)
	}
	err := f.db.Tx(ctx, func(tx *sql.Tx) error {
		seq, err := store.NextSeq(ctx, tx)
		if err != nil {
			return err
		}
		if _, err := tx.Exec("DELETE FROM items WHERE id = ?", a.ID); err != nil {
			return err
		}
		_, err = tx.Exec("INSERT INTO tombstones (item_id, owner_id, seq) VALUES (?, ?, ?)", a.ID, sess.UserID, seq)
		return err
	})
	if err != nil {
		t.Fatal(err)
	}
	page, _ := f.svc.Changes(ctx, sess.UserID, start.Cursor, 1)
	if len(page.Items) != 1 || !page.More {
		t.Fatalf("page 1 = %d items, more=%v; want 1 item and more", len(page.Items), page.More)
	}
	page, _ = f.svc.Changes(ctx, sess.UserID, page.Cursor, 1)
	if len(page.Purged) != 1 || page.Purged[0] != a.ID || page.More {
		t.Errorf("page 2 = %+v, want purged [%s] and no more", page, a.ID)
	}
}
