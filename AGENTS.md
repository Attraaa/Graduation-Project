# AGENTS.md

Behavioral guidelines to reduce common LLM coding mistakes. Merge with project-specific instructions as needed.

**Tradeoff:** These guidelines bias toward caution over speed. For trivial tasks, use judgment.

## 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

## 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

## 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

## 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it work") require constant clarification.

## 5. Context Gathering

Goal: get enough context fast, then act.

- Start with one broad search batch.
- Read only the top relevant files.
- Do not expand transitively unless the contract is needed for the edit.
- If top results point to the same area, proceed.
- Search again only if validation fails or a new unknown appears.
- Prefer a small working change over a broad investigation.
---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.

## Moti project navigation

- Start with [README.md](README.md), then read [docs/architecture.md](docs/architecture.md) for current behavior and task entry points.
- Use [docs/dependencies.md](docs/dependencies.md) and [docs/development.md](docs/development.md) for pinned environments, commands, verified results, and remaining validation limits. Files named `*-initial-audit.md` describe the old state.
- [docs/product-decisions.md](docs/product-decisions.md) records accepted D1–D8 answers separately from proposals. [docs/roadmap.md](docs/roadmap.md) lists completed work and remaining decisions. Do not ask again about Windows or one-mode operation.
- Run `setup.cmd` and `moti.cmd check` with the project-local toolchain. Change Python dependencies through `pyproject.toml`/`uv.lock`; requirements files are exports. Do not introduce a second JS package manager.
- The upper-body screen collects a per-session reference and shows projected changes/valid observation time. Random scores were removed; a new score policy is not implemented. Read [docs/calibration.md](docs/calibration.md) before changing units or acquisition rules.
- Frontend authentication and history/statistics remain demos. Express and Python are independent; no production API/IPC connection, AI summary, or SQLite sync is implemented. Do not present demo values as measurements.
- Reuse `src/styles/tokens.css`, `components/layout`, and the shared UI components. Keep camera lifecycle, pure measurement rules, HTTP routes, and database operations in their documented boundaries.
- `server/schema.sql` drops existing tables. Confirm the target DB and data preservation requirements before any schema execution; `front/database_schema.sql` differs from the current server queries.
- Keep the guide current when changing entry points, runtime requirements, or data contracts. Separate observed behavior, proposed changes, and verified results.
