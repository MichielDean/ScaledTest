/**
 * Input sanitization utilities for XSS prevention.
 * Escapes HTML entities in user-provided strings before storage.
 */

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

const HTML_ESCAPE_RE = /[&<>"']/g;

/**
 * Escapes HTML entities in a user-provided string to prevent XSS.
 */
export function sanitizeString(value: string): string {
  return value.replace(HTML_ESCAPE_RE, ch => HTML_ESCAPE_MAP[ch]);
}

/**
 * Escapes HTML entities in all values of a string record.
 */
export function sanitizeStringRecord(record: Record<string, string>): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, value] of Object.entries(record)) {
    result[sanitizeString(key)] = sanitizeString(value);
  }
  return result;
}
