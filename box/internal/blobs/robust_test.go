package blobs

import (
	"bytes"
	"context"
	"errors"
	"io/fs"
	"os"
	"path/filepath"
	"slices"
	"sync"
	"syscall"
	"testing"
)

// I-1: a client that gives up (cancelled request) must not leave an orphan
// blob file behind; the upload completes anyway.
func TestCompleteSurvivesCancelledContext(t *testing.T) {
	f := newFixture(t)
	data := randBytes(3000)
	up := upload(t, f, data)
	ctx, cancel := context.WithCancel(context.Background())
	cancel()

	b, created, err := f.svc.Complete(ctx, f.sess.UserID, up.ID)
	if err != nil || !created {
		t.Fatalf("Complete with a cancelled context = %v, created=%v; want it to finish", err, created)
	}
	if n := f.count(t, "blobs"); n != 1 {
		t.Errorf("blob rows = %d, want 1", n)
	}
	if files := blobFiles(t, f.dir); len(files) != 1 || filepath.Base(files[0]) != b.ID {
		t.Errorf("blob files = %v, want exactly %s", files, b.ID)
	}
}

func blobFiles(t *testing.T, root string) []string {
	t.Helper()
	var files []string
	_ = filepath.WalkDir(filepath.Join(root, "blobs"), func(p string, d fs.DirEntry, err error) error {
		if err == nil && !d.IsDir() {
			files = append(files, p)
		}
		return nil
	})
	return files
}

// I-4: if the received parts' data is gone, Complete reports the upload as
// incomplete (so the client re-sends) instead of failing forever.
func TestCompleteWithLostPartData(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	up := upload(t, f, randBytes(500))
	if err := os.RemoveAll(filepath.Join(f.dir, "uploads", up.ID)); err != nil {
		t.Fatal(err)
	}
	if _, _, err := f.svc.Complete(ctx, f.sess.UserID, up.ID); !errors.Is(err, ErrUploadIncomplete) {
		t.Fatalf("Complete = %v, want ErrUploadIncomplete", err)
	}
	got, err := f.svc.GetUpload(ctx, f.sess.UserID, up.ID)
	if err != nil || len(got.Received) != 0 {
		t.Fatalf("received = %v (%v), want none so the client re-sends", got.Received, err)
	}
	// Re-sending works.
	data := randBytes(500)
	up2, _ := f.svc.CreateUpload(ctx, f.sess, 500, sha(data))
	_ = f.svc.PutPart(ctx, f.sess.UserID, up2.ID, 0, bytes.NewReader(data))
	if _, _, err := f.svc.Complete(ctx, f.sess.UserID, up2.ID); err != nil {
		t.Fatal(err)
	}
}

// I-3: the free-space check counts bytes still owed to unfinished uploads.
func TestFreeSpaceCountsUnfinishedUploads(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	_ = f.sim.SetFill("main", 99) // 1 TB drive → 10 GB free
	const size = 5_000_000_000
	if _, err := f.svc.CreateUpload(ctx, f.sess, size, sha(nil)); err != nil {
		t.Fatalf("first 5 GB upload: %v", err)
	}
	if _, err := f.svc.CreateUpload(ctx, f.sess, size, sha(nil)); !errors.Is(err, ErrStorageFull) {
		t.Fatalf("second 5 GB upload: %v, want ErrStorageFull (10 GB free minus 5 GB owed minus 1 GiB reserve)", err)
	}
}

// I-3: running out of disk while writing is storage_full, not a 500.
func TestDiskFullErrorsAreStorageFull(t *testing.T) {
	err := diskErr(&os.PathError{Op: "write", Path: "x", Err: syscall.ENOSPC})
	if !errors.Is(err, ErrStorageFull) {
		t.Errorf("ENOSPC → %v, want ErrStorageFull", err)
	}
	other := errors.New("boom")
	if diskErr(other) != other {
		t.Error("other errors must pass through")
	}
}

// I-4: parts and completes racing (including hash-mismatch resets) never
// produce an error other than the expected ones, and afterwards every part
// the box says it received is really there.
func TestPartsRacingCompletes(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	data := randBytes(3*PartBytes/2 + 7)
	up, _ := f.svc.CreateUpload(ctx, f.sess, int64(len(data)), sha(randBytes(4))) // wrong hash: completes reset
	var wg sync.WaitGroup
	for range 4 {
		wg.Go(func() {
			for range 3 {
				for n := range up.PartCount {
					if err := f.svc.PutPart(ctx, f.sess.UserID, up.ID, n, bytes.NewReader(part(data, n))); err != nil {
						t.Errorf("PutPart: %v", err)
					}
				}
			}
		})
		wg.Go(func() {
			for range 3 {
				_, _, err := f.svc.Complete(ctx, f.sess.UserID, up.ID)
				if err != nil && !errors.Is(err, ErrUploadIncomplete) && !errors.Is(err, ErrHashMismatch) {
					t.Errorf("Complete: %v", err)
				}
			}
		})
	}
	wg.Wait()

	// Whatever the box says arrived must be complete and correct on disk:
	// re-send the rest, then a final complete reaches the hash check.
	got, err := f.svc.GetUpload(ctx, f.sess.UserID, up.ID)
	if err != nil {
		t.Fatal(err)
	}
	for n := range up.PartCount {
		if !slices.Contains(got.Received, n) {
			_ = f.svc.PutPart(ctx, f.sess.UserID, up.ID, n, bytes.NewReader(part(data, n)))
		}
	}
	if _, _, err := f.svc.Complete(ctx, f.sess.UserID, up.ID); !errors.Is(err, ErrHashMismatch) {
		t.Errorf("final Complete = %v, want ErrHashMismatch (all parts present, declared hash wrong)", err)
	}
}
