package api

import (
	"context"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/Bouckley/cloud-box/box/internal/auth"
	"github.com/Bouckley/cloud-box/box/internal/library"
)

type itemJSON struct {
	ID           string     `json:"id"`
	CollectionID string     `json:"collectionId"`
	DeviceID     string     `json:"deviceId"`
	FileKeyEnc   []byte     `json:"fileKeyEnc"`
	MetadataEnc  []byte     `json:"metadataEnc"`
	DedupeHash   string     `json:"dedupeHash"`
	State        string     `json:"state"`
	CreatedAt    time.Time  `json:"createdAt"`
	TrashedAt    *time.Time `json:"trashedAt"`
	Seq          int64      `json:"seq"`
	Blobs        []struct {
		Role   string `json:"role"`
		BlobID string `json:"blobId"`
		Size   int64  `json:"size"`
	} `json:"blobs"`
}

func newItemBody(collectionID string, blobs map[string]string) map[string]any {
	return map[string]any{
		"id": newID(), "collectionId": collectionID, "fileKeyEnc": randBytes(72),
		"metadataEnc": randBytes(100), "dedupeHash": newID() + newID(), "blobs": blobs,
	}
}

func (e *env) createItem(token string, body map[string]any) itemJSON {
	e.t.Helper()
	rec := e.call(http.MethodPost, "/v1/items", token, body)
	if rec.Code != http.StatusCreated {
		e.t.Fatalf("create item = %d %s", rec.Code, rec.Body)
	}
	var it itemJSON
	decodeInto(e.t, rec, &it)
	return it
}

func TestItemsAPI(t *testing.T) {
	e := newEnv(t)
	o := e.setUpOwner()
	album := e.createCollection(o.token, newCollectionBody("album", nil))
	orig, thumb := e.uploadBlob(o.token, randBytes(300)), e.uploadBlob(o.token, randBytes(20))
	body := newItemBody(album.ID, map[string]string{"original": orig, "thumb": thumb})
	it := e.createItem(o.token, body)
	if it.State != "verified" || it.DeviceID != o.deviceID || len(it.Blobs) != 2 || it.Seq == 0 || it.CreatedAt.IsZero() {
		t.Errorf("item = %+v", it)
	}

	// Sync: trashedAt is present and null; cursor is a string.
	rec := e.call(http.MethodGet, "/v1/items?since=0&limit=10", o.token, nil)
	if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), `"trashedAt":null`) ||
		!strings.Contains(rec.Body.String(), `"purged":[]`) {
		t.Fatalf("changes = %d %s", rec.Code, rec.Body)
	}
	var ch struct {
		Items  []itemJSON
		Purged []string
		Cursor string
		More   bool
	}
	decodeInto(t, rec, &ch)
	if len(ch.Items) != 1 || ch.More || ch.Cursor == "0" {
		t.Errorf("changes = %+v", ch)
	}
	if rec := e.call(http.MethodGet, "/v1/items", o.token, nil); rec.Code != http.StatusOK {
		t.Errorf("defaults: %d", rec.Code)
	}

	// Lookup.
	rec = e.call(http.MethodPost, "/v1/items/lookup", o.token, map[string]any{
		"dedupeHashes": []string{body["dedupeHash"].(string), newID() + newID()}})
	var lk struct {
		Found []struct {
			DedupeHash, ItemID, State string
			Trashed                   bool
		}
	}
	decodeInto(t, rec, &lk)
	if rec.Code != http.StatusOK || len(lk.Found) != 1 || lk.Found[0].ItemID != it.ID || lk.Found[0].State != "verified" {
		t.Errorf("lookup = %d %+v", rec.Code, lk)
	}

	// Move needs a re-wrapped key; with one it moves.
	other := e.createCollection(o.token, newCollectionBody("album", nil))
	assertCode(t, e.call(http.MethodPatch, "/v1/items/"+it.ID, o.token, map[string]any{"collectionId": other.ID}),
		http.StatusConflict, "rewrap_required")
	rec = e.call(http.MethodPatch, "/v1/items/"+it.ID, o.token, map[string]any{"collectionId": other.ID, "fileKeyEnc": randBytes(72)})
	var moved itemJSON
	decodeInto(t, rec, &moved)
	if rec.Code != http.StatusOK || moved.CollectionID != other.ID || moved.Seq <= it.Seq {
		t.Errorf("move = %d %+v", rec.Code, moved)
	}
}

