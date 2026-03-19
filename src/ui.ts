/**
 * @module ui
 * Pure DOM factory & render functions for the GitHub Tree Navigator sidebar.
 *
 * Rules enforced here:
 * - No state imports — callers pass everything needed as arguments.
 * - No network calls — data arrives through parameters.
 * - All user-controlled strings are HTML-escaped before insertion.
 * - Every exported function returns a DOM node or void; no side-effects on
 *   globals outside the subtree being constructed.
 */

import type { RepoInfo, TreeNode } from './state';

// ─── Constants ────────────────────────────────────────────────────────────────

/** CSS class/ID prefix scoping all extension elements to avoid collisions with GitHub styles. */
export const PREFIX = 'gtn';

// ─── Internal Types ───────────────────────────────────────────────────────────

/**
 * Node in the hierarchical tree built from the flat GitHub API response.
 * Used exclusively by rendering functions; never stored in state.
 */
interface TreeItem {
  /** Display name (last segment of the full path) */
  name: string;
  /** Full path relative to the repository root */
  fullPath: string;
  /** "tree" for directories, "blob" for files */
  type: 'blob' | 'tree';
  /** Nested children — only populated for directories */
  children: TreeItem[];
  /** Original API node, present for all items */
  node: TreeNode;
}

// ─── Tree Hierarchy ───────────────────────────────────────────────────────────

/**
 * Converts a flat list of TreeNode objects (as returned by the GitHub Trees API)
 * into a nested hierarchy suitable for rendering.
 *
 * Sort order: directories before files, alphabetically within each group.
 *
 * @param nodes - Flat array of TreeNode objects from the GitHub Trees API
 * @returns     - Array of top-level TreeItem objects with nested children
 *
 * @example
 * const hierarchy = buildTreeHierarchy(flatNodes);
 * renderTreeItems(ulEl, hierarchy, ...);
 */
export function buildTreeHierarchy(nodes: TreeNode[]): TreeItem[] {
  const root: TreeItem[] = [];
  const map = new Map<string, TreeItem>();

  // Directories first, then files; both sorted alphabetically
  const sorted = [...nodes].sort((a, b) => {
    if (a.type !== b.type) return a.type === 'tree' ? -1 : 1;
    return a.path.localeCompare(b.path);
  });

  for (const node of sorted) {
    const parts = node.path.split('/');
    const name = parts[parts.length - 1];
    const item: TreeItem = { name, fullPath: node.path, type: node.type, children: [], node };
    map.set(node.path, item);

    if (parts.length === 1) {
      root.push(item);
    } else {
      const parentPath = parts.slice(0, -1).join('/');
      const parent = map.get(parentPath);
      // Guard: parent may not exist when the API returns an incomplete tree
      if (parent) {
        parent.children.push(item);
      } else {
        root.push(item);
      }
    }
  }

  return root;
}

// ─── Filter Helpers ───────────────────────────────────────────────────────────

/**
 * Converts a glob pattern (supporting `*` and `?`) into a case-insensitive
 * RegExp anchored at both ends. All regex-special characters other than `*`
 * and `?` are escaped, so user input cannot inject arbitrary regex syntax.
 *
 * @param pattern - Glob string, e.g. `*.yaml` or `src/*.ts`
 * @returns       - Anchored RegExp ready for `test()`
 */
function globToRegex(pattern: string): RegExp {
  // Escape all regex-special chars except * and ?
  const escaped = pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&');
  // * → any sequence of characters, ? → any single character
  const source = escaped.replace(/\*/g, '.*').replace(/\?/g, '.');
  return new RegExp('^' + source + '$', 'i');
}

/**
 * Returns the subset of nodes required to display all blobs matching `query`,
 * together with every ancestor directory node needed to reach those blobs.
 *
 * When `query` contains `*` or `?` it is treated as a glob pattern:
 * - Patterns **without** a `/` are matched against the filename only
 *   (e.g. `*.yaml` matches any YAML file regardless of directory).
 * - Patterns **with** a `/` are matched against the full repo-relative path
 *   (e.g. `src/*.ts` matches TypeScript files directly inside `src/`).
 *
 * When `query` contains neither wildcard, a plain case-insensitive substring
 * match is performed against the full path (original behaviour).
 *
 * @param nodes - Full flat node list from the GitHub Trees API
 * @param query - Raw search string (may contain mixed case / leading spaces)
 * @returns     - Filtered flat node list; empty array when nothing matches
 */
function filterNodes(nodes: TreeNode[], query: string): TreeNode[] {
  const q = query.trim();
  if (!q) return nodes;

  const isGlob = q.includes('*') || q.includes('?');
  let matchesBlob: (path: string) => boolean;

  if (isGlob) {
    const hasPathSep = q.includes('/');
    const re = globToRegex(q);
    matchesBlob = (path: string) => {
      const target = hasPathSep ? path : (path.split('/').at(-1) ?? path);
      return re.test(target);
    };
  } else {
    const lower = q.toLowerCase();
    matchesBlob = (path: string) => path.toLowerCase().includes(lower);
  }

  // Collect paths of matching blobs
  const matchedPaths = new Set<string>();
  for (const node of nodes) {
    if (node.type === 'blob' && matchesBlob(node.path)) {
      matchedPaths.add(node.path);
    }
  }

  if (matchedPaths.size === 0) return [];

  // Add all ancestor directory paths required to reach each matched blob
  const neededPaths = new Set<string>(matchedPaths);
  for (const path of matchedPaths) {
    const parts = path.split('/');
    for (let i = 1; i < parts.length; i++) {
      neededPaths.add(parts.slice(0, i).join('/'));
    }
  }

  return nodes.filter((n) => neededPaths.has(n.path));
}

