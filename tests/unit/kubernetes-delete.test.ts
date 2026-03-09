/**
 * Tests for deleteKubernetesJob — propagation policy and error behaviour
 *
 * TDD: written BEFORE the fix per project convention.
 *
 * Covers the blocking finding from PR #65 review:
 *   - deleteKubernetesJob must use Background propagation (returns immediately)
 *   - deleteKubernetesJob must NOT call logError before rethrowing — the caller
 *     (API handler) owns error logging; double-logging the same failure is noise
 */

// ---- Mock fs so getKubernetesConfig() finds in-cluster service account files ----
jest.mock('fs', () => {
  const actual = jest.requireActual('fs');
  return {
    ...actual,
    readFileSync: jest.fn((path: string) => {
      if (path === '/var/run/secrets/kubernetes.io/serviceaccount/token') {
        return 'fake-token';
      }
      if (path === '/var/run/secrets/kubernetes.io/serviceaccount/namespace') {
        return 'scaledtest';
      }
      // CA cert path — return a minimal self-signed PEM stub
      return '-----BEGIN CERTIFICATE-----\nMIIBxxx\n-----END CERTIFICATE-----\n';
    }),
    existsSync: jest.fn((path: string) => {
      if (path === '/var/run/secrets/kubernetes.io/serviceaccount/ca.crt') return true;
      return actual.existsSync(path);
    }),
  };
});

// ---- Mock logger to detect logError calls ----
const mockLogError = jest.fn();
jest.mock('../../src/logging/logger', () => ({
  dbLogger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
  logError: mockLogError,
}));

// ---- Mock executions to break the circular import ----
jest.mock('../../src/lib/executions', () => ({
  updateExecutionStatus: jest.fn(),
  listExecutions: jest.fn(),
}));

// ---- Mock global fetch ----
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Reset the module cache between tests so the memoised config is cleared
beforeEach(() => {
  jest.resetModules();
  mockFetch.mockReset();
  mockLogError.mockReset();
});

describe('deleteKubernetesJob — propagation policy', () => {
  it('sends propagationPolicy: Background (not Foreground)', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ kind: 'Job', metadata: { name: 'test-job' } }),
    });

    // Re-import after resetModules so config memoisation is cleared
    const { deleteKubernetesJob } = await import('../../src/lib/kubernetes');
    await deleteKubernetesJob('test-job-abc123');

    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [, fetchInit] = mockFetch.mock.calls[0] as [string, RequestInit & { body?: string }];
    const body = JSON.parse(fetchInit.body ?? '{}');
    expect(body.propagationPolicy).toBe('Background');
    expect(body.propagationPolicy).not.toBe('Foreground');
  });
});

describe('deleteKubernetesJob — error behaviour', () => {
  it('does NOT call logError when K8s request fails — caller owns error logging', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => 'Service Unavailable',
    });

    const { deleteKubernetesJob } = await import('../../src/lib/kubernetes');
    await expect(deleteKubernetesJob('test-job-xyz')).rejects.toThrow();

    // The function must rethrow but must NOT call logError itself
    expect(mockLogError).not.toHaveBeenCalled();
  });

  it('rethrows the K8s error so the caller can handle it', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 404,
      text: async () => 'Not Found',
    });

    const { deleteKubernetesJob } = await import('../../src/lib/kubernetes');
    await expect(deleteKubernetesJob('missing-job')).rejects.toThrow(/404/);
  });
});
