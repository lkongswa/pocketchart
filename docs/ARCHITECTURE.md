# PocketChart - Architecture (visual reference)

**Purpose.** Quick-load semantic map of the system, optimized for both human
skimming and AI assistants reading the codebase. Update when major
boundaries change. If a diagram drifts from reality, fix the diagram —
not by deleting it, by editing it.

Mermaid renders natively in GitHub, Obsidian, and most modern markdown
viewers. VS Code needs the "Markdown Preview Mermaid Support" extension.

---

## 1. System architecture (high level)

```mermaid
flowchart TB
    User[Practitioner]

    subgraph Electron["Electron Desktop App (PocketChart.exe)"]
        Main["Main Process<br/>(src/main/main.ts<br/>Node.js runtime)"]
        Renderer["Renderer Process<br/>(src/renderer/<br/>React 19 UI)"]
        Preload["preload.ts<br/>(contextBridge)"]
        Renderer <-->|"window.electron.*<br/>(IPC)"| Preload
        Preload <-->|"ipcMain.handle"| Main
    end

    subgraph Storage["Local storage (per-user, OS-scoped)"]
        DB[("SQLCipher DB<br/>AES-256 at rest<br/>%APPDATA%/PocketChart/")]
        Keystore["keystore.ts<br/>passphrase + recovery key"]
        Config["electron-store<br/>app preferences"]
        Backups["*.pcbackup<br/>(zip: db + keystore)"]
    end

    Main --> DB
    Main --> Keystore
    Main --> Config
    Main -->|create / restore| Backups

    subgraph External["External services (network calls leave the device)"]
        Stripe["Stripe SDK<br/>license activation,<br/>billing"]
        Airtable["Airtable<br/>(feedback only,<br/>no PHI)"]
        Updater["GitHub Releases<br/>(electron-updater<br/>auto-updates)"]
        Azure["Azure Code Signing<br/>(build-time only)"]
    end

    Main -.->|HTTPS| Stripe
    Main -.->|HTTPS, PAT-authed| Airtable
    Main -.->|HTTPS, signed update.yml| Updater

    User -->|interacts| Renderer
    User -->|installs / updates| Electron
```

