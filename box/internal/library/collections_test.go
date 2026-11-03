package library

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"errors"
	"path/filepath"
	"testing"

	"github.com/Bouckley/cloud-box/box/internal/hal/sim"
	"github.com/Bouckley/cloud-box/box/internal/store"
)

type fixture struct {
	svc *Service
	db  *store.Store
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	dir := filepath.Join(t.TempDir(), "with space")
	db, err := store.Open(context.Background(), filepath.Join(dir, "db", "box.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	return &fixture{svc: New(db, sim.New(dir).HAL().Clock), db: db}
}

// addUser inserts a user directly (setup is auth's job) and returns its id.
func (f *fixture) addUser(t *testing.T) string {
	t.Helper()
	return f.addUserTB(t)
}

func (f *fixture) addUserTB(t testing.TB) string {
	t.Helper()
	id := newID()
	if _, err := f.db.DB().Exec(`INSERT INTO users (id, role, kdf_salt, kdf_ops, kdf_mem, master_key_password,
		master_key_recovery, identity_public_key, identity_key_enc, dedupe_key_enc, created_at)
		VALUES (?, 'owner', x'00', 2, 1, x'00', x'00', x'00', x'00', x'00', 0)`, id); err != nil {
		t.Fatal(err)
	}
	return id
}

func randBytes(n int) []byte {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return b
}

func newID() string { return hex.EncodeToString(randBytes(16)) }

func ptr(s string) *string { return &s }

func (f *fixture) create(t *testing.T, user, kind string, parent *string) Collection {
	t.Helper()
	c, err := f.svc.CreateCollection(context.Background(), user, Collection{
		ID: newID(), Kind: kind, ParentID: parent, NameEnc: randBytes(50), KeyEnc: randBytes(72),
	})
	if err != nil {
		t.Fatalf("create %s: %v", kind, err)
	}
	return c
}

func TestCreateAndList(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	user := f.addUser(t)
	album := Collection{ID: newID(), Kind: "album", NameEnc: randBytes(50), KeyEnc: randBytes(72)}
	got, err := f.svc.CreateCollection(ctx, user, album)
	if err != nil {
		t.Fatal(err)
	}
	if got.Seq == 0 || !bytes.Equal(got.KeyEnc, album.KeyEnc) {
		t.Errorf("created = %+v, want seq set and keyEnc echoed", got)
	}
	folder := f.create(t, user, "folder", nil)
	sub := f.create(t, user, "folder", &folder.ID)

	list, err := f.svc.Collections(ctx, user)
	if err != nil || len(list) != 3 {
		t.Fatalf("Collections = %d (%v), want 3", len(list), err)
	}
	byID := map[string]Collection{}
	for _, c := range list {
		byID[c.ID] = c
	}
	if c := byID[album.ID]; c.Kind != "album" || c.ParentID != nil ||
		!bytes.Equal(c.KeyEnc, album.KeyEnc) || !bytes.Equal(c.NameEnc, album.NameEnc) {
		t.Errorf("album = %+v", c)
	}
	if c := byID[sub.ID]; c.ParentID == nil || *c.ParentID != folder.ID {
		t.Errorf("sub parent = %v, want %s", c.ParentID, folder.ID)
	}

	if _, err := f.svc.CreateCollection(ctx, user, album); !errors.Is(err, store.ErrIDTaken) {
		t.Errorf("duplicate id: %v, want ErrIDTaken", err)
	}
	// Another user's id is taken too, and they see nothing of ours.
	other := f.addUser(t)
	if _, err := f.svc.CreateCollection(ctx, other, album); !errors.Is(err, store.ErrIDTaken) {
		t.Errorf("duplicate id by another user: %v, want ErrIDTaken", err)
	}
	if list, _ := f.svc.Collections(ctx, other); len(list) != 0 {
		t.Errorf("other user sees %d collections, want 0", len(list))
	}
}

func TestParentRules(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	user, other := f.addUser(t), f.addUser(t)
	album := f.create(t, user, "album", nil)
	folder := f.create(t, user, "folder", nil)
	theirs := f.create(t, other, "folder", nil)

	cases := map[string]Collection{
		"album with a parent":     {Kind: "album", ParentID: &folder.ID},
		"folder under an album":   {Kind: "folder", ParentID: &album.ID},
		"folder under theirs":     {Kind: "folder", ParentID: &theirs.ID},
		"folder under unknown id": {Kind: "folder", ParentID: ptr(newID())},
	}
	for name, c := range cases {
		c.ID, c.NameEnc, c.KeyEnc = newID(), randBytes(50), randBytes(72)
		if _, err := f.svc.CreateCollection(ctx, user, c); !errors.Is(err, ErrInvalidParent) {
			t.Errorf("%s: %v, want ErrInvalidParent", name, err)
		}
	}
	// Moving follows the same rules.
	if _, err := f.svc.UpdateCollection(ctx, user, album.ID, nil, ptrPtr(&folder.ID)); !errors.Is(err, ErrInvalidParent) {
		t.Errorf("move album under folder: %v, want ErrInvalidParent", err)
	}
	if _, err := f.svc.UpdateCollection(ctx, user, folder.ID, nil, ptrPtr(&theirs.ID)); !errors.Is(err, ErrInvalidParent) {
		t.Errorf("move under their folder: %v, want ErrInvalidParent", err)
	}
	if _, err := f.svc.UpdateCollection(ctx, user, folder.ID, nil, ptrPtr(&folder.ID)); !errors.Is(err, ErrInvalidParent) {
		t.Errorf("move under itself: %v, want ErrInvalidParent", err)
	}
	// Someone else's collection is not found, never forbidden.
	if _, err := f.svc.UpdateCollection(ctx, user, theirs.ID, randBytes(50), nil); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("rename theirs: %v, want ErrNotFound", err)
	}
}

func ptrPtr(p *string) **string { return &p }

func TestMoveCycle(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	user := f.addUser(t)
	a := f.create(t, user, "folder", nil)
	b := f.create(t, user, "folder", &a.ID)
	c := f.create(t, user, "folder", &b.ID)

	if _, err := f.svc.UpdateCollection(ctx, user, a.ID, nil, ptrPtr(&c.ID)); !errors.Is(err, ErrInvalidParent) {
		t.Fatalf("move A under C: %v, want ErrInvalidParent", err)
	}
	var root *string
	moved, err := f.svc.UpdateCollection(ctx, user, c.ID, nil, &root)
	if err != nil || moved.ParentID != nil {
		t.Fatalf("move C to root = %+v, %v", moved, err)
	}
	// Now A under C is fine.
	if _, err := f.svc.UpdateCollection(ctx, user, a.ID, nil, ptrPtr(&c.ID)); err != nil {
		t.Errorf("move A under C after C left: %v", err)
	}
}

func TestRenameBumpsSeq(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	user := f.addUser(t)
	c := f.create(t, user, "album", nil)
	name := randBytes(60)
	got, err := f.svc.UpdateCollection(ctx, user, c.ID, name, nil)
	if err != nil {
		t.Fatal(err)
	}
	if got.Seq <= c.Seq || !bytes.Equal(got.NameEnc, name) || !bytes.Equal(got.KeyEnc, c.KeyEnc) {
		t.Errorf("renamed = %+v (seq before %d)", got, c.Seq)
	}
	list, _ := f.svc.Collections(ctx, user)
	if len(list) != 1 || !bytes.Equal(list[0].NameEnc, name) || list[0].Seq != got.Seq {
		t.Errorf("listed after rename = %+v", list)
	}
}
