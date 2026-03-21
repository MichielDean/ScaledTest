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

## Current Step: implement

- **Type:** agent
- **Role:** implementer
- **Context:** full_codebase

<available_skills>
  <skill>
    <name>cistern-droplet-state</name>
    <description>Manage droplet state in the Cistern agentic pipeline using the `ct` CLI.</description>
    <location>/home/lobsterdog/.cistern/skills/cistern-droplet-state/SKILL.md</location>
  </skill>
  <skill>
    <name>github-workflow</name>
    <description>---</description>
    <location>/home/lobsterdog/.cistern/skills/github-workflow/SKILL.md</location>
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
