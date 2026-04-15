# ScaledTest

Scale out end-to-end testing with unparalleled reporting and capabilities.

## Architecture

ScaledTest is built on a Go backend with a React SPA frontend.

- **Go backend**: chi router, pgxpool, JWT auth, RBAC, CTRF ingestion
- **React 19 frontend**: TanStack Router/Query, Zustand, Recharts
- **Single binary**: serves the embedded SPA via `go:embed`
- **K8s Job management**: distributed test execution across parallel workers
- **Quality gates**: rule DSL for pass-rate thresholds and failure limits
- **LLM-powered triage**: automatic failure clustering and root cause analysis on ingested reports
- **WebSocket hub**: real-time execution status streaming
- **OAuth 2.0**: GitHub and Google login (plus email/password)

## Quick Start

> **Self-hosting?** See the [Getting Started deployment guide](docs/deployment/getting-started.md) for a complete walkthrough: choosing Docker Compose vs Kubernetes, setting required environment variables, registering your first user, and pointing a CI pipeline at your instance.

### Prerequisites

- Go 1.25+
- Node.js 22+
- PostgreSQL 16+

### Development

```bash
# Start both Go API (with hot-reload) and React dev server
make dev

# Or run them separately
make dev-api        # Go server with air
make dev-frontend   # React dev server (Vite)
```

The API runs on `http://localhost:8080` and the frontend dev server on `http://localhost:5173`.

### Configuration

Set environment variables with the `ST_` prefix:

```bash
export ST_DATABASE_URL=postgres://user:pass@localhost:5432/scaledtest
export ST_JWT_SECRET=your-secret-key-at-least-32-characters-long
export ST_BASE_URL=http://localhost:8080

# Optional: OAuth providers
export ST_OAUTH_GITHUB_CLIENT_ID=...
export ST_OAUTH_GITHUB_CLIENT_SECRET=...
export ST_OAUTH_GOOGLE_CLIENT_ID=...
export ST_OAUTH_GOOGLE_CLIENT_SECRET=...

# Optional: SMTP email (required for email notifications)
export ST_SMTP_HOST=smtp.example.com
export ST_SMTP_PORT=587          # default: 587
export ST_SMTP_USER=user@example.com
export ST_SMTP_PASS=your-smtp-password
export ST_SMTP_FROM=noreply@example.com

# Optional: GitHub commit status reporting
export ST_GITHUB_TOKEN=ghp_your_token   # needs repo:status scope

# Optional: LLM provider for test analysis and triage
export ST_LLM_PROVIDER=anthropic         # "anthropic" (default) or "openai"
export ST_LLM_COMMAND=claude             # Override CLI binary (test environments only)

# Required when using the LLM provider (depends on ST_LLM_PROVIDER)
export ANTHROPIC_API_KEY=your_api_key    # Required if ST_LLM_PROVIDER=anthropic
export OPENAI_API_KEY=your_api_key       # Required if ST_LLM_PROVIDER=openai

# Optional: disable rate limiting (test environments only — never use in production)
export ST_DISABLE_RATE_LIMIT=true

# Optional: Kubernetes worker resource limits (defaults shown)
export ST_WORKER_CPU_REQUEST=250m
export ST_WORKER_CPU_LIMIT=500m
export ST_WORKER_MEMORY_REQUEST=128Mi
export ST_WORKER_MEMORY_LIMIT=512Mi

# Optional: execution reconciler — detects orphaned K8s jobs and marks them failed
export ST_RECONCILE_INTERVAL=60s          # How often to check for orphans
export ST_RECONCILE_ORPHAN_TIMEOUT=5m     # Grace period before declaring an execution orphaned
```

When `ST_SMTP_HOST` is not set the mailer runs in no-op mode — all outbound email is silently discarded. Set it to enable email notifications. SMTP sends retry up to 3 times with exponential backoff on transient errors (5xx, connection timeout).

When `ST_GITHUB_TOKEN` is not set, GitHub commit status posting is disabled. When set, passing `github_owner`, `github_repo`, and `github_sha` query parameters to `POST /api/v1/reports` will post a `scaledtest/e2e` commit status back to GitHub after the report is ingested. GitHub status posts retry up to 3 times with exponential backoff on 429 and 5xx responses, respecting the `Retry-After` header.

