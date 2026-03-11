export const queryKeys = {
  reports: {
    all: ['reports'] as const,
    detail: (id: string) => ['reports', id] as const,
  },
  executions: {
    all: ['executions'] as const,
    detail: (id: string) => ['executions', id] as const,
  },
  analytics: {
    trends: ['analytics', 'trends'] as const,
    flakyTests: ['analytics', 'flaky-tests'] as const,
    errorAnalysis: ['analytics', 'error-analysis'] as const,
    durationDistribution: ['analytics', 'duration-distribution'] as const,
  },
  qualityGates: {
    all: ['quality-gates'] as const,
    detail: (id: string) => ['quality-gates', id] as const,
    evaluations: (id: string) => ['quality-gates', id, 'evaluations'] as const,
  },
  teams: {
    all: ['teams'] as const,
    list: () => ['teams'] as const,
  },
  admin: {
    users: () => ['admin', 'users'] as const,
  },
} as const
