package api

import (
	"bytes"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"

	"github.com/Bouckley/cloud-box/box/internal/auth"
	"github.com/Bouckley/cloud-box/box/internal/hal/sim"
	"github.com/Bouckley/cloud-box/box/internal/store"
)

// env is a router over real services backed by a temp store and the simulator.
type env struct {
	t      *testing.T
	db     *store.Store
	sim    *sim.Sim
	dir    string
	deps   Deps
	router http.Handler
}

func newEnv(t *testing.T) *env {
	t.Helper()
	dir := filepath.Join(t.TempDir(), "with space")
	db, err := store.Open(context.Background(), filepath.Join(dir, "db", "box.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = db.Close() })
	s := sim.New(dir)
	clock := s.HAL().Clock
	deps := Deps{Version: "test", Auth: auth.New(db, clock)}
	return &env{t: t, db: db, sim: s, dir: dir, deps: deps, router: NewRouter(deps)}
}

// call sends a JSON request (body may be nil) with an optional bearer token.
func (e *env) call(method, path, token string, body any) *httptest.ResponseRecorder {
	e.t.Helper()
	var buf bytes.Buffer
	if body != nil {
		if raw, ok := body.(string); ok {
			buf.WriteString(raw)
		} else if err := json.NewEncoder(&buf).Encode(body); err != nil {
			e.t.Fatal(err)
		}
	}
	req := httptest.NewRequest(method, path, &buf)
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	e.router.ServeHTTP(rec, req)
	return rec
}

func (e *env) count(table string) int {
	e.t.Helper()
	var n int
	if err := e.db.DB().QueryRow("SELECT count(*) FROM " + table).Scan(&n); err != nil {
		e.t.Fatal(err)
	}
	return n
}

func randBytes(n int) []byte {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return b
}

func newID() string { return hex.EncodeToString(randBytes(16)) }

// setupBody is a valid POST /v1/setup body as a generic map so tests can break one field.
func setupBody(signPublicKey []byte) map[string]any {
	return map[string]any{
		"user": map[string]any{
			"id":                  newID(),
			"kdf":                 map[string]any{"salt": randBytes(16), "opsLimit": 3, "memLimitBytes": 268435456},
			"masterKeyByPassword": randBytes(72),
			"masterKeyByRecovery": randBytes(72),
			"identityPublicKey":   randBytes(32),
			"identityKeyEnc":      randBytes(72),
			"dedupeKeyEnc":        randBytes(72),
		},
		"device": map[string]any{"id": newID(), "nameEnc": randBytes(60), "signPublicKey": signPublicKey},
	}
}

func decodeInto(t *testing.T, rec *httptest.ResponseRecorder, v any) {
	t.Helper()
	if err := json.Unmarshal(rec.Body.Bytes(), v); err != nil {
		t.Fatalf("body %q: %v", rec.Body.String(), err)
	}
}

func newRequest(method, path string) *http.Request { return httptest.NewRequest(method, path, nil) }

func serve(e *env, r *http.Request) *httptest.ResponseRecorder {
	rec := httptest.NewRecorder()
	e.router.ServeHTTP(rec, r)
	return rec
}
