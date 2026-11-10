-- 005: 가입·이메일 변경 전에 그 주소로 보낸 인증 코드를 확인하기 위한 테이블을 추가합니다.
-- 대상: 004_password_reset_codes.sql까지 적용한 DB. 새 DB에는 schema.sql을 사용합니다.
-- 기존 테이블/행을 삭제하거나 수정하지 않습니다. 계약은 database/README.md를 따릅니다.

-- 주소당 최근 코드 하나. 아직 계정에 저장되지 않은 주소라 사용자 대신 소문자 이메일로 구분합니다.
-- 코드는 해시만 저장하고, 다시 요청하면 코드와 시도 횟수를 새로 쓰며, 맞게 쓰면 지웁니다.
CREATE TABLE email_verification_codes (
  email      VARCHAR(255) NOT NULL PRIMARY KEY,
  code_hash  CHAR(64)     NOT NULL,
  expires_at DATETIME     NOT NULL,
  attempts   INT          NOT NULL DEFAULT 0
);
