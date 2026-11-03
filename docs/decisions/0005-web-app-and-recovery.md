# ADR 0005: Web app, setup presence and recovery

Date: 2026-11-02 · Status: Accepted

## Context

M2 builds the web app (`web/`, served by `boxd`) and the client core it
shares with the M3 phone app (`@cloudbox/core`). ADR 0004 left three gaps:
anyone on the home network could claim a new box first, a lost password had
no flow, and losing every device locked the owner out. This records how M2
closes them and the formats the clients agree on. `api/openapi.yaml` holds
the exact shapes; `docs/plans/M2.md` holds the full scope rulings.

## Decision

**Setup needs a button press**
- `POST /v1/setup` works only within 10 minutes of a short press of the box's
  power button (read through `hal.PowerButton`), else `409 press_button`.
  `already_set_up` is checked first, so a set-up box still says so.
- Public `GET /v1/info` → `{setUp, setupOpen, version}` tells a new browser
  whether to show setup or connect.

**A browser is a device**
- A browser gets a non-extractable WebCrypto Ed25519 key in IndexedDB and
  logs in with ADR 0004's challenge flow. There is no password-only login:
  that would allow unlimited online guessing until rate limits arrive (M8).
- A second browser joins with a pairing code from Box › Add a device.
  `device.nameEnc` is optional at pairing because a new device has no master
  key yet; it sets its name with `PATCH /v1/devices/{id}` after its first
  unlock. `Device.nameEnc` is `null` until then.
- The master key lives only in memory: every page load and every Lock asks
  for the password. Nothing decrypted (names, dates, thumbnails) is stored in
  the browser. Cost: a full metadata sync per unlock.

**Recovery key**
- 32 random bytes shown as 24 BIP39 English words (`@scure/bip39`). Input
  accepts any case, extra whitespace and 4-letter prefixes.
- Subkeys: `crypto_kdf_derive_from_key(32, id, "cbrecov1", entropy)`; id 1 is
  the recovery wrap key (wraps the master key, AD
  `cloudbox/v1/user/<userId>/master-key/recovery`), id 2 is the Ed25519 seed
  of the recovery signing key. Setup sends its public half; the box stores it
  as `users.recovery_public_key` (unique).

**Two recovery flows**
- *Forgot password* (paired browser): the words unwrap the master key and the
  client sets a new password with `PUT /v1/account/password`. Nothing is
  revoked, so a forgotten password never signs out the owner's phone.
- *Recovery reset* (no device left): `POST /v1/recovery/challenge
  {recoveryPublicKey}` → a 60-second single-use challenge; `POST
  /v1/recovery/reset` with the recovery key's signature of UTF-8
  `cloudbox/v1/recover/<deviceId>/<signPublicKeyHex>/<challengeHex>`; the new
  device's public key is inside the signed message, so someone who intercepts
  the request (for example after the one-time certificate warning) cannot
  swap in their own key. In one transaction the box
  revokes every device of the user, deletes their sessions and pairing codes,
  and adds the new device. Every failure is the same `401`, and any attempt
  uses up the challenge.

**Password change**
- `PUT /v1/account/password {kdf, masterKeyByPassword}`. The box cannot check
  the old password (zero knowledge); any signed-in device may replace the
  wrap.

**Uploads take the hash at the end**
- `sha256` may come at `POST /v1/uploads` or at `/complete`; exactly one must
  carry it. A streaming client hashes ciphertext as it encrypts and uploads,
  and secretstream output is randomised, so the hash is known only after the
  last part.

**Collection delete is soft**
- `DELETE /v1/collections/{id}` only when no untrashed item and no undeleted
  child collection is in it, else `409 collection_not_empty`. It sets
  `deletedAt`; the collection stays listed because trashed items need its
  key. Restoring an item un-deletes its collection and deleted ancestors.
  The row and its keys go when its last item is purged.

**One collection per item**
- An item lives in exactly one album or folder; "Add to album" moves it and
  re-wraps its file key. Many-to-many albums wait for sharing (M7).

**Plaintext formats** (always inside AEAD ciphertext, AD per ADR 0003)
- Collection name: `{"v":1,"name":"…","role":null}`; `role` is `"photos"` or
  `"files"` for exactly one collection each.
- Item metadata: `{"v":1,"name","mime","size","modifiedAt","takenAt","width",
  "height","durationMs","favourite","thumbMime","previewMime"}`.
- Device name: UTF-8, at most 64 characters.

**Serving the web app**
- `boxd` embeds the built app and sends a strict Content-Security-Policy
  (`default-src 'self'`, `script-src 'self' 'wasm-unsafe-eval'`, no inline
  scripts or styles, `frame-ancestors 'none'`) plus `nosniff`,
  `no-referrer` and `same-origin` opener policy. Fonts are self-hosted.
- The box's certificate is self-signed and browsers cannot pin it, so the
  web app shows a certificate warning once. Real certificates need a domain
  (M8).

## Consequences

- Setup costs the owner one button press. Claiming a new box needs either
  physical access or someone on the same network acting during the 10
  minutes after the owner's press (see Known risks).
- A recovery key alone can take over the account by design. The printed key
  is the most sensitive object the owner has, and the setup flow says so.
- The web app does one full metadata sync per unlock (about 1 s per 10,000
  items).

## Known risks

- **Someone on the home network can claim the box during the setup window.**
  `/v1/info` is public, so a device on the LAN can watch for `setupOpen` and
  send its own setup in the 10 minutes after the owner presses the button.
  The owner then sees "already set up" and, until M5, has no reset short of
  wiping the data directory. Accepted for M2 (home network, short window).
  Mitigations to decide in M5: a long-press factory reset, and the setup
  screen showing a short code the box confirms on its light before it
  accepts setup.

- **Password wrap replaceable by any signed-in device.** A stolen unlocked
  device can set a new password. The recovery key still unwraps the master
  key, and the owner can revoke the device.
- **A copied browser profile may carry the device key.** Non-extractable keys
  resist theft by scripts, not by someone copying the profile from disk. The
  attacker would still need the password to unwrap the master key.
- **The web app trusts the box that serves it.** A malicious or compromised
  box could serve a malicious web app that captures the password. The phone
  app ships through the app stores and does not have this risk.
