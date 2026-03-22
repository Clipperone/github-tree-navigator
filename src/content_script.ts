/**
 * @module content_script
 * Extension entry point — injected by Chrome into every github.com page.
 *
 * Responsibilities:
 *  1. Detect whether the current page is a GitHub repository page.
 *  2. Mount the toggle button and sidebar shell into the DOM.
 *  3. Wire together the `state`, `api`, and `ui` modules without containing
 *     any business logic of its own — this file is intentionally "thin".
 *  4. Handle GitHub's SPA navigation (Turbo) by tearing down and re-mounting
 *     on each client-side page transition.
 *
 * Module dependency graph (no cycles):
 *   content_script → state, api, ui
 *   ui             → state (types only)
 *   api            → state (types only)
 *   state          → (none)
 */

import {
  parseGitHubUrl,
  fetchRepoTree,
  fetchDirectoryContents,
  fetchPullRequestFiles,
  fetchDefaultBranch,
  parseActiveFilePath,
} from './api';
import {
  createToggleButton,
  createSidebar,
  type FileActionId,
  renderLoading,
  renderError,
  renderTree,
  setSidebarVisible,
  updateSidebarHeader,
  setSettingsPanelOpen,
  setTokenStatus,
  setExpandAllEnabled,
  attachResizeHandle,
  PREFIX,
} from './ui';
import { getState, setState, subscribe, resetState, expandAllDirs, collapseAllDirs, type TreeLoadMode, type TreeNode } from './state';

// ─── Element ID Constants ────────────────────────────────────────────────────

const TOGGLE_WRAPPER_ID = `${PREFIX}-toggle-wrapper`;
const SIDEBAR_ID = `${PREFIX}-sidebar`;
const STORAGE_KEY_PINNED    = 'gtn-pinned';
const STORAGE_KEY_EXPANDED  = 'gtn-expanded-paths';
const STORAGE_KEY_TOKEN     = 'gtn-auth-token';
const STORAGE_KEY_WIDTH     = 'gtn-sidebar-width';
const SESSION_KEY_WIDTH     = 'gtn-sidebar-width';
const TREE_ITEM_SELECTOR = `.${PREFIX}-dir-btn, .${PREFIX}-file-link`;
const SEARCH_INPUT_SELECTOR = `#${SIDEBAR_ID} .${PREFIX}-search-input`;
const SETTINGS_PANEL_SELECTOR = `#${SIDEBAR_ID} .${PREFIX}-settings-panel`;
const TREE_CACHE_MAX_ENTRIES = 12;

/** Maximum number of directories before Expand All is disabled (DOM-freeze safeguard). */
const EXPAND_ALL_DIR_LIMIT = 500;

/** Default sidebar width in pixels. */
const DEFAULT_SIDEBAR_WIDTH = 300;
/** Persisted sidebar width, loaded at startup and updated on resize. */
let _sidebarWidth = DEFAULT_SIDEBAR_WIDTH;
let _focusedTreePath: string | null = null;
let _pendingTreeFocusPath: string | null = null;
const _treeCache = new Map<string, TreeCacheEntry>();

interface TreeCacheEntry {
  treeNodes: TreeNode[];
  treeLoadMode: TreeLoadMode;
  lazyLoadedPaths: string[];
}

// ─── SessionStorage helpers ──────────────────────────────────────────────────

function saveExpandedPaths(paths: Set<string>): void {
  try { sessionStorage.setItem(STORAGE_KEY_EXPANDED, JSON.stringify([...paths])); } catch { /* ignore */ }
}

function loadExpandedPaths(): Set<string> {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY_EXPANDED);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* ignore */ }
  return new Set<string>();
}

function mergeTreeNodes(existing: readonly TreeNode[], incoming: readonly TreeNode[]): TreeNode[] {
  const byPath = new Map<string, TreeNode>();

  for (const node of existing) {
    byPath.set(node.path, node);
  }
  for (const node of incoming) {
    const previous = byPath.get(node.path);
    byPath.set(node.path, previous ? { ...previous, ...node } : node);
  }

  return Array.from(byPath.values());
}

function getTreeCacheKey(repoInfo: NonNullable<ReturnType<typeof getState>['repoInfo']>): string {
  if (repoInfo.mode === 'pull-request') {
    return `pr:${repoInfo.owner}/${repoInfo.repo}#${repoInfo.prNumber ?? 'unknown'}`;
  }
  return `repo:${repoInfo.owner}/${repoInfo.repo}@${repoInfo.ref}`;
}

function getCachedTree(repoInfo: NonNullable<ReturnType<typeof getState>['repoInfo']>): TreeCacheEntry | null {
  const key = getTreeCacheKey(repoInfo);
  const cached = _treeCache.get(key);
  if (!cached) return null;

  // Refresh recency for a simple LRU-style eviction policy.
  _treeCache.delete(key);
  _treeCache.set(key, cached);
  return cached;
}

function setCachedTree(repoInfo: NonNullable<ReturnType<typeof getState>['repoInfo']>, entry: TreeCacheEntry): void {
  const key = getTreeCacheKey(repoInfo);
  _treeCache.delete(key);
  _treeCache.set(key, {
    treeNodes: entry.treeNodes.map((node) => ({ ...node })),
    treeLoadMode: entry.treeLoadMode,
    lazyLoadedPaths: [...entry.lazyLoadedPaths],
  });

  while (_treeCache.size > TREE_CACHE_MAX_ENTRIES) {
    const oldestKey = _treeCache.keys().next().value;
    if (oldestKey === undefined) break;
    _treeCache.delete(oldestKey);
  }
}

