package api

import (
	"crypto/ed25519"
	"crypto/rand"
	"net/http"
	"testing"

	"github.com/Bouckley/cloud-box/box/internal/boxcrypto"
)

// ADR 0010: changing the password, revoking or pairing devices and deleting
// forever need an owner session. A session from the device key alone (a
// locked browser, a fresh pairing, a copied profile) gets 403.
func TestOwnerRequired(t *testing.T) {
	e := newEnv(t)
	o := e.setUpOwner()
	other, _ := e.pairDevice(o)
	item := e.trashedItem(o.token)

	password := map[string]any{
		"kdf":                 map[string]any{"salt": randBytes(16), "opsLimit": 3, "memLimitBytes": 268435456},
		"masterKeyByPassword": randBytes(72),
	}
	cases := []struct {
		name, method, path string
		body               any
		want               int
	}{
		{"change password", http.MethodPut, "/v1/account/password", password, http.StatusNoContent},
		{"pairing code", http.MethodPost, "/v1/devices/pairing-codes", nil, http.StatusCreated},
		{"revoke", http.MethodDelete, "/v1/devices/" + other, nil, http.StatusNoContent},
		{"delete forever", http.MethodDelete, "/v1/trash/" + item, nil, http.StatusNoContent},
	}
	for _, c := range cases {
		rec := e.call(c.method, c.path, o.plain, c.body)
		assertCode(t, rec, http.StatusForbidden, "owner_required")
	}
	// Nothing happened: the device is active and the item still in Trash.
	if n := e.count("devices WHERE revoked_at IS NULL"); n != 2 {
		t.Fatalf("active devices = %d, want 2", n)
	}
	if n := e.count("items WHERE trashed_at IS NOT NULL"); n != 1 {
		t.Fatalf("trashed items = %d, want 1", n)
	}
	for _, c := range cases {
		if rec := e.call(c.method, c.path, o.token, c.body); rec.Code != c.want {
			t.Fatalf("%s as owner = %d %s, want %d", c.name, rec.Code, rec.Body, c.want)
		}
	}
}

// Everyday actions still work with an ordinary session.
func TestOrdinarySessionReadsAndTrashes(t *testing.T) {
	e := newEnv(t)
	o := e.setUpOwner()
	for _, p := range []string{"/v1/account", "/v1/devices", "/v1/items", "/v1/trash"} {
		if rec := e.call(http.MethodGet, p, o.plain, nil); rec.Code != http.StatusOK {
			t.Fatalf("GET %s = %d", p, rec.Code)
		}
	}
	item := e.trashedItem(o.plain)
	if rec := e.call(http.MethodPost, "/v1/items/"+item+"/restore", o.plain, nil); rec.Code/100 != 2 {
		t.Fatalf("restore = %d %s", rec.Code, rec.Body)
	}
}

// A wrong owner signature is the same 401 as any failed login.
func TestBadOwnerSignatureIs401(t *testing.T) {
	e := newEnv(t)
	o := e.setUpOwner()
	_, stranger, _ := ed25519.GenerateKey(rand.Reader)
	rec := e.call(http.MethodPost, "/v1/auth/challenge", "", map[string]string{"deviceId": o.deviceID})
	var ch struct{ Challenge string }
	decodeInto(t, rec, &ch)
	rec = e.call(http.MethodPost, "/v1/auth/verify", "", map[string]any{
		"deviceId":       o.deviceID,
		"challenge":      ch.Challenge,
		"signature":      ed25519.Sign(o.key, boxcrypto.AuthMessage(o.deviceID, ch.Challenge)),
		"ownerSignature": ed25519.Sign(stranger, boxcrypto.OwnerMessage(o.deviceID, ch.Challenge)),
	})
	assertCode(t, rec, http.StatusUnauthorized, "unauthorized")
	rec = e.call(http.MethodPost, "/v1/auth/verify", "", map[string]any{
		"deviceId": o.deviceID, "challenge": ch.Challenge,
		"signature": randBytes(64), "ownerSignature": randBytes(10),
	})
	assertCode(t, rec, http.StatusBadRequest, "invalid_request")
}

// Lock: DELETE /v1/auth/session ends this token at once.
func TestEndSessionHandler(t *testing.T) {
	e := newEnv(t)
	o := e.setUpOwner()
	if rec := e.call(http.MethodDelete, "/v1/auth/session", o.token, nil); rec.Code != http.StatusNoContent {
		t.Fatalf("end session = %d %s", rec.Code, rec.Body)
	}
	assertCode(t, e.call(http.MethodGet, "/v1/account", o.token, nil), http.StatusUnauthorized, "unauthorized")
	if rec := e.call(http.MethodGet, "/v1/account", o.plain, nil); rec.Code != http.StatusOK {
		t.Fatalf("the device's other session ended too: %d", rec.Code)
	}
}

// Setup needs the owner public key.
func TestSetupNeedsOwnerKey(t *testing.T) {
	e := newEnv(t)
	body := setupBody(randBytes(32))
	delete(user(body), "ownerPublicKey")
	assertCode(t, e.call(http.MethodPost, "/v1/setup", "", body), http.StatusBadRequest, "invalid_request")
	user(body)["ownerPublicKey"] = randBytes(31)
	assertCode(t, e.call(http.MethodPost, "/v1/setup", "", body), http.StatusBadRequest, "invalid_request")
}

// trashedItem creates an item with token and moves it to Trash.
func (e *env) trashedItem(token string) string {
	e.t.Helper()
	album := e.createCollection(token, newCollectionBody("album", nil))
	it := e.createItem(token, newItemBody(album.ID, map[string]string{"original": e.uploadBlob(token, randBytes(80))}))
	if rec := e.call(http.MethodDelete, "/v1/items/"+it.ID, token, nil); rec.Code != http.StatusNoContent {
		e.t.Fatalf("trash = %d %s", rec.Code, rec.Body)
	}
	return it.ID
}
