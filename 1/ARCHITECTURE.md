# 바른자세 (Posture AI) 아키텍처 및 개발 명세서

본 문서는 WebRTC와 MediaPipe를 활용하여 사용자의 자세를 실시간으로 분석하고 피드백을 제공하는 '바른자세' 애플리케이션의 구조, 데이터베이스 설계, 그리고 향후 프론트엔드 코드 리팩토링 계획을 정의합니다.

---

## 1. 시스템 개요 (System Overview)

*   **목적:** PC 사용 중 발생하는 VDT 증후군(거북목, 손목 터널 증후군 등)을 예방하기 위해 웹캠으로 사용자의 자세를 실시간 분석하고 경고 및 통계를 제공.
*   **핵심 기술:**
    *   **Frontend:** React (Vite), TypeScript, TailwindCSS, Electron (PC App)
    *   **AI/Vision (Client):** Google MediaPipe (Pose) - 기본 뼈대 추출 및 크롭용 내비게이션
    *   **Camera:** WebRTC (`navigator.mediaDevices.getUserMedia`)
    *   **Backend & AI (Server):** Python (FastAPI) - 복잡한 각도 연산, 커스텀 AI 모델 구동, DB 제어
    *   **Database:** MySQL / MariaDB

---

## 2. 데이터베이스 스키마 (Database Schema)

모니터링 결과를 저장하고 통계 화면(`Statistics.tsx`)에 데이터를 제공하기 위한 관계형 데이터베이스 구조입니다.

### 2.1. `users` (사용자)
사용자의 기본 계정 정보.
*   `id` (PK, INT): 사용자 고유 ID
*   `email` (VARCHAR): 로그인 이메일
*   `username` (VARCHAR): 사용자 이름

### 2.2. `sessions` (측정 세션)
사용자가 대시보드에서 특정 모드를 **시작한 시점부터 종료한 시점까지**의 한 사이클.
*   `id` (PK, BIGINT): 세션 고유 ID
*   `user_id` (FK, INT): `users.id`
*   `mode` (VARCHAR): 실행된 모드 (예: `turtle`, `wrist`)
*   `started_at` (TIMESTAMP): 모니터링 시작 시간
*   `ended_at` (TIMESTAMP): 모니터링 종료 시간

### 2.3. `posture_logs` (자세 이벤트 로그) ⭐️
MediaPipe 연산 결과, **자세가 불량할 때** 또는 **일정 주기(예: 30초)** 로 서버에 전송되는 상세 기록.
*   `id` (PK, BIGINT): 로그 고유 ID
*   `session_id` (FK, BIGINT): `sessions.id`
*   `user_id` (FK, INT): `users.id`
*   `status` (ENUM): `GOOD`, `WARNING`, `DANGER` (자세 상태)
*   `measured_value` (FLOAT): 측정된 각도나 거리 수치
*   `recorded_at` (TIMESTAMP): 기록된 시간 (인덱스 적용)

### 2.4. `daily_statistics` (일일 통계)
통계 화면 조회를 빠르게 하기 위해, 하루(또는 세션) 단위로 요약된 데이터.
*   `id` (PK, BIGINT): 통계 고유 ID
*   `user_id` (FK, INT): `users.id`
*   `record_date` (DATE): 측정 날짜 (예: 2026-05-08)
*   `mode` (VARCHAR): 모드 종류
*   `total_monitoring_seconds` (INT): 총 모니터링 시간(초)
*   `bad_posture_seconds` (INT): 불량 자세 노출 시간(초)


### 2.5. `AI_tips` (AI 팁)
사용자의 자세 정보를 토대로 제공할 의학 정보나 다양한 조언 데이터.
*   `id` (PK, INT): 팁 고유 ID
*   `mode` (VARCHAR): 관련 모드 (예: `turtle`, `eye`, `all`)
*   `title` (VARCHAR): 팁 제목 (예: "거북목 예방 스트레칭")
*   `content` (TEXT): 팁 상세 내용
*   `image_url` (VARCHAR): 참고 이미지 또는 영상 링크

---

## 3. 프론트엔드 리팩토링 및 기능 분리 계획 (Frontend Refactoring Plan)

현재 `Dashboard.tsx` 파일 하나에 UI 렌더링, WebRTC 카메라 제어, MediaPipe AI 로딩 및 연산 로직이 모두 섞여 있어(Monolithic) 유지보수가 어렵습니다. 이를 기능별로 명확하게 분리해야 합니다.

### 3.1. 커스텀 훅 (Custom Hooks) 분리
UI와 상관없는 순수 비즈니스 로직(카메라, AI)을 훅으로 빼냅니다.

