# Context

## Item: sc-ofp9a

**Title:** OpenAPI spec: add missing paths (invitations + auth profile endpoints)
**Status:** in_progress
**Priority:** 3

### Description

internal/openapi/openapi.json is missing: all invitation endpoints (POST/GET /api/v1/teams/{teamID}/invitations, DELETE /api/v1/teams/{teamID}/invitations/{invitationID}, GET /api/v1/invitations/{token}, POST /api/v1/invitations/{token}/accept), GET /auth/me, PATCH /auth/me (update profile), POST /auth/change-password. All routes are wired in routes.go — just not documented in the spec. Add full request/response schemas for each.

## Current Step: delivery

- **Type:** agent
- **Role:** delivery

## ⚠️ REVISION REQUIRED — Fix these issues before anything else

This droplet was recirculated. The following issues were found and **must** be fixed.
Do not proceed to implementation until you have read and understood each issue.

### Issue 1 (from: reviewer)

Finding 1 (CRITICAL): internal/server/routes.go:154-173 — AuditStore never wired into TeamsHandler, QualityGatesHandler, WebhooksHandler, or InvitationsHandler. All four handlers are constructed without setting the AuditStore field. Because logAudit() silently no-ops on nil, every audit event added by this diff is dead code in production. Fix: pass auditStore to each handler at construction, e.g. teamsH := &handler.TeamsHandler{DB: dbPool, AuditStore: auditStore}

### Issue 2 (from: reviewer)

Finding 2: Missing test coverage — teams.go adds 4 audit events (team.created, team.deleted, token.created, token.deleted) with zero tests. quality_gates.go adds 3 audit events (quality_gate.created, quality_gate.updated, quality_gate.deleted) with zero tests. invitation.accepted has no test either. Only webhooks (3 tests) and invitation create/revoke (3 tests) have coverage. Fix: add audit assertion tests for teams, quality gates, and invitation.accepted, following the same capAuditLogger pattern already used in webhooks_test.go and invitations_test.go.

### Issue 3 (from: reviewer)

♻ 2 findings. (1) CRITICAL: internal/server/routes.go:154-173 — AuditStore is never wired into TeamsHandler, QualityGatesHandler, WebhooksHandler, or InvitationsHandler at construction time. Since logAudit() silently no-ops on nil, every audit event in this diff is dead code in production. (2) Missing test coverage — 8 of 13 audit events have no tests: all 4 teams events, all 3 quality gate events, and invitation.accepted.

### Issue 4 (from: reviewer)

Phase 1: All 3 prior issues verified RESOLVED. (1) AuditStore wired into all 4 handlers in routes.go. (2) 8 missing audit tests added (4 teams, 3 quality gates, 1 invitation.accepted). (3) Duplicate of 1+2. Tests pass (2.9s). Phase 2: Fresh adversarial review — no new findings. SQL parameterized, nil-interface pitfall handled correctly, transactions use defer-rollback pattern, all interface contracts satisfied, store.Entry fields match.

### Issue 5 (from: reviewer)

No findings. All 3 prior issues resolved. Fresh review clean — no security, logic, error handling, or contract issues found.

### Issue 6 (from: qa)

Phase 1: All 3 prior issues remain RESOLVED. (1) AuditStore wired into all 4 handlers confirmed in routes.go:154,158,164,172. (2) 8 audit event tests confirmed in teams_test.go (4 tests), quality_gates_test.go (3 tests), invitations_test.go (invitation.accepted). Phase 2: Simplifier changes were purely cosmetic (removed double blank line in teams_test.go, two trailing blank lines in teams.go) — no logic touched. All 25 packages pass, 0 failures.

---

## Recent Step Notes

### From: docs_writer

No documentation updates required. All changes are internal audit logging instrumentation with no user-visible API, CLI, or configuration changes.

### From: qa

Phase 1: All 3 prior issues remain RESOLVED. (1) AuditStore wired into all 4 handlers confirmed in routes.go:154,158,164,172. (2) 8 audit event tests confirmed in teams_test.go (4 tests), quality_gates_test.go (3 tests), invitations_test.go (invitation.accepted). Phase 2: Simplifier changes were purely cosmetic (removed double blank line in teams_test.go, two trailing blank lines in teams.go) — no logic touched. All 25 packages pass, 0 failures.

### From: reviewer

No findings. All 3 prior issues resolved. Fresh review clean — no security, logic, error handling, or contract issues found.

### From: reviewer

Phase 1: All 3 prior issues verified RESOLVED. (1) AuditStore wired into all 4 handlers in routes.go. (2) 8 missing audit tests added (4 teams, 3 quality gates, 1 invitation.accepted). (3) Duplicate of 1+2. Tests pass (2.9s). Phase 2: Fresh adversarial review — no new findings. SQL parameterized, nil-interface pitfall handled correctly, transactions use defer-rollback pattern, all interface contracts satisfied, store.Entry fields match.

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
    ct droplet pass sc-jnr8j

**Recirculate (needs rework — send back upstream):**
    ct droplet recirculate sc-jnr8j
    ct droplet recirculate sc-jnr8j --to implement

**Block (genuinely blocked, cannot proceed):**
    ct droplet block sc-jnr8j

Add notes before signaling:
    ct droplet note sc-jnr8j "What you did / found"

The `ct` binary is on your PATH.
