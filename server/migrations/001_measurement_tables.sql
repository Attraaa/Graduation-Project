-- 001: 측정 파이프라인이 실제로 만드는 데이터를 저장할 자리를 만듭니다.
--
-- 대상: 이미 server/schema.sql로 만든 DB. 새로 만드는 DB는 schema.sql만 실행하면 됩니다.
-- 이 파일은 테이블을 삭제하지 않습니다. 기존 users/sessions/posture_logs 데이터는 유지됩니다.
--
-- 이 마이그레이션이 다루지 않는 것:
--   sessions.score를 NULL 허용으로 바꾸는 변경은 자세 점수 산식이 정해진 뒤 별도 마이그레이션으로 합니다.
--   지금 컬럼만 바꾸면 쓰는 코드가 없는 컬럼이 늘어납니다.

-- 1. 매 세션 기준 자세
-- 기준 자세 없이는 posture_logs.measured_value를 나중에 해석할 수 없습니다.
-- 세션당 한 벌만 존재합니다. 기준을 다시 잡으면 새 세션입니다.
CREATE TABLE calibration_references (
  session_id     INT          NOT NULL PRIMARY KEY,
  user_id        INT          NOT NULL,
  schema_version SMALLINT     NOT NULL,              -- 프론트 CalibrationReference.schemaVersion
  source_id      VARCHAR(128) NOT NULL,              -- 비디오 트랙 ID. 장치가 바뀌면 기준도 무효
  width_px       SMALLINT UNSIGNED NOT NULL,
  height_px      SMALLINT UNSIGNED NOT NULL,
  sample_count   SMALLINT UNSIGNED NOT NULL,
  -- 수집에 걸린 시간(ms). 프론트의 startedAtMs/completedAtMs는 performance.now() 단조 시계라
  -- 벽시계 시각이 아니므로 시각으로 저장하지 않고 구간 길이만 저장합니다.
  collected_ms   INT          NOT NULL,
  -- 세 지표 모두 어깨 너비 대비 비율입니다. 각도나 점수가 아닙니다.
  nose_offset    FLOAT        NOT NULL,
  nose_height    FLOAT        NOT NULL,
  shoulder_diff  FLOAT        NOT NULL,
  created_at     DATETIME     NOT NULL DEFAULT NOW(),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE
);

-- 2. 키 입력별 손가락 판정
-- policy_version을 함께 저장해야 정책이 바뀐 뒤 옛 판정과 섞이지 않습니다.
CREATE TABLE keystroke_events (
  id              BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id      INT         NOT NULL,
  user_id         INT         NOT NULL,
  key_code        VARCHAR(24) NOT NULL,              -- KeyboardEvent.code
  observed_finger VARCHAR(16),                       -- 'left:index' 형식. 판정 보류면 NULL
  verdict         ENUM('preferred','acceptable','mismatch','unknown') NOT NULL,
  reason          VARCHAR(32) NOT NULL,              -- 판정/보류 사유
  confidence      FLOAT,                             -- 판정 보류면 NULL
  frame_delta_ms  SMALLINT,                          -- 키 입력과 사용한 프레임의 시간차
  policy_id       VARCHAR(32) NOT NULL,
  policy_version  VARCHAR(16) NOT NULL,
  recorded_at     DATETIME    NOT NULL DEFAULT NOW(),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE
);

CREATE INDEX idx_keystroke_session ON keystroke_events(session_id, recorded_at);
CREATE INDEX idx_keystroke_verdict ON keystroke_events(user_id, verdict);

-- 3. 자세 로그: 관찰 불가와 지표 구분
-- UNAVAILABLE이 없으면 카메라가 사람을 놓친 구간을 GOOD/WARNING/DANGER 중 하나로 왜곡해야 합니다.
-- metric이 없으면 세 지표를 measured_value 한 칸에 섞어 넣게 됩니다.
ALTER TABLE posture_logs
  MODIFY id     BIGINT NOT NULL AUTO_INCREMENT,
  MODIFY status ENUM('GOOD','WARNING','DANGER','UNAVAILABLE') NOT NULL,
  ADD COLUMN metric ENUM('nose_offset','nose_height','shoulder_diff') NULL AFTER status;