function clearTreeCache(): void {
  _treeCache.clear();
}

function applyCachedTree(repoInfo: NonNullable<ReturnType<typeof getState>['repoInfo']>, cached: TreeCacheEntry): void {
  setState({
    repoInfo,
    treeNodes: cached.treeNodes.map((node) => ({ ...node })),
    loading: false,
    error: null,
    hasLoadedTree: true,
    treeLoadMode: cached.treeLoadMode,
    lazyLoadedPaths: new Set<string>(cached.lazyLoadedPaths),
    lazyLoadingPaths: new Set<string>(),
    lazyLoadError: null,
  });
}

function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return (
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target.isContentEditable ||
    target.closest('[contenteditable="true"]') !== null
  );
}

async function copyTextToClipboard(text: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    return;
  } catch {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.setAttribute('readonly', 'true');
    textarea.style.position = 'fixed';
    textarea.style.top = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    textarea.remove();
  }
}

function buildRepoFileActionUrl(actionId: FileActionId, repoInfo: NonNullable<ReturnType<typeof getState>['repoInfo']>, path: string): string | null {
  if (repoInfo.mode !== 'repo') return null;

  const encodedSegments = path
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');

  switch (actionId) {
    case 'open-raw':
      return `https://raw.githubusercontent.com/${repoInfo.owner}/${repoInfo.repo}/${encodeURIComponent(repoInfo.ref)}/${encodedSegments}`;
    case 'open-blame':
      return `https://github.com/${repoInfo.owner}/${repoInfo.repo}/blame/${encodeURIComponent(repoInfo.ref)}/${encodedSegments}`;
    case 'open-history':
      return `https://github.com/${repoInfo.owner}/${repoInfo.repo}/commits/${encodeURIComponent(repoInfo.ref)}/${encodedSegments}`;
    default:
      return null;
  }
}

function getSidebarElement(): HTMLElement | null {
  return document.getElementById(SIDEBAR_ID);
}

function getSearchInput(): HTMLInputElement | null {
  return document.querySelector<HTMLInputElement>(SEARCH_INPUT_SELECTOR);
}

function getVisibleTreeItems(sidebar: HTMLElement): HTMLElement[] {
  return Array.from(sidebar.querySelectorAll<HTMLElement>(TREE_ITEM_SELECTOR));
}

function getTreePathFromElement(element: HTMLElement | null): string | null {
  return element?.closest<HTMLElement>(`.${PREFIX}-tree-item`)?.dataset['path'] ?? null;
}

function focusSearchInput(selectContents = false): void {
  const searchInput = getSearchInput();
  if (!searchInput) return;
  searchInput.focus();
  if (selectContents) {
    searchInput.select();
  }
}

function focusTreeItemByPath(sidebar: HTMLElement, path: string | null): boolean {
  if (path === null) return false;
  const item = sidebar.querySelector<HTMLElement>(`.${PREFIX}-tree-item[data-path="${CSS.escape(path)}"] ${TREE_ITEM_SELECTOR}`);
  if (!item) return false;
  item.focus();
  item.scrollIntoView({ block: 'nearest' });
  return true;
}

function focusFirstTreeItem(sidebar: HTMLElement): boolean {
  const first = getVisibleTreeItems(sidebar)[0];
  if (!first) return false;
  first.focus();
  first.scrollIntoView({ block: 'nearest' });
  _focusedTreePath = getTreePathFromElement(first);
  return true;
}

function restoreTreeFocus(sidebar: HTMLElement): void {
  const activeElement = document.activeElement;
  const shouldRestore =
    _pendingTreeFocusPath !== null ||
    (activeElement instanceof HTMLElement && activeElement.matches(TREE_ITEM_SELECTOR));
  if (!shouldRestore) return;

  const targetPath = _pendingTreeFocusPath ?? _focusedTreePath;
  _pendingTreeFocusPath = null;

  if (focusTreeItemByPath(sidebar, targetPath)) {
    _focusedTreePath = targetPath;
    return;
  }

  focusFirstTreeItem(sidebar);
}

function isOpenSidebarShortcut(event: KeyboardEvent): boolean {
  if (!event.altKey || event.ctrlKey || event.metaKey) return false;

  return (
    event.code === 'Backslash' ||
    event.code === 'IntlBackslash' ||
    event.key === '\\' ||
    event.key === '|'
  );
}

async function openSidebarAndLoadIfNeeded(): Promise<void> {
  if (!getState().sidebarOpen) {
    setState({ sidebarOpen: true });
  }
  if (!getState().hasLoadedTree) {
    await loadTree();
  }
}

function isSettingsPanelOpen(): boolean {
  return document.querySelector<HTMLElement>(SETTINGS_PANEL_SELECTOR)
    ?.classList.contains(`${PREFIX}-settings-panel--open`) === true;
}

function closeSettingsPanel(): void {
  const sidebar = getSidebarElement();
  if (!sidebar) return;
  setSettingsPanelOpen(sidebar, false);
}

