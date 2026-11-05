package auth

import (
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"errors"
	"testing"

	"github.com/Bouckley/cloud-box/box/internal/boxcrypto"
)

// ADR 0010: a login that also carries the owner key's signature is an owner
// session; one with only the device key is not.
func TestOwnerSession(t *testing.T) {
	svc, _, _ := newService(t)
	d := setUp(t, svc)
	ctx := context.Background()

	plain, err := login(t, svc, d)
	if err != nil {
		t.Fatal(err)
	}
	sess, err := svc.Authenticate(ctx, plain)
	if err != nil || sess.Owner {
		t.Fatalf("device-key login: owner = %v, err %v; want an ordinary session", sess.Owner, err)
	}

	tok, err := loginOwner(t, svc, d, d.owner)
	if err != nil {
		t.Fatal(err)
	}
	sess, err = svc.Authenticate(ctx, tok)
	if err != nil || !sess.Owner {
		t.Fatalf("owner login: owner = %v, err %v; want an owner session", sess.Owner, err)
	}
}

// A wrong owner signature fails the whole login, as any login failure does.
func TestBadOwnerSignatureFailsLogin(t *testing.T) {
	svc, _, _ := newService(t)
	d := setUp(t, svc)
	_, stranger, _ := ed25519.GenerateKey(rand.Reader)
	before := countRows(t, svc, "sessions")
	if _, err := loginOwner(t, svc, d, stranger); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("stranger's owner key: err = %v, want ErrUnauthorized", err)
	}
	// Signed over another device's id: bound to this login, so it fails too.
	ctx := context.Background()
	ch, _, _ := svc.Challenge(ctx, d.id)
	_, _, err := svc.Verify(ctx, d.id, ch, ed25519.Sign(d.key, boxcrypto.AuthMessage(d.id, ch)),
		ed25519.Sign(d.owner, boxcrypto.OwnerMessage(newID(), ch)))
	if !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("owner signature for another device: err = %v, want ErrUnauthorized", err)
	}
	if after := countRows(t, svc, "sessions"); after != before {
		t.Fatalf("sessions %d → %d after failed logins", before, after)
	}
}

// Setup keeps the owner public key; Account does not hand it out.
func TestSetupStoresOwnerKey(t *testing.T) {
	svc, db, _ := newService(t)
	d := setUp(t, svc)
	var pub []byte
	if err := db.DB().QueryRow("SELECT owner_public_key FROM users WHERE id = ?", d.userID).Scan(&pub); err != nil {
		t.Fatal(err)
	}
	if !ed25519.PublicKey(pub).Equal(d.owner.Public()) {
		t.Fatal("owner_public_key is not the owner key's public half")
	}
	acct, err := svc.Account(context.Background(), d.userID)
	if err != nil || acct.OwnerPublicKey != nil {
		t.Fatalf("Account carries ownerPublicKey %x (err %v)", acct.OwnerPublicKey, err)
	}
}

// An account from before migration 0003 has no owner key: it can log in as a
// device, but never as owner.
func TestNoOwnerKeyNoOwnerSession(t *testing.T) {
	svc, db, _ := newService(t)
	d := setUp(t, svc)
	if _, err := db.DB().Exec("UPDATE users SET owner_public_key = NULL WHERE id = ?", d.userID); err != nil {
		t.Fatal(err)
	}
	if _, err := login(t, svc, d); err != nil {
		t.Fatalf("device login: %v", err)
	}
	if _, err := loginOwner(t, svc, d, d.owner); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("owner login without a stored key: err = %v, want ErrUnauthorized", err)
	}
}

// Lock ends the session on the box: the token stops working at once.
func TestEndSession(t *testing.T) {
	svc, _, _ := newService(t)
	d := setUp(t, svc)
	ctx := context.Background()
	tok, err := loginOwner(t, svc, d, d.owner)
	if err != nil {
		t.Fatal(err)
	}
	other, _ := login(t, svc, d)
	sess, err := svc.Authenticate(ctx, tok)
	if err != nil {
		t.Fatal(err)
	}
	if err := svc.EndSession(ctx, sess); err != nil {
		t.Fatal(err)
	}
	if _, err := svc.Authenticate(ctx, tok); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("ended token: err = %v, want ErrUnauthorized", err)
	}
	if _, err := svc.Authenticate(ctx, other); err != nil {
		t.Fatalf("another session of the same device ended too: %v", err)
	}
}

func countRows(t *testing.T, svc *Service, table string) int {
	t.Helper()
	var n int
	if err := svc.db.DB().QueryRow("SELECT count(*) FROM " + table).Scan(&n); err != nil {
		t.Fatal(err)
	}
	return n
}
