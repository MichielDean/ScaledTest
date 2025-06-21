/**
 * Environment Variable Utilities
 *
 * Shared utilities for handling environment variables across the application.
 * This prevents code duplication and ensures consistent error messages.
 */

/**
 * Get a required environment variable
 * Throws an error if the variable is not set
 */
export function getRequiredEnvVar(name: string, context?: string): string {
  const value = process.env[name];
  if (!value) {
    const contextMessage = context ? ` ${context}` : '';
    throw new Error(`Required environment variable ${name} is not set.${contextMessage}`);
  }
  return value;
}

/**
 * Get an optional environment variable with a default value
 */
export function getOptionalEnvVar(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

/**
 * Get an optional environment variable without a default (returns undefined if not set)
 */
export function getOptionalEnvVarOrUndefined(name: string): string | undefined {
  return process.env[name];
}

/**
 * Parse a boolean environment variable
 */
export function parseBooleanEnvVar(name: string, defaultValue = false): boolean {
  const value = process.env[name];
  if (value === undefined) {
    return defaultValue;
  }
  return value.toLowerCase() === 'true';
}

/**
 * Parse an array environment variable
 */
export function parseArrayEnvVar(
  name: string,
  separator = ',',
  defaultValue: string[] = []
): string[] {
  const value = process.env[name];
  if (!value) {
    return defaultValue;
  }
  return value.split(separator).map(item => item.trim());
}

/**
 * Parse an integer environment variable
 */
export function parseIntEnvVar(name: string, defaultValue?: number): number {
  const value = process.env[name];
  if (!value) {
    if (defaultValue === undefined) {
      throw new Error(`Environment variable ${name} is not set and no default value provided`);
    }
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a valid integer, got: ${value}`);
  }
  return parsed;
}

// CommonJS compatibility for scripts that still use require()
module.exports = {
  getRequiredEnvVar,
  getOptionalEnvVar,
  getOptionalEnvVarOrUndefined,
  parseBooleanEnvVar,
  parseArrayEnvVar,
  parseIntEnvVar,
};
