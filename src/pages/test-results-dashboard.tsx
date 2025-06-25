import type { NextPage } from 'next';
import Head from 'next/head';
import { useEffect, useState, useCallback } from 'react';
import Header from '../components/Header';
import withAuth from '../auth/withAuth';
import { UserRole } from '../auth/keycloak';
import { useAuth } from '../auth/KeycloakProvider';
import { TestReport, TestReportsResponse, DashboardFilters } from '../types/dashboard';
import styles from '../styles/TestResultsDashboard.module.css';

const TestResultsDashboard: NextPage = () => {
  const { token } = useAuth();
  const [reports, setReports] = useState<TestReport[]>([]);
  const [totalReports, setTotalReports] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<TestReport | null>(null);

  const [filters, setFilters] = useState<DashboardFilters>({
    status: '',
    tool: '',
    environment: '',
    page: 1,
    size: 10,
  });

  // Fetch test reports from API
  const fetchReports = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const queryParams = new URLSearchParams();
      queryParams.append('page', filters.page.toString());
      queryParams.append('size', filters.size.toString());

      if (filters.status) queryParams.append('status', filters.status);
      if (filters.tool) queryParams.append('tool', filters.tool);
      if (filters.environment) queryParams.append('environment', filters.environment);

      const response = await fetch(`/api/test-reports?${queryParams.toString()}`, {
        headers: {
          'Content-Type': 'application/json',
          ...(token && { Authorization: `Bearer ${token}` }),
        },
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const data: TestReportsResponse = await response.json();

      if (data.success) {
        setReports(data.data);
        setTotalReports(data.total);
      } else {
        throw new Error('API returned unsuccessful response');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch test reports');
      setReports([]);
      setTotalReports(0);
    } finally {
      setLoading(false);
    }
  }, [filters, token]);
  // Load reports on component mount and when filters change
  useEffect(() => {
    if (token) {
      fetchReports();
    }
  }, [filters, token, fetchReports]);

  // Calculate aggregate statistics from all visible reports
  const calculateSummaryStats = () => {
    const totals = reports.reduce(
      (acc, report) => ({
        tests: acc.tests + report.results.summary.tests,
        passed: acc.passed + report.results.summary.passed,
        failed: acc.failed + report.results.summary.failed,
        skipped: acc.skipped + report.results.summary.skipped,
        pending: acc.pending + report.results.summary.pending,
        other: acc.other + report.results.summary.other,
      }),
      { tests: 0, passed: 0, failed: 0, skipped: 0, pending: 0, other: 0 }
    );

    return totals;
  };

  const summaryStats = calculateSummaryStats();
  // Handle filter changes
  const handleFilterChange = (key: keyof DashboardFilters, value: string | number) => {
    setFilters(prev => ({
      ...prev,
      [key]: value,
      page: key !== 'page' ? 1 : (value as number), // Reset to page 1 when other filters change, cast page value to number
    }));
  };

  // Format duration from milliseconds to readable format
  const formatDuration = (milliseconds: number): string => {
    if (milliseconds < 1000) return `${milliseconds}ms`;
    const seconds = milliseconds / 1000;
    if (seconds < 60) return `${seconds.toFixed(1)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes}m ${remainingSeconds.toFixed(1)}s`;
  };

  // Format timestamp to readable date
  const formatDate = (isoString: string): string => {
    return new Date(isoString).toLocaleString();
  };

  // Calculate success rate percentage
  const getSuccessRate = (summary: { tests: number; passed: number }): number => {
    if (summary.tests === 0) return 0;
    return Math.round((summary.passed / summary.tests) * 100);
  };

  return (
    <div>
      <Head>
        <title>Test Results Dashboard - ScaledTest</title>
      </Head>
      <Header />

      <main role="main" id="main-content" className={styles.mainContent}>
        <div className={styles.header}>
          <h1 id="test-results-title" className={styles.title}>
            🧪 Test Results Dashboard
          </h1>
          <p className={styles.subtitle}>Monitor and analyze your CTRF test execution results</p>
        </div>
        {/* Summary Statistics */}
        <div className="card">
          <h2 className={styles.overviewTitle}>📊 Overview</h2>
          <div className="test-stats-grid">
            <div className={`test-stat-card ${styles.statCardGray}`}>
              <div className={`test-stat-number ${styles.statNumberGray}`}>
                {summaryStats.tests}
              </div>
              <div className={`test-stat-label ${styles.statLabelGray}`}>Total Tests</div>
            </div>
            <div className={`test-stat-card ${styles.statCardGreen}`}>
              <div className={`test-stat-number ${styles.statNumberGreen}`}>
                {summaryStats.passed}
              </div>
              <div className={`test-stat-label ${styles.statLabelGreen}`}>Passed</div>
            </div>
            <div className={`test-stat-card ${styles.statCardRed}`}>
              <div className={`test-stat-number ${styles.statNumberRed}`}>
                {summaryStats.failed}
              </div>
              <div className={`test-stat-label ${styles.statLabelRed}`}>Failed</div>
            </div>
            <div className={`test-stat-card ${styles.statCardYellow}`}>
              <div className={`test-stat-number ${styles.statNumberYellow}`}>
                {summaryStats.skipped}
              </div>
              <div className={`test-stat-label ${styles.statLabelYellow}`}>Skipped</div>
            </div>
            <div className={`test-stat-card ${styles.statCardBlue}`}>
              <div className={`test-stat-number ${styles.statNumberBlue}`}>{reports.length}</div>
              <div className={`test-stat-label ${styles.statLabelBlue}`}>Reports</div>
            </div>
          </div>
        </div>{' '}
        {/* Filters */}
        <div className="card test-filters">
          <h3 className={styles.filtersTitle}>🔍 Filters</h3>
          <div className={styles.filtersGrid}>
            <div>
              <label className={styles.filterLabel}>Status:</label>
              <select
                value={filters.status}
                onChange={e => handleFilterChange('status', e.target.value)}
                className={styles.filterInput}
              >
                <option value="">All Statuses</option>
                <option value="passed">Passed</option>
                <option value="failed">Failed</option>
                <option value="skipped">Skipped</option>
                <option value="pending">Pending</option>
              </select>
            </div>
            <div>
              <label className={styles.filterLabel}>Tool:</label>
              <input
                type="text"
                value={filters.tool}
                onChange={e => handleFilterChange('tool', e.target.value)}
                placeholder="e.g., Jest, Cypress, Playwright"
                className={styles.filterInput}
              />
            </div>
            <div>
              <label className={styles.filterLabel}>Environment:</label>
              <input
                type="text"
                value={filters.environment}
                onChange={e => handleFilterChange('environment', e.target.value)}
                placeholder="e.g., staging, production"
                className={styles.filterInput}
              />
            </div>
            <div>
              <label className={styles.filterLabel}>Per Page:</label>
              <select
                value={filters.size}
                onChange={e => handleFilterChange('size', parseInt(e.target.value))}
                className={styles.filterInput}
              >
                <option value={5}>5</option>
                <option value={10}>10</option>
                <option value={20}>20</option>
                <option value={50}>50</option>
              </select>
            </div>
          </div>
        </div>{' '}
        {/* Loading and Error States */}
        {loading && (
          <div
            id="loading-indicator"
            className={`card ${styles.loadingContainer}`}
            role="status"
            aria-live="polite"
          >
            <div className="loading-spinner"></div>
            <div className={styles.loadingText}>Loading test reports...</div>
            <div className={styles.loadingSubtext}>Please wait while we fetch the latest data</div>
          </div>
        )}
        {error && (
          <div className="error-card" role="alert" aria-live="assertive">
            <h2 className={styles.errorTitle}>❌ Error loading test reports</h2>
            <p className={styles.errorText}>{error}</p>
            <button
              onClick={fetchReports}
              className="refresh-button"
              aria-label="Retry loading test reports"
            >
              🔄 Try Again
            </button>
          </div>
        )}
        {/* Statistics Overview */}
        {!loading && !error && (
          <section id="charts-container" aria-labelledby="overview-heading">
            <div className="card">
              <h2 id="overview-heading" className={styles.overviewTitle}>
                📊 Overview
              </h2>
              <div className="test-stats-grid" role="group" aria-label="Test statistics summary">
                <div
                  className={`test-stat-card ${styles.statCardGray}`}
                  role="img"
                  aria-label={`Total tests: ${summaryStats.tests}`}
                >
                  <div className={`test-stat-number ${styles.statNumberGray}`}>
                    {summaryStats.tests}
                  </div>
                  <div className={`test-stat-label ${styles.statLabelGray}`}>Total Tests</div>
                </div>
                <div
                  className={`test-stat-card ${styles.statCardGreen}`}
                  role="img"
                  aria-label={`Passed tests: ${summaryStats.passed}`}
                >
                  <div className={`test-stat-number ${styles.statNumberGreen}`}>
                    {summaryStats.passed}
                  </div>
                  <div className={`test-stat-label ${styles.statLabelGreen}`}>Passed</div>
                </div>
                <div
                  className={`test-stat-card ${styles.statCardRed}`}
                  role="img"
                  aria-label={`Failed tests: ${summaryStats.failed}`}
                >
                  <div className={`test-stat-number ${styles.statNumberRed}`}>
                    {summaryStats.failed}
                  </div>
                  <div className={`test-stat-label ${styles.statLabelRed}`}>Failed</div>
                </div>
                <div
                  className={`test-stat-card ${styles.statCardYellow}`}
                  role="img"
                  aria-label={`Skipped tests: ${summaryStats.skipped}`}
                >
                  <div className={`test-stat-number ${styles.statNumberYellow}`}>
                    {summaryStats.skipped}
                  </div>
                  <div className={`test-stat-label ${styles.statLabelYellow}`}>Skipped</div>
                </div>
                <div
                  className={`test-stat-card ${styles.statCardBlue}`}
                  role="img"
                  aria-label={`Total reports: ${reports.length}`}
                >
                  <div className={`test-stat-number ${styles.statNumberBlue}`}>
                    {reports.length}
                  </div>
                  <div className={`test-stat-label ${styles.statLabelBlue}`}>Reports</div>
                </div>
              </div>
            </div>
          </section>
        )}
        {/* Filters Section */}
        {!loading && !error && (
          <section aria-labelledby="filters-heading">
            <div className="card test-filters">
              <h2 id="filters-heading" className={styles.filtersTitle}>
                🔍 Filters
              </h2>
              <fieldset>
                <legend className="sr-only">Filter test reports</legend>
                <div className={styles.filtersGrid}>
                  <div>
                    <label className={styles.filterLabel}>Status:</label>
                    <select
                      value={filters.status}
                      onChange={e => handleFilterChange('status', e.target.value)}
                      className={styles.filterInput}
                    >
                      <option value="">All Statuses</option>
                      <option value="passed">Passed</option>
                      <option value="failed">Failed</option>
                      <option value="skipped">Skipped</option>
                      <option value="pending">Pending</option>
                    </select>
                  </div>
                  <div>
                    <label className={styles.filterLabel}>Tool:</label>
                    <input
                      type="text"
                      value={filters.tool}
                      onChange={e => handleFilterChange('tool', e.target.value)}
                      placeholder="e.g., Jest, Cypress, Playwright"
                      className={styles.filterInput}
                    />
                  </div>
                  <div>
                    <label className={styles.filterLabel}>Environment:</label>
                    <input
                      type="text"
                      value={filters.environment}
                      onChange={e => handleFilterChange('environment', e.target.value)}
                      placeholder="e.g., staging, production"
                      className={styles.filterInput}
                    />
                  </div>
                  <div>
                    <label className={styles.filterLabel}>Per Page:</label>
                    <select
                      value={filters.size}
                      onChange={e => handleFilterChange('size', parseInt(e.target.value))}
                      className={styles.filterInput}
                    >
                      <option value={5}>5</option>
                      <option value={10}>10</option>
                      <option value={20}>20</option>
                      <option value={50}>50</option>
                    </select>
                  </div>
                </div>
              </fieldset>
            </div>
          </section>
        )}
        {/* Test Reports Table */}
        {!loading && !error && reports.length > 0 && (
          <section aria-labelledby="results-heading">
            <div className="card">
              <h2 id="results-heading" className={styles.resultsTitle}>
                📋 Test Reports
              </h2>
              <div
                className={styles.tableContainer}
                role="region"
                aria-labelledby="results-heading"
                tabIndex={0}
              >
                <table className="test-table" aria-label="Test reports data table">
                  <caption className="sr-only">
                    Test reports showing {reports.length} of {totalReports} total reports. Use arrow
                    keys to navigate between cells.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col" id="tool-header">
                        Tool
                      </th>
                      <th scope="col" id="tests-header">
                        Tests
                      </th>
                      <th scope="col" id="success-header">
                        Success Rate
                      </th>
                      <th scope="col" id="duration-header">
                        Duration
                      </th>
                      <th scope="col" id="environment-header">
                        Environment
                      </th>
                      <th scope="col" id="stored-header">
                        Stored At
                      </th>
                      <th scope="col" id="actions-header">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {reports.map((report, index) => {
                      const successRate = getSuccessRate(report.results.summary);
                      const duration = report.results.summary.stop - report.results.summary.start;
                      return (
                        <tr
                          key={report._id}
                          tabIndex={0}
                          aria-rowindex={index + 2}
                          aria-label={`Test report for ${report.results.tool.name}, ${successRate}% success rate`}
                        >
                          <td headers="tool-header">
                            <div
                              className={styles.toolName}
                              aria-label={`Tool: ${report.results.tool.name}`}
                            >
                              {report.results.tool.name}
                            </div>
                            {report.results.tool.version && (
                              <div
                                className={styles.toolVersion}
                                aria-label={`Version: ${report.results.tool.version}`}
                              >
                                v{report.results.tool.version}
                              </div>
                            )}
                          </td>
                          <td headers="tests-header">
                            <div
                              className={styles.testMetrics}
                              role="group"
                              aria-label={`Test results: ${report.results.summary.passed} passed, ${report.results.summary.failed} failed, ${report.results.summary.skipped} skipped`}
                            >
                              <span
                                className="status-badge status-passed"
                                aria-label={`${report.results.summary.passed} tests passed`}
                              >
                                ✓ {report.results.summary.passed}
                              </span>
                              {report.results.summary.failed > 0 && (
                                <span
                                  className="status-badge status-failed"
                                  aria-label={`${report.results.summary.failed} tests failed`}
                                >
                                  ✗ {report.results.summary.failed}
                                </span>
                              )}
                              {report.results.summary.skipped > 0 && (
                                <span
                                  className="status-badge status-skipped"
                                  aria-label={`${report.results.summary.skipped} tests skipped`}
                                >
                                  ⊘ {report.results.summary.skipped}
                                </span>
                              )}
                            </div>
                            <div
                              className={styles.testTime}
                              aria-label={`Total tests: ${report.results.summary.tests}`}
                            >
                              {report.results.summary.tests} total
                            </div>
                          </td>
                          <td headers="success-header">
                            <div
                              className={`success-rate ${successRate >= 90 ? 'high' : successRate >= 70 ? 'medium' : 'low'}`}
                              aria-label={`Success rate: ${successRate} percent, ${successRate >= 90 ? 'high' : successRate >= 70 ? 'medium' : 'low'} performance`}
                            >
                              {successRate}%
                            </div>
                          </td>
                          <td headers="duration-header">
                            <div
                              className={styles.environmentName}
                              aria-label={`Test duration: ${formatDuration(duration)}`}
                            >
                              {formatDuration(duration)}
                            </div>
                          </td>
                          <td headers="environment-header">
                            <div
                              className={styles.environmentType}
                              aria-label={`Environment: ${report.results.environment?.testEnvironment || 'Not specified'}`}
                            >
                              {report.results.environment?.testEnvironment || 'N/A'}
                            </div>
                          </td>
                          <td headers="stored-header">
                            <div
                              className={styles.storedAt}
                              aria-label={`Stored at: ${formatDate(report.storedAt)}`}
                            >
                              {formatDate(report.storedAt)}
                            </div>
                          </td>
                          <td headers="actions-header">
                            <button
                              onClick={() => setSelectedReport(report)}
                              className={`refresh-button ${styles.viewButton}`}
                              aria-label={`View detailed results for ${report.results.tool.name} test report`}
                              tabIndex={0}
                            >
                              View Details
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </section>
        )}
        {/* Pagination */}
        {totalReports > filters.size && (
          <div className="pagination">
            <button
              onClick={() => handleFilterChange('page', Math.max(1, filters.page - 1))}
              disabled={filters.page === 1}
            >
              Previous
            </button>
            <span className={styles.paginationText}>
              Page {filters.page} of {Math.ceil(totalReports / filters.size)}
            </span>
            <button
              onClick={() => handleFilterChange('page', filters.page + 1)}
              disabled={filters.page >= Math.ceil(totalReports / filters.size)}
            >
              Next
            </button>
          </div>
        )}
        {/* Detailed Report Modal */}
        {selectedReport && (
          <div
            className="test-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="modal-title"
            aria-describedby="modal-description"
          >
            <div className="focus-trap-sentinel" tabIndex={0}></div>
            <div className="test-modal-content focus-trap">
              <div className={styles.modalHeader}>
                <h2 id="modal-title">🔍 Test Report Details</h2>
                <button
                  onClick={() => setSelectedReport(null)}
                  className={styles.modalCloseButton}
                  aria-label="Close modal dialog"
                  autoFocus
                >
                  ×
                </button>
              </div>

              <div id="modal-description" className="sr-only">
                Detailed view of test report for {selectedReport.results.tool.name}. Press Escape to
                close this dialog.
              </div>

              {/* Report Overview */}
              <section aria-labelledby="overview-section">
                <div className={styles.overviewSection}>
                  <h3 id="overview-section" className={styles.overviewSectionTitle}>
                    Report Overview
                  </h3>
                  <div className={styles.overviewGrid}>
                    <div>
                      <strong>Tool:</strong> {selectedReport.results.tool.name}
                      {selectedReport.results.tool.version &&
                        ` v${selectedReport.results.tool.version}`}
                    </div>
                    <div>
                      <strong>Report ID:</strong> {selectedReport.reportId || selectedReport._id}
                    </div>
                    <div>
                      <strong>Environment:</strong>{' '}
                      {selectedReport.results.environment?.testEnvironment || 'N/A'}
                    </div>
                    <div>
                      <strong>Duration:</strong>{' '}
                      {formatDuration(
                        selectedReport.results.summary.stop - selectedReport.results.summary.start
                      )}
                    </div>
                    <div>
                      <strong>Generated:</strong>{' '}
                      {selectedReport.timestamp ? formatDate(selectedReport.timestamp) : 'N/A'}
                    </div>
                    <div>
                      <strong>Stored:</strong> {formatDate(selectedReport.storedAt)}
                    </div>
                  </div>
                </div>
                {/* Individual Tests */}
                <div>
                  <h3 className={styles.testsListTitle}>
                    Individual Tests ({selectedReport.results.tests.length})
                  </h3>
                  <div className={styles.testsListContainer}>
                    {selectedReport.results.tests.map((test, index) => (
                      <div key={index} className={`test-item ${test.status}`}>
                        <div className={styles.testItemContainer}>
                          <div className={styles.testItemContent}>
                            <div className={styles.testItemTitle}>{test.name}</div>
                            {test.suite && (
                              <div className={styles.testItemSuite}>Suite: {test.suite}</div>
                            )}
                          </div>
                          <div className={styles.testItemMeta}>
                            <span className={`status-badge status-${test.status}`}>
                              {test.status.toUpperCase()}
                            </span>
                            <span className={styles.testItemDuration}>
                              {formatDuration(test.duration)}
                            </span>
                          </div>
                        </div>

                        {test.message && (
                          <div className="test-error-message">
                            <strong>Message:</strong> {test.message}
                          </div>
                        )}

                        {test.trace && (
                          <div className="test-trace">
                            <strong>Stack Trace:</strong>
                            <br />
                            {test.trace}
                          </div>
                        )}

                        {test.tags && test.tags.length > 0 && (
                          <div className={styles.testItemTags}>
                            {test.tags.map((tag, tagIndex) => (
                              <span key={tagIndex} className="test-tag">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </section>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

// Protect the route - require MAINTAINER or OWNER role
export default withAuth(TestResultsDashboard, {
  requiredRoles: [UserRole.MAINTAINER, UserRole.OWNER],
});
