import { HttpMethodSchema } from '../../src/types/validation';
import { HttpMethod } from '../../src/types/apiResponses';

describe('Validation Schemas', () => {
  describe('HttpMethodSchema Validation', () => {
    it('should validate valid HTTP methods', () => {
      const validMethods = [
        HttpMethod.GET,
        HttpMethod.POST,
        HttpMethod.PUT,
        HttpMethod.DELETE,
        HttpMethod.PATCH,
        HttpMethod.HEAD,
        HttpMethod.OPTIONS,
      ];

      validMethods.forEach(method => {
        const result = HttpMethodSchema.safeParse(method);
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data).toBe(method);
        }
      });
    });

    it('should reject invalid HTTP methods', () => {
      const invalidMethods = ['INVALID', 'get', 'post', 123, null, undefined];

      invalidMethods.forEach(method => {
        const result = HttpMethodSchema.safeParse(method);
        expect(result.success).toBe(false);
      });
    });
  });
});
