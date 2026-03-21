# Context

## Item: sc-x4my8

**Title:** E2E: cache JWT tokens in global-setup to eliminate per-test login calls
**Status:** in_progress
**Priority:** 2

### Description

Follow-up to sc-gnqys. The root cause of 429 errors is httprate.LimitByIP(10, 1*time.Minute) on all auth routes (internal/server/routes.go:184). All E2E tests run from 127.0.0.1, so 10 tests × login = rate limit hit.

Fix: extend e2e/global-setup.ts to perform ONE login per user role (readonly, maintainer, owner) after seeding users, then write the JWT tokens to e2e/.auth/tokens.json. Tests that need authenticated API calls import from this file instead of calling loginViaAPI(). The helpers.ts loginViaAPI() function should remain but tests should prefer the cached tokens.

This preserves full test isolation — each test still creates its own data/resources — but eliminates the N login calls from parallel tests. The application rate limiter does not need to change.

Implementation:
- global-setup.ts: after registering users, POST /api/v1/auth/login for each role, store {maintainer: token, readonly: token, owner: token} to .auth/tokens.json
- helpers.ts: add loadCachedToken(role) helper that reads from .auth/tokens.json
- Update tests that currently call loginViaAPI() to use loadCachedToken() instead
- .auth/ directory should be in .gitignore (tokens are ephemeral CI artifacts)

Note: sc-gnqys may have already added CI=true rate limit bypass — if so, evaluate whether this is still needed or if both approaches complement each other.

## Current Step: simplify

- **Type:** agent
- **Role:** simplifier
- **Context:** full_codebase

## Recent Step Notes

### From: manual

Implemented JWT token caching in E2E tests. global-setup.ts now logs in once per role after seeding and writes tokens to e2e/.auth/tokens.json. Added loadCachedToken(role) helper to helpers.ts. Updated all 6 test files (analytics, authorization, execution-lifecycle, quality-gates, report-submission, webhooks) to call loadCachedToken() instead of loginViaAPI(). loginViaAPI() kept for backward-compat. Added e2e/.auth/ to .gitignore.

<available_skills>
  <skill>
    <name>cistern-droplet-state</name>
    <description>Manage droplet state in the Cistern agentic pipeline using the `ct` CLI.</description>
    <location>.claude/skills/cistern-droplet-state/SKILL.md</location>
  </skill>
  <skill>
    <name>code-simplifier</name>
    <description>code-simplifier</description>
    <location>.claude/skills/code-simplifier/SKILL.md</location>
  </skill>
</available_skills>

## Signaling Completion

When your work is done, signal your outcome using the `ct` CLI:

**Pass (work complete, move to next step):**
    ct droplet pass sc-x4my8

**Recirculate (needs rework — send back upstream):**
    ct droplet recirculate sc-x4my8
    ct droplet recirculate sc-x4my8 --to implement

**Block (genuinely blocked, cannot proceed):**
    ct droplet block sc-x4my8

Add notes before signaling:
    ct droplet note sc-x4my8 "What you did / found"

The `ct` binary is on your PATH.
