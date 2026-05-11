# PocketChart — project notes for Claude

## Three-mode launch pattern

This project has THREE distinct launch modes. Never confuse them — entering real data into the wrong one is recoverable but annoying.

| Mode | Purpose | How to launch | userData path |
|---|---|---|---|
| **Personal** | The user's real-life solo therapy practice | `C:\PocketChart\PocketChart.exe` (default Start Menu / desktop shortcut) | `%APPDATA%\pocketchart\` |
| **Test (clean install)** | Validating onboarding, trial flow, migrations, upgrade-to-Pro flow | Double-click `Desktop\PocketChart-TEST.bat` | `C:\PocketChart-Test-Data\` |
| **Dev (hot reload)** | Source-tree work, debugging in-progress changes | `npm run dev` from `C:\Users\lydad\Desktop\PocketChart` | `%APPDATA%\PocketChart-Dev\` (set by `src/main/bootstrap.ts` when `NODE_ENV=development`) |

**Rule:** the default install IS personal. Never let test data live in `%APPDATA%\pocketchart\`. If a clean-install scenario needs to be reproduced, always launch via the TEST .bat (or Bash equivalent: `"C:/PocketChart/PocketChart.exe" --user-data-dir="C:\PocketChart-Test-Data"`).

When verifying a fix that needs a clean DB, wipe `C:\PocketChart-Test-Data` while the app is closed — never wipe `%APPDATA%\pocketchart\`.

## Native module rebuild gotcha

The repo's `.npmrc` has `ignore-scripts=true` (security hardening — see PR #1 supply-chain work). This silently breaks `prebuild-install` for `better-sqlite3`: because the `.node` binary already exists from the last build, prebuild-install no-ops, and the bundled binary stays compiled against an old Electron ABI. `electron-builder`'s `@electron/rebuild` step claims to rebuild but can hit the same caching trap.

**After any Electron version bump or fresh checkout, run `npm run rebuild` BEFORE `npm run deploy`.** That script invokes `electron-rebuild -f -w better-sqlite3`, which forces a from-source compile against Electron's ABI.

Symptom when this is wrong: `NODE_MODULE_VERSION X vs Y` mismatch in the main-process log, `initDatabase()` throws inside the encryption-status handler, no IPC handlers register, the renderer loads but every backend call returns "No handler registered for X".

## Deploy workflow — TWO distinct paths

There is a **dev hand-deploy** and a **real signed release**. They are not the same thing. Pick the right one based on what you're doing.

### Path A — Dev hand-deploy (rapid in-session testing)

`npm run deploy` does: `dist:dir` (build + electron-builder --dir) → xcopy to `C:\PocketChart\` → copy icon. The `dist:dir` step fails at the Trusted Signing phase locally (Azure env vars unset) — expected and harmless. The unpacked `release\win-unpacked\` is built before signing, so the xcopy still gets fresh bits.

**Use this when:** verifying a bug fix in this session, watching the user click around. Fast (~30s) and doesn't require pushing/tagging.

**Limitation that bit us once:** an xcopy install is a hand-deployed unpacked directory, NOT an NSIS install. There's no `Uninstall PocketChart.exe`, no install registry entries, no NSIS metadata. **The auto-updater silently fails on hand-deployed installs** because electron-updater needs NSIS metadata to apply in-place updates. So if you want auto-update to work going forward, the install at `C:\PocketChart\` must have been installed via the NSIS `.exe` at least once (see Path B). After that one-time NSIS install, future hand-deploys ALSO work for testing without breaking auto-update — the metadata persists.

**After merging PRs on GitHub, ALWAYS pull + rebuild before redeploying.** A locally-built binary reflects whichever branch was checked out at build time, NOT origin/main. If you build off a feature branch that was created before other PRs merged, the deployed exe will be missing those other PRs' fixes — even though they're shipped on main:

```bash
git checkout main && git pull --ff-only origin main
npm run rebuild  # forces native better-sqlite3 recompile (see gotcha above)
npm run deploy
```

Symptom of skipping the pull: deployed binary works for some fixes but not others ("but I merged that PR last night?"). Verify with `grep -ao '<known-string-from-fix>' C:/PocketChart/resources/app.asar | wc -l`.

### Path B — Real signed release (what end users get)

For an actual release that:
- Auto-updates the user's install + every external user's install on next launch
- Is code-signed (no SmartScreen warning)
- Is publicly visible at https://github.com/lkongswa/pocketchart/releases

The flow is **tag-driven** — push a `v*` tag, GitHub Actions handles the rest:

```bash
# After all PRs are merged and main is clean:
git checkout main && git pull --ff-only origin main

# Bump version (semver — patch for bugfixes, minor for new features):
npm version 1.0.X -m "Release v%s"   # creates the commit + tag in one shot

git push origin main
git push origin v1.0.X               # THIS triggers the .github/workflows/build-windows.yml run
```

The CI run builds → signs with Azure Trusted Signing (using the `AZURE_*` GitHub secrets) → uploads `PocketChart.Setup.<version>.exe` and `latest.yml` as Release assets. Watch the run at https://github.com/lkongswa/pocketchart/actions.

**Critical for Lyd's local install:** the `C:\PocketChart\` install must have been installed via the signed `.exe` at least once for auto-update to work. If it's currently a hand-deployed unpacked dir, do this one-time fix:

1. Close PocketChart.
2. Download `PocketChart.Setup.<version>.exe` from the latest release.
3. Run it. Pick `C:\PocketChart\` to overwrite, or accept the default `%LOCALAPPDATA%\Programs\PocketChart\` and delete the old hand-deployed dir afterward.
4. Userdata at `%APPDATA%\pocketchart\` is preserved — NSIS doesn't touch it.
5. Going forward, future tag-pushed releases will auto-update via the in-app prompt. No more hand-deploys for releases.

### Which path when?

| Situation | Path | Why |
|---|---|---|
| Verifying a bugfix in-session, user is sitting there | A | Faster, no need to bump version |
| User says "ship this" / wants to update external user | B | Signed, distributed via auto-update, real release |
| Multiple bugfixes accumulated over a session, ready to release | B (after merging PRs) | Bundle them into one tagged release |
| Testing what a fresh install looks like | Use the Test mode launcher (`PocketChart-TEST.bat`), not deploy | See Three-mode launch pattern above |
