/**
 * E2E tests for the Reports Compare feature.
 *
 * Covers:
 *  - API: compare endpoint returns new_failures, fixed, and duration_regressions
 *  - API: compare rejects identical base/head IDs with 400
 *  - Browser UI: navigate to /reports/compare, select reports, run compare, assert diff results
 *
 * Navigation to /reports/compare uses a pushState + popstate approach to preserve
 * Zustand auth state (a full page.goto() reload would clear the in-memory token).
 */

import { test, expect } from '@playwright/test';
import {
  loadCachedToken,
  tokenHeaders,
  loginViaUI,
  getOrCreateTeam,
  createAPIToken,
} from './helpers';

// ---------------------------------------------------------------------------
// CTRF report builders with contrasting test outcomes for meaningful diffs
// ---------------------------------------------------------------------------

function buildBaseReport(toolName: string): Record<string, unknown> {
  const now = Date.now();
  return {
    results: {
      tool: { name: toolName, version: '1.0.0' },
      summary: {
        tests: 3,
        passed: 2,
        failed: 1,
        skipped: 0,
        pending: 0,
        other: 0,
        start: now - 6000,
        stop: now,
      },
      tests: [
        { name: 'Compare Test A', status: 'passed', duration: 1000 },
        { name: 'Compare Test B', status: 'failed', duration: 500, message: 'Error in B' },
        { name: 'Compare Test C', status: 'passed', duration: 2000 },
      ],
      environment: { appName: 'ScaledTest-E2E', branchName: 'main' },
    },
  };
}

