import { describe, it, expect } from 'vitest';
import { buildRepoFileActionUrl } from '../src/api';
import type { RepoInfo } from '../src/state';

const repo: RepoInfo = { owner: 'octocat', repo: 'hello-world', ref: 'main', mode: 'repo' };

describe('buildRepoFileActionUrl', () => {
  it('builds the raw URL on raw.githubusercontent.com', () => {
    expect(buildRepoFileActionUrl('open-raw', repo, 'src/api.ts')).toBe(
      'https://raw.githubusercontent.com/octocat/hello-world/main/src/api.ts',
    );
  });

  it('builds the blame URL on github.com', () => {
    expect(buildRepoFileActionUrl('open-blame', repo, 'src/api.ts')).toBe(
      'https://github.com/octocat/hello-world/blame/main/src/api.ts',
    );
  });

  it('builds the history URL on github.com', () => {
    expect(buildRepoFileActionUrl('open-history', repo, 'src/api.ts')).toBe(
      'https://github.com/octocat/hello-world/commits/main/src/api.ts',
    );
  });

  it('encodes each path segment so special characters cannot break the URL', () => {
    const url = buildRepoFileActionUrl('open-raw', repo, 'src/my file?q=1.ts');
    expect(url).toBe('https://raw.githubusercontent.com/octocat/hello-world/main/src/my%20file%3Fq%3D1.ts');
    // The "?" must be encoded so it cannot start a query string and hijack the URL.
    expect(url).not.toContain('?');
  });

  it('encodes a ref that contains slashes', () => {
    const branchRepo: RepoInfo = { ...repo, ref: 'feature/login' };
    expect(buildRepoFileActionUrl('open-blame', branchRepo, 'a.ts')).toBe(
      'https://github.com/octocat/hello-world/blame/feature%2Flogin/a.ts',
    );
  });

  it('encodes "@" and host-like segments so the request stays on the hardcoded host', () => {
    const url = buildRepoFileActionUrl('open-raw', repo, '@evil.com/x');
    expect(url).toContain('https://raw.githubusercontent.com/octocat/hello-world/main/');
    expect(url).toContain('%40evil.com');
  });

  it('returns null when the context is not a plain repo view', () => {
    const pr: RepoInfo = { owner: 'o', repo: 'r', ref: 'PR #1', mode: 'pull-request', prNumber: 1 };
    expect(buildRepoFileActionUrl('open-raw', pr, 'a.ts')).toBeNull();
  });
});