When `ST_DISABLE_RATE_LIMIT=true` is set, all rate-limit middleware is bypassed and a warning is logged at startup. Use this only in controlled test environments (e.g. CI running E2E suites with many per-test user registrations). **Never set this in production** — it removes brute-force protection on auth endpoints.

When `ST_LLM_PROVIDER` is not set, the default is `anthropic`. The LLM provider is used internally for test result analysis and triage. You must configure the corresponding API key (`ANTHROPIC_API_KEY` or `OPENAI_API_KEY`) for your chosen provider. The provider is invoked via CLI (e.g., `claude` or `codex`) — no SDK is required. Set `ST_LLM_COMMAND` only in test environments to override the CLI binary path.

### Database Migrations

```bash
make migrate-up     # Apply all migrations
make migrate-down   # Rollback last migration
```

### Build

```bash
make build          # Builds frontend + Go binary → bin/scaledtest
make run            # Run the built binary
make docker         # Build Docker image
```

## API

All API endpoints live under `/api/v1` and require a Bearer token (`Authorization: Bearer sct_...` or a JWT access token).

### Health Check

The `/health` endpoint is publicly accessible (no authentication required) and is used by load balancers and CI systems to check server health:

```bash
GET /health
```

Response (HTTP 200):
```json
{
  "status": "ok",
  "timestamp": "2024-03-26T15:30:45Z"
}
```

### Authentication

```bash
# Register
POST /api/v1/auth/register         { "email", "password", "display_name" }

# Login → returns { access_token, expires_at, user }
POST /api/v1/auth/login            { "email", "password" }

# Get current user profile (requires valid JWT)
GET  /api/v1/auth/me

# Update display name (requires valid JWT)
PATCH /api/v1/auth/me              { "display_name" }

# Change password (requires valid JWT; rate-limited to 10 req/min per IP)
POST /api/v1/auth/change-password  { "current_password", "new_password" }

# OAuth (if configured)
GET /api/v1/auth/github            # Redirects to GitHub
GET /api/v1/auth/google            # Redirects to Google
```

### CTRF Report Submission

```bash
curl -X POST https://your-instance/api/v1/reports \
  -H "Authorization: Bearer sct_your_token" \
  -H "Content-Type: application/json" \
  -d @ctrf-report.json
```

Response:
```json
{
  "id": "report-uuid",
  "message": "report accepted",
  "summary": { "tests": 150, "passed": 145, "failed": 3, "skipped": 2 }
}
```

**GitHub commit status (optional):** Pass `github_owner`, `github_repo`, and `github_sha` as query parameters and configure `ST_GITHUB_TOKEN` on the server to automatically post a `scaledtest/e2e` commit status to GitHub after ingestion:

```bash
curl -X POST "https://your-instance/api/v1/reports?github_owner=acme&github_repo=myrepo&github_sha=$GIT_SHA" \
  -H "Authorization: Bearer sct_your_token" \
  -H "Content-Type: application/json" \
  -d @ctrf-report.json
```

The status is posted asynchronously (best-effort) and does not affect the HTTP response.

**Automatic test failure triage (optional):** When `ST_LLM_PROVIDER` is configured, ScaledTest automatically enqueues a background triage job for each ingested report. The job invokes the LLM provider to analyze failing tests, cluster them by root cause, and provide enriched context (flakiness history, git diff, previous failures in the same repository). Triage runs asynchronously after the HTTP response is sent and failures do not affect the report's status. The triage result and status are queryable via the test results API.

**Report backdating (test environments only):** When `ST_DISABLE_RATE_LIMIT=true`, you can pass a `created_at` query parameter (RFC3339 format) to override the report ingestion timestamp. This is useful for seeding historical data or testing trend analytics:

```bash
curl -X POST "https://your-instance/api/v1/reports?created_at=2024-03-15T12:00:00Z" \
  -H "Authorization: Bearer sct_your_token" \
  -H "Content-Type: application/json" \
  -d @ctrf-report.json
```

