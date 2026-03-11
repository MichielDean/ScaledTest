import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/query-keys';
import { useWebSocket } from '../hooks/use-websocket';

interface Execution {
  id: string;
  command: string;
  image?: string;
  status: string;
  error_msg?: string;
  started_at?: string;
  finished_at?: string;
  created_at: string;
}

interface ExecutionsResponse {
  executions: Execution[];
  total: number;
}

export function ExecutionsPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.executions.all,
    queryFn: () => api.getExecutions() as Promise<ExecutionsResponse>,
    refetchInterval: 10_000,
  });

  const { lastMessage } = useWebSocket();

  // Invalidate executions when we get a WS status update
  if (lastMessage?.type === 'execution.status') {
    void queryClient.invalidateQueries({ queryKey: queryKeys.executions.all });
  }

  const cancelMutation = useMutation({
    mutationFn: (id: string) => api.cancelExecution(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.executions.all });
    },
  });

  const executions = data?.executions ?? [];
  const selected = selectedId ? executions.find(e => e.id === selectedId) : null;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Executions</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data?.total !== undefined ? `${data.total} total` : ''}
          </p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          {showForm ? 'Cancel' : 'New Execution'}
        </button>
      </div>

      {showForm && (
        <CreateExecutionForm
          onCreated={() => {
            setShowForm(false);
            void queryClient.invalidateQueries({ queryKey: queryKeys.executions.all });
          }}
        />
      )}

      {isLoading && <p className="text-muted-foreground">Loading executions...</p>}
      {error && <p className="text-red-600">Failed to load: {(error as Error).message}</p>}

      {!isLoading && !error && executions.length === 0 && (
        <div className="rounded-lg border bg-card p-12 text-center">
          <p className="text-muted-foreground">No executions yet. Create one to get started.</p>
        </div>
      )}

      {executions.length > 0 && (
        <div className="rounded-lg border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left text-muted-foreground bg-muted/50">
                  <th className="px-4 py-3">Command</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Started</th>
                  <th className="px-4 py-3">Duration</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {executions.map(exec => (
                  <tr
                    key={exec.id}
                    className={`border-b last:border-b-0 cursor-pointer hover:bg-muted/30 transition-colors ${
                      selectedId === exec.id ? 'bg-muted/40' : ''
                    }`}
                    onClick={() => setSelectedId(selectedId === exec.id ? null : exec.id)}
                  >
                    <td className="px-4 py-3 font-mono text-xs truncate max-w-[300px]">
                      {exec.command}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={exec.status} />
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDate(exec.started_at || exec.created_at)}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {formatDuration(exec.started_at, exec.finished_at)}
                    </td>
                    <td className="px-4 py-3">
                      {(exec.status === 'running' || exec.status === 'pending') && (
                        <button
                          onClick={e => {
                            e.stopPropagation();
                            cancelMutation.mutate(exec.id);
                          }}
                          disabled={cancelMutation.isPending}
                          className="text-xs text-red-600 hover:text-red-800 font-medium"
                        >
                          Cancel
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {selected && <ExecutionDetail execution={selected} />}
    </div>
  );
}

function ExecutionDetail({ execution }: { execution: Execution }) {
  return (
    <section className="rounded-lg border bg-card p-6 space-y-4">
      <h2 className="text-lg font-semibold">Execution Detail</h2>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
        <div>
          <span className="text-muted-foreground">ID</span>
          <p className="font-mono text-xs mt-1">{execution.id}</p>
        </div>
        <div>
          <span className="text-muted-foreground">Status</span>
          <p className="mt-1">
            <StatusBadge status={execution.status} />
          </p>
        </div>
        <div>
          <span className="text-muted-foreground">Command</span>
          <p className="font-mono text-xs mt-1 break-all">{execution.command}</p>
        </div>
        {execution.image && (
          <div>
            <span className="text-muted-foreground">Image</span>
            <p className="font-mono text-xs mt-1">{execution.image}</p>
          </div>
        )}
        <div>
          <span className="text-muted-foreground">Created</span>
          <p className="mt-1">{formatDateTime(execution.created_at)}</p>
        </div>
        {execution.started_at && (
          <div>
            <span className="text-muted-foreground">Started</span>
            <p className="mt-1">{formatDateTime(execution.started_at)}</p>
          </div>
        )}
        {execution.finished_at && (
          <div>
            <span className="text-muted-foreground">Finished</span>
            <p className="mt-1">{formatDateTime(execution.finished_at)}</p>
          </div>
        )}
        {execution.error_msg && (
          <div className="col-span-2">
            <span className="text-muted-foreground">Error</span>
            <pre className="mt-1 text-xs bg-red-50 text-red-800 rounded p-3 overflow-x-auto">
              {execution.error_msg}
            </pre>
          </div>
        )}
      </div>
    </section>
  );
}

function CreateExecutionForm({ onCreated }: { onCreated: () => void }) {
  const [command, setCommand] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (cmd: string) => api.createExecution(cmd),
    onSuccess: () => onCreated(),
    onError: (err: Error) => setFormError(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const trimmed = command.trim();
    if (!trimmed) {
      setFormError('Command is required.');
      return;
    }
    createMutation.mutate(trimmed);
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border bg-card p-5 space-y-4">
      <h2 className="font-semibold text-lg">Create Execution</h2>
      <div>
        <label htmlFor="exec-cmd" className="block text-sm font-medium text-gray-700 mb-1">
          Test Command
        </label>
        <input
          id="exec-cmd"
          type="text"
          value={command}
          onChange={e => setCommand(e.target.value)}
          placeholder="e.g. npm test -- --reporter ctrf"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm font-mono focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>
      {formError && <p className="text-sm text-red-600">{formError}</p>}
      <button
        type="submit"
        disabled={createMutation.isPending}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {createMutation.isPending ? 'Creating...' : 'Create Execution'}
      </button>
    </form>
  );
}

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
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function formatDuration(start?: string, end?: string): string {
  if (!start) return '—';
  const s = new Date(start).getTime();
  const e = end ? new Date(end).getTime() : Date.now();
  const diffMs = e - s;
  if (diffMs < 1000) return `${diffMs}ms`;
  if (diffMs < 60_000) return `${(diffMs / 1000).toFixed(1)}s`;
  const mins = Math.floor(diffMs / 60_000);
  const secs = Math.floor((diffMs % 60_000) / 1000);
  return `${mins}m ${secs}s`;
}