/**
 * Returns HTML markup for `text` with the first case-insensitive occurrence
 * of `query` wrapped in `<mark class="gtn-highlight">`. Every text fragment
 * is individually HTML-escaped, so no user-supplied content reaches innerHTML
 * unescaped. Returns `escapeHtml(text)` verbatim when there is no match.
 *
 * @param text  - Display string (file name or directory name)
 * @param query - Search term to highlight
 * @returns     - HTML-safe string ready for `innerHTML` insertion
 */
function highlightMatch(text: string, query: string): string {
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return escapeHtml(text);
  const before = text.slice(0, idx);
  const match  = text.slice(idx, idx + query.length);
  const after  = text.slice(idx + query.length);
  return `${escapeHtml(before)}<mark class="${PREFIX}-highlight">${escapeHtml(match)}</mark>${escapeHtml(after)}`;
}

// ─── File Type Icons ─────────────────────────────────────────────────────────

/**
 * Icon key categories used to select the correct SVG and CSS class.
 * Each key maps to a distinct icon in `FILE_ICON_SVG_PATHS`.
 */
type FileIconKey =
  | 'dir'
  | 'ts'
  | 'js'
  | 'json'
  | 'md'
  | 'yaml'
  | 'image'
  | 'lock'
  | 'test'
  | 'css'
  | 'html'
  | 'file';

/**
 * SVG `<path>` data keyed by `FileIconKey`.
 * All paths are static string literals — no user-supplied data ever enters here.
 * viewBox is always "0 0 16 16", width/height 16.
 */
const FILE_ICON_SVG_PATHS: Record<FileIconKey, string> = {
  // GitHub Octicons folder
  dir: '<path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z"/>',
  // TypeScript / TSX — "T" monogram in a rounded square
  ts:   '<rect x="2" y="2" width="12" height="12" rx="2" fill="currentColor"/><text x="8" y="11.5" text-anchor="middle" font-size="8" font-weight="700" font-family="ui-monospace,monospace" fill="var(--color-canvas-default,#fff)">T</text>',
  // JavaScript / JSX — "J" monogram
  js:   '<rect x="2" y="2" width="12" height="12" rx="2" fill="currentColor"/><text x="8" y="11.5" text-anchor="middle" font-size="8" font-weight="700" font-family="ui-monospace,monospace" fill="var(--color-canvas-default,#fff)">J</text>',
  // JSON — curly braces
  json: '<path d="M4.5 2C3.12 2 2 3.12 2 4.5v1C2 6.33 1.33 7 .5 7v2c.83 0 1.5.67 1.5 1.5v1C2 12.88 3.12 14 4.5 14H5v-1.5h-.5c-.28 0-.5-.22-.5-.5v-1C4 9.55 3.45 9 2.75 9l-.25-.01V8l.25-.01C3.45 8 4 7.45 4 6.75v-1c0-.28.22-.5.5-.5H5V3.75h-.5zM11.5 2C12.88 2 14 3.12 14 4.5v1c0 .75.55 1.25 1.25 1.25l.25.01V8l-.25.01c-.7 0-1.25.55-1.25 1.25v1c0 1.38-1.12 2.5-2.5 2.5H11v-1.5h.5c.28 0 .5-.22.5-.5v-1c0-.83.67-1.5 1.5-1.5V7c-.83 0-1.5-.67-1.5-1.5v-1c0-.28-.22-.5-.5-.5H11V2h.5zM7.25 10.5a.75.75 0 1 1 1.5 0 .75.75 0 0 1-1.5 0zM8 4.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5zM7.25 8A.75.75 0 1 1 8.75 8 .75.75 0 0 1 7.25 8z"/>',
  // Markdown — "M↓"
  md:   '<path d="M14.85 3H1.15C.52 3 0 3.52 0 4.15v7.69C0 12.48.52 13 1.15 13h13.69c.64 0 1.16-.52 1.16-1.16V4.15C16 3.52 15.48 3 14.85 3zM9 11H7.5V8.5L6 10.5 4.5 8.5V11H3V5h1.5l1.5 2 1.5-2H9v6zm2.99.5L10 8.5h1.5V5H13v3.5h1.5L11.99 11.5z"/>',
  // YAML — stacked horizontal lines (config document)
  yaml: '<path d="M2 4.75A.75.75 0 0 1 2.75 4h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75zM2 8a.75.75 0 0 1 .75-.75h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 8zm0 3.25a.75.75 0 0 1 .75-.75h5.5a.75.75 0 0 1 0 1.5h-5.5a.75.75 0 0 1-.75-.75z"/>',
  // Image — mountain + sun
  image:'<path d="M1.75 2.5A1.75 1.75 0 0 0 0 4.25v7.5C0 12.216.784 13 1.75 13h12.5A1.75 1.75 0 0 0 16 11.75v-7.5A1.75 1.75 0 0 0 14.25 2.5H1.75zM1.5 4.25a.25.25 0 0 1 .25-.25h12.5a.25.25 0 0 1 .25.25v5.69l-3.22-3.22a.75.75 0 0 0-1.06 0L7.5 9.69 5.78 7.97a.75.75 0 0 0-1.06 0L1.5 11.19V4.25zm.75 7.25 3-3 1.72 1.72a.75.75 0 0 0 1.06 0L10.5 7.69l3 3H2.25zM11 5.75a1 1 0 1 0 2 0 1 1 0 0 0-2 0z"/>',
  // Lock — padlock (lockfiles)
  lock: '<path d="M4 4a4 4 0 0 1 8 0v2h.25c.966 0 1.75.784 1.75 1.75v5.5A1.75 1.75 0 0 1 12.25 15h-8.5A1.75 1.75 0 0 1 2 13.25v-5.5C2 6.784 2.784 6 3.75 6H4V4zm8.25 3.5h-8.5a.25.25 0 0 0-.25.25v5.5c0 .138.112.25.25.25h8.5a.25.25 0 0 0 .25-.25v-5.5a.25.25 0 0 0-.25-.25zM10.5 6V4a2.5 2.5 0 0 0-5 0v2h5zM8 13a1 1 0 1 1 0-2 1 1 0 0 1 0 2z"/>',
  // Test / spec — beaker / flask
  test: '<path d="M14.54 12.44 10 5.52V2.5h.25a.75.75 0 0 0 0-1.5h-4.5a.75.75 0 0 0 0 1.5H6v3.02L1.46 12.44A1.875 1.875 0 0 0 3.281 15h9.438a1.875 1.875 0 0 0 1.821-2.56zm-2.57.06H4.03L8 6.22l3.97 6.28z"/>',
  // CSS — "#" / paint brush placeholder
  css:  '<path d="M.854 10.146a.5.5 0 0 1 0 .708l-3 3a.5.5 0 0 1-.708-.708L.146 10.5.146 10.5 3.146 7.5a.5.5 0 1 1 .708.708L1.207 10.854l2.647 2.646a.5.5 0 0 1 0 .708zm0 0"/><path d="M2 4.75A.75.75 0 0 1 2.75 4h10.5a.75.75 0 0 1 0 1.5H2.75A.75.75 0 0 1 2 4.75zM2 11.25a.75.75 0 0 1 .75-.75h4a.75.75 0 0 1 0 1.5h-4a.75.75 0 0 1-.75-.75zM2 8a.75.75 0 0 1 .75-.75h6.5a.75.75 0 0 1 0 1.5h-6.5A.75.75 0 0 1 2 8z"/>',
  // HTML — angle brackets
  html: '<path d="M4.72 3.22a.75.75 0 0 1 1.06 1.06L2.06 8l3.72 3.72a.75.75 0 1 1-1.06 1.06L.47 8.53a.75.75 0 0 1 0-1.06l4.25-4.25zm6.56 0a.75.75 0 1 0-1.06 1.06L13.94 8l-3.72 3.72a.75.75 0 1 0 1.06 1.06l4.25-4.25a.75.75 0 0 0 0-1.06l-4.25-4.25z"/>',
  // Generic file — document
  file: '<path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688l-.011-.013-2.914-2.914-.013-.011Z"/>',
};

