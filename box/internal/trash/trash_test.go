package trash

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"testing"
	"time"

	"github.com/Bouckley/cloud-box/box/internal/auth"
	"github.com/Bouckley/cloud-box/box/internal/blobs"
	"github.com/Bouckley/cloud-box/box/internal/hal"
	"github.com/Bouckley/cloud-box/box/internal/hal/sim"
	"github.com/Bouckley/cloud-box/box/internal/library"
	"github.com/Bouckley/cloud-box/box/internal/store"
)

type fixture struct {
	svc   *Service
	lib   *library.Service
	blobs *blobs.Service
	db    *store.Store
	sim   *sim.Sim
	dir   string
	sess  auth.Session
	col   string
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
	b := blobs.New(db, s.HAL())
	f := &fixture{svc: New(db, s.HAL(), b), lib: library.New(db, s.HAL().Clock), blobs: b, db: db, sim: s, dir: dir}
	f.sess, f.col = f.addUser(t)
	return f
}

func (f *fixture) addUser(t *testing.T) (auth.Session, string) {
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
	c, err := f.lib.CreateCollection(context.Background(), sess.UserID, library.Collection{
		ID: newID(), Kind: "album", NameEnc: randBytes(50), KeyEnc: randBytes(72)})
	if err != nil {
		t.Fatal(err)
	}
	return sess, c.ID
}

// upload stores data as a real blob and returns its id.
func (f *fixture) upload(t *testing.T, sess auth.Session, data []byte) string {
	t.Helper()
	ctx := context.Background()
	sum := sha256.Sum256(data)
	up, err := f.blobs.CreateUpload(ctx, sess, int64(len(data)), hex.EncodeToString(sum[:]))
	if err != nil {
		t.Fatal(err)
	}
	if err := f.blobs.PutPart(ctx, sess.UserID, up.ID, 0, bytes.NewReader(data)); err != nil {
		t.Fatal(err)
	}
	b, _, err := f.blobs.Complete(ctx, sess.UserID, up.ID, "")
	if err != nil {
		t.Fatal(err)
	}
	return b.ID
}

