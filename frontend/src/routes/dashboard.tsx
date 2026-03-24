import type { ComponentType } from 'react';
import { Link, useNavigate } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { BarChart2, ChevronRight, Play, TrendingUp, Zap } from 'lucide-react';
import { api } from '../lib/api';
import { queryKeys } from '../lib/query-keys';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Report {
  id: string;
  name: string;
  tool_name: string;
  passed: number;
  failed: number;
  skipped: number;
  pending?: number;
  created_at: string;
}

interface Execution {
  id: string;
  command: string;
  status: string;
  created_at: string;
}

interface TrendPoint {
  date: string;
  pass_rate: number;
}

interface FlakyTest {
  name: string;
  flake_rate: number;
}

interface ReportsResponse {
  reports: Report[];
  total: number;
}

interface ExecutionsResponse {
  executions: Execution[];
  total: number;
}

interface TrendsResponse {
  trends: TrendPoint[];
}

interface FlakyTestsResponse {
  flaky_tests: FlakyTest[];
}

export const CHART_TOOLTIP_STYLE = {
  backgroundColor: 'var(--color-card)',
  border: '1px solid var(--color-border)',
  borderRadius: '6px',
  color: 'var(--color-foreground)',
  boxShadow: '0 4px 6px -1px rgba(0,0,0,0.3)',
};

/**
 * Formats a YYYY-MM-DD date string as 'Mon D' (e.g. "Mar 24") for chart X-axis labels.
 * Parses as local date to avoid UTC-midnight off-by-one issues.
 */
export function formatTrendDate(dateStr: string): string {
  const parts = dateStr.split('-').map(Number);
  if (parts.length !== 3) return dateStr;
  const [year, month, day] = parts as [number, number, number];
  return new Date(year, month - 1, day).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
}

// ---------------------------------------------------------------------------
// Dashboard page
// ---------------------------------------------------------------------------

