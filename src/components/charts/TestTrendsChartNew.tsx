// Test Trends Chart - Data sourced from OpenSearch
import React, { useState, useEffect } from 'react';
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

interface TestTrendsProps {
  days?: number;
}

interface OpenSearchResponse {
  success: boolean;
  data: TestTrendsData[];
  meta: {
    source: 'OpenSearch';
    index: string;
    daysRequested: number;
    timestamp: string;
    opensearchHealth: {
      connected: boolean;
      indexExists: boolean;
      documentsCount: number;
      clusterHealth: string;
    };
  };
}

interface ErrorResponse {
  success: false;
  error: string;
  source: 'OpenSearch';
}

const TestTrendsChart: React.FC<TestTrendsProps> = ({ days = 30 }) => {
  const [data, setData] = useState<TestTrendsData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opensearchHealth, setOpensearchHealth] = useState<any>(null);
  const [selectedDays, setSelectedDays] = useState(days);

  useEffect(() => {
    fetchTestTrendsData();
  }, [selectedDays]);

  const fetchTestTrendsData = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(`/api/analytics/test-trends?days=${selectedDays}`);
      if (!response.ok) {
        throw new Error(`OpenSearch API error: ${response.status}`);
      }

      const result: OpenSearchResponse | ErrorResponse = await response.json();

      if (!result.success) {
        throw new Error(result.error || 'Failed to fetch from OpenSearch');
      }

      setData(result.data);
      setOpensearchHealth(result.meta.opensearchHealth);
    } catch (err) {
      console.error('Failed to fetch test trends from OpenSearch:', err);
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  };

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
          <div className="text-red-600 mb-4">
            <svg
              className="mx-auto h-12 w-12"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">OpenSearch Connection Error</h3>
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
    <div className="space-y-6">
      {/* OpenSearch Data Source Indicator */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center">
            <div className="flex-shrink-0">
              <svg className="h-5 w-5 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
                <path
                  fillRule="evenodd"
                  d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11.707 4.707a1 1 0 00-1.414-1.414L10 9.586 8.707 8.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                  clipRule="evenodd"
                />
              </svg>
            </div>
            <div className="ml-3">
              <h4 className="text-sm font-medium text-blue-800">Data Source: OpenSearch</h4>
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
      </div>

      {data.length === 0 ? (
        <div className="bg-white p-6 rounded-lg shadow-md text-center">
          <p className="text-gray-600">
            No test trend data found in OpenSearch for the selected time range.
          </p>
          <p className="text-sm text-gray-400 mt-2">
            Upload test reports to see historical trends.
          </p>
        </div>
      ) : (
        <>
          {/* Test Results Trends Line Chart */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-bold mb-4 text-gray-800">
              📈 Test Results Trends (OpenSearch)
            </h3>
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
          </div>

          {/* Pass Rate Area Chart */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-bold mb-4 text-gray-800">
              🎯 Pass Rate Trend (OpenSearch)
            </h3>
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
          </div>

          {/* Summary Statistics */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-bold mb-4 text-gray-800">
              📊 Trend Summary (OpenSearch Analysis)
            </h3>
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
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">
                  {Math.max(...data.map(d => d.passRate))}%
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
