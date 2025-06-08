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

interface TestTrendsProps {
  days?: number;
  token?: string;
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

const TestTrendsChart: React.FC<TestTrendsProps> = ({ days = 30, token }) => {
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

      const response = await fetch(`/api/analytics/test-trends?days=${selectedDays}`, {
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
  }, [selectedDays, token]);

  useEffect(() => {
    if (token) {
      fetchTestTrendsData();
    }
  }, [fetchTestTrendsData, token]);

  if (loading) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-md">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Loading trends from OpenSearch...</p>
            <p className="text-sm text-gray-400 mt-2">Analyzing {selectedDays} days of data</p>
          </div>
        </div>
      </div>
    );
  }
  if (error) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-md">
        <div className="text-center py-8">
          <h3 className="text-lg font-medium text-gray-900 mb-2">⚠️ OpenSearch Connection Error</h3>
          <p className="text-red-600 mb-4">{error}</p>
          <button
            onClick={fetchTestTrendsData}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
          >
            Retry OpenSearch Query
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-6" style={{ width: '100%', maxWidth: 'none' }}>
      {' '}
      {/* OpenSearch Data Source Indicator */}
      <div
        className="bg-blue-50 border border-blue-200 rounded-lg p-4"
        style={{ width: '100%', maxWidth: 'none' }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="ml-3">
              <h4 className="text-sm font-medium text-blue-800">📊 Data Source: OpenSearch</h4>
              <p className="text-sm text-blue-600">
                Index: ctrf-reports | Time Range: {selectedDays} days | Documents:{' '}
                {opensearchHealth?.documentsCount || 0}
              </p>
            </div>
          </div>
          <div className="flex items-center space-x-2">
            <select
              value={selectedDays}
              onChange={e => setSelectedDays(parseInt(e.target.value))}
              className="border border-gray-300 rounded px-3 py-1 text-sm"
            >
              <option value={7}>Last 7 days</option>
              <option value={14}>Last 14 days</option>
              <option value={30}>Last 30 days</option>
              <option value={90}>Last 90 days</option>
            </select>
            <button
              onClick={fetchTestTrendsData}
              className="bg-blue-600 text-white px-3 py-1 text-sm rounded hover:bg-blue-700 transition-colors"
            >
              Refresh
            </button>
          </div>
        </div>
      </div>{' '}
      {data.length === 0 ? (
        <div className="bg-white p-6 rounded-lg shadow-md text-center">
          <h3 className="text-lg font-medium text-gray-900 mb-2">📊 No Test Data Found</h3>
          <p className="text-gray-600 mb-2">
            No test trend data found in OpenSearch for the selected time range.
          </p>
          <p className="text-sm text-gray-400">Upload test reports to see historical trends.</p>
          <button
            onClick={fetchTestTrendsData}
            className="mt-4 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
          >
            Check Again
          </button>
        </div>
      ) : (
        <>
          {' '}
          {/* Test Results Trends Line Chart */}
          <div
            className="bg-white p-6 rounded-lg shadow-md"
            style={{ width: '100%', maxWidth: 'none' }}
          >
            <h3 className="text-xl font-bold mb-4 text-gray-800">📈 Test Results Trends</h3>
            <ResponsiveContainer width="100%" height={400}>
              <LineChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={60}
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
                  labelFormatter={label => `Date: ${label}`}
                  formatter={(value, name) => [
                    name === 'passRate' ? `${value}%` : value,
                    name === 'passRate'
                      ? 'Pass Rate'
                      : name === 'total'
                        ? 'Total Tests'
                        : name === 'passed'
                          ? 'Passed'
                          : name === 'failed'
                            ? 'Failed'
                            : 'Skipped',
                  ]}
                />
                <Legend />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="total"
                  stroke="#3b82f6"
                  strokeWidth={2}
                  name="Total Tests"
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="passed"
                  stroke="#10b981"
                  strokeWidth={2}
                  name="Passed"
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="failed"
                  stroke="#ef4444"
                  strokeWidth={2}
                  name="Failed"
                />
                <Line
                  yAxisId="left"
                  type="monotone"
                  dataKey="skipped"
                  stroke="#f59e0b"
                  strokeWidth={2}
                  name="Skipped"
                />
                <Line
                  yAxisId="right"
                  type="monotone"
                  dataKey="passRate"
                  stroke="#8b5cf6"
                  strokeWidth={3}
                  name="Pass Rate %"
                  strokeDasharray="5 5"
                />
              </LineChart>
            </ResponsiveContainer>
          </div>{' '}
          {/* Pass Rate Area Chart */}
          <div
            className="bg-white p-6 rounded-lg shadow-md"
            style={{ width: '100%', maxWidth: 'none' }}
          >
            <h3 className="text-xl font-bold mb-4 text-gray-800">🎯 Pass Rate Trend</h3>
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="date"
                  tick={{ fontSize: 12 }}
                  angle={-45}
                  textAnchor="end"
                  height={60}
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  label={{ value: 'Pass Rate (%)', angle: -90, position: 'insideLeft' }}
                  domain={[0, 100]}
                />
                <Tooltip
                  labelFormatter={label => `Date: ${label}`}
                  formatter={value => [`${value}%`, 'Pass Rate']}
                />
                <Area
                  type="monotone"
                  dataKey="passRate"
                  stroke="#10b981"
                  fill="#10b981"
                  fillOpacity={0.3}
                  strokeWidth={2}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>{' '}
          {/* Summary Statistics */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-bold mb-4 text-gray-800">📊 Trend Summary</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">
                  {data.reduce((sum, d) => sum + d.total, 0)}
                </div>
                <div className="text-sm text-gray-600">Total Tests</div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">
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
                <div className="text-2xl font-bold text-yellow-600">{data.length}</div>
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
