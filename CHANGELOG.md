# Changelog

All notable changes to this project will be documented here.

## [Unreleased]

### Added

- **Frontend error boundaries**: A root-level `ErrorBoundary` wraps the entire app in `main.tsx`, a TanStack Router `errorComponent` on the root route catches routing errors, and `ErrorBoundary` wrappers around all Recharts chart sections in `dashboard.tsx` and `analytics.tsx` prevent chart crashes from unmounting the app. The error UI includes both "Try Again" and "Reload" buttons.

- **Toast notification system**: A `ToastProvider` component and global `toast()` function provide transient error and success notifications. All mutations surface errors to users via a global `mutations.onError` handler in `main.tsx` that calls `toast(error.message, 'error')`. Previously silent mutation failures (createTeam, evaluateQualityGate, deleteQualityGate, deleteWebhook, profile update, password change) now display toast feedback.

- **Inline error display for evaluateMutation**: The quality gates evaluate button shows an inline error message below the gate card when evaluation fails, persisted until the next successful evaluation or a new attempt. This complements the global toast for visibility.

- **Admin route role guard**: The `/admin` route now uses a `requireOwner` `beforeLoad` guard that redirects non-owners to `/` at the router level, replacing the previous component-side "Access Denied" rendering.

- **Success toasts for destructive actions**: `deleteQualityGate` and `deleteWebhook` mutations now show success toasts on completion.

### Changed

- **Profile page refactored to useMutation**: The profile display name and password forms have been refactored from manual `useState` + `try/catch` to TanStack Query `useMutation` with proper `onSuccess`/`onError` callbacks. Profile changes now invalidate the `queryKeys.admin.users()` cache so other pages showing user names stay current.

- **Evaluate mutation cache invalidation**: `evaluateMutation.onSuccess` now invalidates `queryKeys.qualityGates.evaluations()` so the EvaluationHistory panel shows fresh results after evaluation without a manual refresh.

- **Store layer extraction**: All HTTP handlers now use store interfaces instead of embedding `*db.Pool` directly. Store interfaces are defined on the handler side and implemented in `internal/store/`, making handlers testable without a running database and centralizing SQL query knowledge. Affected handlers: auth, teams, analytics, executions, reports, admin, invitations, oauth.

- **Bulk test result inserts**: Report ingestion now uses `pgx.Batch` to insert test results in bulk instead of one query per result. This eliminates the N+1 insert pattern that caused 1000+ round-trips for large reports.

### Added

- **Sharding duration-balanced strategy activated**: `DurationStore.UpsertFromResults()` is now called during report ingestion (inside the same transaction), populating the `test_duration_history` table that the `duration_balanced` sharding strategy depends on. Previously, this strategy always fell back to no-history defaults because the duration store was never written to.

- **Targeted duration query**: `GET /api/v1/sharding/durations/{testName}` now uses a `WHERE team_id = $1 AND test_name = $2` SQL query instead of fetching all team durations and filtering in Go (O(1) DB query vs O(N) in-memory scan). The endpoint returns a JSON array of duration entries across all suites for the named test, or 404 if no history exists.

- **Composite-key duration map**: `DurationStore.GetByTeamMap` now uses composite keys (`testName\x00suite`) to preserve entries for the same test name across different suites, preventing data loss in `EnrichWithHistory`.

- **DurationStore integration tests**: Added comprehensive integration tests for `DurationStore` covering `GetByTeam`, `GetByTeamAndTest`, `UpsertFromResults` (insert, rolling average, within-transaction, transaction rollback, empty input), `GetBySuite`, `GetByTeamMap`, p95 conflict behavior, and same-name-different-suite scenarios.

- **Sharding API endpoints documented**: Added `POST /api/v1/sharding/plan`, `POST /api/v1/sharding/rebalance`, `GET /api/v1/sharding/durations`, and `GET /api/v1/sharding/durations/{testName}` to the README Key Endpoints table.

### Fixed

- **IDOR vulnerability in invitation handlers**: `Create`, `List`, and `Revoke` invitation endpoints (`POST/GET/DELETE /api/v1/teams/{teamID}/invitations`) now verify that the authenticated user's team matches the URL `teamID` before checking role permissions. Previously, any maintainer or owner could list, create, or revoke invitations for any team regardless of membership.

