# Release setup (once, before the first tag)

The release workflow (`.github/workflows/release.yml`) is only as safe as the repository
settings around it. Do these once, on GitHub, before pushing the first `v*` tag.

## 1. Protected `release` environment

Settings → Environments → **New environment** `release`:

- [ ] **Required reviewers**: yourself (a stolen token can push a tag, not approve it).
- [ ] **Deployment branches and tags**: *Selected* → tag pattern `v*`.
- [ ] Prevent self-review off only if you are the sole maintainer.

## 2. Secrets — in that environment only, never as repository secrets

- [ ] `WEB_EXT_API_KEY`, `WEB_EXT_API_SECRET` — AMO API credentials (signing).
- [ ] `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, `CWS_REFRESH_TOKEN`, `CWS_EXTENSION_ID` —
      Chrome Web Store API (draft upload).

Each is optional: a missing AMO pair skips signing, and the Chrome upload only runs when
the repository **variable** `PUBLISH_CHROME_WEB_STORE` is `true`.

## 3. Tag protection

Settings → Rules → Rulesets → **New tag ruleset**:

- [ ] Target `v*`; restrict creation, update and deletion to maintainers.
- [ ] Sign tags (`make tag` uses `git tag -s`).

## 4. Branch protection on `main`

- [ ] Require a pull request and the **CI** checks (`Test, lint and build`, `Audit the
      workflows`) to pass.

## 5. Security features

- [ ] Dependabot alerts and security updates: on.
- [ ] Secret scanning and push protection: on.
- [ ] Private vulnerability reporting: on (SECURITY.md points to it).

## Then, for each release

```bash
make bump VERSION=1.0.0
git commit -am "chore: Publie la version 1.0.0"
make tag
git push origin main v1.0.0
```

Approve the `release` environment when GitHub asks, then publish the Chrome Web Store
draft by hand from the developer dashboard.
