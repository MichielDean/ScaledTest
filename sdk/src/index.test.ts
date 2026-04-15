import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScaledTestClient, ScaledTestError } from './index';

// ── Helpers ──────────────────────────────────────────────────────────────────

const BASE = 'https://api.example.com';
const TOKEN = 'sct_test_token';

function makeClient(opts?: Partial<{ baseUrl: string; token: string; timeoutMs: number }>) {
  return new ScaledTestClient({
    baseUrl: opts?.baseUrl ?? BASE,
    token: opts?.token ?? TOKEN,
    timeoutMs: opts?.timeoutMs ?? 0, // disable timeout in tests
  });
}

/** Captures the last fetch call's URL, method, headers, and body. */
function mockFetchOk(json: unknown = {}, status = 200) {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => json,
  } as unknown as Response);
}

function mockFetchError(json: unknown, status: number) {
  return vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: async () => json,
  } as unknown as Response);
}

let originalFetch: typeof globalThis.fetch;

beforeEach(() => {
  originalFetch = globalThis.fetch;
});

afterEach(() => {
  globalThis.fetch = originalFetch;
  vi.restoreAllMocks();
});

// ── Constructor ──────────────────────────────────────────────────────────────

describe('ScaledTestClient constructor', () => {
  it('throws on empty baseUrl', () => {
    expect(() => makeClient({ baseUrl: '' })).toThrow('baseUrl is required');
  });

  it('throws on empty token', () => {
    expect(() => makeClient({ token: '' })).toThrow('token is required');
  });

  it('throws on invalid URL', () => {
    expect(() => makeClient({ baseUrl: 'not-a-url' })).toThrow('Invalid baseUrl');
  });

  it('throws on non-http scheme', () => {
    expect(() => makeClient({ baseUrl: 'ftp://example.com' })).toThrow('http or https');
  });

  it('strips trailing slashes from baseUrl', async () => {
    const fetchMock = mockFetchOk({ reports: [], total: 0 });
    globalThis.fetch = fetchMock;

    const client = makeClient({ baseUrl: 'https://example.com///' });
    await client.getReports();

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe('https://example.com/api/v1/reports');
  });
});

// ── Auth headers ─────────────────────────────────────────────────────────────

describe('request headers', () => {
  it('sends Authorization and Content-Type headers', async () => {
    const fetchMock = mockFetchOk({ reports: [], total: 0 });
    globalThis.fetch = fetchMock;

    const client = makeClient();
    await client.getReports();

    const init = fetchMock.mock.calls[0][1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${TOKEN}`);
    expect(headers['Content-Type']).toBe('application/json');
  });
});

// ── Error handling ───────────────────────────────────────────────────────────

describe('error handling', () => {
  it('throws ScaledTestError with status and message on non-ok response', async () => {
    globalThis.fetch = mockFetchError({ error: 'not found' }, 404);
    const client = makeClient();

    try {
      await client.getReports();
      expect.fail('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(ScaledTestError);
      const err = e as ScaledTestError;
      expect(err.status).toBe(404);
      expect(err.message).toBe('not found');
    }
  });

  it('falls back to HTTP status when error body has no error field', async () => {
    globalThis.fetch = mockFetchError({}, 500);
    const client = makeClient();

    try {
      await client.getReports();
      expect.fail('should have thrown');
    } catch (e) {
      const err = e as ScaledTestError;
      expect(err.message).toBe('HTTP 500');
    }
  });

  it('handles non-JSON error responses', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 502,
      json: async () => { throw new Error('not json'); },
    } as unknown as Response);
    const client = makeClient();

    try {
      await client.getReports();
      expect.fail('should have thrown');
    } catch (e) {
      const err = e as ScaledTestError;
      expect(err.status).toBe(502);
      expect(err.message).toBe('HTTP 502');
    }
  });
});

// ── Query parameter support ──────────────────────────────────────────────────

describe('query parameter support', () => {
  it('appends query parameters to GET requests', async () => {
    const fetchMock = mockFetchOk({ reports: [], total: 0 });
    globalThis.fetch = fetchMock;
    const client = makeClient();

    await client.getReports({ limit: 10, offset: 20, since: '2024-01-01T00:00:00Z' });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('limit=10');
    expect(url).toContain('offset=20');
    expect(url).toContain('since=2024-01-01T00%3A00%3A00Z');
  });

  it('omits undefined query parameters', async () => {
    const fetchMock = mockFetchOk({ reports: [], total: 0 });
    globalThis.fetch = fetchMock;
    const client = makeClient();

    await client.getReports({ limit: 10 });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('limit=10');
    expect(url).not.toContain('offset=');
    expect(url).not.toContain('since=');
  });

  it('sends request without parameters when none provided', async () => {
    const fetchMock = mockFetchOk({ reports: [], total: 0 });
    globalThis.fetch = fetchMock;
    const client = makeClient();

    await client.getReports();

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe(`${BASE}/api/v1/reports`);
  });
});

// ── Reports ──────────────────────────────────────────────────────────────────

describe('reports', () => {
  it('uploadReport sends POST /api/v1/reports with report body', async () => {
    const fetchMock = mockFetchOk({ id: 'r-1' });
    globalThis.fetch = fetchMock;
    const client = makeClient();

    const report = {
      results: {
        tool: { name: 'jest' },
        summary: { tests: 1, passed: 1, failed: 0, skipped: 0, pending: 0, other: 0, start: 0, stop: 1 },
        tests: [{ name: 't1', status: 'passed' as const, duration: 10 }],
      },
    };
    await client.uploadReport(report);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/reports`);
    expect((init as RequestInit).method).toBe('POST');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.results.tool.name).toBe('jest');
  });

  it('getReports sends GET /api/v1/reports', async () => {
    const fetchMock = mockFetchOk({ reports: [], total: 0 });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.getReports();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/reports`);
    expect((init as RequestInit).method).toBe('GET');
  });

  it('getReports supports pagination params', async () => {
    const fetchMock = mockFetchOk({ reports: [], total: 0 });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.getReports({ limit: 5, offset: 10, since: '2024-01-01T00:00:00Z', until: '2024-12-31T23:59:59Z' });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('limit=5');
    expect(url).toContain('offset=10');
    expect(url).toContain('since=');
    expect(url).toContain('until=');
  });

  it('getReport sends GET /api/v1/reports/{id}', async () => {
    const fetchMock = mockFetchOk({ id: 'r-1' });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.getReport('r-1');

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe(`${BASE}/api/v1/reports/r-1`);
  });

  it('getReport encodes special characters in id', async () => {
    const fetchMock = mockFetchOk({ id: 'a/b' });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.getReport('a/b');

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe(`${BASE}/api/v1/reports/a%2Fb`);
  });

  it('deleteReport sends DELETE /api/v1/reports/{id}', async () => {
    const fetchMock = mockFetchOk({ id: 'r-1', deleted: true });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    const result = await client.deleteReport('r-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/reports/r-1`);
    expect((init as RequestInit).method).toBe('DELETE');
    expect(result).toEqual({ id: 'r-1', deleted: true });
  });

  it('deleteReport encodes special characters in id', async () => {
    const fetchMock = mockFetchOk({ id: 'a/b', deleted: true });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.deleteReport('a/b');

    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/v1/reports/a%2Fb`);
  });

  it('compareReports sends GET /api/v1/reports/compare with query params', async () => {
    const fetchMock = mockFetchOk({ base: {}, head: {}, diff: {} });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.compareReports('base-id', 'head-id');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain('/api/v1/reports/compare');
    expect(url).toContain('base=base-id');
    expect(url).toContain('head=head-id');
    expect((init as RequestInit).method).toBe('GET');
  });

  it('compareReports encodes special characters in IDs', async () => {
    const fetchMock = mockFetchOk({ base: {}, head: {}, diff: {} });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.compareReports('a/b', 'c/d');

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('base=a%2Fb');
    expect(url).toContain('head=c%2Fd');
  });

  it('getReportTriage sends GET /api/v1/reports/{id}/triage', async () => {
    const fetchMock = mockFetchOk({ triage_status: 'completed', clusters: [] });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.getReportTriage('r-1');

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe(`${BASE}/api/v1/reports/r-1/triage`);
  });

  it('retryReportTriage sends POST /api/v1/reports/{id}/triage/retry', async () => {
    const fetchMock = mockFetchOk({ triage_status: 'pending' });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.retryReportTriage('r-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/reports/r-1/triage/retry`);
    expect((init as RequestInit).method).toBe('POST');
  });
});

