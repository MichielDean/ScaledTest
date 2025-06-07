// Test Suite Overview Chart - Data sourced from OpenSearch
import React, { useState, useEffect } from 'react';
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import { TestSuiteOverviewData } from '../../types/dashboard';

interface TestSuiteOverviewProps {
  token?: string;
}

interface OpenSearchResponse {
  success: boolean;
  data: TestSuiteOverviewData[];
  meta: {
    source: 'OpenSearch';
    index: string;
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

const TestSuiteOverview: React.FC<TestSuiteOverviewProps> = ({ token }) => {
  const [data, setData] = useState<TestSuiteOverviewData[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opensearchHealth, setOpensearchHealth] = useState<any>(null);

  useEffect(() => {
    if (token) {
      fetchTestSuiteData();
    }
  }, [token]);
  const fetchTestSuiteData = async () => {
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

      const response = await fetch('/api/analytics/test-suite-overview', {
        headers,
      });
      if (!response.ok) {
        throw new Error(`OpenSearch API error: ${response.status}`);
      }

      const result: OpenSearchResponse | ErrorResponse = await response.json();

      if (!result.success) {
        const errorResult = result as ErrorResponse;
        throw new Error(errorResult.error || 'Failed to fetch from OpenSearch');
      }

      const successResult = result as OpenSearchResponse;
      setData(successResult.data);
      setOpensearchHealth(successResult.meta.opensearchHealth);
    } catch (err) {
      console.error('Failed to fetch test suite data from OpenSearch:', err);
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
            <p className="text-gray-600">Loading data from OpenSearch...</p>
            <p className="text-sm text-gray-400 mt-2">Querying ctrf-reports index</p>
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
            onClick={fetchTestSuiteData}
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition-colors"
          >
            Retry OpenSearch Query
          </button>
        </div>
      </div>
    );
  }

  // Prepare data for charts
  const statusData =
    data.length > 0
      ? [
          {
            name: 'Passed',
            value: data.reduce((sum, suite) => sum + suite.passed, 0),
            color: '#10b981',
          },
          {
            name: 'Failed',
            value: data.reduce((sum, suite) => sum + suite.failed, 0),
            color: '#ef4444',
          },
          {
            name: 'Skipped',
            value: data.reduce((sum, suite) => sum + suite.skipped, 0),
            color: '#f59e0b',
          },
        ].filter(item => item.value > 0)
      : [];

  const totalTests = data.reduce((sum, suite) => sum + suite.total, 0);
  const totalPassed = data.reduce((sum, suite) => sum + suite.passed, 0);

  const formatDuration = (ms: number): string => {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    return `${(ms / 1000).toFixed(1)}s`;
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
                Index: ctrf-reports | Documents: {opensearchHealth?.documentsCount || 0} | Status:{' '}
                {opensearchHealth?.connected ? '✅ Connected' : '❌ Disconnected'}
              </p>
            </div>
          </div>
          <button
            onClick={fetchTestSuiteData}
            className="bg-blue-600 text-white px-3 py-1 text-sm rounded hover:bg-blue-700 transition-colors"
          >
            Refresh from OpenSearch
          </button>
        </div>
      </div>

      {data.length === 0 ? (
        <div className="bg-white p-6 rounded-lg shadow-md text-center">
          <p className="text-gray-600">No test suite data found in OpenSearch index.</p>
          <p className="text-sm text-gray-400 mt-2">Upload test reports to see analytics.</p>
        </div>
      ) : (
        <>
          {/* Overall Status Distribution */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-bold mb-4 text-gray-800">
              📊 Test Suite Overview (OpenSearch)
            </h3>
            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <ResponsiveContainer width="100%" height={250}>
                  <PieChart>
                    <Pie
                      data={statusData}
                      cx="50%"
                      cy="50%"
                      outerRadius={80}
                      fill="#8884d8"
                      dataKey="value"
                    >
                      {statusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col justify-center space-y-3">
                <div className="text-center">
                  <div className="text-3xl font-bold text-gray-800">{totalTests}</div>
                  <div className="text-gray-600">Total Tests</div>
                </div>
                <div className="grid grid-cols-3 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-green-600">{totalPassed}</div>
                    <div className="text-sm text-gray-600">Passed</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-red-600">
                      {statusData.find(s => s.name === 'Failed')?.value || 0}
                    </div>
                    <div className="text-sm text-gray-600">Failed</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-yellow-600">
                      {statusData.find(s => s.name === 'Skipped')?.value || 0}
                    </div>
                    <div className="text-sm text-gray-600">Skipped</div>
                  </div>
                </div>
                <div className="text-center pt-2">
                  <div className="text-xl font-bold text-blue-600">
                    {totalTests > 0 ? Math.round((totalPassed / totalTests) * 100) : 0}%
                  </div>
                  <div className="text-sm text-gray-600">Overall Pass Rate</div>
                </div>
              </div>
            </div>
          </div>

          {/* Suite Performance Comparison */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-bold mb-4 text-gray-800">
              🏗️ Suite Performance (from OpenSearch)
            </h3>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 11 }}
                  angle={-45}
                  textAnchor="end"
                  height={100}
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
                  label={{ value: 'Avg Duration (ms)', angle: 90, position: 'insideRight' }}
                />
                <Tooltip />
                <Legend />
                <Bar yAxisId="left" dataKey="passed" stackId="tests" fill="#10b981" name="Passed" />
                <Bar yAxisId="left" dataKey="failed" stackId="tests" fill="#ef4444" name="Failed" />
                <Bar
                  yAxisId="left"
                  dataKey="skipped"
                  stackId="tests"
                  fill="#f59e0b"
                  name="Skipped"
                />
                <Bar yAxisId="right" dataKey="avgDuration" fill="#3b82f6" name="Avg Duration" />
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Suite Summary Table */}
          <div className="bg-white p-6 rounded-lg shadow-md">
            <h3 className="text-xl font-bold mb-4 text-gray-800">
              📋 Suite Summary (OpenSearch Data)
            </h3>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Suite
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Total
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Pass Rate
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Avg Duration
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Status Breakdown
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {data.map((suite, index) => {
                    const passRate = suite.total > 0 ? (suite.passed / suite.total) * 100 : 0;
                    return (
                      <tr key={index} className={index % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {suite.name}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {suite.total}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span
                            className={`px-2 py-1 rounded-full text-xs font-medium ${
                              passRate >= 90
                                ? 'bg-green-100 text-green-800'
                                : passRate >= 70
                                  ? 'bg-yellow-100 text-yellow-800'
                                  : 'bg-red-100 text-red-800'
                            }`}
                          >
                            {Math.round(passRate)}%
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {formatDuration(suite.avgDuration)}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <div className="flex space-x-1">
                            <span className="inline-flex px-2 py-1 text-xs font-medium bg-green-100 text-green-800 rounded">
                              {suite.passed}P
                            </span>
                            {suite.failed > 0 && (
                              <span className="inline-flex px-2 py-1 text-xs font-medium bg-red-100 text-red-800 rounded">
                                {suite.failed}F
                              </span>
                            )}
                            {suite.skipped > 0 && (
                              <span className="inline-flex px-2 py-1 text-xs font-medium bg-yellow-100 text-yellow-800 rounded">
                                {suite.skipped}S
                              </span>
                            )}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default TestSuiteOverview;
