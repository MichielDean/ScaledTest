/**
 * Unit tests for @scaledtest/sdk — ScaledTest-81b
 *
 * Tests cover:
 * - ScaledTestClient constructor validation
 * - uploadReport() — POST /api/v1/reports
 * - getReports() — GET /api/v1/reports
 * - getStats() — GET /api/v1/stats
 * - listTeams() — GET /api/v1/teams
 * - listExecutions() — GET /api/v1/executions
 * - getExecutionDetail() — GET /api/v1/executions/{id}
 * - createExecution() — POST /api/v1/executions
 * - submitExecutionResults() — POST /api/v1/executions/{id}/results
 * - cancelExecution() — DELETE /api/v1/executions/{id}
 * - getActiveExecutions() — GET /api/v1/executions/active
 * - Error wrapping and status code handling
 */

// ── Mocks ──────────────────────────────────────────────────────────────────────

const mockFetch = jest.fn();
global.fetch = mockFetch;

// ── Import ────────────────────────────────────────────────────────────────────

import {
  ScaledTestClient,
  ScaledTestError,
  type GetReportsOptions,
  type ListExecutionsOptions,
} from '../../src/sdk/index';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeOkResponse(body: unknown, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
  } as unknown as Response;
}

function makeErrorResponse(body: unknown, status: number) {
  return {
    ok: false,
    status,
    json: jest.fn().mockResolvedValue(body),
    text: jest.fn().mockResolvedValue(JSON.stringify(body)),
  } as unknown as Response;
}

const MINIMAL_CTRF_REPORT = {
  reportFormat: 'CTRF',
  specVersion: '0.0.0',
  results: {
    tool: { name: 'jest' },
    summary: {
      tests: 2,
      passed: 2,
      failed: 0,
      pending: 0,
      skipped: 0,
      other: 0,
      start: 1000,
      stop: 2000,
    },
    tests: [],
  },
};

// ── Constructor tests ─────────────────────────────────────────────────────────

