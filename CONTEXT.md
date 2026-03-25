# Context

## Item: sc-1ueqa

**Title:** Add self-hosting deployment guide (getting started from zero to running instance)
**Status:** in_progress
**Priority:** 2

### Description

There is no top-level guide for going from zero to a running ScaledTest instance. Docker Compose exists and works, K8s kustomize has a README, but there is no 'getting started' narrative that covers: (1) choosing a deployment method (docker-compose for local/small, k8s for production); (2) required environment variables with descriptions; (3) first-run steps (register first user, create team, generate API token); (4) verifying the instance works; (5) pointing a CI pipeline at it. Add docs/deployment/getting-started.md covering all of the above. Link it from README.md Quick Start section.

## Current Step: implement

- **Type:** agent
- **Role:** implementer
- **Context:** full_codebase

## ⚠️ REVISION REQUIRED — Fix these issues before anything else

This droplet was recirculated. The following issues were found and **must** be fixed.
Do not proceed to implementation until you have read and understood each issue.

### Issue 1 (from: reviewer)

Finding: docs/deployment/getting-started.md:168-171,176-179 — Incorrect auth endpoint paths. The guide uses /api/v1/auth/register and /api/v1/auth/login, but the actual routes are /auth/register and /auth/login (see internal/server/routes.go:195-198). Auth routes are mounted directly on the root router, NOT under the /api/v1 prefix. Users following this guide will get 404 errors on both registration and login. Fix: change all curl examples to use http://localhost:3000/auth/register and http://localhost:3000/auth/login.

### Issue 2 (from: reviewer)

Finding: docs/deployment/getting-started.md:163-164 — Incorrect claim that first registered user becomes owner. The users table default role is 'maintainer' (see internal/db/migrations/000002_create_users.up.sql:6), and the Register handler has no first-user special logic (internal/handler/auth.go:250-256). The first user will be a maintainer, not an owner. This means they will lack access to admin endpoints like /api/v1/admin/users and /api/v1/admin/audit-log which require the owner role (internal/server/routes.go:287). Fix: either (a) correct the documentation to say the first user is a maintainer, or (b) add first-user-becomes-owner logic to the Register handler, or (c) document how to promote a user to owner via SQL.

### Issue 3 (from: reviewer)

♻ 2 findings. (1) docs/deployment/getting-started.md:168-179 — Auth endpoint paths are wrong: guide uses /api/v1/auth/register and /api/v1/auth/login but actual routes are /auth/register and /auth/login. Users will get 404s. (2) docs/deployment/getting-started.md:163-164 — Claims first registered user becomes owner, but the DB default role is 'maintainer' and there is no first-user promotion logic. First user will lack admin access.

### Issue 4 (from: reviewer)

Phase 1: All 3 prior issues RESOLVED. (1) Auth endpoints fixed to /auth/register and /auth/login. (2) First-user-becomes-owner logic added via CASE expression in INSERT. (3) Duplicate of 1+2.

### Issue 5 (from: reviewer)

Finding: internal/handler/auth.go:252 — Race condition in first-user-becomes-owner logic. The comment claims 'The CASE expression is evaluated atomically within the INSERT so there is no race condition' but this is incorrect. Under PostgreSQL READ COMMITTED isolation (the default), two concurrent INSERT statements can both evaluate NOT EXISTS (SELECT 1 FROM users) as true before either commits, resulting in multiple owners. Two different users registering simultaneously on a fresh instance will both get the owner role. Fix: serialize with pg_advisory_xact_lock(hashtext('first_user_registration')) before the INSERT, or enforce a single owner via a unique partial index (CREATE UNIQUE INDEX ON users ((true)) WHERE role = 'owner'), or at minimum correct the comment to acknowledge the race window.

### Issue 6 (from: reviewer)

♻ 1 finding. internal/handler/auth.go:252 — Race condition in first-user-becomes-owner logic: comment claims atomicity prevents races but PostgreSQL READ COMMITTED allows two concurrent INSERTs to both see an empty users table, creating two owners. Fix with pg_advisory_xact_lock or a unique partial index.

### Issue 7 (from: reviewer)

Phase 1: All 6 prior issues verified as RESOLVED. Auth endpoints use /auth/register and /auth/login. First-user-becomes-owner logic implemented. Advisory lock added to SQL.

### Issue 8 (from: reviewer)

