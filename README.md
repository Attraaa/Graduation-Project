# Moti

컴퓨터 작업 중 자세와 작업 습관을 관찰하고, 자세 변화와 휴식을 안내하는 Windows 데스크톱 프로젝트입니다.

## 팀원 시작 방법

1. 저장소를 받은 뒤 **`setup.cmd`를 실행**합니다. 첫 실행에는 인터넷과 설치 시간이 필요합니다.
2. 앱 실행: **`moti.cmd`를 더블클릭**하거나 터미널에서 `moti.cmd app`을 실행합니다.
3. 전체 개발 검사: `moti.cmd check`

설정 스크립트가 프로젝트 안에 Node/npm, uv 관리 Python, JS/Python 의존성을 설치합니다. PC 전체의 PATH나 기존 Python을 바꾸지 않습니다. 현재 자동 설치 대상은 **Windows x64**이며 ARM64는 AI wheel 검증이 별도로 필요합니다.

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

## AI에게 전달할 공통 작업 지침

팀원이 AI와 새 작업을 시작할 때 아래 문구를 복사하고, 이어서 이번 작업 내용을 적습니다.

```text
AGENTS.md와 README.md를 먼저 읽고, docs/architecture.md, docs/product-decisions.md, docs/roadmap.md를 확인해.
확정된 결정과 제안·미구현 항목을 구분하고, 이번 작업과 관련된 코드부터 확인해.
구조나 계약을 변경하면 문서도 함께 갱신해.

이번 작업: [구현하거나 수정할 내용을 작성]
```

## 구현 범위

이번 작업은 공통 개발 환경, UI 구성 정리, 서버 기본 구조, 매 세션 기준 자세 수집까지 진행합니다. **완성 서비스로의 전체 연결은 아직 남아 있습니다.**

- 자세 측정 화면: 매번 기준 자세를 수집한 뒤 화면상 변화와 유효 관찰 시간을 표시합니다. 기존 난수 점수는 제거했습니다. 최종 자세 점수는 아직 산정하지 않습니다.
- UI: 공통 색상/테마, 화면 틀, 대화상자 호출 구조를 정리했습니다. 모든 화면의 시각 디자인을 전면 교체한 것은 아닙니다.
- 서버: 인증·입력 검증·오류 처리와 세션 종료/집계 경계를 정리했습니다. DB 제품은 미정이며 현재 MySQL 어댑터를 유지합니다.
- Python: 기존 키보드/손가락 매칭 모듈을 유지하고 Windows 환경을 잠급니다. Electron 화면과의 연결, 권장 손가락 통계 저장은 후속 작업입니다.
- 화면의 로그인·통계·이력은 아직 데모 저장소/예시 데이터입니다. AI 요약, BYOK, SQLite 동기화는 설계 제안 단계입니다.

**기존 DB 주의:** `server/schema.sql`은 테이블을 삭제하는 초기화 SQL입니다. 보존할 데이터가 있는 DB에 실행하지 않습니다. `front/database_schema.sql`도 현재 서버와 구조가 다릅니다.
