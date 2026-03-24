import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { queryKeys } from '../lib/query-keys';

const RULE_TYPES = [
  { value: 'pass_rate', label: 'Pass Rate (%)', placeholder: '95', hasThreshold: true },
  { value: 'zero_failures', label: 'Zero Failures', placeholder: '0', hasThreshold: false },
  { value: 'no_new_failures', label: 'No New Failures', placeholder: '0', hasThreshold: false },
  { value: 'max_duration', label: 'Max Duration (ms)', placeholder: '30000', hasThreshold: true },
  { value: 'max_flaky_count', label: 'Max Flaky Count', placeholder: '5', hasThreshold: true },
  { value: 'min_test_count', label: 'Min Test Count', placeholder: '10', hasThreshold: true },
] as const;

type RuleType = (typeof RULE_TYPES)[number]['value'];

interface RuleForm {
  type: RuleType;
  threshold: number;
}

interface Team {
  id: string;
  name: string;
}

interface QualityGate {
  id: string;
  name: string;
  description: string;
  team_id: string;
  rules: unknown;
  active: boolean;
  created_at: string;
  updated_at: string;
}

interface RuleResult {
  type: string;
  passed: boolean;
  threshold: unknown;
  actual: unknown;
  message: string;
}

interface EvaluationResult {
  id: string;
  gate_id: string;
  report_id: string;
  passed: boolean;
  details: { passed: boolean; results: RuleResult[] };
  created_at: string;
}

