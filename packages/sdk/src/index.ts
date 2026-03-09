/**
 * @scaledtest/sdk — TypeScript/JavaScript client for the ScaledTest API
 *
 * Provides a typed API client for:
 * - Uploading CTRF test reports
 * - Querying test results and statistics
 * - Managing and monitoring test executions
 *
 * Authentication:
 * - API token (Bearer, recommended for CI): new ScaledTestClient({ baseUrl, apiToken: 'sct_...' })
 * - Cookie/session (browser apps): new ScaledTestClient({ baseUrl }) — sets credentials: 'include'
 */

// ── Error classes ─────────────────────────────────────────────────────────────

/**
 * Base error class for all ScaledTest SDK errors.
 * All SDK errors extend this class; catch ScaledTestError to handle any SDK error.
 */
export class ScaledTestError extends Error {
  /** HTTP status code returned by the API, or 0 for network/client errors. */
  readonly statusCode: number;
  /** Raw error body from the API, if available. */
  readonly details?: unknown;

  constructor(message: string, statusCode: number, details?: unknown) {
    super(message);
    this.name = 'ScaledTestError';
    this.statusCode = statusCode;
    this.details = details;
    // Restore prototype chain (required when extending built-ins in TypeScript)
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when the API returns 401 Unauthorized.
 * Check your apiToken or session cookie.
 */
export class AuthenticationError extends ScaledTestError {
  constructor(message: string, details?: unknown) {
    super(message, 401, details);
    this.name = 'AuthenticationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when the API returns 403 Forbidden.
 * The authenticated user does not have sufficient permissions.
 */
export class PermissionError extends ScaledTestError {
  constructor(message: string, details?: unknown) {
    super(message, 403, details);
    this.name = 'PermissionError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when the API returns 400 Bad Request, or when client-side
 * input validation fails before the request is sent.
 */
export class ValidationError extends ScaledTestError {
  constructor(message: string, details?: unknown) {
    super(message, 400, details);
    this.name = 'ValidationError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when the API returns 404 Not Found.
 */
export class NotFoundError extends ScaledTestError {
  constructor(message: string, details?: unknown) {
    super(message, 404, details);
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

/**
 * Thrown when the API returns 409 Conflict.
 */
export class ConflictError extends ScaledTestError {
  constructor(message: string, details?: unknown) {
    super(message, 409, details);
    this.name = 'ConflictError';
    Object.setPrototypeOf(this, new.target.prototype);
  }
}

// ── Types ─────────────────────────────────────────────────────────────────────

/** SDK client configuration. */
export interface ScaledTestClientOptions {
  /**
   * Base URL of your ScaledTest instance. Trailing slash is stripped.
   * Example: 'https://scaledtest.example.com'
   */
  baseUrl: string;

  /**
   * API token for headless/CI authentication (format: sct_<hex>).
   * If omitted, the client uses cookie-based auth (credentials: 'include').
   */
  apiToken?: string;

  /**
   * Timeout in milliseconds for each request (default: 30_000).
   * Set to 0 to disable the timeout.
   */
  timeoutMs?: number;
}

/** CTRF test status values. */
export type CtrfTestStatus = 'passed' | 'failed' | 'skipped' | 'pending' | 'other';

/** A single CTRF test result. */
export interface CtrfTest {
  name: string;
  status: CtrfTestStatus;
  duration: number;
  start?: number;
  stop?: number;
  suite?: string;
  message?: string;
  trace?: string;
  flaky?: boolean;
  retries?: number;
  tags?: string[];
  [key: string]: unknown;
}

/** CTRF test summary. */
export interface CtrfSummary {
  tests: number;
  passed: number;
  failed: number;
  skipped: number;
  pending: number;
  other: number;
  suites?: number;
  start: number;
  stop: number;
  extra?: Record<string, unknown>;
}

/** CTRF report payload — the structure accepted by POST /api/v1/reports. */
export interface CtrfReport {
  reportFormat: 'CTRF';
  specVersion: string;
  reportId?: string;
  timestamp?: string;
  generatedBy?: string;
  results: {
    tool: {
      name: string;
      version?: string;
      url?: string;
      extra?: Record<string, unknown>;
    };
    summary: CtrfSummary;
    tests: CtrfTest[];
  };
  extra?: Record<string, unknown>;
}

/** Response returned by POST /api/v1/reports. */
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

/** Filters for GET /api/v1/reports. */
export interface GetReportsFilters {
  page?: number;
  size?: number;
  status?: string;
  tool?: string;
  environment?: string;
}

/** A stored CTRF report returned by GET /api/v1/reports. */
export interface StoredReport extends CtrfReport {
  _id: string;
  reportId: string;
  storedAt: string;
}

/** Paginated list response. */
export interface PaginatedResult<T> {
  data: T[];
  total: number;
  pagination: {
    page: number;
    size: number;
    total: number;
  };
}

/** Dashboard summary stats. */
export interface Stats {
  totalReports: number;
  totalTests: number;
  passRateLast7d: number;
  totalExecutions: number;
  activeExecutions: number;
}

/** Execution status values. */
export type ExecutionStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

/** A test execution record. */
export interface TestExecution {
  id: string;
  status: ExecutionStatus;
  dockerImage: string;
  testCommand: string;
  parallelism: number;
  environmentVars: Record<string, string>;
  resourceLimits: { cpu?: string; memory?: string };
  requestedBy: string | null;
  teamId: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  kubernetesJobName: string | null;
  kubernetesNamespace: string;
  errorMessage: string | null;
  totalPods: number;
  completedPods: number;
  failedPods: number;
}

/** Extended execution detail from GET /api/v1/executions/:id. */
export interface ExecutionDetail extends TestExecution {
  /** Pods currently running (derived: totalPods - completedPods - failedPods). */
  activePods: number;
  /** IDs of CTRF reports submitted by worker pods. */
  linkedReportIds: string[];
}

/** Filters for GET /api/v1/executions. */
export interface ListExecutionsFilters {
  page?: number;
  size?: number;
  status?: ExecutionStatus;
  teamId?: string;
  requestedBy?: string;
  dateFrom?: string;
  dateTo?: string;
}

/** Input for POST /api/v1/executions. */
export interface CreateExecutionInput {
  dockerImage: string;
  testCommand: string;
  parallelism?: number;
  environmentVars?: Record<string, string>;
  resourceLimits?: { cpu?: string; memory?: string };
  teamId?: string;
}

/** Filters for GET /api/v1/executions/active. */
export interface GetActiveExecutionsFilters {
  teamId?: string;
}

/** Response from GET /api/v1/executions/active. */
export interface ActiveExecutionsResult {
  activeExecutions: number;
}

// ── Internal helpers ──────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isValidUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/**
 * Build a query string from a plain object, omitting undefined values.
 * Returns '' if there are no params.
 */
function buildQuery(params: Record<string, string | number | boolean | undefined>): string {
  const entries = Object.entries(params).filter(([, v]) => v !== undefined && v !== null);
  if (entries.length === 0) return '';
  const qs = entries
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`)
    .join('&');
  return `?${qs}`;
}

/**
 * Map an HTTP status code to the appropriate SDK error class.
 * Falls back to ScaledTestError for any unhandled status.
 */
function statusToError(status: number, message: string, details?: unknown): ScaledTestError {
  switch (status) {
    case 400:
      return new ValidationError(message, details);
    case 401:
      return new AuthenticationError(message, details);
    case 403:
      return new PermissionError(message, details);
    case 404:
      return new NotFoundError(message, details);
    case 409:
      return new ConflictError(message, details);
    default:
      return new ScaledTestError(message, status, details);
  }
}

// ── ScaledTestClient ──────────────────────────────────────────────────────────

/**
 * Main client for the ScaledTest API.
 *
 * @example
 * // CI / headless (API token)
 * const client = new ScaledTestClient({
 *   baseUrl: 'https://scaledtest.example.com',
 *   apiToken: process.env.SCALEDTEST_API_TOKEN,
 * });
 * await client.uploadReport(ctrfReport);
 *
 * @example
 * // Browser (cookie auth)
 * const client = new ScaledTestClient({ baseUrl: 'https://scaledtest.example.com' });
 * const stats = await client.getStats();
 */
export class ScaledTestClient {
  private readonly baseUrl: string;
  private readonly apiToken: string | undefined;
  private readonly timeoutMs: number;

  constructor(options: ScaledTestClientOptions) {
    const { baseUrl, apiToken, timeoutMs = 30_000 } = options;

    if (!baseUrl) {
      throw new ValidationError('baseUrl is required');
    }

    // Strip trailing slash for consistent URL construction
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.apiToken = apiToken;
    this.timeoutMs = timeoutMs;
  }

  // ── Internal request helper ──────────────────────────────────────────────

  private async request<T>(
    method: 'GET' | 'POST' | 'DELETE',
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };

    if (this.apiToken) {
      headers['Authorization'] = `Bearer ${this.apiToken}`;
    }

    const init: {
      method: string;
      headers: Record<string, string>;
      body?: string;
      credentials?: 'include' | 'omit' | 'same-origin';
      signal?: AbortSignal;
    } = {
      method,
      headers,
    };

    if (body !== undefined) {
      init.body = JSON.stringify(body);
    }

    // Cookie auth mode — send session cookies
    if (!this.apiToken) {
      init.credentials = 'include';
    }

    // Abort controller for timeout
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    if (this.timeoutMs > 0) {
      const controller = new AbortController();
      timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);
      init.signal = controller.signal;
    }

    let response: Response;
    try {
      response = await fetch(url, init);
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') {
        throw new ScaledTestError(`Request timed out after ${this.timeoutMs}ms`, 0, err);
      }
      throw new ScaledTestError(
        err instanceof Error ? err.message : 'Network request failed',
        0,
        err
      );
    } finally {
      if (timeoutId !== undefined) {
        clearTimeout(timeoutId);
      }
    }

    // Parse JSON body
    let data: unknown;
    try {
      data = await response.json();
    } catch {
      throw new ScaledTestError(
        `Failed to parse API response (status ${response.status})`,
        response.status
      );
    }

    if (!response.ok) {
      const apiData = data as { error?: string; message?: string; details?: unknown };
      const message = apiData?.error ?? apiData?.message ?? `HTTP ${response.status}`;
      throw statusToError(response.status, message, apiData?.details);
    }

    // Return raw parsed JSON — callers are responsible for extracting what they need.
    // Using unknown avoids deceptive generic casts and forces explicit extraction at the call site.
    return data as unknown as T;
  }

  // ── Reports ───────────────────────────────────────────────────────────────

  /**
   * Upload a CTRF test report.
   * POST /api/v1/reports
   *
   * @param report CTRF report payload
   * @returns Upload result including the assigned report ID
   * @throws {ValidationError} If the report fails CTRF schema validation
   * @throws {AuthenticationError} If not authenticated
   */
  async uploadReport(report: CtrfReport): Promise<UploadReportResult> {
    // The reports endpoint returns flat fields (id, message) rather than a nested `data` object
    const raw = await this.request<{
      id: string;
      message: string;
      summary?: UploadReportResult['summary'];
    }>('POST', '/api/v1/reports', report);
    return {
      id: raw.id,
      message: raw.message,
      summary: raw.summary,
    };
  }

  /**
   * Retrieve stored test reports with optional filtering.
   * GET /api/v1/reports
   */
  async getReports(filters?: GetReportsFilters): Promise<PaginatedResult<StoredReport>> {
    const query = buildQuery({
      page: filters?.page,
      size: filters?.size,
      status: filters?.status,
      tool: filters?.tool,
      environment: filters?.environment,
    });
    return this.request<PaginatedResult<StoredReport>>('GET', `/api/v1/reports${query}`);
  }

  // ── Stats ─────────────────────────────────────────────────────────────────

  /**
   * Fetch dashboard summary statistics.
   * GET /api/v1/stats
   */
  async getStats(): Promise<Stats> {
    const envelope = await this.request<{ success: true; data: Stats }>('GET', '/api/v1/stats');
    return envelope.data;
  }

  // ── Executions ────────────────────────────────────────────────────────────

  /**
   * List test executions with optional filters.
   * GET /api/v1/executions
   */
  async listExecutions(filters?: ListExecutionsFilters): Promise<PaginatedResult<TestExecution>> {
    const query = buildQuery({
      page: filters?.page,
      size: filters?.size,
      status: filters?.status,
      teamId: filters?.teamId,
      requestedBy: filters?.requestedBy,
      dateFrom: filters?.dateFrom,
      dateTo: filters?.dateTo,
    });
    return this.request<PaginatedResult<TestExecution>>('GET', `/api/v1/executions${query}`);
  }

  /**
   * Get detailed information about a specific execution.
   * GET /api/v1/executions/:id
   *
   * @throws {ValidationError} If id is not a valid UUID (client-side check)
   * @throws {NotFoundError} If the execution does not exist
   */
  async getExecution(id: string): Promise<ExecutionDetail> {
    if (!isValidUuid(id)) {
      throw new ValidationError(`Invalid execution id: must be a valid UUID`);
    }
    const envelope = await this.request<{ success: true; data: ExecutionDetail }>(
      'GET',
      `/api/v1/executions/${id}`
    );
    return envelope.data;
  }

  /**
   * Create a new test execution.
   * POST /api/v1/executions
   * Requires maintainer or owner role.
   *
   * @throws {PermissionError} If the user does not have maintainer or higher
   * @throws {ValidationError} If the input fails validation
   */
  async createExecution(input: CreateExecutionInput): Promise<TestExecution> {
    const envelope = await this.request<{ success: true; data: TestExecution }>(
      'POST',
      '/api/v1/executions',
      input
    );
    return envelope.data;
  }

  /**
   * Cancel a running or queued execution.
   * DELETE /api/v1/executions/:id
   * Requires owner role.
   *
   * @throws {ValidationError} If id is not a valid UUID
   * @throws {NotFoundError} If the execution does not exist
   * @throws {ConflictError} If the execution is already in a terminal state
   * @throws {PermissionError} If the user does not have owner role
   */
  async cancelExecution(id: string): Promise<TestExecution> {
    if (!isValidUuid(id)) {
      throw new ValidationError(`Invalid execution id: must be a valid UUID`);
    }
    const envelope = await this.request<{ success: true; data: TestExecution }>(
      'DELETE',
      `/api/v1/executions/${id}`
    );
    return envelope.data;
  }

  /**
   * Get the count of currently active (queued or running) executions.
   * GET /api/v1/executions/active
   *
   * @param filters Optional teamId to scope the count to a specific team
   */
  async getActiveExecutions(filters?: GetActiveExecutionsFilters): Promise<ActiveExecutionsResult> {
    const query = buildQuery({ teamId: filters?.teamId });
    const envelope = await this.request<{ success: true; data: ActiveExecutionsResult }>(
      'GET',
      `/api/v1/executions/active${query}`
    );
    return envelope.data;
  }
}
