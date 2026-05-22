# Moti 의존성 버전 정리

이 문서는 팀 개발 환경과 배포 패키징 시 확인해야 하는 주요 런타임/라이브러리 버전을 정리한다.

## 기준

- 프론트/Electron 기준 파일: `front/package.json`, `front/package-lock.json`
- Python 키보드 감지 기준 파일: `keyboard-detect/requirements.txt`
- 사용자는 setup 파일로 설치하며, Node.js/React/Vite/Python을 직접 설치하지 않는 방향을 목표로 한다.

## 개발 환경 권장 버전

| 항목 | 버전 | 비고 |
| --- | --- | --- |
| Node.js | 24.14.0 | 현재 빌드 확인에 사용한 버전. Vite 8은 `^20.19.0 || >=22.12.0` 필요 |
| npm | Node.js 24.14.0에 포함된 npm 사용 | 팀원은 `front/package-lock.json` 기준으로 `npm ci` 권장 |
| Python | 3.12.10 | `keyboard-detect` 실행/패키징 기준 버전 |

## 프론트/Electron 주요 의존성

### 런타임 의존성

| 패키지 | 버전 |
| --- | --- |
| react | ^19.2.5 |
| react-dom | ^19.2.5 |
| react-router-dom | ^7.14.2 |
| lucide-react | ^1.14.0 |
| recharts | ^3.8.1 |
| tailwindcss | ^4.2.4 |
| @tailwindcss/vite | ^4.2.4 |
| autoprefixer | ^10.5.0 |
| postcss | ^8.5.13 |

### 개발/빌드 의존성

| 패키지 | 버전 |
| --- | --- |
| electron | ^41.4.0 |
| electron-builder | ^26.8.1 |
| vite | ^8.0.10 |
| typescript | ~6.0.2 |
| @vitejs/plugin-react | ^6.0.1 |
| vite-plugin-electron | ^0.29.1 |
| vite-plugin-electron-renderer | ^0.14.7 |
| esbuild | ^0.28.0 |
| eslint | ^10.2.1 |
| typescript-eslint | ^8.58.2 |
| @eslint/js | ^10.0.1 |
| eslint-plugin-react-hooks | ^7.1.1 |
| eslint-plugin-react-refresh | ^0.5.2 |
| @types/node | ^24.12.2 |
| @types/react | ^19.2.14 |
| @types/react-dom | ^19.2.3 |
| globals | ^17.5.0 |

## Python 주요 의존성

Python 버전은 3.12.10을 기준으로 맞춘다.

| 패키지 | 버전 범위 |
| --- | --- |
| opencv-python | >=4.8.0,<4.12 |
| numpy | >=1.26.0,<2.0 |
| ultralytics | >=8.0.0 |
| roboflow | >=1.1.0 |
| flask | >=3.0.0 |
| pynput | >=1.7.6 |
| mediapipe | >=0.10.21,<0.10.35 |
| flask-socketio | >=5.3.6 |
| simple-websocket | >=1.0.0 |

## 배포 패키징 메모

- Electron setup 파일에는 빌드된 React 앱과 Electron 런타임이 포함된다.
- 사용자가 별도로 Node.js, npm, React, Vite를 설치할 필요는 없다.
- Python 기능을 앱 안에 포함하려면 Python 코드를 PyInstaller 등으로 실행 파일화한 뒤 Electron 패키지에 포함해야 한다.
- 현재 프론트의 자세 인식 기능은 `src/hooks/useMediaPipe.ts`에서 CDN의 MediaPipe 스크립트를 런타임에 불러온다. 완전한 무설치/오프라인 실행을 목표로 하면 MediaPipe 파일도 로컬 패키징 대상으로 전환해야 한다.

## 팀원 설치 명령

```bash
cd front
npm ci
npm run build
```

```bash
cd keyboard-detect
python -m pip install -r requirements.txt
```
