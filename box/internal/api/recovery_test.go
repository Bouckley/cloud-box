package api

import (
	"crypto/ed25519"
	"crypto/rand"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/Bouckley/cloud-box/box/internal/boxcrypto"
)

func (o owner) recoveryPub() []byte { return o.recovery.Public().(ed25519.PublicKey) }

func (e *env) recoveryChallenge(pub []byte) string {
	e.t.Helper()
	rec := e.call(http.MethodPost, "/v1/recovery/challenge", "", map[string]any{"recoveryPublicKey": pub})
	if rec.Code != http.StatusOK {
		e.t.Fatalf("recovery challenge = %d %s", rec.Code, rec.Body)
	}
	var ch struct {
		Challenge string    `json:"challenge"`
		ExpiresAt time.Time `json:"expiresAt"`
	}
	decodeInto(e.t, rec, &ch)
	if ch.ExpiresAt.IsZero() {
		e.t.Error("recovery challenge has no expiresAt")
	}
	return ch.Challenge
}

func resetBody(pub []byte, ch string, sig []byte, deviceID string, devicePub []byte) map[string]any {
	return map[string]any{
		"recoveryPublicKey": pub, "challenge": ch, "signature": sig,
		"device": map[string]any{"id": deviceID, "signPublicKey": devicePub},
	}
}

func TestRecoveryResetHandler(t *testing.T) {
	e := newEnv(t)
	o := e.setUpOwner()
	ch := e.recoveryChallenge(o.recoveryPub())
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	id := newID()
	sig := ed25519.Sign(o.recovery, boxcrypto.RecoverMessage(id, pub, ch))
	if rec := e.call(http.MethodPost, "/v1/recovery/reset", "", resetBody(o.recoveryPub(), ch, sig, id, pub)); rec.Code != http.StatusNoContent {
		t.Fatalf("reset = %d %s", rec.Code, rec.Body)
	}
	if rec := e.call(http.MethodGet, "/v1/account", o.token, nil); rec.Code != http.StatusUnauthorized {
		t.Errorf("old token after reset = %d, want 401", rec.Code)
	}
	tok := e.login(id, priv)
	rec := e.call(http.MethodGet, "/v1/devices", tok, nil)
	var list struct {
		Devices []struct {
			ID        string  `json:"id"`
			NameEnc   *string `json:"nameEnc"`
			RevokedAt *string `json:"revokedAt"`
		} `json:"devices"`
	}
	decodeInto(t, rec, &list)
	for _, d := range list.Devices {
		if d.ID == id && (d.NameEnc != nil || d.RevokedAt != nil) {
			t.Errorf("new device = %+v, want nameEnc null and active", d)
		}
		if d.ID == o.deviceID && d.RevokedAt == nil {
			t.Error("old device still active after reset")
		}
	}
}

func TestResetResponseRevealsNothing(t *testing.T) {
	e := newEnv(t)
	o := e.setUpOwner()
	pub, _, _ := ed25519.GenerateKey(rand.Reader)

	// Unknown recovery key: challenge refused.
	unknown := e.call(http.MethodPost, "/v1/recovery/challenge", "", map[string]any{"recoveryPublicKey": randBytes(32)})

	// Bad signature.
	ch := e.recoveryChallenge(o.recoveryPub())
	id := newID()
	_, wrong, _ := ed25519.GenerateKey(rand.Reader)
	badSig := e.call(http.MethodPost, "/v1/recovery/reset", "",
		resetBody(o.recoveryPub(), ch, ed25519.Sign(wrong, boxcrypto.RecoverMessage(id, pub, ch)), id, pub))

	// Expired challenge.
	ch = e.recoveryChallenge(o.recoveryPub())
	e.sim.Advance(61 * time.Second)
	expired := e.call(http.MethodPost, "/v1/recovery/reset", "",
		resetBody(o.recoveryPub(), ch, ed25519.Sign(o.recovery, boxcrypto.RecoverMessage(id, pub, ch)), id, pub))

	// Unknown key at reset (a challenge that was never issued to it).
	unknownReset := e.call(http.MethodPost, "/v1/recovery/reset", "",
		resetBody(randBytes(32), ch, randBytes(64), id, pub))

	for name, rec := range map[string]int{"bad signature": badSig.Code, "expired": expired.Code, "unknown key": unknown.Code, "unknown key at reset": unknownReset.Code} {
		if rec != http.StatusUnauthorized {
			t.Errorf("%s = %d, want 401", name, rec)
		}
	}
	want := unknown.Body.String()
	for name, body := range map[string]string{"bad signature": badSig.Body.String(), "expired": expired.Body.String(), "unknown key at reset": unknownReset.Body.String()} {
		if body != want {
			t.Errorf("%s body %q differs from unknown-key body %q", name, body, want)
		}
	}
	if rec := e.call(http.MethodGet, "/v1/account", o.token, nil); rec.Code != http.StatusOK {
		t.Errorf("owner's session after failed resets = %d, want 200", rec.Code)
	}
}

