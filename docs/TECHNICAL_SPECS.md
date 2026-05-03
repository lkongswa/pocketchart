# PocketChart - Technical Specifications

**Version:** 1.0.0-beta.1
**Last Updated:** January 2026
**App ID:** com.pocketchart.app

---

## 1. Overview

PocketChart is a local-first desktop application for clinical documentation designed for solo PT/OT/ST practitioners. All patient data is stored locally on the user's machine in a SQLite database. There is no cloud sync, no remote server, and no internet connection required for core functionality.

### Key Design Principles
- **Local-first**: All data stays on the practitioner's machine
- **Offline-capable**: No internet required (except for auto-updates and license activation)
- **HIPAA-aware**: Soft deletes for record retention, PIN protection, EULA acceptance
- **Single-binary**: One installer, license-gated features (Free vs Pro)

---

## 2. Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Desktop Framework** | Electron | 40.9.3 |
| **UI Framework** | React | 19.2.4 |
| **Language** | TypeScript | 5.9.3 |
| **CSS Framework** | Tailwind CSS | 4.1.18 |
| **Database** | SQLite (better-sqlite3) | 12.6.2 |
| **Bundler** | Webpack | 5.104.1 |
| **Router** | React Router | 7.13.0 |
| **PDF Generation** | jsPDF | 4.2.1 |
| **Icons** | Lucide React | 0.563.0 |
| **Date Utilities** | date-fns | 4.1.0 |
| **Archive Creation** | Archiver | 7.0.1 |
| **Auto-Update** | electron-updater | 6.7.3 |
| **Settings Store** | electron-store | 11.0.2 |
| **Installer** | electron-builder (NSIS) | 26.4.0 |

---

## 3. Architecture

### 3.1 Process Model

PocketChart follows Electron's two-process architecture:

```
+----------------------------+       IPC Bridge       +----------------------------+
|     MAIN PROCESS           | <===================> |    RENDERER PROCESS         |
|                            |    (preload.ts)        |                            |
|  - Electron app lifecycle  |                        |  - React UI                |
|  - SQLite database         |  contextBridge         |  - React Router            |
|  - File system access      |  exposeInMainWorld     |  - Tailwind CSS            |
|  - Auto-updater            |                        |  - User interactions       |
|  - PDF generation          |  contextIsolation:true |  - State management        |
|  - System dialogs          |  nodeIntegration:false |                            |
+----------------------------+                        +----------------------------+
```

**Security boundaries:**
- `contextIsolation: true` - Renderer cannot access Node.js APIs directly
- `nodeIntegration: false` - No require() in renderer
- `preload.ts` - Whitelisted IPC bridge via `contextBridge.exposeInMainWorld()`

### 3.2 File Structure

```
PocketChart/
├── src/
│   ├── main/                          # Electron main process
│   │   ├── main.ts                    # App lifecycle, IPC handlers, PDF gen
│   │   ├── database.ts                # SQLite init, migrations, schema
│   │   ├── preload.ts                 # IPC bridge (contextBridge)
│   │   └── seed.ts                    # Default data seeding
│   ├── renderer/                      # React frontend
│   │   ├── App.tsx                    # Root component, routing, auth
│   │   ├── index.tsx                  # React entry point
│   │   ├── index.html                 # HTML template
│   │   ├── styles/
│   │   │   └── globals.css            # Tailwind + CSS custom properties
│   │   ├── pages/
│   │   │   ├── DashboardPage.tsx      # Home dashboard with stats
│   │   │   ├── ClientsPage.tsx        # Client list with search/filter
│   │   │   ├── ClientDetailPage.tsx   # Individual client view
│   │   │   ├── NoteFormPage.tsx       # SOAP note create/edit
│   │   │   ├── EvalFormPage.tsx       # Evaluation create/edit
│   │   │   ├── CalendarPage.tsx       # Month/Week/Day calendar
│   │   │   ├── SuperbillPage.tsx      # Insurance billing documents
│   │   │   ├── SettingsPage.tsx       # All app settings
│   │   │   ├── HelpPage.tsx           # Searchable documentation
│   │   │   ├── NoteBankPage.tsx       # SOAP phrase templates
│   │   │   └── GoalsBankPage.tsx      # Goal templates
│   │   └── components/
│   │       ├── ErrorBoundary.tsx       # React error boundary
│   │       ├── OnboardingScreen.tsx    # First-run wizard + EULA
│   │       ├── PinLockScreen.tsx       # PIN entry + recovery
│   │       ├── UpdateNotification.tsx  # Auto-update toast
│   │       ├── AppointmentModal.tsx    # Appointment create/edit
│   │       ├── ClientFormModal.tsx     # Client create/edit
│   │       ├── GoalFormModal.tsx       # Goal create/edit
│   │       ├── NoteBankPopover.tsx     # Quick template access
│   │       ├── SignaturePad.tsx        # Canvas signature capture
│   │       ├── SmartTextarea.tsx       # Enhanced textarea
│   │       └── calendar/
│   │           ├── CalendarToolbar.tsx # Nav and view switcher
│   │           ├── MonthView.tsx       # Monthly grid
│   │           ├── WeekView.tsx        # Weekly layout
│   │           ├── DayView.tsx         # Daily detail view
│   │           ├── TimeGrid.tsx        # Time-based grid
│   │           └── AppointmentBlock.tsx# Appointment visual
│   └── shared/
│       └── types.ts                   # Shared TypeScript interfaces
├── build/
│   ├── icon.ico                       # Windows app icon
│   ├── icon.png                       # App icon (PNG)
│   └── uninstaller.nsh                # Custom NSIS uninstall dialog
├── dist/                              # Compiled output (gitignored)
├── release/                           # Installer output (gitignored)
├── webpack.config.js
├── tsconfig.json                      # Renderer TypeScript config
├── tsconfig.main.json                 # Main process TypeScript config
├── postcss.config.js
├── package.json
└── .gitignore
```