/**
 * Classifies a file by name into one of the `FileIconKey` categories.
 * Logic is based entirely on static names/extensions — no user data enters SVG markup.
 *
 * @param name - Display name of the file (last path segment, e.g. "api.ts")
 * @returns    - FileIconKey used to select the SVG path and CSS colour class
 */
function getFileIconKey(name: string): Exclude<FileIconKey, 'dir'> {
  const lower = name.toLowerCase();

  // Lock files (exact names)
  if (
    lower === 'package-lock.json' ||
    lower === 'yarn.lock' ||
    lower === 'pnpm-lock.yaml' ||
    lower === 'composer.lock' ||
    lower === 'gemfile.lock' ||
    lower === 'poetry.lock'
  ) return 'lock';

  // Test / spec files (name contains .test. / .spec. / __tests__)
  if (/\.(test|spec)\.[a-z]+$/.test(lower) || lower.includes('__tests__')) return 'test';

  const ext = lower.slice(lower.lastIndexOf('.') + 1);

  switch (ext) {
    case 'ts':
    case 'tsx':
    case 'mts':
    case 'cts':
      return 'ts';
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'js';
    case 'json':
    case 'jsonc':
    case 'json5':
      return 'json';
    case 'md':
    case 'mdx':
    case 'markdown':
      return 'md';
    case 'yml':
    case 'yaml':
      return 'yaml';
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
    case 'ico':
    case 'svg':
    case 'avif':
      return 'image';
    case 'css':
    case 'scss':
    case 'sass':
    case 'less':
      return 'css';
    case 'html':
    case 'htm':
      return 'html';
    default:
      return 'file';
  }
}

/**
 * Returns a complete SVG string for the given icon key, ready for `innerHTML`.
 * The returned string is static — it contains no user-supplied values.
 *
 * @param key - Icon category
 * @returns   - Full SVG element string with the appropriate CSS class
 */
function getIconSvg(key: FileIconKey): string {
  const cls = key === 'dir' ? `${PREFIX}-icon-dir` : `${PREFIX}-icon-file ${PREFIX}-icon-file--${key}`;
  return `<svg class="${cls}" width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">${FILE_ICON_SVG_PATHS[key]}</svg>`;
}

// ─── Sidebar Shell ────────────────────────────────────────────────────────────

/**
 * Creates the fixed left-edge toggle widget: a wrapper div containing a
 * "Tree Navigator" vertical label above a folder-icon button.
 * The wrapper receives hover events; the button handles click-to-toggle.
 *
 * @param onToggle - Callback invoked on button click
 * @returns        - Object with the root `wrapper` div and the inner `button`
 */
export function createToggleButton(onToggle: () => void): { wrapper: HTMLDivElement; button: HTMLButtonElement } {
  const wrapper = document.createElement('div');
  wrapper.id = `${PREFIX}-toggle-wrapper`;
  // Turbo Drive preserves permanent elements across SPA navigations — no flicker
  wrapper.setAttribute('data-turbo-permanent', '');

  const label = document.createElement('span');
  label.className = `${PREFIX}-toggle-label`;
  label.textContent = 'Tree Navigator';
  label.setAttribute('aria-hidden', 'true');

  const btn = document.createElement('button');
  btn.id = `${PREFIX}-toggle`;
  btn.setAttribute('aria-label', 'Toggle GitHub Tree Navigator');
  btn.setAttribute('title', 'Toggle file tree');
  btn.setAttribute('aria-pressed', 'false');
  btn.innerHTML = /* html */ `
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
      <path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z"/>
    </svg>
  `;
  btn.addEventListener('click', onToggle);

  wrapper.appendChild(label);
  wrapper.appendChild(btn);

  return { wrapper, button: btn };
}

