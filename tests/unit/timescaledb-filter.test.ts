/**
 * Tests for timescaledb status filter (GIN-compatible @> operator)
 * Validates that searchCtrfReports uses @> containment not jsonb_array_elements.
 */

// Capture array at module scope so it persists across beforeEach
const capturedQueries: Array<{ text: string; values: unknown[] }> = [];

// Mock pg before any imports
jest.mock('pg', () => {
  const mockClient = {
    query: jest.fn((text: string, values: unknown[] = []) => {
      capturedQueries.push({ text, values });
      if (typeof text === 'string' && text.includes('COUNT(*)')) {
        return Promise.resolve({ rows: [{ total: '0' }] });
      }
      return Promise.resolve({ rows: [], rowCount: 0 });
    }),
    release: jest.fn(),
  };
  const MockPool = jest.fn().mockImplementation(() => ({
    connect: jest.fn().mockResolvedValue(mockClient),
    on: jest.fn(),
    end: jest.fn(),
  }));
  return { Pool: MockPool };
});

jest.mock('@/environment/env', () => ({
  getRequiredEnvVar: jest.fn((key: string) => `mock-${key}`),
  getOptionalEnvVar: jest.fn(() => undefined),
  parseIntEnvVar: jest.fn(() => 5),
}));

jest.mock('@/logging/logger', () => ({
  dbLogger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  },
  logError: jest.fn(),
}));

jest.mock('@/schemas/ctrf/ctrf', () => ({
  CtrfSchema: {},
}));

import { searchCtrfReports } from '../../src/lib/timescaledb';

describe('timescaledb status filter — GIN-compatible @> operator', () => {
  beforeEach(() => {
    // Clear captured queries between tests
    capturedQueries.length = 0;
  });

  it('status filter builds query using @> operator, not jsonb_array_elements', async () => {
    await searchCtrfReports('user-1', [], { status: 'failed' }).catch(() => {});

    const hasContainmentOp = capturedQueries.some(
      q => typeof q.text === 'string' && q.text.includes('@>')
    );
    const hasOldOp = capturedQueries.some(
      q => typeof q.text === 'string' && q.text.includes('jsonb_array_elements')
    );

    expect(hasContainmentOp).toBe(true);
    expect(hasOldOp).toBe(false);
  });

  it('status parameter is JSON.stringify({ tests: [{ status }] })', async () => {
    await searchCtrfReports('user-1', [], { status: 'failed' }).catch(() => {});

    const jsonbQuery = capturedQueries.find(
      q => typeof q.text === 'string' && q.text.includes('@>')
    );
    expect(jsonbQuery).toBeDefined();

    const expectedJson = JSON.stringify({ tests: [{ status: 'failed' }] });
    const allValues = capturedQueries.flatMap(q => q.values);
    expect(allValues).toContain(expectedJson);
  });

  it('no status filter = no @> clause in query', async () => {
    await searchCtrfReports('user-1', [], {}).catch(() => {});

    const hasContainmentOp = capturedQueries.some(
      q => typeof q.text === 'string' && q.text.includes('@>')
    );
    expect(hasContainmentOp).toBe(false);
  });
});
