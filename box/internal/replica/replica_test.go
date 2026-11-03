package replica

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/Bouckley/cloud-box/box/internal/auth"
	"github.com/Bouckley/cloud-box/box/internal/blobs"
	"github.com/Bouckley/cloud-box/box/internal/hal/sim"
	"github.com/Bouckley/cloud-box/box/internal/library"
	"github.com/Bouckley/cloud-box/box/internal/store"
)

type fixture struct {
	svc   *Service
	lib   *library.Service
	blobs *blobs.Service
	db    *store.Store
	sim   *sim.Sim
	dir   string
	sess  auth.Session
	col   string
}

func newFixture(t *testing.T) *fixture {
	t.Helper()
	dir := filepath.Join(t.TempDir(), "with space")
	db, err := store.Open(context.Background(), filepath.Join(dir, "db", "box.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	s := sim.New(dir)
	f := &fixture{svc: New(db, s.HAL()), lib: library.New(db, s.HAL().Clock), blobs: blobs.New(db, s.HAL()),
		db: db, sim: s, dir: dir}
	f.sess = auth.Session{UserID: newID(), DeviceID: newID()}
	for _, q := range []string{
		`INSERT INTO users (id, role, kdf_salt, kdf_ops, kdf_mem, master_key_password, master_key_recovery,
			identity_public_key, identity_key_enc, dedupe_key_enc, created_at)
			VALUES (?, 'owner', x'00', 2, 1, x'00', x'00', x'00', x'00', x'00', 0)`,
	} {
		if _, err := db.DB().Exec(q, f.sess.UserID); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := db.DB().Exec(`INSERT INTO devices (id, user_id, name_enc, sign_public_key, created_at, last_seen)
		VALUES (?, ?, x'00', x'00', 0, 0)`, f.sess.DeviceID, f.sess.UserID); err != nil {
		t.Fatal(err)
	}
	c, err := f.lib.CreateCollection(context.Background(), f.sess.UserID, library.Collection{
		ID: newID(), Kind: "album", NameEnc: randBytes(50), KeyEnc: randBytes(72)})
	if err != nil {
		t.Fatal(err)
	}
	f.col = c.ID
	return f
}

func randBytes(n int) []byte {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return b
}

func newID() string { return hex.EncodeToString(randBytes(16)) }

func (f *fixture) upload(t *testing.T, data []byte) string {
	t.Helper()
	ctx := context.Background()
	sum := sha256.Sum256(data)
	up, err := f.blobs.CreateUpload(ctx, f.sess, int64(len(data)), hex.EncodeToString(sum[:]))
	if err != nil {
		t.Fatal(err)
	}
	if err := f.blobs.PutPart(ctx, f.sess.UserID, up.ID, 0, bytes.NewReader(data)); err != nil {
		t.Fatal(err)
	}
	b, _, err := f.blobs.Complete(ctx, f.sess.UserID, up.ID, "")
	if err != nil {
		t.Fatal(err)
	}
	return b.ID
}

// item creates an item with an original and a thumb.
func (f *fixture) item(t *testing.T) library.Item {
	t.Helper()
	it, err := f.lib.CreateItem(context.Background(), f.sess, library.Item{
		ID: newID(), CollectionID: f.col, FileKeyEnc: randBytes(72), MetadataEnc: randBytes(60),
		DedupeHash: newID() + newID(),
		Blobs: []library.ItemBlob{
			{Role: "original", BlobID: f.upload(t, randBytes(5000))},
			{Role: "thumb", BlobID: f.upload(t, randBytes(50))},
		},
	})
	if err != nil {
		t.Fatal(err)
	}
	return it
}

func (f *fixture) get(t *testing.T, id string) library.Item {
	t.Helper()
	it, err := f.lib.GetItem(context.Background(), f.sess.UserID, id)
	if err != nil {
		t.Fatal(err)
	}
	return it
}

func (f *fixture) backupPath(id string) string {
	return blobs.BlobPath(filepath.Join(f.dir, "sim-backup"), id)
}

func (f *fixture) count(t *testing.T, table string) int {
	t.Helper()
	var n int
	if err := f.db.DB().QueryRow("SELECT COUNT(*) FROM " + table).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}

func TestRunCopiesAndVerifies(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	it := f.item(t)
	if last, err := f.svc.LastCopyAt(ctx); err != nil || last != nil {
		t.Errorf("LastCopyAt before any copy = %v, %v; want nil", last, err)
	}
	res, err := f.svc.Run(ctx)
	if err != nil || res.Copied != 2 || res.Failed != 0 {
		t.Fatalf("Run = %+v, %v; want 2 copied", res, err)
	}
	for _, b := range it.Blobs {
		main, _ := os.ReadFile(blobs.BlobPath(f.dir, b.BlobID))
		copied, err := os.ReadFile(f.backupPath(b.BlobID))
		if err != nil || !bytes.Equal(main, copied) {
			t.Errorf("backup of %s differs (%v)", b.Role, err)
		}
		if fi, err := os.Stat(f.backupPath(b.BlobID)); err != nil || fi.Mode().Perm() != 0o600 {
			t.Errorf("backup file mode: %v", err)
		}
		var verified *int64
		_ = f.db.DB().QueryRow("SELECT verified_at FROM replicas WHERE blob_id = ? AND target = 'backup'", b.BlobID).Scan(&verified)
		if verified == nil {
			t.Errorf("replica of %s not verified", b.Role)
		}
	}
	got := f.get(t, it.ID)
	if got.State != "replicated" || got.Seq <= it.Seq {
		t.Errorf("after Run: state %s seq %d (was %d); want replicated with a new seq", got.State, got.Seq, it.Seq)
	}
	if last, err := f.svc.LastCopyAt(ctx); err != nil || last == nil {
		t.Errorf("LastCopyAt = %v, %v", last, err)
	}
	if entries, _ := os.ReadDir(filepath.Join(f.dir, "sim-backup", "tmp")); len(entries) != 0 {
		t.Errorf("leftover temp files: %v", entries)
	}
}

func TestRunIsIncremental(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	it := f.item(t)
	if _, err := f.svc.Run(ctx); err != nil {
		t.Fatal(err)
	}
	seq := f.get(t, it.ID).Seq
	res, err := f.svc.Run(ctx)
	if err != nil || res.Copied != 0 || res.Failed != 0 {
		t.Errorf("second Run = %+v, %v; want nothing to do", res, err)
	}
	if f.get(t, it.ID).Seq != seq {
		t.Error("second Run changed the item's seq")
	}
	f.item(t)
	if res, _ := f.svc.Run(ctx); res.Copied != 2 {
		t.Errorf("Run after a new item copied %d, want 2", res.Copied)
	}
}

func TestBackupMissing(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	it := f.item(t)
	f.sim.SetBackupPresent(false)
	if _, err := f.svc.Run(ctx); !errors.Is(err, ErrBackupMissing) {
		t.Fatalf("Run = %v, want ErrBackupMissing", err)
	}
	if n := f.count(t, "replicas"); n != 0 {
		t.Errorf("replicas = %d, want 0", n)
	}
	if got := f.get(t, it.ID); got.State != "verified" || got.Seq != it.Seq {
		t.Errorf("item = %s seq %d, want verified and unchanged", got.State, got.Seq)
	}
}

func TestCorruptCopyNotMarked(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	it := f.item(t)
	orig := it.Blobs[0]
	if orig.Role != "original" {
		orig = it.Blobs[1]
	}
	p := blobs.BlobPath(f.dir, orig.BlobID)
	data, _ := os.ReadFile(p)
	data[10] ^= 0xff
	if err := os.WriteFile(p, data, 0o600); err != nil {
		t.Fatal(err)
	}
	res, err := f.svc.Run(ctx)
	if err != nil || res.Copied != 1 || res.Failed != 1 {
		t.Fatalf("Run = %+v, %v; want 1 copied (thumb), 1 failed (original)", res, err)
	}
	var n int
	_ = f.db.DB().QueryRow("SELECT COUNT(*) FROM replicas WHERE blob_id = ?", orig.BlobID).Scan(&n)
	if n != 0 {
		t.Error("damaged blob got a replica row")
	}
	if _, err := os.Stat(f.backupPath(orig.BlobID)); !errors.Is(err, os.ErrNotExist) {
		t.Errorf("damaged copy left on the backup: %v", err)
	}
	// TestPartialItemNotReplicated: only the thumb copied.
	if got := f.get(t, it.ID); got.State != "verified" {
		t.Errorf("item with only its thumb copied = %s, want verified", got.State)
	}
	// It is tried again next time (still failing, still not marked).
	if res, _ := f.svc.Run(ctx); res.Failed != 1 || res.Copied != 0 {
		t.Errorf("retry = %+v", res)
	}
}

func TestPartialItemNotReplicated(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	it := f.item(t)
	var orig string
	for _, b := range it.Blobs {
		if b.Role == "original" {
			orig = b.BlobID
		}
	}
	// The original vanished from the main drive: it cannot be copied.
	if err := os.Remove(blobs.BlobPath(f.dir, orig)); err != nil {
		t.Fatal(err)
	}
	res, err := f.svc.Run(ctx)
	if err != nil || res.Copied != 1 || res.Failed != 1 {
		t.Fatalf("Run = %+v, %v", res, err)
	}
	if got := f.get(t, it.ID); got.State != "verified" {
		t.Errorf("state = %s, want verified", got.State)
	}
}

// Final review M-3 (re-graded Important): a blob whose verification re-read
// failed at upload time is verified by the backup copy, which hashes the main
// file and must match its SHA-256; otherwise it would stay "stored" forever.
func TestCopyVerifiesUnverifiedBlob(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	it := f.item(t)
	if _, err := f.db.DB().Exec("UPDATE blobs SET verified_at = NULL"); err != nil {
		t.Fatal(err)
	}
	if got := f.get(t, it.ID); got.State != "stored" {
		t.Fatalf("state = %s, want stored", got.State)
	}
	if res, err := f.svc.Run(ctx); err != nil || res.Copied != 2 {
		t.Fatalf("Run = %+v, %v", res, err)
	}
	if got := f.get(t, it.ID); got.State != "replicated" {
		t.Errorf("state after backup = %s, want replicated", got.State)
	}
	var unverified int
	_ = f.db.DB().QueryRow("SELECT COUNT(*) FROM blobs WHERE verified_at IS NULL").Scan(&unverified)
	if unverified != 0 {
		t.Errorf("%d blobs still unverified", unverified)
	}
}
