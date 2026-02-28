/**
 * Tests for executions data layer (TDD — written before implementation)
 */

// Must mock before imports
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
  createExecution,
  getExecution,
  listExecutions,
  updateExecutionStatus,
  cancelExecution,
} from '../../src/lib/executions';

const mockGetTimescalePool = getTimescalePool as jest.Mock;

// Build a fake client with controllable query
function makeClient(rows: Record<string, unknown>[] = [], total = rows.length) {
  const release = jest.fn();
  const query = jest.fn();
  return { release, query, _rows: rows, _total: total };
}

function makePool(client: ReturnType<typeof makeClient>) {
  return { connect: jest.fn().mockResolvedValue(client) };
}

const fakeRow = {
  id: 'abc-123',
  status: 'queued',
  docker_image: 'node:20',
  test_command: 'npm test',
  parallelism: 2,
  environment_vars: {},
  resource_limits: {},
  requested_by: 'user-1',
  team_id: null,
  started_at: null,
  completed_at: null,
  created_at: new Date('2024-01-01T00:00:00Z'),
  updated_at: new Date('2024-01-01T00:00:00Z'),
  kubernetes_job_name: null,
  kubernetes_namespace: 'scaledtest',
  error_message: null,
  total_pods: 0,
  completed_pods: 0,
  failed_pods: 0,
};

describe('createExecution', () => {
  it('inserts a row and returns the mapped execution', async () => {
    const client = makeClient([fakeRow]);
    client.query.mockResolvedValue({ rows: [fakeRow] });
    mockGetTimescalePool.mockReturnValue(makePool(client));

    const result = await createExecution({
      dockerImage: 'node:20',
      testCommand: 'npm test',
      parallelism: 2,
      requestedBy: 'user-1',
    });

    expect(client.query).toHaveBeenCalledTimes(1);
    expect(result.id).toBe('abc-123');
    expect(result.status).toBe('queued');
    expect(result.dockerImage).toBe('node:20');
    expect(result.parallelism).toBe(2);
    expect(client.release).toHaveBeenCalled();
  });

  it('releases the client even if query throws', async () => {
    const client = makeClient();
    client.query.mockRejectedValue(new Error('DB error'));
    mockGetTimescalePool.mockReturnValue(makePool(client));

    await expect(
      createExecution({ dockerImage: 'x', testCommand: 'y', requestedBy: 'u' })
    ).rejects.toThrow('DB error');

    expect(client.release).toHaveBeenCalled();
  });
});

describe('getExecution', () => {
  it('returns the execution when found', async () => {
    const client = makeClient([fakeRow]);
    client.query.mockResolvedValue({ rows: [fakeRow] });
    mockGetTimescalePool.mockReturnValue(makePool(client));

    const result = await getExecution('abc-123');
    expect(result).not.toBeNull();
    expect(result!.id).toBe('abc-123');
    expect(client.release).toHaveBeenCalled();
  });

  it('returns null when not found', async () => {
    const client = makeClient();
    client.query.mockResolvedValue({ rows: [] });
    mockGetTimescalePool.mockReturnValue(makePool(client));

    const result = await getExecution('no-such-id');
    expect(result).toBeNull();
  });
});

describe('listExecutions', () => {
  it('returns executions and total', async () => {
    const client = makeClient([fakeRow]);
    client.query
      .mockResolvedValueOnce({ rows: [{ total: '1' }] })
      .mockResolvedValueOnce({ rows: [fakeRow] });
    mockGetTimescalePool.mockReturnValue(makePool(client));

    const { executions, total } = await listExecutions();
    expect(total).toBe(1);
    expect(executions).toHaveLength(1);
    expect(executions[0].id).toBe('abc-123');
  });

  it('applies status filter', async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ total: '0' }] })
      .mockResolvedValueOnce({ rows: [] });
    mockGetTimescalePool.mockReturnValue(makePool(client));

    await listExecutions({ status: 'running' });

    const countCall = client.query.mock.calls[0][0] as string;
    expect(countCall).toContain('status = $1');
    expect(client.query.mock.calls[0][1]).toContain('running');
  });

  it('caps page size at 100', async () => {
    const client = makeClient();
    client.query
      .mockResolvedValueOnce({ rows: [{ total: '0' }] })
      .mockResolvedValueOnce({ rows: [] });
    mockGetTimescalePool.mockReturnValue(makePool(client));

    await listExecutions({ size: 9999 });

    // The data query should have limit = 100
    const dataCall = client.query.mock.calls[1];
    const values = dataCall[1] as number[];
    expect(values[values.length - 2]).toBe(100);
  });
});

