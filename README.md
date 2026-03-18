# GitHub Tree Navigator

A **Manifest V3 Chrome extension** that injects a collapsible file-tree sidebar on any GitHub repository page — no page reloads required.

---

## Stack

| Tool | Purpose |
|---|---|
| TypeScript | Type-safe source |
| Vite | Bundler |
| CRXJS (`@crxjs/vite-plugin`) | Chrome extension hot-reload + manifest processing |
| GitHub Trees API | Repository file tree data |

---

## Project Structure

```
src/
├── content_script.ts   Entry point — mounts UI, wires modules, handles SPA nav
├── api.ts              GitHub Trees API fetch + URL parsing (pure functions)
├── state.ts            Observable store (no DOM, no network)
├── ui.ts               DOM factory & render functions (no state mutations)
└── styles/
    └── sidebar.css     Scoped styles using GitHub's own CSS custom properties
manifest.json           Chrome Extension Manifest V3
vite.config.ts          Vite + CRXJS configuration
```

---

## Getting Started

```bash
npm install
npm run dev     # watch mode — outputs to dist/
npm run build   # production build
```

### Load in Chrome

1. Navigate to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** → select the `dist/` folder

---

## Architecture Notes

- **`state.ts`** — single source of truth; zero dependencies; subscribers notified synchronously on every `setState()` call.
- **`api.ts`** — all functions are pure and return `ApiResult<T>` (no throws). `parseGitHubUrl` derives repo context from the URL without touching the DOM.
- **`ui.ts`** — no state imports; everything needed is passed as arguments. User-controlled strings (file names, paths) are always HTML-escaped before `innerHTML` use.
- **`content_script.ts`** — thin orchestration layer; listens to GitHub's `turbo:load` / `turbo:render` events for SPA navigation handling.

---

## Roadmap

- [ ] GitHub PAT input for authenticated requests (5 000 req/hr vs. 60)
- [ ] Highlight the currently viewed file in the tree
- [ ] Persist sidebar open/closed preference via `chrome.storage.local`
- [ ] Search/filter within the tree
- [ ] Icons per file extension (using a `fileicon` map)
