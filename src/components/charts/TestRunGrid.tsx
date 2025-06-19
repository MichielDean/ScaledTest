import React from 'react';
import { TestRunData } from '../../types/dashboard';
import styles from '../../styles/charts/TestRunGrid.module.css';

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
    <div className={styles.container}>
      <div className={styles.header}>
        <h4 className={styles.testName} title={testName}>
          {testName}
        </h4>
        <div className={styles.runCount}>
          {sortedRuns.length} run{sortedRuns.length !== 1 ? 's' : ''}
          {testRuns.length > maxRuns && ` (showing latest ${maxRuns})`}
        </div>
      </div>

      <div
        className={styles.grid}
        style={{
          gridTemplateColumns: `repeat(${Math.min(8, gridCols)}, 1fr)`,
          maxWidth: `${Math.min(8, gridCols) * 22}px`,
        }}
      >
        {sortedRuns.map((run, index) => {
          const statusClass =
            run.status === 'passed'
              ? styles.statusPassed
              : run.status === 'failed'
                ? styles.statusFailed
                : run.status === 'skipped'
                  ? styles.statusSkipped
                  : styles.statusUnknown;

          return (
            <div key={`${run.reportId}-${index}`} className={styles.gridItem}>
              <div
                className={`${styles.statusBox} ${statusClass}`}
                title={`Status: ${run.status}\nDate: ${formatDate(run.timestamp)}\nDuration: ${formatDuration(run.duration)}${run.message ? `\nError: ${run.message}` : ''}`}
              >
                {getStatusIcon(run.status)}
              </div>
            </div>
          );
        })}
      </div>

      <div className={styles.legend}>
        <div className={styles.legendItem}>
          <div className={`${styles.legendDot} ${styles.legendDotPassed}`}></div>
          <span>Pass</span>
        </div>
        <div className={styles.legendItem}>
          <div className={`${styles.legendDot} ${styles.legendDotFailed}`}></div>
          <span>Fail</span>
        </div>
        <div className={styles.legendItem}>
          <div className={`${styles.legendDot} ${styles.legendDotSkipped}`}></div>
          <span>Skip</span>
        </div>
      </div>

      {sortedRuns.some(run => run.status === 'failed' && run.message) && (
        <div className={styles.failuresSummary}>
          <h5 className={styles.failuresTitle}>Recent Failures:</h5>
          <div className={styles.failuresList}>
            {[
              ...new Set(
                sortedRuns
                  .filter(run => run.status === 'failed' && run.message)
                  .map(run => run.message)
                  .slice(0, 2)
              ),
            ].map((message, index) => (
              <div key={index} className={styles.failureMessage}>
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
