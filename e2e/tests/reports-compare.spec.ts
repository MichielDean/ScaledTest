import { test, expect } from '@playwright/test';
import {
  loadCachedToken,
  tokenHeaders,
  buildCtrfReport,
  getOrCreateTeam,
  createAPIToken,
} from './helpers';

/**
 * Build a CTRF report variant with different test outcomes for compare testing.
 * base report: tests A and B pass, test C fails
 * head report: tests A and B pass, test C is fixed (passes), test D is a new failure
 */
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
        start: now - 5000,
        stop: now,
      },
      tests: [
        { name: 'Test passes A', status: 'passed', duration: 1250 },
        { name: 'Test passes B', status: 'passed', duration: 890 },
        {
          name: 'Test fails C',
          status: 'failed',
          duration: 500,
          message: 'Expected true to be false',
        },
      ],
    },
  };
}

function buildHeadReport(toolName: string): Record<string, unknown> {
  const now = Date.now();
  return {
    results: {
      tool: { name: toolName, version: '1.0.0' },
      summary: {
        tests: 4,
        passed: 3,
        failed: 1,
        skipped: 0,
        pending: 0,
        other: 0,
        start: now - 4000,
        stop: now,
      },
      tests: [
        { name: 'Test passes A', status: 'passed', duration: 1100 },
        { name: 'Test passes B', status: 'passed', duration: 850 },
        { name: 'Test fails C', status: 'passed', duration: 400 }, // fixed
        { name: 'Test fails D', status: 'failed', duration: 300, message: 'new failure' }, // new
      ],
    },
  };
}

test.describe('Reports Compare', () => {
  test('compare two reports returns 200 with a valid diff payload', async ({ request }) => {
    const session = loadCachedToken();
    const teamId = await getOrCreateTeam(request, session);
    const apiToken = await createAPIToken(request, session, teamId);
    const headers = tokenHeaders(apiToken);

    const toolSuffix = Date.now();

    // Submit base report
    const baseSubmitRes = await request.post('/api/v1/reports', {
      headers,
      data: buildBaseReport(`E2E-Compare-Base-${toolSuffix}`),
    });
    expect(baseSubmitRes.ok(), `Base report submit failed: ${baseSubmitRes.status()}`).toBeTruthy();
    const baseResult = await baseSubmitRes.json();
    expect(baseResult.id).toBeTruthy();

    // Submit head report
    const headSubmitRes = await request.post('/api/v1/reports', {
      headers,
      data: buildHeadReport(`E2E-Compare-Head-${toolSuffix}`),
    });
    expect(headSubmitRes.ok(), `Head report submit failed: ${headSubmitRes.status()}`).toBeTruthy();
    const headResult = await headSubmitRes.json();
    expect(headResult.id).toBeTruthy();

    // Call compare endpoint
    const compareRes = await request.get(
      `/api/v1/reports/compare?base=${baseResult.id}&head=${headResult.id}`,
      { headers }
    );
    expect(compareRes.ok(), `Compare failed: ${compareRes.status()}`).toBeTruthy();

    const body = await compareRes.json();

    // Verify base and head metadata are present
    expect(body.base).toBeTruthy();
    expect(body.head).toBeTruthy();
    expect(body.base.id).toBe(baseResult.id);
    expect(body.head.id).toBe(headResult.id);

    // Verify diff structure
    expect(body.diff).toBeTruthy();
    const { diff } = body;
    expect(diff.summary).toBeTruthy();
    expect(typeof diff.summary.base_tests).toBe('number');
    expect(typeof diff.summary.head_tests).toBe('number');
    expect(typeof diff.summary.new_failures).toBe('number');
    expect(typeof diff.summary.fixed).toBe('number');

    // Verify diff values match the test data
    // base: 3 tests; head: 4 tests
    expect(diff.summary.base_tests).toBe(3);
    expect(diff.summary.head_tests).toBe(4);

    // Test fails D is a new failure (was not in base, failed in head)
    expect(diff.summary.new_failures).toBe(1);
    expect(Array.isArray(diff.new_failures)).toBeTruthy();
    expect(diff.new_failures).toHaveLength(1);
    expect(diff.new_failures[0].name).toBe('Test fails D');

    // Test fails C was failing in base and is now passing in head → fixed
    expect(diff.summary.fixed).toBe(1);
    expect(Array.isArray(diff.fixed)).toBeTruthy();
    expect(diff.fixed).toHaveLength(1);
    expect(diff.fixed[0].name).toBe('Test fails C');
  });

  test('compare with missing base or head returns 400', async ({ request }) => {
    const session = loadCachedToken();
    const teamId = await getOrCreateTeam(request, session);
    const apiToken = await createAPIToken(request, session, teamId);
    const headers = tokenHeaders(apiToken);

    // Missing head
    const resMissingHead = await request.get('/api/v1/reports/compare?base=some-id', { headers });
    expect(resMissingHead.status()).toBe(400);

    // Missing base
    const resMissingBase = await request.get('/api/v1/reports/compare?head=some-id', { headers });
    expect(resMissingBase.status()).toBe(400);
  });

  test('compare with same base and head IDs returns 400', async ({ request }) => {
    const session = loadCachedToken();
    const teamId = await getOrCreateTeam(request, session);
    const apiToken = await createAPIToken(request, session, teamId);
    const headers = tokenHeaders(apiToken);

    const submitRes = await request.post('/api/v1/reports', {
      headers,
      data: buildCtrfReport(`E2E-Compare-Same-${Date.now()}`),
    });
    expect(submitRes.ok()).toBeTruthy();
    const { id } = await submitRes.json();

    const compareRes = await request.get(
      `/api/v1/reports/compare?base=${id}&head=${id}`,
      { headers }
    );
    expect(compareRes.status()).toBe(400);
  });

  test('compare with non-existent report IDs returns 404', async ({ request }) => {
    const session = loadCachedToken();
    const teamId = await getOrCreateTeam(request, session);
    const apiToken = await createAPIToken(request, session, teamId);
    const headers = tokenHeaders(apiToken);

    const fakeId = '00000000-0000-0000-0000-000000000001';
    const fakeId2 = '00000000-0000-0000-0000-000000000002';

    const compareRes = await request.get(
      `/api/v1/reports/compare?base=${fakeId}&head=${fakeId2}`,
      { headers }
    );
    expect(compareRes.status()).toBe(404);
  });
});
