# Repository Agent Instructions

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
- Frontend authentication remains a local demo. Turtle/shoulder history and statistics
  use Electron-owned local SQLite; read `database/README.md` for its contract.
  AI/medical sections remain labeled examples. Express stays independent; production
  server authentication, AI summary, and SQLite server sync are not implemented.
  Do not present demo values as measurements.
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

This repository uses the workflow under `docs/ai-workflow/` and the repository
skill at `.agents/skills/ai-workflow-orchestrator/SKILL.md`.

### Activation

Use the `ai-workflow-orchestrator` skill whenever the user:

- identifies a directory under `docs/ai-workflow/work-items/` as the current work folder;
- asks to start, continue, resume, review, understand, or finish a tracked work item; or
- replies that a requested human-owned workflow file has been written or updated.

Once a work-item directory is identified in a thread, keep it as the active work
item until the user identifies a different one. Do not ask the user to repeat the
path on every turn.

### Bootstrap

The user may create only `01_TASK_INPUT.md` in a new work-item directory. If the
directory has a meaningful `01_TASK_INPUT.md` but no `STATUS.md`, initialize the
remaining work-item structure automatically using:

- `docs/ai-workflow/ai/00_INITIALIZE_WORK_ITEM.md`
- `docs/ai-workflow/templates/WORK_ITEM_STATUS_TEMPLATE.md`

Preserve the user's input file. Never replace it with the source template.

### Continuous progression

At the start of every work-item turn:

1. Read `docs/ai-workflow/AUTOMATION_POLICY.md`.
2. Read the active work item's `STATUS.md` and `01_TASK_INPUT.md`.
3. Claim or verify the Codex executor lock according to
   `docs/ai-workflow/CROSS_AGENT_HANDOFF.md`.
4. Reconcile the recorded branch, HEAD, working tree, artifacts, and test revision
   with the actual repository.
5. Select the next workflow stage and load only its relevant instruction and
   template files.
6. Continue through all safe automated stages in the same turn.
7. Update `STATUS.md` after each material stage, checkpoint, block, or handoff.
8. Stop only at a configured human gate, a material unknown, an approval boundary,
   or an unsafe/inconsistent repository state.

Do not ask the user which workflow document should be used. Select it from the
state machine. Do not ask for repository facts that can be safely inspected.

### Human-owned files

The default human-owned files are:

- `01_TASK_INPUT.md`
- `04_PLAN_REVIEW.md`
- an ADR's approval section when an ADR is required
- `13_UNDERSTANDING.md`
- `16_FINAL_APPROVAL.md`

When one is required, stop with one concise instruction containing:

- the exact file path;
- the section that must be completed;
- a plain-language explanation of the decision;
- the recommended choice and material tradeoff when appropriate; and
- the exact short reply the user can send after saving it, such as `작성했어`.

When the user replies that the file is complete, re-read the file, verify that the
required decision is present, and resume automatically. Do not require the user to
repeat the work-item path in the same thread.

### Git and external actions

Follow `docs/ai-workflow/AUTOMATION_POLICY.md` for local checkpoint commits.
Never include unrelated user changes in a workflow commit. Do not push, create or
merge a pull request, deploy, delete data, or mutate external systems unless the
policy and the user's explicit authorization allow that exact action.

### Cross-agent safety

Codex and Claude Code share the same work-item files and Git branch but must not edit
the same work item concurrently. If `STATUS.md` records Claude as the active
executor, do not take over until a handoff checkpoint exists or the user explicitly
requests and approves reconciliation. Before handing off, update STATUS, record
uncommitted changes and test validity, and release or transfer the executor lock.

### Evidence

`STATUS.md` is a navigation index, not the source of truth. Actual Git state,
files, test output, and review evidence take precedence. If they conflict, stop
automation, record the mismatch, and request only the decision needed to proceed.

### Existing repository instructions

More specific nested `AGENTS.md` files continue to apply to their directories.
Repository build, test, security, and ownership rules take precedence over generic
workflow defaults.
