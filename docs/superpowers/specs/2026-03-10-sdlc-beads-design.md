# SDLC Workflow with Beads — Design Spec

**Date:** 2026-03-10
**Status:** Approved

---

## Problem

ScaledTest uses AI agents for development. Without enforced structure, agents skip
stages, create PRs without review, merge without testing, or close issues before code
lands in main. We need a development pipeline that is structurally impossible to skip
— not just advisory.

---

## Bead Type Routing

| Bead Type                   | Workflow                                                  |
| --------------------------- | --------------------------------------------------------- |
| `feature`, `bug`            | Full SDLC molecule — 4 sequential stages                  |
| `task`, `chore`, `decision` | Lightweight — agent closes directly when done, no PR gate |

Routing is determined by bead type at spawn time. No judgment call required from the agent.

---

## Full SDLC: The Molecule Structure

Every `feature` or `bug` bead spawns a **molecule** of 4 sequential child beads via
`scripts/bd-sdlc-spawn.sh`. `bd ready` surfaces only the next unlocked stage —
ordering is structural, not advisory.

```
ScaledTest-a1b2  "Add OAuth login"  [feature]
├── ScaledTest-a1b2.1  [impl]    TDD/BDD implementation
├── ScaledTest-a1b2.2  [review]  Agent code review          ← blocked by .1
├── ScaledTest-a1b2.3  [qa]      Quality pass               ← blocked by .2
└── ScaledTest-a1b2.4  [pr]      PR + auto-merge gate       ← blocked by .3
```

The parent bead closes only when `.4` closes. `.4` closes only when the PR merges
into main. Nothing can be skipped structurally.

---

## Stage Definitions

### `.1 impl` — Implementation

**Agent persona:** TDD-first implementer

- Write failing tests before any production code (TDD) or scenarios first (BDD)
- Implement until all tests pass (`make test` green)
- No production code without a corresponding test
- Minor issues found during self-review are fixed in-place before closing
- **Closes when:** `make test` passes and implementation is complete

### `.2 review` — Agent Code Review

**Agent persona:** Skeptical reviewer

- Reads the full diff against main with fresh eyes
- Checks: correctness, edge cases, security, naming, dead code, error handling
- Minor issues: fix in-place, push, then close
- Structural issues, security problems, or significant rework needed: **rewind**
- **Closes when:** Diff is clean — no issues, or all minor issues resolved in-place
- **Rewinds when:** Issues require implementation-level rework

### `.3 qa` — Quality Pass

**Agent persona:** Quality auditor

- Runs the full test suite including integration and E2E (Playwright)
- Checks test coverage has not regressed
- Probes for: missing error handling, hardcoded values, perf regressions, missing edge cases
- Minor gaps: address in-place, push, re-run suite, then close
- Coverage regression or systemic gaps: **rewind**
- **Closes when:** Full suite passes, coverage acceptable
- **Rewinds when:** Coverage regressed or quality gaps require implementation rework

### `.4 pr` — PR + Merge Gate

**Agent persona:** Integration agent

- Creates PR against `main`
- Immediately enables auto-merge: `gh pr merge --auto --squash`
- Monitors for GitHub Copilot review comments — if present, reads and resolves in code, pushes fixes
- Waits for: CI green + no blocking review comments → GitHub auto-merges
- `gh:pr` gate blocks this bead from closing until merge is confirmed by GitHub
- **Closes when:** `gh:pr` gate auto-resolves on confirmed merge into main

---

## Rewind Mechanism

Review (`.2`) and QA (`.3`) can rewind the pipeline back to implementation when issues
are too significant to fix in-place. After a rewind, **all stages from impl forward
must be completed again** — review and QA cannot be skipped on the second pass.

### Rewind Decision Criteria

**Fix in-place (do NOT rewind):**

- Naming inconsistency, minor comment, small refactor
- Single missing null check
- Formatting or style issue

**Rewind (trigger `bd-sdlc-rewind.sh`):**

- Logic error or incorrect algorithm
- Security vulnerability
- Missing test coverage for core paths
- Architectural mismatch with the rest of the codebase
- Rework that would require touching more than 2-3 files

