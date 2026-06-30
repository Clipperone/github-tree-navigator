# GitHub Copilot Coding Agent Instructions

Trust these instructions fully. Only search the codebase when the information here is incomplete or appears to be in error.

---

## What this repository does

**GitHub Tree Navigator** is a Manifest V3 Chrome extension that injects a collapsible file-tree sidebar into every `github.com/*/*` page. It fetches repository structure via the GitHub REST Trees API and renders it without any page reloads. There is no backend — all logic is client-side.

---

## Tech stack & runtime versions

| Tool | Version |
|---|---|
| Node.js | v24 (CI uses Node 24) |
| npm | 11.x |
| TypeScript | ^6.0.2 |
| Vite | ^8.1.1 |
| @crxjs/vite-plugin | ^2.7.0 |
| @types/chrome | ^0.2.0 |
| Vitest | ^4.1.9 |

Source of truth for versions is `package.json` (Dependabot bumps these weekly, so treat the numbers above as indicative). Unit tests run on **Vitest**; there is **no linter/formatter config** in this repository. CI does exist (see below).

---

## Repository layout

```
.github/
├── copilot-instructions.md   ← this file
├── dependabot.yml            ← weekly npm + github-actions updates
├── FUNDING.yml               ← GitHub Sponsors
└── workflows/
    ├── ci.yml                ← type-check + build on push/PR
    ├── codeql.yml            ← weekly CodeQL security scan
    └── release.yml           ← build + zip + GitHub Release on v* tags
src/
├── inject_start.ts           ← document_start; applies persisted sidebar width before first paint
├── content_script.ts         ← document_idle entry point; thin orchestrator only
├── api.ts                    ← GitHub Trees API + URL parsing (pure functions)
├── state.ts                  ← observable store (no DOM, no network)
├── ui.ts                     ← DOM factory & renderers (no state mutations)
├── icons/                    ← extension PNG icons (16/32/48/128)
└── styles/
    └── sidebar.css           ← scoped .gtn-* selectors; uses GitHub CSS tokens
docs/                         ← GitHub Pages (Jekyll): index.md, usage.md, privacy.md, _config.yml
scripts/
└── sync-version.js           ← syncs manifest.json version from package.json (npm version hook)
dist/                         ← build output (gitignored); load this in Chrome
manifest.json                 ← MV3 manifest (source of truth for CRXJS)
vite.config.ts                ← Vite + CRXJS plugin config
vitest.config.ts              ← Vitest config (Node env; no CRXJS plugin)
tsconfig.json                 ← strict TypeScript; noEmit for type-checking
package.json                  ← all scripts and devDependencies
tests/                        ← Vitest unit tests (api / ui / state pure functions)
CHANGELOG.md                  ← user-visible change history
roadmap.md                    ← planned feature work after 1.2.0
LICENSE                       ← MIT
SECURITY.md                   ← vulnerability disclosure policy
CONTRIBUTING.md               ← contributor guide
CODE_OF_CONDUCT.md            ← Contributor Covenant v2.1
```

**There are five `src/*.ts` files plus `styles/` and `icons/`.** No background service worker. No popup page. No options page. The settings panel is rendered inside the injected sidebar.

---

## npm scripts

| Script | Command | Purpose |
|---|---|---|
| `npm run build` | `vite build` | Production build → `dist/` |
| `npm run dev` | `vite build --watch --mode development` | Watch mode with sourcemaps |
| `npm run type-check` | `tsc --noEmit` | Type validation only (no emit) |
| `npm test` | `vitest run` | Run the unit test suite once |
| `npm run test:watch` | `vitest` | Unit tests in watch mode |

There is a `test` script (Vitest unit tests live in `tests/`); there is **no lint script**.

The `npm version` lifecycle is wired up: `preversion` runs `type-check`, `version` runs `scripts/sync-version.js` to mirror the new version into `manifest.json` and stages it, `postversion` pushes the commit and tags. Use `npm version <patch|minor|major>` to cut a release; a matching `v*` git tag then triggers `release.yml`.

---

## Build & validation — validated command sequences

### Bootstrap (fresh clone / after deleting node_modules)

```bash
npm install
```

- **Always run `npm install` before any build command** after cloning or deleting `node_modules`.
- On Windows, if `npm install` is interrupted (SIGINT), re-running it immediately may fail with `EPERM: operation not permitted, rmdir node_modules\@types`. Simply run `npm install` again — it succeeds on the second attempt.

### Production build

```bash
npm run build
```

- Expected output (no errors, exit 0), approximate sizes:
  ```
  vite v8.1.x building for production...
  ✓ 8 modules transformed.
  dist/manifest.json                          ~1.4 kB
  dist/src/styles/sidebar.css                 ~26 kB
  dist/assets/inject_start.ts-<hash>.js       ~0.4 kB
  dist/assets/content_script.ts-<hash>.js     ~43 kB
  ✓ built in ~300ms
  ```