// ── Executions ───────────────────────────────────────────────────────────────

describe('executions', () => {
  it('getExecutions sends GET /api/v1/executions', async () => {
    const fetchMock = mockFetchOk({ executions: [], total: 0 });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.getExecutions();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/executions`);
    expect((init as RequestInit).method).toBe('GET');
  });

  it('getExecutions supports pagination params', async () => {
    const fetchMock = mockFetchOk({ executions: [], total: 0 });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.getExecutions({ limit: 10, offset: 5 });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('limit=10');
    expect(url).toContain('offset=5');
  });

  it('createExecution sends POST /api/v1/executions with command body', async () => {
    const fetchMock = mockFetchOk({ id: 'e-1', command: 'npm test', status: 'pending' });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.createExecution('npm test');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/executions`);
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ command: 'npm test' });
  });

  it('getExecution sends GET /api/v1/executions/{id}', async () => {
    const fetchMock = mockFetchOk({ id: 'e-1', command: 'npm test', status: 'running' });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    const result = await client.getExecution('e-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/executions/e-1`);
    expect((init as RequestInit).method).toBe('GET');
    expect(result.id).toBe('e-1');
  });

  it('cancelExecution sends DELETE /api/v1/executions/{id}', async () => {
    const fetchMock = mockFetchOk({});
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.cancelExecution('e-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/executions/e-1`);
    expect((init as RequestInit).method).toBe('DELETE');
  });

  it('deleteExecution sends DELETE /api/v1/executions/{id}', async () => {
    const fetchMock = mockFetchOk({});
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.deleteExecution('e-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/executions/e-1`);
    expect((init as RequestInit).method).toBe('DELETE');
  });

  it('updateExecutionStatus sends PUT /api/v1/executions/{id}/status', async () => {
    const fetchMock = mockFetchOk({ id: 'e-1', status: 'running' });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    const result = await client.updateExecutionStatus('e-1', 'running');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/executions/e-1/status`);
    expect((init as RequestInit).method).toBe('PUT');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.status).toBe('running');
    expect(body.error_msg).toBeUndefined();
    expect(result.id).toBe('e-1');
  });

  it('updateExecutionStatus includes error_msg when provided', async () => {
    const fetchMock = mockFetchOk({ id: 'e-1', status: 'failed' });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.updateExecutionStatus('e-1', 'failed', 'something went wrong');

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.error_msg).toBe('something went wrong');
  });

  it('reportExecutionProgress sends POST /api/v1/executions/{id}/progress', async () => {
    const fetchMock = mockFetchOk({ execution_id: 'e-1', received: true });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    const result = await client.reportExecutionProgress('e-1', { passed: 5, failed: 1, skipped: 0, total: 10 });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/executions/e-1/progress`);
    expect((init as RequestInit).method).toBe('POST');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.passed).toBe(5);
    expect(body.total).toBe(10);
    expect(result.received).toBe(true);
  });

  it('reportTestResult sends POST /api/v1/executions/{id}/test-result', async () => {
    const fetchMock = mockFetchOk({ execution_id: 'e-1', received: true });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    const result = await client.reportTestResult('e-1', { name: 'test-a', status: 'passed' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/executions/e-1/test-result`);
    expect((init as RequestInit).method).toBe('POST');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.name).toBe('test-a');
    expect(body.status).toBe('passed');
    expect(result.received).toBe(true);
  });

  it('reportWorkerStatus sends POST /api/v1/executions/{id}/worker-status', async () => {
    const fetchMock = mockFetchOk({ execution_id: 'e-1', received: true });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    const result = await client.reportWorkerStatus('e-1', { worker_id: 'w-1', status: 'running' });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/executions/e-1/worker-status`);
    expect((init as RequestInit).method).toBe('POST');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.worker_id).toBe('w-1');
    expect(body.status).toBe('running');
    expect(result.received).toBe(true);
  });
});

