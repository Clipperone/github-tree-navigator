# Security Policy

## Supported versions

GitHub Tree Navigator is a client-side Chrome extension with no backend. Security
fixes are applied to the current public release line only.

| Version | Supported |
|---|---|
| 1.2.x   | ✅ |
| < 1.2   | ❌ |

Always run the latest version from the
[Chrome Web Store](https://chromewebstore.google.com/detail/github-tree-navigator/jgfkilmfnkcjmnjbkbflfclmagfdabpe)
or the [latest GitHub Release](https://github.com/Clipperone/github-tree-navigator/releases/latest).

## Reporting a vulnerability

**Please do not open a public issue for security vulnerabilities.**

Report privately through GitHub's coordinated disclosure flow:

1. Go to the repository's **Security** tab →
   [**Report a vulnerability**](https://github.com/Clipperone/github-tree-navigator/security/advisories/new).
2. Describe the issue, the affected version, and clear reproduction steps.
3. Include the impact you expect (e.g. token exposure, XSS, request to an
   unintended host) and, if possible, a minimal proof of concept.

You will receive an acknowledgement within **5 business days**. We aim to confirm
or dismiss the report, agree on a disclosure timeline, and ship a fix as quickly
as the severity warrants. We will credit reporters in the release notes unless you
prefer to remain anonymous.

## Scope

This extension is intentionally minimal, which keeps the attack surface small:

- **No backend.** All logic runs in a content script injected into `github.com` pages.
- **Minimal permissions.** Only `storage` and `host_permissions: https://api.github.com/*`.
- **Personal Access Token handling.** If you add a PAT, it is stored only in
  `chrome.storage.local` (isolated from website scripts), is never written to the
  page DOM or logged, and is sent only to `https://api.github.com` as an
  `Authorization: Bearer` header. It is never transmitted anywhere else.
- **No third-party runtime dependencies** are bundled into the extension.

The codebase is also scanned automatically with [CodeQL](.github/workflows/codeql.yml)
on pull requests and weekly.

### Especially valuable to report

- Any path by which a PAT could leak (to the page, to a third party, to logs, or to
  a host other than `api.github.com`).
- Any way repository-controlled data (file names, paths, branch/ref names, PR data)
  could lead to script execution (XSS) in the sidebar.
- Any request that can be redirected to an unintended host (SSRF-style).

## Hardening tips for users

- Prefer a **fine-grained Personal Access Token** with the minimum scope required
  (read-only access to the repositories you need) and a short expiry.
- Remove the token from the extension settings when you no longer need private-repo
  access or a higher rate limit.
