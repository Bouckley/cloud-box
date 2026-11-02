# ADR 0002: Crypto primitives

Date: 2026-11-02 · Status: Accepted

## Context

Doc 03 listed "XChaCha20-Poly1305 `secretbox`" for metadata and key wrapping.
No such default function exists: libsodium's `crypto_secretbox_easy` is
**XSalsa20**-Poly1305. The XChaCha20 variant
(`crypto_secretbox_xchacha20poly1305_*`) is only in full libsodium builds, is
not exposed by `libsodium-wrappers-sumo` 0.8.x, and like every `secretbox` has
no associated data.

The box is untrusted. A malicious or buggy box could hand an app the encrypted
metadata or wrapped key of a *different* item; with plain `secretbox` under the
same key that would decrypt without error.

## Decision

`@cloudbox/crypto` wraps exactly these libsodium functions (TypeScript:
`libsodium-wrappers-sumo` 0.8.x, libsodium 1.0.22). The box (Go) uses only the
standard library for the two primitives it needs.

| Use | Function | Parameters and format |
|-----|----------|-----------------------|
| Password → KEK | `crypto_pwhash` with `crypto_pwhash_ALG_ARGON2ID13` | 16-byte random salt; 32-byte output; default `opslimit 3`, `memlimit 268435456` (256 MiB, libsodium's MODERATE). Salt and both limits are stored next to the wrapped key so they can be raised later. Password is Unicode NFC-normalised, then UTF-8 encoded. |
| Files (original, preview, thumbnail) | `crypto_secretstream_xchacha20poly1305_init_push` / `push` / `init_pull` / `pull` | 4 MiB plaintext chunks; each ciphertext chunk is plaintext + 17 bytes. Format: `header (24) ‖ chunk…`. The last chunk, and only the last, carries `TAG_FINAL`; decryption fails on a missing final tag, data after it, or reordered chunks. |
| Metadata, key wrapping | `crypto_aead_xchacha20poly1305_ietf_encrypt` / `_decrypt` | Random 24-byte nonce. Format: `nonce (24) ‖ ciphertext ‖ tag (16)`. **Associated data is required** and names what the ciphertext belongs to (for example the item id and field), so a ciphertext moved to another item fails to decrypt. |
| Sharing keys with another user | `crypto_box_seal` / `crypto_box_seal_open` (X25519) | Output = plaintext + 48 bytes. |
| Device login | `crypto_sign_detached` / `crypto_sign_verify_detached` (Ed25519) | 64-byte detached signatures. Box verifies with Go `crypto/ed25519`. |
| Upload integrity | `crypto_hash_sha256` | Box checks with Go `crypto/sha256`. |

`testdata/crypto-vectors.json` is generated once from these wrappers and
committed. TypeScript checks every section. Go checks only Ed25519 and SHA-256,
because those are the only primitives the box runs.

## Alternatives considered

- **`crypto_secretbox_easy` (XSalsa20-Poly1305):** safe with random nonces, but
  no associated data, so no protection against ciphertext swapping by the box.
- **`crypto_aead_chacha20poly1305_ietf` (12-byte nonce):** random nonces are
  too short to be safe at our volume; XChaCha20's 24 bytes are.
- **Argon2id SENSITIVE (1 GiB):** too much memory for older phones.

## Consequences

- Doc 03's building-blocks table and doc 05's note on `*_enc` columns now name
  these functions.
- Every caller must choose associated data. The convention is set in M1 with
  the data model (for example `item:<id>:metadata`).
- The keyed BLAKE2b dedupe hash (`crypto_generichash`) stays in doc 03 and is
  added in M1, where it is first used.
- Raising the KDF cost later needs no format change: the stored limits travel
  with each wrapped key.
