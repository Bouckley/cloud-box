# 3. Security and encryption

The box and anyone who steals it see only encrypted data. Keys live on the
owner's devices and on a printed recovery key.

## Building blocks

Use libsodium on every platform so all clients produce identical results.

| Use | libsodium function | Libraries |
|-----|---------------------|-----------|
| Password → key | Argon2id: `crypto_pwhash` with `ALG_ARGON2ID13` | libsodium-wrappers-sumo (web), react-native-libsodium (app) |
| Encrypt files (streaming) | XChaCha20-Poly1305 `crypto_secretstream_xchacha20poly1305_*` | same |
| Encrypt metadata, wrap keys | XChaCha20-Poly1305 AEAD `crypto_aead_xchacha20poly1305_ietf_*`, with associated data | same |
| Share keys with another user | X25519 sealed box (`crypto_box_seal`) | same |
| Device login | Ed25519 `crypto_sign_detached` | same; Go stdlib `crypto/ed25519` on the box |
| Upload integrity | SHA-256 `crypto_hash_sha256` | same; Go stdlib `crypto/sha256` on the box |
| Dedupe without revealing content | Keyed BLAKE2b (`crypto_generichash`) of plaintext with a per-user key | same (added in M1) |

Exact parameters, formats and the reasons for each choice are in
[ADR 0002](decisions/0002-crypto-primitives.md). Note that libsodium's plain
`crypto_secretbox_easy` is XSalsa20-Poly1305 and is not used.

Never write custom crypto. Wrap these calls once in `@cloudbox/crypto` and
test them against `testdata/crypto-vectors.json` in TypeScript (all
primitives) and Go (Ed25519 and SHA-256, the only ones the box runs).

## Key hierarchy

```
Password ──Argon2id──► Key-encryption key (KEK)
                           │ unwraps
Recovery key (24 words) ───┤
                           ▼
                     Master key (random, 32 bytes)
                           │ wraps
            ┌──────────────┼──────────────────┐
            ▼              ▼                  ▼
     Collection keys   Identity keypair    Dedupe key
     (album/folder)    (X25519, sharing)
            │
            ▼ wraps
       File keys (one per item) ──► encrypt original, preview, thumbnail, metadata
```

- The box stores the master key **only wrapped** (by the KEK and by the recovery key).
- Each paired device gets an Ed25519 device key for logging in to the box.
- Sharing an album wraps its collection key to each member's X25519 public key.
- Removing a member rotates the collection key for new items.

## What the box can see

| Box can see | Box can't see |
|-------------|---------------|
| Number of items and blob sizes | Photo or file contents |
| Which device uploaded, and when | File names, dates taken, locations |
| Which collection an item belongs to (by random id) | Album and folder names |
| Members' public keys | Any private key or password |

## Transport

- HTTPS on the home network with a self-signed certificate.
- The pairing QR code carries the certificate fingerprint; apps pin it, so
  no certificate warnings and no man-in-the-middle.
- Later, the relay forwards this same encrypted connection and sees nothing.

## Recovery

- Setup requires saving the 24-word recovery key (print or write down) and
  confirming two random words before continuing.
- Forgotten password: recovery key unwraps the master key; user sets a new password.
- Lost recovery key and password: data can't be recovered. Say this plainly at setup.

## Threat model (short)

| Threat | Defence |
|--------|---------|
| Box stolen | Blobs and metadata encrypted; disks also encrypted at rest (LUKS) later |
| Someone on home Wi-Fi | Pinned TLS, device-key login, rate limits |
| Lost phone | Revoke the device from another device; app has biometric lock |
| Malicious update | Updates signed with an offline key; box verifies before installing |
| Company compelled to hand over data | Company never holds keys or data |

## Security checks before each milestone ships

- Run the Trail of Bits `insecure-defaults` and `sharp-edges` skills on new code.
- Run `spec-to-code-compliance` against this document.
- No secrets in logs: grep test logs for key material in CI.
