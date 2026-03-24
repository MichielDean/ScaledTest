# Changelog

All notable changes to this project will be documented here.

## [Unreleased]

### Fixed

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