function getParentTreeItemElement(element: HTMLElement): HTMLElement | null {
  const currentItem = element.closest<HTMLElement>(`.${PREFIX}-tree-item`);
  const parentSubtree = currentItem?.parentElement;
  if (!(parentSubtree instanceof HTMLUListElement) || !parentSubtree.classList.contains(`${PREFIX}-subtree`)) {
    return null;
  }
  const parentItem = parentSubtree.closest<HTMLElement>(`.${PREFIX}-tree-item`);
  if (!parentItem) return null;
  return parentItem.querySelector<HTMLElement>(TREE_ITEM_SELECTOR);
}

function getChildTreeItemElement(element: HTMLElement): HTMLElement | null {
  return element.closest<HTMLElement>(`.${PREFIX}-tree-item`)
    ?.querySelector<HTMLElement>(`.${PREFIX}-subtree ${TREE_ITEM_SELECTOR}`) ?? null;
}

function handleTreeKeyboardNavigation(event: KeyboardEvent, sidebar: HTMLElement): void {
  const target = event.target instanceof HTMLElement ? event.target : null;
  if (!target?.matches(TREE_ITEM_SELECTOR)) return;

  const items = getVisibleTreeItems(sidebar);
  const currentIndex = items.indexOf(target);
  if (currentIndex === -1) return;

  const focusItem = (item: HTMLElement | undefined | null): void => {
    if (!item) return;
    event.preventDefault();
    item.focus();
    item.scrollIntoView({ block: 'nearest' });
    _focusedTreePath = getTreePathFromElement(item);
  };

  const currentPath = getTreePathFromElement(target);
  const currentTreeItem = target.closest<HTMLElement>(`.${PREFIX}-tree-item`);
  const isDirectory = target.classList.contains(`${PREFIX}-dir-btn`);
  const isExpanded = currentTreeItem?.getAttribute('aria-expanded') === 'true';

  switch (event.key) {
    case 'ArrowDown':
      focusItem(items[currentIndex + 1]);
      return;
    case 'ArrowUp':
      focusItem(items[currentIndex - 1]);
      return;
    case 'Home':
      focusItem(items[0]);
      return;
    case 'End':
      focusItem(items[items.length - 1]);
      return;
    case 'ArrowRight':
      if (!isDirectory) return;
      event.preventDefault();
      _pendingTreeFocusPath = currentPath;
      _focusedTreePath = currentPath;
      if (!isExpanded && currentPath !== null) {
        handleToggleDir(currentPath);
        return;
      }
      focusItem(getChildTreeItemElement(target));
      return;
    case 'ArrowLeft':
      if (isDirectory && isExpanded && currentPath !== null) {
        event.preventDefault();
        _pendingTreeFocusPath = currentPath;
        _focusedTreePath = currentPath;
        handleToggleDir(currentPath);
        return;
      }
      focusItem(getParentTreeItemElement(target));
      return;
    case 'Enter':
      event.preventDefault();
      if (isDirectory && currentPath !== null) {
        _pendingTreeFocusPath = currentPath;
        _focusedTreePath = currentPath;
        handleToggleDir(currentPath);
      } else {
        target.click();
      }
      return;
    case ' ':
      if (!isDirectory || currentPath === null) return;
      event.preventDefault();
      _pendingTreeFocusPath = currentPath;
      _focusedTreePath = currentPath;
      handleToggleDir(currentPath);
      return;
    default:
      return;
  }
}

async function handleGlobalShortcut(event: KeyboardEvent): Promise<void> {
  const sidebar = getSidebarElement();
  const target = event.target;

  if (isOpenSidebarShortcut(event)) {
    event.preventDefault();
    await openSidebarAndLoadIfNeeded();
    focusSearchInput(true);
    return;
  }

  if (event.key === '/' && !event.altKey && !event.ctrlKey && !event.metaKey && !event.shiftKey) {
    if (sidebar === null || !getState().sidebarOpen || isEditableTarget(target)) return;
    event.preventDefault();
    focusSearchInput(true);
    return;
  }

  if (event.key !== 'Escape' || sidebar === null || !getState().sidebarOpen) return;

  const searchInput = getSearchInput();
  if (searchInput !== null && document.activeElement === searchInput) {
    event.preventDefault();
    if (searchInput.value.length > 0) {
      searchInput.value = '';
      handleSearch('');
    } else if (!focusTreeItemByPath(sidebar, _focusedTreePath)) {
      searchInput.blur();
    }
    return;
  }

  if (isSettingsPanelOpen()) {
    event.preventDefault();
    closeSettingsPanel();
    focusSearchInput(false);
    return;
  }

  if (sidebar.contains(document.activeElement)) {
    event.preventDefault();
    handleClose();
  }
}

// ─── Token Storage ──────────────────────────────────────────────────────────

/** In-memory copy of the PAT; loaded once from chrome.storage.local on startup. */
let _authToken: string | undefined;

/** Reads the stored PAT from chrome.storage.local into `_authToken`. */
async function loadStoredToken(): Promise<void> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY_TOKEN);
    const raw = result[STORAGE_KEY_TOKEN];
    _authToken = typeof raw === 'string' && raw.length > 0 ? raw : undefined;
  } catch {
    _authToken = undefined;
  }
}

// ─── Sidebar Width Storage ───────────────────────────────────────────────────

/**
 * Reads the persisted sidebar width from chrome.storage.local.
 * Returns `DEFAULT_SIDEBAR_WIDTH` when no valid value is found.
 */
