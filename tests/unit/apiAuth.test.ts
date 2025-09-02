import { NextApiRequest, NextApiResponse } from 'next';
import { createBetterAuthApi, BetterAuthMethodHandler } from '../../src/auth/betterAuthApi';
import { type RoleName } from '../../src/lib/auth-shared';

type Role = RoleName;

// Backward compatibility wrapper for tests
const withApiAuth = (handler: BetterAuthMethodHandler, roles: Role[]) => {
  return createBetterAuthApi(
    { GET: handler, POST: handler, PUT: handler, DELETE: handler },
    roles[0]
  );
};

// UserRole constants for backward compatibility
const UserRole = {
  READONLY: 'readonly' as Role,
  MAINTAINER: 'maintainer' as Role,
  OWNER: 'owner' as Role,
};

// Mock the Better Auth module
jest.mock('../../src/lib/auth', () => ({
  auth: {
    api: {
      getSession: jest.fn(),
      verifyBearer: jest.fn(),
    },
  },
}));

import { auth } from '../../src/lib/auth';

describe('API Authentication Middleware', () => {
  let mockRequest: Partial<NextApiRequest>;
  let mockResponse: Partial<NextApiResponse>;
  let mockHandler: jest.Mock;
  let mockGetSession: jest.Mock;
  let mockVerifyBearer: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    mockRequest = {
      headers: {},
      method: 'GET',
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      end: jest.fn(),
    };

    mockHandler = jest.fn();

    // Get the mocked functions
    mockGetSession = auth.api.getSession as jest.Mock;
    mockVerifyBearer = auth.api.verifyBearer as jest.Mock;

    // Default mock implementation - return null (no authentication)
    mockGetSession.mockResolvedValue({ data: null });
    mockVerifyBearer.mockResolvedValue({ data: null });
  });

  describe('Authentication Validation', () => {
    it('should return 401 when no authorization header is present', async () => {
      // Arrange
      const protectedHandler = withApiAuth(mockHandler, [UserRole.READONLY]);

      // Act
      await protectedHandler(mockRequest as NextApiRequest, mockResponse as NextApiResponse);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Authentication required',
        })
      );
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should return 401 when token is invalid', async () => {
      // Arrange
      mockRequest.headers = {
        authorization: 'Bearer invalid-token',
      };

      // Mock session and bearer token to fail
      mockGetSession.mockResolvedValue({ data: null });
      mockVerifyBearer.mockResolvedValue({ data: null });

      const protectedHandler = withApiAuth(mockHandler, [UserRole.READONLY]);

      // Act
      await protectedHandler(mockRequest as NextApiRequest, mockResponse as NextApiResponse);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Authentication required',
        })
      );
      expect(mockHandler).not.toHaveBeenCalled();
    });
  });

  describe('Authorization Validation', () => {
    it('should return 403 when user lacks required role', async () => {
      // Arrange
      mockRequest.headers = {
        authorization: 'Bearer valid-token',
      };

      // Mock session to return user with readonly role
      mockGetSession.mockResolvedValue({
        user: {
          id: 'user-123',
          email: 'user@example.com',
          name: 'Test User',
          role: UserRole.READONLY,
        },
      });

      const protectedHandler = withApiAuth(mockHandler, [UserRole.OWNER]);

      // Act
      await protectedHandler(mockRequest as NextApiRequest, mockResponse as NextApiResponse);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: 'Access denied. Required role: owner',
        })
      );
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should call handler when user has required role', async () => {
      // Arrange
      mockRequest.headers = {
        authorization: 'Bearer valid-token',
      };

      // Mock session to return user with maintainer role
      mockGetSession.mockResolvedValue({
        user: {
          id: 'user-123',
          email: 'maintainer@example.com',
          name: 'Test Maintainer',
          role: UserRole.MAINTAINER,
        },
      });

      const protectedHandler = withApiAuth(mockHandler, [UserRole.MAINTAINER]);

      // Act
      await protectedHandler(mockRequest as NextApiRequest, mockResponse as NextApiResponse);

      // Assert
      expect(mockHandler).toHaveBeenCalled();
      expect(mockHandler).toHaveBeenCalledWith(expect.anything(), mockResponse, expect.anything());
    });
  });
});
