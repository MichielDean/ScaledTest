import React, { useEffect, useState, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
import {
  BarChart3,
  TrendingUp,
  CheckCircle,
  XCircle,
  RefreshCw,
  Activity,
  AlertTriangle,
  Lock,
} from 'lucide-react';
import type { AnalyticsData } from '../../types/analytics';
import { getPassRateColor, getPassRateVariant } from '../../lib/analyticsFormatting';

const AnalyticsView: React.FC = () => {
  const { token } = useAuth();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchAnalytics = useCallback(async () => {
    if (!token) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const response = await fetch('/api/analytics', {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? `Request failed with status ${response.status}`);
      }

      const json = (await response.json()) as AnalyticsData & { success: boolean };

      if (!json.success) {
        throw new Error('API returned unsuccessful response');
      }

      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load analytics data');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void fetchAnalytics();
  }, [fetchAnalytics]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex items-center justify-between">
        <div className="space-y-1">
          <h1
            id="analytics-title"
            className="text-3xl font-bold tracking-tight flex items-center gap-2"
          >
            <TrendingUp className="h-8 w-8 text-primary" />
            Analytics Dashboard
          </h1>
          <p className="text-muted-foreground">
            Aggregated test performance metrics from TimescaleDB
          </p>
        </div>
        <Button
          id="analytics-refresh-button"
          variant="outline"
          size="sm"
          onClick={() => void fetchAnalytics()}
          disabled={loading}
          className="flex items-center gap-2"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          Refresh
        </Button>
      </header>

      {/* Loading State */}
      {loading && (
        <section aria-label="Loading analytics">
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <Card key={i}>
                <CardHeader className="pb-2">
                  <Skeleton className="h-4 w-24" />
                </CardHeader>
                <CardContent>
                  <Skeleton className="h-8 w-16" />
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-6 grid gap-6 md:grid-cols-2">
            <Card>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-64 w-full" />
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <Skeleton className="h-5 w-32" />
              </CardHeader>
              <CardContent>
                <Skeleton className="h-64 w-full" />
              </CardContent>
            </Card>
          </div>
        </section>
      )}

      {/* Error State */}
      {!loading && error && (
        <Alert variant="destructive">
          <XCircle className="h-4 w-4" />
          <AlertTitle>Error loading analytics</AlertTitle>
          <AlertDescription className="mt-2">
            {error}
            <div className="mt-3">
              <Button
                id="analytics-retry-button"
                onClick={() => void fetchAnalytics()}
                variant="outline"
                size="sm"
                className="flex items-center gap-2"
              >
                <RefreshCw className="h-4 w-4" />
                Try Again
              </Button>
            </div>
          </AlertDescription>
        </Alert>
      )}

      {/* Unauthenticated / no-data state */}
      {!loading && !error && !data && (
        <Alert>
          <Lock className="h-4 w-4" />
          <AlertTitle>Authentication required</AlertTitle>
          <AlertDescription>Please sign in to view analytics data.</AlertDescription>
        </Alert>
      )}

      {/* Content */}
      {!loading && !error && data && (
        <>
          {/* Stats Cards */}
          <section aria-labelledby="stats-heading">
            <h2 id="stats-heading" className="sr-only">
              Overall Statistics
            </h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Reports</CardTitle>
                  <BarChart3 className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{data.stats.totalReports}</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {data.stats.recentReports} in the last 7 days
                  </p>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Total Tests</CardTitle>
                  <Activity className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold">{data.stats.totalTests.toLocaleString()}</div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Pass Rate</CardTitle>
                  <CheckCircle className="h-4 w-4 text-green-600" />
                </CardHeader>
                <CardContent>
                  <div className={`text-2xl font-bold ${getPassRateColor(data.stats.passRate)}`}>
                    {data.stats.passRate}%
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                  <CardTitle className="text-sm font-medium">Fail Rate</CardTitle>
                  <XCircle className="h-4 w-4 text-red-600" />
                </CardHeader>
                <CardContent>
                  <div className="text-2xl font-bold text-red-600">{data.stats.failRate}%</div>
                </CardContent>
              </Card>
            </div>
          </section>

          {/* Charts Row */}
          <div className="grid gap-6 md:grid-cols-2">
            {/* Pass Rate Trend */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5" />
                  Pass Rate Trend (30 days)
                </CardTitle>
                <CardDescription>Daily pass rate percentage over the last 30 days</CardDescription>
              </CardHeader>
              <CardContent>
                {data.trends.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                    <TrendingUp className="h-8 w-8 mb-2" />
                    <p className="text-sm">No trend data for the last 30 days</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <LineChart
                      data={data.trends}
                      margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11 }}
                        tickFormatter={d => {
                          const date = new Date(d + 'T00:00:00Z');
                          return date.toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            timeZone: 'UTC',
                          });
                        }}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tick={{ fontSize: 11 }}
                        tickFormatter={v => `${v}%`}
                      />
                      <Tooltip
                        formatter={(value: number) => [`${value}%`, 'Pass Rate']}
                        labelFormatter={label =>
                          new Date(label + 'T00:00:00Z').toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            timeZone: 'UTC',
                          })
                        }
                      />
                      <Line
                        type="monotone"
                        dataKey="passRate"
                        stroke="#22c55e"
                        strokeWidth={2}
                        dot={false}
                        activeDot={{ r: 4 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>

            {/* Daily Test Volume */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  Test Volume (30 days)
                </CardTitle>
                <CardDescription>Daily pass/fail counts over the last 30 days</CardDescription>
              </CardHeader>
              <CardContent>
                {data.trends.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-64 text-muted-foreground">
                    <BarChart3 className="h-8 w-8 mb-2" />
                    <p className="text-sm">No volume data for the last 30 days</p>
                  </div>
                ) : (
                  <ResponsiveContainer width="100%" height={250}>
                    <BarChart data={data.trends} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                      <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11 }}
                        tickFormatter={d => {
                          const date = new Date(d + 'T00:00:00Z');
                          return date.toLocaleDateString('en-US', {
                            month: 'short',
                            day: 'numeric',
                            timeZone: 'UTC',
                          });
                        }}
                      />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip
                        labelFormatter={label =>
                          new Date(label + 'T00:00:00Z').toLocaleDateString('en-US', {
                            weekday: 'short',
                            month: 'short',
                            day: 'numeric',
                            timeZone: 'UTC',
                          })
                        }
                      />
                      <Bar dataKey="passed" name="Passed" stackId="a" fill="#22c55e" />
                      <Bar dataKey="failed" name="Failed" stackId="a" fill="#ef4444" />
                    </BarChart>
                  </ResponsiveContainer>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Top Failing Tests */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-destructive" />
                Top Failing Tests
              </CardTitle>
              <CardDescription>
                Tests with the highest failure counts (last 1,000 reports)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {data.topFailingTests.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
                  <CheckCircle className="h-10 w-10 mb-3 text-green-600" />
                  <p className="font-medium text-foreground">No failing tests found</p>
                  <p className="text-sm mt-1">All tests across your recent reports are passing.</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {data.topFailingTests.map((test, index) => (
                    <div
                      key={`${test.suite}-${test.name}-${index}`}
                      className="flex items-start justify-between gap-4 p-3 rounded-lg border bg-card hover:bg-muted/40 transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-medium text-sm truncate" title={test.name}>
                          {test.name}
                        </div>
                        <div className="text-xs text-muted-foreground mt-0.5">{test.suite}</div>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 text-sm">
                        <span className="text-muted-foreground">
                          {test.failCount}/{test.totalRuns} runs
                        </span>
                        <Badge variant={getPassRateVariant(100 - test.failRate)}>
                          {test.failRate}% fail rate
                        </Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
};

export default AnalyticsView;
