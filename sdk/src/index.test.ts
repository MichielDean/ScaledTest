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

  it('cancelExecution sends DELETE /api/v1/executions/{id}', async () => {
    const fetchMock = mockFetchOk({});
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.cancelExecution('e-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/executions/e-1`);
    expect((init as RequestInit).method).toBe('DELETE');
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
    const rules = [{ type: 'pass_rate', threshold: 95 }];
    const fetchMock = mockFetchOk({ id: 'qg-1', name: 'prod-gate', rules });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.createQualityGate('team-1', 'prod-gate', rules);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/teams/team-1/quality-gates`);
    expect((init as RequestInit).method).toBe('POST');
    const body = JSON.parse((init as RequestInit).body as string);
    expect(body).toEqual({ name: 'prod-gate', rules });
  });

  it('evaluateQualityGate sends POST /api/v1/teams/{teamId}/quality-gates/{id}/evaluate', async () => {
    const fetchMock = mockFetchOk({ id: 'eval-1', passed: true });
    globalThis.fetch = fetchMock;
    const client = makeClient();
    await client.evaluateQualityGate('team-1', 'qg-1');

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`${BASE}/api/v1/teams/team-1/quality-gates/qg-1/evaluate`);
    expect((init as RequestInit).method).toBe('POST');
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
});

// ── Endpoint alignment with routes.go ────────────────────────────────────────

describe('endpoint alignment with routes.go', () => {
  // These tests document the expected URL paths that must match
  // internal/server/routes.go route definitions.
  const routes = [
    { method: 'GET', path: '/api/v1/reports' },
    { method: 'POST', path: '/api/v1/reports' },
    { method: 'GET', path: '/api/v1/reports/{id}' },
    { method: 'GET', path: '/api/v1/executions' },
    { method: 'POST', path: '/api/v1/executions' },
    { method: 'DELETE', path: '/api/v1/executions/{id}' },
    { method: 'GET', path: '/api/v1/analytics/trends' },
    { method: 'GET', path: '/api/v1/analytics/flaky-tests' },
    { method: 'GET', path: '/api/v1/analytics/error-analysis' },
    { method: 'GET', path: '/api/v1/analytics/duration-distribution' },
    { method: 'GET', path: '/api/v1/teams/{teamID}/quality-gates' },
    { method: 'POST', path: '/api/v1/teams/{teamID}/quality-gates' },
    { method: 'POST', path: '/api/v1/teams/{teamID}/quality-gates/{gateID}/evaluate' },
    { method: 'GET', path: '/api/v1/teams' },
    { method: 'POST', path: '/api/v1/teams' },
  ];

  it.each(routes)('SDK covers $method $path', async ({ method, path }) => {
    const fetchMock = mockFetchOk({});
    globalThis.fetch = fetchMock;
    const client = makeClient();

    // Call the corresponding SDK method
    const resolvedPath = path
      .replace('{id}', 'test-id')
      .replace('{teamID}', 'team-1')
      .replace('{gateID}', 'gate-1');

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
      case 'GET /api/v1/executions': await client.getExecutions(); break;
      case 'POST /api/v1/executions': await client.createExecution('cmd'); break;
      case 'DELETE /api/v1/executions/{id}': await client.cancelExecution('test-id'); break;
      case 'GET /api/v1/analytics/trends': await client.getTrends(); break;
      case 'GET /api/v1/analytics/flaky-tests': await client.getFlakyTests(); break;
      case 'GET /api/v1/analytics/error-analysis': await client.getErrorAnalysis(); break;
      case 'GET /api/v1/analytics/duration-distribution': await client.getDurationDistribution(); break;
      case 'GET /api/v1/teams/{teamID}/quality-gates': await client.getQualityGates('team-1'); break;
      case 'POST /api/v1/teams/{teamID}/quality-gates': await client.createQualityGate('team-1', 'g', []); break;
      case 'POST /api/v1/teams/{teamID}/quality-gates/{gateID}/evaluate': await client.evaluateQualityGate('team-1', 'gate-1'); break;
      case 'GET /api/v1/teams': await client.getTeams(); break;
      case 'POST /api/v1/teams': await client.createTeam('t'); break;
    }

    const calledUrl = fetchMock.mock.calls[0][0] as string;
    const calledMethod = (fetchMock.mock.calls[0][1] as RequestInit).method;
    expect(calledUrl).toBe(`${BASE}${resolvedPath}`);
    expect(calledMethod).toBe(method);
  });
});