async function loadStoredWidth(): Promise<number> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY_WIDTH);
    const raw = result[STORAGE_KEY_WIDTH];
    if (typeof raw === 'number' && raw >= 180 && raw <= 600) return raw;
  } catch { /* ignore */ }
  return DEFAULT_SIDEBAR_WIDTH;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Applies or removes the pinned-sidebar body margin.
 * Uses both a CSS class (for transitions) and an inline style (as an
 * immediate guard that survives Turbo body swaps without a painted gap).
 *
 * @param pinned - Whether the sidebar is currently pinned
 */
function applyPinnedBodyStyle(pinned: boolean): void {
  if (pinned) {
    document.body.classList.add('gtn-body--sidebar-pinned');
    document.body.style.setProperty('margin-left', `${_sidebarWidth}px`, 'important');
  } else {
    document.body.classList.remove('gtn-body--sidebar-pinned');
    document.body.style.removeProperty('margin-left');
  }
}

// ─── Mount / Unmount ─────────────────────────────────────────────────────────

/** Stored unsubscribe function for the active state subscriber. */
let _unsubscribe: (() => void) | null = null;

/** Timer ID for the delayed-close-on-hover-leave behaviour. */
let _hoverCloseTimer: number | null = null;

/**
 * Mounts the toggle button and sidebar into `document.body`.
 * No-ops when the current URL is not a recognised GitHub repository page.
 * Calls `unmount()` first to guarantee a clean slate on remounts.
 */
function mount(): void {
  const repoInfo = parseGitHubUrl(window.location.href);
  if (!repoInfo) return;

  // Persist repo context before unmounting so the subscriber sees it immediately
  setState({ repoInfo });
  unmount();

  const { wrapper: toggleWrapper, button: toggleBtn } = createToggleButton(handleToggle);
  const { sidebar, content, pinButton } = createSidebar(
    handleClose, handlePin, handleSearch,
    handleSettingsToggle, handleSaveToken, handleRemoveToken,
    handleExpandAll, handleCollapseAll,
    repoInfo,
  );

  // Apply the persisted width before the sidebar is shown to avoid a flash
  sidebar.style.setProperty('--gtn-sidebar-width', `${_sidebarWidth}px`);
  attachResizeHandle(sidebar, handleResizeMove, handleResizeEnd);

  document.body.appendChild(toggleWrapper);
  document.body.appendChild(sidebar);

  // Open on hover over the toggle wrapper; keep open while cursor is on the sidebar
  toggleWrapper.addEventListener('mouseenter', handleHoverOpen);
  toggleWrapper.addEventListener('mouseleave', scheduleHoverClose);
  sidebar.addEventListener('mouseenter', cancelHoverClose);
  sidebar.addEventListener('mouseleave', scheduleHoverClose);
  sidebar.addEventListener('keydown', (event) => { handleTreeKeyboardNavigation(event, sidebar); });
  sidebar.addEventListener('focusin', (event) => {
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (!target?.matches(TREE_ITEM_SELECTOR)) return;
    _focusedTreePath = getTreePathFromElement(target);
  });

  // Sync DOM with any state that survived navigation / page reload
  const initialS = getState();
  setSidebarVisible(sidebar, initialS.sidebarOpen);
  toggleWrapper.classList.toggle(`${PREFIX}-toggle-wrapper--hidden`, initialS.sidebarOpen);
  applyPinnedBodyStyle(initialS.pinned);
  pinButton.classList.toggle(`${PREFIX}-pin-btn--active`, initialS.pinned);
  pinButton.setAttribute('aria-pressed', String(initialS.pinned));
  pinButton.setAttribute('title', initialS.pinned ? 'Unpin sidebar' : 'Keep sidebar open');
  pinButton.setAttribute('aria-label', initialS.pinned ? 'Unpin sidebar' : 'Keep sidebar open');
  if (initialS.repoInfo !== null) updateSidebarHeader(sidebar, initialS.repoInfo);
  setTokenStatus(sidebar, _authToken !== undefined);

  // React to every future state change
  _unsubscribe = subscribe((s) => {
    // Visibility + toggle active indicator
    setSidebarVisible(sidebar, s.sidebarOpen);
    toggleBtn.setAttribute('aria-pressed', String(s.sidebarOpen));
    // Hide the toggle tab when the sidebar is open, show it when closed
    toggleWrapper.classList.toggle(`${PREFIX}-toggle-wrapper--hidden`, s.sidebarOpen);

    // Update header (repo name + branch) whenever repoInfo changes
    if (s.repoInfo !== null) updateSidebarHeader(sidebar, s.repoInfo);

    // Update pin button visual state
    pinButton.classList.toggle(`${PREFIX}-pin-btn--active`, s.pinned);
    pinButton.setAttribute('aria-pressed', String(s.pinned));
    pinButton.setAttribute('title', s.pinned ? 'Unpin sidebar' : 'Keep sidebar open');
    pinButton.setAttribute('aria-label', s.pinned ? 'Unpin sidebar' : 'Keep sidebar open');

    // Push page content aside when pinned, restore when unpinned.
    // Inline style is kept alongside the CSS class to eliminate any
    // one-frame gap after a Turbo body swap.
    applyPinnedBodyStyle(s.pinned);

    // Persist pin + expanded-paths state so full-page reloads can restore them
    try { sessionStorage.setItem(STORAGE_KEY_PINNED, String(s.pinned)); } catch { /* ignore */ }
    saveExpandedPaths(s.expandedPaths);

    // Content area
    if (s.loading) {
      renderLoading(content);
    } else if (s.error !== null) {
      renderError(content, s.error);
    } else if (s.repoInfo !== null && s.hasLoadedTree) {
      // Update expand-all safeguard whenever treeNodes change
      const dirCount = s.treeNodes.filter((n) => n.type === 'tree').length;
      const canExpandAll = s.treeLoadMode !== 'lazy' && dirCount <= EXPAND_ALL_DIR_LIMIT;
      const expandAllDisabledReason = s.treeLoadMode === 'lazy'
        ? 'Expand all unavailable in large repository mode'
        : 'This repository has more than 500 directories, so expanding everything at once is blocked to avoid freezing the page.';
      setExpandAllEnabled(sidebar, canExpandAll, expandAllDisabledReason);
      renderTree(
        content,
        s.treeNodes,
        s.expandedPaths,
        s.repoInfo,
        s.activePath,
        s.filterQuery,
        s.treeLoadMode,
        canExpandAll ? null : expandAllDisabledReason,
        s.lazyLoadingPaths,
        s.lazyLoadError,
        handleToggleDir,
        handleFileClick,
        handleFileAction,
      );
      restoreTreeFocus(sidebar);
    }
  });
}

