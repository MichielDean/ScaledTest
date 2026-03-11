import { create } from 'zustand';

export interface TestResultEvent {
  name: string;
  status: 'passed' | 'failed' | 'skipped' | 'pending' | 'other';
  duration_ms: number;
  message?: string;
  suite?: string;
  worker_id?: string;
}

export interface ExecutionProgress {
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  completed: number;
  duration_ms: number;
  estimated_eta_seconds: number;
}

export interface WorkerStatus {
  worker_id: string;
  status: 'starting' | 'running' | 'idle' | 'completed' | 'failed';
  message?: string;
  tests_assigned: number;
  tests_completed: number;
}

interface ExecutionState {
  // Live progress for the currently viewed execution
  progress: ExecutionProgress | null;
  testResults: TestResultEvent[];
  workers: Map<string, WorkerStatus>;
  executionStatus: string | null;

  // Actions
  setProgress: (progress: ExecutionProgress) => void;
  addTestResult: (result: TestResultEvent) => void;
  updateWorker: (worker: WorkerStatus) => void;
  setExecutionStatus: (status: string) => void;
  reset: () => void;
}

export const useExecutionStore = create<ExecutionState>(set => ({
  progress: null,
  testResults: [],
  workers: new Map(),
  executionStatus: null,

  setProgress: progress => set({ progress }),

  addTestResult: result =>
    set(state => ({
      testResults: [...state.testResults, result],
    })),

  updateWorker: worker =>
    set(state => {
      const workers = new Map(state.workers);
      workers.set(worker.worker_id, worker);
      return { workers };
    }),

  setExecutionStatus: status => set({ executionStatus: status }),

  reset: () =>
    set({
      progress: null,
      testResults: [],
      workers: new Map(),
      executionStatus: null,
    }),
}));
