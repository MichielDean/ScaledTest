import { formatDate, formatDateTime, formatDateShort } from '../date';

// ---------------------------------------------------------------------------
// formatDate
// ---------------------------------------------------------------------------

describe('formatDate', () => {
  describe('valid ISO timestamp input', () => {
    it('formats a full ISO timestamp as Mon D, YYYY', () => {
      const expected = new Date('2026-03-24T19:49:03Z').toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      expect(formatDate('2026-03-24T19:49:03Z')).toBe(expected);
    });

    it('formats a date-only ISO string as Mon D, YYYY', () => {
      const expected = new Date('2026-01-01T00:00:00').toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      expect(formatDate('2026-01-01T00:00:00')).toBe(expected);
    });

    it('formats a date at end of year correctly', () => {
      const expected = new Date('2025-12-31T23:59:59Z').toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      expect(formatDate('2025-12-31T23:59:59Z')).toBe(expected);
    });
  });

  describe('invalid input — returns original string', () => {
    it('returns original string for an invalid date', () => {
      expect(formatDate('not-a-date')).toBe('not-a-date');
    });

    it('returns empty string when input is empty', () => {
      expect(formatDate('')).toBe('');
    });
  });
});

// ---------------------------------------------------------------------------
// formatDateTime
// ---------------------------------------------------------------------------

describe('formatDateTime', () => {
  describe('valid ISO timestamp input', () => {
    it('formats a full ISO timestamp including time (no seconds)', () => {
      const d = new Date('2026-03-24T19:49:03Z');
      const expected = d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
      expect(formatDateTime('2026-03-24T19:49:03Z')).toBe(expected);
    });

    it('formats midnight UTC correctly', () => {
      const d = new Date('2026-06-15T00:00:00Z');
      const expected = d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
      expect(formatDateTime('2026-06-15T00:00:00Z')).toBe(expected);
    });

    it('formats a timestamp without seconds', () => {
      const d = new Date('2026-03-24T07:05:00Z');
      const expected = d.toLocaleString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
      expect(formatDateTime('2026-03-24T07:05:00Z')).toBe(expected);
    });
  });

  describe('invalid input — returns original string', () => {
    it('returns original string for an invalid date', () => {
      expect(formatDateTime('not-a-date')).toBe('not-a-date');
    });

    it('returns empty string when input is empty', () => {
      expect(formatDateTime('')).toBe('');
    });
  });
});

// ---------------------------------------------------------------------------
// formatDateShort
// ---------------------------------------------------------------------------

describe('formatDateShort', () => {
  describe('valid YYYY-MM-DD input', () => {
    it('formats a standard date as Mon D using local date (no UTC offset)', () => {
      const expected = new Date(2026, 2, 24).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
      expect(formatDateShort('2026-03-24')).toBe(expected);
    });

    it('formats a date with single-digit month correctly', () => {
      const expected = new Date(2026, 0, 5).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
      expect(formatDateShort('2026-01-05')).toBe(expected);
    });

    it('formats a date with single-digit day correctly', () => {
      const expected = new Date(2026, 11, 1).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
      });
      expect(formatDateShort('2026-12-01')).toBe(expected);
    });
  });

  describe('malformed input — returns original string', () => {
    it('returns original string when fewer than 3 parts (YYYY-MM)', () => {
      expect(formatDateShort('2026-03')).toBe('2026-03');
    });

    it('returns original string when only year provided', () => {
      expect(formatDateShort('2026')).toBe('2026');
    });

    it('returns original string when more than 3 parts', () => {
      expect(formatDateShort('2026-03-24-extra')).toBe('2026-03-24-extra');
    });

    it('returns empty string when input is empty', () => {
      expect(formatDateShort('')).toBe('');
    });

    it('returns original string when parts are not numbers', () => {
      expect(formatDateShort('YYYY-MM-DD')).toBe('YYYY-MM-DD');
    });
  });
});
