# AI 개발 단계별 워크플로 키트

사람이 보기 쉬운 전체 사용법은 프로젝트 최상위의 `AI_WORKFLOW_USER_GUIDE.html`을 브라우저로 연다. 복사 가능한 시작 문장, 승인 단계, Codex·Claude Code 인계 방법이 한 문서에 정리되어 있다.

이 폴더는 긴 가이드 하나를 매번 AI에게 읽히는 대신, 현재 단계에 필요한 Markdown 파일만 전달하기 위한 키트다.

이 프로젝트에서는 자동 오케스트레이터 사용을 권장한다. 사용자는 `00_AUTOMATED_USE.md`만 먼저 읽으면 된다. Codex는 루트 `AGENTS.md`와 `.agents/skills/ai-workflow-orchestrator/`를, Claude Code는 `CLAUDE.md`와 `.claude/skills/ai-workflow-orchestrator/`를 사용해 나머지 단계 파일을 자동 선택한다.

개발 경험이 없다면 먼저 `user/00_NON_DEVELOPER_QUICK_START.md`를 읽는다. 새 작업의 생성, 계획 요청, 구현 승인, 이해 질문, 다른 사람의 재개 요청을 복사 가능한 문장으로 제공한다.

## 폴더 구분

```text
user/       사람이 작성하거나 확인하는 짧은 문서
ai/         해당 단계에서 AI에게 전달하는 작업 지시
templates/  AI가 결과를 작성할 때 사용하는 출력 형식
```

## 가장 중요한 사용 규칙

1. 모든 파일을 한꺼번에 AI에게 주지 않는다.
2. 현재 단계에 해당하는 AI 지시 파일과 필요한 템플릿만 준다.
3. 템플릿 원본을 수정하지 않고 작업별 결과 문서를 새로 만든다.
4. AI가 작성한 계획·ADR·PR을 사람의 승인 없이 확정하지 않는다.
5. 큰 작업에서는 한 단계가 검증되기 전 다음 단계로 넘어가지 않는다.

## 템플릿 원본과 작업 문서를 구분한다

`user/`와 `templates/`의 파일은 원본이다. 실제 작업 내용을 원본에 직접 작성하지 않는다. 새 작업마다 `work-items/` 아래에 작업 전용 폴더를 만들고 필요한 파일을 복사한다.

```text
docs/ai-workflow/work-items/2026-09-16-payment-timeout/
├─ STATUS.md
├─ 01_TASK_INPUT.md
├─ 03_PLAN.md
├─ 04_PLAN_REVIEW.md
├─ adr/
├─ step-reports/
├─ 09_VERIFICATION.md
├─ 10_INDEPENDENT_REVIEW.md
├─ 11_PR_DRAFT.md
├─ 12_HANDOFF.md
├─ 13_UNDERSTANDING.md
├─ 16_FINAL_APPROVAL.md
└─ 17_RETROSPECTIVE.md
```

새 작업 초기화에는 `ai/00_INITIALIZE_WORK_ITEM.md`를 사용한다. 다른 사람이 이어서 작업할 때는 `ai/00_RESUME_WORK_ITEM.md`를 사용한다. `STATUS.md`의 원본은 `templates/WORK_ITEM_STATUS_TEMPLATE.md`다. 별도 완성 예시 파일을 찾을 필요 없이, 각 항목 바로 위의 `<!-- 예: ... -->` 주석을 참고한다.

---

# 전체 사용 순서

| 단계 | 사람이 사용할 파일 | AI에게 줄 파일 | AI가 작성할 결과 |
|---|---|---|---|
| 0. 새 작업 초기화 | 작업 이름과 담당자 | `ai/00_INITIALIZE_WORK_ITEM.md` | 작업 폴더와 `STATUS.md` |
| 1. 사전 입력 | `user/01_TASK_INPUT.md` | 작성한 사전 입력 | 작업 맥락 확인 |
| 2. 계획 초안 요청 | 사전 입력 확인 | `ai/02_PLAN_DRAFT_INSTRUCTIONS.md` | 계획 초안 |
| 3. 계획 형식 고정 | 계획 초안 확인 | `templates/03_PLAN_TEMPLATE.md` | 정형화된 계획서 |
| 4. 계획 검토 | `user/04_PLAN_REVIEW.md` | 필요한 수정 의견 | 승인 또는 수정 요청 |
| 5. 계획 확정 | 승인된 조건 | `ai/05_PLAN_FINALIZE.md` | 최종 계획서 |
| 6. ADR 판단 | 필요 여부만 확인 | `ai/06_ADR_DECISION_GATE.md` | ADR 불필요 사유 또는 ADR 초안 |
| 7. 구현 | 구현 승인 | `ai/07_IMPLEMENT_ONE_STEP.md` | 계획의 한 단계 코드 변경 |
| 8. 단계 보고 | 결과 확인 | `ai/08_STEP_COMPLETION_REPORT.md` | 단계별 변경 보고서 |
| 9. 테스트 | 실패 결과 확인 | `ai/09_TEST_AND_VERIFY.md` | 검증 증거 |
| 10. 독립 리뷰 | 리뷰 결과 판단 | `ai/10_INDEPENDENT_REVIEW.md` | 버그·회귀 중심 리뷰 |
| 11. PR 작성 | 최종 diff 확인 | `ai/11_PR_DRAFT_INSTRUCTIONS.md` + PR 템플릿 | PR 초안 |
| 12. 인수인계 | 필요 시 확인 | `ai/12_CHANGE_HANDOFF.md` | 변경 인수인계서 |
| 13. 사람의 이해 | `user/13_CODE_UNDERSTANDING_WORKSHEET.md` | 필요 없음 | 내가 작성한 이해 요약 |
| 14. AI 설명 | 막힌 질문만 선택 | `ai/14_CODE_UNDERSTANDING_INSTRUCTIONS.md` | 코드 근거 기반 설명 |
| 15. 이해 교정 | 내 요약 붙여넣기 | `ai/15_UNDERSTANDING_FOLLOWUP.md` | 오해·누락 교정 |
| 16. 최종 승인 | `user/16_FINAL_APPROVAL.md` | 필요 시 미확인 사항 | 병합/보류 판단 |
| 17. 회고 | 반복 문제 선택 | `ai/17_RETROSPECTIVE.md` | AGENTS·CI·문서 개선안 |

