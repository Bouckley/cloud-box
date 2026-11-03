package auth

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"errors"
	"testing"
	"time"

	"github.com/Bouckley/cloud-box/box/internal/boxcrypto"
	"github.com/Bouckley/cloud-box/box/internal/store"
)

// owner is a set-up user whose recovery signing key the test holds.
type owner struct {
	device
	recoveryPub  []byte
	recoveryPriv ed25519.PrivateKey
}

func setUpWithRecovery(t *testing.T, svc *Service) owner {
	t.Helper()
	rpub, rpriv, _ := ed25519.GenerateKey(rand.Reader)
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	u, d := testUser(), testDevice(pub)
	u.RecoveryPublicKey = rpub
	if _, err := svc.Setup(context.Background(), u, d); err != nil {
		t.Fatal(err)
	}
	return owner{device: device{userID: u.ID, id: d.ID, key: priv}, recoveryPub: rpub, recoveryPriv: rpriv}
}

// reset runs a full recovery reset for o, adding a new device with no name.
func reset(t *testing.T, svc *Service, o owner) (device, error) {
	t.Helper()
	ctx := context.Background()
	ch, _, err := svc.RecoveryChallenge(ctx, o.recoveryPub)
	if err != nil {
		return device{}, err
	}
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	nd := NewDevice{ID: newID(), SignPublicKey: pub}
	sig := ed25519.Sign(o.recoveryPriv, boxcrypto.RecoverMessage(nd.ID, ch))
	if err := svc.RecoveryReset(ctx, o.recoveryPub, ch, sig, nd); err != nil {
		return device{}, err
	}
	return device{userID: o.userID, id: nd.ID, key: priv}, nil
}

func TestRecoveryResetRevokesEveryDevice(t *testing.T) {
	svc, _, _ := newService(t)
	ctx := context.Background()
	a := setUpWithRecovery(t, svc)
	b := pairNew(t, svc, sessionOf(a.device))
	tokA, err := login(t, svc, a.device)
	if err != nil {
		t.Fatal(err)
	}
	tokB, err := login(t, svc, b)
	if err != nil {
		t.Fatal(err)
	}
	code, _, err := svc.CreatePairingCode(ctx, sessionOf(b))
	if err != nil {
		t.Fatal(err)
	}

	c, err := reset(t, svc, a)
	if err != nil {
		t.Fatalf("reset: %v", err)
	}
	for name, tok := range map[string]string{"A": tokA, "B": tokB} {
		if _, err := svc.Authenticate(ctx, tok); !errors.Is(err, ErrUnauthorized) {
			t.Errorf("device %s token after reset: %v, want ErrUnauthorized", name, err)
		}
	}
	if _, err := login(t, svc, b); !errors.Is(err, ErrUnauthorized) {
		t.Errorf("device B login after reset: %v, want ErrUnauthorized", err)
	}
	pub, _, _ := ed25519.GenerateKey(rand.Reader)
	if _, err := svc.Pair(ctx, code, testDevice(pub)); !errors.Is(err, ErrUnauthorized) {
		t.Errorf("pairing code after reset: %v, want ErrUnauthorized", err)
	}
	if _, err := login(t, svc, c); err != nil {
		t.Fatalf("new device cannot log in: %v", err)
	}
	devices, err := svc.Devices(ctx, a.userID)
	if err != nil {
		t.Fatal(err)
	}
	active := 0
	for _, d := range devices {
		if d.RevokedAt == nil {
			active++
			if d.ID != c.id {
				t.Errorf("active device %s, want only %s", d.ID, c.id)
			}
			if d.NameEnc != nil {
				t.Errorf("new device nameEnc = %x, want nil until it sets one", d.NameEnc)
			}
		}
	}
	if active != 1 || len(devices) != 3 {
		t.Errorf("%d devices, %d active; want 3 and 1", len(devices), active)
	}
}

func TestRecoveryChallengeUnknownKey(t *testing.T) {
	svc, _, _ := newService(t)
	setUpWithRecovery(t, svc)
	if _, _, err := svc.RecoveryChallenge(context.Background(), randBytes(32)); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("unknown key: %v, want ErrUnauthorized", err)
	}
}

func TestRecoveryChallengeSingleUse(t *testing.T) {
	svc, _, _ := newService(t)
	ctx := context.Background()
	o := setUpWithRecovery(t, svc)
	ch, _, err := svc.RecoveryChallenge(ctx, o.recoveryPub)
	if err != nil {
		t.Fatal(err)
	}
	pub, _, _ := ed25519.GenerateKey(rand.Reader)
	nd := NewDevice{ID: newID(), SignPublicKey: pub}
	sig := ed25519.Sign(o.recoveryPriv, boxcrypto.RecoverMessage(nd.ID, ch))
	if err := svc.RecoveryReset(ctx, o.recoveryPub, ch, sig, nd); err != nil {
		t.Fatal(err)
	}
	nd2 := NewDevice{ID: newID(), SignPublicKey: pub}
	sig2 := ed25519.Sign(o.recoveryPriv, boxcrypto.RecoverMessage(nd2.ID, ch))
	if err := svc.RecoveryReset(ctx, o.recoveryPub, ch, sig2, nd2); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("second use of a challenge: %v, want ErrUnauthorized", err)
	}
}

