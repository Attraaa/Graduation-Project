# 09. 검증 기록

## 계획 단계 기준 검사 — 2026-09-19

- 코드 리비전: `08207145474724baf32f5df2010e36652dfea858` (`score`).
- 코드 변경: 없음. 이번 결과는 SQLite 기능 구현 검증이 아니다.
- 작업 디렉터리: `F:\graduation_pr\front`.
- 명령: `& 'F:\graduation_pr\.tools\node-v24.20.0-win-x64\node.exe' --test 'tests/*.test.mjs'`.
- 결과: exit 0; tests 72, pass 72, fail 0, cancelled 0, skipped 0, todo 0.
- 범위: 기존 기준 수집·관측·카메라 생명주기·목/어깨 점수/습관·SSR 표시·키보드 정책 테스트.
- 미실행: setup, 전체 moti check, 프론트 빌드, 신규 SQLite, 실제 카메라, Electron 저장/조회/재시작, 설치 패키지.
- 이유: 현재는 계획 단계이며 `02_PLAN_DRAFT_INSTRUCTIONS.md`는 패키지 설치와 DB migration을 금지한다. 구현 승인 뒤 setup/check와 관련 통합 검사를 수행한다.

## 구현 검증

아직 시작하지 않음. 계획 검토 및 필요한 ADR 승인 후 단계별 실제 결과를 추가한다.

## ADR 사전 호환성 확인 — 2026-09-19

프로젝트 node.exe와 설치된 Electron electron.exe의 ELECTRON_RUN_AS_NODE=1에서 `require('node:sqlite')`, `new DatabaseSync(':memory:')`, `SELECT sqlite_version()`와 close를 수행했다. Node 24.20.0/SQLite 3.53.4, Electron 41.10.7의 Node 24.18.0/SQLite 3.53.1을 확인했다. exit 0. 임시 환경변수는 원래 값으로 복구했다. 사용자 DB 파일/테이블은 생성하지 않았다. 실제 Electron main, 파일 DB, 트랜잭션/백업/설치 번들 호환성은 아직 미검증이다. 코드가 바뀌지 않아 기존 72개 테스트는 재실행하지 않았다.