### 3.3 Build Pipeline

```
Source (.ts/.tsx)
    │
    ├── Main Process:  tsc -p tsconfig.main.json  ──>  dist/main/*.js
    │
    └── Renderer:      webpack --mode production   ──>  dist/renderer/
                           │                               ├── bundle.js
                           ├── ts-loader                   ├── index.html
                           ├── css-loader + postcss        └── styles.css
                           └── HtmlWebpackPlugin

    Packaging:  electron-builder --win  ──>  release/PocketChart Setup X.X.X.exe
```

---

## 4. Database

### 4.1 Engine & Configuration

- **Engine:** SQLite 3 via better-sqlite3 (synchronous, native bindings)
- **File:** `[dataPath]/pocketchart.db`
- **Journal Mode:** WAL (Write-Ahead Logging) for better read concurrency
- **Foreign Keys:** Enabled via pragma
- **Default Location:** `%AppData%/Roaming/pocketchart/` (Windows)

### 4.2 Schema (10 Tables)

#### practice
Single-record table (id=1) for practitioner/clinic information.

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK | Always 1 |
| name | TEXT | Practice/clinic name |
| address | TEXT | Street address |
| phone | TEXT | Phone number |
| npi | TEXT | National Provider Identifier |
| tax_id | TEXT | Tax ID / EIN |
| license_number | TEXT | Professional license # |
| license_state | TEXT | State of licensure |
| discipline | TEXT | PT, OT, or ST |

#### clients
Patient/client demographic and insurance records.

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK AUTO | Auto-incrementing |
| first_name | TEXT NOT NULL | |
| last_name | TEXT NOT NULL | |
| dob | TEXT | Date of birth |
| phone | TEXT | |
| email | TEXT | |
| address | TEXT | |
| primary_dx_code | TEXT | ICD-10 code |
| primary_dx_description | TEXT | Diagnosis description |
| secondary_dx | TEXT | JSON array of secondary Dx |
| default_cpt_code | TEXT | Default billing code |
| insurance_payer | TEXT | Insurance company |
| insurance_member_id | TEXT | Member ID |
| insurance_group | TEXT | Group number |
| referring_physician | TEXT | Referring provider name |
| referring_npi | TEXT | Referring provider NPI |
| status | TEXT | 'active' / 'discharged' / 'hold' |
| discipline | TEXT | PT / OT / ST |
| created_at | DATETIME | Auto-set |
| updated_at | DATETIME | Auto-set |
| deleted_at | DATETIME | Soft delete (migration v4) |

