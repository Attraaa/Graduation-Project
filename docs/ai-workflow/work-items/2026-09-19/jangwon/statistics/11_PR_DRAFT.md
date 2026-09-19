# PR 제목
목·어깨 관측 기록을 SQLite에 저장하고 통계·학습이력에 연결

## 1. Why
측정 결과가 화면 메모리에만 남아 통계와 학습이력의 고정 예시가 실제 관측을 설명하지 못했다. 이제 앱을 재시작해도 현재 계정의 로컬 기록을 조회한다.

## 2. What
- 저장소 루트 database/의 버전 계약, 캡처별 분 집계, Electron 내장 SQLite 원자 저장/복구/조회.
- 목·어깨 평균·전일 차이·관측률·시간·지속 이탈·기록 수·연속 관찰과 실제 이력 달력/상세.
- 저장 실패 재시도·종료 flush·현재 계정 삭제. AI·의학 영역은 기존 예시 표시 유지.

## 3. Non-goals
점수/기준/카메라 정책 변경, 키보드·안구 저장, 진짜 인증, 서버 전송/동기화, AI/의학 판정, 배포, 기존 DB 초기화.

## 4. 변경 전과 변경 후
| 상황 | 변경 전 | 변경 후 |
|---|---|---|
| 정상 경로 | 고정 통계/이력 | 현재 계정의 실제 로컬 조회 |
| 주요 실패 | 기록 저장 없음 | 실패 안내·동일 배치 재시도·커밋분 복구 |
| 중복/재시도 | 저장 없음 | ID/순번/digest로 중복 반영 방지 |
| 권한 없음 | 데모 계정 | 미로그인/브라우저는 저장·조회 불가 안내, 측정 동작 유지 |

## 5. 실행 흐름과 코드 위치
```text
PostureMonitor의 매 평가 결과
→ recording.beginPostureRecording / CaptureRecorder
→ preload motiRecords / main records IPC 검증
→ RecordRepository 트랜잭션
→ Statistics / LearningHistory 조회
```
| 책임 | 파일 | 심볼 | 설명 |
|---|---|---|---|
| 기록 입력 | front/src/components/PostureMonitor.tsx | recordCapture | UI 갱신과 독립 |
| 버킷/배치 | database/recorder.ts | CaptureRecorder | 실제 분 경계 누적 |
| 저장 | database/sqlite/repository.ts | RecordRepository | 검증·원자 저장·복구·조회·삭제 |
| 서비스 | front/src/features/records/recording.ts | save, finishRecordings | 재시도·종료 |
| IPC | front/electron/main.ts, preload.ts | records:*, motiRecords | 신뢰 문서만 접근 |
| 화면 | front/src/pages/Statistics.tsx, LearningHistory.tsx, Settings.tsx | 각 페이지 | 실제 조회 및 확인 후 삭제 |

## 6. 변경된 계약
- 공개 API: 없음. 기존 Express/Python 유지.
- 내부 인터페이스: RecordBatch/RecordQuery/RecordPage/RecordDetail/StatisticsRow, CaptureSink.
- DB/마이그레이션: 새 로컬 SQLite v1. 빈 새 파일만 초기화, 다른/미지원/손상 파일 보존.
- 이벤트/메시지: records generation/write/list/detail/statistics/clear/closing/close-ready.
- 설정/환경변수: 사용자 설정 추가 없음, app.userData/database/posture.sqlite.
- production dependency: 없음. 잠긴 Electron 내장 node:sqlite.
- 권한/보안 경계: main 창/프레임/문서와 payload 검사. 계정 ID는 데모 데이터 분리이며 보안 인증 아님.

## 7. 상태 변경과 부작용
- DB 쓰기/삭제: owners/records/buckets/batches, 사용자 확인 후 현재 계정 삭제.
- 외부 요청: 없음.
- 파일/캐시: 사용자 SQLite/WAL/SHM; 테스트는 front/.moti-cache 격리 프로필.
- 이벤트/알림/결제: 저장 상태/실패 UI, 종료 flush. 결제/외부 알림 없음.
- 트랜잭션: 요약·버킷·digest 원자 저장 및 삭제/generation 증가.
- 중복 방지: 안정 UUID·연속 순번·내용 digest·삭제 세대.

## 8. 위험
- 가장 위험한 실패: 미저장 상태에서 강제 종료.
- 실패 후 남는 상태: 이전 커밋은 유지하고 재시작 시 interrupted, 미전송분 유실 가능.
- 영향 범위: 해당 로컬 계정/기록, 원격 서버 없음.
- 발견 방법: 저장 실패 안내·중단된 이력·IPC 오류.
- 완화 방법: 약 1초 배치·원자 저장·pending 재시도·종료 확인. 자동 DB 초기화 없음.

