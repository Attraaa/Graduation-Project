-- Apply before starting the updated API. Existing users and tokens start at version zero.
ALTER TABLE users ADD COLUMN session_version INT UNSIGNED NOT NULL DEFAULT 0 AFTER password_hash;

CREATE TABLE request_limits (
  bucket_id BINARY(32) NOT NULL PRIMARY KEY,
  expires_at BIGINT UNSIGNED NOT NULL,
  hits INT UNSIGNED NOT NULL DEFAULT 0,
  INDEX idx_request_limits_expires (expires_at)
);

CREATE TABLE request_leases (
  slot VARCHAR(80) CHARACTER SET ascii COLLATE ascii_bin NOT NULL PRIMARY KEY,
  holder CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  expires_at BIGINT UNSIGNED NOT NULL
);
