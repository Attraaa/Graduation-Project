# 설치·실행·검증 가이드

기준: 2026-09-12. Windows x64에서 아래 자동 설치와 검사를 실행했습니다. 다른 세 팀원의 새 PC에서 재현한 결과는 아직 없습니다. 과거 환경의 실패는 [최초 감사 기록](development-initial-audit.md)에 보존했습니다.

## 1. 처음 설치

저장소를 받은 뒤 루트의 `setup.cmd`를 더블클릭합니다. 터미널을 이용한다면 프로젝트 루트에서:

```powershell
.\moti.cmd setup
.\moti.cmd check
```

Node/npm, uv, Python을 찾아 따로 설치할 필요가 없습니다. [toolchain.json](../toolchain.json)의 도구를 `.tools`에 설치하고, 프론트·서버는 `npm ci`, Python은 `uv sync --locked`로 준비합니다. Node와 uv 배포 파일의 SHA-256을 검사하며 Python은 uv의 관리형 CPython을 사용합니다. 글로벌 PATH나 기존 Python 설치는 변경하지 않습니다.

첫 설치에는 인터넷과 충분한 디스크 공간이 필요합니다. Python 추론 라이브러리와 Electron 때문에 다운로드가 큽니다. 공유 폴더의 `node_modules`나 `.venv`를 복사하지 말고 각 PC에서 같은 스크립트를 실행합니다. 설치가 중단되거나 의존성 잠금이 바뀌면 같은 명령을 다시 실행합니다.

현재 자동 설치는 Windows **x64** 전용입니다. 최소 Windows 버전과 ARM64 지원은 별도 검증 대상입니다. 이 스크립트는 개발 환경 설치용이며 일반 사용자는 추후 Windows 앱 설치 파일을 받는 구조입니다.

설치 스크립트는 .NET의 운영체제·아키텍처 정보를 직접 확인합니다. 실행 환경에서 `OS` 환경변수가 빠져 있어도 Windows x64를 정상 판별합니다.

`setup.cmd`는 Windows PowerShell로 실행됩니다. 다른 PowerShell 버전의 모듈 경로를 상속받아 `Get-FileHash`를 찾지 못하는 경우를 방지하기 위해, 설치 스크립트가 실행 중인 PowerShell에 포함된 Utility/Archive 모듈을 명시적으로 불러옵니다.

## 2. 일상적인 실행

앱은 루트의 `moti.cmd`를 더블클릭하면 실행됩니다. 앱 종료 또는 실행 실패 후에는 메시지를 읽을 수 있도록 키 입력을 기다립니다. 명령 목록은 `.\moti.cmd help`로 확인합니다.

프로젝트 루트의 PowerShell에서 각 프로세스는 별도 터미널로 실행합니다.

| 명령 | 동작 |
| --- | --- |
| `.\moti.cmd app` | Vite와 Electron 개발 앱 실행 |
| `.\moti.cmd server` | Express API 개발 서버 실행 |
| `.\moti.cmd keyboard` | Python 키보드/손가락 콘솔 테스트, 전역 키 수집 비활성 |
| `.\moti.cmd keyboard-web` | Python 웹 테스트 서버, 기본 주소 `http://127.0.0.1:5055` |
| `.\moti.cmd check` | 프론트 타입·린트·테스트, 서버 빌드·테스트, Python import/모델 검사 |
| `.\moti.cmd package` | 프론트/Electron 빌드 후 Windows 설치 패키징 |

