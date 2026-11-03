package trash

import (
	"context"
	"testing"
	"time"

	"github.com/Bouckley/cloud-box/box/internal/library"
)

// collectionState returns whether the collection row exists, whether it is
// deleted, its seq, and how many key rows it has.
func (f *fixture) collectionState(t *testing.T, id string) (exists, deleted bool, seq int64, keys int) {
	t.Helper()
	var del *int64
	err := f.db.DB().QueryRow("SELECT deleted_at, seq FROM collections WHERE id = ?", id).Scan(&del, &seq)
	if err == nil {
		exists, deleted = true, del != nil
	}
	_ = f.db.DB().QueryRow("SELECT COUNT(*) FROM collection_keys WHERE collection_id = ?", id).Scan(&keys)
	return
}

func (f *fixture) folder(t *testing.T, parent *string) string {
	t.Helper()
	c, err := f.lib.CreateCollection(context.Background(), f.sess.UserID, library.Collection{
		ID: newID(), Kind: "folder", ParentID: parent, NameEnc: randBytes(50), KeyEnc: randBytes(72)})
	if err != nil {
		t.Fatal(err)
	}
	return c.ID
}

func TestRestoreUndeletesCollection(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	parent := f.folder(t, nil)
	child := f.folder(t, &parent)
	it := f.item(t, f.sess, child)
	if err := f.svc.Trash(ctx, f.sess.UserID, it.ID); err != nil {
		t.Fatal(err)
	}
	for _, id := range []string{child, parent} {
		if err := f.lib.DeleteCollection(ctx, f.sess.UserID, id); err != nil {
			t.Fatal(err)
		}
	}
	_, _, childSeq, _ := f.collectionState(t, child)
	_, _, parentSeq, _ := f.collectionState(t, parent)
	if err := f.svc.Restore(ctx, f.sess.UserID, it.ID); err != nil {
		t.Fatal(err)
	}
	for id, was := range map[string]int64{child: childSeq, parent: parentSeq} {
		exists, deleted, seq, _ := f.collectionState(t, id)
		if !exists || deleted || seq <= was {
			t.Errorf("collection %s after restore: exists %v deleted %v seq %d (was %d)", id, exists, deleted, seq, was)
		}
	}
}

func TestPurgeRemovesDeletedCollection(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	parent := f.folder(t, nil)
	child := f.folder(t, &parent)
	keep := f.folder(t, nil) // empty but not deleted: never removed
	a, b := f.item(t, f.sess, child), f.item(t, f.sess, child)
	for _, id := range []string{a.ID, b.ID} {
		if err := f.svc.Trash(ctx, f.sess.UserID, id); err != nil {
			t.Fatal(err)
		}
	}
	for _, id := range []string{child, parent} {
		if err := f.lib.DeleteCollection(ctx, f.sess.UserID, id); err != nil {
			t.Fatal(err)
		}
	}
	// One trashed item left: the collection must stay, its key still needed.
	if err := f.svc.Delete(ctx, f.sess.UserID, a.ID); err != nil {
		t.Fatal(err)
	}
	if exists, _, _, keys := f.collectionState(t, child); !exists || keys != 1 {
		t.Fatalf("child after first delete: exists %v keys %d, want kept", exists, keys)
	}
	// The last one goes by purge: child, then its deleted parent, go too.
	f.sim.Advance(Retention + time.Minute)
	if n, err := f.svc.Purge(ctx); err != nil || n != 1 {
		t.Fatalf("Purge = %d, %v; want 1", n, err)
	}
	for _, id := range []string{child, parent} {
		if exists, _, _, keys := f.collectionState(t, id); exists || keys != 0 {
			t.Errorf("collection %s after purge: exists %v keys %d, want gone", id, exists, keys)
		}
	}
	for _, id := range []string{keep, f.col} {
		if exists, _, _, keys := f.collectionState(t, id); !exists || keys != 1 {
			t.Errorf("undeleted collection %s removed (exists %v keys %d)", id, exists, keys)
		}
	}
}
