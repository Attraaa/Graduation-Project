-- HeidiSQL에서 실행
-- 대상 DB: Graduation_Project (이미 선택된 상태에서 실행)

-- 기존 UML 기반 테이블 삭제 (이름 불일치 정리)
SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS dashboard;
DROP TABLE IF EXISTS feedBack;
DROP TABLE IF EXISTS calendar;
DROP TABLE IF EXISTS `Session`;
DROP TABLE IF EXISTS `user`;

-- 기존 서버 테이블도 초기화 (재생성 위해)
DROP TABLE IF EXISTS keystroke_events;
DROP TABLE IF EXISTS calibration_references;
DROP TABLE IF EXISTS feedback;
DROP TABLE IF EXISTS posture_logs;
DROP TABLE IF EXISTS daily_statistics;
DROP TABLE IF EXISTS sessions;
DROP TABLE IF EXISTS users;
SET FOREIGN_KEY_CHECKS = 1;

-- 1. 사용자 (UML: User)
CREATE TABLE users (
  id            INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  username      VARCHAR(50)  NOT NULL UNIQUE,           -- 로그인 ID (UML: userName)
  nickname      VARCHAR(100) NOT NULL,                  -- 화면 표시 이름
  email         VARCHAR(255),                           -- 이메일 (UML: email)
  password_hash VARCHAR(255) NOT NULL,                  -- bcrypt 해시 (UML: password)
  settings      JSON,
  created_at    DATETIME     NOT NULL DEFAULT NOW()     -- (UML: create_date)
);

-- 2. 학습 세션 (UML: session, start_date 제거)
CREATE TABLE sessions (
  id          INT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id     INT      NOT NULL,
  mode        VARCHAR(50),
  score       INT      DEFAULT 100,
  alert_count INT      NOT NULL DEFAULT 0,
  started_at  DATETIME NOT NULL DEFAULT NOW(),          -- (UML: start_time)
  ended_at    DATETIME,                                 -- (UML: end_time)
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. 자세 로그 — 실시간 측정값 (추세 그래프용, UML에 없던 테이블 추가)
CREATE TABLE posture_logs (
  id             BIGINT   NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id     INT      NOT NULL,
  user_id        INT      NOT NULL,
  -- UNAVAILABLE은 관찰이 끊긴 구간입니다. 좋은 자세도 나쁜 자세도 아닙니다.
  status         ENUM('GOOD','WARNING','DANGER','UNAVAILABLE') NOT NULL,
  -- 어느 지표의 값인지. 값이 있으면 지표도 있어야 합니다.
  metric         ENUM('nose_offset','nose_height','shoulder_diff'),
  measured_value FLOAT,
  recorded_at    DATETIME NOT NULL DEFAULT NOW(),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE
);

CREATE INDEX idx_posture_recorded_at  ON posture_logs(recorded_at);
CREATE INDEX idx_posture_user_session ON posture_logs(user_id, session_id);

-- 4. 일일 통계 (UML: calendar)
CREATE TABLE daily_statistics (
  id                       INT  NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id                  INT  NOT NULL,
  record_date              DATE NOT NULL,               -- (UML: date)
  mode                     VARCHAR(50) NOT NULL,
  total_monitoring_seconds INT  NOT NULL DEFAULT 0,     -- (UML: total_time → 초)
  bad_posture_seconds      INT  NOT NULL DEFAULT 0,
  average_score            FLOAT,                       -- (UML: avg_score)
  session_count            INT  NOT NULL DEFAULT 0,
  UNIQUE KEY uq_user_date_mode (user_id, record_date, mode),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 5. 피드백 (UML: feedBack)
CREATE TABLE feedback (
  id            INT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id       INT      NOT NULL,
  date          DATE     NOT NULL,
  mode          VARCHAR(50),
  feedback_text TEXT,
  created_at    DATETIME NOT NULL DEFAULT NOW(),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 6. 매 세션 기준 자세 (UML에 없던 테이블 추가)
-- 기준 자세 없이는 posture_logs.measured_value를 나중에 해석할 수 없습니다.
CREATE TABLE calibration_references (
  session_id     INT          NOT NULL PRIMARY KEY,
  user_id        INT          NOT NULL,
  schema_version SMALLINT     NOT NULL,
  source_id      VARCHAR(128) NOT NULL,              -- 비디오 트랙 ID
  width_px       SMALLINT UNSIGNED NOT NULL,
  height_px      SMALLINT UNSIGNED NOT NULL,
  sample_count   SMALLINT UNSIGNED NOT NULL,
  collected_ms   INT          NOT NULL,              -- 수집 구간 길이. 단조 시계라 시각이 아님
  nose_offset    FLOAT        NOT NULL,              -- 세 지표 모두 어깨 너비 대비 비율
  nose_height    FLOAT        NOT NULL,
  shoulder_diff  FLOAT        NOT NULL,
  created_at     DATETIME     NOT NULL DEFAULT NOW(),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE
);

-- 7. 키 입력별 손가락 판정 (UML에 없던 테이블 추가)
CREATE TABLE keystroke_events (
  id              BIGINT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id      INT         NOT NULL,
  user_id         INT         NOT NULL,
  key_code        VARCHAR(24) NOT NULL,              -- KeyboardEvent.code
  observed_finger VARCHAR(16),                       -- 'left:index'. 판정 보류면 NULL
  verdict         ENUM('preferred','acceptable','mismatch','unknown') NOT NULL,
  reason          VARCHAR(32) NOT NULL,
  confidence      FLOAT,
  frame_delta_ms  SMALLINT,
  policy_id       VARCHAR(32) NOT NULL,
  policy_version  VARCHAR(16) NOT NULL,              -- 정책이 바뀌면 옛 판정과 섞지 않기 위해 저장
  recorded_at     DATETIME    NOT NULL DEFAULT NOW(),
  FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id)    REFERENCES users(id)    ON DELETE CASCADE
);

CREATE INDEX idx_keystroke_session ON keystroke_events(session_id, recorded_at);
CREATE INDEX idx_keystroke_verdict ON keystroke_events(user_id, verdict);
