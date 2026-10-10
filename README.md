# Moti

컴퓨터 작업 중 자세와 작업 습관을 관찰하고, 자세 변화와 휴식을 안내하는 Windows 데스크톱 프로젝트입니다.

## 팀원 시작 방법

1. 저장소를 받은 뒤 **`setup.cmd`를 실행**합니다. 첫 실행에는 인터넷과 설치 시간이 필요합니다.
2. 앱 실행: **`moti.cmd`를 더블클릭**하거나 터미널에서 `moti.cmd app`을 실행합니다.
3. 전체 개발 검사: `moti.cmd check`

설정 스크립트가 프로젝트 안에 Node/npm, uv 관리 Python, JS/Python 의존성을 설치합니다. PC 전체의 PATH나 기존 Python을 바꾸지 않습니다. 현재 자동 설치 대상은 **Windows x64**이며 ARM64는 AI wheel 검증이 별도로 필요합니다.

macOS arm64에서는 같은 역할의 `setup.command`, `moti.command`를 씁니다(`moti.command check` 형태로 같은 작업 이름을 받습니다). 프론트와 서버는 동작하지만 **`keyboard-detect`의 Python 환경은 아직 설치되지 않습니다.** `keyboard-detect/uv.lock`이 `sys_platform == 'win32' and platform_machine == 'AMD64'`로만 잠겨 있어 `moti.command keyboard`, `keyboard-web`과 `check`의 Python 단계가 실패합니다. `package`(Windows 설치 파일)도 macOS 경로에서 검증하지 않았습니다.

| 명령 | 역할 |
| --- | --- |
| `moti.cmd setup` | 터미널에서 공통 환경 설치/복원 |
| `moti.cmd app` | Electron 앱 개발 실행 |
| `moti.cmd server` | API 서버 개발 실행. DB 접속 정보는 별도 설정 |
| `moti.cmd keyboard` | 독립 Python 키보드/손가락 테스트. 기본값은 전역 키 수집 꺼짐 |
| `moti.cmd keyboard-web` | Python 웹 테스트 서버 |
| `moti.cmd check` | 프론트 타입/린트/테스트, 서버 빌드/테스트, Python 환경 확인 |
| `moti.cmd package` | Windows 설치 파일 생성 |

`setup.cmd`는 DB를 생성하거나 초기화하지 않습니다. `server/.env`가 없을 때만 예시에서 생성하고 JWT 비밀값을 자동 발급합니다. 실제 원격 DB 주소·계정은 팀에서 정한 뒤 넣습니다.

## 다음 팀원과 AI가 읽을 순서

1. [작업 원칙](AGENTS.md)
2. [현재 구조와 코드 시작점](docs/architecture.md)
3. [환경과 잠금 파일](docs/dependencies.md)
4. [실행·검증 가이드](docs/development.md)
5. [사용자 결정과 제품 설계](docs/product-decisions.md), [캘리브레이션 계약](docs/calibration.md)
6. [남은 작업](docs/roadmap.md)
7. [점수·습관 평가 검증 범위와 결과](docs/evaluation.md)
8. [모드별 개발과 AI 협업](docs/collaboration.md)

## AI에게 전달할 공통 작업 지침

팀원이 AI와 새 작업을 시작할 때 아래 문구를 복사하고, 이어서 이번 작업 내용을 적습니다.

```text
AGENTS.md와 README.md를 먼저 읽고, docs/architecture.md, docs/product-decisions.md, docs/roadmap.md를 확인해.
확정된 결정과 제안·미구현 항목을 구분하고, 이번 작업과 관련된 코드부터 확인해.
구조나 계약을 변경하면 문서도 함께 갱신해.

이번 작업: [구현하거나 수정할 내용을 작성]
```

## 구현 범위

이번 작업은 공통 개발 환경, UI 구성 정리, 서버 기본 구조, 매 세션 기준 자세 수집과 키보드 실시간 개발 연결까지 진행합니다. **완성 서비스로의 저장·배포 연결은 아직 남아 있습니다.**

- 모니터링: 홈의 상체·키보드 카드에서 바로 시작하고 각각 일시정지/재개합니다. 상체는 같은 영상에서 목·어깨 점수와 시간 가중 평균, 분당 깜빡임과 세션 평균을 표시합니다. 상세 화면은 설정 아이콘으로 열고 목·어깨 및 키보드의 실시간 점수 추이를 확인합니다. 자세 점수 v3는 기준 대비 화면상 변화이며 실제 촬영 검증은 남아 있습니다.
- UI: 공통 색상/테마, 화면 틀, 대화상자 호출 구조를 정리했습니다. 모든 화면의 시각 디자인을 전면 교체한 것은 아닙니다.
- 서버: 인증·입력 검증·오류 처리와 세션 종료/집계 경계를 정리했습니다. DB 제품은 미정이며 현재 MySQL 어댑터를 유지합니다.
- 키보드: Electron 개발 앱에서 로컬 Python 분석기를 실행하고 100·70·0 훈련 점수, 판정 가능 비율, 사용 일관성을 표시합니다. 날짜·키·손가락별 집계를 서버에 저장하고 통계의 키보드 모드에서 히트맵·추이를 조회합니다. Moti 화면 입력과 설정에서 승인한 일반 앱을 키보드 시작 시 관찰하며 관리자 앱·미승인 앱을 제외합니다. 승인 목록이 비어 있어도 Moti 입력으로 시작할 수 있습니다. 손캠 crop·자유 회전·영상 필터를 지원합니다. 실제 인식 정확도 검증과 설치 파일용 Python exe 동봉은 남아 있습니다.
- 로그인·회원가입은 Moti API 서버 계정(JWT)입니다. 목·어깨·키보드 기록은 서버 MySQL에 저장하고 통계와 학습이력도 서버에서 조회합니다(서버 주소: `front/.env`의 `VITE_MOTI_API_URL`). AI·의학 정보는 예시로 구분하며 AI 요약, BYOK, 오프라인 저장·동기화, HTTPS는 후속 작업입니다. 저장 계약과 복구·삭제 정책은 [database/README.md](database/README.md)를 확인합니다.

**기존 DB 주의:** `server/schema.sql`은 테이블을 삭제하는 초기화 SQL입니다. 보존할 데이터가 있는 DB에 실행하지 않습니다. `front/database_schema.sql`도 현재 서버와 구조가 다릅니다.

## 상체·키보드 모니터링

2026-10-10 안구 관찰을 상체 모니터링에 합쳤습니다. 홈의 상체 시작 한 번으로 같은 카메라의 목·어깨 점수와 분당 깜빡임을 확인합니다. 키보드는 별도 카메라에서 동시에 실행하며 두 모드를 각각 일시정지/재개할 수 있습니다. 상세는 홈 카드의 설정 아이콘으로 열고, 모드별 장치 선택은 카메라 설정에서 저장합니다. 안구 점수/별도 모드 옵션/휴식 UI는 없습니다. [사용 흐름과 런타임](docs/monitoring.md)

Windows의 `eye.cmd` 브라우저 시연도 상체 화면으로 연결합니다. 이 명령은 프론트만 설치하므로 Electron/키보드 실행에는 기존 `setup.cmd`를 사용하세요. 안구 집계의 서버 저장·통계·학습이력 계약은 유지합니다.

기능·모델·실행·검증 한계 및 팀원의 브랜치 적용 방법은 [docs/eye-mode.md](docs/eye-mode.md)를 참고하세요.
