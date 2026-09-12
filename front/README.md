# Moti 프론트엔드와 Electron

React 화면과 Electron 데스크톱 진입점이 있는 폴더입니다. 팀 공통 설치·실행은 [루트 README](../README.md)를 따릅니다.

- [현재 구조와 기능별 코드 위치](../docs/architecture.md)
- [의존성과 버전 관리](../docs/dependencies.md)
- [설치·실행·검증 결과](../docs/development.md)
- [캘리브레이션 계약](../docs/calibration.md)
- [사용자 결정](../docs/product-decisions.md), [다음 작업](../docs/roadmap.md)

루트에서 `moti.cmd app`으로 개발 앱을 실행합니다. 이 폴더의 `npm run build`는 타입 검사와 UI/Electron 빌드, `npm run package`는 Windows 설치 파일 생성입니다. 단독 브라우저 확인은 `npm run dev:browser`입니다. npm을 직접 쓸 때도 루트의 프로젝트 전용 도구 환경을 적용합니다.

상체 측정은 매번 안정된 기준 자세를 수집하고 기준 대비 화면상 변화·유효 관찰 시간을 표시합니다. 키보드 모드는 Electron이 개발용 로컬 Python 분석기를 시작해 카메라 프레임과 현재 화면 키 입력을 연결하고, 앱의 임시 권장 손가락표로 실시간 판정합니다. 기존 난수 점수는 제거했고 새 자세 점수 산식은 아직 없습니다. 로그인·통계·이력과 결과 저장은 데모/미연결 상태입니다.

공통 화면 틀은 `src/components/layout`, 디자인 토큰은 `src/styles`, 순수 측정 로직은 `src/features/posture`에서 시작합니다. MediaPipe 생성 자원은 직접 편집하지 않습니다. `database_schema.sql`은 현재 서버 쿼리와 다른 과거 자료입니다.
