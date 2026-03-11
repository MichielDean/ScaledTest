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
    trends: (days?: number, groupBy?: string) => ['analytics', 'trends', days, groupBy] as const,
    flakyTests: (days?: number) => ['analytics', 'flaky-tests', days] as const,
    errorAnalysis: (days?: number) => ['analytics', 'error-analysis', days] as const,
    durationDistribution: (days?: number) => ['analytics', 'duration-distribution', days] as const,
    healthScore: (days?: number) => ['analytics', 'health-score', days] as const,
  },
  qualityGates: {
    all: ['quality-gates'] as const,
    detail: (id: string) => ['quality-gates', id] as const,
  },
  teams: {
    all: ['teams'] as const,
    list: () => ['teams'] as const,
  },
  admin: {
    users: () => ['admin', 'users'] as const,
  },
} as const;
