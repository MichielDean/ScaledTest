import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ScaledTestClient, ScaledTestError, ErrorCluster, DurationBucket, AuditLog, Shard, WebhookDelivery, TestDurationHistory, QualityGateEvaluation, EvaluateQualityGateResponse, QualityGateRuleResult, QualityGateEvalRuleResult, QualityGateRule, Invitation, TeamToken, AdminUser, TrendPoint, FlakyTest, Report, Execution, ExecutionStatus, UpdateExecutionStatus, TestResultStatus, WorkerStatus, UploadReportResponse, CreateExecutionResponse, Team, TeamWithRole, ReportTriageResult, WebhookEventType } from './index';

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
    const result = await client.createExecution('npm test');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/executions`);
    expect((init as RequestInit).method).toBe('POST');
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({ command: 'npm test' });
    expect(result.id).toBe('e-1');
    expect(result.status).toBe('pending');
  });

  it('createExecution includes image and env_vars when provided', async () => {
    const fetchMock = mockFetchOk({ id: 'e-1', command: 'npm test', status: 'pending' });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.createExecution('npm test', { image: 'node:18', env_vars: { NODE_ENV: 'test' } });

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.command).toBe('npm test');
    expect(body.image).toBe('node:18');
    expect(body.env_vars).toEqual({ NODE_ENV: 'test' });
  });

  it('createExecution omits image and env_vars when not provided', async () => {
    const fetchMock = mockFetchOk({ id: 'e-1', command: 'npm test', status: 'pending' });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.createExecution('npm test');

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.command).toBe('npm test');
    expect('image' in body).toBe(false);
    expect('env_vars' in body).toBe(false);
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

  it('cancelExecution sends DELETE /api/v1/executions/{id} and returns {id, status}', async () => {
    const fetchMock = mockFetchOk({ id: 'e-1', status: 'cancelled' });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    const result = await client.cancelExecution('e-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/executions/e-1`);
    expect((init as RequestInit).method).toBe('DELETE');
    expect(result.id).toBe('e-1');
    expect(result.status).toBe('cancelled');
  });

  it('deleteExecution sends DELETE /api/v1/executions/{id} and returns {id, status}', async () => {
    const fetchMock = mockFetchOk({ id: 'e-1', status: 'cancelled' });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    const result = await client.deleteExecution('e-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/executions/e-1`);
    expect((init as RequestInit).method).toBe('DELETE');
    expect(result.id).toBe('e-1');
    expect(result.status).toBe('cancelled');
  });

  it('updateExecutionStatus accepts UpdateExecutionStatus values (excludes pending)', async () => {
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

  it('reportTestResult accepts TestResultStatus values', async () => {
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

  it('reportWorkerStatus accepts WorkerStatus values', async () => {
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
    const fetchMock = mockFetchOk({ trends: [] });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    const result = await client.getTrends();

    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/v1/analytics/trends`);
    expect(result.trends).toEqual([]);
  });

  it('getTrends passes start, end, group_by query params', async () => {
    const fetchMock = mockFetchOk({ trends: [] });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.getTrends({ start: '2024-01-01T00:00:00Z', end: '2024-12-31T23:59:59Z', group_by: 'week' });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('start=2024-01-01T00%3A00%3A00Z');
    expect(url).toContain('end=2024-12-31T23%3A59%3A59Z');
    expect(url).toContain('group_by=week');
  });

  it('getFlakyTests sends GET /api/v1/analytics/flaky-tests', async () => {
    const fetchMock = mockFetchOk({ flaky_tests: [] });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    const result = await client.getFlakyTests();

    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/v1/analytics/flaky-tests`);
    expect(result.flaky_tests).toEqual([]);
  });

  it('getFlakyTests passes window_days, min_runs, limit query params', async () => {
    const fetchMock = mockFetchOk({ flaky_tests: [] });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.getFlakyTests({ window_days: 14, min_runs: 3, limit: 10 });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('window_days=14');
    expect(url).toContain('min_runs=3');
    expect(url).toContain('limit=10');
  });

  it('getErrorAnalysis sends GET /api/v1/analytics/error-analysis', async () => {
    const fetchMock = mockFetchOk({});
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.getErrorAnalysis();

    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/v1/analytics/error-analysis`);
  });

  it('getErrorAnalysis passes start, end, limit query params', async () => {
    const fetchMock = mockFetchOk({ errors: [] });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.getErrorAnalysis({ start: '2024-01-01T00:00:00Z', end: '2024-06-30T23:59:59Z', limit: 5 });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('start=2024-01-01T00%3A00%3A00Z');
    expect(url).toContain('end=2024-06-30T23%3A59%3A59Z');
    expect(url).toContain('limit=5');
  });

  it('getDurationDistribution sends GET /api/v1/analytics/duration-distribution', async () => {
    const fetchMock = mockFetchOk({});
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.getDurationDistribution();

    expect(fetchMock.mock.calls[0][0]).toBe(`${BASE}/api/v1/analytics/duration-distribution`);
  });

  it('getDurationDistribution passes start, end query params', async () => {
    const fetchMock = mockFetchOk({ distribution: [] });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.getDurationDistribution({ start: '2024-01-01T00:00:00Z', end: '2024-12-31T23:59:59Z' });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('start=2024-01-01T00%3A00%3A00Z');
    expect(url).toContain('end=2024-12-31T23%3A59%3A59Z');
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
    const rules = [{ type: 'zero_failures', params: null }];
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
    const fetchMock = mockFetchOk({ id: 'eval-1', gate_id: 'qg-1', report_id: 'report-1', passed: true, rules: [] });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    const result = await client.evaluateQualityGate('team-1', 'qg-1', 'report-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/teams/team-1/quality-gates/qg-1/evaluate`);
    expect((init as RequestInit).method).toBe('POST');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body.report_id).toBe('report-1');
    expect(result.rules).toEqual([]);
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

  it('updateWebhook sends PUT /api/v1/teams/{teamId}/webhooks/{webhookId} with enabled', async () => {
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

  it('updateWebhook omits enabled when not provided (server defaults to true)', async () => {
    const fetchMock = mockFetchOk({ id: 'wh-1', url: 'https://new.example.com' });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.updateWebhook('team-1', 'wh-1', 'https://new.example.com', ['report.submitted']);

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.url).toBe('https://new.example.com');
    expect(body.events).toEqual(['report.submitted']);
    expect('enabled' in body).toBe(false);
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
    await client.listWebhookDeliveries('team-1', 'wh-1', { before_id: 'del-123' });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('before_id=del-123');
  });

  it('listWebhookDeliveries sends limit query param', async () => {
    const fetchMock = mockFetchOk({ deliveries: [], total: 0 });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.listWebhookDeliveries('team-1', 'wh-1', { limit: 5 });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('limit=5');
  });

  it('listWebhookDeliveries sends both before_id and limit query params', async () => {
    const fetchMock = mockFetchOk({ deliveries: [], total: 0 });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.listWebhookDeliveries('team-1', 'wh-1', { before_id: 'del-123', limit: 10 });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('before_id=del-123');
    expect(url).toContain('limit=10');
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

  it('listUsers supports pagination params', async () => {
    const fetchMock = mockFetchOk({ users: [], total: 0 });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.listUsers({ limit: 10, offset: 20 });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('limit=10');
    expect(url).toContain('offset=20');
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
      case 'POST /api/v1/teams/{teamID}/quality-gates': await client.createQualityGate('team-1', 'g', [{ type: 'pass_rate', params: { threshold: 100 } }]); break;
      case 'GET /api/v1/teams/{teamID}/quality-gates/{gateID}': await client.getQualityGate('team-1', 'gate-1'); break;
      case 'PUT /api/v1/teams/{teamID}/quality-gates/{gateID}': await client.updateQualityGate('team-1', 'gate-1', 'g', [{ type: 'pass_rate', params: { threshold: 100 } }]); break;
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
      case 'PUT /api/v1/teams/{teamID}/webhooks/{webhookID}': await client.updateWebhook('team-1', 'wh-1', 'https://example.com', ['report.submitted']); break;
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

// ── Type alignment with server ───────────────────────────────────────────────

describe('type alignment with server responses', () => {
  it('Shard uses test_names (not tests) and includes test_count', () => {
    const shard: Shard = {
      worker_id: 'w-1',
      test_names: ['test-a', 'test-b'],
      est_duration_ms: 5000,
      test_count: 2,
    };
    expect(shard.test_names).toEqual(['test-a', 'test-b']);
    expect(shard.test_count).toBe(2);
  });

  it('QualityGateEvaluation uses details field (matching listEvaluations) with created_at required', () => {
    const evalResult: QualityGateEvaluation = {
      id: 'eval-1',
      gate_id: 'qg-1',
      report_id: 'r-1',
      passed: true,
      details: [],
      created_at: '2024-01-01T00:00:00Z',
    };
    expect(evalResult.details).toEqual([]);
    expect(evalResult.created_at).toBe('2024-01-01T00:00:00Z');
  });

  it('TestDurationHistory has id, min/max, last_status, timestamps (no median_duration_ms)', () => {
    const history: TestDurationHistory = {
      id: 'dur-1',
      test_name: 'Login Test',
      suite: 'auth',
      team_id: 'team-1',
      avg_duration_ms: 1200,
      min_duration_ms: 800,
      max_duration_ms: 2000,
      p95_duration_ms: 1800,
      run_count: 50,
      last_status: 'passed',
      updated_at: '2024-01-15T10:00:00Z',
      created_at: '2024-01-01T00:00:00Z',
    };
    expect(history.id).toBe('dur-1');
    expect(history.min_duration_ms).toBe(800);
    expect(history.max_duration_ms).toBe(2000);
    expect(history.last_status).toBe('passed');
    expect(history.updated_at).toBeDefined();
    expect(history.created_at).toBeDefined();
  });

  it('AuditLog has optional team_id, team_name, resource_type, resource_id', () => {
    const minimalEntry: AuditLog = {
      id: 'log-1',
      actor_id: 'u-1',
      actor_email: 'a@b.com',
      action: 'report.upload',
      created_at: '2024-01-01T00:00:00Z',
    };
    expect(minimalEntry.team_id).toBeUndefined();
    expect(minimalEntry.team_name).toBeUndefined();
    expect(minimalEntry.resource_type).toBeUndefined();
    expect(minimalEntry.resource_id).toBeUndefined();

    const fullEntry: AuditLog = {
      id: 'log-2',
      actor_id: 'u-1',
      actor_email: 'a@b.com',
      team_id: 'team-1',
      team_name: 'My Team',
      action: 'report.upload',
      resource_type: 'report',
      resource_id: 'r-1',
      created_at: '2024-01-01T00:00:00Z',
    };
    expect(fullEntry.team_id).toBe('team-1');
    expect(fullEntry.team_name).toBe('My Team');
  });

  it('WebhookDelivery uses delivered_at (not created_at), optional error and payload', () => {
    const delivery: WebhookDelivery = {
      id: 'del-1',
      webhook_id: 'wh-1',
      url: 'https://example.com/hook',
      event_type: 'report.submitted',
      attempt: 1,
      status_code: 200,
      duration_ms: 150,
      delivered_at: '2024-01-01T00:00:00Z',
    };
    expect(delivery.delivered_at).toBeDefined();
    expect(delivery.error).toBeUndefined();
    expect(delivery.payload).toBeUndefined();

    const deliveryWithError: WebhookDelivery = {
      id: 'del-2',
      webhook_id: 'wh-1',
      url: 'https://example.com/hook',
      event_type: 'report.submitted',
      attempt: 2,
      status_code: 500,
      duration_ms: 300,
      error: 'connection refused',
      payload: { event: 'report.submitted', data: { id: 'r-1' } },
      delivered_at: '2024-01-01T00:00:00Z',
    };
    expect(deliveryWithError.error).toBe('connection refused');
    expect(deliveryWithError.payload).toBeDefined();
  });

  it('getErrorAnalysis returns typed ErrorCluster response', async () => {
    const errorCluster: ErrorCluster = {
      message: 'TypeError: Cannot read property',
      count: 5,
      test_names: ['test-a', 'test-b'],
      first_seen: '2024-01-01T00:00:00Z',
      last_seen: '2024-01-15T00:00:00Z',
    };
    const fetchMock = mockFetchOk({ errors: [errorCluster] });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    const result = await client.getErrorAnalysis();

    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toBe('TypeError: Cannot read property');
    expect(result.errors[0].test_names).toEqual(['test-a', 'test-b']);
  });

  it('getDurationDistribution returns typed DurationBucket response', async () => {
    const bucket: DurationBucket = {
      range: '0-100ms',
      min_ms: 0,
      max_ms: 100,
      count: 42,
    };
    const fetchMock = mockFetchOk({ distribution: [bucket] });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    const result = await client.getDurationDistribution();

    expect(result.distribution).toHaveLength(1);
    expect(result.distribution[0].range).toBe('0-100ms');
    expect(result.distribution[0].count).toBe(42);
  });

  it('Invitation.accepted_at is optional, not string | null (server omits when nil)', () => {
    const pending: Invitation = {
      id: 'inv-1',
      team_id: 'team-1',
      email: 'a@b.com',
      role: 'member',
      invited_by: 'u-1',
      expires_at: '2024-12-31T23:59:59Z',
      created_at: '2024-01-01T00:00:00Z',
    };
    expect(pending.accepted_at).toBeUndefined();

    const accepted: Invitation = {
      id: 'inv-2',
      team_id: 'team-1',
      email: 'c@d.com',
      role: 'maintainer',
      invited_by: 'u-1',
      accepted_at: '2024-01-02T10:00:00Z',
      expires_at: '2024-12-31T23:59:59Z',
      created_at: '2024-01-01T00:00:00Z',
    };
    expect(accepted.accepted_at).toBe('2024-01-02T10:00:00Z');
  });

  it('TeamToken includes team_id, user_id, and optional last_used_at', () => {
    const token: TeamToken = {
      id: 'tok-1',
      team_id: 'team-1',
      user_id: 'u-1',
      name: 'ci-token',
      prefix: 'sct_',
      created_at: '2024-01-01T00:00:00Z',
    };
    expect(token.team_id).toBe('team-1');
    expect(token.user_id).toBe('u-1');
    expect(token.last_used_at).toBeUndefined();

    const usedToken: TeamToken = {
      id: 'tok-2',
      team_id: 'team-1',
      user_id: 'u-2',
      name: 'api-token',
      prefix: 'sct_',
      last_used_at: '2024-06-01T12:00:00Z',
      created_at: '2024-01-01T00:00:00Z',
    };
    expect(usedToken.last_used_at).toBe('2024-06-01T12:00:00Z');
  });

  it('AdminUser includes updated_at (always present from server)', () => {
    const user: AdminUser = {
      id: 'u-1',
      email: 'a@b.com',
      display_name: 'Alice',
      role: 'owner',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-06-15T10:00:00Z',
    };
    expect(user.updated_at).toBe('2024-06-15T10:00:00Z');
  });

  it('getTrends returns wrapped response with trends key', async () => {
    const trendPoint: TrendPoint = {
      date: '2024-01-15',
      total: 100,
      passed: 90,
      failed: 5,
      skipped: 5,
      pass_rate: 0.9,
    };
    const fetchMock = mockFetchOk({ trends: [trendPoint] });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    const result = await client.getTrends();

    expect(result.trends).toHaveLength(1);
    expect(result.trends[0].date).toBe('2024-01-15');
    expect(result.trends[0].skipped).toBe(5);
  });

  it('getFlakyTests returns wrapped response with flaky_tests key', async () => {
    const flaky: FlakyTest = {
      name: 'Login Test',
      flip_count: 3,
      total_runs: 10,
      flip_rate: 0.333,
      last_status: 'failed',
    };
    const fetchMock = mockFetchOk({ flaky_tests: [flaky] });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    const result = await client.getFlakyTests();

    expect(result.flaky_tests).toHaveLength(1);
    expect(result.flaky_tests[0].flip_count).toBe(3);
    expect(result.flaky_tests[0].total_runs).toBe(10);
    expect(result.flaky_tests[0].flip_rate).toBe(0.333);
    expect(result.flaky_tests[0].last_status).toBe('failed');
  });

  it('FlakyTest has flip_rate (not flake_rate), flip_count (not occurrences), total_runs, file_path, last_status', () => {
    const minimal: FlakyTest = {
      name: 'test-a',
      flip_count: 2,
      total_runs: 10,
      flip_rate: 0.2,
      last_status: 'passed',
    };
    expect(minimal.flip_count).toBe(2);
    expect(minimal.total_runs).toBe(10);
    expect(minimal.flip_rate).toBe(0.2);
    expect(minimal.last_status).toBe('passed');
    expect(minimal.file_path).toBeUndefined();

    const full: FlakyTest = {
      name: 'test-b',
      suite: 'auth',
      file_path: 'src/auth.test.ts',
      flip_count: 5,
      total_runs: 20,
      flip_rate: 0.25,
      last_status: 'failed',
    };
    expect(full.file_path).toBe('src/auth.test.ts');
  });

  it('TrendPoint includes skipped field', () => {
    const point: TrendPoint = {
      date: '2024-01-15',
      total: 100,
      passed: 90,
      failed: 5,
      skipped: 5,
      pass_rate: 0.9,
    };
    expect(point.skipped).toBe(5);
  });

  it('QualityGateEvaluation.details uses QualityGateEvalRuleResult with type field', () => {
    const evalResult: QualityGateEvaluation = {
      id: 'eval-1',
      gate_id: 'qg-1',
      report_id: 'r-1',
      passed: true,
      details: [{ type: 'pass_rate', passed: true, threshold: 95, actual: 98, message: 'pass rate 98% >= 95%' }],
      created_at: '2024-01-01T00:00:00Z',
    };
    expect(evalResult.details[0].type).toBe('pass_rate');
    expect(evalResult.details[0].passed).toBe(true);
  });

  it('QualityGateRuleResult uses metric field (for evaluate endpoint)', () => {
    const rule: QualityGateRuleResult = {
      metric: 'pass_rate',
      threshold: 95,
      actual: 98,
      passed: true,
      message: 'pass rate 98% >= 95%',
    };
    expect(rule.metric).toBe('pass_rate');
  });

  it('EvaluateQualityGateResponse uses rules (not details) and has no created_at', () => {
    const response: EvaluateQualityGateResponse = {
      id: 'eval-1',
      gate_id: 'qg-1',
      report_id: 'r-1',
      passed: true,
      rules: [{ metric: 'pass_rate', threshold: 95, actual: 98, passed: true, message: 'pass rate ok' }],
    };
    expect(response.rules).toHaveLength(1);
    expect(response.rules[0].metric).toBe('pass_rate');
  });

  it('Execution has config, report_id, k8s fields, error_msg, updated_at', () => {
    const full: Execution = {
      id: 'e-1',
      team_id: 'team-1',
      command: 'npm test',
      status: 'running',
      config: { image: 'node:18', env_vars: { NODE_ENV: 'test' } },
      report_id: 'r-1',
      k8s_job_name: 'test-job-123',
      k8s_pod_name: 'test-pod-456',
      error_msg: 'something failed',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-02T00:00:00Z',
      started_at: '2024-01-01T01:00:00Z',
      finished_at: '2024-01-01T02:00:00Z',
    };
    expect(full.config).toBeDefined();
    expect(full.report_id).toBe('r-1');
    expect(full.k8s_job_name).toBe('test-job-123');
    expect(full.k8s_pod_name).toBe('test-pod-456');
    expect(full.error_msg).toBe('something failed');
    expect(full.updated_at).toBe('2024-01-02T00:00:00Z');

    const minimal: Execution = {
      id: 'e-2',
      team_id: 'team-1',
      command: 'npm test',
      status: 'pending',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };
    expect(minimal.config).toBeUndefined();
    expect(minimal.report_id).toBeUndefined();
    expect(minimal.k8s_job_name).toBeUndefined();
  });

  it('Report has required name field and required start/stop in summary', () => {
    const report: Report = {
      id: 'r-1',
      team_id: 'team-1',
      name: 'My Report',
      tool_name: 'jest',
      summary: { tests: 10, passed: 9, failed: 1, skipped: 0, pending: 0, other: 0, start: 1700000000, stop: 1700001000 },
      created_at: '2024-01-01T00:00:00Z',
    };
    expect(report.name).toBe('My Report');
    expect(report.summary.start).toBe(1700000000);
    expect(report.summary.stop).toBe(1700001000);
  });

  it('Team has no role field; TeamWithRole extends Team with role', () => {
    const team: Team = {
      id: 't-1',
      name: 'My Team',
      created_at: '2024-01-01T00:00:00Z',
    };
    expect('role' in team).toBe(false);

    const teamWithRole: TeamWithRole = {
      id: 't-2',
      name: 'Other Team',
      role: 'owner',
      created_at: '2024-01-01T00:00:00Z',
    };
    expect(teamWithRole.role).toBe('owner');
  });

  it('uploadReport returns full UploadReportResponse type', async () => {
    const response: UploadReportResponse = {
      id: 'r-1',
      message: 'report accepted',
      tool: 'jest',
      tests: 42,
      results: 42,
    };
    expect(response.id).toBe('r-1');
    expect(response.message).toBe('report accepted');
    expect(response.execution_id).toBeUndefined();
    expect(response.qualityGate).toBeUndefined();

    const withGate: UploadReportResponse = {
      id: 'r-2',
      message: 'report accepted',
      tool: 'jest',
      tests: 10,
      results: 10,
      execution_id: 'e-1',
      qualityGate: {
        passed: true,
        gates: [{ id: 'qg-1', name: 'prod-gate', passed: true, rules: [{ metric: 'pass_rate', threshold: 95, actual: 98, passed: true, message: 'pass rate ok' }] }],
      },
    };
    expect(withGate.execution_id).toBe('e-1');
    expect(withGate.qualityGate?.passed).toBe(true);
  });

  it('createExecution returns CreateExecutionResponse with id, status, command', async () => {
    const fetchMock = mockFetchOk({ id: 'e-1', status: 'pending', command: 'npm test' });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    const result = await client.createExecution('npm test');

    expect(result.id).toBe('e-1');
    expect(result.status).toBe('pending');
    expect(result.command).toBe('npm test');
  });

  it('ReportTriageResult has required clusters and metadata', () => {
    const result: ReportTriageResult = {
      triage_status: 'completed',
      clusters: [],
      metadata: { generated_at: '2024-01-01T00:00:00Z' },
    };
    expect(result.clusters).toEqual([]);
    expect(result.metadata.generated_at).toBe('2024-01-01T00:00:00Z');
    expect(result.metadata.model).toBeUndefined();

    const resultWithModel: ReportTriageResult = {
      triage_status: 'completed',
      clusters: [{ id: 'c-1', root_cause: 'timeout', failures: [{ test_result_id: 'tr-1', classification: 'flaky' }] }],
      metadata: { generated_at: '2024-01-01T00:00:00Z', model: 'gpt-4' },
    };
    expect(resultWithModel.clusters).toHaveLength(1);
    expect(resultWithModel.metadata.model).toBe('gpt-4');
  });

  it('WebhookEventType restricts events to server-supported values', () => {
    const event: WebhookEventType = 'report.submitted';
    expect(event).toBe('report.submitted');
    const allEvents: WebhookEventType[] = [
      'report.submitted',
      'gate.failed',
      'execution.completed',
      'execution.failed',
      'run.triage_complete',
    ];
    expect(allEvents).toHaveLength(5);
  });

  it('ExecutionStatus covers all server-validated values', () => {
    const allStatuses: ExecutionStatus[] = ['pending', 'running', 'completed', 'failed', 'cancelled'];
    expect(allStatuses).toHaveLength(5);
  });

  it('UpdateExecutionStatus excludes pending — only running/completed/failed/cancelled', () => {
    const validStatuses: UpdateExecutionStatus[] = ['running', 'completed', 'failed', 'cancelled'];
    expect(validStatuses).toHaveLength(4);
  });

  it('TestResultStatus covers all server-validated values', () => {
    const allStatuses: TestResultStatus[] = ['passed', 'failed', 'skipped', 'pending', 'other'];
    expect(allStatuses).toHaveLength(5);
  });

  it('WorkerStatus covers all server-validated values', () => {
    const allStatuses: WorkerStatus[] = ['starting', 'running', 'idle', 'completed', 'failed'];
    expect(allStatuses).toHaveLength(5);
  });

  it('Execution.status uses ExecutionStatus type', () => {
    const exec: Execution = {
      id: 'e-1',
      team_id: 'team-1',
      command: 'npm test',
      status: 'running',
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };
    expect(exec.status).toBe('running');
  });

  it('createWebhook and updateWebhook accept WebhookEventType[] not string[]', async () => {
    const fetchMock = mockFetchOk({ webhook: { id: 'wh-1', url: '', events: [], team_id: '', enabled: true, created_at: '', updated_at: '' }, secret: 's' });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    const events: WebhookEventType[] = ['report.submitted', 'gate.failed'];
    await client.createWebhook('team-1', 'https://example.com', events);

    const body = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
    expect(body.events).toEqual(['report.submitted', 'gate.failed']);
  });

  it('cancelExecution returns {id, status} not void', async () => {
    const fetchMock = mockFetchOk({ id: 'e-1', status: 'cancelled' });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    const result = await client.cancelExecution('e-1');
    expect(result).toEqual({ id: 'e-1', status: 'cancelled' });
  });

  it('deleteExecution returns {id, status} not void', async () => {
    const fetchMock = mockFetchOk({ id: 'e-2', status: 'cancelled' });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    const result = await client.deleteExecution('e-2');
    expect(result).toEqual({ id: 'e-2', status: 'cancelled' });
  });

  it('Report.summary has required start and stop fields', () => {
    const report: Report = {
      id: 'r-1',
      team_id: 'team-1',
      name: 'Report r-1',
      tool_name: 'jest',
      summary: { tests: 10, passed: 9, failed: 1, skipped: 0, pending: 0, other: 0, start: 1700000000, stop: 1700001000 },
      created_at: '2024-01-01T00:00:00Z',
    };
    expect(report.summary.start).toBe(1700000000);
    expect(report.summary.stop).toBe(1700001000);
  });

  it('QualityGateRule.params is required (not optional) and accepts null', () => {
    const ruleWithParams: QualityGateRule = {
      type: 'pass_rate',
      params: { threshold: 95 },
    };
    expect(ruleWithParams.params).toEqual({ threshold: 95 });

    const ruleNoParams: QualityGateRule = {
      type: 'zero_failures',
      params: null,
    };
    expect(ruleNoParams.params).toBeNull();
  });

  it('QualityGateRuleResult threshold and actual are number type', () => {
    const result: QualityGateRuleResult = {
      metric: 'pass_rate',
      threshold: 95,
      actual: 98.5,
      passed: true,
      message: 'pass rate ok',
    };
    expect(result.threshold).toBe(95);
    expect(result.actual).toBe(98.5);
  });

  it('QualityGateEvalRuleResult threshold and actual are number type', () => {
    const result: QualityGateEvalRuleResult = {
      type: 'pass_rate',
      threshold: 95,
      actual: 88.5,
      passed: false,
      message: 'pass rate 88.5% < 95%',
    };
    expect(result.threshold).toBe(95);
    expect(result.actual).toBe(88.5);
  });

  it('Report.environment accepts Record<string, unknown> values', () => {
    const report: Report = {
      id: 'r-1',
      team_id: 'team-1',
      name: 'Report',
      tool_name: 'jest',
      summary: { tests: 1, passed: 1, failed: 0, skipped: 0, pending: 0, other: 0, start: 0, stop: 1 },
      created_at: '2024-01-01T00:00:00Z',
      environment: { CI: true, nested: { key: 'value' } },
    };
    expect((report.environment as Record<string, unknown>)?.CI).toBe(true);
  });
});