/**
 * Creates the sidebar shell: a fixed `<aside>` containing a header, a settings
 * panel, a search bar, and scrollable content area. The sidebar starts hidden;
 * call `setSidebarVisible` to show it.
 *
 * @param onClose          - Callback invoked when the header close button is clicked
 * @param onPin            - Callback invoked when the pin button is clicked
 * @param onSearch         - Callback invoked on every keystroke in the search input
 * @param onSettingsToggle - Callback invoked when the settings gear button is clicked
 * @param onSaveToken      - Callback invoked when the user saves a PAT
 * @param onRemoveToken    - Callback invoked when the user removes the stored PAT
 * @param onExpandAll      - Callback invoked when the "Expand All" button is clicked
 * @param onCollapseAll    - Callback invoked when the "Collapse All" button is clicked
 * @param repoInfo         - Initial repository context for the header
 * @returns                - Object with the root `sidebar` element and mutable `content` container
 */
export function createSidebar(
  onClose: () => void,
  onPin: () => void,
  onSearch: (query: string) => void,
  onSettingsToggle: () => void,
  onSaveToken: (token: string) => void,
  onRemoveToken: () => void,
  onExpandAll: () => void,
  onCollapseAll: () => void,
  repoInfo: RepoInfo,
): {
  sidebar: HTMLElement;
  content: HTMLElement;
  pinButton: HTMLButtonElement;
} {
  const sidebar = document.createElement('aside');
  sidebar.id = `${PREFIX}-sidebar`;
  sidebar.setAttribute('aria-label', 'Repository file tree');
  sidebar.setAttribute('role', 'complementary');
  sidebar.setAttribute('aria-hidden', 'true');
  // Turbo Drive preserves permanent elements across SPA navigations — no flicker
  sidebar.setAttribute('data-turbo-permanent', '');

  // ── Header ──
  const header = document.createElement('div');
  header.className = `${PREFIX}-header`;
  header.innerHTML = /* html */ `
    <div class="${PREFIX}-header-info">
      <span class="${PREFIX}-header-repo">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M2 2.5A2.5 2.5 0 0 1 4.5 0h8.75a.75.75 0 0 1 .75.75v12.5a.75.75 0 0 1-.75.75h-2.5a.75.75 0 0 1 0-1.5h1.75v-2h-8a1 1 0 0 0-.714 1.7.75.75 0 1 1-1.072 1.05A2.495 2.495 0 0 1 2 11.5Zm10.5-1h-8a1 1 0 0 0-1 1v6.708A2.486 2.486 0 0 1 4.5 9h8Z"/>
        </svg>
        <span class="${PREFIX}-header-repo-text">${escapeHtml(repoInfo.repo)}</span>
      </span>
      <span class="${PREFIX}-header-branch">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M9.5 3.25a2.25 2.25 0 1 1 3 2.122V6A2.5 2.5 0 0 1 10 8.5H6a1 1 0 0 0-1 1v1.128a2.251 2.251 0 1 1-1.5 0V5.372a2.25 2.25 0 1 1 1.5 0v1.836A2.493 2.493 0 0 1 6 7h4a1 1 0 0 0 1-1v-.628A2.25 2.25 0 0 1 9.5 3.25Zm-6 0a.75.75 0 1 0 1.5 0 .75.75 0 0 0-1.5 0Zm8.25-.75a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5ZM4.25 12a.75.75 0 1 0 0 1.5.75.75 0 0 0 0-1.5Z"/>
        </svg>
        <span class="${PREFIX}-header-branch-text">${escapeHtml(repoInfo.ref)}</span>
      </span>
    </div>
    <div class="${PREFIX}-header-actions">
      <button class="${PREFIX}-expand-btn" aria-label="Expand all directories" title="Expand all">
        <span aria-hidden="true">+</span>
      </button>
      <button class="${PREFIX}-collapse-btn" aria-label="Collapse all directories" title="Collapse all">
        <span aria-hidden="true">−</span>
      </button>
      <button class="${PREFIX}-settings-btn" aria-label="Token settings" title="Token settings" aria-pressed="false">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M8 4.754a3.246 3.246 0 1 0 0 6.492 3.246 3.246 0 0 0 0-6.492M5.754 8a2.246 2.246 0 1 1 4.492 0 2.246 2.246 0 0 1-4.492 0"/>
          <path d="M9.796 1.343c-.527-1.79-3.065-1.79-3.592 0l-.094.319a.873.873 0 0 1-1.255.52l-.292-.16c-1.64-.892-3.433.902-2.54 2.541l.159.292a.873.873 0 0 1-.52 1.255l-.319.094c-1.79.527-1.79 3.065 0 3.592l.319.094a.873.873 0 0 1 .52 1.255l-.16.292c-.892 1.64.901 3.434 2.541 2.54l.292-.159a.873.873 0 0 1 1.255.52l.094.319c.527 1.79 3.065 1.79 3.592 0l.094-.319a.873.873 0 0 1 1.255-.52l.292.16c1.64.893 3.434-.902 2.54-2.541l-.159-.292a.873.873 0 0 1 .52-1.255l.319-.094c1.79-.527 1.79-3.065 0-3.592l-.319-.094a.873.873 0 0 1-.52-1.255l.16-.292c.893-1.64-.902-3.433-2.541-2.54l-.292.159a.873.873 0 0 1-1.255-.52z"/>
        </svg>
      </button>
      <button class="${PREFIX}-pin-btn" aria-label="Keep sidebar open" title="Keep sidebar open" aria-pressed="false">
        <!-- Unpinned: diagonal thumbtack (bi-pin-angle) — suggests “click to pin” -->
        <svg class="${PREFIX}-pin-off" width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M9.828.722a.5.5 0 0 1 .354.146l4.95 4.95a.5.5 0 0 1 0 .707c-.48.48-1.072.588-1.503.588-.177 0-.335-.018-.46-.039l-3.134 3.134a5.927 5.927 0 0 1 .16 1.013c.046.702-.032 1.687-.72 2.375a.5.5 0 0 1-.707 0l-2.829-2.828-3.182 3.182c-.195.195-1.219.902-1.414.707-.195-.195.512-1.22.707-1.414l3.182-3.182-2.828-2.829a.5.5 0 0 1 0-.707c.688-.688 1.673-.767 2.375-.72a5.922 5.922 0 0 1 1.013.16l3.134-3.133a2.772 2.772 0 0 1-.04-.461c0-.43.108-1.022.589-1.503a.5.5 0 0 1 .353-.146z"/>
        </svg>
        <!-- Pinned: vertical solid pin (bi-pin-fill) — suggests “currently pinned” -->
        <svg class="${PREFIX}-pin-on" width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M4.146.146A.5.5 0 0 1 4.5 0h7a.5.5 0 0 1 .5.5c0 .68-.342 1.174-.646 1.479-.126.125-.25.224-.354.298v4.431l.078.048c.203.127.476.314.751.555C12.36 7.775 13 8.527 13 9.5a.5.5 0 0 1-.5.5h-4v4.5c0 .276-.224 1.5-.5 1.5s-.5-1.224-.5-1.5V10h-4a.5.5 0 0 1-.5-.5c0-.973.64-1.725 1.17-2.168.276-.241.548-.428.752-.555l.078-.048V2.277a2.77 2.77 0 0 1-.354-.298C4.342 1.674 4 1.179 4 .5a.5.5 0 0 1 .146-.354z"/>
        </svg>
      </button>
      <button class="${PREFIX}-close-btn" aria-label="Close file tree" title="Close">
        <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/>
        </svg>
      </button>
    </div>
  `;
  header.querySelector<HTMLButtonElement>(`.${PREFIX}-close-btn`)!
    .addEventListener('click', onClose);
  const pinButton = header.querySelector<HTMLButtonElement>(`.${PREFIX}-pin-btn`)!;
  pinButton.addEventListener('click', onPin);
  const settingsButton = header.querySelector<HTMLButtonElement>(`.${PREFIX}-settings-btn`)!;
  settingsButton.addEventListener('click', onSettingsToggle);
  header.querySelector<HTMLButtonElement>(`.${PREFIX}-expand-btn`)!
    .addEventListener('click', onExpandAll);
  header.querySelector<HTMLButtonElement>(`.${PREFIX}-collapse-btn`)!
    .addEventListener('click', onCollapseAll);

  // ── Settings panel ──
  const settingsPanel = document.createElement('div');
  settingsPanel.className = `${PREFIX}-settings-panel`;
  settingsPanel.setAttribute('role', 'region');
  settingsPanel.setAttribute('aria-label', 'Token settings');
  settingsPanel.innerHTML = /* html */ `
    <div class="${PREFIX}-settings-body">
      <div class="${PREFIX}-settings-token-status">
        <svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M13.78 4.22a.75.75 0 0 1 0 1.06l-7.25 7.25a.75.75 0 0 1-1.06 0L2.22 9.28a.751.751 0 0 1 .018-1.042.751.751 0 0 1 1.042-.018L6 10.94l6.72-6.72a.75.75 0 0 1 1.06 0Z"/>
        </svg>
        <span>Token active</span>
      </div>
      <label class="${PREFIX}-settings-label" for="${PREFIX}-pat-input">Personal Access Token</label>
      <div class="${PREFIX}-pat-row">
        <input type="password" id="${PREFIX}-pat-input" class="${PREFIX}-pat-input"
               placeholder="ghp_\u2026" autocomplete="new-password" spellcheck="false"
               aria-label="GitHub Personal Access Token"/>
        <button class="${PREFIX}-pat-save-btn" type="button">Save</button>
      </div>
      <button class="${PREFIX}-pat-remove-btn" type="button">Remove token</button>
      <p class="${PREFIX}-settings-help">Required for private repos &amp; higher rate limits
        (5,000 req/hr vs 60). Stored locally in your browser only.</p>
    </div>
  `;
  const patInput = settingsPanel.querySelector<HTMLInputElement>(`.${PREFIX}-pat-input`)!;
  settingsPanel.querySelector<HTMLButtonElement>(`.${PREFIX}-pat-save-btn`)!
    .addEventListener('click', () => {
      const v = patInput.value.trim();
      if (v) onSaveToken(v);
    });
  settingsPanel.querySelector<HTMLButtonElement>(`.${PREFIX}-pat-remove-btn`)!
    .addEventListener('click', () => {
      patInput.value = '';
      onRemoveToken();
    });

  // ── Search bar ──
  const searchBar = document.createElement('div');
  searchBar.className = `${PREFIX}-search-bar`;

  const searchInner = document.createElement('div');
  searchInner.className = `${PREFIX}-search-inner`;

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.className = `${PREFIX}-search-input`;
  searchInput.placeholder = 'Filter files\u2026 or *.ext';
  searchInput.setAttribute('aria-label', 'Filter files in tree');
  searchInput.setAttribute('autocomplete', 'off');
  searchInput.setAttribute('spellcheck', 'false');

  const clearBtn = document.createElement('button');
  clearBtn.type = 'button';
  clearBtn.className = `${PREFIX}-search-clear`;
  clearBtn.setAttribute('aria-label', 'Clear search');
  clearBtn.setAttribute('title', 'Clear search');
  clearBtn.setAttribute('hidden', '');
  clearBtn.innerHTML = `<svg width="12" height="12" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true"><path d="M3.72 3.72a.75.75 0 0 1 1.06 0L8 6.94l3.22-3.22a.749.749 0 0 1 1.275.326.749.749 0 0 1-.215.734L9.06 8l3.22 3.22a.749.749 0 0 1-.326 1.275.749.749 0 0 1-.734-.215L8 9.06l-3.22 3.22a.751.751 0 0 1-1.042-.018.751.751 0 0 1-.018-1.042L6.94 8 3.72 4.78a.75.75 0 0 1 0-1.06Z"/></svg>`;

  searchInput.addEventListener('input', () => {
    clearBtn.toggleAttribute('hidden', searchInput.value.length === 0);
    onSearch(searchInput.value);
  });

  clearBtn.addEventListener('click', () => {
    searchInput.value = '';
    clearBtn.setAttribute('hidden', '');
    searchInput.focus();
    onSearch('');
  });

  searchInner.appendChild(searchInput);
  searchInner.appendChild(clearBtn);
  searchBar.appendChild(searchInner);

  // ── Scrollable content area ──
  const content = document.createElement('div');
  content.className = `${PREFIX}-content`;

  sidebar.appendChild(header);
  sidebar.appendChild(settingsPanel);
  sidebar.appendChild(searchBar);
  sidebar.appendChild(content);

  return { sidebar, content, pinButton };
}