/**
 * Removes all extension DOM elements and the active state subscriber.
 * Safe to call even when elements are not present.
 */
function unmount(): void {
  if (_hoverCloseTimer !== null) {
    clearTimeout(_hoverCloseTimer);
    _hoverCloseTimer = null;
  }
  _unsubscribe?.();
  _unsubscribe = null;
  document.body.classList.remove('gtn-body--sidebar-pinned');
  document.body.style.removeProperty('margin-left');
  document.getElementById(TOGGLE_WRAPPER_ID)?.remove();
  document.getElementById(SIDEBAR_ID)?.remove();
}

// ─── Event Handlers ──────────────────────────────────────────────────────────

/**
 * Toggles sidebar open/closed on button click.
 * Triggers a tree fetch on first open (or after a page navigation reset).
 */
async function handleToggle(): Promise<void> {
  cancelHoverClose();
  const opening = !getState().sidebarOpen;
  setState({ sidebarOpen: opening });

  if (opening && !getState().hasLoadedTree) {
    await loadTree();
  }
}

/** Updates the filter query in state; the subscriber re-renders the tree. */
function handleSearch(query: string): void {
  setState({ filterQuery: query });
}

/** Toggles the settings panel open/closed without touching AppState. */
function handleSettingsToggle(): void {
  const sidebar = document.getElementById(SIDEBAR_ID);
  if (!sidebar) return;
  const isOpen = sidebar.querySelector(`.${PREFIX}-settings-panel`)
    ?.classList.contains(`${PREFIX}-settings-panel--open`) === true;
  setSettingsPanelOpen(sidebar, !isOpen);
  if (!isOpen) {
    document.querySelector<HTMLInputElement>(`#${SIDEBAR_ID} .${PREFIX}-pat-input`)?.focus();
  } else {
    focusSearchInput(false);
  }
}

/** Saves a PAT to chrome.storage.local and refreshes the tree with the new token. */
async function handleSaveToken(token: string): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY_TOKEN]: token });
    _authToken = token;
    clearTreeCache();
    const sidebar = document.getElementById(SIDEBAR_ID);
    if (sidebar) setTokenStatus(sidebar, true);
    setState({
      treeNodes: [],
      error: null,
      hasLoadedTree: false,
      treeLoadMode: 'full',
      lazyLoadedPaths: new Set<string>(),
      lazyLoadingPaths: new Set<string>(),
      lazyLoadError: null,
    });
    if (getState().sidebarOpen) await loadTree();
  } catch { /* chrome.storage unavailable */ }
}

/** Removes the stored PAT and refreshes the tree without authentication. */
async function handleRemoveToken(): Promise<void> {
  try {
    await chrome.storage.local.remove(STORAGE_KEY_TOKEN);
    _authToken = undefined;
    clearTreeCache();
    const sidebar = document.getElementById(SIDEBAR_ID);
    if (sidebar) setTokenStatus(sidebar, false);
    setState({
      treeNodes: [],
      error: null,
      hasLoadedTree: false,
      treeLoadMode: 'full',
      lazyLoadedPaths: new Set<string>(),
      lazyLoadingPaths: new Set<string>(),
      lazyLoadError: null,
    });
    if (getState().sidebarOpen) await loadTree();
  } catch { /* chrome.storage unavailable */ }
}

/** Closes the sidebar and removes pin. */
function handleClose(): void {
  cancelHoverClose();
  setState({ sidebarOpen: false, pinned: false });
  document.getElementById(`${PREFIX}-toggle`)?.focus();
}

/**
 * Expands all directories in the current tree.
 * The button is disabled by the subscriber when the dir count exceeds
 * EXPAND_ALL_DIR_LIMIT, so this handler can trust the call is safe.
 */
function handleExpandAll(): void {
  if (getState().treeLoadMode === 'lazy') return;
  const dirPaths = getState().treeNodes
    .filter((n) => n.type === 'tree')
    .map((n) => n.path);
  expandAllDirs(dirPaths);
}

/** Collapses all directories — always safe, no threshold needed. */
function handleCollapseAll(): void {
  collapseAllDirs();
  _pendingTreeFocusPath = _focusedTreePath;
}

