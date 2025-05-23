// tests/unit/testDataGenerator.test.ts
import { generateTestExecution } from '../utils/testDataGenerator';
import { TestExecutionSchema } from '../../src/models/validationSchemas';
import { v4 as uuidv4 } from 'uuid';

describe('Test Data Generator', () => {
  describe('Test Execution Generation', () => {
    it('should generate a valid test execution object', () => {
      // Act
      const testExecution = generateTestExecution();

      // Assert
      const result = TestExecutionSchema.safeParse(testExecution);
      expect(result.success).toBe(true);
    });

    it('should apply custom property overrides correctly', () => {
      // Arrange
      const customId = uuidv4();
      const customStatus = 'failed';
      const customTags = ['custom', 'tags'];

      // Act
      const testExecution = generateTestExecution({
        id: customId,
        status: customStatus,
        tags: customTags,
      });

      // Assert
      expect(testExecution.id).toBe(customId);
      expect(testExecution.status).toBe(customStatus);
      expect(testExecution.tags).toEqual(customTags);

      // Verify the result is still valid
      const result = TestExecutionSchema.safeParse(testExecution);
      expect(result.success).toBe(true);
    });

    it('should generate unique IDs for each execution', () => {
      // Act
      const execution1 = generateTestExecution();
      const execution2 = generateTestExecution();

      // Assert
      expect(execution1.id).not.toBe(execution2.id);
      expect(execution1.testSuiteId).not.toBe(execution2.testSuiteId);
      expect(execution1.testCases[0].id).not.toBe(execution2.testCases[0].id);
    });

    it('should include test cases with test results', () => {
      // Act
      const testExecution = generateTestExecution();

      // Assert
      expect(testExecution.testCases.length).toBeGreaterThan(0);
      expect(testExecution.testCases[0].testResults.length).toBeGreaterThan(0);
    });
  });
});
