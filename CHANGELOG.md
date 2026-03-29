# Changelog

All notable changes to this project will be documented here.

## [Unreleased]

### Fixed

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