## 9. 검증 증거
| 명령/검사 | 결과 | 비고 |
|---|---|---|
| setup.cmd / moti.cmd check | 통과 | 타입/린트, 당시 front91/server26/Python2 |
| 최종 front npm test | 94/94 통과 | 추가 3개 경계 검사 포함 |
| record-service.test.mjs 보강 | 통과 | 활성 기록 종료 실패/동일 배치 재시도 |
| npm run build -- --configLoader runner | 통과 | UI/main/preload |
| node scripts/check-records-electron.mjs | 두 프로세스 통과 | 별도 DB, 실제 IPC/UI/재시작/삭제/종료 |
| git diff --check / 보존 경로 diff | 통과 | 사람 파일·평가·카메라 코어 등 보존 |

### 핵심 테스트
파일 DB 롤백/잠금/손상 보존, generation 삭제, 시간 가중·자정·정책 분리, 실제 reducer 합계 재생, 102개 페이지, null/0, Electron 신뢰 창 및 실제 화면.

### 테스트가 증명하지 않는 것
의학적 정확도, 실물 촬영/장기 성능, production 인증/서버 동기화.

### 실행하지 못한 검사
깨끗한 PC 설치 패키지, 실제 카메라 장치 통합, 전원/디스크 고장과 native 저장 실패 대화상자 실조작. 빌드 경고·harness 수정 이력은 09_VERIFICATION.md.

## 10. 독립 리뷰 결과
- 해결한 P0/P1: 발견 없음. 종료 테스트의 활성 기록 실패 경로 assertion 보완.
- 남은 P2/P3: 장기 배치 digest 용량 및 한 기록의 전체 상세 버킷 조회 성능(P2).
- 승인된 예외: 별도 면제 없음. 실제 기기/운영 한계는 사람 검토에 명시.

## 11. 호환성·배포·롤백
- 배포 순서: 이해/최종 승인→실기기·설치 검증→별도 권한이 주어진 외부 작업.
- 이전 버전 호환: 이전 앱은 새 SQLite를 사용하지 않음. 기존 MySQL/localStorage 계정 보존.
- feature flag: 없음.
- 확인할 로그/지표: 저장 실패, interrupted, 관측률/자료 없음, DB 무결성.
- 롤백 조건: 저장·표시 회귀나 지속적 앱 지연.
- 롤백 절차: 앱 종료→원본 SQLite/WAL/SHM 보존→이전 코드 복원. 초기화 SQL 실행 금지.
- 되돌릴 수 없는 부분: 사용자가 확인한 데이터 삭제, 강제 종료 미전송분.

## 12. 관련 없는 변경 확인
- [x] 관련 없는 리팩터링을 포함하지 않았다.
- [x] 포맷팅 변경을 동작 변경과 섞지 않았다.
- [x] 승인되지 않은 dependency를 추가하지 않았다.
- [x] 테스트를 삭제하거나 약화하지 않았다.

## 13. AI 사용과 사람 검증
### AI가 지원한 영역
- [x] 탐색
- [x] 계획
- [x] 코드
- [x] 테스트
- [x] 문서
- [x] 리뷰

### 사람이 직접 확인한 영역
- [x] 요구사항 (04의 전체 계획 승인)
- [ ] 공개 계약
- [ ] 상태 변경
- [ ] 정상 흐름
- [ ] 실패 흐름
- [ ] 권한/보안
- [ ] 테스트 assertion
- [ ] 배포/롤백

### 아직 확인하지 못한 영역
사용자가 전반 확인 완료를 보고하고 구현 결과를 최종 승인했다(16_FINAL_APPROVAL.md). 개별 기기/정상·실패/설치 시나리오는 전달되지 않았으며 코드 이해 학습은 사용자 요청으로 유예했다. 개별 체크 항목은 임의로 통과 처리하지 않는다.

## 14. 관련 자료
- 이슈: 없음.
- 계획: 03_PLAN.md / 승인: 04_PLAN_REVIEW.md.
- ADR: adr/0001-local-posture-storage.md Accepted.
- 선행 PR: 없음. 실제 PR 미생성.
- 후속 작업: 실기기/설치/용량 검증, 서버 계약/인증/동기화.

## 리뷰어에게 요청하는 핵심 확인
1. 실제 관측과 예시 AI/의학 영역이 혼동되지 않는지.
2. 시간대·시작일 이력·관측일 통계와 누락/0점 표시를 이해했는지.
3. 저장 실패/삭제/강제 종료 한계와 데모 인증의 범위를 수용하는지.

PR 생성 전 placeholder: 없음. base는 실제 PR 생성 요청 시 대상 브랜치를 확인해야 하며 이 초안만으로 push/PR/병합 권한을 뜻하지 않는다.
