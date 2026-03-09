/**
 * Shared HTTP request utilities.
 *
 * These helpers are used across multiple API route handlers — extracted here
 * to avoid copy-paste drift between files.
 */

/**
 * Normalize x-forwarded-for: it can be a string (possibly comma-separated for proxy
 * chains) or a string array (when Node/Next.js dedups repeated headers). Always return
 * a single IP string, or null when nothing is available.
 *
 * @param header - The raw `x-forwarded-for` header value (string | string[] | undefined)
 * @param fallback - Fallback IP, e.g. `req.socket?.remoteAddress`
 */
export function normalizeIp(
  header: string | string[] | undefined,
  fallback: string | undefined
): string | null {
  if (!header) return fallback ?? null;
  const raw = Array.isArray(header) ? header[0] : header;
  // Take the leftmost IP in a comma-separated proxy chain (original client)
  return raw.split(',')[0].trim() || fallback || null;
}
