package status

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"path/filepath"
	"testing"
	"time"

	"github.com/Bouckley/cloud-box/box/internal/auth"
	"github.com/Bouckley/cloud-box/box/internal/blobs"
	"github.com/Bouckley/cloud-box/box/internal/hal"
	"github.com/Bouckley/cloud-box/box/internal/hal/sim"
	"github.com/Bouckley/cloud-box/box/internal/library"
	"github.com/Bouckley/cloud-box/box/internal/replica"
	"github.com/Bouckley/cloud-box/box/internal/store"
	"github.com/Bouckley/cloud-box/box/internal/trash"
)

type fixture struct {
	svc   *Service
	lib   *library.Service
	blobs *blobs.Service
	rep   *replica.Service
	trash *trash.Service
	db    *store.Store
	sim   *sim.Sim
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
	h := s.HAL()
	f := &fixture{lib: library.New(db, h.Clock), blobs: blobs.New(db, h), rep: replica.New(db, h), db: db, sim: s}
	f.trash = trash.New(db, h, f.blobs)
	f.svc = New(db, h, f.lib, f.rep)
	f.sess = auth.Session{UserID: newID(), DeviceID: newID()}
	if _, err := db.DB().Exec(`INSERT INTO users (id, role, kdf_salt, kdf_ops, kdf_mem, master_key_password,
		master_key_recovery, identity_public_key, identity_key_enc, dedupe_key_enc, created_at)
		VALUES (?, 'owner', x'00', 2, 1, x'00', x'00', x'00', x'00', x'00', 0)`, f.sess.UserID); err != nil {
		t.Fatal(err)
	}
	f.addDevice(t, f.sess.DeviceID)
	c, err := f.lib.CreateCollection(context.Background(), f.sess.UserID, library.Collection{
		ID: newID(), Kind: "album", NameEnc: randBytes(50), KeyEnc: randBytes(72)})
	if err != nil {
		t.Fatal(err)
	}
	f.col = c.ID
	return f
}

func (f *fixture) addDevice(t *testing.T, id string) {
	t.Helper()
	if _, err := f.db.DB().Exec(`INSERT INTO devices (id, user_id, name_enc, sign_public_key, created_at, last_seen)
		VALUES (?, ?, ?, x'00', 0, 0)`, id, f.sess.UserID, randBytes(45)); err != nil {
		t.Fatal(err)
	}
}

func randBytes(n int) []byte {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return b
}

func newID() string { return hex.EncodeToString(randBytes(16)) }

func (f *fixture) item(t *testing.T, sess auth.Session) library.Item {
	t.Helper()
	ctx := context.Background()
	data := randBytes(200)
	sum := sha256.Sum256(data)
	up, err := f.blobs.CreateUpload(ctx, sess, int64(len(data)), hex.EncodeToString(sum[:]))
	if err != nil {
		t.Fatal(err)
	}
	if err := f.blobs.PutPart(ctx, sess.UserID, up.ID, 0, bytes.NewReader(data)); err != nil {
		t.Fatal(err)
	}
	b, _, err := f.blobs.Complete(ctx, sess.UserID, up.ID)
	if err != nil {
		t.Fatal(err)
	}
	it, err := f.lib.CreateItem(ctx, sess, library.Item{
		ID: newID(), CollectionID: f.col, FileKeyEnc: randBytes(72), MetadataEnc: randBytes(60),
		DedupeHash: newID() + newID(), Blobs: []library.ItemBlob{{Role: "original", BlobID: b.ID}},
	})
	if err != nil {
		t.Fatal(err)
	}
	return it
}

func (f *fixture) summary(t *testing.T) Summary {
	t.Helper()
	s, err := f.svc.Summary(context.Background(), f.sess.UserID)
	if err != nil {
		t.Fatal(err)
	}
	return s
}

func codes(ws []Warning) []string {
	var out []string
	for _, w := range ws {
		out = append(out, w.Code)
	}
	return out
}

func TestStatusAllCopied(t *testing.T) {
	f := newFixture(t)
	phone := auth.Session{UserID: f.sess.UserID, DeviceID: newID()}
	f.addDevice(t, phone.DeviceID)
	f.item(t, f.sess)
	f.sim.Advance(time.Hour)
	newest := f.item(t, f.sess)
	if _, err := f.rep.Run(context.Background()); err != nil {
		t.Fatal(err)
	}
	s := f.summary(t)
	if !s.Safe || len(s.Warnings) != 0 {
		t.Errorf("safe = %v, warnings %v; want safe", s.Safe, codes(s.Warnings))
	}
	if s.Items != (ItemCounts{Total: 2, Verified: 0, Replicated: 2, NotYetCopied: 0, Trashed: 0}) {
		t.Errorf("items = %+v", s.Items)
	}
	if s.LastCopyAt == nil {
		t.Error("lastCopyAt not set")
	}
	if len(s.Drives) != 2 {
		t.Errorf("drives = %+v", s.Drives)
	}
	devices := map[string]Device{}
	for _, d := range s.Devices {
		devices[d.ID] = d
	}
	if d := devices[f.sess.DeviceID]; d.LastBackupAt == nil || !d.LastBackupAt.Equal(newest.CreatedAt) || len(d.NameEnc) != 45 {
		t.Errorf("device = %+v, want lastBackupAt %v", d, newest.CreatedAt)
	}
	if d, ok := devices[phone.DeviceID]; !ok || d.LastBackupAt != nil {
		t.Errorf("phone with no items = %+v, %v; want lastBackupAt nil", d, ok)
	}
}

