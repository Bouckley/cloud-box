# ADR 0010: Owner sessions — destructive actions need the master key

Date: 2026-11-04 · Status: Accepted (owner, 2026-11-04: "fix now")

## Context

The M2 security pass (Task 18, sharp-edges review) found that the device key
on its own was enough to replace the password wrap, revoke devices, pair new
ones and delete Trash items forever. A browser keeps that key while it is
locked, a freshly paired device has it before anyone types the password, and
a copied browser profile carries it. ADR 0005 had assumed only an *unlocked*
device could do these things. Deleted data does not come back with the
recovery key, so this was the one way M2 could lose data for good.

The box cannot check a password (zero knowledge), so the proof has to come
from something only a holder of the master key can make.

## Decision

- **Owner key.** `crypto_kdf_derive_from_key(32, 1, "cbowner1", masterKey)`
  is the seed of an Ed25519 *owner key*. Setup sends its public half as
  `user.ownerPublicKey`; the box stores it as `users.owner_public_key`
  (migration 0003). It never changes: the master key never changes, and a
  password change or recovery reset keeps the master key.
- **Owner sessions.** `POST /v1/auth/verify` takes an optional
  `ownerSignature`: the owner key's signature of UTF-8
  `cloudbox/v1/owner/<deviceId>/<challengeHex>`, over the same single-use
  challenge as the device signature. If it verifies, the session is an
  *owner session* (`sessions.owner = 1`). A bad owner signature fails the
  whole login with the same `401`. Without one the session is ordinary.
- **What needs an owner session** (else `403 owner_required`):
  `PUT /v1/account/password`, `DELETE /v1/devices/{id}` (revoke),
  `POST /v1/devices/pairing-codes`, `DELETE /v1/trash/{id}` (delete forever).
  Everything else, including moving items to Trash (30 days to restore),
  works with an ordinary session.
- **The client** signs as owner whenever it holds the master key: right after
  unlock, setup, forgot password and recovery reset it logs in again as owner,
  and a re-login after the hourly session expiry does the same while
  unlocked. A locked client logs in as an ordinary device.
- **Lock ends the session on the box:** `DELETE /v1/auth/session` (204), sent
  by `lock()` without waiting; the client forgets the token either way.

## Consequences

- Someone holding only a device key can read ciphertext and move items to
  Trash, but cannot change the password, delete anything for good, remove
  devices or add new ones. The owner can restore from Trash and revoke them.
- Accounts made before migration 0003 have no owner key, so they can never
  get an owner session. Only dev boxes exist; `make reset-dev` starts again.
- A stolen *unlocked* browser (master key in memory) still has full power,
  as before; Lock and revoke remain the answer.
