/**
 * @scaledtest/sdk — TypeScript/JavaScript client for the ScaledTest API
 *
 * Provides a typed API client for uploading CTRF test reports and querying
 * results programmatically. Supports Bearer token (API token) authentication.
 *
 * Usage:
 *   import { ScaledTestClient } from '@scaledtest/sdk';
 *
 *   const client = new ScaledTestClient({
 *     baseUrl: 'https://your-scaledtest-instance.example.com',
 *     token: 'sct_your_api_token',
 *   });
 *
 *   await client.uploadReport({ report: ctrfPayload });
 */

// ── Error class ───────────────────────────────────────────────────────────────

/**
 * Thrown by ScaledTestClient whenever the server returns a non-2xx response.
 * Includes the HTTP status code for programmatic handling.
 */
export class ScaledTestError extends Error {
  public readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ScaledTestError';
    this.status = status;
    // Maintain proper prototype chain in compiled JS
    Object.setPrototypeOf(this, ScaledTestError.prototype);
  }
}

// ── Option types ──────────────────────────────────────────────────────────────

export interface ScaledTestClientOptions {
  /** Base URL of the ScaledTest instance, e.g. https://scaledtest.example.com */
  baseUrl: string;
  /** Bearer token (sct_*) for authentication */
  token: string;
}

export interface UploadReportOptions {
  /** CTRF-formatted test report payload */
  report: Record<string, unknown>;
}

export interface GetReportsOptions {
  page?: number;
  size?: number;
  status?: string;
  tool?: string;
  environment?: string;
}

export interface ListExecutionsOptions {
  page?: number;
  /** Page size — maps to query param "size" on the server */
  size?: number;
  status?: string;
  teamId?: string;
}

export interface CreateExecutionOptions {
  /** Docker image to run, e.g. "node:20" */
  dockerImage: string;
  /** Shell command to execute inside the container, e.g. "npm test" */
  testCommand: string;
  parallelism?: number;
  environmentVars?: Record<string, string>;
  resourceLimits?: { cpu?: string; memory?: string };
  teamId?: string;
}

export interface SubmitResultsOptions {
  /** CTRF-formatted test report payload */
  report: Record<string, unknown>;
}

// ── Response shapes ───────────────────────────────────────────────────────────

export interface UploadReportResult {
  id: string;
  message: string;
  summary?: {
    tests: number;
    passed: number;
    failed: number;
    skipped: number;
    pending: number;
    other: number;
  };
}

export interface ReportRecord {
  _id: string;
  reportId: string;
  storedAt: string;
  [key: string]: unknown;
}

export interface PaginationMeta {
  page: number;
  size: number;
  total: number;
}

export interface GetReportsResult {
  data: ReportRecord[];
  total: number;
  pagination: PaginationMeta;
}

export interface StatsData {
  totalReports: number;
  totalTests: number;
  passRateLast7d: number;
  totalExecutions: number;
  activeExecutions: number;
}

export interface TeamRecord {
  id: string;
  name: string;
  [key: string]: unknown;
}

export interface ExecutionRecord {
  id: string;
  status: string;
  [key: string]: unknown;
}

/** Pagination meta returned by GET /api/v1/executions — matches server contract */
export interface ExecutionPaginationMeta {
  page: number;
  size: number;
  total: number;
}

export interface ListExecutionsResult {
  data: ExecutionRecord[];
  total: number;
  pagination: ExecutionPaginationMeta;
}

// ── Client ────────────────────────────────────────────────────────────────────

/**
 * ScaledTestClient — typed HTTP client for the ScaledTest v1 API.
 *
 * All methods return typed response payloads and throw ScaledTestError on
 * non-2xx responses. Network-level errors (fetch throws) are propagated as-is.
 */
