import { test, expect } from '@playwright/test';
import {
  loadCachedToken,
  authHeaders,
  tokenHeaders,
  buildCtrfReport,
  getOrCreateTeam,
  createAPIToken,
} from './helpers';

test.describe('Quality Gates', () => {
  test('create quality gate, submit report, and evaluate', async ({ request }) => {
    // Setup: team + API token for team-scoped operations
    const session = loadCachedToken();
    const teamId = await getOrCreateTeam(request, session);
    const apiToken = await createAPIToken(request, session, teamId);
    const headers = tokenHeaders(apiToken);

    // Create a quality gate with pass_rate and failed_count rules
    const gateName = `E2E-Gate-${Date.now()}`;
    const createRes = await request.post(`/api/v1/teams/${teamId}/quality-gates`, {
      headers,
      data: {
        name: gateName,
        description: 'E2E test quality gate',
        rules: [
          { type: 'pass_rate', params: { threshold: 50 } },
          { type: 'min_test_count', params: { threshold: 1 } },
        ],
      },
    });
    expect(createRes.ok(), `Create gate failed: ${createRes.status()}`).toBeTruthy();
    const gate = await createRes.json();
    expect(gate.id).toBeTruthy();
    expect(gate.name).toBe(gateName);

    // Submit a CTRF report (2 passed, 1 failed — 66.7% pass rate)
    const submitRes = await request.post('/api/v1/reports', {
      headers,
      data: buildCtrfReport(`QG-Tool-${Date.now()}`),
    });
    expect(submitRes.ok()).toBeTruthy();
    const reportResult = await submitRes.json();
    expect(reportResult.id).toBeTruthy();

    // Evaluate the quality gate against the submitted report
    const evalRes = await request.post(
      `/api/v1/teams/${teamId}/quality-gates/${gate.id}/evaluate`,
      { headers, data: { report_id: reportResult.id } }
    );
    expect(evalRes.ok(), `Evaluate failed: ${evalRes.status()}`).toBeTruthy();
    const evaluation = await evalRes.json();
    expect(evaluation.passed).toBeDefined();
    expect(evaluation.details?.results?.length).toBeGreaterThan(0);

    // Verify evaluation appears in history
    const historyRes = await request.get(
      `/api/v1/teams/${teamId}/quality-gates/${gate.id}/evaluations`,
      { headers }
    );
    expect(historyRes.ok()).toBeTruthy();
    const history = await historyRes.json();
    expect(history.evaluations?.length).toBeGreaterThan(0);
  });

  test('quality gate with strict rules fails on low pass rate', async ({ request }) => {
    const session = loadCachedToken();
    const teamId = await getOrCreateTeam(request, session);
    const apiToken = await createAPIToken(request, session, teamId);
    const headers = tokenHeaders(apiToken);

    // Create a strict gate requiring 100% pass rate
    const createRes = await request.post(`/api/v1/teams/${teamId}/quality-gates`, {
      headers,
      data: {
        name: `Strict-Gate-${Date.now()}`,
        description: 'Must have 100% pass rate',
        rules: [{ type: 'pass_rate', params: { threshold: 100 } }],
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const gate = await createRes.json();

    // Submit a report with failures (66.7% pass rate)
    const submitRes = await request.post('/api/v1/reports', {
      headers,
      data: buildCtrfReport(`Strict-Tool-${Date.now()}`),
    });
    expect(submitRes.ok()).toBeTruthy();
    const report = await submitRes.json();

    // Evaluate — should fail
    const evalRes = await request.post(
      `/api/v1/teams/${teamId}/quality-gates/${gate.id}/evaluate`,
      { headers, data: { report_id: report.id } }
    );
    expect(evalRes.ok()).toBeTruthy();
    const evaluation = await evalRes.json();
    expect(evaluation.passed).toBe(false);
  });
});
