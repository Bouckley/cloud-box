package auth

import (
	"bytes"
	"context"
	"errors"
	"testing"
	"time"
)

func TestSetupNeedsButton(t *testing.T) {
	svc, db, s := newServiceNoPress(t)
	if svc.SetupOpen(s.HAL().Clock.Now()) {
		t.Error("SetupOpen = true before any press")
	}
	if _, err := svc.Setup(context.Background(), testUser(), testDevice(randBytes(32))); !errors.Is(err, ErrPressButton) {
		t.Fatalf("Setup error = %v, want ErrPressButton", err)
	}
	var n int
	if err := db.DB().QueryRow("SELECT count(*) FROM users").Scan(&n); err != nil || n != 0 {
		t.Errorf("users = %d (%v), want 0", n, err)
	}
}

func TestSetupWindowCloses(t *testing.T) {
	svc, _, s := newServiceNoPress(t)
	svc.OpenSetupWindow(s.HAL().Clock.Now())
	s.Advance(SetupWindow - time.Second)
	if !svc.SetupOpen(s.HAL().Clock.Now()) {
		t.Error("SetupOpen = false 1 s before the window ends")
	}
	s.Advance(2 * time.Second)
	if svc.SetupOpen(s.HAL().Clock.Now()) {
		t.Error("SetupOpen = true 1 s after the window ended")
	}
	if _, err := svc.Setup(context.Background(), testUser(), testDevice(randBytes(32))); !errors.Is(err, ErrPressButton) {
		t.Fatalf("Setup error = %v, want ErrPressButton", err)
	}
}

func TestSetupAfterPress(t *testing.T) {
	svc, db, s := newServiceNoPress(t)
	svc.OpenSetupWindow(s.HAL().Clock.Now())
	u := testUser()
	acct, err := svc.Setup(context.Background(), u, testDevice(randBytes(32)))
	if err != nil {
		t.Fatalf("Setup: %v", err)
	}
	if acct.RecoveryPublicKey != nil {
		t.Error("Setup returned the recovery public key; the Account shape does not carry it")
	}
	var rpk []byte
	if err := db.DB().QueryRow("SELECT recovery_public_key FROM users WHERE id = ?", u.ID).Scan(&rpk); err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(rpk, u.RecoveryPublicKey) {
		t.Errorf("recovery_public_key = %x, want %x", rpk, u.RecoveryPublicKey)
	}
	if svc.SetupOpen(s.HAL().Clock.Now()) {
		t.Error("SetupOpen = true after setup succeeded")
	}
}

func TestSetupAlreadyDoneBeatsButton(t *testing.T) {
	svc, _, s := newService(t)
	ctx := context.Background()
	if _, err := svc.Setup(ctx, testUser(), testDevice(randBytes(32))); err != nil {
		t.Fatal(err)
	}
	s.Advance(SetupWindow + time.Minute)
	if _, err := svc.Setup(ctx, testUser(), testDevice(randBytes(32))); !errors.Is(err, ErrAlreadySetUp) {
		t.Fatalf("Setup error = %v, want ErrAlreadySetUp", err)
	}
}
