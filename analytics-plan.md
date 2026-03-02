# Analytics Feature Plan (Tier 3)

## Problem Statement

Current dashboard lacks actionable analytics: there is no API surface supplying aggregated stats/trends, the Analytics view is only a placeholder, and DashboardView shows empty gray boxes. We need a secure, team-scoped analytics endpoint plus UI components that render real data (stats cards, charts, flaky test insights) to help users understand test health.

## Scope

- **In scope**: new `tests/unit/analytics-api.test.ts`, new API route `src/pages/api/analytics.ts`, updates to `src/components/views/AnalyticsView.tsx` and `DashboardView.tsx`, any supporting types/utilities directly required for analytics fetch/rendering.
- **Out of scope**: changes to auth, routing, unrelated components, new datasets beyond existing `test_reports` table, persistence changes.

## Interface Design

### API Response (`AnalyticsResponse`)

```
{
  success: true,
  stats: {
    totalReports: number,
    totalTests: number,
    passRate: number,
    failRate: number,
    recentReports: number
  },
  trends: Array<{
    date: string, // YYYY-MM-DD
    total: number,
    passed: number,
    failed: number,
    passRate: number
  }>,
  topFailingTests: Array<{
    name: string,
    suite: string,
    failCount: number,
    totalRuns: number,
    failRate: number
  }>
}
```

- HTTP 200 on success, 401 when unauthenticated, 503 on DB connectivity issues, 500 otherwise.
- Stats aggregated across all accessible reports (uploaded by user or team match). Recent window: last 7 days. Trends window: last 30 days grouped per day. Top failing tests limited to most recent 1000 reports to bound jsonb processing.

### React Fetch Hooks

- Both AnalyticsView and DashboardView will use `fetch('/api/analytics')` with `response.ok` guard, decode JSON into typed state, surface loading/error states.
- Shared helper hook? For now, duplicate small fetch logic in both components (Dashboard only needs stats subset but reuses same endpoint for consistency).

## Tests to Write (Failing First)

1. **Auth guard**: GET /api/analytics without `req.user` returns 401 JSON `{ success:false }`.
2. **Happy path**: when authenticated and DB queries succeed, returns 200 with complete shape (stats/trends/topFailingTests) using mocked data.
3. **DB failure**: if Timescale query throws connection-like error, respond 503.
4. **Pass rate calculation**: ensure `(passed / tests) * 100` rounded to 1 decimal (e.g., 75.555 -> 75.6).
5. **Trend formatting**: ensures each trend entry has `date`, `total`, `passed`, `failed`, `passRate` from query output.

Mocks: stub getUserTeams, timescale pool connect/query behavior.

## Acceptance Criteria

- Unit tests above pass and meaningfully fail before implementation.
- `/api/analytics` fully enforces team-based access control and parameterized SQL (no string interpolation).
- AnalyticsView displays loading skeleton, error fallback, stats cards, pass-rate trend chart, top failing tests table/grid leveraging existing chart components where relevant.
- DashboardView stats cards render real numbers from API and show graceful loading/error fallback (no placeholder boxes) while preserving admin action card.
- `npx tsc --build --force` clean.
- `npx jest --testPathPattern="unit"` green.
- Self-review + adversarial review (claude-sonnet-4.6) approve before PR.
