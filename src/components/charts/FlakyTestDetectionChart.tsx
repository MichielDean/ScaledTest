import React, { useState, useEffect, useCallback } from 'react';
import { FlakyTestWithRuns } from '../../types/dashboard';
import TestRunGrid from './TestRunGrid';
import {
  OpenSearchApiResponse,
  OpenSearchErrorApiResponse,
  OpenSearchHealth,
} from '../../types/opensearch';
import styles from '../../styles/Charts.module.css';
import flakyStyles from '../../styles/charts/FlakyTestDetectionChart.module.css';

interface FlakyTestDetectionProps {
  token?: string;
  teamIds?: string[];
}

// Use shared OpenSearchApiResponse with a specialized meta type for flaky tests
interface FlakyTestResponse extends OpenSearchApiResponse<FlakyTestWithRuns> {
  meta: {
    source: 'OpenSearch';
    index: 'ctrf-reports';
    timestamp: string;
    opensearchHealth: OpenSearchHealth;
  };
}

// Use the shared OpenSearchErrorApiResponse
type ErrorResponse = OpenSearchErrorApiResponse;

const FlakyTestDetectionChart: React.FC<FlakyTestDetectionProps> = ({ token, teamIds }) => {
  const [data, setData] = useState<FlakyTestWithRuns[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [opensearchHealth, setOpensearchHealth] = useState<OpenSearchHealth | null>(null);

  const fetchFlakyTestData = useCallback(async () => {
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

      // Build query parameters for team filtering
      let queryParams = '';
      if (teamIds && teamIds.length > 0) {
        const teamIdsQuery = teamIds.map(id => `teamIds=${encodeURIComponent(id)}`).join('&');
        queryParams = `?${teamIdsQuery}`;
      }

      const response = await fetch(`/api/analytics/flaky-test-runs${queryParams}`, {
        headers,
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`OpenSearch API error: ${response.status} - ${errorText}`);
      }

      const result: FlakyTestResponse | ErrorResponse = await response.json();

      if (!result.success) {
        const errorResult = result as ErrorResponse;
        throw new Error(errorResult.error || 'Failed to fetch from OpenSearch');
      }

      const successResult = result as FlakyTestResponse;
      setData(successResult.data || []);
      setOpensearchHealth(successResult.meta?.opensearchHealth);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
    } finally {
      setLoading(false);
    }
  }, [token, teamIds]);

  useEffect(() => {
    if (token) {
      fetchFlakyTestData();
    }
  }, [fetchFlakyTestData, token]);

  if (loading) {
    return (
      <div className={styles.card}>
        <div className={styles.loadingContent}>
          <div className={flakyStyles.textCenter}>
            <div className={styles.loadingSpinner}></div>
            <p className={styles.loadingText}>Loading flaky test analysis from OpenSearch...</p>
            <p className={styles.loadingSubtext}>Analyzing test patterns across all reports</p>
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
          <button onClick={fetchFlakyTestData} className={styles.retryButton}>
            Retry OpenSearch Query
          </button>
        </div>
      </div>
    );
  }

  // Filter only truly flaky tests
  const flakyTests = data.filter(test => test.isFlaky || test.flakyScore > 20);

  return (
    <div className={`${flakyStyles.chartContainer} ${styles.chartContainer}`}>
      <div className={styles.dataSourceIndicator}>
        <div className={flakyStyles.dataSourceHeader}>
          <div className={styles.dataSourceInfo}>
            <h4 className={styles.dataSourceTitle}>🔍 Data Source: OpenSearch</h4>
            <p className={styles.dataSourceDetails}>
              Index: ctrf-reports | Flaky Tests Found: {flakyTests.length} | Documents:{' '}
              {opensearchHealth?.documentsCount || 0}
            </p>
          </div>
          <button onClick={fetchFlakyTestData} className={styles.refreshButton}>
            Refresh
          </button>
        </div>
      </div>

      {flakyTests.length === 0 ? (
        <div className={`${styles.card} ${styles.noDataContainer}`}>
          <h3 className={styles.noDataTitle}>🎉 No Flaky Tests Detected!</h3>
          <p className={styles.noDataMessage}>
            All tests appear to be stable across multiple runs.
          </p>
          <p className={styles.noDataSubtext}>
            Tests are considered flaky if they have both passing and failing results across runs.
          </p>
          <button onClick={fetchFlakyTestData} className={styles.checkAgainButton}>
            Check Again
          </button>
        </div>
      ) : (
        <>
          <div className={`${styles.card} ${styles.chartContainer}`}>
            <h3 className={styles.chartTitle}>🔍 Flaky Test Execution Patterns</h3>
            <div className={flakyStyles.gridVisualizationDescription}>
              <p className={flakyStyles.gridDescriptionPrimary}>
                Each square represents a single test execution. Hover over squares to see details
                including failure messages.
              </p>
              <p className={flakyStyles.gridDescriptionSecondary}>
                Tests are considered flaky if they have both passing and failing results across
                runs.
              </p>
            </div>

            <div className={flakyStyles.flakyTestsGrid}>
              {flakyTests.slice(0, 10).map((test, index) => (
                <div key={`${test.testName}-${index}`} className={flakyStyles.flakyTestCard}>
                  <TestRunGrid testName={test.testName} testRuns={test.testRuns} maxRuns={50} />

                  <div className={flakyStyles.testStatistics}>
                    <div className={flakyStyles.statisticsGrid}>
                      <div className={flakyStyles.statItem}>
                        <div className={flakyStyles.statValue}>{test.totalRuns}</div>
                        <div className={flakyStyles.statLabel}>Total</div>
                      </div>
                      <div className={flakyStyles.statItem}>
                        <div className={`${flakyStyles.statValue} ${flakyStyles.statValueFailed}`}>
                          {test.failed}
                        </div>
                        <div className={flakyStyles.statLabel}>Failed</div>
                      </div>
                      <div className={flakyStyles.statItem}>
                        <div
                          className={`${flakyStyles.statValue} ${flakyStyles.statValueFailureRate}`}
                        >
                          {test.flakyScore.toFixed(1)}%
                        </div>
                        <div className={flakyStyles.statLabel}>Failure Rate</div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {flakyTests.length > 10 && (
              <div className={flakyStyles.showingMore}>
                Showing top 10 flaky tests. Total flaky tests found: {flakyTests.length}
              </div>
            )}
          </div>

          <div className={styles.card}>
            <h3 className={styles.chartTitle}>📈 Flaky Test Summary</h3>
            <div className={flakyStyles.summaryGrid}>
              <div className={`${flakyStyles.summaryCard} ${flakyStyles.summaryCardTrulyFlaky}`}>
                <div
                  className={`${flakyStyles.summaryValue} ${flakyStyles.summaryValueTrulyFlaky}`}
                >
                  {flakyTests.filter(t => t.isFlaky).length}
                </div>
                <div className={flakyStyles.summaryLabel}>Truly Flaky Tests</div>
              </div>
              <div className={`${flakyStyles.summaryCard} ${flakyStyles.summaryCardHighFailure}`}>
                <div
                  className={`${flakyStyles.summaryValue} ${flakyStyles.summaryValueHighFailure}`}
                >
                  {flakyTests.filter(t => t.flakyScore > 50).length}
                </div>
                <div className={flakyStyles.summaryLabel}>High Failure Rate</div>
              </div>
              <div className={`${flakyStyles.summaryCard} ${flakyStyles.summaryCardTotalRuns}`}>
                <div className={`${flakyStyles.summaryValue} ${flakyStyles.summaryValueTotalRuns}`}>
                  {Array.isArray(flakyTests)
                    ? flakyTests.reduce((sum, t) => sum + (t?.totalRuns || 0), 0)
                    : 0}
                </div>
                <div className={flakyStyles.summaryLabel}>Total Test Runs</div>
              </div>
              <div className={`${flakyStyles.summaryCard} ${flakyStyles.summaryCardAvgDuration}`}>
                <div
                  className={`${flakyStyles.summaryValue} ${flakyStyles.summaryValueAvgDuration}`}
                >
                  {Array.isArray(flakyTests) && flakyTests.length > 0
                    ? Math.round(
                        flakyTests.reduce((sum, t) => sum + (t?.avgDuration || 0), 0) /
                          flakyTests.length
                      )
                    : 0}
                  ms
                </div>
                <div className={flakyStyles.summaryLabel}>Avg Duration</div>
              </div>
            </div>

            {flakyTests.length > 0 && (
              <div className={flakyStyles.investigationTips}>
                <h4 className={flakyStyles.investigationTitle}>💡 Investigation Tips</h4>
                <ul className={flakyStyles.investigationList}>
                  <li className={flakyStyles.investigationItem}>
                    • Look for patterns in the grid - clustered failures may indicate environmental
                    issues
                  </li>
                  <li className={flakyStyles.investigationItem}>
                    • Check failure messages for common error patterns or timing-related issues
                  </li>
                  <li className={flakyStyles.investigationItem}>
                    • Tests with alternating pass/fail patterns often have race conditions
                  </li>
                  <li className={flakyStyles.investigationItem}>
                    • Consider adding proper wait conditions or reducing external dependencies
                  </li>
                  {flakyTests.some(t => t.avgDuration > 5000) && (
                    <li className={flakyStyles.investigationItem}>
                      • Long-running tests are more prone to flakiness - consider optimization
                    </li>
                  )}
                </ul>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
};

export default FlakyTestDetectionChart;
