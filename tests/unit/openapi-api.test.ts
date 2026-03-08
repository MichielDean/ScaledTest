/**
 * Tests for GET /api/v1/openapi.json — OpenAPI 3.0 spec endpoint
 * TDD: written before implementation.
 */
import type { NextApiRequest, NextApiResponse } from 'next';

// Mock auth
jest.mock('../../src/lib/auth', () => ({
  auth: {
    api: {
      getSession: jest.fn(),
    },
  },
}));

// Mock logger
jest.mock('../../src/logging/logger', () => ({
  apiLogger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
  logError: jest.fn(),
  getRequestLogger: jest.fn(() => ({
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  })),
}));

import { auth } from '../../src/lib/auth';
import handler, { buildOpenApiSpec } from '../../src/pages/api/v1/openapi.json';

const mockGetSession = auth.api.getSession as unknown as jest.Mock;

function makeReqRes(method = 'GET', headers: Record<string, string> = {}) {
  const mockJson = jest.fn();
  const mockStatus = jest.fn().mockReturnThis();
  const mockSetHeader = jest.fn();

  const req = {
    method,
    headers: { authorization: 'Bearer test-token', ...headers },
    query: {},
  } as unknown as NextApiRequest;

  const res = {
    status: mockStatus,
    json: mockJson,
    setHeader: mockSetHeader,
  } as unknown as NextApiResponse;

  return { req, res, mockJson, mockStatus, mockSetHeader };
}

function makeAuthedSession() {
  return {
    user: { id: 'user-1', email: 'test@example.com', role: 'readonly' },
    session: { id: 'session-1' },
  };
}

beforeEach(() => {
  jest.clearAllMocks();
});

// ── buildOpenApiSpec unit tests ───────────────────────────────────────────────

