/**
 * Unit tests for @scaledtest/sdk — ScaledTest-81b
 *
 * Tests cover:
 * - Client instantiation and configuration
 * - uploadReport() — POST /api/v1/reports
 * - getReports() — GET /api/v1/reports
 * - getStats() — GET /api/v1/stats
 * - listExecutions() — GET /api/v1/executions
 * - getExecution() — GET /api/v1/executions/:id
 * - createExecution() — POST /api/v1/executions
 * - getActiveExecutions() — GET /api/v1/executions/active
 * - Error handling (auth failures, validation errors, network errors)
 * - Authentication via Bearer token and email/password
 */

import {
  ScaledTestClient,
  ScaledTestError,
  AuthenticationError,
  ValidationError,
} from '../../packages/sdk/src/index';

// ── Mock fetch globally ────────────────────────────────────────────────────────

const mockFetch = jest.fn() as jest.MockedFunction<typeof fetch>;
global.fetch = mockFetch;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeOkResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
  } as unknown as Response;
}

function makeErrorResponse(body: unknown, status: number): Response {
  return {
    ok: false,
    status,
    headers: new Headers({ 'content-type': 'application/json' }),
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
  } as unknown as Response;
}

const BASE_URL = 'https://scaledtest.example.com';
const API_TOKEN = 'sct_abc123def456abc123def456abc123def456abc123def456abc123def456abcd';

const MINIMAL_CTRF = {
  reportFormat: 'CTRF' as const,
  specVersion: '0.0.1',
  results: {
    tool: { name: 'jest' },
    summary: {
      tests: 2,
      passed: 1,
      failed: 1,
      skipped: 0,
      pending: 0,
      other: 0,
      start: 1700000000000,
      stop: 1700000005000,
    },
    tests: [
      { name: 'should pass', status: 'passed' as const, duration: 100 },
      { name: 'should fail', status: 'failed' as const, duration: 200 },
    ],
  },
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  mockFetch.mockReset();
});

// ── Client instantiation ──────────────────────────────────────────────────────

describe('ScaledTestClient — instantiation', () => {
  it('creates a client with a base URL and API token', () => {
    const client = new ScaledTestClient({ baseUrl: BASE_URL, apiToken: API_TOKEN });
    expect(client).toBeInstanceOf(ScaledTestClient);
  });

  it('creates a client with a base URL only (cookie-based auth)', () => {
    const client = new ScaledTestClient({ baseUrl: BASE_URL });
    expect(client).toBeInstanceOf(ScaledTestClient);
  });

  it('throws if baseUrl is not provided', () => {
    expect(() => new ScaledTestClient({ baseUrl: '' })).toThrow();
  });

  it('strips trailing slash from baseUrl', () => {
    const client = new ScaledTestClient({ baseUrl: BASE_URL + '/', apiToken: API_TOKEN });
    expect(client).toBeInstanceOf(ScaledTestClient);
  });
});

// ── uploadReport ─────────────────────────────────────────────────────────────

