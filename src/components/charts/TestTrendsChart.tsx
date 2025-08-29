// Test Trends Chart - Data sourced from OpenSearch
import React, { useState, useEffect, useCallback } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  AreaChart,
  Area,
} from 'recharts';
import { TestTrendsData } from '../../types/dashboard';
import {
  OpenSearchApiResponse,
  OpenSearchErrorApiResponse,
  OpenSearchHealth,
} from '../../types/opensearch';
import styles from '../../styles/Charts.module.css';

interface TestTrendsProps {
  days?: number;
  token?: string;
  teamIds?: string[];
}

// Use shared OpenSearchApiResponse with a specialized meta type for trends
interface TestTrendsResponse extends OpenSearchApiResponse<TestTrendsData> {
  meta: {
    source: 'OpenSearch';
    index: string;
    daysRequested: number;
    timestamp: string;
    opensearchHealth: OpenSearchHealth;
  };
}

// Use the shared OpenSearchErrorApiResponse
type ErrorResponse = OpenSearchErrorApiResponse;

const TestTrendsChart: React.FC<TestTrendsProps> = ({ days = 30, token, teamIds }) => {
  const [data, setData] = useState<TestTrendsData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opensearchHealth, setOpensearchHealth] = useState<{
    connected: boolean;
    indexExists: boolean;
    documentsCount: number;
    clusterHealth: string;
  } | null>(null);
  const [selectedDays, setSelectedDays] = useState(days);

  // Helper function to format date-time for chart display
  const formatDateTime = (value: string): string => {
    const date = new Date(value);
    return (
      date.toLocaleDateString() +
      ' ' +
      date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    );
  };

  const fetchTestTrendsData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      // Prepare headers with authentication
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      // Build query parameters
      let queryParams = `days=${selectedDays}`;
      if (teamIds && teamIds.length > 0) {
        const teamIdsQuery = teamIds.map(id => `teamIds=${encodeURIComponent(id)}`).join('&');
        queryParams += `&${teamIdsQuery}`;
      }

      const response = await fetch(`/api/analytics/test-trends?${queryParams}`, {
        headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenSearch API error: ${response.status} - ${errorText}`);
      }

      const result: TestTrendsResponse | ErrorResponse = await response.json();

      if (!result.success) {
        const errorResult = result as ErrorResponse;
        throw new Error(errorResult.error || 'Failed to fetch from OpenSearch');
      }

      const successResult = result as TestTrendsResponse;
      setData(successResult.data || []);
      setOpensearchHealth(successResult.meta?.opensearchHealth);
    } catch (err) {
      // Using proper error handling instead of console.error
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  }, [selectedDays, token, teamIds]);

  useEffect(() => {
    if (token) {
      fetchTestTrendsData();
    }
  }, [fetchTestTrendsData, token]);

  if (loading) {
    return (
      <div className={styles.card}>
        <div className={styles.loadingContent}>
          <div className="text-center">
            <div className={styles.loadingSpinner}></div>
            <p className={styles.loadingText}>Loading trends from OpenSearch...</p>
            <p className={styles.loadingSubtext}>Analyzing {selectedDays} days of data</p>
          </div>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className={styles.card}>
        <div className={styles.errorContent}>
          <h3 className={styles.errorTitle}>⚠️ OpenSearch Connection Error</h3>
          <p className={styles.errorMessage}>{error}</p>
          <button onClick={fetchTestTrendsData} className={styles.retryButton}>
            Retry OpenSearch Query
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className={`space-y-6 ${styles.chartContainer}`}>
      {' '}
      {/* OpenSearch Data Source Indicator */}
      <div className={styles.dataSourceIndicator}>
        <div className={styles.dataSourceHeader}>
          <div className="flex items-center">
            <div className={styles.dataSourceInfo}>
              <h4 className={styles.dataSourceTitle}>📊 Data Source: OpenSearch</h4>
              <p className={styles.dataSourceDetails}>
                Index: ctrf-reports | Time Range: {selectedDays} days | Documents:{' '}
                {opensearchHealth?.documentsCount || 0}
              </p>
            </div>
          </div>
          <div className={styles.dataSourceControls}>
            <select
              value={selectedDays}
              onChange={e => setSelectedDays(parseInt(e.target.value))}
              className={styles.timeRangeSelect}
            >
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <button onClick={fetchTestTrendsData} className={styles.refreshButton}>
              Refresh
            </button>
          </div>
        </div>
      </div>{' '}
      {data.length === 0 ? (
        <div className={`${styles.card} ${styles.noDataContainer}`}>
          <h3 className={styles.noDataTitle}>📊 No Test Data Found</h3>
          <p className={styles.noDataMessage}>
            No test trend data found in OpenSearch for the selected time range.
          </p>
          <p className={styles.noDataSubtext}>Upload test reports to see historical trends.</p>
          <button onClick={fetchTestTrendsData} className={styles.checkAgainButton}>
            Check Again
          </button>
        </div>
      ) : (
        <>
          {' '}
          {/* Test Results Trends Line Chart */}
          <div className={`${styles.card} ${styles.chartContainer}`}>
            <h3 className={styles.chartTitle}>📈 Test Results Trends</h3>
            {data.length === 1 && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-blue-800 text-sm">
                  <strong>ℹ️ Single Data Point:</strong> Only one test result found. Data points are
                  shown as dots. Add more test reports over time to see trend lines.
                </p>
              </div>
            )}
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  tickFormatter={formatDateTime}
                />
                <YAxis
                  yAxisId="left"
                  tick={{ fontSize: 12 }}
                  label={{ value: 'Test Count', angle: -90, position: 'insideLeft' }}
                />
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  tick={{ fontSize: 12 }}
                  label={{ value: 'Pass Rate (%)', angle: 90, position: 'insideRight' }}
                  domain={[0, 100]}
                />
                <Tooltip
                  labelFormatter={formatDateTime}
                  formatter={(value, name) => [name === 'Pass Rate %' ? `${value}%` : value, name]}
                />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="total"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  name="Total Tests"
                  dot={{ fill: '#3b82f6', strokeWidth: 2, r: 4 }}
                  connectNulls={false}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="passed"
                  stroke="#10b981"
                  strokeWidth={2}
                  name="Passed"
                  dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }}
                  connectNulls={false}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="failed"
                  stroke="#ef4444"
                  strokeWidth={2}
                  name="Failed"
                  dot={{ fill: '#ef4444', strokeWidth: 2, r: 4 }}
                  connectNulls={false}
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="skipped"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  name="Skipped"
                  dot={{ fill: '#f59e0b', strokeWidth: 2, r: 4 }}
                  connectNulls={false}
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="passRate"
                  stroke="#8b5cf6"
                  strokeWidth={3}
                  name="Pass Rate %"
                  strokeDasharray="5 5"
                  dot={{ fill: '#8b5cf6', strokeWidth: 2, r: 4 }}
                  connectNulls={false}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>{' '}
          {/* Pass Rate Area Chart */}
          <div className={`${styles.card} ${styles.chartContainer}`}>
            <h3 className={styles.chartTitle}>🎯 Pass Rate Trend</h3>
            {data.length === 1 && (
              <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-blue-800 text-sm">
                  <strong>ℹ️ Single Data Point:</strong> Only one test result found. The data point
                  is shown as a dot. Add more test reports over time to see trend areas.
                </p>
              </div>
            )}
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 11 }}
                  angle={-45}
                  textAnchor="end"
                  height={80}
                  tickFormatter={formatDateTime}
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  label={{ value: 'Pass Rate (%)', angle: -90, position: 'insideLeft' }}
                  domain={[0, 100]}
                />
                <Tooltip
                  labelFormatter={formatDateTime}
                  formatter={value => [`${value}%`, 'Pass Rate']}
                />
                <Area
                  type="monotone"
                  dataKey="passRate"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.3}
                  strokeWidth={2}
                  dot={{ fill: '#10b981', strokeWidth: 2, r: 4 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>{' '}
          {/* Summary Statistics */}
          <div className={styles.card}>
            <h3 className={styles.chartTitle}>📊 Trend Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">
                  {data.reduce((sum, d) => sum + d.total, 0)}
                </div>
                <div className="text-sm text-gray-600">Total Tests</div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-700">
                  {data.length > 0
                    ? Math.round(data.reduce((sum, d) => sum + d.passRate, 0) / data.length)
                    : 0}
                  %
                </div>
                <div className="text-sm text-gray-600">Avg Pass Rate</div>
              </div>{' '}
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">
                  {data.length > 0 ? Math.max(...data.map(d => d.passRate)) : 0}%
                </div>
                <div className="text-sm text-gray-600">Best Pass Rate</div>
              </div>
              <div className="text-center p-4 bg-yellow-50 rounded-lg">
                <div className="text-2xl font-bold text-yellow-700">{data.length}</div>
                <div className="text-sm text-gray-600">Data Points</div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default TestTrendsChart;