### Rewind Script Behaviour

`scripts/bd-sdlc-rewind.sh <stage-bead-id> "<reason>"` re-opens the correct beads
based on which stage calls it:

| Rewinding from | Beads re-opened                 |
| -------------- | ------------------------------- |
| `review:` (.2) | `.1` impl, `.2` review          |
| `qa:` (.3)     | `.1` impl, `.2` review, `.3` qa |

`bd ready` then surfaces `.1` again. The impl agent picks it up, fixes the issues,
closes it — which unlocks `.2` (review) again, then `.3` (qa) again, then `.4` (pr).
The dependency chain enforces the full circuit on every pass.

### Rewind Flow

```
impl → review ─── pass ───▶ qa ─── pass ───▶ pr → merged → closed
          │                   │
          └── rewind ──▶ impl → review → qa → pr → merged → closed
                          │
                  (QA rewind also re-opens review)
```

---

## Scripts

### `scripts/bd-sdlc-spawn.sh`

**Triggered by:** Agent — mandatory first action when picking up a `feature` or `bug` bead
**Arguments:** `<parent-bead-id>`
**Effect:** Creates 4 child beads with correct types, descriptions, dependencies, and `stage:` labels

### `scripts/bd-sdlc-rewind.sh`

**Triggered by:** Review or QA agent when rewind decision is made
**Arguments:** `<stage-bead-id> "<reason>"`
**Effect:** Re-opens impl (and review/qa as appropriate), logs reason as a comment on the parent bead

---

## Enforcement Layers

Three layers work together so no single layer is a single point of failure:

### 1. Structural (`bd` molecule dependencies)

`bd ready` never surfaces `.2` while `.1` is open. Stages cannot be skipped regardless
of agent intent. The rewind re-gates stages that were already passed.

### 2. Contextual (PRIME.md + `bd setup claude` hook)

`bd setup claude` installs a SessionStart hook that runs `bd prime` at the start of
every Claude Code session. PRIME.md contains the SDLC rules, stage checklists, and
spawn/rewind script requirements. Every agent session starts with this context injected
automatically (~1-2k tokens).

### 3. Hard gate (`gh:pr` gate on `.4`)

The `.4` bead cannot close until GitHub confirms the PR merged into main. This is
enforced at the database level by `bd` — no workaround available to the agent.

---

## GitHub Copilot Review (Interim)

Until a purpose-built agent review process is in place, GitHub Copilot Code Review
handles post-PR automated review. The `.4` pr agent:

1. Creates the PR
2. Enables auto-merge immediately
3. Polls for Copilot review comments
4. If comments exist: reads, resolves in code, pushes, waits for re-review
5. When CI passes and no blocking comments remain: auto-merge fires

The review stage (`.2`) exists as the hook point for replacing Copilot with a
custom review agent in future — same stage, better reviewer, no structural change needed.

---

## Lightweight Path (`task`, `chore`, `decision`)

No molecule spawned. No PR gate. Agent works directly on the parent bead and closes
it when the work is committed. Appropriate for dependency bumps, doc updates,
configuration changes, and organisational tasks.

---

## Agent Instructions Summary (for AGENTS.md)

```
## SDLC Workflow

When you pick up a `feature` or `bug` bead, your FIRST action — before any code — is:
  scripts/bd-sdlc-spawn.sh <bead-id>

This creates the implementation pipeline. Work only on what `bd ready` surfaces.

Stage personas:
- `impl:`   Write failing tests first. Then implement. Close when make test passes.
- `review:` Read the full diff. Fix minor issues in-place. Rewind if structural.
- `qa:`     Run the full suite. Check coverage. Rewind if it regresses.
- `pr:`     Create PR, enable auto-merge, resolve Copilot comments, wait for merge.

To rewind: scripts/bd-sdlc-rewind.sh <stage-bead-id> "<reason>"
Rewind criteria: logic errors, security issues, missing core test coverage, architectural mismatch.

For `task`, `chore`, `decision` beads: work directly, close when committed. No pipeline.
```
