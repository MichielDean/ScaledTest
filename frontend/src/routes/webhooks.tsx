import { useState } from 'react';
import { useQuery, useMutation, useQueryClient, useInfiniteQuery } from '@tanstack/react-query';
import { api } from '../lib/api';
import { queryKeys } from '../lib/query-keys';

const WEBHOOK_EVENTS = [
  { value: 'report.submitted', label: 'Report Submitted' },
  { value: 'gate.failed', label: 'Quality Gate Failed' },
  { value: 'execution.completed', label: 'Execution Completed' },
  { value: 'execution.failed', label: 'Execution Failed' },
] as const;

interface Webhook {
  id: string;
  team_id: string;
  url: string;
  events: string[];
  enabled: boolean;
  created_at: string;
  updated_at: string;
}

interface WebhookDelivery {
  id: string;
  webhook_id: string;
  url: string;
  event_type: string;
  attempt: number;
  status_code: number;
  error?: string;
  duration_ms: number;
  delivered_at: string;
}

interface Team {
  id: string;
  name: string;
}

interface DeliveryPage {
  deliveries: WebhookDelivery[];
  total: number;
}

export function WebhooksPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingWebhook, setEditingWebhook] = useState<Webhook | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [newSecret, setNewSecret] = useState<string | null>(null);
  const [expandedDeliveries, setExpandedDeliveries] = useState<Set<string>>(new Set());

  function toggleDeliveries(webhookId: string) {
    setExpandedDeliveries(prev => {
      const next = new Set(prev);
      if (next.has(webhookId)) {
        next.delete(webhookId);
      } else {
        next.add(webhookId);
      }
      return next;
    });
  }

  // Fetch user's teams to get the teamId for webhook API calls
  const teamsQuery = useQuery({
    queryKey: queryKeys.teams.all,
    queryFn: () => api.getTeams() as Promise<{ teams: Team[] }>,
  });

  const teamId = teamsQuery.data?.teams?.[0]?.id;

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.webhooks.all(teamId ?? ''),
    queryFn: () => api.getWebhooks(teamId!),
    enabled: !!teamId,
  });

  const webhooks = (data?.webhooks ?? []) as Webhook[];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteWebhook(teamId!, id),
    onSuccess: () => {
      setConfirmDelete(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.webhooks.all(teamId!) });
    },
  });

  function handleEdit(webhook: Webhook) {
    setEditingWebhook(webhook);
    setShowForm(true);
    setNewSecret(null);
  }

  function handleFormClose() {
    setShowForm(false);
    setEditingWebhook(null);
  }

  function handleFormSuccess(secret?: string) {
    handleFormClose();
    if (secret) setNewSecret(secret);
    void queryClient.invalidateQueries({ queryKey: queryKeys.webhooks.all(teamId!) });
  }

  if (teamsQuery.isLoading) {
    return (
      <div className="p-6">
        <p className="text-sm text-muted-foreground">Loading teams...</p>
      </div>
    );
  }

  if (!teamId) {
    return (
      <div className="p-6">
        <div className="rounded-lg border border-dashed bg-card p-12 text-center">
          <h3 className="font-semibold text-lg mb-1">No team found</h3>
          <p className="text-muted-foreground text-sm">
            You need to be a member of a team to manage webhooks.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Webhooks</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Receive HTTP notifications when events occur in your team
          </p>
        </div>
        <button
          onClick={() => {
            if (showForm) {
              handleFormClose();
            } else {
              setNewSecret(null);
              setShowForm(true);
            }
          }}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          {showForm ? 'Cancel' : 'New Webhook'}
        </button>
      </div>

      {newSecret && (
        <div className="rounded-lg border border-green-200 bg-green-50 p-4">
          <p className="text-sm font-medium text-green-800 mb-1">
            Webhook secret (shown once):
          </p>
          <code className="block rounded bg-white px-3 py-2 text-sm font-mono text-green-900 border">
            {newSecret}
          </code>
          <p className="text-xs text-green-700 mt-2">
            Copy this secret now. It will not be shown again.
          </p>
          <button
            onClick={() => setNewSecret(null)}
            className="mt-2 text-xs text-green-700 hover:text-green-900 underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {showForm && (
        <WebhookForm
          teamId={teamId}
          webhook={editingWebhook}
          onSuccess={handleFormSuccess}
          onCancel={handleFormClose}
        />
      )}

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map(i => (
            <div key={i} className="rounded-lg border bg-card p-5 animate-pulse">
              <div className="h-5 w-48 bg-muted rounded mb-2" />
              <div className="h-4 w-72 bg-muted rounded" />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          Failed to load webhooks: {(error as Error).message}
        </div>
      )}

      {!isLoading && !error && webhooks.length === 0 && !showForm && (
        <div className="rounded-lg border border-dashed bg-card p-12 text-center">
          <h3 className="font-semibold text-lg mb-1">No webhooks yet</h3>
          <p className="text-muted-foreground text-sm">
            Create a webhook to receive notifications when reports are submitted, quality gates fail, or executions complete.
          </p>
        </div>
      )}

      {webhooks.length > 0 && (
        <div className="space-y-3">
          {webhooks.map(webhook => (
            <div key={webhook.id}>
            <div className="rounded-lg border bg-card p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-semibold text-sm truncate font-mono">{webhook.url}</h3>
                    <span
                      className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                        webhook.enabled
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {webhook.enabled ? 'Active' : 'Disabled'}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    {webhook.events.map(event => (
                      <span
                        key={event}
                        className="inline-flex items-center rounded-md border bg-white px-2 py-0.5 text-xs text-gray-600"
                      >
                        {WEBHOOK_EVENTS.find(e => e.value === event)?.label ?? event}
                      </span>
                    ))}
                  </div>
                  <p className="text-xs text-muted-foreground mt-2">
                    Created {new Date(webhook.created_at).toLocaleDateString()}
                  </p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => toggleDeliveries(webhook.id)}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Deliveries
                  </button>
                  <button
                    onClick={() => handleEdit(webhook)}
                    className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                  >
                    Edit
                  </button>
                  {confirmDelete === webhook.id ? (
                    <div className="flex items-center gap-1">
                      <button
                        onClick={() => deleteMutation.mutate(webhook.id)}
                        disabled={deleteMutation.isPending}
                        className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                      >
                        {deleteMutation.isPending ? 'Deleting...' : 'Confirm'}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(null)}
                        className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => setConfirmDelete(webhook.id)}
                      className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
                    >
                      Delete
                    </button>
                  )}
                </div>
              </div>
            </div>
            {expandedDeliveries.has(webhook.id) && teamId && (
              <WebhookDeliveryList teamId={teamId} webhookId={webhook.id} />
            )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function WebhookDeliveryList({ teamId, webhookId }: { teamId: string; webhookId: string }) {
  const queryClient = useQueryClient();
  const [retryError, setRetryError] = useState<string | null>(null);

  const PAGE_SIZE = 20;

  const deliveriesQuery = useInfiniteQuery({
    queryKey: queryKeys.webhooks.deliveries(teamId, webhookId),
    queryFn: ({ pageParam }): Promise<DeliveryPage> =>
      api.getWebhookDeliveries(teamId, webhookId, pageParam || undefined) as Promise<DeliveryPage>,
    getNextPageParam: (lastPage: DeliveryPage) => {
      const items = lastPage.deliveries;
      if (items.length >= PAGE_SIZE) {
        return items[items.length - 1]!.id;
      }
      return undefined;
    },
    initialPageParam: '',
  });

  const retryMutation = useMutation({
    mutationFn: (deliveryId: string) => api.retryWebhookDelivery(teamId, webhookId, deliveryId),
    onSuccess: (response) => {
      if (!response.success) {
        setRetryError(`Retry failed: ${response.error}`);
      } else {
        setRetryError(null);
        void queryClient.invalidateQueries({ queryKey: queryKeys.webhooks.deliveries(teamId, webhookId) });
      }
    },
    onError: (err: Error) => {
      setRetryError(`Retry failed: ${err.message}`);
    },
  });

  const deliveries = deliveriesQuery.data?.pages.flatMap(p => p.deliveries) ?? [];

  if (deliveriesQuery.isLoading) {
    return <p className="px-4 py-2 text-sm text-muted-foreground">Loading deliveries...</p>;
  }

  if (deliveriesQuery.isError) {
    return <p className="px-4 py-2 text-sm text-red-600">Failed to load deliveries.</p>;
  }

  return (
    <div className="mt-2 rounded-lg border bg-muted/30 p-4 space-y-2">
      <h3 className="text-sm font-semibold mb-2">Recent Deliveries</h3>
      {deliveries.length === 0 ? (
        <p className="text-sm text-muted-foreground">No deliveries yet.</p>
      ) : (
        <ul className="space-y-1">
          {deliveries.map(d => (
            <li key={d.id} className="flex items-center gap-3 text-sm py-1">
              <span
                className={`font-mono font-medium ${
                  d.status_code >= 200 && d.status_code < 300 ? 'text-green-600' : 'text-red-600'
                }`}
              >
                {d.status_code}
              </span>
              <span className="text-muted-foreground">{d.event_type}</span>
              <span className="text-muted-foreground">{d.duration_ms}ms</span>
              {!(d.status_code >= 200 && d.status_code < 300) && (
                <button
                  onClick={() => retryMutation.mutate(d.id)}
                  disabled={retryMutation.isPending}
                  className="rounded border border-gray-300 px-2 py-0.5 text-xs font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
                >
                  Retry
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
      {retryError && <p className="text-sm text-red-600">{retryError}</p>}
      {deliveriesQuery.hasNextPage && (
        <button
          onClick={() => void deliveriesQuery.fetchNextPage()}
          disabled={deliveriesQuery.isFetchingNextPage}
          className="mt-2 rounded border border-gray-300 px-3 py-1 text-sm font-medium hover:bg-gray-50 disabled:opacity-50 transition-colors"
        >
          {deliveriesQuery.isFetchingNextPage ? 'Loading...' : 'Load More'}
        </button>
      )}
    </div>
  );
}

function WebhookForm({
  teamId,
  webhook,
  onSuccess,
  onCancel,
}: {
  teamId: string;
  webhook: Webhook | null;
  onSuccess: (secret?: string) => void;
  onCancel: () => void;
}) {
  const [url, setUrl] = useState(webhook?.url ?? '');
  const [events, setEvents] = useState<string[]>(
    webhook?.events ?? ['report.submitted']
  );
  const [enabled, setEnabled] = useState(webhook?.enabled ?? true);
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: { url: string; events: string[] }) =>
      api.createWebhook(teamId, data),
    onSuccess: (result) => onSuccess(result.secret),
    onError: (err: Error) => setFormError(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: (data: { url: string; events: string[]; enabled: boolean }) =>
      api.updateWebhook(teamId, webhook!.id, data),
    onSuccess: () => onSuccess(),
    onError: (err: Error) => setFormError(err.message),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  function toggleEvent(event: string) {
    setEvents(prev =>
      prev.includes(event) ? prev.filter(e => e !== event) : [...prev, event]
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const trimmedUrl = url.trim();
    if (!trimmedUrl) {
      setFormError('URL is required.');
      return;
    }
    if (events.length === 0) {
      setFormError('At least one event is required.');
      return;
    }

    if (webhook) {
      updateMutation.mutate({ url: trimmedUrl, events, enabled });
    } else {
      createMutation.mutate({ url: trimmedUrl, events });
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border bg-card p-5 space-y-4">
      <h2 className="font-semibold text-lg">
        {webhook ? 'Edit Webhook' : 'Create Webhook'}
      </h2>

      <div>
        <label htmlFor="wh-url" className="block text-sm font-medium text-gray-700 mb-1">
          Payload URL
        </label>
        <input
          id="wh-url"
          type="url"
          value={url}
          onChange={e => setUrl(e.target.value)}
          placeholder="https://example.com/webhooks/scaledtest"
          className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
        />
      </div>

      <div>
        <span className="block text-sm font-medium text-gray-700 mb-2">Events</span>
        <div className="grid grid-cols-2 gap-2">
          {WEBHOOK_EVENTS.map(evt => (
            <label
              key={evt.value}
              className="flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer hover:bg-gray-50"
            >
              <input
                type="checkbox"
                checked={events.includes(evt.value)}
                onChange={() => toggleEvent(evt.value)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm">{evt.label}</span>
            </label>
          ))}
        </div>
      </div>

      {webhook && (
        <div className="flex items-center gap-2">
          <input
            id="wh-enabled"
            type="checkbox"
            checked={enabled}
            onChange={e => setEnabled(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="wh-enabled" className="text-sm text-gray-700">
            Enabled
          </label>
        </div>
      )}

      {formError && <p className="text-sm text-red-600">{formError}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending
            ? webhook
              ? 'Saving...'
              : 'Creating...'
            : webhook
              ? 'Save Changes'
              : 'Create Webhook'}
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
