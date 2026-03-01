/**
 * Analytics API types
 *
 * Shared types for the /api/analytics endpoint and its consumers.
 * Used by both the API route and the front-end components.
 */

export type AnalyticsStats = {
  totalReports: number;
  totalTests: number;
  passRate: number;
  failRate: number;
  recentReports: number;
};

export type AnalyticsTrendEntry = {
  date: string;
  total: number;
  passed: number;
  failed: number;
  passRate: number;
};

export type AnalyticsFailingTest = {
  name: string;
  suite: string;
  failCount: number;
  totalRuns: number;
  failRate: number;
};

export type AnalyticsData = {
  stats: AnalyticsStats;
  trends: AnalyticsTrendEntry[];
  topFailingTests: AnalyticsFailingTest[];
};

export type AnalyticsApiResponse = {
  success: true;
} & AnalyticsData;
