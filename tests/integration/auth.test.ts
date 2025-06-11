import { getAuthToken } from '../utils/auth';
import axios from 'axios';

// Mock axios
jest.mock('axios');
const mockAxios = axios as jest.Mocked<typeof axios>;

describe('Authentication Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Keycloak Token Service', () => {
    it('should successfully obtain an auth token for valid credentials', async () => {
      // Arrange
      const mockTokenResponse = {
        data: {
          access_token: 'mock-access-token',
          refresh_token: 'mock-refresh-token',
          expires_in: 300,
          token_type: 'Bearer',
        },
      };

      mockAxios.post.mockResolvedValueOnce(mockTokenResponse);

      // Act
      const result = await getAuthToken('maintainer@example.com', 'password');

      // Assert
      expect(result).toBe(mockTokenResponse.data.access_token);
      expect(mockAxios.post).toHaveBeenCalledTimes(1);
      expect(mockAxios.post).toHaveBeenCalledWith(
        expect.stringContaining('/protocol/openid-connect/token'),
        expect.any(URLSearchParams),
        expect.any(Object)
      );
    });

    it('should throw an error when authentication fails', async () => {
      // Arrange
      mockAxios.post.mockRejectedValueOnce(new Error('Authentication failed'));

      // Act & Assert
      await expect(getAuthToken('invalid-user', 'wrong-password')).rejects.toThrow(
        'Failed to authenticate test user'
      );
    });

    it('should include all required parameters in the token request', async () => {
      // Arrange
      const mockTokenResponse = {
        data: {
          access_token: 'mock-access-token',
          refresh_token: 'mock-refresh-token',
          expires_in: 300,
          token_type: 'Bearer',
        },
      };

      mockAxios.post.mockResolvedValueOnce(mockTokenResponse);
      const username = 'test-user';
      const password = 'test-password';

      // Act
      await getAuthToken(username, password);

      // Assert
      const postedData = mockAxios.post.mock.calls[0][1] as URLSearchParams;
      expect(postedData.get('grant_type')).toBe('password');
      expect(postedData.get('username')).toBe(username);
      expect(postedData.get('password')).toBe(password);
    });
  });
});
