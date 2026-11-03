package blobs

import (
	"bytes"
	"context"
	"errors"
	"os"
	"path/filepath"
	"slices"
	"testing"
	"time"

	"github.com/Bouckley/cloud-box/box/internal/store"
)

// twoParts is 8 MiB + 5 bytes: one full part and a 5-byte last part.
func twoParts() []byte { return randBytes(PartBytes + 5) }

func (f *fixture) count(t *testing.T, table string) int {
	t.Helper()
	var n int
	if err := f.db.DB().QueryRow("SELECT count(*) FROM " + table).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func TestUploadRoundTrip(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	data := twoParts()

	up, err := f.svc.CreateUpload(ctx, f.sess, int64(len(data)), sha(data))
	if err != nil {
		t.Fatal(err)
	}
	if up.PartCount != 2 || up.Size != int64(len(data)) || len(up.ID) != 32 || len(up.Received) != 0 {
		t.Fatalf("upload = %+v", up)
	}
	if got := time.Until(up.ExpiresAt); got < 23*time.Hour || got > UploadTTL {
		t.Errorf("expires in %v, want about %v", got, UploadTTL)
	}

	// Parts in reverse order.
	for _, n := range []int{1, 0} {
		if err := f.svc.PutPart(ctx, f.sess.UserID, up.ID, n, bytes.NewReader(part(data, n))); err != nil {
			t.Fatalf("PutPart %d: %v", n, err)
		}
	}
	got, err := f.svc.GetUpload(ctx, f.sess.UserID, up.ID)
	if err != nil || !slices.Equal(got.Received, []int{0, 1}) {
		t.Fatalf("GetUpload = %+v, %v; want received [0 1]", got, err)
	}

	blob, created, err := f.svc.Complete(ctx, f.sess.UserID, up.ID, "")
	if err != nil || !created {
		t.Fatalf("Complete = %+v, %v, %v", blob, created, err)
	}
	if blob.SHA256 != sha(data) || blob.Size != int64(len(data)) || blob.VerifiedAt == nil || blob.State() != "verified" {
		t.Errorf("blob = %+v", blob)
	}
	onDisk, err := os.ReadFile(BlobPath(f.dir, blob.ID))
	if err != nil || !bytes.Equal(onDisk, data) {
		t.Fatalf("blob file differs from the upload (%v)", err)
	}
	if _, err := os.Stat(filepath.Join(f.dir, "uploads", up.ID)); !os.IsNotExist(err) {
		t.Errorf("upload parts dir still exists (%v)", err)
	}
	if n := f.count(t, "upload_parts"); n != 0 {
		t.Errorf("upload_parts rows = %d, want 0", n)
	}
}

func TestBlobPathShards(t *testing.T) {
	id := "abcdef0123456789abcdef0123456789"
	if got, want := BlobPath("/r", id), filepath.Join("/r", "blobs", "ab", "cd", id); got != want {
		t.Errorf("BlobPath = %q, want %q", got, want)
	}
}

func upload(t *testing.T, f *fixture, data []byte) Upload {
	t.Helper()
	ctx := context.Background()
	up, err := f.svc.CreateUpload(ctx, f.sess, int64(len(data)), sha(data))
	if err != nil {
		t.Fatal(err)
	}
	for n := range up.PartCount {
		if err := f.svc.PutPart(ctx, f.sess.UserID, up.ID, n, bytes.NewReader(part(data, n))); err != nil {
			t.Fatal(err)
		}
	}
	return up
}

func TestCompleteIsIdempotent(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	up := upload(t, f, randBytes(100))
	first, created, err := f.svc.Complete(ctx, f.sess.UserID, up.ID, "")
	if err != nil || !created {
		t.Fatal(err, created)
	}
	again, created, err := f.svc.Complete(ctx, f.sess.UserID, up.ID, "")
	if err != nil || created || again.ID != first.ID {
		t.Fatalf("second Complete = %+v, created=%v, %v; want same blob, created=false", again, created, err)
	}
	if n := f.count(t, "blobs"); n != 1 {
		t.Errorf("blobs rows = %d, want 1", n)
	}
}

func TestPartResentAndWrongSize(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	data := twoParts()
	up, _ := f.svc.CreateUpload(ctx, f.sess, int64(len(data)), sha(data))
	put := func(n int, b []byte) error {
		return f.svc.PutPart(ctx, f.sess.UserID, up.ID, n, bytes.NewReader(b))
	}

	if err := put(0, part(data, 0)); err != nil {
		t.Fatal(err)
	}
	if err := put(0, part(data, 0)); err != nil {
		t.Errorf("re-sending part 0: %v", err)
	}
	for name, b := range map[string][]byte{
		"part 0 one byte short": randBytes(PartBytes - 1),
		"part 0 one byte long":  randBytes(PartBytes + 1),
	} {
		if err := put(0, b); !errors.Is(err, ErrBadPart) {
			t.Errorf("%s: %v, want ErrBadPart", name, err)
		}
	}
	if err := put(1, randBytes(4)); !errors.Is(err, ErrBadPart) {
		t.Errorf("last part wrong size: %v", err)
	}
	for _, n := range []int{2, -1} {
		if err := put(n, randBytes(5)); !errors.Is(err, ErrBadPart) {
			t.Errorf("part %d: %v, want ErrBadPart", n, err)
		}
	}
	// A rejected re-send may have overwritten part 0's bytes, so part 0 is
	// no longer received: the box never counts damaged bytes as received.
	got, _ := f.svc.GetUpload(ctx, f.sess.UserID, up.ID)
	if len(got.Received) != 0 {
		t.Errorf("received = %v, want none (a failed re-send un-receives the part)", got.Received)
	}
	if _, _, err := f.svc.Complete(ctx, f.sess.UserID, up.ID, ""); !errors.Is(err, ErrUploadIncomplete) {
		t.Errorf("Complete after rejected parts = %v, want ErrUploadIncomplete", err)
	}

	// Re-sending the good parts completes the upload.
	for n := range 2 {
		if err := put(n, part(data, n)); err != nil {
			t.Fatal(err)
		}
	}
	if blob, _, err := f.svc.Complete(ctx, f.sess.UserID, up.ID, ""); err != nil || blob.SHA256 != sha(data) {
		t.Fatalf("Complete after re-sending = %+v, %v", blob, err)
	}
}

func TestCompleteMissingPart(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	data := twoParts()
	up, _ := f.svc.CreateUpload(ctx, f.sess, int64(len(data)), sha(data))
	_ = f.svc.PutPart(ctx, f.sess.UserID, up.ID, 1, bytes.NewReader(part(data, 1)))
	if _, _, err := f.svc.Complete(ctx, f.sess.UserID, up.ID, ""); !errors.Is(err, ErrUploadIncomplete) {
		t.Fatalf("Complete with part 0 missing: %v, want ErrUploadIncomplete", err)
	}
}

func TestHashMismatch(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	data := randBytes(1000)
	up, _ := f.svc.CreateUpload(ctx, f.sess, int64(len(data)), sha(randBytes(10)))
	_ = f.svc.PutPart(ctx, f.sess.UserID, up.ID, 0, bytes.NewReader(data))

	if _, _, err := f.svc.Complete(ctx, f.sess.UserID, up.ID, ""); !errors.Is(err, ErrHashMismatch) {
		t.Fatalf("Complete: %v, want ErrHashMismatch", err)
	}
	if n := f.count(t, "blobs"); n != 0 {
		t.Errorf("blobs rows = %d, want 0", n)
	}
	if entries, _ := os.ReadDir(filepath.Join(f.dir, "blobs")); len(entries) != 0 {
		t.Errorf("blob files written: %v", entries)
	}
	if entries, _ := os.ReadDir(filepath.Join(f.dir, "tmp")); len(entries) != 0 {
		t.Errorf("tmp files left: %v", entries)
	}
	got, err := f.svc.GetUpload(ctx, f.sess.UserID, up.ID)
	if err != nil || len(got.Received) != 0 {
		t.Errorf("after mismatch received = %v (%v), want none: parts must be re-sent", got.Received, err)
	}
}

func TestStorageFull(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	if err := f.sim.SetFill("main", 100); err != nil {
		t.Fatal(err)
	}
	if _, err := f.svc.CreateUpload(ctx, f.sess, 1000, sha(nil)); !errors.Is(err, ErrStorageFull) {
		t.Errorf("full drive: %v, want ErrStorageFull", err)
	}
	// 1 TB drive, 10% full → 900 GB free: a blob that leaves less than 1 GiB is refused.
	_ = f.sim.SetFill("main", 10)
	main, _ := f.sim.HAL().Drive(ctx, "main")
	if _, err := f.svc.CreateUpload(ctx, f.sess, int64(main.FreeBytes)-ReserveBytes+1, sha(nil)); !errors.Is(err, ErrStorageFull) {
		t.Errorf("blob eating the reserve: %v, want ErrStorageFull", err)
	}
}

func TestUploadsScopedToUser(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	up := upload(t, f, randBytes(10))
	other := f.addUser(t)
	if _, err := f.svc.GetUpload(ctx, other.UserID, up.ID); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("GetUpload by another user: %v, want ErrNotFound", err)
	}
	if err := f.svc.PutPart(ctx, other.UserID, up.ID, 0, bytes.NewReader(randBytes(10))); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("PutPart by another user: %v", err)
	}
	if _, _, err := f.svc.Complete(ctx, other.UserID, up.ID, ""); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("Complete by another user: %v", err)
	}
}

