package server

import (
	"context"
	"crypto/tls"
	"crypto/x509"
	"io"
	"log/slog"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/Bouckley/cloud-box/box/internal/config"
)

func newServer(t *testing.T) (*Server, string) {
	t.Helper()
	dataDir := filepath.Join(t.TempDir(), "box data")
	cfg := config.Config{HAL: config.HALSim, DataDir: dataDir, Addr: "127.0.0.1:0"}
	srv, err := New(cfg, "test", slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err != nil {
		t.Fatalf("New: %v", err)
	}
	return srv, dataDir
}

// pinnedClient trusts only the certificate boxd wrote to disk.
func pinnedClient(t *testing.T, dataDir string, maxVersion uint16) *http.Client {
	t.Helper()
	pemBytes, err := os.ReadFile(filepath.Join(dataDir, "tls", "cert.pem"))
	if err != nil {
		t.Fatalf("read cert: %v", err)
	}
	pool := x509.NewCertPool()
	if !pool.AppendCertsFromPEM(pemBytes) {
		t.Fatal("cert.pem has no certificate")
	}
	return &http.Client{
		Timeout:   5 * time.Second,
		Transport: &http.Transport{TLSClientConfig: &tls.Config{RootCAs: pool, MaxVersion: maxVersion}},
	}
}

func serve(t *testing.T, srv *Server) (addr string, stop func()) {
	t.Helper()
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	done := make(chan error, 1)
	go func() { done <- srv.Serve(ctx, ln) }()
	return ln.Addr().String(), func() {
		cancel()
		select {
		case err := <-done:
			if err != nil {
				t.Errorf("Serve returned %v, want nil", err)
			}
		case <-time.After(5 * time.Second):
			t.Error("Serve did not return within 5s of cancel")
		}
	}
}

func TestServeHealthOverTLS(t *testing.T) {
	srv, dataDir := newServer(t)
	addr, stop := serve(t, srv)
	defer stop()

	resp, err := pinnedClient(t, dataDir, 0).Get("https://" + addr + "/v1/health")
	if err != nil {
		t.Fatalf("GET /v1/health: %v", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if resp.StatusCode != http.StatusOK || !strings.Contains(string(body), `"status":"ok"`) {
		t.Fatalf("got %d %s", resp.StatusCode, body)
	}
	if len(srv.Fingerprint()) != 64 {
		t.Errorf("Fingerprint() = %q, want 64 hex chars", srv.Fingerprint())
	}
}

func TestDataDirIsPrivate(t *testing.T) {
	_, dataDir := newServer(t)
	info, err := os.Stat(dataDir)
	if err != nil {
		t.Fatal(err)
	}
	if got := info.Mode().Perm(); got != 0o700 {
		t.Errorf("data dir mode = %o, want 700", got)
	}
}

func TestTLSMinVersion(t *testing.T) {
	srv, dataDir := newServer(t)
	addr, stop := serve(t, srv)
	defer stop()

	resp, err := pinnedClient(t, dataDir, tls.VersionTLS12).Get("https://" + addr + "/v1/health")
	if err == nil {
		resp.Body.Close()
		t.Fatal("a TLS 1.2 client connected; want TLS 1.3 minimum")
	}
}

func TestRejectsPiHAL(t *testing.T) {
	cfg := config.Config{HAL: config.HALPi, DataDir: t.TempDir(), Addr: ":0"}
	_, err := New(cfg, "test", slog.New(slog.NewTextHandler(io.Discard, nil)))
	if err == nil || err.Error() != "pi HAL is not implemented yet (milestone M5)" {
		t.Fatalf("err = %v, want the pi-not-implemented error", err)
	}
}
