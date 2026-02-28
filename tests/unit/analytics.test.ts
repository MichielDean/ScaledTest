/**
 * Tests for analytics data layer (TDD — written before implementation)
 */

jest.mock('../../src/lib/timescaledb', () => ({
  getTimescalePool: jest.fn(),
}));

jest.mock('../../src/logging/logger', () => ({
  dbLogger: {
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    child: jest.fn().mockReturnThis(),
  },
  logError: jest.fn(),
}));

import { getTimescalePool } from '../../src/lib/timescaledb';
import {
  getTestTrends,
  getFlakyTests,
  getErrorAnalysis,
  getDurationDistribution,
} from '../../src/lib/analytics';

const mockGetTimescalePool = getTimescalePool as jest.Mock;

function makeClient(rows: Record<string, unknown>[] = []) {
  const release = jest.fn();
  const query = jest.fn().mockResolvedValue({ rows });
  return { release, query };
}

function makePool(client: ReturnType<typeof makeClient>) {
  return { connect: jest.fn().mockResolvedValue(client) };
}

describe('getTestTrends', () => {
  it('returns trend points mapped from DB rows', async () => {
    const dbRow = {
      bucket: new Date('2024-01-15'),
      passed: 90,
      failed: 10,
      skipped: 0,
      total: 100,
    };
    const client = makeClient([dbRow]);
    mockGetTimescalePool.mockReturnValue(makePool(client));

    const result = await getTestTrends({ days: 30 });
    expect(result).toHaveLength(1);
    expect(result[0].date).toBe('2024-01-15');
    expect(result[0].passed).toBe(90);
    expect(result[0].passRate).toBe(90);
    expect(client.release).toHaveBeenCalled();
  });

  it('returns passRate 0 when total is 0', async () => {
    const dbRow = { bucket: new Date('2024-01-15'), passed: 0, failed: 0, skipped: 0, total: 0 };
    const client = makeClient([dbRow]);
    mockGetTimescalePool.mockReturnValue(makePool(client));

    const [point] = await getTestTrends({});
    expect(point.passRate).toBe(0);
  });

  it('applies tool filter when provided', async () => {
    const client = makeClient([]);
    mockGetTimescalePool.mockReturnValue(makePool(client));

    await getTestTrends({ tool: 'jest' });
    const sql = client.query.mock.calls[0][0] as string;
    expect(sql).toContain('tool_name');
  });

  it('throws and releases client on DB error', async () => {
    const release = jest.fn();
    const query = jest.fn().mockRejectedValue(new Error('DB down'));
    const client = { release, query };
    mockGetTimescalePool.mockReturnValue(makePool(client));

    await expect(getTestTrends({})).rejects.toThrow('DB down');
    expect(release).toHaveBeenCalled();
  });
});

describe('getFlakyTests', () => {
  it('returns flaky test results', async () => {
    const dbRow = {
      test_name: 'login test',
      suite: 'auth',
      total_runs: '10',
      passed: '7',
      failed: '3',
      avg_duration: '150.5',
    };
    const client = makeClient([dbRow]);
    mockGetTimescalePool.mockReturnValue(makePool(client));

    const result = await getFlakyTests({ days: 30 });
    expect(result).toHaveLength(1);
    expect(result[0].testName).toBe('login test');
    expect(result[0].flakyScore).toBe(30);
    expect(result[0].avgDuration).toBe(151);
  });

  it('returns empty array when no flaky tests', async () => {
    const client = makeClient([]);
    mockGetTimescalePool.mockReturnValue(makePool(client));

    const result = await getFlakyTests({});
    expect(result).toEqual([]);
  });
});

describe('getErrorAnalysis', () => {
  it('returns error analysis results', async () => {
    const dbRow = {
      error_message: 'Expected true to be false',
      count: '5',
      affected_tests: ['test-a', 'test-b'],
    };
    const client = makeClient([dbRow]);
    mockGetTimescalePool.mockReturnValue(makePool(client));

    const result = await getErrorAnalysis({});
    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(5);
    expect(result[0].affectedTests).toEqual(['test-a', 'test-b']);
  });

  it('handles null affected_tests gracefully', async () => {
    const dbRow = {
      error_message: 'Error',
      count: '1',
      affected_tests: null,
    };
    const client = makeClient([dbRow]);
    mockGetTimescalePool.mockReturnValue(makePool(client));

    const [result] = await getErrorAnalysis({});
    expect(result.affectedTests).toEqual([]);
  });
});

describe('getDurationDistribution', () => {
  it('always returns all 5 buckets even when DB has no data', async () => {
    const client = makeClient([]);
    mockGetTimescalePool.mockReturnValue(makePool(client));

    const result = await getDurationDistribution({});
    expect(result).toHaveLength(5);
    const ranges = result.map(r => r.range);
    expect(ranges).toEqual(['<100ms', '100-500ms', '500ms-2s', '2s-10s', '>10s']);
    result.forEach(bucket => {
      expect(bucket.count).toBe(0);
      expect(bucket.avgDuration).toBe(0);
    });
  });

  it('fills in actual data for existing buckets', async () => {
    const dbRow = { range: '<100ms', count: 42, avg_duration: 50 };
    const client = makeClient([dbRow]);
    mockGetTimescalePool.mockReturnValue(makePool(client));

    const result = await getDurationDistribution({});
    const fast = result.find(r => r.range === '<100ms')!;
    expect(fast.count).toBe(42);
    expect(fast.avgDuration).toBe(50);
    // Other buckets should still be 0
    const slow = result.find(r => r.range === '>10s')!;
    expect(slow.count).toBe(0);
  });
});
