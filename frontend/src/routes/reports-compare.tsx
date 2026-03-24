import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/query-keys';
import { formatDateTime } from '../lib/date';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ReportSummary {
  tests: number;
  passed: number;
  failed: number;
  skipped: number;
  pending: number;
  other: number;
  start?: number;
  stop?: number;
}

interface Report {
  id: string;
  tool_name: string;
  tool_version: string;
  summary: ReportSummary;
  created_at: string;
}

interface TestDiff {
  name: string;
  suite?: string;
  file_path?: string;
  base_status?: string;
  head_status?: string;
  base_duration_ms?: number;
  head_duration_ms?: number;
  duration_delta_ms?: number;
  duration_delta_pct?: number;
  message?: string;
}

interface DiffSummary {
  base_tests: number;
  head_tests: number;
  new_failures: number;
  fixed: number;
  duration_regressions: number;
}

interface CompareResponse {
  base: Report;
  head: Report;
  diff: {
    new_failures: TestDiff[];
    fixed: TestDiff[];
    duration_regressions: TestDiff[];
    summary: DiffSummary;
  };
}

interface ReportsListResponse {
  reports: Report[];
  total: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}


// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function SummaryCard({
  label,
  value,
  variant = 'default',
}: {
  label: string;
  value: number | string;
  variant?: 'default' | 'danger' | 'success' | 'warning';
}) {
  const colors = {
    default: 'bg-card border-border text-foreground',
    danger: 'bg-red-950/30 border-red-800 text-red-300',
    success: 'bg-green-950/30 border-green-800 text-green-300',
    warning: 'bg-yellow-950/30 border-yellow-800 text-yellow-300',
  };
  return (
    <div className={`rounded-lg border p-4 ${colors[variant]}`}>
      <p className="text-sm opacity-70">{label}</p>
      <p className="text-2xl font-bold mt-1">{value}</p>
    </div>
  );
}

