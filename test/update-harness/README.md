# Auto-update test harness

Exercise the full **check → download → verify → install** updater flow against
already-signed builds — **no new release, no version bump, no signing** required.
It reuses the two installers already on GitHub and an env-gated feed override.

## Why this exists

electron-updater's Windows publisher check is **case-sensitive**. From v1.0.x–v1.1.0,
`app-update.yml` said `Lyda kongswangwongsa` (lowercase k) while the Azure cert is
`CN=Lyda Kongswangwongsa` (capital K), so **every** signed update was rejected. v1.1.1
fixed it. This harness lets you prove the fix — and prove the *test itself* is real —
via a built-in pass/fail control.

## The pass/fail control (this is the point)

| Installed baseline | Feed serves | Expected result |
|---|---|---|
| **v1.1.1** (fixed, capital-K `app-update.yml`) | `feed/1.1.0` | ✅ **accepts & installs** (downgrade) |
| **v1.1.0** (buggy, lowercase `app-update.yml`) | `feed/1.1.1` | ❌ **rejects**: "not signed by the application owner" |

If v1.1.1 accepts **and** v1.1.0 rejects, the signature path is provably correct —
not merely "nothing errored."

## One-time setup

```powershell
cd test/update-harness
./fetch-builds.ps1            # downloads v1.1.0 + v1.1.1 installers into ./feed/<ver>/
```

Then install whichever baseline you want to test *from* (`feed/1.1.1/PocketChart-Setup-1.1.1.exe`
or the v1.1.0 one). Default install path is `%LOCALAPPDATA%\Programs\PocketChart\PocketChart.exe`.

## Run a test

1. **Serve** the version you want the updater to "find":
   ```powershell
   node serve.mjs ./feed/1.1.0 8080
   ```
2. **Launch the installed app** pointed at the local feed (in a second terminal):
   ```powershell
   $env:PC_UPDATE_FEED = 'http://localhost:8080'
   & "$env:LOCALAPPDATA\Programs\PocketChart\PocketChart.exe"
   ```
   The hook (`src/main/main.ts`) sees `PC_UPDATE_FEED`, switches to a generic feed, and
   sets `allowDowngrade=true`. Watch the in-app update notification: it should download,
   verify, and offer to install. The server terminal logs each `latest.yml` / `.exe` hit.
3. Swap baselines / served version per the table above and repeat as often as you like.

## Notes

- **Clear stale cache** between runs if the updater seems to skip a download:
  `Remove-Item -Recurse -Force "$env:LOCALAPPDATA\pocketchart-updater"`
- `PC_UPDATE_FEED` is **inert in production** — absent the env var, the override does nothing.
- This validates the same Authenticode check that `verify-publisher-match.ps1` enforces in CI.
  The CI guard prevents a mismatch from ever shipping; this harness lets you eyeball the UX.
