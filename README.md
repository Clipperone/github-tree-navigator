# GitHub Tree Navigator

> A **Manifest V3 Chrome extension** that injects a collapsible, resizable file-tree sidebar into every GitHub repository page — no page reloads, no backend, zero runtime dependencies.

[![CI](https://github.com/Clipperone/github-tree-navigator/actions/workflows/ci.yml/badge.svg?branch=master)](https://github.com/Clipperone/github-tree-navigator/actions/workflows/ci.yml) [![CodeQL](https://github.com/Clipperone/github-tree-navigator/actions/workflows/codeql.yml/badge.svg?branch=master)](https://github.com/Clipperone/github-tree-navigator/actions/workflows/codeql.yml) [![Latest Release](https://img.shields.io/github/v/release/Clipperone/github-tree-navigator?display_name=tag)](https://github.com/Clipperone/github-tree-navigator/releases/latest) [![Dependabot Enabled](https://img.shields.io/badge/Dependabot-enabled-025E8C?logo=dependabot&logoColor=white)](https://github.com/Clipperone/github-tree-navigator/blob/master/.github/dependabot.yml) [![Sponsor](https://img.shields.io/badge/Sponsor-GitHub%20Sponsors-ea4aaa?logo=githubsponsors&logoColor=white)](https://github.com/sponsors/Clipperone)

[Install from Chrome Web Store](https://chromewebstore.google.com/detail/github-tree-navigator/jgfkilmfnkcjmnjbkbflfclmagfdabpe) | [Download latest build from GitHub Releases](https://github.com/Clipperone/github-tree-navigator/releases/latest) | [Project website](https://clipperone.github.io/github-tree-navigator/)

Dependabot is enabled for this repository and checks `npm` dependencies plus GitHub Actions updates weekly. Configuration lives in [`.github/dependabot.yml`](.github/dependabot.yml).

---

## Quick Start

Want to get productive in under a minute?

1. Open any repository on `github.com`.
2. Open the GitHub Tree Navigator sidebar from the left edge of the page.
3. Type in the search box to filter files and folders instantly.
4. Click a file to open it, or use the quick actions menu for copy path, permalink, raw, blame, and history.
5. On pull request pages, use the same sidebar to browse changed files instead of jumping through GitHub's default list.
6. Pin the sidebar if you want it to stay open while navigating, or resize it by dragging the right edge.
7. Add a GitHub Personal Access Token in settings if you need private repository access or higher API limits.

Full step-by-step guide: [Usage Guide](https://clipperone.github.io/github-tree-navigator/usage/)

---

## Features

- **🌲 Instant file tree** — fetches the full recursive repository tree in a single API call and renders it as a collapsible hierarchy inside an injected sidebar without page reloads.
- **🎨 File-type icons** — every node in the tree displays a colour-coded icon based on its extension or well-known filename. Directories are distinguished at a glance with a folder icon (sky blue); files use type-specific colours: TypeScript (blue), JavaScript (yellow), JSON (purple), Markdown (accent blue), YAML (orange), images (green), lockfiles (red), test/spec files (purple), CSS/SCSS (pink), HTML (orange-red), with a neutral grey fallback for all other types. All colours are expressed via GitHub's `--color-*` CSS custom properties, so dark and light themes are supported automatically. No external icon library is used — icons are inline SVG paths bundled directly in `ui.ts`.
- **🔍 Live search / filter** — type to narrow the tree to matching files; matched substrings are highlighted and ancestor directories are auto-expanded automatically.
- **🧾 Pull request changed-files mode** — on pull request pages the sidebar switches to a tree of the files changed in that PR and can jump directly into the `Files changed` view.
- **📦 Large repository fallback** — when GitHub's recursive Trees API is truncated, the sidebar automatically switches to lazy directory loading instead of failing silently.
- **⚡ In-memory tree cache** — revisiting the same repository, branch, or pull request during the same browser session reuses cached tree data instead of refetching it immediately.
- **🔑 Personal Access Token** — store a GitHub PAT once via the settings panel; it is saved in `chrome.storage.local` (browser-local only, never sent anywhere except the GitHub API). Raises the rate limit from 60 to 5 000 requests/hr and enables private-repository access.
- **↔ Resizable sidebar** — drag the right edge to any width between 180 px and 600 px; the chosen width is persisted across sessions via `chrome.storage.local`.
- **📌 Pin mode** — pin the sidebar open so it stays visible while navigating; when unpinned it opens on hover and closes when the cursor leaves.
- **⬇⬆ Expand / Collapse All** — one-click expand or collapse of the entire directory tree (automatically disabled for repositories with more than 500 directories to prevent browser freezes).
- **🔗 Active-file highlighting** — the file currently open in the GitHub viewer is highlighted in the tree and marked with `aria-current="page"`.
- **⚡ Zero layout-shift** — a `document_start` injection script reads the persisted sidebar width and applies the body margin before the first paint, eliminating the content-shift flash on pinned reloads.
- **🌗 Dark / light mode** — all colours use GitHub's own `--color-*` CSS custom properties, so the sidebar follows GitHub's theme automatically.
- **♿ Accessible** — ARIA roles, labels, and `aria-live` regions on every interactive element.
- **⌨️ Keyboard navigation** — use `Alt+\` to open/focus the sidebar, `/` to focus search, arrow keys to move through the tree, `Enter`/`Space` to activate items, and `Escape` to exit the current sidebar mode.
- **🧰 File quick actions** — each file row exposes lightweight actions for copy path, copy permalink, open raw, open blame, and open history.

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

## Installation

### Prebuilt package

If you prefer downloading a ready-built package from GitHub instead of building locally:

1. Open [GitHub Releases](https://github.com/Clipperone/github-tree-navigator/releases/latest).
2. Download the latest `github-tree-navigator-vX.Y.Z.zip` asset.
3. Extract the archive to a local folder.
4. Navigate to `chrome://extensions` in Chrome.
5. Enable **Developer mode** (toggle, top-right).
6. Click **Load unpacked** and select the extracted `github-tree-navigator` folder.

> Each tagged release is built by GitHub Actions from the tagged commit and published as a downloadable `dist/` package.

### Build from source

```bash
git clone https://github.com/Clipperone/github-tree-navigator.git
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

## Release Status

- Current release line: `1.2.x`
- Latest documented release notes: [CHANGELOG.md](CHANGELOG.md)

## Support

- Source code: [https://github.com/Clipperone/github-tree-navigator](https://github.com/Clipperone/github-tree-navigator)
- Issue tracker: [https://github.com/Clipperone/github-tree-navigator/issues](https://github.com/Clipperone/github-tree-navigator/issues)
- Privacy policy: [docs/privacy.md](docs/privacy.md)

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
vite v8.0.x building client environment for production...
✓ 8 modules transformed.
dist/manifest.json                          ~1.4 kB
dist/src/styles/sidebar.css                 ~26 kB
dist/assets/inject_start.ts-<hash>.js       ~0.4 kB
dist/assets/content_script.ts-<hash>.js     ~43 kB
✓ built in ~300ms
```

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
| TypeScript | 6.0 | Type-safe source (strict mode) |
| Vite | 8.0 | Bundler |
| @crxjs/vite-plugin | 2.4 | Chrome extension build pipeline |
| @types/chrome | 0.1.39 | Chrome Extension API types |
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
10. Navigate away from a previously opened repo or branch, return to it in the same session, and confirm the tree reappears without a redundant full refetch.
11. Press `Alt+\` and confirm the sidebar opens with focus in the search field.
12. With focus inside the tree, use `ArrowUp`, `ArrowDown`, `ArrowLeft`, `ArrowRight`, `Enter`, and `Space` to navigate and expand/collapse without using the mouse.
13. Press `/` to focus search and `Escape` to clear search, close settings, or close the sidebar as appropriate.
14. Open the file quick actions menu on a normal repo file and verify copy path, copy permalink, open raw, open blame, and open history all behave correctly.
15. Open the file quick actions menu on a PR file and verify copy path and copy permalink are available without breaking the main file click.

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
