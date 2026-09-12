# 의존성 관리와 Windows 팀 환경

기준: 2026-09-07. 현재 저장소의 런타임 설정과 잠금을 설명합니다. 네 명 모두 Windows를 사용한다는 결정에 따라 설치 경로를 통일했습니다. 자동 설치 대상은 **Windows x64**이며 ARM64는 Python 패키지와 모델의 별도 검증이 필요합니다.

## 1. 표준 런타임과 자동 설치

| 도구 | 팀 표준 | 기준 파일 |
| --- | --- | --- |
| Node.js | 24.20.0 | `toolchain.json`, front/server `engines` |
| npm | 11.19.0 | Node 배포본에 포함; 두 프로젝트의 `packageManager`와 `engines` |
| CPython | 3.12.14, Windows x64 | `toolchain.json`, `keyboard-detect/.python-version` |
| uv | 0.12.10 | `toolchain.json` |

저장소 루트의 `setup.cmd`를 더블클릭하거나 PowerShell에서 실행합니다.

```powershell
.\setup.cmd
.\moti.cmd check
.\moti.cmd app
```

[setup.ps1](../scripts/setup.ps1)은 Node와 uv의 공식 배포 압축 파일을 내려받고 [toolchain.json](../toolchain.json)의 SHA-256과 대조합니다. 도구·캐시·관리 Python은 `.tools`, Python 가상환경은 `keyboard-detect/.venv`에 설치합니다. Node/npm/Python을 직접 찾아 설치하거나 시스템 PATH를 바꿀 필요가 없습니다. 첫 설치에는 인터넷과 다운로드 공간이 필요합니다.

[toolchain.ps1](../scripts/toolchain.ps1)은 해당 명령과 자식 프로세스에서만 프로젝트 도구 경로를 사용합니다. npm·uv 캐시, YOLO·Matplotlib 설정도 프로젝트 안에 둡니다. `moti.cmd`는 Node/npm 버전이 표준과 다르면 중단하므로 PC에 미리 설치된 다른 Node에 의존하지 않습니다.

설치는 front/server의 `npm ci`, Python의 `uv sync --locked --managed-python --python 3.12.14 --extra web`을 실행합니다. `server/.env`가 없을 때만 예제를 복사하고 무작위 JWT 비밀값을 생성합니다. 기존 환경 파일을 덮어쓰거나 DB를 만들고 초기화하지 않습니다. DB 주소와 인증 정보는 별도 설정 대상입니다.