describe('updateExecutionStatus', () => {
  it('updates status and returns mapped execution', async () => {
    const updatedRow = { ...fakeRow, status: 'running' };
    const client = makeClient([updatedRow]);
    client.query.mockResolvedValue({ rows: [updatedRow] });
    mockGetTimescalePool.mockReturnValue(makePool(client));

    const result = await updateExecutionStatus('abc-123', 'running');
    expect(result!.status).toBe('running');
  });

  it('returns null when id not found', async () => {
    const client = makeClient();
    client.query.mockResolvedValue({ rows: [] });
    mockGetTimescalePool.mockReturnValue(makePool(client));

    const result = await updateExecutionStatus('no-such', 'completed');
    expect(result).toBeNull();
  });

  it('includes extra fields in SET clause', async () => {
    const updatedRow = { ...fakeRow, status: 'running', kubernetes_job_name: 'job-xyz' };
    const client = makeClient([updatedRow]);
    client.query.mockResolvedValue({ rows: [updatedRow] });
    mockGetTimescalePool.mockReturnValue(makePool(client));

    await updateExecutionStatus('abc-123', 'running', { kubernetesJobName: 'job-xyz' });

    const sql = client.query.mock.calls[0][0] as string;
    expect(sql).toContain('kubernetes_job_name');
  });
});

describe('cancelExecution', () => {
  it('cancels a queued execution atomically (single UPDATE with WHERE status=queued)', async () => {
    const cancelledRow = { ...fakeRow, status: 'cancelled' };
    const client = makeClient([cancelledRow]);
    // First query: UPDATE ... WHERE status='queued' RETURNING * — returns the cancelled row
    client.query.mockResolvedValue({ rows: [cancelledRow], rowCount: 1 });
    mockGetTimescalePool.mockReturnValue(makePool(client));

    const result = await cancelExecution('abc-123');
    expect(result!.status).toBe('cancelled');

    // Verify we only made ONE DB call (atomic CAS, no separate read)
    expect(client.query).toHaveBeenCalledTimes(1);
    const sql = (client.query.mock.calls[0] as [string])[0].toLowerCase();
    expect(sql).toContain("status = 'cancelled'");
    expect(sql).toContain("status = 'queued'");
  });

  it('returns null when execution not found', async () => {
    const client = makeClient();
    // UPDATE returns 0 rows (not found) — then SELECT also returns 0 rows
    client.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // UPDATE attempt
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // fallback SELECT
    mockGetTimescalePool.mockReturnValue(makePool(client));

    const result = await cancelExecution('no-such');
    expect(result).toBeNull();
  });

  it('throws when execution is not in queued status (race condition handled)', async () => {
    const runningRow = { ...fakeRow, status: 'running' };
    const client = makeClient();
    // UPDATE returns 0 rows (already running, CAS failed) — fallback SELECT finds it
    client.query
      .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // UPDATE attempt — CAS failed
      .mockResolvedValueOnce({ rows: [runningRow], rowCount: 1 }); // fallback SELECT
    mockGetTimescalePool.mockReturnValue(makePool(client));

    await expect(cancelExecution('abc-123')).rejects.toThrow(
      'Cannot cancel execution in status: running'
    );
  });
});
