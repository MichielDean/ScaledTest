import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { queryKeys } from '../lib/query-keys'

const RULE_TYPES = [
  { value: 'pass_rate', label: 'Pass Rate (%)', placeholder: '95' },
  { value: 'zero_failures', label: 'Zero Failures', placeholder: '0' },
  { value: 'no_new_failures', label: 'No New Failures', placeholder: '0' },
  { value: 'max_duration', label: 'Max Duration (ms)', placeholder: '30000' },
  { value: 'max_flaky_count', label: 'Max Flaky Count', placeholder: '5' },
  { value: 'min_test_count', label: 'Min Test Count', placeholder: '10' },
] as const

type RuleType = (typeof RULE_TYPES)[number]['value']

interface Rule {
  type: RuleType
  threshold: number
}

interface QualityGate {
  id: string
  name: string
  team_id: string
  rules: Rule[]
  created_at: string
  updated_at: string
}

interface EvaluationResult {
  id: string
  quality_gate_id: string
  passed: boolean
  details: Record<string, unknown>
  created_at: string
}

export function QualityGatesPage() {
  const queryClient = useQueryClient()
  const [showForm, setShowForm] = useState(false)
  const [evaluatingId, setEvaluatingId] = useState<string | null>(null)
  const [evaluationResults, setEvaluationResults] = useState<Record<string, EvaluationResult>>({})

  const { data, isLoading, error } = useQuery({
    queryKey: queryKeys.qualityGates.all,
    queryFn: api.getQualityGates,
  })

  const qualityGates = (data?.quality_gates ?? []) as QualityGate[]

  const evaluateMutation = useMutation({
    mutationFn: (id: string) => api.evaluateQualityGate(id) as Promise<EvaluationResult>,
    onSuccess: (result, id) => {
      setEvaluationResults((prev) => ({ ...prev, [id]: result }))
      setEvaluatingId(null)
    },
    onError: () => {
      setEvaluatingId(null)
    },
  })

  function handleEvaluate(id: string) {
    setEvaluatingId(id)
    evaluateMutation.mutate(id)
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Quality Gates</h1>
        <button
          onClick={() => setShowForm((v) => !v)}
          className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 transition-colors"
        >
          {showForm ? 'Cancel' : 'New Quality Gate'}
        </button>
      </div>

      {showForm && (
        <CreateQualityGateForm
          onCreated={() => {
            setShowForm(false)
            void queryClient.invalidateQueries({ queryKey: queryKeys.qualityGates.all })
          }}
        />
      )}

      {isLoading && <p className="text-gray-500">Loading quality gates...</p>}

      {error && (
        <p className="text-red-600">Failed to load quality gates: {(error as Error).message}</p>
      )}

      {!isLoading && !error && qualityGates.length === 0 && (
        <p className="text-gray-500">No quality gates yet. Create one to get started.</p>
      )}

      {qualityGates.length > 0 && (
        <div className="space-y-3">
          {qualityGates.map((gate) => {
            const evaluation = evaluationResults[gate.id]
            const isEvaluating = evaluatingId === gate.id
            return (
              <div
                key={gate.id}
                className="rounded-lg border bg-card p-5 flex items-center justify-between gap-4"
              >
                <div className="min-w-0 flex-1">
                  <h3 className="font-semibold text-lg truncate">{gate.name}</h3>
                  <p className="text-sm text-gray-500 mt-1">
                    {gate.rules.length} {gate.rules.length === 1 ? 'rule' : 'rules'}
                    {' \u2014 '}
                    {gate.rules.map((r) => ruleLabelShort(r.type)).join(', ')}
                  </p>
                  {evaluation && (
                    <span
                      className={`mt-2 inline-block rounded-full px-3 py-0.5 text-xs font-medium ${
                        evaluation.passed
                          ? 'bg-green-100 text-green-800'
                          : 'bg-red-100 text-red-800'
                      }`}
                    >
                      {evaluation.passed ? 'Passed' : 'Failed'}
                    </span>
                  )}
                </div>
                <button
                  onClick={() => handleEvaluate(gate.id)}
                  disabled={isEvaluating}
                  className="shrink-0 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {isEvaluating ? 'Evaluating...' : 'Evaluate'}
                </button>
              </div>
            )
          })}
        </div>
      )}

      {Object.keys(evaluationResults).length > 0 && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold">Evaluation Results</h2>
          {Object.entries(evaluationResults).map(([gateId, result]) => {
            const gate = qualityGates.find((g) => g.id === gateId)
            return (
              <div key={result.id} className="rounded-lg border bg-card p-4">
                <div className="flex items-center gap-3 mb-2">
                  <span
                    className={`inline-block h-3 w-3 rounded-full ${
                      result.passed ? 'bg-green-500' : 'bg-red-500'
                    }`}
                  />
                  <span className="font-medium">{gate?.name ?? gateId}</span>
                  <span className="text-xs text-gray-500">
                    {new Date(result.created_at).toLocaleString()}
                  </span>
                </div>
                {result.details && (
                  <pre className="text-xs bg-gray-50 rounded p-3 overflow-x-auto text-gray-700">
                    {JSON.stringify(result.details, null, 2)}
                  </pre>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ruleLabelShort(type: string): string {
  const found = RULE_TYPES.find((r) => r.value === type)
  return found ? found.label : type
}

function CreateQualityGateForm({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState('')
  const [rules, setRules] = useState<Rule[]>([{ type: 'pass_rate', threshold: 95 }])
  const [formError, setFormError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: (data: { name: string; rules: Rule[] }) => api.createQualityGate(data),
    onSuccess: () => {
      onCreated()
    },
    onError: (err: Error) => {
      setFormError(err.message)
    },
  })

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

    createMutation.mutate({ name: trimmedName, rules })
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-lg border bg-card p-5 space-y-4">
      <h2 className="font-semibold text-lg">Create Quality Gate</h2>

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

        {rules.map((rule, index) => (
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
            <input
              type="number"
              value={rule.threshold}
              onChange={(e) => updateRule(index, 'threshold', e.target.value)}
              placeholder={RULE_TYPES.find((rt) => rt.value === rule.type)?.placeholder ?? '0'}
              className="w-28 rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
            <button
              type="button"
              onClick={() => removeRule(index)}
              disabled={rules.length <= 1}
              className="text-red-500 hover:text-red-700 disabled:opacity-30 disabled:cursor-not-allowed text-sm font-medium"
            >
              Remove
            </button>
          </div>
        ))}
      </div>

      {formError && <p className="text-sm text-red-600">{formError}</p>}

      <button
        type="submit"
        disabled={createMutation.isPending}
        className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {createMutation.isPending ? 'Creating...' : 'Create Quality Gate'}
      </button>
    </form>
  )
}