// item creates an item with an original and a thumb.
func (f *fixture) item(t *testing.T, sess auth.Session, col string) library.Item {
	t.Helper()
	it, err := f.lib.CreateItem(context.Background(), sess, library.Item{
		ID: newID(), CollectionID: col, FileKeyEnc: randBytes(72), MetadataEnc: randBytes(60),
		DedupeHash: newID() + newID(),
		Blobs: []library.ItemBlob{
			{Role: "original", BlobID: f.upload(t, sess, randBytes(300))},
			{Role: "thumb", BlobID: f.upload(t, sess, randBytes(30))},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	return it
}

func (f *fixture) backupRoot(t *testing.T) string {
	t.Helper()
	d, err := f.sim.HAL().Drive(context.Background(), hal.RoleBackup)
	if err != nil {
		t.Fatal(err)
	}
	return d.Path
}

func randBytes(n int) []byte {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return b
}

func newID() string { return hex.EncodeToString(randBytes(16)) }

func (f *fixture) seq(t *testing.T, id string) (int64, bool) {
	t.Helper()
	var seq int64
	var trashed *int64
	if err := f.db.DB().QueryRow("SELECT seq, trashed_at FROM items WHERE id = ?", id).Scan(&seq, &trashed); err != nil {
		t.Fatal(err)
	}
	return seq, trashed != nil
}

func TestTrashAndRestore(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	it := f.item(t, f.sess, f.col)
	if err := f.svc.Trash(ctx, f.sess.UserID, it.ID); err != nil {
		t.Fatal(err)
	}
	seq1, trashed := f.seq(t, it.ID)
	if !trashed || seq1 <= it.Seq {
		t.Fatalf("after trash: seq %d (was %d), trashed %v", seq1, it.Seq, trashed)
	}
	ch, _ := f.lib.Changes(ctx, f.sess.UserID, it.Seq, 10)
	if len(ch.Items) != 1 || ch.Items[0].TrashedAt == nil {
		t.Errorf("trashed item must sync with trashedAt: %+v", ch.Items)
	}
	// Trashing twice is a no-op.
	if err := f.svc.Trash(ctx, f.sess.UserID, it.ID); err != nil {
		t.Fatal(err)
	}
	if again, _ := f.seq(t, it.ID); again != seq1 {
		t.Errorf("second trash changed seq %d → %d", seq1, again)
	}
	if err := f.svc.Restore(ctx, f.sess.UserID, it.ID); err != nil {
		t.Fatal(err)
	}
	seq2, trashed := f.seq(t, it.ID)
	if trashed || seq2 <= seq1 {
		t.Errorf("after restore: seq %d (was %d), trashed %v", seq2, seq1, trashed)
	}
	// Restoring a live item is a no-op too.
	if err := f.svc.Restore(ctx, f.sess.UserID, it.ID); err != nil {
		t.Fatal(err)
	}
	if again, _ := f.seq(t, it.ID); again != seq2 {
		t.Errorf("restore of a live item changed seq")
	}
}

func TestDeleteOnlyFromTrash(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	it := f.item(t, f.sess, f.col)
	keep := f.item(t, f.sess, f.col)
	if err := f.svc.Delete(ctx, f.sess.UserID, it.ID); !errors.Is(err, ErrNotInTrash) {
		t.Fatalf("delete live item: %v, want ErrNotInTrash", err)
	}

	// Put a backup copy of each blob in place (Task 14 does this for real).
	backup := f.backupRoot(t)
	for _, b := range it.Blobs {
		p := blobs.BlobPath(backup, b.BlobID)
		_ = os.MkdirAll(filepath.Dir(p), 0o700)
		if err := os.WriteFile(p, []byte("copy"), 0o600); err != nil {
			t.Fatal(err)
		}
		if _, err := f.db.DB().Exec("INSERT INTO replicas (blob_id, target, copied_at, verified_at) VALUES (?, 'backup', 1, 1)", b.BlobID); err != nil {
			t.Fatal(err)
		}
	}
	before, _ := f.lib.Changes(ctx, f.sess.UserID, 0, 100)

	if err := f.svc.Trash(ctx, f.sess.UserID, it.ID); err != nil {
		t.Fatal(err)
	}
	if err := f.svc.Delete(ctx, f.sess.UserID, it.ID); err != nil {
		t.Fatal(err)
	}
	for _, b := range it.Blobs {
		for _, root := range []string{f.dir, backup} {
			if _, err := os.Stat(blobs.BlobPath(root, b.BlobID)); !errors.Is(err, os.ErrNotExist) {
				t.Errorf("blob file %s under %s still there (%v)", b.BlobID, root, err)
			}
		}
	}
	for table, n := range map[string]int{"items": 1, "item_blobs": 2, "blobs": 2, "replicas": 0, "tombstones": 1} {
		var got int
		_ = f.db.DB().QueryRow("SELECT COUNT(*) FROM " + table).Scan(&got)
		if got != n {
			t.Errorf("%s rows = %d, want %d", table, got, n)
		}
	}
	// The kept item's files are untouched.
	if _, err := os.Stat(blobs.BlobPath(f.dir, keep.Blobs[0].BlobID)); err != nil {
		t.Errorf("kept item's blob: %v", err)
	}
	ch, _ := f.lib.Changes(ctx, f.sess.UserID, before.Cursor, 100)
	if !slices.Contains(ch.Purged, it.ID) {
		t.Errorf("purged = %v, want %s", ch.Purged, it.ID)
	}
	if err := f.svc.Delete(ctx, f.sess.UserID, it.ID); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("delete again: %v, want ErrNotFound", err)
	}
}

func TestDaysLeft(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	it := f.item(t, f.sess, f.col)
	_ = f.item(t, f.sess, f.col) // live: not listed
	if err := f.svc.Trash(ctx, f.sess.UserID, it.ID); err != nil {
		t.Fatal(err)
	}
	days := func() int {
		list, err := f.svc.List(ctx, f.sess.UserID)
		if err != nil || len(list) != 1 || list[0].ItemID != it.ID {
			t.Fatalf("List = %+v, %v", list, err)
		}
		return list[0].DaysLeft
	}
	if d := days(); d != 30 {
		t.Errorf("just trashed: %d days, want 30", d)
	}
	f.sim.Advance(29*24*time.Hour + time.Hour)
	if d := days(); d != 1 {
		t.Errorf("after 29 days 1 hour: %d, want 1", d)
	}
	f.sim.Advance(5 * 24 * time.Hour)
	if d := days(); d != 0 {
		t.Errorf("overdue: %d, want 0", d)
	}
}

func TestPurgeAfter30Days(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	a, b, live := f.item(t, f.sess, f.col), f.item(t, f.sess, f.col), f.item(t, f.sess, f.col)
	if err := f.svc.Trash(ctx, f.sess.UserID, a.ID); err != nil {
		t.Fatal(err)
	}
	f.sim.Advance(2 * 24 * time.Hour)
	if err := f.svc.Trash(ctx, f.sess.UserID, b.ID); err != nil {
		t.Fatal(err)
	}
	f.sim.Advance(28*24*time.Hour + time.Minute)
	n, err := f.svc.Purge(ctx)
	if err != nil || n != 1 {
		t.Fatalf("Purge = %d, %v; want 1", n, err)
	}
	for id, want := range map[string]bool{a.ID: false, b.ID: true, live.ID: true} {
		var c int
		_ = f.db.DB().QueryRow("SELECT COUNT(*) FROM items WHERE id = ?", id).Scan(&c)
		if (c == 1) != want {
			t.Errorf("item %s present = %v, want %v", id, c == 1, want)
		}
	}
	if _, err := os.Stat(blobs.BlobPath(f.dir, a.Blobs[0].BlobID)); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("purged item's blob file still there: %v", err)
	}
	if n, _ := f.svc.Purge(ctx); n != 0 {
		t.Errorf("second Purge = %d, want 0", n)
	}
}

func TestTrashOtherUser(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	other, col := f.addUser(t)
	theirs := f.item(t, other, col)
	for name, fn := range map[string]func() error{
		"trash":   func() error { return f.svc.Trash(ctx, f.sess.UserID, theirs.ID) },
		"restore": func() error { return f.svc.Restore(ctx, f.sess.UserID, theirs.ID) },
		"delete":  func() error { return f.svc.Delete(ctx, f.sess.UserID, theirs.ID) },
	} {
		if err := fn(); !errors.Is(err, store.ErrNotFound) {
			t.Errorf("%s: %v, want ErrNotFound", name, err)
		}
	}
	if _, trashed := f.seq(t, theirs.ID); trashed {
		t.Error("their item was trashed")
	}
	if list, _ := f.svc.List(ctx, f.sess.UserID); len(list) != 0 {
		t.Errorf("List = %v", list)
	}
}
