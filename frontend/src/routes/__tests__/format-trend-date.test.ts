import { formatTrendDate } from '../dashboard';

describe('formatTrendDate', () => {
  describe('valid YYYY-MM-DD input', () => {
    it('formats a standard date as Mon D using local date (no UTC offset)', () => {
      const expected = new Date(2026, 2, 24).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
      expect(formatTrendDate('2026-03-24')).toBe(expected);
    });

    it('formats a date with single-digit month correctly', () => {
      const expected = new Date(2026, 0, 5).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
      expect(formatTrendDate('2026-01-05')).toBe(expected);
    });

    it('formats a date with single-digit day correctly', () => {
      const expected = new Date(2026, 11, 1).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
      expect(formatTrendDate('2026-12-01')).toBe(expected);
    });
  });

  describe('malformed input — returns original string', () => {
    it('returns original string when fewer than 3 parts (YYYY-MM)', () => {
      expect(formatTrendDate('2026-03')).toBe('2026-03');
    });

    it('returns original string when only year provided', () => {
      expect(formatTrendDate('2026')).toBe('2026');
    });

    it('returns original string when more than 3 parts', () => {
      expect(formatTrendDate('2026-03-24-extra')).toBe('2026-03-24-extra');
    });

    it('returns empty string when input is empty', () => {
      expect(formatTrendDate('')).toBe('');
    });
  });
});