describe('ScaledTestClient — constructor', () => {
  it('throws if baseUrl is empty', () => {
    expect(() => new ScaledTestClient({ baseUrl: '', token: 'sct_test' })).toThrow();
  });

  it('throws if token is empty', () => {
    expect(() => new ScaledTestClient({ baseUrl: 'http://localhost:3000', token: '' })).toThrow();
  });

  it('constructs without error given valid options', () => {
    expect(
      () => new ScaledTestClient({ baseUrl: 'http://localhost:3000', token: 'sct_abc' })
    ).not.toThrow();
  });

  it('strips trailing slash from baseUrl', () => {
    const client = new ScaledTestClient({
      baseUrl: 'http://localhost:3000/',
      token: 'sct_abc',
    });
    mockFetch.mockResolvedValueOnce(
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
    return client.getStats().then(() => {
      const calledUrl: string = mockFetch.mock.calls[0][0];
      expect(calledUrl).not.toContain('//api');
    });
  });
});

// ── uploadReport ──────────────────────────────────────────────────────────────

describe('ScaledTestClient.uploadReport()', () => {
  let client: ScaledTestClient;
  beforeEach(() => {
    jest.clearAllMocks();
    client = new ScaledTestClient({ baseUrl: 'http://localhost:3000', token: 'sct_abc' });
  });

  it('POSTs to /api/v1/reports with the CTRF payload', async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ success: true, id: 'report-1', message: 'stored' })
    );
    const result = await client.uploadReport({ report: MINIMAL_CTRF_REPORT });
    expect(mockFetch).toHaveBeenCalledWith(
      'http://localhost:3000/api/v1/reports',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(MINIMAL_CTRF_REPORT),
      })
    );
    expect(result.id).toBe('report-1');
  });

  it('sends Authorization header with Bearer token', async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ success: true, id: 'report-1', message: 'stored' })
    );
    await client.uploadReport({ report: MINIMAL_CTRF_REPORT });
    const headers: Record<string, string> = mockFetch.mock.calls[0][1].headers;
    expect(headers['Authorization']).toBe('Bearer sct_abc');
  });

  it('sends Content-Type: application/json', async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ success: true, id: 'report-2', message: 'stored' })
    );
    await client.uploadReport({ report: MINIMAL_CTRF_REPORT });
    const headers: Record<string, string> = mockFetch.mock.calls[0][1].headers;
    expect(headers['Content-Type']).toBe('application/json');
  });

  it('throws ScaledTestError on 400', async () => {
    mockFetch.mockResolvedValueOnce(
      makeErrorResponse({ success: false, error: 'validation failed' }, 400)
    );
    await expect(client.uploadReport({ report: MINIMAL_CTRF_REPORT })).rejects.toThrow(
      ScaledTestError
    );
  });

  it('thrown error contains status code on 400', async () => {
    // expect.assertions(2) guards against the catch block never running
    expect.assertions(2);
    mockFetch.mockResolvedValueOnce(
      makeErrorResponse({ success: false, error: 'validation failed' }, 400)
    );
    try {
      await client.uploadReport({ report: MINIMAL_CTRF_REPORT });
    } catch (e) {
      expect(e).toBeInstanceOf(ScaledTestError);
      expect((e as ScaledTestError).status).toBe(400);
    }
  });

  it('throws ScaledTestError on 401', async () => {
    mockFetch.mockResolvedValueOnce(
      makeErrorResponse({ success: false, error: 'Authentication required' }, 401)
    );
    await expect(client.uploadReport({ report: MINIMAL_CTRF_REPORT })).rejects.toThrow(
      ScaledTestError
    );
  });

  it('throws ScaledTestError on 503', async () => {
    mockFetch.mockResolvedValueOnce(
      makeErrorResponse({ success: false, error: 'Database service unavailable' }, 503)
    );
    await expect(client.uploadReport({ report: MINIMAL_CTRF_REPORT })).rejects.toThrow(
      ScaledTestError
    );
  });

  it('throws on network error (fetch throws)', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network failure'));
    await expect(client.uploadReport({ report: MINIMAL_CTRF_REPORT })).rejects.toThrow(
      'Network failure'
    );
  });
});

// ── getReports ────────────────────────────────────────────────────────────────

describe('ScaledTestClient.getReports()', () => {
  let client: ScaledTestClient;
  beforeEach(() => {
    jest.clearAllMocks();
    client = new ScaledTestClient({ baseUrl: 'http://localhost:3000', token: 'sct_abc' });
  });

  it('GETs /api/v1/reports', async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({
        success: true,
        data: [],
        total: 0,
        pagination: { page: 1, size: 20, total: 0 },
      })
    );
    await client.getReports();
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringContaining('/api/v1/reports'),
      expect.any(Object)
    );
    expect(mockFetch.mock.calls[0][1].method).toBe('GET');
  });

  it('appends query params: page, size, tool', async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({
        success: true,
        data: [],
        total: 0,
        pagination: { page: 2, size: 10, total: 0 },
      })
    );
    const opts: GetReportsOptions = { page: 2, size: 10, tool: 'jest' };
    await client.getReports(opts);
    const calledUrl: string = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('page=2');
    expect(calledUrl).toContain('size=10');
    expect(calledUrl).toContain('tool=jest');
  });

  it('returns reports array and pagination', async () => {
    const mockData = {
      success: true,
      data: [{ _id: 'r1', reportId: 'r1', storedAt: '' }],
      total: 1,
      pagination: { page: 1, size: 20, total: 1 },
    };
    mockFetch.mockResolvedValueOnce(makeOkResponse(mockData));
    const result = await client.getReports();
    expect(result.data).toHaveLength(1);
    expect(result.pagination.total).toBe(1);
  });

  it('throws ScaledTestError on non-2xx', async () => {
    mockFetch.mockResolvedValueOnce(
      makeErrorResponse({ success: false, error: 'Authentication required' }, 401)
    );
    await expect(client.getReports()).rejects.toThrow(ScaledTestError);
  });
});

