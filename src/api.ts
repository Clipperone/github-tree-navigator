/**
 * @module api
 * GitHub REST API integration for the Tree Navigator extension.
 * All exported functions are pure: no DOM access, no global mutations.
 * Input validation and network errors are surfaced via a typed Result type
 * rather than throwing, to keep callers simple.
 */

import type { RepoInfo, TreeNode } from './state';

/** Hash prefix used to deep-link sidebar items into a pull request files page. */
export const PULL_REQUEST_FILE_HASH_PREFIX = 'gtn-path=';

// ─── Types ────────────────────────────────────────────────────────────────────

/** Raw item shape returned by the GitHub Trees API */
interface GitHubTreeItem {
  path: string;
  mode: string;
  type: 'blob' | 'tree' | 'commit';
  sha: string;
  url: string;
  size?: number;
}

/** Top-level shape of a GitHub Trees API JSON response */
interface GitHubTreeResponse {
  sha: string;
  url: string;
  tree: GitHubTreeItem[];
  /** True when the repository is too large for a single recursive response */
  truncated: boolean;
}

/** Item shape returned by GET /repos/{owner}/{repo}/pulls/{pull_number}/files */
interface GitHubPullRequestFile {
  sha: string;
  filename: string;
  status: string;
  blob_url?: string | null;
  previous_filename?: string;
}

/** Item shape returned by GET /repos/{owner}/{repo}/contents/{path} */
interface GitHubContentItem {
  type: 'file' | 'dir' | 'symlink' | 'submodule';
  path: string;
  sha: string;
  url: string;
  html_url?: string | null;
  size?: number;
}

/** Successful repository tree load metadata. */
export interface RepoTreeResult {
  nodes: TreeNode[];
  truncated: boolean;
}

/**
 * Discriminated union result type.
 * Avoids spreading try/catch across callers; always inspect `ok` first.
 */
export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string };

// ─── API Functions ────────────────────────────────────────────────────────────

/**
 * Fetches the complete recursive file tree for a GitHub repository using the
 * Git Trees API (`GET /repos/{owner}/{repo}/git/trees/{tree_sha}?recursive=1`).
 *
 * A single API call retrieves all blobs and trees in the repository.
 * Rate limits: 60 unauthenticated req/hr · 5 000 authenticated req/hr.
 *
 * @param repoInfo   - Repository owner, name, and git ref (branch / SHA / "HEAD")
 * @param authToken  - Optional GitHub PAT to raise rate limits
 * @returns          - ApiResult containing a flat TreeNode array or an error string
 *
 * @example
 * const result = await fetchRepoTree({ owner: 'microsoft', repo: 'vscode', ref: 'main' });
 * if (result.ok) renderTree(result.data);
 * else showError(result.error);
 */
