package api

import (
	"net/http"
	"strings"
	"testing"
)

func TestStatusAPI(t *testing.T) {
	e := newEnv(t)
	o := e.setUpOwner()
	rec := e.call(http.MethodGet, "/v1/status", o.token, nil)
	body := rec.Body.String()
	if rec.Code != http.StatusOK || !strings.Contains(body, `"lastCopyAt":null`) || !strings.Contains(body, `"warnings":[]`) ||
		!strings.Contains(body, `"lastBackupAt":null`) {
		t.Fatalf("status = %d %s", rec.Code, body)
	}
	var s struct {
		Safe    bool
		Items   struct{ Total, Verified, Replicated, NotYetCopied, Trashed int }
		Devices []struct {
			ID      string
			NameEnc []byte
		}
		Drives []struct {
			Role                 string
			SizeBytes, FreeBytes uint64
		}
		Warnings []struct{ Code, Message, Action string }
	}
	decodeInto(t, rec, &s)
	if !s.Safe || len(s.Devices) != 1 || s.Devices[0].ID != o.deviceID || len(s.Devices[0].NameEnc) == 0 || len(s.Drives) != 2 {
		t.Errorf("status = %+v", s)
	}

	album := e.createCollection(o.token, newCollectionBody("album", nil))
	e.createItem(o.token, newItemBody(album.ID, map[string]string{"original": e.uploadBlob(o.token, randBytes(40))}))
	e.sim.SetBackupPresent(false)
	rec = e.call(http.MethodGet, "/v1/status", o.token, nil)
	decodeInto(t, rec, &s)
	if s.Safe || s.Items.NotYetCopied != 1 || len(s.Warnings) != 1 || s.Warnings[0].Code != "backup_missing" || s.Warnings[0].Action == "" {
		t.Errorf("unplugged status = %+v", s)
	}
	if rec := e.call(http.MethodGet, "/v1/status", "", nil); rec.Code != http.StatusUnauthorized {
		t.Errorf("no token: %d", rec.Code)
	}
}
