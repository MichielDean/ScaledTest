import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Play } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useAuth } from '@/hooks/useAuth';
import type { TestExecution, ExecutionStatus } from '@/lib/executions';
import CreateExecutionModal from '@/components/shared/CreateExecutionModal';

function relativeTime(isoString: string): string {
  const diff = Date.now() - new Date(isoString).getTime();
  const secs = Math.floor(diff / 1000);
  if (secs < 60) return `${secs}s ago`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} min${mins !== 1 ? 's' : ''} ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hr${hrs !== 1 ? 's' : ''} ago`;
  return new Date(isoString).toLocaleDateString();
}

function statusBadgeVariant(
  status: ExecutionStatus
): 'default' | 'secondary' | 'destructive' | 'outline' {
  switch (status) {
    case 'completed':
      return 'default';
    case 'failed':
      return 'destructive';
    case 'cancelled':
      return 'secondary';
    default:
      return 'outline';
  }
}

function statusColor(status: ExecutionStatus): string {
  switch (status) {
    case 'queued':
      return 'text-blue-600';
    case 'running':
      return 'text-yellow-600';
    case 'completed':
      return 'text-green-600';
    case 'failed':
      return 'text-red-500';
    case 'cancelled':
      return 'text-gray-500';
  }
}

const PAGE_SIZE = 20;

const ExecutionsView: React.FC = () => {
  const { token, hasRole } = useAuth();
  const [executions, setExecutions] = useState<TestExecution[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [cancelTarget, setCancelTarget] = useState<TestExecution | null>(null);
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const isMaintainer = hasRole('maintainer');
  const isOwner = hasRole('owner');

  const fetchExecutions = useCallback(
    async (p = page) => {
      try {
        const res = await fetch(`/api/v1/executions?page=${p}&size=${PAGE_SIZE}`, {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
        const json = (await res.json()) as {
          success: boolean;
          data: TestExecution[];
          total: number;
        };
        setExecutions(json.data ?? []);
        setTotal(json.total ?? 0);
        setError(null);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load executions');
      } finally {
        setLoading(false);
      }
    },
    [page, token]
  );

  // Initial fetch
  useEffect(() => {
    setLoading(true);
    void fetchExecutions(page);
  }, [fetchExecutions, page]);

  // Poll every 5s when active executions exist
  useEffect(() => {
    const hasActive = executions.some(e => e.status === 'queued' || e.status === 'running');

    if (hasActive) {
      pollTimer.current = setTimeout(() => {
        void fetchExecutions(page);
      }, 5000);
    }

    return () => {
      if (pollTimer.current) clearTimeout(pollTimer.current);
    };
  }, [executions, fetchExecutions, page]);

  const handleCancel = async () => {
    if (!cancelTarget) return;
    try {
      await fetch(`/api/v1/executions/${cancelTarget.id}`, {
        method: 'DELETE',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      setCancelTarget(null);
      void fetchExecutions(page);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Cancel failed');
    }
  };

  // Status counts
  const statusCounts = executions.reduce(
    (acc, e) => {
      acc[e.status] = (acc[e.status] ?? 0) + 1;
      return acc;
    },
    {} as Record<ExecutionStatus, number>
  );

  const totalPages = Math.ceil(total / PAGE_SIZE);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Test Executions</h1>
        {isMaintainer && (
          <Button onClick={() => setShowCreateModal(true)}>
            <Play className="mr-2 h-4 w-4" />
            Run Tests
          </Button>
        )}
      </div>

      {/* Status summary badges */}
      {executions.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {(Object.entries(statusCounts) as [ExecutionStatus, number][]).map(([status, count]) => (
            <Badge
              key={status}
              variant={statusBadgeVariant(status)}
              className={statusColor(status)}
            >
              {status}: {count}
            </Badge>
          ))}
        </div>
      )}

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle>Executions</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : error ? (
            <div className="py-8 text-center text-sm text-destructive">{error}</div>
          ) : executions.length === 0 ? (
            <div className="py-12 text-center">
              <p className="mb-4 text-muted-foreground">No executions yet</p>
              {isMaintainer && (
                <Button variant="outline" onClick={() => setShowCreateModal(true)}>
                  Run your first test
                </Button>
              )}
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="pb-2 pr-3">ID</th>
                    <th className="pb-2 pr-3">Status</th>
                    <th className="pb-2 pr-3">Docker Image</th>
                    <th className="pb-2 pr-3">Command</th>
                    <th className="pb-2 pr-3">Parallelism</th>
                    <th className="pb-2 pr-3">Pods</th>
                    <th className="pb-2 pr-3">Created</th>
                    {isOwner && <th className="pb-2">Actions</th>}
                  </tr>
                </thead>
                <tbody>
                  {executions.map(execution => (
                    <tr key={execution.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-mono text-xs">{execution.id.slice(0, 8)}</td>
                      <td className="py-2 pr-3">
                        <Badge
                          variant={statusBadgeVariant(execution.status)}
                          className={statusColor(execution.status)}
                        >
                          {execution.status}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3 font-mono text-xs">{execution.dockerImage}</td>
                      <td className="py-2 pr-3 font-mono text-xs">
                        {execution.testCommand.length > 50
                          ? `${execution.testCommand.slice(0, 50)}…`
                          : execution.testCommand}
                      </td>
                      <td className="py-2 pr-3">{execution.parallelism}</td>
                      <td className="py-2 pr-3">
                        {execution.completedPods}/{execution.totalPods}
                      </td>
                      <td className="py-2 pr-3 text-muted-foreground">
                        {relativeTime(execution.createdAt)}
                      </td>
                      {isOwner && (
                        <td className="py-2">
                          {execution.status === 'queued' && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setCancelTarget(execution)}
                            >
                              Cancel
                            </Button>
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-4 flex justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
              >
                Previous
              </Button>
              <span className="flex items-center px-3 text-sm">
                {page} / {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage(p => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Cancel confirm dialog */}
      <AlertDialog open={!!cancelTarget} onOpenChange={open => !open && setCancelTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel Execution</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to cancel execution{' '}
              <code className="font-mono text-xs">{cancelTarget?.id.slice(0, 8)}</code>? This cannot
              be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setCancelTarget(null)}>Keep</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleCancel()}>
              Cancel Execution
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Create execution modal */}
      {showCreateModal && (
        <CreateExecutionModal
          open={showCreateModal}
          onClose={() => setShowCreateModal(false)}
          onSuccess={() => {
            setShowCreateModal(false);
            void fetchExecutions(1);
          }}
        />
      )}
    </div>
  );
};

export default ExecutionsView;
