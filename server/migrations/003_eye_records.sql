-- 003: 안구 세션과 분 단위 집계를 기존 서버 기록에 추가합니다.
-- 대상: 002_record_tables.sql까지 적용한 DB. 새 DB에는 schema.sql을 사용합니다.
-- 기존 테이블/행을 삭제하거나 수정하지 않습니다. 계약은 database/README.md를 따릅니다.

CREATE TABLE eye_records (
  id             VARCHAR(120) NOT NULL PRIMARY KEY,
  user_id        INT          NOT NULL,
  start_date     CHAR(10)     NOT NULL,
  started_at     BIGINT       NOT NULL,
  policy_version VARCHAR(120) NOT NULL,
  sequence       BIGINT       NOT NULL,
  data           MEDIUMTEXT   NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_eye_records_owner_date (user_id, start_date, started_at)
) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;

CREATE TABLE eye_buckets (
  record_id      VARCHAR(120) NOT NULL,
  minute         BIGINT       NOT NULL,
  date           CHAR(10)     NOT NULL,
  hour           CHAR(2)      NOT NULL,
  run_ms         DOUBLE       NOT NULL,
  valid_ms       DOUBLE       NOT NULL,
  blinks         BIGINT       NOT NULL,
  breaks         BIGINT       NOT NULL,
  near_reminders BIGINT       NOT NULL,
  open_reminders BIGINT       NOT NULL,
  PRIMARY KEY (record_id, minute),
  FOREIGN KEY (record_id) REFERENCES eye_records(id) ON DELETE CASCADE,
  INDEX idx_eye_buckets_date (date, record_id)
) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;

CREATE TABLE eye_batches (
  record_id VARCHAR(120) NOT NULL,
  sequence  BIGINT       NOT NULL,
  digest    CHAR(64)     NOT NULL,
  PRIMARY KEY (record_id, sequence),
  FOREIGN KEY (record_id) REFERENCES eye_records(id) ON DELETE CASCADE
) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;
