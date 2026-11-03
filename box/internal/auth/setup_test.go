package auth

import (
	"bytes"
	"context"
	"errors"
	"testing"

	"github.com/Bouckley/cloud-box/box/internal/store"
)

func TestSetupStoresWrappedKeysOnly(t *testing.T) {
	svc, db, sim := newService(t)
	ctx := context.Background()
	u, d := testUser(), testDevice(randBytes(32))

	acct, err := svc.Setup(ctx, u, d)
	if err != nil {
		t.Fatalf("Setup: %v", err)
	}
	if acct.Role != RoleOwner || acct.ID != u.ID {
		t.Errorf("account = %+v, want owner %s", acct, u.ID)
	}

	var (
		role                          string
		salt, mkp, mkr, ipk, ike, dke []byte
		ops                           int
		mem                           int64
	)
	err = db.DB().QueryRow(`SELECT role, kdf_salt, kdf_ops, kdf_mem, master_key_password,
		master_key_recovery, identity_public_key, identity_key_enc, dedupe_key_enc
		FROM users WHERE id = ?`, u.ID).Scan(&role, &salt, &ops, &mem, &mkp, &mkr, &ipk, &ike, &dke)
	if err != nil {
		t.Fatal(err)
	}
	for name, pair := range map[string][2][]byte{
		"salt": {salt, u.KDF.Salt}, "masterKeyByPassword": {mkp, u.MasterKeyByPassword},
		"masterKeyByRecovery": {mkr, u.MasterKeyByRecovery}, "identityPublicKey": {ipk, u.IdentityPublicKey},
		"identityKeyEnc": {ike, u.IdentityKeyEnc}, "dedupeKeyEnc": {dke, u.DedupeKeyEnc},
	} {
		if !bytes.Equal(pair[0], pair[1]) {
			t.Errorf("%s stored %x, want %x", name, pair[0], pair[1])
		}
	}
	if role != "owner" || ops != 3 || mem != 268435456 {
		t.Errorf("role/ops/mem = %s/%d/%d", role, ops, mem)
	}

	var userID string
	var nameEnc, signKey []byte
	var lastSeen int64
	err = db.DB().QueryRow(`SELECT user_id, name_enc, sign_public_key, last_seen FROM devices WHERE id = ?`, d.ID).
		Scan(&userID, &nameEnc, &signKey, &lastSeen)
	if err != nil {
		t.Fatal(err)
	}
	if userID != u.ID || !bytes.Equal(nameEnc, d.NameEnc) || !bytes.Equal(signKey, d.SignPublicKey) {
		t.Errorf("device row = %s %x %x", userID, nameEnc, signKey)
	}
	if now := sim.HAL().Clock.Now().UnixMilli(); lastSeen > now || now-lastSeen > 5000 {
		t.Errorf("last_seen = %d, want about %d", lastSeen, now)
	}
}

func TestSetupOnce(t *testing.T) {
	svc, db, _ := newService(t)
	ctx := context.Background()
	if _, err := svc.Setup(ctx, testUser(), testDevice(randBytes(32))); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Setup(ctx, testUser(), testDevice(randBytes(32))); !errors.Is(err, ErrAlreadySetUp) {
		t.Fatalf("second Setup error = %v, want ErrAlreadySetUp", err)
	}
	var n int
	if err := db.DB().QueryRow("SELECT count(*) FROM users").Scan(&n); err != nil || n != 1 {
		t.Errorf("users = %d (%v), want 1", n, err)
	}
}

func TestAccount(t *testing.T) {
	svc, _, _ := newService(t)
	ctx := context.Background()
	u := testUser()
	if _, err := svc.Setup(ctx, u, testDevice(randBytes(32))); err != nil {
		t.Fatal(err)
	}
	acct, err := svc.Account(ctx, u.ID)
	if err != nil {
		t.Fatal(err)
	}
	if acct.Role != RoleOwner || !bytes.Equal(acct.MasterKeyByPassword, u.MasterKeyByPassword) ||
		acct.KDF.OpsLimit != u.KDF.OpsLimit || !bytes.Equal(acct.KDF.Salt, u.KDF.Salt) {
		t.Errorf("account = %+v", acct)
	}
	if _, err := svc.Account(ctx, newID()); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("unknown user error = %v, want ErrNotFound", err)
	}
}
