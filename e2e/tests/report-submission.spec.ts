import { test, expect } from '@playwright/test';
import {
  loadCachedToken,
  loginViaUI,
  tokenHeaders,
  buildCtrfReport,
  getOrCreateTeam,
  createAPIToken,
} from './helpers';

test.describe('Report Submission', () => {
  test('submit CTRF report via API and verify it appears in the reports list', async ({
    page,
    request,
  }) => {
    const session = loadCachedToken();
    const teamId = await getOrCreateTeam(request, session);
    const apiToken = await createAPIToken(request, session, teamId);
    const headers = tokenHeaders(apiToken);

    // Submit a report with a unique tool name
    const uniqueTool = `E2E-Report-${Date.now()}`;
    const report = buildCtrfReport(uniqueTool);
    const submitRes = await request.post('/api/v1/reports', {
      headers,
      data: report,
    });
    expect(submitRes.ok(), `Report submit failed: ${submitRes.status()}`).toBeTruthy();

    const result = await submitRes.json();
    expect(result.id).toBeTruthy();
    expect(result.message).toBe('report accepted');

    // Login via UI and navigate to reports page
    await loginViaUI(page);
    await page.goto('/reports');

    // Verify the report appears with correct tool name and stats
    await expect(page.getByText(uniqueTool)).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('2 passed')).toBeVisible();
    await expect(page.getByText('1 failed')).toBeVisible();
  });

  test('report detail shows individual test results when expanded', async ({ page, request }) => {
    const session = loadCachedToken();
    const teamId = await getOrCreateTeam(request, session);
    const apiToken = await createAPIToken(request, session, teamId);
    const headers = tokenHeaders(apiToken);

    const uniqueTool = `E2E-Detail-${Date.now()}`;
    await request.post('/api/v1/reports', {
      headers,
      data: buildCtrfReport(uniqueTool),
    });

    await loginViaUI(page);
    await page.goto('/reports');

    // Expand the report by clicking on it
    await page.getByText(uniqueTool).click();

    // Individual test names should appear
    await expect(page.getByText('Test passes A')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Test fails C')).toBeVisible();
  });
});
