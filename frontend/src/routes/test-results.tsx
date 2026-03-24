import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, Clock, Zap, BarChart2 } from 'lucide-react';
import { api } from '../lib/api';
import { queryKeys } from '../lib/query-keys';

interface Report {
  id: string;
  name: string;
  tool_name: string;
  tool_version?: string;
  passed: number;
  failed: number;
  skipped: number;
  pending?: number;
  tests?: TestResult[];
  environment?: Record<string, unknown>;
  created_at: string;
}

interface TestResult {
  name: string;
  status: 'passed' | 'failed' | 'skipped' | 'pending' | 'other';
  duration: number;
  message?: string;
  trace?: string;
  file_path?: string;
  suite?: string;
  tags?: string[];
  retry?: number;
  flaky?: boolean;
}

interface ReportsResponse {
  reports: Report[];
  total: number;
}

type StatusFilter = 'all' | 'passed' | 'failed' | 'skipped' | 'pending';

export function TestResultsPage() {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [expandedReportId, setExpandedReportId] = useState<string | null>(
    () => new URLSearchParams(window.location.search).get('report'),
  );
  const [expandedTestIdx, setExpandedTestIdx] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.reports.all,
    queryFn: () => api.getReports() as Promise<ReportsResponse>,
  });

  const reports = data?.reports ?? [];

  const filteredReports = useMemo(() => {
    let result = reports;

    if (statusFilter === 'failed') {
      result = result.filter(r => r.failed > 0);
    } else if (statusFilter === 'passed') {
      result = result.filter(r => r.failed === 0 && r.passed > 0);
    } else if (statusFilter === 'skipped') {
      result = result.filter(r => r.skipped > 0);
    }

    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        r =>
          r.tool_name.toLowerCase().includes(q) ||
          r.id.toLowerCase().includes(q)
      );
    }

    return result;
  }, [reports, search, statusFilter]);

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Test Reports</h1>

      {/* Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row gap-3">
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search reports by name, tool, or ID..."
          className="flex-1 rounded-md border border-border bg-muted px-3 py-2 text-sm focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30 text-foreground placeholder:text-muted-foreground"
        />
        <div className="flex items-center gap-1">
          <span className="text-xs text-muted-foreground shrink-0 mr-1" title="Filters both the report list and tests within expanded reports">Filter reports & tests:</span>
          {(['all', 'passed', 'failed', 'skipped'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80 hover:text-foreground'
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading reports...</p>}
      {error && (
        <p className="text-destructive flex items-center gap-1.5">
          <AlertCircle size={14} />
          Failed to load: {(error as Error).message}
        </p>
      )}

      {!isLoading && !error && filteredReports.length === 0 && (
        <div className="rounded-lg border bg-card p-12 text-center flex flex-col items-center gap-3">
          <BarChart2 size={48} className="text-muted-foreground/50" />
          <p className="text-muted-foreground">
            {reports.length === 0
              ? 'No test reports yet. Submit a CTRF report to get started.'
              : 'No reports match your search or filter.'}
          </p>
        </div>
      )}

      {/* Reports List */}
      {filteredReports.length > 0 && (
        <div className="space-y-3">
          {filteredReports.map(report => {
            const isExpanded = expandedReportId === report.id;
            const passed = report.passed;
            const failed = report.failed;
            const skipped = report.skipped;
            const total = passed + failed + skipped + (report.pending ?? 0);
            const passRate = total > 0 ? ((passed / total) * 100).toFixed(1) : '—';

            return (
              <div key={report.id} className="rounded-lg border bg-card overflow-hidden">
                {/* Report Header */}
                <button
                  onClick={() => {
                    setExpandedReportId(isExpanded ? null : report.id);
                    setExpandedTestIdx(null);
                  }}
                  aria-expanded={isExpanded}
                  className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-muted/30 transition-colors"
                >
                  <span className="text-muted-foreground text-sm" aria-hidden="true">
                    {isExpanded ? '\u25BC' : '\u25B6'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{report.tool_name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5 font-mono">
                      {report.tool_version && <span>v{report.tool_version}</span>}
                      {' \u00B7 '}
                      {formatDate(report.created_at)}
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center gap-3 text-xs">
                    <span className="text-success font-medium">{passed} passed</span>
                    <span className="text-destructive font-medium">{failed} failed</span>
                    <span className="text-warning font-medium">{skipped} skipped</span>
                    <span className="font-mono text-muted-foreground">{passRate === '—' ? '—' : `${passRate}%`}</span>
                  </div>
                </button>

                {/* Expanded: Test Results */}
                {isExpanded && (
                  <ReportDetail
                    report={report}
                    statusFilter={statusFilter}
                    expandedTestIdx={expandedTestIdx}
                    onToggleTest={idx => setExpandedTestIdx(expandedTestIdx === idx ? null : idx)}
                  />
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function ReportDetail({
  report,
  statusFilter,
  expandedTestIdx,
  onToggleTest,
}: {
  report: Report;
  statusFilter: StatusFilter;
  expandedTestIdx: number | null;
  onToggleTest: (idx: number) => void;
}) {
  const reportDetailQuery = useQuery({
    queryKey: queryKeys.reports.detail(report.id),
    queryFn: () => api.getReport(report.id) as Promise<{ report: Report }>,
  });

  const detail = reportDetailQuery.data?.report;
  const tests = detail?.tests ?? report.tests ?? [];

  const filteredTests = useMemo(() => {
    if (statusFilter === 'all') return tests;
    return tests.filter(t => t.status === statusFilter);
  }, [tests, statusFilter]);

  if (reportDetailQuery.isLoading) {
    return (
      <div className="px-5 py-6 border-t text-muted-foreground text-sm">
        Loading test results...
      </div>
    );
  }

  if (tests.length === 0) {
    return (
      <div className="px-5 py-6 border-t text-muted-foreground text-sm">
        No individual test results available for this report.
      </div>
    );
  }

  return (
    <div className="border-t">
      {/* Summary bar */}
      <div className="px-5 py-3 bg-muted/30 flex items-center gap-4 text-xs text-muted-foreground">
        <span>{tests.length} tests</span>
        {statusFilter !== 'all' && (
          <span>
            ({filteredTests.length} {statusFilter})
          </span>
        )}
      </div>

      {filteredTests.length === 0 ? (
        <div className="px-5 py-4 text-sm text-muted-foreground">
          No {statusFilter} tests in this report.
        </div>
      ) : (
        <div className="divide-y">
          {filteredTests.map((test, idx) => {
            const isTestExpanded = expandedTestIdx === idx;
            return (
              <div key={idx}>
                <button
                  onClick={() => onToggleTest(idx)}
                  className="w-full px-5 py-3 flex items-center gap-3 text-left text-sm hover:bg-muted/20 transition-colors"
                >
                  <TestStatusIcon status={test.status} />
                  <div className="flex-1 min-w-0">
                    <p className="truncate font-medium">{test.name}</p>
                    {test.suite && (
                      <p className="text-xs text-muted-foreground truncate font-mono">{test.suite}</p>
                    )}
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {test.flaky && (
                      <span className="inline-flex items-center gap-1 rounded-full bg-warning/10 text-warning border border-warning/20 px-2 py-0.5 text-xs font-medium">
                        <Zap size={10} />
                        flaky
                      </span>
                    )}
                    {test.retry !== undefined && test.retry > 0 && (
                      <span className="text-xs text-muted-foreground">retry {test.retry}</span>
                    )}
                    <span className="text-xs text-muted-foreground font-mono flex items-center gap-1">
                      <Clock size={10} />
                      {formatDuration(test.duration)}
                    </span>
                  </div>
                </button>

                {isTestExpanded && (
                  <div className="px-5 pb-4 space-y-3">
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                      {test.file_path && (
                        <div>
                          <span className="text-muted-foreground">File</span>
                          <p className="font-mono mt-0.5 truncate text-foreground">{test.file_path}</p>
                        </div>
                      )}
                      {test.tags && test.tags.length > 0 && (
                        <div>
                          <span className="text-muted-foreground">Tags</span>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {test.tags.map(tag => (
                              <span key={tag} className="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                    {test.message && (
                      <div>
                        <span className="text-xs text-muted-foreground">Message</span>
                        <pre className="mt-1 text-xs bg-destructive/10 text-destructive rounded p-3 overflow-x-auto whitespace-pre-wrap border border-destructive/20">
                          {test.message}
                        </pre>
                      </div>
                    )}
                    {test.trace && (
                      <div>
                        <span className="text-xs text-muted-foreground">Stack Trace</span>
                        <pre className="mt-1 text-xs bg-muted text-muted-foreground rounded p-3 overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto border border-border">
                          {test.trace}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TestStatusIcon({ status }: { status: string }) {
  if (status === 'passed') {
    return <CheckCircle2 size={14} className="text-success shrink-0" />;
  }
  if (status === 'failed') {
    return <AlertCircle size={14} className="text-destructive shrink-0" />;
  }
  if (status === 'skipped' || status === 'pending') {
    return <span className="inline-block h-2.5 w-2.5 rounded-full shrink-0 bg-warning" />;
  }
  return <span className="inline-block h-2.5 w-2.5 rounded-full shrink-0 bg-muted-foreground" />;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const mins = Math.floor(ms / 60_000);
  const secs = Math.floor((ms % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}
