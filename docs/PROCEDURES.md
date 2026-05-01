# PocketChart - Procedural Guide

**Version:** 1.0.0-beta.1
**Last Updated:** January 2026

This document covers the day-to-day development, build, release, and maintenance procedures for PocketChart.

---

## Table of Contents

1. [Development Environment Setup](#1-development-environment-setup)
2. [Daily Development Workflow](#2-daily-development-workflow)
3. [Building the Application](#3-building-the-application)
4. [Creating a Release](#4-creating-a-release)
5. [Pushing Updates to Users](#5-pushing-updates-to-users)
6. [Database Changes & Migrations](#6-database-changes--migrations)
7. [Adding a New Feature](#7-adding-a-new-feature)
8. [Adding a New IPC Channel](#8-adding-a-new-ipc-channel)
9. [Adding a New Page/Route](#9-adding-a-new-pageroute)
10. [Backup & Data Management](#10-backup--data-management)
11. [Troubleshooting Common Issues](#11-troubleshooting-common-issues)
12. [Git Workflow](#12-git-workflow)
13. [Testing Checklist](#13-testing-checklist)
14. [License & Monetization](#14-license--monetization)

---

## 1. Development Environment Setup

### Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| Node.js | 18+ (LTS recommended) | Runtime |
| npm | 9+ | Package manager |
| Git | 2.x | Version control |
| Windows 10/11 | x64 | Target platform |
| Visual Studio Build Tools | 2019+ | Native module compilation (better-sqlite3) |

### First-Time Setup

```bash
# 1. Clone the repository
git clone https://github.com/lkongswa/pocketchart.git
cd pocketchart

# 2. Install dependencies
npm install

# 3. Rebuild native modules for Electron
npm run rebuild

# 4. Start development servers
npm run dev
```

### What `npm run dev` Does

Runs two concurrent processes:
1. **Webpack Dev Server** (`dev:renderer`) - Serves React app at http://localhost:3000 with hot reload
2. **Electron** (`dev:electron`) - Waits for localhost:3000 to be available, then launches the Electron window in development mode

### Environment Modes

| Mode | Trigger | Behavior |
|------|---------|----------|
| Development | `NODE_ENV=development` | Loads localhost:3000, DevTools open, no update checks |
| Production | Default (no env var) | Loads bundled files, auto-update enabled |

---

## 2. Daily Development Workflow

```
1. Pull latest:          git pull origin main
2. Start dev:            npm run dev
3. Make changes          (hot reload for renderer, restart for main process)
4. Test manually         (verify in the running Electron app)
5. Commit:               git add <files> && git commit -m "description"
6. Push:                 git push origin main
```

### Important Notes

- **Renderer changes** (React components, CSS) hot-reload automatically via webpack dev server
- **Main process changes** (main.ts, database.ts, preload.ts) require restarting the Electron app
  - Stop the running `npm run dev` (Ctrl+C)
  - Run `npm run dev` again
- **Preload changes** also require restart since preload runs in main process context

---

## 3. Building the Application

### Build Commands

| Command | What It Does |
|---------|-------------|
| `npm run build:main` | Compiles main process TypeScript to `dist/main/` |
| `npm run build:renderer` | Bundles React app to `dist/renderer/` |
| `npm run build` | Runs both main + renderer builds |
| `npm run dist` | Full build + creates Windows installer in `release/` |
| `npm run dist:dir` | Full build + creates unpacked app directory (no installer) |

### Creating the Installer

```bash
# Full build and package
npm run dist
```

**Output:** `release/PocketChart Setup X.X.X.exe`

The version number comes from `package.json` → `"version": "1.0.0-beta.1"`

### If Build Fails with "Access Denied"

This happens when previous build artifacts are locked. Fix:

```bash
# Delete the previous unpacked build
rm -rf release/win-unpacked

# Then rebuild
npm run dist
```

---

## 4. Creating a Release

### Step-by-Step: Publishing a New Version

#### 4.1 Update the Version Number

Edit `package.json`:

```json
"version": "1.0.1"
```

Follow semantic versioning:
- **Patch** (1.0.0 → 1.0.1): Bug fixes
- **Minor** (1.0.0 → 1.1.0): New features, backwards compatible
- **Major** (1.0.0 → 2.0.0): Breaking changes

#### 4.2 Build the Installer

```bash
npm run dist
```

This creates:
- `release/PocketChart Setup 1.0.1.exe` - The installer
- `release/latest.yml` - Auto-update metadata file

#### 4.3 Commit and Tag

```bash
git add package.json package-lock.json
git commit -m "Bump version to 1.0.1"
git tag v1.0.1
git push origin main --tags
```

#### 4.4 Create a GitHub Release

```bash
# Using GitHub CLI (recommended)
gh release create v1.0.1 \
  "release/PocketChart Setup 1.0.1.exe" \
  "release/latest.yml" \
  --title "PocketChart v1.0.1" \
  --notes "Release notes here..."
```

**Or manually via GitHub web UI:**
1. Go to https://github.com/lkongswa/pocketchart/releases
2. Click "Draft a new release"
3. Choose tag: `v1.0.1`
4. Title: `PocketChart v1.0.1`
5. Write release notes
6. Attach files:
   - `release/PocketChart Setup 1.0.1.exe`
   - `release/latest.yml`
7. If it's a pre-release, check "Set as a pre-release"
8. Click "Publish release"

#### 4.5 Verify

- The `latest.yml` file tells electron-updater what the newest version is
- Existing users will see an update notification the next time they open the app
- Users can also manually check via Help page instructions

---

## 5. Pushing Updates to Users

### How Auto-Update Works

1. When a user opens PocketChart, the app checks GitHub Releases after 5 seconds
2. electron-updater compares the app's current version against `latest.yml`
3. If a newer version exists, the user sees a toast notification (bottom-right)
4. User clicks "Download Update" → progress bar shows download
5. When complete, user can "Restart Now" or "Later"
6. If "Later", the update installs automatically the next time the app closes

### Requirements for Auto-Update to Work

- The GitHub release must contain both the `.exe` installer AND `latest.yml`
- The `latest.yml` is auto-generated by electron-builder during `npm run dist`
- The GitHub repo must match the publish config in `package.json`:
  ```json
  "publish": [{
    "provider": "github",
    "owner": "lkongswa",
    "repo": "pocketchart",
    "private": true
  }]
  ```

### Testing Updates Locally

Auto-update does NOT work in development mode. To test:
1. Build an installer with version `1.0.0`: `npm run dist`
2. Install and run the app
3. Bump `package.json` to `1.0.1`
4. Build again: `npm run dist`
5. Create a GitHub release with `v1.0.1`
6. The installed `1.0.0` version should detect and offer the update

---

## 6. Database Changes & Migrations

### When You Need a Migration

Any time you need to:
- Add a new column to an existing table
- Add a new table (if not using `CREATE TABLE IF NOT EXISTS`)
- Modify default values or constraints
- Add new settings defaults

### How to Add a Migration

Edit `src/main/database.ts` → `runMigrations()` function:

```typescript
// Add to the migrations array:
{
  version: 6,  // Next sequential number
  description: 'Add therapy_type column to notes',
  up: () => {
    if (!columnExists('notes', 'therapy_type')) {
      db.exec("ALTER TABLE notes ADD COLUMN therapy_type TEXT DEFAULT ''");
    }
  },
},
```

### Migration Rules

1. **Always increment** the version number sequentially
2. **Always check** if the column/table already exists before altering (idempotency)
3. **Never modify** existing migrations - only add new ones
4. **Migrations run in a transaction** - if one fails, all rollback
5. **Test with a fresh database** AND with an existing database to verify both paths
6. The current schema version is stored in `settings.schema_version`

### Adding a New Table

For brand new tables, add the `CREATE TABLE IF NOT EXISTS` statement to the `createTables()` function. No migration needed since `IF NOT EXISTS` handles both fresh installs and upgrades. Only use a migration if you need to populate default data.

---

## 7. Adding a New Feature

### Standard Feature Checklist

1. **Database** (if needed)
   - Add table or columns via migration in `database.ts`
   - Add to `VALID_TABLES` set if it's a new table

2. **Main Process** (IPC handlers in `main.ts`)
   - Add `safeHandle()` calls for each operation (list, get, create, update, delete)
   - Follow existing patterns for error handling

3. **Preload Bridge** (`preload.ts`)
   - Add IPC invoke calls under the appropriate namespace
   - Keep the same naming convention: `namespace:method`

4. **Types** (`shared/types.ts`)
   - Add TypeScript interfaces for the new API methods
   - Update the `Window['api']` type declaration

5. **UI Components** (renderer)
   - Create page component in `src/renderer/pages/`
   - Create modal/form components in `src/renderer/components/`
   - Add route in `App.tsx`
   - Add sidebar nav item if needed

6. **Help Documentation**
   - Add a section to `HelpPage.tsx` with keywords for search

---

## 8. Adding a New IPC Channel

### Example: Adding a `templates:list` Channel

**Step 1: Main process handler** (`src/main/main.ts`)
```typescript
safeHandle('templates:list', async (_event, filters?: any) => {
  let query = 'SELECT * FROM templates WHERE deleted_at IS NULL';
  const params: any[] = [];
  // ... build query with filters
  return db.prepare(query).all(...params);
});
```

**Step 2: Preload bridge** (`src/main/preload.ts`)
```typescript
templates: {
  list: (filters?: any) => ipcRenderer.invoke('templates:list', filters),
},
```

**Step 3: Type declaration** (`src/shared/types.ts`)
```typescript
templates: {
  list: (filters?: any) => Promise<Template[]>;
};
```

**Step 4: Use in renderer**
```typescript
const templates = await window.api.templates.list({ category: 'PT' });
```

---

## 9. Adding a New Page/Route

### Steps

1. **Create the page component:**
   ```
   src/renderer/pages/NewFeaturePage.tsx
   ```

2. **Add the route** in `App.tsx` inside `<Routes>`:
   ```tsx
   <Route path="/new-feature" element={<NewFeaturePage />} />
   ```

3. **Add sidebar navigation** (if it should appear in the sidebar):
   ```typescript
   // In the navItems array:
   { to: '/new-feature', label: 'New Feature', icon: <IconName size={20} /> },
   ```

4. **Import the component** at the top of `App.tsx`:
   ```typescript
   import NewFeaturePage from './pages/NewFeaturePage';
   ```

---

## 10. Backup & Data Management

### Where User Data Lives

- **Default:** `%AppData%\Roaming\pocketchart\`
- **Custom:** User-configurable via Settings > Data Storage Location

### What's in the Data Folder

| File/Folder | Contents |
|-------------|----------|
| `pocketchart.db` | All client records, notes, evaluations, settings |
| `pocketchart.db-wal` | SQLite write-ahead log |
| `pocketchart.db-shm` | SQLite shared memory |
| `practice_logo.*` | Uploaded practice logo (png/jpg) |
| `documents/` | Uploaded client documents organized by client ID |
| `PIN_RECOVERY.txt` | Temporary PIN recovery file (auto-deletes) |

### Manual Backup

Users can back up from: **Settings > Backup & Export > Export Database**

This copies the `.db` file to a user-chosen location and timestamps `last_backup_date`.

### Backup Reminder

A banner appears on the Dashboard if 7+ days have passed since the last backup. The user can dismiss it (reappears after another 7 days).

### Data Survives Uninstall

The NSIS uninstaller shows a warning dialog reminding users that their data is stored separately and will NOT be deleted during uninstall. The data persists in the AppData folder.

### Moving Data to Another Computer

1. Back up the database (Settings > Export Database)
2. Install PocketChart on the new computer
3. Copy the backup `.db` file to the new computer's data folder
4. Or: copy the entire `%AppData%\Roaming\pocketchart\` folder

---

## 11. Troubleshooting Common Issues

### "Access is denied" during build

The previous build left locked files in `release/win-unpacked`.

```bash
rm -rf release/win-unpacked
npm run dist
```

### `npm run rebuild` fails

Ensure Visual Studio Build Tools are installed with the "Desktop development with C++" workload. better-sqlite3 requires native compilation.

### Main process changes not reflecting

Main process TypeScript isn't hot-reloaded. Stop and restart `npm run dev`.

### `git add -A` fails with "short read while indexing nul"

Windows NUL device file issue. Add specific files instead:

```bash
git add .gitignore package.json src/ build/
```

### Database locked errors

Make sure only one instance of PocketChart is running. SQLite WAL mode handles most concurrency, but two Electron instances writing simultaneously can cause issues.

### electron-updater not finding updates

Check:
1. GitHub release exists with matching `latest.yml`
2. `package.json` publish config matches your GitHub repo
3. The app is running in production mode (not `npm run dev`)
4. GitHub repo is accessible (if private, the token must be configured)

### Webpack build errors after adding new files

If you add new TypeScript files and get module resolution errors:
1. Check that the file extension is `.ts` or `.tsx`
2. Check `tsconfig.json` `include` covers the file path
3. Check webpack `resolve.extensions` includes the file type

---

## 12. Git Workflow

### Repository

- **Remote:** https://github.com/lkongswa/pocketchart (private)
- **Branch:** `main` (single-branch workflow for now)

### Commit Message Style

Use descriptive messages that explain what changed and why:

```
Add PIN recovery mechanism with file-based token verification

- Generate recovery token and write to PIN_RECOVERY.txt
- Token expires after 15 minutes
- Verify token hash before removing PIN
```

### .gitignore

The following are excluded from version control:
- `node_modules/` - Dependencies (reinstall via `npm install`)
- `dist/` - Build output (regenerate via `npm run build`)
- `release/` - Installer output (regenerate via `npm run dist`)
- `.env` / `.env.local` - Environment secrets
- OS/IDE files (`.DS_Store`, `.vscode/`, etc.)

### Tagging Releases

```bash
git tag v1.0.1
git push origin main --tags
```

Tags should match the version in `package.json` and the GitHub release name.

---

## 13. Testing Checklist

### Before Every Release

Run through these manual tests:

#### Core Functionality
- [ ] App launches without errors
- [ ] Splash screen displays, then main window loads
- [ ] Create a new client with all fields
- [ ] Edit an existing client
- [ ] Delete a client (verify soft delete - should show as discharged)
- [ ] Create a SOAP note with all fields
- [ ] Edit an existing note
- [ ] Sign a note (both pad and typed signature)
- [ ] Create an evaluation
- [ ] Create, edit, and delete goals
- [ ] Calendar: create, move, and delete appointments
- [ ] Calendar: switch between Month, Week, and Day views

#### Templates
- [ ] Note Bank: browse, search, favorite, create custom, use in note form
- [ ] Goals Bank: browse, search, create custom, use in goal form

#### Export & Billing
- [ ] Export single client PDF
- [ ] Export all charts as ZIP
- [ ] Export CSV
- [ ] Generate superbill for a client
- [ ] Generate bulk superbill for date range
- [ ] Export database backup

#### Security
- [ ] Set a PIN - verify it locks on app restart
- [ ] Verify PIN unlocks the app
- [ ] Auto-lock after timeout (set a short timeout to test)
- [ ] PIN recovery: request reset, find file, enter code
- [ ] Remove PIN - verify app no longer locks

#### Settings
- [ ] Edit practice information
- [ ] Upload and remove practice logo
- [ ] Change data storage location
- [ ] Change session defaults

#### First-Run Experience
- [ ] Delete `onboarding_complete` from settings (or use fresh DB)
- [ ] Verify EULA/Terms screen appears
- [ ] Accept terms, complete onboarding
- [ ] Verify terms_accepted timestamp saved

#### Help & Documentation
- [ ] Help page loads with all sections
- [ ] Search bar filters sections correctly
- [ ] All sections expand/collapse properly

#### Update System
- [ ] UpdateNotification component renders when update available
- [ ] Download progress bar works
- [ ] "Restart Now" triggers app restart
- [ ] "Later" dismisses notification

#### Installer
- [ ] Fresh install on clean machine
- [ ] Uninstall shows warning dialog
- [ ] Data folder preserved after uninstall
- [ ] Reinstall picks up existing data

---

## 14. License & Monetization

### Current Architecture

| Component | Platform | Purpose |
|-----------|----------|---------|
| App Sales | LemonSqueezy (planned) | Sell license keys for PocketChart |
| Client Billing | Stripe (planned, Pro) | Allow therapists to bill their clients |

### License Flow

1. User purchases license key from LemonSqueezy store
2. User enters key in PocketChart: Settings > License
3. App calls `license:activate` → stores key, sets `app_tier = 'pro'`
4. Pro features become available

### Current Status

- License key storage and tier switching is implemented
- **TODO:** LemonSqueezy API validation (currently stores key without server-side verification)
- **TODO:** Stripe integration for Pro client billing features
- **TODO:** Define which features are gated behind Pro tier

### License Settings Keys

| Key | Values | Purpose |
|-----|--------|---------|
| `app_tier` | 'free' / 'pro' | Current tier |
| `license_key` | string | Stored license key |
| `license_activated_at` | ISO date | When license was activated |

---

## Quick Reference: NPM Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `dev` | `npm run dev` | Start development (renderer + electron) |
| `build` | `npm run build` | Compile TypeScript + bundle renderer |
| `dist` | `npm run dist` | Build + create Windows installer |
| `dist:dir` | `npm run dist:dir` | Build + create unpacked directory |
| `rebuild` | `npm run rebuild` | Rebuild native modules for Electron |
| `start` | `npm start` | Launch built app (production mode) |

---

## Quick Reference: Key File Locations

| What | Where |
|------|-------|
| Main process entry | `src/main/main.ts` |
| Database schema | `src/main/database.ts` |
| IPC bridge | `src/main/preload.ts` |
| React entry | `src/renderer/index.tsx` |
| Root component | `src/renderer/App.tsx` |
| Shared types | `src/shared/types.ts` |
| Webpack config | `webpack.config.js` |
| TS config (renderer) | `tsconfig.json` |
| TS config (main) | `tsconfig.main.json` |
| Installer config | `package.json` → `"build"` |
| Uninstall script | `build/uninstaller.nsh` |
| App icon | `build/icon.ico` |