현재 프론트 로그인은 로컬 데모이며 목·어깨 통계·이력과 키보드 통계는 Electron의 실제 SQLite 기록입니다. 런타임 DB는 프로젝트 상대 경로 `database/sqlite/posture.sqlite`에 생성되며 Git에는 포함되지 않습니다. 상체 측정은 화면에서 **기준 자세 잡고 시작**을 누를 때 카메라를 요청하고 중지 시 해제합니다. 키보드 모드는 **카메라 연결하고 시작**을 누르면 Electron이 로컬 Python 분석기를 자동 실행하고, 키보드 위치를 잡은 뒤 현재 Moti 화면의 키 입력을 실시간 판정합니다. 설정에서 승인한 일반 앱은 사용자가 외부 관찰을 켠 세션에서만 관찰하며, 관리자·미승인 앱은 제외합니다. 키보드는 문자 원문 대신 날짜·키·손가락·판정별 횟수만 로컬 저장합니다. 목·어깨·키보드의 서버 전송은 연결하지 않았으며 안구 모드는 깜빡임·상대 얼굴 크기·휴식 안내를 화면에 표시하며 저장은 하지 않습니다. Windows에서 `eye.cmd`로 브라우저 안구 시연만 실행할 수도 있습니다. 설치·촬영·검증 범위는 [eye-mode.md](eye-mode.md)를 참고합니다.

Python 콘솔 테스트는 OpenCV 미리보기에서 키를 입력하고 ESC로 종료합니다. 다른 앱의 키까지 수집하는 것은 기본 실행 경로가 아닙니다. 키보드 전체와 손이 보이는 손캠 구도가 필요합니다.

## 3. 서버와 DB

설치 스크립트는 `server/.env`가 없을 때만 예시에서 생성하고 임의 JWT 비밀값을 넣습니다. 기존 파일을 덮어쓰지 않습니다. `.env`는 커밋하거나 공유 문서에 복사하지 않습니다. 기존 JWT가 예시값/짧은 값이면 서버가 시작을 거부하므로 충분히 긴 임의 값으로 교체합니다.

DB 제품·개발 서버·보존할 데이터는 아직 미정입니다. 현재 어댑터는 MySQL이며 `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` 설정과 호환 스키마가 있어야 DB 기능이 동작합니다. 설치 스크립트는 DB 생성·초기화·seed를 실행하지 않습니다.

**`server/schema.sql`은 테이블을 삭제합니다.** `front/database_schema.sql`도 서버 쿼리와 다릅니다. 대상 DB와 데이터 보존 여부를 확인한 뒤 비파괴 마이그레이션을 준비해야 합니다.

```powershell
Invoke-RestMethod http://localhost:4000/health
```

`status: ok`는 HTTP 프로세스 확인만 의미합니다. 실제 가입·로그인·세션 저장과 조회까지 통과해야 DB 연결을 검증한 것입니다. 서버 테스트는 실제 DB 대신 대역을 사용하며 현재 DB에는 접속하지 않았습니다.

## 4. 개별 검사와 빌드

자동 실행 경로는 위 `moti.cmd`입니다. 특정 npm 작업이 필요하면 현재 PowerShell 프로세스에만 도구 경로를 불러옵니다.

```powershell
. .\scripts\toolchain.ps1
Set-Location front
npm run check
npm test
npm run build
```

`build`는 타입 검사와 UI/Electron 파일 생성만 합니다. 설치 파일 생성은 `npm run package`로 분리했습니다. `npm run dev:browser`는 Electron을 띄우지 않고 화면을 검사하는 개발 명령입니다. 키보드 Python 시작 IPC가 없으므로 브라우저 모드에서는 실시간 키보드 분석을 실행할 수 없습니다.

MediaPipe Pose의 스크립트·WASM·모델은 고정 npm 패키지에서 `public/mediapipe/pose`로 복사되고 UI 빌드에 포함됩니다. 복사는 설치와 dev/build 전에 실행됩니다. 생성 폴더를 직접 수정하지 않습니다.

`front/Dockerfile`은 이전 웹 배포 실험 설정이며 Windows 개발 표준이 아닙니다. 현재 Electron 패키징 대상에는 Python 런타임·키보드 모델이 포함되지 않으므로 설치 파일만으로 키보드 분석을 제공한다고 안내하지 않습니다.