// ── Analytics ────────────────────────────────────────────────────────────────

describe('analytics', () => {
  it('getTrends sends GET /api/v1/analytics/trends', async () => {
    const fetchMock = mockFetchOk([]);
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.getTrends();

    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/v1/analytics/trends`);
  });

  it('getFlakyTests sends GET /api/v1/analytics/flaky-tests', async () => {
    const fetchMock = mockFetchOk([]);
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.getFlakyTests();

    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/v1/analytics/flaky-tests`);
  });

  it('getErrorAnalysis sends GET /api/v1/analytics/error-analysis', async () => {
    const fetchMock = mockFetchOk({});
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.getErrorAnalysis();

    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/v1/analytics/error-analysis`);
  });

  it('getDurationDistribution sends GET /api/v1/analytics/duration-distribution', async () => {
    const fetchMock = mockFetchOk({});
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.getDurationDistribution();

    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/v1/analytics/duration-distribution`);
  });
});

// ── Quality Gates (team-scoped) ──────────────────────────────────────────────

describe('quality gates', () => {
  it('getQualityGates sends GET /api/v1/teams/{teamId}/quality-gates', async () => {
    const fetchMock = mockFetchOk({ quality_gates: [], total: 0 });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.getQualityGates('team-1');

    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/v1/teams/team-1/quality-gates`);
  });

  it('createQualityGate sends POST /api/v1/teams/{teamId}/quality-gates', async () => {
    const rules = [{ type: 'pass_rate', params: { threshold: 95 } }];
    const fetchMock = mockFetchOk({ id: 'qg-1', name: 'prod-gate', rules });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.createQualityGate('team-1', 'prod-gate', rules);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/teams/team-1/quality-gates`);
    expect((init as RequestInit).method).toBe('POST');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ name: 'prod-gate', rules });
    expect(body).not.toHaveProperty('description');
  });

  it('createQualityGate includes description when provided', async () => {
    const rules = [{ type: 'pass_rate', params: { threshold: 95 } }];
    const fetchMock = mockFetchOk({ id: 'qg-1', name: 'prod-gate', rules });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.createQualityGate('team-1', 'prod-gate', rules, 'A description');

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.description).toBe('A description');
  });

  it('getQualityGate sends GET /api/v1/teams/{teamId}/quality-gates/{id}', async () => {
    const gate = { id: 'qg-1', name: 'prod-gate', team_id: 'team-1', rules: [], enabled: true, created_at: '', updated_at: '' };
    const fetchMock = mockFetchOk(gate);
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.getQualityGate('team-1', 'qg-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/teams/team-1/quality-gates/qg-1`);
    expect((init as RequestInit).method).toBe('GET');
  });

  it('updateQualityGate sends PUT /api/v1/teams/{teamId}/quality-gates/{id}', async () => {
    const rules = [{ type: 'pass_rate', params: { threshold: 90 } }];
    const fetchMock = mockFetchOk({ id: 'qg-1', name: 'updated', rules });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.updateQualityGate('team-1', 'qg-1', 'updated', rules, 'a desc', true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/teams/team-1/quality-gates/qg-1`);
    expect((init as RequestInit).method).toBe('PUT');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.name).toBe('updated');
    expect(body.rules).toEqual(rules);
    expect(body.description).toBe('a desc');
    expect(body.enabled).toBe(true);
  });

  it('updateQualityGate omits optional fields when not provided', async () => {
    const rules = [{ type: 'zero_failures' }];
    const fetchMock = mockFetchOk({ id: 'qg-1', name: 'gate', rules });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.updateQualityGate('team-1', 'qg-1', 'gate', rules);

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.name).toBe('gate');
    expect(body.rules).toEqual(rules);
    expect('description' in body).toBe(false);
    expect('enabled' in body).toBe(false);
  });

  it('deleteQualityGate sends DELETE /api/v1/teams/{teamId}/quality-gates/{id}', async () => {
    const fetchMock = mockFetchOk({ message: 'quality gate deleted' });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.deleteQualityGate('team-1', 'qg-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/teams/team-1/quality-gates/qg-1`);
    expect((init as RequestInit).method).toBe('DELETE');
  });

  it('listEvaluations sends GET /api/v1/teams/{teamId}/quality-gates/{id}/evaluations', async () => {
    const fetchMock = mockFetchOk({ evaluations: [], total: 0 });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.listEvaluations('team-1', 'qg-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/teams/team-1/quality-gates/qg-1/evaluations`);
    expect((init as RequestInit).method).toBe('GET');
  });

  it('listEvaluations supports limit param', async () => {
    const fetchMock = mockFetchOk({ evaluations: [], total: 0 });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.listEvaluations('team-1', 'qg-1', 50);

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('limit=50');
  });

  it('evaluateQualityGate sends POST with report_id in body', async () => {
    const fetchMock = mockFetchOk({ id: 'eval-1', passed: true, rules: [] });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.evaluateQualityGate('team-1', 'qg-1', 'report-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/teams/team-1/quality-gates/qg-1/evaluate`);
    expect((init as RequestInit).method).toBe('POST');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.report_id).toBe('report-1');
  });

  it('quality gate single-gate methods encode teamId and gateId', async () => {
    const fetchMock = mockFetchOk({ id: 'qg-1', name: 'g', rules: [], enabled: true, created_at: '', updated_at: '' });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.getQualityGate('team/special', 'gate/special');

    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/v1/teams/team%2Fspecial/quality-gates/gate%2Fspecial`);
  });

  it('quality gate methods encode teamId and gateId', async () => {
    const fetchMock = mockFetchOk({ quality_gates: [], total: 0 });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.getQualityGates('team/special');

    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/v1/teams/team%2Fspecial/quality-gates`);
  });
});

