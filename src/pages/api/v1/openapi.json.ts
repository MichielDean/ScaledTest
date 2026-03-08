/**
 * GET /api/v1/openapi.json — OpenAPI 3.0 specification for all v1 endpoints
 *
 * Serves a machine-readable API spec for all /api/v1/* routes.
 * Auth: any authenticated user (readonly+)
 *
 * This spec is built at call time (deterministic, no runtime DB queries).
 */
import type { NextApiResponse } from 'next';
import { createBetterAuthApi, type BetterAuthenticatedRequest } from '@/auth/betterAuthApi';

// ── Types ─────────────────────────────────────────────────────────────────────

interface OpenApiInfo {
  title: string;
  description: string;
  version: string;
  contact?: { name: string; url?: string };
}

interface OpenApiSecurityScheme {
  type: string;
  scheme: string;
  bearerFormat?: string;
  description?: string;
}

interface OpenApiComponents {
  securitySchemes?: Record<string, OpenApiSecurityScheme>;
  schemas?: Record<string, unknown>;
}

interface OpenApiOperation {
  summary: string;
  description?: string;
  tags?: string[];
  security?: Array<Record<string, string[]>>;
  parameters?: unknown[];
  requestBody?: unknown;
  responses: Record<string, unknown>;
}

interface OpenApiPathItem {
  get?: OpenApiOperation;
  post?: OpenApiOperation;
  put?: OpenApiOperation;
  delete?: OpenApiOperation;
  patch?: OpenApiOperation;
  parameters?: unknown[];
}

export interface OpenApiSpec {
  openapi: string;
  info: OpenApiInfo;
  tags: Array<{ name: string; description: string }>;
  paths: Record<string, OpenApiPathItem>;
  components?: OpenApiComponents;
}

// ── Shared response shapes ────────────────────────────────────────────────────

const SUCCESS_200 = {
  description: 'Success',
  content: { 'application/json': { schema: { $ref: '#/components/schemas/SuccessResponse' } } },
};

const ERROR_400 = { description: 'Bad request — validation error' };
const ERROR_401 = { description: 'Authentication required' };
const ERROR_403 = { description: 'Insufficient permissions' };
const ERROR_404 = { description: 'Resource not found' };
const ERROR_409 = { description: 'Conflict — resource in an incompatible state' };
const ERROR_503 = { description: 'Database unavailable' };

const BEARER_SECURITY = [{ BearerAuth: [] as string[] }];

// ── Common parameters ─────────────────────────────────────────────────────────

const PARAM_DAYS = {
  name: 'days',
  in: 'query',
  description: 'Time window in days (1–365, default 30)',
  schema: { type: 'integer', minimum: 1, maximum: 365, default: 30 },
};

const PARAM_PAGE = {
  name: 'page',
  in: 'query',
  description: 'Page number (1-based)',
  schema: { type: 'integer', minimum: 1, default: 1 },
};

const PARAM_SIZE = {
  name: 'size',
  in: 'query',
  description: 'Page size (1–100, default 20)',
  schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
};

// ── Spec builder ──────────────────────────────────────────────────────────────