## 5. 이번 작업에서 확인한 결과

| 검사 | 결과 / 한계 |
| --- | --- |
| 전체 설치 스크립트 | Node 24.20.0, npm 11.19.0, uv 0.12.10, Python 3.12.14로 완료. front/server `npm ci`, Python web extra 설치 성공 |
| npm 보안 검사 | 설치 당시 front/server 모두 알려진 취약점 0건. 향후에도 유지된다는 보장은 아님 |
| 프론트 | TypeScript(React·Vite·Electron)와 ESLint 통과. 캘리브레이션 14개·관측 8개·생명주기 13개·키보드 정책/어댑터 6개·상체 점수 9개·시간/습관 집계 16개·점수 표시 SSR 6개, 총 72개 테스트 통과 |
| 프론트 빌드 | Vite UI·Electron main·CommonJS preload 생성 성공. UI 청크 500 kB 초과 경고는 남음 |
| 서버 | TypeScript 빌드와 26개 테스트 통과. 인증·HTTP 검증·소유권·종료 재시도·롤백·기존 bcrypt 호환·점수 경계·가중 평균·날짜 및 SQL 계약 검사 |
| Python | 한글/영문 물리 키 코드 정규화 2개 테스트 통과. 관리형 Windows CPython에서 cv2·NumPy·MediaPipe·Torch·YOLO import, `best.pt`와 키 맵 로딩 및 로컬 상태 API 응답 확인. 실제 손캠 정확도는 미검증 |
| 화면 | 목·어깨의 점수/습관 카드와 안내, 기존 키보드 대기 화면, 안구 비활성 화면을 빌드 미리보기로 확인. 0점·누락·중지 후 표시 보존은 실제 표시 컴포넌트 SSR 검사. 실제 카메라 추론·중지/재시작 통합은 미검증 |
| 실제 통합·배포 | 개발 Electron–Python 시작/종료와 데이터 계약 구현. 실제 카메라 손가락 판정, 원격 DB/기록 연동, Python exe 동봉 설치 파일은 미검증 |

2026-09-12 실행 진입점 수정 후 이 PC에서 `setup.cmd` 전체 설치와 `moti.cmd check`를 다시 통과했습니다. 인수 없이 `moti.cmd`를 실행해 개발 서버와 제목이 Moti인 Electron 창의 생성도 확인했습니다. 탐색기 더블클릭 자체와 실제 카메라 동작은 별도로 검증하지 않았습니다.

같은 날 점수·습관 평가 작업에서 setup/check와 프론트 빌드를 다시 실행했습니다. setup은 실행 중인 프로젝트 앱의 파일 잠금으로 한 차례 막힌 뒤 해당 앱을 종료하고 복원했습니다. 상체 계산과 기존 서버 집계만 변경했으며 키보드는 제외했습니다. 자정은 코드·SQL 계약 대역으로 확인했고 실제 DB 실행은 하지 않았습니다. 상세 사례와 남은 검증은 [evaluation.md](evaluation.md)에 있습니다.

2026-09-12 키보드 개발 연결 커밋 `6e74483`과 상체·서버 평가 변경을 함께 반영한 뒤 `setup.cmd`, `moti.cmd check`, 프론트 빌드를 통과했습니다. 통합 상태에서 프론트 41개·서버 26개·Python 2개 테스트와 Python 환경 검사가 통과했습니다. 실제 카메라 측정이나 원격 DB 저장은 이번 통합 검사에 포함하지 않았습니다.

2026-09-15 모드별 화면·정책·표시를 분리하고 상체 유사도 점수와 시간 가중 평균·관찰 습관 v1을 연결했습니다. 프로젝트 전용 환경에서 전체 `moti.cmd check`를 통과하고, 추가된 정책 버전·SSR 검사까지 포함해 프론트 타입/린트와 72개 테스트를 다시 통과했습니다. 서버 26개·Python 2개 및 환경 검사도 통과했습니다. 프론트/Electron 빌드 성공, 기존 500 kB 청크 경고는 유지됩니다. 의존성은 변경하지 않았습니다.

