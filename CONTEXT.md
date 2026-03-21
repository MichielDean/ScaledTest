# Context

## Item: sc-e0s8r

**Title:** E2E: browser UI tests for core platform flows (dashboard, quality gates, webhooks, test results)
**Status:** in_progress
**Priority:** 2

### Description

All meaningful E2E tests (analytics, authorization, execution-lifecycle, quality-gates, report-submission, webhooks) are pure API tests using fetch() — they never open a browser, never navigate to a page, and produce zero screenshots. This gives no visual proof the frontend works.

Add browser-based Playwright tests that:
1. Log in via the UI (page.goto + fill email/password + click Sign In)
2. Navigate to each core page and assert key elements are visible
3. Perform real interactions — not just API assertions

Priority flows to cover with browser tests:

**Dashboard** (frontend/src/routes/dashboard.tsx)
- Log in, land on dashboard, assert it loads with expected structure
- Screenshot: dashboard with any content showing

**Test Results** (frontend/src/routes/test-results.tsx)
- Submit a report via API, then navigate to /test-results in browser
- Assert the report appears in the list with pass/fail counts
- Screenshot: test results list with real data

**Quality Gates** (frontend/src/routes/quality-gates.tsx)
- Navigate to /quality-gates, assert the page loads
- If quality gates exist, assert they're listed
- Screenshot: quality gates page

**Webhooks** (frontend/src/routes/webhooks.tsx)
- Navigate to /webhooks, assert the page loads
- Screenshot: webhooks page

**Admin** (frontend/src/routes/admin.tsx)
- Log in as owner, navigate to /admin
- Screenshot: admin page

Use the loginViaUI helper pattern (page.goto('/login'), fill, click) or the globalSetup-cached token injected into browser storage. Each test should produce at least one screenshot showing real authenticated UI — not just the login form.

The goal: screenshots that prove the platform frontend is functional, not just the auth pages.

## Current Step: simplify

- **Type:** agent
- **Role:** simplifier
- **Context:** full_codebase

## Recent Step Notes

### From: manual

Implemented browser UI E2E tests for all 5 core platform flows (dashboard, test-results, quality-gates, webhooks, admin). Committed sha 7349115. Tests: all 23 Go packages pass. Verified: e2e/tests/browser-ui.spec.ts created (170 lines), internal/handler/auth.go modified (team_id lookup in Login), internal/handler/auth_test.go has TestLoginEmbedsPrimaryTeamInJWT and TestLoginNoTeamHasEmptyTeamIDInJWT.

### From: manual

Simplified: (1) auth.go team_id lookup — removed dead no-op error branch, replaced with _ = to clearly express best-effort intent; (2) browser-ui.spec.ts — removed unused authHeaders import; (3) browser-ui.spec.ts — replaced point-in-time isVisible() with auto-retrying toBeVisible() for consistency with rest of file. Tests: all 23 Go packages pass.

### From: manual

Phase 2 — three issues found. (1) e2e/tests/browser-ui.spec.ts — all 5 tests are missing page.screenshot() calls. The task spec explicitly requires each test to produce at least one screenshot showing real authenticated UI (stated four times in the spec, once per page). Playwright only auto-captures on failure; success-case screenshots must be explicit. (2) e2e/tests/browser-ui.spec.ts:262-280 — admin test calls loadCachedToken() without a role, defaults to maintainer, and accepts Access Denied as a valid response via regex /^(Admin|Access Denied)$/. The spec says 'Log in as owner, navigate to /admin.' The test never verifies the admin page renders for an owner. (3) internal/handler/auth_test.go:440 — unchecked type assertion resp["access_token"].(string) panics instead of failing cleanly. The sibling test TestLoginEmbedsPrimaryTeamInJWT correctly uses the ok-idiom (lines 370-373); TestLoginNoTeamHasEmptyTeamIDInJWT does not.

### From: manual

Fixed all 3 revision issues. Committed 9ee0870. Tests: all 23 Go packages pass.

(1) auth_test.go:617 — replaced resp["access_token"].(string) bare assertion with ok-idiom (accessToken, ok := ...; if !ok || accessToken == "").

(2) browser-ui.spec.ts — added page.screenshot() to all 5 tests (dashboard, test-results, quality-gates, webhooks, admin), saving to screenshots/browser-ui-*.png.

(3) admin test — now logs in as owner via loginViaUI(page, OWNER) and asserts the 'Admin' heading + Users/Teams/Audit Log sections are visible. No longer accepts 'Access Denied' as valid.

(4) global-setup.ts — seeds owner@example.com via invitation flow (maintainer creates team → creates invitation with role='owner' → accepts invitation). Idempotent: skips seeding if owner can already log in. CachedTokens now includes 'owner'.

(5) helpers.ts — added OWNER constant; loginViaUI now accepts optional credentials parameter (defaults to MAINTAINER).

<available_skills>
  <skill>
    <name>cistern-droplet-state</name>
    <description>Manage droplet state in the Cistern agentic pipeline using the `ct` CLI.</description>
    <location>/home/lobsterdog/.cistern/skills/cistern-droplet-state/SKILL.md</location>
  </skill>
  <skill>
    <name>code-simplifier</name>
    <description>code-simplifier</description>
    <location>/home/lobsterdog/.cistern/skills/code-simplifier/SKILL.md</location>
  </skill>
</available_skills>

## Signaling Completion

When your work is done, signal your outcome using the `ct` CLI:

**Pass (work complete, move to next step):**
    ct droplet pass sc-e0s8r

**Recirculate (needs rework — send back upstream):**
    ct droplet recirculate sc-e0s8r
    ct droplet recirculate sc-e0s8r --to implement

**Block (genuinely blocked, cannot proceed):**
    ct droplet block sc-e0s8r

Add notes before signaling:
    ct droplet note sc-e0s8r "What you did / found"

The `ct` binary is on your PATH.
