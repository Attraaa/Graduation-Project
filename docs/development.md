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

현재 프론트 로그인은 로컬 데모이며 통계·이력은 예시 데이터입니다. 상체 측정은 화면에서 **기준 자세 잡고 시작**을 누를 때 카메라를 요청하고 중지 시 해제합니다. 키보드 모드는 **카메라 연결하고 시작**을 누르면 Electron이 로컬 Python 분석기를 자동 실행하고, 키보드 위치를 잡은 뒤 현재 Moti 화면의 키 입력만 실시간 판정합니다. 결과는 아직 저장/API 전송하지 않습니다. 안구 모드는 비활성입니다.

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
| 프론트 | TypeScript(React·Vite·Electron)와 ESLint 통과. 캘리브레이션·카메라/모델 생명주기·키보드 정책/어댑터 총 29개 테스트 통과 |
| 프론트 빌드 | Vite UI·Electron main·CommonJS preload 생성 성공. UI 청크 500 kB 초과 경고는 남음 |
| 서버 | TypeScript 빌드와 15개 테스트 통과. 인증·HTTP 검증·소유권·종료 재시도·롤백 및 기존 bcrypt 해시 호환 검사 |
| Python | 한글/영문 물리 키 코드 정규화 2개 테스트 통과. 관리형 Windows CPython에서 cv2·NumPy·MediaPipe·Torch·YOLO import, `best.pt`와 키 맵 로딩 및 로컬 상태 API 응답 확인. 실제 손캠 정확도는 미검증 |
| 화면 | 키보드 모드의 연결 버튼, 카메라 영역, 실시간 입력 지표·최근 판정 표를 브라우저 렌더링으로 확인. 브라우저 모드는 Electron IPC가 없어 실제 분석 시작 검증에는 사용하지 않음 |
| 실제 통합·배포 | 개발 Electron–Python 시작/종료와 데이터 계약 구현. 실제 카메라 손가락 판정, 원격 DB/기록 연동, Python exe 동봉 설치 파일은 미검증 |

2026-09-12 실행 진입점 수정 후 이 PC에서 `setup.cmd` 전체 설치와 `moti.cmd check`를 다시 통과했습니다. 인수 없이 `moti.cmd`를 실행해 개발 서버와 제목이 Moti인 Electron 창의 생성도 확인했습니다. 탐색기 더블클릭 자체와 실제 카메라 동작은 별도로 검증하지 않았습니다.

설치에서 일부 전이 의존성의 deprecated 경고와 npm의 install-scripts 정책 안내가 나올 수 있습니다. 현재 환경에서는 설치와 실행 검사가 통과했습니다. 다른 PC에서 실행 파일 누락 오류가 생기면 전체 스크립트를 무조건 허용하지 말고 해당 패키지와 설치 로그를 확인합니다.

## 6. 다음 변경의 완료 조건

- 팀 환경: 네 PC에서 새 저장소로 setup/check 결과와 Windows/CPU 정보를 남깁니다.
- 기기: 시작·중지 반복, 권한 거부, 장치 교체·연결 해제, 얼굴 가림, 느린 추론, 모드 이동에서 카메라가 정리되는지 확인합니다.
- 측정: 같은 입력의 재현성, 누락 구간 제외, 수집 중 흔들림과 카메라 이동 후 재측정, 점수/습관 정책 버전을 검사합니다.
- 실제 DB: 동시 종료 재시도, 소유권, 트랜잭션 롤백, SQL mode·시간대·자정 집계 경계를 확인합니다.
- 통합: 같은 계정으로 측정 → 저장 → 앱 재시작 → 같은 기록 조회를 확인합니다.
- 배포: 개발 도구가 없는 Windows PC에서 설치·카메라·모델 자원·업데이트 경로를 확인합니다.

각 작업을 마치면 이 표와 [현재 구조](architecture.md), [남은 작업](roadmap.md)을 함께 갱신합니다.
