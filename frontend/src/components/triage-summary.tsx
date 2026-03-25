import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { AlertCircle, Zap } from 'lucide-react';
import { api } from '../lib/api';
import { queryKeys } from '../lib/query-keys';

interface TriageFailure {
  test_result_id: string;
  classification: 'new' | 'flaky' | 'regression' | 'unknown';
}

interface TriageCluster {
  id: string;
  root_cause: string;
  label?: string;
  failures: TriageFailure[];
}

interface TriageResponse {
  triage_status: 'pending' | 'complete' | 'failed';
  clusters?: TriageCluster[];
  unclustered_failures?: TriageFailure[];
  summary?: string;
  error?: string;
  metadata?: {
    generated_at: string;
    model?: string;
  };
}

interface TriageSummaryProps {
  reportId: string;
  hasFailed: boolean;
}

export function TriageSummary({ reportId, hasFailed }: TriageSummaryProps) {
  const [expandedClusterId, setExpandedClusterId] = useState<string | null>(null);
  const [unclusteredExpanded, setUnclusteredExpanded] = useState(false);

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.reports.triage(reportId),
    queryFn: () => api.getTriage(reportId) as Promise<TriageResponse>,
    enabled: hasFailed,
  });

  if (!hasFailed) return null;

  if (isLoading || data?.triage_status === 'pending') {
    return (
      <div className="px-5 py-4" data-testid="triage-skeleton">
        <div className="h-3 w-28 bg-muted animate-pulse rounded mb-3" />
        <div className="h-2.5 w-full bg-muted animate-pulse rounded mb-2" />
        <div className="h-2.5 w-4/5 bg-muted animate-pulse rounded mb-2" />
        <div className="h-2.5 w-3/5 bg-muted animate-pulse rounded" />
      </div>
    );
  }

  if (error) {
    const msg = (error as Error).message;
    if (msg === 'triage not found') {
      return (
        <div className="px-5 py-4 text-sm text-muted-foreground">
          Triage analysis not yet available for this report.
        </div>
      );
    }
    return (
      <div className="px-5 py-4 text-sm text-destructive flex items-center gap-1.5">
        <AlertCircle size={14} />
        Failed to load triage data.
      </div>
    );
  }

  if (!data) return null;

  if (data.triage_status === 'failed') {
    return (
      <div className="px-5 py-4 space-y-1">
        <p className="text-sm font-semibold">Triage Summary</p>
        <p className="text-sm text-muted-foreground">
          Triage analysis unavailable.{' '}
          {data.error ?? 'The analysis could not be completed.'}
        </p>
      </div>
    );
  }

  const clusters = data.clusters ?? [];
  const unclusteredFailures = data.unclustered_failures ?? [];

  return (
    <div className="px-5 py-4 space-y-3">
      <p className="text-sm font-semibold">Triage Summary</p>

      {data.summary && (
        <p className="text-sm text-muted-foreground">{data.summary}</p>
      )}

      {clusters.length > 0 && (
        <div className="space-y-2">
          {clusters.map(cluster => {
            const isExpanded = expandedClusterId === cluster.id;
            return (
              <div key={cluster.id} className="rounded-md border bg-card overflow-hidden">
                <button
                  onClick={() =>
                    setExpandedClusterId(isExpanded ? null : cluster.id)
                  }
                  aria-expanded={isExpanded}
                  className="w-full px-4 py-2.5 flex items-center gap-2 text-left text-sm hover:bg-muted/30 transition-colors"
                >
                  <span className="text-muted-foreground shrink-0" aria-hidden="true">
                    {isExpanded ? '\u25BC' : '\u25B6'}
                  </span>
                  <span className="font-medium flex-1 min-w-0 truncate">
                    {cluster.root_cause}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {cluster.failures.length}{' '}
                    {cluster.failures.length === 1 ? 'failure' : 'failures'}
                  </span>
                </button>

                {isExpanded && (
                  <div className="px-4 pb-3 pt-2 space-y-1.5 border-t">
                    {cluster.failures.map(failure => (
                      <div
                        key={failure.test_result_id}
                        className="flex items-center gap-2 text-sm"
                      >
                        <ClassificationBadge classification={failure.classification} />
                        <span className="font-mono text-xs text-muted-foreground truncate">
                          {failure.test_result_id}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {unclusteredFailures.length > 0 && (
        <div className="rounded-md border bg-card overflow-hidden">
          <button
            onClick={() => setUnclusteredExpanded(!unclusteredExpanded)}
            aria-expanded={unclusteredExpanded}
            className="w-full px-4 py-2.5 flex items-center gap-2 text-left text-sm hover:bg-muted/30 transition-colors"
          >
            <span className="text-muted-foreground shrink-0" aria-hidden="true">
              {unclusteredExpanded ? '\u25BC' : '\u25B6'}
            </span>
            <span className="font-medium flex-1">Unclustered failures</span>
            <span className="shrink-0 text-xs text-muted-foreground">
              {unclusteredFailures.length}{' '}
              {unclusteredFailures.length === 1 ? 'failure' : 'failures'}
            </span>
          </button>

          {unclusteredExpanded && (
            <div className="px-4 pb-3 pt-2 space-y-1.5 border-t">
              {unclusteredFailures.map(failure => (
                <div
                  key={failure.test_result_id}
                  className="flex items-center gap-2 text-sm"
                >
                  <ClassificationBadge classification={failure.classification} />
                  <span className="font-mono text-xs text-muted-foreground truncate">
                    {failure.test_result_id}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ClassificationBadge({ classification }: { classification: string }) {
  const styles: Record<string, string> = {
    new: 'bg-orange-500/10 text-orange-600 border-orange-500/20',
    flaky: 'bg-warning/10 text-warning border-warning/20',
    regression: 'bg-destructive/10 text-destructive border-destructive/20',
    unknown: 'bg-muted text-muted-foreground border-border',
  };
  const badgeStyle = styles[classification] ?? styles['unknown'];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium border shrink-0 ${badgeStyle}`}
    >
      {classification === 'flaky' && <Zap size={10} />}
      {classification}
    </span>
  );
}
