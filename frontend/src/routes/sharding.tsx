import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/query-keys';
import { StatusBadge } from './dashboard';

interface DurationEntry {
  id: string;
  test_name: string;
  suite: string;
  avg_duration_ms: number;
  p95_duration_ms: number;
  min_duration_ms: number;
  max_duration_ms: number;
  run_count: number;
  last_status: string;
  updated_at: string;
}

interface Shard {
  worker_id: string;
  test_names: string[];
  est_duration_ms: number;
  test_count: number;
}

interface ShardPlan {
  execution_id: string;
  total_workers: number;
  strategy: string;
  shards: Shard[];
  est_total_ms: number;
  est_wall_clock_ms: number;
}

const STRATEGIES = [
  { value: 'duration_balanced', label: 'Duration Balanced' },
  { value: 'round_robin', label: 'Round Robin' },
  { value: 'suite_grouped', label: 'Suite Grouped' },
] as const;

export function ShardingPage() {
  const [showPlanForm, setShowPlanForm] = useState(false);
  const [currentPlan, setCurrentPlan] = useState<ShardPlan | null>(null);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.sharding.durations,
    queryFn: api.getShardDurations,
  });

  const durations = (data?.durations ?? []) as DurationEntry[];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Test Sharding</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Distribute tests across parallel workers for faster execution
          </p>
        </div>
        <button
          onClick={() => setShowPlanForm(prev => !prev)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          {showPlanForm ? 'Cancel' : 'Create Shard Plan'}
        </button>
      </div>

      {showPlanForm && (
        <ShardPlanForm
          testNames={durations.map(d => d.test_name)}
          onSuccess={plan => {
            setCurrentPlan(plan);
            setShowPlanForm(false);
          }}
          onCancel={() => setShowPlanForm(false)}
        />
      )}

      {currentPlan && <ShardPlanView plan={currentPlan} onDismiss={() => setCurrentPlan(null)} />}

      <div>
        <h2 className="text-lg font-semibold mb-3">Test Duration History</h2>

        {isLoading && (
          <div className="space-y-2">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="rounded-lg border bg-card p-4 animate-pulse">
                <div className="h-4 w-64 bg-muted rounded" />
              </div>
            ))}
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
            Failed to load durations: {(error as Error).message}
          </div>
        )}

        {!isLoading && !error && durations.length === 0 && (
          <div className="rounded-lg border border-dashed bg-card p-12 text-center">
            <h3 className="font-semibold text-lg mb-1">No duration data yet</h3>
            <p className="text-muted-foreground text-sm">
              Duration history is collected automatically as test executions complete.
              Submit test results to start building history.
            </p>
          </div>
        )}

        {durations.length > 0 && (
          <div className="rounded-lg border bg-card overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Test Name</th>
                  <th className="text-left px-4 py-3 font-medium text-gray-600">Suite</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Avg (ms)</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">P95 (ms)</th>
                  <th className="text-right px-4 py-3 font-medium text-gray-600">Runs</th>
                  <th className="text-center px-4 py-3 font-medium text-gray-600">Last Status</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {durations.map(d => (
                  <tr key={d.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs truncate max-w-xs">{d.test_name}</td>
                    <td className="px-4 py-3 text-muted-foreground">{d.suite || '-'}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{d.avg_duration_ms.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{d.p95_duration_ms.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{d.run_count}</td>
                    <td className="px-4 py-3 text-center">
                      <StatusBadge status={d.last_status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

function ShardPlanForm({
  testNames,
  onSuccess,
  onCancel,
}: {
  testNames: string[];
  onSuccess: (plan: ShardPlan) => void;
  onCancel: () => void;
}) {
  const [numWorkers, setNumWorkers] = useState(2);
  const [strategy, setStrategy] = useState('duration_balanced');
  const [customTests, setCustomTests] = useState('');
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (data: { test_names: string[]; num_workers: number; strategy: string }) =>
      api.createShardPlan(data) as Promise<ShardPlan>,
    onSuccess: plan => onSuccess(plan),
    onError: (err: Error) => setFormError(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    let names = testNames;
    if (customTests.trim()) {
      names = customTests
        .split('\n')
        .map(s => s.trim())
        .filter(Boolean);
    }

    if (names.length === 0) {
      setFormError('At least one test name is required. Enter test names or submit reports to build duration history.');
      return;
    }
    if (numWorkers < 1) {
      setFormError('At least 1 worker is required.');
      return;
    }

    mutation.mutate({ test_names: names, num_workers: numWorkers, strategy });
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border bg-card p-5 space-y-4">
      <h2 className="font-semibold text-lg">Create Shard Plan</h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="sh-workers" className="block text-sm font-medium text-gray-700 mb-1">
            Number of Workers
          </label>
          <input
            id="sh-workers"
            type="number"
            min={1}
            max={100}
            value={numWorkers}
            onChange={e => setNumWorkers(Number(e.target.value))}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label htmlFor="sh-strategy" className="block text-sm font-medium text-gray-700 mb-1">
            Strategy
          </label>
          <select
            id="sh-strategy"
            value={strategy}
            onChange={e => setStrategy(e.target.value)}
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            {STRATEGIES.map(s => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div>
        <label htmlFor="sh-tests" className="block text-sm font-medium text-gray-700 mb-1">
          Test Names (one per line, or leave blank to use duration history)
        </label>
        <textarea
          id="sh-tests"
          value={customTests}
          onChange={e => setCustomTests(e.target.value)}
          placeholder={testNames.length > 0 ? `${testNames.length} tests from duration history will be used` : 'test-login\ntest-checkout\ntest-dashboard'}
          rows={4}
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 font-mono"
        />
      </div>

      {formError && <p className="text-sm text-red-600">{formError}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={mutation.isPending}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {mutation.isPending ? 'Creating...' : 'Create Plan'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function ShardPlanView({ plan, onDismiss }: { plan: ShardPlan; onDismiss: () => void }) {
  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="px-5 py-4 border-b bg-gray-50 flex items-center justify-between">
        <div>
          <h2 className="font-semibold text-lg">Shard Plan</h2>
          <div className="flex items-center gap-4 mt-1 text-sm text-muted-foreground">
            <span>Strategy: <strong>{plan.strategy}</strong></span>
            <span>Workers: <strong>{plan.total_workers}</strong></span>
            <span>Est. wall clock: <strong>{formatMs(plan.est_wall_clock_ms)}</strong></span>
            <span>Est. total: <strong>{formatMs(plan.est_total_ms)}</strong></span>
          </div>
        </div>
        <button
          onClick={onDismiss}
          className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Dismiss
        </button>
      </div>

      <div className="divide-y">
        {plan.shards.map(shard => (
          <div key={shard.worker_id} className="px-5 py-4">
            <div className="flex items-center justify-between mb-2">
              <h3 className="font-medium text-sm">
                Worker {shard.worker_id}
              </h3>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{shard.test_count} tests</span>
                <span>{formatMs(shard.est_duration_ms)}</span>
              </div>
            </div>
            {/* Duration bar */}
            <div className="h-2 rounded-full bg-gray-100 overflow-hidden mb-2">
              <div
                className="h-full rounded-full bg-blue-500"
                style={{
                  width: `${plan.est_wall_clock_ms > 0 ? Math.round((shard.est_duration_ms / plan.est_wall_clock_ms) * 100) : 0}%`,
                }}
              />
            </div>
            <div className="flex flex-wrap gap-1">
              {shard.test_names.map(name => (
                <span
                  key={name}
                  className="inline-block rounded border bg-white px-1.5 py-0.5 text-xs font-mono text-gray-600 truncate max-w-xs"
                >
                  {name}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}m`;
}
