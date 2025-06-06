// filepath: c:\Users\mokey\source\ScaledTest\tests\unit\validationSchemas.test.ts
// tests/unit/validationSchemas.test.ts
import { v4 as uuidv4 } from 'uuid';
import {
  ErrorDetailsSchema,
  HttpMethodSchema,
  NetworkRequestSchema,
} from '../../src/models/validationSchemas';
import { HttpMethod } from '../../src/models/validationSchemas';

describe('Validation Schemas', () => {
  describe('ErrorDetailsSchema Validation', () => {
    it('should validate a complete error details object', () => {
      const validErrorDetails = {
        message: 'Error: Test failed unexpectedly',
        stackTrace: 'Error: at line 42\n  at Function.assertSomething',
        screenshotUrl: 'https://example.com/screenshots/123.png',
        consoleOutput: 'Some console output',
      };

      const result = ErrorDetailsSchema.safeParse(validErrorDetails);
      expect(result.success).toBe(true);
    });

    it('should validate with only required fields', () => {
      const minimalErrorDetails = {
        message: 'An error occurred',
      };

      const result = ErrorDetailsSchema.safeParse(minimalErrorDetails);
      expect(result.success).toBe(true);
    });

    it('should reject invalid URL formats', () => {
      const invalidErrorDetails = {
        message: 'Error message',
        screenshotUrl: 'invalid-url',
      };

      const result = ErrorDetailsSchema.safeParse(invalidErrorDetails);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('screenshotUrl');
      }
    });
  });

  describe('NetworkRequestSchema Validation', () => {
    it('should validate a complete network request object', () => {
      const validNetworkRequest = {
        url: 'https://api.example.com/users',
        method: HttpMethod.GET,
        requestHeaders: { 'Content-Type': 'application/json' },
        statusCode: 200,
        responseHeaders: { 'Content-Type': 'application/json' },
        responseBody: '{"success":true}',
        timeTakenMs: 150,
      };

      const result = NetworkRequestSchema.safeParse(validNetworkRequest);
      expect(result.success).toBe(true);
    });

    it('should validate with only required fields', () => {
      const minimalNetworkRequest = {
        url: 'https://api.example.com/users',
        method: HttpMethod.GET,
      };

      const result = NetworkRequestSchema.safeParse(minimalNetworkRequest);
      expect(result.success).toBe(true);
    });

    it('should reject invalid URL formats', () => {
      const invalidNetworkRequest = {
        url: 'not-a-url',
        method: HttpMethod.GET,
      };

      const result = NetworkRequestSchema.safeParse(invalidNetworkRequest);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('url');
      }
    });

    it('should reject invalid HTTP methods', () => {
      const invalidNetworkRequest = {
        url: 'https://api.example.com/users',
        method: 'INVALID_METHOD', // Invalid method
      };

      const result = NetworkRequestSchema.safeParse(invalidNetworkRequest);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].path).toContain('method');
      }
    });
  });
});
