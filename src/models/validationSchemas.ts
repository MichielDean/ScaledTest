import { z } from 'zod';

// Define HTTP Method enum directly as we no longer import it from testResults
export enum HttpMethod {
  GET = 'GET',
  POST = 'POST',
  PUT = 'PUT',
  DELETE = 'DELETE',
  PATCH = 'PATCH',
  HEAD = 'HEAD',
  OPTIONS = 'OPTIONS',
}

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

// Validation schema for the basic error details
export const ErrorDetailsSchema = z.object({
  message: z.string(),
  stackTrace: z.string().optional(),
  screenshotUrl: z.string().url().optional(),
  logsUrl: z.string().url().optional(),
  consoleOutput: z.string().optional(),
  networkRequests: z.array(NetworkRequestSchema).optional(),
});
