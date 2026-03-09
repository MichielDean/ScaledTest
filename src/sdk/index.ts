/**
 * @scaledtest/sdk — TypeScript/JavaScript client for the ScaledTest API
 *
 * Provides a typed API client for uploading CTRF test reports and querying
 * results programmatically. Supports both session cookies and Bearer token
 * (API token) authentication.
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
  /** Bearer token (sct_*) or session token for authentication */
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
  pageSize?: number;
  status?: string;
  teamId?: string;
}

export interface CreateExecutionOptions {
  name: string;
  teamId: string;
  [key: string]: unknown;
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
  [key: string]: unknown;
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

export interface ExecutionPaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNext: boolean;
  hasPrev: boolean;
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
      pageSize: options?.pageSize,
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
   */
  async submitExecutionResults(
    id: string,
    options: SubmitResultsOptions
  ): Promise<{ message: string }> {
    if (!id || id.trim() === '') {
      throw new Error('submitExecutionResults: id is required and must not be empty');
    }
    const url = this.buildUrl(`/api/v1/executions/${encodeURIComponent(id)}/results`);
    const body = await this.request<{ success: true; message: string }>(url, {
      method: 'POST',
      body: JSON.stringify(options.report),
    });
    return { message: body.message };
  }

  /**
   * Cancel / delete an execution.
   * DELETE /api/v1/executions/{id}
   */
  async cancelExecution(id: string): Promise<{ message: string }> {
    if (!id || id.trim() === '') {
      throw new Error('cancelExecution: id is required and must not be empty');
    }
    const url = this.buildUrl(`/api/v1/executions/${encodeURIComponent(id)}`);
    const body = await this.request<{ success: true; message: string }>(url, {
      method: 'DELETE',
    });
    return { message: body.message };
  }

  /**
   * Get currently active (queued/running) executions.
   * GET /api/v1/executions/active
   */
  async getActiveExecutions(): Promise<ExecutionRecord[]> {
    const url = this.buildUrl('/api/v1/executions/active');
    const body = await this.request<{ success: true; data: ExecutionRecord[] }>(url, {
      method: 'GET',
    });
    return body.data;
  }
}
