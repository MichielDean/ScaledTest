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
import { api } from '../lib/api';
import { queryKeys } from '../lib/query-keys';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Report {
  id: string;
  name: string;
  passed: number;
  failed: number;
  skipped: number;
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

// ---------------------------------------------------------------------------
// Dashboard page
// ---------------------------------------------------------------------------

export function DashboardPage() {
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
    const totalPassed = reports.reduce((s, r) => s + r.passed, 0);
    const totalTests = reports.reduce((s, r) => s + r.passed + r.failed + r.skipped, 0);
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
        />
        <StatCard
          title="Total Executions"
          value={totalExecutions?.toString()}
          loading={executionsQuery.isLoading}
        />
        <StatCard
          title="Pass Rate"
          value={passRate ? `${passRate}%` : undefined}
          loading={reportsQuery.isLoading}
        />
        <StatCard
          title="Flaky Tests"
          value={flakyCount?.toString()}
          loading={flakyQuery.isLoading}
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
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" />
              <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, 'Pass Rate']} />
              <Line
                type="monotone"
                dataKey="pass_rate"
                stroke="#22c55e"
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
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4">Name</th>
                    <th className="pb-2 pr-4">Passed</th>
                    <th className="pb-2 pr-4">Failed</th>
                    <th className="pb-2 pr-4">Skipped</th>
                    <th className="pb-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentReports.map(r => (
                    <tr key={r.id} className="border-b last:border-b-0">
                      <td className="py-2 pr-4 font-medium truncate max-w-[200px]">{r.name}</td>
                      <td className="py-2 pr-4 text-green-600">{r.passed}</td>
                      <td className="py-2 pr-4 text-red-600">{r.failed}</td>
                      <td className="py-2 pr-4 text-yellow-600">{r.skipped}</td>
                      <td className="py-2 text-muted-foreground">{formatDate(r.created_at)}</td>
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
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-2 pr-4">Command</th>
                    <th className="pb-2 pr-4">Status</th>
                    <th className="pb-2">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {recentExecutions.map(e => (
                    <tr key={e.id} className="border-b last:border-b-0">
                      <td className="py-2 pr-4 font-mono text-xs truncate max-w-[260px]">
                        {e.command}
                      </td>
                      <td className="py-2 pr-4">
                        <StatusBadge status={e.status} />
                      </td>
                      <td className="py-2 text-muted-foreground">{formatDate(e.created_at)}</td>
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
}: {
  title: string;
  value: string | undefined;
  loading: boolean;
}) {
  return (
    <div className="rounded-lg border bg-card p-6">
      <p className="text-sm text-muted-foreground">{title}</p>
      <p className="text-3xl font-bold mt-1">
        {loading ? (
          <span className="inline-block h-8 w-16 animate-pulse rounded bg-muted" />
        ) : (
          (value ?? '—')
        )}
      </p>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    completed: 'bg-green-100 text-green-800',
    running: 'bg-blue-100 text-blue-800',
    failed: 'bg-red-100 text-red-800',
    cancelled: 'bg-yellow-100 text-yellow-800',
    pending: 'bg-gray-100 text-gray-800',
  };
  const cls = colorMap[status.toLowerCase()] ?? 'bg-gray-100 text-gray-800';
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
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
