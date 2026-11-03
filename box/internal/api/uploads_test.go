package api

import (
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"net/http"
	"testing"

	"github.com/Bouckley/cloud-box/box/internal/blobs"
)

type uploadJSON struct {
	ID        string `json:"id"`
	Size      int64  `json:"size"`
	SHA256    string `json:"sha256"`
	PartBytes int    `json:"partBytes"`
	PartCount int    `json:"partCount"`
	Received  []int  `json:"received"`
	ExpiresAt string `json:"expiresAt"`
}

type blobJSON struct {
	ID     string `json:"id"`
	Size   int64  `json:"size"`
	SHA256 string `json:"sha256"`
	State  string `json:"state"`
}

func shaHex(b []byte) string {
	sum := sha256.Sum256(b)
	return hex.EncodeToString(sum[:])
}

// uploadBlob uploads data in parts and completes it, returning the blob id.
func (e *env) uploadBlob(token string, data []byte) string {
	e.t.Helper()
	rec := e.call(http.MethodPost, "/v1/uploads", token, map[string]any{"size": len(data), "sha256": shaHex(data)})
	if rec.Code != http.StatusCreated {
		e.t.Fatalf("create upload = %d %s", rec.Code, rec.Body)
	}
	var up uploadJSON
	decodeInto(e.t, rec, &up)
	for n := range up.PartCount {
		end := min((n+1)*up.PartBytes, len(data))
		rec := e.raw(http.MethodPut, fmt.Sprintf("/v1/uploads/%s/parts/%d", up.ID, n), token, data[n*up.PartBytes:end])
		if rec.Code != http.StatusNoContent {
			e.t.Fatalf("part %d = %d %s", n, rec.Code, rec.Body)
		}
	}
	rec = e.call(http.MethodPost, "/v1/uploads/"+up.ID+"/complete", token, nil)
	if rec.Code != http.StatusCreated {
		e.t.Fatalf("complete = %d %s", rec.Code, rec.Body)
	}
	var b blobJSON
	decodeInto(e.t, rec, &b)
	return b.ID
}

func TestUploadHandlers(t *testing.T) {
	e := newEnv(t)
	o := e.setUpOwner()
	data := randBytes(blobs.PartBytes + 5)

	rec := e.call(http.MethodPost, "/v1/uploads", o.token, map[string]any{"size": len(data), "sha256": shaHex(data)})
	if rec.Code != http.StatusCreated {
		t.Fatalf("create = %d %s", rec.Code, rec.Body)
	}
	var up uploadJSON
	decodeInto(t, rec, &up)
	if up.PartBytes != 8388608 || up.PartCount != 2 || up.Received == nil || up.ExpiresAt == "" || up.SHA256 != shaHex(data) {
		t.Fatalf("upload = %+v", up)
	}

	if rec := e.raw(http.MethodPut, "/v1/uploads/"+up.ID+"/parts/1", o.token, data[blobs.PartBytes:]); rec.Code != http.StatusNoContent {
		t.Fatalf("part 1 = %d %s", rec.Code, rec.Body)
	}
	rec = e.call(http.MethodGet, "/v1/uploads/"+up.ID, o.token, nil)
	decodeInto(t, rec, &up)
	if len(up.Received) != 1 || up.Received[0] != 1 {
		t.Errorf("received = %v, want [1]", up.Received)
	}

	rec = e.call(http.MethodPost, "/v1/uploads/"+up.ID+"/complete", o.token, nil)
	if rec.Code != http.StatusConflict {
		t.Fatalf("complete with a part missing = %d, want 409", rec.Code)
	}
	assertError(t, decode(t, rec), "upload_incomplete")

	if rec := e.raw(http.MethodPut, "/v1/uploads/"+up.ID+"/parts/0", o.token, data[:blobs.PartBytes]); rec.Code != http.StatusNoContent {
		t.Fatalf("part 0 = %d %s", rec.Code, rec.Body)
	}
	rec = e.call(http.MethodPost, "/v1/uploads/"+up.ID+"/complete", o.token, nil)
	if rec.Code != http.StatusCreated {
		t.Fatalf("complete = %d %s", rec.Code, rec.Body)
	}
	var b blobJSON
	decodeInto(t, rec, &b)
	if b.State != "verified" || b.Size != int64(len(data)) || b.SHA256 != shaHex(data) || len(b.ID) != 32 {
		t.Errorf("blob = %+v", b)
	}

	// Retry after a lost response: same blob, 200.
	rec = e.call(http.MethodPost, "/v1/uploads/"+up.ID+"/complete", o.token, nil)
	var again blobJSON
	decodeInto(t, rec, &again)
	if rec.Code != http.StatusOK || again.ID != b.ID {
		t.Errorf("retried complete = %d %+v, want 200 with blob %s", rec.Code, again, b.ID)
	}
}