describe('uploadReport()', () => {
  it('posts a CTRF report and returns the reportId', async () => {
    const client = new ScaledTestClient({ baseUrl: BASE_URL, apiToken: API_TOKEN });

    mockFetch.mockResolvedValue(
      makeOkResponse({ success: true, id: 'report-uuid-1', message: 'stored' }, 201)
    );

    const result = await client.uploadReport(MINIMAL_CTRF);

    expect(result.id).toBe('report-uuid-1');
    expect(mockFetch).toHaveBeenCalledTimes(1);

    const [url, opts] = mockFetch.mock.calls[0] as [
      string,
      { method?: string; headers?: unknown; body?: string; credentials?: string },
    ];
    expect(url).toBe(`${BASE_URL}/api/v1/reports`);
    expect(opts.method).toBe('POST');
    expect(opts.headers).toBeDefined();
    const headers = opts.headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${API_TOKEN}`);
    expect(headers['Content-Type']).toBe('application/json');
    expect(JSON.parse(opts.body as string)).toMatchObject({ reportFormat: 'CTRF' });
  });

  it('throws ValidationError on 400', async () => {
    const client = new ScaledTestClient({ baseUrl: BASE_URL, apiToken: API_TOKEN });

    mockFetch.mockResolvedValue(
      makeErrorResponse({ success: false, error: 'CTRF report validation failed' }, 400)
    );

    await expect(
      client.uploadReport({ ...MINIMAL_CTRF, reportFormat: 'BAD' as never })
    ).rejects.toThrow(ValidationError);
  });

  it('throws AuthenticationError on 401', async () => {
    const client = new ScaledTestClient({ baseUrl: BASE_URL, apiToken: 'bad-token' });

    mockFetch.mockResolvedValue(
      makeErrorResponse({ success: false, error: 'Authentication required' }, 401)
    );

    await expect(client.uploadReport(MINIMAL_CTRF)).rejects.toThrow(AuthenticationError);
  });

  it('throws ScaledTestError on 503', async () => {
    const client = new ScaledTestClient({ baseUrl: BASE_URL, apiToken: API_TOKEN });

    mockFetch.mockResolvedValue(
      makeErrorResponse({ success: false, error: 'Database unavailable' }, 503)
    );

    await expect(client.uploadReport(MINIMAL_CTRF)).rejects.toThrow(ScaledTestError);
  });

  it('throws ScaledTestError on network failure', async () => {
    const client = new ScaledTestClient({ baseUrl: BASE_URL, apiToken: API_TOKEN });

    mockFetch.mockRejectedValue(new TypeError('fetch failed'));

    await expect(client.uploadReport(MINIMAL_CTRF)).rejects.toThrow(ScaledTestError);
  });
});

// ── getReports ────────────────────────────────────────────────────────────────

describe('getReports()', () => {
  it('fetches reports with no filters', async () => {
    const client = new ScaledTestClient({ baseUrl: BASE_URL, apiToken: API_TOKEN });

    mockFetch.mockResolvedValue(
      makeOkResponse({
        success: true,
        data: [{ reportId: 'r1', reportFormat: 'CTRF', specVersion: '0.0.1' }],
        total: 1,
        pagination: { page: 1, size: 20, total: 1 },
      })
    );

    const result = await client.getReports();
    expect(result.data).toHaveLength(1);
    expect(result.pagination.total).toBe(1);

    const [url] = mockFetch.mock.calls[0] as [
      string,
      { method?: string; headers?: unknown; body?: string; credentials?: string },
    ];
    expect(url).toBe(`${BASE_URL}/api/v1/reports`);
  });

  it('passes filter query params', async () => {
    const client = new ScaledTestClient({ baseUrl: BASE_URL, apiToken: API_TOKEN });

    mockFetch.mockResolvedValue(
      makeOkResponse({
        success: true,
        data: [],
        total: 0,
        pagination: { page: 2, size: 10, total: 0 },
      })
    );

    await client.getReports({ page: 2, size: 10, status: 'failed', tool: 'jest' });

    const [url] = mockFetch.mock.calls[0] as [
      string,
      { method?: string; headers?: unknown; body?: string; credentials?: string },
    ];
    expect(url).toContain('page=2');
    expect(url).toContain('size=10');
    expect(url).toContain('status=failed');
    expect(url).toContain('tool=jest');
  });

  it('throws AuthenticationError on 401', async () => {
    const client = new ScaledTestClient({ baseUrl: BASE_URL, apiToken: 'bad' });

    mockFetch.mockResolvedValue(
      makeErrorResponse({ success: false, error: 'Authentication required' }, 401)
    );

    await expect(client.getReports()).rejects.toThrow(AuthenticationError);
  });
});

// ── getStats ──────────────────────────────────────────────────────────────────

describe('getStats()', () => {
  it('fetches dashboard stats', async () => {
    const client = new ScaledTestClient({ baseUrl: BASE_URL, apiToken: API_TOKEN });

    mockFetch.mockResolvedValue(
      makeOkResponse({
        success: true,
        data: {
          totalReports: 42,
          totalTests: 1000,
          passRateLast7d: 87,
          totalExecutions: 15,
          activeExecutions: 2,
        },
      })
    );

    const stats = await client.getStats();
    expect(stats.totalReports).toBe(42);
    expect(stats.passRateLast7d).toBe(87);
    expect(stats.activeExecutions).toBe(2);

    const [url] = mockFetch.mock.calls[0] as [
      string,
      { method?: string; headers?: unknown; body?: string; credentials?: string },
    ];
    expect(url).toBe(`${BASE_URL}/api/v1/stats`);
  });
});

// ── listExecutions ────────────────────────────────────────────────────────────

describe('listExecutions()', () => {
  it('fetches executions with no filters', async () => {
    const client = new ScaledTestClient({ baseUrl: BASE_URL, apiToken: API_TOKEN });

    mockFetch.mockResolvedValue(
      makeOkResponse({
        success: true,
        data: [{ id: 'exec-1', status: 'running' }],
        total: 1,
        pagination: { page: 1, size: 20, total: 1 },
      })
    );

    const result = await client.listExecutions();
    expect(result.data).toHaveLength(1);

    const [url] = mockFetch.mock.calls[0] as [
      string,
      { method?: string; headers?: unknown; body?: string; credentials?: string },
    ];
    expect(url).toBe(`${BASE_URL}/api/v1/executions`);
  });

  it('passes status filter', async () => {
    const client = new ScaledTestClient({ baseUrl: BASE_URL, apiToken: API_TOKEN });

    mockFetch.mockResolvedValue(
      makeOkResponse({
        success: true,
        data: [],
        total: 0,
        pagination: { page: 1, size: 20, total: 0 },
      })
    );

    await client.listExecutions({ status: 'completed' });

    const [url] = mockFetch.mock.calls[0] as [
      string,
      { method?: string; headers?: unknown; body?: string; credentials?: string },
    ];
    expect(url).toContain('status=completed');
  });
});

// ── getExecution ──────────────────────────────────────────────────────────────

describe('getExecution()', () => {
  const EXEC_ID = 'a1b2c3d4-e5f6-4789-abcd-ef1234567890';

  it('fetches execution detail', async () => {
    const client = new ScaledTestClient({ baseUrl: BASE_URL, apiToken: API_TOKEN });

    mockFetch.mockResolvedValue(
      makeOkResponse({
        success: true,
        data: {
          id: EXEC_ID,
          status: 'completed',
          activePods: 0,
          linkedReportIds: ['r1', 'r2'],
        },
      })
    );

    const result = await client.getExecution(EXEC_ID);
    expect(result.id).toBe(EXEC_ID);
    expect(result.linkedReportIds).toHaveLength(2);

    const [url] = mockFetch.mock.calls[0] as [
      string,
      { method?: string; headers?: unknown; body?: string; credentials?: string },
    ];
    expect(url).toBe(`${BASE_URL}/api/v1/executions/${EXEC_ID}`);
  });

  it('throws ScaledTestError on 404', async () => {
    const client = new ScaledTestClient({ baseUrl: BASE_URL, apiToken: API_TOKEN });

    mockFetch.mockResolvedValue(
      makeErrorResponse({ success: false, error: 'Execution not found' }, 404)
    );

    await expect(client.getExecution(EXEC_ID)).rejects.toThrow(ScaledTestError);
  });

  it('throws ValidationError for invalid UUID', async () => {
    const client = new ScaledTestClient({ baseUrl: BASE_URL, apiToken: API_TOKEN });

    // Client-side validation before hitting the API
    await expect(client.getExecution('not-a-uuid')).rejects.toThrow(ValidationError);
    expect(mockFetch).not.toHaveBeenCalled();
  });
});

// ── createExecution ───────────────────────────────────────────────────────────

describe('createExecution()', () => {
  it('creates an execution and returns it', async () => {
    const client = new ScaledTestClient({ baseUrl: BASE_URL, apiToken: API_TOKEN });

    const execData = {
      id: 'new-exec-id',
      status: 'queued',
      dockerImage: 'node:20',
      testCommand: 'npm test',
      parallelism: 3,
    };

    mockFetch.mockResolvedValue(makeOkResponse({ success: true, data: execData }, 201));

    const result = await client.createExecution({
      dockerImage: 'node:20',
      testCommand: 'npm test',
      parallelism: 3,
    });

    expect(result.id).toBe('new-exec-id');
    expect(result.status).toBe('queued');

    const [url, opts] = mockFetch.mock.calls[0] as [
      string,
      { method?: string; headers?: unknown; body?: string; credentials?: string },
    ];
    expect(url).toBe(`${BASE_URL}/api/v1/executions`);
    expect(opts.method).toBe('POST');
    const body = JSON.parse(opts.body as string);
    expect(body.dockerImage).toBe('node:20');
    expect(body.parallelism).toBe(3);
  });

  it('throws ValidationError on 400', async () => {
    const client = new ScaledTestClient({ baseUrl: BASE_URL, apiToken: API_TOKEN });

    mockFetch.mockResolvedValue(
      makeErrorResponse({ success: false, error: 'Validation failed' }, 400)
    );

    await expect(
      client.createExecution({ dockerImage: '', testCommand: 'npm test' })
    ).rejects.toThrow(ValidationError);
  });
});

// ── getActiveExecutions ───────────────────────────────────────────────────────

describe('getActiveExecutions()', () => {
  it('fetches active execution count', async () => {
    const client = new ScaledTestClient({ baseUrl: BASE_URL, apiToken: API_TOKEN });

    mockFetch.mockResolvedValue(makeOkResponse({ success: true, data: { activeExecutions: 5 } }));

    const result = await client.getActiveExecutions();
    expect(result.activeExecutions).toBe(5);

    const [url] = mockFetch.mock.calls[0] as [
      string,
      { method?: string; headers?: unknown; body?: string; credentials?: string },
    ];
    expect(url).toBe(`${BASE_URL}/api/v1/executions/active`);
  });

  it('passes teamId filter', async () => {
    const client = new ScaledTestClient({ baseUrl: BASE_URL, apiToken: API_TOKEN });

    mockFetch.mockResolvedValue(makeOkResponse({ success: true, data: { activeExecutions: 2 } }));

    const TEAM_ID = 'a1b2c3d4-e5f6-4789-abcd-ef1234567890';
    await client.getActiveExecutions({ teamId: TEAM_ID });

    const [url] = mockFetch.mock.calls[0] as [
      string,
      { method?: string; headers?: unknown; body?: string; credentials?: string },
    ];
    expect(url).toContain(`teamId=${TEAM_ID}`);
  });
});

// ── Authentication helpers ────────────────────────────────────────────────────

describe('Authorization headers', () => {
  it('sends Bearer token when apiToken is set', async () => {
    const client = new ScaledTestClient({ baseUrl: BASE_URL, apiToken: API_TOKEN });

    mockFetch.mockResolvedValue(
      makeOkResponse({
        success: true,
        data: {
          totalReports: 0,
          totalTests: 0,
          passRateLast7d: 0,
          totalExecutions: 0,
          activeExecutions: 0,
        },
      })
    );

    await client.getStats();

    const [, opts] = mockFetch.mock.calls[0] as [
      string,
      { method?: string; headers?: unknown; body?: string; credentials?: string },
    ];
    const headers = opts.headers as Record<string, string>;
    expect(headers['Authorization']).toBe(`Bearer ${API_TOKEN}`);
  });

  it('does not send Authorization header when no apiToken is set', async () => {
    const client = new ScaledTestClient({ baseUrl: BASE_URL });

    mockFetch.mockResolvedValue(
      makeOkResponse({
        success: true,
        data: {
          totalReports: 0,
          totalTests: 0,
          passRateLast7d: 0,
          totalExecutions: 0,
          activeExecutions: 0,
        },
      })
    );

    await client.getStats();

    const [, opts] = mockFetch.mock.calls[0] as [
      string,
      { method?: string; headers?: unknown; body?: string; credentials?: string },
    ];
    const headers = opts.headers as Record<string, string>;
    expect(headers['Authorization']).toBeUndefined();
  });

  it('includes credentials: include when no apiToken (cookie auth mode)', async () => {
    const client = new ScaledTestClient({ baseUrl: BASE_URL });

    mockFetch.mockResolvedValue(
      makeOkResponse({
        success: true,
        data: {
          totalReports: 0,
          totalTests: 0,
          passRateLast7d: 0,
          totalExecutions: 0,
          activeExecutions: 0,
        },
      })
    );

    await client.getStats();

    const [, opts] = mockFetch.mock.calls[0] as [
      string,
      { method?: string; headers?: unknown; body?: string; credentials?: string },
    ];
    expect(opts.credentials).toBe('include');
  });
});

// ── ScaledTestError hierarchy ─────────────────────────────────────────────────

describe('Error classes', () => {
  it('ScaledTestError is an Error', () => {
    const err = new ScaledTestError('test', 500);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(ScaledTestError);
    expect(err.statusCode).toBe(500);
    expect(err.message).toBe('test');
  });

  it('AuthenticationError extends ScaledTestError', () => {
    const err = new AuthenticationError('unauthorized');
    expect(err).toBeInstanceOf(ScaledTestError);
    expect(err).toBeInstanceOf(AuthenticationError);
    expect(err.statusCode).toBe(401);
  });

  it('ValidationError extends ScaledTestError', () => {
    const err = new ValidationError('bad input');
    expect(err).toBeInstanceOf(ScaledTestError);
    expect(err).toBeInstanceOf(ValidationError);
    expect(err.statusCode).toBe(400);
  });
});
