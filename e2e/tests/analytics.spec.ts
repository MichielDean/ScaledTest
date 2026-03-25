import { test, expect } from '@playwright/test';
import {
  loadCachedToken,
  tokenHeaders,
  buildCtrfReport,
  loginViaUI,
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
    expect(duration.distribution).toBeDefined();
  });

  test('analytics UI: page renders all four sections with chart content', async ({
    page,
    request,
  }) => {
    // Ensure a team exists so the JWT from loginViaUI embeds a team_id.
    // global-setup seeds reports across 3 distinct dates, so trends, error analysis,
    // and duration distribution should all have data (non-empty state).
    const session = loadCachedToken();
    await getOrCreateTeam(request, session);

    await loginViaUI(page);
    await page.getByRole('link', { name: 'Analytics' }).click();

    // Page heading
    await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible();

    // All four section headings
    await expect(page.getByRole('heading', { name: 'Pass Rate Trends' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Flaky Tests' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Duration Distribution' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Error Analysis' })).toBeVisible();

    // Trends chart renders with seeded data (not empty state) — global-setup seeds reports
    // on 3 distinct dates which produces >1 data point and renders the LineChart.
    await expect(page.getByText('No trend data available yet.')).not.toBeVisible();

    // Error analysis has data: seeded reports include failing tests with error messages.
    await expect(page.getByText('No errors recorded.')).not.toBeVisible();

    // Duration distribution has data from submitted test results.
    await expect(page.getByText('No duration data available.')).not.toBeVisible();

    // Authenticated navigation is present
    await expect(page.getByRole('button', { name: 'Sign Out' })).toBeVisible();

    await page.screenshot({ path: 'screenshots/analytics-ui.png' });
  });
});
