import React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { TestReport } from '../../types/dashboard';

interface ErrorAnalysisProps {
  reports: TestReport[];
}

interface ErrorData {
  error: string;
  count: number;
  tests: string[];
  severity: 'critical' | 'high' | 'medium' | 'low';
}

const ErrorAnalysis: React.FC<ErrorAnalysisProps> = ({ reports }) => {
  // Extract and categorize error messages from failed tests
  const errorMap = new Map<string, { count: number; tests: Set<string> }>();

  reports.forEach(report => {
    report.results.tests.forEach(test => {
      if (test.status === 'failed' && test.message) {
        // Normalize error message to find patterns
        const normalizedError = normalizeErrorMessage(test.message);
        const testKey = `${test.suite || 'Unknown'} - ${test.name}`;

        if (!errorMap.has(normalizedError)) {
          errorMap.set(normalizedError, { count: 0, tests: new Set() });
        }

        const errorData = errorMap.get(normalizedError)!;
        errorData.count += 1;
        errorData.tests.add(testKey);
      }
    });
  });

  // Convert to array and sort by frequency
  const errorPatterns: ErrorData[] = [];
  errorMap.forEach(({ count, tests }, error) => {
    const severity = getSeverity(count, tests.size);
    errorPatterns.push({
      error: truncateError(error),
      count,
      tests: Array.from(tests),
      severity,
    });
  });

  errorPatterns.sort((a, b) => b.count - a.count);
  const topErrors = errorPatterns.slice(0, 10);

  // Common error categories
  const errorCategories = categorizeErrors(errorPatterns);

  function normalizeErrorMessage(message: string): string {
    // Remove specific values, file paths, line numbers to find patterns
    return message
      .replace(/\d+/g, 'N') // Replace numbers with N
      .replace(/\/[^\s]+/g, '/PATH') // Replace file paths
      .replace(/line \d+/gi, 'line N') // Replace line numbers
      .replace(/at .+/g, 'at LOCATION') // Replace stack trace locations
      .toLowerCase()
      .trim();
  }

  function truncateError(error: string): string {
    if (error.length > 50) {
      return error.substring(0, 50) + '...';
    }
    return error;
  }

  function getSeverity(count: number, uniqueTests: number): 'critical' | 'high' | 'medium' | 'low' {
    if (count >= 10 || uniqueTests >= 5) return 'critical';
    if (count >= 5 || uniqueTests >= 3) return 'high';
    if (count >= 3 || uniqueTests >= 2) return 'medium';
    return 'low';
  }

  function categorizeErrors(errors: ErrorData[]): { [category: string]: number } {
    const categories: { [key: string]: number } = {
      Timeout: 0,
      Assertion: 0,
      Network: 0,
      Authentication: 0,
      Database: 0,
      'Element Not Found': 0,
      Permission: 0,
      Other: 0,
    };

    errors.forEach(error => {
      const msg = error.error.toLowerCase();
      if (msg.includes('timeout') || msg.includes('timed out')) {
        categories['Timeout'] += error.count;
      } else if (msg.includes('assert') || msg.includes('expect')) {
        categories['Assertion'] += error.count;
      } else if (msg.includes('network') || msg.includes('connection') || msg.includes('fetch')) {
        categories['Network'] += error.count;
      } else if (msg.includes('auth') || msg.includes('login') || msg.includes('token')) {
        categories['Authentication'] += error.count;
      } else if (msg.includes('database') || msg.includes('sql') || msg.includes('query')) {
        categories['Database'] += error.count;
      } else if (msg.includes('element') || msg.includes('not found') || msg.includes('selector')) {
        categories['Element Not Found'] += error.count;
      } else if (
        msg.includes('permission') ||
        msg.includes('forbidden') ||
        msg.includes('access')
      ) {
        categories['Permission'] += error.count;
      } else {
        categories['Other'] += error.count;
      }
    });

    return categories;
  }

  const getBarColor = (severity: string): string => {
    switch (severity) {
      case 'critical':
        return '#dc2626';
      case 'high':
        return '#ea580c';
      case 'medium':
        return '#ca8a04';
      case 'low':
        return '#65a30d';
      default:
        return '#6b7280';
    }
  };

  // Prepare category data for chart
  const categoryData = Object.entries(errorCategories)
    .filter(([, count]) => count > 0)
    .map(([category, count]) => ({ category, count }))
    .sort((a, b) => b.count - a.count);

  return (
    <div className="space-y-6">
      {/* OpenSearch Data Source Indicator */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex items-start space-x-3">
        <div className="flex-shrink-0">
          <svg
            className="w-6 h-6 text-blue-600"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-blue-900">Data Source: OpenSearch</h4>
          <p className="text-sm text-blue-700">
            Analyzing error patterns from test report data stored in OpenSearch
          </p>
        </div>
      </div>

      {/* Error Pattern Analysis */}
      <div className="bg-white p-6 rounded-lg shadow-md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-xl font-bold text-gray-800">🔍 Common Error Patterns</h3>
          <div className="text-sm text-gray-600">
            <span className="inline-block w-3 h-3 bg-red-600 rounded mr-1"></span>
            Critical
            <span className="inline-block w-3 h-3 bg-orange-600 rounded mr-1 ml-2"></span>
            High
            <span className="inline-block w-3 h-3 bg-yellow-600 rounded mr-1 ml-2"></span>
            Medium
            <span className="inline-block w-3 h-3 bg-green-600 rounded mr-1 ml-2"></span>
            Low
          </div>
        </div>

        {topErrors.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <p>🎉 No error patterns detected!</p>
            <p className="text-sm">All tests are passing or errors are unique.</p>
          </div>
        ) : (
          <>
            <ResponsiveContainer width="100%" height={400}>
              <BarChart data={topErrors} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis
                  dataKey="error"
                  tick={{ fontSize: 11 }}
                  angle={-45}
                  textAnchor="end"
                  height={100}
                />
                <YAxis
                  tick={{ fontSize: 12 }}
                  label={{ value: 'Occurrence Count', angle: -90, position: 'insideLeft' }}
                />
                <Tooltip
                  labelFormatter={label => `Error: ${label}`}
                  formatter={value => [value, 'Error Count']}
                />
                <Bar dataKey="count" name="Error Count">
                  {topErrors.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getBarColor(entry.severity)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>

            <div className="mt-4 text-sm text-gray-600">
              <p>
                <strong>Error Analysis Insights:</strong>
              </p>
              <p>• Critical errors (red) affect multiple tests and should be prioritized</p>
              <p>• Look for patterns that might indicate infrastructure or environment issues</p>
              <p>• Similar error messages suggest common root causes</p>
            </div>
          </>
        )}
      </div>

      {/* Error Categories */}
      {categoryData.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-xl font-bold mb-4 text-gray-800">📊 Error Categories</h3>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={categoryData} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis
                dataKey="category"
                tick={{ fontSize: 12 }}
                angle={-45}
                textAnchor="end"
                height={80}
              />
              <YAxis
                tick={{ fontSize: 12 }}
                label={{ value: 'Total Errors', angle: -90, position: 'insideLeft' }}
              />
              <Tooltip
                formatter={value => [value, 'Error Count']}
                labelFormatter={label => `Category: ${label}`}
              />
              <Bar dataKey="count" fill="#8884d8" />
            </BarChart>
          </ResponsiveContainer>

          <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-4">
            {categoryData.slice(0, 4).map((category, index) => (
              <div key={index} className="text-center p-3 bg-gray-50 rounded">
                <div className="text-2xl font-bold text-gray-800">{category.count}</div>
                <div className="text-sm text-gray-600">{category.category}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Detailed Error List */}
      {topErrors.length > 0 && (
        <div className="bg-white p-6 rounded-lg shadow-md">
          <h3 className="text-xl font-bold mb-4 text-gray-800">📝 Error Details</h3>
          <div className="space-y-3">
            {topErrors.slice(0, 5).map((error, index) => (
              <div key={index} className="border-l-4 border-gray-200 pl-4">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="font-mono text-sm bg-gray-100 p-2 rounded mb-2">
                      {error.error}
                    </div>
                    <div className="text-sm text-gray-600">
                      <span className="font-medium">Occurrences:</span> {error.count} |
                      <span className="font-medium"> Affected Tests:</span> {error.tests.length} |
                      <span
                        className={`font-medium ml-1 capitalize ${
                          error.severity === 'critical'
                            ? 'text-red-600'
                            : error.severity === 'high'
                              ? 'text-orange-600'
                              : error.severity === 'medium'
                                ? 'text-yellow-700'
                                : 'text-green-700'
                        }`}
                      >
                        {error.severity}
                      </span>
                    </div>
                  </div>
                  <div
                    className={`px-3 py-1 rounded-full text-xs font-medium ${
                      error.severity === 'critical'
                        ? 'bg-red-100 text-red-800'
                        : error.severity === 'high'
                          ? 'bg-orange-100 text-orange-800'
                          : error.severity === 'medium'
                            ? 'bg-yellow-100 text-yellow-800'
                            : 'bg-green-100 text-green-800'
                    }`}
                  >
                    {error.count}x
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default ErrorAnalysis;
