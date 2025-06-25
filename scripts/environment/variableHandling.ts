/**
 * Environment Variable Handling (TypeScript)
 *
 * Shared functionality for handling environment variables across the application.
 * This prevents code duplication and ensures consistent error messages.
 */

/**
 * Get a required environment variable
 * Throws an error if the variable is not set
 */
function getRequiredEnvVar(name: string, context?: string): string {
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
function getOptionalEnvVar(name: string, defaultValue: string): string {
  return process.env[name] || defaultValue;
}

/**
 * Get an optional environment variable without a default (returns undefined if not set)
 */
function getOptionalEnvVarOrUndefined(name: string): string | undefined {
  return process.env[name];
}

/**
 * Parse a boolean environment variable
 */
function parseBooleanEnvVar(name: string, defaultValue: boolean = false): boolean {
  const value = process.env[name];
  if (value === undefined) {
    return defaultValue;
  }
  return value.toLowerCase() === 'true';
}

/**
 * Parse an array environment variable
 */
function parseArrayEnvVar(
  name: string,
  separator: string = ',',
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
function parseIntEnvVar(name: string, defaultValue?: number): number {
  const value = process.env[name];
  if (!value) {
    if (defaultValue === undefined) {
      throw new Error(`Environment variable ${name} is required but not set`);
    }
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a valid integer, got: ${value}`);
  }
  return parsed;
}

export {
  getRequiredEnvVar,
  getOptionalEnvVar,
  getOptionalEnvVarOrUndefined,
  parseBooleanEnvVar,
  parseArrayEnvVar,
  parseIntEnvVar,
};
