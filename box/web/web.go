// Package web serves the web app that `make web` builds into web/dist and
// boxd embeds. Every response carries the strict security headers from
// ADR 0005; nothing here reads or writes user data.
package web

import (
	"embed"
	"io"
	"io/fs"
	"net/http"
	"path"
	"strings"
	"time"
)

//go:embed all:dist
var embedded embed.FS

// CSP allows only the box's own scripts, styles, fonts and connections, plus
// blob: images, media and workers for decrypted photos, and WebAssembly for
// libsodium. No inline scripts or styles, and no framing.
const CSP = "default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self'; " +
	"img-src 'self' blob:; media-src 'self' blob:; worker-src 'self' blob:; connect-src 'self'; " +
	"font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'"

const notBuiltPage = `<!doctype html><html lang="en"><meta charset="utf-8"><title>Cloud Box</title>` +
	`<p>Web app not built. Run make web.</p></html>`

// Handler serves the embedded web app.
func Handler() http.Handler {
	dist, err := fs.Sub(embedded, "dist")
	if err != nil {
		panic(err) // the embed directive guarantees dist exists
	}
	return handler(dist)
}

// handler serves files from fsys (the built app's root). A GET for a path
// without a file extension gets index.html, so the app's own routes work on
// reload; a missing file with an extension is 404.
func handler(fsys fs.FS) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		h := w.Header()
		h.Set("Content-Security-Policy", CSP)
		h.Set("X-Content-Type-Options", "nosniff")
		h.Set("Referrer-Policy", "no-referrer")
		h.Set("Cross-Origin-Opener-Policy", "same-origin")

		if r.Method != http.MethodGet && r.Method != http.MethodHead {
			h.Set("Allow", "GET, HEAD")
			http.Error(w, "Method not allowed.", http.StatusMethodNotAllowed)
			return
		}
		name := strings.TrimPrefix(path.Clean("/"+r.URL.Path), "/")
		if path.Ext(name) == "" {
			serveIndex(w, r, fsys)
			return
		}
		if !serveFile(w, r, fsys, name) {
			http.NotFound(w, r)
			return
		}
	})
}

func serveIndex(w http.ResponseWriter, r *http.Request, fsys fs.FS) {
	w.Header().Set("Cache-Control", "no-cache")
	if serveFile(w, r, fsys, "index.html") {
		return
	}
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusServiceUnavailable)
	_, _ = io.WriteString(w, notBuiltPage)
}

// serveFile writes the named regular file, or reports false when there is
// none (nothing written).
func serveFile(w http.ResponseWriter, r *http.Request, fsys fs.FS, name string) bool {
	f, err := fsys.Open(name)
	if err != nil {
		return false
	}
	defer f.Close()
	fi, err := f.Stat()
	if err != nil || !fi.Mode().IsRegular() {
		return false
	}
	rs, ok := f.(io.ReadSeeker)
	if !ok {
		data, err := io.ReadAll(f)
		if err != nil {
			return false
		}
		rs = strings.NewReader(string(data))
	}
	if strings.HasPrefix(name, "assets/") {
		w.Header().Set("Cache-Control", "public, max-age=31536000, immutable")
	} else if w.Header().Get("Cache-Control") == "" {
		w.Header().Set("Cache-Control", "no-cache")
	}
	// Embedded files have no modification time; a zero time sends no
	// Last-Modified, so caching rests on Cache-Control alone.
	http.ServeContent(w, r, name, time.Time{}, rs)
	return true
}
