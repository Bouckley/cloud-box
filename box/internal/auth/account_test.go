package auth

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"errors"
	"testing"

	"github.com/Bouckley/cloud-box/box/internal/store"
)

func TestChangePassword(t *testing.T) {
	svc, _, _ := newService(t)
	ctx := context.Background()
	a := setUp(t, svc)
	before, err := svc.Account(ctx, a.userID)
	if err != nil {
		t.Fatal(err)
	}
	kdf := KDF{Salt: randBytes(16), OpsLimit: 4, MemLimitBytes: 128 << 20}
	wrap := randBytes(72)
	if err := svc.ChangePassword(ctx, a.userID, kdf, wrap); err != nil {
		t.Fatalf("ChangePassword: %v", err)
	}
	acct, err := svc.Account(ctx, a.userID)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(acct.MasterKeyByPassword, wrap) || !bytes.Equal(acct.KDF.Salt, kdf.Salt) ||
		acct.KDF.OpsLimit != 4 || acct.KDF.MemLimitBytes != 128<<20 {
		t.Errorf("account after change = %+v", acct)
	}
	if !bytes.Equal(acct.MasterKeyByRecovery, before.MasterKeyByRecovery) {
		t.Error("ChangePassword changed the recovery wrap")
	}
}

func TestChangePasswordBounds(t *testing.T) {
	svc, _, _ := newService(t)
	ctx := context.Background()
	a := setUp(t, svc)
	good := KDF{Salt: randBytes(16), OpsLimit: 3, MemLimitBytes: 64 << 20}
	cases := map[string]struct {
		kdf  KDF
		wrap []byte
	}{
		"ops 1":         {KDF{Salt: good.Salt, OpsLimit: 1, MemLimitBytes: good.MemLimitBytes}, randBytes(72)},
		"ops 11":        {KDF{Salt: good.Salt, OpsLimit: 11, MemLimitBytes: good.MemLimitBytes}, randBytes(72)},
		"mem too small": {KDF{Salt: good.Salt, OpsLimit: 3, MemLimitBytes: 32 << 20}, randBytes(72)},
		"mem too big":   {KDF{Salt: good.Salt, OpsLimit: 3, MemLimitBytes: 2 << 30}, randBytes(72)},
		"short salt":    {KDF{Salt: randBytes(15), OpsLimit: 3, MemLimitBytes: good.MemLimitBytes}, randBytes(72)},
		"short wrap":    {good, randBytes(71)},
	}
	for name, c := range cases {
		if err := svc.ChangePassword(ctx, a.userID, c.kdf, c.wrap); !errors.Is(err, ErrInvalid) {
			t.Errorf("%s: %v, want ErrInvalid", name, err)
		}
	}
}

func TestPairWithoutName(t *testing.T) {
	svc, _, _ := newService(t)
	ctx := context.Background()
	a := setUp(t, svc)
	code, _, err := svc.CreatePairingCode(ctx, sessionOf(a))
	if err != nil {
		t.Fatal(err)
	}
	pub, _, _ := ed25519.GenerateKey(rand.Reader)
	nd := NewDevice{ID: newID(), SignPublicKey: pub}
	if _, err := svc.Pair(ctx, code, nd); err != nil {
		t.Fatalf("Pair without a name: %v", err)
	}
	devices, err := svc.Devices(ctx, a.userID)
	if err != nil {
		t.Fatal(err)
	}
	for _, d := range devices {
		if d.ID == nd.ID && d.NameEnc != nil {
			t.Errorf("unnamed device nameEnc = %x, want nil", d.NameEnc)
		}
		if d.ID == a.id && d.NameEnc == nil {
			t.Error("named device lost its nameEnc")
		}
	}
}

func TestRenameDevice(t *testing.T) {
	svc, db, _ := newService(t)
	ctx := context.Background()
	a := setUp(t, svc)
	name := randBytes(60)
	d, err := svc.RenameDevice(ctx, a.userID, a.id, name)
	if err != nil {
		t.Fatalf("RenameDevice: %v", err)
	}
	if d.ID != a.id || !bytes.Equal(d.NameEnc, name) {
		t.Errorf("renamed device = %+v", d)
	}

	// A second user, inserted directly (there is no way to create one yet).
	other := newID()
	if _, err := db.DB().Exec(`INSERT INTO users (id, role, kdf_salt, kdf_ops, kdf_mem, master_key_password,
		master_key_recovery, identity_public_key, identity_key_enc, dedupe_key_enc, created_at)
		VALUES (?, 'member', x'00', 2, 1, x'00', x'00', x'00', x'00', x'00', 0)`, other); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.RenameDevice(ctx, other, a.id, randBytes(60)); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("another user renaming A's device: %v, want ErrNotFound", err)
	}
	if d, _ := svc.Devices(ctx, a.userID); !bytes.Equal(d[0].NameEnc, name) {
		t.Error("another user's rename changed the device")
	}
	if _, err := svc.RenameDevice(ctx, a.userID, newID(), name); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("rename unknown device: %v, want ErrNotFound", err)
	}
}
