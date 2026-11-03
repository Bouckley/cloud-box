package auth

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"testing"
	"time"

	"github.com/Bouckley/cloud-box/box/internal/store"
)

// pairNew pairs a fresh device using a code from sess and returns it.
func pairNew(t *testing.T, svc *Service, sess Session) device {
	t.Helper()
	ctx := context.Background()
	code, _, err := svc.CreatePairingCode(ctx, sess)
	if err != nil {
		t.Fatal(err)
	}
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	nd := testDevice(pub)
	userID, err := svc.Pair(ctx, code, nd)
	if err != nil {
		t.Fatalf("Pair: %v", err)
	}
	return device{userID: userID, id: nd.ID, key: priv}
}

func sessionOf(d device) Session { return Session{UserID: d.userID, DeviceID: d.id} }

func TestPairNewDevice(t *testing.T) {
	svc, _, _ := newService(t)
	a := setUp(t, svc)
	b := pairNew(t, svc, sessionOf(a))
	if b.userID != a.userID {
		t.Fatalf("paired to user %s, want %s", b.userID, a.userID)
	}
	token, err := login(t, svc, b)
	if err != nil {
		t.Fatalf("paired device cannot log in: %v", err)
	}
	if sess, err := svc.Authenticate(context.Background(), token); err != nil || sess.DeviceID != b.id {
		t.Fatalf("Authenticate = %+v, %v", sess, err)
	}
}

func TestPairingCodeSingleUseAndExpiry(t *testing.T) {
	svc, db, sim := newService(t)
	a := setUp(t, svc)
	ctx := context.Background()

	code, expires, err := svc.CreatePairingCode(ctx, sessionOf(a))
	if err != nil {
		t.Fatal(err)
	}
	if got := expires.Sub(sim.HAL().Clock.Now()); got <= 9*time.Minute || got > PairingTTL {
		t.Errorf("code valid for %v, want %v", got, PairingTTL)
	}
	sum := sha256.Sum256([]byte(code))
	var n int
	if err := db.DB().QueryRow("SELECT count(*) FROM pairing_codes WHERE code_hash = ?", sum[:]).Scan(&n); err != nil || n != 1 {
		t.Errorf("pairing code hash rows = %d (%v)", n, err)
	}
	assertNotInDB(t, db.DB(), []byte(code))

	if _, err := svc.Pair(ctx, code, testDevice(randBytes(32))); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Pair(ctx, code, testDevice(randBytes(32))); !errors.Is(err, ErrBadPairingCode) {
		t.Errorf("reused code: %v, want ErrBadPairingCode", err)
	}

	code2, _, _ := svc.CreatePairingCode(ctx, sessionOf(a))
	sim.Advance(PairingTTL + time.Second)
	if _, err := svc.Pair(ctx, code2, testDevice(randBytes(32))); !errors.Is(err, ErrBadPairingCode) {
		t.Errorf("expired code: %v, want ErrBadPairingCode", err)
	}
	if _, err := svc.Pair(ctx, "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", testDevice(randBytes(32))); !errors.Is(err, ErrBadPairingCode) {
		t.Errorf("unknown code: %v", err)
	}
}

func TestPairDuplicateDeviceID(t *testing.T) {
	svc, _, _ := newService(t)
	a := setUp(t, svc)
	ctx := context.Background()
	code, _, _ := svc.CreatePairingCode(ctx, sessionOf(a))
	if _, err := svc.Pair(ctx, code, NewDevice{ID: a.id, NameEnc: randBytes(60), SignPublicKey: randBytes(32)}); !errors.Is(err, store.ErrIDTaken) {
		t.Fatalf("duplicate device id: %v, want ErrIDTaken", err)
	}
	// The failed attempt did not use up the code.
	if _, err := svc.Pair(ctx, code, testDevice(randBytes(32))); err != nil {
		t.Errorf("code unusable after a failed pair: %v", err)
	}
}

