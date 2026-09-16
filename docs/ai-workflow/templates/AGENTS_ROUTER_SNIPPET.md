# AGENTS.md에 넣을 단계별 워크플로 라우터

> 아래 `AI Workflow Routing` 섹션을 저장소의 루트 `AGENTS.md`에 복사한다. 경로는 실제 저장 위치에 맞게 수정한다.

```md
## AI Workflow Routing

The staged workflow is stored under `docs/ai-workflow/`.
Do not load every workflow document for every task. Read only the documents
required for the current stage.

### Before planning

Use the active work item's `01_TASK_INPUT.md` as the task brief. It is created
from `docs/ai-workflow/user/01_TASK_INPUT.md`; never fill in the source template
directly. If the work-item input is incomplete, investigate safe repository
facts and list material unknowns instead of inventing requirements.

For a new tracked work item, read:

- `docs/ai-workflow/ai/00_INITIALIZE_WORK_ITEM.md`
- `docs/ai-workflow/templates/WORK_ITEM_STATUS_TEMPLATE.md`

Create a work-item directory under `docs/ai-workflow/work-items/`. Never fill in
the source templates directly.

### Resuming existing work

Before continuing an existing work item, read:

- the work item's `STATUS.md`
- `docs/ai-workflow/ai/00_RESUME_WORK_ITEM.md`

Compare the recorded branch, commit, working tree, completed artifacts, and test
revision with the actual repository. Do not modify production code until the
resume summary is confirmed. Update `STATUS.md` after every completed stage,
handoff, blocking condition, and relevant commit.

When updating work-item state, read:

- `docs/ai-workflow/ai/00_UPDATE_WORK_ITEM_STATUS.md`

Keep code, tests, the corresponding step report, and `STATUS.md` in the same
checkpoint commit when practical. Never mark a result complete without its
artifact or verification evidence.

### Planning

For complex or high-risk changes, read:

- `docs/ai-workflow/ai/02_PLAN_DRAFT_INSTRUCTIONS.md`
- `docs/ai-workflow/templates/03_PLAN_TEMPLATE.md`

Do not modify production code during planning. After user feedback, read:

- `docs/ai-workflow/user/04_PLAN_REVIEW.md`
- `docs/ai-workflow/ai/05_PLAN_FINALIZE.md`

### Architecture decisions

When the plan contains a consequential or difficult-to-reverse design choice,
read:

- `docs/ai-workflow/ai/06_ADR_DECISION_GATE.md`
- `docs/ai-workflow/templates/ADR_TEMPLATE.md`

Do not mark an ADR Accepted without explicit human approval.

### Implementation

Implement only the user-approved plan step. Read:

- `docs/ai-workflow/ai/07_IMPLEMENT_ONE_STEP.md`

After the step, report with:

- `docs/ai-workflow/ai/08_STEP_COMPLETION_REPORT.md`
- `docs/ai-workflow/ai/09_TEST_AND_VERIFY.md`

Do not continue to the next plan step until the current step is verified or the
user explicitly authorizes continuation.

### Review and pull request

For an independent diff review, read:

- `docs/ai-workflow/ai/10_INDEPENDENT_REVIEW.md`

For a PR draft, read:

- `docs/ai-workflow/ai/11_PR_DRAFT_INSTRUCTIONS.md`
- `docs/ai-workflow/templates/PR_TEMPLATE.md`

Do not claim that a human verified an item unless the user explicitly confirmed
it. Do not claim unexecuted checks passed.

### Handoff and understanding

For a technical handoff, read:

- `docs/ai-workflow/ai/12_CHANGE_HANDOFF.md`

When the user asks to understand or explain a change, read:

- `docs/ai-workflow/ai/14_CODE_UNDERSTANDING_INSTRUCTIONS.md`

When checking the user's own summary, also read:

- `docs/ai-workflow/ai/15_UNDERSTANDING_FOLLOWUP.md`

Use actual files, symbols, diffs, and tests as evidence. Mark unsupported claims
as requiring confirmation.

### Retrospective

After repeated friction, review feedback, or a regression, read:

- `docs/ai-workflow/ai/17_RETROSPECTIVE.md`

Propose the smallest improvement first. Do not edit AGENTS.md, CI, or architecture
rules until the user approves the proposal.

### High-risk definition

Treat a change as high-risk when it affects authentication, authorization,
payments, personal data, deletion, database migrations, public APIs, event
contracts, concurrency, retries, idempotency, infrastructure, deployment order,
or an operation that is difficult to reverse.
```
