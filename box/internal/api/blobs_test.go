package api

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"testing"
)

func (e *env) getBlob(token, id, rangeHeader string) *httpResponse {
	e.t.Helper()
	r := newRequest(http.MethodGet, "/v1/blobs/"+id)
	if token != "" {
		r.Header.Set("Authorization", "Bearer "+token)
	}
	if rangeHeader != "" {
		r.Header.Set("Range", rangeHeader)
	}
	return serve(e, r)
}

type httpResponse = httptest.ResponseRecorder

func TestGetBlobFull(t *testing.T) {
	e := newEnv(t)
	o := e.setUpOwner()
	data := randBytes(5000)
	id := e.uploadBlob(o.token, data)

	rec := e.getBlob(o.token, id, "")
	if rec.Code != http.StatusOK || !bytes.Equal(rec.Body.Bytes(), data) {
		t.Fatalf("status = %d, body %d bytes", rec.Code, rec.Body.Len())
	}
	for k, want := range map[string]string{
		"Content-Type":           "application/octet-stream",
		"ETag":                   `"` + shaHex(data) + `"`,
		"Accept-Ranges":          "bytes",
		"X-Content-Type-Options": "nosniff",
		"Cache-Control":          "private, no-store",
	} {
		if got := rec.Header().Get(k); got != want {
			t.Errorf("%s = %q, want %q", k, got, want)
		}
	}
}

func TestGetBlobRange(t *testing.T) {
	e := newEnv(t)
	o := e.setUpOwner()
	data := randBytes(5000)
	id := e.uploadBlob(o.token, data)

	rec := e.getBlob(o.token, id, "bytes=10-19")
	if rec.Code != http.StatusPartialContent || !bytes.Equal(rec.Body.Bytes(), data[10:20]) {
		t.Fatalf("range: status = %d, body %x", rec.Code, rec.Body.Bytes())
	}
	if got := rec.Header().Get("Content-Range"); got != "bytes 10-19/5000" {
		t.Errorf("Content-Range = %q", got)
	}
	if rec := e.getBlob(o.token, id, "bytes=999999999-"); rec.Code != http.StatusRequestedRangeNotSatisfiable {
		t.Errorf("impossible range: status = %d, want 416", rec.Code)
	}
}

func TestGetBlobAccess(t *testing.T) {
	e := newEnv(t)
	o := e.setUpOwner()
	id := e.uploadBlob(o.token, randBytes(100))
	if rec := e.getBlob("", id, ""); rec.Code != http.StatusUnauthorized {
		t.Errorf("no session: %d, want 401", rec.Code)
	}
	if rec := e.getBlob(o.token, newID(), ""); rec.Code != http.StatusNotFound {
		t.Errorf("unknown blob: %d, want 404", rec.Code)
	}
	if rec := e.getBlob(o.token, "nope", ""); rec.Code != http.StatusBadRequest {
		t.Errorf("bad id: %d, want 400", rec.Code)
	}
}

// An impossible range is still the JSON error shape.
func TestGetBlobRangeErrorIsJSON(t *testing.T) {
	e := newEnv(t)
	o := e.setUpOwner()
	id := e.uploadBlob(o.token, randBytes(100))
	rec := e.getBlob(o.token, id, "bytes=999999999-")
	if rec.Code != http.StatusRequestedRangeNotSatisfiable {
		t.Fatalf("status = %d, want 416", rec.Code)
	}
	assertError(t, decode(t, rec), "range_not_satisfiable")
	if got := rec.Header().Get("Content-Range"); got != "bytes */100" {
		t.Errorf("Content-Range = %q, want bytes */100", got)
	}
}
