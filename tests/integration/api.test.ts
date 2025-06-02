// tests/integration/api.test.ts
import { v4 as uuidv4 } from 'uuid';
import { generateTestExecution } from '../utils/testDataGenerator';
import { NextApiRequest, NextApiResponse } from 'next';

// Mock dependencies first, before any imports that use them
jest.mock('keycloak-js', () => {
  return function () {
    return {};
  };
});

// Mock jose library
jest.mock('jose', () => ({
  jwtVerify: jest.fn().mockResolvedValue({
    payload: {
      sub: 'user-123',
      aud: 'scaledtest-client', // Add correct audience
      resource_access: {
        'scaledtest-client': {
          roles: ['owner', 'maintainer', 'readonly'],
        },
      },
    },
  }),
  createRemoteJWKSet: jest.fn().mockReturnValue('mocked-jwks'),
}));

// Mock the auth middleware
jest.mock('../../src/auth/apiAuth', () => ({
  validateToken: jest
    .fn()
    .mockImplementation((req: NextApiRequest, res: NextApiResponse, next: () => void) => {
      // Set authenticated user in request
      (req as any).user = {
        id: 'user-123',
        roles: ['owner', 'maintainer', 'readonly'],
      };
      // Call next to continue processing
      if (typeof next === 'function') {
        return next();
      }
      // If used as a handler wrapper, return a handler that will be called
      return (handler: (req: NextApiRequest, res: NextApiResponse) => void) => handler(req, res);
    }),
  requireRole: jest
    .fn()
    .mockImplementation(
      (role: string) => (req: NextApiRequest, res: NextApiResponse, next: () => void) => {
        if (typeof next === 'function') {
          return next();
        }
        return (handler: (req: NextApiRequest, res: NextApiResponse) => void) => handler(req, res);
      }
    ),
  // Add the withApiAuth function that's used in the API routes
  withApiAuth: jest.fn().mockImplementation((handler: any, roles?: string[]) => {
    // Return a new handler function that calls the original handler
    return async (req: NextApiRequest, res: NextApiResponse) => {
      // Add user information to the request
      (req as any).user = {
        id: 'user-123',
        roles: ['owner', 'maintainer', 'readonly'],
      };
      // Call the original handler
      return handler(req, res);
    };
  }),
}));

// Mock the UserRole enum that's used in the API routes
jest.mock('../../src/auth/keycloak', () => ({
  UserRole: {
    READONLY: 'readonly',
    MAINTAINER: 'maintainer',
    OWNER: 'owner',
  },
}));

// Now import these AFTER mocking
import { getAuthToken } from '../utils/auth';
import opensearchClient from '../../src/lib/opensearch';
import testResultsHandler from '../../src/pages/api/test-results';

jest.mock('../utils/auth');
jest.mock('../../src/lib/opensearch', () => {
  return {
    __esModule: true,
    default: {
      indices: {
        exists: jest.fn(),
        create: jest.fn(),
      },
      index: jest.fn(),
      search: jest.fn(),
    },
    TEST_RESULTS_INDEX: 'test-results',
    checkConnection: jest.fn(),
    ensureIndexExists: jest.fn(),
  };
});
jest.mock('../../src/utils/logger', () => ({
  apiLogger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
  dbLogger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
  getRequestLogger: jest.fn().mockReturnValue({
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  }),
  logError: jest.fn(),
}));

const mockGetAuthToken = getAuthToken as jest.MockedFunction<typeof getAuthToken>;
const mockOpensearchClient = opensearchClient as jest.Mocked<typeof opensearchClient>;

// Mock Next.js API request and response
const mockReq = (overrides = {}) => {
  return {
    method: 'POST',
    headers: {
      authorization: 'Bearer mock-token',
    },
    body: {},
    user: {
      id: 'user-123',
      roles: ['owner', 'maintainer', 'readonly'],
    },
    ...overrides,
  } as unknown as NextApiRequest;
};

const mockRes = () => {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
    end: jest.fn(),
    statusCode: 200,
    getHeader: jest.fn(),
    setHeader: jest.fn(),
  } as unknown as NextApiResponse;
  return res;
};

describe('API Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock authentication
    mockGetAuthToken.mockResolvedValue('mock-token');

    // Mock OpenSearch client methods
    mockOpensearchClient.indices = {
      exists: jest.fn().mockResolvedValue({ body: true }),
      create: jest.fn().mockResolvedValue({ body: { acknowledged: true } }),
    } as any;

    mockOpensearchClient.index = jest.fn().mockResolvedValue({
      body: {
        _id: 'test-id',
        result: 'created',
      },
    });

    mockOpensearchClient.cluster = {
      health: jest.fn().mockResolvedValue({ body: { status: 'green' } }),
    } as any;
  });

  describe('Test Results API', () => {
    describe('Data Validation', () => {
      it('should accept valid test execution data', async () => {
        // Arrange
        const testData = generateTestExecution();
        const req = mockReq({ body: testData });
        const res = mockRes();

        // Act
        await testResultsHandler(req, res);

        // Assert
        expect(res.status).toHaveBeenCalledWith(201);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: true,
            id: expect.any(String),
          })
        );
        expect(mockOpensearchClient.index).toHaveBeenCalled();
      });

      it('should reject data with missing required fields', async () => {
        // Arrange
        const invalidTestData = {
          id: uuidv4(),
          // Missing required fields
        };
        const req = mockReq({ body: invalidTestData });
        const res = mockRes();

        // Act
        await testResultsHandler(req, res);

        // Assert
        expect(res.status).toHaveBeenCalledWith(400);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: expect.stringContaining('Validation error'),
          })
        );
        expect(mockOpensearchClient.index).not.toHaveBeenCalled();
      });
    });

    describe('HTTP Method Handling', () => {
      it('should reject non-POST methods', async () => {
        // Arrange
        const req = mockReq({ method: 'GET' });
        const res = mockRes();

        // Act
        await testResultsHandler(req, res);

        // Assert
        expect(res.status).toHaveBeenCalledWith(405);
        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({
            success: false,
            error: expect.stringContaining('Method not allowed'),
          })
        );
      });
    });
  });
});
