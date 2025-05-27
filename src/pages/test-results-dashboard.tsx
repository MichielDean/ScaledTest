/**
 * Test Results Dashboard with Zoomable Sunburst Visualization
 */

import React, { useState, useEffect } from 'react';
import Head from 'next/head';
import { useAuth } from '../auth/KeycloakProvider';
import withAuth from '../auth/withAuth';
import Header from '../components/Header';
import ZoomableSunburst from '../components/ZoomableSunburst';
import { transformToSunburstData, SunburstNode } from '../utils/dataTransformers';
import { generateSampleTestData } from '../utils/sampleData';
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
  const [sunburstData, setSunburstData] = useState<SunburstNode | null>(null);
  const [selectedDashboard, setSelectedDashboard] = useState<string>('sunburst');
  const [selectedNode, setSelectedNode] = useState<SunburstNode | null>(null);
  const [showNodeDetails, setShowNodeDetails] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Load test data - in a real app, this would come from an API
    const loadTestData = async () => {
      try {
        setLoading(true);

        // For now, we'll use sample data
        // In a real implementation, you would fetch from your API:
        // const response = await fetch('/api/test-results');
        // const data = await response.json();

        const sampleData = generateSampleTestData();
        setTestData(sampleData);

        // Transform data for sunburst visualization
        const transformed = transformToSunburstData(sampleData);
        setSunburstData(transformed);

        uiLogger.info(
          {
            teamsCount: sampleData.teams.length,
            applicationsCount: sampleData.applications.length,
            testSuitesCount: sampleData.testSuites.length,
            testCasesCount: sampleData.testCases.length,
            testResultsCount: sampleData.testResults.length,
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

  const handleNodeClick = (node: SunburstNode) => {
    uiLogger.info(
      {
        nodeId: node.id,
        nodeType: node.type,
        nodeName: node.name,
        nodeStatus: node.status,
        nodeValue: node.value,
      },
      'Sunburst node clicked'
    );

    // Set the selected node and show details
    setSelectedNode(node);
    setShowNodeDetails(true);
  };

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
              onClick={() => setSelectedDashboard('sunburst')}
              style={{
                padding: '10px 20px',
                border: '2px solid #007bff',
                borderRadius: '6px',
                backgroundColor: selectedDashboard === 'sunburst' ? '#007bff' : 'white',
                color: selectedDashboard === 'sunburst' ? 'white' : '#007bff',
                cursor: 'pointer',
                fontWeight: '500',
                transition: 'all 0.2s',
              }}
            >
              🌟 Hierarchical Sunburst
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
              📊 Timeline View (Coming Soon)
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
              📈 Metrics Dashboard (Coming Soon)
            </button>
          </div>
        </div>

        {/* Dashboard Content */}
        {selectedDashboard === 'sunburst' && sunburstData && (
          <div
            style={{
              backgroundColor: 'white',
              borderRadius: '12px',
              padding: '30px',
              boxShadow: '0 4px 6px rgba(0, 0, 0, 0.1)',
              border: '1px solid #e9ecef',
            }}
          >
            <h2 style={{ marginBottom: '20px', color: '#495057' }}>
              🌟 Hierarchical Test Results Sunburst
            </h2>
            <p style={{ marginBottom: '30px', color: '#6c757d', lineHeight: 1.5 }}>
              This zoomable sunburst chart visualizes your test results hierarchy. Click on any
              segment to zoom in and explore that level in detail. The hierarchy flows from{' '}
              <strong>Teams</strong> → <strong>Applications</strong> → <strong>Test Suites</strong>{' '}
              → <strong>Test Executions</strong> → <strong>Test Cases</strong> →{' '}
              <strong>Test Results</strong>. Colors represent the passing percentage of tests:{' '}
              <span style={{ color: '#28a745', fontWeight: 'bold' }}>
                green for high success rates (95%+)
              </span>
              ,
              <span style={{ color: '#7cb342', fontWeight: 'bold' }}>
                {' '}
                light green for good performance (85-95%)
              </span>
              ,
              <span style={{ color: '#ffc107', fontWeight: 'bold' }}>
                {' '}
                yellow for fair performance (70-85%)
              </span>
              ,
              <span style={{ color: '#ff9800', fontWeight: 'bold' }}>
                {' '}
                orange for poor performance (50-70%)
              </span>
              , and
              <span style={{ color: '#f44336', fontWeight: 'bold' }}>
                {' '}
                red for critical issues (&lt;50%)
              </span>
              .
            </p>

            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <ZoomableSunburst
                data={sunburstData}
                width={800}
                height={800}
                onNodeClick={handleNodeClick}
              />
            </div>

            {/* Legend */}
            <div
              style={{
                marginTop: '30px',
                padding: '20px',
                backgroundColor: '#f8f9fa',
                borderRadius: '8px',
              }}
            >
              <h4 style={{ marginBottom: '15px', color: '#495057' }}>
                🎨 Color Legend - Passing Percentage
              </h4>
              <p
                style={{
                  marginBottom: '15px',
                  fontSize: '14px',
                  color: '#6c757d',
                  fontStyle: 'italic',
                }}
              >
                Colors represent test passing percentages calculated from passed vs failed test
                results.
              </p>
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
                  gap: '12px',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      width: '16px',
                      height: '16px',
                      backgroundColor: '#28a745',
                      borderRadius: '50%',
                    }}
                  ></div>
                  <span>Excellent (95-100%)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      width: '16px',
                      height: '16px',
                      background: 'linear-gradient(to right, #7cb342, #28a745)',
                      borderRadius: '50%',
                    }}
                  ></div>
                  <span>Good (85-95%)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      width: '16px',
                      height: '16px',
                      background: 'linear-gradient(to right, #ffc107, #7cb342)',
                      borderRadius: '50%',
                    }}
                  ></div>
                  <span>Fair (70-85%)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      width: '16px',
                      height: '16px',
                      background: 'linear-gradient(to right, #ff9800, #ffc107)',
                      borderRadius: '50%',
                    }}
                  ></div>
                  <span>Poor (50-70%)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      width: '16px',
                      height: '16px',
                      background: 'linear-gradient(to right, #f44336, #ff9800)',
                      borderRadius: '50%',
                    }}
                  ></div>
                  <span>Critical (&lt;50%)</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div
                    style={{
                      width: '16px',
                      height: '16px',
                      backgroundColor: '#6c757d',
                      borderRadius: '50%',
                    }}
                  ></div>
                  <span>Skipped/Blocked</span>
                </div>
              </div>
            </div>

            {/* Instructions */}
            <div
              style={{
                marginTop: '20px',
                padding: '15px',
                backgroundColor: '#e3f2fd',
                borderRadius: '8px',
                borderLeft: '4px solid #2196f3',
              }}
            >
              <h4 style={{ margin: '0 0 10px 0', color: '#1565c0' }}>💡 How to Use</h4>
              <ul style={{ margin: 0, paddingLeft: '20px', color: '#0d47a1' }}>
                <li>Click on any segment to zoom into that level of the hierarchy</li>
                <li>Click the center circle to zoom back out to the parent level</li>
                <li>Hover over segments to see detailed information in tooltips</li>
                <li>Hold Alt while clicking for slower zoom transitions</li>
                <li>Selected node details appear below the chart</li>
              </ul>
            </div>

            {/* Selected Node Details */}
            {showNodeDetails && selectedNode && (
              <div
                style={{
                  marginTop: '30px',
                  padding: '25px',
                  backgroundColor: '#fff3cd',
                  borderRadius: '8px',
                  border: '1px solid #ffeaa7',
                  borderLeft: '4px solid #fdcb6e',
                }}
              >
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    marginBottom: '15px',
                  }}
                >
                  <h4 style={{ margin: 0, color: '#856404' }}>📋 Selected Node Details</h4>
                  <button
                    onClick={() => setShowNodeDetails(false)}
                    style={{
                      background: 'none',
                      border: 'none',
                      fontSize: '18px',
                      cursor: 'pointer',
                      color: '#856404',
                      padding: '5px',
                    }}
                    title="Close details"
                  >
                    ✕
                  </button>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
                    gap: '15px',
                  }}
                >
                  <div>
                    <strong style={{ color: '#856404' }}>Name:</strong>
                    <p style={{ margin: '5px 0', color: '#533f03' }}>{selectedNode.name}</p>
                  </div>

                  <div>
                    <strong style={{ color: '#856404' }}>Type:</strong>
                    <p style={{ margin: '5px 0', color: '#533f03' }}>{selectedNode.type}</p>
                  </div>

                  {selectedNode.id && (
                    <div>
                      <strong style={{ color: '#856404' }}>ID:</strong>
                      <p
                        style={{
                          margin: '5px 0',
                          color: '#533f03',
                          fontFamily: 'monospace',
                          fontSize: '12px',
                        }}
                      >
                        {selectedNode.id}
                      </p>
                    </div>
                  )}

                  {selectedNode.status && (
                    <div>
                      <strong style={{ color: '#856404' }}>Status:</strong>
                      <p style={{ margin: '5px 0', color: '#533f03' }}>
                        <span
                          style={{
                            padding: '2px 8px',
                            borderRadius: '12px',
                            fontSize: '12px',
                            fontWeight: 'bold',
                            backgroundColor:
                              selectedNode.status === 'passed'
                                ? '#d4edda'
                                : selectedNode.status === 'failed'
                                  ? '#f8d7da'
                                  : selectedNode.status === 'skipped'
                                    ? '#fff3cd'
                                    : '#e2e3e5',
                            color:
                              selectedNode.status === 'passed'
                                ? '#155724'
                                : selectedNode.status === 'failed'
                                  ? '#721c24'
                                  : selectedNode.status === 'skipped'
                                    ? '#856404'
                                    : '#6c757d',
                          }}
                        >
                          {selectedNode.status.toUpperCase()}
                        </span>
                      </p>
                    </div>
                  )}

                  {selectedNode.value && (
                    <div>
                      <strong style={{ color: '#856404' }}>Value:</strong>
                      <p style={{ margin: '5px 0', color: '#533f03' }}>{selectedNode.value}</p>
                    </div>
                  )}

                  {selectedNode.children && selectedNode.children.length > 0 && (
                    <div>
                      <strong style={{ color: '#856404' }}>Children:</strong>
                      <p style={{ margin: '5px 0', color: '#533f03' }}>
                        {selectedNode.children.length} items
                      </p>
                    </div>
                  )}
                </div>

                {selectedNode.metadata && (
                  <div
                    style={{
                      marginTop: '20px',
                      paddingTop: '15px',
                      borderTop: '1px solid #ffeaa7',
                    }}
                  >
                    <h5 style={{ margin: '0 0 10px 0', color: '#856404' }}>
                      Additional Information
                    </h5>

                    {selectedNode.metadata.description && (
                      <div style={{ marginBottom: '10px' }}>
                        <strong style={{ color: '#856404' }}>Description:</strong>
                        <p style={{ margin: '5px 0', color: '#533f03' }}>
                          {selectedNode.metadata.description}
                        </p>
                      </div>
                    )}

                    {selectedNode.metadata.durationMs && (
                      <div style={{ marginBottom: '10px' }}>
                        <strong style={{ color: '#856404' }}>Duration:</strong>
                        <p style={{ margin: '5px 0', color: '#533f03' }}>
                          {selectedNode.metadata.durationMs}ms (
                          {(selectedNode.metadata.durationMs / 1000).toFixed(2)}s)
                        </p>
                      </div>
                    )}

                    {selectedNode.metadata.tags && selectedNode.metadata.tags.length > 0 && (
                      <div style={{ marginBottom: '10px' }}>
                        <strong style={{ color: '#856404' }}>Tags:</strong>
                        <div
                          style={{ margin: '5px 0', display: 'flex', flexWrap: 'wrap', gap: '5px' }}
                        >
                          {selectedNode.metadata.tags.map((tag, index) => (
                            <span
                              key={index}
                              style={{
                                padding: '2px 8px',
                                backgroundColor: '#e9ecef',
                                color: '#495057',
                                borderRadius: '12px',
                                fontSize: '12px',
                                border: '1px solid #ced4da',
                              }}
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}

                    {selectedNode.metadata.createdAt && (
                      <div style={{ marginBottom: '10px' }}>
                        <strong style={{ color: '#856404' }}>Created:</strong>
                        <p style={{ margin: '5px 0', color: '#533f03' }}>
                          {new Date(selectedNode.metadata.createdAt).toLocaleString()}
                        </p>
                      </div>
                    )}

                    {selectedNode.metadata.updatedAt && (
                      <div style={{ marginBottom: '10px' }}>
                        <strong style={{ color: '#856404' }}>Updated:</strong>
                        <p style={{ margin: '5px 0', color: '#533f03' }}>
                          {new Date(selectedNode.metadata.updatedAt).toLocaleString()}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                <div
                  style={{ marginTop: '20px', paddingTop: '15px', borderTop: '1px solid #ffeaa7' }}
                >
                  <h5 style={{ margin: '0 0 10px 0', color: '#856404' }}>Actions</h5>
                  <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
                    <button
                      onClick={() => {
                        if (selectedNode.id) {
                          navigator.clipboard.writeText(selectedNode.id);
                          uiLogger.info({ nodeId: selectedNode.id }, 'Node ID copied to clipboard');
                        }
                      }}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#007bff',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '14px',
                      }}
                      disabled={!selectedNode.id}
                    >
                      📋 Copy ID
                    </button>

                    <button
                      onClick={() => {
                        const nodeInfo = JSON.stringify(selectedNode, null, 2);
                        navigator.clipboard.writeText(nodeInfo);
                        uiLogger.info(
                          { nodeId: selectedNode.id },
                          'Node details copied to clipboard'
                        );
                      }}
                      style={{
                        padding: '8px 16px',
                        backgroundColor: '#28a745',
                        color: 'white',
                        border: 'none',
                        borderRadius: '4px',
                        cursor: 'pointer',
                        fontSize: '14px',
                      }}
                    >
                      📄 Copy Details
                    </button>

                    {selectedNode.type === 'testCase' && (
                      <button
                        onClick={() => {
                          uiLogger.info(
                            { nodeId: selectedNode.id },
                            'Navigate to test case details'
                          );
                          // In a real app, you would navigate to a detailed test case page
                          alert(`Navigate to detailed view for test case: ${selectedNode.name}`);
                        }}
                        style={{
                          padding: '8px 16px',
                          backgroundColor: '#ffc107',
                          color: '#212529',
                          border: 'none',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '14px',
                        }}
                      >
                        🔍 View Details
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
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
