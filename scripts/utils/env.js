/**
 * Environment Variable Utilities (CommonJS)
 *
 * Shared utilities for handling environment variables across the application.
 * This prevents code duplication and ensures consistent error messages.
 *
 * CommonJS version for use in Node.js scripts that use require().
 */

/**
 * Get a required environment variable
 * Throws an error if the variable is not set
 */
function getRequiredEnvVar(name, context) {
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
function getOptionalEnvVar(name, defaultValue) {
  return process.env[name] || defaultValue;
}

/**
 * Get an optional environment variable without a default (returns undefined if not set)
 */
function getOptionalEnvVarOrUndefined(name) {
  return process.env[name];
}

/**
 * Parse a boolean environment variable
 */
function parseBooleanEnvVar(name, defaultValue = false) {
  const value = process.env[name];
  if (value === undefined) {
    return defaultValue;
  }
  return value.toLowerCase() === 'true';
}

/**
 * Parse an array environment variable
 */
function parseArrayEnvVar(name, separator = ',', defaultValue = []) {
  const value = process.env[name];
  if (!value) {
    return defaultValue;
  }
  return value.split(separator).map(item => item.trim());
}

/**
 * Parse an integer environment variable
 */
function parseIntEnvVar(name, defaultValue) {
  const value = process.env[name];
  if (!value) {
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${name} must be a valid integer, got: ${value}`);
  }
  return parsed;
}

module.exports = {
  getRequiredEnvVar,
  getOptionalEnvVar,
  getOptionalEnvVarOrUndefined,
  parseBooleanEnvVar,
  parseArrayEnvVar,
  parseIntEnvVar,
};
