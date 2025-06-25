import { CtrfSchema } from '../schemas/ctrf/ctrf';
import { BaseFilters, SuccessApiResponse, AnalyticsDataWithRates } from './apiResponses';

// Types for our dashboard data
export interface TestReport extends CtrfSchema {
  _id: string;
  storedAt: string;
}

export interface TestReportsResponse extends SuccessApiResponse<TestReport[]> {
  total: number;
}

export interface DashboardFilters extends BaseFilters {
  status: string;
  tool: string;
  environment: string;
  page: number;
  size: number;
}

// Types for analytics components
export interface TestTrendsData extends AnalyticsDataWithRates {
  date: string; // Date-time string in format 'yyyy-MM-dd HH:mm' for hourly trends
}

export interface TestDurationData {
  range: string;
  count: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
}

export interface TestSuiteOverviewData extends AnalyticsDataWithRates {
  name: string;
  avgDuration: number;
}

export interface ErrorAnalysisData {
  errorMessage: string;
  count: number;
  affectedTests: string[];
}

export interface FlakyTestData {
  testName: string;
  suite: string;
  totalRuns: number;
  passed: number;
  failed: number;
  skipped: number;
  flakyScore: number;
  avgDuration: number;
  isMarkedFlaky: boolean;
  isFlaky: boolean;
}

/**
 * Individual test run data for flaky test visualization
 */
export interface TestRunData {
  testName: string;
  suite: string;
  status: 'passed' | 'failed' | 'skipped';
  duration: number;
  message?: string;
  trace?: string;
  timestamp: string;
  reportId: string;
}

/**
 * Enhanced flaky test data with individual test runs
 */
export interface FlakyTestWithRuns extends FlakyTestData {
  testRuns: TestRunData[];
}
