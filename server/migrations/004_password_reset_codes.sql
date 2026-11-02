-- 004: 이메일로 받은 인증 코드로 비밀번호를 재설정하기 위한 테이블을 추가합니다.
-- 대상: 003_eye_records.sql까지 적용한 DB. 새 DB에는 schema.sql을 사용합니다.
-- 기존 테이블/행을 삭제하거나 수정하지 않습니다. 계약은 database/README.md를 따릅니다.

-- 사용자당 최근 코드 하나. 코드는 해시만 저장하고, 다시 요청하면 코드와 시도 횟수를 새로 씁니다.
CREATE TABLE password_reset_codes (
  user_id    INT      NOT NULL PRIMARY KEY,
  code_hash  CHAR(64) NOT NULL,
  expires_at DATETIME NOT NULL,
  attempts   INT      NOT NULL DEFAULT 0,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
