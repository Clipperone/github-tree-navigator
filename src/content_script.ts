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

import { parseGitHubUrl, fetchRepoTree, fetchDefaultBranch, parseActiveFilePath } from './api';
import {
  createToggleButton,
  createSidebar,
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
import { getState, setState, subscribe, resetState, expandAllDirs, collapseAllDirs } from './state';

// ─── Element ID Constants ────────────────────────────────────────────────────

const TOGGLE_WRAPPER_ID = `${PREFIX}-toggle-wrapper`;
const SIDEBAR_ID = `${PREFIX}-sidebar`;
const STORAGE_KEY_PINNED    = 'gtn-pinned';
const STORAGE_KEY_EXPANDED  = 'gtn-expanded-paths';
const STORAGE_KEY_TOKEN     = 'gtn-auth-token';
const STORAGE_KEY_WIDTH     = 'gtn-sidebar-width';
const SESSION_KEY_WIDTH     = 'gtn-sidebar-width';

/** Maximum number of directories before Expand All is disabled (DOM-freeze safeguard). */
const EXPAND_ALL_DIR_LIMIT = 500;

/** Default sidebar width in pixels. */
const DEFAULT_SIDEBAR_WIDTH = 300;
/** Persisted sidebar width, loaded at startup and updated on resize. */
let _sidebarWidth = DEFAULT_SIDEBAR_WIDTH;

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
    } else if (s.treeNodes.length > 0 && s.repoInfo !== null) {
      // Update expand-all safeguard whenever treeNodes change
      const dirCount = s.treeNodes.filter((n) => n.type === 'tree').length;
      setExpandAllEnabled(sidebar, dirCount <= EXPAND_ALL_DIR_LIMIT);
      renderTree(
        content,
        s.treeNodes,
        s.expandedPaths,
        s.repoInfo,
        s.activePath,
        s.filterQuery,
        handleToggleDir,
        handleFileClick,
      );
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

  if (opening && getState().treeNodes.length === 0) {
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
}

/** Saves a PAT to chrome.storage.local and refreshes the tree with the new token. */
async function handleSaveToken(token: string): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY_TOKEN]: token });
    _authToken = token;
    const sidebar = document.getElementById(SIDEBAR_ID);
    if (sidebar) setTokenStatus(sidebar, true);
    setState({ treeNodes: [], error: null });
    if (getState().sidebarOpen) await loadTree();
  } catch { /* chrome.storage unavailable */ }
}

/** Removes the stored PAT and refreshes the tree without authentication. */
async function handleRemoveToken(): Promise<void> {
  try {
    await chrome.storage.local.remove(STORAGE_KEY_TOKEN);
    _authToken = undefined;
    const sidebar = document.getElementById(SIDEBAR_ID);
    if (sidebar) setTokenStatus(sidebar, false);
    setState({ treeNodes: [], error: null });
    if (getState().sidebarOpen) await loadTree();
  } catch { /* chrome.storage unavailable */ }
}

/** Closes the sidebar and removes pin. */
function handleClose(): void {
  cancelHoverClose();
  setState({ sidebarOpen: false, pinned: false });
}

/**
 * Expands all directories in the current tree.
 * The button is disabled by the subscriber when the dir count exceeds
 * EXPAND_ALL_DIR_LIMIT, so this handler can trust the call is safe.
 */
function handleExpandAll(): void {
  const dirPaths = getState().treeNodes
    .filter((n) => n.type === 'tree')
    .map((n) => n.path);
  expandAllDirs(dirPaths);
}

/** Collapses all directories — always safe, no threshold needed. */
function handleCollapseAll(): void {
  collapseAllDirs();
}

/** Toggles the pinned state; pins always open the sidebar. */
function handlePin(): void {
  cancelHoverClose();
  const newPinned = !getState().pinned;
  setState({ pinned: newPinned, sidebarOpen: true });
  if (newPinned && getState().treeNodes.length === 0) void loadTree();
}

/** Opens the sidebar when the cursor enters the toggle wrapper. */
function handleHoverOpen(): void {
  cancelHoverClose();
  if (!getState().sidebarOpen) {
    setState({ sidebarOpen: true });
    if (getState().treeNodes.length === 0) {
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
  const next = new Set(getState().expandedPaths);
  if (next.has(path)) {
    next.delete(path);
  } else {
    next.add(path);
  }
  setState({ expandedPaths: next });
}

/**
 * Records the clicked file as the active path.
 * Navigation is handled by the anchor element itself (Turbo Drive or browser).
 *
 * @param path - Repository-relative file path
 */
function handleFileClick(path: string, _url: string): void {
  setState({ activePath: path });
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

  setState({ loading: true, error: null });

  // Resolve 'HEAD' → actual default branch name for display
  if (repoInfo.ref === 'HEAD') {
    const branch = await fetchDefaultBranch(repoInfo.owner, repoInfo.repo, _authToken);
    if (branch !== null) {
      repoInfo = { ...repoInfo, ref: branch };
      setState({ repoInfo });
    }
  }

  const result = await fetchRepoTree(repoInfo, _authToken);

  if (result.ok) {
    setState({ treeNodes: result.data, loading: false });
  } else {
    setState({ error: result.error, loading: false });
  }
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
  const sameRepo =
    prevRepoInfo !== null &&
    prevRepoInfo.owner === newRepoInfo.owner &&
    prevRepoInfo.repo  === newRepoInfo.repo;

  setState({ repoInfo: newRepoInfo, activePath: newActivePath, loading: false, error: null });

  if (!sameRepo) {
    // Different repository — clear stale tree, reset filter, and refetch
    setState({ treeNodes: [], filterQuery: '' });
    const searchInput = document.querySelector<HTMLInputElement>(`#${SIDEBAR_ID} .${PREFIX}-search-input`);
    if (searchInput) searchInput.value = '';
    if (getState().sidebarOpen) void loadTree();
  }
  // Same repo: treeNodes stays intact, subscriber re-renders with updated activePath only
}

// ─── Bootstrap ───────────────────────────────────────────────────────────────

// Register SPA navigation listeners synchronously so no event fires before
// they are attached, regardless of the async token-load that follows.
document.addEventListener('turbo:load', handleNavigation);
document.addEventListener('turbo:render', handleNavigation);
// Legacy PJAX fallback (older GitHub versions)
document.addEventListener('pjax:end', handleNavigation);

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
})();
