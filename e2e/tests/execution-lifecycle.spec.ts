import { test, expect } from '@playwright/test';
import {
  loadCachedToken,
  authHeaders,
  tokenHeaders,
  buildCtrfReport,
  getOrCreateTeam,
  createAPIToken,
} from './helpers';

test.describe('Execution Lifecycle', () => {
  test('full lifecycle: create → progress → submit results → complete → report visible → quality gate evaluates', async ({
    request,
  }) => {
    // ── Setup: team + API token ───────────────────────────────────────
    const session = loadCachedToken();
    const teamId = await getOrCreateTeam(request, session);
    const apiToken = await createAPIToken(request, session, teamId);
    const headers = tokenHeaders(apiToken);

    // ── Step 1: Create execution ──────────────────────────────────────
    const createRes = await request.post('/api/v1/executions', {
      headers,
      data: { command: 'npm test -- --ci' },
    });
    expect(createRes.ok(), `Create execution failed: ${createRes.status()}`).toBeTruthy();
    const execution = await createRes.json();
    expect(execution.id).toBeTruthy();
    expect(execution.status).toBe('pending');

    const execId = execution.id;

    // ── Step 2: Worker updates status to running ──────────────────────
    const runningRes = await request.put(`/api/v1/executions/${execId}/status`, {
      headers,
      data: { status: 'running' },
    });
    expect(runningRes.ok(), `Update to running failed: ${runningRes.status()}`).toBeTruthy();
    const runningData = await runningRes.json();
    expect(runningData.status).toBe('running');

    // ── Step 3: Worker reports progress ───────────────────────────────
    const progressRes = await request.post(`/api/v1/executions/${execId}/progress`, {
      headers,
      data: { passed: 1, failed: 0, skipped: 0, total: 3, duration_ms: 1200 },
    });
    expect(progressRes.ok(), `Report progress failed: ${progressRes.status()}`).toBeTruthy();

    // ── Step 4: Worker submits CTRF test results ──────────────────────
    const uniqueTool = `E2E-Lifecycle-${Date.now()}`;
    const report = buildCtrfReport(uniqueTool);
    const submitRes = await request.post('/api/v1/reports', {
      headers,
      data: report,
    });
    expect(submitRes.ok(), `Submit report failed: ${submitRes.status()}`).toBeTruthy();
    const reportResult = await submitRes.json();
    expect(reportResult.id).toBeTruthy();

    // ── Step 5: Worker updates status to completed ────────────────────
    const completedRes = await request.put(`/api/v1/executions/${execId}/status`, {
      headers,
      data: { status: 'completed' },
    });
    expect(completedRes.ok(), `Update to completed failed: ${completedRes.status()}`).toBeTruthy();
    const completedData = await completedRes.json();
    expect(completedData.status).toBe('completed');

    // ── Step 6: Verify execution shows as completed ───────────────────
    const getRes = await request.get(`/api/v1/executions/${execId}`, { headers });
    expect(getRes.ok(), `Get execution failed: ${getRes.status()}`).toBeTruthy();
    const execDetail = await getRes.json();
    expect(execDetail.status).toBe('completed');

    // ── Step 7: Verify report is visible in reports list ──────────────
    const reportsRes = await request.get('/api/v1/reports', { headers });
    expect(reportsRes.ok(), `List reports failed: ${reportsRes.status()}`).toBeTruthy();
    const reportsData = await reportsRes.json();
    // The report list should contain at least our submitted report
    expect(reportsData.reports?.length ?? reportsData.data?.length).toBeGreaterThan(0);

    // ── Step 8: Create quality gate and evaluate ──────────────────────
    const gateName = `Lifecycle-Gate-${Date.now()}`;
    const gateRes = await request.post(`/api/v1/teams/${teamId}/quality-gates`, {
      headers,
      data: {
        name: gateName,
        description: 'E2E lifecycle quality gate',
        rules: [
          { type: 'pass_rate', params: { threshold: 50 } },
        ],
      },
    });
    expect(gateRes.ok(), `Create gate failed: ${gateRes.status()}`).toBeTruthy();
    const gate = await gateRes.json();
    expect(gate.id).toBeTruthy();

    const evalRes = await request.post(
      `/api/v1/teams/${teamId}/quality-gates/${gate.id}/evaluate`,
      { headers, data: { report_id: reportResult.id } }
    );
    expect(evalRes.ok(), `Evaluate gate failed: ${evalRes.status()}`).toBeTruthy();
    const evaluation = await evalRes.json();
    // Report has 2/3 passed (66.7%) — gate requires >= 50%, should pass
    expect(evaluation.passed).toBe(true);
  });

  test('execution failure flow: create → run → fail with error message', async ({ request }) => {
    const session = loadCachedToken();
    const teamId = await getOrCreateTeam(request, session);
    const apiToken = await createAPIToken(request, session, teamId);
    const headers = tokenHeaders(apiToken);

    // Create execution
    const createRes = await request.post('/api/v1/executions', {
      headers,
      data: { command: 'npm test -- --bail' },
    });
    expect(createRes.ok()).toBeTruthy();
    const execution = await createRes.json();
    const execId = execution.id;

    // Move to running
    const runRes = await request.put(`/api/v1/executions/${execId}/status`, {
      headers,
      data: { status: 'running' },
    });
    expect(runRes.ok()).toBeTruthy();

    // Mark as failed with error message
    const failRes = await request.put(`/api/v1/executions/${execId}/status`, {
      headers,
      data: { status: 'failed', error_msg: 'OOM killed: container exceeded memory limit' },
    });
    expect(failRes.ok(), `Update to failed: ${failRes.status()}`).toBeTruthy();
    const failData = await failRes.json();
    expect(failData.status).toBe('failed');

    // Verify the execution records the failure
    const getRes = await request.get(`/api/v1/executions/${execId}`, { headers });
    expect(getRes.ok()).toBeTruthy();
    const detail = await getRes.json();
    expect(detail.status).toBe('failed');
  });

  test('cancel execution: create → cancel → verify cancelled', async ({ request }) => {
    const session = loadCachedToken();
    const teamId = await getOrCreateTeam(request, session);
    const apiToken = await createAPIToken(request, session, teamId);
    const headers = tokenHeaders(apiToken);

    // Create execution
    const createRes = await request.post('/api/v1/executions', {
      headers,
      data: { command: 'npm test' },
    });
    expect(createRes.ok()).toBeTruthy();
    const execution = await createRes.json();

    // Cancel it
    const cancelRes = await request.delete(`/api/v1/executions/${execution.id}`, { headers });
    expect(cancelRes.ok(), `Cancel failed: ${cancelRes.status()}`).toBeTruthy();

    // Verify status is cancelled
    const getRes = await request.get(`/api/v1/executions/${execution.id}`, { headers });
    expect(getRes.ok()).toBeTruthy();
    const detail = await getRes.json();
    expect(detail.status).toBe('cancelled');

    // Verify cancelling again fails (already cancelled)
    const recancel = await request.delete(`/api/v1/executions/${execution.id}`, { headers });
    expect(recancel.ok()).toBeFalsy();
  });

  test('list executions returns created entries', async ({ request }) => {
    const session = loadCachedToken();
    const teamId = await getOrCreateTeam(request, session);
    const apiToken = await createAPIToken(request, session, teamId);
    const headers = tokenHeaders(apiToken);

    // Create an execution
    const createRes = await request.post('/api/v1/executions', {
      headers,
      data: { command: 'pytest -v' },
    });
    expect(createRes.ok()).toBeTruthy();

    // List executions
    const listRes = await request.get('/api/v1/executions', { headers });
    expect(listRes.ok(), `List failed: ${listRes.status()}`).toBeTruthy();
    const data = await listRes.json();
    expect(data.executions?.length ?? data.data?.length).toBeGreaterThan(0);
  });
});
