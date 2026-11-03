package library

import (
	"context"
	"errors"
	"testing"

	"github.com/Bouckley/cloud-box/box/internal/store"
)

// collection returns the user's collection id from the list, or fails.
func (f *fixture) listed(t *testing.T, user, id string) Collection {
	t.Helper()
	list, err := f.svc.Collections(context.Background(), user)
	if err != nil {
		t.Fatal(err)
	}
	for _, c := range list {
		if c.ID == id {
			return c
		}
	}
	t.Fatalf("collection %s not listed", id)
	return Collection{}
}

func (f *fixture) trashItem(t *testing.T, id string) {
	t.Helper()
	if _, err := f.db.DB().Exec("UPDATE items SET trashed_at = 1 WHERE id = ?", id); err != nil {
		t.Fatal(err)
	}
}

func TestDeleteEmptyCollection(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	user := f.addUser(t)
	c := f.create(t, user, "album", nil)
	if err := f.svc.DeleteCollection(ctx, user, c.ID); err != nil {
		t.Fatal(err)
	}
	got := f.listed(t, user, c.ID)
	if got.DeletedAt == nil || got.Seq <= c.Seq {
		t.Errorf("after delete = %+v, want deletedAt set and a new seq", got)
	}
	// Deleting again is a no-op.
	if err := f.svc.DeleteCollection(ctx, user, c.ID); err != nil {
		t.Errorf("second delete: %v", err)
	}
	if again := f.listed(t, user, c.ID); again.Seq != got.Seq {
		t.Errorf("second delete changed seq %d → %d", got.Seq, again.Seq)
	}
}

func TestDeleteCollectionWithItems(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	sess := f.addSession(t)
	c := f.album(t, sess.UserID)
	if _, err := f.svc.CreateItem(ctx, sess, f.newItem(t, sess, c)); err != nil {
		t.Fatal(err)
	}
	if err := f.svc.DeleteCollection(ctx, sess.UserID, c); !errors.Is(err, ErrCollectionNotEmpty) {
		t.Fatalf("delete with an item = %v, want ErrCollectionNotEmpty", err)
	}
	if got := f.listed(t, sess.UserID, c); got.DeletedAt != nil {
		t.Errorf("deletedAt set after a refused delete")
	}
}

func TestDeleteCollectionWithOnlyTrashedItems(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	sess := f.addSession(t)
	c := f.album(t, sess.UserID)
	it, err := f.svc.CreateItem(ctx, sess, f.newItem(t, sess, c))
	if err != nil {
		t.Fatal(err)
	}
	f.trashItem(t, it.ID)
	if err := f.svc.DeleteCollection(ctx, sess.UserID, c); err != nil {
		t.Fatalf("delete with only trashed items = %v", err)
	}
	if got := f.listed(t, sess.UserID, c); got.DeletedAt == nil || len(got.KeyEnc) == 0 {
		t.Errorf("deleted collection = %+v, want listed with deletedAt and its key", got)
	}
}

func TestDeleteCollectionWithChild(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	user := f.addUser(t)
	parent := f.create(t, user, "folder", nil)
	child := f.create(t, user, "folder", &parent.ID)
	if err := f.svc.DeleteCollection(ctx, user, parent.ID); !errors.Is(err, ErrCollectionNotEmpty) {
		t.Fatalf("delete with a child = %v, want ErrCollectionNotEmpty", err)
	}
	if err := f.svc.DeleteCollection(ctx, user, child.ID); err != nil {
		t.Fatal(err)
	}
	if err := f.svc.DeleteCollection(ctx, user, parent.ID); err != nil {
		t.Fatalf("delete after the child was deleted = %v", err)
	}
}

func TestMoveIntoDeletedCollection(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	sess := f.addSession(t)
	live, gone := f.album(t, sess.UserID), f.album(t, sess.UserID)
	if err := f.svc.DeleteCollection(ctx, sess.UserID, gone); err != nil {
		t.Fatal(err)
	}
	it, err := f.svc.CreateItem(ctx, sess, f.newItem(t, sess, live))
	if err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.UpdateItem(ctx, sess.UserID, it.ID, ItemPatch{CollectionID: &gone, FileKeyEnc: randBytes(72)}); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("move into a deleted collection = %v, want ErrNotFound", err)
	}
	if _, err := f.svc.CreateItem(ctx, sess, f.newItem(t, sess, gone)); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("create in a deleted collection = %v, want ErrNotFound", err)
	}
	folder := f.create(t, sess.UserID, "folder", nil)
	if err := f.svc.DeleteCollection(ctx, sess.UserID, folder.ID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CreateCollection(ctx, sess.UserID, Collection{
		ID: newID(), Kind: "folder", ParentID: &folder.ID, NameEnc: randBytes(50), KeyEnc: randBytes(72),
	}); !errors.Is(err, ErrInvalidParent) {
		t.Errorf("create under a deleted folder = %v, want ErrInvalidParent", err)
	}
	sub := f.create(t, sess.UserID, "folder", nil)
	if _, err := f.svc.UpdateCollection(ctx, sess.UserID, sub.ID, nil, ptrPtr(&folder.ID)); !errors.Is(err, ErrInvalidParent) {
		t.Errorf("move under a deleted folder = %v, want ErrInvalidParent", err)
	}
}

func TestDeleteOtherUsersCollection(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	owner, other := f.addUser(t), f.addUser(t)
	c := f.create(t, owner, "album", nil)
	if err := f.svc.DeleteCollection(ctx, other, c.ID); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("delete another user's collection = %v, want ErrNotFound", err)
	}
	if err := f.svc.DeleteCollection(ctx, owner, newID()); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("delete a missing collection = %v, want ErrNotFound", err)
	}
	if got := f.listed(t, owner, c.ID); got.DeletedAt != nil {
		t.Errorf("another user deleted it")
	}
}
