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
const SESSION_KEY_WIDTH  = 'gtn-sidebar-width';

try {
  if (sessionStorage.getItem(STORAGE_KEY_PINNED) === 'true') {
    const rawW = sessionStorage.getItem(SESSION_KEY_WIDTH);
    const parsedW = rawW !== null ? parseInt(rawW, 10) : NaN;
    const w = !isNaN(parsedW) && parsedW >= 180 && parsedW <= 600 ? parsedW : 300;
    const style = document.createElement('style');
    style.id = START_STYLE_ID;
    // Same value as .gtn-body--sidebar-pinned in sidebar.css
    style.textContent = `body { margin-left: ${w}px !important; }`;
    // <html> always exists at document_start; <head> and <body> do not yet
    document.documentElement.appendChild(style);
  }
} catch { /* sessionStorage unavailable — no-op */ }
