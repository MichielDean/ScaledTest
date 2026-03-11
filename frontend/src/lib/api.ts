import { useAuthStore } from '../stores/auth-store';

const BASE_URL = '';

let csrfToken: string | null = null;
let csrfPromise: Promise<string> | null = null;

async function getCSRFToken(): Promise<string> {
  if (csrfToken) return csrfToken;
  if (csrfPromise) return csrfPromise;

  csrfPromise = (async () => {
    try {
      const response = await fetch(`${BASE_URL}/auth/csrf-token`, {
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Failed to fetch CSRF token');
      const data = await response.json();
      csrfToken = data.csrf_token;
      return csrfToken!;
    } finally {
      csrfPromise = null;
    }
  })();

  return csrfPromise;
}

const MUTATION_METHODS = new Set(['POST', 'PUT', 'DELETE', 'PATCH']);

let refreshPromise: Promise<void> | null = null;

async function refreshToken(): Promise<void> {
  if (refreshPromise) return refreshPromise;

  refreshPromise = (async () => {
    try {
      const response = await fetch(`${BASE_URL}/auth/refresh`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!response.ok) throw new Error('Refresh failed');
      const data = await response.json();
      const store = useAuthStore.getState();
      if (store.user) {
        store.setAuth(store.user, data.access_token);
      }
    } catch {
      useAuthStore.getState().clearAuth();
      throw new Error('Session expired');
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
}

async function fetchAPI<T>(path: string, options: RequestInit = {}, retry = true): Promise<T> {
  const token = useAuthStore.getState().accessToken;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) ?? {}),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  // Include CSRF token on mutation requests
  const method = (options.method ?? 'GET').toUpperCase();
  if (MUTATION_METHODS.has(method)) {
    headers['X-CSRF-Token'] = await getCSRFToken();
  }

  const response = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
    credentials: 'include',
  });

  if (response.status === 401 && retry) {
    try {
      await refreshToken();
      return fetchAPI<T>(path, options, false);
    } catch {
      throw new Error('Unauthorized');
    }
  }

  // Retry once on CSRF failure — token may have expired
  if (response.status === 403 && retry && MUTATION_METHODS.has(method)) {
    const body = await response.json().catch(() => ({ error: '' }));
    if (typeof body.error === 'string' && body.error.toLowerCase().includes('csrf')) {
      csrfToken = null;
      return fetchAPI<T>(path, options, false);
    }
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || `HTTP ${response.status}`);
  }

  return response.json();
}

export const api = {
  // Auth
  login: (email: string, password: string) =>
    fetchAPI<{
      user: { id: string; email: string; display_name: string; role: string };
      access_token: string;
    }>('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (email: string, password: string, displayName: string) =>
    fetchAPI<{
      user: { id: string; email: string; display_name: string; role: string };
      access_token: string;
    }>('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, display_name: displayName }),
    }),
  refresh: () => fetchAPI('/auth/refresh', { method: 'POST' }),
  logout: () => fetchAPI('/auth/logout', { method: 'POST' }),

  // Reports
  getReports: () => fetchAPI<{ reports: unknown[]; total: number }>('/api/v1/reports'),
  submitReport: (data: unknown) =>
    fetchAPI('/api/v1/reports', { method: 'POST', body: JSON.stringify(data) }),
  getReport: (id: string) => fetchAPI(`/api/v1/reports/${id}`),
  compareReports: (base: string, head: string) =>
    fetchAPI(
      `/api/v1/reports/compare?base=${encodeURIComponent(base)}&head=${encodeURIComponent(head)}`
    ),

  // Executions
  getExecutions: () => fetchAPI<{ executions: unknown[]; total: number }>('/api/v1/executions'),
  getExecution: (id: string) => fetchAPI<unknown>(`/api/v1/executions/${id}`),
  createExecution: (command: string) =>
    fetchAPI('/api/v1/executions', { method: 'POST', body: JSON.stringify({ command }) }),
  cancelExecution: (id: string) =>
    fetchAPI(`/api/v1/executions/${id}`, { method: 'DELETE' }),
  updateExecutionStatus: (id: string, status: string, errorMsg?: string) =>
    fetchAPI(`/api/v1/executions/${id}/status`, {
      method: 'PUT',
      body: JSON.stringify({ status, error_msg: errorMsg }),
    }),

  // Analytics
  getTrends: () => fetchAPI('/api/v1/analytics/trends'),
  getFlakyTests: () => fetchAPI('/api/v1/analytics/flaky-tests'),
  getErrorAnalysis: () => fetchAPI('/api/v1/analytics/error-analysis'),
  getDurationDistribution: () => fetchAPI('/api/v1/analytics/duration-distribution'),

  // Quality Gates
  getQualityGates: () => fetchAPI<{ quality_gates: unknown[]; total: number }>('/api/v1/quality-gates'),
  getQualityGate: (id: string) => fetchAPI(`/api/v1/quality-gates/${id}`),
  createQualityGate: (data: unknown) =>
    fetchAPI('/api/v1/quality-gates', { method: 'POST', body: JSON.stringify(data) }),
  updateQualityGate: (id: string, data: unknown) =>
    fetchAPI(`/api/v1/quality-gates/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteQualityGate: (id: string) =>
    fetchAPI(`/api/v1/quality-gates/${id}`, { method: 'DELETE' }),
  evaluateQualityGate: (id: string) =>
    fetchAPI(`/api/v1/quality-gates/${id}/evaluate`, { method: 'POST' }),
  getQualityGateEvaluations: (id: string, limit = 20) =>
    fetchAPI<{ evaluations: unknown[]; total: number }>(`/api/v1/quality-gates/${id}/evaluations?limit=${limit}`),

  // Teams
  getTeams: () => fetchAPI<{ teams: unknown[] }>('/api/v1/teams'),
  createTeam: (name: string) =>
    fetchAPI('/api/v1/teams', { method: 'POST', body: JSON.stringify({ name }) }),

  // Admin
  adminListUsers: () => fetchAPI('/api/v1/admin/users'),
};
