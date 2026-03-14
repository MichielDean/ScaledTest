/**
 * Tests for POST /api/auth/register-with-role endpoint
 */
import type { NextApiRequest, NextApiResponse } from 'next';

// Mock auth client
const mockSignUpEmail = jest.fn();
jest.mock('../../src/lib/auth-client', () => ({
  authClient: {
    signUp: {
      email: mockSignUpEmail,
    },
  },
}));

// Mock auth admin API
const mockUpdateUser = jest.fn();
const mockDeleteUser = jest.fn();
jest.mock('../../src/lib/auth', () => ({
  authAdminApi: {
    updateUser: mockUpdateUser,
    deleteUser: mockDeleteUser,
  },
}));

// Mock logger
jest.mock('../../src/logging/logger', () => ({
  apiLogger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
}));

// Mock sanitize
jest.mock('../../src/lib/sanitize', () => ({
  sanitizeString: jest.fn((s: string) => s),
}));

import handler from '../../src/pages/api/auth/register-with-role';

function makeReqRes(method = 'POST', body: unknown = {}) {
  const mockJson = jest.fn();
  const mockStatus = jest.fn().mockReturnThis();

  const req = {
    method,
    body,
    headers: {},
  } as unknown as NextApiRequest;

  const res = {
    json: mockJson,
    status: mockStatus,
  } as unknown as NextApiResponse;

  return { req, res, mockJson, mockStatus };
}

describe('POST /api/auth/register-with-role', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // --- Method validation ---

  it('rejects non-POST methods with 405', async () => {
    const { req, res, mockStatus, mockJson } = makeReqRes('GET');
    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(405);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: 'Method not allowed' })
    );
  });

  it('rejects PUT method', async () => {
    const { req, res, mockStatus } = makeReqRes('PUT');
    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(405);
  });

  // --- Body validation ---

  it('rejects non-object body', async () => {
    const { req, res, mockStatus, mockJson } = makeReqRes('POST', 'not-an-object');
    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(400);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: 'Request body must be a JSON object' })
    );
  });

  it('rejects array body', async () => {
    const { req, res, mockStatus } = makeReqRes('POST', []);
    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(400);
  });

  it('rejects null body', async () => {
    const { req, res, mockStatus } = makeReqRes('POST', null);
    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(400);
  });

  // --- Required field validation ---

  it('rejects missing email', async () => {
    const { req, res, mockStatus, mockJson } = makeReqRes('POST', {
      password: 'password123',
      name: 'Test',
    });
    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(400);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Email, password, and name are required' })
    );
  });

  it('rejects missing password', async () => {
    const { req, res, mockStatus } = makeReqRes('POST', {
      email: 'test@example.com',
      name: 'Test',
    });
    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(400);
  });

  it('rejects missing name', async () => {
    const { req, res, mockStatus } = makeReqRes('POST', {
      email: 'test@example.com',
      password: 'password123',
    });
    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(400);
  });

  it('rejects all fields missing', async () => {
    const { req, res, mockStatus } = makeReqRes('POST', {});
    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(400);
  });

  // --- Role validation ---

  it('rejects invalid role', async () => {
    const { req, res, mockStatus, mockJson } = makeReqRes('POST', {
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User',
      role: 'superadmin',
    });
    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(400);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ message: expect.stringContaining('Invalid role') })
    );
  });

  it('accepts valid role: readonly', async () => {
    mockSignUpEmail.mockResolvedValue({ data: { user: { id: 'u1' } } });
    mockUpdateUser.mockResolvedValue({});

    const { req, res, mockStatus } = makeReqRes('POST', {
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User',
      role: 'readonly',
    });
    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(201);
    expect(mockUpdateUser).toHaveBeenCalledWith({ userId: 'u1', role: 'readonly' });
  });

  it('accepts valid role: maintainer', async () => {
    mockSignUpEmail.mockResolvedValue({ data: { user: { id: 'u2' } } });
    mockUpdateUser.mockResolvedValue({});

    const { req, res, mockStatus } = makeReqRes('POST', {
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User',
      role: 'maintainer',
    });
    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(201);
    expect(mockUpdateUser).toHaveBeenCalledWith({ userId: 'u2', role: 'maintainer' });
  });

  it('accepts valid role: owner', async () => {
    mockSignUpEmail.mockResolvedValue({ data: { user: { id: 'u3' } } });
    mockUpdateUser.mockResolvedValue({});

    const { req, res, mockStatus } = makeReqRes('POST', {
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User',
      role: 'owner',
    });
    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(201);
  });

  it('defaults to readonly when no role specified', async () => {
    mockSignUpEmail.mockResolvedValue({ data: { user: { id: 'u4' } } });
    mockUpdateUser.mockResolvedValue({});

    const { req, res, mockStatus } = makeReqRes('POST', {
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User',
    });
    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(201);
    expect(mockUpdateUser).toHaveBeenCalledWith({ userId: 'u4', role: 'readonly' });
  });

  // --- Happy path ---

  it('returns 201 with userId on success', async () => {
    mockSignUpEmail.mockResolvedValue({ data: { user: { id: 'new-user-id' } } });
    mockUpdateUser.mockResolvedValue({});

    const { req, res, mockStatus, mockJson } = makeReqRes('POST', {
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User',
    });
    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(201);
    expect(mockJson).toHaveBeenCalledWith({
      success: true,
      message: 'User registered successfully',
      userId: 'new-user-id',
    });
  });

  // --- Error handling ---

  it('returns 400 when signUp fails', async () => {
    mockSignUpEmail.mockResolvedValue({
      data: null,
      error: { message: 'Email already registered' },
    });

    const { req, res, mockStatus, mockJson } = makeReqRes('POST', {
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User',
    });
    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(400);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: 'Email already registered' })
    );
  });

  it('returns 400 with stringified error when error has no message', async () => {
    mockSignUpEmail.mockResolvedValue({
      data: null,
      error: { code: 'CONFLICT' },
    });

    const { req, res, mockStatus, mockJson } = makeReqRes('POST', {
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User',
    });
    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(400);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: expect.stringContaining('CONFLICT'),
      })
    );
  });

  it('rolls back user when role assignment fails', async () => {
    mockSignUpEmail.mockResolvedValue({ data: { user: { id: 'u-rollback' } } });
    mockUpdateUser.mockRejectedValue(new Error('role assignment failed'));
    mockDeleteUser.mockResolvedValue({});

    const { req, res, mockStatus } = makeReqRes('POST', {
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User',
      role: 'maintainer',
    });
    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(500);
    expect(mockDeleteUser).toHaveBeenCalledWith({ userId: 'u-rollback' });
  });

  it('returns 500 when admin API is unavailable', async () => {
    // Temporarily replace the mock to simulate missing admin API
    const authModule = require('../../src/lib/auth');
    const originalApi = authModule.authAdminApi;
    authModule.authAdminApi = null;

    mockSignUpEmail.mockResolvedValue({ data: { user: { id: 'u-no-admin' } } });

    const { req, res, mockStatus, mockJson } = makeReqRes('POST', {
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User',
    });
    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(500);
    expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({ success: false }));

    authModule.authAdminApi = originalApi;
  });

  it('returns 500 on unexpected error', async () => {
    mockSignUpEmail.mockRejectedValue(new Error('unexpected'));

    const { req, res, mockStatus, mockJson } = makeReqRes('POST', {
      email: 'test@example.com',
      password: 'password123',
      name: 'Test User',
    });
    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(500);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        message: 'Internal server error during registration',
      })
    );
  });
});
