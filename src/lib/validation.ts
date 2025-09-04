/**
 * Validation utilities for common data types
 * Provides reusable validation functions to avoid duplication
 */

// General UUID validation regex - supports all standard UUID versions (1-5)
// The version field (first character of third group) is restricted to [1-5] as per RFC 4122
export const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// UUID v4 specific validation regex
export const UUID_V4_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[4][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Validates if a string is a valid UUID (any version)
 * @param value - The string to validate
 * @returns true if the string is a valid UUID, false otherwise
 */
export function isValidUuid(value: string): boolean {
  return UUID_REGEX.test(value);
}

/**
 * Validates if a string is a valid UUID v4
 * @param value - The string to validate
 * @returns true if the string is a valid UUID v4, false otherwise
 */
export function isValidUuidV4(value: string): boolean {
  return UUID_V4_REGEX.test(value);
}

/**
 * Validates if a string is a valid UUID and throws an error if not
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
 * Validates if a string is a valid UUID v4 and throws an error if not
 * @param value - The string to validate
 * @param fieldName - The name of the field being validated (for error messages)
 * @throws Error if the value is not a valid UUID v4
 */
export function validateUuidV4(value: string, fieldName: string): void {
  if (!isValidUuidV4(value)) {
    throw new Error(`${fieldName} must be a valid UUID v4`);
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

/**
 * Validates multiple UUID v4 values and throws an error for the first invalid one
 * @param values - Array of objects with value and fieldName properties
 * @throws Error if any value is not a valid UUID v4
 */
export function validateUuidV4s(values: Array<{ value: string; fieldName: string }>): void {
  for (const { value, fieldName } of values) {
    validateUuidV4(value, fieldName);
  }
}
