-- 0002: schema for the web app milestone (M2), in one file.
--
-- users.recovery_public_key: the public half of the recovery signing key
--   (ADR 0005). Null only for users created before this migration; unique so
--   one recovery key always finds one user.
-- collections.deleted_at: soft delete. A deleted collection stays listed
--   because trashed items still need its key (ADR 0005).
-- uploads.sha256 becomes nullable: a streaming client sends the hash at
--   complete. SQLite cannot drop NOT NULL in place, so uploads and
--   upload_parts are dropped and recreated. In-progress uploads are discarded;
--   the cleanup job removes their part files, and clients upload again.

ALTER TABLE users ADD COLUMN recovery_public_key BLOB;
CREATE UNIQUE INDEX users_recovery_key ON users (recovery_public_key);

ALTER TABLE collections ADD COLUMN deleted_at INTEGER;

DROP TABLE upload_parts;
DROP TABLE uploads;

CREATE TABLE uploads (
  id         TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL REFERENCES users (id),
  device_id  TEXT NOT NULL REFERENCES devices (id),
  size       INTEGER NOT NULL,
  sha256     TEXT,
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
