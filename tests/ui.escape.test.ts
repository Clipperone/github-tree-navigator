import { describe, it, expect } from 'vitest';
import { escapeHtml, highlightMatch, PREFIX } from '../src/ui';

describe('escapeHtml', () => {
  it('escapes all five HTML metacharacters', () => {
    expect(escapeHtml('&')).toBe('&amp;');
    expect(escapeHtml('<')).toBe('&lt;');
    expect(escapeHtml('>')).toBe('&gt;');
    expect(escapeHtml('"')).toBe('&quot;');
    expect(escapeHtml("'")).toBe('&#39;');
  });

  it('escapes the ampersand first so other entities are not double-escaped', () => {
    expect(escapeHtml('<')).toBe('&lt;'); // not '&amp;lt;'
    expect(escapeHtml('a & b')).toBe('a &amp; b');
  });

  it('escapes a full XSS payload', () => {
    expect(escapeHtml('<img src=x onerror="alert(1)">')).toBe(
      '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;',
    );
  });

  it('leaves a plain string and the empty string untouched', () => {
    expect(escapeHtml('README.md')).toBe('README.md');
    expect(escapeHtml('')).toBe('');
  });
});

describe('highlightMatch', () => {
  it('wraps the matched substring in a scoped <mark>', () => {
    const out = highlightMatch('README.md', 'me');
    expect(out).toContain(`<mark class="${PREFIX}-highlight">ME</mark>`);
    expect(out.startsWith('READ')).toBe(true);
  });

  it('matches case-insensitively', () => {
    expect(highlightMatch('README', 'me')).toContain('<mark');
    expect(highlightMatch('readme', 'ME')).toContain('<mark');
  });

  it('returns the escaped text verbatim when there is no match', () => {
    expect(highlightMatch('abc', 'xyz')).toBe('abc');
    expect(highlightMatch('a<b', 'xyz')).toBe('a&lt;b');
    expect(highlightMatch('abc', 'xyz')).not.toContain('<mark');
  });

  it('keeps hostile text escaped even around the highlighted match (anti-XSS)', () => {
    const out = highlightMatch('<img onerror=alert(1)>', 'img');
    expect(out).not.toContain('<img');
    expect(out).toContain('&lt;');
    expect(out).toContain('&gt;');
    expect(out).toContain(`<mark class="${PREFIX}-highlight">img</mark>`);
  });
});