export function buildOpenApiSpec(): OpenApiSpec {
  return {
    openapi: '3.0.3',
    info: {
      title: 'ScaledTest API',
      description:
        'REST API for the ScaledTest distributed test execution platform. ' +
        'All endpoints require authentication via Bearer token or session cookie. ' +
        'Three roles exist: readonly (default), maintainer, and owner.',
      version: '1.0.0',
      contact: { name: 'ScaledTest', url: 'https://github.com/MichielDean/ScaledTest' },
    },
    tags: [
      { name: 'Stats', description: 'Dashboard summary statistics' },
      { name: 'Reports', description: 'CTRF test report ingestion and retrieval' },
      { name: 'Executions', description: 'Distributed test execution management' },
      { name: 'Teams', description: 'Team management and API tokens' },
      { name: 'Analytics', description: 'Trends, flaky-test detection, error analysis' },
      { name: 'Admin', description: 'User and role administration (owner only)' },
    ],
    components: {
      securitySchemes: {
        BearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT or opaque token',
          description:
            'Use a session bearer token from Better Auth, or a ScaledTest CI token (sct_*) ' +
            'created via POST /api/v1/teams/{teamId}/tokens.',
        },
      },
      schemas: {
        SuccessResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', enum: [true] },
            data: { description: 'Response payload (shape varies by endpoint)' },
          },
          required: ['success'],
        },
        ErrorResponse: {
          type: 'object',
          properties: {
            success: { type: 'boolean', enum: [false] },
            error: { type: 'string' },
            details: { description: 'Optional validation details' },
          },
          required: ['success', 'error'],
        },
        Pagination: {
          type: 'object',
          properties: {
            page: { type: 'integer' },
            size: { type: 'integer' },
            total: { type: 'integer' },
          },
          required: ['page', 'size', 'total'],
        },
        ExecutionStatus: {
          type: 'string',
          enum: ['queued', 'running', 'completed', 'cancelled', 'failed'],
        },
        TestExecution: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            dockerImage: { type: 'string' },
            testCommand: { type: 'string' },
            parallelism: { type: 'integer', minimum: 1, maximum: 50 },
            status: { $ref: '#/components/schemas/ExecutionStatus' },
            requestedBy: { type: 'string' },
            teamId: { type: 'string', format: 'uuid', nullable: true },
            createdAt: { type: 'string', format: 'date-time' },
            updatedAt: { type: 'string', format: 'date-time' },
            totalPods: { type: 'integer' },
            completedPods: { type: 'integer' },
            failedPods: { type: 'integer' },
          },
        },
        ApiToken: {
          type: 'object',
          properties: {
            id: { type: 'string', format: 'uuid' },
            name: { type: 'string' },
            tokenPrefix: { type: 'string', description: 'First 8 chars, shown for identification' },
            teamId: { type: 'string', format: 'uuid' },
            createdByUserId: { type: 'string' },
            createdAt: { type: 'string', format: 'date-time' },
            lastUsedAt: { type: 'string', format: 'date-time', nullable: true },
            expiresAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },
      },
    },
    paths: {
      // ── Stats ──────────────────────────────────────────────────────────────
      '/api/v1/stats': {
        get: {
          tags: ['Stats'],
          summary: 'Get dashboard summary statistics',
          description: 'Returns aggregated counts and pass rate with a 60-second in-memory cache.',
          security: BEARER_SECURITY,
          responses: {
            '200': {
              description: 'Stats retrieved successfully',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'object',
                        properties: {
                          totalReports: { type: 'integer' },
                          totalTests: { type: 'integer' },
                          passRateLast7d: { type: 'integer', description: 'Percentage 0–100' },
                          totalExecutions: { type: 'integer' },
                          activeExecutions: { type: 'integer' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '401': ERROR_401,
          },
        },
      },

      // ── Reports ────────────────────────────────────────────────────────────
      '/api/v1/reports': {
        get: {
          tags: ['Reports'],
          summary: 'List CTRF test reports',
          description: 'Returns paginated CTRF test reports with optional filters.',
          security: BEARER_SECURITY,
          parameters: [
            PARAM_PAGE,
            PARAM_SIZE,
            { name: 'tool', in: 'query', schema: { type: 'string' } },
            { name: 'environment', in: 'query', schema: { type: 'string' } },
            { name: 'dateFrom', in: 'query', schema: { type: 'string', format: 'date-time' } },
            { name: 'dateTo', in: 'query', schema: { type: 'string', format: 'date-time' } },
          ],
          responses: {
            '200': SUCCESS_200,
            '401': ERROR_401,
            '503': ERROR_503,
          },
        },
        post: {
          tags: ['Reports'],
          summary: 'Submit a CTRF test report',
          description:
            'Ingests a CTRF-format test report. Requires maintainer role or a ScaledTest CI token.',
          security: BEARER_SECURITY,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  description: 'CTRF report payload (see https://ctrf.io/)',
                  properties: {
                    reportFormat: { type: 'string' },
                    specVersion: { type: 'string' },
                    results: { type: 'object' },
                  },
                  required: ['reportFormat', 'specVersion', 'results'],
                },
              },
            },
          },
          responses: {
            '200': { description: 'Report stored successfully' },
            '400': ERROR_400,
            '401': ERROR_401,
            '503': ERROR_503,
          },
        },
      },

      // ── Executions ─────────────────────────────────────────────────────────
      '/api/v1/executions': {
        get: {
          tags: ['Executions'],
          summary: 'List test executions',
          description: 'Returns paginated list of test executions with optional filters.',
          security: BEARER_SECURITY,
          parameters: [
            PARAM_PAGE,
            PARAM_SIZE,
            {
              name: 'status',
              in: 'query',
              schema: { $ref: '#/components/schemas/ExecutionStatus' },
            },
            { name: 'teamId', in: 'query', schema: { type: 'string', format: 'uuid' } },
            { name: 'requestedBy', in: 'query', schema: { type: 'string' } },
            { name: 'dateFrom', in: 'query', schema: { type: 'string', format: 'date-time' } },
            { name: 'dateTo', in: 'query', schema: { type: 'string', format: 'date-time' } },
          ],
          responses: {
            '200': SUCCESS_200,
            '401': ERROR_401,
            '503': ERROR_503,
          },
        },
        post: {
          tags: ['Executions'],
          summary: 'Create a new test execution',
          description:
            'Dispatches a distributed test run. Requires maintainer role. ' +
            'Creates Kubernetes Jobs equal to the parallelism count.',
          security: BEARER_SECURITY,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    dockerImage: { type: 'string', description: 'Docker image to run' },
                    testCommand: {
                      type: 'string',
                      maxLength: 1000,
                      description: 'Command to run inside the container',
                    },
                    parallelism: {
                      type: 'integer',
                      minimum: 1,
                      maximum: 50,
                      default: 1,
                      description: 'Number of parallel pods',
                    },
                    environmentVars: {
                      type: 'object',
                      additionalProperties: { type: 'string' },
                      default: {},
                    },
                    resourceLimits: {
                      type: 'object',
                      properties: {
                        cpu: { type: 'string', example: '500m' },
                        memory: { type: 'string', example: '512Mi' },
                      },
                    },
                    teamId: { type: 'string', format: 'uuid' },
                  },
                  required: ['dockerImage', 'testCommand'],
                },
              },
            },
          },
          responses: {
            '201': { description: 'Execution created' },
            '400': ERROR_400,
            '401': ERROR_401,
            '403': ERROR_403,
            '503': ERROR_503,
          },
        },
      },

      '/api/v1/executions/active': {
        get: {
          tags: ['Executions'],
          summary: 'Get count of active executions',
          description: 'Returns the number of executions currently in queued or running state.',
          security: BEARER_SECURITY,
          parameters: [
            {
              name: 'teamId',
              in: 'query',
              description: 'Filter to a specific team',
              schema: { type: 'string', format: 'uuid' },
            },
          ],
          responses: {
            '200': {
              description: 'Active execution count',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'object',
                        properties: {
                          activeExecutions: { type: 'integer' },
                        },
                      },
                    },
                  },
                },
              },
            },
            '400': ERROR_400,
            '401': ERROR_401,
            '503': ERROR_503,
          },
        },
      },

      '/api/v1/executions/{id}': {
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Execution UUID',
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        get: {
          tags: ['Executions'],
          summary: 'Get execution detail',
          description:
            'Returns full execution detail including pod progress and linked report IDs.',
          security: BEARER_SECURITY,
          responses: {
            '200': SUCCESS_200,
            '400': ERROR_400,
            '401': ERROR_401,
            '404': ERROR_404,
            '503': ERROR_503,
          },
        },
        delete: {
          tags: ['Executions'],
          summary: 'Cancel an execution',
          description: 'Cancels a queued or running execution. Requires owner role.',
          security: BEARER_SECURITY,
          responses: {
            '200': SUCCESS_200,
            '400': ERROR_400,
            '401': ERROR_401,
            '403': ERROR_403,
            '404': ERROR_404,
            '409': ERROR_409,
            '503': ERROR_503,
          },
        },
      },

      '/api/v1/executions/{id}/results': {
        parameters: [
          {
            name: 'id',
            in: 'path',
            required: true,
            description: 'Execution UUID',
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        post: {
          tags: ['Executions'],
          summary: 'Submit worker test results',
          description:
            'Worker pods call this endpoint after completing a test run. ' +
            'Authentication uses a shared worker bearer token (WORKER_TOKEN env var), ' +
            'NOT the standard user Bearer token.',
          security: [{ BearerAuth: [] }],
          requestBody: {
            required: true,
            description: 'CTRF test report from the worker pod',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  description: 'CTRF report payload',
                },
              },
            },
          },
          responses: {
            '200': {
              description: 'Results stored; execution progress updated',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      reportId: { type: 'string', format: 'uuid' },
                    },
                  },
                },
              },
            },
            '400': ERROR_400,
            '401': ERROR_401,
            '404': ERROR_404,
            '409': ERROR_409,
            '503': ERROR_503,
          },
        },
      },

      // ── Teams ──────────────────────────────────────────────────────────────
      '/api/v1/teams': {
        get: {
          tags: ['Teams'],
          summary: 'List teams',
          description: "Returns the authenticated user's accessible teams.",
          security: BEARER_SECURITY,
          responses: {
            '200': SUCCESS_200,
            '401': ERROR_401,
            '503': ERROR_503,
          },
        },
      },

      '/api/v1/teams/{teamId}/tokens': {
        parameters: [
          {
            name: 'teamId',
            in: 'path',
            required: true,
            description: 'Team UUID',
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        get: {
          tags: ['Teams'],
          summary: 'List API tokens for a team',
          description: 'Returns all non-revoked API tokens for the team. Requires maintainer+.',
          security: BEARER_SECURITY,
          responses: {
            '200': {
              description: 'Token list (raw secret is never returned here)',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        type: 'array',
                        items: { $ref: '#/components/schemas/ApiToken' },
                      },
                    },
                  },
                },
              },
            },
            '400': ERROR_400,
            '401': ERROR_401,
            '403': ERROR_403,
          },
        },
        post: {
          tags: ['Teams'],
          summary: 'Create an API token for a team',
          description:
            'Creates a new ScaledTest CI token (sct_*). ' +
            'The raw token is returned exactly once in the response; store it securely. ' +
            'Requires maintainer+.',
          security: BEARER_SECURITY,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string', description: 'Human-readable token name' },
                    expiresAt: {
                      type: 'string',
                      format: 'date-time',
                      description: 'Optional expiry (must be in the future)',
                    },
                  },
                  required: ['name'],
                },
              },
            },
          },
          responses: {
            '201': {
              description: 'Token created — raw secret in response.data.token',
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    properties: {
                      success: { type: 'boolean' },
                      data: {
                        allOf: [
                          { $ref: '#/components/schemas/ApiToken' },
                          {
                            type: 'object',
                            properties: {
                              token: {
                                type: 'string',
                                description: 'Raw token — shown ONCE, store immediately',
                              },
                            },
                          },
                        ],
                      },
                    },
                  },
                },
              },
            },
            '400': ERROR_400,
            '401': ERROR_401,
            '403': ERROR_403,
          },
        },
      },

      '/api/v1/teams/{teamId}/tokens/{tokenId}': {
        parameters: [
          {
            name: 'teamId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
          {
            name: 'tokenId',
            in: 'path',
            required: true,
            schema: { type: 'string', format: 'uuid' },
          },
        ],
        delete: {
          tags: ['Teams'],
          summary: 'Revoke an API token',
          description:
            'Permanently revokes a CI token. Requires maintainer+. Deleted tokens cannot be restored.',
          security: BEARER_SECURITY,
          responses: {
            '200': { description: 'Token revoked' },
            '400': ERROR_400,
            '401': ERROR_401,
            '403': ERROR_403,
            '404': ERROR_404,
          },
        },
      },

      // ── Analytics ──────────────────────────────────────────────────────────
      '/api/v1/analytics/trends': {
        get: {
          tags: ['Analytics'],
          summary: 'Get pass rate trends',
          description: 'Returns daily pass rate over the given time window.',
          security: BEARER_SECURITY,
          parameters: [
            PARAM_DAYS,
            { name: 'tool', in: 'query', schema: { type: 'string' } },
            { name: 'environment', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            '200': SUCCESS_200,
            '400': ERROR_400,
            '401': ERROR_401,
            '503': ERROR_503,
          },
        },
      },

      '/api/v1/analytics/flaky-tests': {
        get: {
          tags: ['Analytics'],
          summary: 'Detect flaky tests',
          description:
            'Returns tests that both passed and failed within the time window (min runs filter applies).',
          security: BEARER_SECURITY,
          parameters: [
            PARAM_DAYS,
            {
              name: 'minRuns',
              in: 'query',
              description: 'Minimum number of runs to consider (default 3)',
              schema: { type: 'integer', minimum: 1, default: 3 },
            },
          ],
          responses: {
            '200': SUCCESS_200,
            '400': ERROR_400,
            '401': ERROR_401,
            '503': ERROR_503,
          },
        },
      },

      '/api/v1/analytics/error-analysis': {
        get: {
          tags: ['Analytics'],
          summary: 'Analyse test errors',
          description: 'Returns grouped error messages and affected test names.',
          security: BEARER_SECURITY,
          parameters: [
            PARAM_DAYS,
            {
              name: 'limit',
              in: 'query',
              description: 'Max error groups to return (1–100, default 20)',
              schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
            },
          ],
          responses: {
            '200': SUCCESS_200,
            '400': ERROR_400,
            '401': ERROR_401,
            '503': ERROR_503,
          },
        },
      },

      '/api/v1/analytics/duration-distribution': {
        get: {
          tags: ['Analytics'],
          summary: 'Get test duration distribution',
          description: 'Returns a bucketed histogram of test durations.',
          security: BEARER_SECURITY,
          parameters: [PARAM_DAYS, { name: 'tool', in: 'query', schema: { type: 'string' } }],
          responses: {
            '200': SUCCESS_200,
            '400': ERROR_400,
            '401': ERROR_401,
            '503': ERROR_503,
          },
        },
      },

      // ── Admin ──────────────────────────────────────────────────────────────
      '/api/v1/admin/users': {
        get: {
          tags: ['Admin'],
          summary: 'List all users',
          description: 'Returns paginated user list with roles. Requires owner.',
          security: BEARER_SECURITY,
          parameters: [
            PARAM_PAGE,
            PARAM_SIZE,
            { name: 'search', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            '200': SUCCESS_200,
            '401': ERROR_401,
            '403': ERROR_403,
          },
        },
      },

      '/api/v1/admin/user-roles': {
        get: {
          tags: ['Admin'],
          summary: "Get a user's role",
          description: 'Returns the current role for a given userId. Requires owner.',
          security: BEARER_SECURITY,
          parameters: [{ name: 'userId', in: 'query', required: true, schema: { type: 'string' } }],
          responses: {
            '200': SUCCESS_200,
            '400': ERROR_400,
            '401': ERROR_401,
            '403': ERROR_403,
          },
        },
        post: {
          tags: ['Admin'],
          summary: 'Set a user role',
          description:
            'Assigns a role to a user. Requires owner. Valid roles: readonly, maintainer, owner.',
          security: BEARER_SECURITY,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    userId: { type: 'string' },
                    role: { type: 'string', enum: ['readonly', 'maintainer', 'owner'] },
                  },
                  required: ['userId', 'role'],
                },
              },
            },
          },
          responses: {
            '200': SUCCESS_200,
            '400': ERROR_400,
            '401': ERROR_401,
            '403': ERROR_403,
          },
        },
      },

      '/api/v1/admin/user-teams': {
        get: {
          tags: ['Admin'],
          summary: 'List team memberships for a user',
          description: 'Returns all teams a user belongs to. Requires owner.',
          security: BEARER_SECURITY,
          parameters: [{ name: 'userId', in: 'query', required: true, schema: { type: 'string' } }],
          responses: {
            '200': SUCCESS_200,
            '400': ERROR_400,
            '401': ERROR_401,
            '403': ERROR_403,
          },
        },
        post: {
          tags: ['Admin'],
          summary: 'Assign a user to a team',
          description: 'Adds a user to a team. Requires owner.',
          security: BEARER_SECURITY,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    userId: { type: 'string' },
                    teamId: { type: 'string', format: 'uuid' },
                  },
                  required: ['userId', 'teamId'],
                },
              },
            },
          },
          responses: {
            '200': SUCCESS_200,
            '400': ERROR_400,
            '401': ERROR_401,
            '403': ERROR_403,
          },
        },
        delete: {
          tags: ['Admin'],
          summary: 'Remove a user from a team',
          description: 'Removes a team membership. Requires owner.',
          security: BEARER_SECURITY,
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    userId: { type: 'string' },
                    teamId: { type: 'string', format: 'uuid' },
                  },
                  required: ['userId', 'teamId'],
                },
              },
            },
          },
          responses: {
            '200': SUCCESS_200,
            '400': ERROR_400,
            '401': ERROR_401,
            '403': ERROR_403,
          },
        },
      },
    },
  };
}

// ── HTTP handler ──────────────────────────────────────────────────────────────

export default createBetterAuthApi({
  GET: async (_req: BetterAuthenticatedRequest, res: NextApiResponse) => {
    return res.json(buildOpenApiSpec());
  },
});