// ─── State Renderers ─────────────────────────────────────────────────────────

/**
 * Replaces the content container's children with a loading spinner.
 * Uses `aria-live` so screen readers announce the loading state.
 *
 * @param container - The `.gtn-content` element to render into
 */
export function renderLoading(container: HTMLElement): void {
  container.innerHTML = /* html */ `
    <div class="${PREFIX}-loading" role="status" aria-live="polite">
      <span class="${PREFIX}-spinner" aria-hidden="true"></span>
      <span>Loading repository tree…</span>
    </div>
  `;
}

/**
 * Replaces the content container's children with an error message.
 * The message is HTML-escaped to prevent injection.
 *
 * @param container - The `.gtn-content` element to render into
 * @param message   - Human-readable error description
 */
export function renderError(container: HTMLElement, message: string): void {
  container.innerHTML = /* html */ `
    <div class="${PREFIX}-error" role="alert">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true" class="${PREFIX}-icon">
        <path d="M6.457 1.047c.659-1.234 2.427-1.234 3.086 0l6.082 11.378A1.75 1.75 0 0 1 14.082 15H1.918a1.75 1.75 0 0 1-1.543-2.575Zm1.763.707a.25.25 0 0 0-.44 0L1.698 13.132a.25.25 0 0 0 .22.368h12.164a.25.25 0 0 0 .22-.368Zm.53 3.996v2.5a.75.75 0 0 1-1.5 0v-2.5a.75.75 0 0 1 1.5 0ZM9 11a1 1 0 1 1-2 0 1 1 0 0 1 2 0Z"/>
      </svg>
      <span>${escapeHtml(message)}</span>
    </div>
  `;
}

