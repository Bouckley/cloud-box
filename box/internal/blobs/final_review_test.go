package blobs

import (
	"bytes"
	"context"
	"errors"
	"testing"
	"time"
)

// Final review I-1: a part that is too long is rejected without writing any
// byte past its own range, so neighbouring parts stay intact.
func TestTooLongPartKeepsNeighbours(t *testing.T) {
	for _, tooLong := range []int{0, 1} { // a middle part, then the last part
		f := newFixture(t)
		ctx := context.Background()
		data := randBytes(PartBytes + 100)
		up, err := f.svc.CreateUpload(ctx, f.sess, int64(len(data)), sha(data))
		if err != nil {
			t.Fatal(err)
		}
		put := func(n int, b []byte) error {
			return f.svc.PutPart(ctx, f.sess.UserID, up.ID, n, bytes.NewReader(b))
		}
		other := 1 - tooLong
		if err := put(other, part(data, other)); err != nil {
			t.Fatal(err)
		}
		long := append(append([]byte{}, part(data, tooLong)...), 0xAA)
		if err := put(tooLong, long); !errors.Is(err, ErrBadPart) {
			t.Fatalf("part %d one byte long: %v, want ErrBadPart", tooLong, err)
		}
		if err := put(tooLong, part(data, tooLong)); err != nil {
			t.Fatal(err)
		}
		if b, _, err := f.svc.Complete(ctx, f.sess.UserID, up.ID); err != nil || b.SHA256 != sha(data) {
			t.Errorf("part %d too long, then re-sent: Complete = %v (want the blob)", tooLong, err)
		}
	}
}

// Final review I-2: an upload stays alive while parts keep arriving; it
// expires 24 h after the last activity, not after creation.
func TestUploadExpirySlidesWithActivity(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	data := randBytes(PartBytes + 10)
	up, _ := f.svc.CreateUpload(ctx, f.sess, int64(len(data)), sha(data))
	if err := f.svc.PutPart(ctx, f.sess.UserID, up.ID, 0, bytes.NewReader(part(data, 0))); err != nil {
		t.Fatal(err)
	}
	f.sim.Advance(20 * time.Hour)
	if err := f.svc.PutPart(ctx, f.sess.UserID, up.ID, 1, bytes.NewReader(part(data, 1))); err != nil {
		t.Fatal(err)
	}
	f.sim.Advance(20 * time.Hour) // 40 h after creation, 20 h after the last part
	if _, err := f.svc.CleanupUploads(ctx); err != nil {
		t.Fatal(err)
	}
	got, err := f.svc.GetUpload(ctx, f.sess.UserID, up.ID)
	if err != nil || len(got.Received) != 2 {
		t.Fatalf("GetUpload 20 h after the last part = %+v, %v; want both parts", got, err)
	}
	b, _, err := f.svc.Complete(ctx, f.sess.UserID, up.ID)
	if err != nil {
		t.Fatal(err)
	}
	// A retried complete still finds the blob for 24 h after completing (M-7).
	f.sim.Advance(23 * time.Hour)
	if _, err := f.svc.CleanupUploads(ctx); err != nil {
		t.Fatal(err)
	}
	again, created, err := f.svc.Complete(ctx, f.sess.UserID, up.ID)
	if err != nil || created || again.ID != b.ID {
		t.Errorf("retry 23 h after complete = %+v created=%v, %v; want the same blob", again, created, err)
	}
}