**⚠️ Never use `created_at` in production.** This parameter is only accepted when `ST_DISABLE_RATE_LIMIT=true` (test environments only) and has no effect when the flag is false.

### List Reports with Date Filtering

`GET /api/v1/reports` supports optional `since` and `until` query parameters to filter reports by creation date:

```bash
curl -X GET "https://your-instance/api/v1/reports?since=2024-01-01T00:00:00Z&until=2024-12-31T23:59:59Z" \
  -H "Authorization: Bearer sct_your_token"
```

**Query parameters:**

| Parameter | Format | Description |
|-----------|--------|-------------|
| `since` | RFC3339 | Return reports created at or after this timestamp (e.g., `2024-01-01T00:00:00Z`) |
| `until` | RFC3339 | Return reports created at or before this timestamp |

Both parameters are optional and can be used independently. If either parameter is provided but malformed (not RFC3339), the API returns HTTP 400 with a clear error message.

### Compare Two Reports

Compare two reports to see what changed — pass/fail status shifts, new failures, fixed tests, and duration deltas.

```bash
curl -X GET "https://your-instance/api/v1/reports/compare?base=<base-report-id>&head=<head-report-id>" \
  -H "Authorization: Bearer sct_..."
```

**Query parameters:**

| Parameter | Required | Description |
|-----------|----------|-------------|
| `base` | Yes | Report ID to compare from (baseline) |
| `head` | Yes | Report ID to compare to (new results) |

**Response (HTTP 200):**

```json
{
  "base": {
    "id": "report-uuid-1",
    "tool_name": "playwright",
    "summary": { "tests": 10, "passed": 9, "failed": 1 }
  },
  "head": {
    "id": "report-uuid-2",
    "tool_name": "playwright",
    "summary": { "tests": 11, "passed": 10, "failed": 1 }
  },
  "diff": {
    "summary": {
      "base_tests": 10,
      "head_tests": 11,
      "new_failures": 1,
      "fixed": 1,
      "passed_unchanged": 8,
      "failed_unchanged": 0
    },
    "new_failures": [
      { "name": "test_api_timeout", "duration_ms": 5000, "message": "..." }
    ],
    "fixed": [
      { "name": "test_db_connection", "duration_ms": 1500 }
    ]
  }
}
```

**Error responses:**

- HTTP 400: Missing `base` or `head` parameter, or `base` and `head` are the same ID
- HTTP 404: One or both report IDs don't exist, or belong to a different team (team isolation enforced)

### Invitations