브라우저 검증은 `npm run preview -- --host 127.0.0.1 --port 5173 --strictPort`로 빌드 결과를 확인했습니다. Vite의 임시 파일 권한 오류와 개발 감시 중 모델 파일 잠금이 있어 필요한 실행 권한으로 빌드한 후 감시 없는 preview를 사용했습니다. 실제 웹캠이나 DB에 접속하지 않았습니다. 산식·해석 한계는 [evaluation.md](evaluation.md), AI 작업 분담은 [collaboration.md](collaboration.md)에 있습니다.

설치에서 일부 전이 의존성의 deprecated 경고와 npm의 install-scripts 정책 안내가 나올 수 있습니다. 현재 환경에서는 설치와 실행 검사가 통과했습니다. 다른 PC에서 실행 파일 누락 오류가 생기면 전체 스크립트를 무조건 허용하지 말고 해당 패키지와 설치 로그를 확인합니다.

## 6. 다음 변경의 완료 조건

- 팀 환경: 네 PC에서 새 저장소로 setup/check 결과와 Windows/CPU 정보를 남깁니다.
- 기기: 시작·중지 반복, 권한 거부, 장치 교체·연결 해제, 얼굴 가림, 느린 추론, 모드 이동에서 카메라가 정리되는지 확인합니다.
- 측정: 같은 입력의 재현성, 누락 구간 제외, 수집 중 흔들림과 카메라 이동 후 재측정, 점수/습관 정책 버전을 검사합니다.
- 실제 DB: 동시 종료 재시도, 소유권, 트랜잭션 롤백, SQL mode·시간대·자정 집계 경계를 확인합니다.
- 통합: 같은 계정으로 측정 → 저장 → 앱 재시작 → 같은 기록 조회를 확인합니다.
- 배포: 개발 도구가 없는 Windows PC에서 설치·카메라·모델 자원·업데이트 경로를 확인합니다.

각 작업을 마치면 이 표와 [현재 구조](architecture.md), [남은 작업](roadmap.md)을 함께 갱신합니다.

## 2026-09-19 로컬 통계 추가 검증

`setup.cmd` 복원과 `moti.cmd check`를 완료했습니다. 추가 경계 테스트 후 프론트 총 94개, 서버 26개, Python 2개가 통과했고 UI·Electron main/preload 빌드가 성공했습니다. 기본 Vite 설정 임시 파일 생성이 제한된 환경에서는 `npm run build -- --configLoader runner`를 사용해 동일 설정으로 빌드했습니다. 기존 큰 청크 경고와 records 모듈의 정적/동적 import 중복 안내가 남습니다. SSR 차트 크기 경고는 DOM 없는 검사에서만 발생합니다.

프로젝트 도구를 로드하고 front에서 `node scripts/check-records-electron.mjs`를 실행하면 **별도 테스트 프로필**로 두 번 앱을 띄워 파일 저장/재시작, 중단 복구, 신뢰 창 IPC, 모드별 통계, 일/주/월 및 상세, 삭제 취소/계정별 삭제, 종료 flush를 검사합니다. 정상 Windows 실행 환경에서 통과했으며 샌드박스의 GPU 프로세스 제한에서는 실행이 실패했습니다. 결과 PNG는 출력된 front/.moti-cache/records-electron-* 아래에 있습니다. 실제 사용자 DB나 카메라를 사용하지 않습니다.

현재 로그인은 데모, AI·의학 영역은 예시, 브라우저 단독 기록 저장과 원격 서버 동기화는 미지원입니다. 실제 촬영·장시간 사용·설치 패키지는 별도 검증이 필요합니다. [저장소 안내](../database/README.md), [작업 검증 기록](ai-workflow/work-items/2026-09-19/jangwon/statistics/09_VERIFICATION.md)을 확인합니다.

