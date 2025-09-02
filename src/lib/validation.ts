/**
 * Validation utilities for common data types
 * Provides reusable validation functions to avoid duplication
 */

// UUID v4 validation regex
export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates if a string is a valid UUID v4
 * @param value - The string to validate
 * @returns true if the string is a valid UUID v4, false otherwise
 */
export function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

/**
 * Validates if a string is a valid UUID v4 and throws an error if not
 * @param value - The string to validate
 * @param fieldName - The name of the field being validated (for error messages)
 * @throws Error if the value is not a valid UUID
 */
export function validateUuid(value: string, fieldName: string): void {
  if (!isValidUuid(value)) {
    throw new Error(`${fieldName} must be a valid UUID`);
  }
}

/**
 * Validates multiple UUID values and throws an error for the first invalid one
 * @param values - Array of objects with value and fieldName properties
 * @throws Error if any value is not a valid UUID
 */
export function validateUuids(values: Array<{ value: string; fieldName: string }>): void {
  for (const { value, fieldName } of values) {
    validateUuid(value, fieldName);
  }
}