**Key invariants the diagram captures:**
- Renderer never touches the DB directly. All PHI access goes Main → DB.
- The DB file is encrypted at rest via SQLCipher; the passphrase lives in
  `keystore.ts` (encrypted with the user's master passphrase).
- The only outbound network paths are Stripe, Airtable feedback, and GitHub
  Releases auto-update. Anything else routing PHI off-device would be a
  significant architectural change.
- Azure code signing happens in CI, not at runtime — included for completeness.

---

## 2. PHI data flow (the security-relevant view)

```mermaid
flowchart LR
    subgraph Inputs["Where PHI enters"]
        Forms["Manual entry forms<br/>(client intake, notes,<br/>evals, appointments)"]
        CSV["CSV import<br/>(papaparse)"]
        Restore["Backup restore<br/>(.pcbackup zip<br/>via adm-zip)"]
        Demo["Demo data seed<br/>(synthetic only)"]
    end

    subgraph Core["At rest"]
        DB[("SQLCipher DB<br/>AES-256 encrypted")]
        AuditLog[("audit_log table<br/>HIPAA-relevant events")]
    end

    subgraph Outputs["Where PHI exits"]
        PDF["PDF export<br/>(jspdf, pdf-lib)"]
        BackupOut["Backup creation<br/>(.pcbackup via archiver)"]
        Fax["Fax send<br/>(SRFax provider)"]
        Claims["Insurance claims<br/>(EDI 837 / CMS 1500)"]
        Clearinghouse["Clearinghouse upload<br/>(future: Claim.MD)"]
    end

    Forms --> Core
    CSV --> Core
    Restore --> Core
    Demo --> Core

    Core --> PDF
    Core --> BackupOut
    Core --> Fax
    Core --> Claims
    Claims --> Clearinghouse

    Core --> AuditLog
```

**Why this diagram matters:**
- Every arrow into or out of `Core` is a place where PHI crosses a boundary.
- The dependencies pinned in [SECURITY.md](../SECURITY.md) (papaparse, jspdf,
  pdf-lib, archiver, adm-zip) are pinned because they sit on these arrows.
- Claim.MD integration (planned) extends `Clearinghouse` — when added, its
  SDK should also get pinned and listed in SECURITY.md.

---

## 3. IPC channels (renderer ↔ main contract)

The renderer never executes Node.js APIs directly — all privileged operations
go through IPC channels exposed via `preload.ts`. Channels are namespaced
by feature.

```mermaid
flowchart LR
    Renderer[React Renderer]

    subgraph Channels["ipcMain.handle namespaces in src/main/main.ts"]
        Encryption["encryption:*<br/>setup, unlock, changePassphrase,<br/>verifyPassphrase, regenerateRecoveryKey"]
        Restore["restore:*<br/>pickFile, validateAndSummarize, execute"]
        Clients["clients:* / goals:* / notes:* / evals:*<br/>CRUD on patient records"]
        Billing["claims:* / payments:* / invoices:*<br/>billing and insurance"]
        Forms["intake:* / forms:*<br/>intake form templates"]
        Fax["fax:*<br/>send / status / log<br/>(SRFax provider)"]
        Settings["settings:* / practice:*<br/>app config, practice info"]
        License["stripe:* / license:*<br/>billing + activation"]
    end

    Renderer -->|"window.electron.encryption.*"| Encryption
    Renderer -->|"window.electron.restore.*"| Restore
    Renderer -->|"window.electron.clients.* etc"| Clients
    Renderer -->|"window.electron.claims.* etc"| Billing
    Renderer -->|"window.electron.intake.*"| Forms
    Renderer -->|"window.electron.fax.*"| Fax
    Renderer -->|"window.electron.settings.*"| Settings
    Renderer -->|"window.electron.stripe.*"| License
```

**Conventions:**
- All channel names are `namespace:operation` (lower-camelCase operation).
- Handlers in `main.ts` are grouped by namespace; if you add a channel,
  put it next to its siblings.
- `contextIsolation: true` is on (see `createWindow()` in main.ts) — never
  disable it without serious thought; it's a load-bearing security boundary.

---

## 4. Build & release pipeline

```mermaid
flowchart LR
    Dev["Developer (Lyda)"] -->|push tag v*| GH

    subgraph GH["GitHub Actions"]
        SecurityWf["Security workflow<br/>(every PR + push to main + weekly)<br/>npm audit + gitleaks"]
        BuildWf["Build Windows workflow<br/>(on tag push v*)"]
        BuildWf -->|npm ci| InstallStep["Install deps<br/>(scripts disabled)"]
        InstallStep -->|"npm run deps:setup"| Rebuild["Rebuild trusted natives<br/>(better-sqlite3, sqlcipher,<br/>electron, lzma-native)"]
        Rebuild -->|"npm run build"| TSC["tsc + webpack"]
        TSC -->|"electron-builder --win"| Sign["Sign installer<br/>(Azure Code Signing)"]
    end

    Sign -->|"upload"| Releases["GitHub Releases<br/>(installer.exe + latest.yml)"]

    subgraph UserMachine["End user machine"]
        Updater["electron-updater<br/>(in shipped app)"]
        Installed["PocketChart.exe<br/>installed copy"]
    end

    Releases -->|"poll latest.yml"| Updater
    Updater -->|"download + install on next launch"| Installed
```

**Notes:**
- `Security` workflow ([.github/workflows/security.yml](../.github/workflows/security.yml))
  runs on every PR; blocks merge on high+ npm audit findings or any gitleaks hit.
- `Build Windows` ([.github/workflows/build-windows.yml](../.github/workflows/build-windows.yml))
  only runs on `v*` tag pushes (or manual `workflow_dispatch`) — does not run
  on every PR.
- The installer is Azure-signed; tampering with the signed binary would
  break signature verification on user machines.
- `electron-updater` verifies `latest.yml` signatures against the publisher
  before applying updates — this is the auto-update channel and a top-tier
  compromise vector (see [SECURITY.md](../SECURITY.md) pinned-deps rationale).

---

## 5. Domain model (high level)

The DB has 50+ tables; this shows the load-bearing relationships.

```mermaid
erDiagram
    PRACTICE ||--o{ CLIENTS : owns
    CLIENTS ||--o{ GOALS : has
    CLIENTS ||--o{ EVALUATIONS : has
    CLIENTS ||--o{ NOTES : has
    CLIENTS ||--o{ APPOINTMENTS : has
    CLIENTS ||--o{ CLIENT_DOCUMENTS : has
    CLIENTS ||--o{ CLAIMS : "billed for"
    CLIENTS ||--o{ AUTHORIZATIONS : has
    GOALS ||--o{ GOAL_PROGRESS_HISTORY : tracked_by
    APPOINTMENTS ||--o{ NOTES : "produces"
    NOTES ||--o{ NOTE_AMENDMENTS : "may be amended by"
    CLAIMS ||--o{ CLAIM_LINES : contains
    CLAIMS ||--o{ PAYMENTS : "paid by"
    PAYERS ||--o{ CLAIMS : "covers"
    PAYERS ||--o{ AUTHORIZATIONS : "authorizes"
    INVOICES ||--o{ INVOICE_ITEMS : contains
    PRACTICE ||--o{ AUDIT_LOG : "writes to"
```

**V4 multi-tenancy.** Per the 2026-04-30 commit `54ec2f4`, 33 core tables
gained `practice_id` and `created_by_user_id` columns. The current single-
practice model treats `practice_id` as a constant; future cloud-multi-tenant
deployments will use it for row-level scoping. **At that point, true
row-level security (Postgres RLS) becomes architecturally relevant.** Until
then, security is enforced at the OS file-permission and SQLCipher
encryption layers.

---

## How to extend this doc

- **New external service?** Add a node + arrow to diagram §1 and (if it
  touches PHI) to §2. Pin the SDK in package.json and document in
  SECURITY.md.
- **New IPC namespace?** Add a node to diagram §3.
- **New build step?** Edit diagram §4.
- **New table?** If load-bearing, add to diagram §5; if niche, leave it
  to the schema.

When in doubt: **draw it as text first, render later.** Mermaid syntax
is grep-able and AI-readable even when nothing's rendering it.