#### goals
Client treatment goals (STG/LTG).

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK AUTO | |
| client_id | INTEGER FK | References clients(id) |
| goal_text | TEXT NOT NULL | Goal description |
| goal_type | TEXT | 'STG' or 'LTG' |
| category | TEXT | Clinical category |
| status | TEXT | 'active' / 'met' / 'discontinued' / 'modified' |
| target_date | TEXT | Expected completion |
| met_date | TEXT | Date achieved |
| created_at | DATETIME | Auto-set |
| deleted_at | DATETIME | Soft delete (migration v4) |

#### evaluations
Clinical evaluations/assessments.

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK AUTO | |
| client_id | INTEGER FK | References clients(id) |
| eval_date | TEXT NOT NULL | Date of evaluation |
| discipline | TEXT | PT / OT / ST |
| content | TEXT | JSON structured form data |
| signed_at | DATETIME | Signature timestamp |
| signature_image | TEXT | Base64 canvas image (migration v3) |
| signature_typed | TEXT | Typed signature name (migration v3) |
| created_at | DATETIME | Auto-set |
| updated_at | DATETIME | Auto-set |
| deleted_at | DATETIME | Soft delete (migration v4) |

#### notes
SOAP (Subjective, Objective, Assessment, Plan) session notes.

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK AUTO | |
| client_id | INTEGER FK | References clients(id) |
| date_of_service | TEXT NOT NULL | Session date |
| time_in | TEXT | Session start time |
| time_out | TEXT | Session end time |
| units | REAL | Billing units |
| cpt_code | TEXT | Primary CPT code (legacy) |
| cpt_codes | TEXT | JSON array of {code, units} (migration v1) |
| subjective | TEXT | S - Patient report |
| objective | TEXT | O - Clinical observations |
| assessment | TEXT | A - Clinical assessment |
| plan | TEXT | P - Treatment plan |
| goals_addressed | TEXT | JSON array of goal IDs |
| signed_at | DATETIME | Signature timestamp |
| signature_image | TEXT | Base64 canvas image (migration v2) |
| signature_typed | TEXT | Typed signature name (migration v2) |
| created_at | DATETIME | Auto-set |
| updated_at | DATETIME | Auto-set |
| deleted_at | DATETIME | Soft delete (migration v4) |

#### appointments
Scheduling and calendar entries.

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK AUTO | |
| client_id | INTEGER FK | References clients(id) |
| scheduled_date | TEXT NOT NULL | Appointment date |
| scheduled_time | TEXT | Time of day |
| duration_minutes | INTEGER | Default: 60 |
| status | TEXT | 'scheduled' / 'completed' / 'cancelled' / 'no-show' |
| note_id | INTEGER FK | References notes(id), optional link |
| created_at | DATETIME | Auto-set |
| deleted_at | DATETIME | Soft delete (migration v4) |

#### note_bank
Reusable SOAP phrase templates.

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK AUTO | |
| discipline | TEXT | PT / OT / ST / ALL |
| category | TEXT | Clinical category |
| section | TEXT | SOAP section: S / O / A / P |
| phrase | TEXT NOT NULL | Template text (may contain ___ blanks) |
| is_default | INTEGER | 1 = pre-loaded template |
| is_favorite | INTEGER | 1 = user-favorited |
| created_at | DATETIME | Auto-set |

#### goals_bank
Reusable goal templates.

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK AUTO | |
| discipline | TEXT | PT / OT / ST |
| category | TEXT | Goal category |
| goal_template | TEXT NOT NULL | Template with ___ blanks |
| is_default | INTEGER | 1 = pre-loaded |
| created_at | DATETIME | Auto-set |

#### settings
Key-value configuration store.

| Column | Type | Notes |
|--------|------|-------|
| key | TEXT PK | Setting name |
| value | TEXT | Setting value |

**Known settings keys:**
- `schema_version` - Current DB migration version (currently 5)
- `onboarding_complete` - First-run wizard completed
- `pin_hash` - HMAC-SHA256 hash of 4-digit PIN
- `pin_salt` - 16-byte hex salt for PIN hash
- `pin_recovery_token` - SHA256 hash of recovery code
- `pin_recovery_expires` - Token expiration ISO timestamp
- `auto_timeout_minutes` - Auto-lock idle timeout
- `default_session_length` - Default appointment duration
- `signature_name` - Clinician display name
- `signature_credentials` - Clinician credentials suffix
- `signature_image` - Base64 signature image
- `last_backup_date` - Last manual backup ISO timestamp
- `backup_reminder_dismissed` - Dismiss date for backup banner
- `app_tier` - 'free' or 'pro'
- `license_key` - License key string
- `license_activated_at` - Activation ISO timestamp
- `terms_accepted` - EULA acceptance ISO timestamp

