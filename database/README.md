# 목·어깨 로컬 기록

소스는 저장소 루트 `database/`, 실제 DB는 Electron `app.getPath('userData')/database/posture.sqlite`에 둡니다. `front/database`나 기존 MySQL SQL을 사용하지 않습니다. 이번 로컬 저장 결정은 [Accepted ADR](../docs/ai-workflow/work-items/2026-09-19/jangwon/statistics/adr/0001-local-posture-storage.md)에 근거합니다.

## 책임과 흐름

1. `PostureMonitor`는 기존 observation/evaluation 계산 직후 모든 캡처 결과의 누적 시간·점수 합을 `features/records/recording.ts`에 전달합니다. UI의 200ms 갱신 주기와 독립적입니다.
2. `recorder.ts / CaptureRecorder`가 실제 분 경계에 유효 구간의 사다리꼴 점수 적분을 분할합니다. 원시 프레임·영상·좌표·비밀번호는 저장하지 않습니다.
3. renderer는 약 1초마다 바뀐 분 버킷을 최대 120개씩 전달합니다. `contracts.ts`는 ID, 세대, 순번, 버전, 누적 합, 시간 범위의 직렬화 계약입니다.
4. Electron main만 `sqlite/repository.ts / RecordRepository` 연결을 소유합니다. 신뢰한 main 창의 원래 문서만 IPC를 호출할 수 있습니다.
5. `Statistics`와 `LearningHistory`가 IPC로 실제 데이터를 조회합니다. 목/어깨 표시 어댑터는 `front/src/features/records/modes/`에 있습니다.

## 시간과 숫자의 의미

- 실행 시간은 모델 준비·기준 수집·미관측 구간을 포함합니다. 유효 시간은 기존 관측 정책이 인정한 양수 캡처 간격(최대 500ms)만 사용합니다.
- 평균은 `scoreTimeSum / validMs`입니다. 유효 시간이 없으면 null이며 실제 0점과 구분합니다.
- 기록 시작 시각과 단조 시계 차이로 시간을 고정합니다. 시작 당시 UTC offset을 기록하므로 실행 중 PC 시계/시간대를 바꿔도 과거 기록을 다시 분류하지 않습니다. DST 변경도 기록 시작 offset을 유지합니다.
- 통계는 관측이 발생한 실제 날짜/시간에 분할합니다. 달력 이력은 기록 시작일에 한 번 표시하고 상세 그래프에는 날짜까지 표시합니다.
- 비교와 평균은 같은 모드·점수/습관 정책에서만 계산합니다. 최장 연속 관찰은 해당 날짜에 포함된 **기록 전체**의 최댓값입니다.
- 관측 누락은 휴식이나 정상 자세가 아닙니다. 유사도 변화는 건강 개선이나 질환 위험도가 아닙니다.

## 저장·복구·삭제

스키마 v1은 owners, records, buckets, batches와 인덱스를 사용합니다. application_id, user_version, quick_check, foreign_key_check를 확인하고 빈 새 파일만 초기화합니다. 손상·다른 제품·미지원 버전 파일은 덮어쓰지 않고 오류를 표시합니다. WAL과 synchronous=FULL을 사용합니다.

기록 요약, 바뀐 버킷, 순번 digest는 같은 트랜잭션으로 저장합니다. DB 합계와 요약이 불일치하면 전부 롤백합니다. 같은 ID/순번/내용 재시도는 한 번 반영하고 다른 내용의 순번 재사용·누적 감소는 거절합니다.

저장 실패 시 화면에 재시도 버튼을 표시하며 메모리 배치를 유지합니다. 정상 창 닫기는 flush 응답을 기다립니다. 5초 내 저장 확인을 받지 못하면 돌아가기 또는 미저장 기록을 버리고 닫기를 선택하게 합니다. 비정상 종료 후 커밋된 running 기록은 interrupted로 복구하지만 미전송 메모리까지 복원하지는 못합니다.

설정의 통계 삭제는 확인 후 현재 로컬 계정의 이력·버킷·중복 기록을 함께 삭제하고 generation을 증가시킵니다. 늦게 도착한 이전 배치가 삭제 데이터를 되살릴 수 없습니다. 이 삭제는 되돌릴 수 없습니다. 다른 계정은 보존합니다. 자동 보존기간 삭제·export·백업 UI는 없습니다.

계정 ID는 기존 localStorage 데모 계정의 데이터 분리 기준입니다. 같은 PC 사용자의 악의적 접근을 막는 인증/암호화 경계가 아닙니다. 브라우저 단독 실행에는 저장 IPC가 없으며 저장 불가를 안내합니다.

## 서버 연결 경계

`contracts.ts`는 React/Electron/SQL과 독립된 버전·안정 ID·시간·정책 계약입니다. 향후 서버 어댑터에서 인증된 사용자 매핑, 서버 API, 전송 확인/재시도, 삭제 전파와 충돌 정책을 구현해야 합니다. 현재 HTTP 전송·동기화 큐·서버 인증·암호화·의료 분석은 구현하지 않았습니다. 기존 Express/MySQL 집계와 혼합하지 않습니다.

## 검증과 실행

루트에서 `setup.cmd`, `moti.cmd check`를 사용합니다. 별도 npm 프로젝트/패키지 관리자는 추가하지 않았습니다. frontend 타입 검사와 린트가 루트 database 소스까지 포함합니다.

```powershell
. .\scripts\toolchain.ps1
Set-Location front
& $MotiNode $MotiNpm run build -- --configLoader runner
& $MotiNode scripts/check-records-electron.mjs
```

Electron 테스트는 `front/.moti-cache/records-electron-*`의 별도 프로필에 합성 데이터를 쓰고 두 앱 프로세스에서 재시작·IPC·통계·달력·상세·현재 계정 삭제·정상 종료를 검사합니다. 실제 사용자 DB/카메라/키 입력을 사용하지 않습니다. 캡처 PNG가 같은 프로필에 남습니다. Windows GPU 보조 프로세스가 허용되는 실행 환경이 필요합니다.

단위 테스트 `front/tests/record-*.test.mjs`는 계약, 파일 복구/잠금/롤백, 버킷 경계, 저장 재시도, 실 관측 reducer 재생, 집계·페이지·표시를 검증합니다. 실제 카메라 장시간 실행·설치 패키지·대규모 DB 성능은 별도 검증 대상입니다. 상세 조회는 한 기록의 분 버킷 전체, 중복 기록은 배치당 digest를 보관하므로 장기간 누적 데이터의 용량·조회 성능을 후속 측정해야 합니다.
