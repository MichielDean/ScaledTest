import { isValidUuid, validateUuid, validateUuids, UUID_REGEX } from '../../src/lib/validation';

describe('Validation Utilities', () => {
  describe('UUID_REGEX', () => {
    it('should match valid UUIDs', () => {
      const validUuids = [
        '550e8400-e29b-41d4-a716-446655440000',
        'f47ac10b-58cc-4372-a567-0e02b2c3d479',
        '6ba7b810-9dad-11d1-80b4-00c04fd430c8',
        '6ba7b811-9dad-11d1-80b4-00c04fd430c8',
        '00000000-0000-1000-8000-000000000000',
      ];

      validUuids.forEach(uuid => {
        expect(UUID_REGEX.test(uuid)).toBe(true);
      });
    });

    it('should not match invalid UUIDs', () => {
      const invalidUuids = [
        'not-a-uuid',
        '550e8400-e29b-41d4-a716',
        '550e8400-e29b-41d4-a716-446655440000-extra',
        '550e8400e29b41d4a716446655440000', // no hyphens
        'g50e8400-e29b-41d4-a716-446655440000', // invalid character
        '550e8400-e29b-41d4-a716-44665544000g', // invalid character at end
        '',
      ];

      invalidUuids.forEach(uuid => {
        expect(UUID_REGEX.test(uuid)).toBe(false);
      });
    });

    it('should be case insensitive', () => {
      const uuid = '550E8400-E29B-41D4-A716-446655440000';
      expect(UUID_REGEX.test(uuid)).toBe(true);
      expect(UUID_REGEX.test(uuid.toLowerCase())).toBe(true);
    });
  });

  describe('isValidUuid', () => {
    it('should return true for valid UUIDs', () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      expect(isValidUuid(validUuid)).toBe(true);
    });

    it('should return false for invalid UUIDs', () => {
      const invalidUuid = 'not-a-uuid';
      expect(isValidUuid(invalidUuid)).toBe(false);
    });

    it('should handle edge cases', () => {
      expect(isValidUuid('')).toBe(false);
      expect(isValidUuid('550e8400-e29b-41d4-a716')).toBe(false);
    });
  });

  describe('validateUuid', () => {
    it('should not throw for valid UUIDs', () => {
      const validUuid = '550e8400-e29b-41d4-a716-446655440000';
      expect(() => validateUuid(validUuid, 'Test ID')).not.toThrow();
    });

    it('should throw descriptive error for invalid UUIDs', () => {
      const invalidUuid = 'not-a-uuid';
      expect(() => validateUuid(invalidUuid, 'User ID')).toThrow('User ID must be a valid UUID');
    });

    it('should include field name in error message', () => {
      const invalidUuid = 'invalid';
      expect(() => validateUuid(invalidUuid, 'Team ID')).toThrow('Team ID must be a valid UUID');
    });
  });

  describe('validateUuids', () => {
    it('should not throw when all UUIDs are valid', () => {
      const validationData = [
        { value: '550e8400-e29b-41d4-a716-446655440000', fieldName: 'User ID' },
        { value: 'f47ac10b-58cc-4372-a567-0e02b2c3d479', fieldName: 'Team ID' },
      ];

      expect(() => validateUuids(validationData)).not.toThrow();
    });

    it('should throw for the first invalid UUID', () => {
      const validationData = [
        { value: '550e8400-e29b-41d4-a716-446655440000', fieldName: 'User ID' },
        { value: 'invalid-uuid', fieldName: 'Team ID' },
        { value: 'another-invalid', fieldName: 'Project ID' },
      ];

      expect(() => validateUuids(validationData)).toThrow('Team ID must be a valid UUID');
    });

    it('should handle empty array', () => {
      expect(() => validateUuids([])).not.toThrow();
    });

    it('should handle single UUID', () => {
      const validationData = [
        { value: '550e8400-e29b-41d4-a716-446655440000', fieldName: 'Single ID' },
      ];

      expect(() => validateUuids(validationData)).not.toThrow();
    });
  });

  describe('Integration with existing code patterns', () => {
    it('should work with try-catch error handling pattern', () => {
      const invalidUuid = 'not-a-uuid';
      let caughtError: Error | null = null;

      try {
        validateUuid(invalidUuid, 'API Parameter');
      } catch (error) {
        caughtError = error as Error;
      }

      expect(caughtError).toBeInstanceOf(Error);
      expect(caughtError?.message).toBe('API Parameter must be a valid UUID');
    });

    it('should work with validation arrays for multiple IDs', () => {
      const userId = '550e8400-e29b-41d4-a716-446655440000';
      const teamId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
      const projectId = 'invalid-id';

      let validationError: Error | null = null;

      try {
        validateUuids([
          { value: userId, fieldName: 'User ID' },
          { value: teamId, fieldName: 'Team ID' },
          { value: projectId, fieldName: 'Project ID' },
        ]);
      } catch (error) {
        validationError = error as Error;
      }

      expect(validationError?.message).toBe('Project ID must be a valid UUID');
    });
  });
});
