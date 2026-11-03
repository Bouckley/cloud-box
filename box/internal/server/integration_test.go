//go:build sim

package server

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/Bouckley/cloud-box/box/internal/blobs"
	"github.com/Bouckley/cloud-box/box/internal/boxcrypto"
	"github.com/Bouckley/cloud-box/box/internal/config"
)

// box is a running boxd reached over pinned HTTPS.
type box struct {
	t       *testing.T
	base    string
	client  *http.Client
	dataDir string
	logs    *lockedBuffer
}

type lockedBuffer struct {
	mu sync.Mutex
	b  bytes.Buffer
}

func (l *lockedBuffer) Write(p []byte) (int, error) {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.b.Write(p)
}

func (l *lockedBuffer) String() string {
	l.mu.Lock()
	defer l.mu.Unlock()
	return l.b.String()
}

func boot(t *testing.T) *box {
	t.Helper()
	dataDir := filepath.Join(t.TempDir(), "box data")
	logs := &lockedBuffer{}
	cfg := config.Config{HAL: config.HALSim, DataDir: dataDir, Addr: "127.0.0.1:0"}
	srv, err := New(cfg, "it", slog.New(slog.NewTextHandler(logs, &slog.HandlerOptions{Level: slog.LevelDebug})))
	if err != nil {
		t.Fatal(err)
	}
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- srv.Serve(ctx, ln) }()
	t.Cleanup(func() {
		cancel()
		if err := <-done; err != nil {
			t.Errorf("Serve: %v", err)
		}
	})
	c := pinnedClient(t, dataDir, 0)
	c.Timeout = 30 * time.Second
	return &box{t: t, base: "https://" + ln.Addr().String(), client: c, dataDir: dataDir, logs: logs}
}

