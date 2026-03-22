---
layout: default
title: "GitHub Tree Navigator — Collapsible File Tree for GitHub"
description: >-
  Navigate any GitHub repository like an IDE. Free, open-source Chrome
  extension — collapsible file tree, instant search, private-repo access,
  zero tracking, zero runtime dependencies.
---

<!-- ── Install CTA ─────────────────────────────────────────────────────────── -->
<p align="center" style="margin: 2rem 0 1.5rem">
  <a href="https://chromewebstore.google.com/detail/github-tree-navigator/jgfkilmfnkcjmnjbkbflfclmagfdabpe"
     style="display:inline-block;padding:.75rem 2rem;background:#2ea44f;color:#fff;font-size:1.1rem;font-weight:700;border-radius:6px;text-decoration:none;margin:.35rem;box-shadow:0 1px 4px rgba(0,0,0,.25)">
    ⬇&thinsp; Install from Chrome Web Store — It&rsquo;s Free
  </a>
</p>

Stop hunting for files by scrolling through GitHub's breadcrumbs.
**GitHub Tree Navigator** injects a collapsible, resizable file-tree sidebar
into any GitHub repository page the moment you open it — no configuration,
no backend, no account required.

Current release: **v1.1.0**

---

## Features

| Feature | What it does |
|:---|:---|
| 🌲 **Instant file tree** | Fetches the full recursive repository tree in a single API call and renders it as a collapsible, indented hierarchy — no page reloads. |
| 🔍 **Live search / filter** | Type to narrow the tree to matching files; matched substrings are highlighted and ancestor directories auto-expand. |
| 🧾 **Pull request mode** | On pull request pages the sidebar switches to a tree of changed files, making PR review faster and easier to navigate. |
| 📦 **Large repo fallback** | If GitHub truncates the full recursive tree, the sidebar transparently switches to lazy directory loading instead of breaking. |
| ⚡ **Session cache** | Reopening the same repository, branch, or PR in the same browser session reuses cached tree data for a faster sidebar. |
| 🔑 **Private repo support** | Store a GitHub Personal Access Token once via the settings panel; raises the rate limit from 60 to 5 000 req/hr and unlocks private repositories. |
| 🎨 **File-type icons** | Colour-coded icons for TypeScript, JavaScript, JSON, Markdown, YAML, images, test files, CSS, HTML, and more — inline SVG, no icon library needed. |
| 🧰 **File quick actions** | Each file row includes a lightweight actions menu for copying links and opening raw, blame, or history views. |
| ⌨️ **Keyboard navigation** | Open the sidebar with `Alt+\`, jump to search with `/`, and move through the tree with the arrow keys. |
| ↔ **Resizable sidebar** | Drag the right edge to any width between 180 px and 600 px; your preference persists across sessions. |
| 📌 **Pin mode** | Pin the sidebar open while navigating, or let it auto-hide when your cursor leaves. |
| ⬇⬆ **Expand / Collapse All** | One-click expand or collapse of the entire directory tree (auto-disabled for repos with > 500 directories). |
| 🔗 **Active-file highlight** | The file currently open in the GitHub viewer is highlighted in the tree with `aria-current="page"`. |
| ⚡ **Zero layout shift** | A `document_start` script applies the saved sidebar width before first paint, eliminating the content-shift flash on pinned reloads. |
| 🌗 **Dark / light mode** | All colours use GitHub's own `--color-*` CSS custom properties — the sidebar follows your chosen GitHub theme automatically. |
| ♿ **Accessible** | ARIA roles, labels, and `aria-live` regions on every interactive element. |

---

## Privacy & Permissions

GitHub Tree Navigator requests exactly **two** permissions:

- **`storage`** — saves your sidebar width and optional PAT to
  `chrome.storage.local` (stored in your browser only, never transmitted).
- **`https://api.github.com/*`** — calls the public GitHub Trees API to
  fetch file listings.

It has **no background service worker**, collects **no analytics**, and
communicates with **no server other than `api.github.com`**.

---

## Technical Highlights

| Property | Value |
|:---|:---|
| Manifest version | **V3** |
| Runtime dependencies | **Zero** |
| Background service worker | **None** |
| Build tool | Vite + @crxjs/vite-plugin |
| Language | TypeScript (strict mode) |
| Permissions | `storage` + `https://api.github.com/*` only |
| Supported host | `github.com` |

---

## Support & Links

- [Chrome Web Store](https://chromewebstore.google.com/detail/github-tree-navigator/jgfkilmfnkcjmnjbkbflfclmagfdabpe)
- [Source Code](https://github.com/Clipperone/github-tree-navigator)
- [Issue Tracker](https://github.com/Clipperone/github-tree-navigator/issues)
- [Privacy Policy]({{ '/privacy/' | relative_url }})
- [Changelog](https://github.com/Clipperone/github-tree-navigator/blob/master/CHANGELOG.md)

---

## Current Limitations

- **GitHub.com only** — the current version does not yet support GitHub Enterprise or other self-hosted GitHub instances.
- **Very large repositories** — when GitHub truncates the full recursive tree, the sidebar falls back to lazy loading. In that mode search only covers the directories you have already expanded, and Expand All is disabled.

---

## Install from Source

```bash
git clone https://github.com/Clipperone/github-tree-navigator.git
cd github-tree-navigator
npm install
npm run build        # output → dist/
```

1. Open `chrome://extensions` in Chrome.
2. Enable **Developer mode** (toggle, top-right).
3. Click **Load unpacked** → select the `dist/` folder.
4. Open any GitHub repository — the tree tab appears on the left edge.

> **Tip:** For private repositories or to raise the API rate limit, click
> the ⚙ gear icon in the sidebar header and enter a
> [GitHub Personal Access Token](https://github.com/settings/tokens)
> with `repo` (or `public_repo`) scope.

---

[Privacy Policy]({{ '/privacy/' | relative_url }})