#### client_documents
File storage metadata for uploaded client documents.

| Column | Type | Notes |
|--------|------|-------|
| id | INTEGER PK AUTO | |
| client_id | INTEGER FK | References clients(id) |
| filename | TEXT NOT NULL | UUID-based storage filename |
| original_name | TEXT NOT NULL | User-facing filename |
| file_type | TEXT | File extension |
| file_size | INTEGER | Size in bytes |
| category | TEXT | Default: 'general' |
| notes | TEXT | Optional description |
| created_at | DATETIME | Auto-set |
| deleted_at | DATETIME | Soft delete (migration v4) |

### 4.3 Database Indexes (15)

```sql
idx_notes_client_id           ON notes(client_id)
idx_notes_date_of_service     ON notes(date_of_service)
idx_goals_client_id           ON goals(client_id)
idx_evaluations_client_id     ON evaluations(client_id)
idx_appointments_client_id    ON appointments(client_id)
idx_appointments_scheduled_date ON appointments(scheduled_date)
idx_client_documents_client_id ON client_documents(client_id)
idx_note_bank_discipline      ON note_bank(discipline)
idx_goals_bank_discipline     ON goals_bank(discipline)
idx_clients_status            ON clients(status)
idx_clients_deleted_at        ON clients(deleted_at)
idx_notes_deleted_at          ON notes(deleted_at)
idx_evaluations_deleted_at    ON evaluations(deleted_at)
idx_goals_deleted_at          ON goals(deleted_at)
idx_appointments_deleted_at   ON appointments(deleted_at)
```

### 4.4 Migration System

Migrations run in a single transaction on startup. Each migration checks column existence before altering to ensure idempotency.

| Version | Description |
|---------|-------------|
| 1 | Add `cpt_codes` JSON column to notes |
| 2 | Add `signature_image`, `signature_typed` to notes |
| 3 | Add `signature_image`, `signature_typed` to evaluations |
| 4 | Add `deleted_at` soft-delete column to 6 clinical tables |
| 5 | Ensure `app_tier = 'free'` default in settings |

### 4.5 Data Storage Locations

```
Default: %AppData%/Roaming/pocketchart/
Custom:  User-configurable via Settings > Storage

[dataPath]/
  pocketchart.db              SQLite database
  pocketchart.db-wal          Write-ahead log
  pocketchart.db-shm          Shared memory file
  practice_logo.png           Practice logo (optional)
  PIN_RECOVERY.txt            Temporary recovery file (15 min TTL)
  documents/
    [clientId]/
      [uuid].[ext]            Uploaded client documents
```

---

## 5. IPC Channel Reference

All IPC handlers are wrapped in `safeHandle()` for error boundary protection. The renderer accesses them via `window.api.<namespace>.<method>()`.

### 5.1 App & Updates

| Channel | Preload Bridge | Direction | Description |
|---------|---------------|-----------|-------------|
| `app:getVersion` | `window.api.app.getVersion()` | invoke | Returns app version string |
| `update:check` | `window.api.update.check()` | invoke | Check for available updates |
| `update:download` | `window.api.update.download()` | invoke | Download update package |
| `update:install` | `window.api.update.install()` | invoke | Quit and install update |
| `update:available` | `window.api.update.onAvailable(cb)` | event | New version found |
| `update:not-available` | `window.api.update.onNotAvailable(cb)` | event | App is current |
| `update:download-progress` | `window.api.update.onProgress(cb)` | event | Download % progress |
| `update:downloaded` | `window.api.update.onDownloaded(cb)` | event | Ready to install |

### 5.2 Practice

| Channel | Bridge | Description |
|---------|--------|-------------|
| `practice:get` | `window.api.practice.get()` | Get practice info |
| `practice:save` | `window.api.practice.save(data)` | Save practice info |

### 5.3 Clients

| Channel | Bridge | Description |
|---------|--------|-------------|
| `clients:list` | `window.api.clients.list(filters?)` | List active clients |
| `clients:get` | `window.api.clients.get(id)` | Get client by ID |
| `clients:create` | `window.api.clients.create(data)` | Create new client |
| `clients:update` | `window.api.clients.update(id, data)` | Update client |
| `clients:delete` | `window.api.clients.delete(id)` | Soft delete (sets discharged) |

