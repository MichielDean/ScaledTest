import { CtrfSchema } from '../schemas/ctrf/ctrf';
import { BaseFilters, SuccessApiResponse, AnalyticsDataWithRates } from './common';

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
  date: string;
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
