// Package devcert creates and reloads boxd's self-signed TLS certificate.
//
// Apps pin the certificate's SHA-256 fingerprint (carried in the pairing QR
// code), so the certificate is created once and then reused. A damaged or
// half-present certificate is an error, never a silent regeneration.
package devcert

import (
	"crypto/ecdsa"
	"crypto/elliptic"
	"crypto/rand"
	"crypto/sha256"
	"crypto/tls"
	"crypto/x509"
	"crypto/x509/pkix"
	"encoding/hex"
	"encoding/pem"
	"errors"
	"fmt"
	"io/fs"
	"math/big"
	"net"
	"os"
	"path/filepath"
	"time"
)

const (
	certFile = "cert.pem"
	keyFile  = "key.pem"
	validFor = 10 // years
)

// LoadOrCreate returns the certificate stored in dir, creating it first if
// neither file exists. hosts are added as DNS names alongside "localhost".
func LoadOrCreate(dir string, hosts []string, now time.Time) (tls.Certificate, error) {
	certPath := filepath.Join(dir, certFile)
	keyPath := filepath.Join(dir, keyFile)

	certExists, err := exists(certPath)
	if err != nil {
		return tls.Certificate{}, err
	}
	keyExists, err := exists(keyPath)
	if err != nil {
		return tls.Certificate{}, err
	}
	switch {
	case certExists && keyExists:
		return load(certPath, keyPath)
	case certExists || keyExists:
		return tls.Certificate{}, fmt.Errorf("devcert: only one of %s and %s exists in %s; restore it or remove both to create a new certificate (paired apps will need re-pairing)", certFile, keyFile, dir)
	}

	if err := os.MkdirAll(dir, 0o700); err != nil {
		return tls.Certificate{}, fmt.Errorf("devcert: create dir: %w", err)
	}
	certPEM, keyPEM, err := generate(hosts, now)
	if err != nil {
		return tls.Certificate{}, err
	}
	if err := writeNew(keyPath, keyPEM, 0o600); err != nil {
		return tls.Certificate{}, err
	}
	if err := writeNew(certPath, certPEM, 0o644); err != nil {
		return tls.Certificate{}, err
	}
	return load(certPath, keyPath)
}

// Fingerprint is the lowercase hex SHA-256 of the leaf certificate's DER.
func Fingerprint(cert tls.Certificate) string {
	if len(cert.Certificate) == 0 {
		return ""
	}
	sum := sha256.Sum256(cert.Certificate[0])
	return hex.EncodeToString(sum[:])
}

func generate(hosts []string, now time.Time) (certPEM, keyPEM []byte, err error) {
	key, err := ecdsa.GenerateKey(elliptic.P256(), rand.Reader)
	if err != nil {
		return nil, nil, fmt.Errorf("devcert: generate key: %w", err)
	}
	serial, err := rand.Int(rand.Reader, new(big.Int).Lsh(big.NewInt(1), 128))
	if err != nil {
		return nil, nil, fmt.Errorf("devcert: serial: %w", err)
	}
	tmpl := &x509.Certificate{
		SerialNumber:          serial,
		Subject:               pkix.Name{CommonName: "Cloud Box"},
		NotBefore:             now.Add(-time.Hour),
		NotAfter:              now.AddDate(validFor, 0, 0),
		KeyUsage:              x509.KeyUsageDigitalSignature,
		ExtKeyUsage:           []x509.ExtKeyUsage{x509.ExtKeyUsageServerAuth},
		BasicConstraintsValid: true,
		DNSNames:              append([]string{"localhost"}, hosts...),
		IPAddresses:           []net.IP{net.IPv4(127, 0, 0, 1), net.IPv6loopback},
	}
	der, err := x509.CreateCertificate(rand.Reader, tmpl, tmpl, &key.PublicKey, key)
	if err != nil {
		return nil, nil, fmt.Errorf("devcert: create certificate: %w", err)
	}
	keyDER, err := x509.MarshalPKCS8PrivateKey(key)
	if err != nil {
		return nil, nil, fmt.Errorf("devcert: marshal key: %w", err)
	}
	certPEM = pem.EncodeToMemory(&pem.Block{Type: "CERTIFICATE", Bytes: der})
	keyPEM = pem.EncodeToMemory(&pem.Block{Type: "PRIVATE KEY", Bytes: keyDER})
	return certPEM, keyPEM, nil
}

func load(certPath, keyPath string) (tls.Certificate, error) {
	cert, err := tls.LoadX509KeyPair(certPath, keyPath)
	if err != nil {
		return tls.Certificate{}, fmt.Errorf("devcert: load %s: %w", filepath.Dir(certPath), err)
	}
	return cert, nil
}

func exists(path string) (bool, error) {
	_, err := os.Stat(path)
	switch {
	case err == nil:
		return true, nil
	case errors.Is(err, fs.ErrNotExist):
		return false, nil
	default:
		return false, fmt.Errorf("devcert: %w", err)
	}
}

// writeNew creates path exclusively so an existing file is never overwritten.
func writeNew(path string, data []byte, perm os.FileMode) error {
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, perm)
	if err != nil {
		return fmt.Errorf("devcert: %w", err)
	}
	if _, err := f.Write(data); err != nil {
		f.Close()
		return fmt.Errorf("devcert: write %s: %w", filepath.Base(path), err)
	}
	if err := f.Sync(); err != nil {
		f.Close()
		return fmt.Errorf("devcert: sync %s: %w", filepath.Base(path), err)
	}
	return f.Close()
}
