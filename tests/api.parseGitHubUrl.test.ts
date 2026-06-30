import { describe, it, expect } from 'vitest';
import { parseGitHubUrl } from '../src/api';

describe('parseGitHubUrl', () => {
  it('parses a repository root URL', () => {
    expect(parseGitHubUrl('https://github.com/owner/repo')).toEqual({
      owner: 'owner',
      repo: 'repo',
      ref: 'HEAD',
      mode: 'repo',
    });
  });

  it('derives the ref from a /tree/<ref> URL', () => {
    expect(parseGitHubUrl('https://github.com/owner/repo/tree/main')).toMatchObject({
      ref: 'main',
      mode: 'repo',
    });
  });

  it('derives the ref from a /blob/<ref>/<path> URL', () => {
    expect(parseGitHubUrl('https://github.com/owner/repo/blob/develop/src/api.ts')).toMatchObject({
      ref: 'develop',
      mode: 'repo',
    });
  });

  it('strips an optional .git suffix from the repository name', () => {
    expect(parseGitHubUrl('https://github.com/owner/repo.git')).toMatchObject({ repo: 'repo' });
  });

  it('recognises a pull request URL', () => {
    expect(parseGitHubUrl('https://github.com/owner/repo/pull/42')).toEqual({
      owner: 'owner',
      repo: 'repo',
      ref: 'PR #42',
      mode: 'pull-request',
      prNumber: 42,
    });
  });

  it('falls back to repo mode when the PR number is not a positive integer', () => {
    expect(parseGitHubUrl('https://github.com/owner/repo/pull/not-a-number')).toMatchObject({
      mode: 'repo',
      ref: 'HEAD',
    });
    expect(parseGitHubUrl('https://github.com/owner/repo/pull/0')).toMatchObject({ mode: 'repo' });
    expect(parseGitHubUrl('https://github.com/owner/repo/pull/3.5')).toMatchObject({ mode: 'repo' });
  });

  it('returns null for non-github.com hosts', () => {
    expect(parseGitHubUrl('https://gitlab.com/owner/repo')).toBeNull();
    expect(parseGitHubUrl('https://api.github.com/repos/owner/repo')).toBeNull();
    expect(parseGitHubUrl('https://evil.com/github.com/owner/repo')).toBeNull();
  });

  it('returns null for excluded non-user top-level paths', () => {
    for (const seg of ['settings', 'marketplace', 'sponsors', 'explore', 'topics']) {
      expect(parseGitHubUrl(`https://github.com/${seg}/anything`)).toBeNull();
    }
  });

  it('returns null when there are fewer than two path segments', () => {
    expect(parseGitHubUrl('https://github.com/owner')).toBeNull();
    expect(parseGitHubUrl('https://github.com/')).toBeNull();
  });

  it('returns null for a malformed URL', () => {
    expect(parseGitHubUrl('not a url')).toBeNull();
    expect(parseGitHubUrl('')).toBeNull();
  });
});