### 5.4 Goals

| Channel | Bridge | Description |
|---------|--------|-------------|
| `goals:listByClient` | `window.api.goals.listByClient(clientId)` | Get client goals |
| `goals:create` | `window.api.goals.create(data)` | Create goal |
| `goals:update` | `window.api.goals.update(id, data)` | Update goal |
| `goals:delete` | `window.api.goals.delete(id)` | Soft delete |

### 5.5 Notes

| Channel | Bridge | Description |
|---------|--------|-------------|
| `notes:listByClient` | `window.api.notes.listByClient(clientId)` | Get client notes |
| `notes:get` | `window.api.notes.get(id)` | Get note by ID |
| `notes:create` | `window.api.notes.create(data)` | Create SOAP note |
| `notes:update` | `window.api.notes.update(id, data)` | Update note |
| `notes:delete` | `window.api.notes.delete(id)` | Soft delete |

### 5.6 Evaluations

| Channel | Bridge | Description |
|---------|--------|-------------|
| `evaluations:listByClient` | `window.api.evaluations.listByClient(clientId)` | Get client evals |
| `evaluations:get` | `window.api.evaluations.get(id)` | Get eval by ID |
| `evaluations:create` | `window.api.evaluations.create(data)` | Create evaluation |
| `evaluations:update` | `window.api.evaluations.update(id, data)` | Update evaluation |
| `evaluations:delete` | `window.api.evaluations.delete(id)` | Soft delete |

### 5.7 Appointments

| Channel | Bridge | Description |
|---------|--------|-------------|
| `appointments:list` | `window.api.appointments.list(filters?)` | List appointments |
| `appointments:create` | `window.api.appointments.create(data)` | Create appointment |
| `appointments:update` | `window.api.appointments.update(id, data)` | Update appointment |
| `appointments:delete` | `window.api.appointments.delete(id)` | Soft delete |

### 5.8 Note Bank & Goals Bank

| Channel | Bridge | Description |
|---------|--------|-------------|
| `noteBank:list` | `window.api.noteBank.list(filters?)` | List phrase templates |
| `noteBank:create` | `window.api.noteBank.create(data)` | Create phrase |
| `noteBank:update` | `window.api.noteBank.update(id, data)` | Update phrase |
| `noteBank:delete` | `window.api.noteBank.delete(id)` | Hard delete |
| `noteBank:toggleFavorite` | `window.api.noteBank.toggleFavorite(id)` | Toggle favorite |
| `goalsBank:list` | `window.api.goalsBank.list(filters?)` | List goal templates |
| `goalsBank:create` | `window.api.goalsBank.create(data)` | Create template |
| `goalsBank:update` | `window.api.goalsBank.update(id, data)` | Update template |
| `goalsBank:delete` | `window.api.goalsBank.delete(id)` | Hard delete |

### 5.9 Settings

| Channel | Bridge | Description |
|---------|--------|-------------|
| `settings:get` | `window.api.settings.get(key)` | Get setting value |
| `settings:set` | `window.api.settings.set(key, value)` | Set setting value |

### 5.10 Security

| Channel | Bridge | Description |
|---------|--------|-------------|
| `security:isPinEnabled` | `window.api.security.isPinEnabled()` | Check if PIN active |
| `security:setPin` | `window.api.security.setPin(new, current?)` | Set or change PIN |
| `security:verifyPin` | `window.api.security.verifyPin(pin)` | Verify PIN attempt |
| `security:removePin` | `window.api.security.removePin(current)` | Disable PIN |
| `security:requestPinReset` | `window.api.security.requestPinReset()` | Generate recovery file |
| `security:verifyRecoveryToken` | `window.api.security.verifyRecoveryToken(token)` | Verify & reset PIN |
| `security:getTimeoutMinutes` | `window.api.security.getTimeoutMinutes()` | Get auto-lock timeout |
| `security:setTimeoutMinutes` | `window.api.security.setTimeoutMinutes(min)` | Set auto-lock timeout |

### 5.11 License

| Channel | Bridge | Description |
|---------|--------|-------------|
| `license:getStatus` | `window.api.license.getStatus()` | Get tier/key status |
| `license:activate` | `window.api.license.activate(key)` | Activate Pro license |
| `license:deactivate` | `window.api.license.deactivate()` | Revert to Free |