Team owners and maintainers can invite users by email. The invitee receives a token link that opens a sign-up page. All authenticated endpoints below require the caller to be a member of the specified team (the `teamID` in the URL must match the caller's team).

```bash
# Create an invitation (maintainer or owner; returns token shown once)
POST /api/v1/teams/{teamID}/invitations  { "email", "role" }
# role: "readonly" | "maintainer" | "owner"

# List pending invitations for a team
GET /api/v1/teams/{teamID}/invitations

# Revoke a pending invitation
DELETE /api/v1/teams/{teamID}/invitations/{invitationID}

# Preview invitation details — public, no auth (used by the accept page)
GET /api/v1/invitations/{token}
# → { email, role, team_name, expires_at }

# Accept invitation — creates user account and team membership
POST /api/v1/invitations/{token}/accept  { "display_name", "password" }
# → { message, user_id, team_id, role }
```

Tokens are prefixed `inv_`, valid for **7 days**, and stored as SHA-256 hashes. The accept page is served at `/invitations/:token` in the SPA.

### Key Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/reports` | Upload CTRF report |
| `GET` | `/api/v1/reports` | List reports (supports `since`, `until` query params) |
| `GET` | `/api/v1/reports/{id}` | Get report |
| `GET` | `/api/v1/reports/compare` | Compare two reports (query params: `base`, `head` — report IDs) |
| `GET` | `/api/v1/reports/{id}/triage` | Get triage result (status, clusters, classifications, summary) |
| `POST` | `/api/v1/reports/{id}/triage/retry` | Retry triage for a completed run (maintainer+) |
| `DELETE` | `/api/v1/reports/{id}` | Delete report |
| `POST` | `/api/v1/executions` | Create test execution |
| `GET` | `/api/v1/executions` | List executions |
| `DELETE` | `/api/v1/executions/{id}` | Cancel/delete execution |
| `PUT` | `/api/v1/executions/{id}/status` | Update execution status |
| `POST` | `/api/v1/executions/{id}/progress` | Report test progress (worker callback; team-scoped) |
| `POST` | `/api/v1/executions/{id}/test-result` | Report individual test result (worker callback; team-scoped) |
| `POST` | `/api/v1/executions/{id}/worker-status` | Report worker health (worker callback; team-scoped) |
| `GET` | `/api/v1/analytics/trends` | Pass-rate trends |
| `GET` | `/api/v1/analytics/flaky-tests` | Flaky test detection |
| `GET` | `/api/v1/teams/{id}/quality-gates` | List quality gates |
| `POST` | `/api/v1/teams/{id}/quality-gates` | Create quality gate |
| `GET` | `/api/v1/teams/{id}/quality-gates/{gid}` | Get quality gate |
| `PUT` | `/api/v1/teams/{id}/quality-gates/{gid}` | Update quality gate |
| `DELETE` | `/api/v1/teams/{id}/quality-gates/{gid}` | Delete quality gate |
| `POST` | `/api/v1/teams/{id}/quality-gates/{gid}/evaluate` | Evaluate gate |
| `GET` | `/api/v1/teams/{id}/quality-gates/{gid}/evaluations` | List gate evaluations |
| `GET` | `/api/v1/teams/{id}/webhooks` | List webhooks for a team |
| `POST` | `/api/v1/teams/{id}/webhooks` | Create webhook (maintainer+) |
| `GET` | `/api/v1/teams/{id}/webhooks/{wid}` | Get webhook |
| `PUT` | `/api/v1/teams/{id}/webhooks/{wid}` | Update webhook (maintainer+) |
| `DELETE` | `/api/v1/teams/{id}/webhooks/{wid}` | Delete webhook (maintainer+) |
| `GET` | `/api/v1/teams/{id}/webhooks/{wid}/deliveries` | List recent delivery attempts |
| `POST` | `/api/v1/teams/{id}/webhooks/{wid}/deliveries/{did}/retry` | Re-dispatch a stored delivery (maintainer+) |
| `GET` | `/api/v1/teams` | List teams |
| `POST` | `/api/v1/teams/{id}/invitations` | Invite user to team (team member; maintainer+) |
| `GET` | `/api/v1/teams/{id}/invitations` | List team invitations (team member; maintainer+) |
| `DELETE` | `/api/v1/teams/{id}/invitations/{iid}` | Revoke invitation (team member; maintainer+) |
| `GET` | `/api/v1/invitations/{token}` | Preview invitation (public) |
| `POST` | `/api/v1/invitations/{token}/accept` | Accept invitation (public) |
| `GET` | `/api/v1/teams/{id}/tokens` | List API tokens |
| `POST` | `/api/v1/teams/{id}/tokens` | Create API token |
| `DELETE` | `/api/v1/teams/{id}/tokens/{tid}` | Delete API token |
| `GET` | `/api/v1/auth/me` | Get current user profile |
| `PATCH` | `/api/v1/auth/me` | Update user profile |
| `POST` | `/api/v1/auth/change-password` | Change password |
| `GET` | `/api/v1/admin/users` | List all users (owner only) |
| `GET` | `/api/v1/admin/audit-log` | Paginated audit log (`?limit=&offset=&action=`) (owner only) |
| `POST` | `/api/v1/sharding/plan` | Create a shard plan (duration-balanced or count-based) |
| `POST` | `/api/v1/sharding/rebalance` | Rebalance after worker failure |
| `GET` | `/api/v1/sharding/durations` | List all duration history for the team |
| `GET` | `/api/v1/sharding/durations/{testName}` | Get duration history for a specific test (returns array, 404 if none) |
| `GET` | `/ws/executions` | WebSocket for live updates |

### Quality Gate Rules

Quality gates are created with a `rules` array. Each rule uses a `{type, params}` schema:

```json
{
  "name": "CI Gate",
  "rules": [
    { "type": "pass_rate",       "params": { "threshold": 95.0 } },
    { "type": "max_duration",    "params": { "threshold_ms": 120000 } },
    { "type": "max_flaky_count", "params": { "threshold": 5 } },
    { "type": "min_test_count",  "params": { "threshold": 10 } },
    { "type": "zero_failures",   "params": null },
    { "type": "no_new_failures", "params": null }
  ]
}
```

| Rule type | Params | Description |
|-----------|--------|-------------|
| `pass_rate` | `{"threshold": <float>}` | Pass rate % must be ≥ threshold |
| `zero_failures` | none | No failed tests allowed |
| `no_new_failures` | none | No failures that weren't in the previous run. If no prior report exists, all current failures are treated as new failures. |
| `max_duration` | `{"threshold_ms": <int>}` | Total suite duration must be ≤ threshold |
| `max_flaky_count` | `{"threshold": <int>}` | Number of flaky tests must be ≤ threshold |
| `min_test_count` | `{"threshold": <int>}` | Total tests must be ≥ threshold |

Rule types `pass_rate`, `max_duration`, `max_flaky_count`, and `min_test_count` require non-null params. `zero_failures` and `no_new_failures` take no params.

### Webhook Delivery Pagination

`GET /api/v1/teams/{id}/webhooks/{wid}/deliveries` returns up to 20 deliveries per page using cursor-based pagination.

**Query parameters:**

| Parameter | Description |
|-----------|-------------|
| `cursor` | Opaque cursor from the previous response's `next_cursor` field (omit for the first page) |

**Response:**

```json
{
  "deliveries": [...],
  "total": 20,
  "next_cursor": "<opaque-cursor>"
}
```

`next_cursor` is only present when more results exist. Pass it as `?cursor=<next_cursor>` to fetch the next page. The cursor is an opaque composite of `delivered_at` (RFC3339Nano) and `id` for stable keyset ordering by `delivered_at DESC, id DESC`. Treat it as an opaque string — do not construct or parse it.

**Frontend UI:** The Webhooks page includes a **Deliveries** button per webhook that expands an inline delivery list. A **Load More** button appears when additional pages are available, and failed deliveries (non-2xx status codes) show a **Retry** button to re-dispatch.

## SDK

The `@scaledtest/sdk` TypeScript/JavaScript client provides type-safe access to the ScaledTest API.

### Installation

```bash
npm install @scaledtest/sdk
```

### Usage

```typescript
import { ScaledTestClient } from '@scaledtest/sdk';

const client = new ScaledTestClient({
  baseUrl: 'https://your-scaledtest-instance.com',
  token: 'sct_your_api_token',
});

// Upload a report
const report = await client.uploadReport(ctrfReport);
const report2 = await client.uploadReport(ctrfReport, { execution_id: 'exec-1' });

// Reports: pagination, compare, delete, triage
const { reports, total } = await client.getReports({ limit: 10, offset: 0, since: '2024-01-01T00:00:00Z' });
const diff = await client.compareReports(baseId, headId);
await client.deleteReport(reportId);
const triage = await client.getReportTriage(reportId);

// Executions: create, get, status, worker callbacks
const exec = await client.createExecution('npm test', { image: 'node:22' });
const execution = await client.getExecution(execId);
await client.updateExecutionStatus(execId, 'completed');
await client.reportExecutionProgress(execId, { passed: 5, failed: 0, skipped: 1, total: 6 });
await client.reportTestResult(execId, { name: 'test-a', status: 'passed' });
await client.reportWorkerStatus(execId, { worker_id: 'w1', status: 'running' });

// Quality gates (evaluate now requires reportId)
const result = await client.evaluateQualityGate(teamId, gateId, reportId);

// Manage webhooks
const { webhooks } = await client.listWebhooks(teamId);
const { webhook, secret } = await client.createWebhook(teamId, url, events);
await client.updateWebhook(teamId, webhookId, url, events, false);
await client.retryWebhookDelivery(teamId, webhookId, deliveryId);

// Manage invitations
const { invitation, token } = await client.createInvitation(teamId, email, role);
const { invitations } = await client.listInvitations(teamId);
const preview = await client.previewInvitation(token);
await client.acceptInvitation(token, password, displayName);

// Teams
const { team, role } = await client.getTeam(teamId);
await client.deleteTeam(teamId);

// Manage API tokens
const { tokens } = await client.listTokens(teamId);
const { token: newToken } = await client.createToken(teamId, name);
await client.deleteToken(teamId, tokenId);

// Sharding
const plan = await client.createShardPlan({ test_names: [...], num_workers: 4 });
const durations = await client.getShardDuration('test-name');
const rebalanced = await client.rebalanceShards({ execution_id, failed_worker_id, current_plan });

// Admin operations (owner only)
const { users } = await client.listUsers({ limit: 50 });
const { audit_log } = await client.listAuditLog({ action: 'team.create' });
```

All methods properly URL-encode path parameters and handle errors via `ScaledTestError`.

## Testing

### Go tests

```bash
make test               # All Go tests with race detector
make test-short         # Without race detector
make test-integration   # Store integration tests (requires TEST_DATABASE_URL)
make lint               # golangci-lint
```

### Frontend tests

```bash
make frontend-test      # React component/unit tests
```

### E2E tests

```bash
cd e2e && npm test              # Run all Playwright E2E tests
cd e2e && npm run test:ui       # Run tests in UI mode (interactive debugging)
cd e2e && npm run test:headed   # Run tests in headed mode (visible browser)
```

Tests validate browser-based user flows including authentication, navigation, report submission, quality gates, webhooks, executions, and analytics views. Requires the server running (`make dev-api`) and configured database.


## User Roles

| Role | Permissions |
|------|-------------|
| `member` | View reports, dashboards, analytics |
| `maintainer` | Upload reports, create executions, manage webhooks |
| `owner` | All of the above + user management, admin endpoints, audit log |

## CI Integration

ScaledTest integrates with CI pipelines to collect test results and enforce quality gates.

**Quick start:** Copy [`ci-integration/github-actions.yml`](ci-integration/github-actions.yml) into your repo's `.github/workflows/` directory. It demonstrates the full flow:

1. Run tests and produce a CTRF report
2. Upload the report to ScaledTest via `POST /api/v1/reports`
3. Evaluate a quality gate to pass/fail the build

**Required secrets:** `SCALEDTEST_URL`, `SCALEDTEST_API_TOKEN`, `SCALEDTEST_TEAM_ID`, `SCALEDTEST_GATE_ID`

**Detailed guides:**
- [GitHub Actions integration](docs/ci-integration/github-actions.md)
- [GitLab CI integration](docs/ci-integration/gitlab-ci.md)
- [Telegram CI notifications](docs/ci-integration/telegram-notifications.md)

## Project Structure

```
cmd/
  server/             # v2 Go server entrypoint
  worker/             # v2 worker binary for distributed execution
  ci-notify/          # CLI: send CI health notifications to Telegram
internal/
  auth/               # JWT, RBAC, OAuth, CSRF
  config/             # Environment-based configuration
  db/                 # Database pool, migrations
  handler/            # HTTP handlers (reports, executions, teams, admin, etc.)
  server/             # Router and middleware setup
  store/              # Data access layer (store interfaces + implementations)
  github/             # GitHub commit status client
  llm/                # LLM provider abstraction (Anthropic, OpenAI, mock)
  mail/               # Email sender interface and SMTP implementation
  mailer/              # Invitation email composer (SMTP, multipart HTML)
  smtptransient/       # Shared SMTP transient-error classification (4xx/5xx/timeout)
  webhook/            # Outbound webhook dispatch
  ws/                 # WebSocket hub for real-time updates
  k8s/                # Kubernetes job management
  gotest/             # go test -json output parser
  telegram/           # Telegram Bot API client for CI notifications
frontend/             # React 19 SPA (TanStack Router, Vite)
sdk/                  # @scaledtest/sdk TypeScript client
e2e/                  # Playwright E2E tests
ci-integration/       # Example CI workflow files
```

## License

MIT
