package blobs

import (
	"context"
	"errors"
	"io"
	"testing"

	"github.com/Bouckley/cloud-box/box/internal/store"
)

func TestOpenBlob(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	data := randBytes(1234)
	up := upload(t, f, data)
	b, _, err := f.svc.Complete(ctx, f.sess.UserID, up.ID, "")
	if err != nil {
		t.Fatal(err)
	}

	file, meta, err := f.svc.Open(ctx, f.sess.UserID, b.ID)
	if err != nil {
		t.Fatal(err)
	}
	defer file.Close()
	got, _ := io.ReadAll(file)
	if string(got) != string(data) || meta.SHA256 != sha(data) || meta.Size != 1234 {
		t.Errorf("Open returned %d bytes, meta %+v", len(got), meta)
	}

	other := f.addUser(t)
	if _, _, err := f.svc.Open(ctx, other.UserID, b.ID); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("other user: %v, want ErrNotFound", err)
	}
	if _, _, err := f.svc.Open(ctx, f.sess.UserID, newID()); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("unknown blob: %v, want ErrNotFound", err)
	}
}