// ── Teams ────────────────────────────────────────────────────────────────────

describe('teams', () => {
  it('getTeams sends GET /api/v1/teams', async () => {
    const fetchMock = mockFetchOk({ teams: [] });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.getTeams();

    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/v1/teams`);
  });

  it('createTeam sends POST /api/v1/teams with name', async () => {
    const fetchMock = mockFetchOk({ id: 't-1', name: 'my-team' });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.createTeam('my-team');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/teams`);
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ name: 'my-team' });
  });

  it('getTeam sends GET /api/v1/teams/{id}', async () => {
    const fetchMock = mockFetchOk({ team: { id: 't-1', name: 'my-team' }, role: 'owner' });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    const result = await client.getTeam('t-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/teams/t-1`);
    expect((init as RequestInit).method).toBe('GET');
    expect(result.role).toBe('owner');
  });

  it('getTeam encodes special characters in id', async () => {
    const fetchMock = mockFetchOk({ team: { id: 'a/b' }, role: 'member' });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.getTeam('a/b');

    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/v1/teams/a%2Fb`);
  });

  it('deleteTeam sends DELETE /api/v1/teams/{id}', async () => {
    const fetchMock = mockFetchOk({ message: 'team deleted' });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    const result = await client.deleteTeam('t-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/teams/t-1`);
    expect((init as RequestInit).method).toBe('DELETE');
    expect(result.message).toBe('team deleted');
  });

  it('listTokens sends GET /api/v1/teams/{teamId}/tokens', async () => {
    const fetchMock = mockFetchOk({ tokens: [] });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.listTokens('team-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/teams/team-1/tokens`);
    expect((init as RequestInit).method).toBe('GET');
  });

  it('createToken sends POST /api/v1/teams/{teamId}/tokens', async () => {
    const fetchMock = mockFetchOk({ token: 'sct_xxx', id: 'tok-1', name: 'ci', prefix: 'sct_', created_at: '' });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.createToken('team-1', 'ci');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/teams/team-1/tokens`);
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ name: 'ci' });
  });

  it('deleteToken sends DELETE /api/v1/teams/{teamId}/tokens/{tokenId}', async () => {
    const fetchMock = mockFetchOk({ message: 'token revoked' });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.deleteToken('team-1', 'tok-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/teams/team-1/tokens/tok-1`);
    expect((init as RequestInit).method).toBe('DELETE');
  });
});

// ── Webhooks ─────────────────────────────────────────────────────────────────