describe('buildOpenApiSpec()', () => {
  it('returns an object with openapi version 3.0.x', () => {
    const spec = buildOpenApiSpec();
    expect(spec.openapi).toMatch(/^3\.0\./);
  });

  it('has info block with title and version', () => {
    const spec = buildOpenApiSpec();
    expect(spec.info).toBeDefined();
    expect(typeof spec.info.title).toBe('string');
    expect(spec.info.title.length).toBeGreaterThan(0);
    expect(typeof spec.info.version).toBe('string');
    expect(spec.info.version.length).toBeGreaterThan(0);
  });

  it('has paths object', () => {
    const spec = buildOpenApiSpec();
    expect(spec.paths).toBeDefined();
    expect(typeof spec.paths).toBe('object');
  });

  it('documents GET /api/v1/stats', () => {
    const spec = buildOpenApiSpec();
    expect(spec.paths['/api/v1/stats']).toBeDefined();
    expect(spec.paths['/api/v1/stats'].get).toBeDefined();
  });

  it('documents GET /api/v1/reports', () => {
    const spec = buildOpenApiSpec();
    expect(spec.paths['/api/v1/reports']).toBeDefined();
    expect(spec.paths['/api/v1/reports'].get).toBeDefined();
  });

  it('documents POST /api/v1/reports', () => {
    const spec = buildOpenApiSpec();
    expect(spec.paths['/api/v1/reports'].post).toBeDefined();
  });

  it('documents GET /api/v1/executions', () => {
    const spec = buildOpenApiSpec();
    expect(spec.paths['/api/v1/executions']).toBeDefined();
    expect(spec.paths['/api/v1/executions'].get).toBeDefined();
  });

  it('documents POST /api/v1/executions', () => {
    const spec = buildOpenApiSpec();
    expect(spec.paths['/api/v1/executions'].post).toBeDefined();
  });

  it('documents GET /api/v1/executions/{id}', () => {
    const spec = buildOpenApiSpec();
    expect(spec.paths['/api/v1/executions/{id}']).toBeDefined();
    expect(spec.paths['/api/v1/executions/{id}'].get).toBeDefined();
  });

  it('documents DELETE /api/v1/executions/{id}', () => {
    const spec = buildOpenApiSpec();
    expect(spec.paths['/api/v1/executions/{id}'].delete).toBeDefined();
  });

  it('documents POST /api/v1/executions/{id}/results', () => {
    const spec = buildOpenApiSpec();
    expect(spec.paths['/api/v1/executions/{id}/results']).toBeDefined();
    expect(spec.paths['/api/v1/executions/{id}/results'].post).toBeDefined();
  });

  it('documents GET /api/v1/executions/active', () => {
    const spec = buildOpenApiSpec();
    expect(spec.paths['/api/v1/executions/active']).toBeDefined();
    expect(spec.paths['/api/v1/executions/active'].get).toBeDefined();
  });

  it('documents GET /api/v1/teams', () => {
    const spec = buildOpenApiSpec();
    expect(spec.paths['/api/v1/teams']).toBeDefined();
    expect(spec.paths['/api/v1/teams'].get).toBeDefined();
  });

  it('documents GET and POST /api/v1/teams/{teamId}/tokens', () => {
    const spec = buildOpenApiSpec();
    expect(spec.paths['/api/v1/teams/{teamId}/tokens']).toBeDefined();
    expect(spec.paths['/api/v1/teams/{teamId}/tokens'].get).toBeDefined();
    expect(spec.paths['/api/v1/teams/{teamId}/tokens'].post).toBeDefined();
  });

  it('documents DELETE /api/v1/teams/{teamId}/tokens/{tokenId}', () => {
    const spec = buildOpenApiSpec();
    expect(spec.paths['/api/v1/teams/{teamId}/tokens/{tokenId}']).toBeDefined();
    expect(spec.paths['/api/v1/teams/{teamId}/tokens/{tokenId}'].delete).toBeDefined();
  });

  it('documents analytics endpoints', () => {
    const spec = buildOpenApiSpec();
    expect(spec.paths['/api/v1/analytics/trends']).toBeDefined();
    expect(spec.paths['/api/v1/analytics/flaky-tests']).toBeDefined();
    expect(spec.paths['/api/v1/analytics/error-analysis']).toBeDefined();
    expect(spec.paths['/api/v1/analytics/duration-distribution']).toBeDefined();
  });

  it('documents admin endpoints', () => {
    const spec = buildOpenApiSpec();
    expect(spec.paths['/api/v1/admin/users']).toBeDefined();
    expect(spec.paths['/api/v1/admin/user-roles']).toBeDefined();
    expect(spec.paths['/api/v1/admin/user-teams']).toBeDefined();
  });

  it('has components.securitySchemes with BearerAuth', () => {
    const spec = buildOpenApiSpec();
    expect(spec.components).toBeDefined();
    expect(spec.components!.securitySchemes).toBeDefined();
    expect(spec.components!.securitySchemes!['BearerAuth']).toBeDefined();
    expect(spec.components!.securitySchemes!['BearerAuth'].type).toBe('http');
    expect(spec.components!.securitySchemes!['BearerAuth'].scheme).toBe('bearer');
  });

  it('each path operation has a summary', () => {
    const spec = buildOpenApiSpec();
    const METHODS = ['get', 'post', 'put', 'delete', 'patch'] as const;
    for (const pathItem of Object.values(spec.paths)) {
      for (const method of METHODS) {
        const op = (pathItem as Record<string, unknown>)[method] as
          | { summary?: string }
          | undefined;
        if (op) {
          expect(typeof op.summary).toBe('string');
          expect((op.summary as string).length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('each path operation has at least one response defined', () => {
    const spec = buildOpenApiSpec();
    const METHODS = ['get', 'post', 'put', 'delete', 'patch'] as const;
    for (const pathItem of Object.values(spec.paths)) {
      for (const method of METHODS) {
        const op = (pathItem as Record<string, unknown>)[method] as
          | { responses?: Record<string, unknown> }
          | undefined;
        if (op) {
          expect(op.responses).toBeDefined();
          expect(Object.keys(op.responses!).length).toBeGreaterThan(0);
        }
      }
    }
  });

  it('includes tags for logical grouping', () => {
    const spec = buildOpenApiSpec();
    expect(Array.isArray(spec.tags)).toBe(true);
    expect((spec.tags as unknown[]).length).toBeGreaterThan(0);
  });
});

// ── HTTP handler tests ────────────────────────────────────────────────────────

describe('GET /api/v1/openapi.json handler', () => {
  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValueOnce(null);
    const { req, res, mockStatus, mockJson } = makeReqRes();
    await handler(req, res);
    expect(mockStatus).toHaveBeenCalledWith(401);
    expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('returns 200 with valid OpenAPI spec when authenticated', async () => {
    mockGetSession.mockResolvedValueOnce(makeAuthedSession());
    const { req, res, mockJson } = makeReqRes();
    await handler(req, res);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        openapi: expect.stringMatching(/^3\.0\./),
        info: expect.objectContaining({ title: expect.any(String) }),
        paths: expect.any(Object),
      })
    );
  });

  it('returns 405 for non-GET methods', async () => {
    mockGetSession.mockResolvedValueOnce(makeAuthedSession());
    const { req, res, mockStatus, mockJson } = makeReqRes('POST');
    await handler(req, res);
    expect(mockStatus).toHaveBeenCalledWith(405);
    expect(mockJson).toHaveBeenCalledWith(expect.objectContaining({ success: false }));
  });

  it('spec is deterministic — same result on each call', () => {
    const spec1 = buildOpenApiSpec();
    const spec2 = buildOpenApiSpec();
    expect(JSON.stringify(spec1)).toBe(JSON.stringify(spec2));
  });
});
