# Context

## Item: sc-j755h

**Title:** Define LLM triage result schema and DB migration
**Status:** in_progress
**Priority:** 2

### Description

Design and implement the database schema for storing LLM triage results per CI run. Schema must capture: failure clusters (groups sharing a root cause), per-cluster root cause summary, per-failure classification (new/flaky/regression), overall triage summary text, LLM provider used, token cost metadata, and triage status (pending/complete/failed). Write and apply the migration. This is the foundational data contract all other triage work depends on.

## Current Step: implement

- **Type:** agent
- **Role:** implementer
- **Context:** full_codebase

## ⚠️ REVISION REQUIRED — Fix these issues before anything else

This droplet was recirculated. The following issues were found and **must** be fixed.
Do not proceed to implementation until you have read and understood each issue.

### Issue 1 (from: reviewer)

Finding: internal/store/triage.go:72-88 — Complete() lacks team_id scoping. The UPDATE uses WHERE id = $1 only, without AND team_id = $X. Every other UPDATE in the codebase (quality_gates, webhooks, invitations) includes team_id in the WHERE clause. This violates the project standard 'All data queries must be team-scoped (no cross-team data leaks)'. A caller with a known triage UUID can complete any team's triage result. Fix: add teamID parameter and AND team_id = $2 to the WHERE clause, matching the pattern in QualityGateStore.Update(), WebhookStore.Update(), etc.

### Issue 2 (from: reviewer)

Finding: internal/store/triage.go:90-106 — Fail() has the same missing team_id scoping as Complete(). UPDATE uses WHERE id = $1 only. Fix: add teamID parameter and AND team_id = $2 to the WHERE clause.

### Issue 3 (from: reviewer)

Finding: internal/store/triage.go:124 — ListClusters() queries by triage_id only without team_id filtering. Every other List* method in the codebase (QualityGateStore.List, WebhookStore.List, InvitationStore.ListByTeam, DurationStore.GetByTeam) includes WHERE team_id = $X. Fix: add teamID parameter and AND team_id = $2 to the WHERE clause.

### Issue 4 (from: reviewer)

Finding: internal/store/triage.go:160 — ListClassifications() has the same missing team_id scoping as ListClusters(). Queries triage_failure_classifications by triage_id only. Fix: add teamID parameter and AND team_id = $2 to the WHERE clause.

### Issue 5 (from: reviewer)

Finding: internal/db/migrations/000019_create_triage_results.up.sql:22 — idx_triage_results_report_id is redundant. The UNIQUE (report_id) constraint on line 18 already creates an implicit unique index on report_id. The explicit CREATE INDEX on line 22 creates a second, duplicate index on the same column, wasting write performance and storage. Fix: remove the CREATE INDEX idx_triage_results_report_id line.

### Issue 6 (from: reviewer)

♻ 5 findings. (1) CRITICAL: Complete() at triage.go:72 lacks team_id in WHERE clause — allows cross-team mutation. (2) CRITICAL: Fail() at triage.go:90 same missing team_id scoping. (3) ListClusters() at triage.go:124 queries without team_id filter — violates project standard. (4) ListClassifications() at triage.go:160 same missing team_id filter. (5) Migration up.sql:22 — idx_triage_results_report_id is redundant with the UNIQUE(report_id) constraint on line 18.

---

## Recent Step Notes

### From: reviewer

♻ 5 findings. (1) CRITICAL: Complete() at triage.go:72 lacks team_id in WHERE clause — allows cross-team mutation. (2) CRITICAL: Fail() at triage.go:90 same missing team_id scoping. (3) ListClusters() at triage.go:124 queries without team_id filter — violates project standard. (4) ListClassifications() at triage.go:160 same missing team_id filter. (5) Migration up.sql:22 — idx_triage_results_report_id is redundant with the UNIQUE(report_id) constraint on line 18.

### From: reviewer

Finding: internal/db/migrations/000019_create_triage_results.up.sql:22 — idx_triage_results_report_id is redundant. The UNIQUE (report_id) constraint on line 18 already creates an implicit unique index on report_id. The explicit CREATE INDEX on line 22 creates a second, duplicate index on the same column, wasting write performance and storage. Fix: remove the CREATE INDEX idx_triage_results_report_id line.

### From: reviewer

Finding: internal/store/triage.go:160 — ListClassifications() has the same missing team_id scoping as ListClusters(). Queries triage_failure_classifications by triage_id only. Fix: add teamID parameter and AND team_id = $2 to the WHERE clause.

### From: reviewer

Finding: internal/store/triage.go:124 — ListClusters() queries by triage_id only without team_id filtering. Every other List* method in the codebase (QualityGateStore.List, WebhookStore.List, InvitationStore.ListByTeam, DurationStore.GetByTeam) includes WHERE team_id = $X. Fix: add teamID parameter and AND team_id = $2 to the WHERE clause.

<available_skills>
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
  <skill>
    <name>cistern-github</name>
    <description>---</description>
    <location>/home/lobsterdog/.cistern/skills/cistern-github/SKILL.md</location>
  </skill>
</available_skills>

## Signaling Completion

When your work is done, signal your outcome using the `ct` CLI:

**Pass (work complete, move to next step):**
    ct droplet pass sc-j755h

**Recirculate (needs rework — send back upstream):**
    ct droplet recirculate sc-j755h
    ct droplet recirculate sc-j755h --to implement

**Block (genuinely blocked, cannot proceed):**
    ct droplet block sc-j755h

Add notes before signaling:
    ct droplet note sc-j755h "What you did / found"

The `ct` binary is on your PATH.
