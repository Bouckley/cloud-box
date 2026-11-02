-- M1 schema. Times are Unix milliseconds (UTC). Columns ending in _enc and
-- wrapped keys hold ciphertext the box cannot read (ADR 0002, ADR 0003).
-- Never edit this file once applied; add a new numbered migration instead.

CREATE TABLE counters (
  name  TEXT PRIMARY KEY,
  value INTEGER NOT NULL
) STRICT;
INSERT INTO counters (name, value) VALUES ('seq', 0);

CREATE TABLE users (
  id                  TEXT PRIMARY KEY,
  role                TEXT NOT NULL CHECK (role IN ('owner', 'member', 'helper', 'guest')),
  kdf_salt            BLOB NOT NULL,
  kdf_ops             INTEGER NOT NULL,
  kdf_mem             INTEGER NOT NULL,
  master_key_password BLOB NOT NULL,
  master_key_recovery BLOB NOT NULL,
  identity_public_key BLOB NOT NULL,
  identity_key_enc    BLOB NOT NULL,
  dedupe_key_enc      BLOB NOT NULL,
  created_at          INTEGER NOT NULL
) STRICT;

CREATE TABLE devices (
  id              TEXT PRIMARY KEY,
  user_id         TEXT NOT NULL REFERENCES users (id),
  name_enc        BLOB NOT NULL,
  sign_public_key BLOB NOT NULL,
  created_at      INTEGER NOT NULL,
  last_seen       INTEGER NOT NULL,
  revoked_at      INTEGER
) STRICT;
CREATE INDEX devices_user ON devices (user_id);

CREATE TABLE sessions (
  token_hash BLOB PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id),
  device_id  TEXT NOT NULL REFERENCES devices (id),
  expires_at INTEGER NOT NULL
) STRICT;
CREATE INDEX sessions_device ON sessions (device_id);

CREATE TABLE pairing_codes (
  code_hash  BLOB PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id),
  created_by TEXT NOT NULL REFERENCES devices (id),
  expires_at INTEGER NOT NULL,
  used_at    INTEGER
) STRICT;

CREATE TABLE collections (
  id         TEXT PRIMARY KEY,
  owner_id   TEXT NOT NULL REFERENCES users (id),
  kind       TEXT NOT NULL CHECK (kind IN ('album', 'folder')),
  parent_id  TEXT REFERENCES collections (id),
  name_enc   BLOB NOT NULL,
  seq        INTEGER NOT NULL,
  created_at INTEGER NOT NULL
) STRICT;
CREATE INDEX collections_owner ON collections (owner_id);

CREATE TABLE collection_keys (
  collection_id TEXT NOT NULL REFERENCES collections (id) ON DELETE CASCADE,
  user_id       TEXT NOT NULL REFERENCES users (id),
  wrapped_key   BLOB NOT NULL,
  PRIMARY KEY (collection_id, user_id)
) STRICT;

CREATE TABLE blobs (
  id          TEXT PRIMARY KEY,
  owner_id    TEXT NOT NULL REFERENCES users (id),
  size        INTEGER NOT NULL,
  sha256      TEXT NOT NULL,
  stored_at   INTEGER NOT NULL,
  verified_at INTEGER
) STRICT;

CREATE TABLE uploads (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id),
  device_id  TEXT NOT NULL REFERENCES devices (id),
  size       INTEGER NOT NULL,
  sha256     TEXT NOT NULL,
  part_count INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  blob_id    TEXT REFERENCES blobs (id) ON DELETE SET NULL
) STRICT;

CREATE TABLE upload_parts (
  upload_id TEXT NOT NULL REFERENCES uploads (id) ON DELETE CASCADE,
  n         INTEGER NOT NULL,
  size      INTEGER NOT NULL,
  PRIMARY KEY (upload_id, n)
) STRICT;

CREATE TABLE items (
  id            TEXT PRIMARY KEY,
  owner_id      TEXT NOT NULL REFERENCES users (id),
  device_id     TEXT NOT NULL REFERENCES devices (id),
  collection_id TEXT NOT NULL REFERENCES collections (id),
  file_key_enc  BLOB NOT NULL,
  metadata_enc  BLOB NOT NULL,
  dedupe_hash   TEXT NOT NULL,
  seq           INTEGER NOT NULL,
  created_at    INTEGER NOT NULL,
  trashed_at    INTEGER,
  UNIQUE (owner_id, dedupe_hash)
) STRICT;
CREATE INDEX items_owner_seq ON items (owner_id, seq);

CREATE TABLE item_blobs (
  item_id TEXT NOT NULL REFERENCES items (id) ON DELETE CASCADE,
  blob_id TEXT NOT NULL UNIQUE REFERENCES blobs (id),
  role    TEXT NOT NULL CHECK (role IN ('original', 'preview', 'thumb')),
  PRIMARY KEY (item_id, role)
) STRICT;

CREATE TABLE replicas (
  blob_id     TEXT NOT NULL REFERENCES blobs (id) ON DELETE CASCADE,
  target      TEXT NOT NULL,
  copied_at   INTEGER NOT NULL,
  verified_at INTEGER,
  PRIMARY KEY (blob_id, target)
) STRICT;

CREATE TABLE tombstones (
  item_id  TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  seq      INTEGER NOT NULL
) STRICT;
CREATE INDEX tombstones_owner_seq ON tombstones (owner_id, seq);