describe('webhooks', () => {
  it('listWebhooks sends GET /api/v1/teams/{teamId}/webhooks', async () => {
    const fetchMock = mockFetchOk({ webhooks: [], total: 0 });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.listWebhooks('team-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/teams/team-1/webhooks`);
    expect((init as RequestInit).method).toBe('GET');
  });

  it('createWebhook sends POST /api/v1/teams/{teamId}/webhooks', async () => {
    const fetchMock = mockFetchOk({ webhook: { id: 'wh-1', url: 'https://example.com', events: ['report.submitted'] }, secret: 'whsec_xxx' });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    const result = await client.createWebhook('team-1', 'https://example.com', ['report.submitted']);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/teams/team-1/webhooks`);
    expect((init as RequestInit).method).toBe('POST');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ url: 'https://example.com', events: ['report.submitted'] });
    expect(result.secret).toBe('whsec_xxx');
  });

  it('getWebhook sends GET /api/v1/teams/{teamId}/webhooks/{webhookId}', async () => {
    const fetchMock = mockFetchOk({ id: 'wh-1', url: 'https://example.com' });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.getWebhook('team-1', 'wh-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/teams/team-1/webhooks/wh-1`);
    expect((init as RequestInit).method).toBe('GET');
  });

  it('updateWebhook sends PUT /api/v1/teams/{teamId}/webhooks/{webhookId}', async () => {
    const fetchMock = mockFetchOk({ id: 'wh-1', url: 'https://new.example.com' });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.updateWebhook('team-1', 'wh-1', 'https://new.example.com', ['report.submitted'], true);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/teams/team-1/webhooks/wh-1`);
    expect((init as RequestInit).method).toBe('PUT');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.url).toBe('https://new.example.com');
    expect(body.events).toEqual(['report.submitted']);
    expect(body.enabled).toBe(true);
  });

  it('deleteWebhook sends DELETE /api/v1/teams/{teamId}/webhooks/{webhookId}', async () => {
    const fetchMock = mockFetchOk({ message: 'webhook deleted' });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.deleteWebhook('team-1', 'wh-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/teams/team-1/webhooks/wh-1`);
    expect((init as RequestInit).method).toBe('DELETE');
  });

  it('listWebhookDeliveries sends GET /api/v1/teams/{teamId}/webhooks/{webhookId}/deliveries', async () => {
    const fetchMock = mockFetchOk({ deliveries: [], total: 0 });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.listWebhookDeliveries('team-1', 'wh-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/teams/team-1/webhooks/wh-1/deliveries`);
    expect((init as RequestInit).method).toBe('GET');
  });

  it('listWebhookDeliveries sends before_id query param', async () => {
    const fetchMock = mockFetchOk({ deliveries: [], total: 0 });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.listWebhookDeliveries('team-1', 'wh-1', 'del-123');

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('before_id=del-123');
  });

  it('retryWebhookDelivery sends POST to deliveries/{deliveryId}/retry', async () => {
    const fetchMock = mockFetchOk({ success: true, status_code: 200, attempt: 2, duration_ms: 150, error: '' });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    const result = await client.retryWebhookDelivery('team-1', 'wh-1', 'del-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/teams/team-1/webhooks/wh-1/deliveries/del-1/retry`);
    expect((init as RequestInit).method).toBe('POST');
    expect(result.success).toBe(true);
  });

  it('webhook methods encode teamId and webhookId', async () => {
    const fetchMock = mockFetchOk({ webhooks: [], total: 0 });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.listWebhooks('team/special');

    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/v1/teams/team%2Fspecial/webhooks`);
  });
});

// ── Invitations ──────────────────────────────────────────────────────────────

describe('invitations', () => {
  it('listInvitations sends GET /api/v1/teams/{teamId}/invitations', async () => {
    const fetchMock = mockFetchOk({ invitations: [] });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.listInvitations('team-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/teams/team-1/invitations`);
    expect((init as RequestInit).method).toBe('GET');
  });

  it('createInvitation sends POST /api/v1/teams/{teamId}/invitations', async () => {
    const fetchMock = mockFetchOk({ invitation: { id: 'inv-1' }, token: 'inv_abc' });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    const result = await client.createInvitation('team-1', 'user@example.com', 'maintainer');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/teams/team-1/invitations`);
    expect((init as RequestInit).method).toBe('POST');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ email: 'user@example.com', role: 'maintainer' });
    expect(result.token).toBe('inv_abc');
  });

  it('revokeInvitation sends DELETE /api/v1/teams/{teamId}/invitations/{id}', async () => {
    const fetchMock = mockFetchOk({ message: 'invitation revoked' });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.revokeInvitation('team-1', 'inv-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/teams/team-1/invitations/inv-1`);
    expect((init as RequestInit).method).toBe('DELETE');
  });

  it('previewInvitation sends GET /api/v1/invitations/{token}', async () => {
    const fetchMock = mockFetchOk({ email: 'test@example.com', role: 'maintainer', team_name: 'Team A', expires_at: '' });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    const result = await client.previewInvitation('inv_abc');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/invitations/inv_abc`);
    expect((init as RequestInit).method).toBe('GET');
    expect(result.email).toBe('test@example.com');
  });

  it('previewInvitation encodes special characters in token', async () => {
    const fetchMock = mockFetchOk({ email: 'test@example.com', role: 'member', team_name: 'Team', expires_at: '' });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.previewInvitation('tok/en');

    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/v1/invitations/tok%2Fen`);
  });

  it('acceptInvitation sends POST /api/v1/invitations/{token}/accept', async () => {
    const fetchMock = mockFetchOk({ message: 'invitation accepted', user_id: 'u-1', team_id: 't-1', role: 'member' });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    const result = await client.acceptInvitation('inv_abc', 'password123', 'Alice');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/invitations/inv_abc/accept`);
    expect((init as RequestInit).method).toBe('POST');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ password: 'password123', display_name: 'Alice' });
    expect(result.message).toBe('invitation accepted');
  });
});

// ── Sharding ─────────────────────────────────────────────────────────────────

describe('sharding', () => {
  it('getShardDurations sends GET /api/v1/sharding/durations', async () => {
    const fetchMock = mockFetchOk({ durations: [], total: 0 });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.getShardDurations();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/sharding/durations`);
    expect((init as RequestInit).method).toBe('GET');
  });

  it('getShardDurations sends suite query param', async () => {
    const fetchMock = mockFetchOk({ durations: [], total: 0 });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.getShardDurations('integration');

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('suite=integration');
  });

  it('getShardDuration sends GET /api/v1/sharding/durations/{testName}', async () => {
    const fetchMock = mockFetchOk([{ test_name: 'Login Test', avg_duration_ms: 1000 }]);
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.getShardDuration('Login Test');

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toBe(`${BASE}/api/v1/sharding/durations/Login%20Test`);
  });

  it('createShardPlan sends POST /api/v1/sharding/plan', async () => {
    const fetchMock = mockFetchOk({ execution_id: 'e-1', shards: [], total_workers: 2 });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.createShardPlan({ test_names: ['a', 'b'], num_workers: 2 });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/sharding/plan`);
    expect((init as RequestInit).method).toBe('POST');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.test_names).toEqual(['a', 'b']);
    expect(body.num_workers).toBe(2);
  });

  it('createShardPlan includes optional fields', async () => {
    const fetchMock = mockFetchOk({ execution_id: 'e-1', shards: [], total_workers: 2 });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.createShardPlan({ test_names: ['a'], num_workers: 2, strategy: 'duration', execution_id: 'e-1' });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.strategy).toBe('duration');
    expect(body.execution_id).toBe('e-1');
  });

  it('rebalanceShards sends POST /api/v1/sharding/rebalance', async () => {
    const fetchMock = mockFetchOk({ execution_id: 'e-1', shards: [] });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.rebalanceShards({ execution_id: 'e-1', failed_worker_id: 'w-1', current_plan: { execution_id: 'e-1', total_workers: 2, strategy: 'greedy', shards: [], est_total_ms: 0, est_wall_clock_ms: 0 } });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/sharding/rebalance`);
    expect((init as RequestInit).method).toBe('POST');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.execution_id).toBe('e-1');
    expect(body.failed_worker_id).toBe('w-1');
  });
});

