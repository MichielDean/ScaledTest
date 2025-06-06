import type { NextPage } from 'next';
import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useState, useCallback } from 'react';
import Header from '../components/Header';
import withAuth from '../auth/withAuth';
import { UserRole } from '../auth/keycloak';
import { useAuth } from '../auth/KeycloakProvider';

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
        const simplifiedReports = data.reports.map((report: ApiTestReport) => ({
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
    if (reports.length === 0) return { total: 0, passed: 0, failed: 0, skipped: 0, successRate: 0 };

    const totals = reports.reduce(
      (acc, report) => ({
        total: acc.total + report.summary.total,
        passed: acc.passed + report.summary.passed,
        failed: acc.failed + report.summary.failed,
        skipped: acc.skipped + report.summary.skipped,
      }),
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

      <main
        style={{
          padding: '2rem',
          maxWidth: '1000px',
          margin: '0 auto',
          fontFamily: 'system-ui, -apple-system, sans-serif',
        }}
      >
        {/* Header */}
        <div style={{ marginBottom: '2rem', textAlign: 'center' }}>
          <h1
            style={{
              fontSize: '2.5rem',
              color: '#2563eb',
              marginBottom: '0.5rem',
              fontWeight: '600',
            }}
          >
            🧪 Simple Test Dashboard
          </h1>
          <p
            style={{
              color: '#64748b',
              fontSize: '1.1rem',
              margin: 0,
            }}
          >
            Quick overview of your test execution results
          </p>
        </div>

        {loading && (
          <div
            style={{
              textAlign: 'center',
              padding: '3rem',
              color: '#64748b',
              fontSize: '1.1rem',
            }}
          >
            <div>⏳ Loading test data...</div>
          </div>
        )}

        {error && (
          <div
            style={{
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '8px',
              padding: '1rem',
              color: '#dc2626',
              textAlign: 'center',
              margin: '2rem 0',
            }}
          >
            <div style={{ fontWeight: '500' }}>❌ Error</div>
            <div>{error}</div>
            <button
              onClick={fetchReports}
              style={{
                background: '#dc2626',
                color: 'white',
                border: 'none',
                borderRadius: '4px',
                padding: '0.5rem 1rem',
                marginTop: '1rem',
                cursor: 'pointer',
              }}
            >
              Retry
            </button>
          </div>
        )}

        {!loading && !error && reports.length === 0 && (
          <div
            style={{
              textAlign: 'center',
              padding: '3rem',
              color: '#64748b',
              fontSize: '1.1rem',
            }}
          >
            <div>📊 No test reports found</div>
            <div style={{ fontSize: '0.9rem', marginTop: '0.5rem' }}>
              Submit your first test report to see data here
            </div>
          </div>
        )}

        {!loading && !error && reports.length > 0 && (
          <>
            {/* Overall Stats */}
            <div
              style={{
                background: 'white',
                borderRadius: '12px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                padding: '2rem',
                marginBottom: '2rem',
              }}
            >
              <h2
                style={{
                  margin: '0 0 1.5rem 0',
                  color: '#1e293b',
                  fontSize: '1.5rem',
                  fontWeight: '500',
                }}
              >
                📈 Overall Results
              </h2>

              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
                  gap: '1rem',
                }}
              >
                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      fontSize: '2.5rem',
                      fontWeight: '700',
                      color: '#1e293b',
                      marginBottom: '0.25rem',
                    }}
                  >
                    {overallStats.total}
                  </div>
                  <div style={{ color: '#64748b', fontSize: '0.9rem' }}>Total Tests</div>
                </div>

                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      fontSize: '2.5rem',
                      fontWeight: '700',
                      color: '#059669',
                      marginBottom: '0.25rem',
                    }}
                  >
                    {overallStats.passed}
                  </div>
                  <div style={{ color: '#64748b', fontSize: '0.9rem' }}>Passed</div>
                </div>

                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      fontSize: '2.5rem',
                      fontWeight: '700',
                      color: '#dc2626',
                      marginBottom: '0.25rem',
                    }}
                  >
                    {overallStats.failed}
                  </div>
                  <div style={{ color: '#64748b', fontSize: '0.9rem' }}>Failed</div>
                </div>

                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      fontSize: '2.5rem',
                      fontWeight: '700',
                      color: '#d97706',
                      marginBottom: '0.25rem',
                    }}
                  >
                    {overallStats.skipped}
                  </div>
                  <div style={{ color: '#64748b', fontSize: '0.9rem' }}>Skipped</div>
                </div>

                <div style={{ textAlign: 'center' }}>
                  <div
                    style={{
                      fontSize: '2.5rem',
                      fontWeight: '700',
                      color:
                        overallStats.successRate >= 80
                          ? '#059669'
                          : overallStats.successRate >= 60
                            ? '#d97706'
                            : '#dc2626',
                      marginBottom: '0.25rem',
                    }}
                  >
                    {overallStats.successRate}%
                  </div>
                  <div style={{ color: '#64748b', fontSize: '0.9rem' }}>Success Rate</div>
                </div>
              </div>
            </div>

            {/* Recent Reports */}
            <div
              style={{
                background: 'white',
                borderRadius: '12px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)',
                padding: '2rem',
              }}
            >
              <h2
                style={{
                  margin: '0 0 1.5rem 0',
                  color: '#1e293b',
                  fontSize: '1.5rem',
                  fontWeight: '500',
                }}
              >
                📋 Recent Test Reports
              </h2>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                {reports.slice(0, 10).map(report => (
                  <div
                    key={report._id}
                    style={{
                      background: '#f8fafc',
                      border: '1px solid #e2e8f0',
                      borderRadius: '8px',
                      padding: '1rem',
                      display: 'grid',
                      gridTemplateColumns: '1fr auto auto auto',
                      alignItems: 'center',
                      gap: '1rem',
                    }}
                  >
                    <div>
                      <div
                        style={{
                          fontWeight: '500',
                          color: '#1e293b',
                          marginBottom: '0.25rem',
                        }}
                      >
                        {report.tool} • {report.environment}
                      </div>
                      <div
                        style={{
                          fontSize: '0.85rem',
                          color: '#64748b',
                        }}
                      >
                        {formatDate(report.executedAt)}
                      </div>
                    </div>

                    <div style={{ textAlign: 'center' }}>
                      <div
                        style={{
                          fontSize: '1.25rem',
                          fontWeight: '600',
                          color: '#1e293b',
                        }}
                      >
                        {report.summary.total}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Total</div>
                    </div>

                    <div style={{ textAlign: 'center' }}>
                      <div
                        style={{
                          fontSize: '1.25rem',
                          fontWeight: '600',
                          color: report.summary.failed > 0 ? '#dc2626' : '#059669',
                        }}
                      >
                        {report.summary.passed}/{report.summary.total}
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Passed</div>
                    </div>

                    <div style={{ textAlign: 'center' }}>
                      <div
                        style={{
                          fontSize: '1.25rem',
                          fontWeight: '600',
                          color:
                            report.summary.successRate >= 80
                              ? '#059669'
                              : report.summary.successRate >= 60
                                ? '#d97706'
                                : '#dc2626',
                        }}
                      >
                        {report.summary.successRate}%
                      </div>
                      <div style={{ fontSize: '0.75rem', color: '#64748b' }}>Success</div>
                    </div>
                  </div>
                ))}
              </div>

              {reports.length > 10 && (
                <div
                  style={{
                    textAlign: 'center',
                    marginTop: '1.5rem',
                    paddingTop: '1rem',
                    borderTop: '1px solid #e2e8f0',
                  }}
                >
                  <div style={{ color: '#64748b', fontSize: '0.9rem' }}>
                    Showing 10 of {reports.length} reports
                  </div>
                  <Link
                    href="/test-results-dashboard"
                    style={{
                      color: '#2563eb',
                      textDecoration: 'none',
                      fontSize: '0.9rem',
                      fontWeight: '500',
                    }}
                  >
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
