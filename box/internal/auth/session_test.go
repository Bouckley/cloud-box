package auth

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"errors"
	"regexp"
	"testing"
	"time"

	"github.com/Bouckley/cloud-box/box/internal/boxcrypto"
)

// device is a set-up user's device with its signing key.
type device struct {
	userID, id string
	key        ed25519.PrivateKey
	owner      ed25519.PrivateKey // the owner key (ADR 0010); nil for paired devices
}

func setUp(t *testing.T, svc *Service) device {
	t.Helper()
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	opub, opriv, _ := ed25519.GenerateKey(rand.Reader)
	u, d := testUser(), testDevice(pub)
	u.OwnerPublicKey = opub
	if _, err := svc.Setup(context.Background(), u, d); err != nil {
		t.Fatal(err)
	}
	return device{userID: u.ID, id: d.ID, key: priv, owner: opriv}
}

func login(t *testing.T, svc *Service, d device) (string, error) {
	t.Helper()
	ctx := context.Background()
	ch, _, err := svc.Challenge(ctx, d.id)
	if err != nil {
		return "", err
	}
	token, _, err := svc.Verify(ctx, d.id, ch, ed25519.Sign(d.key, boxcrypto.AuthMessage(d.id, ch)), nil)
	return token, err
}

// loginOwner logs in with the device key and the owner key (ADR 0010).
func loginOwner(t *testing.T, svc *Service, d device, ownerKey ed25519.PrivateKey) (string, error) {
	t.Helper()
	ctx := context.Background()
	ch, _, err := svc.Challenge(ctx, d.id)
	if err != nil {
		return "", err
	}
	token, _, err := svc.Verify(ctx, d.id, ch, ed25519.Sign(d.key, boxcrypto.AuthMessage(d.id, ch)),
		ed25519.Sign(ownerKey, boxcrypto.OwnerMessage(d.id, ch)))
	return token, err
}

func TestLoginHappyPath(t *testing.T) {
	svc, db, sim := newService(t)
	d := setUp(t, svc)
	ctx := context.Background()

	ch, expires, err := svc.Challenge(ctx, d.id)
	if err != nil {
		t.Fatal(err)
	}
	if !regexp.MustCompile(`^[0-9a-f]{64}$`).MatchString(ch) {
		t.Errorf("challenge %q is not 32 bytes of hex", ch)
	}
	if got := expires.Sub(sim.HAL().Clock.Now()); got <= 59*time.Second || got > ChallengeTTL {
		t.Errorf("challenge valid for %v, want %v", got, ChallengeTTL)
	}

	token, tokenExpires, err := svc.Verify(ctx, d.id, ch, ed25519.Sign(d.key, boxcrypto.AuthMessage(d.id, ch)), nil)
	if err != nil {
		t.Fatalf("Verify: %v", err)
	}
	if !regexp.MustCompile(`^[A-Za-z0-9_-]{43}$`).MatchString(token) {
		t.Errorf("token %q is not 43 base64url chars", token)
	}
	if got := tokenExpires.Sub(sim.HAL().Clock.Now()); got <= 59*time.Minute || got > SessionTTL {
		t.Errorf("session valid for %v, want %v", got, SessionTTL)
	}

	sess, err := svc.Authenticate(ctx, token)
	if err != nil || sess.UserID != d.userID || sess.DeviceID != d.id || sess.Owner {
		t.Fatalf("Authenticate = %+v, %v", sess, err)
	}

	// Only the SHA-256 of the token is stored, and the token itself is nowhere in the DB.
	sum := sha256.Sum256([]byte(token))
	var n int
	if err := db.DB().QueryRow("SELECT count(*) FROM sessions WHERE token_hash = ?", sum[:]).Scan(&n); err != nil || n != 1 {
		t.Errorf("sessions with the token hash = %d (%v), want 1", n, err)
	}
	assertNotInDB(t, db.DB(), []byte(token))
}

func TestChallengeSingleUse(t *testing.T) {
	svc, _, _ := newService(t)
	d := setUp(t, svc)
	ctx := context.Background()
	ch, _, _ := svc.Challenge(ctx, d.id)
	sig := ed25519.Sign(d.key, boxcrypto.AuthMessage(d.id, ch))
	if _, _, err := svc.Verify(ctx, d.id, ch, sig, nil); err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.Verify(ctx, d.id, ch, sig, nil); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("replayed challenge: %v, want ErrUnauthorized", err)
	}
}

func TestFailedVerifyUsesUpChallenge(t *testing.T) {
	svc, _, _ := newService(t)
	d := setUp(t, svc)
	ctx := context.Background()
	ch, _, _ := svc.Challenge(ctx, d.id)
	if _, _, err := svc.Verify(ctx, d.id, ch, make([]byte, 64), nil); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("bad signature: %v", err)
	}
	if _, _, err := svc.Verify(ctx, d.id, ch, ed25519.Sign(d.key, boxcrypto.AuthMessage(d.id, ch)), nil); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("challenge reusable after a failed attempt: %v", err)
	}
}

func TestChallengeExpires(t *testing.T) {
	svc, _, sim := newService(t)
	d := setUp(t, svc)
	ctx := context.Background()
	ch, _, _ := svc.Challenge(ctx, d.id)
	sim.Advance(61 * time.Second)
	if _, _, err := svc.Verify(ctx, d.id, ch, ed25519.Sign(d.key, boxcrypto.AuthMessage(d.id, ch)), nil); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("expired challenge: %v, want ErrUnauthorized", err)
	}
}