export function DashboardPage() {
  const navigate = useNavigate();
  const reportsQuery = useQuery({
    queryKey: queryKeys.reports.all,
    queryFn: () => api.getReports() as Promise<ReportsResponse>,
  });

  const executionsQuery = useQuery({
    queryKey: queryKeys.executions.all,
    queryFn: () => api.getExecutions() as Promise<ExecutionsResponse>,
  });

  const trendsQuery = useQuery({
    queryKey: queryKeys.analytics.trends,
    queryFn: () => api.getTrends() as Promise<TrendsResponse>,
  });

  const flakyQuery = useQuery({
    queryKey: queryKeys.analytics.flakyTests,
    queryFn: () => api.getFlakyTests() as Promise<FlakyTestsResponse>,
  });

  // Derived stats
  const totalReports = reportsQuery.data?.total;
  const totalExecutions = executionsQuery.data?.total;

  const passRate = (() => {
    const reports = reportsQuery.data?.reports;
    if (!reports || reports.length === 0) return undefined;
    const totalPassed = reports.reduce((s, r) => s + (r.passed || 0), 0);
    const totalTests = reports.reduce((s, r) => s + (r.passed || 0) + (r.failed || 0) + (r.skipped || 0) + (r.pending ?? 0), 0);
    if (totalTests === 0) return undefined;
    return ((totalPassed / totalTests) * 100).toFixed(1);
  })();

  const flakyCount = flakyQuery.data?.flaky_tests?.length;

  const recentReports = reportsQuery.data?.reports?.slice(0, 5) ?? [];
  const recentExecutions = executionsQuery.data?.executions?.slice(0, 5) ?? [];
  const trendData = trendsQuery.data?.trends ?? [];

  return (
    <div className="p-6 space-y-8">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* ---- Stat cards ---- */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Reports"
          value={totalReports?.toString()}
          loading={reportsQuery.isLoading}
          icon={BarChart2}
        />
        <StatCard
          title="Total Executions"
          value={totalExecutions?.toString()}
          loading={executionsQuery.isLoading}
          icon={Play}
        />
        <StatCard
          title="Pass Rate"
          value={passRate ? `${passRate}%` : undefined}
          loading={reportsQuery.isLoading}
          icon={TrendingUp}
        />
        <StatCard
          title="Flaky Tests"
          value={flakyCount?.toString()}
          loading={flakyQuery.isLoading}
          icon={Zap}
        />
      </div>

      {/* ---- Trends chart ---- */}
      <section className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">Pass Rate Trends</h2>
        {trendsQuery.isLoading ? (
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            Loading chart...
          </div>
        ) : trendData.length === 0 ? (
          <div className="h-64 flex items-center justify-center text-muted-foreground">
            No trend data available yet.
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={trendData}>
              <CartesianGrid stroke="#1f2937" strokeDasharray="4 4" />
              <XAxis dataKey="date" tick={{ fill: '#9ca3af', fontSize: 11 }} tickFormatter={formatTrendDate} />
              <YAxis domain={[0, 100]} tick={{ fill: '#9ca3af', fontSize: 11 }} unit="%" />
              <Tooltip
                formatter={(v: number) => [`${v.toFixed(1)}%`, 'Pass Rate']}
                contentStyle={CHART_TOOLTIP_STYLE}
              />
              <Line
                type="monotone"
                dataKey="pass_rate"
                stroke="#60a5fa"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </section>

      {/* ---- Tables row ---- */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent reports */}
        <section className="rounded-lg border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4">Recent Reports</h2>
          {reportsQuery.isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : recentReports.length === 0 ? (
            <p className="text-muted-foreground">No reports yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-left">
                    <th className="pb-2 pr-4 pt-2 pl-2 text-muted-foreground text-xs uppercase tracking-wider font-medium">Name</th>
                    <th className="pb-2 pr-4 pt-2 text-muted-foreground text-xs uppercase tracking-wider font-medium">Passed</th>
                    <th className="pb-2 pr-4 pt-2 text-muted-foreground text-xs uppercase tracking-wider font-medium">Failed</th>
                    <th className="pb-2 pr-4 pt-2 text-muted-foreground text-xs uppercase tracking-wider font-medium">Skipped</th>
                    <th className="pb-2 pt-2 text-muted-foreground text-xs uppercase tracking-wider font-medium">Date</th>
                    <th className="pb-2 pt-2 pl-2"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {recentReports.map(r => (
                    <tr
                      key={r.id}
                      className="border-b last:border-b-0 hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => navigate({ to: '/reports', search: { report: r.id } })}
                    >
                      <td className="py-2 pr-4 pl-2 font-medium truncate max-w-[200px]">{r.tool_name}</td>
                      <td className="py-2 pr-4 text-success">{r.passed}</td>
                      <td className="py-2 pr-4 text-destructive">{r.failed}</td>
                      <td className="py-2 pr-4 text-warning">{r.skipped}</td>
                      <td className="py-2 font-mono text-xs text-muted-foreground">{formatDate(r.created_at)}</td>
                      <td className="py-2 pl-2 text-right">
                        <Link
                          to='/reports'
                          search={{ report: r.id }}
                          onClick={e => e.stopPropagation()}
                          className="inline-flex items-center gap-0.5 text-xs text-primary hover:underline"
                        >
                          View <ChevronRight size={12} aria-hidden="true" />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* Recent executions */}
        <section className="rounded-lg border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4">Recent Executions</h2>
          {executionsQuery.isLoading ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : recentExecutions.length === 0 ? (
            <p className="text-muted-foreground">No executions yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-muted/50 text-left">
                    <th className="pb-2 pr-4 pt-2 pl-2 text-muted-foreground text-xs uppercase tracking-wider font-medium">Command</th>
                    <th className="pb-2 pr-4 pt-2 text-muted-foreground text-xs uppercase tracking-wider font-medium">Status</th>
                    <th className="pb-2 pt-2 text-muted-foreground text-xs uppercase tracking-wider font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentExecutions.map(e => (
                    <tr key={e.id} className="border-b last:border-b-0 hover:bg-muted/30 transition-colors">
                      <td className="py-2 pr-4 pl-2 font-mono text-xs truncate max-w-[260px]">
                        {e.command}
                      </td>
                      <td className="py-2 pr-4">
                        <StatusBadge status={e.status} />
                      </td>
                      <td className="py-2 font-mono text-xs text-muted-foreground">{formatDate(e.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components & helpers
// ---------------------------------------------------------------------------

function StatCard({
  title,
  value,
  loading,
  icon: Icon,
  trend,
}: {
  title: string;
  value: string | undefined;
  loading: boolean;
  icon?: ComponentType<{ size?: number; className?: string }>;
  trend?: { value: string; direction: 'up' | 'down' };
}) {
  return (
    <div className="rounded-lg border border-l-4 border-l-primary bg-gradient-to-br from-card to-background p-6 relative overflow-hidden">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <p className="text-sm text-muted-foreground">{title}</p>
          <p className="text-3xl font-bold font-mono mt-1">
            {loading ? (
              <span className="inline-block h-8 w-16 animate-pulse rounded bg-muted" />
            ) : (
              (value ?? '—')
            )}
          </p>
          {trend && (
            <span
              className={`inline-block mt-1 text-xs font-medium px-1.5 py-0.5 rounded-full ${
                trend.direction === 'up'
                  ? 'bg-success/10 text-success'
                  : 'bg-destructive/10 text-destructive'
              }`}
            >
              {trend.value}
            </span>
          )}
        </div>
        {Icon && <Icon size={20} className="text-muted-foreground/50 shrink-0 mt-0.5" />}
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const s = status.toLowerCase();
  let cls = '';
  if (s === 'completed' || s === 'passed' || s === 'success') {
    cls = 'bg-success/10 text-success border border-success/20';
  } else if (s === 'failed' || s === 'error') {
    cls = 'bg-destructive/10 text-destructive border border-destructive/20';
  } else if (s === 'pending' || s === 'running' || s === 'flaky') {
    cls = 'bg-warning/10 text-warning border border-warning/20';
  } else {
    cls = 'bg-muted text-muted-foreground border border-border';
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
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