/** Toggles the pinned state; pins always open the sidebar. */
function handlePin(): void {
  cancelHoverClose();
  const newPinned = !getState().pinned;
  setState({ pinned: newPinned, sidebarOpen: true });
  if (newPinned && !getState().hasLoadedTree) void loadTree();
}

/** Opens the sidebar when the cursor enters the toggle wrapper. */
function handleHoverOpen(): void {
  cancelHoverClose();
  if (!getState().sidebarOpen) {
    setState({ sidebarOpen: true });
    if (!getState().hasLoadedTree) {
      void loadTree();
    }
  }
}

/** Cancels any pending hover-close timer. */
function cancelHoverClose(): void {
  if (_hoverCloseTimer !== null) {
    clearTimeout(_hoverCloseTimer);
    _hoverCloseTimer = null;
  }
}

/** Schedules sidebar close after a short delay (allows moving cursor from toggle to sidebar). */
function scheduleHoverClose(): void {
  if (getState().pinned) return;  // never auto-close when pinned
  _hoverCloseTimer = window.setTimeout(() => {
    _hoverCloseTimer = null;
    setState({ sidebarOpen: false });
  }, 300);
}

/**
 * Toggles the expanded/collapsed state for a directory path.
 *
 * @param path - Full directory path (e.g. "src/components")
 */
function handleToggleDir(path: string): void {
  _focusedTreePath = path;
  const next = new Set(getState().expandedPaths);
  if (next.has(path)) {
    next.delete(path);
    setState({ expandedPaths: next });
    return;
  }

  next.add(path);
  setState({ expandedPaths: next });

  const state = getState();
  if (
    state.treeLoadMode === 'lazy' &&
    state.repoInfo?.mode === 'repo' &&
    !state.lazyLoadedPaths.has(path) &&
    !state.lazyLoadingPaths.has(path)
  ) {
    void loadLazyDirectory(path);
  }
}

async function loadLazyDirectory(path: string): Promise<void> {
  const state = getState();
  const repoInfo = state.repoInfo;
  if (repoInfo === null || repoInfo.mode !== 'repo') return;

  const nextLoadingPaths = new Set(state.lazyLoadingPaths);
  nextLoadingPaths.add(path);
  setState({ lazyLoadingPaths: nextLoadingPaths, lazyLoadError: null });

  const result = await fetchDirectoryContents(repoInfo, path, _authToken);
  const currentState = getState();
  if (!isSameTreeSource(currentState.repoInfo, repoInfo)) return;

  const remainingLoadingPaths = new Set(currentState.lazyLoadingPaths);
  remainingLoadingPaths.delete(path);

  if (result.ok) {
    const nextLoadedPaths = new Set(currentState.lazyLoadedPaths);
    nextLoadedPaths.add(path);
    const mergedTreeNodes = mergeTreeNodes(currentState.treeNodes, result.data);
    setState({
      treeNodes: mergedTreeNodes,
      lazyLoadedPaths: nextLoadedPaths,
      lazyLoadingPaths: remainingLoadingPaths,
      lazyLoadError: null,
    });
    if (currentState.repoInfo !== null) {
      setCachedTree(currentState.repoInfo, {
        treeNodes: mergedTreeNodes,
        treeLoadMode: currentState.treeLoadMode,
        lazyLoadedPaths: [...nextLoadedPaths],
      });
    }
  } else {
    setState({
      lazyLoadingPaths: remainingLoadingPaths,
      lazyLoadError: `Couldn't load “${path}”. ${result.error}`,
    });
  }
}

/**
 * Records the clicked file as the active path.
 * Navigation is handled by the anchor element itself (Turbo Drive or browser).
 *
 * @param path - Repository-relative file path
 */
function handleFileClick(path: string, _url: string): void {
  setState({ activePath: path });
  if (getState().repoInfo?.mode === 'pull-request') {
    queuePullRequestFileScroll(path);
  }
}

async function handleFileAction(actionId: FileActionId, path: string, url: string): Promise<void> {
  const repoInfo = getState().repoInfo;
  if (repoInfo === null) return;

  switch (actionId) {
    case 'copy-path':
      await copyTextToClipboard(path);
      return;
    case 'copy-link':
      await copyTextToClipboard(url);
      return;
    case 'open-raw':
    case 'open-blame':
    case 'open-history': {
      const targetUrl = buildRepoFileActionUrl(actionId, repoInfo, path);
      if (targetUrl === null) return;
      window.open(targetUrl, '_blank', 'noopener,noreferrer');
      return;
    }
  }
}

/**
 * Called on every pointermove during a sidebar resize.
 * Updates the body margin in real-time when the sidebar is pinned.
 *
 * @param width - Current sidebar width in pixels
 */
function handleResizeMove(width: number): void {
  _sidebarWidth = width;
  if (getState().pinned) {
    document.body.style.setProperty('margin-left', `${width}px`, 'important');
  }
}

/**
 * Called once when the user releases the resize handle.
 * Persists the chosen width to chrome.storage.local and sessionStorage.
 *
 * @param width - Final sidebar width in pixels
 */
async function handleResizeEnd(width: number): Promise<void> {
  _sidebarWidth = width;
  try {
    await chrome.storage.local.set({ [STORAGE_KEY_WIDTH]: width });
    sessionStorage.setItem(SESSION_KEY_WIDTH, String(width));
  } catch { /* storage unavailable */ }
}

// ─── Data Loading ─────────────────────────────────────────────────────────────