### 5.12 Backup & Export

| Channel | Bridge | Description |
|---------|--------|-------------|
| `backup:exportManual` | `window.api.backup.exportManual()` | Export .db backup |
| `backup:getDbPath` | `window.api.backup.getDbPath()` | Get DB file path |
| `backup:exportClientPdf` | `window.api.backup.exportClientPdf(data)` | Single client PDF |
| `backup:exportAllChartsPdf` | `window.api.backup.exportAllChartsPdf()` | All clients ZIP |
| `backup:savePdf` | `window.api.backup.savePdf(data)` | Save PDF to disk |
| `backup:exportCsv` | `window.api.backup.exportCsv()` | Export clients CSV |

### 5.13 Superbill

| Channel | Bridge | Description |
|---------|--------|-------------|
| `superbill:generate` | `window.api.superbill.generate(data)` | Generate superbill PDF |
| `superbill:save` | `window.api.superbill.save(data)` | Save superbill to disk |
| `superbill:generateBulk` | `window.api.superbill.generateBulk(data)` | Date range superbill |

### 5.14 Storage, Logo & Documents

| Channel | Bridge | Description |
|---------|--------|-------------|
| `storage:getDataPath` | `window.api.storage.getDataPath()` | Get current path |
| `storage:setDataPath` | `window.api.storage.setDataPath()` | Change data directory |
| `storage:getDefaultPath` | `window.api.storage.getDefaultPath()` | Get default path |
| `storage:resetDataPath` | `window.api.storage.resetDataPath()` | Reset to default |
| `logo:upload` | `window.api.logo.upload()` | Upload logo image |
| `logo:get` | `window.api.logo.get()` | Get logo path |
| `logo:getBase64` | `window.api.logo.getBase64()` | Get logo as data URI |
| `logo:remove` | `window.api.logo.remove()` | Delete logo |
| `documents:upload` | `window.api.documents.upload(data)` | Upload client doc |
| `documents:list` | `window.api.documents.list(data)` | List client docs |
| `documents:open` | `window.api.documents.open(data)` | Open with system app |
| `documents:delete` | `window.api.documents.delete(data)` | Soft delete doc |
| `documents:getPath` | `window.api.documents.getPath(data)` | Get file path |

**Total IPC Channels: 60+ handlers, 4 event listeners**

---

## 6. Routing