export function QualityGatesPage() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [editingGate, setEditingGate] = useState<QualityGate | null>(null);
  const [expandedGate, setExpandedGate] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const teamsQuery = useQuery({
    queryKey: queryKeys.teams.all,
    queryFn: () => api.getTeams() as Promise<{ teams: Team[] }>,
  });

  const teamId = teamsQuery.data?.teams?.[0]?.id;

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.qualityGates.all,
    queryFn: () => api.getQualityGates(teamId!),
    enabled: !!teamId,
  });

  const qualityGates = (data?.quality_gates ?? []) as QualityGate[];

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteQualityGate(teamId!, id),
    onSuccess: () => {
      setConfirmDelete(null);
      void queryClient.invalidateQueries({ queryKey: queryKeys.qualityGates.all });
    },
  });

  function handleEdit(gate: QualityGate) {
    setEditingGate(gate);
    setShowForm(true);
  }

  function handleFormClose() {
    setShowForm(false);
    setEditingGate(null);
  }

  function handleFormSuccess() {
    handleFormClose();
    void queryClient.invalidateQueries({ queryKey: queryKeys.qualityGates.all });
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Quality Gates</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Define pass/fail criteria for your test executions
          </p>
        </div>
        <button
          onClick={() => {
            if (showForm) {
              handleFormClose();
            } else {
              setShowForm(true);
            }
          }}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          {showForm ? 'Cancel' : 'New Quality Gate'}
        </button>
      </div>

      {showForm && teamId && (
        <QualityGateForm
          teamId={teamId}
          gate={editingGate}
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
        <div className="flex items-center gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-4 text-destructive">
          <AlertCircle size={16} />
          Failed to load quality gates: {(error as Error).message}
        </div>
      )}

      {!isLoading && !error && qualityGates.length === 0 && (
        <div className="rounded-lg border border-dashed bg-card p-12 text-center flex flex-col items-center gap-3">
          <ShieldCheck size={48} className="text-muted-foreground/50" />
          <h3 className="font-semibold text-lg mb-1 text-muted-foreground">No quality gates yet</h3>
          <p className="text-muted-foreground text-sm">
            Create a quality gate to define pass/fail criteria for your test results.
          </p>
        </div>
      )}

      {qualityGates.length > 0 && (
        <div className="space-y-3">
          {qualityGates.map(gate => (
            <GateCard
              key={gate.id}
              teamId={teamId!}
              gate={gate}
              isExpanded={expandedGate === gate.id}
              onToggleExpand={() => setExpandedGate(prev => (prev === gate.id ? null : gate.id))}
              onEdit={() => handleEdit(gate)}
              onDelete={() => setConfirmDelete(gate.id)}
              isDeleting={confirmDelete === gate.id}
              onConfirmDelete={() => deleteMutation.mutate(gate.id)}
              onCancelDelete={() => setConfirmDelete(null)}
              deleteIsPending={deleteMutation.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function GateCard({
  teamId,
  gate,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDelete,
  isDeleting,
  onConfirmDelete,
  onCancelDelete,
  deleteIsPending,
}: {
  teamId: string;
  gate: QualityGate;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  isDeleting: boolean;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  deleteIsPending: boolean;
}) {
  const [evaluatingId, setEvaluatingId] = useState<string | null>(null);
  const [lastEvaluation, setLastEvaluation] = useState<EvaluationResult | null>(null);

  const evaluateMutation = useMutation({
    mutationFn: (id: string) => api.evaluateQualityGate(teamId, id) as Promise<EvaluationResult>,
    onSuccess: result => {
      setLastEvaluation(result);
      setEvaluatingId(null);
    },
    onError: () => {
      setEvaluatingId(null);
    },
  });

  const rules = parseRules(gate.rules);

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-semibold text-lg truncate">{gate.name}</h3>
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                  gate.active
                    ? 'bg-success/10 text-success border border-success/20'
                    : 'bg-muted text-muted-foreground border border-border'
                }`}
              >
                {gate.active ? 'Active' : 'Inactive'}
              </span>
              {lastEvaluation && <PassFailBadge passed={lastEvaluation.passed} />}
            </div>
            {gate.description && (
              <p className="text-sm text-muted-foreground mt-1">{gate.description}</p>
            )}
            <div className="flex flex-wrap gap-2 mt-3">
              {rules.map((rule, i) => (
                <RuleChip key={i} type={rule.type} threshold={rule.threshold} />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => {
                setEvaluatingId(gate.id);
                evaluateMutation.mutate(gate.id);
              }}
              disabled={evaluatingId === gate.id}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {evaluatingId === gate.id ? 'Evaluating...' : 'Evaluate'}
            </button>
            <button
              onClick={onEdit}
              className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
            >
              Edit
            </button>
            {isDeleting ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={onConfirmDelete}
                  disabled={deleteIsPending}
                  className="rounded-md bg-destructive px-3 py-1.5 text-sm font-medium text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 transition-colors"
                >
                  {deleteIsPending ? 'Deleting...' : 'Confirm'}
                </button>
                <button
                  onClick={onCancelDelete}
                  className="rounded-md border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={onDelete}
                className="rounded-md border border-destructive/30 bg-card px-3 py-1.5 text-sm font-medium text-destructive hover:bg-destructive/10 transition-colors"
              >
                Delete
              </button>
            )}
          </div>
        </div>

        {lastEvaluation && lastEvaluation.details?.results && (
          <div className="mt-4">
            <EvaluationResultsDisplay evaluation={lastEvaluation} />
          </div>
        )}

        <button
          onClick={onToggleExpand}
          className="mt-3 text-sm text-primary hover:text-accent font-medium transition-colors"
        >
          {isExpanded ? 'Hide History' : 'View History'}
        </button>
      </div>

      {isExpanded && (
        <div className="border-t bg-muted/20 p-5">
          <EvaluationHistory teamId={teamId} gateId={gate.id} />
        </div>
      )}
    </div>
  );
}

function PassFailBadge({ passed }: { passed: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        passed
          ? 'bg-success/10 text-success border border-success/20'
          : 'bg-destructive/10 text-destructive border border-destructive/20'
      }`}
    >
      {passed ? (
        <CheckCircle2 size={10} />
      ) : (
        <AlertCircle size={10} />
      )}
      {passed ? 'Passed' : 'Failed'}
    </span>
  );
}

function RuleChip({ type, threshold }: { type: string; threshold?: number }) {
  const ruleInfo = RULE_TYPES.find(r => r.value === type);
  const label = ruleInfo?.label ?? type;
  const hasThreshold = ruleInfo?.hasThreshold ?? false;

  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border border-border bg-muted px-2 py-1 text-xs text-muted-foreground">
      <span className="font-medium text-foreground">{label}</span>
      {hasThreshold && threshold !== undefined && (
        <span className="text-muted-foreground/70">
          {type === 'pass_rate' ? `${threshold}%` : String(threshold)}
        </span>
      )}
    </span>
  );
}

function EvaluationResultsDisplay({ evaluation }: { evaluation: EvaluationResult }) {
  const results = evaluation.details?.results ?? [];

  return (
    <div className="rounded-md border border-border bg-muted/30 overflow-hidden">
      <div className="px-4 py-2 border-b border-border bg-muted/50 flex items-center justify-between">
        <span className="text-sm font-medium">Evaluation Results</span>
        <span className="text-xs text-muted-foreground font-mono">
          {new Date(evaluation.created_at).toLocaleString()}
        </span>
      </div>
      <div className="divide-y divide-border">
        {results.map((result, i) => (
          <div key={i} className="px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              {result.passed ? (
                <CheckCircle2 size={14} className="text-success shrink-0" />
              ) : (
                <AlertCircle size={14} className="text-destructive shrink-0" />
              )}
              <span className="text-sm font-medium">{ruleLabelShort(result.type)}</span>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">{result.message}</span>
              <span className={`font-medium ${result.passed ? 'text-success' : 'text-destructive'}`}>
                {result.passed ? 'PASS' : 'FAIL'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function EvaluationHistory({ teamId, gateId }: { teamId: string; gateId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.qualityGates.evaluations(gateId),
    queryFn: () => api.getQualityGateEvaluations(teamId, gateId),
  });

  const evaluations = (data?.evaluations ?? []) as EvaluationResult[];

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading evaluation history...</p>;
  }

  if (error) {
    return (
      <p className="text-sm text-destructive">Failed to load history: {(error as Error).message}</p>
    );
  }

  if (evaluations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No evaluations yet. Click "Evaluate" to run this gate against the latest report.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold">Evaluation History</h4>
      <div className="space-y-2">
        {evaluations.map(evaluation => (
          <div
            key={evaluation.id}
            className="rounded-md border border-border bg-card p-3 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <PassFailBadge passed={evaluation.passed} />
              <span className="font-mono text-xs text-muted-foreground">
                Report: {evaluation.report_id.slice(0, 8)}...
              </span>
            </div>
            <span className="font-mono text-xs text-muted-foreground">
              {new Date(evaluation.created_at).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function ruleLabelShort(type: string): string {
  const found = RULE_TYPES.find(r => r.value === type);
  return found ? found.label : type;
}

function parseRules(rules: unknown): RuleForm[] {
  if (!rules) return [];
  try {
    const parsed = typeof rules === 'string' ? JSON.parse(rules) : rules;
    if (Array.isArray(parsed)) {
      return parsed.map((r: Record<string, unknown>) => ({
        type: (r.type as RuleType) ?? 'pass_rate',
        threshold:
          (r.threshold as number) ??
          (r.params as Record<string, number>)?.threshold ??
          (r.params as Record<string, number>)?.threshold_ms ??
          0,
      }));
    }
  } catch {
    // ignore parse errors
  }
  return [];
}

function rulesToDSL(rules: RuleForm[]): unknown[] {
  return rules.map(r => {
    const ruleInfo = RULE_TYPES.find(rt => rt.value === r.type);
    if (!ruleInfo?.hasThreshold) {
      return { type: r.type };
    }
    const paramKey = r.type === 'max_duration' ? 'threshold_ms' : 'threshold';
    return { type: r.type, params: { [paramKey]: r.threshold } };
  });
}

function QualityGateForm({
  teamId,
  gate,
  onSuccess,
  onCancel,
}: {
  teamId: string;
  gate: QualityGate | null;
  onSuccess: () => void;
  onCancel: () => void;
}) {
  const existingRules = gate
    ? parseRules(gate.rules)
    : [{ type: 'pass_rate' as RuleType, threshold: 95 }];

  const [name, setName] = useState(gate?.name ?? '');
  const [description, setDescription] = useState(gate?.description ?? '');
  const [rules, setRules] = useState<RuleForm[]>(existingRules);
  const [active, setActive] = useState(gate?.active ?? true);
  const [formError, setFormError] = useState<string | null>(null);

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description: string; rules: unknown[] }) =>
      api.createQualityGate(teamId, data),
    onSuccess: () => onSuccess(),
    onError: (err: Error) => setFormError(err.message),
  });

  const updateMutation = useMutation({
    mutationFn: (data: { name: string; description: string; rules: unknown[]; active: boolean }) =>
      api.updateQualityGate(teamId, gate!.id, data),
    onSuccess: () => onSuccess(),
    onError: (err: Error) => setFormError(err.message),
  });

  const isPending = createMutation.isPending || updateMutation.isPending;

  function addRule() {
    setRules(prev => [...prev, { type: 'pass_rate', threshold: 0 }]);
  }

  function removeRule(index: number) {
    setRules(prev => prev.filter((_, i) => i !== index));
  }

  function updateRule(index: number, field: 'type' | 'threshold', value: string | number) {
    setRules(prev =>
      prev.map((rule, i) => {
        if (i !== index) return rule;
        if (field === 'type') return { ...rule, type: value as RuleType };
        return { ...rule, threshold: Number(value) };
      })
    );
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setFormError('Name is required.');
      return;
    }
    if (rules.length === 0) {
      setFormError('At least one rule is required.');
      return;
    }

    const payload = {
      name: trimmedName,
      description: description.trim(),
      rules: rulesToDSL(rules),
      active,
    };

    if (gate) {
      updateMutation.mutate(payload);
    } else {
      createMutation.mutate(payload);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border bg-card p-5 space-y-4">
      <h2 className="font-semibold text-lg">
        {gate ? 'Edit Quality Gate' : 'Create Quality Gate'}
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="qg-name" className="block text-sm font-medium text-foreground mb-1">
            Name
          </label>
          <input
            id="qg-name"
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="e.g. Release Readiness"
            className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>
        <div>
          <label htmlFor="qg-description" className="block text-sm font-medium text-foreground mb-1">
            Description
          </label>
          <input
            id="qg-description"
            type="text"
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="e.g. Must pass before deploying to production"
            className="w-full rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
          />
        </div>
      </div>

      {gate && (
        <div className="flex items-center gap-2">
          <input
            id="qg-active"
            type="checkbox"
            checked={active}
            onChange={e => setActive(e.target.checked)}
            className="h-4 w-4 rounded border-border text-primary focus:ring-primary/30"
          />
          <label htmlFor="qg-active" className="text-sm text-foreground">
            Active
          </label>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-foreground">Rules</span>
          <button
            type="button"
            onClick={addRule}
            className="text-sm text-primary hover:text-accent font-medium transition-colors"
          >
            + Add Rule
          </button>
        </div>

        {rules.map((rule, index) => {
          const ruleInfo = RULE_TYPES.find(rt => rt.value === rule.type);
          return (
            <div key={index} className="flex items-center gap-3">
              <select
                value={rule.type}
                onChange={e => updateRule(index, 'type', e.target.value)}
                className="flex-1 rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
              >
                {RULE_TYPES.map(rt => (
                  <option key={rt.value} value={rt.value}>
                    {rt.label}
                  </option>
                ))}
              </select>
              {ruleInfo?.hasThreshold && (
                <input
                  type="number"
                  value={rule.threshold}
                  onChange={e => updateRule(index, 'threshold', e.target.value)}
                  placeholder={ruleInfo.placeholder}
                  className="w-28 rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary/30"
                />
              )}
              <button
                type="button"
                onClick={() => removeRule(index)}
                disabled={rules.length <= 1}
                className="text-destructive hover:text-destructive/80 disabled:opacity-30 disabled:cursor-not-allowed text-sm font-medium transition-colors"
              >
                Remove
              </button>
            </div>
          );
        })}
      </div>

      {formError && (
        <p className="flex items-center gap-1.5 text-sm text-destructive">
          <AlertCircle size={13} />
          {formError}
        </p>
      )}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isPending
            ? gate
              ? 'Saving...'
              : 'Creating...'
            : gate
              ? 'Save Changes'
              : 'Create Quality Gate'}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md border border-border px-4 py-2 text-sm font-medium text-foreground hover:bg-muted transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