/**
 * Fetches the repository tree from the GitHub Trees API and writes the result
 * (or error) into state. The state subscriber in `mount()` handles rendering.
 */
async function loadTree(): Promise<void> {
  let { repoInfo } = getState();
  if (repoInfo === null) return;

  setState({
    loading: true,
    error: null,
    hasLoadedTree: false,
    treeLoadMode: 'full',
    lazyLoadedPaths: new Set<string>(),
    lazyLoadingPaths: new Set<string>(),
    lazyLoadError: null,
  });

  if (repoInfo.mode === 'pull-request') {
    const cachedPullRequestTree = getCachedTree(repoInfo);
    if (cachedPullRequestTree !== null) {
      applyCachedTree(repoInfo, cachedPullRequestTree);
      queuePullRequestFileScroll(getState().activePath);
      return;
    }

    const result = await fetchPullRequestFiles(repoInfo, _authToken);
    if (result.ok) {
      setCachedTree(repoInfo, {
        treeNodes: result.data,
        treeLoadMode: 'full',
        lazyLoadedPaths: [],
      });
      setState({
        treeNodes: result.data,
        loading: false,
        hasLoadedTree: true,
        treeLoadMode: 'full',
      });
      queuePullRequestFileScroll(getState().activePath);
    } else {
      setState({ error: result.error, loading: false });
    }
    return;
  }

  // Resolve 'HEAD' → actual default branch name for display
  if (repoInfo.ref === 'HEAD') {
    const branch = await fetchDefaultBranch(repoInfo.owner, repoInfo.repo, _authToken);
    if (branch !== null) {
      repoInfo = { ...repoInfo, ref: branch };
      setState({ repoInfo });
    }
  }

  const cachedRepoTree = getCachedTree(repoInfo);
  if (cachedRepoTree !== null) {
    applyCachedTree(repoInfo, cachedRepoTree);
    return;
  }

  const result = await fetchRepoTree(repoInfo, _authToken);

  if (result.ok) {
    if (result.data.truncated) {
      const rootContents = await fetchDirectoryContents(repoInfo, '', _authToken);
      if (rootContents.ok) {
        setCachedTree(repoInfo, {
          treeNodes: rootContents.data,
          treeLoadMode: 'lazy',
          lazyLoadedPaths: [''],
        });
        setState({
          treeNodes: rootContents.data,
          loading: false,
          hasLoadedTree: true,
          treeLoadMode: 'lazy',
          lazyLoadedPaths: new Set<string>(['']),
          lazyLoadingPaths: new Set<string>(),
          lazyLoadError: null,
        });
      } else {
        setState({ error: rootContents.error, loading: false });
      }
    } else {
      setCachedTree(repoInfo, {
        treeNodes: result.data.nodes,
        treeLoadMode: 'full',
        lazyLoadedPaths: [],
      });
      setState({ treeNodes: result.data.nodes, loading: false, hasLoadedTree: true });
    }
  } else {
    setState({ error: result.error, loading: false });
  }
}

/** Returns whether two repo contexts map to the same underlying tree source. */
function isSameTreeSource(a: ReturnType<typeof getState>['repoInfo'], b: ReturnType<typeof getState>['repoInfo']): boolean {
  if (a === null || b === null) return false;
  if (a.owner !== b.owner || a.repo !== b.repo || a.mode !== b.mode) return false;
  if (a.mode === 'pull-request') return a.prNumber === b.prNumber;
  return a.ref === b.ref || a.ref === 'HEAD' || b.ref === 'HEAD';
}

/** Attempts to find the visible PR diff block corresponding to a file path. */
function findPullRequestFileElement(path: string): HTMLElement | null {
  const escapedPath = typeof CSS !== 'undefined' ? CSS.escape(path) : path;
  const selectors = [
    `[data-path="${escapedPath}"]`,
    `[data-tagsearch-path="${escapedPath}"]`,
    `a[title="${escapedPath}"]`,
    `[title="${escapedPath}"]`,
  ];

  for (const selector of selectors) {
    const match = document.querySelector<HTMLElement>(selector);
    if (match) {
      return match.closest<HTMLElement>('[data-path], .file, .js-file') ?? match;
    }
  }

  for (const node of Array.from(document.querySelectorAll<HTMLElement>('a, span, div'))) {
    if (node.textContent?.trim() === path) {
      return node.closest<HTMLElement>('[data-path], .file, .js-file') ?? node;
    }
  }

  return null;
}

/** Briefly highlights a PR file block after sidebar-driven navigation. */
function flashPullRequestFileElement(target: HTMLElement): void {
  target.classList.add(`${PREFIX}-pr-target-flash`);
  window.setTimeout(() => {
    target.classList.remove(`${PREFIX}-pr-target-flash`);
  }, 1600);
}

/** Scrolls a changed-file block into view when a PR file deep-link is active. */
function queuePullRequestFileScroll(path: string | null): void {
  if (!path || getState().repoInfo?.mode !== 'pull-request') return;
  window.setTimeout(() => {
    const target = findPullRequestFileElement(path);
    if (!target) return;
    target.scrollIntoView({ block: 'center', behavior: 'smooth' });
    flashPullRequestFileElement(target);
  }, 80);
}

// ─── SPA Navigation ──────────────────────────────────────────────────────────

