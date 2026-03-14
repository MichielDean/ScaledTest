import { useExecutionStore } from '../execution-store';

describe('useExecutionStore', () => {
  beforeEach(() => {
    useExecutionStore.getState().reset();
  });

  it('starts with null progress and empty collections', () => {
    const state = useExecutionStore.getState();
    expect(state.progress).toBeNull();
    expect(state.testResults).toEqual([]);
    expect(state.workers.size).toBe(0);
    expect(state.executionStatus).toBeNull();
  });

  describe('setProgress', () => {
    it('sets progress data', () => {
      const progress = {
        passed: 5,
        failed: 1,
        skipped: 0,
        total: 10,
        completed: 6,
        duration_ms: 3000,
        estimated_eta_seconds: 4,
      };
      useExecutionStore.getState().setProgress(progress);
      expect(useExecutionStore.getState().progress).toEqual(progress);
    });

    it('replaces previous progress', () => {
      const p1 = {
        passed: 1,
        failed: 0,
        skipped: 0,
        total: 5,
        completed: 1,
        duration_ms: 100,
        estimated_eta_seconds: 10,
      };
      const p2 = {
        passed: 3,
        failed: 1,
        skipped: 0,
        total: 5,
        completed: 4,
        duration_ms: 400,
        estimated_eta_seconds: 2,
      };
      useExecutionStore.getState().setProgress(p1);
      useExecutionStore.getState().setProgress(p2);
      expect(useExecutionStore.getState().progress).toEqual(p2);
    });
  });

  describe('addTestResult', () => {
    it('appends test results', () => {
      const r1 = { name: 'test-a', status: 'passed' as const, duration_ms: 100 };
      const r2 = { name: 'test-b', status: 'failed' as const, duration_ms: 200, message: 'oops' };

      useExecutionStore.getState().addTestResult(r1);
      useExecutionStore.getState().addTestResult(r2);

      const results = useExecutionStore.getState().testResults;
      expect(results).toHaveLength(2);
      expect(results[0].name).toBe('test-a');
      expect(results[1].name).toBe('test-b');
      expect(results[1].message).toBe('oops');
    });

    it('preserves order', () => {
      for (let i = 0; i < 5; i++) {
        useExecutionStore.getState().addTestResult({
          name: `test-${i}`,
          status: 'passed',
          duration_ms: i * 100,
        });
      }
      const names = useExecutionStore.getState().testResults.map(r => r.name);
      expect(names).toEqual(['test-0', 'test-1', 'test-2', 'test-3', 'test-4']);
    });
  });

  describe('updateWorker', () => {
    it('adds a new worker', () => {
      const worker = {
        worker_id: 'w-1',
        status: 'running' as const,
        tests_assigned: 10,
        tests_completed: 3,
      };
      useExecutionStore.getState().updateWorker(worker);
      expect(useExecutionStore.getState().workers.get('w-1')).toEqual(worker);
    });

    it('updates existing worker by ID', () => {
      useExecutionStore.getState().updateWorker({
        worker_id: 'w-1',
        status: 'starting',
        tests_assigned: 5,
        tests_completed: 0,
      });
      useExecutionStore.getState().updateWorker({
        worker_id: 'w-1',
        status: 'completed',
        tests_assigned: 5,
        tests_completed: 5,
      });

      const worker = useExecutionStore.getState().workers.get('w-1');
      expect(worker?.status).toBe('completed');
      expect(worker?.tests_completed).toBe(5);
    });

    it('tracks multiple workers independently', () => {
      useExecutionStore
        .getState()
        .updateWorker({
          worker_id: 'w-1',
          status: 'running',
          tests_assigned: 5,
          tests_completed: 2,
        });
      useExecutionStore
        .getState()
        .updateWorker({ worker_id: 'w-2', status: 'idle', tests_assigned: 3, tests_completed: 0 });

      expect(useExecutionStore.getState().workers.size).toBe(2);
      expect(useExecutionStore.getState().workers.get('w-1')?.status).toBe('running');
      expect(useExecutionStore.getState().workers.get('w-2')?.status).toBe('idle');
    });
  });

  describe('setExecutionStatus', () => {
    it('sets the execution status', () => {
      useExecutionStore.getState().setExecutionStatus('running');
      expect(useExecutionStore.getState().executionStatus).toBe('running');
    });

    it('updates status transitions', () => {
      useExecutionStore.getState().setExecutionStatus('pending');
      useExecutionStore.getState().setExecutionStatus('running');
      useExecutionStore.getState().setExecutionStatus('completed');
      expect(useExecutionStore.getState().executionStatus).toBe('completed');
    });
  });

  describe('reset', () => {
    it('clears all state', () => {
      // Populate state
      useExecutionStore.getState().setProgress({
        passed: 5,
        failed: 1,
        skipped: 0,
        total: 10,
        completed: 6,
        duration_ms: 3000,
        estimated_eta_seconds: 4,
      });
      useExecutionStore
        .getState()
        .addTestResult({ name: 'test', status: 'passed', duration_ms: 100 });
      useExecutionStore
        .getState()
        .updateWorker({
          worker_id: 'w-1',
          status: 'running',
          tests_assigned: 5,
          tests_completed: 2,
        });
      useExecutionStore.getState().setExecutionStatus('running');

      // Reset
      useExecutionStore.getState().reset();

      const state = useExecutionStore.getState();
      expect(state.progress).toBeNull();
      expect(state.testResults).toEqual([]);
      expect(state.workers.size).toBe(0);
      expect(state.executionStatus).toBeNull();
    });
  });
});
