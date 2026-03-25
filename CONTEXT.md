# Context

## Item: sc-a0jg1

**Title:** E2E tests: add coverage for reports-compare, sharding, and analytics UI
**Status:** in_progress
**Priority:** 2

### Description

Three major frontend surfaces have no E2E test coverage: (1) Reports Compare — no test for the compare endpoint or the diff UI (new failures, fixed, duration regressions); (2) Sharding — no test for shard plan generation, rebalance, or duration tracking; (3) Analytics UI — only the API endpoint is hit, not the chart rendering or error analysis/duration distribution views. Add Playwright E2E tests for each. Tests should exercise both the API layer and the browser UI (navigate to route, assert key elements render with real data). Seed the required data in each test or use global-setup patterns already established.

## Current Step: delivery

- **Type:** agent
- **Role:** delivery

## ⚠️ REVISION REQUIRED — Fix these issues before anything else

This droplet was recirculated. The following issues were found and **must** be fixed.
Do not proceed to implementation until you have read and understood each issue.

### Issue 1 (from: reviewer)

Finding 1: reports-compare.spec.ts:211-212 — Brittle positional select locators. The test uses page.locator('select').first() and .nth(1) to target the Base and Head report dropdowns. These positional selectors will silently target the wrong element if any other <select> is added to the page above these two (e.g., a team/project picker in the header). The component labels lack htmlFor and the selects lack id attributes, but the test can still use DOM-relative navigation: page.getByText('Base Report (reference)').locator('..').locator('select'). Fix: use label-relative or scoped locators instead of positional indices.

### Issue 2 (from: reviewer)

Finding 2: sharding.spec.ts:113-117 — Rebalance test does not verify test preservation. The test asserts the failed worker is absent from the rebalanced plan but never checks that the failed worker's tests were actually redistributed to surviving workers. A rebalance bug that silently drops tests would go undetected. Fix: after asserting the failed worker is absent, flatMap all remaining shards' test_names and assert the full set of 6 original TEST_NAMES are still present (same pattern used in the create-plan test at lines 56-60).

### Issue 3 (from: reviewer)

Finding 3: analytics.spec.ts:91-96 — Negative assertions do not confirm chart content actually rendered. The test asserts empty-state strings ('No trend data available yet.', 'No errors recorded.', 'No duration data available.') are NOT visible, but never asserts any chart content IS visible. The section headings (Pass Rate Trends, etc.) render regardless of data state, so a broken chart library or empty data transform would still pass this test. Fix: add at least one positive assertion per section — e.g., expect an SVG element or a Recharts container (data-testid or role) within each section, or assert a specific data label from the seeded reports is rendered.

### Issue 4 (from: reviewer)

♻ 3 findings. (1) reports-compare.spec.ts:211-212 — brittle positional select locators (.first()/.nth(1)) will target wrong elements if any other select is added to the page; use label-relative locators instead. (2) sharding.spec.ts:113-117 — rebalance test verifies failed worker is absent but never asserts all 6 original tests are preserved in the rebalanced plan; a bug that drops tests during redistribution would go undetected. (3) analytics.spec.ts:91-96 — negative assertions (empty-state text NOT visible) do not confirm chart content actually rendered; add positive assertions for chart elements within each section.

### Issue 5 (from: reviewer)

Phase 1 — all 3 prior issues RESOLVED: (1) reports-compare.spec.ts now uses label-relative locators, no positional .first()/.nth(1); (2) sharding.spec.ts rebalance test flatMaps and asserts all 6 TEST_NAMES preserved; (3) analytics.spec.ts has positive SVG/tbody assertions for Pass Rate Trends, Error Analysis, and Duration Distribution.

### Issue 6 (from: reviewer)

Finding: analytics.spec.ts:84 — Flaky Tests section has no content assertion. The test title claims 'all four sections with chart content' but only three sections (Pass Rate Trends, Error Analysis, Duration Distribution) have positive content assertions. The Flaky Tests section only has its heading checked. The component (frontend/src/routes/analytics.tsx:120-151) renders either 'No flaky tests detected.' or a list of flaky test items — neither state is asserted. If the content rendering breaks while the heading still renders, the test passes incorrectly. This is the same gap the prior reviewer flagged for the other three sections (Issue 3), now applied to the fourth section that was missed in the fix. Fix: add a positive assertion using Playwright's .or() combinator: flakySection.getByText('No flaky tests detected.').or(flakySection.locator('.space-y-3 > div').first()) to cover both possible states.

