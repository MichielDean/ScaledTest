import { sanitizeString, sanitizeStringRecord } from '@/lib/sanitize';

describe('sanitizeString', () => {
  it('returns safe strings unchanged', () => {
    expect(sanitizeString('hello world')).toBe('hello world');
    expect(sanitizeString('')).toBe('');
    expect(sanitizeString('test 123')).toBe('test 123');
  });

  it('escapes HTML tags', () => {
    expect(sanitizeString('<script>alert("xss")</script>')).toBe(
      '&lt;script&gt;alert(&quot;xss&quot;)&lt;/script&gt;'
    );
  });

  it('escapes ampersands', () => {
    expect(sanitizeString('a & b')).toBe('a &amp; b');
  });

  it('escapes quotes', () => {
    expect(sanitizeString(`"double" and 'single'`)).toBe('&quot;double&quot; and &#39;single&#39;');
  });

  it('escapes mixed dangerous characters', () => {
    expect(sanitizeString('<img onerror="alert(1)" src=x>')).toBe(
      '&lt;img onerror=&quot;alert(1)&quot; src=x&gt;'
    );
  });
});

describe('sanitizeStringRecord', () => {
  it('sanitizes both keys and values', () => {
    const input = { '<key>': '<value>', normal: 'safe' };
    const result = sanitizeStringRecord(input);
    expect(result['&lt;key&gt;']).toBe('&lt;value&gt;');
    expect(result['normal']).toBe('safe');
  });

  it('handles empty records', () => {
    expect(sanitizeStringRecord({})).toEqual({});
  });
});
