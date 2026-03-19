# GitHub Tree Navigator

> A **Manifest V3 Chrome extension** that injects a collapsible, resizable file-tree sidebar into every GitHub repository page — no page reloads, no backend, zero runtime dependencies.

![Screenshot](./screenshot.png)

---

## Features

- **🌲 Instant file tree** — fetches the full recursive repository tree in a single API call and renders it as a collapsible hierarchy without touching the page DOM.
- **🎨 File-type icons** — every node in the tree displays a colour-coded icon based on its extension or well-known filename. Directories are distinguished at a glance with a folder icon (sky blue); files use type-specific colours: TypeScript (blue), JavaScript (yellow), JSON (purple), Markdown (accent blue), YAML (orange), images (green), lockfiles (red), test/spec files (purple), CSS/SCSS (pink), HTML (orange-red), with a neutral grey fallback for all other types. All colours are expressed via GitHub's `--color-*` CSS custom properties, so dark and light themes are supported automatically. No external icon library is used — icons are inline SVG paths bundled directly in `ui.ts`.
- **🔍 Live search / filter** — type to narrow the tree to matching files; matched substrings are highlighted and ancestor directories are auto-expanded automatically.
- **🔑 Personal Access Token** — store a GitHub PAT once via the settings panel; it is saved in `chrome.storage.local` (browser-local only, never sent anywhere except the GitHub API). Raises the rate limit from 60 to 5 000 requests/hr and enables private-repository access.
- **↔ Resizable sidebar** — drag the right edge to any width between 180 px and 600 px; the chosen width is persisted across sessions via `chrome.storage.local`.
- **📌 Pin mode** — pin the sidebar open so it stays visible while navigating; when unpinned it opens on hover and closes when the cursor leaves.
- **⬇⬆ Expand / Collapse All** — one-click expand or collapse of the entire directory tree (automatically disabled for repositories with more than 500 directories to prevent browser freezes).
- **🔗 Active-file highlighting** — the file currently open in the GitHub viewer is highlighted in the tree and marked with `aria-current="page"`.
- **⚡ Zero layout-shift** — a `document_start` injection script reads the persisted sidebar width and applies the body margin before the first paint, eliminating the content-shift flash on pinned reloads.
- **🌗 Dark / light mode** — all colours use GitHub's own `--color-*` CSS custom properties, so the sidebar follows GitHub's theme automatically.
- **♿ Accessible** — ARIA roles, labels, and `aria-live` regions on every interactive element.

---

## Why this extension?

| Property | Value |
|---|---|
| Runtime dependencies | **Zero** |
| Background service worker | **None** |
| Backend / server | **None** |
| Manifest version | **V3** |
| Permissions | `storage` + `https://api.github.com/*` only |

All logic runs inside a content script injected directly into `github.com` pages.

---

## Installation (from source)

```bash
git clone https://github.com/<you>/github-tree-navigator.git
cd github-tree-navigator
npm install
npm run build       # outputs to dist/
```

Then in Chrome:

1. Navigate to `chrome://extensions`.
2. Enable **Developer mode** (toggle, top-right).
3. Click **Load unpacked** → select the `dist/` folder.
4. Open any public GitHub repository — the tree tab appears on the left edge.

> **Tip:** For private repositories or to avoid the 60 req/hr rate limit, click the gear icon in the sidebar header and enter a [GitHub Personal Access Token](https://github.com/settings/tokens) with `repo` (or `public_repo`) scope.

---

## Local Development

### Prerequisites

| Tool | Version |
|---|---|
| Node.js | ≥ 24 |
| npm | ≥ 11 |

### Scripts

| Command | Purpose |
|---|---|
| `npm install` | Install the 67 devDependencies (first time / after clean) |
| `npm run dev` | Watch mode — rebuilds `dist/` on every save, includes sourcemaps |
| `npm run build` | Production build → `dist/` |
| `npm run type-check` | TypeScript validation only — exits 0 with no output when clean |

### Reload the extension after a build

After `npm run build` (or each `dev` rebuild), go to `chrome://extensions` and click the **↺ refresh** icon on the GitHub Tree Navigator card, then reload the GitHub tab.

### Expected build output

```
vite v5.4.x building for production...
✓ 6 modules transformed.
dist/manifest.json                          0.76 kB
dist/src/styles/sidebar.css                 ~9.6 kB
dist/assets/content_script.ts-<hash>.js    ~9.0 kB
✓ built in ~240ms
```

> The warning `The CJS build of Vite's Node API is deprecated` is **expected and harmless**.

---

## Architecture

```
src/
├── inject_start.ts     document_start injection — applies persisted body margin
│                       before first paint to prevent layout-shift flash
├── content_script.ts   document_idle entry point — thin orchestrator only;
│                       wires state / api / ui; handles SPA navigation
├── api.ts              GitHub REST API — fetchRepoTree, URL parsers
│                       (pure functions; returns ApiResult<T>, never throws)
├── state.ts            Observable store — getState / setState / subscribe / reset
│                       (no DOM, no network, zero imports)
├── ui.ts               DOM factory & renderers — receives all data as arguments
│                       (no state mutations, all user strings HTML-escaped)
└── styles/
    └── sidebar.css     Scoped .gtn-* selectors; GitHub --color-* CSS tokens
manifest.json           MV3 manifest (source of truth for CRXJS)
vite.config.ts          Vite + @crxjs/vite-plugin configuration
```

### Module dependency graph (no cycles)

```
content_script  ──►  state
                ──►  api    ──► state (types only)
                ──►  ui     ──► state (types only)
```

### Key design rules

- **`state.ts`** — zero imports from sibling modules; pure data only.
- **`api.ts`** — all exports return `ApiResult<T>` (`{ok:true,data}|{ok:false,error}`). Never throws.
- **`ui.ts`** — no state imports; everything needed is passed as arguments. All user-controlled strings (file names, paths from the API) pass through `escapeHtml()` before any `innerHTML` insertion.
- **`content_script.ts`** — orchestration only. Connects modules and listens to `turbo:load`, `turbo:render`, and `pjax:end` for GitHub SPA navigation.
- **CSS** — all selectors carry the `gtn-` prefix; bare element selectors are forbidden. Colors use GitHub's `--color-*` custom properties for automatic dark/light support.

---

## Tech Stack

| Tool | Version | Purpose |
|---|---|---|
| TypeScript | 5.9 | Type-safe source (strict mode) |
| Vite | 5.4 | Bundler |
| @crxjs/vite-plugin | 2.4 | Chrome extension build pipeline |
| @types/chrome | 0.0.260 | Chrome Extension API types |
| GitHub Trees API | v3 | Repository file tree data |

---

## Known limitations

- **Truncated trees**: The GitHub Trees API skips very large repositories (returns `truncated: true`). A warning is logged to the console; no workaround exists in the current version.
- **Rate limits**: Without a PAT, unauthenticated requests are limited to 60/hr shared across your IP. Add a token to raise this to 5 000/hr per account.
