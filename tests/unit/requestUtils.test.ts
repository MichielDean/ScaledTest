/**
 * Tests for src/lib/requestUtils.ts
 *
 * normalizeIp is a shared utility extracted from the execution API handlers to avoid
 * copy-paste drift. These tests lock down its behaviour so both consumers stay correct.
 */
import { normalizeIp } from '../../src/lib/requestUtils';

describe('normalizeIp', () => {
  it('returns null when header is undefined and fallback is undefined', () => {
    expect(normalizeIp(undefined, undefined)).toBeNull();
  });

  it('returns the fallback when header is undefined', () => {
    expect(normalizeIp(undefined, '10.0.0.1')).toBe('10.0.0.1');
  });

  it('returns empty string when header is undefined and fallback is empty string', () => {
    // fallback ?? null only coalesces null/undefined — empty string passes through.
    // In practice req.socket?.remoteAddress is either a valid IP or undefined, so
    // this edge case doesn't arise in production.
    expect(normalizeIp(undefined, '')).toBe('');
  });

  it('returns the header value when it is a plain IP string', () => {
    expect(normalizeIp('192.168.1.1', undefined)).toBe('192.168.1.1');
  });

  it('returns the first IP from a comma-separated proxy chain', () => {
    // Proxy chains: leftmost = original client IP
    expect(normalizeIp('203.0.113.5, 10.10.0.1, 172.16.0.2', undefined)).toBe('203.0.113.5');
  });

  it('trims whitespace around the first IP', () => {
    expect(normalizeIp('  203.0.113.5  , 10.10.0.1', undefined)).toBe('203.0.113.5');
  });

  it('returns first element when header is a string array (Next.js multi-value)', () => {
    expect(normalizeIp(['203.0.113.5', '10.10.0.1'], undefined)).toBe('203.0.113.5');
  });

  it('returns first element of array, stripping proxy chain if needed', () => {
    expect(normalizeIp(['203.0.113.5, 10.10.0.1', '172.16.0.2'], undefined)).toBe('203.0.113.5');
  });

  it('falls back to fallback when header is an empty string', () => {
    expect(normalizeIp('', '10.0.0.1')).toBe('10.0.0.1');
  });

  it('falls back to fallback when header array first element is empty', () => {
    expect(normalizeIp(['', '10.0.0.1'], '192.168.0.1')).toBe('192.168.0.1');
  });

  it('returns null when header is empty and no fallback is provided', () => {
    expect(normalizeIp('', undefined)).toBeNull();
  });
});
