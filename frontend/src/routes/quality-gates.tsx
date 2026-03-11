import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { queryKeys } from '../lib/query-keys'

const RULE_TYPES = [
  { value: 'pass_rate', label: 'Pass Rate (%)', placeholder: '95', hasThreshold: true },
  { value: 'zero_failures', label: 'Zero Failures', placeholder: '0', hasThreshold: false },
  { value: 'no_new_failures', label: 'No New Failures', placeholder: '0', hasThreshold: false },
  { value: 'max_duration', label: 'Max Duration (ms)', placeholder: '30000', hasThreshold: true },
  { value: 'max_flaky_count', label: 'Max Flaky Count', placeholder: '5', hasThreshold: true },
  { value: 'min_test_count', label: 'Min Test Count', placeholder: '10', hasThreshold: true },
] as const

type RuleType = (typeof RULE_TYPES)[number]['value']

interface RuleForm {
  type: RuleType
  threshold: number
}

interface QualityGate {
  id: string
  name: string
  description: string
  team_id: string
  rules: unknown
  active: boolean
  created_at: string
  updated_at: string
}

interface RuleResult {
  type: string
  passed: boolean
  threshold: unknown
  actual: unknown
  message: string
}

interface EvaluationResult {
  id: string
  gate_id: string
  report_id: string
  passed: boolean
  details: { passed: boolean; results: RuleResult[] }
  created_at: string
}