## 2026-10-01 실행 환경 복원

Windows 11 x64에서 `OS` 환경변수가 없는 실행 환경 때문에 setup의 운영체제 판별이 실패했습니다. `scripts/setup.ps1`이 환경변수 대신 .NET의 운영체제 정보를 확인하도록 수정한 뒤 `setup.cmd` 전체 설치를 완료했습니다. Node 24.20.0, npm 11.19.0, uv 0.12.10, Python 3.12.14와 Python 기본+web 68개 패키지를 준비했고, 없던 `server/.env`도 생성했습니다.

`moti.cmd check`에서 프론트 타입·린트와 94개 테스트, 서버 빌드와 34개 테스트, Python 2개 테스트 및 모델·키 맵 로딩이 통과했습니다. 기본 `npm run build`로 UI·Electron main/preload 빌드가 성공했습니다. 기존 청크 크기·정적/동적 import·SSR 차트 경고는 남습니다.

`check-records-electron.mjs`의 별도 프로필에서 저장·재시작·IPC·통계·이력·삭제·정상 종료 검사를 통과했습니다. Python embedded 서비스의 `/api/status`는 `ok: true`, `frames: 0`, `keylogger_running: false`였으며 검사 후 종료했습니다. 평소 명령인 `moti.cmd app`으로 제목이 Moti인 Electron 창과 Vite HTTP 200 응답을 확인했습니다. 실제 카메라 측정이나 원격 DB는 이번 검사에 포함하지 않았습니다.

설치 당시 npm audit는 프론트 간접 의존성 `brace-expansion` high 1건과 `fast-uri` moderate 1건, 서버 0건을 보고했습니다. 이번 환경 복원에서는 의존성 선언·잠금을 변경하지 않았습니다.

## 2026-10-01 키보드 훈련·집계·설정

기본표/허용 100·같은 손 인접 70·그 외 0과 별도 일관성, 키보드 SQLite 집계/통계/히트맵/추이/세션 상세, 승인 일반 앱의 명시적 Raw Input 관찰, 중지 단축키, crop·자유 회전·밝기/대비·요청 해상도를 연결했습니다. 정책/인식 버전과 70점 가중치를 기록하고 보류·미지원·단축키를 점수 분모와 구분합니다. 기존 자세 테이블을 보존하는 v1→v2 추가 마이그레이션은 별도 SQLite 파일에서 검증했습니다. 서버 SQL·원격 DB·의존성 잠금은 변경하지 않았습니다.

전체 `moti.cmd check`에서 프론트 100개, 서버 34개, Python 9개와 모델/환경 검사가 통과했습니다. frontend 타입/린트·빌드와 Electron main/preload의 별도 타입 검사도 통과했습니다. 실제 Windows Raw Input 창을 **일치할 수 없는 승인 경로**로 시작·종료해 입력을 읽지 않는 제외 상태와 스레드 해제를 확인했습니다. 서비스 대역 검사로 토큰/단일 연결, embedded의 legacy hook 차단, 원문 대신 code 사용, bounded frame buffer와 제외/연결 종료 시 메모리 정리를 검사했습니다. 실제 모델을 사용한 embedded 서비스도 입력·카메라 수집 없이 readiness와 테스트 페이지 404를 확인했습니다.

실제 Electron의 별도 프로필 `front/.moti-cache/records-electron-4zkCos`에서 기존 자세와 키보드 쓰기/재시도·재시작 복구·통계/히트맵/상세·승인 설정/단축키 저장·잘못된 입력/다른 창 IPC 거절·계정별 삭제·정상 close flush가 통과했습니다. 대기/카메라 설정/관찰 설정/통계/히트맵 PNG를 확인했습니다. 새 승인 목록은 비어 있고 외부 관찰은 기본 꺼짐입니다. 실행은 기존 `moti.cmd app`, 설정은 **설정 → 키보드·승인 앱 관찰**, 통계는 **통계 → 모드: 키보드**입니다.