- Output artifacts: `dist/manifest.json`, `dist/src/styles/sidebar.css`, and the two hashed JS bundles under `dist/assets/`.

### Type-check (no build artifacts produced)

```bash
npm run type-check
```

- Exits 0 with no output when clean. Any output means a type error.
- Run this after every source change. It is the primary local validation gate.

### Development watch mode

```bash
npm run dev
```

- Rebuilds `dist/` on every file save; includes sourcemaps (`.map` files in `dist/assets/`).
- Terminate with Ctrl+C.

### Full validation sequence (replicate CI manually)

```bash
npm install          # only needed once after clone
npm run type-check   # must exit 0 with no output
npm test             # all tests green
npm run build        # must exit 0 with ✓
```

This mirrors `.github/workflows/ci.yml`, which runs on every push to `master` and every pull request (checkout → setup Node 24 → `npm ci` → `npm run type-check` → `npm test` → `npm run build`). `codeql.yml` runs the same build under CodeQL analysis weekly and on PRs to `master`.

---

## Architecture rules (enforce when making changes)

1. **Module dependency graph has no cycles:**
   `content_script → state, api, ui` | `ui → state (types only)` | `api → state (types only)` | `state → (none)` | `inject_start → (none)`

2. **`state.ts`** — zero imports from sibling modules. Only exports pure functions: `getState`, `setState`, `subscribe`, `resetState`. No DOM access. No `fetch`.

3. **`api.ts`** — pure functions; returns `ApiResult<T>` (discriminated union `{ok:true,data}|{ok:false,error}`). Never throws. No DOM access. No state mutations. All hostnames are hardcoded to `api.github.com` / `github.com` / `raw.githubusercontent.com`; all path segments pass through `encodeURIComponent()`.

4. **`ui.ts`** — no state imports. Receives everything needed as function arguments. All user-controlled strings (file names, paths from API) must be passed through `escapeHtml()` (or `highlightMatch()`, which escapes internally) before `innerHTML` insertion. Static text uses `textContent`.

5. **`content_script.ts`** — thin orchestration only. Contains no business logic of its own — connects the three modules. Handles GitHub SPA navigation via `turbo:load`, `turbo:render`, and `pjax:end` events. Holds the PAT in memory and reads/writes it via `chrome.storage.local` only — never log it, never put it in the DOM, never send it anywhere except the GitHub API.

6. **`inject_start.ts`** — runs at `document_start` (separate `content_scripts` entry in `manifest.json`). When the sidebar is pinned, it reads the persisted width from `sessionStorage` and injects a `<style>` element that sets the body margin before the first paint, eliminating the layout-shift flash on pinned reloads. The main content script removes that `<style>` once its own CSS takes over. Keep it tiny, synchronous, and dependency-free (no `chrome.storage` — that API is async and too late for `document_start`).

7. **CSS scoping** — all selectors use the `gtn-` prefix. Never add bare element selectors. Use GitHub's `--color-*` CSS custom properties for colors (auto dark/light mode).

8. **`vite.config.ts`** — uses `defineConfig(({ mode }) => ...)` form. Do **not** use `process.env` — `@types/node` is not installed and `process` is not in scope.

---

## Key configuration details

- **`manifest.json`** is the source of truth consumed by CRXJS. It declares **two** `content_scripts` entries: `src/inject_start.ts` at `run_at: document_start`, and `src/content_script.ts` (+ `src/styles/sidebar.css`) at `run_at: document_idle`. CRXJS resolves the TypeScript paths directly.
- **Permissions** are intentionally minimal: `storage` + `host_permissions: https://api.github.com/*`. The content script `matches` is `https://github.com/*/*`. Be conservative about widening these.
- **`tsconfig.json`** has `"moduleResolution": "bundler"` — required for Vite. Do not change to `"node"`.
- **`tsconfig.json`** has `"types": ["chrome"]` and does not include `"node"` — do not add `@types/node` or use `process` / Node globals in `src/`.
- **`strict: true`**, `noUnusedLocals: true`, `noUnusedParameters: true`, `exactOptionalPropertyTypes: true` are all active.
- Releasing: bump with `npm version`, which syncs `manifest.json` via `scripts/sync-version.js`. Keep `package.json` and `manifest.json` versions identical — `release.yml` verifies the tag matches `package.json`.

---

## Common pitfalls

| Situation | What to do |
|---|---|
| `Cannot find name 'process'` in `vite.config.ts` | Use `mode` param from `defineConfig(({ mode }) => ...)` instead |
| `npm install` EPERM error on Windows | Run `npm install` a second time — succeeds on retry |
| Type error about optional properties | `exactOptionalPropertyTypes` is on — use `...(x !== undefined ? { key: x } : {})` spread pattern for conditional fields |
| `package.json` / `manifest.json` version mismatch at release | Bump via `npm version`; never hand-edit one without the other |
| Adding a new source file | No registration needed — Vite resolves imports automatically; only update `manifest.json` `content_scripts` if adding a new entry point |
