import { test, expect } from '@playwright/test';
import { loginViaAPI, loginViaUI, authHeaders, buildCtrfReport } from './helpers';

test.describe('Analytics', () => {
  test('analytics page shows data sections after report submissions', async ({ page, request }) => {
    const session = await loginViaAPI(request);

    // Submit several reports so analytics has data to display
    for (let i = 0; i < 3; i++) {
      const res = await request.post('/api/v1/reports', {
        headers: authHeaders(session),
        data: buildCtrfReport(`Analytics-Tool-${i}-${Date.now()}`),
      });
      expect(res.ok()).toBeTruthy();
    }

    // Login via UI and navigate to analytics
    await loginViaUI(page);
    await page.goto('/analytics');

    // Verify the analytics page renders with all sections
    await expect(page.getByRole('heading', { name: 'Analytics' })).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Pass Rate Trends')).toBeVisible();
    await expect(page.getByText('Flaky Tests')).toBeVisible();
    await expect(page.getByText('Duration Distribution')).toBeVisible();
    await expect(page.getByText('Error Analysis')).toBeVisible();
  });

  test('analytics trends API returns valid data after submissions', async ({ request }) => {
    const session = await loginViaAPI(request);

    // Submit a report
    const submitRes = await request.post('/api/v1/reports', {
      headers: authHeaders(session),
      data: buildCtrfReport(`Trends-Tool-${Date.now()}`),
    });
    expect(submitRes.ok()).toBeTruthy();

    // Query trends API
    const trendsRes = await request.get('/api/v1/analytics/trends', {
      headers: authHeaders(session),
    });
    expect(trendsRes.ok()).toBeTruthy();
    const trends = await trendsRes.json();
    expect(trends.trends).toBeDefined();

    // Query flaky tests API
    const flakyRes = await request.get('/api/v1/analytics/flaky-tests', {
      headers: authHeaders(session),
    });
    expect(flakyRes.ok()).toBeTruthy();
    const flaky = await flakyRes.json();
    expect(flaky.flaky_tests).toBeDefined();

    // Query error analysis API
    const errorsRes = await request.get('/api/v1/analytics/error-analysis', {
      headers: authHeaders(session),
    });
    expect(errorsRes.ok()).toBeTruthy();
    const errors = await errorsRes.json();
    expect(errors.errors).toBeDefined();

    // Query duration distribution API
    const durationRes = await request.get('/api/v1/analytics/duration-distribution', {
      headers: authHeaders(session),
    });
    expect(durationRes.ok()).toBeTruthy();
    const duration = await durationRes.json();
    expect(duration.distribution).toBeDefined();
  });
});