export function QualityGatesPage() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [editingGate, setEditingGate] = useState<QualityGate | null>(null)
  const [expandedGate, setExpandedGate] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null)

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.qualityGates.all,
    queryFn: api.getQualityGates,
  })

  const qualityGates = (data?.quality_gates ?? []) as QualityGate[]

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteQualityGate(id),
    onSuccess: () => {
      setConfirmDelete(null)
      void queryClient.invalidateQueries({ queryKey: queryKeys.qualityGates.all })
    },
  })

  function handleEdit(gate: QualityGate) {
    setEditingGate(gate)
    setShowForm(true)
  }

  function handleFormClose() {
    setShowForm(false)
    setEditingGate(null)
  }

  function handleFormSuccess() {
    handleFormClose()
    void queryClient.invalidateQueries({ queryKey: queryKeys.qualityGates.all })
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
              handleFormClose()
            } else {
              setShowForm(true)
            }
          }}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          {showForm ? 'Cancel' : 'New Quality Gate'}
        </button>
      </div>

      {showForm && (
        <QualityGateForm
          gate={editingGate}
          onSuccess={handleFormSuccess}
          onCancel={handleFormClose}
        />
      )}

      {isLoading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="rounded-lg border bg-card p-5 animate-pulse">
              <div className="h-5 w-48 bg-muted rounded mb-2" />
              <div className="h-4 w-72 bg-muted rounded" />
            </div>
          ))}
        </div>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
          Failed to load quality gates: {(error as Error).message}
        </div>
      )}

      {!isLoading && !error && qualityGates.length === 0 && (
        <div className="rounded-lg border border-dashed bg-card p-12 text-center">
          <div className="text-4xl mb-3">&#x1F6E1;</div>
          <h3 className="font-semibold text-lg mb-1">No quality gates yet</h3>
          <p className="text-muted-foreground text-sm">
            Create a quality gate to define pass/fail criteria for your test results.
          </p>
        </div>
      )}

      {qualityGates.length > 0 && (
        <div className="space-y-3">
          {qualityGates.map((gate) => (
            <GateCard
              key={gate.id}
              gate={gate}
              isExpanded={expandedGate === gate.id}
              onToggleExpand={() =>
                setExpandedGate((prev) => (prev === gate.id ? null : gate.id))
              }
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
  )
}

function GateCard({
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
  gate: QualityGate
  isExpanded: boolean
  onToggleExpand: () => void
  onEdit: () => void
  onDelete: () => void
  isDeleting: boolean
  onConfirmDelete: () => void
  onCancelDelete: () => void
  deleteIsPending: boolean
}) {
  const [evaluatingId, setEvaluatingId] = useState<string | null>(null)
  const [lastEvaluation, setLastEvaluation] = useState<EvaluationResult | null>(null)

  const evaluateMutation = useMutation({
    mutationFn: (id: string) => api.evaluateQualityGate(id) as Promise<EvaluationResult>,
    onSuccess: (result) => {
      setLastEvaluation(result)
      setEvaluatingId(null)
    },
    onError: () => {
      setEvaluatingId(null)
    },
  })

  const rules = parseRules(gate.rules)

  return (
    <div className="rounded-lg border bg-card overflow-hidden">
      <div className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-lg truncate">{gate.name}</h3>
              <span
                className={`inline-block rounded-full px-2 py-0.5 text-xs font-medium ${
                  gate.active
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500'
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
                setEvaluatingId(gate.id)
                evaluateMutation.mutate(gate.id)
              }}
              disabled={evaluatingId === gate.id}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {evaluatingId === gate.id ? 'Evaluating...' : 'Evaluate'}
            </button>
            <button
              onClick={onEdit}
              className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
            >
              Edit
            </button>
            {isDeleting ? (
              <div className="flex items-center gap-1">
                <button
                  onClick={onConfirmDelete}
                  disabled={deleteIsPending}
                  className="rounded-md bg-red-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {deleteIsPending ? 'Deleting...' : 'Confirm'}
                </button>
                <button
                  onClick={onCancelDelete}
                  className="rounded-md border border-gray-300 bg-white px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                onClick={onDelete}
                className="rounded-md border border-red-200 bg-white px-3 py-1.5 text-sm font-medium text-red-600 hover:bg-red-50 transition-colors"
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
          className="mt-3 text-sm text-blue-600 hover:text-blue-700 font-medium"
        >
          {isExpanded ? 'Hide History' : 'View History'}
        </button>
      </div>

      {isExpanded && (
        <div className="border-t bg-gray-50 p-5">
          <EvaluationHistory gateId={gate.id} />
        </div>
      )}
    </div>
  )
}

function PassFailBadge({ passed }: { passed: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        passed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'
      }`}
    >
      <span
        className={`inline-block h-1.5 w-1.5 rounded-full ${
          passed ? 'bg-green-500' : 'bg-red-500'
        }`}
      />
      {passed ? 'Passed' : 'Failed'}
    </span>
  )
}

function RuleChip({ type, threshold }: { type: string; threshold?: number }) {
  const ruleInfo = RULE_TYPES.find((r) => r.value === type)
  const label = ruleInfo?.label ?? type
  const hasThreshold = ruleInfo?.hasThreshold ?? false

  return (
    <span className="inline-flex items-center gap-1.5 rounded-md border bg-white px-2 py-1 text-xs text-gray-600">
      <span className="font-medium">{label}</span>
      {hasThreshold && threshold !== undefined && (
        <span className="text-gray-400">
          {type === 'pass_rate' ? `${threshold}%` : String(threshold)}
        </span>
      )}
    </span>
  )
}

function EvaluationResultsDisplay({ evaluation }: { evaluation: EvaluationResult }) {
  const results = evaluation.details?.results ?? []

  return (
    <div className="rounded-md border bg-white overflow-hidden">
      <div className="px-4 py-2 border-b bg-gray-50 flex items-center justify-between">
        <span className="text-sm font-medium">Evaluation Results</span>
        <span className="text-xs text-muted-foreground">
          {new Date(evaluation.created_at).toLocaleString()}
        </span>
      </div>
      <div className="divide-y">
        {results.map((result, i) => (
          <div key={i} className="px-4 py-2.5 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block h-2 w-2 rounded-full ${
                  result.passed ? 'bg-green-500' : 'bg-red-500'
                }`}
              />
              <span className="text-sm font-medium">{ruleLabelShort(result.type)}</span>
            </div>
            <div className="flex items-center gap-4 text-sm">
              <span className="text-muted-foreground">{result.message}</span>
              <span
                className={`font-medium ${result.passed ? 'text-green-600' : 'text-red-600'}`}
              >
                {result.passed ? 'PASS' : 'FAIL'}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function EvaluationHistory({ gateId }: { gateId: string }) {
  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.qualityGates.evaluations(gateId),
    queryFn: () => api.getQualityGateEvaluations(gateId),
  })

  const evaluations = (data?.evaluations ?? []) as EvaluationResult[]

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading evaluation history...</p>
  }

  if (error) {
    return (
      <p className="text-sm text-red-600">
        Failed to load history: {(error as Error).message}
      </p>
    )
  }

  if (evaluations.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No evaluations yet. Click "Evaluate" to run this gate against the latest report.
      </p>
    )
  }

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold">Evaluation History</h4>
      <div className="space-y-2">
        {evaluations.map((evaluation) => (
          <div
            key={evaluation.id}
            className="rounded-md border bg-white p-3 flex items-center justify-between"
          >
            <div className="flex items-center gap-3">
              <PassFailBadge passed={evaluation.passed} />
              <span className="text-xs text-muted-foreground">
                Report: {evaluation.report_id.slice(0, 8)}...
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {new Date(evaluation.created_at).toLocaleString()}
            </span>
          </div>
        ))}
      </div>
    </div>
  )
}

function ruleLabelShort(type: string): string {
  const found = RULE_TYPES.find((r) => r.value === type)
  return found ? found.label : type
}

function parseRules(rules: unknown): RuleForm[] {
  if (!rules) return []
  if (Array.isArray(rules)) {
    return rules.map((r) => ({
      type: r.type ?? 'pass_rate',
      threshold: r.threshold ?? r.params?.threshold ?? r.params?.threshold_ms ?? 0,
    }))
  }
  try {
    const parsed = typeof rules === 'string' ? JSON.parse(rules) : rules
    if (Array.isArray(parsed)) {
      return parsed.map((r: Record<string, unknown>) => ({
        type: (r.type as RuleType) ?? 'pass_rate',
        threshold: (r.threshold as number) ?? (r.params as Record<string, number>)?.threshold ?? (r.params as Record<string, number>)?.threshold_ms ?? 0,
      }))
    }
  } catch {
    // ignore parse errors
  }
  return []
}

function rulesToDSL(rules: RuleForm[]): unknown[] {
  return rules.map((r) => {
    const ruleInfo = RULE_TYPES.find((rt) => rt.value === r.type)
    if (!ruleInfo?.hasThreshold) {
      return { type: r.type }
    }
    const paramKey = r.type === 'max_duration' ? 'threshold_ms' : 'threshold'
    return { type: r.type, params: { [paramKey]: r.threshold } }
  })
}

function QualityGateForm({
  gate,
  onSuccess,
  onCancel,
}: {
  gate: QualityGate | null
  onSuccess: () => void
  onCancel: () => void
}) {
  const existingRules = gate ? parseRules(gate.rules) : [{ type: 'pass_rate' as RuleType, threshold: 95 }]

  const [name, setName] = useState(gate?.name ?? '')
  const [description, setDescription] = useState(gate?.description ?? '')
  const [rules, setRules] = useState<RuleForm[]>(existingRules)
  const [active, setActive] = useState(gate?.active ?? true)
  const [formError, setFormError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: (data: { name: string; description: string; rules: unknown[] }) =>
      api.createQualityGate(data),
    onSuccess: () => onSuccess(),
    onError: (err: Error) => setFormError(err.message),
  })

  const updateMutation = useMutation({
    mutationFn: (data: { name: string; description: string; rules: unknown[]; active: boolean }) =>
      api.updateQualityGate(gate!.id, data),
    onSuccess: () => onSuccess(),
    onError: (err: Error) => setFormError(err.message),
  })

  const isPending = createMutation.isPending || updateMutation.isPending

  function addRule() {
    setRules((prev) => [...prev, { type: 'pass_rate', threshold: 0 }])
  }

  function removeRule(index: number) {
    setRules((prev) => prev.filter((_, i) => i !== index))
  }

  function updateRule(index: number, field: 'type' | 'threshold', value: string | number) {
    setRules((prev) =>
      prev.map((rule, i) => {
        if (i !== index) return rule
        if (field === 'type') return { ...rule, type: value as RuleType }
        return { ...rule, threshold: Number(value) }
      }),
    )
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setFormError(null)

    const trimmedName = name.trim()
    if (!trimmedName) {
      setFormError('Name is required.')
      return
    }
    if (rules.length === 0) {
      setFormError('At least one rule is required.')
      return
    }

    const payload = {
      name: trimmedName,
      description: description.trim(),
      rules: rulesToDSL(rules),
      active,
    }

    if (gate) {
      updateMutation.mutate(payload)
    } else {
      createMutation.mutate(payload)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border bg-card p-5 space-y-4">
      <h2 className="font-semibold text-lg">
        {gate ? 'Edit Quality Gate' : 'Create Quality Gate'}
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="qg-name" className="block text-sm font-medium text-gray-700 mb-1">
            Name
          </label>
          <input
            id="qg-name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g. Release Readiness"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
        <div>
          <label
            htmlFor="qg-description"
            className="block text-sm font-medium text-gray-700 mb-1"
          >
            Description
          </label>
          <input
            id="qg-description"
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="e.g. Must pass before deploying to production"
            className="w-full rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
          />
        </div>
      </div>

      {gate && (
        <div className="flex items-center gap-2">
          <input
            id="qg-active"
            type="checkbox"
            checked={active}
            onChange={(e) => setActive(e.target.checked)}
            className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
          />
          <label htmlFor="qg-active" className="text-sm text-gray-700">
            Active
          </label>
        </div>
      )}

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-700">Rules</span>
          <button
            type="button"
            onClick={addRule}
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            + Add Rule
          </button>
        </div>

        {rules.map((rule, index) => {
          const ruleInfo = RULE_TYPES.find((rt) => rt.value === rule.type)
          return (
            <div key={index} className="flex items-center gap-3">
              <select
                value={rule.type}
                onChange={(e) => updateRule(index, 'type', e.target.value)}
                className="flex-1 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                {RULE_TYPES.map((rt) => (
                  <option key={rt.value} value={rt.value}>
                    {rt.label}
                  </option>
                ))}
              </select>
              {ruleInfo?.hasThreshold && (
                <input
                  type="number"
                  value={rule.threshold}
                  onChange={(e) => updateRule(index, 'threshold', e.target.value)}
                  placeholder={ruleInfo.placeholder}
                  className="w-28 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              )}
              <button
                type="button"
                onClick={() => removeRule(index)}
                disabled={rules.length <= 1}
                className="text-red-500 hover:text-red-700 disabled:opacity-30 disabled:cursor-not-allowed text-sm font-medium"
              >
                Remove
              </button>
            </div>
          )
        })}
      </div>

      {formError && <p className="text-sm text-red-600">{formError}</p>}

      <div className="flex items-center gap-3">
        <button
          type="submit"
          disabled={isPending}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
          className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
        >
          Cancel
        </button>
      </div>
    </form>
  )
}
