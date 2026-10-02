-- 002: 앱 기록(상체 목·어깨 분 단위 버킷, 키보드 집계)을 서버에 저장할 자리를 만듭니다.
--
-- 대상: 이미 server/schema.sql(+001)로 만든 DB. 새로 만드는 DB는 schema.sql만 실행하면 됩니다.
-- 이 파일은 테이블을 삭제하거나 기존 행을 바꾸지 않습니다. 계약은 database/README.md를 따릅니다.
--
-- 모든 기록 테이블은 utf8mb4_bin입니다. 기록 ID·집계 키는 대소문자를 구분하는 그대로 비교해야 하고,
-- 날짜/시간 문자열(YYYY-MM-DD, HH)은 사전순 비교가 곧 시간순이어야 하기 때문입니다.
-- data 열은 검증을 통과한 기록 요약 JSON 원문입니다. 조회 시 다시 같은 검증기로 읽습니다.

-- 1. 사용자별 삭제 세대. 통계 삭제마다 1씩 올라가며 이전 세대의 늦은 저장 요청을 거절합니다.
CREATE TABLE record_owners (
  user_id    INT NOT NULL PRIMARY KEY,
  generation INT NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;

-- 2. 상체 부위(turtle/shoulder) 기록 요약
CREATE TABLE posture_records (
  id           VARCHAR(120) NOT NULL PRIMARY KEY,      -- 클라이언트가 만든 UUID
  user_id      INT          NOT NULL,
  mode         VARCHAR(16)  NOT NULL,
  start_date   CHAR(10)     NOT NULL,                  -- 기록 시작 시각의 offset 기준 로컬 날짜
  started_at   BIGINT       NOT NULL,                  -- epoch ms
  score_policy VARCHAR(120) NOT NULL,
  habit_policy VARCHAR(120) NOT NULL,
  longest_ms   DOUBLE       NOT NULL,
  sequence     INT          NOT NULL,                  -- 마지막으로 반영한 배치 순번
  data         MEDIUMTEXT   NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_posture_records_owner_date (user_id, start_date, started_at)
) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;

-- 3. 실제 관측 분 단위 버킷. date/hour는 기록 시작 offset 기준 로컬 시각입니다.
CREATE TABLE posture_buckets (
  record_id               VARCHAR(120) NOT NULL,
  minute                  BIGINT       NOT NULL,       -- epoch ms, 60000의 배수
  date                    CHAR(10)     NOT NULL,
  hour                    CHAR(2)      NOT NULL,
  run_ms                  DOUBLE       NOT NULL,
  valid_ms                DOUBLE       NOT NULL,
  score_time_sum          DOUBLE       NOT NULL,
  deviation_ms            DOUBLE       NOT NULL,
  deviation_episode_count INT          NOT NULL,
  PRIMARY KEY (record_id, minute),
  FOREIGN KEY (record_id) REFERENCES posture_records(id) ON DELETE CASCADE,
  INDEX idx_posture_buckets_date (date, record_id)
) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;

-- 4. 반영한 배치의 digest. 같은 순번·같은 내용의 재시도는 한 번만 반영합니다.
CREATE TABLE posture_batches (
  record_id VARCHAR(120) NOT NULL,
  sequence  INT          NOT NULL,
  digest    CHAR(64)     NOT NULL,
  PRIMARY KEY (record_id, sequence),
  FOREIGN KEY (record_id) REFERENCES posture_records(id) ON DELETE CASCADE
) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;

-- 5. 키보드 세션 요약
CREATE TABLE keyboard_records (
  id         VARCHAR(120) NOT NULL PRIMARY KEY,
  user_id    INT          NOT NULL,
  start_date CHAR(10)     NOT NULL,
  sequence   INT          NOT NULL,
  data       MEDIUMTEXT   NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_keyboard_records_owner_date (user_id, start_date)
) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;

-- 6. 키보드 누적 집계. count_key는 [날짜, 키, 상황, 손가락, 판정, 원인] JSON 문자열입니다.
CREATE TABLE keyboard_counts (
  record_id VARCHAR(120) NOT NULL,
  count_key VARCHAR(255) NOT NULL,
  date      CHAR(10)     NOT NULL,
  data      TEXT         NOT NULL,
  PRIMARY KEY (record_id, count_key),
  FOREIGN KEY (record_id) REFERENCES keyboard_records(id) ON DELETE CASCADE,
  INDEX idx_keyboard_counts_date (date, record_id)
) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;

CREATE TABLE keyboard_batches (
  record_id VARCHAR(120) NOT NULL,
  sequence  INT          NOT NULL,
  digest    CHAR(64)     NOT NULL,
  PRIMARY KEY (record_id, sequence),
  FOREIGN KEY (record_id) REFERENCES keyboard_records(id) ON DELETE CASCADE
) DEFAULT CHARSET = utf8mb4 COLLATE = utf8mb4_bin;
