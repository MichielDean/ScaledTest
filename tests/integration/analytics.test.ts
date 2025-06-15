import { setupOpenSearchTestEnv } from '../utils/testEnvSetup';
setupOpenSearchTestEnv();

import { NextApiRequest, NextApiResponse } from 'next';

// Mock dependencies before imports
jest.mock('keycloak-js', () => {
  return function () {
    return {};
  };
});

jest.mock('jose', () => ({
  jwtVerify: jest.fn().mockResolvedValue({
    payload: {
      sub: 'user-123',
      aud: 'scaledtest-client',
      resource_access: {
        'scaledtest-client': {
          roles: ['owner', 'maintainer', 'readonly'],
        },
      },
    },
  }),
  createRemoteJWKSet: jest.fn().mockReturnValue('mocked-jwks'),
}));

// Mock logger before any imports
jest.mock('../../src/utils/logger', () => ({
  apiLogger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  dbLogger: {
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
  getRequestLogger: jest.fn().mockReturnValue({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    child: jest.fn().mockReturnValue({
      debug: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  }),
  logError: jest.fn(),
}));

// Mock OpenSearch client
const mockTrendsResponse = {
  body: {
    aggregations: {
      trends: {
        buckets: [
          {
            key_as_string: '2025-06-08',
            doc_count: 100,
            total_tests: { value: 100 },
            passed_tests: { value: 90 },
            failed_tests: { value: 8 },
            skipped_tests: { value: 2 },
          },
          {
            key_as_string: '2025-06-07',
            doc_count: 95,
            total_tests: { value: 95 },
            passed_tests: { value: 85 },
            failed_tests: { value: 7 },
            skipped_tests: { value: 3 },
          },
        ],
      },
    },
    hits: {
      total: { value: 195 },
      hits: [],
    },
  },
  statusCode: 200,
};

const mockErrorAnalysisResponse = {
  body: {
    aggregations: {
      failed_tests: {
        failed_only: {
          error_messages: {
            buckets: [
              {
                key: 'Connection timeout',
                doc_count: 5,
                test_names: {
                  buckets: [{ key: 'test-auth-login' }, { key: 'test-api-endpoint' }],
                },
              },
              {
                key: 'Assertion failed',
                doc_count: 3,
                test_names: {
                  buckets: [{ key: 'test-validation' }],
                },
              },
            ],
          },
        },
      },
    },
    hits: { total: { value: 8 }, hits: [] },
  },
  statusCode: 200,
};

const mockFlakyTestsResponse = {
  body: {
    aggregations: {
      test_results: {
        by_test_name: {
          buckets: [
            {
              key: 'test-flaky-api',
              status_distribution: {
                buckets: [
                  { key: 'passed', doc_count: 7 },
                  { key: 'failed', doc_count: 3 },
                ],
              },
              marked_flaky: { doc_count: 1 },
              total_runs: { value: 10 },
              avg_duration: { value: 2500 },
            },
          ],
        },
      },
    },
    hits: { total: { value: 10 }, hits: [] },
  },
  statusCode: 200,
};

const mockDurationResponse = {
  body: {
    aggregations: {
      duration_ranges: {
        duration_buckets: {
          buckets: [
            { key: '0-1s', doc_count: 50 },
            { key: '1-5s', doc_count: 30 },
            { key: '5-10s', doc_count: 15 },
            { key: '10-30s', doc_count: 5 },
          ],
        },
        avg_duration: { value: 2500 },
        max_duration: { value: 25000 },
        min_duration: { value: 100 },
      },
    },
    hits: { total: { value: 100 }, hits: [] },
  },
  statusCode: 200,
};

const mockSuiteOverviewResponse = {
  body: {
    aggregations: {
      suites: {
        buckets: [
          {
            key: 'auth-tests',
            total_tests: { value: 25 },
            passed_tests: { value: 22 },
            failed_tests: { value: 2 },
            skipped_tests: { value: 1 },
            avg_duration: { value: 15000 },
          },
          {
            key: 'api-tests',
            total_tests: { value: 50 },
            passed_tests: { value: 45 },
            failed_tests: { value: 4 },
            skipped_tests: { value: 1 },
            avg_duration: { value: 8000 },
          },
        ],
      },
    },
    hits: { total: { value: 75 }, hits: [] },
  },
  statusCode: 200,
};

const mockHealthResponse = {
  body: { status: 'green' },
  statusCode: 200,
};

const mockIndexExistsResponse = {
  body: true,
  statusCode: 200,
};

const mockClient = {
  cluster: {
    health: jest.fn().mockResolvedValue(mockHealthResponse),
  },
  indices: {
    exists: jest.fn().mockResolvedValue(mockIndexExistsResponse),
  },
  search: jest.fn().mockResolvedValue(mockTrendsResponse),
  count: jest.fn().mockResolvedValue({
    body: { count: 100 },
    statusCode: 200,
  }),
};

// Mock the OpenSearch client constructor
jest.mock('@opensearch-project/opensearch', () => ({
  Client: jest.fn(() => mockClient),
}));

// Import handlers after mocks
import testTrendsHandler from '../../src/pages/api/analytics/test-trends';
import errorAnalysisHandler from '../../src/pages/api/analytics/error-analysis';
import flakyTestsHandler from '../../src/pages/api/analytics/flaky-tests';
import testDurationHandler from '../../src/pages/api/analytics/test-duration';
import testSuiteOverviewHandler from '../../src/pages/api/analytics/test-suite-overview';
import opensearchHealthHandler from '../../src/pages/api/analytics/opensearch-health';

// Helper function to create mock request/response
function createMockRequestResponse(queryParams: Record<string, string> = {}) {
  const req = {
    method: 'GET',
    query: queryParams,
    headers: {
      authorization: 'Bearer valid-token',
    },
  } as NextApiRequest;

  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    end: jest.fn().mockReturnThis(),
  } as unknown as NextApiResponse;

  return { req, res };
}

describe('Analytics API Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mocks to default successful responses
    mockClient.cluster.health.mockResolvedValue(mockHealthResponse);
    mockClient.indices.exists.mockResolvedValue(mockIndexExistsResponse);
    mockClient.search.mockResolvedValue(mockTrendsResponse);
    mockClient.count.mockResolvedValue({
      body: { count: 100 },
      statusCode: 200,
    });
  });

  describe('Test Trends Integration (/api/analytics/test-trends)', () => {
    it('should successfully fetch and transform test trends data from OpenSearch', async () => {
      // Arrange
      const { req, res } = createMockRequestResponse({ days: '7' });

      // Act
      await testTrendsHandler(req, res);

      // Assert
      expect(mockClient.cluster.health).toHaveBeenCalled();
      expect(mockClient.indices.exists).toHaveBeenCalledWith({
        index: 'ctrf-reports',
      });
      expect(mockClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'ctrf-reports',
          body: expect.objectContaining({
            size: 0,
            query: expect.objectContaining({
              range: expect.objectContaining({
                storedAt: expect.objectContaining({
                  gte: expect.stringMatching(/now-\d+d\/d/),
                }),
              }),
            }),
            aggs: expect.objectContaining({
              trends: expect.objectContaining({
                date_histogram: expect.objectContaining({
                  field: 'storedAt',
                  calendar_interval: 'day',
                  format: 'yyyy-MM-dd',
                }),
                aggs: expect.any(Object),
              }),
            }),
          }),
        })
      );

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.arrayContaining([
            expect.objectContaining({
              date: expect.any(String),
              total: expect.any(Number),
              passed: expect.any(Number),
              failed: expect.any(Number),
              skipped: expect.any(Number),
              passRate: expect.any(Number),
            }),
          ]),
          meta: expect.objectContaining({
            source: 'OpenSearch',
            index: 'ctrf-reports',
            daysRequested: 7,
            opensearchHealth: expect.objectContaining({
              connected: true,
              indexExists: true,
            }),
          }),
        })
      );
    });

    it('should handle OpenSearch connection failures gracefully', async () => {
      // Arrange
      mockClient.cluster.health.mockRejectedValue(new Error('ECONNREFUSED'));
      const { req, res } = createMockRequestResponse();

      // Act
      await testTrendsHandler(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('not accessible'),
          source: 'OpenSearch',
        })
      );
    });

    it('should validate query parameters correctly', async () => {
      // Arrange - Test with invalid days parameter
      const { req, res } = createMockRequestResponse({ days: 'abc' });

      // Act
      await testTrendsHandler(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Invalid days parameter. Must be between 1 and 365.',
        source: 'OpenSearch',
      });
    });
  });

  describe('Error Analysis Integration (/api/analytics/error-analysis)', () => {
    it('should successfully fetch error analysis data from OpenSearch', async () => {
      // Arrange
      mockClient.search.mockResolvedValue(mockErrorAnalysisResponse);
      const { req, res } = createMockRequestResponse();

      // Act
      await errorAnalysisHandler(req, res);

      // Assert
      expect(mockClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'ctrf-reports',
          body: expect.objectContaining({
            size: 0,
            aggs: expect.objectContaining({
              failed_tests: expect.objectContaining({
                nested: expect.objectContaining({
                  path: 'results.tests',
                }),
                aggs: expect.objectContaining({
                  failed_only: expect.objectContaining({
                    filter: expect.objectContaining({
                      term: expect.objectContaining({
                        'results.tests.status': 'failed',
                      }),
                    }),
                  }),
                }),
              }),
            }),
          }),
        })
      );

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.arrayContaining([
            expect.objectContaining({
              errorMessage: expect.any(String),
              count: expect.any(Number),
              affectedTests: expect.any(Array),
            }),
          ]),
        })
      );
    });
  });

  describe('Flaky Tests Integration (/api/analytics/flaky-tests)', () => {
    it('should successfully identify flaky tests from OpenSearch data', async () => {
      // Arrange
      mockClient.search.mockResolvedValue(mockFlakyTestsResponse);
      const { req, res } = createMockRequestResponse();

      // Act
      await flakyTestsHandler(req, res);

      // Assert
      expect(mockClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'ctrf-reports',
          body: expect.objectContaining({
            size: 0,
            aggs: expect.objectContaining({
              test_results: expect.objectContaining({
                nested: expect.objectContaining({
                  path: 'results.tests',
                }),
                aggs: expect.objectContaining({
                  by_test_name: expect.objectContaining({
                    terms: expect.objectContaining({
                      field: 'results.tests.name.keyword',
                      size: 1000,
                    }),
                  }),
                }),
              }),
            }),
          }),
        })
      );

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.arrayContaining([
            expect.objectContaining({
              testName: expect.any(String),
              totalRuns: expect.any(Number),
              passed: expect.any(Number),
              failed: expect.any(Number),
              flakyScore: expect.any(Number),
            }),
          ]),
        })
      );
    });
  });

  describe('Test Duration Analysis Integration (/api/analytics/test-duration)', () => {
    it('should successfully analyze test durations from OpenSearch', async () => {
      // Arrange
      mockClient.search.mockResolvedValue(mockDurationResponse);
      const { req, res } = createMockRequestResponse();

      // Act
      await testDurationHandler(req, res);

      // Assert
      expect(mockClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'ctrf-reports',
          body: expect.objectContaining({
            size: 0,
            aggs: expect.objectContaining({
              duration_ranges: expect.objectContaining({
                nested: expect.objectContaining({
                  path: 'results.tests',
                }),
                aggs: expect.objectContaining({
                  duration_buckets: expect.objectContaining({
                    range: expect.objectContaining({
                      field: 'results.tests.duration',
                      ranges: expect.any(Array),
                    }),
                  }),
                }),
              }),
            }),
          }),
        })
      );

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.arrayContaining([
            expect.objectContaining({
              range: expect.any(String),
              count: expect.any(Number),
              avgDuration: expect.any(Number),
            }),
          ]),
        })
      );
    });
  });

  describe('Test Suite Overview Integration (/api/analytics/test-suite-overview)', () => {
    it('should successfully aggregate test suite data from OpenSearch', async () => {
      // Arrange
      mockClient.search.mockResolvedValue(mockSuiteOverviewResponse);
      const { req, res } = createMockRequestResponse();

      // Act
      await testSuiteOverviewHandler(req, res);

      // Assert
      expect(mockClient.search).toHaveBeenCalledWith(
        expect.objectContaining({
          index: 'ctrf-reports',
          body: expect.objectContaining({
            size: 0,
            aggs: expect.objectContaining({
              suites: expect.objectContaining({
                terms: expect.objectContaining({
                  field: 'results.tests.suite',
                  size: 100,
                  missing: 'Uncategorized',
                }),
              }),
            }),
          }),
        })
      );

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.arrayContaining([
            expect.objectContaining({
              name: expect.any(String),
              total: expect.any(Number),
              passed: expect.any(Number),
              failed: expect.any(Number),
              avgDuration: expect.any(Number),
            }),
          ]),
        })
      );
    });
  });

  describe('OpenSearch Health Integration (/api/analytics/opensearch-health)', () => {
    it('should successfully check OpenSearch health status', async () => {
      // Arrange
      const { req, res } = createMockRequestResponse();

      // Act
      await opensearchHealthHandler(req, res);

      // Assert
      expect(mockClient.cluster.health).toHaveBeenCalled();
      expect(mockClient.indices.exists).toHaveBeenCalledWith({
        index: 'ctrf-reports',
      });
      expect(mockClient.count).toHaveBeenCalledWith({
        index: 'ctrf-reports',
      });

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            connected: true,
            indexExists: true,
            documentsCount: expect.any(Number),
            clusterHealth: 'green',
            index: 'ctrf-reports',
            timestamp: expect.any(String),
          }),
          meta: {
            source: 'OpenSearch',
            endpoint: 'Health Check',
          },
        })
      );
    });

    it('should handle unhealthy OpenSearch cluster', async () => {
      // Arrange
      mockClient.cluster.health.mockResolvedValue({
        body: { status: 'red' },
        statusCode: 200,
      });
      const { req, res } = createMockRequestResponse();

      // Act
      await opensearchHealthHandler(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            clusterHealth: 'red',
          }),
        })
      );
    });

    it('should handle OpenSearch connection errors during health check', async () => {
      // Arrange
      mockClient.cluster.health.mockRejectedValue(new Error('Connection timeout'));
      const { req, res } = createMockRequestResponse();

      // Act
      await opensearchHealthHandler(req, res);

      // Assert - The health function catches errors and returns 200 with connected: false
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            connected: false,
            indexExists: false,
            documentsCount: 0,
            clusterHealth: 'unknown',
          }),
        })
      );
    });
  });

  describe('Authentication and Authorization', () => {
    it('should require authentication for all analytics endpoints', async () => {
      // Arrange - Request without authorization header
      const req = {
        method: 'GET',
        query: {},
        headers: {},
      } as NextApiRequest;

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        end: jest.fn().mockReturnThis(),
      } as unknown as NextApiResponse;

      // Act & Assert - Test each endpoint
      const endpoints = [
        testTrendsHandler,
        errorAnalysisHandler,
        flakyTestsHandler,
        testDurationHandler,
        testSuiteOverviewHandler,
        opensearchHealthHandler,
      ];

      for (const handler of endpoints) {
        jest.clearAllMocks();
        await handler(req, res);
        expect(res.status).toHaveBeenCalledWith(401);
      }
    });
  });

  describe('Performance and Rate Limiting', () => {
    it('should handle large datasets efficiently in test trends', async () => {
      // Arrange - Mock large dataset response
      const largeMockResponse = {
        body: {
          aggregations: {
            daily_results: {
              buckets: Array.from({ length: 365 }, (_, i) => ({
                key_as_string: `2024-${String(Math.floor(i / 30) + 1).padStart(2, '0')}-${String((i % 30) + 1).padStart(2, '0')}T00:00:00.000Z`,
                doc_count: Math.floor(Math.random() * 100) + 50,
                total_tests: { value: Math.floor(Math.random() * 100) + 50 },
                passed_tests: { value: Math.floor(Math.random() * 80) + 40 },
                failed_tests: { value: Math.floor(Math.random() * 10) + 1 },
                skipped_tests: { value: Math.floor(Math.random() * 5) },
              })),
            },
          },
          hits: { total: { value: 36500 }, hits: [] },
        },
        statusCode: 200,
      };

      mockClient.search.mockResolvedValue(largeMockResponse);
      const { req, res } = createMockRequestResponse({ days: '365' });

      // Act
      const startTime = Date.now();
      await testTrendsHandler(req, res);
      const endTime = Date.now();

      // Assert - Should complete within reasonable time (< 5 seconds)
      expect(endTime - startTime).toBeLessThan(5000);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.any(Array),
          meta: expect.objectContaining({
            daysRequested: 365,
          }),
        })
      );
    });
  });

  // Edge Case Testing - Comprehensive scenarios for all endpoints
  describe('Edge Cases and Error Scenarios', () => {
    describe('Empty Data Scenarios', () => {
      it('should handle empty test trends data gracefully', async () => {
        // Arrange - Mock empty OpenSearch response
        const emptyTrendsResponse = {
          body: {
            aggregations: {
              trends: {
                buckets: [],
              },
            },
            hits: { total: { value: 0 }, hits: [] },
          },
          statusCode: 200,
        };
        mockClient.search.mockResolvedValue(emptyTrendsResponse);
        const { req, res } = createMockRequestResponse({ days: '7' });

        // Act
        await testTrendsHandler(req, res);

        // Assert
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: [],
            meta: expect.objectContaining({
              daysRequested: 7,
            }),
          })
        );
      });

      it('should handle empty error analysis data gracefully', async () => {
        // Arrange - Mock empty error analysis response
        const emptyErrorResponse = {
          body: {
            aggregations: {
              failed_tests: {
                failed_only: {
                  error_messages: {
                    buckets: [],
                  },
                },
              },
            },
            hits: { total: { value: 0 }, hits: [] },
          },
          statusCode: 200,
        };
        mockClient.search.mockResolvedValue(emptyErrorResponse);
        const { req, res } = createMockRequestResponse();

        // Act
        await errorAnalysisHandler(req, res);

        // Assert
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: [],
          })
        );
      });

      it('should handle no flaky tests found gracefully', async () => {
        // Arrange - Mock empty flaky tests response
        const emptyFlakyResponse = {
          body: {
            aggregations: {
              test_results: {
                by_test_name: {
                  buckets: [],
                },
              },
            },
            hits: { total: { value: 0 }, hits: [] },
          },
          statusCode: 200,
        };
        mockClient.search.mockResolvedValue(emptyFlakyResponse);
        const { req, res } = createMockRequestResponse();

        // Act
        await flakyTestsHandler(req, res);

        // Assert
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: [],
          })
        );
      });

      it('should handle empty test duration data gracefully', async () => {
        // Arrange - Mock empty duration response
        const emptyDurationResponse = {
          body: {
            aggregations: {
              duration_ranges: {
                duration_buckets: {
                  buckets: [],
                },
              },
            },
            hits: { total: { value: 0 }, hits: [] },
          },
          statusCode: 200,
        };
        mockClient.search.mockResolvedValue(emptyDurationResponse);
        const { req, res } = createMockRequestResponse();

        // Act
        await testDurationHandler(req, res);

        // Assert
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: [],
          })
        );
      });

      it('should handle empty test suite data gracefully', async () => {
        // Arrange - Mock empty suite response
        const emptySuiteResponse = {
          body: {
            aggregations: {
              suites: {
                buckets: [],
              },
            },
            hits: { total: { value: 0 }, hits: [] },
          },
          statusCode: 200,
        };
        mockClient.search.mockResolvedValue(emptySuiteResponse);
        const { req, res } = createMockRequestResponse();

        // Act
        await testSuiteOverviewHandler(req, res);

        // Assert
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: [],
          })
        );
      });
    });

    describe('Malformed Data Scenarios', () => {
      it('should handle malformed OpenSearch response for test trends', async () => {
        // Arrange - Mock malformed response (missing expected structure)
        const malformedResponse = {
          body: {
            aggregations: null, // Missing expected structure
            hits: { total: { value: 0 }, hits: [] },
          },
          statusCode: 200,
        };
        mockClient.search.mockResolvedValue(malformedResponse);
        const { req, res } = createMockRequestResponse({ days: '7' });

        // Act
        await testTrendsHandler(req, res);

        // Assert
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: [], // Should handle gracefully with empty array
          })
        );
      });

      it('should handle malformed error analysis response', async () => {
        // Arrange - Mock response with null values
        const malformedErrorResponse = {
          body: {
            aggregations: {
              failed_tests: null, // Malformed structure
            },
            hits: { total: { value: 0 }, hits: [] },
          },
          statusCode: 200,
        };
        mockClient.search.mockResolvedValue(malformedErrorResponse);
        const { req, res } = createMockRequestResponse();

        // Act
        await errorAnalysisHandler(req, res);

        // Assert
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: [],
          })
        );
      });
    });

    describe('HTTP Method Validation', () => {
      it('should reject POST requests to test trends endpoint', async () => {
        // Arrange
        const { req, res } = createMockRequestResponse({ days: '7' });
        // Override method to test rejection
        req.method = 'POST';

        // Act
        await testTrendsHandler(req, res);

        // Assert
        expect(res.status).toHaveBeenCalledWith(405);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: 'Method not allowed. Supported methods: GET',
          })
        );
      });

      it('should reject PUT requests to error analysis endpoint', async () => {
        // Arrange
        const { req, res } = createMockRequestResponse();
        // Override method to test rejection
        req.method = 'PUT';

        // Act
        await errorAnalysisHandler(req, res);

        // Assert
        expect(res.status).toHaveBeenCalledWith(405);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: 'Method not allowed. Supported methods: GET',
          })
        );
      });

      it('should reject DELETE requests to opensearch health endpoint', async () => {
        // Arrange
        const { req, res } = createMockRequestResponse();
        // Override method to test rejection
        req.method = 'DELETE';

        // Act
        await opensearchHealthHandler(req, res);

        // Assert
        expect(res.status).toHaveBeenCalledWith(405);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: 'Method not allowed. Supported methods: GET',
          })
        );
      });
    });

    describe('Query Parameter Edge Cases', () => {
      it('should handle extreme days parameter values for test trends', async () => {
        // Test with maximum allowed value
        mockClient.search.mockResolvedValue(mockTrendsResponse);
        const { req, res } = createMockRequestResponse({ days: '365' });

        await testTrendsHandler(req, res);

        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            meta: expect.objectContaining({
              daysRequested: 365,
            }),
          })
        );
      });

      it('should handle negative days parameter for test trends', async () => {
        // Arrange
        const { req, res } = createMockRequestResponse({ days: '-5' });

        // Act
        await testTrendsHandler(req, res);

        // Assert
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid days parameter. Must be between 1 and 365.',
          source: 'OpenSearch',
        });
      });

      it('should handle zero days parameter for test trends', async () => {
        // Arrange
        const { req, res } = createMockRequestResponse({ days: '0' });

        // Act
        await testTrendsHandler(req, res);

        // Assert
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid days parameter. Must be between 1 and 365.',
          source: 'OpenSearch',
        });
      });

      it('should handle days parameter exceeding maximum for test trends', async () => {
        // Arrange
        const { req, res } = createMockRequestResponse({ days: '1000' });

        // Act
        await testTrendsHandler(req, res);

        // Assert
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid days parameter. Must be between 1 and 365.',
          source: 'OpenSearch',
        });
      });

      it('should handle non-numeric days parameter for test trends', async () => {
        // Arrange
        const { req, res } = createMockRequestResponse({ days: 'invalid' });

        // Act
        await testTrendsHandler(req, res);

        // Assert
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith({
          success: false,
          error: 'Invalid days parameter. Must be between 1 and 365.',
          source: 'OpenSearch',
        });
      });
    });

    describe('OpenSearch Timeout and Network Issues', () => {
      it('should handle OpenSearch query timeouts gracefully', async () => {
        // Arrange - Mock timeout error
        mockClient.search.mockRejectedValue(new Error('Timeout waiting for response'));
        const { req, res } = createMockRequestResponse({ days: '7' });

        // Act
        await testTrendsHandler(req, res);

        // Assert
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: 'OpenSearch query execution failed',
            source: 'OpenSearch',
          })
        );
      });

      it('should handle OpenSearch network errors for error analysis', async () => {
        // Arrange - Mock network error
        mockClient.search.mockRejectedValue(new Error('ENOTFOUND opensearch-cluster'));
        const { req, res } = createMockRequestResponse();

        // Act
        await errorAnalysisHandler(req, res);

        // Assert
        expect(res.status).toHaveBeenCalledWith(500);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: 'OpenSearch query execution failed',
            source: 'OpenSearch',
          })
        );
      });

      it('should handle OpenSearch service unavailable errors', async () => {
        // Arrange - Mock service unavailable
        mockClient.cluster.health.mockRejectedValue(new Error('ECONNREFUSED'));
        const { req, res } = createMockRequestResponse();

        // Act
        await testSuiteOverviewHandler(req, res);

        // Assert
        expect(res.status).toHaveBeenCalledWith(503);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: 'OpenSearch is not accessible',
            source: 'OpenSearch',
          })
        );
      });
    });

    describe('Concurrent Request Handling', () => {
      it('should handle multiple concurrent requests to different endpoints', async () => {
        // Arrange - Mock successful responses for all endpoints
        mockClient.search.mockResolvedValue(mockTrendsResponse);
        const requests = [
          testTrendsHandler,
          errorAnalysisHandler,
          flakyTestsHandler,
          testDurationHandler,
          testSuiteOverviewHandler,
        ];

        // Act - Make concurrent requests
        const promises = requests.map(handler => {
          const { req, res } = createMockRequestResponse();
          return handler(req, res).then(() => res);
        });

        const responses = await Promise.all(promises);

        // Assert - All should succeed
        responses.forEach(res => {
          expect(res.status).toHaveBeenCalledWith(200);
        });
      });

      it('should handle concurrent requests to the same endpoint', async () => {
        // Arrange
        mockClient.search.mockResolvedValue(mockTrendsResponse);
        const concurrentCount = 5;

        // Act - Make multiple concurrent requests to test trends
        const promises = Array.from({ length: concurrentCount }, () => {
          const { req, res } = createMockRequestResponse({ days: '7' });
          return testTrendsHandler(req, res).then(() => res);
        });

        const responses = await Promise.all(promises);

        // Assert - All should succeed
        responses.forEach(res => {
          expect(res.status).toHaveBeenCalledWith(200);
          expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
              success: true,
              data: expect.any(Array),
            })
          );
        });
      });
    });

    describe('Response Format Validation', () => {
      it('should ensure consistent response format across all endpoints', async () => {
        // Arrange - Mock successful responses
        mockClient.search.mockResolvedValue(mockTrendsResponse);
        const endpoints = [
          { handler: testTrendsHandler, name: 'test-trends' },
          { handler: errorAnalysisHandler, name: 'error-analysis' },
          { handler: flakyTestsHandler, name: 'flaky-tests' },
          { handler: testDurationHandler, name: 'test-duration' },
          { handler: testSuiteOverviewHandler, name: 'test-suite-overview' },
          { handler: opensearchHealthHandler, name: 'opensearch-health' },
        ];

        // Act & Assert - Test each endpoint for consistent response format
        for (const endpoint of endpoints) {
          const { req, res } = createMockRequestResponse();
          await endpoint.handler(req, res);

          expect(res.status).toHaveBeenCalledWith(200);
          expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
              success: true,
              data: expect.anything(), // Accept any data type - Array or Object
              meta: expect.objectContaining({
                source: 'OpenSearch',
              }),
            })
          );
        }
      });

      it('should ensure consistent error response format across all endpoints', async () => {
        // Arrange - Mock connection failures
        mockClient.cluster.health.mockRejectedValue(new Error('ECONNREFUSED'));
        const endpoints = [
          testTrendsHandler,
          errorAnalysisHandler,
          flakyTestsHandler,
          testDurationHandler,
          testSuiteOverviewHandler,
        ];

        // Act & Assert - Test each endpoint for consistent error format
        for (const handler of endpoints) {
          const { req, res } = createMockRequestResponse();
          await handler(req, res);

          expect(res.status).toHaveBeenCalledWith(503);
          expect(res.json).toHaveBeenCalledWith(
            expect.objectContaining({
              success: false,
              error: expect.any(String),
              source: 'OpenSearch',
            })
          );
        }
      });
    });

    describe('Extreme Data Scenarios', () => {
      it('should handle very long error messages in error analysis', async () => {
        // Arrange - Mock response with very long error message
        const longErrorMessage = 'A'.repeat(10000); // 10KB error message
        const longErrorResponse = {
          body: {
            aggregations: {
              failed_tests: {
                failed_only: {
                  error_messages: {
                    buckets: [
                      {
                        key: longErrorMessage,
                        doc_count: 1,
                        test_names: {
                          buckets: [{ key: 'test-with-long-error' }],
                        },
                      },
                    ],
                  },
                },
              },
            },
            hits: { total: { value: 1 }, hits: [] },
          },
          statusCode: 200,
        };
        mockClient.search.mockResolvedValue(longErrorResponse);
        const { req, res } = createMockRequestResponse();

        // Act
        await errorAnalysisHandler(req, res);

        // Assert
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: expect.arrayContaining([
              expect.objectContaining({
                errorMessage: longErrorMessage,
                count: 1,
              }),
            ]),
          })
        );
      });

      it('should handle extreme test duration values', async () => {
        // Arrange - Mock response with extreme duration values
        const extremeDurationResponse = {
          body: {
            aggregations: {
              duration_ranges: {
                duration_buckets: {
                  buckets: [
                    { key: '0-1s', doc_count: 1000000 }, // Very high count
                    { key: '1-5s', doc_count: 0 }, // Zero count
                    { key: '5-10s', doc_count: 1 }, // Minimal count
                  ],
                },
                avg_duration: { value: 999999 }, // Very high average
                max_duration: { value: 3600000 }, // 1 hour
                min_duration: { value: 0.1 }, // Very low minimum
              },
            },
            hits: { total: { value: 1000001 }, hits: [] },
          },
          statusCode: 200,
        };
        mockClient.search.mockResolvedValue(extremeDurationResponse);
        const { req, res } = createMockRequestResponse();

        // Act
        await testDurationHandler(req, res);

        // Assert
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: expect.arrayContaining([
              expect.objectContaining({
                range: '0-1s',
                count: 1000000,
                avgDuration: 999999,
                maxDuration: 3600000,
                minDuration: 0.1,
              }),
            ]),
          })
        );
      });
    });

    describe('Resource Management', () => {
      it('should handle memory-intensive flaky test analysis', async () => {
        // Arrange - Mock response with many flaky tests
        const manyFlakyTests = Array.from({ length: 1000 }, (_, i) => ({
          key: `flaky-test-${i}`,
          status_distribution: {
            buckets: [
              { key: 'passed', doc_count: 50 + i },
              { key: 'failed', doc_count: 30 + i },
            ],
          },
          marked_flaky: { doc_count: 1 },
          total_runs: { value: 80 + i * 2 },
          avg_duration: { value: 1000 + i * 10 },
        }));

        const largeFlakyResponse = {
          body: {
            aggregations: {
              test_results: {
                by_test_name: {
                  buckets: manyFlakyTests,
                },
              },
            },
            hits: { total: { value: 80000 }, hits: [] },
          },
          statusCode: 200,
        };
        mockClient.search.mockResolvedValue(largeFlakyResponse);
        const { req, res } = createMockRequestResponse();

        // Act
        const startTime = Date.now();
        await flakyTestsHandler(req, res);
        const endTime = Date.now();

        // Assert - Should complete in reasonable time and return data
        expect(endTime - startTime).toBeLessThan(5000); // Should complete within 5 seconds
        expect(res.status).toHaveBeenCalledWith(200);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            data: expect.any(Array),
          })
        );
      });
    });
  });

  // Integration with Real OpenSearch Patterns
  describe('OpenSearch Integration Patterns', () => {
    it('should handle OpenSearch version compatibility issues', async () => {
      // Arrange - Mock version-specific error
      mockClient.search.mockRejectedValue(
        new Error('Unsupported aggregation syntax for OpenSearch version')
      );
      const { req, res } = createMockRequestResponse();

      // Act
      await testSuiteOverviewHandler(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'OpenSearch query execution failed',
          source: 'OpenSearch',
        })
      );
    });

    it('should handle OpenSearch cluster state changes during request', async () => {
      // Arrange - Mock cluster state change scenario with initial success then failure
      mockClient.cluster.health.mockResolvedValueOnce({
        body: { status: 'yellow' },
        statusCode: 200,
      });

      const { req, res } = createMockRequestResponse();

      // Act
      await opensearchHealthHandler(req, res);

      // Assert - Should handle the yellow status gracefully
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: expect.objectContaining({
            connected: true,
            clusterHealth: 'yellow', // Should reflect the yellow status
          }),
        })
      );
    });
  });

  // Cross-Endpoint Consistency Tests
  describe('Cross-Endpoint Consistency', () => {
    it('should maintain consistent timestamp formats across all endpoints', async () => {
      // Arrange
      mockClient.search.mockResolvedValue(mockTrendsResponse);
      const endpoints = [testTrendsHandler, testSuiteOverviewHandler, testDurationHandler];

      // Act & Assert
      for (const handler of endpoints) {
        const { req, res } = createMockRequestResponse();
        await handler(req, res);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            meta: expect.objectContaining({
              timestamp: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/), // ISO format
            }),
          })
        );
      }
    });

    it('should maintain consistent OpenSearch health status across all endpoints', async () => {
      // Arrange - All endpoints should return the same health status
      mockClient.search.mockResolvedValue(mockTrendsResponse);
      const healthCheckingEndpoints = [
        testTrendsHandler,
        errorAnalysisHandler,
        flakyTestsHandler,
        testDurationHandler,
        testSuiteOverviewHandler,
      ];

      // Act & Assert
      for (const handler of healthCheckingEndpoints) {
        const { req, res } = createMockRequestResponse();
        await handler(req, res);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            meta: expect.objectContaining({
              opensearchHealth: expect.objectContaining({
                connected: true,
                indexExists: true,
                documentsCount: 100,
                clusterHealth: 'green',
              }),
            }),
          })
        );
      }
    });
  });
});