function TestRow({ test, type }: { test: TestDiff; type: 'failure' | 'fixed' | 'regression' }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="border border-border rounded-md overflow-hidden">
      <button
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-muted/50 transition-colors"
        onClick={() => setExpanded(!expanded)}
      >
        <span
          className={`text-xs px-2 py-0.5 rounded font-mono font-semibold ${
            type === 'failure'
              ? 'bg-red-900 text-red-300'
              : type === 'fixed'
                ? 'bg-green-900 text-green-300'
                : 'bg-yellow-900 text-yellow-300'
          }`}
        >
          {type === 'failure' ? 'FAIL' : type === 'fixed' ? 'FIXED' : 'SLOW'}
        </span>
        <span className="flex-1 font-mono text-sm truncate">{test.name}</span>
        {test.suite && <span className="text-xs text-muted-foreground shrink-0">{test.suite}</span>}
        {type === 'regression' && test.duration_delta_ms !== undefined && (
          <span className="text-xs text-yellow-400 shrink-0">
            +{formatDuration(test.duration_delta_ms)} ({test.duration_delta_pct?.toFixed(0)}%)
          </span>
        )}
        <span className="text-muted-foreground text-xs">{expanded ? '▲' : '▼'}</span>
      </button>
      {expanded && (
        <div className="px-4 pb-3 pt-1 border-t border-border bg-muted/20 space-y-2">
          {test.file_path && (
            <p className="text-xs text-muted-foreground font-mono">{test.file_path}</p>
          )}
          {(test.base_status || test.head_status) && (
            <div className="flex gap-4 text-xs">
              {test.base_status && (
                <span>
                  Base: <span className="font-semibold">{test.base_status}</span>
                </span>
              )}
              {test.head_status && (
                <span>
                  Head: <span className="font-semibold">{test.head_status}</span>
                </span>
              )}
            </div>
          )}
          {(test.base_duration_ms !== undefined || test.head_duration_ms !== undefined) && (
            <div className="flex gap-4 text-xs text-muted-foreground">
              {test.base_duration_ms !== undefined && (
                <span>Base: {formatDuration(test.base_duration_ms)}</span>
              )}
              {test.head_duration_ms !== undefined && (
                <span>Head: {formatDuration(test.head_duration_ms)}</span>
              )}
            </div>
          )}
          {test.message && (
            <pre className="text-xs bg-background border border-border rounded p-2 overflow-auto max-h-32 text-red-300">
              {test.message}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function Section({
  title,
  tests,
  type,
  count,
}: {
  title: string;
  tests: TestDiff[];
  type: 'failure' | 'fixed' | 'regression';
  count: number;
}) {
  const [collapsed, setCollapsed] = useState(false);
  if (count === 0) return null;
  return (
    <div className="space-y-2">
      <button
        className="flex items-center gap-2 w-full text-left"
        onClick={() => setCollapsed(!collapsed)}
      >
        <h2 className="text-lg font-semibold">{title}</h2>
        <span className="text-sm text-muted-foreground">({count})</span>
        <span className="ml-auto text-muted-foreground text-sm">{collapsed ? '▶' : '▼'}</span>
      </button>
      {!collapsed && (
        <div className="space-y-2">
          {tests.map(t => (
            <TestRow key={t.name} test={t} type={type} />
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main page
// ---------------------------------------------------------------------------

export function ReportsComparePage() {
  const [baseID, setBaseID] = useState('');
  const [headID, setHeadID] = useState('');
  const [submitted, setSubmitted] = useState(false);

  const reportsQuery = useQuery({
    queryKey: queryKeys.reports.all,
    queryFn: () => api.getReports() as Promise<ReportsListResponse>,
  });

  const compareQuery = useQuery({
    queryKey: queryKeys.reports.compare(baseID, headID),
    queryFn: () => api.compareReports(baseID, headID) as Promise<CompareResponse>,
    enabled: submitted && !!baseID && !!headID && baseID !== headID,
    retry: false,
  });

  const reports = reportsQuery.data?.reports ?? [];

  function handleCompare(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
  }

  const diff = compareQuery.data?.diff;
  const base = compareQuery.data?.base;
  const head = compareQuery.data?.head;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Report Comparison</h1>
        <p className="text-muted-foreground mt-1">
          Compare two CTRF reports to identify new failures, fixed tests, and duration regressions.
        </p>
      </div>

      {/* Selector */}
      <form
        onSubmit={handleCompare}
        className="bg-card border border-border rounded-lg p-4 space-y-4"
      >
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1">
            <label className="text-sm font-medium text-muted-foreground">
              Base Report (reference)
            </label>
            <select
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={baseID}
              onChange={e => {
                setBaseID(e.target.value);
                setSubmitted(false);
              }}
            >
              <option value="">Select base report...</option>
              {reports.map(r => (
                <option key={r.id} value={r.id} disabled={r.id === headID}>
                  {r.tool_name || 'Unknown'} — {formatDateTime(r.created_at)} ({r.id.slice(0, 8)})
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-sm font-medium text-muted-foreground">Head Report (new)</label>
            <select
              className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
              value={headID}
              onChange={e => {
                setHeadID(e.target.value);
                setSubmitted(false);
              }}
            >
              <option value="">Select head report...</option>
              {reports.map(r => (
                <option key={r.id} value={r.id} disabled={r.id === baseID}>
                  {r.tool_name || 'Unknown'} — {formatDateTime(r.created_at)} ({r.id.slice(0, 8)})
                </option>
              ))}
            </select>
          </div>
        </div>
        <button
          type="submit"
          disabled={!baseID || !headID || baseID === headID || compareQuery.isFetching}
          className="px-4 py-2 bg-primary text-primary-foreground rounded-md text-sm font-medium disabled:opacity-50 hover:bg-primary/90 transition-colors"
        >
          {compareQuery.isFetching ? 'Comparing...' : 'Compare'}
        </button>
        {baseID === headID && baseID !== '' && (
          <p className="text-sm text-red-400">Base and head must be different reports.</p>
        )}
        {reportsQuery.isError && (
          <p className="text-sm text-red-400">Failed to load reports. Please refresh.</p>
        )}
      </form>

      {/* Error */}
      {compareQuery.isError && (
        <div className="bg-red-950/30 border border-red-800 rounded-lg p-4">
          <p className="text-red-300 text-sm">{(compareQuery.error as Error).message}</p>
        </div>
      )}

      {/* Results */}
      {diff && base && head && (
        <div className="space-y-6">
          {/* Report headers */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">
                Base
              </p>
              <p className="font-semibold">{base.tool_name || 'Unknown'}</p>
              <p className="text-sm text-muted-foreground">{formatDateTime(base.created_at)}</p>
              <p className="text-xs font-mono text-muted-foreground mt-1">{base.id}</p>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide mb-1">
                Head
              </p>
              <p className="font-semibold">{head.tool_name || 'Unknown'}</p>
              <p className="text-sm text-muted-foreground">{formatDateTime(head.created_at)}</p>
              <p className="text-xs font-mono text-muted-foreground mt-1">{head.id}</p>
            </div>
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <SummaryCard label="Base Tests" value={diff.summary.base_tests} />
            <SummaryCard label="Head Tests" value={diff.summary.head_tests} />
            <SummaryCard
              label="New Failures"
              value={diff.summary.new_failures}
              variant={diff.summary.new_failures > 0 ? 'danger' : 'default'}
            />
            <SummaryCard
              label="Fixed"
              value={diff.summary.fixed}
              variant={diff.summary.fixed > 0 ? 'success' : 'default'}
            />
            <SummaryCard
              label="Slower Tests"
              value={diff.summary.duration_regressions}
              variant={diff.summary.duration_regressions > 0 ? 'warning' : 'default'}
            />
          </div>

          {/* All green */}
          {diff.summary.new_failures === 0 && diff.summary.duration_regressions === 0 && (
            <div className="bg-green-950/30 border border-green-800 rounded-lg p-4 text-center">
              <p className="text-green-300 font-semibold">No regressions detected</p>
              {diff.summary.fixed > 0 && (
                <p className="text-green-400/70 text-sm mt-1">
                  {diff.summary.fixed} test{diff.summary.fixed !== 1 ? 's' : ''} fixed
                </p>
              )}
            </div>
          )}

          {/* Diff sections */}
          <Section
            title="New Failures"
            tests={diff.new_failures ?? []}
            type="failure"
            count={diff.summary.new_failures}
          />
          <Section
            title="Fixed Tests"
            tests={diff.fixed ?? []}
            type="fixed"
            count={diff.summary.fixed}
          />
          <Section
            title="Duration Regressions"
            tests={diff.duration_regressions ?? []}
            type="regression"
            count={diff.summary.duration_regressions}
          />

          {/* Export */}
          <div className="pt-2 border-t border-border">
            <button
              onClick={() => {
                const blob = new Blob([JSON.stringify({ base, head, diff }, null, 2)], {
                  type: 'application/json',
                });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = `report-diff-${base.id.slice(0, 8)}-vs-${head.id.slice(0, 8)}.json`;
                a.click();
                URL.revokeObjectURL(url);
              }}
              className="text-sm text-muted-foreground hover:text-foreground transition-colors underline underline-offset-2"
            >
              Export diff as JSON
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