남은 검증은 실제 손캠·빠른 입력·Shift·장시간 관찰·실제 승인 앱의 키 매칭과 권한 전환입니다. 가림의 직접 분류, 하드웨어 노출/초점 제어, 모든 게임 자동 식별, 안티치트/백신 호환 보장은 구현하지 않았습니다. 관찰은 입력을 차단·주입하지 않지만 타 프로그램의 제재 여부를 보장할 수 없습니다. 과부하/중지 전 처리되지 않은 입력과 비정상 종료 시 미커밋 집계는 유실될 수 있습니다. 큰 청크/정적·동적 import 및 DOM 없는 차트 경고는 기존과 같습니다. 저장/정책 상세는 [database](../database/README.md)와 [키보드 계약](../front/src/features/keyboard/README.md)을 따릅니다.

최종 `moti.cmd app` 일반 실행으로 제목이 Moti인 Electron 창을 열었습니다. 카메라나 외부 관찰은 자동으로 켜지지 않습니다. 최종 Git diff 공백 검사도 통과했습니다. 변경은 작업 트리에 있으며 커밋/푸시는 수행하지 않았습니다.

## 2026-10-02 최신 main 통합 준비

원격 main의 `6712f67`까지 기존 커밋을 fast-forward로 반영한 뒤 키보드 작업을 다시 적용했습니다. `database/README.md`, `docs/roadmap.md`, `front/electron/main.ts`의 충돌을 해결하면서 안구 모드·MediaPipe 초기화 격리와 프로젝트 상대 DB 경로/기존 userData DB 복사 동작을 보존했습니다. 키보드도 같은 `database/sqlite/posture.sqlite` 연결에 집계를 추가합니다. 현재 실행 설명의 키보드 저장/관찰 범위도 통합 상태에 맞게 수정했습니다.

`setup.cmd`, `moti.cmd check`가 통과했습니다. 프론트 타입·린트와 123개 테스트, 서버 빌드와 34개 테스트, Python 9개 및 모델/환경 검사가 성공했습니다. 프론트/Electron 빌드와 Electron main/preload의 별도 타입 검사도 통과했습니다. 별도 프로필 `front/.moti-cache/records-electron-DrolZL`에서 자세·키보드 저장/재시작·IPC·통계/히트맵/상세·설정·계정별 삭제·정상 종료 검사가 성공했습니다. 실제 사용자 DB·카메라·외부 키 입력은 사용하지 않았으며 기존 빌드 경고는 유지됩니다.

사용자가 직접 커밋·푸시하기 위해 변경을 준비하는 작업이며 새 브랜치 커밋이나 푸시는 실행하지 않았습니다. 원래 변경의 복구용 stash `58f74545cd683ca1464f4289cd83da4e8ce63efd`는 보존했습니다.

## 2026-10-02 상체 통합 점수 v2 검증

`setup.cmd`는 node_modules 권한 오류 후 권한을 확장한 재시도에서 완료했습니다. `moti.cmd check`로 프론트 타입·린트·테스트, 서버 빌드와 34개 테스트, Python 2개 테스트와 모델/import 확인을 통과했습니다. 추가 회귀 검사와 화면 배치 수정 후 프론트 타입·린트 및 **96개 테스트**와 `npm run build -- --configLoader runner`를 다시 통과했습니다.

귀 기준 스키마 v2, 부위별 가중합, yaw 경계, 10초 움직임 동결, 5초 유예와 초당 감점, 추적 누락·시간 역행, 부위별 독립 타이머, 두 부위 동시 저장/종료 재시도, 실제 reducer 결과의 파일 재시작과 이전 정책 기록 보존을 검사했습니다. 테스트가 임시 DB를 사용하며 사용자 DB는 초기화하지 않았습니다.

