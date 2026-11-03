package blobs

import (
	"context"
	"errors"
	"os"
	"path/filepath"
	"testing"
	"time"

	"github.com/Bouckley/cloud-box/box/internal/store"
)

func TestCleanupUploads(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	stale := upload(t, f, randBytes(10)) // parts in, never completed
	staleFile := filepath.Join(f.dir, "uploads", stale.ID)
	orphan := filepath.Join(f.dir, "uploads", newID())
	if err := os.WriteFile(orphan, []byte("x"), 0o600); err != nil {
		t.Fatal(err)
	}
	// A completed blob never attached to an item, with a backup copy.
	loose, _, err := f.svc.Complete(ctx, f.sess.UserID, upload(t, f, randBytes(20)).ID)
	if err != nil {
		t.Fatal(err)
	}
	backupCopy := BlobPath(filepath.Join(f.dir, "sim-backup"), loose.ID)
	_ = os.MkdirAll(filepath.Dir(backupCopy), 0o700)
	_ = os.WriteFile(backupCopy, []byte("x"), 0o600)
	// A blob attached to an item must survive.
	kept, _, err := f.svc.Complete(ctx, f.sess.UserID, upload(t, f, randBytes(30)).ID)
	if err != nil {
		t.Fatal(err)
	}
	f.attach(t, kept.ID)
	// Leftover temp files on both drives.
	tmps := []string{filepath.Join(f.dir, "tmp", "blob-1"), filepath.Join(f.dir, "sim-backup", "tmp", "copy-1")}
	for _, p := range tmps {
		_ = os.MkdirAll(filepath.Dir(p), 0o700)
		if err := os.WriteFile(p, []byte("x"), 0o600); err != nil {
			t.Fatal(err)
		}
	}

	// Nothing is old yet, except the orphan file (it has no upload row).
	n, err := f.svc.CleanupUploads(ctx)
	if err != nil || n != 1 {
		t.Fatalf("early Cleanup = %d, %v; want 1 (the orphan)", n, err)
	}
	if _, err := os.Stat(orphan); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("orphan upload file still there")
	}
	if _, err := os.Stat(staleFile); err != nil {
		t.Errorf("fresh upload's data file removed early: %v", err)
	}

	f.sim.Advance(25 * time.Hour)
	n, err = f.svc.CleanupUploads(ctx)
	if err != nil {
		t.Fatal(err)
	}
	gone := append([]string{staleFile, BlobPath(f.dir, loose.ID), backupCopy}, tmps...)
	for _, p := range gone {
		if _, err := os.Stat(p); !errors.Is(err, os.ErrNotExist) {
			t.Errorf("%s still there (%v)", p, err)
		}
	}
	if n != 2+len(tmps) {
		t.Errorf("Cleanup = %d, want %d (expired uploads, loose blob, temp files)", n, 2+len(tmps))
	}
	if _, err := os.Stat(BlobPath(f.dir, kept.ID)); err != nil {
		t.Errorf("attached blob removed: %v", err)
	}
	if _, err := f.svc.GetUpload(ctx, f.sess.UserID, stale.ID); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("stale upload still listed: %v", err)
	}
	var rows int
	_ = f.db.DB().QueryRow("SELECT (SELECT COUNT(*) FROM uploads) + (SELECT COUNT(*) FROM upload_parts)").Scan(&rows)
	if rows != 0 {
		t.Errorf("upload rows left: %d", rows)
	}
	var blobRows int
	_ = f.db.DB().QueryRow("SELECT COUNT(*) FROM blobs").Scan(&blobRows)
	if blobRows != 1 {
		t.Errorf("blob rows = %d, want 1 (the attached one)", blobRows)
	}
}

// attach links a blob to a minimal item (library's job, done directly here).
func (f *fixture) attach(t *testing.T, blobID string) {
	t.Helper()
	col, item := newID(), newID()
	for _, q := range []struct {
		sql  string
		args []any
	}{
		{"INSERT INTO collections (id, owner_id, kind, name_enc, seq, created_at) VALUES (?, ?, 'album', x'00', 1, 0)", []any{col, f.sess.UserID}},
		{`INSERT INTO items (id, owner_id, device_id, collection_id, file_key_enc, metadata_enc, dedupe_hash, seq, created_at)
			VALUES (?, ?, ?, ?, x'00', x'00', 'h', 2, 0)`, []any{item, f.sess.UserID, f.sess.DeviceID, col}},
		{"INSERT INTO item_blobs (item_id, blob_id, role) VALUES (?, ?, 'original')", []any{item, blobID}},
	} {
		if _, err := f.db.DB().Exec(q.sql, q.args...); err != nil {
			t.Fatal(err)
		}
	}
}