func TestExpiredUploadIsGone(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	up := upload(t, f, randBytes(10))
	f.sim.Advance(UploadTTL + time.Minute)
	if _, err := f.svc.GetUpload(ctx, f.sess.UserID, up.ID); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("expired upload: %v, want ErrNotFound", err)
	}
	if _, _, err := f.svc.Complete(ctx, f.sess.UserID, up.ID, ""); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("Complete of expired upload: %v", err)
	}
}

func TestPartsAndBlobsArePrivateFiles(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	up := upload(t, f, randBytes(10))
	dataFile := filepath.Join(f.dir, "uploads", up.ID)
	if fi, err := os.Stat(dataFile); err != nil || fi.Mode().Perm() != 0o600 {
		t.Fatalf("upload data file: %v, want mode 0600", err)
	}
	if fi, err := os.Stat(filepath.Join(f.dir, "uploads")); err != nil || fi.Mode().Perm() != 0o700 {
		t.Errorf("uploads dir: %v, want mode 0700", err)
	}
	blob, _, err := f.svc.Complete(ctx, f.sess.UserID, up.ID, "")
	if err != nil {
		t.Fatal(err)
	}
	if fi, err := os.Stat(BlobPath(f.dir, blob.ID)); err != nil || fi.Mode().Perm() != 0o600 {
		t.Errorf("blob file mode = %v (%v), want 0600", fi.Mode().Perm(), err)
	}
}

// Many concurrent Completes of one upload produce exactly one blob.
func TestConcurrentCompletes(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	up := upload(t, f, randBytes(1000))
	ids := make(chan string, 8)
	for range 8 {
		go func() {
			b, _, err := f.svc.Complete(ctx, f.sess.UserID, up.ID, "")
			if err != nil {
				t.Error(err)
			}
			ids <- b.ID
		}()
	}
	first := <-ids
	for range 7 {
		if id := <-ids; id != first {
			t.Errorf("blob ids differ: %s vs %s", id, first)
		}
	}
	if n := f.count(t, "blobs"); n != 1 {
		t.Errorf("blobs rows = %d, want 1", n)
	}
}