`node scripts/check-records-electron.mjs`는 샌드박스 GPU 제한 후 일반 실행 권한에서 통과했습니다. 두 Electron 프로세스로 저장/재시작, 실제 IPC, 두 점수/통계 병렬 배치, 이력/상세, 계정별 삭제, 정상 종료를 확인했습니다. 화면 증거는 `front/.moti-cache/records-electron-iqqfbK/`의 `verify-upper-body-scores.png`, `verify-statistics.png` 등에 남습니다. 실제 카메라 측정·가중치 정확도·설치 패키지는 검증하지 않았습니다.

기존 큰 청크·정적/동적 import 경고와 DOM 없는 SSR 차트 크기 경고가 남습니다. 이번 setup의 npm audit 요약은 front 2건(moderate 1, high 1), server 0건이었으며 의존성과 잠금 파일은 변경하지 않았습니다. 조정 상수와 해석은 [평가 안내](evaluation.md), 기존 기록 보존과 부위별 저장은 [database 안내](../database/README.md)를 따릅니다.

## 2026-10-02 main과 dev/score2 통합 검증

원격 main `618b6fa`의 키보드 훈련·저장·설정 변경을 `dev/score2`의 `0e3f2ae`와 병합했습니다. 통계 화면, Electron 검증 스크립트와 개발/제품 결정/로드맵 문서의 충돌을 해결하며 양쪽 기능과 검증 기록을 보존했습니다. 현재 점수 가중치·임계값·보호 설정은 변경하지 않았으며 평가/구조 안내를 해당 조정값에 맞췄습니다.

사용자 요청에 따라 학습 카드와 통계 선택을 `안구 / 상체 / 키보드` 순서로 통일했습니다. 상체는 목·어깨 통계를 나란히 유지하고 키보드는 히트맵·추이·상세를 제공합니다. 안구는 기존 실시간 측정 화면을 유지하며 통계에는 기록 저장 미지원 안내와 측정 화면 진입만 제공합니다. 안구 저장 계약이나 임의 점수는 추가하지 않았습니다.

`setup.cmd`는 파일 권한 제한 후 일반 실행 권한 재시도에서 완료했습니다. `moti.cmd check`로 프론트 타입·린트와 123개 테스트, 서버 빌드와 34개 테스트, Python 9개 및 모델/import 확인을 통과했습니다. `npm run build -- --configLoader runner`로 UI·Electron main/preload 빌드도 통과했습니다. 기존 큰 청크·정적/동적 import·DOM 없는 차트 경고는 유지됩니다.

Electron 검증은 샌드박스 GPU 제한 후 일반 실행 권한에서 통과했습니다. 별도 프로필 `front/.moti-cache/records-electron-7HfEfL/`에서 두 프로세스의 저장/재시작·IPC·정상 종료, 목/어깨 병렬 통계, 키보드 히트맵/상세와 상체 복귀, 안구 통계 안내/측정 진입, 학습 카드 순서, 계정별 삭제를 확인했습니다. PNG를 확인했으며 사용자 DB·실제 카메라·외부 키 입력은 사용하지 않았습니다. 실제 촬영 정확도·설치 패키지 검증은 후속 범위입니다.

## 2026-10-02 상체 회전·상하 감도 v3 검증

고개 회전에서 머리 전진 감점만 제외하던 경로와 추적 재개 시 100점 유예로 초기화하던 경로를 재현하고 수정했습니다. yaw 0.15 초과는 두 부위 판정과 해당 시간 집계를 보류합니다. 마지막 점수는 내부에 보존하며 낮아진 점수의 100점 복귀는 정면 허용 범위를 1초 연속 확인합니다. 어깨는 귀-어깨 간격 변화의 절댓값을 사용하고 상하 항만 1.25배 강화합니다. 점수/습관 정책은 v3으로 구분하고 기준·SQLite 스키마와 기존 기록을 보존했습니다.