// ── getStats ──────────────────────────────────────────────────────────────────

describe('ScaledTestClient.getStats()', () => {
  let client: ScaledTestClient;
  beforeEach(() => {
    jest.clearAllMocks();
    client = new ScaledTestClient({ baseUrl: 'http://localhost:3000', token: 'sct_abc' });
  });

  it('GETs /api/v1/stats', async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({
        success: true,
        data: {
          totalReports: 5,
          totalTests: 100,
          passRateLast7d: 95.5,
          totalExecutions: 3,
          activeExecutions: 1,
        },
      })
    );
    const result = await client.getStats();
    const calledUrl: string = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('/api/v1/stats');
    expect(result.totalReports).toBe(5);
    expect(result.passRateLast7d).toBe(95.5);
  });

  it('throws ScaledTestError on 401', async () => {
    mockFetch.mockResolvedValueOnce(
      makeErrorResponse({ success: false, error: 'Authentication required' }, 401)
    );
    await expect(client.getStats()).rejects.toThrow(ScaledTestError);
  });
});

// ── listTeams ─────────────────────────────────────────────────────────────────

describe('ScaledTestClient.listTeams()', () => {
  let client: ScaledTestClient;
  beforeEach(() => {
    jest.clearAllMocks();
    client = new ScaledTestClient({ baseUrl: 'http://localhost:3000', token: 'sct_abc' });
  });

  it('GETs /api/v1/teams', async () => {
    mockFetch.mockResolvedValueOnce(makeOkResponse({ success: true, data: [] }));
    await client.listTeams();
    const calledUrl: string = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('/api/v1/teams');
    expect(mockFetch.mock.calls[0][1].method).toBe('GET');
  });

  it('returns teams array', async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ success: true, data: [{ id: 't1', name: 'alpha' }] })
    );
    const result = await client.listTeams();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('t1');
  });

  it('throws ScaledTestError on 401', async () => {
    mockFetch.mockResolvedValueOnce(
      makeErrorResponse({ success: false, error: 'Authentication required' }, 401)
    );
    await expect(client.listTeams()).rejects.toThrow(ScaledTestError);
  });
});

// ── listExecutions ────────────────────────────────────────────────────────────

describe('ScaledTestClient.listExecutions()', () => {
  let client: ScaledTestClient;
  beforeEach(() => {
    jest.clearAllMocks();
    client = new ScaledTestClient({ baseUrl: 'http://localhost:3000', token: 'sct_abc' });
  });

  it('GETs /api/v1/executions', async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({
        success: true,
        data: [],
        total: 0,
        pagination: { page: 1, size: 20, total: 0 },
      })
    );
    await client.listExecutions();
    const calledUrl: string = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('/api/v1/executions');
  });

  it('sends "size" query param (not "pageSize")', async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({
        success: true,
        data: [],
        total: 0,
        pagination: { page: 1, size: 10, total: 0 },
      })
    );
    const opts: ListExecutionsOptions = { size: 10 };
    await client.listExecutions(opts);
    const calledUrl: string = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('size=10');
    expect(calledUrl).not.toContain('pageSize');
  });

  it('appends status query param when provided', async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({
        success: true,
        data: [],
        total: 0,
        pagination: { page: 1, size: 20, total: 0 },
      })
    );
    const opts: ListExecutionsOptions = { status: 'running' };
    await client.listExecutions(opts);
    const calledUrl: string = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('status=running');
  });

  it('returns executions array and pagination matching server contract', async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({
        success: true,
        data: [{ id: 'exec-1', status: 'running' }],
        total: 1,
        pagination: { page: 1, size: 20, total: 1 },
      })
    );
    const result = await client.listExecutions();
    expect(result.data).toHaveLength(1);
    expect(result.data[0].id).toBe('exec-1');
    expect(result.pagination.size).toBe(20);
    expect(result.pagination.total).toBe(1);
  });
});