- **Worker callback authorization gap**: `ReportProgress`, `ReportTestResult`, and `ReportWorkerStatus` endpoints (`POST /api/v1/executions/{executionID}/progress|test-result|worker-status`) now verify that the execution belongs to the caller's team before proceeding. Previously, any authenticated user could broadcast WebSocket messages for any execution by guessing IDs. Unauthorized or cross-team requests return 404 (to avoid information leakage); database errors return 500 (fail closed).

- **`GET /api/v1/reports/compare` endpoint returning 500**: Fixed a database query issue where NULL values in optional text columns (`message`, `trace`, `file_path`, `suite`) could not be scanned into string destinations in pgx v5, causing the compare endpoint to return HTTP 500 for reports with missing optional fields. The fix wraps these columns with `COALESCE(..., '')` to convert NULL to empty string, ensuring the endpoint returns HTTP 200 with a valid diff payload. The fix maintains team isolation — reports from different teams return HTTP 404.

- **`GET /api/v1/reports` (ListReports) query parameter validation**: The `since` and `until` query parameters now return HTTP 400 with a clear error message when provided in a malformed format (not RFC3339). Previously, malformed dates were silently ignored, causing the endpoint to return all records instead of signaling a bad request. Empty string values for these parameters continue to be accepted and ignored as before.

- **Test report `name` field in ListReports and GetReport responses**: Both `GET /api/v1/reports` and `GET /api/v1/reports/{reportID}` responses now include a computed `name` field. The name is derived from `tool_name` and `tool_version` (e.g., `"playwright v1.50.1"` or `"jest"`). If `tool_name` is empty, the name falls back to `"Report <short-id>"` using the first 8 characters of the report UUID. This eliminates blank report titles in the test-results list and dashboard recent reports table. The TypeScript SDK's `Report` interface has been updated to include the `name` field.

- **`GET /api/v1/reports` (ListReports) response**: Summary count fields (`test_count`, `passed`, `failed`, `skipped`, `pending`) are now promoted to top-level fields alongside the raw `summary` blob. This eliminates NaN pass-rate calculations in the frontend, which previously relied on undefined fields. When the summary is unparseable, the flattened count fields are omitted gracefully rather than returning zero values. The TypeScript SDK's `Report` interface has been updated to reflect these optional top-level fields.

- **`no_new_failures` quality gate**: `fetchPreviousFailedTests` now returns a proper error on database failures instead of silently returning an empty baseline. Previously, a transient DB error would cause the gate to treat all current failures as "new" and incorrectly fail the evaluation. The `POST /evaluate` endpoint now returns HTTP 500 on such errors rather than producing a wrong result.

- **Admin audit log table**: The Team column now displays the human-readable team name (e.g., `"E2E Team"`) instead of the raw team UUID. The Resource ID column is now truncated to the first 8 characters with the full UUID visible on hover (e.g., `"5112d479…"`). The `GET /api/v1/admin/audit-log` endpoint now returns a `team_name` field in each audit log entry alongside `team_id`, populated via a JOIN on the teams table.

### Added

- **Dark color theme**: The ScaledTest UI now ships with a fully defined dark theme. Tailwind v4 CSS custom properties are declared in `frontend/src/index.css` under `@theme`, covering background, foreground, card, border, primary, secondary, accent, destructive, success, and warning tokens. Base styles apply the theme globally to `body`, links, and headings with smooth scrolling.

- **Left sidebar navigation**: The top navigation bar has been replaced with a fixed 220px-wide left sidebar. Nav items show icon + label with active state highlighting (`text-primary bg-primary/10`). A pinned bottom section shows the user's avatar (initial circle), display name/email, and a sign-out button. The sidebar collapses to icon-only at viewports narrower than 768px.

- **Icon library (lucide-react)**: `lucide-react` is now a frontend dependency. Icons are used consistently across the sidebar nav, stat cards, and empty states — `LayoutDashboard`, `BarChart2`, `Play`, `TrendingUp`, `ShieldCheck`, `Webhook`, `Layers`, `Settings`, `AlertCircle`, `CheckCircle2`, `Clock`, `Zap`, and `User`.

- **Enhanced StatCard component**: Dashboard stat cards now include an optional icon (top-right, muted), an optional trend badge (colored `+/-` percentage), a left-border accent (`border-l-4 border-primary`), a subtle `bg-gradient-to-br from-card to-background`, and `font-mono` values.

