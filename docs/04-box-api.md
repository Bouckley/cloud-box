# 4. Box API

REST over HTTPS, JSON bodies, versioned under `/v1`. The full contract lives in
`api/openapi.yaml`; this page is the overview. Encodings, device login,
sessions, upload parts, computed state and sync are decided in
[ADR 0004](decisions/0004-box-api-conventions.md).

Endpoints marked *(Mn)* are not built yet; they arrive in that milestone.

## Auth

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/setup` | First run only: create owner, store wrapped master key |
| POST | `/v1/auth/challenge` | Get a random challenge for a device |
| POST | `/v1/auth/verify` | Send the Ed25519 signature; returns a short-lived session token |
| GET | `/v1/account` | The signed-in user's wrapped keys and KDF settings (to unlock on a new device) |
| GET | `/v1/devices` | The user's devices (encrypted names, last seen, revoked) |
| POST | `/v1/devices/pairing-codes` | One-time pairing code (10 minutes) for the QR |
| POST | `/v1/devices/pair` | Pair a new device using a one-time code from the QR |
| DELETE | `/v1/devices/{id}` | Revoke a device (never the last one) |
| — | Password change, recovery-key reset *(M2)* | |

## Sync and items

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v1/items?since={cursor}` | Changes since cursor (encrypted records, deletions, next cursor) |
| POST | `/v1/items` | Create an item from completed uploads |
| PATCH | `/v1/items/{id}` | Move to another collection, update encrypted metadata |
| DELETE | `/v1/items/{id}` | Move to Trash |
| POST | `/v1/items/{id}/restore` | Restore from Trash |
| POST | `/v1/items/lookup` | "Do you already have these?" by dedupe hash; returns status per item |

## Uploads and blobs

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/uploads` | Start a resumable upload (size, hash) → `uploadId` |
| PUT | `/v1/uploads/{id}/parts/{n}` | Upload one chunk (8 MiB) |
| GET | `/v1/uploads/{id}` | Which parts arrived (to resume) |
| POST | `/v1/uploads/{id}/complete` | Box assembles, verifies hash, returns `blobId` |
| GET | `/v1/blobs/{id}` | Download (supports Range for video) |

## Collections, trash, sharing

| Method | Path | Purpose |
|--------|------|---------|
| GET/POST | `/v1/collections` | Albums and folders (encrypted names) |
| PATCH | `/v1/collections/{id}` | Rename, move |
| DELETE | `/v1/collections/{id}` *(M2)* | Delete (to Trash) |
| GET | `/v1/trash` | Items in Trash with days left |
| DELETE | `/v1/trash/{id}` | Delete permanently |
| POST | `/v1/invites` *(M7)* | Create a one-time invite for a family member |
| GET/DELETE | `/v1/members/{id}` *(M7)* | Manage members; roles: owner, member, helper, guest |
| POST | `/v1/links` *(M7)* | Share link (passcode, expiry) for a collection |

## Box status

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v1/status` | Safety summary: counts, last backup per device, copies, storage, warnings |
| GET | `/v1/events` *(M2)* | Server-sent events: upload progress, status changes, module attached |
| GET | `/v1/box/drives` *(M4)* | Drive health |
| GET | `/v1/box/modules` *(M9)* | Attached modules and whether each is verified |
| POST | `/v1/box/export` *(M4)* | Export everything to a USB drive (still encrypted, plus a decrypt tool) |

## Rules

- Every item response includes `state`: `uploading`, `stored`, `verified`, `replicated`.
  Apps show "safe" only for `replicated`.
- Errors use one JSON shape: `{ "code": "storage_full", "message": "...", "action": "..." }`.
  `action` is plain-language text the app can show.
- Another user's object is always `404`, never `403`.
- Request rate limiting arrives with remote access *(M8)*.
- The simulator's dev API (`/dev/sim/*`) is not part of this API: it exists
  only in builds with the `sim` tag (see doc 07).
- The `helper` role can call status, drives, modules, members and settings,
  and never item, blob or collection endpoints.