// ── getExecutionDetail ────────────────────────────────────────────────────────

describe('ScaledTestClient.getExecutionDetail()', () => {
  let client: ScaledTestClient;
  beforeEach(() => {
    jest.clearAllMocks();
    client = new ScaledTestClient({ baseUrl: 'http://localhost:3000', token: 'sct_abc' });
  });

  it('GETs /api/v1/executions/{id}', async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ success: true, data: { id: 'exec-1', status: 'completed' } })
    );
    const result = await client.getExecutionDetail('exec-1');
    const calledUrl: string = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('/api/v1/executions/exec-1');
    expect(result.id).toBe('exec-1');
  });

  it('throws if id is empty', async () => {
    await expect(client.getExecutionDetail('')).rejects.toThrow();
  });

  it('throws ScaledTestError on 404', async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse({ success: false, error: 'Not found' }, 404));
    await expect(client.getExecutionDetail('missing-id')).rejects.toThrow(ScaledTestError);
  });
});

// ── createExecution ───────────────────────────────────────────────────────────

describe('ScaledTestClient.createExecution()', () => {
  let client: ScaledTestClient;
  beforeEach(() => {
    jest.clearAllMocks();
    client = new ScaledTestClient({ baseUrl: 'http://localhost:3000', token: 'sct_abc' });
  });

  it('POSTs to /api/v1/executions with dockerImage and testCommand', async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ success: true, data: { id: 'exec-2', status: 'queued' } }, 201)
    );
    const payload = { dockerImage: 'node:20', testCommand: 'npm test', teamId: 't1' };
    const result = await client.createExecution(payload);
    const calledUrl: string = mockFetch.mock.calls[0][0];
    const fetchOptions = mockFetch.mock.calls[0][1] as {
      method: string;
      body?: string;
      headers?: Record<string, string>;
    };
    expect(calledUrl).toContain('/api/v1/executions');
    expect(fetchOptions.method).toBe('POST');
    const requestBody = fetchOptions.body ? JSON.parse(fetchOptions.body as string) : undefined;
    expect(requestBody).toEqual(payload);
    expect(result.id).toBe('exec-2');
  });

  it('throws ScaledTestError on 400 (validation failure)', async () => {
    mockFetch.mockResolvedValueOnce(
      makeErrorResponse({ success: false, error: 'Validation failed' }, 400)
    );
    await expect(
      client.createExecution({ dockerImage: '', testCommand: 'npm test' })
    ).rejects.toThrow(ScaledTestError);
  });
});

// ── submitExecutionResults ────────────────────────────────────────────────────

describe('ScaledTestClient.submitExecutionResults()', () => {
  let client: ScaledTestClient;
  beforeEach(() => {
    jest.clearAllMocks();
    client = new ScaledTestClient({ baseUrl: 'http://localhost:3000', token: 'sct_abc' });
  });

  it('POSTs to /api/v1/executions/{id}/results', async () => {
    mockFetch.mockResolvedValueOnce(makeOkResponse({ success: true, reportId: 'rpt-abc-123' }));
    await client.submitExecutionResults('exec-1', { report: MINIMAL_CTRF_REPORT });
    const calledUrl: string = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('/api/v1/executions/exec-1/results');
    expect(mockFetch.mock.calls[0][1].method).toBe('POST');
  });

  it('returns reportId matching server contract', async () => {
    mockFetch.mockResolvedValueOnce(makeOkResponse({ success: true, reportId: 'rpt-abc-123' }));
    const result = await client.submitExecutionResults('exec-1', { report: MINIMAL_CTRF_REPORT });
    expect(result.reportId).toBe('rpt-abc-123');
  });

  it('throws if id is empty', async () => {
    await expect(
      client.submitExecutionResults('', { report: MINIMAL_CTRF_REPORT })
    ).rejects.toThrow();
  });

  it('throws ScaledTestError on 404', async () => {
    mockFetch.mockResolvedValueOnce(makeErrorResponse({ success: false, error: 'Not found' }, 404));
    await expect(
      client.submitExecutionResults('bad-id', { report: MINIMAL_CTRF_REPORT })
    ).rejects.toThrow(ScaledTestError);
  });
});

