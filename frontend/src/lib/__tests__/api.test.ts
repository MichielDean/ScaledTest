// Dynamic imports with vi.resetModules() to get fresh module-level state
// (csrfToken, refreshPromise) and a consistent zustand store per test.
let api: typeof import('../api')['api'];
let useAuthStore: typeof import('../../stores/auth-store')['useAuthStore'];
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(async () => {
  vi.resetModules();
  fetchMock = vi.fn();
  globalThis.fetch = fetchMock;

  const authMod = await import('../../stores/auth-store');
  useAuthStore = authMod.useAuthStore;
  useAuthStore.setState({
    user: null,
    accessToken: null,
    isAuthenticated: false,
  });

  const apiMod = await import('../api');
  api = apiMod.api;
});

function jsonResponse(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('api.login', () => {
  it('POSTs credentials and returns user + token', async () => {
    const payload = {
      user: { id: 'u1', email: 'a@b.com', display_name: 'A', role: 'member' },
      access_token: 'tok',
    };
    // First call: CSRF token fetch; second call: login
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ csrf_token: 'csrf1' }))
      .mockResolvedValueOnce(jsonResponse(payload));

    const result = await api.login('a@b.com', 'pass');
    expect(result).toEqual(payload);

    // Verify login request (call[1] is the login POST, call[0] is CSRF fetch)
    const loginCall = fetchMock.mock.calls[1];
    expect(loginCall[0]).toBe('/auth/login');
    expect(loginCall[1]).toMatchObject({ method: 'POST', credentials: 'include' });
    expect(JSON.parse(loginCall[1].body)).toEqual({ email: 'a@b.com', password: 'pass' });
  });
});

describe('fetchAPI Authorization header', () => {
  it('includes Bearer token when authenticated', async () => {
    useAuthStore.getState().setAuth(
      { id: 'u1', email: 'a@b.com', display_name: 'A', role: 'member' },
      'my-token'
    );
    fetchMock.mockResolvedValueOnce(jsonResponse({ reports: [], total: 0 }));

    await api.getReports();

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers['Authorization']).toBe('Bearer my-token');
  });

  it('omits Authorization header when not authenticated', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ reports: [], total: 0 }));

    await api.getReports();

    const headers = fetchMock.mock.calls[0][1].headers;
    expect(headers['Authorization']).toBeUndefined();
  });
});

describe('fetchAPI 401 retry (token refresh)', () => {
  it('refreshes token on 401 then retries', async () => {
    useAuthStore.getState().setAuth(
      { id: 'u1', email: 'a@b.com', display_name: 'A', role: 'member' },
      'old-token'
    );

    fetchMock
      // Original request → 401
      .mockResolvedValueOnce(jsonResponse({ error: 'unauthorized' }, 401))
      // Refresh call
      .mockResolvedValueOnce(jsonResponse({ access_token: 'new-token' }))
      // Retry
      .mockResolvedValueOnce(jsonResponse({ reports: [], total: 0 }));

    const result = await api.getReports();
    expect(result).toEqual({ reports: [], total: 0 });

    // Verify new token was stored
    expect(useAuthStore.getState().accessToken).toBe('new-token');
  });

  it('clears auth and throws when refresh fails', async () => {
    useAuthStore.getState().setAuth(
      { id: 'u1', email: 'a@b.com', display_name: 'A', role: 'member' },
      'old-token'
    );

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: 'unauthorized' }, 401))
      .mockResolvedValueOnce(jsonResponse({ error: 'invalid' }, 401));

    await expect(api.getReports()).rejects.toThrow('Unauthorized');
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });
});

describe('fetchAPI non-ok responses', () => {
  it('throws with error message from response body', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Not Found' }, 404));

    await expect(api.getReports()).rejects.toThrow('Not Found');
  });

  it('throws generic message when body has no error field', async () => {
    fetchMock.mockResolvedValueOnce(
      new Response('not json', { status: 500 })
    );

    await expect(api.getReports()).rejects.toThrow('Request failed');
  });

  it('throws ApiError with the HTTP status code preserved', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ error: 'Not Found' }, 404));

    const err = await api.getReports().catch((e: unknown) => e);
    expect(err).toHaveProperty('status', 404);
    expect(err).toHaveProperty('message', 'Not Found');
    expect(err).toHaveProperty('name', 'ApiError');
  });
});

describe('CSRF token handling', () => {
  it('includes X-CSRF-Token on mutation requests', async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({ csrf_token: 'csrf-abc' }))
      .mockResolvedValueOnce(jsonResponse({ id: '1' }));

    await api.submitReport({ tests: [] });

    const headers = fetchMock.mock.calls[1][1].headers;
    expect(headers['X-CSRF-Token']).toBe('csrf-abc');
  });
});
