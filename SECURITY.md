# Security

This document covers PocketChart's supply-chain and secrets posture: what's
hardened, why, what to do when something goes wrong, and the manual steps
that still need a human in the loop.

PocketChart is EMR-adjacent and handles PHI. The defenses below assume a
single compromised npm version could land patient data in the wrong hands
if it shipped to production unchecked.

---

## Hardening layers

| Layer | What it catches |
|---|---|
| `package-lock.json` committed + `npm ci` in CI | Locked dep versions; no drift between machines |
| `.npmrc` `ignore-scripts=true` | Blocks arbitrary `postinstall` code from compromised packages |
| `package.json` exact pins on critical deps | Prevents accidental upgrade of high-stakes packages on local `npm install` |
| `npm audit --audit-level=high` in CI | Blocks merges on known CVEs (high/critical) |
| Dependabot weekly + security updates | Surfaces version/security upgrades as reviewable PRs |
| Socket.dev | Catches *novel* attacks `npm audit` misses (behavioral analysis) |
| Pre-commit `gitleaks` hook | Stops secrets from ever entering a commit |
| `gitleaks-action` in CI | Catches secrets that escape the local hook |
| `/ultrareview` before merge on high-stakes PRs | Multi-agent semantic review layer |

---

## Pinned dependencies

Pinned to exact versions in `package.json` (not just the lockfile) so they can't be
silently upgraded by an unrelated `npm install`. Each line is the reason it's pinned —
future-Lyda, please do not unpin without thinking.

| Package | Why pinned |
|---|---|
| `stripe` | Payments. Compromised SDK can leak customer cards or payment metadata. |
| `better-sqlite3` | DB driver. Compromise means full PHI access at the storage layer. |
| `@journeyapps/sqlcipher` | DB at-rest encryption. Compromise breaks the encryption guarantee SQLCipher provides. |
| `electron-updater` | Auto-update channel. Compromised updater can ship arbitrary code as a "PocketChart update" to every installed user. Highest-stakes vector. |
| `jspdf` | PDF generation. Touches every patient document; compromise can exfiltrate via embedded payload. |
| `pdf-lib` | PDF generation (alternate). Same risk as `jspdf`. |
| `papaparse` | CSV import. Patient data crosses through here on bulk import. |
| `archiver` | Backup zip creation (`.pcbackup` format). Patient data in transit. |
| `adm-zip` | Backup zip restore. Patient data in transit. |
| `electron` | Application runtime. Compromise = compromise of the entire app. |

**Not pinned (intentionally):** `react`, `react-dom`, UI utilities, type packages.
React is so heavily scrutinized that supply-chain attacks on it would be
detected and yanked within hours; pinning would create excessive Dependabot
churn for marginal additional safety.

---

## Install scripts policy

`.npmrc` sets `ignore-scripts=true` globally so a compromised dependency
cannot run arbitrary code during `npm install` / `npm ci`.

The following packages legitimately need install scripts (native compile
or binary download) and are rebuilt explicitly via `npm run deps:setup`:

- `better-sqlite3` — native SQLite build
- `@journeyapps/sqlcipher` — native SQLCipher build
- `electron` — downloads the Electron binary
- `electron-winstaller` — picks 7z arch for Windows installer
- `lzma-native` — native LZMA compression (build pipeline)

`core-js`'s funding-plea postinstall is intentionally skipped (no functional
impact).

**Install pattern (local dev and CI):**

```bash
npm ci
npm run deps:setup
```

If you add a new dependency that needs install scripts, document it here and
add it to the `deps:setup` script in `package.json`. **Do not** disable
`ignore-scripts` globally and **never** use `--ignore-scripts=false` on
`npm install`.

---

## Secrets management

### Where production secrets live

Production secrets are GitHub Actions repository secrets, injected at build
time only. Specifically:

- `AIRTABLE_FEEDBACK_PAT` — Airtable PAT for feedback submission
- `AZURE_TENANT_ID`, `AZURE_CLIENT_ID`, `AZURE_CLIENT_SECRET` — code-signing
- `GITHUB_TOKEN` — built-in, scoped per-workflow

