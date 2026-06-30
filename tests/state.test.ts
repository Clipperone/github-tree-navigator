import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getState,
  setState,
  subscribe,
  resetState,
  expandAllDirs,
  collapseAllDirs,
} from '../src/state';

// The store is a module-level singleton, so reset it to a known baseline before
// every test (resetState intentionally preserves pinned/sidebarOpen/expandedPaths,
// so clear those explicitly here).
beforeEach(() => {
  setState({
    sidebarOpen: false,
    pinned: false,
    repoInfo: null,
    treeNodes: [],
    expandedPaths: new Set<string>(),
    loading: false,
    error: null,
    filterQuery: '',
  });
});

describe('setState / getState', () => {
  it('merges a partial patch into the current state', () => {
    setState({ filterQuery: 'api' });
    expect(getState().filterQuery).toBe('api');
    expect(getState().sidebarOpen).toBe(false); // untouched keys are preserved
  });

  it('notifies subscribers synchronously with the new state', () => {
    const spy = vi.fn();
    const off = subscribe(spy);
    setState({ loading: true });
    expect(spy).toHaveBeenCalledTimes(1);
    expect(spy.mock.calls[0][0].loading).toBe(true);
    off();
  });
});

describe('subscribe', () => {
  it('returns an unsubscribe function that stops further notifications', () => {
    const spy = vi.fn();
    const off = subscribe(spy);
    off();
    setState({ loading: true });
    expect(spy).not.toHaveBeenCalled();
  });
});

describe('expandAllDirs / collapseAllDirs', () => {
  it('expandAllDirs replaces expandedPaths with the given directories', () => {
    expandAllDirs(['src', 'src/styles', 'docs']);
    expect(getState().expandedPaths).toEqual(new Set(['src', 'src/styles', 'docs']));
  });

  it('collapseAllDirs clears expandedPaths', () => {
    expandAllDirs(['a', 'b']);
    collapseAllDirs();
    expect(getState().expandedPaths.size).toBe(0);
  });
});

describe('resetState', () => {
  it('clears per-navigation data but preserves pinned, sidebarOpen and expandedPaths', () => {
    setState({
      pinned: true,
      sidebarOpen: true,
      expandedPaths: new Set(['src']),
      repoInfo: { owner: 'o', repo: 'r', ref: 'main', mode: 'repo' },
      error: 'boom',
      filterQuery: 'x',
      treeNodes: [{ path: 'a', type: 'blob', sha: 's', url: 'u' }],
    });

    resetState();

    const s = getState();
    // Preserved across navigations:
    expect(s.pinned).toBe(true);
    expect(s.sidebarOpen).toBe(true);
    expect(s.expandedPaths).toEqual(new Set(['src']));
    // Reset:
    expect(s.repoInfo).toBeNull();
    expect(s.error).toBeNull();
    expect(s.filterQuery).toBe('');
    expect(s.treeNodes).toEqual([]);
  });
});
