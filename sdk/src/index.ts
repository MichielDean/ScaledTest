/**
 * @scaledtest/sdk v2 — TypeScript/JavaScript client for the ScaledTest API
 *
 * Usage:
 *   import { ScaledTestClient } from '@scaledtest/sdk';
 *
 *   const client = new ScaledTestClient({
 *     baseUrl: 'https://your-instance.example.com',
 *     token: 'sct_your_api_token',
 *   });
 *
 *   await client.uploadReport(ctrfPayload);
 */

// ── Error ────────────────────────────────────────────────────────────────────

export class ScaledTestError extends Error {
  public readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ScaledTestError';
    this.status = status;
    Object.setPrototypeOf(this, ScaledTestError.prototype);
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface ClientOptions {
  baseUrl: string;
  token: string;
  timeoutMs?: number;
}

export interface CtrfReport {
  results: {
    tool: { name: string; version?: string };
    summary: {
      tests: number;
      passed: number;
      failed: number;
      skipped: number;
      pending: number;
      other: number;
      start: number;
      stop: number;
    };
    tests: Array<{
      name: string;
      status: 'passed' | 'failed' | 'skipped' | 'pending' | 'other';
      duration: number;
      message?: string;
      trace?: string;
      suite?: string;
      tags?: string[];
      flaky?: boolean;
      retries?: number;
    }>;
  };
}

export interface Report {
  id: string;
  team_id: string;
  tool_name: string;
  tool_version?: string;
  summary: {
    tests: number;
    passed: number;
    failed: number;
    skipped: number;
    pending: number;
    other: number;
  };
  // Flattened summary fields (top-level) for convenience; available when summary is parseable
  test_count?: number;
  passed?: number;
  failed?: number;
  skipped?: number;
  pending?: number;
  created_at: string;
  execution_id?: string;
  environment?: Record<string, string>;
}

export interface Execution {
  id: string;
  team_id: string;
  command: string;
  status: string;
  created_at: string;
  started_at?: string;
  completed_at?: string;
}

export interface QualityGateRule {
  type: string;
  params?: Record<string, unknown>;
}

export interface QualityGate {
  id: string;
  name: string;
  team_id: string;
  description?: string;
  rules: QualityGateRule[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface QualityGateEvaluation {
  id: string;
  gate_id: string;
  report_id: string;
  passed: boolean;
  details: unknown;
  created_at: string;
}

export interface UserProfile {
  id: string;
  email: string;
  display_name: string;
  role: string;
}

export interface TrendPoint {
  date: string;
  pass_rate: number;
  total: number;
  passed: number;
  failed: number;
}

export interface FlakyTest {
  name: string;
  suite?: string;
  flake_rate: number;
  occurrences: number;
}

export interface Team {
  id: string;
  name: string;
  created_at: string;
}

// ── Client ───────────────────────────────────────────────────────────────────

export class ScaledTestClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly timeoutMs: number;

  constructor(options: ClientOptions) {
    if (!options.baseUrl) throw new Error('baseUrl is required');
    if (!options.token) throw new Error('token is required');

    let parsed: URL;
    try {
      parsed = new URL(options.baseUrl);
    } catch {
      throw new Error(`Invalid baseUrl: ${options.baseUrl}`);
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`baseUrl must use http or https (got ${parsed.protocol})`);
    }

    // Strip trailing slash(es) from base URL
    let base = options.baseUrl;
    while (base.endsWith('/')) base = base.slice(0, -1);
    this.baseUrl = base;
    this.token = options.token;
    this.timeoutMs = options.timeoutMs ?? 30_000;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };

    let signal: AbortSignal | undefined;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (this.timeoutMs > 0) {
      const controller = new AbortController();
      signal = controller.signal;
      timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal,
      });

      if (!response.ok) {
        let message: string;
        try {
          const err = (await response.json()) as { error?: string };
          message = err.error ?? `HTTP ${response.status}`;
        } catch {
          message = `HTTP ${response.status}`;
        }
        throw new ScaledTestError(message, response.status);
      }

