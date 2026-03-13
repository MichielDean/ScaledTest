/**
 * Tests for GET /api/v1/health endpoint
 * Written BEFORE implementation per TDD requirement.
 */
import type { NextApiRequest, NextApiResponse } from 'next';

// Mock timescaledb
const mockPoolQuery = jest.fn();
const mockPoolConnect = jest.fn();
const mockPool = {
  query: mockPoolQuery,
  connect: mockPoolConnect,
  totalCount: 10,
  idleCount: 5,
  waitingCount: 0,
};

jest.mock('../../src/lib/timescaledb', () => ({
  getTimescalePool: jest.fn(() => mockPool),
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

import handler from '../../src/pages/api/v1/health';

function makeReqRes(method = 'GET') {
  const mockJson = jest.fn();
  const mockStatus = jest.fn().mockReturnThis();

  const req = {
    headers: {},
    method,
  } as unknown as NextApiRequest;

  const res = {
    json: mockJson,
    status: mockStatus,
  } as unknown as NextApiResponse;

  return { req, res, mockJson, mockStatus };
}

describe('GET /api/v1/health', () => {
  const mockClientRelease = jest.fn();
  const mockClientQuery = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockPoolConnect.mockResolvedValue({
      query: mockClientQuery,
      release: mockClientRelease,
    });
  });

  it('returns healthy status when DB is reachable and TimescaleDB is installed', async () => {
    // DB connectivity check
    mockClientQuery
      .mockResolvedValueOnce({ rows: [{ result: 1 }] }) // SELECT 1
      .mockResolvedValueOnce({
        rows: [{ extversion: '2.11.1' }],
      }); // TimescaleDB extension check

    const { req, res, mockJson } = makeReqRes();
    await handler(req, res);

    expect(mockJson).toHaveBeenCalledWith({
      success: true,
      data: {
        status: 'healthy',
      },
    });
  });

  it('returns degraded status when DB is reachable but TimescaleDB extension is missing', async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [{ result: 1 }] }) // SELECT 1
      .mockResolvedValueOnce({ rows: [] }); // no extension

    const { req, res, mockJson } = makeReqRes();
    await handler(req, res);

    expect(mockJson).toHaveBeenCalledWith({
      success: true,
      data: {
        status: 'degraded',
      },
    });
  });

  it('returns unhealthy status when DB connection fails', async () => {
    mockPoolConnect.mockRejectedValue(new Error('Connection refused'));

    const { req, res, mockJson, mockStatus } = makeReqRes();
    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(503);
    expect(mockJson).toHaveBeenCalledWith({
      success: false,
      data: {
        status: 'unhealthy',
      },
    });
  });

  it('returns 405 for non-GET methods', async () => {
    const { req, res, mockJson, mockStatus } = makeReqRes('POST');
    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(405);
    expect(mockJson).toHaveBeenCalledWith({
      success: false,
      error: 'Method POST not allowed',
    });
  });

  it('releases client even when TimescaleDB extension query fails', async () => {
    mockClientQuery
      .mockResolvedValueOnce({ rows: [{ result: 1 }] }) // SELECT 1
      .mockRejectedValueOnce(new Error('query failed')); // extension check fails

    const { req, res, mockJson } = makeReqRes();
    await handler(req, res);

    expect(mockClientRelease).toHaveBeenCalled();
    // Should still return degraded since DB connected but extension check failed
    // Response only includes status (no internal DB details exposed)
    expect(mockJson).toHaveBeenCalledWith({
      success: true,
      data: {
        status: 'degraded',
      },
    });
  });
});