/**
 * Builds and inserts the full interactive file tree into the content container.
 * Re-renders from scratch on every call; kept fast because the hierarchy build
 * is O(n) and the DOM diff is implicit (full replacement of the container).
 *
 * When `filterQuery` is non-empty the visible set is narrowed to blobs whose
 * path matches the query (case-insensitive substring), plus their ancestor
 * directories. All ancestor directories are auto-expanded in filter mode so
 * every match is immediately visible. Matched substrings are highlighted.
 *
 * @param container    - The `.gtn-content` element to render into
 * @param nodes        - Flat TreeNode array from the GitHub Trees API
 * @param expandedPaths - Set of directory paths currently expanded by the user
 * @param repoInfo     - Repository context used to build file URLs
 * @param activePath   - Repo-relative path of the currently viewed file, or null
 * @param filterQuery  - Current search string; empty string disables filtering
 * @param onToggleDir  - Callback when a directory chevron is clicked  (path → void)
 * @param onFileClick  - Callback when a file row is clicked  (path, url → void)
 */
export function renderTree(
  container: HTMLElement,
  nodes: TreeNode[],
  expandedPaths: Set<string>,
  repoInfo: RepoInfo,
  activePath: string | null,
  filterQuery: string,
  onToggleDir: (path: string) => void,
  onFileClick: (path: string, url: string) => void,
): void {
  const trimmed = filterQuery.trim();
  const isFiltering = trimmed.length > 0;
  const displayNodes = isFiltering ? filterNodes(nodes, filterQuery) : nodes;
  const hierarchy = buildTreeHierarchy(displayNodes);

  if (hierarchy.length === 0) {
    if (isFiltering) {
      container.innerHTML = `<p class="${PREFIX}-search-empty">No files match <strong>${escapeHtml(trimmed)}</strong></p>`;
    } else {
      container.innerHTML = `<p class="${PREFIX}-empty">This repository appears to be empty.</p>`;
    }
    return;
  }

  // In filter mode every ancestor directory is auto-expanded so matches are visible.
  const effectiveExpanded = isFiltering
    ? new Set(displayNodes.filter((n) => n.type === 'tree').map((n) => n.path))
    : expandedPaths;

  // Glob patterns (containing * or ?) cannot be highlighted as substrings.
  const isGlob = trimmed.includes('*') || trimmed.includes('?');
  const highlightQuery = isFiltering && !isGlob ? trimmed : '';

  const ul = document.createElement('ul');
  ul.className = `${PREFIX}-tree`;
  ul.setAttribute('role', 'tree');

  renderTreeItems(
    ul, hierarchy, effectiveExpanded, repoInfo, activePath,
    highlightQuery,
    onToggleDir, onFileClick, 0,
  );

  container.replaceChildren(ul);
}

