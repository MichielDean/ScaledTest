# ScaledTest

Scale out end-to-end testing with unparalleled reporting and capabilities.

## Architecture

ScaledTest is built on a Go backend with a React SPA frontend.

- **Go backend**: chi router, pgxpool, JWT auth, RBAC, CTRF ingestion
- **React 19 frontend**: TanStack Router/Query, Zustand, Recharts
- **Single binary**: serves the embedded SPA via `go:embed`
- **K8s Job management**: distributed test execution across parallel workers
- **Quality gates**: rule DSL for pass-rate thresholds and failure limits
- **WebSocket hub**: real-time execution status streaming
- **OAuth 2.0**: GitHub and Google login (plus email/password)

## Quick Start

### Prerequisites

- Go 1.23+
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
```

When `ST_SMTP_HOST` is not set the mailer runs in no-op mode — all outbound email is silently discarded. Set it to enable email notifications.

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

### Authentication

```bash
# Register
POST /auth/register         { "email", "password", "display_name" }

# Login → returns { access_token, expires_at, user }
POST /auth/login            { "email", "password" }

# Change password (requires valid JWT; rate-limited to 10 req/min per IP)
POST /auth/change-password  { "current_password", "new_password" }

# OAuth (if configured)
GET /auth/github            # Redirects to GitHub
GET /auth/google            # Redirects to Google
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

### Key Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/reports` | Upload CTRF report |
| `GET` | `/api/v1/reports` | List reports |
| `POST` | `/api/v1/executions` | Create test execution |
| `GET` | `/api/v1/executions` | List executions |
| `PUT` | `/api/v1/executions/{id}/status` | Update execution status |
| `GET` | `/api/v1/analytics/trends` | Pass-rate trends |
| `GET` | `/api/v1/analytics/flaky-tests` | Flaky test detection |
| `POST` | `/api/v1/teams/{id}/quality-gates` | Create quality gate |
| `POST` | `/api/v1/teams/{id}/quality-gates/{gid}/evaluate` | Evaluate gate |
| `GET` | `/api/v1/teams/{id}/webhooks` | List webhooks for a team |
| `POST` | `/api/v1/teams/{id}/webhooks` | Create webhook (maintainer+) |
| `GET` | `/api/v1/teams/{id}/webhooks/{wid}/deliveries` | List recent delivery attempts |
| `POST` | `/api/v1/teams/{id}/webhooks/{wid}/deliveries/{did}/retry` | Re-dispatch a stored delivery (maintainer+) |
| `GET` | `/api/v1/teams` | List teams |
| `GET` | `/api/v1/admin/users` | List all users (owner only) |
| `GET` | `/api/v1/admin/audit-log` | Paginated audit log (`?limit=&offset=&action=`) (owner only) |
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
| `no_new_failures` | none | No failures that weren't in the previous run |
| `max_duration` | `{"threshold_ms": <int>}` | Total suite duration must be ≤ threshold |
| `max_flaky_count` | `{"threshold": <int>}` | Number of flaky tests must be ≤ threshold |
| `min_test_count` | `{"threshold": <int>}` | Total tests must be ≥ threshold |

Rule types `pass_rate`, `max_duration`, `max_flaky_count`, and `min_test_count` require non-null params. `zero_failures` and `no_new_failures` take no params.

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

## Project Structure

```
cmd/
  server/             # v2 Go server entrypoint
  worker/             # v2 worker binary for distributed execution
internal/
  auth/               # JWT, RBAC, OAuth, CSRF
  config/             # Environment-based configuration
  db/                 # Database pool, migrations
  handler/            # HTTP handlers (reports, executions, teams, admin, etc.)
  server/             # Router and middleware setup
  store/              # Data access (audit, webhooks, quality gates)
  mail/               # Email sender interface and SMTP implementation
  webhook/            # Outbound webhook dispatch
  ws/                 # WebSocket hub for real-time updates
  k8s/                # Kubernetes job management
frontend/             # React 19 SPA (TanStack Router, Vite)
sdk/                  # @scaledtest/sdk TypeScript client
e2e/                  # Playwright E2E tests
ci-integration/       # Example CI workflow files
```

## License

MIT
