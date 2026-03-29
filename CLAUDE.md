# ScaledTest

## Product Vision

**ScaledTest scales out end-to-end testing with unparalleled reporting and capabilities.**

- **Scale**: Distribute and orchestrate large E2E test suites across parallel workers. This is the core value — running tests at scale that would take hours sequentially.
- **Reporting**: The best CTRF report viewer and analytics platform available. Rich dashboards, trend analysis, failure clustering, cross-execution comparison. Insights, not just data.
- **Modern & Sleek**: Clean, responsive UI with real-time updates. Dark mode, keyboard shortcuts, mobile-friendly. Feels like a premium tool.
- **User Management**: Team-based access control, onboarding flows, audit trails. Enterprise-ready from day one.
- **CTRF Native**: Built on the Common Test Results Format. CTRF is the backbone — we validate, normalize, store, and visualize it better than anyone.

**Every feature should serve at least one of these pillars.** When defining new work, ask: "Does this help users run more tests, faster, with better insights?"

## Architecture

ScaledTest is a v2 Go backend + React SPA:

- **Go backend**: chi router, pgxpool, JWT auth, RBAC, CTRF ingestion
- **React frontend**: React 19, TanStack Router/Query, Zustand, Recharts — served as embedded SPA via `go:embed`
- **K8s Job management** for distributed test execution
- **Quality gate rule DSL**, WebSocket hub for real-time updates

## Work Submission

Create PRs using the standard GitHub CLI:

```bash
gh pr create --title "sc-XXXXX: short description" --body "..."
```

## Development Standards

- **TDD**: Write failing tests first, then implementation
- **CTRF compliance**: All test result handling must conform to CTRF spec
- **Team scoping**: All data queries must be team-scoped (no cross-team data leaks)
- **API consistency**: v2 contract is `{ error, code, details? }` for all error responses
- **Type safety**: No `as any` without justification. Strict TypeScript.

## Test Commands

```bash
make test                   # All Go tests (with race detector)
make test-short             # Fast Go tests (no race)
make test-integration       # Integration tests (requires TEST_DATABASE_URL)
cd frontend && npm test     # Frontend tests (Vitest)
cd e2e && npm test          # E2E tests (Playwright)
cd e2e && npm run test:ui   # E2E tests in UI mode (interactive debugging)
```

## Key Directories

```
cmd/                  # Go binaries (server, worker, ci-notify)
internal/             # Go backend packages (auth, handler, store, ctrf, quality, ws, …)
frontend/             # React 19 SPA (Vite + TypeScript)
  src/
    components/       # UI components
    routes/           # TanStack Router page routes
sdk/                  # TypeScript SDK
migrations/           # Database migrations
e2e/                  # End-to-end tests
```
