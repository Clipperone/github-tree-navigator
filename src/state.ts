/**
 * @module state
 * Centralised application state for the GitHub Tree Navigator extension.
 * Implements a minimal observable store pattern with typed state transitions.
 * No DOM access or side-effects live here — pure data only.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

/** Identifies a GitHub repository by owner, repository name, and git ref. */
export interface RepoInfo {
  /** Repository owner (user or organization username) */
  owner: string;
  /** Repository name */
  repo: string;
  /** Branch name, tag, or commit SHA. Defaults to "HEAD". */
  ref: string;
}

/**
 * Represents a single node in a GitHub repository tree.
 * Maps directly to items in the GitHub Trees API response.
 */
export interface TreeNode {
  /** File or directory path relative to repository root (e.g. "src/api.ts") */
  path: string;
  /** "blob" for files, "tree" for directories */
  type: 'blob' | 'tree';
  /** Git object SHA */
  sha: string;
  /** GitHub API URL for this node */
  url: string;
  /** File size in bytes — only present for blobs */
  size?: number;
}

/** Full application state shape */
export interface AppState {
  /** Whether the sidebar panel is currently visible */
  sidebarOpen: boolean;
  /** Whether the sidebar is pinned open (hover-close is disabled) */
  pinned: boolean;
  /** Current repository context; null when not on a repo page */
  repoInfo: RepoInfo | null;
  /** Flat list of all tree nodes fetched from the GitHub Trees API */
  treeNodes: TreeNode[];
  /** Set of directory paths the user has expanded in the UI */
  expandedPaths: Set<string>;
  /** True while an API request is in-flight */
  loading: boolean;
  /** Human-readable error message; null when no error */
  error: string | null;
  /** Repo-relative path of the file currently viewed (from URL); null on non-blob pages */
  activePath: string | null;
}

/** Subscriber callback invoked on every state change */
type StateSubscriber = (state: Readonly<AppState>) => void;

// ─── Internal Store ───────────────────────────────────────────────────────────

const initialState: Readonly<AppState> = {
  sidebarOpen: false,
  pinned: false,
  repoInfo: null,
  treeNodes: [],
  expandedPaths: new Set<string>(),
  loading: false,
  error: null,
  activePath: null,
};

let _state: AppState = { ...initialState, expandedPaths: new Set<string>() };
const _subscribers = new Set<StateSubscriber>();

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns a read-only snapshot of the current application state.
 *
 * @returns Immutable reference to the current state
 */
export function getState(): Readonly<AppState> {
  return _state;
}

/**
 * Merges a partial patch into the current state and synchronously notifies
 * all registered subscribers.
 *
 * @param patch - Partial state to merge; only supplied keys are updated
 */
export function setState(patch: Partial<AppState>): void {
  _state = { ..._state, ...patch };
  _subscribers.forEach((fn) => fn(_state));
}

/**
 * Registers a callback to be invoked on every state change.
 *
 * @param fn - Callback that receives the updated state
 * @returns Unsubscribe function — call it to remove the listener
 *
 * @example
 * const off = subscribe(state => console.log(state.sidebarOpen));
 * // later...
 * off(); // removes the listener
 */
export function subscribe(fn: StateSubscriber): () => void {
  _subscribers.add(fn);
  return () => _subscribers.delete(fn);
}

/**
 * Resets all state to initial values.
 * Called when navigating between pages to discard stale data.
 */
export function resetState(): void {
  setState({
    repoInfo: null,
    treeNodes: [],
    loading: false,
    error: null,
    activePath: null,
    // pinned, sidebarOpen, expandedPaths intentionally preserved across navigations
  });
}
