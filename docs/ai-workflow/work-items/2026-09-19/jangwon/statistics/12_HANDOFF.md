# 변경 인수인계: 목·어깨 실제 로컬 통계

## 한 문장 요약
기존 관측/평가 결과를 Electron 소유 SQLite에 저장해 통계와 학습이력을 실제 기록으로 바꿨다.

## 변경 이유 / 변경 전과 후
측정 값은 메모리에만 남고 통계/이력은 고정 예시였다. 이제 목·어깨 기록을 재시작 후 조회하며 설정에서 현재 계정만 삭제한다. AI/의학 영역은 예시로 유지한다.

## 핵심 구성요소
| 책임 | 파일 | 심볼 | 설명 |
|---|---|---|---|
| 측정 입력 | front/src/components/PostureMonitor.tsx | PostureMonitor / recordCapture | 매 평가 직후 호출, 종료/기준 변경 시 기록 분리 |
| 배치 상태 | front/src/features/records/recording.ts | beginPostureRecording, save, finishRecordings | 계정 고정·주기 저장·실패 재시도·종료 flush |
| 순수 시간 계산 | database/recorder.ts | CaptureRecorder | 분 경계 분할·누적 배치 |
| 계약 | database/contracts.ts | RecordBatch, RecordsApi, parseBatch | 안정 ID/순번/세대/버전/검증 |
| 파일 DB | database/sqlite/repository.ts | RecordRepository | 원자 저장·조회·복구·삭제 |
| IPC | front/electron/main.ts, preload.ts, recordHandlers.ts | records:* / motiRecords / recordCall | main 창·프레임·문서와 payload 검사 |
| 표시 | front/src/pages/Statistics.tsx, LearningHistory.tsx | Statistics, LearningHistory | 통계 그룹/달력/목록/상세/오류 |

## 정상 실행 흐름
1. 목/어깨 학습 시작 시 UUID·계정·정책·시작 시각으로 기록 생성.
2. 기존 evaluation 값을 캡처마다 전달하고 분 단위 누적.
3. 약 1초마다 IPC에서 검증해 SQLite 요약/버킷/digest를 원자 커밋.
4. 중지/이동/종료 시 flush, 앱 재시작 시 이전 running을 interrupted로 복구.
5. 통계는 실제 날짜별 버킷, 학습이력은 기록 시작일을 조회.

## 주요 실패 흐름
1. 쓰기 잠금/저장 실패는 트랜잭션 롤백과 오류 응답.
2. renderer는 pending 배치를 보존하고 저장 실패/재시도 안내.
3. 같은 ID/순번/내용 재시도는 중복 반영하지 않는다.
4. 닫기 flush 실패/5초 timeout이면 돌아가기 또는 미저장 기록을 버리고 닫기. 강제 종료 미전송분은 복원 보장 없음.

## 상태와 데이터
- 읽는 데이터: 기존 관측 평가 누적값, 데모 계정 ID, 점수/습관 정책.
- 쓰는 데이터: userData/database/posture.sqlite의 owners/records/buckets/batches. 영상·랜드마크·비밀번호 없음.
- 상태: running→finished, 시작 시 잔여 running→interrupted.
- 트랜잭션: 요약/변경 버킷/digest 또는 계정 삭제/generation 증가를 원자 처리.
- 중복 방지: UUID·연속 순번·digest; 삭제 generation으로 늦은 배치 무효화.

## 외부 계약
- API: 기존 HTTP API 변경/호출 없음. 원격 동기화 후속.
- 이벤트: 좁은 records IPC, renderer 종료 flush 및 측정 중지 이벤트.
- 설정: 사용자 DB 경로 고정, 임의 SQL/경로 노출 안 함.
- 외부 시스템: 없음. 로그인은 데모라 OS 사용자 사이 보안 경계는 아니다.

## 디버깅 시작점
- 저장 실패 문구와 RecordingStatus의 재시도, repository의 parse/transaction/합계 오류부터 확인.
- DB 스키마가 다르거나 손상되면 삭제/초기화하지 말고 앱 종료 후 원본과 WAL/SHM을 함께 보존해 조사.
- 이력의 interrupted는 정상 종료 전 끊긴 기록. 자료 없음은 관측이 없어 평균을 계산할 수 없는 상태.
- 테스트 재현은 database/README.md의 명령으로 격리 프로필만 사용.

## 테스트 지도
| 테스트 | 대상 | 실행 |
|---|---|---|
| record-contracts/database/ipc | 값·파일·잠금·롤백·조회·신뢰 경계 | front npm test |
| record-capture/replay/service | 분 경계·실 평가 일치·재시도/종료 | front npm test |
| record-statistics/ui | 가중 평균·정책·자정·0/null·표시 | front npm test |
| electron-record-smoke | 실제 main/preload/UI·재시작·삭제 | node scripts/check-records-electron.mjs |

## 배포와 롤백
실제 PR/push/배포는 하지 않았다. 설치 전 실기기와 깨끗한 PC 검증 필요. 이전 코드로 되돌리면 새 SQLite를 읽지 않지만 파일은 보존할 수 있다. 문제 조사 때 DB를 초기화하지 않는다. 사용자가 확인 후 실행한 데이터 삭제와 강제 종료 미전송분은 되돌릴 수 없다.

## 알려진 제한과 후속 작업
실제 카메라/설치/장기간 성능, DB 용량·상세 페이지 상한, 서버 인증/전송/삭제 동기화 후속. 통계의 최장 연속 시간은 포함 기록 전체, 시간대는 시작 offset 고정. 이해 워크시트와 최종 승인은 사용자가 작성한다.
