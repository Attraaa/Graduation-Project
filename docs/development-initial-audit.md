# 설치·실행·검증 가이드

기준: 2026-09-05. 아래는 현재 소스에 대응하는 명령입니다. **네 명 모두의 새 환경에서 재현 완료된 표준 설치 절차는 아직 아닙니다.** 환경 후보와 미정 항목은 [dependencies.md](dependencies.md)를 먼저 확인합니다.

## 1. 시작 전 확인

프로젝트 루트에서 실행합니다. 이 문서의 예시는 Windows PowerShell 기준입니다.

```powershell
git status --short
node --version
npm --version
python --version
python -c "import sys, platform; print(sys.executable); print(platform.platform()); print(platform.machine())"
```

팀에 공유할 값은 OS/CPU 종류, Node/npm/Python의 정확한 버전, Python 실행 경로, MySQL 종류/버전, 카메라 수와 모델, 선택 GPU 여부입니다. `.env`의 비밀번호나 토큰은 공유 기록에 넣지 않습니다.

`npm`이 없으면 Node만 보이는 환경입니다. 현재 감사 환경도 Node는 보이지만 npm 명령은 PATH에서 찾지 못했습니다. 프로젝트 의존성 문제와 로컬 도구 설정 문제를 구분합니다.

## 2. 프론트/Electron

프로젝트 루트에서:

```powershell
Set-Location front
npm ci
npm run dev
```

`dev`는 Vite를 실행하며 Electron 플러그인이 데스크톱 앱을 시작하는 설정입니다. 개발 서버 주소는 터미널 출력을 확인합니다. React 화면의 로그인은 현재 로컬 데모이므로 서버 DB 계정과 연결되지 않습니다. 시작할 때 기본 데모 계정이 로컬 저장소에 생성됩니다.

같은 `front` 폴더의 별도 터미널에서 실행할 검사:

```powershell
node node_modules/typescript/bin/tsc -b --pretty false
npm run lint
```

현재 `npm run build`는 `tsc -b && vite build && electron-builder` 전체를 실행합니다. 단순 타입 검사와 설치 파일 생성을 구분합니다. 설치 산출물은 `release`에 나오도록 설정되어 있고 Windows NSIS 설정이 존재합니다. 전체 패키징 성공과 설치 후 실행은 이번에 검증하지 않았습니다.

`front/Dockerfile`은 웹 정적 파일을 Nginx로 제공하는 형태지만 같은 전체 `build`를 호출합니다. 데스크톱 배포와 웹 배포의 목적이 섞여 있으므로 팀 배포 목표가 정해지기 전에는 표준 실행 경로로 사용하지 않습니다.

## 3. 서버

새 터미널의 프로젝트 루트에서:

```powershell
Set-Location server
npm ci
if (-not (Test-Path .env)) { Copy-Item .env.example .env }
```

`.env`에 개발용 DB 접속 정보와 JWT 비밀값을 설정합니다. 기존 파일은 덮어쓰지 않습니다. 기본 항목은 `PORT=4000`, `DB_HOST`, `DB_PORT=3306`, `DB_USER`, `DB_PASSWORD`, `DB_NAME=moti`, `JWT_SECRET`, `JWT_EXPIRES_IN=7d`입니다.

**여기서 DB 준비 여부를 확인합니다.** `server/schema.sql`은 테이블을 삭제하며, `front/database_schema.sql`은 현재 서버와 호환되지 않습니다. DB 보존 여부가 결정되지 않은 상태에서 둘 중 하나를 자동 실행하지 않습니다. 별도의 비파괴 초기 스키마/마이그레이션을 준비하는 작업이 다음 단계에 필요합니다.

현재 서버 스키마에 맞는 개발 DB가 준비된 뒤, `server`에서:

```powershell
npm run dev
```

별도 터미널에서 API 프로세스가 응답하는지 확인합니다.

```powershell
Invoke-RestMethod http://localhost:4000/health
```

`status: ok`는 HTTP 프로세스 확인이며 DB 준비 완료를 증명하지 않습니다. DB 연결은 테스트 계정 가입·로그인·세션 저장까지 확인해야 합니다. `npm run seed`는 DB에 기본 데모 계정을 쓰므로 선택된 개발 DB를 확인하고 사용합니다. 감사 중에는 실행하지 않았습니다.

`npm run build`는 `src`를 `dist`로 컴파일하고 `npm start`는 `dist/server.js`를 실행합니다. `seed.ts`는 `tsconfig.json`의 `include: ["src"]` 밖에 있으므로 빌드 검사 대상에 포함되지 않습니다.

## 4. Python 키보드 분석

Python 실행 파일의 종류와 버전을 확인한 후 프로젝트 루트에서:

```powershell
Set-Location keyboard-detect
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
.\.venv\Scripts\python.exe -m pip check
```

이 명령은 Windows CPython 가상환경 경로 기준입니다. MSYS Python이나 macOS/Linux는 경로·패키지 설치 조건이 다르므로 팀 환경 확정 후 별도 검증합니다. 현재 requirements는 대부분 범위 지정이라 설치 날짜에 따라 결과가 달라질 수 있습니다. `.venv`는 커밋하지 않으며, 현재 루트 `.gitignore`에 Python 가상환경 제외 규칙을 추가하는 일도 환경 통일 작업에 포함해야 합니다.

