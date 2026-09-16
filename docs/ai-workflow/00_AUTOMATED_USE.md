# 자동 진행 방식으로 사용하는 방법

이 프로젝트에서는 사용자가 단계별 AI 지침 파일을 직접 선택하지 않는다. Codex에서는 루트 `AGENTS.md`와 `.agents/skills/`가, Claude Code에서는 `CLAUDE.md`와 `.claude/skills/`가 현재 작업의 `STATUS.md`를 보고 다음 단계를 자동 선택한다.

실제 대화가 어떻게 진행되는지 보려면 `AUTOMATED_CONVERSATION_EXAMPLE.md`를 참고한다. 이 파일은 양식의 별도 완성본이 아니라, 시작부터 인계까지의 대화 흐름을 설명하는 독립 안내서다. 각 양식의 작성 예시는 해당 파일 안의 HTML 주석에 포함되어 있다.

## 사용자가 하는 일

### 1. 작업 폴더와 입력 파일 준비

다음 형식으로 폴더를 만든다.

```text
docs/ai-workflow/work-items/YYYY-MM-DD/담당자/작업이름/
```

예:

```text
docs/ai-workflow/work-items/2026-09-16/minsu/payment-timeout/
```

그 안에 `01_TASK_INPUT.md`를 작성한다. 빈 양식은 다음 파일을 복사한다.

```text
docs/ai-workflow/user/01_TASK_INPUT.md
```

하루에 담당자당 하나의 작업만 있다면 사용자가 제안한 짧은 구조도 사용할 수 있다.

```text
docs/ai-workflow/work-items/2026-09-16/minsu/
```

단, 같은 날 여러 작업이 생길 수 있으므로 작업 이름까지 넣는 구조를 권장한다.

### 2. Codex 또는 Claude Code에 시작 문장 한 번 전달

```text
현재 작업 폴더는 다음입니다.
`docs/ai-workflow/work-items/2026-09-16/minsu/payment-timeout/`

이 작업을 자동 워크플로로 진행하세요.
```

`STATUS.md`가 없어도 된다. `01_TASK_INPUT.md`가 있으면 사용 중인 도구가 나머지 구조와 상태 파일을 자동으로 만든다.

### 3. 사용 중인 도구가 사람 입력을 요청하면 해당 파일 작성

Codex 또는 Claude Code는 다음처럼 정확한 파일을 알려준다.

```text
현재 위치: 계획 검토
완료된 내용: 코드 조사와 계획 초안 작성
멈춘 이유: 구현 전에 사람의 범위 승인이 필요함
사용자가 할 일: 계획을 확인하고 승인 또는 수정 요청 선택
작성할 파일: docs/ai-workflow/work-items/.../04_PLAN_REVIEW.md
작성할 항목: 사용자 결정, 수정 요청, 첫 구현 허용 단계
저장 후 보낼 답변: 작성했어
```

사용자는 파일을 저장한 뒤 다음 한마디만 보낸다.

```text
작성했어
```

각 도구는 같은 대화에서 활성 작업 폴더를 기억하고, 파일을 다시 읽은 후 다음 단계부터 자동 진행한다.

### 4. 모르는 용어만 질문

```text
04_PLAN_REVIEW.md의 '공개 API'가 무슨 뜻인지 이 작업 기준으로 쉽게 설명해 줘.
```

설명을 받은 뒤 같은 파일을 작성하고 `작성했어`라고 하면 된다.

## AI가 자동으로 하는 일

- STATUS가 없으면 작업 폴더 초기화
- 코드와 테스트 조사
- 계획 초안 작성
- 계획 수정 반영
- ADR 필요 여부 판단과 초안 작성
- 승인된 단계 구현
- 테스트, 타입 검사, lint
- 단계 보고와 검증 문서 작성
- 범위 내 오류 수정과 재검증
- 독립 리뷰와 P0/P1 수정
- 로컬 체크포인트 커밋
- PR 본문 초안과 인수인계서 작성
- STATUS와 다음 행동 갱신

## 자동으로 하지 않는 일

기본 정책에서는 다음 작업 전 별도 허가를 요청한다.

- 원격 저장소 push
- 실제 PR 생성
- PR 병합
- 배포
- 프로덕션 데이터 변경
- 외부 메시지 전송
- 비밀 정보와 권한 설정 변경
- 삭제 또는 복구가 어려운 작업

## 새 대화를 시작하거나 다른 사람이 이어받는 경우

새 대화에서는 활성 작업 경로를 다시 한 번 알려준다.

```text
현재 작업 폴더는 다음입니다.
`docs/ai-workflow/work-items/2026-09-16/minsu/payment-timeout/`

STATUS와 실제 Git 상태를 대조한 뒤 자동 워크플로를 재개하세요.
```

같은 대화 안에서는 경로를 반복하지 않아도 된다.

Codex에서 Claude Code로, 또는 Claude Code에서 Codex로 바꿀 때는 먼저 기존 도구에게 인계 준비를 요청하고 `CROSS_AGENT_HANDOFF.md`를 적용한다.
