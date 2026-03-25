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

export interface QualityGate {
  id: string;
  name: string;
  team_id: string;
  rules: Array<{ type: string; threshold: number }>;
  created_at: string;
}

export interface QualityGateEvaluation {
  id: string;
  quality_gate_id: string;
  passed: boolean;
  details: unknown;
  created_at: string;
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

export interface Webhook {
  id: string;
  team_id: string;
  url: string;
  events: string[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

export interface WebhookDelivery {
  id: string;
  webhook_id: string;
  url: string;
  event_type: string;
  attempt: number;
  status_code: number;
  error?: string;
  duration_ms: number;
  payload?: unknown;
  delivered_at: string;
}

export interface WebhookDeliveryRetryResult {
  success: boolean;
  status_code: number;
  attempt: number;
  duration_ms: number;
  error?: string;
}

export interface Invitation {
  id: string;
  team_id: string;
  email: string;
  role: string;
  invited_by: string;
  accepted_at?: string;
  expires_at: string;
  created_at: string;
}

export interface InvitationPreview {
  email: string;
  role: string;
  team_name: string;
  expires_at: string;
}

export interface InvitationAcceptResult {
  message: string;
  user_id: string;
  team_id: string;
  role: string;
}

export interface APIToken {
  id: string;
  team_id: string;
  user_id: string;
  name: string;
  prefix: string;
  last_used_at?: string;
  created_at: string;
}

export interface CreateTokenResult {
  token: string;
  id: string;
  name: string;
  prefix: string;
  created_at: string;
}

export interface AdminUser {
  id: string;
  email: string;
  display_name: string;
  role: string;
  created_at: string;
  updated_at: string;
}

export interface AuditLogEntry {
  id: string;
  actor_id: string;
  actor_email: string;
  team_id?: string;
  team_name?: string;
  action: string;
  resource_type?: string;
  resource_id?: string;
  metadata?: unknown;
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
    rules: Array<{ type: string; threshold: number }>
  ): Promise<QualityGate> {
    return this.request('POST', `/api/v1/teams/${encodeURIComponent(teamId)}/quality-gates`, { name, rules });
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

  // Webhooks (team-scoped)
  async listWebhooks(teamId: string): Promise<{ webhooks: Webhook[]; total: number }> {
    return this.request('GET', `/api/v1/teams/${encodeURIComponent(teamId)}/webhooks`);
  }

  async createWebhook(teamId: string, url: string, events: string[]): Promise<{ webhook: Webhook; secret: string }> {
    return this.request('POST', `/api/v1/teams/${encodeURIComponent(teamId)}/webhooks`, { url, events });
  }

  async getWebhook(teamId: string, webhookId: string): Promise<Webhook> {
    return this.request('GET', `/api/v1/teams/${encodeURIComponent(teamId)}/webhooks/${encodeURIComponent(webhookId)}`);
  }

  async updateWebhook(
    teamId: string,
    webhookId: string,
    updates: { url?: string; events?: string[]; enabled?: boolean }
  ): Promise<Webhook> {
    return this.request('PUT', `/api/v1/teams/${encodeURIComponent(teamId)}/webhooks/${encodeURIComponent(webhookId)}`, updates);
  }

  async deleteWebhook(teamId: string, webhookId: string): Promise<void> {
    await this.request('DELETE', `/api/v1/teams/${encodeURIComponent(teamId)}/webhooks/${encodeURIComponent(webhookId)}`);
  }

  async listWebhookDeliveries(teamId: string, webhookId: string): Promise<{ deliveries: WebhookDelivery[]; total: number }> {
    return this.request('GET', `/api/v1/teams/${encodeURIComponent(teamId)}/webhooks/${encodeURIComponent(webhookId)}/deliveries`);
  }

  async retryWebhookDelivery(teamId: string, webhookId: string, deliveryId: string): Promise<WebhookDeliveryRetryResult> {
    return this.request(
      'POST',
      `/api/v1/teams/${encodeURIComponent(teamId)}/webhooks/${encodeURIComponent(webhookId)}/deliveries/${encodeURIComponent(deliveryId)}/retry`
    );
  }

  // Invitations (team-scoped)
  async listInvitations(teamId: string): Promise<{ invitations: Invitation[] }> {
    return this.request('GET', `/api/v1/teams/${encodeURIComponent(teamId)}/invitations`);
  }

  async createInvitation(teamId: string, email: string, role: string): Promise<{ invitation: Invitation; token: string }> {
    return this.request('POST', `/api/v1/teams/${encodeURIComponent(teamId)}/invitations`, { email, role });
  }

  async revokeInvitation(teamId: string, invitationId: string): Promise<void> {
    await this.request('DELETE', `/api/v1/teams/${encodeURIComponent(teamId)}/invitations/${encodeURIComponent(invitationId)}`);
  }

  // Invitations (public — no auth required)
  async previewInvitation(token: string): Promise<InvitationPreview> {
    return this.request('GET', `/api/v1/invitations/${encodeURIComponent(token)}`);
  }

  async acceptInvitation(token: string, password: string, displayName: string): Promise<InvitationAcceptResult> {
    return this.request('POST', `/api/v1/invitations/${encodeURIComponent(token)}/accept`, { password, display_name: displayName });
  }

  // API Tokens (team-scoped)
  async listTokens(teamId: string): Promise<{ tokens: APIToken[] }> {
    return this.request('GET', `/api/v1/teams/${encodeURIComponent(teamId)}/tokens`);
  }

  async createToken(teamId: string, name: string): Promise<CreateTokenResult> {
    return this.request('POST', `/api/v1/teams/${encodeURIComponent(teamId)}/tokens`, { name });
  }

  async deleteToken(teamId: string, tokenId: string): Promise<void> {
    await this.request('DELETE', `/api/v1/teams/${encodeURIComponent(teamId)}/tokens/${encodeURIComponent(tokenId)}`);
  }

  // Admin
  async listUsers(): Promise<{ users: AdminUser[]; total: number }> {
    return this.request('GET', '/api/v1/admin/users');
  }

  async listAuditLog(): Promise<{ audit_log: AuditLogEntry[]; total: number }> {
    return this.request('GET', '/api/v1/admin/audit-log');
  }
}
