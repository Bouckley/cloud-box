package api

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSetupHandler(t *testing.T) {
	e := newEnv(t)
	body := setupBody(randBytes(32))
	rec := e.call(http.MethodPost, "/v1/setup", "", body)
	if rec.Code != http.StatusCreated {
		t.Fatalf("status = %d, body %s", rec.Code, rec.Body)
	}
	var acct map[string]any
	decodeInto(t, rec, &acct)
	user := body["user"].(map[string]any)
	if acct["id"] != user["id"] || acct["role"] != "owner" {
		t.Errorf("account = %v", acct)
	}
	// []byte fields travel as standard base64 (ADR 0004): 72 bytes → 96 chars.
	if s, _ := acct["masterKeyByPassword"].(string); len(s) != 96 {
		t.Errorf("masterKeyByPassword = %q, want 96 base64 chars", s)
	}
	for _, k := range []string{"kdf", "masterKeyByRecovery", "identityPublicKey", "identityKeyEnc", "dedupeKeyEnc"} {
		if _, ok := acct[k]; !ok {
			t.Errorf("account missing %s", k)
		}
	}
}

func TestSetupTwiceHandler(t *testing.T) {
	e := newEnv(t)
	if rec := e.call(http.MethodPost, "/v1/setup", "", setupBody(randBytes(32))); rec.Code != http.StatusCreated {
		t.Fatalf("first setup = %d", rec.Code)
	}
	rec := e.call(http.MethodPost, "/v1/setup", "", setupBody(randBytes(32)))
	if rec.Code != http.StatusConflict {
		t.Fatalf("second setup = %d, want 409", rec.Code)
	}
	assertError(t, decode(t, rec), "already_set_up")
}

func TestSetupValidates(t *testing.T) {
	cases := map[string]func(b map[string]any){
		"wrapped key 71 bytes": func(b map[string]any) { user(b)["masterKeyByPassword"] = randBytes(71) },
		"recovery key missing": func(b map[string]any) { delete(user(b), "masterKeyByRecovery") },
		"identity key enc 73":  func(b map[string]any) { user(b)["identityKeyEnc"] = randBytes(73) },
		"opsLimit 1":           func(b map[string]any) { kdf(b)["opsLimit"] = 1 },
		"opsLimit 11":          func(b map[string]any) { kdf(b)["opsLimit"] = 11 },
		"memLimit 2 GiB":       func(b map[string]any) { kdf(b)["memLimitBytes"] = 2 << 30 },
		"memLimit 32 MiB":      func(b map[string]any) { kdf(b)["memLimitBytes"] = 32 << 20 },
		"salt 15 bytes":        func(b map[string]any) { kdf(b)["salt"] = randBytes(15) },
		"user id ABC":          func(b map[string]any) { user(b)["id"] = "ABC" },
		"user id uppercase":    func(b map[string]any) { user(b)["id"] = "0123456789ABCDEF0123456789ABCDEF" },
		"device id missing":    func(b map[string]any) { delete(device(b), "id") },
		"sign key 31 bytes":    func(b map[string]any) { device(b)["signPublicKey"] = randBytes(31) },
		"identity pub 33":      func(b map[string]any) { user(b)["identityPublicKey"] = randBytes(33) },
		"name 40 bytes":        func(b map[string]any) { device(b)["nameEnc"] = randBytes(40) },
		"name 4097 bytes":      func(b map[string]any) { device(b)["nameEnc"] = randBytes(4097) },
		"device missing":       func(b map[string]any) { delete(b, "device") },
	}
	for name, breakIt := range cases {
		t.Run(name, func(t *testing.T) {
			e := newEnv(t)
			b := setupBody(randBytes(32))
			breakIt(b)
			rec := e.call(http.MethodPost, "/v1/setup", "", b)
			if rec.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want 400 (body %s)", rec.Code, rec.Body)
			}
			assertError(t, decode(t, rec), "invalid_request")
			if n := e.count("users") + e.count("devices"); n != 0 {
				t.Errorf("%d rows written", n)
			}
		})
	}
}

func user(b map[string]any) map[string]any   { return b["user"].(map[string]any) }
func device(b map[string]any) map[string]any { return b["device"].(map[string]any) }
func kdf(b map[string]any) map[string]any    { return user(b)["kdf"].(map[string]any) }

// A page on another site can post text/plain with no CORS preflight; the box
// must not read such a body, or that page could claim the box during setup.
func TestSetupRefusesNonJSONContentType(t *testing.T) {
	for _, ct := range []string{"", "text/plain", "text/plain;charset=UTF-8", "application/x-www-form-urlencoded", "multipart/form-data; boundary=x"} {
		e := newEnv(t)
		raw, _ := json.Marshal(setupBody(randBytes(32)))
		req := httptest.NewRequest(http.MethodPost, "/v1/setup", bytes.NewReader(raw))
		if ct != "" {
			req.Header.Set("Content-Type", ct)
		}
		rec := httptest.NewRecorder()
		e.router.ServeHTTP(rec, req)
		if rec.Code != http.StatusUnsupportedMediaType {
			t.Fatalf("Content-Type %q: status = %d, want 415", ct, rec.Code)
		}
		assertError(t, decode(t, rec), "unsupported_media_type")
		if n := e.count("users"); n != 0 {
			t.Fatalf("Content-Type %q: %d users created", ct, n)
		}
	}
	// application/json with parameters is still JSON.
	e := newEnv(t)
	raw, _ := json.Marshal(setupBody(randBytes(32)))
	req := httptest.NewRequest(http.MethodPost, "/v1/setup", bytes.NewReader(raw))
	req.Header.Set("Content-Type", "application/json; charset=utf-8")
	rec := httptest.NewRecorder()
	e.router.ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("application/json; charset=utf-8: status = %d", rec.Code)
	}
}
