import { useAuthStore } from '../stores/auth-store';

const BASE_URL = '';

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

  // Executions
  getExecutions: () => fetchAPI<{ executions: unknown[]; total: number }>('/api/v1/executions'),
  createExecution: (command: string) =>
    fetchAPI('/api/v1/executions', { method: 'POST', body: JSON.stringify({ command }) }),
  cancelExecution: (id: string) => fetchAPI(`/api/v1/executions/${id}`, { method: 'DELETE' }),

  // Analytics
  getTrends: (params?: { days?: number; group_by?: string }) => {
    const q = new URLSearchParams();
    if (params?.days) q.set('days', String(params.days));
    if (params?.group_by) q.set('group_by', params.group_by);
    const qs = q.toString();
    return fetchAPI(`/api/v1/analytics/trends${qs ? `?${qs}` : ''}`);
  },
  getFlakyTests: (params?: { days?: number }) => {
    const q = params?.days ? `?days=${params.days}` : '';
    return fetchAPI(`/api/v1/analytics/flaky-tests${q}`);
  },
  getErrorAnalysis: (params?: { days?: number }) => {
    const q = params?.days ? `?days=${params.days}` : '';
    return fetchAPI(`/api/v1/analytics/error-analysis${q}`);
  },
  getDurationDistribution: (params?: { days?: number }) => {
    const q = params?.days ? `?days=${params.days}` : '';
    return fetchAPI(`/api/v1/analytics/duration-distribution${q}`);
  },
  getHealthScore: (params?: { days?: number }) => {
    const q = params?.days ? `?days=${params.days}` : '';
    return fetchAPI(`/api/v1/analytics/health-score${q}`);
  },

  // Quality Gates
  getQualityGates: () =>
    fetchAPI<{ quality_gates: unknown[]; total: number }>('/api/v1/quality-gates'),
  createQualityGate: (data: unknown) =>
    fetchAPI('/api/v1/quality-gates', { method: 'POST', body: JSON.stringify(data) }),
  evaluateQualityGate: (id: string) =>
    fetchAPI(`/api/v1/quality-gates/${id}/evaluate`, { method: 'POST' }),

  // Teams
  getTeams: () => fetchAPI<{ teams: unknown[] }>('/api/v1/teams'),
  createTeam: (name: string) =>
    fetchAPI('/api/v1/teams', { method: 'POST', body: JSON.stringify({ name }) }),

  // Admin
  adminListUsers: () => fetchAPI('/api/v1/admin/users'),
};