export class ScaledTestClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(options: ScaledTestClientOptions) {
    if (!options.baseUrl || options.baseUrl.trim() === '') {
      throw new Error('ScaledTestClient: baseUrl is required and must not be empty');
    }
    if (!options.token || options.token.trim() === '') {
      throw new Error('ScaledTestClient: token is required and must not be empty');
    }
    // Validate baseUrl is parseable and has an http/https scheme.
    // buildUrl() calls `new URL(this.baseUrl + path)` so a bad baseUrl would throw
    // a confusing TypeError deep inside a method call; fail fast here instead.
    // We also require http/https: 'localhost:3000' parses as scheme=localhost: which
    // would silently misbehave when paths are appended.
    let parsedUrl: URL;
    try {
      parsedUrl = new URL(options.baseUrl);
    } catch {
      throw new Error(
        `ScaledTestClient: baseUrl is not a valid URL (${options.baseUrl}). ` +
          'Ensure it includes a scheme, e.g. https://api.example.com'
      );
    }
    if (parsedUrl.protocol !== 'http:' && parsedUrl.protocol !== 'https:') {
      throw new Error(
        `ScaledTestClient: baseUrl must use http or https scheme (got ${parsedUrl.protocol}). ` +
          'Example: https://api.example.com'
      );
    }
    // Strip trailing slash to avoid double-slash in URLs
    this.baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.token = options.token;
  }

  // ── Private helpers ─────────────────────────────────────────────────────────

  private buildUrl(path: string, params?: Record<string, string | number | undefined>): string {
    const url = new URL(this.baseUrl + path);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null && value !== '') {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  private get authHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  private async request<T>(
    url: string,
    init: { method: string; body?: string; headers?: Record<string, string> }
  ): Promise<T> {
    const response = await fetch(url, {
      method: init.method,
      body: init.body,
      headers: {
        ...this.authHeaders,
        ...(init.headers ?? {}),
      },
    });

    if (!response.ok) {
      let message: string;
      try {
        const body = (await response.json()) as { error?: string };
        message = body.error ?? `HTTP ${response.status}`;
      } catch {
        message = `HTTP ${response.status}`;
      }
      throw new ScaledTestError(message, response.status);
    }

    return response.json() as Promise<T>;
  }

  // ── Reports ─────────────────────────────────────────────────────────────────

  /**
   * Upload a CTRF test report.
   * POST /api/v1/reports
   */
  async uploadReport(options: UploadReportOptions): Promise<UploadReportResult> {
    const url = this.buildUrl('/api/v1/reports');
    const body = await this.request<{ success: true } & UploadReportResult>(url, {
      method: 'POST',
      body: JSON.stringify(options.report),
    });
    return {
      id: body.id,
      message: body.message,
      summary: body.summary,
    };
  }

  /**
   * List test reports with optional filters.
   * GET /api/v1/reports
   */
  async getReports(options?: GetReportsOptions): Promise<GetReportsResult> {
    const url = this.buildUrl('/api/v1/reports', {
      page: options?.page,
      size: options?.size,
      status: options?.status,
      tool: options?.tool,
      environment: options?.environment,
    });
    const body = await this.request<{ success: true } & GetReportsResult>(url, {
      method: 'GET',
    });
    return {
      data: body.data,
      total: body.total,
      pagination: body.pagination,
    };
  }

  // ── Stats ───────────────────────────────────────────────────────────────────

  /**
   * Get dashboard summary statistics.
   * GET /api/v1/stats
   */
  async getStats(): Promise<StatsData> {
    const url = this.buildUrl('/api/v1/stats');
    const body = await this.request<{ success: true; data: StatsData }>(url, {
      method: 'GET',
    });
    return body.data;
  }

  // ── Teams ───────────────────────────────────────────────────────────────────

  /**
   * List teams the authenticated user is a member of.
   * GET /api/v1/teams
   */
  async listTeams(): Promise<TeamRecord[]> {
    const url = this.buildUrl('/api/v1/teams');
    const body = await this.request<{ success: true; data: TeamRecord[] }>(url, {
      method: 'GET',
    });
    return body.data;
  }

  // ── Executions ──────────────────────────────────────────────────────────────

  /**
   * List test executions with optional filters.
   * GET /api/v1/executions
   */
  async listExecutions(options?: ListExecutionsOptions): Promise<ListExecutionsResult> {
    const url = this.buildUrl('/api/v1/executions', {
      page: options?.page,
      size: options?.size, // server expects "size", not "pageSize"
      status: options?.status,
      teamId: options?.teamId,
    });
    const body = await this.request<{ success: true } & ListExecutionsResult>(url, {
      method: 'GET',
    });
    return {
      data: body.data,
      total: body.total,
      pagination: body.pagination,
    };
  }

  /**
   * Get details of a single execution.
   * GET /api/v1/executions/{id}
   */
  async getExecutionDetail(id: string): Promise<ExecutionRecord> {
    if (!id || id.trim() === '') {
      throw new Error('getExecutionDetail: id is required and must not be empty');
    }
    const url = this.buildUrl(`/api/v1/executions/${encodeURIComponent(id)}`);
    const body = await this.request<{ success: true; data: ExecutionRecord }>(url, {
      method: 'GET',
    });
    return body.data;
  }

  /**
   * Create a new test execution.
   * POST /api/v1/executions
   */
  async createExecution(options: CreateExecutionOptions): Promise<ExecutionRecord> {
    if (!options.dockerImage || options.dockerImage.trim() === '') {
      throw new Error('createExecution: dockerImage is required and must not be empty');
    }
    if (!options.testCommand || options.testCommand.trim() === '') {
      throw new Error('createExecution: testCommand is required and must not be empty');
    }
    const url = this.buildUrl('/api/v1/executions');
    const body = await this.request<{ success: true; data: ExecutionRecord }>(url, {
      method: 'POST',
      body: JSON.stringify(options),
    });
    return body.data;
  }

  /**
   * Submit test results into an existing execution.
   * POST /api/v1/executions/{id}/results
   * Returns { reportId } matching the server contract.
   */
  async submitExecutionResults(
    id: string,
    options: SubmitResultsOptions
  ): Promise<{ reportId: string }> {
    if (!id || id.trim() === '') {
      throw new Error('submitExecutionResults: id is required and must not be empty');
    }
    const url = this.buildUrl(`/api/v1/executions/${encodeURIComponent(id)}/results`);
    const body = await this.request<{ success: true; reportId: string }>(url, {
      method: 'POST',
      body: JSON.stringify(options.report),
    });
    return { reportId: body.reportId };
  }

  /**
   * Cancel / delete an execution.
   * DELETE /api/v1/executions/{id}
   * Returns the cancelled ExecutionRecord matching server contract.
   */
  async cancelExecution(id: string): Promise<ExecutionRecord> {
    if (!id || id.trim() === '') {
      throw new Error('cancelExecution: id is required and must not be empty');
    }
    const url = this.buildUrl(`/api/v1/executions/${encodeURIComponent(id)}`);
    const body = await this.request<{ success: true; data: ExecutionRecord }>(url, {
      method: 'DELETE',
    });
    return body.data;
  }

  /**
   * Get the count of currently active (queued/running) executions.
   * GET /api/v1/executions/active
   * Returns { activeExecutions: number } matching server contract.
   */
  async getActiveExecutions(options?: { teamId?: string }): Promise<{ activeExecutions: number }> {
    const url = this.buildUrl('/api/v1/executions/active', {
      teamId: options?.teamId,
    });
    const body = await this.request<{ success: true; data: { activeExecutions: number } }>(url, {
      method: 'GET',
    });
    return { activeExecutions: body.data.activeExecutions };
  }
}
