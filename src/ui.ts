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
 * Returns the subset of nodes required to display all blobs whose path
 * contains `query` (case-insensitive substring match), together with every
 * ancestor directory node needed to make those blobs reachable in the tree.
 *
 * @param nodes - Full flat node list from the GitHub Trees API
 * @param query - Raw search string (may contain mixed case / leading spaces)
 * @returns     - Filtered flat node list; empty array when nothing matches
 */
function filterNodes(nodes: TreeNode[], query: string): TreeNode[] {
  const q = query.toLowerCase().trim();
  if (!q) return nodes;

  // Collect paths of blobs whose full path contains the query string
  const matchedPaths = new Set<string>();
  for (const node of nodes) {
    if (node.type === 'blob' && node.path.toLowerCase().includes(q)) {
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
 * Creates the sidebar shell: a fixed `<aside>` containing a header, a search
 * bar, and scrollable content area. The sidebar starts hidden; call
 * `setSidebarVisible` to show it.
 *
 * @param onClose  - Callback invoked when the header close button is clicked
 * @param onPin    - Callback invoked when the pin button is clicked
 * @param onSearch - Callback invoked on every keystroke in the search input
 * @param repoInfo - Initial repository context for the header
 * @returns        - Object with the root `sidebar` element and mutable `content` container
 */
export function createSidebar(
  onClose: () => void,
  onPin: () => void,
  onSearch: (query: string) => void,
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

  // ── Search bar ──
  const searchBar = document.createElement('div');
  searchBar.className = `${PREFIX}-search-bar`;

  const searchInput = document.createElement('input');
  searchInput.type = 'search';
  searchInput.className = `${PREFIX}-search-input`;
  searchInput.placeholder = 'Filter files\u2026';
  searchInput.setAttribute('aria-label', 'Filter files in tree');
  searchInput.setAttribute('autocomplete', 'off');
  searchInput.setAttribute('spellcheck', 'false');
  searchInput.addEventListener('input', () => { onSearch(searchInput.value); });

  searchBar.appendChild(searchInput);

  // ── Scrollable content area ──
  const content = document.createElement('div');
  content.className = `${PREFIX}-content`;

  sidebar.appendChild(header);
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
  const isFiltering = filterQuery.trim().length > 0;
  const displayNodes = isFiltering ? filterNodes(nodes, filterQuery) : nodes;
  const hierarchy = buildTreeHierarchy(displayNodes);

  if (hierarchy.length === 0) {
    if (isFiltering) {
      container.innerHTML = `<p class="${PREFIX}-search-empty">No files match <strong>${escapeHtml(filterQuery.trim())}</strong></p>`;
    } else {
      container.innerHTML = `<p class="${PREFIX}-empty">This repository appears to be empty.</p>`;
    }
    return;
  }

  // In filter mode every ancestor directory is auto-expanded so matches are visible.
  const effectiveExpanded = isFiltering
    ? new Set(displayNodes.filter((n) => n.type === 'tree').map((n) => n.path))
    : expandedPaths;

  const ul = document.createElement('ul');
  ul.className = `${PREFIX}-tree`;
  ul.setAttribute('role', 'tree');

  renderTreeItems(
    ul, hierarchy, effectiveExpanded, repoInfo, activePath,
    isFiltering ? filterQuery.trim() : '',
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
        <svg class="${PREFIX}-icon-dir" width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M1.75 1A1.75 1.75 0 0 0 0 2.75v10.5C0 14.216.784 15 1.75 15h12.5A1.75 1.75 0 0 0 16 13.25v-8.5A1.75 1.75 0 0 0 14.25 3H7.5a.25.25 0 0 1-.2-.1l-.9-1.2C6.07 1.26 5.55 1 5 1H1.75Z"/>
        </svg>
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
      anchor.innerHTML = /* html */ `
        <svg class="${PREFIX}-icon-file" width="16" height="16" viewBox="0 0 16 16" fill="currentColor" aria-hidden="true">
          <path d="M2 1.75C2 .784 2.784 0 3.75 0h6.586c.464 0 .909.184 1.237.513l2.914 2.914c.329.328.513.773.513 1.237v9.586A1.75 1.75 0 0 1 13.25 16h-9.5A1.75 1.75 0 0 1 2 14.25Zm1.75-.25a.25.25 0 0 0-.25.25v12.5c0 .138.112.25.25.25h9.5a.25.25 0 0 0 .25-.25V6h-2.75A1.75 1.75 0 0 1 9 4.25V1.5Zm6.75.062V4.25c0 .138.112.25.25.25h2.688l-.011-.013-2.914-2.914-.013-.011Z"/>
        </svg>
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
