# GitHub Tree Navigator

> A **Manifest V3 Chrome extension** that injects a collapsible, resizable file-tree sidebar into every GitHub repository page — no page reloads, no backend, zero runtime dependencies.

---

## Features

- **🌲 Instant file tree** — fetches the full recursive repository tree in a single API call and renders it as a collapsible hierarchy inside an injected sidebar without page reloads.
- **🎨 File-type icons** — every node in the tree displays a colour-coded icon based on its extension or well-known filename. Directories are distinguished at a glance with a folder icon (sky blue); files use type-specific colours: TypeScript (blue), JavaScript (yellow), JSON (purple), Markdown (accent blue), YAML (orange), images (green), lockfiles (red), test/spec files (purple), CSS/SCSS (pink), HTML (orange-red), with a neutral grey fallback for all other types. All colours are expressed via GitHub's `--color-*` CSS custom properties, so dark and light themes are supported automatically. No external icon library is used — icons are inline SVG paths bundled directly in `ui.ts`.
- **🔍 Live search / filter** — type to narrow the tree to matching files; matched substrings are highlighted and ancestor directories are auto-expanded automatically.
- **🧾 Pull request changed-files mode** — on pull request pages the sidebar switches to a tree of the files changed in that PR and can jump directly into the `Files changed` view.
- **📦 Large repository fallback** — when GitHub's recursive Trees API is truncated, the sidebar automatically switches to lazy directory loading instead of failing silently.
- **🔑 Personal Access Token** — store a GitHub PAT once via the settings panel; it is saved in `chrome.storage.local` (browser-local only, never sent anywhere except the GitHub API). Raises the rate limit from 60 to 5 000 requests/hr and enables private-repository access.
- **↔ Resizable sidebar** — drag the right edge to any width between 180 px and 600 px; the chosen width is persisted across sessions via `chrome.storage.local`.
- **📌 Pin mode** — pin the sidebar open so it stays visible while navigating; when unpinned it opens on hover and closes when the cursor leaves.
- **⬇⬆ Expand / Collapse All** — one-click expand or collapse of the entire directory tree (automatically disabled for repositories with more than 500 directories to prevent browser freezes).
- **🔗 Active-file highlighting** — the file currently open in the GitHub viewer is highlighted in the tree and marked with `aria-current="page"`.
- **⚡ Zero layout-shift** — a `document_start` injection script reads the persisted sidebar width and applies the body margin before the first paint, eliminating the content-shift flash on pinned reloads.
- **🌗 Dark / light mode** — all colours use GitHub's own `--color-*` CSS custom properties, so the sidebar follows GitHub's theme automatically.
- **♿ Accessible** — ARIA roles, labels, and `aria-live` regions on every interactive element.
- **⌨️ Keyboard navigation** — use `Alt+\` to open/focus the sidebar, `/` to focus search, arrow keys to move through the tree, `Enter`/`Space` to activate items, and `Escape` to exit the current sidebar mode.

---

## Why this extension?

| Property | Value |
|---|---|
| Runtime dependencies | **Zero** |
| Background service worker | **None** |
| Backend / server | **None** |
| Manifest version | **V3** |
| Permissions | `storage` + `https://api.github.com/*` only |
| Supported host | `github.com` |

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
✓ 7 modules transformed.
dist/manifest.json                          ~1.4 kB
dist/src/styles/sidebar.css                 ~22 kB
dist/assets/inject_start.ts-<hash>.js       ~0.4 kB
dist/assets/content_script.ts-<hash>.js     ~29 kB
✓ built in ~1s
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

- **Lazy mode tradeoff on huge repos**: When GitHub truncates the recursive tree, the sidebar falls back to loading directories on demand. In that mode search only covers the folders already opened, and Expand All is disabled deliberately.
- **Rate limits**: Without a PAT, unauthenticated requests are limited to 60/hr shared across your IP. Add a token to raise this to 5 000/hr per account.
- **GitHub.com only**: The current version targets `github.com` and `api.github.com` only. GitHub Enterprise / self-hosted instances are not yet supported.

---

## Manual Regression Checklist

Use this before releasing changes:

1. Open a public repository root page and confirm the sidebar loads and renders the tree.
2. Open a file (`/blob/...`) page and confirm active-file highlighting works.
3. Type a plain-text search and a glob search such as `*.ts`; verify filtering and highlighting.
4. Toggle pin mode, reload the page, and verify there is no layout-shift flash.
5. Resize the sidebar, reload, and verify the width persists.
6. Use Expand All / Collapse All on a medium-size repository.
7. Save and remove a PAT; confirm token status updates and private-repo access works when applicable.
8. Navigate within the same repo via GitHub SPA navigation and confirm the sidebar stays mounted and in sync.
9. Open a pull request and confirm the sidebar shows only changed files, then click a file and verify it lands in the PR `Files changed` view.
10. Press `Alt+\` and confirm the sidebar opens with focus in the search field.
11. With focus inside the tree, use `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Enter`, and `Space` to navigate and expand/collapse without using the mouse.
12. Press `/` to focus search and `Escape` to clear search, close settings, or close the sidebar as appropriate.

## Keyboard Shortcuts

- `Alt+\` — open the sidebar and focus search
- `/` — focus the sidebar search when the sidebar is open
- `ArrowUp` / `ArrowDown` — move between visible tree rows
- `ArrowRight` — expand a directory, or move into its first child if already expanded
- `ArrowLeft` — collapse an expanded directory, or move to its parent
- `Enter` — open the focused file or toggle the focused directory
- `Space` — toggle the focused directory
- `Home` / `End` — jump to the first / last visible tree row
- `Escape` — clear search, close settings, or close the sidebar
