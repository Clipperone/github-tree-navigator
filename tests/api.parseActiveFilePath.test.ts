import { describe, it, expect } from 'vitest';
import { parseActiveFilePath, PULL_REQUEST_FILE_HASH_PREFIX } from '../src/api';

describe('parseActiveFilePath', () => {
  it('extracts the repo-relative path from a blob URL', () => {
    expect(parseActiveFilePath('https://github.com/owner/repo/blob/main/src/api.ts')).toBe('src/api.ts');
  });

  it('handles nested blob paths', () => {
    expect(
      parseActiveFilePath('https://github.com/owner/repo/blob/main/a/b/c/d.ts'),
    ).toBe('a/b/c/d.ts');
  });

  it('returns null for a blob URL without a path', () => {
    expect(parseActiveFilePath('https://github.com/owner/repo/blob/main')).toBeNull();
  });

  it('decodes the PR file hash deep-link', () => {
    const href = `https://github.com/owner/repo/pull/5/files#${PULL_REQUEST_FILE_HASH_PREFIX}src%2Fapi.ts`;
    expect(parseActiveFilePath(href)).toBe('src/api.ts');
  });

  it('returns null when the PR files hash prefix is missing', () => {
    expect(parseActiveFilePath('https://github.com/owner/repo/pull/5/files#other')).toBeNull();
  });

  it('returns null for an empty encoded path in the PR hash', () => {
    expect(
      parseActiveFilePath(`https://github.com/owner/repo/pull/5/files#${PULL_REQUEST_FILE_HASH_PREFIX}`),
    ).toBeNull();
  });

  it('returns null for malformed percent-encoding in the PR hash', () => {
    expect(
      parseActiveFilePath(`https://github.com/owner/repo/pull/5/files#${PULL_REQUEST_FILE_HASH_PREFIX}%`),
    ).toBeNull();
  });

  it('returns null for non-github.com hosts', () => {
    expect(parseActiveFilePath('https://gitlab.com/owner/repo/blob/main/src/api.ts')).toBeNull();
  });

  it('returns null for non-blob, non-PR-files pages', () => {
    expect(parseActiveFilePath('https://github.com/owner/repo/tree/main')).toBeNull();
    expect(parseActiveFilePath('https://github.com/owner/repo')).toBeNull();
  });
});
