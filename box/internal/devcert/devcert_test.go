package devcert

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/x509"
	"net"
	"os"
	"path/filepath"
	"slices"
	"testing"
	"time"
)

var now = time.Date(2026, 11, 2, 12, 0, 0, 0, time.UTC)

func tlsDir(t *testing.T) string {
	t.Helper()
	return filepath.Join(t.TempDir(), "with space", "tls")
}

func TestCreatesCertAndKey(t *testing.T) {
	dir := tlsDir(t)
	cert, err := LoadOrCreate(dir, []string{"cloudbox.local"}, now)
	if err != nil {
		t.Fatalf("LoadOrCreate: %v", err)
	}

	for name, want := range map[string]os.FileMode{"cert.pem": 0o644, "key.pem": 0o600} {
		info, err := os.Stat(filepath.Join(dir, name))
		if err != nil {
			t.Fatalf("stat %s: %v", name, err)
		}
		if got := info.Mode().Perm(); got != want {
			t.Errorf("%s mode = %o, want %o", name, got, want)
		}
	}
	info, err := os.Stat(dir)
	if err != nil {
		t.Fatal(err)
	}
	if got := info.Mode().Perm(); got != 0o700 {
		t.Errorf("dir mode = %o, want 700", got)
	}

	leaf, err := x509.ParseCertificate(cert.Certificate[0])
	if err != nil {
		t.Fatalf("parse leaf: %v", err)
	}
	for _, name := range []string{"localhost", "cloudbox.local"} {
		if !slices.Contains(leaf.DNSNames, name) {
			t.Errorf("DNSNames %v missing %q", leaf.DNSNames, name)
		}
	}
	for _, ip := range []string{"127.0.0.1", "::1"} {
		if !slices.ContainsFunc(leaf.IPAddresses, func(a net.IP) bool { return a.Equal(net.ParseIP(ip)) }) {
			t.Errorf("IPAddresses %v missing %s", leaf.IPAddresses, ip)
		}
	}
	if want := now.AddDate(10, 0, 0); !leaf.NotAfter.Equal(want) {
		t.Errorf("NotAfter = %v, want %v", leaf.NotAfter, want)
	}
	pub, ok := leaf.PublicKey.(*ecdsa.PublicKey)
	if !ok || pub.Curve != elliptic.P256() {
		t.Errorf("public key is %T, want ECDSA P-256", leaf.PublicKey)
	}
}

func TestReusesExisting(t *testing.T) {
	dir := tlsDir(t)
	first, err := LoadOrCreate(dir, nil, now)
	if err != nil {
		t.Fatal(err)
	}
	second, err := LoadOrCreate(dir, nil, now.Add(24*time.Hour))
	if err != nil {
		t.Fatal(err)
	}
	if Fingerprint(first) != Fingerprint(second) {
		t.Fatal("second call produced a different certificate; pinned clients would break")
	}
	if len(Fingerprint(first)) != 64 {
		t.Errorf("fingerprint %q is not 64 hex chars", Fingerprint(first))
	}
}

func TestRejectsCorruptFiles(t *testing.T) {
	dir := tlsDir(t)
	if _, err := LoadOrCreate(dir, nil, now); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(dir, "cert.pem"), []byte("garbage"), 0o644); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadOrCreate(dir, nil, now); err == nil {
		t.Fatal("expected an error for a corrupt cert.pem, not a silent regeneration")
	}
}

func TestRejectsMissingKey(t *testing.T) {
	dir := tlsDir(t)
	if _, err := LoadOrCreate(dir, nil, now); err != nil {
		t.Fatal(err)
	}
	if err := os.Remove(filepath.Join(dir, "key.pem")); err != nil {
		t.Fatal(err)
	}
	if _, err := LoadOrCreate(dir, nil, now); err == nil {
		t.Fatal("expected an error when key.pem is missing, not a silent regeneration")
	}
	if _, err := os.Stat(filepath.Join(dir, "key.pem")); err == nil {
		t.Fatal("a new key.pem was written next to the old cert.pem")
	}
}
