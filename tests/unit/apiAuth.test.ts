// tests/unit/apiAuth.test.ts
import { NextApiRequest, NextApiResponse } from 'next';
import { withApiAuth } from '../../src/auth/apiAuth';
import { UserRole } from '../../src/auth/keycloak';

// Mock the modules
jest.mock('keycloak-js', () => {
  return function () {
    return {};
  };
});

// Mock the jose library
jest.mock('jose', () => ({
  jwtVerify: jest.fn(),
  createRemoteJWKSet: jest.fn().mockReturnValue('mocked-jwks'),
}));

import { jwtVerify } from 'jose';

describe('API Authentication Middleware', () => {
  let mockRequest: Partial<NextApiRequest>;
  let mockResponse: Partial<NextApiResponse>;
  let mockHandler: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();

    // Set up request and response mocks
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

    // Default jose mock implementation - throw error for invalid tokens
    (jwtVerify as jest.Mock).mockRejectedValue(new Error('Invalid token'));
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
          error: expect.stringContaining('No valid token'),
        })
      );
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should return 401 when token is invalid', async () => {
      // Arrange
      mockRequest.headers = {
        authorization: 'Bearer invalid-token',
      };

      // Mock jwtVerify to reject
      (jwtVerify as jest.Mock).mockRejectedValue(new Error('Invalid token'));

      const protectedHandler = withApiAuth(mockHandler, [UserRole.READONLY]);

      // Act
      await protectedHandler(mockRequest as NextApiRequest, mockResponse as NextApiResponse);

      // Assert
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          error: expect.stringContaining('Invalid token'),
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

      // Mock jwtVerify to succeed but with insufficient roles
      (jwtVerify as jest.Mock).mockResolvedValue({
        payload: {
          sub: 'user-123',
          aud: 'scaledtest-client', // Add correct audience
          resource_access: {
            'scaledtest-client': {
              roles: [UserRole.READONLY], // Only readonly role, not OWNER
            },
          },
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
          error: expect.stringContaining('Insufficient permissions'),
        })
      );
      expect(mockHandler).not.toHaveBeenCalled();
    });

    it('should call handler when user has required role', async () => {
      // Arrange
      mockRequest.headers = {
        authorization: 'Bearer valid-token',
      };

      // Mock jwtVerify to succeed with the required roles
      (jwtVerify as jest.Mock).mockResolvedValue({
        payload: {
          sub: 'user-123',
          aud: 'scaledtest-client', // Add correct audience
          resource_access: {
            'scaledtest-client': {
              roles: [UserRole.OWNER, UserRole.MAINTAINER, UserRole.READONLY],
            },
          },
        },
      });

      const protectedHandler = withApiAuth(mockHandler, [UserRole.MAINTAINER]);

      // Act
      await protectedHandler(mockRequest as NextApiRequest, mockResponse as NextApiResponse);

      // Assert
      expect(mockHandler).toHaveBeenCalled();
      expect(mockHandler).toHaveBeenCalledWith(expect.anything(), mockResponse);
    });
  });
});
