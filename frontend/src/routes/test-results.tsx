import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/query-keys';

interface Report {
  id: string;
  name: string;
  tool_name?: string;
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
  const [expandedReportId, setExpandedReportId] = useState<string | null>(null);
  const [expandedTestIdx, setExpandedTestIdx] = useState<number | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.reports.all,
    queryFn: () => api.getReports() as Promise<ReportsResponse>,
  });

  const reports = data?.reports ?? [];

  const filteredReports = useMemo(() => {
    if (!search.trim()) return reports;
    const q = search.toLowerCase();
    return reports.filter(
      r =>
        r.name.toLowerCase().includes(q) ||
        r.tool_name?.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q)
    );
  }, [reports, search]);

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
          className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
        <div className="flex gap-1">
          {(['all', 'passed', 'failed', 'skipped'] as const).map(s => (
            <button
              key={s}
              onClick={() => setStatusFilter(s)}
              className={`rounded-md px-3 py-2 text-xs font-medium transition-colors ${
                statusFilter === s
                  ? 'bg-blue-600 text-white'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {s.charAt(0).toUpperCase() + s.slice(1)}
            </button>
          ))}
        </div>
      </div>

      {isLoading && <p className="text-muted-foreground">Loading reports...</p>}
      {error && <p className="text-red-600">Failed to load: {(error as Error).message}</p>}

      {!isLoading && !error && filteredReports.length === 0 && (
        <div className="rounded-lg border bg-card p-12 text-center">
          <p className="text-muted-foreground">
            {reports.length === 0
              ? 'No test reports yet. Submit a CTRF report to get started.'
              : 'No reports match your search.'}
          </p>
        </div>
      )}

      {/* Reports List */}
      {filteredReports.length > 0 && (
        <div className="space-y-3">
          {filteredReports.map(report => {
            const isExpanded = expandedReportId === report.id;
            const total = report.passed + report.failed + report.skipped + (report.pending ?? 0);
            const passRate = total > 0 ? ((report.passed / total) * 100).toFixed(1) : '—';

            return (
              <div key={report.id} className="rounded-lg border bg-card overflow-hidden">
                {/* Report Header */}
                <button
                  onClick={() => {
                    setExpandedReportId(isExpanded ? null : report.id);
                    setExpandedTestIdx(null);
                  }}
                  className="w-full px-5 py-4 flex items-center gap-4 text-left hover:bg-muted/30 transition-colors"
                >
                  <span className="text-muted-foreground text-sm">
                    {isExpanded ? '\u25BC' : '\u25B6'}
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold truncate">{report.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {report.tool_name && <span>{report.tool_name}</span>}
                      {report.tool_version && <span> v{report.tool_version}</span>}
                      {' \u00B7 '}
                      {formatDate(report.created_at)}
                    </p>
                  </div>
                  <div className="shrink-0 flex items-center gap-3 text-xs">
                    <span className="text-green-600 font-medium">{report.passed} passed</span>
                    <span className="text-red-600 font-medium">{report.failed} failed</span>
                    <span className="text-yellow-600 font-medium">{report.skipped} skipped</span>
                    <span className="text-muted-foreground">{passRate}%</span>
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
                      <p className="text-xs text-muted-foreground truncate">{test.suite}</p>
                    )}
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    {test.flaky && (
                      <span className="rounded-full bg-orange-100 text-orange-800 px-2 py-0.5 text-xs font-medium">
                        flaky
                      </span>
                    )}
                    {test.retry !== undefined && test.retry > 0 && (
                      <span className="text-xs text-muted-foreground">retry {test.retry}</span>
                    )}
                    <span className="text-xs text-muted-foreground font-mono">
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
                          <p className="font-mono mt-0.5 truncate">{test.file_path}</p>
                        </div>
                      )}
                      {test.tags && test.tags.length > 0 && (
                        <div>
                          <span className="text-muted-foreground">Tags</span>
                          <div className="flex flex-wrap gap-1 mt-0.5">
                            {test.tags.map(tag => (
                              <span key={tag} className="rounded bg-muted px-1.5 py-0.5 text-xs">
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
                        <pre className="mt-1 text-xs bg-red-50 text-red-800 rounded p-3 overflow-x-auto whitespace-pre-wrap">
                          {test.message}
                        </pre>
                      </div>
                    )}
                    {test.trace && (
                      <div>
                        <span className="text-xs text-muted-foreground">Stack Trace</span>
                        <pre className="mt-1 text-xs bg-gray-50 text-gray-700 rounded p-3 overflow-x-auto whitespace-pre-wrap max-h-48 overflow-y-auto">
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
  const styles: Record<string, string> = {
    passed: 'bg-green-500',
    failed: 'bg-red-500',
    skipped: 'bg-yellow-500',
    pending: 'bg-gray-400',
    other: 'bg-gray-400',
  };
  return (
    <span
      className={`inline-block h-2.5 w-2.5 rounded-full shrink-0 ${styles[status] ?? styles.other}`}
    />
  );
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
