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
import { TestReport, FlakyTestData } from '../../types/dashboard';

interface FlakyTestDetectorProps {
  reports: TestReport[];
}

const FlakyTestDetector: React.FC<FlakyTestDetectorProps> = ({ reports }) => {
  // Analyze test patterns across multiple reports to identify flaky tests
  const testHistory = new Map<string, { passes: number; failures: number; durations: number[] }>();

  reports.forEach(report => {
    report.results.tests.forEach(test => {
      const key = `${test.suite || 'Unknown'} - ${test.name}`;
      if (!testHistory.has(key)) {
        testHistory.set(key, { passes: 0, failures: 0, durations: [] });
      }

      const history = testHistory.get(key)!;
      if (test.status === 'passed') {
        history.passes += 1;
      } else if (test.status === 'failed') {
        history.failures += 1;
      }
      history.durations.push(test.duration);
    });
  });

  const flakyTests: FlakyTestData[] = [];
  testHistory.forEach((history, testKey) => {
    const totalRuns = history.passes + history.failures;
    if (totalRuns >= 3) {
      // Only consider tests that have run at least 3 times
      const flakyScore = Math.round((history.failures / totalRuns) * 100);
      const avgDuration =
        history.durations.reduce((sum, d) => sum + d, 0) / history.durations.length;

      // Consider a test flaky if it fails between 10% and 90% of the time
      const isFlaky = flakyScore > 10 && flakyScore < 90;

      if (isFlaky || flakyScore > 0) {
        const [suite, testName] = testKey.split(' - ');
        flakyTests.push({
          testName: testName.length > 30 ? testName.substring(0, 30) + '...' : testName,
          suite,
          totalRuns,
          passed: history.passes,
          failed: history.failures,
          failures: history.failures, // Alias for backward compatibility
          skipped: 0, // Not tracked in this analysis
          flakyScore,
          avgDuration: Math.round(avgDuration),
          isMarkedFlaky: false, // Not available in this context
          isFlaky,
        });
      }
    }
  });

  // Sort by flaky score descending, then by total runs
  flakyTests.sort((a, b) => {
    if (a.isFlaky && !b.isFlaky) return -1;
    if (!a.isFlaky && b.isFlaky) return 1;
    return b.flakyScore - a.flakyScore;
  });

  const topFlakyTests = flakyTests.slice(0, 10);

  const CustomTooltip = ({
    active,
    payload,
  }: {
    active?: boolean;
    payload?: Array<{ payload: FlakyTestData }>;
  }) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white p-4 border border-gray-300 rounded shadow-lg max-w-xs">
          <p className="font-semibold text-sm">{`${data.suite}`}</p>
          <p className="text-sm">{`Test: ${data.testName}`}</p>
          <p className="text-red-600 font-medium">{`Failure Rate: ${data.flakyScore}%`}</p>
          <p className="text-blue-600">{`Total Runs: ${data.totalRuns}`}</p>
          <p className="text-orange-600">{`Failures: ${data.failures}`}</p>
          <p className="text-purple-600">{`Avg Duration: ${data.avgDuration}ms`}</p>
          {data.isFlaky && <p className="text-red-700 font-bold">🚨 FLAKY TEST</p>}
        </div>
      );
    }
    return null;
  };

  const getBarColor = (flakyScore: number, isFlaky: boolean): string => {
    if (isFlaky) return '#ef4444'; // red for flaky
    if (flakyScore > 50) return '#f97316'; // orange for high failure rate
    if (flakyScore > 20) return '#eab308'; // yellow for medium failure rate
    return '#6b7280'; // gray for low failure rate
  };

  return (
    <div className="bg-white p-6 rounded-lg shadow-md">
      {/* OpenSearch Data Source Indicator */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
        <div className="flex items-center">
          <div className="flex-shrink-0">
            <svg className="h-4 w-4 text-blue-400" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M3 3a1 1 0 000 2v8a2 2 0 002 2h2.586l-1.293 1.293a1 1 0 101.414 1.414L10 15.414l2.293 2.293a1 1 0 001.414-1.414L12.414 15H15a2 2 0 002-2V5a1 1 0 100-2H3zm11.707 4.707a1 1 0 00-1.414-1.414L10 9.586 8.707 8.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
          </div>
          <div className="ml-2">
            <h4 className="text-xs font-medium text-blue-800">Data Source: OpenSearch</h4>
            <p className="text-xs text-blue-600">
              Analyzing patterns from test report data stored in OpenSearch
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between mb-4">
        <h3 className="text-xl font-bold text-gray-800">🔍 Flaky Test Detection</h3>
        <div className="text-sm text-gray-600">
          <span className="inline-block w-3 h-3 bg-red-500 rounded mr-1"></span>
          Flaky (10-90% failure)
          <span className="inline-block w-3 h-3 bg-orange-500 rounded mr-1 ml-3"></span>
          High Failure (&gt;50%)
        </div>
      </div>

      {topFlakyTests.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          <p>🎉 No flaky tests detected!</p>
          <p className="text-sm">Need at least 3 runs per test to detect patterns.</p>
        </div>
      ) : (
        <ResponsiveContainer width="100%" height={400}>
          <BarChart data={topFlakyTests} margin={{ top: 20, right: 30, left: 20, bottom: 80 }}>
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis
              dataKey="testName"
              tick={{ fontSize: 11 }}
              angle={-45}
              textAnchor="end"
              height={100}
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fontSize: 12 }}
              label={{ value: 'Failure Rate (%)', angle: -90, position: 'insideLeft' }}
            />
            <Tooltip content={<CustomTooltip />} />
            <Bar dataKey="flakyScore" name="Failure Rate %">
              {topFlakyTests.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={getBarColor(entry.flakyScore, entry.isFlaky)} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      )}

      {topFlakyTests.length > 0 && (
        <div className="mt-4 text-sm text-gray-600">
          <p>
            <strong>{topFlakyTests.filter(t => t.isFlaky).length}</strong> flaky tests detected
          </p>
          <p>
            Flaky tests fail inconsistently and should be investigated for timing issues, race
            conditions, or environmental dependencies.
          </p>
        </div>
      )}
    </div>
  );
};

export default FlakyTestDetector;
