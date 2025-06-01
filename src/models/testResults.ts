/**
 * Universal end-to-end test result system interfaces
 * Provides a complete type system for tracking test results across teams, applications,
 * test suites, and individual test cases with full metadata and tagging support.
 */

/**
 * Type for structured metadata
 */
export type MetadataValue = string | number | boolean | null | MetadataObject | MetadataArray;

export interface MetadataObject {
  [key: string]: MetadataValue;
}

export type MetadataArray = MetadataValue[];

/**
 * Base interface with common properties for all entities
 */
export interface BaseEntity {
  /** Unique identifier for the entity */
  id: string;
  /** Timestamp when the entity was created */
  createdAt: string;
  /** Optional tags for categorization and filtering */
  tags?: string[];
  /** Optional flexible metadata storage for custom attributes */
  metadata?: MetadataObject;
}

/**
 * Represents a team that owns one or more applications
 */
export interface Team extends BaseEntity {
  /** Name of the team */
  name: string;
  /** Description of the team */
  description?: string;
}

/**
 * Represents an application owned by a team
 */
export interface Application extends BaseEntity {
  /** Reference to the owning team */
  teamId: string;
  /** Name of the application */
  name: string;
  /** Description of the application */
  description?: string;
  /** Version of the application */
  version?: string;
  /** Repository URL for the application code */
  repositoryUrl?: string;
}

/**
 * Represents a test suite containing multiple test executions
 */
export interface TestSuite extends BaseEntity {
  /** Reference to the application this test suite belongs to */
  applicationId: string;
  /** Name of the test suite */
  name: string;
  /** Description of the test suite */
  description?: string;
  /** Source code location for the test suite */
  sourceLocation?: string;
}

/**
 * Status of a test execution
 */
export enum TestExecutionStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  ABORTED = 'aborted',
  FAILED = 'failed',
}

/**
 * Represents a single execution of a test suite
 */
export interface TestExecution extends BaseEntity {
  /** Reference to the test suite that was executed */
  testSuiteId: string;
  /** Status of the test execution */
  status: TestExecutionStatus;
  /** Start time of the execution */
  startedAt: string;
  /** End time of the execution (if completed) */
  completedAt?: string;
  /** Environment information (e.g., browser, OS, screen size) */
  environment?: Record<string, string>;
  /** Configuration used for this execution */
  configuration?: MetadataObject;
  /** Person or system that triggered this execution */
  triggeredBy?: string;
  /** Build or CI job identifier */
  buildId?: string;
  /** Collection of test cases in this execution */
  testCases: TestCase[];
}

/**
 * Status of a test case
 */
export enum TestCaseStatus {
  PASSED = 'passed',
  FAILED = 'failed',
  SKIPPED = 'skipped',
  BLOCKED = 'blocked',
  NOT_RUN = 'not_run',
}

/**
 * Represents a single test case within a test execution
 */
export interface TestCase extends BaseEntity {
  /** Reference to the test execution this case belongs to */
  testExecutionId: string;
  /** Name of the test case */
  name: string;
  /** Description of the test case */
  description?: string;
  /** Status of the test case */
  status: TestCaseStatus;
  /** Start time of the test case */
  startedAt: string;
  /** End time of the test case (if completed) */
  completedAt?: string;
  /** Duration of the test case in milliseconds */
  durationMs?: number;
  /** Collection of test results for this case */
  testResults: TestResult[];
}

/**
 * Status of a test result
 */
export enum TestResultStatus {
  PASSED = 'passed',
  FAILED = 'failed',
  ERROR = 'error',
  WARNING = 'warning',
  INFO = 'info',
}

/**
 * Priority level for a test result
 */
export enum TestResultPriority {
  CRITICAL = 'critical',
  HIGH = 'high',
  MEDIUM = 'medium',
  LOW = 'low',
}

/**
 * HTTP methods for network requests
 */
export enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
  PATCH = 'PATCH',
  HEAD = 'HEAD',
  OPTIONS = 'OPTIONS',
  TRACE = 'TRACE',
  CONNECT = 'CONNECT',
}

/**
 * Represents a network request made during a test
 */
export interface NetworkRequest {
  /** Request URL */
  url: string;
  /** HTTP method used */
  method: HttpMethod;
  /** Request headers */
  requestHeaders?: Record<string, string>;
  /** Request payload/body */
  requestBody?: string | MetadataObject;
  /** Response status code */
  statusCode?: number;
  /** Response headers */
  responseHeaders?: Record<string, string>;
  /** Response body */
  responseBody?: string | MetadataObject;
  /** Time taken to complete the request in milliseconds */
  timeTakenMs?: number;
  /** Any error that occurred during the request */
  error?: string;
}

/**
 * Represents error details for a failed test result
 */
export interface TestErrorDetails {
  /** Error message */
  message: string;
  /** Stack trace of the error */
  stackTrace?: string;
  /** URL to a screenshot captured at the time of failure */
  screenshotUrl?: string;
  /** URL to logs related to the failure */
  logsUrl?: string;
  /** Console output captured during the test */
  consoleOutput?: string;
  /** Network requests made during the test */
  networkRequests?: NetworkRequest[];
}

/**
 * Represents a single test result within a test case
 */
export interface TestResult extends BaseEntity {
  /** Reference to the test case this result belongs to */
  testCaseId: string;
  /** Status of the test result */
  status: TestResultStatus;
  /** Priority of the test result */
  priority?: TestResultPriority;
  /** Name of the test step or assertion */
  name: string;
  /** Description of what was tested */
  description?: string;
  /** Expected outcome of the test */
  expected?: string;
  /** Actual outcome of the test */
  actual?: string;
  /** Error details if the status is failed or error */
  errorDetails?: TestErrorDetails;
  /** Duration of this specific test in milliseconds */
  durationMs?: number;
}

/**
 * Complete test result data structure, useful for serialization/deserialization
 */
export interface TestResultData {
  teams: Team[];
  applications: Application[];
  testSuites: TestSuite[];
  testExecutions: TestExecution[];
  testCases: TestCase[];
  testResults: TestResult[];
}
