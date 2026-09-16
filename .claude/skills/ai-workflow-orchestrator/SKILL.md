---
name: ai-workflow-orchestrator
description: Automatically run this repository's tracked AI development workflow when the user identifies or continues a directory under docs/ai-workflow/work-items. Reconcile STATUS with Git, choose the next stage, create technical artifacts, implement and verify approved work, and continue until a configured human gate or material blocker.
---

# AI Work-Item Orchestrator

Use this skill only for a tracked work item under `docs/ai-workflow/work-items/`.

## Establish the active work item

Use the path explicitly provided by the user. Keep it active for the thread until
the user selects a different path. If the user says only `작성했어`, `계속`, or an
equivalent continuation, resume the active item rather than asking for its path.

If no active path can be determined, ask for exactly that path and do nothing else.

## Load the minimum control context

Read, in this order:

1. applicable repository `AGENTS.md` files;
2. `docs/ai-workflow/AUTOMATION_POLICY.md`;
3. the active work item's `01_TASK_INPUT.md`;
4. its `STATUS.md`, when present; and
5. [references/state-machine.md](references/state-machine.md).

Before editing, claim or verify the Claude executor lock using
`docs/ai-workflow/CROSS_AGENT_HANDOFF.md`. Never take over a work item actively
owned by Codex without a completed handoff or explicit reconciliation approval.

If `01_TASK_INPUT.md` is missing or has no meaningful goal, stop at the input gate.
If it exists but `STATUS.md` does not, bootstrap the work item using
`docs/ai-workflow/ai/00_INITIALIZE_WORK_ITEM.md`. Preserve the existing input.

## Run the state machine

On every turn:

1. Reconcile `STATUS.md` with the current branch, HEAD, working tree, artifacts,
   and the code revision covered by the latest tests.
2. If they conflict materially, record the mismatch and stop for the smallest
   necessary user decision.
3. Determine the next state from the state-machine reference.
4. Read only the AI instruction and template files required for that state.
5. Execute every safe automated action allowed by the policy.
6. Validate the result, write its work-item artifact, and update `STATUS.md`.
7. If no human gate or blocker is reached, immediately continue to the next state
   in the same turn.

Do not ask the user to choose workflow files, restate known context, or approve
routine implementation details already covered by an approved plan.

## Human gates

At a human gate, give one concise instruction with the exact work-item file and
section to complete. Explain the decision in plain language and recommend an option
when evidence supports one. End with the exact reply the user can send after saving,
normally `작성했어`.

When the user replies, re-read that file and confirm the required decision is
actually present. If complete, resume the state machine immediately. If incomplete,
ask only for the missing decision.

## Automated implementation

After plan and required ADR approval, implement approved plan steps sequentially.
For each step:

- obey `docs/ai-workflow/ai/07_IMPLEMENT_ONE_STEP.md`;
- write a step report using `08_STEP_COMPLETION_REPORT.md`;
- verify using `09_TEST_AND_VERIFY.md`;
- fix in-scope failures and re-run relevant checks;
- update `STATUS.md`; and
- create a scoped local checkpoint commit when the automation policy allows it.

Never include unrelated user changes in a commit. Stop when a new contract decision,
unsafe expansion, unresolved P0/P1 issue, or inconsistent working tree requires human
judgment.

## Review and completion

After all approved implementation steps pass verification:

1. perform the review defined by `10_INDEPENDENT_REVIEW.md` without editing during
   the review pass;
2. resolve in-scope P0/P1 findings, re-test, and re-review;
3. draft the PR using `11_PR_DRAFT_INSTRUCTIONS.md` and `templates/PR_TEMPLATE.md`;
4. write a handoff when the task is substantial;
5. stop at the user's understanding worksheet gate;
6. use `14_CODE_UNDERSTANDING_INSTRUCTIONS.md` and
   `15_UNDERSTANDING_FOLLOWUP.md` to check the user's summary; and
7. stop at final approval.

Do not push, open or merge a PR, deploy, or mutate external systems without the
specific authorization required by `AUTOMATION_POLICY.md`.

## User-facing updates

Avoid narrating every internal workflow transition. Keep working while safe. At a
gate or block, report:

- current position;
- completed work;
- why automation stopped;
- the exact file and section the user must complete; and
- the reply that resumes work.
