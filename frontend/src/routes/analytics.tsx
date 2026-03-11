import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import { api } from '../lib/api';
import { queryKeys } from '../lib/query-keys';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface TrendPoint {
  date: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  pass_rate: number;
}

interface FlakyTest {
  name: string;
  suite: string;
  file_path: string;
  flip_count: number;
  total_runs: number;
  flip_rate: number;
  last_status: string;
}

interface ErrorCluster {
  message: string;
  count: number;
  test_names: string[];
  first_seen: string;
  last_seen: string;
}

interface DurationBucket {
  range_label: string;
  min_ms: number;
  max_ms: number;
  count: number;
}

interface DurationStats {
  mean_ms: number;
  median_ms: number;
  p95_ms: number;
  p99_ms: number;
  min_ms: number;
  max_ms: number;
  distribution: DurationBucket[];
}

interface HealthScore {
  score: number;
  pass_rate: number;
  flaky_rate: number;
  avg_duration_ms: number;
  trend: 'improving' | 'stable' | 'degrading';
  details: {
    pass_rate_score: number;
    flaky_score: number;
    speed_score: number;
    pass_rate_delta: number;
  };
}

type TimeRange = 7 | 30 | 90;
type GroupBy = 'day' | 'week' | 'month';

// ---------------------------------------------------------------------------
// Analytics Page
// ---------------------------------------------------------------------------

