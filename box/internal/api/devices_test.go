package api

import (
	"crypto/ed25519"
	"crypto/rand"
	"net/http"
	"testing"
)

// pairDevice pairs and logs in a new device for o over HTTP.
func (e *env) pairDevice(o owner) (deviceID, token string) {
	e.t.Helper()
	rec := e.call(http.MethodPost, "/v1/devices/pairing-codes", o.token, nil)
	if rec.Code != http.StatusCreated {
		e.t.Fatalf("pairing code = %d %s", rec.Code, rec.Body)
	}
	var pc struct{ Code, ExpiresAt string }
	decodeInto(e.t, rec, &pc)
	if pc.ExpiresAt == "" {
		e.t.Error("pairing code has no expiresAt")
	}
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	deviceID = newID()
	rec = e.call(http.MethodPost, "/v1/devices/pair", "", map[string]any{
		"code":   pc.Code,
		"device": map[string]any{"id": deviceID, "nameEnc": randBytes(60), "signPublicKey": pub},
	})
	if rec.Code != http.StatusCreated {
		e.t.Fatalf("pair = %d %s", rec.Code, rec.Body)
	}
	var paired struct{ UserID, DeviceID string }
	decodeInto(e.t, rec, &paired)
	if paired.UserID != o.userID || paired.DeviceID != deviceID {
		e.t.Errorf("paired = %+v", paired)
	}
	return deviceID, e.login(deviceID, priv)
}

func TestPairListRevoke(t *testing.T) {
	e := newEnv(t)
	o := e.setUpOwner()
	bID, bToken := e.pairDevice(o)

	rec := e.call(http.MethodGet, "/v1/devices", bToken, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("list = %d %s", rec.Code, rec.Body)
	}
	var list struct {
		Devices []map[string]any `json:"devices"`
	}
	decodeInto(t, rec, &list)
	if len(list.Devices) != 2 {
		t.Fatalf("devices = %v", list.Devices)
	}
	for _, d := range list.Devices {
		for _, k := range []string{"id", "nameEnc", "signPublicKey", "createdAt", "lastSeen", "revokedAt"} {
			if _, ok := d[k]; !ok {
				t.Errorf("device missing %s: %v", k, d)
			}
		}
	}

	if rec := e.call(http.MethodDelete, "/v1/devices/"+bID, o.token, nil); rec.Code != http.StatusNoContent {
		t.Fatalf("revoke = %d %s", rec.Code, rec.Body)
	}
	if rec := e.call(http.MethodGet, "/v1/devices", bToken, nil); rec.Code != http.StatusUnauthorized {
		t.Errorf("revoked device's token: %d, want 401", rec.Code)
	}
}

func TestRevokeLastDeviceHandler(t *testing.T) {
	e := newEnv(t)
	o := e.setUpOwner()
	rec := e.call(http.MethodDelete, "/v1/devices/"+o.deviceID, o.token, nil)
	if rec.Code != http.StatusConflict {
		t.Fatalf("revoke last = %d, want 409", rec.Code)
	}
	assertError(t, decode(t, rec), "last_device")
}

func TestDeviceRoutesNeedSession(t *testing.T) {
	e := newEnv(t)
	o := e.setUpOwner()
	for _, c := range []struct{ method, path string }{
		{http.MethodGet, "/v1/devices"},
		{http.MethodPost, "/v1/devices/pairing-codes"},
		{http.MethodDelete, "/v1/devices/" + o.deviceID},
	} {
		if rec := e.call(c.method, c.path, "", nil); rec.Code != http.StatusUnauthorized {
			t.Errorf("%s %s without session = %d, want 401", c.method, c.path, rec.Code)
		}
	}
}

func TestPairBadInput(t *testing.T) {
	e := newEnv(t)
	e.setUpOwner()
	dev := map[string]any{"id": newID(), "nameEnc": randBytes(60), "signPublicKey": randBytes(32)}
	cases := map[string]struct {
		body map[string]any
		want int
	}{
		"bad code format": {map[string]any{"code": "short", "device": dev}, http.StatusBadRequest},
		"unknown code":    {map[string]any{"code": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "device": dev}, http.StatusUnauthorized},
		"bad device":      {map[string]any{"code": "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA", "device": map[string]any{"id": "x"}}, http.StatusBadRequest},
	}
	for name, c := range cases {
		if rec := e.call(http.MethodPost, "/v1/devices/pair", "", c.body); rec.Code != c.want {
			t.Errorf("%s: %d, want %d (%s)", name, rec.Code, c.want, rec.Body)
		}
	}
	if rec := e.call(http.MethodDelete, "/v1/devices/not-an-id", "", nil); rec.Code != http.StatusUnauthorized && rec.Code != http.StatusBadRequest {
		t.Errorf("bad id without session: %d", rec.Code)
	}
}