- **Shared StatusBadge component**: A single `StatusBadge` component is exported from `dashboard.tsx` and used across all route files. Badges use semantic design system tokens — `bg-success/10 text-success` for passed/success, `bg-destructive/10 text-destructive` for failed/error, `bg-warning/10 text-warning` for pending/running — replacing prior hardcoded Tailwind color classes.

- **Shared CHART_TOOLTIP_STYLE constant**: Chart tooltip styles are defined once in `dashboard.tsx` and imported in `analytics.tsx`, eliminating the duplicated inline object.

- **Design system token migration**: All frontend route files (`dashboard.tsx`, `analytics.tsx`, `executions.tsx`, `sharding.tsx`, `webhooks.tsx`, `quality-gates.tsx`, `admin.tsx`, `login.tsx`, `register.tsx`, `test-results.tsx`) and the root layout now use design system CSS custom properties exclusively. Hardcoded Tailwind color classes (e.g., `bg-gray-100`, `text-gray-600`, `bg-green-100`, `bg-blue-600`) have been replaced with tokens (`bg-muted`, `text-muted-foreground`, `bg-success/10`, `bg-primary`, etc.).

- **Table styling**: All data tables now use `bg-muted/50` thead rows with `text-muted-foreground text-xs uppercase tracking-wider` headers, `hover:bg-muted/30 transition-colors` body rows, and `font-mono text-xs text-muted-foreground` for ID, hash, and timestamp columns.

- **Chart styling**: Recharts line charts now use `stroke="#60a5fa"` (accent) with `strokeWidth: 2`, a `CartesianGrid` with `stroke="#1f2937" strokeDasharray="4 4"`, and axis ticks with `fill="#9ca3af" fontSize: 11`.

- **Form and input styling**: Login, register, and quality gate forms use the design system input style (`bg-muted border-border focus:border-primary focus:ring-primary/30`), labeled fields (`text-sm font-medium text-foreground`), inline `AlertCircle` error messages (`text-destructive`), and primary action buttons (`bg-primary hover:bg-primary/90`).

- **Quality gate `no_new_failures` rule**: The `no_new_failures` rule now correctly fetches previously failed tests from the most recent prior report when evaluating a gate, using the existing `fetchPreviousFailedTests` store function. The `parseRules` helper was simplified by removing a redundant array-type check.

- **Async LLM-powered test failure triage**: After a CTRF report is fully ingested, ScaledTest automatically enqueues a background triage job that invokes the LLM provider to analyze and cluster test failures. The triage result includes root cause analysis, failure classifications, and cross-run failure context. Triage is non-blocking — the report ingest response is sent before triage begins, and triage failures do not mark the report as failed. Triage is automatically enabled when an LLM provider is configured (`ST_LLM_PROVIDER` and corresponding API key); when no LLM is available, triage is gracefully disabled with a warning log. The `test_reports` table now includes a `triage_status` field (`pending`, `complete`, or `failed`) for tracking triage job state without a JOIN. Concurrency is bounded to prevent resource exhaustion under burst load.

- **On-demand triage result API endpoints**: Two new endpoints expose persisted triage results and allow users to retry triage for completed reports:
  - `GET /api/v1/reports/{reportID}/triage`: Returns the triage result including status (`pending`, `complete`, or `failed`), clusters array (each with root cause label, failure list, and classification), overall summary, and metadata (model used, generated_at). Returns HTTP 202 Accepted with `triage_status=pending` while the async job is still running. Returns HTTP 404 if the report has no triage result (e.g., when LLM is disabled).
  - `POST /api/v1/reports/{reportID}/triage/retry`: Re-triggers triage analysis for a completed report (requires `maintainer` or `owner` role). Resets the triage to pending, clears previous results, and enqueues a fresh LLM analysis. Concurrent retries are idempotent — only one async job per report runs at a time. Returns HTTP 202 Accepted. Returns HTTP 503 if the LLM provider is not configured.

- **Triage Summary panel on run detail dashboard**: The test results detail page now displays a Triage Summary panel above the individual test list for all completed runs with failures. The panel shows an overall summary paragraph, failure clusters labeled with root cause analysis, and per-failure classification badges (new, flaky, regression, unknown). While triage is pending (up to 5 seconds), a loading skeleton animates to indicate that analysis is in progress. If the LLM provider is not configured or triage is not yet available, a graceful message is shown instead. Failed runs without the triage analysis display a friendly fallback message.
