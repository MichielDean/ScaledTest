import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import Header from '../components/Header';
import withAuth from '../auth/withAuth';
import { UserRole } from '../auth/keycloak';
import { useAuth } from '../auth/KeycloakProvider';
import styles from '../styles/SimpleTestDashboard.module.css';

// Simplified types for the basic dashboard
interface SimpleTestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  successRate: number;
}

interface SimpleTestReport {
  _id: string;
  tool: string;
  environment: string;
  summary: SimpleTestSummary;
  executedAt: string;
}

interface ApiTestReport {
  _id: string;
  storedAt: string;
  results?: {
    tool?: { name?: string };
    environment?: { name?: string };
    summary?: {
      tests?: number;
      passed?: number;
      failed?: number;
      skipped?: number;
      start?: string;
    };
  };
}

const SimpleTestDashboard: NextPage = () => {
  const [reports, setReports] = useState<SimpleTestReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const { token } = useAuth();

  // Fetch and simplify test reports
  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Include authentication header with the user's token
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };

      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }

      const response = await fetch('/api/test-reports?size=10', {
        headers,
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch reports: ${response.status}`);
      }

      const data = await response.json();

      if (data.success) {
        // Transform the reports into simplified format
        const simplifiedReports = data.data.map((report: ApiTestReport) => ({
          _id: report._id,
          tool: report.results?.tool?.name || 'Unknown',
          environment: report.results?.environment?.name || 'Unknown',
          summary: {
            total: report.results?.summary?.tests || 0,
            passed: report.results?.summary?.passed || 0,
            failed: report.results?.summary?.failed || 0,
            skipped: report.results?.summary?.skipped || 0,
            successRate:
              report.results?.summary?.tests && report.results.summary.tests > 0
                ? Math.round(
                    ((report.results.summary.passed || 0) / report.results.summary.tests) * 100
                  )
                : 0,
          },
          executedAt: report.results?.summary?.start || report.storedAt,
        }));

        setReports(simplifiedReports);
      } else {
        throw new Error('API returned unsuccessful response');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch test reports');
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [token]);
  useEffect(() => {
    // Only fetch reports when we have a token (user is authenticated)
    if (token) {
      fetchReports();
    }
  }, [token, fetchReports]);

  // Calculate overall statistics
  const calculateOverallStats = () => {
    const validReports = Array.isArray(reports) ? reports : [];
    if (validReports.length === 0)
      return { total: 0, passed: 0, failed: 0, skipped: 0, successRate: 0 };

    const totals = validReports.reduce(
      (acc, report) => {
        const summary = report?.summary || {};
        return {
          total: acc.total + (summary.total || 0),
          passed: acc.passed + (summary.passed || 0),
          failed: acc.failed + (summary.failed || 0),
          skipped: acc.skipped + (summary.skipped || 0),
        };
      },
      { total: 0, passed: 0, failed: 0, skipped: 0 }
    );

    return {
      ...totals,
      successRate: totals.total > 0 ? Math.round((totals.passed / totals.total) * 100) : 0,
    };
  };

  const overallStats = calculateOverallStats();

  const formatDate = (isoString: string): string => {
    return new Date(isoString).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  return (
    <div>
      <Head>
        <title>Simple Test Dashboard - ScaledTest</title>
      </Head>

      <Header />

      <main id="main-content" className={styles.mainContent}>
        {/* Header */}
        <div className={styles.header}>
          <h1 className={styles.title}>🧪 Simple Test Dashboard</h1>
          <p className={styles.subtitle}>Quick overview of your test execution results</p>
        </div>

        {loading && (
          <div className={styles.loading}>
            <div>⏳ Loading test data...</div>
          </div>
        )}

        {error && (
          <div className={styles.errorContainer}>
            <div className={styles.errorTitle}>❌ Error</div>
            <div>{error}</div>
            <button onClick={fetchReports} className={styles.retryButton}>
              Retry
            </button>
          </div>
        )}

        {!loading && !error && reports.length === 0 && (
          <div className={styles.noData}>
            <div>📊 No test reports found</div>
            <div className={styles.errorMessage}>
              Submit your first test report to see data here
            </div>
          </div>
        )}

        {!loading && !error && reports.length > 0 && (
          <>
            {/* Overall Stats */}
            <div className={styles.overview}>
              <h2 className={styles.overviewTitle}>📈 Overall Results</h2>

              <div className={styles.statsGrid}>
                <div className={`${styles.statCard} ${styles.statCardTotal}`}>
                  <div className={`${styles.statNumber} ${styles.statNumberTotal}`}>
                    {overallStats.total}
                  </div>
                  <div className={`${styles.statLabel} ${styles.statLabelTotal}`}>Total Tests</div>
                </div>

                <div className={`${styles.statCard} ${styles.statCardPassed}`}>
                  <div className={`${styles.statNumber} ${styles.statNumberPassed}`}>
                    {overallStats.passed}
                  </div>
                  <div className={`${styles.statLabel} ${styles.statLabelPassed}`}>Passed</div>
                </div>

                <div className={`${styles.statCard} ${styles.statCardFailed}`}>
                  <div className={`${styles.statNumber} ${styles.statNumberFailed}`}>
                    {overallStats.failed}
                  </div>
                  <div className={`${styles.statLabel} ${styles.statLabelFailed}`}>Failed</div>
                </div>

                <div className={`${styles.statCard} ${styles.statCardSkipped}`}>
                  <div className={`${styles.statNumber} ${styles.statNumberSkipped}`}>
                    {overallStats.skipped}
                  </div>
                  <div className={`${styles.statLabel} ${styles.statLabelSkipped}`}>Skipped</div>
                </div>

                <div className={`${styles.statCard} ${styles.statCardTotal}`}>
                  <div
                    className={`${styles.statNumber} ${
                      overallStats.successRate >= 80
                        ? styles.successRateGood
                        : overallStats.successRate >= 60
                          ? styles.successRateWarning
                          : styles.successRatePoor
                    }`}
                  >
                    {overallStats.successRate}%
                  </div>
                  <div className={`${styles.statLabel} ${styles.statLabelTotal}`}>Success Rate</div>
                </div>
              </div>
            </div>

            {/* Recent Reports */}
            <div className={styles.overview}>
              <h2 className={styles.overviewTitle}>📋 Recent Test Reports</h2>

              <div className={styles.reportsContainer}>
                {reports.slice(0, 10).map(report => (
                  <div key={report._id} className={styles.reportCard}>
                    <div className={styles.reportInfo}>
                      <div className={styles.reportTitle}>
                        {report.tool} • {report.environment}
                      </div>
                      <div className={styles.reportDate}>{formatDate(report.executedAt)}</div>
                    </div>

                    <div className={styles.reportStatItem}>
                      <div className={styles.reportStatNumber}>{report.summary.total}</div>
                      <div className={styles.reportStatLabel}>Total</div>
                    </div>

                    <div className={styles.reportStatItem}>
                      <div
                        className={
                          report.summary.failed > 0
                            ? styles.reportStatNumberDanger
                            : styles.reportStatNumberSuccess
                        }
                      >
                        {report.summary.passed}/{report.summary.total}
                      </div>
                      <div className={styles.reportStatLabel}>Passed</div>
                    </div>

                    <div className={styles.reportStatItem}>
                      <div
                        className={
                          report.summary.successRate >= 80
                            ? styles.reportStatNumberGood
                            : report.summary.successRate >= 60
                              ? styles.reportStatNumberWarning
                              : styles.reportStatNumberPoor
                        }
                      >
                        {report.summary.successRate}%
                      </div>
                      <div className={styles.reportStatLabel}>Success</div>
                    </div>
                  </div>
                ))}
              </div>

              {reports.length > 10 && (
                <div className={styles.viewAllSection}>
                  <div className={styles.viewAllText}>Showing 10 of {reports.length} reports</div>
                  <Link href="/test-results-dashboard" className={styles.viewAllLink}>
                    View all reports →
                  </Link>
                </div>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  );
};

// Protect the route - require MAINTAINER or OWNER role
export default withAuth(SimpleTestDashboard, {
  requiredRoles: [UserRole.MAINTAINER, UserRole.OWNER],
});
