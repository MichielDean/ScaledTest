/**
 * Real Authentication Integration Test
 * Tests actual authentication against running Keycloak instance
 */

import { getAuthToken } from '../authentication/tokenService';
import logger from '../../src/logging/logger';

describe('Real Authentication Integration', () => {
  it('should authenticate maintainer@example.com successfully', async () => {
    const token = await getAuthToken('maintainer@example.com');
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
    logger.info('Successfully authenticated maintainer user', { tokenLength: token.length });
  });

  it('should authenticate readonly@example.com successfully', async () => {
    const token = await getAuthToken('readonly@example.com');
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
    logger.info('Successfully authenticated readonly user', { tokenLength: token.length });
  });

  it('should authenticate owner@example.com successfully', async () => {
    const token = await getAuthToken('owner@example.com');
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.length).toBeGreaterThan(0);
    logger.info('Successfully authenticated owner user', { tokenLength: token.length });
  });

  it('should fail for invalid credentials', async () => {
    await expect(getAuthToken('invalid@example.com', 'wrongpassword')).rejects.toThrow(
      'Failed to authenticate test user'
    );
  });
});
