package api

import (
	"crypto/ed25519"
	"crypto/rand"
	"net/http"
	"strings"
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

// An ordinary session can only read. Every write needs the owner: a device
// key alone could otherwise overwrite fileKeyEnc with junk and make photos
// unreadable for good (final review C1).
func TestOrdinarySessionIsReadOnly(t *testing.T) {
	e := newEnv(t)
	o := e.setUpOwner()
	for _, p := range []string{"/v1/account", "/v1/devices", "/v1/items", "/v1/trash", "/v1/collections"} {
		if rec := e.call(http.MethodGet, p, o.plain, nil); rec.Code != http.StatusOK {
			t.Fatalf("GET %s = %d", p, rec.Code)
		}
	}
	lookup := map[string]any{"dedupeHashes": []string{newID() + newID()}}
	if rec := e.call(http.MethodPost, "/v1/items/lookup", o.plain, lookup); rec.Code != http.StatusOK {
		t.Fatalf("lookup = %d %s", rec.Code, rec.Body)
	}

	album := e.createCollection(o.token, newCollectionBody("album", nil))
	blob := e.uploadBlob(o.token, randBytes(80))
	it := e.createItem(o.token, newItemBody(album.ID, map[string]string{"original": e.uploadBlob(o.token, randBytes(80))}))
	trashed := e.trashedItem(o.token)
	cases := []struct {
		method, path string
		body         any
	}{
		{http.MethodPatch, "/v1/items/" + it.ID, map[string]any{"fileKeyEnc": randBytes(72)}},
		{http.MethodPatch, "/v1/items/" + it.ID, map[string]any{"metadataEnc": randBytes(72)}},
		{http.MethodPost, "/v1/items", newItemBody(album.ID, map[string]string{"original": blob})},
		{http.MethodDelete, "/v1/items/" + it.ID, nil},
		{http.MethodPost, "/v1/items/" + trashed + "/restore", nil},
		{http.MethodPost, "/v1/collections", newCollectionBody("album", nil)},
		{http.MethodPatch, "/v1/collections/" + album.ID, map[string]any{"nameEnc": randBytes(40)}},
		{http.MethodDelete, "/v1/collections/" + album.ID, nil},
		{http.MethodPatch, "/v1/devices/" + o.deviceID, map[string]any{"nameEnc": randBytes(40)}},
		{http.MethodPost, "/v1/uploads", map[string]any{"size": 10}},
		{http.MethodPut, "/v1/uploads/x/parts/0", nil},
		{http.MethodPost, "/v1/uploads/x/complete", nil},
	}
	for _, c := range cases {
		rec := e.call(c.method, c.path, o.plain, c.body)
		if rec.Code != http.StatusForbidden || !strings.Contains(rec.Body.String(), "owner_required") {
			t.Errorf("%s %s as ordinary = %d %s, want 403 owner_required", c.method, c.path, rec.Code, rec.Body)
		}
	}
	// Nothing changed.
	if n := e.count("items WHERE trashed_at IS NULL"); n != 1 {
		t.Fatalf("live items = %d, want 1", n)
	}
	if n := e.count("collections WHERE deleted_at IS NULL"); n != 2 {
		t.Fatalf("collections = %d, want 2", n)
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
