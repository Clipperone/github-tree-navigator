/**
 * @module inject_start
 * Runs at `document_start` — the earliest possible point in the page lifecycle,
 * before any HTML has been parsed or rendered.
 *
 * Purpose: prevent the layout-shift flash that would occur when the sidebar is
 * pinned and a full-page reload happens. Without this, the page first renders at
 * full width, then the main content script (document_idle) applies the body
 * margin — causing a visible jump.
 *
 * The injected <style> is intentionally kept alive until the main content script
 * removes it (after its own CSS class takes over), avoiding any gap.
 */

const STORAGE_KEY_PINNED = 'gtn-pinned';
const START_STYLE_ID     = 'gtn-pinned-start';

try {
  if (sessionStorage.getItem(STORAGE_KEY_PINNED) === 'true') {
    const style = document.createElement('style');
    style.id = START_STYLE_ID;
    // Same value as .gtn-body--sidebar-pinned in sidebar.css
    style.textContent = 'body { margin-left: 300px !important; }';
    // <html> always exists at document_start; <head> and <body> do not yet
    document.documentElement.appendChild(style);
  }
} catch { /* sessionStorage unavailable — no-op */ }
