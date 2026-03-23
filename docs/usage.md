---
layout: default
title: "Usage Guide"
description: >-
  Learn how to use GitHub Tree Navigator: opening the sidebar, searching files,
  browsing pull requests, configuring private repository access, and using
  keyboard shortcuts.
---

# GitHub Tree Navigator Usage Guide

GitHub Tree Navigator adds a collapsible file-tree sidebar to GitHub repository
and pull request pages. This guide covers the fastest way to get comfortable
with the extension and explains the features that are easiest to miss.

---

## Getting Started

1. Install the extension from the Chrome Web Store or load the unpacked `dist/` folder in `chrome://extensions`.
2. Open any repository on `github.com`.
3. Move to the left edge of the page and open the sidebar.
4. Start typing in the search field to filter the tree immediately.
5. Click a file to open it in GitHub without losing the tree context.

If the sidebar is pinned, it stays visible while you navigate. If it is not pinned, it can auto-hide when your cursor leaves the sidebar area.

---

## Core Navigation

### Browse the repository tree

- Expand directories to explore nested files and folders.
- Use **Expand All** or **Collapse All** for medium-size repositories.
- The currently open file is highlighted automatically so you can keep your place.

### Search files quickly

- Type in the search box to filter visible results in real time.
- Matching text is highlighted.
- Ancestor folders are expanded automatically so matching files stay visible.

### Use quick file actions

Each file row includes lightweight actions for common tasks:

- Copy path
- Copy permalink
- Open raw
- Open blame
- Open history

These actions are useful when reviewing code, sharing links, or jumping into Git history quickly.

---

## Pull Request Mode

On pull request pages, the sidebar switches from the full repository tree to a tree of changed files in that pull request.

Use this mode when you want to:

- review the file structure of a PR at a glance
- jump between changed files faster
- stay oriented without relying only on GitHub's default changed-files list

If you review pull requests often, this is one of the highest-value features in the extension.

---

## Pinning and Resizing

### Pin mode

- Pin the sidebar open if you want it to stay visible while navigating between files and pages.
- Unpin it if you prefer a lighter UI that stays out of the way until needed.

### Resizing

- Drag the right edge of the sidebar to adjust its width.
- The chosen width is saved locally and restored on later visits.

The extension also applies the saved width before first paint on pinned reloads to avoid visible layout shift.

---

## Private Repositories and Rate Limits

By default, GitHub API requests are unauthenticated. That works for public repositories, but the rate limit is lower.

If you need more API capacity or access to private repositories:

1. Open the extension settings.
2. Add a GitHub Personal Access Token.
3. Use `repo` scope for private repositories, or `public_repo` for public-only access.

The token is stored in `chrome.storage.local` in your browser and is only used for GitHub API requests.

---

## Large Repositories

Some very large repositories cause GitHub's recursive Trees API response to be truncated.

When that happens, GitHub Tree Navigator automatically falls back to lazy directory loading instead of failing silently.

In fallback mode:

- folders load on demand
- search covers only the folders that have already been opened
- **Expand All** is disabled deliberately to avoid freezing the browser

This tradeoff keeps the extension usable on repositories that would otherwise be too large for a single tree response.

---

## Keyboard Shortcuts

- `Alt+\` — open the sidebar and focus search
- `/` — focus the sidebar search when the sidebar is open
- `ArrowUp` / `ArrowDown` — move between visible rows
- `ArrowRight` — expand a directory, or move into its first child if already expanded
- `ArrowLeft` — collapse an expanded directory, or move to its parent
- `Enter` — open the focused file or toggle the focused directory
- `Space` — toggle the focused directory
- `Home` / `End` — jump to the first or last visible row
- `Escape` — clear search, close settings, or close the sidebar

---

## Troubleshooting

### The sidebar does not appear

- Confirm you are on `github.com` and inside a repository or pull request page.
- Reload the page after installing or updating the extension.
- If you are loading the unpacked build, make sure the latest `dist/` output is loaded in Chrome.

### Private repositories do not load

- Check that your token is present in settings.
- Confirm the token scope matches your use case.
- Try removing and re-saving the token if GitHub permissions changed.

### Search shows incomplete results in a huge repository

- This can happen in lazy fallback mode after the GitHub Trees API is truncated.
- Expand the directories you care about first, then search again.

---

## Related Links

- [Home]({{ '/' | relative_url }})
- [Privacy Policy]({{ '/privacy/' | relative_url }})
- [Chrome Web Store](https://chromewebstore.google.com/detail/github-tree-navigator/jgfkilmfnkcjmnjbkbflfclmagfdabpe)
- [Source Code](https://github.com/Clipperone/github-tree-navigator)
