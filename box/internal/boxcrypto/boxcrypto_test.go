package boxcrypto

import (
	"bytes"
	"crypto/ed25519"
	"encoding/hex"
	"encoding/json"
	"os"
	"testing"
)

// vectors mirrors the parts of testdata/crypto-vectors.json the box uses.
type vectors struct {
	Version int `json:"version"`
	Ed25519 []struct {
		Seed      string `json:"seed"`
		PublicKey string `json:"publicKey"`
		Message   string `json:"message"`
		Signature string `json:"signature"`
		Valid     bool   `json:"valid"`
	} `json:"ed25519"`
	SHA256 []struct {
		Input  string `json:"input"`
		Digest string `json:"digest"`
	} `json:"sha256"`
	AuthMessage []struct {
		DeviceID  string `json:"deviceId"`
		Challenge string `json:"challenge"`
		Message   string `json:"message"`
		PublicKey string `json:"publicKey"`
		Signature string `json:"signature"`
	} `json:"authMessage"`
}

func loadVectors(t *testing.T) vectors {
	t.Helper()
	raw, err := os.ReadFile("../../../testdata/crypto-vectors.json")
	if err != nil {
		t.Fatalf("read vectors: %v", err)
	}
	var v vectors
	if err := json.Unmarshal(raw, &v); err != nil {
		t.Fatalf("parse vectors: %v", err)
	}
	if v.Version != 1 || len(v.Ed25519) == 0 || len(v.SHA256) == 0 || len(v.AuthMessage) == 0 {
		t.Fatalf("unexpected vectors: version %d, %d ed25519, %d sha256, %d authMessage",
			v.Version, len(v.Ed25519), len(v.SHA256), len(v.AuthMessage))
	}
	return v
}

func unhex(t *testing.T, s string) []byte {
	t.Helper()
	b, err := hex.DecodeString(s)
	if err != nil {
		t.Fatalf("bad hex %q: %v", s, err)
	}
	return b
}

func TestVectors(t *testing.T) {
	v := loadVectors(t)

	for i, row := range v.Ed25519 {
		pub := unhex(t, row.PublicKey)
		if got := VerifyEd25519(pub, unhex(t, row.Message), unhex(t, row.Signature)); got != row.Valid {
			t.Errorf("ed25519[%d]: VerifyEd25519 = %v, want %v", i, got, row.Valid)
		}
		if row.Valid {
			derived := ed25519.NewKeyFromSeed(unhex(t, row.Seed)).Public().(ed25519.PublicKey)
			if !bytes.Equal(derived, pub) {
				t.Errorf("ed25519[%d]: seed gives public key %x, want %x", i, derived, pub)
			}
		}
	}

	for i, row := range v.SHA256 {
		got := SHA256(unhex(t, row.Input))
		if hex.EncodeToString(got[:]) != row.Digest {
			t.Errorf("sha256[%d] = %x, want %s", i, got, row.Digest)
		}
	}

	for i, row := range v.AuthMessage {
		msg := AuthMessage(row.DeviceID, row.Challenge)
		if hex.EncodeToString(msg) != row.Message {
			t.Errorf("authMessage[%d] = %q, want hex %s", i, msg, row.Message)
		}
		if !VerifyEd25519(unhex(t, row.PublicKey), msg, unhex(t, row.Signature)) {
			t.Errorf("authMessage[%d]: signature does not verify over the Go-built message", i)
		}
	}
}

func TestVerifyWrongLengths(t *testing.T) {
	v := loadVectors(t)
	row := v.Ed25519[0]
	pub, msg, sig := unhex(t, row.PublicKey), unhex(t, row.Message), unhex(t, row.Signature)

	if VerifyEd25519(pub[:31], msg, sig) {
		t.Error("31-byte public key verified")
	}
	if VerifyEd25519(pub, msg, sig[:63]) {
		t.Error("63-byte signature verified")
	}
	if VerifyEd25519(nil, msg, nil) {
		t.Error("nil key and signature verified")
	}
}
