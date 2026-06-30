# Contributing to GitHub Tree Navigator

Thanks for your interest in contributing! This is a small, dependency-free
Manifest V3 Chrome extension with no backend — all logic is client-side
TypeScript. The guidelines below keep changes consistent and easy to review.

By participating you agree to abide by our [Code of Conduct](CODE_OF_CONDUCT.md).

## Prerequisites

| Tool | Version |
|---|---|
| Node.js | ≥ 24 |
| npm | ≥ 11 |

## Getting started

```bash
git clone https://github.com/Clipperone/github-tree-navigator.git
cd github-tree-navigator
npm install
npm run build        # outputs to dist/
```

Then load the unpacked extension: open `chrome://extensions`, enable
**Developer mode**, click **Load unpacked**, and select the `dist/` folder.

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Watch mode — rebuilds `dist/` on every save (with sourcemaps) |
| `npm run build` | Production build → `dist/` |
| `npm run type-check` | TypeScript validation only — exits 0 with no output when clean |
| `npm test` | Run the Vitest unit suite once |
| `npm run test:watch` | Run Vitest in watch mode |

After each build, reload the extension from `chrome://extensions` (↺ icon) and
reload the GitHub tab.

## Before you open a pull request

Run the full local gate — it mirrors CI and must all pass:

```bash
npm run type-check   # must exit 0 with no output
npm test             # all tests green
npm run build        # must exit 0 with ✓
```

For UI/behaviour changes, also walk through the relevant items in the
**Manual Regression Checklist** in the [README](README.md#manual-regression-checklist).

## Architecture rules (please respect these)

The module graph is acyclic and each module has a single responsibility — see
[.github/copilot-instructions.md](.github/copilot-instructions.md) for the full
contract. In short:

- **`state.ts`** — pure observable store; no DOM, no network, no sibling imports.
- **`api.ts`** — pure functions returning `ApiResult<T>`; never throws; hostnames
  are hardcoded to GitHub domains and every path segment is `encodeURIComponent`-escaped.
- **`ui.ts`** — DOM factories only; no state imports; **every user-controlled string
  must pass through `escapeHtml()` / `highlightMatch()` before `innerHTML`**.
- **`content_script.ts`** — thin orchestrator; holds the PAT only in memory and
  `chrome.storage.local`, never logs it or puts it in the DOM.
- **CSS** — all selectors carry the `gtn-` prefix; colors use GitHub `--color-*` tokens.

New pure logic (URL building, parsing, escaping) belongs in `api.ts`/`ui.ts` and
should come with a unit test under [`tests/`](tests/).

## Tests

Unit tests live in `tests/` and run under Vitest (Node environment, no DOM).
They focus on the pure, security-sensitive functions (URL parsing, encoding,
HTML escaping, state reducers). If you touch any of those, add or update a test.

## Commit messages & pull requests

- Use short, conventional-style prefixes seen in the history: `feat:`, `fix:`,
  `chore:`, `docs:`.
- Target the `master` branch with focused, single-purpose PRs.
- Describe the user-visible effect and how you validated it.

## Releases (maintainers)

Releases are cut with `npm version <patch|minor|major>`, which runs the
type-check, syncs the version into `manifest.json` via
[`scripts/sync-version.js`](scripts/sync-version.js), and pushes the tag. A
matching `v*` tag triggers the release workflow, which builds and publishes the
packaged extension to GitHub Releases. Keep `package.json` and `manifest.json`
versions identical, and add an entry to [CHANGELOG.md](CHANGELOG.md).

## Security

Please do **not** report security vulnerabilities through public issues or PRs.
See [SECURITY.md](SECURITY.md) for private disclosure.