// do sends a request; body is JSON (any) or raw ([]byte). out, if non-nil,
// receives the decoded JSON response.
func (b *box) do(method, path, token string, body any, hdr map[string]string, want int, out any) []byte {
	b.t.Helper()
	var r io.Reader
	ctype := ""
	switch v := body.(type) {
	case nil:
	case []byte:
		r, ctype = bytes.NewReader(v), "application/octet-stream"
	default:
		j, _ := json.Marshal(v)
		r, ctype = bytes.NewReader(j), "application/json"
	}
	req, _ := http.NewRequest(method, b.base+path, r)
	if ctype != "" {
		req.Header.Set("Content-Type", ctype)
	}
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	for k, v := range hdr {
		req.Header.Set(k, v)
	}
	resp, err := b.client.Do(req)
	if err != nil {
		b.t.Fatalf("%s %s: %v", method, path, err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != want {
		b.t.Fatalf("%s %s = %d, want %d: %s", method, path, resp.StatusCode, want, data)
	}
	if out != nil {
		if err := json.Unmarshal(data, out); err != nil {
			b.t.Fatalf("%s %s: decode %v: %s", method, path, err, data)
		}
	}
	return data
}

func randBytes(n int) []byte {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return b
}

func newID() string { return hex.EncodeToString(randBytes(16)) }

func shaHex(b []byte) string {
	s := sha256.Sum256(b)
	return hex.EncodeToString(s[:])
}

func (b *box) login(deviceID string, key ed25519.PrivateKey) string {
	b.t.Helper()
	var ch struct{ Challenge string }
	b.do("POST", "/v1/auth/challenge", "", map[string]string{"deviceId": deviceID}, nil, 200, &ch)
	var sess struct{ Token string }
	b.do("POST", "/v1/auth/verify", "", map[string]any{
		"deviceId": deviceID, "challenge": ch.Challenge,
		"signature": ed25519.Sign(key, boxcrypto.AuthMessage(deviceID, ch.Challenge)),
	}, nil, 200, &sess)
	return sess.Token
}

// setUp creates the owner with device A and returns A's id, key and token.
func (b *box) setUp() (deviceA string, key ed25519.PrivateKey, token string) {
	b.t.Helper()
	pub, priv, _ := ed25519.GenerateKey(rand.Reader)
	deviceA = newID()
	b.do("POST", "/v1/setup", "", map[string]any{
		"user": map[string]any{
			"id":                  newID(),
			"kdf":                 map[string]any{"salt": randBytes(16), "opsLimit": 3, "memLimitBytes": 268435456},
			"masterKeyByPassword": randBytes(72), "masterKeyByRecovery": randBytes(72),
			"identityPublicKey": randBytes(32), "identityKeyEnc": randBytes(72), "dedupeKeyEnc": randBytes(72),
		},
		"device": map[string]any{"id": deviceA, "nameEnc": randBytes(60), "signPublicKey": pub},
	}, nil, 201, nil)
	return deviceA, priv, b.login(deviceA, priv)
}

// upload sends data in parts (in the given part order) and completes it.
func (b *box) upload(token string, data []byte, reverse bool) string {
	b.t.Helper()
	var up struct {
		ID                   string
		PartBytes, PartCount int
	}
	b.do("POST", "/v1/uploads", token, map[string]any{"size": len(data), "sha256": shaHex(data)}, nil, 201, &up)
	for i := range up.PartCount {
		n := i
		if reverse {
			n = up.PartCount - 1 - i
		}
		end := min((n+1)*up.PartBytes, len(data))
		b.do("PUT", fmt.Sprintf("/v1/uploads/%s/parts/%d", up.ID, n), token, data[n*up.PartBytes:end], nil, 204, nil)
	}
	var blob struct{ ID, State string }
	b.do("POST", "/v1/uploads/"+up.ID+"/complete", token, nil, nil, 201, &blob)
	if blob.State != "verified" {
		b.t.Errorf("blob state = %s, want verified", blob.State)
	}
	return blob.ID
}

type statusJSON struct {
	Safe     bool
	Items    struct{ Total, Verified, Replicated, NotYetCopied, Trashed int }
	Warnings []struct{ Code, Message, Action string }
}

type changesJSON struct {
	Items []struct {
		ID, State string
		Seq       int64
	}
	Purged []string
	Cursor string
	More   bool
}

func (b *box) light() string {
	b.t.Helper()
	var s struct{ Light string }
	b.do("GET", "/dev/sim/state", "", nil, nil, 200, &s)
	return s.Light
}

func TestUploadToReplicated(t *testing.T) {
	b := boot(t)
	var tokens []string

	// 1. Setup, login, album.
	deviceA, keyA, tokenA := b.setUp()
	tokens = append(tokens, tokenA)
	var album struct{ ID string }
	b.do("POST", "/v1/collections", tokenA, map[string]any{
		"id": newID(), "kind": "album", "parentId": nil, "nameEnc": randBytes(50), "keyEnc": randBytes(72),
	}, nil, 201, &album)

	// 2. A 9 MiB original (two parts, sent last first) and a 3 KiB thumb.
	original := randBytes(9 << 20)
	origID := b.upload(tokenA, original, true)
	thumbID := b.upload(tokenA, randBytes(3<<10), false)
	var item struct {
		ID, State string
		Seq       int64
	}
	b.do("POST", "/v1/items", tokenA, map[string]any{
		"id": newID(), "collectionId": album.ID, "fileKeyEnc": randBytes(72), "metadataEnc": randBytes(200),
		"dedupeHash": shaHex(randBytes(8)), "blobs": map[string]string{"original": origID, "thumb": thumbID},
	}, nil, 201, &item)
	if item.State != "verified" {
		t.Fatalf("new item state = %s, want verified", item.State)
	}
	var sync0 changesJSON
	b.do("GET", "/v1/items?since=0", tokenA, nil, nil, 200, &sync0)

	// 3. Not safe yet; the light asks for attention.
	var st statusJSON
	b.do("GET", "/v1/status", tokenA, nil, nil, 200, &st)
	if st.Safe || st.Items.NotYetCopied != 1 {
		t.Fatalf("status before backup = %+v", st)
	}
	b.do("POST", "/dev/sim/jobs/light", "", nil, nil, 200, nil)
	if l := b.light(); l != "attention" {
		t.Errorf("light = %s, want attention", l)
	}

	// 4. Back up: the item syncs as replicated, status is safe, light steady.
	var rep struct{ Copied, Failed int }
	b.do("POST", "/dev/sim/jobs/replicate", "", nil, nil, 200, &rep)
	if rep.Copied != 2 || rep.Failed != 0 {
		t.Fatalf("replicate = %+v", rep)
	}
	var sync1 changesJSON
	b.do("GET", "/v1/items?since="+sync0.Cursor, tokenA, nil, nil, 200, &sync1)
	if len(sync1.Items) != 1 || sync1.Items[0].ID != item.ID || sync1.Items[0].State != "replicated" {
		t.Fatalf("sync after backup = %+v", sync1)
	}
	b.do("GET", "/v1/status", tokenA, nil, nil, 200, &st)
	if !st.Safe || st.Items.Replicated != 1 || len(st.Warnings) != 0 {
		t.Fatalf("status after backup = %+v", st)
	}
	b.do("POST", "/dev/sim/jobs/light", "", nil, nil, 200, nil)
	if l := b.light(); l != "safe" {
		t.Errorf("light = %s, want safe", l)
	}

	// 5. Range download.
	got := b.do("GET", "/v1/blobs/"+origID, tokenA, nil, map[string]string{"Range": "bytes=0-99"}, 206, nil)
	if !bytes.Equal(got, original[:100]) {
		t.Error("first 100 bytes differ")
	}

	// 6. Unplug the backup: not safe, with a reason; plug it back.
	b.do("POST", "/dev/sim/drives/backup", "", map[string]any{"present": false}, nil, 200, nil)
	b.do("GET", "/v1/status", tokenA, nil, nil, 200, &st)
	if st.Safe || len(st.Warnings) != 1 || st.Warnings[0].Code != "backup_missing" || st.Warnings[0].Action == "" {
		t.Fatalf("status with backup unplugged = %+v", st)
	}
	b.do("POST", "/dev/sim/drives/backup", "", map[string]any{"present": true}, nil, 200, nil)

	// 7. Pair device B, revoke it: B's token stops working.
	var pc struct{ Code string }
	b.do("POST", "/v1/devices/pairing-codes", tokenA, nil, nil, 201, &pc)
	pubB, privB, _ := ed25519.GenerateKey(rand.Reader)
	deviceB := newID()
	b.do("POST", "/v1/devices/pair", "", map[string]any{
		"code": pc.Code, "device": map[string]any{"id": deviceB, "nameEnc": randBytes(60), "signPublicKey": pubB},
	}, nil, 201, nil)
	tokenB := b.login(deviceB, privB)
	tokens = append(tokens, tokenB)
	b.do("GET", "/v1/account", tokenB, nil, nil, 200, nil)
	b.do("DELETE", "/v1/devices/"+deviceB, tokenA, nil, nil, 204, nil)
	b.do("GET", "/v1/account", tokenB, nil, nil, 401, nil)

	// 8. Trash, 31 days, purge: gone from sync and from both drives.
	b.do("DELETE", "/v1/items/"+item.ID, tokenA, nil, nil, 204, nil)
	var trash struct {
		Items []struct {
			ItemID   string
			DaysLeft int
		}
	}
	b.do("GET", "/v1/trash", tokenA, nil, nil, 200, &trash)
	if len(trash.Items) != 1 || trash.Items[0].DaysLeft != 30 {
		t.Fatalf("trash = %+v", trash)
	}
	b.do("POST", "/dev/sim/clock/advance", "", map[string]any{"seconds": 31 * 24 * 3600}, nil, 200, nil)
	var purged struct{ Purged int }
	b.do("POST", "/dev/sim/jobs/purge", "", nil, nil, 200, &purged)
	if purged.Purged != 1 {
		t.Fatalf("purge = %+v", purged)
	}
	// Sessions last an hour, so the clock jump expired A's: sign in again.
	b.do("GET", "/v1/account", tokenA, nil, nil, 401, nil)
	tokenA2 := b.login(deviceA, keyA)
	tokens = append(tokens, tokenA2)
	var sync2 changesJSON
	b.do("GET", "/v1/items?since="+sync1.Cursor, tokenA2, nil, nil, 200, &sync2)
	if len(sync2.Purged) != 1 || sync2.Purged[0] != item.ID || len(sync2.Items) != 0 {
		t.Fatalf("sync after purge = %+v", sync2)
	}
	for _, id := range []string{origID, thumbID} {
		for _, root := range []string{b.dataDir, filepath.Join(b.dataDir, "sim-backup")} {
			if _, err := os.Stat(blobs.BlobPath(root, id)); !errors.Is(err, os.ErrNotExist) {
				t.Errorf("blob %s still under %s (%v)", id, root, err)
			}
		}
	}

	// 10. The log never holds a session token or the pairing code.
	logs := b.logs.String()
	for _, secret := range append(tokens, pc.Code) {
		if strings.Contains(logs, secret) {
			t.Errorf("log contains a secret")
		}
	}
	if !strings.Contains(logs, "boxd") && !strings.Contains(logs, "request") {
		t.Errorf("log looks empty; the check above proves nothing: %q", logs)
	}
}

func TestStorageFullRefusesUpload(t *testing.T) {
	b := boot(t)
	_, _, token := b.setUp()
	b.do("POST", "/dev/sim/drives/main", "", map[string]any{"fillPercent": 100}, nil, 200, nil)
	var e struct{ Code, Message, Action string }
	b.do("POST", "/v1/uploads", token, map[string]any{"size": 10, "sha256": shaHex(randBytes(10))}, nil, 507, &e)
	if e.Code != "storage_full" || e.Action == "" {
		t.Errorf("error = %+v", e)
	}
}