func TestRecoveryChallengeExpires(t *testing.T) {
	svc, _, s := newService(t)
	ctx := context.Background()
	o := setUpWithRecovery(t, svc)
	ch, expires, err := svc.RecoveryChallenge(ctx, o.recoveryPub)
	if err != nil {
		t.Fatal(err)
	}
	if got := expires.Sub(s.HAL().Clock.Now()); got <= 59*time.Second || got > 60*time.Second {
		t.Errorf("challenge valid for %v, want 60 s", got)
	}
	s.Advance(61 * time.Second)
	pub, _, _ := ed25519.GenerateKey(rand.Reader)
	nd := NewDevice{ID: newID(), SignPublicKey: pub}
	sig := ed25519.Sign(o.recoveryPriv, boxcrypto.RecoverMessage(nd.ID, ch))
	if err := svc.RecoveryReset(ctx, o.recoveryPub, ch, sig, nd); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("expired challenge: %v, want ErrUnauthorized", err)
	}
}

func TestRecoveryWrongSignature(t *testing.T) {
	svc, _, _ := newService(t)
	ctx := context.Background()
	o := setUpWithRecovery(t, svc)
	ch, _, err := svc.RecoveryChallenge(ctx, o.recoveryPub)
	if err != nil {
		t.Fatal(err)
	}
	_, wrongKey, _ := ed25519.GenerateKey(rand.Reader)
	pub, _, _ := ed25519.GenerateKey(rand.Reader)
	nd := NewDevice{ID: newID(), SignPublicKey: pub}
	sig := ed25519.Sign(wrongKey, boxcrypto.RecoverMessage(nd.ID, ch))
	if err := svc.RecoveryReset(ctx, o.recoveryPub, ch, sig, nd); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("wrong signature: %v, want ErrUnauthorized", err)
	}
	if _, err := login(t, svc, o.device); err != nil {
		t.Errorf("original device revoked by a failed reset: %v", err)
	}
}

func TestRecoverySignatureBindsDevice(t *testing.T) {
	svc, _, _ := newService(t)
	ctx := context.Background()
	o := setUpWithRecovery(t, svc)
	ch, _, err := svc.RecoveryChallenge(ctx, o.recoveryPub)
	if err != nil {
		t.Fatal(err)
	}
	pub, _, _ := ed25519.GenerateKey(rand.Reader)
	devA := NewDevice{ID: newID(), SignPublicKey: pub}
	devB := NewDevice{ID: newID(), SignPublicKey: pub}
	sig := ed25519.Sign(o.recoveryPriv, boxcrypto.RecoverMessage(devA.ID, ch))
	if err := svc.RecoveryReset(ctx, o.recoveryPub, ch, sig, devB); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("signature for A used with B: %v, want ErrUnauthorized", err)
	}
	if _, err := login(t, svc, o.device); err != nil {
		t.Errorf("original device revoked by a failed reset: %v", err)
	}
}

func TestRecoveryResetReusedDeviceID(t *testing.T) {
	svc, _, _ := newService(t)
	ctx := context.Background()
	o := setUpWithRecovery(t, svc)
	ch, _, err := svc.RecoveryChallenge(ctx, o.recoveryPub)
	if err != nil {
		t.Fatal(err)
	}
	pub, _, _ := ed25519.GenerateKey(rand.Reader)
	nd := NewDevice{ID: o.id, SignPublicKey: pub} // the existing device's id
	sig := ed25519.Sign(o.recoveryPriv, boxcrypto.RecoverMessage(nd.ID, ch))
	if err := svc.RecoveryReset(ctx, o.recoveryPub, ch, sig, nd); !errors.Is(err, store.ErrIDTaken) {
		t.Fatalf("reused id: %v, want ErrIDTaken", err)
	}
	if _, err := login(t, svc, o.device); err != nil {
		t.Errorf("a failed reset revoked the original device: %v", err)
	}
}

func TestRecoveryChallengesCapped(t *testing.T) {
	svc, _, _ := newService(t)
	ctx := context.Background()
	o := setUpWithRecovery(t, svc)
	first, _, err := svc.RecoveryChallenge(ctx, o.recoveryPub)
	if err != nil {
		t.Fatal(err)
	}
	for range maxPendingRecoveryChallenges {
		if _, _, err := svc.RecoveryChallenge(ctx, o.recoveryPub); err != nil {
			t.Fatal(err)
		}
	}
	pub, _, _ := ed25519.GenerateKey(rand.Reader)
	nd := NewDevice{ID: newID(), SignPublicKey: pub}
	sig := ed25519.Sign(o.recoveryPriv, boxcrypto.RecoverMessage(nd.ID, first))
	if err := svc.RecoveryReset(ctx, o.recoveryPub, first, sig, nd); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("oldest challenge after the cap: %v, want ErrUnauthorized (dropped)", err)
	}
}
