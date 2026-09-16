# Work-Item State Machine

Use the current repository state and work-item artifacts, not the label alone, to
choose a transition.

## State transitions

| Current state | Required action | Result | Stop? |
|---|---|---|---|
| no STATUS | Preserve input, bootstrap work-item structure | `INPUT_DRAFT` or `PLANNING` | Only if input incomplete |
| `INPUT_DRAFT` | Validate meaningful goal, scope, completion clues | `PLANNING` | Stop only for material missing intent |
| `PLANNING` | Read `02_PLAN_DRAFT_INSTRUCTIONS.md`; write `03_PLAN.md` using template | `PLAN_REVIEW` | Yes, request `04_PLAN_REVIEW.md` |
| `PLAN_REVIEW` | Read human review | revise plan or `ADR_REVIEW`/`READY_TO_IMPLEMENT` | Stop if review missing or requests a decision |
| `ADR_REVIEW` | Draft Proposed ADR or read its approval | `READY_TO_IMPLEMENT` when Accepted | Yes until explicit approval |
| `READY_TO_IMPLEMENT` | Identify first uncompleted approved step | `IMPLEMENTING` | No |
| `IMPLEMENTING` | Implement exactly one plan step; write step report | `VERIFYING` | No unless scope/risk expands |
| `VERIFYING` | Run required tests and checks | next step `IMPLEMENTING` or `REVIEWING` | Stop only for unresolved failure/block |
| `REVIEWING` | Run independent review pass | `CHANGES_REQUESTED` or `READY_FOR_PR` | No for in-scope fixes |
| `CHANGES_REQUESTED` | Fix approved in-scope findings, test, re-review | `REVIEWING` | Stop for new design/scope decision |
| `READY_FOR_PR` | Draft PR and handoff artifacts | `UNDERSTANDING_REVIEW` | No |
| `UNDERSTANDING_REVIEW` | Request and evaluate `13_UNDERSTANDING.md` | `FINAL_APPROVAL` | Yes |
| `FINAL_APPROVAL` | Request `16_FINAL_APPROVAL.md` | `READY_TO_MERGE` or `CHANGES_REQUESTED` | Yes |
| `READY_TO_MERGE` | Summarize; ask for separately authorized push/PR/merge action | stays or `PR_REVIEW` | Yes for external mutation |
| `PR_REVIEW` | Track review feedback and fixes | `READY_TO_MERGE` | Stop only for human decision |
| `BLOCKED` | Verify whether recorded resolution condition is satisfied | prior next state | Yes while unresolved |
| `DONE`/`CANCELLED` | Report terminal state; do not restart implicitly | terminal | Yes |

## Human-owned artifacts

### Plan review gate

Required file: active work item's `04_PLAN_REVIEW.md`.

The decision must be one of approval, conditional approval with resolved conditions,
revision request, or hold. Do not infer approval from silence.

### ADR gate

Required file: the Proposed ADR in the active work item's `adr/` directory.

The approval section must name the decision and approver or explicitly record that
the user is acting as decision owner. Do not mark Accepted yourself.

### Understanding gate

Required file: `13_UNDERSTANDING.md`.

The user may write plain language. It must cover purpose, entry point, important
state change, major failure, evidence, and known unknowns. Correct it using code and
tests; ask only for materially missing understanding.

### Final approval gate

Required file: `16_FINAL_APPROVAL.md`.

Proceed to `READY_TO_MERGE` only when the user records approval or satisfied
conditions. A hold or requested revision returns to the appropriate earlier state.

## Status updates

Apply `docs/ai-workflow/ai/00_UPDATE_WORK_ITEM_STATUS.md`. Record the next exact
action and file so a new thread can resume without conversation history.

When a user says a file was written:

1. re-read it from disk;
2. compare its modification/content with the expected gate;
3. do not accept an unchanged template as a decision;
4. update the state; and
5. continue automatically.

## Questions

Ask no question when repository inspection can answer it. Ask one plain-language
question at a time when different answers materially change user-visible behavior,
data, cost, permission, compatibility, or rollback. Record the answer in the work
item before continuing.
