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

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  apiLogger: {
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

// Mock OpenSearch analytics functions
const mockGetTestTrendsFromOpenSearch = jest.fn();
const mockGetErrorAnalysisFromOpenSearch = jest.fn();
const mockGetFlakyTestsFromOpenSearch = jest.fn();
const mockGetTestDurationAnalysisFromOpenSearch = jest.fn();
const mockGetTestSuiteOverviewFromOpenSearch = jest.fn();
const mockGetOpenSearchHealthStatus = jest.fn();

jest.mock('../../src/lib/opensearchAnalytics', () => ({
  getTestTrendsFromOpenSearch: mockGetTestTrendsFromOpenSearch,
  getErrorAnalysisFromOpenSearch: mockGetErrorAnalysisFromOpenSearch,
  getFlakyTestsFromOpenSearch: mockGetFlakyTestsFromOpenSearch,
  getTestDurationAnalysisFromOpenSearch: mockGetTestDurationAnalysisFromOpenSearch,
  getTestSuiteOverviewFromOpenSearch: mockGetTestSuiteOverviewFromOpenSearch,
  getOpenSearchHealthStatus: mockGetOpenSearchHealthStatus,
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

// Mock health status for successful scenarios
const mockHealthyStatus = {
  connected: true,
  indexExists: true,
  documentsCount: 100,
  clusterHealth: 'green',
};

const mockUnhealthyStatus = {
  connected: false,
  indexExists: false,
  documentsCount: 0,
  clusterHealth: 'red',
};

describe('Analytics API Endpoints', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default to healthy state
    mockGetOpenSearchHealthStatus.mockResolvedValue(mockHealthyStatus);
  });

  describe('Test Trends API (/api/analytics/test-trends)', () => {
    const mockTestTrendsData = [
      {
        date: '2025-06-08 10:00',
        total: 100,
        passed: 90,
        failed: 8,
        skipped: 2,
        passRate: 90.0,
      },
      {
        date: '2025-06-08 16:30',
        total: 95,
        passed: 85,
        failed: 7,
        skipped: 3,
        passRate: 89.47,
      },
    ];

    it('should return test trends data with default 30 days', async () => {
      // Arrange
      mockGetTestTrendsFromOpenSearch.mockResolvedValue(mockTestTrendsData);
      const { req, res } = createMockRequestResponse();

      // Act
      await testTrendsHandler(req, res);

      // Assert
      expect(mockGetTestTrendsFromOpenSearch).toHaveBeenCalledWith(30);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockTestTrendsData,
        meta: {
          source: 'OpenSearch',
          index: 'ctrf-reports',
          daysRequested: 30,
          timestamp: expect.any(String),
          opensearchHealth: mockHealthyStatus,
        },
      });
    });

    it('should return test trends data with custom days parameter', async () => {
      // Arrange
      mockGetTestTrendsFromOpenSearch.mockResolvedValue(mockTestTrendsData);
      const { req, res } = createMockRequestResponse({ days: '7' });

      // Act
      await testTrendsHandler(req, res);

      // Assert
      expect(mockGetTestTrendsFromOpenSearch).toHaveBeenCalledWith(7);
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          data: mockTestTrendsData,
          meta: expect.objectContaining({
            daysRequested: 7,
          }),
        })
      );
    });

    it('should return 400 for invalid days parameter (too low)', async () => {
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

    it('should return 400 for invalid days parameter (too high)', async () => {
      // Arrange
      const { req, res } = createMockRequestResponse({ days: '400' });

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

    it('should return 400 for non-numeric days parameter', async () => {
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

    it('should return 503 when OpenSearch is not connected', async () => {
      // Arrange
      mockGetOpenSearchHealthStatus.mockResolvedValue({
        ...mockHealthyStatus,
        connected: false,
      });
      const { req, res } = createMockRequestResponse();

      // Act
      await testTrendsHandler(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'OpenSearch is not accessible',
        source: 'OpenSearch',
        details: 'Cannot connect to OpenSearch cluster',
      });
    });

    it('should handle OpenSearch query errors', async () => {
      // Arrange
      mockGetTestTrendsFromOpenSearch.mockRejectedValue(
        new Error('OpenSearch query failed: Invalid aggregation')
      );
      const { req, res } = createMockRequestResponse();

      // Act
      await testTrendsHandler(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'OpenSearch query execution failed',
        source: 'OpenSearch',
        details: 'OpenSearch query failed: Invalid aggregation',
      });
    });

    it('should handle OpenSearch connection errors', async () => {
      // Arrange
      mockGetTestTrendsFromOpenSearch.mockRejectedValue(
        new Error('ECONNREFUSED - Connection refused')
      );
      const { req, res } = createMockRequestResponse();

      // Act
      await testTrendsHandler(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'OpenSearch service is unavailable',
        source: 'OpenSearch',
        details: 'Cannot connect to OpenSearch cluster',
      });
    });
  });

  describe('Error Analysis API (/api/analytics/error-analysis)', () => {
    const mockErrorAnalysisData = [
      {
        errorMessage: 'Test timeout after 5000ms',
        count: 15,
        affectedTests: ['test-1', 'test-2'],
        firstSeen: '2025-06-01T00:00:00Z',
        lastSeen: '2025-06-08T00:00:00Z',
      },
      {
        errorMessage: 'Element not found: .submit-button',
        count: 8,
        affectedTests: ['test-3', 'test-4'],
        firstSeen: '2025-06-02T00:00:00Z',
        lastSeen: '2025-06-07T00:00:00Z',
      },
    ];

    it('should return error analysis data successfully', async () => {
      // Arrange
      mockGetErrorAnalysisFromOpenSearch.mockResolvedValue(mockErrorAnalysisData);
      const { req, res } = createMockRequestResponse();

      // Act
      await errorAnalysisHandler(req, res);

      // Assert
      expect(mockGetErrorAnalysisFromOpenSearch).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockErrorAnalysisData,
        meta: {
          source: 'OpenSearch',
          index: 'ctrf-reports',
          timestamp: expect.any(String),
          opensearchHealth: mockHealthyStatus,
        },
      });
    });

    it('should return 503 when OpenSearch is not connected', async () => {
      // Arrange
      mockGetOpenSearchHealthStatus.mockResolvedValue(mockUnhealthyStatus);
      const { req, res } = createMockRequestResponse();

      // Act
      await errorAnalysisHandler(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'OpenSearch is not accessible',
        source: 'OpenSearch',
        details: 'Cannot connect to OpenSearch cluster',
      });
    });
  });

  describe('Flaky Tests API (/api/analytics/flaky-tests)', () => {
    const mockFlakyTestsData = [
      {
        testName: 'should login successfully',
        totalRuns: 100,
        passed: 85,
        failed: 15,
        skipped: 0,
        flakyScore: 15.0,
        isMarkedFlaky: true,
      },
      {
        testName: 'should load dashboard',
        totalRuns: 50,
        passed: 48,
        failed: 2,
        skipped: 0,
        flakyScore: 4.0,
        isMarkedFlaky: false,
      },
    ];

    it('should return flaky tests data successfully', async () => {
      // Arrange
      mockGetFlakyTestsFromOpenSearch.mockResolvedValue(mockFlakyTestsData);
      const { req, res } = createMockRequestResponse();

      // Act
      await flakyTestsHandler(req, res);

      // Assert
      expect(mockGetFlakyTestsFromOpenSearch).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockFlakyTestsData,
        meta: {
          source: 'OpenSearch',
          index: 'ctrf-reports',
          timestamp: expect.any(String),
          opensearchHealth: mockHealthyStatus,
        },
      });
    });
  });

  describe('Test Duration Analysis API (/api/analytics/test-duration)', () => {
    const mockTestDurationData = [
      {
        range: '0-1s',
        count: 50,
        avgDuration: 0.5,
        maxDuration: 0.9,
        minDuration: 0.1,
      },
      {
        range: '1-5s',
        count: 30,
        avgDuration: 2.5,
        maxDuration: 4.8,
        minDuration: 1.1,
      },
    ];

    it('should return test duration analysis data successfully', async () => {
      // Arrange
      mockGetTestDurationAnalysisFromOpenSearch.mockResolvedValue(mockTestDurationData);
      const { req, res } = createMockRequestResponse();

      // Act
      await testDurationHandler(req, res);

      // Assert
      expect(mockGetTestDurationAnalysisFromOpenSearch).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockTestDurationData,
        meta: {
          source: 'OpenSearch',
          index: 'ctrf-reports',
          timestamp: expect.any(String),
          opensearchHealth: mockHealthyStatus,
        },
      });
    });
  });

  describe('Test Suite Overview API (/api/analytics/test-suite-overview)', () => {
    const mockTestSuiteData = [
      {
        name: 'auth.test.ts',
        total: 25,
        passed: 23,
        failed: 2,
        skipped: 0,
        avgDuration: 1.5,
      },
      {
        name: 'dashboard.test.ts',
        total: 15,
        passed: 15,
        failed: 0,
        skipped: 0,
        avgDuration: 2.1,
      },
    ];

    it('should return test suite overview data successfully', async () => {
      // Arrange
      mockGetTestSuiteOverviewFromOpenSearch.mockResolvedValue(mockTestSuiteData);
      const { req, res } = createMockRequestResponse();

      // Act
      await testSuiteOverviewHandler(req, res);

      // Assert
      expect(mockGetTestSuiteOverviewFromOpenSearch).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: mockTestSuiteData,
        meta: {
          source: 'OpenSearch',
          index: 'ctrf-reports',
          timestamp: expect.any(String),
          opensearchHealth: mockHealthyStatus,
        },
      });
    });
  });

  describe('OpenSearch Health API (/api/analytics/opensearch-health)', () => {
    it('should return OpenSearch health status successfully', async () => {
      // Arrange
      const { req, res } = createMockRequestResponse();

      // Act
      await opensearchHealthHandler(req, res);

      // Assert
      expect(mockGetOpenSearchHealthStatus).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith({
        success: true,
        data: {
          ...mockHealthyStatus,
          index: 'ctrf-reports',
          timestamp: expect.any(String),
        },
        meta: {
          source: 'OpenSearch',
          endpoint: 'Health Check',
        },
      });
    });

    it('should handle OpenSearch health check errors', async () => {
      // Arrange
      mockGetOpenSearchHealthStatus.mockRejectedValue(new Error('Health check failed'));
      const { req, res } = createMockRequestResponse();

      // Act
      await opensearchHealthHandler(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(500);
      expect(res.json).toHaveBeenCalledWith({
        success: false,
        error: 'Failed to check OpenSearch health',
        source: 'OpenSearch',
        details: 'Health check failed',
      });
    });
  });

  describe('HTTP Method Validation', () => {
    it('should return 405 for non-GET requests on test-trends', async () => {
      // Arrange
      const { req, res } = createMockRequestResponse();
      req.method = 'POST';

      // Act
      await testTrendsHandler(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(405);
    });

    it('should return 405 for non-GET requests on error-analysis', async () => {
      // Arrange
      const { req, res } = createMockRequestResponse();
      req.method = 'PUT';

      // Act
      await errorAnalysisHandler(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(405);
    });

    it('should return 405 for non-GET requests on flaky-tests', async () => {
      // Arrange
      const { req, res } = createMockRequestResponse();
      req.method = 'DELETE';

      // Act
      await flakyTestsHandler(req, res);

      // Assert
      expect(res.status).toHaveBeenCalledWith(405);
    });
  });
});
