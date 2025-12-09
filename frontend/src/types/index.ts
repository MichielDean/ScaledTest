// Re-export K8s platform types
export * from "./k8s-platform";

// Re-export config types
export * from "./config";

// Test result types (CTRF-based)
export interface TestRun {
  id: string;
  report_id?: string;
  timestamp: string;
  generated_by?: string;
  created_at: string;
  branch?: string;
  commit?: string;
  tests?: number;
  passed?: number;
  failed?: number;
  skipped?: number;
  duration_ms?: number;
  environment?: Record<string, unknown>;
}

export interface TestCase {
  name: string;
  suite: string;
  status: "passed" | "failed" | "skipped" | "pending";
  duration_ms: number;
  error_message?: string;
  stack_trace?: string;
}

export interface TestRunDetails extends TestRun {
  test_cases: TestCase[];
}

export interface UploadTestResultsRequest {
  branch?: string;
  commit_sha?: string;
  total_tests: number;
  passed_tests: number;
  failed_tests: number;
  skipped_tests: number;
  pending_tests: number;
  duration_ms: number;
  environment?: Record<string, unknown>;
  test_cases: TestCase[];
}

export interface TestStatistics {
  total_runs: number;
  total_tests: number;
  passed_tests: number;
  failed_tests: number;
  pass_rate: number;
  avg_duration_ms: number;
}

// API response types
export interface ListTestResultsResponse {
  reports: TestRun[];
  total_count: number;
  page: number;
  page_size: number;
}

// User types (for reference)
export interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

export interface UserProfile {
  id: string;
  email: string;
  name: string;
  role: string;
  created_at: string;
}