func TestUploadBadInput(t *testing.T) {
	e := newEnv(t)
	o := e.setUpOwner()
	for name, body := range map[string]map[string]any{
		"size 0":        {"size": 0, "sha256": shaHex(nil)},
		"size > 64 GiB": {"size": blobs.MaxBlobBytes + 1, "sha256": shaHex(nil)},
		"bad sha":       {"size": 10, "sha256": "abc"},
		"missing sha":   {"size": 10},
	} {
		if rec := e.call(http.MethodPost, "/v1/uploads", o.token, body); rec.Code != http.StatusBadRequest {
			t.Errorf("%s: %d, want 400", name, rec.Code)
		}
	}

	data := randBytes(10)
	rec := e.call(http.MethodPost, "/v1/uploads", o.token, map[string]any{"size": 10, "sha256": shaHex(data)})
	var up uploadJSON
	decodeInto(t, rec, &up)
	for name, c := range map[string]struct {
		path string
		body []byte
	}{
		"wrong size part": {"/v1/uploads/" + up.ID + "/parts/0", randBytes(9)},
		"part too big":    {"/v1/uploads/" + up.ID + "/parts/0", randBytes(blobs.PartBytes + 1)},
		"part number":     {"/v1/uploads/" + up.ID + "/parts/x", data},
		"negative part":   {"/v1/uploads/" + up.ID + "/parts/-1", data},
		"bad upload id":   {"/v1/uploads/nope/parts/0", data},
	} {
		if rec := e.raw(http.MethodPut, c.path, o.token, c.body); rec.Code != http.StatusBadRequest {
			t.Errorf("%s: %d, want 400 (%s)", name, rec.Code, rec.Body)
		}
	}
}

func TestUploadHashMismatchHandler(t *testing.T) {
	e := newEnv(t)
	o := e.setUpOwner()
	rec := e.call(http.MethodPost, "/v1/uploads", o.token, map[string]any{"size": 4, "sha256": shaHex([]byte("nope"))})
	var up uploadJSON
	decodeInto(t, rec, &up)
	e.raw(http.MethodPut, "/v1/uploads/"+up.ID+"/parts/0", o.token, []byte("data"))
	rec = e.call(http.MethodPost, "/v1/uploads/"+up.ID+"/complete", o.token, nil)
	if rec.Code != http.StatusUnprocessableEntity {
		t.Fatalf("complete = %d, want 422", rec.Code)
	}
	assertError(t, decode(t, rec), "hash_mismatch")
}

func TestStorageFullHandler(t *testing.T) {
	e := newEnv(t)
	o := e.setUpOwner()
	if err := e.sim.SetFill("main", 100); err != nil {
		t.Fatal(err)
	}
	rec := e.call(http.MethodPost, "/v1/uploads", o.token, map[string]any{"size": 10, "sha256": shaHex(nil)})
	if rec.Code != http.StatusInsufficientStorage {
		t.Fatalf("status = %d, want 507", rec.Code)
	}
	assertError(t, decode(t, rec), "storage_full")
}

func TestUploadRoutesNeedSession(t *testing.T) {
	e := newEnv(t)
	o := e.setUpOwner()
	id := newID()
	for _, c := range []struct{ method, path string }{
		{http.MethodPost, "/v1/uploads"},
		{http.MethodGet, "/v1/uploads/" + id},
		{http.MethodPut, "/v1/uploads/" + id + "/parts/0"},
		{http.MethodPost, "/v1/uploads/" + id + "/complete"},
	} {
		if rec := e.raw(c.method, c.path, "", nil); rec.Code != http.StatusUnauthorized {
			t.Errorf("%s %s = %d, want 401", c.method, c.path, rec.Code)
		}
	}
	// A real token but someone else's (unknown) upload id → 404.
	if rec := e.call(http.MethodGet, "/v1/uploads/"+id, o.token, nil); rec.Code != http.StatusNotFound {
		t.Errorf("unknown upload = %d, want 404", rec.Code)
	}
}
