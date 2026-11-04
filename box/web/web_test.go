package web

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"testing/fstest"
)

const wantCSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; " +
	"img-src 'self' blob:; media-src 'self' blob:; worker-src 'self' blob:; connect-src 'self'; " +
	"font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"

func built() fstest.MapFS {
	return fstest.MapFS{
		"index.html":          {Data: []byte("<!doctype html><title>Cloud Box</title>")},
		"assets/app-1a2b.js":  {Data: []byte("console.log(1)")},
		"assets/sodium.wasm":  {Data: []byte("\x00asm")},
		"fonts/inter.woff2":   {Data: []byte("font")},
		"favicon.svg":         {Data: []byte("<svg/>")},
		"assets/nested/x.css": {Data: []byte("body{}")},
	}
}

func get(t *testing.T, h http.Handler, method, path string) *httptest.ResponseRecorder {
	t.Helper()
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, httptest.NewRequest(method, path, nil))
	return rec
}

func TestServesIndexForRoutes(t *testing.T) {
	h := handler(built())
	for _, p := range []string{"/", "/photos", "/photos/abc", "/albums/favourites", "/unlock?next=%2Fbox"} {
		rec := get(t, h, http.MethodGet, p)
		if rec.Code != http.StatusOK || !strings.Contains(rec.Body.String(), "<title>Cloud Box</title>") {
			t.Errorf("%s = %d %q, want index", p, rec.Code, rec.Body)
		}
		if cc := rec.Header().Get("Cache-Control"); cc != "no-cache" {
			t.Errorf("%s Cache-Control = %q, want no-cache", p, cc)
		}
		if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/html") {
			t.Errorf("%s Content-Type = %q, want text/html", p, ct)
		}
	}
	if rec := get(t, h, http.MethodHead, "/photos"); rec.Code != http.StatusOK {
		t.Errorf("HEAD = %d, want 200", rec.Code)
	}
	if rec := get(t, h, http.MethodPost, "/photos"); rec.Code != http.StatusMethodNotAllowed {
		t.Errorf("POST = %d, want 405", rec.Code)
	}
}

func TestServesAssetsWithCache(t *testing.T) {
	h := handler(built())
	for path, ct := range map[string]string{
		"/assets/app-1a2b.js":  "text/javascript",
		"/assets/sodium.wasm":  "application/wasm",
		"/assets/nested/x.css": "text/css",
	} {
		rec := get(t, h, http.MethodGet, path)
		if rec.Code != http.StatusOK {
			t.Fatalf("%s = %d", path, rec.Code)
		}
		if got := rec.Header().Get("Cache-Control"); got != "public, max-age=31536000, immutable" {
			t.Errorf("%s Cache-Control = %q", path, got)
		}
		if got := rec.Header().Get("Content-Type"); !strings.HasPrefix(got, ct) {
			t.Errorf("%s Content-Type = %q, want %s", path, got, ct)
		}
	}
	rec := get(t, h, http.MethodGet, "/favicon.svg")
	if rec.Code != http.StatusOK || rec.Header().Get("Cache-Control") != "no-cache" {
		t.Errorf("/favicon.svg = %d, Cache-Control %q; want 200 no-cache", rec.Code, rec.Header().Get("Cache-Control"))
	}
}

func TestMissingFileWithExtension404(t *testing.T) {
	h := handler(built())
	for _, p := range []string{"/assets/gone.js", "/robots.txt", "/../index.html.bak", "/assets/../../etc/passwd.txt"} {
		rec := get(t, h, http.MethodGet, p)
		if rec.Code != http.StatusNotFound {
			t.Errorf("%s = %d, want 404", p, rec.Code)
		}
		if strings.Contains(rec.Body.String(), "<title>Cloud Box</title>") {
			t.Errorf("%s served index", p)
		}
	}
	// A directory is not a file.
	if rec := get(t, h, http.MethodGet, "/assets/nested.d"); rec.Code != http.StatusNotFound {
		t.Errorf("missing dir-like path = %d, want 404", rec.Code)
	}
}

func TestSecurityHeaders(t *testing.T) {
	cases := map[string]http.Handler{
		"/":                   handler(built()),
		"/assets/app-1a2b.js": handler(built()),
		"/missing.js":         handler(built()),
		"/photos":             handler(fstest.MapFS{}),
	}
	for p, h := range cases {
		hdr := get(t, h, http.MethodGet, p).Header()
		for k, want := range map[string]string{
			"Content-Security-Policy":    wantCSP,
			"X-Content-Type-Options":     "nosniff",
			"Referrer-Policy":            "no-referrer",
			"Cross-Origin-Opener-Policy": "same-origin",
		} {
			if got := hdr.Get(k); got != want {
				t.Errorf("%s %s = %q, want %q", p, k, got, want)
			}
		}
	}
}

func TestNotBuilt503(t *testing.T) {
	h := handler(fstest.MapFS{".gitkeep": {}})
	for _, p := range []string{"/", "/photos/abc"} {
		rec := get(t, h, http.MethodGet, p)
		if rec.Code != http.StatusServiceUnavailable || !strings.Contains(rec.Body.String(), "Web app not built. Run make web.") {
			t.Errorf("%s = %d %q, want 503 not built", p, rec.Code, rec.Body)
		}
		if ct := rec.Header().Get("Content-Type"); !strings.HasPrefix(ct, "text/html") {
			t.Errorf("%s Content-Type = %q", p, ct)
		}
	}
}

func TestEmbeddedHandler(t *testing.T) {
	// The real embed works whether or not the app was built.
	rec := get(t, Handler(), http.MethodGet, "/")
	if rec.Code != http.StatusOK && rec.Code != http.StatusServiceUnavailable {
		t.Errorf("Handler() / = %d, want 200 or 503", rec.Code)
	}
}