export function AnalyticsPage() {
  const [days, setDays] = useState<TimeRange>(30);
  const [groupBy, setGroupBy] = useState<GroupBy>('day');

  const trendsQuery = useQuery({
    queryKey: queryKeys.analytics.trends(days, groupBy),
    queryFn: () => api.getTrends({ days, group_by: groupBy }) as Promise<{ trends: TrendPoint[] }>,
  });

  const flakyQuery = useQuery({
    queryKey: queryKeys.analytics.flakyTests(days),
    queryFn: () => api.getFlakyTests({ days }) as Promise<{ flaky_tests: FlakyTest[] }>,
  });

  const errorQuery = useQuery({
    queryKey: queryKeys.analytics.errorAnalysis(days),
    queryFn: () => api.getErrorAnalysis({ days }) as Promise<{ errors: ErrorCluster[] }>,
  });

  const durationQuery = useQuery({
    queryKey: queryKeys.analytics.durationDistribution(days),
    queryFn: () => api.getDurationDistribution({ days }) as Promise<DurationStats>,
  });

  const healthQuery = useQuery({
    queryKey: queryKeys.analytics.healthScore(days),
    queryFn: () => api.getHealthScore({ days }) as Promise<HealthScore>,
  });

  const trends = trendsQuery.data?.trends ?? [];
  const flakyTests = flakyQuery.data?.flaky_tests ?? [];
  const errorClusters = errorQuery.data?.errors ?? [];
  const durationStats = durationQuery.data;
  const health = healthQuery.data;

  return (
    <div className="p-6 space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <div className="flex gap-2">
          <TimeRangeSelector value={days} onChange={setDays} />
          <GroupBySelector value={groupBy} onChange={setGroupBy} />
        </div>
      </div>

      {/* Health Score */}
      <HealthScoreCard health={health} loading={healthQuery.isLoading} />

      {/* Pass Rate Trends */}
      <section className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">Pass Rate Trends</h2>
        {trendsQuery.isLoading ? (
          <LoadingPlaceholder />
        ) : trends.length === 0 ? (
          <EmptyPlaceholder message="No trend data available yet." />
        ) : (
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} tickFormatter={formatDateShort} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" />
              <Tooltip
                labelFormatter={formatDateFull}
                formatter={(v: number, name: string) => {
                  if (name === 'pass_rate') return [`${v.toFixed(1)}%`, 'Pass Rate'];
                  return [v, name];
                }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="pass_rate"
                name="Pass Rate"
                stroke="#22c55e"
                strokeWidth={2}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </section>

      {/* Test Volume Trends */}
      <section className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">Test Volume</h2>
        {trendsQuery.isLoading ? (
          <LoadingPlaceholder />
        ) : trends.length === 0 ? (
          <EmptyPlaceholder message="No test data available yet." />
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} tickFormatter={formatDateShort} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip labelFormatter={formatDateFull} />
              <Legend />
              <Bar dataKey="passed" name="Passed" stackId="a" fill="#22c55e" />
              <Bar dataKey="failed" name="Failed" stackId="a" fill="#ef4444" />
              <Bar dataKey="skipped" name="Skipped" stackId="a" fill="#eab308" />
            </BarChart>
          </ResponsiveContainer>
        )}
      </section>

      {/* Two-column: Duration Distribution + Failure Clustering */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Duration Distribution */}
        <section className="rounded-lg border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4">Duration Distribution</h2>
          {durationQuery.isLoading ? (
            <LoadingPlaceholder />
          ) : !durationStats?.distribution?.length ? (
            <EmptyPlaceholder message="No duration data available." />
          ) : (
            <>
              <div className="grid grid-cols-3 gap-3 mb-4 text-sm">
                <StatMini label="Mean" value={formatDuration(durationStats.mean_ms)} />
                <StatMini label="Median" value={formatDuration(durationStats.median_ms)} />
                <StatMini label="P95" value={formatDuration(durationStats.p95_ms)} />
              </div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={durationStats.distribution.filter(b => b.count > 0)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="range_label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="count" name="Tests" fill="#6366f1" />
                </BarChart>
              </ResponsiveContainer>
            </>
          )}
        </section>

        {/* Failure Clustering */}
        <section className="rounded-lg border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4">Failure Patterns</h2>
          {errorQuery.isLoading ? (
            <LoadingPlaceholder />
          ) : errorClusters.length === 0 ? (
            <EmptyPlaceholder message="No failures in this period." />
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={errorClusters.slice(0, 5)}
                    dataKey="count"
                    nameKey="message"
                    cx="50%"
                    cy="50%"
                    outerRadius={70}
                    label={({ name }) => truncate(name, 20)}
                  >
                    {errorClusters.slice(0, 5).map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(v: number) => [v, 'Occurrences']} />
                </PieChart>
              </ResponsiveContainer>
              <div className="mt-4 space-y-2 max-h-48 overflow-y-auto">
                {errorClusters.map((ec, i) => (
                  <div key={i} className="text-sm border-b pb-2">
                    <div className="flex justify-between">
                      <span className="font-medium truncate max-w-[70%]">{ec.message}</span>
                      <span className="text-red-600 font-mono">{ec.count}x</span>
                    </div>
                    <div className="text-muted-foreground text-xs mt-1">
                      {ec.test_names.length} test{ec.test_names.length !== 1 ? 's' : ''} affected
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </section>
      </div>

      {/* Flaky Tests */}
      <section className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">Flaky Tests</h2>
        {flakyQuery.isLoading ? (
          <LoadingPlaceholder />
        ) : flakyTests.length === 0 ? (
          <EmptyPlaceholder message="No flaky tests detected in this period." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-4">Test Name</th>
                  <th className="pb-2 pr-4">Suite</th>
                  <th className="pb-2 pr-4">Flips</th>
                  <th className="pb-2 pr-4">Total Runs</th>
                  <th className="pb-2 pr-4">Flip Rate</th>
                  <th className="pb-2">Last Status</th>
                </tr>
              </thead>
              <tbody>
                {flakyTests.map((ft, i) => (
                  <tr key={i} className="border-b last:border-b-0">
                    <td className="py-2 pr-4 font-mono text-xs truncate max-w-[300px]">
                      {ft.name}
                    </td>
                    <td className="py-2 pr-4 text-muted-foreground">{ft.suite || '—'}</td>
                    <td className="py-2 pr-4 text-orange-600 font-medium">{ft.flip_count}</td>
                    <td className="py-2 pr-4">{ft.total_runs}</td>
                    <td className="py-2 pr-4">
                      <span
                        className={`font-medium ${ft.flip_rate > 0.5 ? 'text-red-600' : ft.flip_rate > 0.2 ? 'text-orange-600' : 'text-yellow-600'}`}
                      >
                        {(ft.flip_rate * 100).toFixed(0)}%
                      </span>
                    </td>
                    <td className="py-2">
                      <StatusDot status={ft.last_status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

const PIE_COLORS = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#6366f1'];

function TimeRangeSelector({
  value,
  onChange,
}: {
  value: TimeRange;
  onChange: (v: TimeRange) => void;
}) {
  return (
    <div className="flex rounded-md border overflow-hidden text-sm">
      {([7, 30, 90] as TimeRange[]).map(d => (
        <button
          key={d}
          onClick={() => onChange(d)}
          className={`px-3 py-1.5 ${value === d ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
        >
          {d}d
        </button>
      ))}
    </div>
  );
}

function GroupBySelector({ value, onChange }: { value: GroupBy; onChange: (v: GroupBy) => void }) {
  return (
    <select
      value={value}
      onChange={e => onChange(e.target.value as GroupBy)}
      className="rounded-md border px-2 py-1.5 text-sm bg-card"
    >
      <option value="day">Daily</option>
      <option value="week">Weekly</option>
      <option value="month">Monthly</option>
    </select>
  );
}

function HealthScoreCard({
  health,
  loading,
}: {
  health: HealthScore | undefined;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="rounded-lg border bg-card p-6">
        <div className="h-24 flex items-center justify-center text-muted-foreground">
          Computing health score...
        </div>
      </div>
    );
  }

  if (!health) {
    return null;
  }

  const scoreColor =
    health.score >= 80 ? 'text-green-600' : health.score >= 60 ? 'text-yellow-600' : 'text-red-600';

  const trendIcon =
    health.trend === 'improving' ? '\u2191' : health.trend === 'degrading' ? '\u2193' : '\u2192';

  const trendColor =
    health.trend === 'improving'
      ? 'text-green-600'
      : health.trend === 'degrading'
        ? 'text-red-600'
        : 'text-muted-foreground';

  return (
    <div className="rounded-lg border bg-card p-6">
      <div className="flex items-center gap-8 flex-wrap">
        {/* Main score */}
        <div className="text-center">
          <p className="text-sm text-muted-foreground mb-1">Team Health Score</p>
          <p className={`text-5xl font-bold ${scoreColor}`}>{health.score.toFixed(0)}</p>
          <p className={`text-sm mt-1 ${trendColor}`}>
            {trendIcon} {health.trend}
            {health.details.pass_rate_delta !== 0 && (
              <span className="ml-1">
                ({health.details.pass_rate_delta > 0 ? '+' : ''}
                {health.details.pass_rate_delta.toFixed(1)}%)
              </span>
            )}
          </p>
        </div>

        {/* Breakdown */}
        <div className="flex gap-6 flex-1 min-w-0">
          <ScoreBreakdown
            label="Pass Rate"
            score={health.details.pass_rate_score}
            detail={`${health.pass_rate.toFixed(1)}%`}
            weight="50%"
          />
          <ScoreBreakdown
            label="Stability"
            score={health.details.flaky_score}
            detail={`${health.flaky_rate.toFixed(1)}% flaky`}
            weight="30%"
          />
          <ScoreBreakdown
            label="Speed"
            score={health.details.speed_score}
            detail={formatDuration(health.avg_duration_ms)}
            weight="20%"
          />
        </div>
      </div>
    </div>
  );
}

function ScoreBreakdown({
  label,
  score,
  detail,
  weight,
}: {
  label: string;
  score: number;
  detail: string;
  weight: string;
}) {
  const color = score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-yellow-500' : 'bg-red-500';
  return (
    <div className="flex-1 min-w-[120px]">
      <div className="flex justify-between text-xs text-muted-foreground mb-1">
        <span>{label}</span>
        <span>{weight}</span>
      </div>
      <div className="w-full bg-muted rounded-full h-2 mb-1">
        <div
          className={`h-2 rounded-full ${color}`}
          style={{ width: `${Math.min(100, score)}%` }}
        />
      </div>
      <div className="text-xs text-muted-foreground">{detail}</div>
    </div>
  );
}

function StatMini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border p-2 text-center">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="font-semibold">{value}</p>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const color =
    status === 'passed' ? 'bg-green-500' : status === 'failed' ? 'bg-red-500' : 'bg-gray-400';
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block w-2 h-2 rounded-full ${color}`} />
      <span className="text-xs">{status}</span>
    </span>
  );
}

function LoadingPlaceholder() {
  return (
    <div className="h-64 flex items-center justify-center text-muted-foreground">Loading...</div>
  );
}

function EmptyPlaceholder({ message }: { message: string }) {
  return (
    <div className="h-64 flex items-center justify-center text-muted-foreground">{message}</div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDateShort(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return iso;
  }
}

function formatDateFull(iso: string): string {
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
  if (ms < 1) return '0ms';
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max) + '...' : s;
}