#### `src/hooks/useWebcam.ts`
*   **역할:** 컴퓨터의 웹캠 장치에 접근하여 스트림(MediaStream)을 가져오고 끄는 기능만 전담합니다.
*   **반환값:** `videoRef` (비디오 요소에 연결할 Ref), `stream` (현재 스트림 객체), `startWebcam()`, `stopWebcam()`

#### `src/hooks/useMediaPipe.ts`
*   **역할:** CDN을 통해 MediaPipe 스크립트를 로드하고, `Pose` 객체를 초기화하며, 비디오 프레임을 가져와 AI 분석을 돌리는 기능만 전담합니다.
*   **입력값:** `videoRef` (분석할 비디오 소스), `canvasRef` (뼈대를 그릴 캔버스)
*   **반환값:** `isLoaded` (AI 로딩 완료 여부), `startProcessing()`, `stopProcessing()`, `poseResults` (현재 프레임의 관절 좌표 데이터)

### 3.2. 컴포넌트 (Components) 분리
화면을 구성하는 블록을 나눕니다.

#### `src/components/ModeSelector.tsx`
*   **역할:** '거북목 모드', '손목 모드' 등의 카드 UI를 렌더링하고, 사용자의 클릭(시작/정지) 이벤트를 상위 컴포넌트로 전달합니다.

#### `src/components/PostureMonitor.tsx`
*   **역할:** 비디오 `<video>`와 투명 도화지 `<canvas>`를 겹쳐서 보여주는 뷰어 컴포넌트.
*   **동작:** `useWebcam`과 `useMediaPipe`를 내부에서 호출하여, 부모 컴포넌트가 '시작' 신호를 주면 화면에 카메라와 뼈대를 띄웁니다.

### 3.3. 각도 계산 유틸리티 로직 분리
#### `src/utils/postureCalculator.ts`
*   **역할:** MediaPipe가 던져주는 좌표(x, y, z) 점들을 받아서, 수학적(삼각함수 등)으로 실제 각도를 계산하는 순수 함수들의 모음입니다.
*   **함수 예시:**
    *   `calculateNeckAngle(earObj, shoulderObj): number` (거북목 각도 계산)
    *   `calculateShoulderSymmetry(leftShoulder, rightShoulder): boolean` (어깨 비대칭 계산)

### 3.4. 통합 (`src/pages/Dashboard.tsx`)
리팩토링 후의 `Dashboard.tsx`는 **껍데기(Container)** 역할만 합니다.
1.  어떤 모드가 선택되었는지 상태(`activeMode`)만 관리합니다.
2.  `ModeSelector` 컴포넌트를 그려줍니다.
3.  모드가 켜지면 `PostureMonitor` 컴포넌트를 렌더링하고, 모드 종류를 전달합니다.
4.  `PostureMonitor` 안에서 발생한 위험(Danger) 이벤트를 받아 서버(API)로 전송(Fetch)하는 통신 역할을 담당합니다.

---

## 4. 데이터 흐름 (Data Flow)
0. setup에서 다운받을때 사용자 개인정보 동의 받을 수 있도록. AI의 조언은 틀릴 수 있다는 점 넣어놓기. 
0. 사용자 로그인/회원가입 -> google, 카카오 등으로 연결가능하도록
1.  **사용자 액션:** 대시보드에서 '거북목 모드' 시작 클릭 (`ModeSelector`)
2.  **초기화:** `Dashboard` ➡️ `PostureMonitor` 마운트 ➡️ `useWebcam`으로 카메라 켬 ➡️ `useMediaPipe`로 AI 로드.
3.  **실시간 분석 (매 프레임 60FPS):**
    *   `useMediaPipe`가 비디오 프레임을 캡처하여 AI 추론 수행.
    *   관절 좌표 획득 ➡️ 캔버스에 뼈대 드로잉.
    *   획득한 좌표를 `postureCalculator.ts`로 넘겨 목 각도 계산.
4.  **판단 및 이벤트 발생 (프론트엔드/백엔드 협업):**
    *   **가벼운 모드 (거북목 등):** 프론트엔드가 파이썬 서버로 추출된 좌표 데이터를 전송 ➡️ 파이썬 서버가 복잡한 각도 연산을 수행하고 위험 여부를 프론트엔드로 응답.
    *   **무거운 모드 (손목 등 커스텀 모델):** 프론트엔드가 손목 부위 이미지를 크롭하여 파이썬 서버로 전송 ➡️ 파이썬 서버 내 커스텀 AI 모델이 추론 후 위험 여부를 응답.
5.  **서버 전송 및 DB 저장 (Backend API):**
    *   파이썬 서버는 분석된 위험 상태, 타임스탬프, 수치 데이터를 `posture_logs` 테이블에 기록 삽입.
    *   경고 상태가 지속되면 프론트엔드에 알람 트리거 신호 전송.