각 단계가 끝날 때 작업 폴더의 `STATUS.md`에서 현재 상태, 마지막 완료 단계, 다음 행동, 관련 커밋을 갱신한다.

---

# 다른 사람이 작업을 이어가는 방법

다음 사람은 전체 대화를 전달받을 필요가 없다. 다음 순서로 재개한다.

1. 작업 폴더의 `STATUS.md`를 읽는다.
2. `ai/00_RESUME_WORK_ITEM.md`를 AI에게 준다.
3. AI가 상태 파일과 실제 브랜치·커밋·미커밋 변경을 대조한다.
4. 마지막 결과 문서와 테스트가 현재 코드에도 유효한지 확인한다.
5. AI의 `작업 재개 요약`을 사람이 확인한다.
6. 다음 단계 하나만 승인한다.

재개 프롬프트 예시:

```text
`docs/ai-workflow/work-items/2026-09-16-payment-timeout/STATUS.md`와
`docs/ai-workflow/ai/00_RESUME_WORK_ITEM.md`를 읽으세요.

현재 Git 브랜치, HEAD, staged/unstaged/untracked 변경을 상태 파일과 대조하세요.
완료된 것으로 기록된 문서와 테스트가 실제 상태와 일치하는지 확인하세요.
아직 코드를 수정하지 말고 작업 재개 요약만 작성하세요.
```

`STATUS.md`는 길찾기 문서이지 절대적인 사실이 아니다. 실제 Git 상태와 다르면 AI는 구현을 멈추고 불일치를 보고해야 한다.

커밋 시점, 중간 인계, PR 리뷰 수정, 병합 후 기록 방법은 `user/00_COMMIT_AND_HANDOFF_GUIDE.md`를 참고한다. 상태 갱신을 AI에게 맡길 때는 `ai/00_UPDATE_WORK_ITEM_STATUS.md`를 사용한다.

---

# 최소 사용 흐름

작거나 위험이 낮은 작업은 다음만 사용한다.

```text
01 사전 입력
→ 07 한 단계 구현
→ 09 테스트
→ 11 PR 작성
→ 16 최종 승인
```

# 일반적인 기능 개발 흐름

```text
01 사전 입력
→ 02 계획 초안
→ 03 계획 템플릿
→ 04 사용자 검토
→ 05 계획 확정
→ 07 한 단계 구현
→ 08 단계 보고
→ 09 테스트
→ 필요하면 다음 구현 단계 반복
→ 10 독립 리뷰
→ 11 PR 작성
→ 13~15 코드 이해
→ 16 최종 승인
```

# 위험한 변경 흐름

인증, 권한, 결제, 개인정보, 데이터 삭제, DB 마이그레이션, 공개 API, 이벤트 계약, 동시성, 재시도, 인프라는 다음 흐름을 권장한다.

```text
01 사전 입력
→ 02~05 계획
→ 06 ADR 판단 및 승인
→ 07~09 단계를 하나씩 반복
→ 10 독립 리뷰
→ 11 PR 작성
→ 12 인수인계
→ 13~15 사람의 이해
→ 담당자 승인
→ 16 최종 승인
→ 배포 후 17 회고
```

---

# 각 파일을 AI에게 주는 방법

예를 들어 계획을 요청할 때는 다음처럼 전달한다.

```text
다음 두 문서를 기준으로 작업하세요.

1. 내가 작성한 작업 입력: `user/01_TASK_INPUT.md`
2. 계획 작성 지침: `ai/02_PLAN_DRAFT_INSTRUCTIONS.md`

계획 결과는 `templates/03_PLAN_TEMPLATE.md` 형식으로 새 문서에 작성하세요.
아직 프로덕션 코드는 수정하지 마세요.
```

구현할 때는 다음처럼 전달한다.

```text
승인된 최종 계획서의 [단계 번호]만 구현하세요.
`ai/07_IMPLEMENT_ONE_STEP.md`를 적용하세요.
다른 단계는 구현하지 마세요.
```

코드를 이해할 때는 사용자가 먼저 `user/13_CODE_UNDERSTANDING_WORKSHEET.md`를 채우고, 막힌 항목만 AI에게 질문한다.

---

# 파일을 저장소에 넣을 때 권장 위치

```text
your-project/
├─ AGENTS.md
├─ .github/
│  └─ PULL_REQUEST_TEMPLATE.md
└─ docs/
   ├─ ai-workflow/
   │  ├─ 00_START_HERE.md
   │  ├─ user/
   │  ├─ ai/
   │  └─ templates/
   └─ adr/
      └─ TEMPLATE.md
```

`AGENTS.md`와 `CLAUDE.md`에는 항상 적용할 프로젝트 불변 조건과 워크플로 진입 규칙만 둔다. 단계별 상세 절차와 양식은 `docs/ai-workflow/`와 각 도구의 skill에 유지한다.
