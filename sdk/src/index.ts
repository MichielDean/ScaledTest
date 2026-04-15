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
  name?: string;
  tool_name: string;
  tool_version?: string;
  summary: {
    tests: number;
    passed: number;
    failed: number;
    skipped: number;
    pending: number;
    other: number;
    start?: number;
    stop?: number;
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

export type ExecutionStatus = 'pending' | 'running' | 'completed' | 'failed' | 'cancelled';

export type TestResultStatus = 'passed' | 'failed' | 'skipped' | 'pending' | 'other';

export type WorkerStatus = 'starting' | 'running' | 'idle' | 'completed' | 'failed';

export interface Execution {
  id: string;
  team_id: string;
  command: string;
  status: ExecutionStatus;
  config?: Record<string, unknown>;
  report_id?: string;
  k8s_job_name?: string;
  k8s_pod_name?: string;
  error_msg?: string;
  created_at: string;
  updated_at: string;
  started_at?: string;
  finished_at?: string;
}

export interface QualityGateRule {
  type: string;
  params: Record<string, unknown> | null;
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

export interface QualityGateRuleResult {
  metric: string;
  threshold: unknown;
  actual: unknown;
  passed: boolean;
  message: string;
}

export interface QualityGateEvalRuleResult {
  type: string;
  passed: boolean;
  threshold: unknown;
  actual: unknown;
  message: string;
}

export interface QualityGateEvaluation {
  id: string;
  gate_id: string;
  report_id: string;
  passed: boolean;
  details: QualityGateEvalRuleResult[];
  created_at: string;
}

export interface EvaluateQualityGateResponse {
  id: string;
  gate_id: string;
  report_id: string;
  passed: boolean;
  rules: QualityGateRuleResult[];
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
  skipped: number;
}

export interface FlakyTest {
  name: string;
  suite?: string;
  file_path?: string;
  flip_count: number;
  total_runs: number;
  flip_rate: number;
  last_status: string;
}

export interface ErrorCluster {
  message: string;
  count: number;
  test_names: string[];
  first_seen: string;
  last_seen: string;
}

export interface DurationBucket {
  range: string;
  min_ms: number;
  max_ms: number;
  count: number;
}

export interface Team {
  id: string;
  name: string;
  created_at: string;
}

export interface TeamWithRole extends Team {
  role: string;
}

export type WebhookEventType = 'report.submitted' | 'gate.failed' | 'execution.completed' | 'execution.failed' | 'run.triage_complete';

export interface Webhook {
  id: string;
  team_id: string;
  url: string;
  events: WebhookEventType[];
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
  duration_ms: number;
  error?: string;
  payload?: Record<string, unknown>;
  delivered_at: string;
}

export interface Invitation {
  id: string;
  team_id: string;
  email: string;
  role: string;
  invited_by: string;
  expires_at: string;
  accepted_at?: string;
  created_at: string;
}

export interface InvitationPreview {
  email: string;
  role: string;
  team_name: string;
  expires_at: string;
}

export interface ShardPlan {
  execution_id: string;
  total_workers: number;
  strategy: string;
  shards: Shard[];
  est_total_ms: number;
  est_wall_clock_ms: number;
}

export interface Shard {
  worker_id: string;
  test_names: string[];
  est_duration_ms: number;
  test_count: number;
}

export interface TestDurationHistory {
  id: string;
  test_name: string;
  suite: string;
  team_id: string;
  avg_duration_ms: number;
  min_duration_ms: number;
  max_duration_ms: number;
  p95_duration_ms: number;
  run_count: number;
  last_status: string;
  updated_at: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  actor_id: string;
  actor_email: string;
  team_id?: string;
  team_name?: string;
  action: string;
  resource_type?: string;
  resource_id?: string;
  metadata?: Record<string, unknown>;
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

export interface ReportTestDiff {
  name: string;
  suite?: string;
  file_path?: string;
  base_status?: string;
  head_status?: string;
  base_duration_ms?: number;
  head_duration_ms?: number;
  duration_delta_ms?: number;
  duration_delta_pct?: number;
  message?: string;
}

export interface ReportDiffSummary {
  base_tests: number;
  head_tests: number;
  new_failures: number;
  fixed: number;
  duration_regressions: number;
}

export interface ReportCompareResult {
  base: Report;
  head: Report;
  diff: {
    new_failures: ReportTestDiff[];
    fixed: ReportTestDiff[];
    duration_regressions: ReportTestDiff[];
    summary: ReportDiffSummary;
  };
}

export interface TriageFailureEntry {
  test_result_id: string;
  classification: string;
}

export interface TriageCluster {
  id: string;
  root_cause: string;
  failures: TriageFailureEntry[];
  label?: string;
}

export interface ReportTriageResult {
  triage_status: string;
  clusters: TriageCluster[];
  unclustered_failures?: TriageFailureEntry[];
  summary?: string;
  error?: string;
  metadata: {
    generated_at: string;
    model?: string;
  };
}

export interface TeamToken {
  id: string;
  team_id: string;
  user_id: string;
  name: string;
  prefix: string;
  last_used_at?: string;
  created_at: string;
}

export interface UploadReportResponse {
  id: string;
  message: string;
  tool: string;
  tests: number;
  results: number;
  execution_id?: string;
  triage_github_status?: boolean;
  qualityGate?: {
    passed: boolean;
    gates: Array<{
      id: string;
      name: string;
      passed: boolean;
      rules: QualityGateRuleResult[];
    }>;
  };
}

export interface CreateExecutionResponse {
  id: string;
  status: string;
  command: string;
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

  private async request<T>(method: string, path: string, body?: unknown, params?: Record<string, string | number | boolean | undefined>): Promise<T> {
    let url = `${this.baseUrl}${path}`;
    if (params) {
      const searchParams = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) {
          searchParams.set(key, String(value));
        }
      }
      const qs = searchParams.toString();
      if (qs) url += `?${qs}`;
    }
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
  async uploadReport(report: CtrfReport): Promise<UploadReportResponse> {
    return this.request('POST', '/api/v1/reports', report);
  }

  async getReports(params?: { limit?: number; offset?: number; since?: string; until?: string }): Promise<{ reports: Report[]; total: number }> {
    return this.request('GET', '/api/v1/reports', undefined, params);
  }

  async getReport(id: string): Promise<Report> {
    return this.request('GET', `/api/v1/reports/${encodeURIComponent(id)}`);
  }

  async deleteReport(id: string): Promise<{ id: string; deleted: boolean }> {
    return this.request('DELETE', `/api/v1/reports/${encodeURIComponent(id)}`);
  }

  async compareReports(baseId: string, headId: string): Promise<ReportCompareResult> {
    return this.request(
      'GET',
      '/api/v1/reports/compare',
      undefined,
      { base: baseId, head: headId },
    );
  }

  async getReportTriage(reportId: string): Promise<ReportTriageResult> {
    return this.request('GET', `/api/v1/reports/${encodeURIComponent(reportId)}/triage`);
  }

  async retryReportTriage(reportId: string): Promise<{ triage_status: string }> {
    return this.request('POST', `/api/v1/reports/${encodeURIComponent(reportId)}/triage/retry`);
  }

  // Executions
  async getExecutions(params?: { limit?: number; offset?: number }): Promise<{ executions: Execution[]; total: number }> {
    return this.request('GET', '/api/v1/executions', undefined, params);
  }

  async createExecution(command: string, options?: { image?: string; env_vars?: Record<string, string> }): Promise<CreateExecutionResponse> {
    const body: Record<string, unknown> = { command };
    if (options?.image !== undefined) body.image = options.image;
    if (options?.env_vars !== undefined) body.env_vars = options.env_vars;
    return this.request('POST', '/api/v1/executions', body);
  }

  async getExecution(id: string): Promise<Execution> {
    return this.request('GET', `/api/v1/executions/${encodeURIComponent(id)}`);
  }

  async cancelExecution(id: string): Promise<{ id: string; status: string }> {
    return this.request('DELETE', `/api/v1/executions/${encodeURIComponent(id)}`);
  }

  async deleteExecution(id: string): Promise<{ id: string; status: string }> {
    return this.cancelExecution(id);
  }

  async updateExecutionStatus(id: string, status: ExecutionStatus, errorMsg?: string): Promise<{ id: string; status: string }> {
    const body: Record<string, string> = { status };
    if (errorMsg !== undefined) body.error_msg = errorMsg;
    return this.request(
      'PUT',
      `/api/v1/executions/${encodeURIComponent(id)}/status`,
      body,
    );
  }

  async reportExecutionProgress(id: string, progress: { passed: number; failed: number; skipped: number; total: number; duration_ms?: number; estimated_eta_seconds?: number }): Promise<{ execution_id: string; received: boolean }> {
    return this.request('POST', `/api/v1/executions/${encodeURIComponent(id)}/progress`, progress);
  }

  async reportTestResult(id: string, result: { name: string; status: TestResultStatus; duration_ms?: number; message?: string; suite?: string; worker_id?: string }): Promise<{ execution_id: string; received: boolean }> {
    return this.request('POST', `/api/v1/executions/${encodeURIComponent(id)}/test-result`, result);
  }

  async reportWorkerStatus(id: string, status: { worker_id: string; status: WorkerStatus; message?: string; tests_assigned?: number; tests_completed?: number }): Promise<{ execution_id: string; received: boolean }> {
    return this.request('POST', `/api/v1/executions/${encodeURIComponent(id)}/worker-status`, status);
  }

  // Analytics
  async getTrends(params?: { start?: string; end?: string; group_by?: string }): Promise<{ trends: TrendPoint[] }> {
    return this.request('GET', '/api/v1/analytics/trends', undefined, params);
  }

  async getFlakyTests(params?: { window_days?: number; min_runs?: number; limit?: number }): Promise<{ flaky_tests: FlakyTest[] }> {
    return this.request('GET', '/api/v1/analytics/flaky-tests', undefined, params);
  }

  async getErrorAnalysis(params?: { start?: string; end?: string; limit?: number }): Promise<{ errors: ErrorCluster[] }> {
    return this.request('GET', '/api/v1/analytics/error-analysis', undefined, params);
  }

  async getDurationDistribution(params?: { start?: string; end?: string }): Promise<{ distribution: DurationBucket[] }> {
    return this.request('GET', '/api/v1/analytics/duration-distribution', undefined, params);
  }

  // Quality Gates (nested under /teams/{teamID})
  async getQualityGates(teamId: string): Promise<{ quality_gates: QualityGate[]; total: number }> {
    return this.request('GET', `/api/v1/teams/${encodeURIComponent(teamId)}/quality-gates`);
  }

  async createQualityGate(
    teamId: string,
    name: string,
    rules: QualityGateRule[],
    description?: string,
  ): Promise<QualityGate> {
    const body: Record<string, unknown> = { name, rules };
    if (description !== undefined) body.description = description;
    return this.request('POST', `/api/v1/teams/${encodeURIComponent(teamId)}/quality-gates`, body);
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
    const body: Record<string, unknown> = { name, rules };
    if (description !== undefined) body.description = description;
    if (enabled !== undefined) body.enabled = enabled;
    return this.request(
      'PUT',
      `/api/v1/teams/${encodeURIComponent(teamId)}/quality-gates/${encodeURIComponent(id)}`,
      body,
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
    limit?: number,
  ): Promise<{ evaluations: QualityGateEvaluation[]; total: number }> {
    return this.request(
      'GET',
      `/api/v1/teams/${encodeURIComponent(teamId)}/quality-gates/${encodeURIComponent(gateId)}/evaluations`,
      undefined,
      limit !== undefined ? { limit } : undefined,
    );
  }

  async evaluateQualityGate(teamId: string, id: string, reportId: string): Promise<EvaluateQualityGateResponse> {
    return this.request(
      'POST',
      `/api/v1/teams/${encodeURIComponent(teamId)}/quality-gates/${encodeURIComponent(id)}/evaluate`,
      { report_id: reportId },
    );
  }

  // Teams
  async getTeams(): Promise<{ teams: TeamWithRole[] }> {
    return this.request('GET', '/api/v1/teams');
  }

  async createTeam(name: string): Promise<Team> {
    return this.request('POST', '/api/v1/teams', { name });
  }

  async getTeam(id: string): Promise<{ team: Team; role: string }> {
    return this.request('GET', `/api/v1/teams/${encodeURIComponent(id)}`);
  }

  async deleteTeam(id: string): Promise<{ message: string }> {
    return this.request('DELETE', `/api/v1/teams/${encodeURIComponent(id)}`);
  }

  async listTokens(teamId: string): Promise<{ tokens: TeamToken[] }> {
    return this.request('GET', `/api/v1/teams/${encodeURIComponent(teamId)}/tokens`);
  }

  async createToken(teamId: string, name: string): Promise<{ token: string; id: string; name: string; prefix: string; created_at: string }> {
    return this.request('POST', `/api/v1/teams/${encodeURIComponent(teamId)}/tokens`, { name });
  }

  async deleteToken(teamId: string, tokenId: string): Promise<{ message: string }> {
    return this.request('DELETE', `/api/v1/teams/${encodeURIComponent(teamId)}/tokens/${encodeURIComponent(tokenId)}`);
  }

  // Webhooks (nested under /teams/{teamID}/webhooks)
  async listWebhooks(teamId: string): Promise<{ webhooks: Webhook[]; total: number }> {
    return this.request('GET', `/api/v1/teams/${encodeURIComponent(teamId)}/webhooks`);
  }

  async createWebhook(teamId: string, url: string, events: WebhookEventType[]): Promise<{ webhook: Webhook; secret: string }> {
    return this.request('POST', `/api/v1/teams/${encodeURIComponent(teamId)}/webhooks`, { url, events });
  }

  async getWebhook(teamId: string, webhookId: string): Promise<Webhook> {
    return this.request('GET', `/api/v1/teams/${encodeURIComponent(teamId)}/webhooks/${encodeURIComponent(webhookId)}`);
  }

  async updateWebhook(teamId: string, webhookId: string, url: string, events: WebhookEventType[], enabled?: boolean): Promise<Webhook> {
    const body: Record<string, unknown> = { url, events };
    if (enabled !== undefined) body.enabled = enabled;
    return this.request('PUT', `/api/v1/teams/${encodeURIComponent(teamId)}/webhooks/${encodeURIComponent(webhookId)}`, body);
  }

  async deleteWebhook(teamId: string, webhookId: string): Promise<{ message: string }> {
    return this.request('DELETE', `/api/v1/teams/${encodeURIComponent(teamId)}/webhooks/${encodeURIComponent(webhookId)}`);
  }

  async listWebhookDeliveries(teamId: string, webhookId: string, params?: { before_id?: string; limit?: number }): Promise<{ deliveries: WebhookDelivery[]; total: number }> {
    return this.request(
      'GET',
      `/api/v1/teams/${encodeURIComponent(teamId)}/webhooks/${encodeURIComponent(webhookId)}/deliveries`,
      undefined,
      params,
    );
  }

  async retryWebhookDelivery(teamId: string, webhookId: string, deliveryId: string): Promise<{ success: boolean; status_code: number; attempt: number; duration_ms: number; error: string }> {
    return this.request(
      'POST',
      `/api/v1/teams/${encodeURIComponent(teamId)}/webhooks/${encodeURIComponent(webhookId)}/deliveries/${encodeURIComponent(deliveryId)}/retry`,
    );
  }

  // Invitations (team-scoped)
  async listInvitations(teamId: string): Promise<{ invitations: Invitation[] }> {
    return this.request('GET', `/api/v1/teams/${encodeURIComponent(teamId)}/invitations`);
  }

  async createInvitation(teamId: string, email: string, role: string): Promise<{ invitation: Invitation; token: string }> {
    return this.request('POST', `/api/v1/teams/${encodeURIComponent(teamId)}/invitations`, { email, role });
  }

  async revokeInvitation(teamId: string, invitationId: string): Promise<{ message: string }> {
    return this.request('DELETE', `/api/v1/teams/${encodeURIComponent(teamId)}/invitations/${encodeURIComponent(invitationId)}`);
  }

  // Invitations (public, token-scoped)
  async previewInvitation(token: string): Promise<InvitationPreview> {
    return this.request('GET', `/api/v1/invitations/${encodeURIComponent(token)}`);
  }

  async acceptInvitation(token: string, password: string, displayName: string): Promise<{ message: string; user_id: string; team_id: string; role: string }> {
    return this.request('POST', `/api/v1/invitations/${encodeURIComponent(token)}/accept`, {
      password,
      display_name: displayName,
    });
  }

  // Sharding
  async getShardDurations(suite?: string): Promise<{ durations: TestDurationHistory[]; total: number }> {
    return this.request(
      'GET',
      '/api/v1/sharding/durations',
      undefined,
      suite !== undefined ? { suite } : undefined,
    );
  }

  async getShardDuration(testName: string): Promise<TestDurationHistory[]> {
    return this.request('GET', `/api/v1/sharding/durations/${encodeURIComponent(testName)}`);
  }

  async createShardPlan(params: { test_names: string[]; num_workers: number; strategy?: string; execution_id?: string; dependencies?: Record<string, string[]> }): Promise<ShardPlan> {
    return this.request('POST', '/api/v1/sharding/plan', params);
  }

  async rebalanceShards(params: { execution_id: string; failed_worker_id: string; current_plan: ShardPlan; completed_tests?: string[] }): Promise<ShardPlan> {
    return this.request('POST', '/api/v1/sharding/rebalance', params);
  }

  // Admin
  async listUsers(params?: { limit?: number; offset?: number }): Promise<{ users: AdminUser[]; total: number }> {
    return this.request('GET', '/api/v1/admin/users', undefined, params);
  }

  async listAuditLog(params?: { action?: string; resource_type?: string; actor_id?: string; since?: string; until?: string; limit?: number; offset?: number }): Promise<{ audit_log: AuditLog[]; total: number }> {
    return this.request('GET', '/api/v1/admin/audit-log', undefined, params);
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
