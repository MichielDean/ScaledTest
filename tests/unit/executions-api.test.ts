/**
 * Tests for POST/GET /api/v1/executions (TDD — written before implementation)
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

// Mock executions module
jest.mock('../../src/lib/executions', () => ({
  createExecution: jest.fn(),
  listExecutions: jest.fn(),
  getExecution: jest.fn(),
  cancelExecution: jest.fn(),
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
  dbLogger: {
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
import { createExecution, listExecutions } from '../../src/lib/executions';

const mockGetSession = auth.api.getSession as unknown as jest.Mock;
const mockCreateExecution = createExecution as jest.Mock;
const mockListExecutions = listExecutions as jest.Mock;

function makeReqRes(
  method: string,
  body: unknown = {},
  query: Record<string, string> = {},
  headers: Record<string, string> = {}
) {
  const mockJson = jest.fn();
  const mockStatus = jest.fn().mockReturnValue({ json: mockJson, end: jest.fn() });

  const req = {
    method,
    body,
    query,
    headers: { authorization: 'Bearer test-token', ...headers },
  } as unknown as NextApiRequest;

  const res = {
    status: mockStatus,
    json: mockJson,
    setHeader: jest.fn(),
  } as unknown as NextApiResponse;

  return { req, res, mockJson, mockStatus };
}

function setupAuthUser(role: 'owner' | 'maintainer' | 'readonly') {
  mockGetSession.mockResolvedValue({
    user: { id: 'user-1', email: 'test@example.com', name: 'Test', role },
  });
}

const fakeExecution = {
  id: 'exec-123',
  status: 'queued',
  dockerImage: 'node:20',
  testCommand: 'npm test',
  parallelism: 1,
  environmentVars: {},
  resourceLimits: {},
  requestedBy: 'user-1',
  teamId: null,
  startedAt: null,
  completedAt: null,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  kubernetesJobName: null,
  kubernetesNamespace: 'scaledtest',
  errorMessage: null,
  totalPods: 0,
  completedPods: 0,
  failedPods: 0,
};

describe('POST /api/v1/executions', () => {
  let handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>;

  beforeAll(async () => {
    const mod = await import('../../src/pages/api/v1/executions/index');
    handler = mod.default;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null);
    const { req, res, mockStatus } = makeReqRes('POST', {
      dockerImage: 'node:20',
      testCommand: 'npm test',
    });

    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(401);
  });

  it('returns 403 for readonly user', async () => {
    setupAuthUser('readonly');
    const { req, res, mockStatus } = makeReqRes('POST', {
      dockerImage: 'node:20',
      testCommand: 'npm test',
    });

    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(403);
  });

  it('returns 400 when dockerImage has shell injection chars', async () => {
    setupAuthUser('maintainer');
    const { req, res, mockStatus } = makeReqRes('POST', {
      dockerImage: 'node:20; rm -rf /',
      testCommand: 'npm test',
    });

    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(400);
  });

  it('returns 400 when dockerImage starts with invalid char', async () => {
    setupAuthUser('maintainer');
    const { req, res, mockStatus } = makeReqRes('POST', {
      dockerImage: '-bad-image',
      testCommand: 'npm test',
    });

    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(400);
  });

  it('returns 400 when parallelism is out of range (> 50)', async () => {
    setupAuthUser('maintainer');
    const { req, res, mockStatus } = makeReqRes('POST', {
      dockerImage: 'node:20',
      testCommand: 'npm test',
      parallelism: 51,
    });

    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(400);
  });

  it('returns 400 when parallelism is < 1', async () => {
    setupAuthUser('maintainer');
    const { req, res, mockStatus } = makeReqRes('POST', {
      dockerImage: 'node:20',
      testCommand: 'npm test',
      parallelism: 0,
    });

    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(400);
  });

  it('returns 201 with valid body for maintainer', async () => {
    setupAuthUser('maintainer');
    mockCreateExecution.mockResolvedValue(fakeExecution);
    const { req, res, mockStatus, mockJson } = makeReqRes('POST', {
      dockerImage: 'node:20',
      testCommand: 'npm test',
      parallelism: 2,
    });

    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(201);
    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: fakeExecution })
    );
  });

  it('returns 201 with valid body for owner', async () => {
    setupAuthUser('owner');
    mockCreateExecution.mockResolvedValue(fakeExecution);
    const { req, res, mockStatus } = makeReqRes('POST', {
      dockerImage: 'nginx:alpine',
      testCommand: 'npm test',
    });

    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(201);
  });

  it('returns 503 on DB error', async () => {
    setupAuthUser('maintainer');
    mockCreateExecution.mockRejectedValue(new Error('DB connection failed'));
    const { req, res, mockStatus } = makeReqRes('POST', {
      dockerImage: 'node:20',
      testCommand: 'npm test',
    });

    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(503);
  });
});

describe('GET /api/v1/executions', () => {
  let handler: (req: NextApiRequest, res: NextApiResponse) => Promise<void>;

  beforeAll(async () => {
    const mod = await import('../../src/pages/api/v1/executions/index');
    handler = mod.default;
  });

  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns 401 when not authenticated', async () => {
    mockGetSession.mockResolvedValue(null);
    const { req, res, mockStatus } = makeReqRes('GET');

    await handler(req, res);

    expect(mockStatus).toHaveBeenCalledWith(401);
  });

  it('returns paginated list for authenticated user', async () => {
    setupAuthUser('readonly');
    mockListExecutions.mockResolvedValue({ executions: [fakeExecution], total: 1 });
    const { req, res, mockJson } = makeReqRes('GET', {}, { page: '1', size: '20' });

    await handler(req, res);

    expect(mockJson).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: [fakeExecution],
        total: 1,
      })
    );
  });
});