PocketChart uses React Router v7 with `HashRouter` (required for Electron file:// protocol).

| Path | Component | Description |
|------|-----------|-------------|
| `/` | DashboardPage | Home with stats, quick actions, backup reminder |
| `/clients` | ClientsPage | Client list with search, filter, create |
| `/clients/:id` | ClientDetailPage | Client profile, notes, evals, goals, docs |
| `/clients/:id/note/new` | NoteFormPage | Create new SOAP note |
| `/clients/:id/note/:noteId` | NoteFormPage | Edit existing SOAP note |
| `/clients/:id/eval/new` | EvalFormPage | Create new evaluation |
| `/clients/:id/eval/:evalId` | EvalFormPage | Edit existing evaluation |
| `/clients/:id/superbill` | SuperbillPage | Generate superbill for client |
| `/calendar` | CalendarPage | Month/Week/Day calendar views |
| `/help` | HelpPage | Searchable documentation (12 sections) |
| `/settings` | SettingsPage | All configuration and settings |

**Sidebar Navigation:** Dashboard, Clients, Calendar, Help, Settings

---

## 7. Security Model

### 7.1 PIN Protection
- **Algorithm:** HMAC-SHA256 with 16-byte random salt
- **Storage:** `pin_hash` and `pin_salt` in settings table
- **Validation:** 4-digit numeric, enforced on set
- **Change/Remove:** Requires current PIN verification

### 7.2 PIN Recovery
- Generates 8-char uppercase hex token via `crypto.randomBytes(4)`
- Writes `PIN_RECOVERY.txt` to data directory with token and instructions
- Opens file explorer automatically so user can find the file
- Token hash (SHA256) stored in settings with 15-minute expiration
- On successful verification: PIN removed, recovery file deleted
- **Design rationale:** Proves user has filesystem access (same security level as the data itself)

### 7.3 Auto-Lock
- Tracks user activity: mousemove, mousedown, keydown, scroll, touchstart
- Configurable timeout in minutes (0 = disabled)
- Checks every 10 seconds if idle time exceeds threshold
- Locks screen, requires PIN to unlock

### 7.4 Soft Deletes
- All clinical tables have `deleted_at` column
- Delete operations set `deleted_at = CURRENT_TIMESTAMP` instead of removing rows
- All SELECT queries filter `WHERE deleted_at IS NULL`
- Supports HIPAA 6-7 year record retention requirement
- Note bank and goals bank use hard delete (non-clinical templates)

### 7.5 SQL Injection Prevention
- `VALID_TABLES` whitelist for any dynamic table name usage in pragma queries
- All user input handled via parameterized queries (`?` placeholders)

### 7.6 EULA & Terms
- 7-section Terms of Use presented on first launch
- Checkbox acceptance required before proceeding
- Acceptance timestamped in `terms_accepted` setting
- Covers: data custody, no warranty, limitation of liability, clinical responsibility, record retention

### 7.7 IPC Error Handling
- All IPC handlers wrapped in `safeHandle()` try/catch
- Errors logged to console with channel name
- Structured error objects returned to renderer (no stack trace leakage)

---

## 8. Auto-Update System

### Configuration
- **Provider:** GitHub Releases (private repo: lkongswa/pocketchart)
- **Auto-download:** Disabled (user must approve)
- **Auto-install on quit:** Enabled
- **Check timing:** 5 seconds after app ready (production only)

### Flow
1. App checks GitHub Releases for new version on startup
2. If update available, renderer shows toast notification (bottom-right)
3. User clicks "Download Update" to begin download
4. Progress bar shown during download
5. When complete, user can "Restart Now" or "Later"
6. If "Later", update installs automatically on next app close

### Renderer Component
`UpdateNotification.tsx` - Fixed-position toast with states: idle, available, downloading, ready

---

## 9. PDF Generation

Two PDF generators built with jsPDF:

### 9.1 Client Chart PDF (`buildClientChartPdf()`)
- Complete client record export
- Sections: demographics, insurance, goals, evaluations, SOAP notes
- Dynamic pagination with `checkPageBreak()` helper
- Text wrapping via `doc.splitTextToSize()`
- Signature indicators when present

### 9.2 Superbill PDF (`buildSuperbillPdf()`)
- Professional insurance billing document
- Practice header with NPI and Tax ID
- Patient and insurance information
- Diagnosis codes (primary + secondary)
- Services table with alternating row colors
- Provider attestation and signature line

### 9.3 Export Formats
- **Single PDF:** Client chart or superbill
- **Bulk ZIP:** All client charts as individual PDFs in a ZIP archive (via Archiver)
- **CSV:** Client demographics export with proper escaping

---

## 10. Electron Window Configuration

### Splash Window
- 340x400px, frameless, transparent, always-on-top
- Custom HTML with animated loading dots
- Auto-closes when main window is ready (800ms delay)

### Main Window
- 1400x900px default, 1024x700px minimum
- Preload script with context isolation
- Dev mode: loads localhost:3000 + opens DevTools
- Production: loads bundled dist/renderer/index.html
- Icon: build/icon.ico

---

## 11. Installer (NSIS)

- **Target:** Windows x64
- **Type:** NSIS (not one-click - allows install directory change)
- **Features:**
  - Desktop shortcut
  - Start menu shortcut
  - Custom uninstall dialog warning about data safety
  - Code signing disabled (for beta)
- **Custom Script:** `build/uninstaller.nsh` adds confirmation dialog reminding users their data is stored separately and recommending backup before uninstall

---

## 12. License System

### Architecture
- **Sales:** LemonSqueezy (planned integration)
- **Tiers:** Free and Pro (single binary, feature-gated)
- **Storage:** License key and tier stored in settings table

### Current Status
- License activation stores key and sets tier to 'pro'
- Deactivation reverts to 'free' and removes key
- **TODO:** LemonSqueezy API validation on activation

### Future Pro Features (Planned)
- Stripe integration for client billing
- Additional features TBD

---

## 13. Styling

- **Framework:** Tailwind CSS v4 with PostCSS
- **Theme:** CSS custom properties (`--color-primary`, `--color-bg`, `--color-text`, etc.)
- **Color Palette:** Teal primary (#0d9488), neutral grays
- **Layout:** Fixed 240px sidebar, fluid main content area
- **Components:** Custom card, button, and input classes via Tailwind
