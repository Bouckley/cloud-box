-- 0003: owner sessions (ADR 0010).
--
-- users.owner_public_key: public half of the owner key, derived by the client
--   from the master key. Null only for users created before this migration;
--   they can never get an owner session (dev boxes only: make reset-dev).
-- sessions.owner: 1 when the login also carried a valid owner signature.
--   Changing the password, revoking or pairing devices and deleting forever
--   need it.

ALTER TABLE users ADD COLUMN owner_public_key BLOB;

ALTER TABLE sessions ADD COLUMN owner INTEGER NOT NULL DEFAULT 0;
