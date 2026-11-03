package api

import (
	"encoding/base64"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

type collectionJSON struct {
	ID        string     `json:"id"`
	Kind      string     `json:"kind"`
	ParentID  *string    `json:"parentId"`
	NameEnc   []byte     `json:"nameEnc"`
	KeyEnc    []byte     `json:"keyEnc"`
	DeletedAt *time.Time `json:"deletedAt"`
	Seq       int64      `json:"seq"`
}

func newCollectionBody(kind string, parent any) map[string]any {
	return map[string]any{
		"id": newID(), "kind": kind, "parentId": parent,
		"nameEnc": randBytes(50), "keyEnc": randBytes(72),
	}
}

func (e *env) createCollection(token string, body map[string]any) collectionJSON {
	e.t.Helper()
	rec := e.call(http.MethodPost, "/v1/collections", token, body)
	if rec.Code != http.StatusCreated {
		e.t.Fatalf("create collection: %d %s", rec.Code, rec.Body)
	}
	var c collectionJSON
	decodeInto(e.t, rec, &c)
	return c
}

func TestCollectionsAPI(t *testing.T) {
	e := newEnv(t)
	o := e.setUpOwner()
	folder := e.createCollection(o.token, newCollectionBody("folder", nil))
	sub := e.createCollection(o.token, newCollectionBody("folder", folder.ID))
	if sub.ParentID == nil || *sub.ParentID != folder.ID || sub.Seq <= folder.Seq {
		t.Errorf("sub = %+v", sub)
	}

	rec := e.call(http.MethodGet, "/v1/collections", o.token, nil)
	var list struct{ Collections []collectionJSON }
	decodeInto(t, rec, &list)
	if rec.Code != http.StatusOK || len(list.Collections) != 2 {
		t.Fatalf("list = %d %+v", rec.Code, list)
	}
	// parentId is always present, null at the root.
	if !strings.Contains(rec.Body.String(), `"parentId":null`) {
		t.Errorf("root collection must have parentId null: %s", rec.Body)
	}

	// Rename only, then move to root with an explicit null.
	name := randBytes(60)
	rec = e.call(http.MethodPatch, "/v1/collections/"+sub.ID, o.token, map[string]any{"nameEnc": name})
	var renamed collectionJSON
	decodeInto(t, rec, &renamed)
	if rec.Code != http.StatusOK || renamed.ParentID == nil || base64.StdEncoding.EncodeToString(renamed.NameEnc) != base64.StdEncoding.EncodeToString(name) {
		t.Fatalf("rename = %d %+v", rec.Code, renamed)
	}
	rec = e.call(http.MethodPatch, "/v1/collections/"+sub.ID, o.token, map[string]any{"parentId": nil})
	var moved collectionJSON
	decodeInto(t, rec, &moved)
	if rec.Code != http.StatusOK || moved.ParentID != nil {
		t.Fatalf("move to root = %d %+v", rec.Code, moved)
	}
}

func TestCollectionsAPIErrors(t *testing.T) {
	e := newEnv(t)
	o := e.setUpOwner()
	album := e.createCollection(o.token, newCollectionBody("album", nil))

	dup := newCollectionBody("album", nil)
	dup["id"] = album.ID
	assertCode(t, e.call(http.MethodPost, "/v1/collections", o.token, dup), http.StatusConflict, "id_taken")
	assertCode(t, e.call(http.MethodPost, "/v1/collections", o.token, newCollectionBody("folder", album.ID)),
		http.StatusConflict, "invalid_parent")
	assertCode(t, e.call(http.MethodPatch, "/v1/collections/"+newID(), o.token, map[string]any{"nameEnc": randBytes(50)}),
		http.StatusNotFound, "not_found")

	bad := map[string]map[string]any{
		"bad kind":    newCollectionBody("shelf", nil),
		"bad id":      func() map[string]any { b := newCollectionBody("album", nil); b["id"] = "ABC"; return b }(),
		"bad parent":  newCollectionBody("folder", "nope"),
		"short name":  func() map[string]any { b := newCollectionBody("album", nil); b["nameEnc"] = randBytes(40); return b }(),
		"short key":   func() map[string]any { b := newCollectionBody("album", nil); b["keyEnc"] = randBytes(71); return b }(),
		"missing key": func() map[string]any { b := newCollectionBody("album", nil); delete(b, "keyEnc"); return b }(),
	}
	for name, body := range bad {
		if rec := e.call(http.MethodPost, "/v1/collections", o.token, body); rec.Code != http.StatusBadRequest {
			t.Errorf("%s: %d, want 400", name, rec.Code)
		}
	}
	for name, body := range map[string]any{
		"empty patch": map[string]any{},
		"short name":  map[string]any{"nameEnc": randBytes(10)},
		"bad parent":  map[string]any{"parentId": "nope"},
		"unknown":     map[string]any{"kind": "folder"},
	} {
		if rec := e.call(http.MethodPatch, "/v1/collections/"+album.ID, o.token, body); rec.Code != http.StatusBadRequest {
			t.Errorf("patch %s: %d, want 400", name, rec.Code)
		}
	}
	if rec := e.call(http.MethodGet, "/v1/collections", "", nil); rec.Code != http.StatusUnauthorized {
		t.Errorf("no token: %d, want 401", rec.Code)
	}
}

// assertCode checks an error response's status and code.
func assertCode(t *testing.T, rec *httptest.ResponseRecorder, status int, code string) {
	t.Helper()
	if rec.Code != status {
		t.Errorf("status = %d, want %d (%s)", rec.Code, status, rec.Body)
		return
	}
	assertError(t, decode(t, rec), code)
}

func TestDeleteCollectionAPI(t *testing.T) {
	e := newEnv(t)
	o := e.setUpOwner()
	album := e.createCollection(o.token, newCollectionBody("album", nil))
	if !strings.Contains(e.call(http.MethodGet, "/v1/collections", o.token, nil).Body.String(), `"deletedAt":null`) {
		t.Errorf("live collection must list deletedAt null")
	}
	orig := e.uploadBlob(o.token, randBytes(300))
	it := e.createItem(o.token, newItemBody(album.ID, map[string]string{"original": orig}))
	assertCode(t, e.call(http.MethodDelete, "/v1/collections/"+album.ID, o.token, nil), http.StatusConflict, "collection_not_empty")

	if rec := e.call(http.MethodDelete, "/v1/items/"+it.ID, o.token, nil); rec.Code != http.StatusNoContent {
		t.Fatalf("trash = %d %s", rec.Code, rec.Body)
	}
	if rec := e.call(http.MethodDelete, "/v1/collections/"+album.ID, o.token, nil); rec.Code != http.StatusNoContent {
		t.Fatalf("delete = %d %s, want 204", rec.Code, rec.Body)
	}
	var list struct {
		Collections []collectionJSON `json:"collections"`
	}
	decodeInto(t, e.call(http.MethodGet, "/v1/collections", o.token, nil), &list)
	if len(list.Collections) != 1 || list.Collections[0].DeletedAt == nil {
		t.Errorf("list after delete = %+v, want the album with deletedAt", list.Collections)
	}
	assertCode(t, e.call(http.MethodDelete, "/v1/collections/"+newID(), o.token, nil), http.StatusNotFound, "not_found")
	if rec := e.call(http.MethodDelete, "/v1/collections/nope", o.token, nil); rec.Code != http.StatusBadRequest {
		t.Errorf("bad id = %d, want 400", rec.Code)
	}
	if rec := e.call(http.MethodDelete, "/v1/collections/"+album.ID, "", nil); rec.Code != http.StatusUnauthorized {
		t.Errorf("no token = %d, want 401", rec.Code)
	}
}
