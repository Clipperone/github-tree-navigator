# Changelog

All notable user-visible changes to GitHub Tree Navigator are documented here.

## 1.2.1 - 2026-06-30

Maintenance release — no changes to the extension's runtime behavior.

### Added

- Vitest unit-test suite covering the pure, security-sensitive functions (URL parsing, HTML escaping, file-action URL building, and the state reducers), wired into CI
- Project files: `LICENSE` (MIT), `SECURITY.md`, `CONTRIBUTING.md`, `CODE_OF_CONDUCT.md`; `license` and `engines` fields in `package.json`

### Changed

- Dependency updates (Vite 8.1, `@types/chrome` 0.2, `@crxjs/vite-plugin` 2.7, PostCSS)
- Refreshed `copilot-instructions.md` and `README`; added Security / Roadmap / License links to the GitHub Pages site

## 1.2.0 - 2026-04-09

### Added

- Continuous integration and release automation via GitHub Actions: `ci.yml` runs type-check and build on every push and pull request; `release.yml` builds, packages a ZIP, and publishes a GitHub Release on each `v*` tag
- CodeQL security analysis, running weekly and on pull requests to `master`
- Dependabot configuration for weekly npm and GitHub Actions dependency updates
- GitHub Sponsors support
- Step-by-step user guide on the GitHub Pages site ([docs/usage.md](docs/usage.md))

### Changed

- Upgraded the build toolchain to TypeScript 6, Vite 8, and `@types/chrome` 0.1.x; updated GitHub Actions `checkout` / `setup-node` to v6
- README and GitHub Pages landing page refreshed to match the shipped feature set

### Notes

- The current public release line is `1.2.x`
- Remaining roadmap work is tracked in [roadmap.md](roadmap.md)

## 1.1.0 - 2026-03-22

### Added

- Pull request changed-files mode
- Large-repository lazy fallback when the Git Trees API is truncated
- Keyboard navigation for opening, searching, and navigating the tree
- In-memory tree cache for revisiting the same repo, branch, or PR in the same browser session
- File quick actions for copy path, copy permalink, open raw, open blame, and open history

### Improved

- README, GitHub Pages landing page, privacy information, and release-facing documentation are aligned with the shipped feature set
- Release versioning is synchronized between [package.json](package.json) and [manifest.json](manifest.json)

### Notes

- The current public release line is `1.1.x`
- Remaining roadmap work is tracked in [roadmap.md](roadmap.md)