# 5. Storage and data model

SQLite holds metadata (mostly encrypted fields); encrypted blobs sit as files on
the main SSD. The backup drive gets a nightly copy of both.

## Disk layout (on the Pi)

```
/srv/cloudbox/                 Main SSD, ext4, mounted by UUID
├── db/box.sqlite              WAL mode
├── blobs/ab/cd/<blobId>       Encrypted blobs, sharded by id prefix
├── uploads/<uploadId>/        Chunks of uploads in progress
└── tmp/
/srv/cloudbox-backup/          Backup drive
├── db/box-YYYYMMDD.sqlite     Nightly snapshot (VACUUM INTO), keep 7
└── blobs/...                  Mirror of blobs/
```

On a laptop the same layout lives under `./.data/` in the repo (git-ignored).

## Tables

| Table | Key columns | Notes |
|-------|-------------|-------|
| `users` | id, role, public_key, wrapped_master_key, wrapped_by_recovery | Wrapped keys only |
| `devices` | id, user_id, name_enc, sign_public_key, last_seen, revoked_at | |
| `collections` | id, owner_id, kind (album/folder), parent_id, name_enc, seq | |
| `collection_keys` | collection_id, user_id, wrapped_key | One row per member |
| `items` | id, owner_id, collection_id, metadata_enc, dedupe_hash, state, seq, trashed_at | `seq` drives sync |
| `blobs` | id, size, sha256_ciphertext, stored_at, verified_at | |
| `item_blobs` | item_id, blob_id, role (original/preview/thumb) | |
| `replicas` | blob_id, target (backup), copied_at, verified_at | Feeds "safe" status |
| `uploads` | id, device_id, size, sha256, parts_received, expires_at | |
| `invites`, `links` | token_hash, collection_id, role, expires_at | Tokens stored hashed |
| `events` | id, kind, at, detail | For the helper's activity view; no content |

`*_enc` columns hold libsodium `secretbox` ciphertext the box can't read.
A global monotonic `seq` increments on every change; clients sync with `since=seq`.

## Item state machine

```
uploading → stored → verified → replicated
                \______ trashed (any state) → purged after 30 days
```

- `stored`: blob file written and fsynced.
- `verified`: box re-read the file and the hash matches.
- `replicated`: the copy on the backup drive exists and its hash matches.

## Jobs

| Job | When | What |
|-----|------|------|
| Replicate | Nightly at 02:00, and 10 min after a big upload | Copy new blobs and a DB snapshot to the backup drive |
| Scrub | Weekly | Re-hash a slice of blobs on both drives; flag mismatches |
| Trash purge | Daily | Delete items trashed more than 30 days ago and unreferenced blobs |
| Upload cleanup | Hourly | Remove abandoned uploads older than 24 h |
| Health | Every 15 min | Drive SMART, free space, temperature → status warnings |

## Migrations

Numbered SQL files in `box/migrations/`, applied at startup inside a transaction.
Never edit an applied migration; add a new one.
