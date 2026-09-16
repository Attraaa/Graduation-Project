# Codex와 Claude Code 프로젝트에 설치하기

사람이 읽는 전체 사용법은 패키지 최상위의 `AI_WORKFLOW_USER_GUIDE.html`을 브라우저로 열어 확인한다. 인터넷 연결 없이 사용할 수 있다.

이 패키지는 개인 설정이 아니라 프로젝트 저장소에 포함하는 구성이다. Codex와 Claude Code가 같은 work item, STATUS, 계획, ADR, 검증과 PR 문서를 공유한다.

이 배포본의 `AGENTS.md`와 `CLAUDE.md`에는 사용자가 제공한 Moti 프로젝트 규칙, 일반 코딩 원칙, 자동 work-item 워크플로가 이미 병합되어 있다.

## 1. 프로젝트 루트에 복사

패키지의 다음 항목을 프로젝트 루트에 복사한다.

```text
.agents/
.claude/
docs/
AGENTS.md
CLAUDE.md
```

## 2. 기존 AGENTS.md가 있는 경우

대상 파일이 이번 병합에 사용한 Moti `AGENTS.md`와 동일하고 그 이후 수정이 없다면, 기존 파일을 백업하거나 diff로 확인한 뒤 패키지의 사전 병합된 `AGENTS.md`로 교체할 수 있다.

대상 파일에 이번 병합 이후의 추가 규칙이나 팀원의 수정이 있다면 덮어쓰지 않는다. 패키지의 다음 섹션을 기존 파일과 대조해 새 내용만 병합한다.

- `Instruction priority`
- `General coding behavior`
- `Moti project navigation and invariants`
- `Automated AI work-item workflow`

기존 저장소의 빌드, 테스트, 보안, 경로별 규칙은 유지한다.

## 3. 기존 CLAUDE.md가 있는 경우

기존 `CLAUDE.md`가 없다면 패키지 파일을 그대로 사용한다. 기존 파일이 있다면 덮어쓰지 말고 Moti 프로젝트 규칙과 자동 워크플로 섹션을 병합한다.

기존 Claude Code 프로젝트 규칙과 더 구체적인 하위 `CLAUDE.md`를 유지한다.

## 4. 저장소에 커밋

예:

```text
docs(workflow): add Codex and Claude work-item orchestration
```

## 5. 새 Codex 또는 Claude Code 세션 시작

Codex는 프로젝트 `AGENTS.md`와 `.agents/skills/`를 사용한다. Claude Code는 `CLAUDE.md`와 `.claude/skills/`를 사용한다. 처음 추가한 뒤에는 새 세션에서 프로젝트를 여는 것이 가장 확실하다.

## 6. 실제 작업 시작

`docs/ai-workflow/00_AUTOMATED_USE.md`를 따른다. 사용자는 작업 폴더에 `01_TASK_INPUT.md`만 준비하고 현재 작업 폴더 경로를 사용 중인 도구에 알려주면 된다.

## Codex 설치 확인

Codex에 다음처럼 요청한다.

```text
이 저장소에서 자동 AI work-item workflow가 어떻게 활성화되는지,
어떤 AGENTS.md와 저장소 스킬을 읽었는지 요약해 줘.
파일을 수정하지 마.
```

다음 두 항목이 확인되어야 한다.

- 루트 `AGENTS.md`의 `Automated AI work-item workflow`
- `.agents/skills/ai-workflow-orchestrator/SKILL.md`

## Claude Code 설치 확인

Claude Code에 다음처럼 요청한다.

```text
이 저장소에서 자동 AI work-item workflow가 어떻게 활성화되는지,
어떤 CLAUDE.md와 프로젝트 skill을 읽었는지 요약해 줘.
파일을 수정하지 마.
```

다음 두 항목이 확인되어야 한다.

- 루트 `CLAUDE.md`의 `Automated AI work-item workflow`
- `.claude/skills/ai-workflow-orchestrator/SKILL.md`

Claude Code에서 `/context`로 로드된 `CLAUDE.md`를 확인하고 `/skills`에서 프로젝트 스킬을 확인할 수 있다.

## 기본 자동화 정책 변경

다음 파일을 프로젝트 규칙에 맞게 한 번 수정하고 커밋한다.

```text
docs/ai-workflow/AUTOMATION_POLICY.md
```

기본값은 검증된 로컬 체크포인트 커밋까지 자동으로 허용하지만 push, PR 생성, 병합, 배포는 별도 허가를 요구한다.

## Codex와 Claude Code를 바꿔 사용할 때

`docs/ai-workflow/CROSS_AGENT_HANDOFF.md`를 따른다. 같은 work item과 브랜치를 두 도구가 동시에 수정하지 않는다. 이전 도구가 STATUS와 Git 체크포인트를 정리하고 실행 도구 잠금을 해제한 후 새 도구가 재개한다.
