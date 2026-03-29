import { test, expect } from '@playwright/test';
import {
  loginViaUI,
  loadCachedToken,
  tokenHeaders,
  buildCtrfReport,
  getOrCreateTeam,
  createAPIToken,
} from './helpers';

test.describe('Analytics', () => {
  test('analytics trends API returns valid data after submissions', async ({ request }) => {
    const session = loadCachedToken();
    const teamId = await getOrCreateTeam(request, session);
    const apiToken = await createAPIToken(request, session, teamId);
    const headers = tokenHeaders(apiToken);

    // Submit several reports so analytics has data to display
    for (let i = 0; i < 3; i++) {
      const res = await request.post('/api/v1/reports', {
        headers,
        data: buildCtrfReport(`Analytics-Tool-${i}-${Date.now()}`),
      });
      expect(res.ok()).toBeTruthy();
    }

    // Query trends API
    const trendsRes = await request.get('/api/v1/analytics/trends', {
      headers,
    });
    expect(trendsRes.ok()).toBeTruthy();
    const trends = await trendsRes.json();
    expect(trends.trends).toBeDefined();
    // global-setup seeds reports across 3 distinct dates so the trend chart
    // must have more than one data point (not a single collapsed bucket).
    expect(trends.trends.length).toBeGreaterThan(1);

    // Query flaky tests API
    const flakyRes = await request.get('/api/v1/analytics/flaky-tests', {
      headers,
    });
    expect(flakyRes.ok()).toBeTruthy();
    const flaky = await flakyRes.json();
    expect(flaky.flaky_tests).toBeDefined();

    // Query error analysis API
    const errorsRes = await request.get('/api/v1/analytics/error-analysis', {
      headers,
    });
    expect(errorsRes.ok()).toBeTruthy();
    const errors = await errorsRes.json();
    expect(errors.errors).toBeDefined();

    // Query duration distribution API
    const durationRes = await request.get('/api/v1/analytics/duration-distribution', {
      headers,
    });
    expect(durationRes.ok()).toBeTruthy();
    const duration = await durationRes.json();
    expect(Array.isArray(duration.distribution)).toBeTruthy();
  });

  test('analytics browser: navigate to /analytics via nav link and assert page renders', async ({
    page,
    request,
  }) => {
    // Ensure the user has a team so the JWT from loginViaUI embeds a team_id.
    const session = loadCachedToken();
    await getOrCreateTeam(request, session);

    // Login via UI form — auth token is stored in Zustand memory.
    await loginViaUI(page);

    // Wait for the dashboard's API queries to complete before navigating away.
    // This ensures the Zustand auth state is stable — if any dashboard query
    // returned 401 and triggered a token refresh, that round-trip has finished
    // before we start the next SPA navigation.
    await page.waitForLoadState('networkidle');

    // Navigate via SPA link click (not page.goto) to preserve auth state
    // in Zustand memory — a full page reload would lose the access token.
    await page.getByRole('link', { name: 'Analytics' }).click();
    await page.waitForURL('**/analytics');

    await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Pass Rate Trends' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Flaky Tests' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Duration Distribution' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Error Analysis' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible();

    await page.screenshot({ path: 'screenshots/browser-ui-analytics.png' });
  });
});
