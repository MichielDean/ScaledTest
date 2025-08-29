// Test Duration Analysis Chart - Data sourced from OpenSearch
import React, { useState, useEffect, useCallback } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import { TestDurationData } from '../../types/dashboard';
import { OpenSearchApiResponse, OpenSearchErrorApiResponse } from '../../types/opensearch';

interface TestDurationAnalysisProps {
  token?: string;
}

// Use the shared OpenSearchApiResponse with TestDurationData type
type TestDurationResponse = OpenSearchApiResponse<TestDurationData>;

// Use the shared OpenSearchErrorApiResponse
type ErrorResponse = OpenSearchErrorApiResponse;

const COLORS = ['#10b981', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6'];

const TestDurationAnalysis: React.FC<TestDurationAnalysisProps> = ({ token }) => {
  const [data, setData] = useState<TestDurationData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opensearchHealth, setOpensearchHealth] = useState<{
    connected: boolean;
    indexExists: boolean;
    documentsCount: number;
    clusterHealth: string;
  } | null>(null);

  const fetchDurationData = useCallback(async () => {
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

      const response = await fetch('/api/analytics/test-duration', {
        headers,
      });
      if (!response.ok) {
        throw new Error(`OpenSearch API error: ${response.status}`);
      }

      const result: TestDurationResponse | ErrorResponse = await response.json();

      if (!result.success) {
        const errorResult = result as ErrorResponse;
        throw new Error(errorResult.error || 'Failed to fetch from OpenSearch');
      }

      const successResult = result as TestDurationResponse;
      setData(successResult.data);
      setOpensearchHealth(successResult.meta.opensearchHealth);
    } catch (err) {
      // Using proper error logging instead of console.error
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    if (token) {
      fetchDurationData();
    }
  }, [token, fetchDurationData]);

  if (loading) {
    return (
      <div className="bg-white p-6 rounded-lg shadow-md">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
            <p className="text-gray-600">Analyzing test durations from OpenSearch...</p>
            <p className="text-sm text-gray-400 mt-2">Processing performance data</p>
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
            onClick={fetchDurationData}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
          >
            Retry OpenSearch Query
          </button>
        </div>
      </div>
    );
  }

  const validData = Array.isArray(data) ? data : [];
  const totalTests = validData.reduce((sum, item) => sum + (item?.count || 0), 0);
  const avgDuration = validData.length > 0 ? validData[0]?.avgDuration || 0 : 0;
  const maxDuration = validData.length > 0 ? validData[0]?.maxDuration || 0 : 0;
  const minDuration = validData.length > 0 ? validData[0]?.minDuration || 0 : 0;

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

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
                Index: ctrf-reports | Performance Analysis | Documents:{' '}
                {opensearchHealth?.documentsCount || 0}
              </p>
            </div>
          </div>
          <button
            onClick={fetchDurationData}
            className="bg-blue-600 text-white px-3 py-1 text-sm rounded hover:bg-blue-700 transition-colors"
          >
            Refresh from OpenSearch
          </button>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="bg-white p-6 rounded-lg shadow-md text-center">
          <p className="text-gray-600">No test duration data found in OpenSearch.</p>
          <p className="text-sm text-gray-400 mt-2">
            Upload test reports with duration data to see performance analytics.
          </p>
        </div>
      ) : (
        <>
          {/* Performance Metrics Overview */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-bold mb-4 text-gray-800">
              ⚡ Performance Metrics (OpenSearch)
            </h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">{totalTests}</div>
                <div className="text-sm text-gray-600">Total Tests Analyzed</div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-700">
                  {formatDuration(avgDuration)}
                </div>
                <div className="text-sm text-gray-600">Average Duration</div>
              </div>
              <div className="text-center p-4 bg-yellow-50 rounded-lg">
                <div className="text-2xl font-bold text-yellow-700">
                  {formatDuration(maxDuration)}
                </div>
                <div className="text-sm text-gray-600">Slowest Test</div>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">
                  {formatDuration(minDuration)}
                </div>
                <div className="text-sm text-gray-600">Fastest Test</div>
              </div>
            </div>
          </div>

          {/* Duration Distribution Charts */}
          <div className="grid md:grid-cols-2 gap-6">
            {/* Bar Chart */}
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-xl font-bold mb-4 text-gray-800">
                📊 Duration Distribution (OpenSearch)
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={validData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis
                    dataKey="range"
                    tick={{ fontSize: 11 }}
                    angle={-45}
                    textAnchor="end"
                    height={80}
                  />
                  <YAxis
                    tick={{ fontSize: 12 }}
                    label={{ value: 'Test Count', angle: -90, position: 'insideLeft' }}
                  />
                  <Tooltip
                    formatter={value => [value, 'Tests']}
                    labelFormatter={label => `Duration: ${label}`}
                  />
                  <Bar dataKey="count" fill="#3b82f6" />
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Pie Chart */}
            <div className="bg-white p-6 rounded-lg shadow-md">
              <h3 className="text-xl font-bold mb-4 text-gray-800">
                🥧 Duration Breakdown (OpenSearch)
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={validData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ range, percent }) => `${range}: ${(percent * 100).toFixed(0)}%`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {validData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip formatter={value => [value, 'Tests']} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Detailed Duration Table */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-bold mb-4 text-gray-800">
              📋 Duration Analysis Details (OpenSearch Data)
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Duration Range
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Test Count
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Percentage
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Performance Category
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.map((item, index) => {
                    const percentage = totalTests > 0 ? (item.count / totalTests) * 100 : 0;
                    const getPerformanceCategory = (range: string) => {
                      if (range.includes('0-1s'))
                        return { label: 'Excellent', color: 'bg-green-100 text-green-800' };
                      if (range.includes('1-5s'))
                        return { label: 'Good', color: 'bg-blue-100 text-blue-800' };
                      if (range.includes('5-10s'))
                        return { label: 'Moderate', color: 'bg-yellow-100 text-yellow-800' };
                      if (range.includes('10-30s'))
                        return { label: 'Slow', color: 'bg-orange-100 text-orange-800' };
                      return { label: 'Very Slow', color: 'bg-red-100 text-red-800' };
                    };

                    const category = getPerformanceCategory(item.range);

                    return (
                      <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {item.range}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {item.count}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {percentage.toFixed(1)}%
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${category.color}`}
                          >
                            {category.label}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>

          {/* Performance Insights */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-bold mb-4 text-gray-800">
              💡 Performance Insights (OpenSearch Analysis)
            </h3>
            <div className="grid md:grid-cols-3 gap-4">
              <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                <h4 className="font-semibold text-green-800 mb-2">Fast Tests (&lt; 5s)</h4>
                <p className="text-2xl font-bold text-green-700">
                  {validData
                    .filter(d => d?.range?.includes('0-1s') || d?.range?.includes('1-5s'))
                    .reduce((sum, d) => sum + (d?.count || 0), 0)}
                </p>
                <p className="text-sm text-green-700">
                  {totalTests > 0
                    ? (
                        (validData
                          .filter(d => d?.range?.includes('0-1s') || d?.range?.includes('1-5s'))
                          .reduce((sum, d) => sum + (d?.count || 0), 0) /
                          totalTests) *
                        100
                      ).toFixed(1)
                    : '0.0'}
                  % of total
                </p>
              </div>

              <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                <h4 className="font-semibold text-yellow-800 mb-2">Moderate Tests (5-30s)</h4>
                <p className="text-2xl font-bold text-yellow-700">
                  {validData
                    .filter(d => d?.range?.includes('5-10s') || d?.range?.includes('10-30s'))
                    .reduce((sum, d) => sum + (d?.count || 0), 0)}
                </p>
                <p className="text-sm text-yellow-700">
                  {totalTests > 0
                    ? (
                        (validData
                          .filter(d => d?.range?.includes('5-10s') || d?.range?.includes('10-30s'))
                          .reduce((sum, d) => sum + (d?.count || 0), 0) /
                          totalTests) *
                        100
                      ).toFixed(1)
                    : '0.0'}
                  % of total
                </p>
              </div>

              <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                <h4 className="font-semibold text-red-800 mb-2">Slow Tests (&gt; 30s)</h4>
                <p className="text-2xl font-bold text-red-600">
                  {data.filter(d => d.range.includes('30s+')).reduce((sum, d) => sum + d.count, 0)}
                </p>
                <p className="text-sm text-red-700">
                  {(
                    (data
                      .filter(d => d.range.includes('30s+'))
                      .reduce((sum, d) => sum + d.count, 0) /
                      totalTests) *
                    100
                  ).toFixed(1)}
                  % of total
                </p>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default TestDurationAnalysis;
