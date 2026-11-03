package blobs

import (
	"bytes"
	"context"
	"errors"
	"testing"
)

// uploadNoHash starts an upload without a hash and sends every part.
func uploadNoHash(t *testing.T, f *fixture, data []byte) Upload {
	t.Helper()
	ctx := context.Background()
	up, err := f.svc.CreateUpload(ctx, f.sess, int64(len(data)), "")
	if err != nil {
		t.Fatal(err)
	}
	if up.SHA256 != "" {
		t.Fatalf("new upload SHA256 = %q, want empty", up.SHA256)
	}
	for n := range up.PartCount {
		if err := f.svc.PutPart(ctx, f.sess.UserID, up.ID, n, bytes.NewReader(part(data, n))); err != nil {
			t.Fatal(err)
		}
	}
	return up
}

func TestHashAtComplete(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	data := twoParts()
	up := uploadNoHash(t, f, data)
	got, err := f.svc.GetUpload(ctx, f.sess.UserID, up.ID)
	if err != nil || got.SHA256 != "" {
		t.Fatalf("GetUpload before complete = %+v, %v; want no hash", got, err)
	}
	b, created, err := f.svc.Complete(ctx, f.sess.UserID, up.ID, sha(data))
	if err != nil || !created {
		t.Fatalf("Complete = %v, created=%v", err, created)
	}
	if b.SHA256 != sha(data) || b.State() != "verified" {
		t.Errorf("blob = %+v state %q, want hash %s and verified", b, b.State(), sha(data))
	}
}

func TestHashNowhere(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	up := uploadNoHash(t, f, randBytes(100))
	if _, _, err := f.svc.Complete(ctx, f.sess.UserID, up.ID, ""); !errors.Is(err, ErrBadRequest) {
		t.Fatalf("Complete with no hash anywhere = %v, want ErrBadRequest", err)
	}
	if n := f.count(t, "upload_parts"); n != 1 {
		t.Errorf("upload_parts = %d, want 1 (nothing discarded)", n)
	}
}

func TestHashConflict(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	data := randBytes(100)
	up := upload(t, f, data)
	if _, _, err := f.svc.Complete(ctx, f.sess.UserID, up.ID, sha([]byte("other"))); !errors.Is(err, ErrBadRequest) {
		t.Fatalf("Complete with a different hash = %v, want ErrBadRequest", err)
	}
	if n := f.count(t, "upload_parts"); n != 1 {
		t.Errorf("upload_parts = %d, want 1 (nothing discarded)", n)
	}
	b, created, err := f.svc.Complete(ctx, f.sess.UserID, up.ID, "")
	if err != nil || !created || b.SHA256 != sha(data) {
		t.Fatalf("Complete with the stored hash afterwards = %+v, %v, %v", b, created, err)
	}
	// The same hash at both ends is fine.
	up2 := upload(t, f, data)
	if _, _, err := f.svc.Complete(ctx, f.sess.UserID, up2.ID, sha(data)); err != nil {
		t.Fatalf("Complete with the same hash = %v", err)
	}
}

func TestHashAtCompleteWrongContent(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	up := uploadNoHash(t, f, twoParts())
	if _, _, err := f.svc.Complete(ctx, f.sess.UserID, up.ID, sha([]byte("other"))); !errors.Is(err, ErrHashMismatch) {
		t.Fatalf("Complete = %v, want ErrHashMismatch", err)
	}
	if n := f.count(t, "upload_parts"); n != 0 {
		t.Errorf("upload_parts = %d, want 0 (parts discarded)", n)
	}
	if got, err := f.svc.GetUpload(ctx, f.sess.UserID, up.ID); err != nil || got.SHA256 != "" {
		t.Errorf("GetUpload after mismatch = %+v, %v; want no hash kept", got, err)
	}
}

func TestCompleteIsIdempotentHashAtComplete(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	data := randBytes(100)
	up := uploadNoHash(t, f, data)
	first, created, err := f.svc.Complete(ctx, f.sess.UserID, up.ID, sha(data))
	if err != nil || !created {
		t.Fatal(err, created)
	}
	for _, h := range []string{sha(data), ""} {
		again, created, err := f.svc.Complete(ctx, f.sess.UserID, up.ID, h)
		if err != nil || created || again.ID != first.ID {
			t.Fatalf("retry with hash %q = %+v, created=%v, %v; want same blob", h, again, created, err)
		}
	}
	if _, _, err := f.svc.Complete(ctx, f.sess.UserID, up.ID, sha([]byte("other"))); !errors.Is(err, ErrBadRequest) {
		t.Errorf("retry with a different hash = %v, want ErrBadRequest", err)
	}
	if n := f.count(t, "blobs"); n != 1 {
		t.Errorf("blobs rows = %d, want 1", n)
	}
}