// ─── Tree Item Rendering ─────────────────────────────────────────────────────

/**
 * Recursively builds `<li>` rows for each TreeItem and appends them to `parent`.
 * Indentation is driven by the CSS custom property `--depth` set on each `<li>`,
 * which child buttons/anchors inherit for their `padding-left` calculation.
 *
 * @param parent        - `<ul>` to append items into
 * @param items         - Hierarchical items to render at this level
 * @param expandedPaths - Set of expanded directory full paths
 * @param repoInfo      - Repository context for file URL generation
 * @param activePath    - Repo-relative path of the currently viewed file, or null
 * @param filterQuery   - Active search string for highlighting; empty to skip
 * @param onToggleDir   - Directory toggle callback
 * @param onFileClick   - File click callback
 * @param depth         - Current nesting depth (0 = root)
 */
function renderTreeItems(
  parent: HTMLUListElement,
  items: TreeItem[],
  expandedPaths: Set<string>,
  repoInfo: RepoInfo,
  activePath: string | null,
  filterQuery: string,
  onToggleDir: (path: string) => void,
  onFileClick: (path: string, url: string) => void,
  depth: number,
): void {
  for (const item of items) {
    const li = document.createElement('li');
    li.className = `${PREFIX}-tree-item`;
    li.setAttribute('role', 'treeitem');
    li.dataset['path'] = item.fullPath;
    li.dataset['type'] = item.type;
    li.style.setProperty('--depth', String(depth));

    if (item.type === 'tree') {
      const isExpanded = expandedPaths.has(item.fullPath);
      li.setAttribute('aria-expanded', String(isExpanded));

      const btn = document.createElement('button');
      btn.className = `${PREFIX}-dir-btn`;
      btn.setAttribute(
        'aria-label',
        `${isExpanded ? 'Collapse' : 'Expand'} directory ${item.name}`,
      );
      btn.innerHTML = /* html */ `
        <svg class="${PREFIX}-chevron${isExpanded ? ` ${PREFIX}-chevron--open` : ''}"
             width="12" height="12" viewBox="0 0 12 12"
             fill="currentColor" aria-hidden="true">
          <path d="M4.7 10c-.2 0-.4-.1-.5-.2-.3-.3-.3-.8 0-1.1L6.9 6 4.2 3.3c-.3-.3-.3-.8 0-1.1.3-.3.8-.3 1.1 0l3.3 3.2c.3.3.3.8 0 1.1L5.3 9.8c-.2.1-.4.2-.6.2Z"/>
        </svg>
        ${getIconSvg('dir')}
        <span class="${PREFIX}-item-name">${filterQuery ? highlightMatch(item.name, filterQuery) : escapeHtml(item.name)}</span>
      `;
      btn.addEventListener('click', () => onToggleDir(item.fullPath));
      li.appendChild(btn);

      if (isExpanded && item.children.length > 0) {
        const childUl = document.createElement('ul');
        childUl.className = `${PREFIX}-subtree`;
        childUl.setAttribute('role', 'group');
        renderTreeItems(
          childUl, item.children, expandedPaths,
          repoInfo, activePath, filterQuery, onToggleDir, onFileClick, depth + 1,
        );
        li.appendChild(childUl);
      }
    } else {
      const fileUrl =
        `https://github.com/${repoInfo.owner}/${repoInfo.repo}` +
        `/blob/${repoInfo.ref}/${item.fullPath}`;

      const anchor = document.createElement('a');
      anchor.className = `${PREFIX}-file-link`;
      anchor.href = fileUrl;
      anchor.setAttribute('aria-label', item.name);
      if (item.fullPath === activePath) {
        anchor.classList.add(`${PREFIX}-file-link--active`);
        li.setAttribute('aria-current', 'page');
      }
      const iconKey = getFileIconKey(item.name);
      anchor.innerHTML = /* html */ `
        ${getIconSvg(iconKey)}
        <span class="${PREFIX}-item-name">${filterQuery ? highlightMatch(item.name, filterQuery) : escapeHtml(item.name)}</span>
      `;
      // Let the browser/Turbo Drive navigate naturally; just record the active path
      anchor.addEventListener('click', () => { onFileClick(item.fullPath, fileUrl); });
      li.appendChild(anchor);
    }

    parent.appendChild(li);
  }
}

// ─── Visibility Helpers ───────────────────────────────────────────────────────

/**
 * Toggles the sidebar's open/closed visual state without rebuilding the DOM.
 *
 * @param sidebar - The sidebar `<aside>` element
 * @param open    - True to show, false to hide
 */
export function setSidebarVisible(sidebar: HTMLElement, open: boolean): void {
  sidebar.classList.toggle(`${PREFIX}-sidebar--open`, open);
  sidebar.setAttribute('aria-hidden', String(!open));
}

/**
 * Updates the branch name displayed in the sidebar header.
 * Called when the ref is resolved from "HEAD" to the actual branch name.
 *
 * @param sidebar - The sidebar `<aside>` element
 * @param branch  - The resolved branch name to display
 */
export function setHeaderBranch(sidebar: HTMLElement, branch: string): void {
  const span = sidebar.querySelector<HTMLElement>(`.${PREFIX}-header-branch-text`);
  if (span) span.textContent = branch;
}

/**
 * Updates both the repo name and branch text in the sidebar header.
 * Called when navigating between pages (especially different repos).
 *
 * @param sidebar   - The sidebar `<aside>` element
 * @param repoInfo  - New repository context
 */
