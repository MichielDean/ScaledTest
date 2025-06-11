import type { NextPage } from 'next';
import Head from 'next/head';
import { useEffect, useState, useCallback } from 'react';
import Header from '../components/Header';
import withAuth from '../auth/withAuth';
import { UserRole } from '../auth/keycloak';
import { useAuth } from '../auth/KeycloakProvider';
import { TestReport, TestReportsResponse, DashboardFilters } from '../types/dashboard';

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
        setReports(data.reports);
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

      <main
        role="main"
        id="main-content"
        className="test-dashboard"
        style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}
      >
        <div style={{ marginBottom: '2rem' }}>
          <h1
            style={{
              marginBottom: '0.5rem',
              background: 'linear-gradient(135deg, #007bff, #0056b3)',
              backgroundClip: 'text',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              fontSize: '2.5rem',
              fontWeight: '700',
              textAlign: 'center',
              color: '#343a40',
            }}
          >
            🧪 Test Results Dashboard
          </h1>
          <p style={{ color: '#6c757d', fontSize: '1.1rem', textAlign: 'center' }}>
            Monitor and analyze your CTRF test execution results
          </p>
        </div>
        {/* Summary Statistics */}
        <div className="card">
          <h2 style={{ marginBottom: '1.5rem', color: '#343a40' }}>📊 Overview</h2>
          <div className="test-stats-grid">
            <div className="test-stat-card" style={{ backgroundColor: '#f8f9fa' }}>
              <div className="test-stat-number" style={{ color: '#495057' }}>
                {summaryStats.tests}
              </div>
              <div className="test-stat-label" style={{ color: '#6c757d' }}>
                Total Tests
              </div>
            </div>
            <div className="test-stat-card" style={{ backgroundColor: '#d4edda' }}>
              <div className="test-stat-number" style={{ color: '#155724' }}>
                {summaryStats.passed}
              </div>
              <div className="test-stat-label" style={{ color: '#155724' }}>
                Passed
              </div>
            </div>
            <div className="test-stat-card" style={{ backgroundColor: '#f8d7da' }}>
              <div className="test-stat-number" style={{ color: '#721c24' }}>
                {summaryStats.failed}
              </div>
              <div className="test-stat-label" style={{ color: '#721c24' }}>
                Failed
              </div>
            </div>
            <div className="test-stat-card" style={{ backgroundColor: '#fff3cd' }}>
              <div className="test-stat-number" style={{ color: '#856404' }}>
                {summaryStats.skipped}
              </div>
              <div className="test-stat-label" style={{ color: '#856404' }}>
                Skipped
              </div>
            </div>
            <div className="test-stat-card" style={{ backgroundColor: '#d1ecf1' }}>
              <div className="test-stat-number" style={{ color: '#0c5460' }}>
                {reports.length}
              </div>
              <div className="test-stat-label" style={{ color: '#0c5460' }}>
                Reports
              </div>
            </div>
          </div>
        </div>{' '}
        {/* Filters */}
        <div className="card test-filters">
          <h3 style={{ marginBottom: '1rem', color: '#343a40' }}>🔍 Filters</h3>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '1rem',
            }}
          >
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Status:
              </label>
              <select
                value={filters.status}
                onChange={e => handleFilterChange('status', e.target.value)}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                }}
              >
                <option value="">All Statuses</option>
                <option value="passed">Passed</option>
                <option value="failed">Failed</option>
                <option value="skipped">Skipped</option>
                <option value="pending">Pending</option>
              </select>
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Tool:
              </label>
              <input
                type="text"
                value={filters.tool}
                onChange={e => handleFilterChange('tool', e.target.value)}
                placeholder="e.g., Jest, Cypress, Playwright"
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Environment:
              </label>
              <input
                type="text"
                value={filters.environment}
                onChange={e => handleFilterChange('environment', e.target.value)}
                placeholder="e.g., staging, production"
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                Per Page:
              </label>
              <select
                value={filters.size}
                onChange={e => handleFilterChange('size', parseInt(e.target.value))}
                style={{
                  width: '100%',
                  padding: '8px',
                  border: '1px solid #ddd',
                  borderRadius: '4px',
                  fontSize: '14px',
                }}
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
            className="card"
            role="status"
            aria-live="polite"
            style={{ textAlign: 'center', padding: '2rem' }}
          >
            <div className="loading-spinner"></div>
            <div
              className="loading-text"
              style={{ fontSize: '1.2rem', color: '#6c757d', marginTop: '1rem' }}
            >
              Loading test reports...
            </div>
            <div className="loading-subtext" style={{ color: '#6c757d', fontSize: '0.9rem' }}>
              Please wait while we fetch the latest data
            </div>
          </div>
        )}
        {error && (
          <div className="error-card" role="alert" aria-live="assertive">
            <h2 style={{ fontWeight: '500', marginBottom: '0.5rem' }}>
              ❌ Error loading test reports
            </h2>
            <p style={{ marginBottom: '1rem' }}>{error}</p>
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
          <section aria-labelledby="overview-heading">
            <div className="card">
              <h2 id="overview-heading" style={{ marginBottom: '1.5rem', color: '#343a40' }}>
                📊 Overview
              </h2>
              <div className="test-stats-grid" role="group" aria-label="Test statistics summary">
                <div
                  className="test-stat-card"
                  style={{ backgroundColor: '#f8f9fa' }}
                  role="img"
                  aria-label={`Total tests: ${summaryStats.tests}`}
                >
                  <div className="test-stat-number" style={{ color: '#495057' }}>
                    {summaryStats.tests}
                  </div>
                  <div className="test-stat-label" style={{ color: '#6c757d' }}>
                    Total Tests
                  </div>
                </div>
                <div
                  className="test-stat-card"
                  style={{ backgroundColor: '#d4edda' }}
                  role="img"
                  aria-label={`Passed tests: ${summaryStats.passed}`}
                >
                  <div className="test-stat-number" style={{ color: '#155724' }}>
                    {summaryStats.passed}
                  </div>
                  <div className="test-stat-label" style={{ color: '#155724' }}>
                    Passed
                  </div>
                </div>
                <div
                  className="test-stat-card"
                  style={{ backgroundColor: '#f8d7da' }}
                  role="img"
                  aria-label={`Failed tests: ${summaryStats.failed}`}
                >
                  <div className="test-stat-number" style={{ color: '#721c24' }}>
                    {summaryStats.failed}
                  </div>
                  <div className="test-stat-label" style={{ color: '#721c24' }}>
                    Failed
                  </div>
                </div>
                <div
                  className="test-stat-card"
                  style={{ backgroundColor: '#fff3cd' }}
                  role="img"
                  aria-label={`Skipped tests: ${summaryStats.skipped}`}
                >
                  <div className="test-stat-number" style={{ color: '#856404' }}>
                    {summaryStats.skipped}
                  </div>
                  <div className="test-stat-label" style={{ color: '#856404' }}>
                    Skipped
                  </div>
                </div>
                <div
                  className="test-stat-card"
                  style={{ backgroundColor: '#d1ecf1' }}
                  role="img"
                  aria-label={`Total reports: ${reports.length}`}
                >
                  <div className="test-stat-number" style={{ color: '#0c5460' }}>
                    {reports.length}
                  </div>
                  <div className="test-stat-label" style={{ color: '#0c5460' }}>
                    Reports
                  </div>
                </div>
              </div>
            </div>
          </section>
        )}
        {/* Filters Section */}
        {!loading && !error && (
          <section aria-labelledby="filters-heading">
            <div className="card test-filters">
              <h2 id="filters-heading" style={{ marginBottom: '1rem', color: '#343a40' }}>
                🔍 Filters
              </h2>
              <fieldset>
                <legend className="sr-only">Filter test reports</legend>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                    gap: '1rem',
                  }}
                >
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Status:
                    </label>
                    <select
                      value={filters.status}
                      onChange={e => handleFilterChange('status', e.target.value)}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        fontSize: '14px',
                      }}
                    >
                      <option value="">All Statuses</option>
                      <option value="passed">Passed</option>
                      <option value="failed">Failed</option>
                      <option value="skipped">Skipped</option>
                      <option value="pending">Pending</option>
                    </select>
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Tool:
                    </label>
                    <input
                      type="text"
                      value={filters.tool}
                      onChange={e => handleFilterChange('tool', e.target.value)}
                      placeholder="e.g., Jest, Cypress, Playwright"
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        fontSize: '14px',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Environment:
                    </label>
                    <input
                      type="text"
                      value={filters.environment}
                      onChange={e => handleFilterChange('environment', e.target.value)}
                      placeholder="e.g., staging, production"
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        fontSize: '14px',
                      }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: '500' }}>
                      Per Page:
                    </label>
                    <select
                      value={filters.size}
                      onChange={e => handleFilterChange('size', parseInt(e.target.value))}
                      style={{
                        width: '100%',
                        padding: '8px',
                        border: '1px solid #ddd',
                        borderRadius: '4px',
                        fontSize: '14px',
                      }}
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
              <h2 id="results-heading" style={{ marginBottom: '1.5rem', color: '#343a40' }}>
                📋 Test Reports
              </h2>
              <div
                style={{ overflowX: 'auto' }}
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
                              style={{ fontWeight: '500' }}
                              aria-label={`Tool: ${report.results.tool.name}`}
                            >
                              {report.results.tool.name}
                            </div>
                            {report.results.tool.version && (
                              <div
                                style={{ fontSize: '12px', color: '#6c757d' }}
                                aria-label={`Version: ${report.results.tool.version}`}
                              >
                                v{report.results.tool.version}
                              </div>
                            )}
                          </td>
                          <td headers="tests-header">
                            <div
                              style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}
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
                              style={{ fontSize: '12px', color: '#6c757d', marginTop: '4px' }}
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
                              style={{ fontWeight: '500' }}
                              aria-label={`Test duration: ${formatDuration(duration)}`}
                            >
                              {formatDuration(duration)}
                            </div>
                          </td>
                          <td headers="environment-header">
                            <div
                              style={{ fontSize: '14px' }}
                              aria-label={`Environment: ${report.results.environment?.testEnvironment || 'Not specified'}`}
                            >
                              {report.results.environment?.testEnvironment || 'N/A'}
                            </div>
                          </td>
                          <td headers="stored-header">
                            <div
                              style={{ fontSize: '12px', color: '#6c757d' }}
                              aria-label={`Stored at: ${formatDate(report.storedAt)}`}
                            >
                              {formatDate(report.storedAt)}
                            </div>
                          </td>
                          <td headers="actions-header">
                            <button
                              onClick={() => setSelectedReport(report)}
                              className="refresh-button"
                              style={{ padding: '6px 12px', fontSize: '12px' }}
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
            <span style={{ color: '#6c757d', fontWeight: '500' }}>
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
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: '1.5rem',
                }}
              >
                <h2 id="modal-title">🔍 Test Report Details</h2>
                <button
                  onClick={() => setSelectedReport(null)}
                  style={{
                    backgroundColor: '#6c757d',
                    color: 'white',
                    border: 'none',
                    borderRadius: '50%',
                    width: '32px',
                    height: '32px',
                    cursor: 'pointer',
                    fontSize: '18px',
                  }}
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
                <div
                  style={{
                    marginBottom: '2rem',
                    padding: '1rem',
                    backgroundColor: '#f8f9fa',
                    borderRadius: '6px',
                  }}
                >
                  <h3 id="overview-section" style={{ marginBottom: '1rem' }}>
                    Report Overview
                  </h3>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
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
                </div>{' '}
                {/* Individual Tests */}
                <div>
                  <h3 style={{ marginBottom: '1rem', color: '#343a40' }}>
                    Individual Tests ({selectedReport.results.tests.length})
                  </h3>
                  <div style={{ maxHeight: '400px', overflow: 'auto' }}>
                    {selectedReport.results.tests.map((test, index) => (
                      <div key={index} className={`test-item ${test.status}`}>
                        <div
                          style={{
                            display: 'flex',
                            justifyContent: 'space-between',
                            alignItems: 'flex-start',
                            marginBottom: '0.5rem',
                          }}
                        >
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: '500', marginBottom: '0.25rem' }}>
                              {test.name}
                            </div>
                            {test.suite && (
                              <div style={{ fontSize: '12px', color: '#6c757d' }}>
                                Suite: {test.suite}
                              </div>
                            )}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
                            <span className={`status-badge status-${test.status}`}>
                              {test.status.toUpperCase()}
                            </span>
                            <span style={{ fontSize: '12px', color: '#6c757d' }}>
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
                          <div style={{ marginTop: '0.5rem' }}>
                            {test.tags.map((tag, tagIndex) => (
                              <span key={tagIndex} className="test-tag">
                                {tag}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>{' '}
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