// ── Admin ────────────────────────────────────────────────────────────────────

describe('admin', () => {
  it('listUsers sends GET /api/v1/admin/users', async () => {
    const fetchMock = mockFetchOk({ users: [], total: 0 });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.listUsers();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/admin/users`);
    expect((init as RequestInit).method).toBe('GET');
  });

  it('listAuditLog sends GET /api/v1/admin/audit-log', async () => {
    const fetchMock = mockFetchOk({ audit_log: [], total: 0 });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.listAuditLog();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/admin/audit-log`);
    expect((init as RequestInit).method).toBe('GET');
  });

  it('listAuditLog sends query params', async () => {
    const fetchMock = mockFetchOk({ audit_log: [], total: 0 });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.listAuditLog({ action: 'report.submitted', limit: 10, offset: 5 });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('action=report.submitted');
    expect(url).toContain('limit=10');
    expect(url).toContain('offset=5');
  });
});

// ── User profile ─────────────────────────────────────────────────────────────

describe('user profile', () => {
  it('getMe sends GET /api/v1/auth/me', async () => {
    const profile = { id: 'u-1', email: 'a@b.com', display_name: 'Alice', role: 'member' };
    const fetchMock = mockFetchOk(profile);
    globalThis.fetch = fetchMock;
    const client = makeClient();
    const result = await client.getMe();

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/auth/me`);
    expect((init as RequestInit).method).toBe('GET');
    expect(result).toEqual(profile);
  });

  it('updateProfile sends PATCH /api/v1/auth/me with display_name', async () => {
    const profile = { id: 'u-1', email: 'a@b.com', display_name: 'Bob', role: 'member' };
    const fetchMock = mockFetchOk(profile);
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.updateProfile('Bob');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/auth/me`);
    expect((init as RequestInit).method).toBe('PATCH');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ display_name: 'Bob' });
  });

  it('changePassword sends POST /api/v1/auth/change-password with credentials', async () => {
    const fetchMock = mockFetchOk({ message: 'password changed' });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.changePassword('old-pass', 'new-pass-123');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/auth/change-password`);
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      current_password: 'old-pass',
      new_password: 'new-pass-123',
    });
  });
});

// ── Endpoint alignment with routes.go ────────────────────────────────────────

describe('endpoint alignment with routes.go', () => {
  const routes = [
    { method: 'GET', path: '/api/v1/reports' },
    { method: 'POST', path: '/api/v1/reports' },
    { method: 'GET', path: '/api/v1/reports/{id}' },
    { method: 'DELETE', path: '/api/v1/reports/{id}' },
    { method: 'GET', path: '/api/v1/reports/compare' },
    { method: 'GET', path: '/api/v1/reports/{reportID}/triage' },
    { method: 'POST', path: '/api/v1/reports/{reportID}/triage/retry' },
    { method: 'GET', path: '/api/v1/executions' },
    { method: 'POST', path: '/api/v1/executions' },
    { method: 'GET', path: '/api/v1/executions/{id}' },
    { method: 'DELETE', path: '/api/v1/executions/{id}' },
    { method: 'PUT', path: '/api/v1/executions/{id}/status' },
    { method: 'POST', path: '/api/v1/executions/{id}/progress' },
    { method: 'POST', path: '/api/v1/executions/{id}/test-result' },
    { method: 'POST', path: '/api/v1/executions/{id}/worker-status' },
    { method: 'GET', path: '/api/v1/analytics/trends' },
    { method: 'GET', path: '/api/v1/analytics/flaky-tests' },
    { method: 'GET', path: '/api/v1/analytics/error-analysis' },
    { method: 'GET', path: '/api/v1/analytics/duration-distribution' },
    { method: 'GET', path: '/api/v1/teams/{teamID}/quality-gates' },
    { method: 'POST', path: '/api/v1/teams/{teamID}/quality-gates' },
    { method: 'GET', path: '/api/v1/teams/{teamID}/quality-gates/{gateID}' },
    { method: 'PUT', path: '/api/v1/teams/{teamID}/quality-gates/{gateID}' },
    { method: 'DELETE', path: '/api/v1/teams/{teamID}/quality-gates/{gateID}' },
    { method: 'POST', path: '/api/v1/teams/{teamID}/quality-gates/{gateID}/evaluate' },
    { method: 'GET', path: '/api/v1/teams/{teamID}/quality-gates/{gateID}/evaluations' },
    { method: 'GET', path: '/api/v1/teams' },
    { method: 'POST', path: '/api/v1/teams' },
    { method: 'GET', path: '/api/v1/teams/{teamID}' },
    { method: 'DELETE', path: '/api/v1/teams/{teamID}' },
    { method: 'GET', path: '/api/v1/teams/{teamID}/tokens' },
    { method: 'POST', path: '/api/v1/teams/{teamID}/tokens' },
    { method: 'DELETE', path: '/api/v1/teams/{teamID}/tokens/{tokenID}' },
    { method: 'GET', path: '/api/v1/teams/{teamID}/webhooks' },
    { method: 'POST', path: '/api/v1/teams/{teamID}/webhooks' },
    { method: 'GET', path: '/api/v1/teams/{teamID}/webhooks/{webhookID}' },
    { method: 'PUT', path: '/api/v1/teams/{teamID}/webhooks/{webhookID}' },
    { method: 'DELETE', path: '/api/v1/teams/{teamID}/webhooks/{webhookID}' },
    { method: 'GET', path: '/api/v1/teams/{teamID}/webhooks/{webhookID}/deliveries' },
    { method: 'POST', path: '/api/v1/teams/{teamID}/webhooks/{webhookID}/deliveries/{deliveryID}/retry' },
    { method: 'GET', path: '/api/v1/teams/{teamID}/invitations' },
    { method: 'POST', path: '/api/v1/teams/{teamID}/invitations' },
    { method: 'DELETE', path: '/api/v1/teams/{teamID}/invitations/{invitationID}' },
    { method: 'GET', path: '/api/v1/invitations/{token}' },
    { method: 'POST', path: '/api/v1/invitations/{token}/accept' },
    { method: 'POST', path: '/api/v1/sharding/plan' },
    { method: 'POST', path: '/api/v1/sharding/rebalance' },
    { method: 'GET', path: '/api/v1/sharding/durations' },
    { method: 'GET', path: '/api/v1/sharding/durations/{testName}' },
    { method: 'GET', path: '/api/v1/admin/users' },
    { method: 'GET', path: '/api/v1/admin/audit-log' },
    { method: 'GET', path: '/api/v1/auth/me' },
    { method: 'PATCH', path: '/api/v1/auth/me' },
    { method: 'POST', path: '/api/v1/auth/change-password' },
  ];

  it.each(routes)('SDK covers $method $path', async ({ method, path }) => {
    const fetchMock = mockFetchOk({});
    globalThis.fetch = fetchMock;
    const client = makeClient();

    const resolvedPath = path
      .replace('{id}', 'test-id')
      .replace('{teamID}', 'team-1')
      .replace('{gateID}', 'gate-1')
      .replace('{webhookID}', 'wh-1')
      .replace('{deliveryID}', 'del-1')
      .replace('{invitationID}', 'inv-1')
      .replace('{token}', 'inv_token')
      .replace('{testName}', 'Login%20Test')
      .replace('{tokenID}', 'tok-1')
      .replace('{reportID}', 'r-1');

    switch (`${method} ${path}`) {
      case 'GET /api/v1/reports': await client.getReports(); break;
      case 'POST /api/v1/reports': await client.uploadReport({
        results: {
          tool: { name: 'test' },
          summary: { tests: 0, passed: 0, failed: 0, skipped: 0, pending: 0, other: 0, start: 0, stop: 0 },
          tests: [],
        },
      }); break;
      case 'GET /api/v1/reports/{id}': await client.getReport('test-id'); break;
      case 'DELETE /api/v1/reports/{id}': await client.deleteReport('test-id'); break;
      case 'GET /api/v1/reports/compare': await client.compareReports('base-id', 'head-id'); break;
      case 'GET /api/v1/reports/{reportID}/triage': await client.getReportTriage('r-1'); break;
      case 'POST /api/v1/reports/{reportID}/triage/retry': await client.retryReportTriage('r-1'); break;
      case 'GET /api/v1/executions': await client.getExecutions(); break;
      case 'POST /api/v1/executions': await client.createExecution('cmd'); break;
      case 'GET /api/v1/executions/{id}': await client.getExecution('test-id'); break;
      case 'DELETE /api/v1/executions/{id}': await client.cancelExecution('test-id'); break;
      case 'PUT /api/v1/executions/{id}/status': await client.updateExecutionStatus('test-id', 'running'); break;
      case 'POST /api/v1/executions/{id}/progress': await client.reportExecutionProgress('test-id', { passed: 0, failed: 0, skipped: 0, total: 1 }); break;
      case 'POST /api/v1/executions/{id}/test-result': await client.reportTestResult('test-id', { name: 't', status: 'passed' }); break;
      case 'POST /api/v1/executions/{id}/worker-status': await client.reportWorkerStatus('test-id', { worker_id: 'w-1', status: 'running' }); break;
      case 'GET /api/v1/analytics/trends': await client.getTrends(); break;
      case 'GET /api/v1/analytics/flaky-tests': await client.getFlakyTests(); break;
      case 'GET /api/v1/analytics/error-analysis': await client.getErrorAnalysis(); break;
      case 'GET /api/v1/analytics/duration-distribution': await client.getDurationDistribution(); break;
      case 'GET /api/v1/teams/{teamID}/quality-gates': await client.getQualityGates('team-1'); break;
      case 'POST /api/v1/teams/{teamID}/quality-gates': await client.createQualityGate('team-1', 'g', []); break;
      case 'GET /api/v1/teams/{teamID}/quality-gates/{gateID}': await client.getQualityGate('team-1', 'gate-1'); break;
      case 'PUT /api/v1/teams/{teamID}/quality-gates/{gateID}': await client.updateQualityGate('team-1', 'gate-1', 'g', []); break;
      case 'DELETE /api/v1/teams/{teamID}/quality-gates/{gateID}': await client.deleteQualityGate('team-1', 'gate-1'); break;
      case 'POST /api/v1/teams/{teamID}/quality-gates/{gateID}/evaluate': await client.evaluateQualityGate('team-1', 'gate-1', 'report-1'); break;
      case 'GET /api/v1/teams/{teamID}/quality-gates/{gateID}/evaluations': await client.listEvaluations('team-1', 'gate-1'); break;
      case 'GET /api/v1/teams': await client.getTeams(); break;
      case 'POST /api/v1/teams': await client.createTeam('t'); break;
      case 'GET /api/v1/teams/{teamID}': await client.getTeam('team-1'); break;
      case 'DELETE /api/v1/teams/{teamID}': await client.deleteTeam('team-1'); break;
      case 'GET /api/v1/teams/{teamID}/tokens': await client.listTokens('team-1'); break;
      case 'POST /api/v1/teams/{teamID}/tokens': await client.createToken('team-1', 'ci'); break;
      case 'DELETE /api/v1/teams/{teamID}/tokens/{tokenID}': await client.deleteToken('team-1', 'tok-1'); break;
      case 'GET /api/v1/teams/{teamID}/webhooks': await client.listWebhooks('team-1'); break;
      case 'POST /api/v1/teams/{teamID}/webhooks': await client.createWebhook('team-1', 'https://example.com', ['report.submitted']); break;
      case 'GET /api/v1/teams/{teamID}/webhooks/{webhookID}': await client.getWebhook('team-1', 'wh-1'); break;
      case 'PUT /api/v1/teams/{teamID}/webhooks/{webhookID}': await client.updateWebhook('team-1', 'wh-1', 'https://example.com', ['report.submitted'], true); break;
      case 'DELETE /api/v1/teams/{teamID}/webhooks/{webhookID}': await client.deleteWebhook('team-1', 'wh-1'); break;
      case 'GET /api/v1/teams/{teamID}/webhooks/{webhookID}/deliveries': await client.listWebhookDeliveries('team-1', 'wh-1'); break;
      case 'POST /api/v1/teams/{teamID}/webhooks/{webhookID}/deliveries/{deliveryID}/retry': await client.retryWebhookDelivery('team-1', 'wh-1', 'del-1'); break;
      case 'GET /api/v1/teams/{teamID}/invitations': await client.listInvitations('team-1'); break;
      case 'POST /api/v1/teams/{teamID}/invitations': await client.createInvitation('team-1', 'a@b.com', 'member'); break;
      case 'DELETE /api/v1/teams/{teamID}/invitations/{invitationID}': await client.revokeInvitation('team-1', 'inv-1'); break;
      case 'GET /api/v1/invitations/{token}': await client.previewInvitation('inv_token'); break;
      case 'POST /api/v1/invitations/{token}/accept': await client.acceptInvitation('inv_token', 'pw', 'Alice'); break;
      case 'POST /api/v1/sharding/plan': await client.createShardPlan({ test_names: ['a'], num_workers: 2 }); break;
      case 'POST /api/v1/sharding/rebalance': await client.rebalanceShards({ execution_id: 'e-1', failed_worker_id: 'w-1', current_plan: { execution_id: 'e-1', total_workers: 2, strategy: 'greedy', shards: [], est_total_ms: 0, est_wall_clock_ms: 0 } }); break;
      case 'GET /api/v1/sharding/durations': await client.getShardDurations(); break;
      case 'GET /api/v1/sharding/durations/{testName}': await client.getShardDuration('Login Test'); break;
      case 'GET /api/v1/admin/users': await client.listUsers(); break;
      case 'GET /api/v1/admin/audit-log': await client.listAuditLog(); break;
      case 'GET /api/v1/auth/me': await client.getMe(); break;
      case 'PATCH /api/v1/auth/me': await client.updateProfile('Alice'); break;
      case 'POST /api/v1/auth/change-password': await client.changePassword('old', 'newpass1'); break;
    }

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    const calledMethod = (fetchMock.mock.calls[0][1] as RequestInit).method;
    // Strip query parameters for comparison since some routes have params
    const calledUrlWithoutQuery = calledUrl.split('?')[0];
    expect(calledUrlWithoutQuery).toBe(`${BASE}${resolvedPath}`);
    expect(calledMethod).toBe(method);
  });
});