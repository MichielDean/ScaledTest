import { CtrfSchema } from '../schemas/ctrf/ctrf';

// Types for our dashboard data
export interface TestReport extends CtrfSchema {
  _id: string;
  storedAt: string;
}

export interface TestReportsResponse {
  success: boolean;
  reports: TestReport[];
  total: number;
}

export interface DashboardFilters {
  status: string;
  tool: string;
  environment: string;
  page: number;
  size: number;
}

// Types for analytics components
export interface TestTrendsData {
  date: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  passRate: number;
}

export interface TestDurationData {
  range: string;
  count: number;
  avgDuration: number;
  minDuration: number;
  maxDuration: number;
}

export interface TestSuiteOverviewData {
  name: string;
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  passRate: number;
  avgDuration: number;
}
