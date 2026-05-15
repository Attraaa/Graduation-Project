-- 1. 사용자 테이블
CREATE TABLE IF NOT EXISTS users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    username VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 2. 측정 세션 테이블 (모드별 시작/종료 기록)
CREATE TABLE IF NOT EXISTS sessions (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    mode VARCHAR(50) NOT NULL,  -- 'turtle', 'wrist', 'shoulder', 'eye'
    started_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    ended_at TIMESTAMP NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 3. 자세 이벤트 로그 테이블 (타임스탬프와 함께 위험 상태 기록)
CREATE TABLE IF NOT EXISTS posture_logs (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    session_id BIGINT NOT NULL,
    user_id INT NOT NULL,
    status ENUM('GOOD', 'WARNING', 'DANGER') NOT NULL,
    measured_value FLOAT COMMENT '측정된 각도나 거리 값',
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (session_id) REFERENCES sessions(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- 빠른 조회를 위한 인덱스 생성
CREATE INDEX idx_posture_logs_recorded_at ON posture_logs(recorded_at);
CREATE INDEX idx_posture_logs_user_session ON posture_logs(user_id, session_id);

-- 4. 일일 통계 테이블 (통계 화면을 위한 요약 데이터)
CREATE TABLE IF NOT EXISTS daily_statistics (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    user_id INT NOT NULL,
    record_date DATE NOT NULL,
    mode VARCHAR(50) NOT NULL,
    total_monitoring_seconds INT DEFAULT 0 COMMENT '오늘 총 모니터링 시간(초)',
    bad_posture_seconds INT DEFAULT 0 COMMENT '오늘 불량 자세 노출 시간(초)',
    average_value FLOAT COMMENT '오늘 평균 측정 값',
    UNIQUE KEY (user_id, record_date, mode),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