export function updateSidebarHeader(sidebar: HTMLElement, repoInfo: RepoInfo): void {
  const repoSpan = sidebar.querySelector<HTMLElement>(`.${PREFIX}-header-repo-text`);
  if (repoSpan) repoSpan.textContent = repoInfo.repo;
  const branchSpan = sidebar.querySelector<HTMLElement>(`.${PREFIX}-header-branch-text`);
  if (branchSpan) branchSpan.textContent = repoInfo.ref;
}

/**
 * Shows or hides the settings panel and updates the settings button's active state.
 *
 * @param sidebar - The sidebar `<aside>` element
 * @param open    - True to show the panel, false to hide it
 */
export function setSettingsPanelOpen(sidebar: HTMLElement, open: boolean): void {
  const panel = sidebar.querySelector<HTMLElement>(`.${PREFIX}-settings-panel`);
  const btn = sidebar.querySelector<HTMLButtonElement>(`.${PREFIX}-settings-btn`);
  if (panel) panel.classList.toggle(`${PREFIX}-settings-panel--open`, open);
  if (btn) {
    btn.classList.toggle(`${PREFIX}-settings-btn--active`, open);
    btn.setAttribute('aria-pressed', String(open));
  }
}

/**
 * Updates the token indicator and remove button visibility in the settings panel.
 *
 * @param sidebar  - The sidebar `<aside>` element
 * @param hasToken - True when a PAT is currently stored
 */
export function setTokenStatus(sidebar: HTMLElement, hasToken: boolean): void {
  const status = sidebar.querySelector<HTMLElement>(`.${PREFIX}-settings-token-status`);
  const removeBtn = sidebar.querySelector<HTMLButtonElement>(`.${PREFIX}-pat-remove-btn`);
  if (status) status.hidden = !hasToken;
  if (removeBtn) removeBtn.hidden = !hasToken;
}

/**
 * Enables or disables the "Expand All" button.
 * Called by content_script after the tree loads or changes, based on the
 * directory count safety threshold.
 *
 * @param sidebar  - The sidebar `<aside>` element
 * @param enabled  - False when the dir count exceeds the safety limit
 */
export function setExpandAllEnabled(sidebar: HTMLElement, enabled: boolean): void {
  const btn = sidebar.querySelector<HTMLButtonElement>(`.${PREFIX}-expand-btn`);
  if (!btn) return;
  btn.disabled = !enabled;
  btn.title = enabled ? 'Expand all' : 'Too many directories — expand disabled';
  btn.setAttribute('aria-label', enabled ? 'Expand all directories' : 'Expand all (disabled — too many directories)');
}

// ─── Resize Handle ───────────────────────────────────────────────────────────

/** Minimum and maximum allowed sidebar widths in pixels. */
const RESIZE_MIN_WIDTH = 180;
const RESIZE_MAX_WIDTH = 600;

/**
 * Appends a drag handle to the sidebar's right edge and wires up pointer-event
 * listeners so the user can resize the sidebar horizontally.
 *
 * Live width changes are applied immediately via the `--gtn-sidebar-width` CSS
 * custom property on the sidebar element. The two callbacks let the caller
 * persist and propagate the new value without coupling ui.ts to storage or state.
 *
 * @param sidebar      - The sidebar `<aside>` element to attach the handle to
 * @param onResize     - Called on every pointermove with the current width (px)
 * @param onResizeEnd  - Called once on pointerup / pointercancel with the final width (px)
 */
export function attachResizeHandle(
  sidebar: HTMLElement,
  onResize: (width: number) => void,
  onResizeEnd: (width: number) => void,
): void {
  const handle = document.createElement('div');
  handle.className = `${PREFIX}-resize-handle`;
  handle.setAttribute('aria-hidden', 'true');

  handle.addEventListener('pointerdown', (e: PointerEvent) => {
    // Only respond to primary button / touch
    if (e.button !== 0 && e.pointerType === 'mouse') return;

    e.preventDefault(); // Prevent text selection and touch scrolling during drag
    handle.setPointerCapture(e.pointerId);

    const startX = e.clientX;
    const startWidth = sidebar.getBoundingClientRect().width;

    handle.classList.add(`${PREFIX}-resize-handle--resizing`);
    // Override cursor globally so it stays col-resize even when the pointer
    // moves outside the handle while dragging.
    document.documentElement.style.setProperty('cursor', 'col-resize', 'important');
    document.documentElement.style.setProperty('user-select', 'none', 'important');

    function clampWidth(clientX: number): number {
      return Math.min(RESIZE_MAX_WIDTH, Math.max(RESIZE_MIN_WIDTH, startWidth + (clientX - startX)));
    }

    function onPointerMove(ev: PointerEvent): void {
      const w = clampWidth(ev.clientX);
      sidebar.style.setProperty('--gtn-sidebar-width', `${w}px`);
      onResize(w);
    }

    function onPointerEnd(ev: PointerEvent): void {
      handle.releasePointerCapture(ev.pointerId);
      handle.classList.remove(`${PREFIX}-resize-handle--resizing`);
      document.documentElement.style.removeProperty('cursor');
      document.documentElement.style.removeProperty('user-select');
      handle.removeEventListener('pointermove', onPointerMove);
      handle.removeEventListener('pointerup', onPointerEnd);
      handle.removeEventListener('pointercancel', onPointerEnd);
      onResizeEnd(clampWidth(ev.clientX));
    }

    handle.addEventListener('pointermove', onPointerMove);
    handle.addEventListener('pointerup', onPointerEnd);
    handle.addEventListener('pointercancel', onPointerEnd);
  });

  sidebar.appendChild(handle);
}

// ─── Security Utility ────────────────────────────────────────────────────────

/**
 * Escapes HTML special characters in a string before inserting it into innerHTML.
 * Prevents XSS when rendering file names or paths sourced from the GitHub API.
 *
 * @param str - Raw string that may contain HTML special characters
 * @returns   - HTML-safe escaped string
 */
function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
