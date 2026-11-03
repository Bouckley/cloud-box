package api

import (
	"net/http"
	"testing"
	"time"
)

func TestTrashAPI(t *testing.T) {
	e := newEnv(t)
	o := e.setUpOwner()
	album := e.createCollection(o.token, newCollectionBody("album", nil))
	it := e.createItem(o.token, newItemBody(album.ID, map[string]string{"original": e.uploadBlob(o.token, randBytes(80))}))

	assertCode(t, e.call(http.MethodDelete, "/v1/trash/"+it.ID, o.token, nil), http.StatusConflict, "not_in_trash")
	for range 2 { // trashing twice is fine
		if rec := e.call(http.MethodDelete, "/v1/items/"+it.ID, o.token, nil); rec.Code != http.StatusNoContent {
			t.Fatalf("trash = %d %s", rec.Code, rec.Body)
		}
	}
	rec := e.call(http.MethodGet, "/v1/trash", o.token, nil)
	var tr struct {
		Items []struct {
			ItemID    string    `json:"itemId"`
			TrashedAt time.Time `json:"trashedAt"`
			DaysLeft  int       `json:"daysLeft"`
		}
	}
	decodeInto(t, rec, &tr)
	if rec.Code != http.StatusOK || len(tr.Items) != 1 || tr.Items[0].ItemID != it.ID || tr.Items[0].DaysLeft != 30 || tr.Items[0].TrashedAt.IsZero() {
		t.Fatalf("trash list = %d %+v", rec.Code, tr)
	}

	rec = e.call(http.MethodPost, "/v1/items/"+it.ID+"/restore", o.token, nil)
	var restored itemJSON
	decodeInto(t, rec, &restored)
	if rec.Code != http.StatusOK || restored.TrashedAt != nil || restored.ID != it.ID || restored.Seq <= it.Seq {
		t.Fatalf("restore = %d %+v", rec.Code, restored)
	}

	_ = e.call(http.MethodDelete, "/v1/items/"+it.ID, o.token, nil)
	if rec := e.call(http.MethodDelete, "/v1/trash/"+it.ID, o.token, nil); rec.Code != http.StatusNoContent {
		t.Fatalf("delete for good = %d %s", rec.Code, rec.Body)
	}
	if rec := e.call(http.MethodGet, "/v1/blobs/"+it.Blobs[0].BlobID, o.token, nil); rec.Code != http.StatusNotFound {
		t.Errorf("blob after delete = %d, want 404", rec.Code)
	}
	assertCode(t, e.call(http.MethodPost, "/v1/items/"+it.ID+"/restore", o.token, nil), http.StatusNotFound, "not_found")
}

func TestTrashAPIErrors(t *testing.T) {
	e := newEnv(t)
	o := e.setUpOwner()
	theirs := e.otherUsersItem()
	for _, r := range []struct{ method, path string }{
		{http.MethodDelete, "/v1/items/" + theirs},
		{http.MethodPost, "/v1/items/" + theirs + "/restore"},
		{http.MethodDelete, "/v1/trash/" + theirs},
		{http.MethodDelete, "/v1/items/" + newID()},
	} {
		assertCode(t, e.call(r.method, r.path, o.token, nil), http.StatusNotFound, "not_found")
	}
	for _, r := range []struct{ method, path string }{
		{http.MethodDelete, "/v1/items/nope"},
		{http.MethodPost, "/v1/items/nope/restore"},
		{http.MethodDelete, "/v1/trash/nope"},
	} {
		if rec := e.call(r.method, r.path, o.token, nil); rec.Code != http.StatusBadRequest {
			t.Errorf("%s %s = %d, want 400", r.method, r.path, rec.Code)
		}
	}
	if rec := e.call(http.MethodGet, "/v1/trash", "", nil); rec.Code != http.StatusUnauthorized {
		t.Errorf("no token: %d", rec.Code)
	}
}