func TestRecoveryBadShapes(t *testing.T) {
	e := newEnv(t)
	o := e.setUpOwner()
	pub, _, _ := ed25519.GenerateKey(rand.Reader)
	ch := e.recoveryChallenge(o.recoveryPub())
	sig := ed25519.Sign(o.recovery, boxcrypto.RecoverMessage(newID(), pub, ch))
	cases := map[string]struct {
		path string
		body any
	}{
		"challenge short key": {"/v1/recovery/challenge", map[string]any{"recoveryPublicKey": randBytes(31)}},
		"reset short key":     {"/v1/recovery/reset", resetBody(randBytes(31), ch, sig, newID(), pub)},
		"reset bad challenge": {"/v1/recovery/reset", resetBody(o.recoveryPub(), "zz", sig, newID(), pub)},
		"reset short sig":     {"/v1/recovery/reset", resetBody(o.recoveryPub(), ch, sig[:63], newID(), pub)},
		"reset bad device id": {"/v1/recovery/reset", resetBody(o.recoveryPub(), ch, sig, "nope", pub)},
		"reset short dev key": {"/v1/recovery/reset", resetBody(o.recoveryPub(), ch, sig, newID(), pub[:31])},
	}
	for name, c := range cases {
		if rec := e.call(http.MethodPost, c.path, "", c.body); rec.Code != http.StatusBadRequest {
			t.Errorf("%s = %d, want 400: %s", name, rec.Code, rec.Body)
		}
	}
}

func TestResetReusedDeviceID(t *testing.T) {
	e := newEnv(t)
	o := e.setUpOwner()
	pub, _, _ := ed25519.GenerateKey(rand.Reader)
	ch := e.recoveryChallenge(o.recoveryPub())
	sig := ed25519.Sign(o.recovery, boxcrypto.RecoverMessage(o.deviceID, pub, ch))
	if rec := e.call(http.MethodPost, "/v1/recovery/reset", "", resetBody(o.recoveryPub(), ch, sig, o.deviceID, pub)); rec.Code != http.StatusConflict {
		t.Errorf("reset with a reused id = %d, want 409: %s", rec.Code, rec.Body)
	}
}

