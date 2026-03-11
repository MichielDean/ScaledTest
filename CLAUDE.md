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

ScaledTest is a dual-stack platform (v1 legacy + v2 Go backend both on main):

### v1 Legacy (Next.js monolith)
- Next.js 15 + React 19 + TypeScript
- Better Auth for authentication/RBAC
- TimescaleDB for time-series test data
- Jest (unit/component/integration) + Playwright (E2E)

### v2 (Go backend + React SPA — now on main)
- Go backend: chi router, pgxpool, JWT auth, RBAC, CTRF ingestion
- React 19 frontend: TanStack Router/Query, Zustand, Recharts
- Single binary serves embedded SPA via go:embed
- K8s Job management for distributed execution
- Quality gate rule DSL, WebSocket hub for real-time updates

## Work Submission (CRITICAL for polecats)

**NEVER create PRs directly with `gh pr create`.** All work goes through the Gas Town merge queue:

```bash
gt done --pre-verified    # Submit branch to MQ, notify witness, transition to idle
```

This ensures:
- Bead/issue is automatically closed after merge
- Refinery runs quality gates
- Branch cleanup happens automatically
- Work is tracked in the capability ledger

If you create a PR manually, the bead will NOT be closed and the work is invisible to the system.

## Development Standards

- **TDD**: Write failing tests first, then implementation
- **CTRF compliance**: All test result handling must conform to CTRF spec
- **Team scoping**: All data queries must be team-scoped (no cross-team data leaks)
- **API consistency**: v1 uses `{ success: false, error: string }` (optionally `message`/`data`); v2 target contract is `{ error, code, details? }` for all new APIs
- **Type safety**: No `as any` without justification. Strict TypeScript.

## Test Commands

```bash
npm test                    # All tests
npm run test:unit           # Unit tests
npm run test:components     # Component tests
npm run test:integration    # Integration tests
npm run test:system         # System + Playwright
```

## Key Directories

```
src/
  components/views/         # Main UI views (Dashboard, Analytics, TestResults, Admin)
  lib/                      # Core libraries (auth, analytics, db)
  pages/api/v1/             # REST API endpoints
  sdk/                      # TypeScript SDK
tests/
  unit/                     # Unit tests
  components/               # Component tests
  integration/              # Integration tests
  ui/                       # Playwright E2E tests
```
