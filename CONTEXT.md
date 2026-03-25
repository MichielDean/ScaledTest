# Context

## Item: sc-jnr8j

**Title:** Audit log: emit events from teams, quality gates, webhooks, invitations
**Status:** in_progress
**Priority:** 2

### Description

The audit log currently only captures report and execution events. Team create/delete, quality gate create/update/delete, webhook create/update/delete, and invitation create/revoke/accept all emit zero audit events. Add AuditStore.Log calls to teams.go, quality_gates.go, webhooks.go, and invitations.go for all mutating operations. Each entry needs actor_id, actor_email, team_id, action (e.g. 'team.delete'), resource_type, and resource_id.

## Current Step: implement

- **Type:** agent
- **Role:** implementer
- **Context:** full_codebase

## ⚠️ REVISION REQUIRED — Fix these issues before anything else

This droplet was recirculated. The following issues were found and **must** be fixed.
Do not proceed to implementation until you have read and understood each issue.

### Issue 1 (from: reviewer)

Finding 1 (CRITICAL): internal/server/routes.go:154-173 — AuditStore never wired into TeamsHandler, QualityGatesHandler, WebhooksHandler, or InvitationsHandler. All four handlers are constructed without setting the AuditStore field. Because logAudit() silently no-ops on nil, every audit event added by this diff is dead code in production. Fix: pass auditStore to each handler at construction, e.g. teamsH := &handler.TeamsHandler{DB: dbPool, AuditStore: auditStore}

### Issue 2 (from: reviewer)

Finding 2: Missing test coverage — teams.go adds 4 audit events (team.created, team.deleted, token.created, token.deleted) with zero tests. quality_gates.go adds 3 audit events (quality_gate.created, quality_gate.updated, quality_gate.deleted) with zero tests. invitation.accepted has no test either. Only webhooks (3 tests) and invitation create/revoke (3 tests) have coverage. Fix: add audit assertion tests for teams, quality gates, and invitation.accepted, following the same capAuditLogger pattern already used in webhooks_test.go and invitations_test.go.

### Issue 3 (from: reviewer)

♻ 2 findings. (1) CRITICAL: internal/server/routes.go:154-173 — AuditStore is never wired into TeamsHandler, QualityGatesHandler, WebhooksHandler, or InvitationsHandler at construction time. Since logAudit() silently no-ops on nil, every audit event in this diff is dead code in production. (2) Missing test coverage — 8 of 13 audit events have no tests: all 4 teams events, all 3 quality gate events, and invitation.accepted.

---

## Recent Step Notes

### From: reviewer

♻ 2 findings. (1) CRITICAL: internal/server/routes.go:154-173 — AuditStore is never wired into TeamsHandler, QualityGatesHandler, WebhooksHandler, or InvitationsHandler at construction time. Since logAudit() silently no-ops on nil, every audit event in this diff is dead code in production. (2) Missing test coverage — 8 of 13 audit events have no tests: all 4 teams events, all 3 quality gate events, and invitation.accepted.

### From: reviewer

Finding 2: Missing test coverage — teams.go adds 4 audit events (team.created, team.deleted, token.created, token.deleted) with zero tests. quality_gates.go adds 3 audit events (quality_gate.created, quality_gate.updated, quality_gate.deleted) with zero tests. invitation.accepted has no test either. Only webhooks (3 tests) and invitation create/revoke (3 tests) have coverage. Fix: add audit assertion tests for teams, quality gates, and invitation.accepted, following the same capAuditLogger pattern already used in webhooks_test.go and invitations_test.go.

### From: reviewer

Finding 1 (CRITICAL): internal/server/routes.go:154-173 — AuditStore never wired into TeamsHandler, QualityGatesHandler, WebhooksHandler, or InvitationsHandler. All four handlers are constructed without setting the AuditStore field. Because logAudit() silently no-ops on nil, every audit event added by this diff is dead code in production. Fix: pass auditStore to each handler at construction, e.g. teamsH := &handler.TeamsHandler{DB: dbPool, AuditStore: auditStore}

### From: simplifier

Simplified: extracted logAudit(ctx, al, entry) helper into audit.go, replacing 13 identical nil-guard blocks (if h.AuditStore != nil { h.AuditStore.Log(...) }) across teams.go, quality_gates.go, webhooks.go, and invitations.go. Tests: all handler tests pass (1 package, 2.7s).

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
    ct droplet pass sc-jnr8j

**Recirculate (needs rework — send back upstream):**
    ct droplet recirculate sc-jnr8j
    ct droplet recirculate sc-jnr8j --to implement

**Block (genuinely blocked, cannot proceed):**
    ct droplet block sc-jnr8j

Add notes before signaling:
    ct droplet note sc-jnr8j "What you did / found"

The `ct` binary is on your PATH.