/**
 * Handles GitHub's client-side navigation events (Turbo Drive).
 *
 * The sidebar/toggle elements carry `data-turbo-permanent` so Turbo Drive
 * preserves them in the DOM across navigations — no teardown/remount needed.
 * We only reset transient tree data when moving to a different repository.
 */
function handleNavigation(): void {
  const newRepoInfo    = parseGitHubUrl(window.location.href);
  const newActivePath  = parseActiveFilePath(window.location.href);
  const isMounted      = document.getElementById(SIDEBAR_ID) !== null;

  if (!newRepoInfo) {
    // Navigated away from a repo page
    if (isMounted) { resetState(); unmount(); }
    return;
  }

  if (!isMounted) {
    // Arrived at a repo page (e.g. from a non-repo page after unmount)
    setState({ repoInfo: newRepoInfo, activePath: newActivePath });
    mount();
    if (getState().sidebarOpen) void loadTree();
    return;
  }

  // Elements preserved by Turbo — update state without touching the DOM
  const prevRepoInfo = getState().repoInfo;
  const sameTreeSource = isSameTreeSource(prevRepoInfo, newRepoInfo);

  // When navigating within the same repo and the new URL has no explicit branch
  // (parseGitHubUrl returns 'HEAD'), keep the already-resolved branch name so
  // the header never reverts to "HEAD" after the first tree load.
  const effectiveRepoInfo =
    sameTreeSource && newRepoInfo.mode === 'repo' && prevRepoInfo !== null && newRepoInfo.ref === 'HEAD' && prevRepoInfo.ref !== 'HEAD'
      ? { ...newRepoInfo, ref: prevRepoInfo.ref }
      : newRepoInfo;

  setState({ repoInfo: effectiveRepoInfo, activePath: newActivePath, loading: false, error: null });

  if (!sameTreeSource) {
    // Different repository — clear stale tree, reset filter, and refetch
    setState({
      treeNodes: [],
      filterQuery: '',
      hasLoadedTree: false,
      treeLoadMode: 'full',
      lazyLoadedPaths: new Set<string>(),
      lazyLoadingPaths: new Set<string>(),
      lazyLoadError: null,
    });
    const searchInput = document.querySelector<HTMLInputElement>(`#${SIDEBAR_ID} .${PREFIX}-search-input`);
    if (searchInput) searchInput.value = '';
    if (getState().sidebarOpen) void loadTree();
  } else if (effectiveRepoInfo.mode === 'pull-request' && newActivePath !== null) {
    queuePullRequestFileScroll(newActivePath);
  }
  // Same tree source: treeNodes stays intact, subscriber re-renders with updated activePath only
}

/** Keeps active file state in sync when only the URL hash changes. */
function handleHashChange(): void {
  const activePath = parseActiveFilePath(window.location.href);
  setState({ activePath });
  queuePullRequestFileScroll(activePath);
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

// Register SPA navigation listeners synchronously so no event fires before
// they are attached, regardless of the async token-load that follows.
document.addEventListener('turbo:load', handleNavigation);
document.addEventListener('turbo:render', handleNavigation);
// Legacy PJAX fallback (older GitHub versions)
document.addEventListener('pjax:end', handleNavigation);
window.addEventListener('hashchange', handleHashChange);
document.addEventListener('keydown', (event) => { void handleGlobalShortcut(event); });

// Turbo Drive swaps <body> on every navigation, wiping the margin-left class.
// Pre-apply the class AND an inline style to the INCOMING body before the swap
// so there is no flash. Using both ensures correctness even when the extension
// CSS file hasn't been re-injected into the new document yet.
document.addEventListener('turbo:before-render', (event: Event) => {
  if (!getState().pinned) return;
  const detail = (event as CustomEvent).detail as { newBody?: HTMLBodyElement | null } | null | undefined;
  const newBody = detail?.newBody;
  if (!newBody) return;
  newBody.classList.add('gtn-body--sidebar-pinned');
  newBody.style.setProperty('margin-left', `${_sidebarWidth}px`, 'important');
});

// Restore persisted UI state, load the stored PAT, then mount the sidebar.
// Wrapped in an async IIFE so we can await chrome.storage.local.get.
void (async () => {
  // Restore persisted state from sessionStorage (survives full-page reloads)
  try {
    const wasPinned = sessionStorage.getItem(STORAGE_KEY_PINNED) === 'true';
    const expandedPaths = loadExpandedPaths();
    const activePath = parseActiveFilePath(window.location.href);
    setState({
      ...(wasPinned ? { pinned: true, sidebarOpen: true } : {}),
      expandedPaths,
      activePath,
    });
  } catch { /* sessionStorage unavailable — start with defaults */ }

  // Load PAT and sidebar width from chrome.storage.local before mounting.
  await loadStoredToken();
  _sidebarWidth = await loadStoredWidth();
  // Mirror to sessionStorage so inject_start.ts can use it on the next page load
  try { sessionStorage.setItem(SESSION_KEY_WIDTH, String(_sidebarWidth)); } catch { /* ignore */ }

  // Initial mount when the content script first runs
  mount();

  // Remove the document_start inline style now that the CSS class is live
  // (subscriber applied gtn-body--sidebar-pinned synchronously inside mount)
  document.getElementById('gtn-pinned-start')?.remove();

  // Auto-load tree when the sidebar is pinned open on initial page load
  if (getState().sidebarOpen) {
    void loadTree();
  }

  queuePullRequestFileScroll(getState().activePath);
})();
