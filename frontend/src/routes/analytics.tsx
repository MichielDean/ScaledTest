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
  Cell,
} from 'recharts';
import { api } from '../lib/api';
import { queryKeys } from '../lib/query-keys';

interface TrendPoint {
  date: string;
  pass_rate: number;
}

interface FlakyTest {
  name: string;
  flake_rate: number;
  suite?: string;
}

interface ErrorCluster {
  message: string;
  count: number;
  last_seen: string;
}

interface DurationBucket {
  range: string;
  count: number;
}

interface TrendsResponse {
  trends: TrendPoint[];
}

interface FlakyTestsResponse {
  flaky_tests: FlakyTest[];
}

interface ErrorAnalysisResponse {
  errors: ErrorCluster[];
}

interface DurationDistributionResponse {
  distribution: DurationBucket[];
}

export function AnalyticsPage() {
  const trendsQuery = useQuery({
    queryKey: queryKeys.analytics.trends,
    queryFn: () => api.getTrends() as Promise<TrendsResponse>,
  });

  const flakyQuery = useQuery({
    queryKey: queryKeys.analytics.flakyTests,
    queryFn: () => api.getFlakyTests() as Promise<FlakyTestsResponse>,
  });

  const errorsQuery = useQuery({
    queryKey: queryKeys.analytics.errorAnalysis,
    queryFn: () => api.getErrorAnalysis() as Promise<ErrorAnalysisResponse>,
  });

  const durationQuery = useQuery({
    queryKey: queryKeys.analytics.durationDistribution,
    queryFn: () => api.getDurationDistribution() as Promise<DurationDistributionResponse>,
  });

  const trends = trendsQuery.data?.trends ?? [];
  const flakyTests = flakyQuery.data?.flaky_tests ?? [];
  const errors = errorsQuery.data?.errors ?? [];
  const distribution = durationQuery.data?.distribution ?? [];

  return (
    <div className="p-6 space-y-8">
      <h1 className="text-2xl font-bold">Analytics</h1>

      {/* Pass Rate Trends */}
      <section className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">Pass Rate Trends</h2>
        {trendsQuery.isLoading ? (
          <LoadingPlaceholder />
        ) : trends.length === 0 ? (
          <EmptyState message="No trend data available yet." />
        ) : (
          <ResponsiveContainer width="100%" height={300}>
            <LineChart data={trends}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" tick={{ fontSize: 12 }} />
              <YAxis domain={[0, 100]} tick={{ fontSize: 12 }} unit="%" />
              <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, 'Pass Rate']} />
              <Line
                type="monotone"
                dataKey="pass_rate"
                stroke="#22c55e"
                strokeWidth={2}
                dot={{ r: 3 }}
                activeDot={{ r: 5 }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Flaky Tests */}
        <section className="rounded-lg border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4">Flaky Tests</h2>
          {flakyQuery.isLoading ? (
            <LoadingPlaceholder />
          ) : flakyTests.length === 0 ? (
            <EmptyState message="No flaky tests detected." />
          ) : (
            <div className="space-y-3">
              {flakyTests.map((test, i) => (
                <div key={i} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate" title={test.name}>
                      {test.name}
                    </p>
                    {test.suite && <p className="text-xs text-muted-foreground">{test.suite}</p>}
                  </div>
                  <div className="shrink-0 flex items-center gap-2">
                    <div className="w-24 h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className="h-full rounded-full bg-orange-500"
                        style={{ width: `${Math.min(test.flake_rate * 100, 100)}%` }}
                      />
                    </div>
                    <span className="text-xs font-mono text-muted-foreground w-12 text-right">
                      {(test.flake_rate * 100).toFixed(0)}%
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Duration Distribution */}
        <section className="rounded-lg border bg-card p-6">
          <h2 className="text-lg font-semibold mb-4">Duration Distribution</h2>
          {durationQuery.isLoading ? (
            <LoadingPlaceholder />
          ) : distribution.length === 0 ? (
            <EmptyState message="No duration data available." />
          ) : (
            <ResponsiveContainer width="100%" height={240}>
              <BarChart data={distribution}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {distribution.map((_, index) => (
                    <Cell key={index} fill={index % 2 === 0 ? '#3b82f6' : '#60a5fa'} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          )}
        </section>
      </div>

      {/* Error Analysis */}
      <section className="rounded-lg border bg-card p-6">
        <h2 className="text-lg font-semibold mb-4">Error Analysis</h2>
        {errorsQuery.isLoading ? (
          <LoadingPlaceholder />
        ) : errors.length === 0 ? (
          <EmptyState message="No errors recorded." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground">
                  <th className="pb-2 pr-4">Error Message</th>
                  <th className="pb-2 pr-4 w-20">Count</th>
                  <th className="pb-2 w-32">Last Seen</th>
                </tr>
              </thead>
              <tbody>
                {errors.map((err, i) => (
                  <tr key={i} className="border-b last:border-b-0">
                    <td className="py-3 pr-4">
                      <p
                        className="font-mono text-xs text-red-700 truncate max-w-[500px]"
                        title={err.message}
                      >
                        {err.message}
                      </p>
                    </td>
                    <td className="py-3 pr-4">
                      <span className="inline-block rounded-full bg-red-100 text-red-800 px-2 py-0.5 text-xs font-medium">
                        {err.count}
                      </span>
                    </td>
                    <td className="py-3 text-muted-foreground text-xs">
                      {formatDate(err.last_seen)}
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

function LoadingPlaceholder() {
  return (
    <div className="h-64 flex items-center justify-center text-muted-foreground">Loading...</div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="h-64 flex items-center justify-center text-muted-foreground">{message}</div>
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