func TestStatusNotYetCopied(t *testing.T) {
	f := newFixture(t)
	f.item(t, f.sess)
	s := f.summary(t)
	if s.Safe || s.Items.NotYetCopied != 1 || s.Items.Verified != 1 || len(s.Warnings) != 0 || s.LastCopyAt != nil {
		t.Errorf("summary = %+v", s)
	}
}

func TestStatusBackupMissing(t *testing.T) {
	f := newFixture(t)
	f.item(t, f.sess)
	if _, err := f.rep.Run(context.Background()); err != nil {
		t.Fatal(err)
	}
	if !f.summary(t).Safe {
		t.Fatal("not safe before unplugging")
	}
	f.sim.SetBackupPresent(false)
	s := f.summary(t)
	if s.Safe || len(s.Warnings) != 1 || s.Warnings[0].Code != "backup_missing" ||
		s.Warnings[0].Message == "" || s.Warnings[0].Action == "" {
		t.Errorf("summary = %+v", s)
	}
	if len(s.Drives) != 1 || s.Drives[0].Role != "main" {
		t.Errorf("drives = %+v, want main only", s.Drives)
	}
}

func TestStatusStorageLow(t *testing.T) {
	f := newFixture(t)
	if err := f.sim.SetFill("main", 91); err != nil {
		t.Fatal(err)
	}
	s := f.summary(t)
	if s.Safe || len(s.Warnings) != 1 || s.Warnings[0].Code != "storage_low" || s.Warnings[0].Action == "" {
		t.Errorf("summary = %+v", s)
	}
	_ = f.sim.SetFill("main", 89)
	if s := f.summary(t); !s.Safe {
		t.Errorf("11%% free: warnings %v, want safe", codes(s.Warnings))
	}
}

func TestTrashedNotCounted(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	f.item(t, f.sess)
	if _, err := f.rep.Run(ctx); err != nil {
		t.Fatal(err)
	}
	trashed := f.item(t, f.sess) // never copied
	if err := f.trash.Trash(ctx, f.sess.UserID, trashed.ID); err != nil {
		t.Fatal(err)
	}
	s := f.summary(t)
	if !s.Safe || s.Items.Total != 1 || s.Items.Trashed != 1 || s.Items.NotYetCopied != 0 {
		t.Errorf("summary = %+v", s)
	}
}

func TestStatusIsPerUser(t *testing.T) {
	f := newFixture(t)
	other := auth.Session{UserID: newID(), DeviceID: newID()}
	if _, err := f.db.DB().Exec(`INSERT INTO users (id, role, kdf_salt, kdf_ops, kdf_mem, master_key_password,
		master_key_recovery, identity_public_key, identity_key_enc, dedupe_key_enc, created_at)
		VALUES (?, 'member', x'00', 2, 1, x'00', x'00', x'00', x'00', x'00', 0)`, other.UserID); err != nil {
		t.Fatal(err)
	}
	if _, err := f.db.DB().Exec(`INSERT INTO devices (id, user_id, name_enc, sign_public_key, created_at, last_seen)
		VALUES (?, ?, x'00', x'00', 0, 0)`, other.DeviceID, other.UserID); err != nil {
		t.Fatal(err)
	}
	s := f.summary(t)
	if len(s.Devices) != 1 || s.Devices[0].ID != f.sess.DeviceID || s.Items.Total != 0 {
		t.Errorf("summary leaks other users: %+v", s)
	}
}

func TestLightFor(t *testing.T) {
	safe := Summary{Safe: true}
	cases := []struct {
		name string
		s    Summary
		main bool
		want hal.LightState
	}{
		{"safe", safe, true, hal.SafeSteady},
		{"warning", Summary{Warnings: []Warning{{Code: "backup_missing"}}}, true, hal.Attention},
		{"not yet copied", Summary{Items: ItemCounts{Total: 1, NotYetCopied: 1}}, true, hal.Attention},
		{"main missing", safe, false, hal.Fault},
	}
	for _, c := range cases {
		if got := LightFor(c.s, c.main); got != c.want {
			t.Errorf("%s: %v, want %v", c.name, got, c.want)
		}
	}
}

func TestUpdateLight(t *testing.T) {
	f := newFixture(t)
	ctx := context.Background()
	if err := f.svc.UpdateLight(ctx); err != nil || f.sim.Light() != hal.SafeSteady {
		t.Errorf("empty box: light %v, %v; want safe", f.sim.Light(), err)
	}
	f.item(t, f.sess)
	if err := f.svc.UpdateLight(ctx); err != nil || f.sim.Light() != hal.Attention {
		t.Errorf("uncopied item: light %v, %v; want attention", f.sim.Light(), err)
	}
	if _, err := f.rep.Run(ctx); err != nil {
		t.Fatal(err)
	}
	if err := f.svc.UpdateLight(ctx); err != nil || f.sim.Light() != hal.SafeSteady {
		t.Errorf("all copied: light %v, %v; want safe", f.sim.Light(), err)
	}
	f.sim.SetBackupPresent(false)
	if err := f.svc.UpdateLight(ctx); err != nil || f.sim.Light() != hal.Attention {
		t.Errorf("backup unplugged: light %v, %v; want attention", f.sim.Light(), err)
	}
}