### Issue 7 (from: reviewer)

♻ 1 finding. analytics.spec.ts:84 — Flaky Tests section has no content assertion despite the test claiming to verify 'all four sections with chart content'. Three sections have positive content assertions (SVG/tbody); the fourth (Flaky Tests) only has a heading check. Fix: add a positive assertion covering either the empty state text or data items within the section.

### Issue 8 (from: reviewer)

Phase 1: all prior issues RESOLVED — (1) label-relative locators confirmed in reports-compare.spec.ts:217-218, (2) test preservation assertion confirmed in sharding.spec.ts:121-127, (3) positive content assertions confirmed in analytics.spec.ts:98-122 including Flaky Tests .or() combinator at lines 120-122. Phase 2: fresh adversarial review of full diff — no new findings. Security, logic, error handling, API contracts, resource management, and codebase pattern consistency all clean.

### Issue 9 (from: qa)

Phase 1 — all prior issues RESOLVED: (1) reports-compare.spec.ts:217-218 uses label-relative locators, no positional .first()/.nth() selectors anywhere in the file; verified against component DOM: label and select are siblings in div.space-y-1 so the locator(..).locator(select) chain is correct. (2) sharding.spec.ts:121-127 flatMaps redistributed tests and asserts all 6 TEST_NAMES present after rebalance. (3) analytics.spec.ts:102-122 has positive SVG assertions for Pass Rate Trends and Duration Distribution, tbody assertion for Error Analysis, and .or() combinator for Flaky Tests at line 121. Phase 2 — diff is the 8-line Flaky Tests block only. DOM structure verified: analytics.tsx renders div.space-y-3 with div children for data items, or EmptyState for empty state. Section scoping via getByRole('heading', { name: 'Flaky Tests' }) is correct (h2 has implicit heading role). No new issues found.

---

## Recent Step Notes

### From: docs_writer

No documentation updates required. Changes are internal E2E test additions (analytics.spec.ts, reports-compare.spec.ts, sharding.spec.ts) with no user-visible features, CLI changes, or architecture modifications.

### From: qa

Phase 1 — all prior issues RESOLVED: (1) reports-compare.spec.ts:217-218 uses label-relative locators, no positional .first()/.nth() selectors anywhere in the file; verified against component DOM: label and select are siblings in div.space-y-1 so the locator(..).locator(select) chain is correct. (2) sharding.spec.ts:121-127 flatMaps redistributed tests and asserts all 6 TEST_NAMES present after rebalance. (3) analytics.spec.ts:102-122 has positive SVG assertions for Pass Rate Trends and Duration Distribution, tbody assertion for Error Analysis, and .or() combinator for Flaky Tests at line 121. Phase 2 — diff is the 8-line Flaky Tests block only. DOM structure verified: analytics.tsx renders div.space-y-3 with div children for data items, or EmptyState for empty state. Section scoping via getByRole('heading', { name: 'Flaky Tests' }) is correct (h2 has implicit heading role). No new issues found.

### From: reviewer

Phase 1: all prior issues RESOLVED — (1) label-relative locators confirmed in reports-compare.spec.ts:217-218, (2) test preservation assertion confirmed in sharding.spec.ts:121-127, (3) positive content assertions confirmed in analytics.spec.ts:98-122 including Flaky Tests .or() combinator at lines 120-122. Phase 2: fresh adversarial review of full diff — no new findings. Security, logic, error handling, API contracts, resource management, and codebase pattern consistency all clean.

### From: simplifier

No simplifications required — code is already clear and idiomatic. All three spec files (analytics, sharding, reports-compare) use well-named variables, meaningful comments that explain non-obvious intent, and idiomatic Playwright patterns. The prior simplifier pass (4ed0df7) already removed redundant as-casts.

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
    ct droplet pass sc-a0jg1

**Recirculate (needs rework — send back upstream):**
    ct droplet recirculate sc-a0jg1
    ct droplet recirculate sc-a0jg1 --to implement

**Block (genuinely blocked, cannot proceed):**
    ct droplet block sc-a0jg1

Add notes before signaling:
    ct droplet note sc-a0jg1 "What you did / found"

The `ct` binary is on your PATH.
