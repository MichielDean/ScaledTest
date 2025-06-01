/**
 * Test Results Dashboard
 */

import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useAuth } from '../auth/KeycloakProvider';
import withAuth from '../auth/withAuth';
import Header from '../components/Header';
import { TestResultData } from '../models/testResults';
import { uiLogger, logError } from '../utils/logger';

const TestResultsDashboard: React.FC = () => {
  const { keycloak } = useAuth();

  // Log authenticated user for debugging
  uiLogger.debug(
    {
      user: keycloak?.tokenParsed?.preferred_username,
      component: 'TestResultsDashboard',
    },
    'Dashboard loaded for authenticated user'
  );

  const [testData, setTestData] = useState<TestResultData | null>(null);
  const [selectedDashboard, setSelectedDashboard] = useState<string>('overview');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load test data - in a real app, this would come from an API
    const loadTestData = async () => {
      try {
        setLoading(true);

        // For now, we'll use a placeholder
        // In a real implementation, you would fetch from your API:
        // const response = await fetch('/api/test-results');
        // const data = await response.json();

        // Placeholder data structure
        const placeholderData: TestResultData = {
          teams: [],
          applications: [],
          testSuites: [],
          testExecutions: [],
          testCases: [],
          testResults: [],
        };
        setTestData(placeholderData);

        uiLogger.info(
          {
            teamsCount: placeholderData.teams.length,
            applicationsCount: placeholderData.applications.length,
            testSuitesCount: placeholderData.testSuites.length,
            testCasesCount: placeholderData.testCases.length,
            testResultsCount: placeholderData.testResults.length,
          },
          'Test data loaded successfully'
        );
      } catch (error) {
        logError(uiLogger, 'Failed to load test data', error, {
          component: 'TestResultsDashboard',
        });
      } finally {
        setLoading(false);
      }
    };

    loadTestData();
  }, []);

  if (loading) {
    return (
      <div>
        <Head>
          <title>Test Results Dashboard - Loading...</title>
        </Head>
        <Header />
        <div style={{ padding: '20px', textAlign: 'center' }}>
          <h2>Loading test results...</h2>
          <div
            style={{
              display: 'inline-block',
              width: '40px',
              height: '40px',
              border: '4px solid #f3f3f3',
              borderTop: '4px solid #007bff',
              borderRadius: '50%',
              animation: 'spin 1s linear infinite',
            }}
          ></div>
          <style jsx>{`
            @keyframes spin {
              0% {
                transform: rotate(0deg);
              }
              100% {
                transform: rotate(360deg);
              }
            }
          `}</style>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Head>
        <title>Test Results Dashboard</title>
        <meta name="description" content="Interactive dashboard for test results visualization" />
      </Head>

      <Header />

      <main style={{ padding: '20px', maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{ marginBottom: '30px' }}>
          <h1 style={{ color: '#333', marginBottom: '10px' }}>Test Results Dashboard</h1>
          <p style={{ color: '#666', fontSize: '16px' }}>
            Interactive visualization of test results across teams, applications, and test suites.
          </p>
        </div>

        {/* Dashboard Selection */}
        <div style={{ marginBottom: '30px' }}>
          <h3 style={{ marginBottom: '15px', color: '#495057' }}>Available Dashboards</h3>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setSelectedDashboard('overview')}
              style={{
                padding: '10px 20px',
                border: '2px solid #007bff',
                borderRadius: '6px',
                backgroundColor: selectedDashboard === 'overview' ? '#007bff' : 'white',
                color: selectedDashboard === 'overview' ? 'white' : '#007bff',
                cursor: 'pointer',
                fontWeight: '500',
                transition: 'all 0.2s',
              }}
            >
              📊 Overview
            </button>
            <button
              onClick={() => setSelectedDashboard('timeline')}
              style={{
                padding: '10px 20px',
                border: '2px solid #28a745',
                borderRadius: '6px',
                backgroundColor: selectedDashboard === 'timeline' ? '#28a745' : 'white',
                color: selectedDashboard === 'timeline' ? 'white' : '#28a745',
                cursor: 'pointer',
                fontWeight: '500',
                transition: 'all 0.2s',
                opacity: 0.6,
              }}
              disabled
            >
              📈 Timeline View (Coming Soon)
            </button>
            <button
              onClick={() => setSelectedDashboard('metrics')}
              style={{
                padding: '10px 20px',
                border: '2px solid #ffc107',
                borderRadius: '6px',
                backgroundColor: selectedDashboard === 'metrics' ? '#ffc107' : 'white',
                color: selectedDashboard === 'metrics' ? 'white' : '#ffc107',
                cursor: 'pointer',
                fontWeight: '500',
                transition: 'all 0.2s',
                opacity: 0.6,
              }}
              disabled
            >
              📋 Metrics Dashboard (Coming Soon)
            </button>
          </div>
        </div>

        {/* Dashboard Content */}
        {selectedDashboard === 'overview' && (
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '30px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
              border: '1px solid #e9ecef',
            }}
          >
            <h2 style={{ marginBottom: '20px', color: '#495057' }}>📊 Test Results Overview</h2>
            <p style={{ marginBottom: '30px', color: '#6c757d', lineHeight: 1.5 }}>
              Welcome to the Test Results Dashboard. This is where you can view and analyze your
              test results across teams, applications, and test suites.
            </p>

            <div
              style={{
                padding: '20px',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
                textAlign: 'center',
              }}
            >
              <h4 style={{ marginBottom: '15px', color: '#495057' }}>🚧 Under Development</h4>
              <p style={{ color: '#6c757d', margin: 0 }}>
                Visualization components are being developed. Check back soon for interactive charts
                and detailed test analytics.
              </p>
            </div>
          </div>
        )}

        {/* Summary Statistics */}
        {testData && (
          <div
            style={{
              marginTop: '30px',
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
              gap: '20px',
            }}
          >
            <div
              style={{
                backgroundColor: 'white',
                padding: '20px',
                borderRadius: '8px',
                textAlign: 'center',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                border: '1px solid #e9ecef',
              }}
            >
              <h3 style={{ color: '#007bff', margin: '0 0 10px 0' }}>{testData.teams.length}</h3>
              <p style={{ margin: 0, color: '#6c757d' }}>Teams</p>
            </div>
            <div
              style={{
                backgroundColor: 'white',
                padding: '20px',
                borderRadius: '8px',
                textAlign: 'center',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                border: '1px solid #e9ecef',
              }}
            >
              <h3 style={{ color: '#28a745', margin: '0 0 10px 0' }}>
                {testData.applications.length}
              </h3>
              <p style={{ margin: 0, color: '#6c757d' }}>Applications</p>
            </div>
            <div
              style={{
                backgroundColor: 'white',
                padding: '20px',
                borderRadius: '8px',
                textAlign: 'center',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                border: '1px solid #e9ecef',
              }}
            >
              <h3 style={{ color: '#17a2b8', margin: '0 0 10px 0' }}>
                {testData.testSuites.length}
              </h3>
              <p style={{ margin: 0, color: '#6c757d' }}>Test Suites</p>
            </div>
            <div
              style={{
                backgroundColor: 'white',
                padding: '20px',
                borderRadius: '8px',
                textAlign: 'center',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                border: '1px solid #e9ecef',
              }}
            >
              <h3 style={{ color: '#ffc107', margin: '0 0 10px 0' }}>
                {testData.testCases.length}
              </h3>
              <p style={{ margin: 0, color: '#6c757d' }}>Test Cases</p>
            </div>
            <div
              style={{
                backgroundColor: 'white',
                padding: '20px',
                borderRadius: '8px',
                textAlign: 'center',
                boxShadow: '0 2px 4px rgba(0, 0, 0, 0.1)',
                border: '1px solid #e9ecef',
              }}
            >
              <h3 style={{ color: '#fd7e14', margin: '0 0 10px 0' }}>
                {testData.testResults.length}
              </h3>
              <p style={{ margin: 0, color: '#6c757d' }}>Test Results</p>
            </div>
          </div>
        )}
      </main>
    </div>
  );
};

export default withAuth(TestResultsDashboard);
