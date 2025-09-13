import React from 'react';
import { TestRunData } from '../../types/dashboard';
// Replaced CSS module with Tailwind utility classes

interface TestRunGridProps {
  testRuns: TestRunData[];
  testName: string;
  maxRuns?: number;
}

const TestRunGrid: React.FC<TestRunGridProps> = ({ testRuns, testName, maxRuns = 50 }) => {
  // Ensure testRuns is an array before processing
  const runsArray = Array.isArray(testRuns) ? testRuns : [];

  // Sort runs by timestamp (newest first)
  const sortedRuns = [...runsArray]
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
    .slice(0, maxRuns);

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'passed':
        return '✓';
      case 'failed':
        return '✗';
      case 'skipped':
        return '⏸';
      default:
        return '?';
    }
  };

  const formatDate = (timestamp: string) => {
    return new Date(timestamp).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const formatDuration = (duration: number) => {
    if (duration < 1000) return `${duration}ms`;
    return `${(duration / 1000).toFixed(1)}s`;
  };

  // Calculate grid dimensions
  const gridCols = Math.min(10, Math.ceil(Math.sqrt(sortedRuns.length)));

  return (
    <div className="p-3 bg-white rounded-md shadow-sm">
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-semibold text-gray-900 truncate" title={testName}>
          {testName}
        </h4>
        <div className="text-xs text-gray-500">
          {sortedRuns.length} run{sortedRuns.length !== 1 ? 's' : ''}
          {testRuns.length > maxRuns && ` (showing latest ${maxRuns})`}
        </div>
      </div>

      <div
        className="grid gap-1 mb-3"
        style={{
          gridTemplateColumns: `repeat(${Math.min(8, gridCols)}, 1fr)`,
          maxWidth: `${Math.min(8, gridCols) * 22}px`,
        }}
      >
        {sortedRuns.map((run, index) => {
          const statusBg =
            run.status === 'passed'
              ? 'bg-emerald-400 text-white'
              : run.status === 'failed'
                ? 'bg-red-400 text-white'
                : run.status === 'skipped'
                  ? 'bg-yellow-300 text-white'
                  : 'bg-gray-300 text-gray-800';

          return (
            <div key={`${run.reportId}-${index}`} className="flex items-center justify-center">
              <div
                className={`${statusBg} w-5 h-5 flex items-center justify-center rounded-sm text-xs font-bold`}
                title={`Status: ${run.status}\nDate: ${formatDate(run.timestamp)}\nDuration: ${formatDuration(run.duration)}${run.message ? `\nError: ${run.message}` : ''}`}
              >
                {getStatusIcon(run.status)}
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex items-center gap-3 text-xs text-gray-600 mb-2">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-emerald-400" />
          <span>Pass</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-red-400" />
          <span>Fail</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 rounded-full bg-yellow-300" />
          <span>Skip</span>
        </div>
      </div>

      {sortedRuns.some(run => run.status === 'failed' && run.message) && (
        <div className="mt-2">
          <h5 className="text-sm font-medium mb-1">Recent Failures:</h5>
          <div className="space-y-1 text-xs text-gray-700">
            {[
              ...new Set(
                sortedRuns
                  .filter(run => run.status === 'failed' && run.message)
                  .map(run => run.message)
                  .slice(0, 2)
              ),
            ].map((message, index) => (
              <div key={index} className="truncate">
                {message!.length > 80 ? `${message!.substring(0, 80)}...` : message}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default TestRunGrid;