func TestChangePasswordHandler(t *testing.T) {
	e := newEnv(t)
	o := e.setUpOwner()
	kdf := map[string]any{"salt": randBytes(16), "opsLimit": 4, "memLimitBytes": 134217728}
	wrap := randBytes(72)
	if rec := e.call(http.MethodPut, "/v1/account/password", o.token, map[string]any{"kdf": kdf, "masterKeyByPassword": wrap}); rec.Code != http.StatusNoContent {
		t.Fatalf("change password = %d %s", rec.Code, rec.Body)
	}
	rec := e.call(http.MethodGet, "/v1/account", o.token, nil)
	var acct struct {
		KDF                 struct{ OpsLimit int } `json:"kdf"`
		MasterKeyByPassword []byte                 `json:"masterKeyByPassword"`
	}
	decodeInto(t, rec, &acct)
	if acct.KDF.OpsLimit != 4 || string(acct.MasterKeyByPassword) != string(wrap) {
		t.Errorf("account after change = %+v", acct)
	}

	bad := map[string]any{"kdf": map[string]any{"salt": randBytes(16), "opsLimit": 1, "memLimitBytes": 134217728}, "masterKeyByPassword": wrap}
	if rec := e.call(http.MethodPut, "/v1/account/password", o.token, bad); rec.Code != http.StatusBadRequest {
		t.Errorf("ops 1 = %d, want 400", rec.Code)
	}
	short := map[string]any{"kdf": kdf, "masterKeyByPassword": randBytes(71)}
	if rec := e.call(http.MethodPut, "/v1/account/password", o.token, short); rec.Code != http.StatusBadRequest {
		t.Errorf("short wrap = %d, want 400", rec.Code)
	}
	if rec := e.call(http.MethodPut, "/v1/account/password", "", map[string]any{"kdf": kdf, "masterKeyByPassword": wrap}); rec.Code != http.StatusUnauthorized {
		t.Errorf("no session = %d, want 401", rec.Code)
	}
}

func TestRenameDeviceHandler(t *testing.T) {
	e := newEnv(t)
	o := e.setUpOwner()
	name := randBytes(60)
	rec := e.call(http.MethodPatch, "/v1/devices/"+o.deviceID, o.token, map[string]any{"nameEnc": name})
	if rec.Code != http.StatusOK {
		t.Fatalf("rename = %d %s", rec.Code, rec.Body)
	}
	var d struct {
		ID      string `json:"id"`
		NameEnc []byte `json:"nameEnc"`
	}
	decodeInto(t, rec, &d)
	if d.ID != o.deviceID || string(d.NameEnc) != string(name) {
		t.Errorf("renamed = %+v", d)
	}
	if rec := e.call(http.MethodPatch, "/v1/devices/"+newID(), o.token, map[string]any{"nameEnc": name}); rec.Code != http.StatusNotFound {
		t.Errorf("unknown device = %d, want 404", rec.Code)
	}
	if rec := e.call(http.MethodPatch, "/v1/devices/"+o.deviceID, o.token, map[string]any{"nameEnc": randBytes(10)}); rec.Code != http.StatusBadRequest {
		t.Errorf("short name = %d, want 400", rec.Code)
	}
	if rec := e.call(http.MethodPatch, "/v1/devices/"+o.deviceID, o.token, map[string]any{}); rec.Code != http.StatusBadRequest {
		t.Errorf("missing name = %d, want 400", rec.Code)
	}
}

func TestPairWithoutNameHandler(t *testing.T) {
	e := newEnv(t)
	o := e.setUpOwner()
	rec := e.call(http.MethodPost, "/v1/devices/pairing-codes", o.token, nil)
	var pc struct{ Code string }
	decodeInto(t, rec, &pc)
	pub, _, _ := ed25519.GenerateKey(rand.Reader)
	id := newID()
	rec = e.call(http.MethodPost, "/v1/devices/pair", "", map[string]any{
		"code": pc.Code, "device": map[string]any{"id": id, "signPublicKey": pub},
	})
	if rec.Code != http.StatusCreated {
		t.Fatalf("pair without name = %d %s", rec.Code, rec.Body)
	}
	rec = e.call(http.MethodGet, "/v1/devices", o.token, nil)
	if body := rec.Body.String(); !strings.Contains(body, `"nameEnc":null`) {
		t.Errorf("devices = %s, want the new device's nameEnc as null", body)
	}
	rec = e.call(http.MethodGet, "/v1/status", o.token, nil)
	if body := rec.Body.String(); !strings.Contains(body, `"nameEnc":null`) {
		t.Errorf("status = %s, want the new device's nameEnc as null", body)
	}
}
