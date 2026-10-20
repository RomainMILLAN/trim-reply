# Security

## Reporting a vulnerability

Please use GitHub's **private vulnerability reporting** on this repository (Security →
Report a vulnerability), not a public issue. You should get an answer within a week.
Only the latest release is supported.

## Scope

In scope: the extension itself (`src/`), its packaging and its release pipeline.
Out of scope: Gmail, the browsers, and the store platforms.

## Threat model, in four questions

**What are we working on?** A content script on `mail.google.com` that unfolds and
removes the quoted part of a draft, a popup, an options page, and a release pipeline that
publishes packages to GitHub, AMO and the Chrome Web Store.

**What can go wrong?**

| Boundary | Threat | Control |
|---|---|---|
| Quoted content (written by third parties) → content script | A crafted quote fakes the structure: deep nesting, a fake `•••`, a fake "new message" marker, a fake hidden input | Counting saturates at 100; every decision signal (`•••`, `rm`, `uet`) is read **outside the editor**; the cut is checked on what remains; nothing is parsed as HTML. Worst case: a trim skipped or wider than intended, which Undo restores. **Accepted risk.** |
| Gmail DOM → adapter | Gmail changes its markup | All of it in `src/mail/gmail/selectors.js`; on any doubt the adapter returns a null object (`NoCut`, `NoFold`) and nothing is cut — fail closed |
| Gmail → recipients | The folded quote is appended on send | Unfold before cutting; verify that Gmail holds no folded quote any more; otherwise the bar shows **Trim uncertain**, even when the bar is masked |
| Page scripts → the bar | A script clicks Trim or Undo, or restyles the bar | Closed shadow root, constructed stylesheet, clicks ignored unless `isTrusted` |
| Content script → network | Exfiltration of email content | No network code at all, enforced by `test/structure.test.js` (the extension pages' CSP does not cover a content script) |
| Content script → Gmail's console | Email content leaking into logs or error messages | No `console`, no `new Error(` in the content script, errors absorbed silently (test-enforced) |
| Storage → settings | Corrupted or hostile stored values | `Settings.from` normalises every field; out-of-range values fall back to defaults |
| Fixtures → public repository | Real addresses or message ids in test data | `scripts/sanitize-fixture.mjs` (allow-list) and `test/fixtures-hygiene.test.js` |
| Dependencies → release | A hostile dev dependency | No runtime dependency (test-enforced); `--frozen-lockfile --ignore-scripts`; Dependabot with a 7-day cooldown |
| Workflows → repository and stores | Secret theft, tampered release | `permissions: {}`, actions pinned by SHA, harden-runner (block mode on release), zizmor and actionlint in CI, secrets only in the protected `release` environment and only on the steps that use them, build provenance attestation, Chrome Web Store upload as a draft |
| Vendored signature stylesheet | Interface redirection from upstream | Pinned submodule, provenance header, resync only after reading the upstream log |

**What are we going to do about it?** The controls above, each backed by a test, a CI
gate or a line of the manual test (`docs/manual-test.md`).

**Did we do a good job?** `make test` and CI on every change; the manual test, including
"Show original" on the recipient side, before every release and whenever Gmail changes.

## What TrimReply does not promise

It is not a confidentiality control. Removing the history is best effort against a
webmail that can change without notice; see [PRIVACY.md](PRIVACY.md).

## Verifying a release

```bash
sha256sum -c SHA256SUMS --ignore-missing
gh attestation verify trim-reply-chrome-<version>.zip -R RomainMILLAN/trim-reply
```