Finding: internal/handler/auth.go:258-264 — MATERIALIZED CTE advisory lock does not prevent the first-user race condition. In READ COMMITTED, the entire statement (CTE + INSERT...SELECT) shares a single snapshot taken at statement start. Two concurrent statements can both snapshot an empty users table before either acquires the lock. When the blocked statement unblocks, it continues with its stale snapshot — NOT EXISTS still evaluates true — and both INSERTs assign role='owner'. The advisory lock serialises execution but does not cause a new snapshot. The authDB interface lacks transaction support, so the lock and INSERT cannot be split into separate statements (which would give the INSERT a fresh snapshot). Fix: add a unique partial index in the migration — CREATE UNIQUE INDEX idx_users_single_owner ON users ((true)) WHERE role = 'owner' — to enforce at most one owner at the database level. Then catch the 23505 unique violation in the handler and either retry (the INSERT will now see the committed row and assign maintainer) or return a user-friendly error.

### Issue 9 (from: reviewer)

♻ 1 finding. internal/handler/auth.go:258-264 — MATERIALIZED CTE advisory lock does not prevent the first-user race condition. In PostgreSQL READ COMMITTED, the entire statement shares a single snapshot taken at statement start. Two concurrent registrations can both snapshot an empty users table before either acquires the lock; when the blocked one unblocks, NOT EXISTS still sees the stale snapshot and both get role=owner. Fix: add a unique partial index (CREATE UNIQUE INDEX idx_users_single_owner ON users ((true)) WHERE role = 'owner') and handle the 23505 constraint violation in the handler.

---

## Recent Step Notes

### From: reviewer

♻ 1 finding. internal/handler/auth.go:258-264 — MATERIALIZED CTE advisory lock does not prevent the first-user race condition. In PostgreSQL READ COMMITTED, the entire statement shares a single snapshot taken at statement start. Two concurrent registrations can both snapshot an empty users table before either acquires the lock; when the blocked one unblocks, NOT EXISTS still sees the stale snapshot and both get role=owner. Fix: add a unique partial index (CREATE UNIQUE INDEX idx_users_single_owner ON users ((true)) WHERE role = 'owner') and handle the 23505 constraint violation in the handler.

### From: reviewer

Finding: internal/handler/auth.go:258-264 — MATERIALIZED CTE advisory lock does not prevent the first-user race condition. In READ COMMITTED, the entire statement (CTE + INSERT...SELECT) shares a single snapshot taken at statement start. Two concurrent statements can both snapshot an empty users table before either acquires the lock. When the blocked statement unblocks, it continues with its stale snapshot — NOT EXISTS still evaluates true — and both INSERTs assign role='owner'. The advisory lock serialises execution but does not cause a new snapshot. The authDB interface lacks transaction support, so the lock and INSERT cannot be split into separate statements (which would give the INSERT a fresh snapshot). Fix: add a unique partial index in the migration — CREATE UNIQUE INDEX idx_users_single_owner ON users ((true)) WHERE role = 'owner' — to enforce at most one owner at the database level. Then catch the 23505 unique violation in the handler and either retry (the INSERT will now see the committed row and assign maintainer) or return a user-friendly error.

### From: reviewer

Phase 1: All 6 prior issues verified as RESOLVED. Auth endpoints use /auth/register and /auth/login. First-user-becomes-owner logic implemented. Advisory lock added to SQL.

### From: simplifier

Simplified internal/handler/auth_test.go: merged TestRegister_WhenFirstUser_IsAssignedOwnerRole and TestRegister_WhenNotFirstUser_IsAssignedMaintainerRole into a single table-driven TestRegister_RoleAssignment (49 lines saved, identical structure parameterised by dbRole/wantRole). Removed misleading comment in TestRegister_INSERT_UsesAdvisoryLock claiming issueTokens makes QueryRow calls (it only uses Exec). No behaviour change. Tests: all 25 packages pass.

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
    ct droplet pass sc-1ueqa

**Recirculate (needs rework — send back upstream):**
    ct droplet recirculate sc-1ueqa
    ct droplet recirculate sc-1ueqa --to implement

**Block (genuinely blocked, cannot proceed):**
    ct droplet block sc-1ueqa

Add notes before signaling:
    ct droplet note sc-1ueqa "What you did / found"

The `ct` binary is on your PATH.
