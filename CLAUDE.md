# Project Instructions for Claude Code

## Instruction priority

When instructions overlap, apply them in this order:

1. The user's explicit request for the current task.
2. Moti repository safety, architecture, ownership, build, and test rules.
3. The automated work-item workflow when a work-item directory is active.
4. The general coding behavior below.

The work-item workflow controls task progression and documentation. It does not
override repository-specific safety, architecture, ownership, validation, or data
preservation rules. If uncertainty can be resolved safely from the repository,
tests, documentation, or Git state, investigate it without asking the user. Stop
only for a material product or technical decision, a configured human gate, an
approval boundary, an unsafe operation, or an unresolved conflict.

## General coding behavior

### Think before coding

- State assumptions that materially affect scope, behavior, data, security,
  public contracts, architecture, compatibility, or deployment.
- If repository inspection can resolve an uncertainty safely, investigate it
  instead of asking the user.
- If multiple interpretations would materially change the result, present them
  and request a decision rather than choosing silently.
- If a simpler approach meets the approved goal, say so and prefer it.
- For low-risk implementation details within an approved scope, make a reasonable
  assumption, record it when useful, and continue.

### Simplicity first

- Write the minimum code that solves the approved problem.
- Do not add unrequested features, speculative abstractions, configurability, or
  handling for impossible cases.
- If the solution is substantially larger than necessary, simplify it before
  treating the work as complete.

### Surgical changes

- Touch only lines that trace to the approved request or are required to keep that
  change correct and testable.
- Do not refactor, reformat, rename, or clean adjacent code unless requested or
  necessary for the approved change.
- Match the existing style and preserve unrelated user or collaborator changes.
- Remove imports, variables, functions, and files made obsolete by the current
  change, but do not remove unrelated pre-existing dead code without approval.

### Goal-driven execution

- Translate the request into observable success criteria and proportionate tests.
- For bugs, reproduce the failure when practical and verify the fix.
- For refactors, establish relevant behavior before and after the change.
- For multi-step work, keep each step independently reviewable and verifiable.
- Continue within the approved scope until the success criteria are verified or a
  genuine human decision or external blocker remains.

### Focused context gathering

- Start with one focused search batch and read the most relevant files first.
- Expand to additional files only when a dependency, contract, failure, or new
  unknown requires it.
- Prefer a small, validated change to broad speculative investigation.
- Search again when validation fails or evidence reveals a new dependency.

## Moti project navigation and invariants

- Start with `README.md`, then read `docs/architecture.md` for current behavior and
  task entry points.
- Use `docs/dependencies.md` and `docs/development.md` for pinned environments,
  commands, verified results, and remaining validation limits. Files named
  `*-initial-audit.md` describe the old state and are not the current source of
  truth.
- `docs/product-decisions.md` records accepted D1-D8 answers separately from
  proposals. `docs/roadmap.md` lists completed work and remaining decisions. Do not
  ask again about Windows or one-mode operation when those accepted decisions
  already answer the question.
- Run `setup.cmd` and `moti.cmd check` with the project-local toolchain. Change
  Python dependencies through `pyproject.toml` and `uv.lock`; requirements files
  are exports. Do not introduce a second JavaScript package manager.
- The upper-body screen collects a per-session reference and applies provisional,
  versioned reference-similarity scores per mode. Read `docs/calibration.md` before
  changing units or acquisition, and `docs/evaluation.md` before changing scoring
  or habit rules. These are not anatomical diagnoses.
- Read `docs/collaboration.md` for file ownership. Keep mode policies, pure
  observation/scoring/aggregation, camera lifecycle, and presentation separate.
  Coordinate shared contract changes and preserve other tasks' changes.
- Frontend authentication and history/statistics remain demos. Express and Python
  are independent; no production API/IPC connection, AI summary, or SQLite sync is
  implemented. Do not present demo values as measurements.
- Reuse `src/styles/tokens.css`, `components/layout`, and the shared UI components.
  Keep camera lifecycle, pure measurement rules, HTTP routes, and database
  operations in their documented boundaries.
- `server/schema.sql` drops existing tables. Before any schema execution, confirm
  the exact target database and data-preservation requirements. Note that
  `front/database_schema.sql` differs from the current server queries.
- Keep the relevant guide current when changing entry points, runtime requirements,
  or data contracts. Separate observed behavior, proposed changes, and verified
  results.

## Automated AI work-item workflow

This repository uses the shared workflow under `docs/ai-workflow/` and the
project skill at `.claude/skills/ai-workflow-orchestrator/SKILL.md`.

### Activation

Invoke the `ai-workflow-orchestrator` skill whenever the user:

- identifies a directory under `docs/ai-workflow/work-items/` as the current work folder;
- asks to start, continue, resume, review, understand, or finish a tracked work item; or
- says that a requested human-owned workflow file has been written or updated.

Once a work-item directory is identified, keep it active for the session until the
user identifies another. Do not ask the user to repeat the path on every turn.

### Bootstrap

The user may create only `01_TASK_INPUT.md`. If it is meaningful and `STATUS.md`
does not exist, initialize the remaining work-item structure using:

- `docs/ai-workflow/ai/00_INITIALIZE_WORK_ITEM.md`
- `docs/ai-workflow/templates/WORK_ITEM_STATUS_TEMPLATE.md`

Preserve the user's input and never fill in the source templates directly.

### Continuous progression

At the start of each work-item turn:

1. Read `docs/ai-workflow/AUTOMATION_POLICY.md`.
2. Read the active work item's `STATUS.md` and `01_TASK_INPUT.md`.
3. Claim or verify the Claude executor lock according to
   `docs/ai-workflow/CROSS_AGENT_HANDOFF.md`.
4. Reconcile the recorded branch, HEAD, working tree, artifacts, and test revision
   with the actual repository.
5. Select the next workflow state and load only the relevant instruction and
   template files.
6. Continue through safe automated stages in the same turn.
7. Update `STATUS.md` after every material stage, checkpoint, block, or handoff.
8. Stop only at a configured human gate, material unknown, approval boundary, or
   unsafe/inconsistent repository state.

Do not ask the user which workflow document to use. Do not ask for facts that can
be safely established from the repository.

### Human-owned files

The default human-owned files are:

- `01_TASK_INPUT.md`
- `04_PLAN_REVIEW.md`
- an ADR approval section when required
- `13_UNDERSTANDING.md`
- `16_FINAL_APPROVAL.md`

At a human gate, state the exact file and section, explain the decision in plain
language, and end with the short reply that resumes work, normally `작성했어`.

When the user replies, re-read the file, verify that the required decision exists,
and resume automatically. If incomplete, ask only for the missing decision.

### Cross-agent safety

Codex and Claude share the same work-item files and Git branch but must not edit the
same work item concurrently. If `STATUS.md` records Codex as the active executor,
do not take over until a handoff checkpoint exists or the user explicitly requests
and approves reconciliation. Before handing back, update STATUS, record uncommitted
changes and test validity, and release or transfer the executor lock.

### Git and external actions

Follow `docs/ai-workflow/AUTOMATION_POLICY.md`. Never commit unrelated user changes. Do not push,
create or merge a pull request, deploy, delete data, or mutate external systems
without the exact authorization required by policy and the user.

### Evidence

`STATUS.md` is a navigation index, not the source of truth. Git state, files, tests,
and review evidence take precedence. On conflict, stop automation, record the
mismatch, and request only the decision needed to proceed.

### Existing project instructions

Preserve other project instructions, build commands, coding conventions, security
rules, and more specific nested `CLAUDE.md` files. More specific rules governing
changed code take precedence over generic workflow defaults.
