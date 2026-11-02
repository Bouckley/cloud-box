// Package boxcrypto holds the only two primitives the box runs itself
// (docs/decisions/0002-crypto-primitives.md): verifying Ed25519 device
// signatures and SHA-256 hashing of ciphertext. All encryption happens on
// clients; the box never holds a key that can decrypt anything.
package boxcrypto

import (
	"crypto/ed25519"
	"crypto/sha256"
)

// VerifyEd25519 reports whether signature is a valid Ed25519 signature of
// message by publicKey. Wrong-length inputs return false instead of panicking.
func VerifyEd25519(publicKey, message, signature []byte) bool {
	if len(publicKey) != ed25519.PublicKeySize || len(signature) != ed25519.SignatureSize {
		return false
	}
	return ed25519.Verify(ed25519.PublicKey(publicKey), message, signature)
}

// SHA256 returns the SHA-256 digest of data.
func SHA256(data []byte) [32]byte {
	return sha256.Sum256(data)
}
