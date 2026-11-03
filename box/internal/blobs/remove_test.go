package blobs

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
)

func TestRemove(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	b, _, err := f.svc.Complete(ctx, f.sess.UserID, upload(t, f, randBytes(100)).ID, "")
	if err != nil {
		t.Fatal(err)
	}
	backup := filepath.Join(f.dir, "sim-backup")
	copyPath := BlobPath(backup, b.ID)
	_ = os.MkdirAll(filepath.Dir(copyPath), 0o700)
	if err := os.WriteFile(copyPath, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	if err := f.svc.Remove(ctx, b.ID); err != nil {
		t.Fatal(err)
	}
	for _, p := range []string{BlobPath(f.dir, b.ID), copyPath} {
		if _, err := os.Stat(p); !errors.Is(err, os.ErrNotExist) {
			t.Errorf("%s still there: %v", p, err)
		}
	}
	// Already gone, or backup drive unplugged: still fine.
	if err := f.svc.Remove(ctx, b.ID); err != nil {
		t.Errorf("second Remove: %v", err)
	}
	f.sim.SetBackupPresent(false)
	if err := f.svc.Remove(ctx, newID()); err != nil {
		t.Errorf("Remove with backup unplugged: %v", err)
	}
}
