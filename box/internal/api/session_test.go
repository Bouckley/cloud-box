package api

import (
	"crypto/ed25519"
	"crypto/rand"
	"net/http"
	"testing"
	"time"

	"github.com/Bouckley/cloud-box/box/internal/boxcrypto"
)

// owner is a set-up owner with a signed-in device.
type owner struct {
	userID, deviceID, token string
	key                     ed25519.PrivateKey
}

// setUpOwner runs setup and logs in over HTTP.
func (e *env) setUpOwner() owner {
	e.t.Helper()
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	body := setupBody(pub)
	if rec := e.call(http.MethodPost, "/v1/setup", "", body); rec.Code != http.StatusCreated {
		e.t.Fatalf("setup = %d %s", rec.Code, rec.Body)
	}
	o := owner{userID: user(body)["id"].(string), deviceID: device(body)["id"].(string), key: priv}
	o.token = e.login(o.deviceID, priv)
	return o
}

func (e *env) login(deviceID string, key ed25519.PrivateKey) string {
	e.t.Helper()
	rec := e.call(http.MethodPost, "/v1/auth/challenge", "", map[string]string{"deviceId": deviceID})
	if rec.Code != http.StatusOK {
		e.t.Fatalf("challenge = %d %s", rec.Code, rec.Body)
	}
	var ch struct {
		Challenge string    `json:"challenge"`
		ExpiresAt time.Time `json:"expiresAt"`
	}
	decodeInto(e.t, rec, &ch)
	sig := ed25519.Sign(key, boxcrypto.AuthMessage(deviceID, ch.Challenge))
	rec = e.call(http.MethodPost, "/v1/auth/verify", "", map[string]any{
		"deviceId": deviceID, "challenge": ch.Challenge, "signature": sig,
	})
	if rec.Code != http.StatusOK {
		e.t.Fatalf("verify = %d %s", rec.Code, rec.Body)
	}
	var sess struct {
		Token     string    `json:"token"`
		ExpiresAt time.Time `json:"expiresAt"`
	}
	decodeInto(e.t, rec, &sess)
	if sess.ExpiresAt.IsZero() || sess.ExpiresAt.Location() != time.UTC {
		e.t.Errorf("session expiresAt = %v, want a UTC time", sess.ExpiresAt)
	}
	return sess.Token
}

func TestLoginAndAccount(t *testing.T) {
	e := newEnv(t)
	o := e.setUpOwner()
	rec := e.call(http.MethodGet, "/v1/account", o.token, nil)
	if rec.Code != http.StatusOK {
		t.Fatalf("account = %d %s", rec.Code, rec.Body)
	}
	var acct map[string]any
	decodeInto(t, rec, &acct)
	if acct["id"] != o.userID || acct["role"] != "owner" {
		t.Errorf("account = %v", acct)
	}
}

func TestUnauthorized(t *testing.T) {
	e := newEnv(t)
	o := e.setUpOwner()
	cases := map[string]string{
		"no header":     "",
		"garbled token": "Bearer not-a-token",
		"unknown token": "Bearer AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
		"wrong scheme":  "Basic " + o.token,
		"no scheme":     o.token,
	}
	for name, header := range cases {
		r := newRequest(http.MethodGet, "/v1/account")
		if header != "" {
			r.Header.Set("Authorization", header)
		}
		rec := serve(e, r)
		if rec.Code != http.StatusUnauthorized {
			t.Errorf("%s: status = %d, want 401", name, rec.Code)
			continue
		}
		assertError(t, decode(t, rec), "unauthorized")
		if rec.Header().Get("WWW-Authenticate") != "Bearer" {
			t.Errorf("%s: WWW-Authenticate = %q", name, rec.Header().Get("WWW-Authenticate"))
		}
	}

	e.sim.Advance(time.Hour + time.Second)
	if rec := e.call(http.MethodGet, "/v1/account", o.token, nil); rec.Code != http.StatusUnauthorized {
		t.Errorf("expired session: status = %d, want 401", rec.Code)
	}
}

func TestLoginFailuresAre401(t *testing.T) {
	e := newEnv(t)
	o := e.setUpOwner()
	if rec := e.call(http.MethodPost, "/v1/auth/challenge", "", map[string]string{"deviceId": newID()}); rec.Code != http.StatusUnauthorized {
		t.Errorf("unknown device challenge = %d, want 401", rec.Code)
	}
	rec := e.call(http.MethodPost, "/v1/auth/challenge", "", map[string]string{"deviceId": o.deviceID})
	var ch struct{ Challenge string }
	decodeInto(t, rec, &ch)
	rec = e.call(http.MethodPost, "/v1/auth/verify", "", map[string]any{
		"deviceId": o.deviceID, "challenge": ch.Challenge, "signature": make([]byte, 64),
	})
	if rec.Code != http.StatusUnauthorized {
		t.Errorf("bad signature = %d, want 401", rec.Code)
	}
}

func TestLoginBadShapes(t *testing.T) {
	e := newEnv(t)
	o := e.setUpOwner()
	for name, body := range map[string]any{
		"challenge: bad id":       map[string]string{"deviceId": "x"},
		"verify: short challenge": map[string]any{"deviceId": o.deviceID, "challenge": "ab", "signature": make([]byte, 64)},
		"verify: signature 63":    map[string]any{"deviceId": o.deviceID, "challenge": newID() + newID(), "signature": make([]byte, 63)},
	} {
		path := "/v1/auth/verify"
		if name[:9] == "challenge" {
			path = "/v1/auth/challenge"
		}
		if rec := e.call(http.MethodPost, path, "", body); rec.Code != http.StatusBadRequest {
			t.Errorf("%s: status = %d, want 400", name, rec.Code)
		}
	}
}

// RFC 7235: the auth scheme is case-insensitive.
func TestBearerSchemeCaseInsensitive(t *testing.T) {
	e := newEnv(t)
	o := e.setUpOwner()
	for _, scheme := range []string{"bearer", "BEARER", "Bearer"} {
		r := newRequest(http.MethodGet, "/v1/account")
		r.Header.Set("Authorization", scheme+" "+o.token)
		if rec := serve(e, r); rec.Code != http.StatusOK {
			t.Errorf("scheme %q: status = %d, want 200", scheme, rec.Code)
		}
	}
}