func TestPairWithCodeFromRevokedDevice(t *testing.T) {
	svc, _, _ := newService(t)
	a := setUp(t, svc)
	b := pairNew(t, svc, sessionOf(a))
	ctx := context.Background()
	code, _, _ := svc.CreatePairingCode(ctx, sessionOf(b))
	if err := svc.Revoke(ctx, a.userID, b.id); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Pair(ctx, code, testDevice(randBytes(32))); !errors.Is(err, ErrBadPairingCode) {
		t.Errorf("code from a revoked device still works: %v", err)
	}
}

func TestRevoke(t *testing.T) {
	svc, _, sim := newService(t)
	a := setUp(t, svc)
	b := pairNew(t, svc, sessionOf(a))
	ctx := context.Background()
	token, err := login(t, svc, b)
	if err != nil {
		t.Fatal(err)
	}

	sim.Advance(time.Minute)
	if err := svc.Revoke(ctx, a.userID, b.id); err != nil {
		t.Fatalf("Revoke: %v", err)
	}
	if _, err := svc.Authenticate(ctx, token); !errors.Is(err, ErrUnauthorized) {
		t.Errorf("revoked device's token still works: %v", err)
	}
	if _, _, err := svc.Challenge(ctx, b.id); !errors.Is(err, ErrUnauthorized) {
		t.Errorf("revoked device got a challenge: %v", err)
	}
	if err := svc.Revoke(ctx, a.userID, b.id); err != nil {
		t.Errorf("revoking twice: %v, want nil", err)
	}

	devices, err := svc.Devices(ctx, a.userID)
	if err != nil {
		t.Fatal(err)
	}
	if len(devices) != 2 {
		t.Fatalf("devices = %d, want 2", len(devices))
	}
	for _, d := range devices {
		switch d.ID {
		case a.id:
			if d.RevokedAt != nil {
				t.Errorf("device A revoked")
			}
		case b.id:
			if d.RevokedAt == nil || d.RevokedAt.Location() != time.UTC {
				t.Errorf("device B revokedAt = %v, want a UTC time", d.RevokedAt)
			}
		default:
			t.Errorf("unexpected device %s", d.ID)
		}
		if d.CreatedAt.IsZero() || d.LastSeen.IsZero() || len(d.SignPublicKey) != 32 || len(d.NameEnc) == 0 {
			t.Errorf("device %+v incomplete", d)
		}
	}
}

func TestRevokeLastDevice(t *testing.T) {
	svc, _, _ := newService(t)
	a := setUp(t, svc)
	if err := svc.Revoke(context.Background(), a.userID, a.id); !errors.Is(err, ErrLastDevice) {
		t.Fatalf("revoking the last device: %v, want ErrLastDevice", err)
	}
	// With a second active device, revoking the first is allowed.
	pairNew(t, svc, sessionOf(a))
	if err := svc.Revoke(context.Background(), a.userID, a.id); err != nil {
		t.Errorf("revoke with another device active: %v", err)
	}
}

func TestRevokeOtherUsersDevice(t *testing.T) {
	svc, db, _ := newService(t)
	a := setUp(t, svc)
	// A second user, inserted directly (M1 has no way to create one).
	other := newID()
	if _, err := db.DB().Exec(`INSERT INTO users (id, role, kdf_salt, kdf_ops, kdf_mem, master_key_password,
		master_key_recovery, identity_public_key, identity_key_enc, dedupe_key_enc, created_at)
		VALUES (?, 'member', x'00', 2, 1, x'00', x'00', x'00', x'00', x'00', 0)`, other); err != nil {
		t.Fatal(err)
	}
	if err := svc.Revoke(context.Background(), other, a.id); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("other user revoking A: %v, want ErrNotFound", err)
	}
	if err := svc.Revoke(context.Background(), a.userID, newID()); !errors.Is(err, store.ErrNotFound) {
		t.Errorf("unknown device: %v, want ErrNotFound", err)
	}
	if list, _ := svc.Devices(context.Background(), other); len(list) != 0 {
		t.Errorf("other user sees %d devices", len(list))
	}
}