      return response.json() as Promise<T>;
    } finally {
      if (timeoutId) clearTimeout(timeoutId);
    }
  }

  // Reports
  async uploadReport(report: CtrfReport): Promise<{ id: string }> {
    return this.request('POST', '/api/v1/reports', report);
  }

  async getReports(): Promise<{ reports: Report[]; total: number }> {
    return this.request('GET', '/api/v1/reports');
  }

  async getReport(id: string): Promise<Report> {
    return this.request('GET', `/api/v1/reports/${encodeURIComponent(id)}`);
  }

  async deleteReport(id: string): Promise<{ id: string; deleted: boolean }> {
    return this.request('DELETE', `/api/v1/reports/${encodeURIComponent(id)}`);
  }

  // Executions
  async getExecutions(): Promise<{ executions: Execution[]; total: number }> {
    return this.request('GET', '/api/v1/executions');
  }

  async createExecution(command: string): Promise<Execution> {
    return this.request('POST', '/api/v1/executions', { command });
  }

  async cancelExecution(id: string): Promise<void> {
    await this.request('DELETE', `/api/v1/executions/${encodeURIComponent(id)}`);
  }

  async deleteExecution(id: string): Promise<void> {
    await this.request('DELETE', `/api/v1/executions/${encodeURIComponent(id)}`);
  }

  // Analytics
  async getTrends(): Promise<TrendPoint[]> {
    return this.request('GET', '/api/v1/analytics/trends');
  }

  async getFlakyTests(): Promise<FlakyTest[]> {
    return this.request('GET', '/api/v1/analytics/flaky-tests');
  }

  async getErrorAnalysis(): Promise<unknown> {
    return this.request('GET', '/api/v1/analytics/error-analysis');
  }

  async getDurationDistribution(): Promise<unknown> {
    return this.request('GET', '/api/v1/analytics/duration-distribution');
  }

  // Quality Gates (nested under /teams/{teamID})
  async getQualityGates(teamId: string): Promise<{ quality_gates: QualityGate[]; total: number }> {
    return this.request('GET', `/api/v1/teams/${encodeURIComponent(teamId)}/quality-gates`);
  }

  async createQualityGate(
    teamId: string,
    name: string,
    rules: QualityGateRule[],
  ): Promise<QualityGate> {
    return this.request('POST', `/api/v1/teams/${encodeURIComponent(teamId)}/quality-gates`, { name, rules });
  }

  async getQualityGate(teamId: string, id: string): Promise<QualityGate> {
    return this.request(
      'GET',
      `/api/v1/teams/${encodeURIComponent(teamId)}/quality-gates/${encodeURIComponent(id)}`
    );
  }

  async updateQualityGate(
    teamId: string,
    id: string,
    name: string,
    rules: QualityGateRule[],
    description?: string,
    enabled?: boolean,
  ): Promise<QualityGate> {
    return this.request(
      'PUT',
      `/api/v1/teams/${encodeURIComponent(teamId)}/quality-gates/${encodeURIComponent(id)}`,
      { name, rules, description, enabled },
    );
  }

  async deleteQualityGate(teamId: string, id: string): Promise<void> {
    await this.request(
      'DELETE',
      `/api/v1/teams/${encodeURIComponent(teamId)}/quality-gates/${encodeURIComponent(id)}`
    );
  }

  async listEvaluations(
    teamId: string,
    gateId: string,
  ): Promise<{ evaluations: QualityGateEvaluation[]; total: number }> {
    return this.request(
      'GET',
      `/api/v1/teams/${encodeURIComponent(teamId)}/quality-gates/${encodeURIComponent(gateId)}/evaluations`
    );
  }

  async evaluateQualityGate(teamId: string, id: string): Promise<QualityGateEvaluation> {
    return this.request(
      'POST',
      `/api/v1/teams/${encodeURIComponent(teamId)}/quality-gates/${encodeURIComponent(id)}/evaluate`
    );
  }

  // Teams
  async getTeams(): Promise<{ teams: Team[] }> {
    return this.request('GET', '/api/v1/teams');
  }

  async createTeam(name: string): Promise<Team> {
    return this.request('POST', '/api/v1/teams', { name });
  }

  // User profile
  async getMe(): Promise<UserProfile> {
    return this.request('GET', '/api/v1/auth/me');
  }

  async updateProfile(displayName: string): Promise<UserProfile> {
    return this.request('PATCH', '/api/v1/auth/me', { display_name: displayName });
  }

  async changePassword(currentPassword: string, newPassword: string): Promise<void> {
    await this.request('POST', '/api/v1/auth/change-password', {
      current_password: currentPassword,
      new_password: newPassword,
    });
  }
}
