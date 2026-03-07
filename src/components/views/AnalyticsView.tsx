import React, { useState, useEffect, useCallback } from 'react';
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
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/useAuth';
import type {
  TrendPoint,
  FlakyTestResult,
  ErrorAnalysisResult,
  DurationBucket,
} from '@/lib/analytics';

type DateRange = '7' | '30' | '90';

interface AnalyticsState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

function useFetch<T>(url: string, token: string | null | undefined): AnalyticsState<T> {
  const [state, setState] = useState<AnalyticsState<T>>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    setState({ data: null, loading: true, error: null });

    const doFetch = async () => {
      try {
        const res = await fetch(url, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`Request failed: ${res.status}`);
        const json = (await res.json()) as { success: boolean; data: T };
        if (!cancelled) setState({ data: json.data, loading: false, error: null });
      } catch (err) {
        if (!cancelled)
          setState({
            data: null,
            loading: false,
            error: err instanceof Error ? err.message : 'Failed to load',
          });
      }
    };

    void doFetch();
    return () => {
      cancelled = true;
    };
  }, [url, token]);

  return state;
}

function SectionSkeleton() {
  return <Skeleton className="h-48 w-full" />;
}

function SectionError({ message }: { message: string }) {
  return (
    <div className="flex h-48 items-center justify-center text-sm text-destructive">{message}</div>
  );
}

const AnalyticsView: React.FC = () => {
  const { token } = useAuth();
  const [dateRange, setDateRange] = useState<DateRange>('30');
  const [tool, setTool] = useState('');

  const buildUrl = useCallback(
    (path: string, extra: Record<string, string> = {}) => {
      const params = new URLSearchParams({ days: dateRange, ...extra });
      if (tool) params.set('tool', tool);
      return `/api/v1/analytics/${path}?${params.toString()}`;
    },
    [dateRange, tool]
  );

  const trendsState = useFetch<TrendPoint[]>(buildUrl('trends'), token);
  const flakyState = useFetch<FlakyTestResult[]>(buildUrl('flaky-tests'), token);
  const errorState = useFetch<ErrorAnalysisResult[]>(buildUrl('error-analysis'), token);
  const durationState = useFetch<DurationBucket[]>(buildUrl('duration-distribution'), token);

  return (
    <div className="space-y-6">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-2xl font-bold">Analytics</h1>
        <Select value={dateRange} onValueChange={v => setDateRange(v as DateRange)}>
          <SelectTrigger id="analytics-date-range" className="w-40">
            <SelectValue placeholder="Last 30 days" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Last 7 days</SelectItem>
            <SelectItem value="30">Last 30 days</SelectItem>
            <SelectItem value="90">Last 90 days</SelectItem>
          </SelectContent>
        </Select>
        <Input
          id="analytics-tool-filter"
          className="w-48"
          placeholder="Filter by tool…"
          value={tool}
          onChange={e => setTool(e.target.value)}
        />
      </div>

      {/* Pass Rate Trend — full width */}
      <Card>
        <CardHeader>
          <CardTitle>Pass Rate Trend</CardTitle>
        </CardHeader>
        <CardContent>
          {trendsState.loading && <SectionSkeleton />}
          {trendsState.error && <SectionError message={trendsState.error} />}
          {!trendsState.loading && !trendsState.error && trendsState.data && (
            <ResponsiveContainer width="100%" height={240}>
              <LineChart data={trendsState.data}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" tick={{ fontSize: 12 }} />
                <YAxis domain={[0, 100]} tickFormatter={v => `${v as number}%`} />
                <Tooltip formatter={(value: number) => [`${value}%`, 'Pass Rate']} />
                <Line
                  type="monotone"
                  dataKey="passRate"
                  stroke="var(--chart-1)"
                  strokeWidth={2}
                  dot={{ r: 4 }}
                  name="Pass Rate"
                />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Two-column row: durations + flaky */}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {/* Test Durations */}
        <Card>
          <CardHeader>
            <CardTitle>Test Durations</CardTitle>
          </CardHeader>
          <CardContent>
            {durationState.loading && <SectionSkeleton />}
            {durationState.error && <SectionError message={durationState.error} />}
            {!durationState.loading && !durationState.error && durationState.data && (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={durationState.data}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="range" tick={{ fontSize: 11 }} />
                  <YAxis />
                  <Tooltip />
                  <Bar dataKey="count" fill="var(--chart-2)" name="Tests" />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Flaky Tests */}
        <Card>
          <CardHeader>
            <CardTitle>Flaky Tests</CardTitle>
          </CardHeader>
          <CardContent>
            {flakyState.loading && <SectionSkeleton />}
            {flakyState.error && <SectionError message={flakyState.error} />}
            {!flakyState.loading && !flakyState.error && flakyState.data && (
              <div className="overflow-auto">
                {flakyState.data.length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">
                    No flaky tests detected 🎉
                  </p>
                ) : (
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b text-left">
                        <th className="pb-2 pr-2">Test Name</th>
                        <th className="pb-2 pr-2">Suite</th>
                        <th className="pb-2 pr-2">Pass</th>
                        <th className="pb-2 pr-2">Fail</th>
                        <th className="pb-2">Flaky%</th>
                      </tr>
                    </thead>
                    <tbody>
                      {flakyState.data.slice(0, 10).map((t, i) => (
                        <tr key={i} className="border-b last:border-0">
                          <td className="py-1 pr-2 font-mono text-xs">{t.testName}</td>
                          <td className="py-1 pr-2 text-muted-foreground">{t.suite}</td>
                          <td className="py-1 pr-2 text-muted-foreground">{t.passed}</td>
                          <td className="py-1 pr-2 text-muted-foreground">{t.failed}</td>
                          <td className="py-1">
                            <Badge variant="destructive">{t.flakyScore}%</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Error Analysis — full width */}
      <Card>
        <CardHeader>
          <CardTitle>Error Analysis</CardTitle>
        </CardHeader>
        <CardContent>
          {errorState.loading && <SectionSkeleton />}
          {errorState.error && <SectionError message={errorState.error} />}
          {!errorState.loading && !errorState.error && errorState.data && (
            <div className="overflow-auto">
              {errorState.data.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No errors found in this time range 🎉
                </p>
              ) : (
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-left">
                      <th className="pb-2 pr-4">Error Message</th>
                      <th className="pb-2 pr-4">Count</th>
                      <th className="pb-2">Affected Tests</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errorState.data.map((e, i) => (
                      <tr key={i} className="border-b last:border-0">
                        <td className="py-1 pr-4 font-mono text-xs">
                          {e.errorMessage.length > 80
                            ? `${e.errorMessage.slice(0, 80)}…`
                            : e.errorMessage}
                        </td>
                        <td className="py-1 pr-4">
                          <Badge variant="secondary">{e.count}</Badge>
                        </td>
                        <td className="py-1 text-muted-foreground">
                          {e.affectedTests.slice(0, 3).join(', ')}
                          {e.affectedTests.length > 3 && (
                            <span className="text-muted-foreground">
                              {' '}
                              +{e.affectedTests.length - 3} more
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default AnalyticsView;
