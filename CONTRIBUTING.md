# Contributing to ScaledTest

## Prerequisites

- **Go 1.25+** — [install](https://go.dev/dl/)
- **Node.js 22+** — [install](https://nodejs.org/)
- **Docker** — [install](https://docs.docker.com/get-docker/) (for containerized builds and PostgreSQL)
- **PostgreSQL / TimescaleDB** — run via Docker or install locally

## Getting Started

```bash
git clone <repo-url> && cd scaledtest

# Install frontend dependencies
cd frontend && npm ci && cd ..

# Start both Go API and React frontend in dev mode
make dev
```

The API server runs with [air](https://github.com/air-verse/air) for hot-reload.
The frontend dev server runs via Vite.

## Running Tests

```bash
# Go tests (with race detector)
make test

# Go tests (fast, no race detector)
make test-short

# Frontend tests
make frontend-test
```

## Running E2E Tests (Playwright)

E2E tests live in `e2e/` and use Playwright. A global setup step runs before the suite to seed required test users via `POST /auth/register`.

**The backend must be running** before you start Playwright:

```bash
# In one terminal — start the backend
make dev

# In another terminal — run Playwright
cd e2e && npx playwright test
```

The setup reads the base URL from `playwright.config.ts` → `projects[0].use.baseURL`, falling back to the `E2E_BASE_URL` environment variable, and finally `http://localhost:8080`.

To point tests at a non-default backend:

```bash
E2E_BASE_URL=http://localhost:9090 npx playwright test
```

### Seeded test users

The global setup creates the following users (idempotent — safe to re-run):

| Email | Password | Role |
|---|---|---|
| `maintainer@example.com` | `Maintainer123!` | Maintainer |

## Building

```bash
# Production binary (embeds frontend)
make build

# Docker image
make docker
```

## Code Quality

```bash
make fmt       # Format Go code
make lint      # Run golangci-lint
```

## Database Migrations

```bash
make migrate-up    # Apply migrations
make migrate-down  # Rollback last migration
```

## Submitting Changes

1. Create a feature branch from `main`.
2. Make focused, atomic commits.
3. Ensure `make test` and `make lint` pass before submitting.