/** Head differs from base: A regresses, B is fixed, C has a duration regression. */
function buildHeadReport(toolName: string): Record<string, unknown> {
  const now = Date.now();
  return {
    results: {
      tool: { name: toolName, version: '1.0.0' },
      summary: {
        tests: 3,
        passed: 2,
        failed: 1,
        skipped: 0,
        pending: 0,
        other: 0,
        start: now - 4000,
        stop: now,
      },
      tests: [
        { name: 'Compare Test A', status: 'failed', duration: 1000, message: 'Now failing in head' },
        { name: 'Compare Test B', status: 'passed', duration: 500 },
        // 3000ms vs 2000ms base = +50% and +1000ms — both exceed thresholds for a regression
        { name: 'Compare Test C', status: 'passed', duration: 3000 },
      ],
      environment: { appName: 'ScaledTest-E2E', branchName: 'main' },
    },
  };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

test.describe('Reports Compare', () => {
  test('compare endpoint returns diff with new_failures, fixed, and duration_regressions', async ({
    request,
  }) => {
    const session = loadCachedToken();
    const teamId = await getOrCreateTeam(request, session);
    const apiToken = await createAPIToken(request, session, teamId);
    const headers = tokenHeaders(apiToken);
    const suffix = Date.now();

    // Submit base: A passes, B fails, C passes (2 s)
    const baseRes = await request.post('/api/v1/reports', {
      headers,
      data: buildBaseReport(`Compare-Base-${suffix}`),
    });
    expect(baseRes.ok(), `Base submit failed: ${baseRes.status()}`).toBeTruthy();
    const base = await baseRes.json();
    expect(base.id).toBeTruthy();

    // Submit head: A fails (regression), B passes (fixed), C passes (3 s — slower)
    const headRes = await request.post('/api/v1/reports', {
      headers,
      data: buildHeadReport(`Compare-Head-${suffix}`),
    });
    expect(headRes.ok(), `Head submit failed: ${headRes.status()}`).toBeTruthy();
    const head = await headRes.json();
    expect(head.id).toBeTruthy();

    // Compare
    const compareRes = await request.get(
      `/api/v1/reports/compare?base=${base.id}&head=${head.id}`,
      { headers },
    );
    expect(compareRes.ok(), `Compare failed: ${compareRes.status()}`).toBeTruthy();
    const data = await compareRes.json();

    // Top-level shape
    expect(data.base.id).toBe(base.id);
    expect(data.head.id).toBe(head.id);
    expect(data.diff).toBeDefined();

    const { diff } = data;
    expect(diff.new_failures).toBeDefined();
    expect(diff.fixed).toBeDefined();
    expect(diff.duration_regressions).toBeDefined();
    expect(diff.summary).toBeDefined();

    // Compare Test A: passed in base → failed in head  → new_failure
    expect(diff.summary.new_failures).toBeGreaterThan(0);
    const newFailure = diff.new_failures.find(
      (t: { name: string }) => t.name === 'Compare Test A',
    );
    expect(newFailure).toBeDefined();
    expect(newFailure.base_status).toBe('passed');
    expect(newFailure.head_status).toBe('failed');

    // Compare Test B: failed in base → passed in head  → fixed
    expect(diff.summary.fixed).toBeGreaterThan(0);
    const fixed = diff.fixed.find((t: { name: string }) => t.name === 'Compare Test B');
    expect(fixed).toBeDefined();
    expect(fixed.base_status).toBe('failed');
    expect(fixed.head_status).toBe('passed');

    // Compare Test C: 2000 ms → 3000 ms (+50%, +1000 ms) → duration_regression
    expect(diff.summary.duration_regressions).toBeGreaterThan(0);
    const regression = diff.duration_regressions.find(
      (t: { name: string }) => t.name === 'Compare Test C',
    );
    expect(regression).toBeDefined();
    expect(regression.duration_delta_ms).toBeGreaterThan(0);
  });

  test('compare returns 400 when base and head are the same report', async ({ request }) => {
    const session = loadCachedToken();
    const teamId = await getOrCreateTeam(request, session);
    const apiToken = await createAPIToken(request, session, teamId);
    const headers = tokenHeaders(apiToken);

    const submitRes = await request.post('/api/v1/reports', {
      headers,
      data: buildBaseReport(`Same-Report-${Date.now()}`),
    });
    expect(submitRes.ok()).toBeTruthy();
    const report = await submitRes.json();

    const compareRes = await request.get(
      `/api/v1/reports/compare?base=${report.id}&head=${report.id}`,
      { headers },
    );
    expect(compareRes.status()).toBe(400);
  });

  test('compare UI: page renders and produces diff results after selecting two reports', async ({
    page,
    request,
  }) => {
    const session = loadCachedToken();
    const teamId = await getOrCreateTeam(request, session);
    const apiToken = await createAPIToken(request, session, teamId);
    const headers = tokenHeaders(apiToken);
    const suffix = Date.now();

    // Seed reports before login so the JWT from loginViaUI embeds the team_id,
    // making the reports appear in the compare page's dropdown.
    const baseRes = await request.post('/api/v1/reports', {
      headers,
      data: buildBaseReport(`UI-Base-${suffix}`),
    });
    expect(baseRes.ok()).toBeTruthy();
    const baseReport = await baseRes.json();

    const headRes = await request.post('/api/v1/reports', {
      headers,
      data: buildHeadReport(`UI-Head-${suffix}`),
    });
    expect(headRes.ok()).toBeTruthy();
    const headReport = await headRes.json();

    await loginViaUI(page);

    // /reports/compare has no sidebar nav link; navigate via SPA pushState + popstate
    // to preserve the Zustand auth state (a full page.goto() reload would clear it).
    await page.evaluate(() => {
      window.history.pushState({}, '', '/reports/compare');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    await expect(page).toHaveURL('/reports/compare');

    // Page structure
    await expect(page.getByRole('heading', { name: 'Report Comparison' })).toBeVisible();
    await expect(page.getByText('Base Report (reference)')).toBeVisible();
    await expect(page.getByText('Head Report (new)')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Compare' })).toBeVisible();

    // Select base and head from the dropdowns (Playwright waits for the option to exist)
    await page.locator('select').first().selectOption(baseReport.id);
    await page.locator('select').nth(1).selectOption(headReport.id);

    // Run the comparison
    await page.getByRole('button', { name: 'Compare' }).click();

    // Diff summary cards confirm the result rendered
    await expect(page.getByText('Base Tests')).toBeVisible();
    await expect(page.getByText('Head Tests')).toBeVisible();
    await expect(page.getByText('New Failures')).toBeVisible();
    await expect(page.getByText('Fixed')).toBeVisible();
    await expect(page.getByText('Slower Tests')).toBeVisible();

    await page.screenshot({ path: 'screenshots/reports-compare.png' });
  });
});