Local development reads from `.env` in the project root (gitignored — see
`.gitignore`'s `Environment` section). `.env.example` should always contain
placeholder values only (e.g. `STRIPE_SECRET_KEY=sk_test_REPLACE_ME`),
never real credentials.

**Never** commit `.env`, paste a credential into source code, or hardcode
a token in `package.json` scripts.

### Pre-commit hook setup (one-time per machine)

The repo ships `.pre-commit-config.yaml` configured for `gitleaks v8.30.1`.
On a fresh clone or a new machine, install once:

```bash
# Install pre-commit (Windows: pip install pre-commit; Mac: brew install pre-commit)
pip install pre-commit

# Activate the hook for this repo
pre-commit install
```

After this, every `git commit` runs `gitleaks` against the staged diff and
blocks the commit if anything matches a default or custom rule
(`.gitleaks.toml`).

If you hit a false positive, add it to the `[allowlist]` section of
`.gitleaks.toml` rather than skipping the hook with `--no-verify`.

### "If a secret is committed" runbook

1. **Rotate at source FIRST.** Do not touch the code yet — the secret is
   already exposed. Revoke the leaked credential at its dashboard
   (Airtable, Stripe, Azure, etc.) and generate a replacement.
2. **For PHI-relevant credentials:** log discovery timestamp; may trigger
   HIPAA breach assessment. (PocketChart's feedback Airtable does not
   contain PHI, so the 2026-05-01 PAT rotation did not trigger this.)
3. Update wherever the new credential lives (GitHub Secret, local `.env`).
4. Remove the hardcoded value from code; commit the fix.
5. **History rewrite is optional for this solo repo if rotated promptly.**
   The leaked value in git history is dead once revoked.
6. If the alert was a false positive, add it to `.gitleaks.toml`'s
   `[allowlist]`.

### Baseline

Historical gitleaks scan was first run on **2026-05-01**. Three findings,
all in commit `bf50eaa` (Airtable PAT + base ID + table ID for the
feedback integration). PAT rotated at Airtable; new PAT stored as
`AIRTABLE_FEEDBACK_PAT` GitHub Secret. Base/table IDs are not secrets,
left in code.

---

## Adding a new dependency — checklist

Before `npm install <pkg>`, sanity-check it. None of these is a hard
gate; they're a smell test.

- [ ] Weekly downloads > 10k? (Adjust for niche libs; below 1k is a yellow flag)
- [ ] Last publish < 12 months ago?
- [ ] GitHub repo active, issues being responded to?
- [ ] Maintainer has 2FA on npm? (`npm view <pkg>` shows publishing info)
- [ ] Does it have install scripts? If yes, is the value worth the risk?
   If you add it, also add to `deps:setup` and document above.
- [ ] Does it pull in 50+ transitive deps for a small job? Reconsider — there's
   probably a smaller alternative.
- [ ] Does it touch PHI, payments, auth, crypto, or the auto-update path?
   If yes, pin the exact version in `package.json` and add a row to the
   "Pinned dependencies" table above.

---

## Incident response: "If a CVE drops"

1. Check whether the affected version is in `package-lock.json`
   (`npm ls <pkg>` or grep the lockfile).
2. If yes and exploitable:
   - Rotate any secrets the affected code path touches
   - Force-deploy a patched version (`npm install <pkg>@<patched>`,
     verify with `npm audit`, push, tag a release)
   - Review logs for suspicious activity in the window between disclosure
     and patch
3. If PHI was potentially exposed: HIPAA breach notification timeline
   starts the moment of discovery — log the timestamp.
4. If `npm audit fix --force` is tempting: **don't**. It can break things
   silently. Prefer `"overrides"` in `package.json` to pin a transitive
   dep to a patched version without changing direct deps.

---

## `/ultrareview` pre-merge gate

`/ultrareview` is a Claude Code slash command that runs a multi-agent
cloud review with verified findings. It does **not** replace human review
or CI checks — it's an additional semantic layer for high-stakes merges.

Run `/ultrareview` against any PR that touches:

- Authentication / session handling / passphrase / SQLCipher keystore
- Stripe / billing code
- PHI-handling code paths
- Build pipeline or CI config
- The auto-updater channel
- Major dependency upgrades (especially batched Dependabot PRs)

It is invoked by Lyda manually before merging — not by Claude Code as part
of automated work.

---

## Manual setup steps (still required)

A few hardening pieces can't be configured from a commit and need a human
to click through:

- [ ] **Branch protection on `main`**: require the `Security` workflow
   (npm audit + gitleaks) to pass before merge. Settings → Branches →
   add rule for `main`. **Do not** require `build-windows` — that
   workflow only runs on `v*` tag pushes / `workflow_dispatch`, never
   on pull requests, so requiring it would block every PR forever.
- [ ] **Dependabot security updates**: separate from version updates.
   Fires immediately on CVE disclosure. Settings → Code security and
   analysis → enable "Dependabot security updates."
- [ ] **Socket.dev**: install the GitHub App on the repo (free tier
   covers a single solo repo). Configure as a required PR check in
   branch protection. Tune thresholds after a week of signal — defaults
   are fine to start.
- [ ] **First-time pre-commit install** on each dev machine:
   `pip install pre-commit && pre-commit install` from the repo root.

---

## Replication to other projects

After this PR merges, the same baseline (`.npmrc`, `.gitleaks.toml`,
`.pre-commit-config.yaml`, `dependabot.yml`, `Security` workflow) should
be copied to:

- **Aphasia Studio** — WordPress plugin; the npm side is build-tooling-only
  but still worth hardening. Klaviyo and Make.com rules will become
  relevant there. PHI exposure scope is different (WP database, not local
  SQLite) — that gets its own RLS/capability audit as a separate spec.

The build pipeline differences (no electron, no native deps to rebuild)
mean `deps:setup` won't apply to those projects unchanged.