// ── cancelExecution ───────────────────────────────────────────────────────────

describe('ScaledTestClient.cancelExecution()', () => {
  let client: ScaledTestClient;
  beforeEach(() => {
    jest.clearAllMocks();
    client = new ScaledTestClient({ baseUrl: 'http://localhost:3000', token: 'sct_abc' });
  });

  it('DELETEs /api/v1/executions/{id}', async () => {
    const execution = { id: 'exec-1', status: 'cancelled' };
    mockFetch.mockResolvedValueOnce(makeOkResponse({ success: true, data: execution }));
    await client.cancelExecution('exec-1');
    const calledUrl: string = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('/api/v1/executions/exec-1');
    expect(mockFetch.mock.calls[0][1].method).toBe('DELETE');
  });

  it('returns the cancelled ExecutionRecord matching server contract', async () => {
    const execution = { id: 'exec-1', status: 'cancelled' };
    mockFetch.mockResolvedValueOnce(makeOkResponse({ success: true, data: execution }));
    const result = await client.cancelExecution('exec-1');
    expect(result.id).toBe('exec-1');
    expect(result.status).toBe('cancelled');
  });

  it('throws if id is empty', async () => {
    await expect(client.cancelExecution('')).rejects.toThrow();
  });

  it('throws ScaledTestError on 409 (bad state)', async () => {
    mockFetch.mockResolvedValueOnce(
      makeErrorResponse({ success: false, error: 'Execution already completed' }, 409)
    );
    await expect(client.cancelExecution('exec-1')).rejects.toThrow(ScaledTestError);
  });
});

// ── getActiveExecutions ───────────────────────────────────────────────────────

describe('ScaledTestClient.getActiveExecutions()', () => {
  let client: ScaledTestClient;
  beforeEach(() => {
    jest.clearAllMocks();
    client = new ScaledTestClient({ baseUrl: 'http://localhost:3000', token: 'sct_abc' });
  });

  it('GETs /api/v1/executions/active', async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ success: true, data: { activeExecutions: 0 } })
    );
    await client.getActiveExecutions();
    const calledUrl: string = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('/api/v1/executions/active');
  });

  it('returns active execution count matching server contract', async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ success: true, data: { activeExecutions: 3 } })
    );
    const result = await client.getActiveExecutions();
    expect(result.activeExecutions).toBe(3);
  });

  it('includes teamId query param when provided', async () => {
    mockFetch.mockResolvedValueOnce(
      makeOkResponse({ success: true, data: { activeExecutions: 2 } })
    );
    await client.getActiveExecutions({ teamId: 'team-123' });
    const calledUrl: string = mockFetch.mock.calls[0][0];
    expect(calledUrl).toContain('/api/v1/executions/active');
    expect(calledUrl).toContain('teamId=team-123');
  });

  it('throws ScaledTestError on 401', async () => {
    mockFetch.mockResolvedValueOnce(
      makeErrorResponse({ success: false, error: 'Authentication required' }, 401)
    );
    await expect(client.getActiveExecutions()).rejects.toThrow(ScaledTestError);
  });
});

// ── ScaledTestError ───────────────────────────────────────────────────────────

describe('ScaledTestError', () => {
  it('is an instance of Error', () => {
    const err = new ScaledTestError('bad', 400);
    expect(err).toBeInstanceOf(Error);
  });

  it('carries message and status', () => {
    const err = new ScaledTestError('not found', 404);
    expect(err.message).toBe('not found');
    expect(err.status).toBe(404);
  });

  it('has name ScaledTestError', () => {
    const err = new ScaledTestError('oops', 500);
    expect(err.name).toBe('ScaledTestError');
  });
});
