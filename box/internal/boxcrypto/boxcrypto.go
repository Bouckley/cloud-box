// Package boxcrypto holds the only primitives the box runs itself
// (docs/decisions/0002-crypto-primitives.md): verifying Ed25519 device
// signatures (over AuthMessage) and SHA-256 hashing of ciphertext. All encryption happens on
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

// AuthMessage is the message a device signs to log in (ADR 0004):
// UTF-8 "cloudbox/v1/auth/<deviceID>/<challengeHex>". It must match
// authMessage in @cloudbox/crypto; testdata/crypto-vectors.json checks both.
// Callers validate deviceID and challengeHex first.
func AuthMessage(deviceID, challengeHex string) []byte {
	return []byte("cloudbox/v1/auth/" + deviceID + "/" + challengeHex)
}

// RecoverMessage is the message the recovery signing key signs to reset a box
// onto a new device (ADR 0005): UTF-8
// "cloudbox/v1/recover/<deviceID>/<challengeHex>". The prefix keeps it apart
// from AuthMessage, and the device id binds the signature to one device. It
// must match recoverMessage in @cloudbox/crypto; testdata/crypto-vectors.json
// checks both. Callers validate deviceID and challengeHex first.
func RecoverMessage(deviceID, challengeHex string) []byte {
	return []byte("cloudbox/v1/recover/" + deviceID + "/" + challengeHex)
}