`setup.cmd` 전체 설치, `moti.cmd check`의 프론트 타입·린트와 **129개 테스트**, 서버 빌드와 **34개 테스트**, Python **9개 테스트** 및 모델/import 검사가 통과했습니다. `npm run build -- --configLoader runner`로 UI·Electron main/preload 빌드도 통과했습니다. 기존 큰 청크·정적/동적 import·DOM 없는 차트 경고는 유지됩니다. 의존성 선언과 잠금 파일은 변경하지 않았습니다.

`posture-recovery.test.mjs`는 실제 관측/평가 reducer와 임시 SQLite에서 좌우 회전 구간 제외, 누락·중복 시각·긴 공백 후 점수 유지, 짧은 복귀 차단과 1초 복귀, 어깨 양방향 상하 감도·전체 평행 이동 제외, 기존 정책 기록 보존을 검사합니다. 기존 파일 SQLite 재시작/두 부위 저장 테스트와 복귀 안내 SSR 검사도 통과했습니다. 로그는 `front/.moti-cache/posture-rotation-{setup,check,build}.log`에 있습니다.

이번 수정에서 실제 카메라·사용자 DB·외부 키 입력·Electron 화면 smoke는 실행하지 않았습니다. 작은 회전의 검출, 머리/어깨 상하 움직임의 분리와 실사용 감도는 촬영 검증이 남습니다. 처리 방향과 한계는 [평가 안내](evaluation.md)를 따릅니다.

`codex/posture-rotation-vertical`에서 네 계산 파일의 역할·입출력·시간 규칙과 계산 예시를 한국어 주석으로 설명했습니다. 주석을 제외한 실행 코드 토큰이 추가 전후 동일함을 확인했고, 프론트 타입·린트 및 관련 회귀 테스트 35개를 다시 통과했습니다.

## 2026-10-03 안구 SQLite·통계·학습이력 검증

안구 작업 도중 갱신된 main `3679588`의 상체 점수 개편을 fast-forward로 반영했습니다. 해당 상체 알고리즘 파일의 변경은 보존했으며 파일 병합 충돌은 없었습니다.

프로젝트 전용 도구로 `setup.cmd`를 완료했고 최신 main 반영 후 `moti.cmd check`에서 프론트 타입·린트·137개 테스트, 서버 빌드·34개 테스트, Python 9개 테스트 및 모델/import 확인을 통과했습니다. 최종 입력 검증 보완 후 프론트 타입·린트·137개 테스트, Electron main/preload 별도 TypeScript 검사, `npm run build -- --configLoader runner`를 다시 통과했습니다.

안구 검사 8개는 v1/v2 마이그레이션 회귀 검사와 함께 기존 데이터 보존, 엄격한 입력, 트랜잭션 롤백, 정책 분리, 자정/분 경계, 재시도·종료·삭제, 실제 측정 reducer 재생, 120개 제한 배치 분할, 달력 혼합 페이지와 화면의 0/자료 없음을 검증합니다.

`node scripts/check-records-electron.mjs`는 별도 프로필 `front/.moti-cache/records-electron-961sts/`에서 두 프로세스의 안구 저장/재시작 복구, IPC, 안구 통계·새로고침·학습이력·분별 상세, 기존 상체·키보드 화면, 계정별 삭제·정상 종료를 통과했습니다. 안구 통계와 상세 PNG를 확인했습니다. 합성 측정 데이터를 사용했으며 사용자 DB·실제 카메라·외부 키 입력은 사용하지 않았습니다.

기존 큰 번들·정적/동적 import 및 SSR 차트 크기 경고가 남습니다. 실제 촬영 인식 정확도·장시간 카메라 실행·설치 패키지 검증은 수행하지 않았습니다. 저장 위치와 마이그레이션·복구·삭제 계약은 [database 안내](../database/README.md)를 따릅니다.
