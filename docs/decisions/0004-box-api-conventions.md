# ADR 0004: Box API conventions

Date: 2026-11-02 · Status: Accepted

## Context

M1 implements most of doc 04's API. Doc 04 lists endpoints but not the
details every client must agree on: how bytes travel in JSON, how a device
proves who it is, how uploads are split, how sync works and what "state"
means. `api/openapi.yaml` holds the exact shapes; this records why.

## Decision

**Encodings**
- Binary values in JSON (ciphertext, wrapped keys, public keys, signatures,
  salts) are standard base64 with padding, which is Go's default for `[]byte`.
- Hashes and challenges are lowercase hex (`sha256` of ciphertext, keyed
  BLAKE2b `dedupeHash`, the 32-byte challenge).
- Ids are 32 lowercase hex characters. User, device, collection and item ids
  come from the client (ADR 0003); upload and blob ids come from the box.
- Times are RFC 3339 UTC in JSON and Unix milliseconds in SQLite.
- The box checks ciphertext lengths only: wrapped keys are exactly 72 bytes
  (nonce 24 ‖ key 32 ‖ tag 16), `metadataEnc` 41 B–64 KiB, `nameEnc` 41 B–4 KiB.

**Device login**
- `POST /v1/auth/challenge` returns 32 random bytes (hex), valid 60 s, single use.
- The device signs the UTF-8 message `cloudbox/v1/auth/<deviceId>/<challengeHex>`
  with its Ed25519 key. The prefix and device id mean a signature can never be
  replayed for another device or reused as any other kind of signature.
  `@cloudbox/crypto` `authMessage` and Go `boxcrypto.AuthMessage` build it;
  `testdata/crypto-vectors.json` checks both.
- The session token is 32 random bytes, base64url without padding, sent as
  `Authorization: Bearer <token>`, valid 1 hour, and stored only as SHA-256.
  Revoking a device deletes its sessions at once.
- Every login failure (unknown device, revoked device, bad or expired
  challenge, bad signature) is the same `401 unauthorized`, so the box never
  reveals *why* a login failed. Device ids are not secret: asking for a
  challenge shows whether an id belongs to an active device. Ids are 128-bit
  random, so they cannot be guessed, and issuing challenges for unknown ids
  would only make the challenge cap easier to flood.
- Tokens, pairing codes and challenges are looked up by value (tokens and
  codes by their SHA-256), never compared byte by byte with attacker input, so
  no constant-time comparison is needed. The Ed25519 check itself is
  constant-time.

**Pairing**
- A signed-in device asks for a pairing code (same format as a session
  token, valid 10 minutes, single use, stored hashed) and shows it in the QR.
  The new device sends the code with its id, encrypted name and public key,
  then logs in normally and fetches `GET /v1/account` to unwrap the master key
  with the password.

**Uploads**
- Parts are 8 MiB (`8388608` bytes), numbered from 0; all but the last are
  exactly that size. Re-sending a part replaces it.
- Complete is safe to retry: the upload keeps its `blob_id`, so a client
  whose response was lost gets the same blob back (200) instead of a second one.
- Max blob 64 GiB. The box refuses a new upload (`507 storage_full`) when the
  main drive's free space is less than the size, plus the bytes still owed to
  other unfinished uploads, plus 1 GiB. Running out of space while writing is
  also `507 storage_full`.
- Each upload writes its parts straight into one file, part n at byte
  n × 8 MiB. Complete hashes that file and renames it into `blobs/`, so a blob
  is written once, with no assembly copy. If a re-sent part fails, that part
  counts as not received (its bytes may be half-replaced); the client sends it
  again.
- Complete finishes even if the client disconnects. If recording the blob
  fails, the file goes back to the upload so a retry can complete it.
- `verified` means re-read from the drive: before the re-read the box asks
  Linux to drop the file from its page cache (`fadvise DONTNEED`), so the hash
  is of the drive's bytes, not of memory.
- Abandoned uploads expire after 24 hours.

**Item state is computed, not stored**
- An item's state is the lowest state of its blobs: `stored` (file written
  and fsynced), `verified` (re-read hash matched), `replicated` (a verified copy
  on the backup drive). The box works it out from `blobs` and `replicas` on
  every read, so it can never claim more than is true (CLAUDE.md: safety
  status must be truthful).
- `uploading` stays in the enum for apps; the box does not return it, because
  items are created only from completed uploads.

**Sync**
- One global counter, `seq`. Creating, changing, trashing, restoring or
  replicating an item gives it a new `seq`; deleting it for good writes a
  tombstone with a new `seq`.
- `GET /v1/items?since=<cursor>&limit=<1..1000>` returns items and purged ids
  with `seq` above the cursor, in order, plus the next cursor and `more`.
  Trashed items are included with `trashedAt`.

**Errors**
- M0's `{code, message, action}` shape. Another user's object is `404`, never
  `403`, so ids do not leak. The codes are listed in the M1 plan and in each
  operation's description in `api/openapi.yaml`.

**Scope rulings recorded with this ADR**
- Setup works once, while no user exists, then `409 already_set_up`. Whether
  to also require a power-button press (physical presence) is decided in M2.
- The simulator's `/dev/sim/*` API is compiled only with the Go build tag
  `sim`; a Pi build never serves it.
- The HAL gains `Clock` and `Drive.Path` (doc 06).

## Known risks (accepted for M1)

- **A stolen, unlocked device can lock the owner out.** Any signed-in device
  can revoke the user's other devices, and the last active device cannot be
  revoked, so a thief could revoke the owner's devices first. The data stays
  encrypted, but the owner loses access. **M2 fixes this** with a
  recovery-key reset: at setup the app derives a signing key from the
  recovery key and the box stores only its public half; a signature with it
  revokes every device and pairs a new one, without the box ever seeing the
  recovery key.
- **Challenge flooding:** anyone who knows one active device id can request
  enough challenges to push other devices' pending challenges out of the
  1024-entry cap, so their login fails once and must be retried. Memory stays
  bounded. Rate limiting arrives in M8.
- **JSON field names are matched case-insensitively** (Go `encoding/json`),
  so the box accepts `"DEVICEID"` although the contract says `deviceId`. No
  security effect; clients must still send the contract's names.

## Alternatives considered

- **Cookie sessions:** the phone app is not a browser, and a bearer token
  works the same for both apps. The web app (M2) can keep the token in memory.
- **JWT sessions:** they cannot be revoked without a server-side list, which is
  what a hashed random token already is, with less to get wrong.
- **Content-addressed blob ids (`sha256` as the id):** reveals when two users
  upload identical ciphertext and couples ids to content; random ids do neither.
- **A stored `items.state` column:** must be updated in several places (upload,
  replication, scrub, backup drive loss) and can go stale; computing it is cheap
  at home scale.
- **Base64url for all binary fields:** saves nothing meaningful and would need
  custom JSON handling in Go.

## Consequences

- The generated `@cloudbox/api-client` types match these shapes; CI fails if
  `schema.ts` is out of date.
- Doc 04 gains `/v1/account`, `GET /v1/devices` and `/v1/devices/pairing-codes`
  (M1 docs task).
- Request rate limiting is not in M1; it arrives with remote access (M8),
  when the box is reachable beyond the home network.