Node 24 계열과 Python 3.12 계열은 기존 도구·분석 코드의 호환성을 유지하면서 정확한 패치 버전을 맞춘 선택입니다. 새 버전이 나와도 자동 전환하지 않고 아래 갱신 절차를 따릅니다. [Node 공식 다운로드](https://nodejs.org/en/download), [Python 3.12.14 릴리스](https://www.python.org/downloads/release/python-31214/), [uv의 Python 설치](https://docs.astral.sh/uv/guides/install-python/)

## 2. JavaScript 의존성의 기준

front와 server는 각각 `package.json`과 `package-lock.json`을 유지합니다. npm 버전을 통일하고 중복 서버 `yarn.lock`은 npm 설치 검증 후 제거했습니다. 팀원 설치와 CI는 선언·잠금이 다르면 실패하고 잠금을 수정하지 않는 `npm ci`를 사용합니다. [npm ci 공식 문서](https://docs.npmjs.com/cli/v11/commands/npm-ci/)

기존 `^`/`~` 선언은 일부 남아 있지만 실제 설치 버전은 잠금이 결정합니다. `.npmrc`의 `engine-strict=true`는 Node/npm 조건을 검사하고 `save-exact=true`는 앞으로 추가하는 직접 의존성을 정확한 버전으로 저장합니다. 팀원마다 임의로 `npm update`를 실행하는 방식은 사용하지 않습니다.

### 주요 프론트/Electron 잠금 버전

| 패키지 | 잠금 버전 | 용도 |
| --- | --- | --- |
| react / react-dom | 19.2.5 | 화면 컴포넌트 |
| react-router-dom | 7.18.3 | 화면 이동 |
| tailwindcss / @tailwindcss/vite | 4.2.4 | 스타일과 빌드 연결 |
| lucide-react | 1.14.0 | 공통 SVG 아이콘 |
| recharts | 3.8.1 | 통계 차트 |
| postcss / autoprefixer | 8.5.28 / 10.5.0 | CSS 처리 |
| @mediapipe/pose | 0.5.1675469404 | 브라우저 자세 랜드마크 추론 |
| socket.io-client | 4.8.1 | Electron 키보드 화면과 로컬 Python 분석 서비스 연결 |
| electron / electron-builder | 41.10.7 / 26.15.3 | 데스크톱 실행·설치 파일 생성 |
| vite / @vitejs/plugin-react | 8.2.2 / 6.0.1 | 개발·빌드 |
| vite-plugin-electron | 0.29.1 | Electron 개발·빌드 연결 |
| esbuild | 0.28.2 | 빌드 도구 의존성 |
| typescript | 6.0.3 | 타입 검사 |
| eslint / typescript-eslint | 10.2.1 / 8.59.1 | 코드 검사 |
| @types/node | 24.12.2 | Node API 타입 선언 |

사용하지 않던 `vite-plugin-electron-renderer`는 제거했습니다. 현재 렌더러는 브라우저 API를 사용하며 Node API를 직접 가져오지 않습니다. 필요한 데스크톱 기능은 preload를 통한 명시적 IPC 계약으로 추가합니다.

브라우저 MediaPipe는 버전 없는 CDN 대신 npm 패키지를 정확히 고정했습니다. [copy-mediapipe.mjs](../front/scripts/copy-mediapipe.mjs)가 설치·개발·빌드 준비 단계에서 JavaScript, WASM, 모델 자원을 함께 `front/public/mediapipe/pose`로 복사합니다. 생성 폴더는 Git에 넣지 않으며 원본 패키지와 잠금으로 복원합니다. 자세 분석 자원을 실행 중 외부 CDN에서 가져오지 않습니다.

### 주요 서버 잠금 버전

| 패키지 | 잠금 버전 | 용도 |
| --- | --- | --- |
| express | 4.22.2 | HTTP API |
| mysql2 | 3.24.3 | 현재 MySQL 저장소 구현 |
| bcrypt | 6.0.0 | 비밀번호 해시 |
| cors / dotenv | 2.8.6 / 16.6.1 | 요청 출처·환경 설정 |
| jsonwebtoken | 9.0.3 | 인증 토큰 |
| tsx / typescript | 4.22.3 / 6.0.3 | 개발 실행·컴파일 |
| @types/node | 24.13.3 | Node API 타입 선언 |
| qs | 6.16.0 | 전이 의존성 보안 갱신; `overrides` 지정 |

프론트와 서버의 TypeScript 실행 버전은 6.0.3으로 통일했습니다. `@types/node`의 패치 차이는 타입 선언의 차이이며 실제 Node 실행 버전 차이가 아닙니다. Electron에 내장된 Node도 개발 도구 Node와 별도입니다. 전체 패키지와 무결성 값은 각 `package-lock.json`이 기준입니다.

## 3. Python 분석 환경

[pyproject.toml](../keyboard-detect/pyproject.toml)이 직접 의존성과 설치 구분을 정의하고 [uv.lock](../keyboard-detect/uv.lock)이 전이 의존성까지 잠급니다. Python 허용 계열은 `>=3.12,<3.13`, 팀 실행 버전은 3.12.14입니다. uv 관리 CPython을 사용하므로 기존 MSYS·시스템 Python에 의존하지 않습니다.

| 설치 구분 | 포함 대상 | 사용 방법 |
| --- | --- | --- |
| 기본 | OpenCV, NumPy, MediaPipe, YOLO, PyTorch, pynput 등 | `uv sync --locked` |
| `web` extra | 기본 + Flask, Flask-SocketIO, simple-websocket | 표준 setup의 `--extra web` |
| `dev` 그룹 | Roboflow 등 모델 개발 도구 | 필요한 개발자만 `--group dev --extra web` 추가 |

`default-groups=[]`이므로 모델 개발 도구는 기본 설치에서 제외됩니다. 최종 setup에서 기본+web **68개 패키지** 설치/동기화를 확인했습니다. 잠금에는 선택하지 않은 dev 그룹도 기록되므로 잠금의 전체 패키지 수와 설치 수는 같을 필요가 없습니다. [uv 잠금과 동기화](https://docs.astral.sh/uv/concepts/projects/sync/)

| 핵심 패키지 | 잠금 버전 | 선택 이유·주의점 |
| --- | --- | --- |
| mediapipe | 0.10.21 | 기존 `mp.solutions.hands` API 유지 |
| numpy | 1.26.4 | 현재 MediaPipe/OpenCV 호환 범위 |
| opencv-python | 4.11.0.86 | 기존 분석·Ultralytics 요구 |
| opencv-contrib-python | 4.11.0.86 | MediaPipe 전이 의존성 |
| torch | 2.14.0+cpu | CUDA 설치 없이 공통 실행 |
| torchvision | 0.29.0+cpu | CPU PyTorch와 함께 고정 |
| ultralytics | 8.4.142 | 기존 `models/best.pt` 로드 |

PyTorch와 torchvision은 `explicit=true`로 정의한 PyTorch CPU 인덱스에만 연결했습니다. GPU 최적화는 아직 진행하지 않았으며 CPU 선택이 GPU보다 빠르다는 의미는 아닙니다.

기본+web 환경에는 OpenCV 배포 패키지가 **두 개** 설치됩니다. 두 패키지는 같은 `cv2` 모듈 경로를 제공하므로 개별 갱신하면 안 됩니다. 현재 같은 4.11.0.86으로 잠그고 import와 모델 로드를 확인했습니다. 중복 자체를 해결했다는 의미는 아닙니다. MediaPipe/Ultralytics 이전 시 함께 정리해야 합니다. 선택 dev 그룹은 Roboflow를 통해 `opencv-python-headless`도 요구하므로 dev 환경을 사용할 때 추가 검증이 필요합니다.

Python의 `mp.solutions.hands`와 브라우저의 기존 `Pose`는 Legacy API입니다. Google은 기존 코드·바이너리를 as-is로 제공하므로 최신 Tasks API로 바꿀 때 입력·출력, 모델 파일, 좌표 의미와 수명 관리를 함께 이전해야 합니다. 패키지 버전만 교체하지 않습니다. [MediaPipe 공식 가이드](https://developers.google.com/edge/mediapipe/solutions/guide)

[check_environment.py](../keyboard-detect/scripts/check_environment.py)는 카메라나 전역 키보드 관찰 없이 Python 버전, 라이브러리 import, `mp.solutions`, 기존 모델과 `perfect_map.json` 로드를 검사합니다. 모델 로드 성공은 실제 손가락 판별 정확도나 실시간 성능 검증과 구분합니다.

### requirements 파일의 역할

`requirements.txt`, `requirements-web.txt`, `requirements-dev.txt`는 잠금에서 생성한 **호환용 내보내기 파일**입니다. 직접 수정하거나 `pip freeze`로 덮어쓰지 않습니다. 표준 설치는 pyproject/uv.lock과 `setup.cmd`입니다.

내보낸 파일에는 정확한 버전, 플랫폼 조건, 해시와 PyTorch CPU 추가 인덱스가 포함됩니다. requirements 형식은 uv의 패키지별 인덱스 지정까지 보존하지 못하므로 uv와 완전히 같은 인덱스 선택 정책이라고 가정하지 않습니다.

## 4. 의존성을 갱신하는 순서

1. 변경 목적과 영향 범위를 정합니다. 일반 기능 작업에서 런타임과 잠금을 함께 무작정 올리지 않습니다.
2. 루트 PowerShell에서 `. .\scripts\toolchain.ps1`로 프로젝트 도구를 불러옵니다. npm 명령은 `& $MotiNode $MotiNpm ...`, uv 명령은 `& $MotiUv ...`로 실행합니다.
3. JS는 해당 front/server 폴더에서 필요한 패키지만 `npm install 패키지@버전`으로 바꾸고 선언과 잠금을 함께 검토합니다. 재현은 `npm ci`로 확인합니다. 서버 `qs` override도 상위 패키지가 해결하는지 확인한 뒤 제거합니다.
4. Python은 pyproject를 수정하고 `uv lock` 또는 `uv lock --upgrade-package 패키지`로 필요한 변경을 해결합니다. `uv sync --locked --extra web`과 환경 검사, 영향을 받는 실제 분석 경로를 확인합니다.
5. Python 잠금 변경 시 아래 세 내보내기 파일도 함께 갱신합니다. 명령은 `keyboard-detect` 폴더에서 프로젝트 uv로 실행합니다.
6. `.\moti.cmd check`와 프론트 빌드를 실행합니다. 카메라·모델·IPC·설치 파일에 영향이 있으면 해당 동작도 검증합니다. 감사 경고는 수정 범위와 호환성을 검토하며 `npm audit fix --force`를 일괄 적용하지 않습니다.
7. 런타임 변경 시 toolchain 버전·공식 SHA-256, 두 package.json의 engines/packageManager, Python 버전 파일과 문서를 함께 갱신합니다. 다른 팀원도 새 clone에서 setup/check를 재현합니다.

```powershell
& $MotiUv export --locked --no-dev --emit-index-url --output-file requirements.txt
& $MotiUv export --locked --no-dev --extra web --emit-index-url --output-file requirements-web.txt
& $MotiUv export --locked --group dev --extra web --emit-index-url --output-file requirements-dev.txt
```

## 5. 검증 범위와 배포 경계

현재 작업 PC에서 전체 setup이 완료되었고 front/server의 npm 감사 결과는 각각 **0건**입니다. 이는 검사 시점의 알려진 취약점 조회 결과이며 이후에도 유지된다는 보장은 아닙니다. 빌드·테스트·Python 모델 로드 결과는 [개발 가이드](development.md)에 기록합니다. 네 명의 PC 모두에서 설치·카메라 검증이 완료된 상태는 아닙니다.

MySQL 드라이버와 기존 저장소 구현은 남아 있지만 최종 서버 DB 제품·버전·운영 환경은 미정입니다. setup은 MySQL 설치나 스키마 실행을 하지 않습니다. 특히 `server/schema.sql`은 기존 테이블을 삭제하므로 일반 설치 과정으로 실행하면 안 됩니다.

Windows 설치 파일 생성 경로는 `moti.cmd package`입니다. Electron 개발 앱은 프로젝트 `.venv`의 Python 키보드 분석기를 자동 실행하지만, 현재 설치 패키지에는 `dist`와 `dist-electron`, 로컬 브라우저 MediaPipe 자원만 들어갑니다. **Python 실행 파일·키보드 분석 코드·YOLO 모델, 원격 서버·DB는 아직 포함되지 않습니다.** 설치 파일만으로 키보드 분석과 서버 저장이 동작한다고 안내하면 안 됩니다. 다음 배포 작업에서 Python을 Windows exe로 고정하고 모델/맵과 함께 `extraResources`에 넣은 뒤 깨끗한 PC에서 검사해야 합니다.

기존 `front/Dockerfile`은 현재 Windows 데스크톱 팀의 표준 설치 경로가 아닙니다. 원격 서버 배포 환경, Python 동봉 방식, 향후 SQLite 오프라인 기능은 [제품 결정](product-decisions.md)과 [로드맵](roadmap.md)에 따라 구체화합니다.
