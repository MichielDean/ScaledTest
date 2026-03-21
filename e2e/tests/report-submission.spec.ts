import { test, expect } from '@playwright/test';
import {
  loadCachedToken,
  tokenHeaders,
  buildCtrfReport,
  getOrCreateTeam,
  createAPIToken,
} from './helpers';

test.describe('Report Submission', () => {
  test('submit CTRF report via API and verify it appears in the reports list', async ({
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

    // Verify report appears in the API reports list (team-scoped via API token)
    const listRes = await request.get('/api/v1/reports', { headers });
    expect(listRes.ok(), `List reports failed: ${listRes.status()}`).toBeTruthy();
    const listData = await listRes.json();
    const found = listData.reports?.some(
      (r: { tool_name: string }) => r.tool_name === uniqueTool
    );
    expect(found, `Report '${uniqueTool}' not found in reports list`).toBeTruthy();
  });

  test('report detail shows summary via API', async ({ request }) => {
    const session = loadCachedToken();
    const teamId = await getOrCreateTeam(request, session);
    const apiToken = await createAPIToken(request, session, teamId);
    const headers = tokenHeaders(apiToken);

    const uniqueTool = `E2E-Detail-${Date.now()}`;
    const submitRes = await request.post('/api/v1/reports', {
      headers,
      data: buildCtrfReport(uniqueTool),
    });
    expect(submitRes.ok()).toBeTruthy();
    const submitResult = await submitRes.json();

    // Fetch the report detail
    const detailRes = await request.get(`/api/v1/reports/${submitResult.id}`, { headers });
    expect(detailRes.ok(), `Get report failed: ${detailRes.status()}`).toBeTruthy();
    const detail = await detailRes.json();

    // Verify report metadata and summary
    expect(detail.tool_name).toBe(uniqueTool);
    const summary = detail.summary;
    expect(summary.tests).toBe(3);
    expect(summary.passed).toBe(2);
    expect(summary.failed).toBe(1);
  });
});
