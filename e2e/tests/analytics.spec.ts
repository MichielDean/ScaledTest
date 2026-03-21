import { test, expect } from '@playwright/test';
import {
  loadCachedToken,
  loginViaUI,
  tokenHeaders,
  buildCtrfReport,
  getOrCreateTeam,
  createAPIToken,
} from './helpers';

test.describe('Analytics', () => {
  test('analytics page renders', async ({ page }) => {
    // Verify the analytics page loads and renders its main sections
    await loginViaUI(page);
    await page.goto('/analytics');

    await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible({ timeout: 10000 });
  });

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
});
