package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestReadJSON(t *testing.T) {
	type body struct {
		Name string `json:"name"`
	}
	run := func(raw string) (*httptest.ResponseRecorder, bool, body) {
		var v body
		rec := httptest.NewRecorder()
		ok := readJSON(rec, httptest.NewRequest(http.MethodPost, "/", strings.NewReader(raw)), &v)
		return rec, ok, v
	}

	if rec, ok, v := run(`{"name":"a"}`); !ok || v.Name != "a" || rec.Body.Len() != 0 {
		t.Errorf("valid body: ok=%v v=%+v written=%q", ok, v, rec.Body.String())
	}
	for _, raw := range []string{`{"name":"a","extra":1}`, `{"name":`, `{"name":"a"} {"name":"b"}`, ``} {
		rec, ok, _ := run(raw)
		if ok || rec.Code != http.StatusBadRequest {
			t.Errorf("%q: ok=%v status=%d, want 400", raw, ok, rec.Code)
		}
		assertError(t, decode(t, rec), "invalid_request")
	}
	big := `{"name":"` + strings.Repeat("a", 1<<20) + `"}`
	rec, ok, _ := run(big)
	if ok || rec.Code != http.StatusRequestEntityTooLarge {
		t.Errorf("1 MiB+ body: ok=%v status=%d, want 413", ok, rec.Code)
	}
	assertError(t, decode(t, rec), "payload_too_large")
}

func TestValidators(t *testing.T) {
	good := "0123456789abcdef0123456789abcdef"
	if !validID(good) {
		t.Error("validID rejected a valid id")
	}
	for _, bad := range []string{"", good[:31], good + "0", strings.ToUpper(good), "g" + good[1:]} {
		if validID(bad) {
			t.Errorf("validID(%q) = true", bad)
		}
	}
	if !validHex(strings.Repeat("ab", 32), 32) || validHex(strings.Repeat("AB", 32), 32) || validHex("ab", 32) {
		t.Error("validHex wrong")
	}

	if err := checkLen("fileKeyEnc", make([]byte, 72), 72, 72); err != nil {
		t.Errorf("72 bytes: %v", err)
	}
	err := checkLen("fileKeyEnc", make([]byte, 71), 72, 72)
	if err == nil || !strings.Contains(err.Error(), "fileKeyEnc") {
		t.Errorf("71 bytes: err = %v, want one naming fileKeyEnc", err)
	}
}
