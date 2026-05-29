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
  id             INT      NOT NULL AUTO_INCREMENT PRIMARY KEY,
  session_id     INT      NOT NULL,
  user_id        INT      NOT NULL,
  status         ENUM('GOOD','WARNING','DANGER') NOT NULL,
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