export async function fetchRepoTree(
  repoInfo: RepoInfo,
  authToken?: string,
): Promise<ApiResult<RepoTreeResult>> {
  const { owner, repo, ref } = repoInfo;

  const url =
    `https://api.github.com/repos/` +
    `${encodeURIComponent(owner)}/${encodeURIComponent(repo)}/git/trees/` +
    `${encodeURIComponent(ref)}?recursive=1`;

  const headers: HeadersInit = {
    Accept: 'application/vnd.github.v3+json',
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  try {
    const response = await fetch(url, { headers });

    if (!response.ok) {
      const githubMsg = await readErrorMessage(response);
      return { ok: false, error: buildHttpError(response.status, owner, repo, githubMsg, response.headers) };
    }

    const json: GitHubTreeResponse = await response.json() as GitHubTreeResponse;

    const nodes: TreeNode[] = json.tree
      .filter((item): item is GitHubTreeItem & { type: 'blob' | 'tree' } =>
        item.type === 'blob' || item.type === 'tree',
      )
      .map((item) => ({
        path: item.path,
        type: item.type,
        sha: item.sha,
        url: item.url,
        ...(item.size !== undefined ? { size: item.size } : {}),
      }));

    return { ok: true, data: { nodes, truncated: json.truncated } };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown network error';
    return { ok: false, error: `Network error: ${message}` };
  }
}

/**
 * Fetches the immediate contents of a single directory via the repository
 * contents API. Used as a lazy fallback when the recursive trees API is
 * truncated for very large repositories.
 */
export async function fetchDirectoryContents(
  repoInfo: RepoInfo,
  directoryPath: string,
  authToken?: string,
): Promise<ApiResult<TreeNode[]>> {
  if (repoInfo.mode !== 'repo') {
    return { ok: false, error: 'Directory fallback is only available on repository pages.' };
  }

  const encodedPath = directoryPath
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  const url =
    `https://api.github.com/repos/${encodeURIComponent(repoInfo.owner)}/${encodeURIComponent(repoInfo.repo)}` +
    `/contents${encodedPath ? `/${encodedPath}` : ''}?ref=${encodeURIComponent(repoInfo.ref)}`;

  const headers: HeadersInit = {
    Accept: 'application/vnd.github.v3+json',
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  try {
    const response = await fetch(url, { headers });

    if (!response.ok) {
      const githubMsg = await readErrorMessage(response);
      return {
        ok: false,
        error: buildContentsError(response.status, repoInfo.owner, repoInfo.repo, directoryPath, githubMsg, response.headers),
      };
    }

    const json = await response.json() as GitHubContentItem[] | GitHubContentItem;
    if (!Array.isArray(json)) {
      return {
        ok: false,
        error: `Directory "${directoryPath || '/'}" could not be loaded because GitHub did not return a directory listing.`,
      };
    }

    const nodes: TreeNode[] = json
      .filter((item): item is GitHubContentItem =>
        item.type === 'dir' || item.type === 'file' || item.type === 'symlink' || item.type === 'submodule',
      )
      .map((item) => ({
        path: item.path,
        type: item.type === 'dir' ? 'tree' : 'blob',
        sha: item.sha,
        url: item.url,
        ...(item.size !== undefined ? { size: item.size } : {}),
        ...(typeof item.html_url === 'string' ? { htmlUrl: item.html_url } : {}),
      }));

    return { ok: true, data: nodes };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown network error';
    return { ok: false, error: `Network error: ${message}` };
  }
}

/**
 * Fetches the list of changed files for a pull request and returns them as
 * synthetic TreeNode objects, including ancestor directories.
 */
export async function fetchPullRequestFiles(
  repoInfo: RepoInfo,
  authToken?: string,
): Promise<ApiResult<TreeNode[]>> {
  if (repoInfo.mode !== 'pull-request' || repoInfo.prNumber === undefined) {
    return { ok: false, error: 'Pull request context is missing from the current URL.' };
  }

  const headers: HeadersInit = {
    Accept: 'application/vnd.github.v3+json',
  };
  if (authToken) {
    headers['Authorization'] = `Bearer ${authToken}`;
  }

  try {
    const files: GitHubPullRequestFile[] = [];

    for (let page = 1; page <= 20; page++) {
      const response = await fetch(
        `https://api.github.com/repos/${encodeURIComponent(repoInfo.owner)}/${encodeURIComponent(repoInfo.repo)}` +
        `/pulls/${repoInfo.prNumber}/files?per_page=100&page=${page}`,
        { headers },
      );

      if (!response.ok) {
        const githubMsg = await readErrorMessage(response);
        return {
          ok: false,
          error: buildPullRequestFilesError(response.status, repoInfo.owner, repoInfo.repo, repoInfo.prNumber, githubMsg, response.headers),
        };
      }

      const pageItems = await response.json() as GitHubPullRequestFile[];
      files.push(...pageItems);

      if (pageItems.length < 100) break;
    }

    return {
      ok: true,
      data: buildTreeNodesFromFilePaths(
        repoInfo.owner,
        repoInfo.repo,
        repoInfo.prNumber,
        files.map((file) => ({
          path: file.filename,
          sha: file.sha,
          htmlUrl:
            `https://github.com/${repoInfo.owner}/${repoInfo.repo}/pull/${repoInfo.prNumber}/files` +
            `#${PULL_REQUEST_FILE_HASH_PREFIX}${encodeURIComponent(file.filename)}`,
        })),
      ),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown network error';
    return { ok: false, error: `Network error: ${message}` };
  }
}

/**
 * Parses a GitHub URL and extracts repository context.
 *
 * Supported patterns:
 * - `github.com/{owner}/{repo}`                      → ref defaults to "HEAD"
 * - `github.com/{owner}/{repo}/tree/{branch}/...`    → ref = branch
 * - `github.com/{owner}/{repo}/blob/{branch}/...`    → ref = branch
 * - `github.com/{owner}/{repo}/issues` etc.          → ref defaults to "HEAD"
 *
 * @param href - Full URL string (typically `window.location.href`)
 * @returns    - RepoInfo when URL matches a GitHub repo page, null otherwise
 *
 * @example
 * parseGitHubUrl('https://github.com/facebook/react/tree/main/packages');
 * // → { owner: 'facebook', repo: 'react', ref: 'main' }
 */
export function parseGitHubUrl(href: string): RepoInfo | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }

  if (url.hostname !== 'github.com') return null;

  const parts = url.pathname.split('/').filter(Boolean);
  if (parts.length < 2) return null;

  const [owner, rawRepo, type, ...rest] = parts;

  // Exclude top-level GitHub paths that are not user repositories
  const nonUserSegments = new Set([
    'settings', 'marketplace', 'features', 'pricing', 'about',
    'login', 'join', 'explore', 'notifications', 'orgs', 'apps',
    'sponsors', 'topics', 'collections', 'trending',
  ]);
  if (nonUserSegments.has(owner)) return null;

  // Strip optional .git suffix
  const repo = rawRepo.replace(/\.git$/, '');

  // Derive ref from URL segments when available
  let ref = 'HEAD';
  if (type === 'pull' && rest.length > 0) {
    const prNumber = Number(rest[0]);
    if (Number.isInteger(prNumber) && prNumber > 0) {
      return { owner, repo, ref: `PR #${prNumber}`, mode: 'pull-request', prNumber };
    }
  }

  if ((type === 'tree' || type === 'blob') && rest.length > 0) {
    ref = rest[0];
  }

  return { owner, repo, ref, mode: 'repo' };
}

/**
 * Fetches the default branch name for a repository.
 * Used to resolve the display ref when the URL-derived ref is "HEAD".
 *
 * @param owner     - Repository owner
 * @param repo      - Repository name
 * @param authToken - Optional GitHub PAT
 * @returns         - Default branch name (e.g. "main"), or null on error
 */
export async function fetchDefaultBranch(
  owner: string,
  repo: string,
  authToken?: string,
): Promise<string | null> {
  const headers: HeadersInit = {
    Accept: 'application/vnd.github.v3+json',
  };
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;

  try {
    const response = await fetch(
      `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repo)}`,
      { headers },
    );
    if (!response.ok) return null;
    const json = await response.json() as { default_branch: string };
    return json.default_branch ?? null;
  } catch {
    return null;
  }
}

/**
 * Extracts the repository-relative file path from a GitHub blob URL.
 * Returns null for non-blob pages (tree, issues, root, etc.).
 *
 * @param href - Full URL string (typically `window.location.href`)
 * @returns    - Repo-relative path (e.g. "src/api.ts"), or null
 *
 * @example
 * parseActiveFilePath('https://github.com/owner/repo/blob/main/src/api.ts');
 * // → 'src/api.ts'
 */
export function parseActiveFilePath(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.hostname !== 'github.com') return null;
  const parts = url.pathname.split('/').filter(Boolean);
  if (parts[2] === 'pull' && parts[4] === 'files' && url.hash.startsWith(`#${PULL_REQUEST_FILE_HASH_PREFIX}`)) {
    const encodedPath = url.hash.slice(PULL_REQUEST_FILE_HASH_PREFIX.length + 1);
    if (!encodedPath) return null;
    try {
      return decodeURIComponent(encodedPath);
    } catch {
      return null;
    }
  }
  if (parts[2] === 'blob') {
    if (parts.length < 5) return null;
    return parts.slice(4).join('/') || null;
  }
  return null;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Converts an HTTP error status code into a user-readable message.
 * Accepts the raw GitHub `message` body and response headers to distinguish
 * rate-limit 403s from permission 403s.
 *
 * @param status       - HTTP response status code
 * @param owner        - Repository owner
 * @param repo         - Repository name
 * @param githubMsg    - `message` field from the GitHub JSON error body
 * @param respHeaders  - Response headers (used to check X-RateLimit-Remaining)
 * @returns            - Human-readable error string
 */
function buildHttpError(
  status: number,
  owner: string,
  repo: string,
  githubMsg = '',
  respHeaders?: Headers,
): string {
  switch (status) {
    case 401:
      return 'Authentication failed — token is invalid or expired. Update it in Settings.';
    case 403: {
      const isRateLimit =
        respHeaders?.get('X-RateLimit-Remaining') === '0' ||
        githubMsg.toLowerCase().includes('rate limit');
      if (isRateLimit) {
        return 'GitHub API rate limit exceeded. Add a token in Settings for 5 000 req/hr instead of 60.';
      }
      // Fine-grained PATs or classic tokens without `repo` scope
      const hint = githubMsg ? ` GitHub says: “${githubMsg}”.` : '';
      return `Access denied — token lacks the required permissions.${hint} A classic PAT needs the \`repo\` scope; a fine-grained PAT needs Contents → Read.`;
    }
    case 404:
      return `Repository "${owner}/${repo}" not found. If it is private, add a token with Contents read access in Settings.`;
    case 409:
      return `Repository "${owner}/${repo}" is empty.`;
    default:
      return `GitHub API returned an unexpected status: ${status}.`;
  }
}

/** Builds a user-facing error string for PR changed-files API failures. */
function buildPullRequestFilesError(
  status: number,
  owner: string,
  repo: string,
  prNumber: number,
  githubMsg = '',
  respHeaders?: Headers,
): string {
  switch (status) {
    case 401:
      return 'Authentication failed — token is invalid or expired. Update it in Settings.';
    case 403: {
      const isRateLimit =
        respHeaders?.get('X-RateLimit-Remaining') === '0' ||
        githubMsg.toLowerCase().includes('rate limit');
      if (isRateLimit) {
        return 'GitHub API rate limit exceeded. Add a token in Settings for 5 000 req/hr instead of 60.';
      }
      return 'Access denied — token lacks the required permissions to read pull request files.';
    }
    case 404:
      return `Pull request #${prNumber} for "${owner}/${repo}" was not found or is not accessible.`;
    default:
      return `GitHub API returned an unexpected status while loading PR files: ${status}.`;
  }
}

/** Builds a user-facing error string for contents API failures. */
function buildContentsError(
  status: number,
  owner: string,
  repo: string,
  directoryPath: string,
  githubMsg = '',
  respHeaders?: Headers,
): string {
  const label = directoryPath || '/';

  switch (status) {
    case 401:
      return 'Authentication failed — token is invalid or expired. Update it in Settings.';
    case 403: {
      const isRateLimit =
        respHeaders?.get('X-RateLimit-Remaining') === '0' ||
        githubMsg.toLowerCase().includes('rate limit');
      if (isRateLimit) {
        return 'GitHub API rate limit exceeded. Add a token in Settings for 5 000 req/hr instead of 60.';
      }
      return `Access denied while loading directory "${label}" from "${owner}/${repo}".`;
    }
    case 404:
      return `Directory "${label}" was not found in "${owner}/${repo}".`;
    default:
      return `GitHub API returned an unexpected status while loading directory "${label}": ${status}.`;
  }
}

/** Builds a flat tree representation from a list of changed file paths. */
function buildTreeNodesFromFilePaths(
  owner: string,
  repo: string,
  prNumber: number,
  files: Array<{ path: string; sha: string; htmlUrl: string }>,
): TreeNode[] {
  const nodes: TreeNode[] = [];
  const dirPaths = new Set<string>();

  for (const file of files) {
    const parts = file.path.split('/');
    for (let i = 1; i < parts.length; i++) {
      const dirPath = parts.slice(0, i).join('/');
      if (!dirPaths.has(dirPath)) {
        dirPaths.add(dirPath);
        nodes.push({
          path: dirPath,
          type: 'tree',
          sha: '',
          url: `https://github.com/${owner}/${repo}/pull/${prNumber}/files`,
        });
      }
    }

    nodes.push({
      path: file.path,
      type: 'blob',
      sha: file.sha,
      url: `https://github.com/${owner}/${repo}/pull/${prNumber}/files`,
      htmlUrl: file.htmlUrl,
    });
  }

  return nodes;
}

/**
 * Attempts to read a GitHub JSON error body and return the `message` field.
 * Returns an empty string on any failure (body not JSON, already consumed, etc.).
 */
async function readErrorMessage(response: Response): Promise<string> {
  try {
    const body = await response.json() as { message?: unknown };
    return typeof body.message === 'string' ? body.message : '';
  } catch {
    return '';
  }
}
