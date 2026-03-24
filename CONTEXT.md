# Context

## Item: sc-j1g6q

**Title:** Integration test: quality gate evaluation end-to-end with no_new_failures rule
**Status:** in_progress
**Priority:** 2

### Description

Add an integration test covering the full quality gate evaluation flow for the no_new_failures rule, from API request through to database-persisted result.

The existing integration tests live in internal/integration/. Add a new file internal/integration/quality_gate_evaluate_test.go.

Test scenario:
1. Create a team and authenticate
2. POST two test reports: report A with [test1: pass, test2: fail], report B with [test1: fail, test2: fail, test3: fail] (test3 is a new failure)
3. Create a quality gate with rules: [{"type": "no_new_failures"}]
4. POST /evaluate against report B
5. Assert response: passed=false
6. Assert the stored evaluation record in DB reflects passed=false
7. Repeat with report C where all failures were also in report A — assert passed=true

Also test the degenerate case: evaluate against the very first report for a team (no prior report exists). no_new_failures should pass when there is no baseline to compare against (all failures are 'new' but there is no prior context — current fetchPreviousFailedTests returns empty map in this case, meaning all failures appear new; verify whether this is the intended behavior and document it clearly in a code comment).

## Current Step: delivery

- **Type:** agent
- **Role:** delivery

## ⚠️ REVISION REQUIRED — Fix these issues before anything else

This droplet was recirculated. The following issues were found and **must** be fixed.
Do not proceed to implementation until you have read and understood each issue.

### Issue 1 (from: reviewer)

Finding 1: quality_gates.go:436 — fetchPreviousFailedTests returns nil both when no prior report exists AND on DB error. The caller in Evaluate cannot distinguish these cases. Since evalNoNewFailures (quality.go:140) treats nil PreviousFailedTests as 'all current failures are new', a transient DB error during this call silently produces wrong quality gate results (false failures). Fix: change fetchPreviousFailedTests to return (map[string]bool, error) and handle the error in the Evaluate handler — return a 500 or log a warning.

### Issue 2 (from: reviewer)

Finding 2: Duplicate test helpers across two new files. internal/handler/quality_gates_integration_test.go introduces insertTestReportAt, insertResult, insertNoNewFailuresGate, callEvaluateHandler — near-identical copies of insertQGReport, insertQGResult, insertNoNewFailuresGateForTeam, postEvaluateQG in internal/integration/quality_gate_evaluate_test.go. Both files are new in this diff. These helpers only use exported types and could be consolidated into a shared internal/testutil package to prevent drift when the schema changes.

### Issue 3 (from: reviewer)

♻ 2 findings. (1) quality_gates.go:436 — fetchPreviousFailedTests returns nil on both 'no prior report' and DB error; the Evaluate handler cannot distinguish them, causing silent false gate failures on transient DB errors. Fix: return (map[string]bool, error) and handle the error. (2) Duplicate test helpers: internal/handler/quality_gates_integration_test.go re-implements insertTestReportAt/insertResult/insertNoNewFailuresGate/callEvaluateHandler as near-identical copies of helpers in internal/integration/quality_gate_evaluate_test.go — consolidate into shared testutil package.

### Issue 4 (from: reviewer)

Phase 1: All 3 prior findings verified resolved — fetchPreviousFailedTests returns (map[string]bool, error) with pgx.ErrNoRows handling, both callers handle error appropriately, duplicate helpers consolidated into internal/testutil/qg_helpers.go. Phase 2: No new findings. Auth/team scoping correct, error responses don't leak internals, test coverage adequate for pass/fail/no-baseline scenarios.

---

## Recent Step Notes

### From: docs_writer

Updated docs: README.md (no_new_failures no-baseline behavior), CHANGELOG.md (bug fix entry for fetchPreviousFailedTests error handling).

### From: docs_writer

Updated README.md: added no-baseline behavior note to no_new_failures rule description. Updated CHANGELOG.md: added Fixed entry for fetchPreviousFailedTests returning proper error on DB failure instead of silently producing wrong gate results.

### From: reviewer

Phase 1: All 3 prior findings verified resolved — fetchPreviousFailedTests returns (map[string]bool, error) with pgx.ErrNoRows handling, both callers handle error appropriately, duplicate helpers consolidated into internal/testutil/qg_helpers.go. Phase 2: No new findings. Auth/team scoping correct, error responses don't leak internals, test coverage adequate for pass/fail/no-baseline scenarios.

### From: simplifier

No simplifications required — code is already clear and idiomatic. fetchPreviousFailedTests error handling is clean, testutil helpers are well-consolidated, test assertions are readable with useful domain-specific error messages.

<available_skills>
  <skill>
    <name>cistern-github</name>
    <description>---</description>
    <location>/home/lobsterdog/.cistern/skills/cistern-github/SKILL.md</location>
  </skill>
  <skill>
    <name>cistern-droplet-state</name>
    <description>Manage droplet state in the Cistern agentic pipeline using the `ct` CLI.</description>
    <location>/home/lobsterdog/.cistern/skills/cistern-droplet-state/SKILL.md</location>
  </skill>
  <skill>
    <name>cistern-git</name>
    <description>---</description>
    <location>/home/lobsterdog/.cistern/skills/cistern-git/SKILL.md</location>
  </skill>
</available_skills>

## Signaling Completion

When your work is done, signal your outcome using the `ct` CLI:

**Pass (work complete, move to next step):**
    ct droplet pass sc-j1g6q

**Recirculate (needs rework — send back upstream):**
    ct droplet recirculate sc-j1g6q
    ct droplet recirculate sc-j1g6q --to implement

**Block (genuinely blocked, cannot proceed):**
    ct droplet block sc-j1g6q

Add notes before signaling:
    ct droplet note sc-j1g6q "What you did / found"

The `ct` binary is on your PATH.
