# 09. 검증 기록

## 기준과 범위
- 2026-09-19, Windows x64, branch score.
- 시작 HEAD: 08207145474724baf32f5df2010e36652dfea858, 최초 계약 체크포인트: fff451ff5ed264deda17b75e26a247a014f674e1.
- 아래 최종 검증은 fff451f 이후 단계 2~7의 현재 작업 트리에 적용한다. 이후 프로덕션 코드 변경 없음. 최종 코드 커밋: 429db9edd24ccfbe9af1ec4072c4183848b59e5f. 이후 문서 전용 변경은 코드 검증을 무효화하지 않는다.
- 01/04/13/16 사람 소유 파일과 ADR 승인 원문 보존 확인. calibration/observation/scoring/evaluation, 점수 정책, hooks, server, keyboard-detect 무변경을 git diff로 확인.

## 실행 증거
| 검사 | 실제 결과 |
|---|---|
| 구현 전 frontend 테스트 | 72/72 통과 (시작 HEAD) |
| setup.cmd | Node/npm·Python 환경 복원 완료. 기존 Vite/Moti가 보유한 파일 잠금으로 앞선 두 실행 실패, 해당 개발 프로세스 종료 후 성공 |
| moti.cmd check | exit 0. frontend 타입/린트·91 테스트, 서버 빌드·26 테스트, Python 2 테스트와 import/모델/키 맵 로딩 성공 |
| 추가 경계 검사 후 npm test | exit 0. frontend 94/94, fail/skip/cancel 0. foreign DB 보존, 102개 페이지/전체 counts, 실제 reducer 재생 추가 |
| 종료 실패 시 재시도 assertion 보강 후 node --test tests/record-service.test.mjs | exit 0. 활성 측정 flush 실패는 close=false, 같은 배치 재시도 후 close=true 및 finished 확인 |
| npm run build -- --configLoader runner | exit 0. UI, 실제 SQLite를 포함한 Electron main, CommonJS preload 생성 |
| node scripts/check-records-electron.mjs | exit 0. 별도 프로필을 사용한 seed/verify 두 Electron 프로세스 검사 통과 |
| git diff --check | 공백 오류 없음. Windows LF→CRLF 안내는 남음 |

모든 npm/Node 명령은 scripts/toolchain.ps1의 프로젝트 도구로 실행했다. package lock/production dependency 추가 없음. 프로젝트 Node 24.20.0/SQLite 3.53.4, 설치된 Electron 41.10.7의 Node 24.18.0/SQLite 3.53.1에서 내장 SQLite를 확인했다.

## 파일 DB·기록·집계 테스트
- 실제 임시 파일 재시작, running→interrupted 복구, quick/foreign-key 검사.
- 요약/버킷 불일치 원자 롤백, 쓰기 잠금 후 재시도, 읽기 전용 실패, foreign/future/corrupt 파일 비파괴 보존.
- 소유자 격리, 동일 순번 재전송/내용 충돌/순서 오류, 삭제 generation과 늦은 저장 거부.
- 분/자정/연말 경계의 시간 가중 사다리꼴 분할, 181분 backlog의 120개 제한 전송, immutable pending 배치, 늦은 콜백 무효화.
- 실제 observation/evaluation에 누락·중복·역행 프레임 재생 후 시간/적분/이탈/연속 관찰 합계 일치.
- 긴 100점과 짧은 0점의 시간 가중 평균 90점, missing/0 분리, 모드·정책·계정 분리, 중복 기록 수 방지.
- 102개 기록의 100/2 페이지 분리와 달력 전체 counts. 통계/이력 실제 표시 컴포넌트 SSR.

## 실제 Electron 실행과 화면
- 실제 빌드된 main/preload/React를 사용. fixture는 테스트 프로필에만 저장.
- 정상 쓰기·중복 저장·잘못된 payload 거부, 다른 BrowserWindow의 같은 페이지에서도 records IPC 거부.
- 두 번째 프로세스에서 이전 기록 유지 및 running→interrupted 확인.
- 목 50점/어깨 75점, 관측률 50% 조회·모드 전환, 일/주/월 달력 및 상세 그래프.
- 설정 삭제 취소 시 유지, 삭제 승인 시 demo만 삭제/admin 보존, 이전 세대 쓰기 거절 및 통계 빈 결과.
- renderer 정상 종료 flush 승인 후 창 종료.
- 최종 캡처 디렉터리: F:/graduation_pr/front/.moti-cache/records-electron-WT3syV
- seed-statistics.png, verify-history.png, verify-detail.png를 직접 확인. 통계 카드, 달력 2개 기록, 실제 상세 50점/날짜 그래프와 예시 안내 확인. 합성 데이터이며 실제 촬영 결과가 아니다.

## 검증 중 실패와 해결
- 기본 Vite config loader의 node_modules/.vite-temp 쓰기 제한: 같은 설정의 지원 runner loader로 빌드 성공.
- 샌드박스 Electron GPU 프로세스 종료: 승인된 정상 Windows 실행 환경에서 격리 프로필 테스트 성공.
- 테스트 harness의 preload 속성 기반 창 탐지가 창 생성 이벤트에서 동작하지 않아 timeout: 기존 splash/main 생성 순서로 식별해 해결.
- 예시 안내 assertion의 문구 불일치 수정. 숨긴 창 캡처가 이전 프레임을 반환해 capture 옵션/두 번 캡처로 해결 후 PNG 재확인.
- 단계 2 체크포인트 권한 검토가 한도 문제로 한 차례 거절됨. 이를 우회하지 않고 구현/검증을 계속했다. 최종 체크포인트 결과는 STATUS에 별도 기록.

## 경고 및 검증 한계
- 기존 UI 500kB 초과 청크 경고, records 모듈의 정적/동적 import 중복 안내. SSR에서는 ResponsiveContainer가 DOM 크기를 얻지 못하는 경고. 실제 Electron 차트는 표시 확인.
- 실제 카메라/물리 장치/권한 거부/장시간 측정 통합, 깨끗한 PC의 NSIS 설치 패키지, 대규모 DB 성능은 미검증.
- 전원 차단/강제 종료 직전 메모리 배치의 복원은 보장하지 않음. 저장 실패 native 경고 대화상자 자체는 자동 클릭하지 않았으며 renderer 실패 응답과 main 경로를 테스트/리뷰로 확인.
- 데모 계정 ID는 보안 인증이 아님. 원격 서버 전송·동기화·AI/의학 분석은 미구현.
- 사용자 실제 DB, 기존 MySQL DB/초기화 SQL, 카메라·키 입력은 이번 테스트에서 사용하지 않았다.

## 사용자 최종 확인 보고
사용자가 “다 확인했어. 최종승인할게”라고 전반 확인과 최종 승인을 직접 보고했다. 구체적인 기기·측정/설치 시나리오·검사 로그는 전달되지 않았다. 이는 위 AI 자동 검증과 별도의 사용자 확인이며, 미실행 기술 검사를 소급하여 통과로 표시하지 않는다. 코드 변경 없음.