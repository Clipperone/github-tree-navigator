# GitHub Copilot Coding Agent Instructions

Trust these instructions fully. Only search the codebase when the information here is incomplete or appears to be in error.

---

## What this repository does

**GitHub Tree Navigator** is a Manifest V3 Chrome extension that injects a collapsible file-tree sidebar into every `github.com/*/*` page. It fetches repository structure via the GitHub REST Trees API and renders it without any page reloads. There is no backend — all logic is client-side.

---

## Tech stack & runtime versions

| Tool | Resolved version |
|---|---|
| Node.js | v24.14.0 |
| npm | 11.9.0 |
| TypeScript | 5.9.3 |
| Vite | 5.4.21 |
| @crxjs/vite-plugin | 2.4.0 |
| @types/chrome | 0.0.260 |

No testing framework, no linter config, no CI pipeline exists in this repository.

---

## Repository layout

```
.github/
└── copilot-instructions.md   ← this file
src/
├── content_script.ts         ← entry point; thin orchestrator only
├── api.ts                    ← GitHub Trees API + URL parsing (pure functions)
├── state.ts                  ← observable store (no DOM, no network)
├── ui.ts                     ← DOM factory & renderers (no state mutations)
└── styles/
    └── sidebar.css           ← scoped .gtn-* selectors; uses GitHub CSS tokens
dist/                         ← build output (gitignored); load this in Chrome
manifest.json                 ← MV3 manifest (source of truth for CRXJS)
vite.config.ts                ← Vite + CRXJS plugin config
tsconfig.json                 ← strict TypeScript; noEmit for type-checking
package.json                  ← all scripts and devDependencies
```

**No `src/` subdirectory other than `styles/`.** No background service worker. No popup page. No options page. All logic lives in the four `src/*.ts` files.

---

## npm scripts

| Script | Command | Purpose |
|---|---|---|
| `npm run build` | `vite build` | Production build → `dist/` |
| `npm run dev` | `vite build --watch --mode development` | Watch mode with sourcemaps |
| `npm run type-check` | `tsc --noEmit` | Type validation only (no emit) |

There is no `test` script. There is no lint script.

---

## Build & validation — validated command sequences

### Bootstrap (fresh clone / after deleting node_modules)

```bash
npm install
```

- Installs 67 packages in ~45 s.
- **Always run `npm install` before any build command** after cloning or deleting `node_modules`.
- Expected output ends with: `added 67 packages, and audited 68 packages`
- 4 known audit vulnerabilities (2 moderate, 2 high) in transitive deps — `npm audit fix --force` would break `@crxjs/vite-plugin`; **do not run it**.
- On Windows, if `npm install` is interrupted (SIGINT), re-running it immediately may fail with `EPERM: operation not permitted, rmdir node_modules\@types`. Simply run `npm install` again — it succeeds on the second attempt.

### Production build

```bash
npm run build
```

- Expected output (no errors, exit 0):
  ```
  vite v5.4.21 building for production...
  ✓ 6 modules transformed.
  dist/manifest.json                          0.76 kB
  dist/src/styles/sidebar.css                 9.65 kB
  dist/assets/content_script.ts-<hash>.js     9.05 kB
  ✓ built in ~240ms
  ```
- The warning `The CJS build of Vite's Node API is deprecated` is **expected and harmless**.
- Output artifacts: `dist/manifest.json`, `dist/src/styles/sidebar.css`, `dist/assets/content_script.ts-<hash>.js`

### Type-check (no build artifacts produced)

```bash
npm run type-check
```

- Exits 0 with no output when clean. Any output means a type error.
- Run this after every source change. It is the primary validation gate.

### Development watch mode

```bash
npm run dev
```

- Rebuilds `dist/` on every file save; includes sourcemaps (`.map` files in `dist/assets/`).
- Outputs `built in Xms.` on each rebuild.
- On Windows, stderr shows `NativeCommandError` / CJS deprecation — **expected, not an error**.
- Terminate with Ctrl+C.

### Full validation sequence (replicate CI manually)

```bash
npm install          # only needed once after clone
npm run type-check   # must exit 0 with no output
npm run build        # must exit 0 with ✓
```

---

## Architecture rules (enforce when making changes)

1. **Module dependency graph has no cycles:**
   `content_script → state, api, ui` | `ui → state (types only)` | `api → state (types only)` | `state → (none)`

2. **`state.ts`** — zero imports from sibling modules. Only exports pure functions: `getState`, `setState`, `subscribe`, `resetState`. No DOM access. No `fetch`.

3. **`api.ts`** — pure functions; returns `ApiResult<T>` (discriminated union `{ok:true,data}|{ok:false,error}`). Never throws. No DOM access. No state mutations.

4. **`ui.ts`** — no state imports. Receives everything needed as function arguments. All user-controlled strings (file names, paths from API) must be passed through `escapeHtml()` before `innerHTML` insertion.

5. **`content_script.ts`** — thin orchestration only. Contains no business logic of its own — connects the three modules. Handles GitHub SPA navigation via `turbo:load`, `turbo:render`, and `pjax:end` events.

6. **CSS scoping** — all selectors use the `gtn-` prefix. Never add bare element selectors. Use GitHub's `--color-*` CSS custom properties for colors (auto dark/light mode).

7. **`vite.config.ts`** — uses `defineConfig(({ mode }) => ...)` form. Do **not** use `process.env` — `@types/node` is not installed and `process` is not in scope.

---

## Key configuration details

- **`manifest.json`** is the source of truth consumed by CRXJS. The `content_scripts[0].js` entry must point to `src/content_script.ts` (CRXJS resolves TypeScript paths directly).
- **`tsconfig.json`** has `"moduleResolution": "bundler"` — required for Vite. Do not change to `"node"`.
- **`tsconfig.json`** does not include `"node"` in `"types"` — do not add `@types/node` or use `process` / Node globals in source files.
- **`strict: true`**, `noUnusedLocals: true`, `noUnusedParameters: true`, `exactOptionalPropertyTypes: true` are all active.

---

## Common pitfalls

| Situation | What to do |
|---|---|
| `Cannot find name 'process'` in `vite.config.ts` | Use `mode` param from `defineConfig(({ mode }) => ...)` instead |
| `npm install` EPERM error on Windows | Run `npm install` a second time — succeeds on retry |
| CJS deprecation warning in build output | Expected/harmless — ignore it |
| Type error about optional properties | `exactOptionalPropertyTypes` is on — use `...(x !== undefined ? { key: x } : {})` spread pattern for conditional fields |
| Adding a new source file | No registration needed — Vite resolves imports automatically; only update `manifest.json` `content_scripts` if adding a new entry point |
