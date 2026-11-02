package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func do(t *testing.T, method, path string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	NewRouter("test").ServeHTTP(rec, httptest.NewRequest(method, path, nil))
	return rec
}

func decode(t *testing.T, rec *httptest.ResponseRecorder) map[string]string {
	t.Helper()
	if ct := rec.Header().Get("Content-Type"); ct != "application/json" {
		t.Fatalf("Content-Type = %q, want application/json", ct)
	}
	var body map[string]string
	if err := json.Unmarshal(rec.Body.Bytes(), &body); err != nil {
		t.Fatalf("body %q is not a JSON object of strings: %v", rec.Body.String(), err)
	}
	return body
}

func TestHealth(t *testing.T) {
	rec := do(t, http.MethodGet, "/v1/health")
	if rec.Code != http.StatusOK {
		t.Fatalf("status = %d, want 200", rec.Code)
	}
	body := decode(t, rec)
	if body["status"] != "ok" || body["version"] != "test" || len(body) != 2 {
		t.Fatalf("body = %v, want {status: ok, version: test}", body)
	}
}

func TestHealthWrongMethod(t *testing.T) {
	rec := do(t, http.MethodPost, "/v1/health")
	if rec.Code != http.StatusMethodNotAllowed {
		t.Fatalf("status = %d, want 405", rec.Code)
	}
	if allow := rec.Header().Get("Allow"); allow != "GET, HEAD" && allow != "GET" {
		t.Errorf("Allow = %q, want GET", allow)
	}
	assertError(t, decode(t, rec), "method_not_allowed")
}

func TestUnknownPath(t *testing.T) {
	rec := do(t, http.MethodGet, "/v1/nope")
	if rec.Code != http.StatusNotFound {
		t.Fatalf("status = %d, want 404", rec.Code)
	}
	assertError(t, decode(t, rec), "not_found")
}

func assertError(t *testing.T, body map[string]string, code string) {
	t.Helper()
	if body["code"] != code {
		t.Errorf("code = %q, want %q", body["code"], code)
	}
	for _, k := range []string{"message", "action"} {
		if body[k] == "" {
			t.Errorf("error body missing %q: %v", k, body)
		}
	}
}
