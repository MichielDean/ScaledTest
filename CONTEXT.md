# Context

## Item: sc-8q5yl

**Title:** Fix analytics browser E2E test: 'Analytics' heading not found
**Status:** in_progress
**Priority:** 2

### Description

The analytics browser E2E test fails in CI at line 78 of analytics.spec.ts:
    await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();

Error: element(s) not found — timeout 5000ms exceeded (3 retries, all failing).

The page isn't loading or the heading isn't rendering. Possible causes:
- Navigation to /analytics isn't completing before the assertion
- Auth state is lost during navigation (Zustand in-memory auth doesn't persist)
- The heading text doesn't match exactly ('Analytics' vs something else)
- The page requires data from global-setup that isn't seeded in time

Investigation needed:
- Check what the page looks like at time of failure (screenshot available at test-results/)
- Verify the nav link click actually navigates to /analytics
- Check if waitForURL or waitForLoadState is needed after navigation
- Confirm the heading text in the actual component

Acceptance criteria:
- analytics.spec.ts browser test passes consistently in CI
- The 'Analytics' heading is reliably visible before assertions proceed

## Current Step: docs

- **Type:** agent
- **Role:** docs_writer
- **Context:** full_codebase

## ⚠️ REVISION REQUIRED — Fix these issues before anything else

This droplet was recirculated. The following issues were found and **must** be fixed.
Do not proceed to implementation until you have read and understood each issue.

### Issue 1 (from: reviewer)

No findings. E2E test follows established browser-ui.spec.ts pattern exactly. Auth flow is correct (loadCachedToken + getOrCreateTeam + loginViaUI all default to maintainer user). All asserted headings are rendered unconditionally in analytics.tsx (not gated by loading/error states). waitForURL prevents timing issues. No security, logic, error handling, resource leak, or contract violation issues.

### Issue 2 (from: qa)

Phase 1: No prior issues were flagged by the previous reviewer — nothing to verify. Phase 2 fresh review: All tests pass (20 Go packages, 278 frontend). waitForURL('/analytics') is correct given baseURL in playwright.config.ts. All four section h2 headings in analytics.tsx are unconditionally rendered (not gated by loading/empty state). Nav link 'Analytics' confirmed in root-layout.tsx. Auth pattern (getOrCreateTeam + loginViaUI) matches established browser-ui.spec.ts pattern exactly. No gaps found.

### Issue 3 (from: security)

No security issues found. Diff adds a single Playwright E2E browser test with no production code changes. No new endpoints, input handling, auth logic, secrets, or trust boundary crossings. Zero attack surface.

---

## Recent Step Notes

### From: security

No security issues found. Diff adds a single Playwright E2E browser test with no production code changes. No new endpoints, input handling, auth logic, secrets, or trust boundary crossings. Zero attack surface.

### From: qa

Phase 1: No prior issues were flagged by the previous reviewer — nothing to verify. Phase 2 fresh review: All tests pass (20 Go packages, 278 frontend). waitForURL('/analytics') is correct given baseURL in playwright.config.ts. All four section h2 headings in analytics.tsx are unconditionally rendered (not gated by loading/empty state). Nav link 'Analytics' confirmed in root-layout.tsx. Auth pattern (getOrCreateTeam + loginViaUI) matches established browser-ui.spec.ts pattern exactly. No gaps found.

### From: reviewer

No findings. E2E test follows established browser-ui.spec.ts pattern exactly. Auth flow is correct (loadCachedToken + getOrCreateTeam + loginViaUI all default to maintainer user). All asserted headings are rendered unconditionally in analytics.tsx (not gated by loading/error states). waitForURL prevents timing issues. No security, logic, error handling, resource leak, or contract violation issues.

### From: simplifier

Simplified: removed 3 obvious-code comments from the new browser E2E test (heading visible, section headings label, user authenticated). Non-obvious why-comments kept. Tests: all 20 packages pass.

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
</available_skills>

## Signaling Completion

When your work is done, signal your outcome using the `ct` CLI:

**Pass (work complete, move to next step):**
    ct droplet pass sc-8q5yl

**Recirculate (needs rework — send back upstream):**
    ct droplet recirculate sc-8q5yl
    ct droplet recirculate sc-8q5yl --to implement

**Block (genuinely blocked, cannot proceed):**
    ct droplet block sc-8q5yl

Add notes before signaling:
    ct droplet note sc-8q5yl "What you did / found"

The `ct` binary is on your PATH.
