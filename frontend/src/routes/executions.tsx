import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/query-keys';
import { useWebSocket } from '../hooks/use-websocket';
import {
  useExecutionStore,
  type TestResultEvent,
  type ExecutionProgress,
  type WorkerStatus,
} from '../stores/execution-store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Execution {
  id: string;
  command: string;
  status: string;
  created_at: string;
  started_at?: string;
  finished_at?: string;
  error_msg?: string;
}

interface ExecutionsResponse {
  executions: Execution[];
  total: number;
}

// ---------------------------------------------------------------------------
// Executions Page
// ---------------------------------------------------------------------------

export function ExecutionsPage() {
  const [selectedExecution, setSelectedExecution] = useState<string | null>(null);

  const executionsQuery = useQuery({
    queryKey: queryKeys.executions.all,
    queryFn: () => api.getExecutions() as Promise<ExecutionsResponse>,
    refetchInterval: 10000,
  });

  const executions = executionsQuery.data?.executions ?? [];

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Executions</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Execution list */}
        <div className="lg:col-span-1">
          <ExecutionList
            executions={executions}
            loading={executionsQuery.isLoading}
            selected={selectedExecution}
            onSelect={setSelectedExecution}
          />
        </div>

        {/* Detail / live view */}
        <div className="lg:col-span-2">
          {selectedExecution ? (
            <ExecutionDetail executionId={selectedExecution} />
          ) : (
            <div className="rounded-lg border bg-card p-8 text-center text-muted-foreground">
              Select an execution to view real-time progress
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Execution List
// ---------------------------------------------------------------------------

function ExecutionList({
  executions,
  loading,
  selected,
  onSelect,
}: {
  executions: Execution[];
  loading: boolean;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  if (loading) {
    return (
      <div className="rounded-lg border bg-card p-6">
        <p className="text-muted-foreground">Loading executions...</p>
      </div>
    );
  }

  if (executions.length === 0) {
    return (
      <div className="rounded-lg border bg-card p-6">
        <p className="text-muted-foreground">No executions yet.</p>
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card divide-y">
      {executions.map(exec => (
        <button
          key={exec.id}
          onClick={() => onSelect(exec.id)}
          className={`w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors ${
            selected === exec.id ? 'bg-muted' : ''
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs truncate max-w-[180px]">{exec.command}</span>
            <StatusBadge status={exec.status} />
          </div>
          <p className="text-xs text-muted-foreground mt-1">{formatDate(exec.created_at)}</p>
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Execution Detail with Real-time Streaming
// ---------------------------------------------------------------------------

function ExecutionDetail({ executionId }: { executionId: string }) {
  const { lastMessage, isConnected } = useWebSocket(executionId);
  const store = useExecutionStore();

  // Reset store when switching executions
  useEffect(() => {
    store.reset();
    return () => store.reset();
  }, [executionId]); // eslint-disable-line

  // Process WebSocket messages
  useEffect(() => {
    if (!lastMessage) return;

    const { type, data } = lastMessage;

    switch (type) {
      case 'execution.progress':
        store.setProgress(data as ExecutionProgress);
        break;
      case 'execution.test_result':
        store.addTestResult(data as TestResultEvent);
        break;
      case 'execution.worker_status':
        store.updateWorker(data as WorkerStatus);
        break;
      case 'execution.status':
        store.setExecutionStatus((data as { status: string }).status);
        break;
    }
  }, [lastMessage]); // eslint-disable-line

  return (
    <div className="space-y-4">
      {/* Connection indicator */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span
          className={`inline-block w-2 h-2 rounded-full ${
            isConnected ? 'bg-green-500' : 'bg-red-500'
          }`}
        />
        {isConnected ? 'Live' : 'Disconnected'}
        <span className="font-mono">{executionId.slice(0, 8)}...</span>
      </div>

      {/* Progress bar */}
      {store.progress && <ProgressPanel progress={store.progress} />}

      {/* Worker health panel */}
      {store.workers.size > 0 && <WorkerPanel workers={store.workers} />}

      {/* Live test result feed */}
      <TestResultFeed results={store.testResults} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Progress Panel
// ---------------------------------------------------------------------------

function ProgressPanel({ progress }: { progress: ExecutionProgress }) {
  const pct = progress.total > 0 ? (progress.completed / progress.total) * 100 : 0;

  return (
    <div className="rounded-lg border bg-card p-4 space-y-3">
      <div className="flex items-center justify-between text-sm">
        <span className="font-medium">Progress</span>
        <span className="text-muted-foreground">
          {progress.completed} / {progress.total} tests
        </span>
      </div>

      {/* Progress bar */}
      <div className="w-full bg-muted rounded-full h-3 overflow-hidden">
        <div className="h-full rounded-full flex">
          {progress.total > 0 && (
            <>
              <div
                className="bg-green-500 transition-all duration-300"
                style={{ width: `${(progress.passed / progress.total) * 100}%` }}
              />
              <div
                className="bg-red-500 transition-all duration-300"
                style={{ width: `${(progress.failed / progress.total) * 100}%` }}
              />
              <div
                className="bg-yellow-500 transition-all duration-300"
                style={{ width: `${(progress.skipped / progress.total) * 100}%` }}
              />
            </>
          )}
        </div>
      </div>

      {/* Counters */}
      <div className="grid grid-cols-4 gap-2 text-center text-xs">
        <div>
          <p className="text-green-600 font-bold text-lg">{progress.passed}</p>
          <p className="text-muted-foreground">Passed</p>
        </div>
        <div>
          <p className="text-red-600 font-bold text-lg">{progress.failed}</p>
          <p className="text-muted-foreground">Failed</p>
        </div>
        <div>
          <p className="text-yellow-600 font-bold text-lg">{progress.skipped}</p>
          <p className="text-muted-foreground">Skipped</p>
        </div>
        <div>
          <p className="font-bold text-lg">{Math.round(pct)}%</p>
          <p className="text-muted-foreground">Complete</p>
        </div>
      </div>

      {/* ETA */}
      {progress.estimated_eta_seconds > 0 && (
        <p className="text-xs text-muted-foreground text-center">
          ETA: {formatETA(progress.estimated_eta_seconds)}
        </p>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Worker Panel
// ---------------------------------------------------------------------------

function WorkerPanel({ workers }: { workers: Map<string, WorkerStatus> }) {
  const workerList = Array.from(workers.values());

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="text-sm font-medium mb-3">Workers ({workerList.length})</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {workerList.map(w => (
          <div
            key={w.worker_id}
            className="flex items-center gap-2 text-xs p-2 rounded bg-muted/50"
          >
            <WorkerStatusDot status={w.status} />
            <span className="font-mono truncate">{w.worker_id}</span>
            <span className="ml-auto text-muted-foreground">
              {w.tests_completed}/{w.tests_assigned}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function WorkerStatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    starting: 'bg-yellow-400',
    running: 'bg-blue-500 animate-pulse',
    idle: 'bg-gray-400',
    completed: 'bg-green-500',
    failed: 'bg-red-500',
  };
  return (
    <span className={`inline-block w-2 h-2 rounded-full ${colors[status] ?? 'bg-gray-400'}`} />
  );
}

// ---------------------------------------------------------------------------
// Test Result Feed
// ---------------------------------------------------------------------------

function TestResultFeed({ results }: { results: TestResultEvent[] }) {
  // Show most recent results at top, limit to last 100
  const visible = results.slice(-100).reverse();

  return (
    <div className="rounded-lg border bg-card p-4">
      <h3 className="text-sm font-medium mb-3">Live Results ({results.length})</h3>

      {visible.length === 0 ? (
        <p className="text-xs text-muted-foreground">Waiting for test results...</p>
      ) : (
        <div className="max-h-80 overflow-y-auto space-y-1">
          {visible.map((r, i) => (
            <div
              key={`${r.name}-${i}`}
              className="flex items-center gap-2 text-xs py-1 border-b border-muted last:border-0"
            >
              <TestStatusIcon status={r.status} />
              <span className="font-mono truncate flex-1" title={r.name}>
                {r.name}
              </span>
              <span className="text-muted-foreground whitespace-nowrap">{r.duration_ms}ms</span>
              {r.worker_id && (
                <span className="text-muted-foreground font-mono text-[10px]">{r.worker_id}</span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function TestStatusIcon({ status }: { status: string }) {
  switch (status) {
    case 'passed':
      return <span className="text-green-600 w-4 text-center">&#10003;</span>;
    case 'failed':
      return <span className="text-red-600 w-4 text-center">&#10007;</span>;
    case 'skipped':
      return <span className="text-yellow-600 w-4 text-center">&#8212;</span>;
    default:
      return <span className="text-gray-400 w-4 text-center">&#9679;</span>;
  }
}

// ---------------------------------------------------------------------------
// Shared Helpers
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: string }) {
  const colorMap: Record<string, string> = {
    completed: 'bg-green-100 text-green-800',
    running: 'bg-blue-100 text-blue-800',
    failed: 'bg-red-100 text-red-800',
    cancelled: 'bg-yellow-100 text-yellow-800',
    pending: 'bg-gray-100 text-gray-800',
  };
  const cls = colorMap[status.toLowerCase()] ?? 'bg-gray-100 text-gray-800';
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${cls}`}>
      {status}
    </span>
  );
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatETA(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return `${mins}m ${secs}s`;
}