func TestItemsAPIErrors(t *testing.T) {
	e := newEnv(t)
	o := e.setUpOwner()
	album := e.createCollection(o.token, newCollectionBody("album", nil))
	orig := e.uploadBlob(o.token, randBytes(50))
	body := newItemBody(album.ID, map[string]string{"original": orig})
	e.createItem(o.token, body)

	dup := newItemBody(album.ID, map[string]string{"original": e.uploadBlob(o.token, randBytes(51))})
	dup["dedupeHash"] = body["dedupeHash"]
	assertCode(t, e.call(http.MethodPost, "/v1/items", o.token, dup), http.StatusConflict, "already_stored")
	assertCode(t, e.call(http.MethodPost, "/v1/items", o.token, newItemBody(album.ID, map[string]string{"original": orig})),
		http.StatusConflict, "blob_in_use")
	sameID := newItemBody(album.ID, map[string]string{"original": e.uploadBlob(o.token, randBytes(52))})
	sameID["id"] = body["id"]
	assertCode(t, e.call(http.MethodPost, "/v1/items", o.token, sameID), http.StatusConflict, "id_taken")
	assertCode(t, e.call(http.MethodPost, "/v1/items", o.token, newItemBody(album.ID, map[string]string{"original": newID()})),
		http.StatusBadRequest, "invalid_request")
	assertCode(t, e.call(http.MethodPost, "/v1/items", o.token, newItemBody(newID(), map[string]string{"original": e.uploadBlob(o.token, randBytes(53))})),
		http.StatusNotFound, "not_found")

	bad := map[string]func(map[string]any){
		"no original":    func(b map[string]any) { b["blobs"] = map[string]string{"thumb": newID()} },
		"bad blob id":    func(b map[string]any) { b["blobs"] = map[string]string{"original": "x"} },
		"unknown role":   func(b map[string]any) { b["blobs"] = map[string]string{"original": newID(), "poster": newID()} },
		"bad hash":       func(b map[string]any) { b["dedupeHash"] = "ABC" },
		"short key":      func(b map[string]any) { b["fileKeyEnc"] = randBytes(71) },
		"short meta":     func(b map[string]any) { b["metadataEnc"] = randBytes(40) },
		"huge meta":      func(b map[string]any) { b["metadataEnc"] = randBytes(64<<10 + 1) },
		"bad collection": func(b map[string]any) { b["collectionId"] = "nope" },
	}
	for name, edit := range bad {
		b := newItemBody(album.ID, map[string]string{"original": newID()})
		edit(b)
		if rec := e.call(http.MethodPost, "/v1/items", o.token, b); rec.Code != http.StatusBadRequest {
			t.Errorf("%s: %d, want 400", name, rec.Code)
		}
	}

	for _, q := range []string{"since=abc", "since=-1", "since=1234567890123456789", "limit=0", "limit=1001", "limit=x"} {
		if rec := e.call(http.MethodGet, "/v1/items?"+q, o.token, nil); rec.Code != http.StatusBadRequest {
			t.Errorf("GET /v1/items?%s: %d, want 400", q, rec.Code)
		}
	}
	tooMany := make([]string, 1001)
	for i := range tooMany {
		tooMany[i] = newID() + newID()
	}
	if rec := e.call(http.MethodPost, "/v1/items/lookup", o.token, map[string]any{"dedupeHashes": tooMany}); rec.Code != http.StatusBadRequest {
		t.Errorf("1001 hashes: %d, want 400", rec.Code)
	}
	if rec := e.call(http.MethodPost, "/v1/items/lookup", o.token, map[string]any{"dedupeHashes": []string{"nope"}}); rec.Code != http.StatusBadRequest {
		t.Errorf("bad hash: %d, want 400", rec.Code)
	}
	for name, p := range map[string]any{
		"empty":       map[string]any{},
		"bad col":     map[string]any{"collectionId": "x"},
		"short meta":  map[string]any{"metadataEnc": randBytes(10)},
		"unknown key": map[string]any{"state": "replicated"},
	} {
		if rec := e.call(http.MethodPatch, "/v1/items/"+newID(), o.token, p); rec.Code != http.StatusBadRequest {
			t.Errorf("patch %s: %d, want 400", name, rec.Code)
		}
	}

	// Another user's item is 404, never 403.
	theirs := e.otherUsersItem()
	assertCode(t, e.call(http.MethodPatch, "/v1/items/"+theirs, o.token, map[string]any{"metadataEnc": randBytes(60)}),
		http.StatusNotFound, "not_found")
}

// otherUsersItem creates a second user (directly; setup runs once) with an
// item, and returns the item id.
func (e *env) otherUsersItem() string {
	e.t.Helper()
	sess := auth.Session{UserID: newID(), DeviceID: newID()}
	blobID := newID()
	for _, q := range []struct {
		sql  string
		args []any
	}{
		{`INSERT INTO users (id, role, kdf_salt, kdf_ops, kdf_mem, master_key_password, master_key_recovery,
			identity_public_key, identity_key_enc, dedupe_key_enc, created_at)
			VALUES (?, 'member', x'00', 2, 1, x'00', x'00', x'00', x'00', x'00', 0)`, []any{sess.UserID}},
		{`INSERT INTO devices (id, user_id, name_enc, sign_public_key, created_at, last_seen)
			VALUES (?, ?, x'00', x'00', 0, 0)`, []any{sess.DeviceID, sess.UserID}},
		{`INSERT INTO blobs (id, owner_id, size, sha256, stored_at) VALUES (?, ?, 1, 'x', 0)`, []any{blobID, sess.UserID}},
	} {
		if _, err := e.db.DB().Exec(q.sql, q.args...); err != nil {
			e.t.Fatal(err)
		}
	}
	ctx := context.Background()
	col, err := e.deps.Library.CreateCollection(ctx, sess.UserID, library.Collection{
		ID: newID(), Kind: "album", NameEnc: randBytes(50), KeyEnc: randBytes(72)})
	if err != nil {
		e.t.Fatal(err)
	}
	it, err := e.deps.Library.CreateItem(ctx, sess, library.Item{
		ID: newID(), CollectionID: col.ID, FileKeyEnc: randBytes(72), MetadataEnc: randBytes(60),
		DedupeHash: newID() + newID(), Blobs: []library.ItemBlob{{Role: "original", BlobID: blobID}}})
	if err != nil {
		e.t.Fatal(err)
	}
	return it.ID
}