func TestWrongSignatureOrDevice(t *testing.T) {
	svc, db, _ := newService(t)
	a := setUp(t, svc)
	ctx := context.Background()

	// A second device of the same user, added directly.
	bPub, bKey, _ := ed25519.GenerateKey(rand.Reader)
	b := device{userID: a.userID, id: newID(), key: bKey}
	if _, err := db.DB().Exec(`INSERT INTO devices (id, user_id, name_enc, sign_public_key, created_at, last_seen)
		VALUES (?, ?, x'00', ?, 0, 0)`, b.id, a.userID, []byte(bPub)); err != nil {
		t.Fatal(err)
	}

	cases := map[string]func(ch string) []byte{
		"signed for another device id": func(ch string) []byte { return ed25519.Sign(a.key, boxcrypto.AuthMessage(b.id, ch)) },
		"signed with another key":      func(ch string) []byte { return ed25519.Sign(b.key, boxcrypto.AuthMessage(a.id, ch)) },
		"signed another challenge": func(string) []byte {
			return ed25519.Sign(a.key, boxcrypto.AuthMessage(a.id, string(bytes.Repeat([]byte("0"), 64))))
		},
		"short signature": func(string) []byte { return []byte{1, 2, 3} },
	}
	for name, sign := range cases {
		ch, _, err := svc.Challenge(ctx, a.id)
		if err != nil {
			t.Fatal(err)
		}
		if _, _, err := svc.Verify(ctx, a.id, ch, sign(ch), nil); !errors.Is(err, ErrUnauthorized) {
			t.Errorf("%s: %v, want ErrUnauthorized", name, err)
		}
	}

	// A challenge issued for device A cannot be used by device B.
	ch, _, _ := svc.Challenge(ctx, a.id)
	if _, _, err := svc.Verify(ctx, b.id, ch, ed25519.Sign(b.key, boxcrypto.AuthMessage(b.id, ch)), nil); !errors.Is(err, ErrUnauthorized) {
		t.Errorf("A's challenge used by B: %v", err)
	}

	// Unknown and revoked devices get the same error from Challenge.
	if _, _, err := svc.Challenge(ctx, newID()); !errors.Is(err, ErrUnauthorized) {
		t.Errorf("unknown device: %v", err)
	}
	if _, err := db.DB().Exec("UPDATE devices SET revoked_at = 1 WHERE id = ?", b.id); err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.Challenge(ctx, b.id); !errors.Is(err, ErrUnauthorized) {
		t.Errorf("revoked device: %v", err)
	}
}

func TestRevokedBetweenChallengeAndVerify(t *testing.T) {
	svc, db, _ := newService(t)
	d := setUp(t, svc)
	ctx := context.Background()
	ch, _, _ := svc.Challenge(ctx, d.id)
	if _, err := db.DB().Exec("UPDATE devices SET revoked_at = 1 WHERE id = ?", d.id); err != nil {
		t.Fatal(err)
	}
	if _, _, err := svc.Verify(ctx, d.id, ch, ed25519.Sign(d.key, boxcrypto.AuthMessage(d.id, ch)), nil); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("revoked device verified: %v", err)
	}
}

func TestSessionExpires(t *testing.T) {
	svc, _, sim := newService(t)
	d := setUp(t, svc)
	token, err := login(t, svc, d)
	if err != nil {
		t.Fatal(err)
	}
	sim.Advance(SessionTTL + time.Second)
	if _, err := svc.Authenticate(context.Background(), token); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("expired session: %v, want ErrUnauthorized", err)
	}
}

func TestAuthenticateUnknownToken(t *testing.T) {
	svc, _, _ := newService(t)
	setUp(t, svc)
	if _, err := svc.Authenticate(context.Background(), "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("unknown token: %v", err)
	}
}

func TestVerifyUpdatesLastSeen(t *testing.T) {
	svc, db, sim := newService(t)
	d := setUp(t, svc)
	sim.Advance(10 * time.Minute)
	if _, err := login(t, svc, d); err != nil {
		t.Fatal(err)
	}
	var lastSeen int64
	if err := db.DB().QueryRow("SELECT last_seen FROM devices WHERE id = ?", d.id).Scan(&lastSeen); err != nil {
		t.Fatal(err)
	}
	if now := sim.HAL().Clock.Now().UnixMilli(); now-lastSeen > 5000 {
		t.Errorf("last_seen not updated: %d vs now %d", lastSeen, now)
	}
}

func TestPendingChallengesCapped(t *testing.T) {
	svc, _, _ := newService(t)
	d := setUp(t, svc)
	ctx := context.Background()
	first, _, _ := svc.Challenge(ctx, d.id)
	for range maxPendingChallenges {
		if _, _, err := svc.Challenge(ctx, d.id); err != nil {
			t.Fatal(err)
		}
	}
	if n := svc.pendingChallenges(); n != maxPendingChallenges {
		t.Errorf("pending = %d, want %d", n, maxPendingChallenges)
	}
	// The oldest was evicted.
	if _, _, err := svc.Verify(ctx, d.id, first, ed25519.Sign(d.key, boxcrypto.AuthMessage(d.id, first)), nil); !errors.Is(err, ErrUnauthorized) {
		t.Errorf("evicted challenge still works: %v", err)
	}
}

// A session row of a revoked device must be useless even if it was never
// deleted (e.g. Verify raced Revoke). Pins the revoked_at check in Authenticate.
func TestSessionOfRevokedDeviceRejected(t *testing.T) {
	svc, db, _ := newService(t)
	d := setUp(t, svc)
	token, err := login(t, svc, d)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := db.DB().Exec("UPDATE devices SET revoked_at = 1 WHERE id = ?", d.id); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Authenticate(context.Background(), token); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("session of a revoked device: %v, want ErrUnauthorized", err)
	}
}
