# 4. Box API

REST over HTTPS, JSON bodies, versioned under `/v1`. The full contract lives in
`api/openapi.yaml`; this page is the overview.

## Auth

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/v1/setup` | First run only: create owner, store wrapped master key |
| POST | `/v1/auth/challenge` | Get a random challenge for a device |
| POST | `/v1/auth/verify` | Send the Ed25519 signature; returns a short-lived session token |
| POST | `/v1/devices/pair` | Pair a new device using a one-time code from the QR |
| DELETE | `/v1/devices/{id}` | Revoke a device |

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
| PATCH/DELETE | `/v1/collections/{id}` | Rename, move, delete (to Trash) |
| GET | `/v1/trash` | Items in Trash with days left |
| DELETE | `/v1/trash/{id}` | Delete permanently |
| POST | `/v1/invites` | Create a one-time invite for a family member |
| GET/DELETE | `/v1/members/{id}` | Manage members; roles: owner, member, helper, guest |
| POST | `/v1/links` | Share link (passcode, expiry) for a collection |

## Box status

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/v1/status` | Safety summary: counts, last backup per device, copies, storage, warnings |
| GET | `/v1/events` | Server-sent events: upload progress, status changes, module attached |
| GET | `/v1/box/drives` | Drive health |
| GET | `/v1/box/modules` | Attached modules and whether each is verified |
| POST | `/v1/box/export` | Export everything to a USB drive (still encrypted, plus a decrypt tool) |

## Rules

- Every item response includes `state`: `uploading`, `stored`, `verified`, `replicated`.
  Apps show "safe" only for `replicated`.
- Errors use one JSON shape: `{ "code": "storage_full", "message": "...", "action": "..." }`.
  `action` is plain-language text the app can show.
- The `helper` role can call status, drives, modules, members and settings,
  and never item, blob or collection endpoints.
