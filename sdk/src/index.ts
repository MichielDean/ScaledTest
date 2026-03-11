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
  public readonly status: number

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ScaledTestError'
    this.status = status
    Object.setPrototypeOf(this, ScaledTestError.prototype)
  }
}

// ── Types ────────────────────────────────────────────────────────────────────

export interface ClientOptions {
  baseUrl: string
  token: string
  timeoutMs?: number
}

export interface CtrfReport {
  results: {
    tool: { name: string; version?: string }
    summary: {
      tests: number
      passed: number
      failed: number
      skipped: number
      pending: number
      other: number
      start: number
      stop: number
    }
    tests: Array<{
      name: string
      status: 'passed' | 'failed' | 'skipped' | 'pending' | 'other'
      duration: number
      message?: string
      trace?: string
      suite?: string
      tags?: string[]
      flaky?: boolean
      retries?: number
    }>
  }
}

export interface Report {
  id: string
  team_id: string
  tool_name: string
  tool_version?: string
  summary: { tests: number; passed: number; failed: number; skipped: number; pending: number; other: number }
  created_at: string
}

export interface Execution {
  id: string
  team_id: string
  command: string
  status: string
  created_at: string
  started_at?: string
  completed_at?: string
}

export interface QualityGate {
  id: string
  name: string
  team_id: string
  rules: Array<{ type: string; threshold: number }>
  created_at: string
}

export interface QualityGateEvaluation {
  id: string
  quality_gate_id: string
  passed: boolean
  details: unknown
  created_at: string
}

export interface TrendPoint {
  date: string
  pass_rate: number
  total: number
  passed: number
  failed: number
}

export interface FlakyTest {
  name: string
  suite?: string
  flake_rate: number
  occurrences: number
}

export interface Team {
  id: string
  name: string
  created_at: string
}

// ── Client ───────────────────────────────────────────────────────────────────

export class ScaledTestClient {
  private readonly baseUrl: string
  private readonly token: string
  private readonly timeoutMs: number

  constructor(options: ClientOptions) {
    if (!options.baseUrl) throw new Error('baseUrl is required')
    if (!options.token) throw new Error('token is required')

    let parsed: URL
    try {
      parsed = new URL(options.baseUrl)
    } catch {
      throw new Error(`Invalid baseUrl: ${options.baseUrl}`)
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      throw new Error(`baseUrl must use http or https (got ${parsed.protocol})`)
    }

    this.baseUrl = options.baseUrl.replace(/\/+$/, '')
    this.token = options.token
    this.timeoutMs = options.timeoutMs ?? 30_000
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const url = `${this.baseUrl}${path}`
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    }

    let signal: AbortSignal | undefined
    let timeoutId: ReturnType<typeof setTimeout> | undefined
    if (this.timeoutMs > 0) {
      const controller = new AbortController()
      signal = controller.signal
      timeoutId = setTimeout(() => controller.abort(), this.timeoutMs)
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
        signal,
      })

      if (!response.ok) {
        let message: string
        try {
          const err = (await response.json()) as { error?: string }
          message = err.error ?? `HTTP ${response.status}`
        } catch {
          message = `HTTP ${response.status}`
        }
        throw new ScaledTestError(message, response.status)
      }

      return response.json() as Promise<T>
    } finally {
      if (timeoutId) clearTimeout(timeoutId)
    }
  }

  // Reports
  async uploadReport(report: CtrfReport): Promise<{ id: string }> {
    return this.request('POST', '/api/v1/reports', report)
  }

  async getReports(): Promise<{ reports: Report[]; total: number }> {
    return this.request('GET', '/api/v1/reports')
  }

  async getReport(id: string): Promise<Report> {
    return this.request('GET', `/api/v1/reports/${encodeURIComponent(id)}`)
  }

  // Executions
  async getExecutions(): Promise<{ executions: Execution[]; total: number }> {
    return this.request('GET', '/api/v1/executions')
  }

  async createExecution(command: string): Promise<Execution> {
    return this.request('POST', '/api/v1/executions', { command })
  }

  async cancelExecution(id: string): Promise<void> {
    await this.request('DELETE', `/api/v1/executions/${encodeURIComponent(id)}`)
  }

  // Analytics
  async getTrends(): Promise<TrendPoint[]> {
    return this.request('GET', '/api/v1/analytics/trends')
  }

  async getFlakyTests(): Promise<FlakyTest[]> {
    return this.request('GET', '/api/v1/analytics/flaky-tests')
  }

  async getErrorAnalysis(): Promise<unknown> {
    return this.request('GET', '/api/v1/analytics/error-analysis')
  }

  async getDurationDistribution(): Promise<unknown> {
    return this.request('GET', '/api/v1/analytics/duration-distribution')
  }

  // Quality Gates
  async getQualityGates(): Promise<{ quality_gates: QualityGate[]; total: number }> {
    return this.request('GET', '/api/v1/quality-gates')
  }

  async createQualityGate(name: string, rules: Array<{ type: string; threshold: number }>): Promise<QualityGate> {
    return this.request('POST', '/api/v1/quality-gates', { name, rules })
  }

  async evaluateQualityGate(id: string): Promise<QualityGateEvaluation> {
    return this.request('POST', `/api/v1/quality-gates/${encodeURIComponent(id)}/evaluate`)
  }

  // Teams
  async getTeams(): Promise<{ teams: Team[] }> {
    return this.request('GET', '/api/v1/teams')
  }

  async createTeam(name: string): Promise<Team> {
    return this.request('POST', '/api/v1/teams', { name })
  }
}
