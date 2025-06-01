import { z } from 'zod';
import {
  TestExecutionStatus,
  TestCaseStatus,
  TestResultStatus,
  TestResultPriority,
  HttpMethod,
} from './testResults';
// We define Zod schemas that match our TypeScript types

// Validation schema for HttpMethod
export const HttpMethodSchema = z.nativeEnum(HttpMethod);

// Validation schema for NetworkRequest
export const NetworkRequestSchema = z.object({
  url: z.string().url(),
  method: HttpMethodSchema,
  requestHeaders: z.record(z.string()).optional(),
  requestBody: z.union([z.string(), z.record(z.any())]).optional(),
  statusCode: z.number().int().min(100).max(599).optional(),
  responseHeaders: z.record(z.string()).optional(),
  responseBody: z.union([z.string(), z.record(z.any())]).optional(),
  timeTakenMs: z.number().int().positive().optional(),
  error: z.string().optional(),
});

// Validation schema for the TestErrorDetails
export const TestErrorDetailsSchema = z.object({
  message: z.string(),
  stackTrace: z.string().optional(),
  screenshotUrl: z.string().url().optional(),
  logsUrl: z.string().url().optional(),
  consoleOutput: z.string().optional(),
  networkRequests: z.array(NetworkRequestSchema).optional(),
});

// Validation schema for TestResultStatus
export const TestResultStatusSchema = z.nativeEnum(TestResultStatus);

// Validation schema for TestResultPriority
export const TestResultPrioritySchema = z.nativeEnum(TestResultPriority);

// Validation schema for TestResult
export const TestResultSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime({ offset: true }),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
  testCaseId: z.string().uuid(),
  status: TestResultStatusSchema,
  priority: TestResultPrioritySchema.optional(),
  name: z.string(),
  description: z.string().optional(),
  expected: z.string().optional(),
  actual: z.string().optional(),
  errorDetails: TestErrorDetailsSchema.optional(),
  durationMs: z.number().int().positive().optional(),
});

// Validation schema for TestCaseStatus
export const TestCaseStatusSchema = z.nativeEnum(TestCaseStatus);

// Validation schema for TestCase
export const TestCaseSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime({ offset: true }),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
  testExecutionId: z.string().uuid(),
  name: z.string(),
  description: z.string().optional(),
  status: TestCaseStatusSchema,
  startedAt: z.string().datetime({ offset: true }),
  completedAt: z.string().datetime({ offset: true }).optional(),
  durationMs: z.number().int().positive().optional(),
  testResults: z.array(TestResultSchema),
});

// Validation schema for TestExecutionStatus
export const TestExecutionStatusSchema = z.nativeEnum(TestExecutionStatus);

// Validation schema for TestExecution
export const TestExecutionSchema = z.object({
  id: z.string().uuid(),
  createdAt: z.string().datetime({ offset: true }),
  tags: z.array(z.string()).optional(),
  metadata: z.record(z.any()).optional(),
  testSuiteId: z.string().uuid(),
  status: TestExecutionStatusSchema,
  startedAt: z.string().datetime({ offset: true }),
  completedAt: z.string().datetime({ offset: true }).optional(),
  environment: z.record(z.string()).optional(),
  configuration: z.record(z.any()).optional(),
  triggeredBy: z.string().optional(),
  buildId: z.string().optional(),
  testCases: z.array(TestCaseSchema),
});

// This is the main schema to use for validating test result submissions
export const TestExecutionSubmissionSchema = TestExecutionSchema;

export type ValidatedTestExecution = z.infer<typeof TestExecutionSchema>;
