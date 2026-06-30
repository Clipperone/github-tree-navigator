# GitHub Tree Navigator Roadmap

This roadmap tracks the work that remains after the `1.2.0` release.

---

## Pending Feature Work

The items below are the remaining roadmap slices planned for upcoming releases.

### Step 1 - GitHub Enterprise Support

**Goal**
Support self-hosted GitHub Enterprise instances without regressing the public `github.com` experience.

**Scope**
- Support configurable GitHub Enterprise hosts
- Derive the API base URL from the active host when possible
- Preserve current behavior on `github.com`
- Update permissions and documentation carefully

**Acceptance Criteria**
- No regression on `github.com`
- Host configuration is understandable and minimal

**Prompt**
```text
Implement GitHub Enterprise support in GitHub Tree Navigator.

Goals:
- extend URL parsing and API logic beyond github.com
- preserve full compatibility with github.com
- introduce minimal, understandable configuration for self-hosted instances
- update manifest, documentation, and UX where needed

Constraints:
- be conservative with manifest permissions
- no backend
- keep the design simple and defensible

Execute the changes end-to-end and validate with npm run type-check and npm run build.
```

---

### Step 2 - Submodule Support

**Goal**
Render and open Git submodules correctly instead of treating them as ordinary files or folders.

**Scope**
- Detect submodules from GitHub payloads or a robust fallback
- Render submodules with a distinct visual treatment
- Open the correct target when clicked
- Avoid incorrect expand behavior

**Acceptance Criteria**
- Submodules have a dedicated icon/state
- Clicking a submodule leads to a sensible destination

**Prompt**
```text
Implement git submodule support in GitHub Tree Navigator.

Requirements:
- submodules must not appear as normal files/blobs
- they need dedicated visual treatment and coherent click behavior
- integrate without breaking repo mode, PR mode, and search

Keep the implementation minimal, document edge cases, and validate with npm run type-check and npm run build.
```

---

### Step 3 - Commit and Tag Views

**Goal**
Keep the sidebar coherent when the user browses historical snapshots instead of a live branch tip.

**Scope**
- Support commit SHA and tag URLs
- Build file links that stay inside the current snapshot context
- Preserve active-file highlighting in commit/tag views

**Acceptance Criteria**
- Commit/tag pages do not bounce the user back to the default branch unexpectedly

**Prompt**
```text
Extend GitHub Tree Navigator to support commit views and tag views.

Goals:
- recognize commit and tag navigation contexts correctly
- generate file URLs that stay consistent with that context
- keep active file highlighting and search behavior coherent

Constraints:
- avoid fragile DOM-only hacks if a stronger URL/API approach exists
- do not break current branch-based navigation

Update the documentation if needed, then validate with npm run type-check and npm run build.
```

---

### Step 4 - Recent Files and Recent Repositories

**Goal**
Add a lightweight retention/productivity feature without making the sidebar noisy.

**Scope**
- Recent files and recent repositories as the MVP
- Optional manual bookmarks only if the implementation stays simple
- Local persistence via `chrome.storage.local`
- Minimal, readable UI

**Acceptance Criteria**
- The feature is useful without cluttering the sidebar
- No obvious performance regression

**Prompt**
```text
Implement a lightweight productivity feature for GitHub Tree Navigator: recent files / recent repositories, with optional manual bookmarks only if the technical cost stays low.

Requirements:
- local persistence
- minimal, non-invasive UI
- no unnecessary complexity
- coherent integration with the existing sidebar

Prefer a well-executed MVP over an over-designed feature.
Update README if needed and validate with npm run type-check and npm run build.
```

---

### Step 5 - Advanced Search and Result Ranking

**Goal**
Move search beyond the current live filter and improve precision on deep or large trees.

**Scope**
- Better result ranking
- Clear distinction between filename-only and full-path search
- Better support for glob and path patterns
- Optional fast-jump or top-results affordances only if they materially improve speed

**Acceptance Criteria**
- Search is meaningfully more useful without becoming harder to understand

**Prompt**
```text
Improve GitHub Tree Navigator search beyond the current live filter.

Goals:
- improve result ranking
- clearly differentiate filename-only search from full-path search
- improve glob/pattern support
- add micro-interactions only if they materially improve speed of use

Constraints:
- do not make the UI more complex than necessary
- do not add fuzzy-search libraries unless they are clearly justified

Implement the changes, update the documentation if needed, then validate with npm run type-check and npm run build.
```

---

## Suggested Order

1. Step 1 - GitHub Enterprise Support
2. Step 2 - Submodule Support
3. Step 3 - Commit and Tag Views
4. Step 4 - Recent Files and Recent Repositories
5. Step 5 - Advanced Search and Result Ranking

## Pragmatic Note

If the goal is to maximize product value quickly after `1.2.0`, the highest-leverage sequence is:

1. Step 1 - GitHub Enterprise Support
2. Step 3 - Commit and Tag Views
3. Step 5 - Advanced Search and Result Ranking

That sequence expands addressable usage, improves navigation accuracy, and increases day-to-day utility without requiring a large UI redesign.