카메라와 입력 매칭을 수동 점검할 때 `keyboard-detect`에서:

```powershell
.\.venv\Scripts\python.exe keylog\examples\live_console_test.py --no-global-keylogger
```

위 명령은 OpenCV 미리보기 창에 입력한 키로 검사합니다. 다른 앱의 입력까지 검사해야 하는 별도 실험에서만 해당 옵션을 빼고 실행합니다. 카메라 변경은 `--camera-index 1`, 종료는 미리보기에서 ESC입니다. 실행 중에는 키보드 전체와 손이 보이도록 구도를 잡습니다.

선택형 웹 테스트는 추가 의존성이 필요합니다.

```powershell
.\.venv\Scripts\python.exe -m pip install -r requirements-web.txt
.\.venv\Scripts\python.exe -m keylog.service
```

브라우저에서 [로컬 테스트 페이지](http://127.0.0.1:5055)를 엽니다. Flask는 기본 requirements에 없으므로 기존 키보드 README의 기본 설치 명령만으로 웹 테스트가 준비되지는 않습니다. 해당 문서의 `D:\keyboard detect`는 과거 작성자의 경로이므로 이 저장소의 `keyboard-detect` 경로로 읽습니다.

## 5. 이번 감사의 검증 결과

기준 소스: `12c213f`. 검사는 기존 설치된 프론트 의존성을 사용했으며, 새 설치·DB 실행·카메라 접근·전역 키 입력 수집은 수행하지 않았습니다.

| 검사 | 결과와 한계 |
| --- | --- |
| Git 초기 상태 | 추적 파일 변경 없음 |
| npm 잠금 파일 | front/server 모두 lockfileVersion 3. 루트 dependencies/devDependencies 선언은 package.json과 일치. 전체 `npm ci` 재현 검증은 아님 |
| 감사 실행 도구 | Node 24.19.0, MSYS 경로의 Python 3.12.10. npm은 PATH에서 미발견, `py --list`는 등록된 Python 없음 |
| 프론트 타입 검사 | `src` 및 `vite.config.ts` 검사 통과. 아래 임시 캐시 우회 명령 사용 |
| 일반 `tsc -b` | 기존 `.tsbuildinfo` 쓰기가 EPERM으로 실패. 소스 타입 오류와 구분 |
| 프론트 ESLint | 오류 15개, 경고 1개. `.` 전체 검사와 `src electron vite.config.ts` 한정 검사에서 같은 소스 파일 문제 확인 |
| Python 문법 | `keyboard-detect`의 12개 `.py` 파일 AST 파싱 통과. import/모델 실행 검사는 아님 |
| 서버 빌드·DB/API | `server/node_modules`가 없어 미실행. DB 버전과 실제 데이터 상태도 미확인 |
| 통합·패키징·기기 동작 | 미실행. 현재 연결되지 않은 구간은 구조 문서에 명시 |

타입 검사는 `front`에서 다음과 같이 수행했습니다. 기존 캐시의 쓰기 권한 문제를 피하기 위해 출력 위치만 임시 폴더로 변경했습니다.

```powershell
node node_modules/typescript/bin/tsc -p tsconfig.app.json --noEmit --incremental --tsBuildInfoFile "$env:TEMP/moti-audit-app-20260905.tsbuildinfo" --pretty false
node node_modules/typescript/bin/tsc -p tsconfig.node.json --noEmit --incremental --tsBuildInfoFile "$env:TEMP/moti-audit-vite-20260905.tsbuildinfo" --pretty false
node node_modules/eslint/bin/eslint.js src electron vite.config.ts
```

현재 TypeScript 설정의 include는 `src`와 `vite.config.ts`입니다. 위 통과가 `electron/*.ts`의 별도 타입 검사나 설치 성공을 보장하지는 않습니다.

| 기존 린트 문제 파일 | 오류 / 경고 | 내용 |
| --- | --- | --- |
| `src/components/AppDialog.tsx` | 1 / 0 | 컴포넌트와 훅 내보내기 혼합 (`react-refresh/only-export-components`) |
| `src/components/PostureMonitor.tsx` | 7 / 1 | `any`, effect 의존성 |
| `src/hooks/useMediaPipe.ts` | 5 / 0 | `any` |
| `src/hooks/useWebcam.ts` | 2 / 0 | `any` |

## 6. 다음 변경의 완료 조건

- 환경 통일: 네 명이 새 clone에서 같은 잠금 파일로 설치하고 버전/검사 결과를 남깁니다.
- 인식/캘리브레이션: 랜드마크 누락, 낮은 신뢰도, 카메라 이동, 시작·중지 반복, 화면 이탈을 포함합니다.
- 점수: 같은 입력에 같은 출력, 데이터 미수집과 나쁜 자세의 구분, 시간 가중 집계 기준을 검사합니다.
- 서버 연결: 본인 세션만 접근 가능, 종료 재시도 중복 집계 없음, DB 실패 응답, 자정 경계를 검사합니다.
- 기능 통합: 한 테스트 계정으로 측정 → 저장 → 앱 재시작 → 같은 이력/통계 조회를 확인합니다.
- UI: 예시 데이터가 실측처럼 표시되지 않고 로딩·오류·측정 불가·종료 상태가 구별되는지 확인합니다.

모든 변경에 무조건 테스트 프레임워크를 추가하기보다, 해당 PR의 동작을 증명하는 최소 검증부터 적용합니다.
