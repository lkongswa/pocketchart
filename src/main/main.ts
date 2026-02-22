import { app, BrowserWindow, ipcMain, dialog, shell, safeStorage, powerMonitor } from 'electron';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import { initDatabase, getDatabase, closeDatabase, getDataPath, setDataPath, resetDataPath, getDefaultDataPath, isDatabaseEncrypted, databaseFileExists, migrateToEncrypted, decryptToPlaintext, runQuickCheck, runIntegrityCheck, validateBackupFile, getBackupClients, restoreFullDatabase, importSelectedClients, getCurrentDbSummary } from './database';
import { setupEncryption, unlockWithPassphrase, unlockWithRecoveryKey, changePassphrase, regenerateRecoveryKey, verifyPassphrase, keystoreExists, loadKeystore, clearKeystore, unlockFromExternalKeystore, replaceKeystoreForRestore } from './keystore';
import type { KeystoreData } from './keystore';
import { seedDemoData } from './seedDemoData';
import { jsPDF } from 'jspdf';
import { PDFDocument as PDFLibDocument } from 'pdf-lib';
import { v4 as uuidv4 } from 'uuid';
import archiver from 'archiver';
import AdmZip from 'adm-zip';
import { autoUpdater } from 'electron-updater';
import Stripe from 'stripe';
import { requiresReferral as checkDirectAccess, getAllRules as getDirectAccessRules } from '../shared/directAccessRules';
import { detectCloudStorage } from './cloudDetection';
import { generateCMS1500, assembleCMS1500Data, renderCMS1500Pages, generateAlignmentTestPage } from './cms1500Generator';
import type { CMS1500Options, CMS1500PrintMode } from './cms1500Generator';
import { parseCSVFile, autoDetectColumns as autoDetectCSVColumns, matchClients as matchCSVClients, prepareImportRows, executeImport as executeCSVImport } from './csvPaymentImport';
import type { CSVColumnMapping, CSVPaymentRow } from './csvPaymentImport';
import type { AppTier, NoteFormat, DischargeData, DischargeGoalStatus } from '../shared/types';
import { generateIntakePdf } from './intakeFormGenerator';
import { DEFAULT_INTAKE_TEMPLATES } from '../shared/intakeTemplates';
import { FaxRouter, matchFaxToClient, normalizeFaxNumber, type FaxProviderType } from './fax';
import { NOTE_FORMAT_SECTIONS, DISCHARGE_REASON_LABELS, DISCHARGE_GOAL_STATUS_LABELS, DISCHARGE_RECOMMENDATION_LABELS } from '../shared/types';
import { ClearinghouseRouter, type ClearinghouseProviderType } from './clearinghouse';
import { generate837P, assemble837PInput } from './edi837Generator';

// ── Secure Storage Helpers ──
// Uses Electron's safeStorage API which leverages OS credential storage:
// - Windows: Credential Manager (DPAPI)
// - macOS: Keychain
// - Linux: Secret Service API / libsecret

/**
 * Encrypts a string using Electron's safeStorage API
 * Returns base64-encoded encrypted data for storage in SQLite
 */
function encryptSecure(plaintext: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('Secure storage not available, falling back to obfuscation');
    // Basic obfuscation fallback (NOT secure, but better than plaintext)
    return Buffer.from(plaintext).toString('base64') + '.fallback';
  }
  const encrypted = safeStorage.encryptString(plaintext);
  return encrypted.toString('base64');
}

/**
 * Decrypts a string that was encrypted with encryptSecure()
 */
function decryptSecure(encryptedBase64: string): string {
  // Check for fallback encoding
  if (encryptedBase64.endsWith('.fallback')) {
    const base64Data = encryptedBase64.slice(0, -9);
    return Buffer.from(base64Data, 'base64').toString('utf-8');
  }
  if (!safeStorage.isEncryptionAvailable()) {
    throw new Error('Cannot decrypt: secure storage not available');
  }
  const encrypted = Buffer.from(encryptedBase64, 'base64');
  return safeStorage.decryptString(encrypted);
}

/**
 * Masks a secret string for display (e.g., API keys)
 * Shows first 7 chars and last 4 chars: sk_live_...1234
 */
function maskSecret(secret: string): string {
  if (!secret || secret.length < 16) return '••••••••';
  return `${secret.slice(0, 7)}...${secret.slice(-4)}`;
}

let mainWindow: BrowserWindow | null = null;
let splashWindow: BrowserWindow | null = null;

const isDev = process.env.NODE_ENV === 'development';
const FORCE_PRO = true; // Toggle to false when done workshopping Pro features

// ── Auto-Updater Configuration ──
autoUpdater.autoDownload = false;       // Don't download until user says yes
autoUpdater.autoInstallOnAppQuit = true; // Install on next restart after download

// ── IPC Error Wrapper ──
// Wraps every handler in try/catch so malformed args or DB errors
// return a structured error instead of crashing the main process.
function safeHandle(
  channel: string,
  handler: (event: Electron.IpcMainInvokeEvent, ...args: any[]) => any
): void {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await handler(event, ...args);
    } catch (err: any) {
      console.error(`[IPC Error] ${channel}:`, err);
      throw new Error(err?.message || 'An unexpected error occurred');
    }
  });
}

function createSplashWindow() {
  const iconPath = app.isPackaged
    ? path.join(path.dirname(app.getPath('exe')), 'icon.ico')
    : path.join(__dirname, '../../build/icon.ico');

  splashWindow = new BrowserWindow({
    width: 340,
    height: 400,
    frame: false,
    transparent: true,
    resizable: false,
    alwaysOnTop: true,
    icon: iconPath,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  const splashHtml = `
    <!DOCTYPE html>
    <html>
    <head>
      <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
          display: flex;
          align-items: center;
          justify-content: center;
          height: 100vh;
          background: transparent;
          -webkit-app-region: drag;
          user-select: none;
        }
        .splash {
          background: white;
          border-radius: 20px;
          padding: 48px 40px;
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 24px;
          box-shadow: 0 20px 60px rgba(0,0,0,0.15), 0 0 0 1px rgba(0,0,0,0.05);
        }
        .icon {
          width: 72px;
          height: 72px;
          border-radius: 18px;
          background: #0d9488;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .icon svg {
          width: 36px;
          height: 36px;
          color: white;
          fill: none;
          stroke: currentColor;
          stroke-width: 2;
          stroke-linecap: round;
          stroke-linejoin: round;
        }
        .title {
          font-size: 22px;
          font-weight: 700;
          color: #1a1a2e;
          letter-spacing: -0.3px;
        }
        .subtitle {
          font-size: 13px;
          color: #6b7280;
          margin-top: -16px;
        }
        .loader {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        .loader-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          background: #0d9488;
          animation: pulse 1.4s ease-in-out infinite;
        }
        .loader-dot:nth-child(2) { animation-delay: 0.2s; }
        .loader-dot:nth-child(3) { animation-delay: 0.4s; }
        @keyframes pulse {
          0%, 80%, 100% { opacity: 0.3; transform: scale(0.8); }
          40% { opacity: 1; transform: scale(1); }
        }
        .status {
          font-size: 12px;
          color: #9ca3af;
        }
      </style>
    </head>
    <body>
      <div class="splash">
        <div class="icon">
          <svg viewBox="0 0 24 24">
            <path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2"/>
            <rect x="9" y="3" width="6" height="4" rx="2"/>
            <path d="M9 14l2 2 4-4"/>
          </svg>
        </div>
        <div class="title">PocketChart</div>
        <div class="subtitle">Therapy Notes</div>
        <div class="loader">
          <div class="loader-dot"></div>
          <div class="loader-dot"></div>
          <div class="loader-dot"></div>
        </div>
        <div class="status">Loading your practice data...</div>
      </div>
    </body>
    </html>
  `;

  splashWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(splashHtml)}`);
  splashWindow.center();

  splashWindow.on('closed', () => {
    splashWindow = null;
  });
}

function createWindow() {
  const iconPath = app.isPackaged
    ? path.join(path.dirname(app.getPath('exe')), 'icon.ico')
    : path.join(__dirname, '../../build/icon.ico');

  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 1024,
    minHeight: 700,
    icon: iconPath,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  if (isDev) {
    mainWindow.loadURL('http://localhost:3000');
    mainWindow.webContents.openDevTools();
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  mainWindow.once('ready-to-show', () => {
    // Brief delay so the splash feels intentional, not flickery
    setTimeout(() => {
      if (splashWindow && !splashWindow.isDestroyed()) {
        splashWindow.close();
      }
      mainWindow?.show();
    }, 800);
  });

  // Intercept all navigation attempts and open external URLs in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // Open external URLs in the default system browser
    if (url.startsWith('http://') || url.startsWith('https://')) {
      shell.openExternal(url);
      return { action: 'deny' }; // Prevent Electron from opening a new window
    }
    return { action: 'allow' };
  });

  // Also handle clicks on links with target="_blank" or navigation away from app
  mainWindow.webContents.on('will-navigate', (event, url) => {
    // If navigating away from our app, open in external browser instead
    const appUrl = isDev ? 'http://localhost:3000' : 'file://';
    if (!url.startsWith(appUrl)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(() => {
  createSplashWindow();

  // Phase 1: Register encryption IPC handlers BEFORE the DB is open.
  // These allow the renderer to check encryption status and provide the passphrase.
  registerEncryptionIpcHandlers();

  // The main window loads and the renderer determines what screen to show:
  // - First run (no DB): onboarding with passphrase setup
  // - Existing encrypted DB: passphrase entry screen
  // - Existing unencrypted DB: migration screen
  // Once the passphrase is provided via IPC, completeDbStartup() is called
  // which inits the DB and registers all data IPC handlers.
  createWindow();

  // Check for updates after a short delay (don't block startup)
  if (!isDev) {
    setTimeout(() => {
      autoUpdater.checkForUpdates().catch((err) => {
        console.log('Auto-update check failed (offline or no releases):', err?.message);
      });
    }, 5000);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });

  // Lock the app when system suspends (laptop lid closed) or screen locks
  powerMonitor.on('suspend', () => {
    mainWindow?.webContents.send('system:lock');
  });
  powerMonitor.on('lock-screen', () => {
    mainWindow?.webContents.send('system:lock');
  });
});

// ── Encryption IPC Handlers (registered before DB is open) ──

let dbStartupComplete = false;

/**
 * Called after the renderer provides the correct passphrase.
 * Registers all data IPC handlers and signals the renderer that the DB is ready.
 */
function completeDbStartup() {
  if (dbStartupComplete) return; // prevent double-registration
  dbStartupComplete = true;
  registerIpcHandlers();
  mainWindow?.webContents.send('db:ready');
}

function registerEncryptionIpcHandlers() {
  // Determine the current encryption state for the renderer.
  // V2 LAUNCH: Encryption UI is bypassed. The DB always opens as plaintext.
  // If we find an encrypted DB from a previous session, auto-decrypt it first.
  // All encryption backend code remains in place for future re-enablement.
  ipcMain.handle('encryption:getStatus', () => {
    const dbExists = databaseFileExists();
    const hasKeystore = keystoreExists();
    const isEncrypted = dbExists ? isDatabaseEncrypted() : false;

    console.log('[encryption:getStatus] V2 bypass mode', { dbExists, hasKeystore, isEncrypted });

    if (!dbExists) {
      // Fresh install — needs onboarding (practice info + PIN, no passphrase)
      // Clean up any orphaned keystore
      if (hasKeystore) {
        try { clearKeystore(); } catch {}
      }
      return { needsSetup: true, needsPassphrase: false, needsMigration: false };
    }

    // DB exists — check if it's encrypted
    // V2: Encryption was never released to users, so an encrypted DB is only from dev/testing.
    // Delete it and start fresh rather than attempting complex decryption.
    if (isEncrypted) {
      console.log('[encryption:getStatus] Found encrypted DB — deleting for V2 plaintext mode (dev data only)...');
      try {
        const dbDir = getDataPath();
        const dbFile = require('path').join(dbDir, 'pocketchart.db');
        for (const suffix of ['', '-wal', '-shm', '.decrypting', '.encrypting']) {
          const f = dbFile + suffix;
          if (require('fs').existsSync(f)) {
            try { require('fs').unlinkSync(f); } catch {}
          }
        }
        if (hasKeystore) {
          try { clearKeystore(); } catch {}
        }
        console.log('[encryption:getStatus] Encrypted DB removed. Treating as fresh install.');
      } catch (err: any) {
        console.error('[encryption:getStatus] Failed to remove encrypted DB:', err);
      }
      return { needsSetup: true, needsPassphrase: false, needsMigration: false };
    }

    // DB exists and is plaintext — just open it and complete startup
    try {
      initDatabase(); // No key = plaintext
      completeDbStartup();
      // Clean up any orphaned keystore
      if (hasKeystore) {
        try { clearKeystore(); } catch {}
      }
    } catch (err: any) {
      console.error('[encryption:getStatus] Failed to open plaintext DB:', err);
    }
    return { needsSetup: false, needsPassphrase: false, needsMigration: false };
  });

  // First-time setup: create DB.
  // V2 BYPASS: Create a plaintext DB (no encryption). The passphrase parameter
  // is accepted but ignored — the handler signature stays the same for compatibility.
  // Also exposed as encryption:setupPlaintext for the V2 onboarding flow.
  ipcMain.handle('encryption:setup', (_event, _passphrase: string) => {
    if (!dbStartupComplete) {
      initDatabase(); // No key = plaintext
      completeDbStartup();
    }
    return { success: true, recoveryKey: '' };
  });

  // V2: Plaintext DB setup (no passphrase needed at all)
  // Idempotent — safe to call multiple times (e.g., practice step then PIN step)
  ipcMain.handle('encryption:setupPlaintext', () => {
    if (!dbStartupComplete) {
      initDatabase(); // No key = plaintext
      completeDbStartup();
    }
    return { success: true };
  });

  // Unlock existing encrypted DB with passphrase.
  // V2 BYPASS: If the DB is encrypted, decrypt it to plaintext permanently,
  // clear the keystore, and open as plaintext. This is a one-time migration.
  ipcMain.handle('encryption:unlock', (_event, passphrase: string) => {
    try {
      // V2: This handler should rarely be called since encrypted DBs are auto-deleted.
      // Kept for safety — unlocks with passphrase, opens as plaintext.
      const masterKeyHex = unlockWithPassphrase(passphrase);
      initDatabase(masterKeyHex);
      completeDbStartup();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Incorrect passphrase' };
    }
  });

  // Unlock with recovery key (forgot passphrase flow)
  // V2 BYPASS: Same as above — decrypt to plaintext permanently.
  ipcMain.handle('encryption:unlockWithRecovery', (_event, recoveryKey: string) => {
    try {
      // V2: Rarely called since encrypted DBs are auto-deleted on startup.
      const masterKeyHex = unlockWithRecoveryKey(recoveryKey);
      initDatabase(masterKeyHex);
      completeDbStartup();
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Incorrect recovery key' };
    }
  });

  // Change passphrase (re-wraps master key, no DB change)
  ipcMain.handle('encryption:changePassphrase', (_event, currentPassphrase: string, newPassphrase: string) => {
    try {
      changePassphrase(currentPassphrase, newPassphrase);
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // Generate new recovery key (invalidates old one)
  ipcMain.handle('encryption:regenerateRecoveryKey', (_event, passphrase: string) => {
    try {
      const newRecoveryKey = regenerateRecoveryKey(passphrase);
      return { success: true, recoveryKey: newRecoveryKey };
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  });

  // Verify passphrase correctness (for Settings page)
  ipcMain.handle('encryption:verifyPassphrase', (_event, passphrase: string) => {
    return verifyPassphrase(passphrase);
  });

  // Migrate existing unencrypted DB to encrypted
  ipcMain.handle('encryption:migrateAndSetup', (_event, passphrase: string) => {
    try {
      const { masterKeyHex, recoveryKey } = setupEncryption(passphrase);
      migrateToEncrypted(masterKeyHex);
      initDatabase(masterKeyHex);
      completeDbStartup();
      return { success: true, recoveryKey };
    } catch (err: any) {
      return { success: false, error: err.message || 'Migration failed' };
    }
  });

  // ── Restore IPC Handlers (available before DB is open) ──

  ipcMain.handle('restore:pickFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Select PocketChart Backup',
      filters: [
        { name: 'PocketChart Backup', extensions: ['pcbackup', 'db'] },
      ],
      properties: ['openFile'],
    });
    if (canceled || !filePaths?.[0]) return null;
    return filePaths[0];
  });

  ipcMain.handle('restore:validateAndSummarize', (_event, filePath: string, passphrase: string) => {
    let tempDir: string | null = null;
    try {
      const extracted = extractBackupArchive(filePath);
      tempDir = extracted.tempDir;

      // Derive master key
      let masterKeyHex: string;
      if (extracted.keystoreData) {
        masterKeyHex = unlockFromExternalKeystore(extracted.keystoreData, passphrase);
      } else {
        // Legacy .db — try current keystore if it exists
        if (keystoreExists()) {
          masterKeyHex = unlockWithPassphrase(passphrase);
        } else {
          return { error: 'This backup has no bundled keystore and no local keystore exists. Cannot decrypt.' };
        }
      }

      const stats = fs.statSync(filePath);
      const summary = validateBackupFile(extracted.dbPath, masterKeyHex);

      if (!summary.validationPassed) {
        return { error: 'Backup file failed validation — it may be corrupt or not a PocketChart database.' };
      }

      if (!summary.isCompatible) {
        return { error: `This backup was created with a newer version of PocketChart (schema v${summary.schemaVersion}). Please update PocketChart first.` };
      }

      return {
        summary: {
          ...summary,
          filePath,
          fileSize: stats.size,
          fileModified: stats.mtime.toISOString(),
          isEncrypted: true,
          currentSchemaVersion: 40,
        },
      };
    } catch (err: any) {
      return { error: err.message || 'Failed to validate backup' };
    } finally {
      cleanupTempDir(tempDir);
    }
  });

  ipcMain.handle('restore:execute', (_event, filePath: string, passphrase: string) => {
    let tempDir: string | null = null;
    try {
      const extracted = extractBackupArchive(filePath);
      tempDir = extracted.tempDir;

      // Derive master key
      let masterKeyHex: string;
      if (extracted.keystoreData) {
        masterKeyHex = unlockFromExternalKeystore(extracted.keystoreData, passphrase);
      } else {
        if (keystoreExists()) {
          masterKeyHex = unlockWithPassphrase(passphrase);
        } else {
          return { success: false, error: 'Cannot decrypt backup — no keystore available.' };
        }
      }

      // Auto-backup current DB if it exists
      const currentDbPath = path.join(getDataPath(), 'pocketchart.db');
      if (fs.existsSync(currentDbPath)) {
        const backupName = `pocketchart_pre_restore_backup_${Date.now()}.db`;
        const backupPath = path.join(getDataPath(), backupName);
        try {
          fs.copyFileSync(currentDbPath, backupPath);
        } catch {}
      }

      // Close existing DB if open
      try { closeDatabase(); } catch {}

      // Copy backup over current
      restoreFullDatabase(extracted.dbPath);

      // Replace keystore — re-wrap the master key with the passphrase and a new recovery key
      const recoveryKey = replaceKeystoreForRestore(masterKeyHex, passphrase);

      // Open restored DB and run migrations
      initDatabase(masterKeyHex);
      completeDbStartup();

      return { success: true, recoveryKey };
    } catch (err: any) {
      return { success: false, error: err.message || 'Restore failed' };
    } finally {
      cleanupTempDir(tempDir);
    }
  });
}

// ── Auto-Updater Events ──
// Forward update events to the renderer so we can show UI notifications
autoUpdater.on('update-available', (info) => {
  console.log('Update available:', info.version);
  mainWindow?.webContents.send('update:available', {
    version: info.version,
    releaseNotes: info.releaseNotes,
    releaseDate: info.releaseDate,
  });
});

autoUpdater.on('update-not-available', () => {
  console.log('App is up to date');
  mainWindow?.webContents.send('update:not-available');
});

autoUpdater.on('download-progress', (progress) => {
  mainWindow?.webContents.send('update:download-progress', {
    percent: Math.round(progress.percent),
    transferred: progress.transferred,
    total: progress.total,
  });
});

autoUpdater.on('update-downloaded', (info) => {
  console.log('Update downloaded:', info.version);
  mainWindow?.webContents.send('update:downloaded', {
    version: info.version,
  });
});

autoUpdater.on('error', (err) => {
  console.error('Auto-updater error:', err?.message);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    closeDatabase();
    app.quit();
  }
});

// ── Session & Audit ──
const sessionId = crypto.randomUUID();
const deviceIdentifier = os.hostname();

// ── Backup Archive Helper ──

/**
 * Extract a backup file and return the database path + optional keystore data.
 * Supports both .pcbackup (zip) and legacy .db formats.
 *
 * @returns { dbPath, keystoreData, tempDir } — tempDir should be cleaned up by the caller
 */
function extractBackupArchive(filePath: string): {
  dbPath: string;
  keystoreData: KeystoreData | null;
  tempDir: string | null;
} {
  // Try to detect zip format by reading first bytes
  let isZip = false;
  try {
    const fd = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(4);
    fs.readSync(fd, buf, 0, 4, 0);
    fs.closeSync(fd);
    // ZIP magic number: PK\x03\x04
    isZip = buf[0] === 0x50 && buf[1] === 0x4B && buf[2] === 0x03 && buf[3] === 0x04;
  } catch {
    isZip = false;
  }

  if (isZip) {
    const zip = new AdmZip(filePath);
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'pocketchart-restore-'));

    // Extract DB file
    const dbEntry = zip.getEntry('pocketchart.db');
    if (!dbEntry) {
      throw new Error('Backup archive does not contain pocketchart.db');
    }
    zip.extractEntryTo(dbEntry, tempDir, false, true);
    const extractedDbPath = path.join(tempDir, 'pocketchart.db');

    // Extract keystore (optional — might not exist in older backups)
    let keystoreData: KeystoreData | null = null;
    const keystoreEntry = zip.getEntry('keystore.json');
    if (keystoreEntry) {
      try {
        const jsonStr = keystoreEntry.getData().toString('utf-8');
        keystoreData = JSON.parse(jsonStr) as KeystoreData;
      } catch {
        keystoreData = null;
      }
    }

    return { dbPath: extractedDbPath, keystoreData, tempDir };
  }

  // Legacy .db file — no keystore bundled
  return { dbPath: filePath, keystoreData: null, tempDir: null };
}

/**
 * Clean up a temporary directory created by extractBackupArchive.
 */
function cleanupTempDir(tempDir: string | null): void {
  if (!tempDir) return;
  try {
    fs.rmSync(tempDir, { recursive: true, force: true });
  } catch {}
}

function registerIpcHandlers() {
  const db = getDatabase();

  // ── Fax Router (multi-provider abstraction) ──
  const faxRouter = new FaxRouter();
  try {
    faxRouter.initialize(db, decryptSecure, encryptSecure);
  } catch (err) {
    console.error('[FaxRouter] Failed to initialize (non-fatal):', err);
  }

  // ── Clearinghouse Router (multi-provider abstraction) ──
  const clearinghouseRouter = new ClearinghouseRouter();
  try {
    clearinghouseRouter.initialize(db, decryptSecure, encryptSecure);
  } catch (err) {
    console.error('[ClearinghouseRouter] Failed to initialize (non-fatal):', err);
  }

  // ── Audit Log Helper ──
  function auditLog(params: {
    actionType: string;
    entityType: string;
    entityId?: number | null;
    clientId?: number | null;
    detail?: Record<string, any> | null;
    contentHash?: string | null;
  }) {
    try {
      // Build hash chain: each entry includes a hash linking to the previous entry
      const previousEntry = db.prepare(
        'SELECT id, entry_hash FROM audit_log WHERE entry_hash IS NOT NULL ORDER BY id DESC LIMIT 1'
      ).get() as { id: number; entry_hash: string } | undefined;
      const previousHash = previousEntry?.entry_hash || 'GENESIS';
      const now = new Date().toISOString();
      const entryContent = JSON.stringify({
        actionType: params.actionType,
        entityType: params.entityType,
        entityId: params.entityId ?? null,
        clientId: params.clientId ?? null,
        timestamp: now,
      });
      const entryHash = crypto.createHash('sha256')
        .update(previousHash + entryContent)
        .digest('hex');

      db.prepare(`
        INSERT INTO audit_log (timestamp, user_id, user_role, session_id, action_type,
          entity_type, entity_id, client_id, detail, content_hash, device_identifier, entry_hash)
        VALUES (datetime('now'), 1, 'owner', ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        sessionId,
        params.actionType,
        params.entityType,
        params.entityId ?? null,
        params.clientId ?? null,
        params.detail ? JSON.stringify(params.detail) : null,
        params.contentHash ?? null,
        deviceIdentifier,
        entryHash
      );
    } catch (err) {
      console.error('Audit log write failed:', err);
    }
  }

  /** Compute SHA-256 of canonical JSON for content integrity */
  function computeContentHash(content: Record<string, any>): string {
    const canonical = JSON.stringify(content, Object.keys(content).sort());
    return crypto.createHash('sha256').update(canonical).digest('hex');
  }

  // ── App Info ──
  safeHandle('app:getVersion', () => {
    return app.getVersion();
  });

  // ── Auto-Update IPC ──
  safeHandle('update:check', async () => {
    if (isDev) return { updateAvailable: false };
    try {
      const result = await autoUpdater.checkForUpdates();
      return { updateAvailable: !!result?.updateInfo };
    } catch {
      return { updateAvailable: false };
    }
  });

  safeHandle('update:download', async () => {
    // MANDATORY backup before downloading update — blocks download if backup fails
    const backupDir = getDataPath();
    const srcDb = path.join(backupDir, 'pocketchart.db');
    const backupName = `pocketchart_pre_update_${new Date().toISOString().slice(0, 10)}.db`;
    const backupDest = path.join(backupDir, backupName);

    try {
      if (!fs.existsSync(srcDb)) {
        throw new Error('Database file not found');
      }
      fs.copyFileSync(srcDb, backupDest);
      // Verify the backup was actually written
      const srcStat = fs.statSync(srcDb);
      const destStat = fs.statSync(backupDest);
      if (destStat.size !== srcStat.size) {
        throw new Error('Backup file size mismatch — copy may be corrupted');
      }
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_backup_date', ?)").run(new Date().toISOString());
      mainWindow?.webContents.send('update:backup-complete', { backupPath: backupDest });
      console.log('Pre-update backup verified:', backupDest, `(${destStat.size} bytes)`);
    } catch (backupErr: any) {
      console.error('Pre-update backup FAILED — blocking update download:', backupErr);
      mainWindow?.webContents.send('update:backup-failed');
      throw new Error(`Backup required before update. Backup failed: ${backupErr.message}`);
    }

    await autoUpdater.downloadUpdate();
    return true;
  });

  safeHandle('update:install', () => {
    autoUpdater.quitAndInstall(false, true);
  });

  // ── Practice ──
  safeHandle('practice:get', () => {
    return db.prepare('SELECT * FROM practice WHERE id = 1').get() || null;
  });

  safeHandle('practice:save', (_event, data) => {
    const existing = db.prepare('SELECT * FROM practice WHERE id = 1').get() as any;
    if (existing) {
      // Merge: only overwrite fields that are actually provided in `data`
      db.prepare(`
        UPDATE practice SET name=?, address=?, city=?, state=?, zip=?, phone=?, npi=?, tax_id=?,
        license_number=?, license_state=?, discipline=?, taxonomy_code=? WHERE id=1
      `).run(
        data.name ?? existing.name ?? '', data.address ?? existing.address ?? '',
        data.city ?? existing.city ?? '', data.state ?? existing.state ?? '',
        data.zip ?? existing.zip ?? '', data.phone ?? existing.phone ?? '',
        data.npi ?? existing.npi ?? '', data.tax_id ?? existing.tax_id ?? '',
        data.license_number ?? existing.license_number ?? '', data.license_state ?? existing.license_state ?? '',
        data.discipline ?? existing.discipline ?? 'PT', data.taxonomy_code ?? existing.taxonomy_code ?? ''
      );
    } else {
      db.prepare(`
        INSERT INTO practice (id, name, address, city, state, zip, phone, npi, tax_id,
        license_number, license_state, discipline, taxonomy_code)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.name || '', data.address || '', data.city || '', data.state || '',
        data.zip || '', data.phone || '', data.npi || '', data.tax_id || '',
        data.license_number || '', data.license_state || '', data.discipline || 'PT',
        data.taxonomy_code || ''
      );
    }
    return db.prepare('SELECT * FROM practice WHERE id = 1').get();
  });

  // ── Clients ──
  safeHandle('clients:list', (_event, filters?: { status?: string; discipline?: string; search?: string }) => {
    let query = 'SELECT * FROM clients WHERE deleted_at IS NULL';
    const params: any[] = [];

    if (filters?.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }
    if (filters?.discipline) {
      query += ' AND discipline = ?';
      params.push(filters.discipline);
    }
    if (filters?.search) {
      query += ' AND (first_name LIKE ? OR last_name LIKE ?)';
      params.push(`%${filters.search}%`, `%${filters.search}%`);
    }

    query += ' ORDER BY last_name, first_name';
    return db.prepare(query).all(...params);
  });

  safeHandle('clients:get', (_event, id: number) => {
    return db.prepare('SELECT * FROM clients WHERE id = ? AND deleted_at IS NULL').get(id);
  });

  safeHandle('clients:create', (_event, data) => {
    const result = db.prepare(`
      INSERT INTO clients (first_name, last_name, dob, phone, email, address, city, state, zip, gender,
        primary_dx_code, primary_dx_description, secondary_dx, default_cpt_code,
        insurance_payer, insurance_member_id, insurance_group, insurance_payer_id,
        subscriber_relationship, subscriber_first_name, subscriber_last_name, subscriber_dob,
        referring_physician, referring_npi, referring_physician_qualifier,
        referring_fax, referring_physician_id, referral_source,
        onset_date, onset_qualifier, employment_related, auto_accident, auto_accident_state,
        other_accident, claim_accept_assignment, patient_signature_source, insured_signature_source,
        prior_auth_number, additional_claim_info, service_facility_name, service_facility_npi,
        status, discipline)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.first_name, data.last_name, data.dob, data.phone, data.email, data.address,
      data.city || '', data.state || '', data.zip || '', data.gender || '',
      data.primary_dx_code, data.primary_dx_description, data.secondary_dx || '[]',
      data.default_cpt_code, data.insurance_payer, data.insurance_member_id,
      data.insurance_group, data.insurance_payer_id || '',
      data.subscriber_relationship || '18', data.subscriber_first_name || '',
      data.subscriber_last_name || '', data.subscriber_dob || '',
      data.referring_physician, data.referring_npi,
      data.referring_physician_qualifier || 'DN',
      data.referring_fax || '', data.referring_physician_id || null,
      data.referral_source || '',
      data.onset_date || '', data.onset_qualifier || '431',
      data.employment_related || 'N', data.auto_accident || 'N', data.auto_accident_state || '',
      data.other_accident || 'N', data.claim_accept_assignment || 'Y',
      data.patient_signature_source || 'SOF', data.insured_signature_source || 'SOF',
      data.prior_auth_number || '', data.additional_claim_info || '',
      data.service_facility_name || '', data.service_facility_npi || '',
      data.status || 'active', data.discipline
    );
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(result.lastInsertRowid) as any;
    auditLog({ actionType: 'client_created', entityType: 'client', entityId: client.id, clientId: client.id });
    return client;
  });

  safeHandle('clients:update', (_event, id: number, data) => {
    // Track which fields changed for audit trail
    const before = db.prepare('SELECT * FROM clients WHERE id = ?').get(id) as any;
    const auditKeys = ['first_name','last_name','dob','phone','email','address','city','state','zip','gender',
      'primary_dx_code','primary_dx_description','default_cpt_code','insurance_payer','insurance_member_id',
      'insurance_group','insurance_payer_id','subscriber_relationship','subscriber_first_name','subscriber_last_name',
      'subscriber_dob','referring_physician','referring_npi','referring_physician_qualifier','referral_source',
      'onset_date','onset_qualifier','employment_related','auto_accident','auto_accident_state','other_accident',
      'claim_accept_assignment','patient_signature_source','insured_signature_source','prior_auth_number',
      'additional_claim_info','service_facility_name','service_facility_npi','status','discipline'];
    const changedFields: string[] = [];
    if (before) {
      for (const key of auditKeys) {
        if (before[key] !== data[key]) changedFields.push(key);
      }
    }

    db.prepare(`
      UPDATE clients SET first_name=?, last_name=?, dob=?, phone=?, email=?, address=?,
        city=?, state=?, zip=?, gender=?,
        primary_dx_code=?, primary_dx_description=?, secondary_dx=?, default_cpt_code=?,
        insurance_payer=?, insurance_member_id=?, insurance_group=?, insurance_payer_id=?,
        subscriber_relationship=?, subscriber_first_name=?, subscriber_last_name=?, subscriber_dob=?,
        referring_physician=?, referring_npi=?, referring_physician_qualifier=?,
        referring_fax=?, referring_physician_id=?, referral_source=?,
        onset_date=?, onset_qualifier=?, employment_related=?, auto_accident=?, auto_accident_state=?,
        other_accident=?, claim_accept_assignment=?, patient_signature_source=?, insured_signature_source=?,
        prior_auth_number=?, additional_claim_info=?, service_facility_name=?, service_facility_npi=?,
        status=?, discipline=?,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND deleted_at IS NULL
    `).run(
      data.first_name, data.last_name, data.dob, data.phone, data.email, data.address,
      data.city || '', data.state || '', data.zip || '', data.gender || '',
      data.primary_dx_code, data.primary_dx_description, data.secondary_dx || '[]',
      data.default_cpt_code, data.insurance_payer, data.insurance_member_id,
      data.insurance_group, data.insurance_payer_id || '',
      data.subscriber_relationship || '18', data.subscriber_first_name || '',
      data.subscriber_last_name || '', data.subscriber_dob || '',
      data.referring_physician, data.referring_npi,
      data.referring_physician_qualifier || 'DN',
      data.referring_fax || '', data.referring_physician_id || null,
      data.referral_source || '',
      data.onset_date || '', data.onset_qualifier || '431',
      data.employment_related || 'N', data.auto_accident || 'N', data.auto_accident_state || '',
      data.other_accident || 'N', data.claim_accept_assignment || 'Y',
      data.patient_signature_source || 'SOF', data.insured_signature_source || 'SOF',
      data.prior_auth_number || '', data.additional_claim_info || '',
      data.service_facility_name || '', data.service_facility_npi || '',
      data.status, data.discipline, id
    );

    if (changedFields.length > 0) {
      auditLog({ actionType: 'client_modified', entityType: 'client', entityId: id, clientId: id, detail: { fields_changed: changedFields } });
    }

    // ── Audit: specific event when diagnosis changes (critical for clinical audit trail) ──
    if (before && before.primary_dx_code !== data.primary_dx_code) {
      auditLog({ actionType: 'diagnosis_changed', entityType: 'client', entityId: id, clientId: id,
        detail: { old_code: before.primary_dx_code || '', old_description: before.primary_dx_description || '',
                  new_code: data.primary_dx_code || '', new_description: data.primary_dx_description || '' } });
    }

    return db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
  });

  // Soft delete: sets deleted_at timestamp instead of hard deleting
  safeHandle('clients:delete', (_event, id: number) => {
    const signedNotes = (db.prepare(
      "SELECT COUNT(*) as count FROM notes WHERE client_id = ? AND signed_at IS NOT NULL AND deleted_at IS NULL"
    ).get(id) as any)?.count || 0;
    const signedEvals = (db.prepare(
      "SELECT COUNT(*) as count FROM evaluations WHERE client_id = ? AND signed_at IS NOT NULL AND deleted_at IS NULL"
    ).get(id) as any)?.count || 0;
    db.prepare(
      "UPDATE clients SET status = 'discharged', deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL"
    ).run(id);
    auditLog({ actionType: 'client_archived', entityType: 'client', entityId: id, clientId: id, detail: { signedNotes, signedEvals } });
    return true;
  });

  safeHandle('clients:canRemove', (_event, id: number) => {
    const notes = (db.prepare(
      "SELECT COUNT(*) as count FROM notes WHERE client_id = ? AND deleted_at IS NULL"
    ).get(id) as any)?.count || 0;
    const evals = (db.prepare(
      "SELECT COUNT(*) as count FROM evaluations WHERE client_id = ? AND deleted_at IS NULL"
    ).get(id) as any)?.count || 0;
    const appts = (db.prepare(
      "SELECT COUNT(*) as count FROM appointments WHERE client_id = ? AND deleted_at IS NULL"
    ).get(id) as any)?.count || 0;
    const goals = (db.prepare(
      "SELECT COUNT(*) as count FROM goals WHERE client_id = ? AND deleted_at IS NULL"
    ).get(id) as any)?.count || 0;
    const hasClinicalData = notes + evals + appts + goals > 0;
    return { canRemove: !hasClinicalData, notes, evals, appts, goals };
  });

  safeHandle('clients:remove', (_event, id: number) => {
    // Safety check: only allow removal if no clinical data
    const notes = (db.prepare(
      "SELECT COUNT(*) as count FROM notes WHERE client_id = ? AND deleted_at IS NULL"
    ).get(id) as any)?.count || 0;
    const evals = (db.prepare(
      "SELECT COUNT(*) as count FROM evaluations WHERE client_id = ? AND deleted_at IS NULL"
    ).get(id) as any)?.count || 0;
    const appts = (db.prepare(
      "SELECT COUNT(*) as count FROM appointments WHERE client_id = ? AND deleted_at IS NULL"
    ).get(id) as any)?.count || 0;
    const goals = (db.prepare(
      "SELECT COUNT(*) as count FROM goals WHERE client_id = ? AND deleted_at IS NULL"
    ).get(id) as any)?.count || 0;

    if (notes + evals + appts + goals > 0) {
      throw new Error('Cannot remove a client with clinical records. Use discharge instead.');
    }

    const removeOp = db.transaction(() => {
      // Soft-delete the client
      db.prepare(
        "UPDATE clients SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL"
      ).run(id);

      // Revert any linked waitlist entry back to 'waiting'
      db.prepare(
        "UPDATE waitlist SET status = 'waiting', converted_client_id = NULL, updated_at = CURRENT_TIMESTAMP WHERE converted_client_id = ? AND deleted_at IS NULL"
      ).run(id);
    });
    removeOp();

    auditLog({ actionType: 'client_removed', entityType: 'client', entityId: id, clientId: id, detail: { reason: 'empty_chart_removal' } });
    return true;
  });

  // ── Goals ──
  safeHandle('goals:listByClient', (_event, clientId: number) => {
    return db.prepare(
      'SELECT * FROM goals WHERE client_id = ? AND deleted_at IS NULL ORDER BY created_at DESC'
    ).all(clientId);
  });

  safeHandle('goals:create', (_event, data) => {
    const result = db.prepare(`
      INSERT INTO goals (client_id, goal_text, goal_type, category, status, target_date,
        measurement_type, baseline, target, baseline_value, target_value, instrument,
        pattern_id, components_json)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(data.client_id, data.goal_text, data.goal_type, data.category,
      data.status || 'active', data.target_date,
      data.measurement_type || 'percentage',
      data.baseline || 0, data.target || 0,
      data.baseline_value || '', data.target_value || '',
      data.instrument || '',
      data.pattern_id || '', data.components_json || '');
    const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(result.lastInsertRowid) as any;
    auditLog({ actionType: 'goal_created', entityType: 'goal', entityId: goal.id, clientId: data.client_id });
    return goal;
  });

  safeHandle('goals:update', (_event, id: number, data) => {
    const before = db.prepare('SELECT * FROM goals WHERE id = ?').get(id) as any;
    const isEstablished = before?.source_document_id != null;

    if (isEstablished) {
      // Established goals: only allow status and met_date changes
      db.prepare(`
        UPDATE goals SET status=?, met_date=?
        WHERE id=? AND deleted_at IS NULL
      `).run(data.status, data.met_date, id);
    } else {
      // Pending goals: allow full updates including measurement fields
      db.prepare(`
        UPDATE goals SET goal_text=?, goal_type=?, category=?, status=?, target_date=?, met_date=?,
          measurement_type=?, baseline=?, target=?, baseline_value=?, target_value=?, instrument=?,
          pattern_id=?, components_json=?
        WHERE id=? AND deleted_at IS NULL
      `).run(data.goal_text, data.goal_type, data.category, data.status,
        data.target_date, data.met_date,
        data.measurement_type ?? before?.measurement_type ?? 'percentage',
        data.baseline ?? before?.baseline ?? 0, data.target ?? before?.target ?? 0,
        data.baseline_value ?? before?.baseline_value ?? '',
        data.target_value ?? before?.target_value ?? '',
        data.instrument ?? before?.instrument ?? '',
        data.pattern_id ?? before?.pattern_id ?? '',
        data.components_json ?? before?.components_json ?? '',
        id);
    }

    const goal = db.prepare('SELECT * FROM goals WHERE id = ?').get(id) as any;

    // Determine specific audit action
    if (data.status === 'met' && before?.status !== 'met') {
      auditLog({ actionType: 'goal_met', entityType: 'goal', entityId: id, clientId: before?.client_id });
    } else if (data.status === 'discontinued' && before?.status !== 'discontinued') {
      auditLog({ actionType: 'goal_discontinued', entityType: 'goal', entityId: id, clientId: before?.client_id });
    } else {
      auditLog({ actionType: 'goal_modified', entityType: 'goal', entityId: id, clientId: before?.client_id });
    }

    return goal;
  });

  // Soft delete — blocked for established goals
  safeHandle('goals:delete', (_event, id: number) => {
    const goal = db.prepare('SELECT client_id, source_document_id FROM goals WHERE id = ?').get(id) as any;
    if (goal?.source_document_id != null) {
      throw new Error('Cannot delete an established goal. Change its status to discontinued instead.');
    }
    db.prepare('UPDATE goals SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL').run(id);
    auditLog({ actionType: 'goal_discontinued', entityType: 'goal', entityId: id, clientId: goal?.client_id });
    return true;
  });

  // Tag a goal as established by a signed document
  safeHandle('goals:tagSource', (_event, goalId: number, docId: number, docType: string) => {
    db.prepare(
      'UPDATE goals SET source_document_id = ?, source_document_type = ? WHERE id = ? AND source_document_id IS NULL'
    ).run(docId, docType, goalId);
    return true;
  });

  // ── Goal Progress History ──

  safeHandle('goals:getProgressHistory', (_event, goalId: number) => {
    return db.prepare(`
      SELECT id, goal_id, recorded_date, measurement_type, value, numeric_value,
             instrument, source_type, source_document_id
      FROM goal_progress_history
      WHERE goal_id = ? AND deleted_at IS NULL
      ORDER BY recorded_date ASC, id ASC
    `).all(goalId);
  });

  safeHandle('goals:getProgressHistoryBatch', (_event, goalIds: number[]) => {
    if (!goalIds.length) return {};
    const placeholders = goalIds.map(() => '?').join(',');
    const rows = db.prepare(`
      SELECT id, goal_id, recorded_date, measurement_type, value, numeric_value,
             instrument, source_type, source_document_id
      FROM goal_progress_history
      WHERE goal_id IN (${placeholders}) AND deleted_at IS NULL
      ORDER BY recorded_date ASC, id ASC
    `).all(...goalIds) as any[];

    const result: Record<number, any[]> = {};
    for (const row of rows) {
      if (!result[row.goal_id]) result[row.goal_id] = [];
      result[row.goal_id].push(row);
    }
    return result;
  });

  safeHandle('goals:addProgressEntry', (_event, data: {
    goal_id: number;
    client_id: number;
    recorded_date: string;
    measurement_type: string;
    value: string;
    numeric_value: number;
    instrument?: string;
    source_type: string;
    source_document_id: number;
  }) => {
    // Prevent duplicates: check if entry already exists for this goal + source document
    const existing = db.prepare(`
      SELECT id FROM goal_progress_history
      WHERE goal_id = ? AND source_document_id = ? AND source_type = ? AND deleted_at IS NULL
    `).get(data.goal_id, data.source_document_id, data.source_type) as any;

    if (existing) {
      db.prepare(`
        UPDATE goal_progress_history
        SET value = ?, numeric_value = ?, recorded_date = ?, measurement_type = ?, instrument = ?
        WHERE id = ?
      `).run(data.value, data.numeric_value, data.recorded_date,
             data.measurement_type, data.instrument || '', existing.id);
      return { id: existing.id };
    }

    const result = db.prepare(`
      INSERT INTO goal_progress_history
        (goal_id, client_id, recorded_date, measurement_type, value, numeric_value, instrument, source_type, source_document_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(data.goal_id, data.client_id, data.recorded_date,
           data.measurement_type, data.value, data.numeric_value,
           data.instrument || '', data.source_type, data.source_document_id);

    return { id: result.lastInsertRowid };
  });

  // ── Staged Goals ──

  safeHandle('stagedGoals:listByClient', (_event, clientId: number) => {
    return db.prepare(
      "SELECT * FROM staged_goals WHERE client_id = ? AND status = 'staged' AND deleted_at IS NULL ORDER BY flagged_at DESC"
    ).all(clientId);
  });

  safeHandle('stagedGoals:listAllByClient', (_event, clientId: number) => {
    return db.prepare(
      'SELECT * FROM staged_goals WHERE client_id = ? AND deleted_at IS NULL ORDER BY flagged_at DESC'
    ).all(clientId);
  });

  safeHandle('stagedGoals:create', (_event, data: any) => {
    const result = db.prepare(`
      INSERT INTO staged_goals (client_id, goal_text, goal_type, category, rationale, flagged_from_note_id)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(data.client_id, data.goal_text, data.goal_type || 'STG',
      data.category || '', data.rationale || '', data.flagged_from_note_id || null);
    return db.prepare('SELECT * FROM staged_goals WHERE id = ?').get(result.lastInsertRowid);
  });

  safeHandle('stagedGoals:update', (_event, id: number, data: any) => {
    db.prepare(`
      UPDATE staged_goals SET goal_text=?, goal_type=?, category=?, rationale=?
      WHERE id=? AND deleted_at IS NULL
    `).run(data.goal_text, data.goal_type, data.category, data.rationale, id);
    return db.prepare('SELECT * FROM staged_goals WHERE id = ?').get(id);
  });

  safeHandle('stagedGoals:promote', (_event, id: number, noteId: number) => {
    const staged = db.prepare('SELECT * FROM staged_goals WHERE id = ? AND deleted_at IS NULL').get(id) as any;
    if (!staged) throw new Error('Staged goal not found');

    const goalResult = db.prepare(`
      INSERT INTO goals (client_id, goal_text, goal_type, category, status, target_date)
      VALUES (?, ?, ?, ?, 'active', '')
    `).run(staged.client_id, staged.goal_text, staged.goal_type, staged.category);

    const goalId = goalResult.lastInsertRowid;

    db.prepare(`
      UPDATE staged_goals
      SET status = 'promoted', promoted_at = datetime('now'),
          promoted_in_note_id = ?, promoted_to_goal_id = ?
      WHERE id = ?
    `).run(noteId, goalId, id);

    return {
      stagedGoal: db.prepare('SELECT * FROM staged_goals WHERE id = ?').get(id),
      goal: db.prepare('SELECT * FROM goals WHERE id = ?').get(goalId),
    };
  });

  safeHandle('stagedGoals:dismiss', (_event, id: number, reason?: string) => {
    db.prepare(`
      UPDATE staged_goals
      SET status = 'dismissed', dismissed_at = datetime('now'), dismiss_reason = ?
      WHERE id = ? AND deleted_at IS NULL
    `).run(reason || '', id);
    return db.prepare('SELECT * FROM staged_goals WHERE id = ?').get(id);
  });

  // ── Progress Report Goals ──

  safeHandle('progressReportGoals:listByNote', (_event, noteId: number) => {
    return db.prepare(
      'SELECT * FROM progress_report_goals WHERE note_id = ? AND deleted_at IS NULL ORDER BY id'
    ).all(noteId);
  });

  safeHandle('progressReportGoals:upsert', (_event, noteId: number, goals: any[]) => {
    db.prepare("UPDATE progress_report_goals SET deleted_at = datetime('now') WHERE note_id = ?").run(noteId);

    const insert = db.prepare(`
      INSERT INTO progress_report_goals (note_id, goal_id, status_at_report, performance_data,
        clinical_notes, goal_text_snapshot, is_new_goal, is_staged_promotion, staged_goal_id,
        baseline_snapshot, target_snapshot,
        measurement_type, current_value, current_numeric, baseline_value_snapshot, target_value_snapshot)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const txn = db.transaction(() => {
      for (const g of goals) {
        insert.run(noteId, g.goal_id, g.status_at_report || 'progressing',
          g.performance_data || '', g.clinical_notes || '', g.goal_text_snapshot || '',
          g.is_new_goal ? 1 : 0, g.is_staged_promotion ? 1 : 0, g.staged_goal_id || null,
          g.baseline_snapshot ?? 0, g.target_snapshot ?? 0,
          g.measurement_type || '', g.current_value || '', g.current_numeric ?? 0,
          g.baseline_value_snapshot || '', g.target_value_snapshot || '');
      }
    });
    txn();

    return db.prepare('SELECT * FROM progress_report_goals WHERE note_id = ? AND deleted_at IS NULL ORDER BY id').all(noteId);
  });

  safeHandle('progressReportGoals:getLastForGoal', (_event, goalId: number) => {
    return db.prepare(`
      SELECT prg.*, n.date_of_service as note_date
      FROM progress_report_goals prg
      JOIN notes n ON n.id = prg.note_id
      WHERE prg.goal_id = ?
        AND prg.deleted_at IS NULL
        AND n.signed_at IS NOT NULL
        AND n.deleted_at IS NULL
      ORDER BY n.date_of_service DESC
      LIMIT 1
    `).get(goalId) || null;
  });

  // ── Notes ──
  safeHandle('notes:list', (_event, filters?: { clientId?: number; entityId?: number }) => {
    let query = 'SELECT * FROM notes WHERE deleted_at IS NULL';
    const params: any[] = [];
    if (filters?.clientId) {
      query += ' AND client_id = ?';
      params.push(filters.clientId);
    }
    if (filters?.entityId) {
      query += ' AND entity_id = ?';
      params.push(filters.entityId);
    }
    query += ' ORDER BY date_of_service DESC';
    return db.prepare(query).all(...params);
  });

  safeHandle('notes:listByClient', (_event, clientId: number) => {
    return db.prepare(
      'SELECT * FROM notes WHERE client_id = ? AND deleted_at IS NULL ORDER BY date_of_service DESC'
    ).all(clientId);
  });

  safeHandle('notes:get', (_event, id: number) => {
    return db.prepare('SELECT * FROM notes WHERE id = ? AND deleted_at IS NULL').get(id);
  });

  safeHandle('notes:create', (_event, data) => {
    // Auto-stamp rendering provider NPI from practice settings if not provided
    let renderingNpi = data.rendering_provider_npi || '';
    if (!renderingNpi) {
      const practice = db.prepare('SELECT npi FROM practice WHERE id = 1').get() as any;
      if (practice?.npi) renderingNpi = practice.npi;
    }

    const result = db.prepare(`
      INSERT INTO notes (client_id, date_of_service, time_in, time_out, units, cpt_code,
        subjective, objective, assessment, plan, goals_addressed, signed_at,
        cpt_codes, signature_image, signature_typed, rendering_provider_npi,
        cpt_modifiers, charge_amount, place_of_service, diagnosis_pointers,
        entity_id, rate_override, rate_override_reason,
        frequency_per_week, duration_weeks, frequency_notes, note_type, patient_name,
        progress_report_data, discharge_data)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.client_id, data.date_of_service, data.time_in, data.time_out, data.units,
      data.cpt_code, data.subjective, data.objective, data.assessment, data.plan,
      data.goals_addressed || '[]', data.signed_at,
      data.cpt_codes || '[]', data.signature_image || '', data.signature_typed || '',
      renderingNpi,
      data.cpt_modifiers || '[]', data.charge_amount || 0,
      data.place_of_service || '11', data.diagnosis_pointers || '[1]',
      data.entity_id || null, data.rate_override || null, data.rate_override_reason || '',
      data.frequency_per_week || null, data.duration_weeks || null,
      data.frequency_notes || '', data.note_type || 'soap', data.patient_name || '',
      data.progress_report_data || '', data.discharge_data || ''
    );

    const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(result.lastInsertRowid) as any;

    // Audit logging
    if (data.signed_at) {
      const hash = computeContentHash({ subjective: data.subjective, objective: data.objective, assessment: data.assessment, plan: data.plan });
      db.prepare('UPDATE notes SET content_hash = ? WHERE id = ?').run(hash, note.id);
      auditLog({ actionType: 'note_created', entityType: 'note', entityId: note.id, clientId: data.client_id, contentHash: hash });
      auditLog({ actionType: 'note_signed', entityType: 'note', entityId: note.id, clientId: data.client_id, contentHash: hash });
    } else {
      auditLog({ actionType: 'note_created', entityType: 'note', entityId: note.id, clientId: data.client_id });
    }

    // If note is signed, update compliance tracking
    if (data.signed_at && data.client_id) {
      try {
        const compliance = db.prepare('SELECT * FROM compliance_tracking WHERE client_id = ?').get(data.client_id) as any;
        if (compliance?.tracking_enabled) {
          // ── Audit: log compliance override if signing while overdue ──
          const todayStr = new Date().toISOString().slice(0, 10);
          if (data.note_type !== 'progress_report' && data.note_type !== 'discharge') {
            if (compliance.visits_since_last_progress >= compliance.progress_visit_threshold && compliance.progress_visit_threshold > 0) {
              auditLog({ actionType: 'compliance_override', entityType: 'note', entityId: note.id, clientId: data.client_id,
                detail: { reason: 'progress_report_overdue', visits: compliance.visits_since_last_progress, threshold: compliance.progress_visit_threshold, note_type: data.note_type || 'soap' } });
            }
            if (compliance.next_recert_due && compliance.next_recert_due <= todayStr) {
              auditLog({ actionType: 'compliance_override', entityType: 'note', entityId: note.id, clientId: data.client_id,
                detail: { reason: 'recert_overdue', recert_due: compliance.next_recert_due, note_type: data.note_type || 'soap' } });
            }
          }

          if (data.note_type === 'progress_report') {
            // Progress report: reset counter and update dates
            const now = new Date().toISOString().slice(0, 10);
            db.prepare(`
              UPDATE compliance_tracking
              SET visits_since_last_progress = 0,
                  last_progress_date = ?,
                  next_progress_due = date(?, '+' || progress_day_threshold || ' days'),
                  updated_at = CURRENT_TIMESTAMP
              WHERE client_id = ?
            `).run(now, now, data.client_id);
          } else if (data.note_type === 'discharge') {
            // Discharge: close out compliance tracking entirely
            db.prepare(`
              UPDATE compliance_tracking
              SET tracking_enabled = 0, updated_at = CURRENT_TIMESTAMP
              WHERE client_id = ?
            `).run(data.client_id);
            // Dismiss any remaining staged goals
            db.prepare(`
              UPDATE staged_goals
              SET status = 'dismissed', dismissed_at = datetime('now'), dismiss_reason = 'Client discharged'
              WHERE client_id = ? AND status = 'staged'
            `).run(data.client_id);
            // Set client status to discharged
            db.prepare(`
              UPDATE clients SET status = 'discharged', updated_at = CURRENT_TIMESTAMP
              WHERE id = ? AND deleted_at IS NULL
            `).run(data.client_id);
          } else {
            db.prepare(`
              UPDATE compliance_tracking
              SET visits_since_last_progress = visits_since_last_progress + 1,
                  updated_at = CURRENT_TIMESTAMP
              WHERE client_id = ?
            `).run(data.client_id);
          }
        }
        // Discharge handling even if compliance not enabled
        if (data.note_type === 'discharge' && !compliance?.tracking_enabled) {
          try {
            db.prepare(`
              UPDATE staged_goals SET status = 'dismissed', dismissed_at = datetime('now'), dismiss_reason = 'Client discharged'
              WHERE client_id = ? AND status = 'staged'
            `).run(data.client_id);
            db.prepare(`
              UPDATE clients SET status = 'discharged', updated_at = CURRENT_TIMESTAMP
              WHERE id = ? AND deleted_at IS NULL
            `).run(data.client_id);
          } catch { /* graceful */ }
        }
      } catch { /* compliance tracking may not exist yet */ }

      // ── Audit: authorization exceeded check ──
      try {
        const activeAuth = db.prepare(`SELECT * FROM authorizations WHERE client_id = ? AND status = 'active' AND deleted_at IS NULL ORDER BY end_date DESC LIMIT 1`).get(data.client_id) as any;
        if (activeAuth && activeAuth.units_used >= activeAuth.units_approved && activeAuth.units_approved > 0) {
          auditLog({ actionType: 'authorization_exceeded', entityType: 'note', entityId: note.id, clientId: data.client_id,
            detail: { units_used: activeAuth.units_used, units_approved: activeAuth.units_approved, auth_number: activeAuth.auth_number } });
        }
      } catch { /* graceful */ }

      // ── Audit: late documentation check ──
      try {
        if (data.date_of_service) {
          const dos = new Date(data.date_of_service);
          const signedAt = new Date();
          const diffDays = Math.floor((signedAt.getTime() - dos.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays > 7) {
            auditLog({ actionType: 'late_documentation', entityType: 'note', entityId: note.id, clientId: data.client_id,
              detail: { date_of_service: data.date_of_service, signed_date: signedAt.toISOString().slice(0, 10), days_late: diffDays } });
          }
        }
      } catch { /* graceful */ }
    }

    return note;
  });

  safeHandle('notes:update', (_event, id: number, data) => {
    // Check if this update is adding a signature (going from unsigned to signed)
    const existingNote = db.prepare('SELECT signed_at, client_id FROM notes WHERE id = ?').get(id) as any;
    const isNewlySignedNote = !existingNote?.signed_at && data.signed_at;

    // Block draft-save overwrites on already-signed notes (race condition protection)
    if (existingNote?.signed_at && !data.signed_at) {
      // An auto-save with no signed_at is trying to overwrite a signed note — skip it
      return db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
    }

    db.prepare(`
      UPDATE notes SET date_of_service=?, time_in=?, time_out=?, units=?, cpt_code=?,
        subjective=?, objective=?, assessment=?, plan=?, goals_addressed=?, signed_at=?,
        cpt_codes=?, signature_image=?, signature_typed=?,
        cpt_modifiers=?, charge_amount=?, place_of_service=?, diagnosis_pointers=?,
        rendering_provider_npi=?,
        entity_id=?, rate_override=?, rate_override_reason=?,
        frequency_per_week=?, duration_weeks=?, frequency_notes=?, note_type=?,
        patient_name=?, progress_report_data=?, discharge_data=?,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND deleted_at IS NULL
    `).run(
      data.date_of_service, data.time_in, data.time_out, data.units, data.cpt_code,
      data.subjective, data.objective, data.assessment, data.plan,
      data.goals_addressed || '[]', data.signed_at,
      data.cpt_codes || '[]', data.signature_image || '', data.signature_typed || '',
      data.cpt_modifiers || '[]', data.charge_amount || 0,
      data.place_of_service || '11', data.diagnosis_pointers || '[1]',
      data.rendering_provider_npi || '',
      data.entity_id || null, data.rate_override || null, data.rate_override_reason || '',
      data.frequency_per_week || null, data.duration_weeks || null,
      data.frequency_notes || '', data.note_type || 'soap',
      data.patient_name || '', data.progress_report_data || '', data.discharge_data || '',
      id
    );

    // Audit logging
    const clientId = existingNote?.client_id || data.client_id;
    if (isNewlySignedNote) {
      const hash = computeContentHash({ subjective: data.subjective, objective: data.objective, assessment: data.assessment, plan: data.plan });
      db.prepare('UPDATE notes SET content_hash = ? WHERE id = ?').run(hash, id);
      auditLog({ actionType: 'note_signed', entityType: 'note', entityId: id, clientId, contentHash: hash });
    } else {
      auditLog({ actionType: 'note_draft_saved', entityType: 'note', entityId: id, clientId });
    }

    // If note was just signed, update compliance tracking
    if (isNewlySignedNote && existingNote?.client_id) {
      try {
        const compliance = db.prepare('SELECT * FROM compliance_tracking WHERE client_id = ?').get(existingNote.client_id) as any;
        if (compliance?.tracking_enabled) {
          // ── Audit: log compliance override if signing while overdue ──
          const todayStr = new Date().toISOString().slice(0, 10);
          if (data.note_type !== 'progress_report' && data.note_type !== 'discharge') {
            if (compliance.visits_since_last_progress >= compliance.progress_visit_threshold && compliance.progress_visit_threshold > 0) {
              auditLog({ actionType: 'compliance_override', entityType: 'note', entityId: id, clientId: existingNote.client_id,
                detail: { reason: 'progress_report_overdue', visits: compliance.visits_since_last_progress, threshold: compliance.progress_visit_threshold, note_type: data.note_type || 'soap' } });
            }
            if (compliance.next_recert_due && compliance.next_recert_due <= todayStr) {
              auditLog({ actionType: 'compliance_override', entityType: 'note', entityId: id, clientId: existingNote.client_id,
                detail: { reason: 'recert_overdue', recert_due: compliance.next_recert_due, note_type: data.note_type || 'soap' } });
            }
          }

          if (data.note_type === 'progress_report') {
            // Progress report: reset counter and update dates
            const now = new Date().toISOString().slice(0, 10);
            db.prepare(`
              UPDATE compliance_tracking
              SET visits_since_last_progress = 0,
                  last_progress_date = ?,
                  next_progress_due = date(?, '+' || progress_day_threshold || ' days'),
                  updated_at = CURRENT_TIMESTAMP
              WHERE client_id = ?
            `).run(now, now, existingNote.client_id);
          } else if (data.note_type === 'discharge') {
            // Discharge: close out compliance tracking entirely
            db.prepare(`
              UPDATE compliance_tracking
              SET tracking_enabled = 0, updated_at = CURRENT_TIMESTAMP
              WHERE client_id = ?
            `).run(existingNote.client_id);
            // Dismiss any remaining staged goals
            db.prepare(`
              UPDATE staged_goals
              SET status = 'dismissed', dismissed_at = datetime('now'), dismiss_reason = 'Client discharged'
              WHERE client_id = ? AND status = 'staged'
            `).run(existingNote.client_id);
            // Set client status to discharged
            db.prepare(`
              UPDATE clients SET status = 'discharged', updated_at = CURRENT_TIMESTAMP
              WHERE id = ? AND deleted_at IS NULL
            `).run(existingNote.client_id);
          } else {
            db.prepare(`
              UPDATE compliance_tracking
              SET visits_since_last_progress = visits_since_last_progress + 1,
                  updated_at = CURRENT_TIMESTAMP
              WHERE client_id = ?
            `).run(existingNote.client_id);
          }
        }
        // Discharge handling even if compliance not enabled
        if (data.note_type === 'discharge' && !compliance?.tracking_enabled) {
          try {
            db.prepare(`
              UPDATE staged_goals SET status = 'dismissed', dismissed_at = datetime('now'), dismiss_reason = 'Client discharged'
              WHERE client_id = ? AND status = 'staged'
            `).run(existingNote.client_id);
            db.prepare(`
              UPDATE clients SET status = 'discharged', updated_at = CURRENT_TIMESTAMP
              WHERE id = ? AND deleted_at IS NULL
            `).run(existingNote.client_id);
          } catch { /* graceful */ }
        }
      } catch { /* compliance tracking may not exist yet */ }

      // ── Audit: authorization exceeded check ──
      try {
        const activeAuth = db.prepare(`SELECT * FROM authorizations WHERE client_id = ? AND status = 'active' AND deleted_at IS NULL ORDER BY end_date DESC LIMIT 1`).get(existingNote.client_id) as any;
        if (activeAuth && activeAuth.units_used >= activeAuth.units_approved && activeAuth.units_approved > 0) {
          auditLog({ actionType: 'authorization_exceeded', entityType: 'note', entityId: id, clientId: existingNote.client_id,
            detail: { units_used: activeAuth.units_used, units_approved: activeAuth.units_approved, auth_number: activeAuth.auth_number } });
        }
      } catch { /* graceful */ }

      // ── Audit: late documentation check ──
      try {
        if (data.date_of_service) {
          const dos = new Date(data.date_of_service);
          const signedAt = new Date();
          const diffDays = Math.floor((signedAt.getTime() - dos.getTime()) / (1000 * 60 * 60 * 24));
          if (diffDays > 7) {
            auditLog({ actionType: 'late_documentation', entityType: 'note', entityId: id, clientId: existingNote.client_id,
              detail: { date_of_service: data.date_of_service, signed_date: signedAt.toISOString().slice(0, 10), days_late: diffDays } });
          }
        }
      } catch { /* graceful */ }
    }

    return db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
  });

  // Soft delete — blocked for signed notes
  safeHandle('notes:delete', (_event, id: number) => {
    const note = db.prepare('SELECT signed_at, client_id FROM notes WHERE id = ? AND deleted_at IS NULL').get(id) as any;
    if (!note) throw new Error('Note not found');
    if (note.signed_at) {
      auditLog({
        actionType: 'signed_document_delete_attempted',
        entityType: 'note',
        entityId: id,
        clientId: note.client_id,
        detail: {
          document_type: 'note',
          signed_at: note.signed_at,
        },
      });
      throw new Error('Cannot delete a signed note. Signed documents are part of the permanent medical record.');
    }
    db.prepare('UPDATE notes SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL').run(id);
    // Clear note_id on any appointment that referenced this deleted note
    db.prepare('UPDATE appointments SET note_id = NULL WHERE note_id = ? AND deleted_at IS NULL').run(id);
    auditLog({ actionType: 'note_deleted', entityType: 'note', entityId: id, clientId: note.client_id });
    return true;
  });

  // Episode summary for discharge auto-population
  safeHandle('notes:getEpisodeSummary', (_event, clientId: number) => {
    const firstEval = db.prepare(
      'SELECT eval_date FROM evaluations WHERE client_id = ? AND deleted_at IS NULL ORDER BY eval_date ASC LIMIT 1'
    ).get(clientId) as any;

    const firstNote = db.prepare(
      'SELECT date_of_service FROM notes WHERE client_id = ? AND deleted_at IS NULL ORDER BY date_of_service ASC LIMIT 1'
    ).get(clientId) as any;

    const visitCount = db.prepare(
      'SELECT COUNT(*) as count FROM notes WHERE client_id = ? AND signed_at IS NOT NULL AND deleted_at IS NULL'
    ).get(clientId) as any;

    const freqData = db.prepare(
      'SELECT frequency_per_week, duration_weeks, frequency_notes FROM notes WHERE client_id = ? AND frequency_per_week IS NOT NULL AND deleted_at IS NULL ORDER BY date_of_service DESC LIMIT 1'
    ).get(clientId) as any;

    const client = db.prepare(
      'SELECT primary_dx_code, primary_dx_description, discipline FROM clients WHERE id = ?'
    ).get(clientId) as any;

    return {
      start_of_care: firstEval?.eval_date || firstNote?.date_of_service || null,
      total_visits: visitCount?.count || 0,
      frequency_per_week: freqData?.frequency_per_week || null,
      duration_weeks: freqData?.duration_weeks || null,
      frequency_notes: freqData?.frequency_notes || '',
      primary_dx_code: client?.primary_dx_code || '',
      primary_dx_description: client?.primary_dx_description || '',
      discipline: client?.discipline || '',
    };
  });

  // Check for unbilled notes (for discharge final invoice prompt)
  safeHandle('notes:getUnbilledForClient', (_event, clientId: number) => {
    return db.prepare(`
      SELECT n.id, n.date_of_service, n.cpt_code, n.charge_amount, n.entity_id
      FROM notes n
      WHERE n.client_id = ? AND n.signed_at IS NOT NULL AND n.deleted_at IS NULL
        AND n.charge_amount > 0
        AND n.id NOT IN (SELECT DISTINCT note_id FROM invoice_items WHERE note_id IS NOT NULL)
      ORDER BY n.date_of_service DESC
    `).all(clientId);
  });

  // ── Evaluations ──
  safeHandle('evaluations:listByClient', (_event, clientId: number) => {
    return db.prepare(
      'SELECT * FROM evaluations WHERE client_id = ? AND deleted_at IS NULL ORDER BY eval_date DESC'
    ).all(clientId);
  });

  safeHandle('evaluations:get', (_event, id: number) => {
    return db.prepare('SELECT * FROM evaluations WHERE id = ? AND deleted_at IS NULL').get(id);
  });

  safeHandle('evaluations:create', (_event, data) => {
    const result = db.prepare(`
      INSERT INTO evaluations (client_id, eval_date, discipline, content, signed_at,
        signature_image, signature_typed, eval_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(data.client_id, data.eval_date, data.discipline, data.content, data.signed_at,
      data.signature_image || '', data.signature_typed || '', data.eval_type || 'initial');
    const evalRecord = db.prepare('SELECT * FROM evaluations WHERE id = ?').get(result.lastInsertRowid) as any;

    // Audit logging
    if (data.signed_at) {
      const hash = computeContentHash(JSON.parse(data.content || '{}'));
      db.prepare('UPDATE evaluations SET content_hash = ? WHERE id = ?').run(hash, evalRecord.id);
      auditLog({ actionType: 'eval_created', entityType: 'evaluation', entityId: evalRecord.id, clientId: data.client_id, contentHash: hash });
      auditLog({ actionType: 'eval_signed', entityType: 'evaluation', entityId: evalRecord.id, clientId: data.client_id, contentHash: hash });
    } else {
      auditLog({ actionType: 'eval_created', entityType: 'evaluation', entityId: evalRecord.id, clientId: data.client_id });
    }

    return evalRecord;
  });

  safeHandle('evaluations:update', (_event, id: number, data) => {
    const existingEval = db.prepare('SELECT signed_at, client_id FROM evaluations WHERE id = ?').get(id) as any;
    const isNewlySigned = !existingEval?.signed_at && data.signed_at;

    // Block draft-save overwrites on already-signed evaluations (race condition protection)
    if (existingEval?.signed_at && !data.signed_at) {
      return db.prepare('SELECT * FROM evaluations WHERE id = ?').get(id);
    }

    db.prepare(`
      UPDATE evaluations SET eval_date=?, discipline=?, content=?, signed_at=?,
        signature_image=?, signature_typed=?, eval_type=COALESCE(?, eval_type),
        updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND deleted_at IS NULL
    `).run(data.eval_date, data.discipline, data.content, data.signed_at,
      data.signature_image || '', data.signature_typed || '', data.eval_type || null, id);

    // Audit logging
    const clientId = existingEval?.client_id || data.client_id;
    if (isNewlySigned) {
      const hash = computeContentHash(JSON.parse(data.content || '{}'));
      db.prepare('UPDATE evaluations SET content_hash = ? WHERE id = ?').run(hash, id);
      auditLog({ actionType: 'eval_signed', entityType: 'evaluation', entityId: id, clientId, contentHash: hash });

      // Increment compliance visit counter — eval/re-eval IS a billable visit
      try {
        const compliance = db.prepare('SELECT * FROM compliance_tracking WHERE client_id = ?').get(clientId) as any;
        if (compliance?.tracking_enabled) {
          db.prepare(`
            UPDATE compliance_tracking
            SET visits_since_last_progress = visits_since_last_progress + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE client_id = ?
          `).run(clientId);
        }
      } catch { /* compliance tracking may not exist yet */ }
    } else {
      auditLog({ actionType: 'eval_draft_saved', entityType: 'evaluation', entityId: id, clientId });
    }

    return db.prepare('SELECT * FROM evaluations WHERE id = ?').get(id);
  });

  // Soft delete — blocked for signed evaluations
  safeHandle('evaluations:delete', (_event, id: number) => {
    const evalRecord = db.prepare('SELECT signed_at, client_id FROM evaluations WHERE id = ? AND deleted_at IS NULL').get(id) as any;
    if (!evalRecord) throw new Error('Evaluation not found');
    if (evalRecord.signed_at) {
      auditLog({
        actionType: 'signed_document_delete_attempted',
        entityType: 'evaluation',
        entityId: id,
        clientId: evalRecord.client_id,
        detail: {
          document_type: 'evaluation',
          signed_at: evalRecord.signed_at,
        },
      });
      throw new Error('Cannot delete a signed evaluation. Signed documents are part of the permanent medical record.');
    }
    db.prepare('UPDATE evaluations SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL').run(id);
    // Clear evaluation_id on any appointment that referenced this deleted eval
    db.prepare('UPDATE appointments SET evaluation_id = NULL WHERE evaluation_id = ? AND deleted_at IS NULL').run(id);
    auditLog({ actionType: 'evaluation_deleted', entityType: 'evaluation', entityId: id, clientId: evalRecord.client_id });
    return true;
  });

  // Create reassessment — pre-populate from most recent signed eval
  safeHandle('evaluations:createReassessment', (_event, clientId: number) => {
    const lastEval = db.prepare(`
      SELECT * FROM evaluations
      WHERE client_id = ? AND signed_at IS NOT NULL AND signed_at != '' AND deleted_at IS NULL
      ORDER BY eval_date DESC LIMIT 1
    `).get(clientId) as any;

    if (!lastEval) {
      return { priorContent: null, activeGoals: [] };
    }

    let priorContent = null;
    try { priorContent = JSON.parse(lastEval.content); } catch {}

    const activeGoals = db.prepare(`
      SELECT * FROM goals
      WHERE client_id = ? AND status = 'active' AND deleted_at IS NULL
      ORDER BY created_at ASC
    `).all(clientId);

    return { priorContent, activeGoals, priorEvalId: lastEval.id };
  });

  // Count incomplete (unsigned) evals
  safeHandle('evaluations:countIncomplete', () => {
    const result = db.prepare(
      'SELECT COUNT(*) as count FROM evaluations WHERE (signed_at IS NULL OR signed_at = \'\') AND deleted_at IS NULL'
    ).get() as any;
    return result?.count || 0;
  });

  // List all incomplete (unsigned) evals with client info
  safeHandle('evaluations:listIncomplete', () => {
    return db.prepare(`
      SELECT e.*, c.first_name, c.last_name, c.discipline AS client_discipline
      FROM evaluations e
      JOIN clients c ON c.id = e.client_id AND c.deleted_at IS NULL
      WHERE (e.signed_at IS NULL OR e.signed_at = '') AND e.deleted_at IS NULL
      ORDER BY e.eval_date DESC
    `).all();
  });

  safeHandle('evaluations:listAll', () => {
    return db.prepare(`
      SELECT e.*, c.first_name, c.last_name, c.discipline AS client_discipline
      FROM evaluations e
      JOIN clients c ON c.id = e.client_id AND c.deleted_at IS NULL
      WHERE e.deleted_at IS NULL
      ORDER BY e.eval_date DESC
    `).all();
  });

  // ── Appointments ──
  const apptSelectQuery = `
    SELECT a.*,
      c.first_name, c.last_name, c.discipline as client_discipline,
      e.name as entity_name
    FROM appointments a
    LEFT JOIN clients c ON a.client_id = c.id AND c.deleted_at IS NULL
    LEFT JOIN contracted_entities e ON a.entity_id = e.id
    WHERE a.deleted_at IS NULL
  `;

  safeHandle('appointments:list', (_event, filters?: { startDate?: string; endDate?: string; clientId?: number }) => {
    let query = apptSelectQuery;
    const params: any[] = [];

    if (filters?.startDate) {
      query += ' AND a.scheduled_date >= ?';
      params.push(filters.startDate);
    }
    if (filters?.endDate) {
      query += ' AND a.scheduled_date <= ?';
      params.push(filters.endDate);
    }
    if (filters?.clientId) {
      query += ' AND a.client_id = ?';
      params.push(filters.clientId);
    }

    query += ' ORDER BY a.scheduled_date, a.scheduled_time';
    return db.prepare(query).all(...params);
  });

  safeHandle('appointments:create', (_event, data) => {
    const result = db.prepare(`
      INSERT INTO appointments (client_id, scheduled_date, scheduled_time, duration_minutes, status, entity_id, entity_rate, patient_name, visit_type, session_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(data.client_id || 0, data.scheduled_date, data.scheduled_time,
      data.duration_minutes || 60, data.status || 'scheduled',
      data.entity_id || null, data.entity_rate || null, data.patient_name || '',
      data.visit_type || 'O', data.session_type || 'visit');
    return db.prepare(apptSelectQuery + ' AND a.id = ?').get(result.lastInsertRowid);
  });

  // Batch create for recurring appointments
  safeHandle('appointments:createBatch', (_event, items: any[]) => {
    const insert = db.prepare(`
      INSERT INTO appointments (client_id, scheduled_date, scheduled_time, duration_minutes, status, entity_id, entity_rate, patient_name, visit_type, session_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const created: any[] = [];
    const txn = db.transaction(() => {
      for (const data of items) {
        const result = insert.run(
          data.client_id || 0, data.scheduled_date, data.scheduled_time,
          data.duration_minutes || 60, data.status || 'scheduled',
          data.entity_id || null, data.entity_rate || null, data.patient_name || '',
          data.visit_type || 'O', data.session_type || 'visit'
        );
        const row = db.prepare(apptSelectQuery + ' AND a.id = ?').get(result.lastInsertRowid);
        if (row) created.push(row);
      }
    });
    txn();
    return created;
  });

  safeHandle('appointments:update', (_event, id: number, data) => {
    db.prepare(`
      UPDATE appointments SET client_id=?, scheduled_date=?, scheduled_time=?,
        duration_minutes=?, status=?, note_id=?, entity_id=?, entity_rate=?, patient_name=?,
        visit_type=?, session_type=?, evaluation_id=?
      WHERE id=? AND deleted_at IS NULL
    `).run(data.client_id, data.scheduled_date, data.scheduled_time,
      data.duration_minutes, data.status, data.note_id,
      data.entity_id || null, data.entity_rate || null, data.patient_name || '',
      data.visit_type || 'O', data.session_type || 'visit', data.evaluation_id || null, id);
    return db.prepare(apptSelectQuery + ' AND a.id = ?').get(id);
  });

  // Soft delete
  safeHandle('appointments:delete', (_event, id: number) => {
    const appt = db.prepare('SELECT client_id FROM appointments WHERE id = ?').get(id) as any;
    db.prepare('UPDATE appointments SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL').run(id);
    auditLog({ actionType: 'appointment_deleted', entityType: 'appointment', entityId: id, clientId: appt?.client_id });
    return true;
  });

  // Link evaluation to appointment (set evaluation_id and mark completed)
  safeHandle('appointments:linkEval', (_event, appointmentId: number, evaluationId: number) => {
    db.prepare(`
      UPDATE appointments SET evaluation_id = ?, status = 'completed'
      WHERE id = ? AND deleted_at IS NULL
    `).run(evaluationId, appointmentId);
    return true;
  });

  // Link note to appointment (set note_id and mark completed)
  safeHandle('appointments:linkNote', (_event, appointmentId: number, noteId: number) => {
    db.prepare(`
      UPDATE appointments SET note_id = ?, status = 'completed'
      WHERE id = ? AND deleted_at IS NULL
    `).run(noteId, appointmentId);
    return true;
  });

  // ── Note Bank ──
  safeHandle('noteBank:list', (_event, filters?: { discipline?: string; section?: string; category?: string }) => {
    let query = 'SELECT * FROM note_bank WHERE 1=1';
    const params: any[] = [];

    if (filters?.discipline) {
      query += ' AND (discipline = ? OR discipline = ?)';
      params.push(filters.discipline, 'ALL');
    }
    if (filters?.section) {
      query += ' AND section = ?';
      params.push(filters.section);
    }
    if (filters?.category) {
      query += ' AND category = ?';
      params.push(filters.category);
    }

    query += ' ORDER BY is_favorite DESC, phrase';
    return db.prepare(query).all(...params);
  });

  safeHandle('noteBank:create', (_event, data) => {
    const result = db.prepare(`
      INSERT INTO note_bank (discipline, category, section, phrase, is_default, is_favorite)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(data.discipline, data.category, data.section, data.phrase,
      data.is_default ? 1 : 0, data.is_favorite ? 1 : 0);
    return db.prepare('SELECT * FROM note_bank WHERE id = ?').get(result.lastInsertRowid);
  });

  safeHandle('noteBank:update', (_event, id: number, data) => {
    db.prepare(`
      UPDATE note_bank SET discipline=?, category=?, section=?, phrase=?, is_favorite=?
      WHERE id=?
    `).run(data.discipline, data.category, data.section, data.phrase,
      data.is_favorite ? 1 : 0, id);
    return db.prepare('SELECT * FROM note_bank WHERE id = ?').get(id);
  });

  safeHandle('noteBank:delete', (_event, id: number) => {
    db.prepare('DELETE FROM note_bank WHERE id = ?').run(id);
    return true;
  });

  safeHandle('noteBank:toggleFavorite', (_event, id: number) => {
    requireTier('pro');
    db.prepare('UPDATE note_bank SET is_favorite = NOT is_favorite WHERE id = ?').run(id);
    return db.prepare('SELECT * FROM note_bank WHERE id = ?').get(id);
  });

  safeHandle('noteBank:getCategories', (_event, discipline: string) => {
    const rows = db.prepare(
      `SELECT DISTINCT category FROM note_bank
       WHERE (discipline = ? OR discipline = 'ALL')
       AND category IS NOT NULL AND category != ''
       ORDER BY category COLLATE NOCASE`
    ).all(discipline) as { category: string }[];
    return rows.map(r => r.category);
  });

  // ── Pattern Overrides ──
  safeHandle('patternOverrides:list', () => {
    const rows = db.prepare('SELECT * FROM pattern_overrides').all() as any[];
    return rows.map(r => ({
      ...r,
      custom_options: JSON.parse(r.custom_options || '[]'),
      removed_options: JSON.parse(r.removed_options || '[]'),
    }));
  });

  safeHandle('patternOverrides:upsert', (_event, patternId: string, componentKey: string, customOptions: string[], removedOptions: string[]) => {
    db.prepare(`
      INSERT INTO pattern_overrides (pattern_id, component_key, custom_options, removed_options)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(pattern_id, component_key)
      DO UPDATE SET custom_options = excluded.custom_options, removed_options = excluded.removed_options
    `).run(patternId, componentKey, JSON.stringify(customOptions), JSON.stringify(removedOptions));
    const row = db.prepare('SELECT * FROM pattern_overrides WHERE pattern_id = ? AND component_key = ?').get(patternId, componentKey) as any;
    return { ...row, custom_options: JSON.parse(row.custom_options || '[]'), removed_options: JSON.parse(row.removed_options || '[]') };
  });

  safeHandle('patternOverrides:delete', (_event, patternId: string, componentKey: string) => {
    db.prepare('DELETE FROM pattern_overrides WHERE pattern_id = ? AND component_key = ?').run(patternId, componentKey);
    return true;
  });

  safeHandle('patternOverrides:deleteAll', (_event, patternId: string) => {
    db.prepare('DELETE FROM pattern_overrides WHERE pattern_id = ?').run(patternId);
    return true;
  });

  // ── Custom Patterns ──
  safeHandle('customPatterns:list', () => {
    return db.prepare('SELECT * FROM custom_patterns WHERE deleted_at IS NULL ORDER BY discipline, category, label').all();
  });

  safeHandle('customPatterns:create', (_event, data: any) => {
    const result = db.prepare(`
      INSERT INTO custom_patterns (discipline, category, label, icon, measurement_type, chips_json)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(
      data.discipline, data.category || '', data.label, data.icon || '',
      data.measurement_type || 'percentage', JSON.stringify(data.chips || [])
    );
    return db.prepare('SELECT * FROM custom_patterns WHERE id = ?').get(result.lastInsertRowid);
  });

  safeHandle('customPatterns:update', (_event, id: number, data: any) => {
    db.prepare(`
      UPDATE custom_patterns SET label=?, category=?, icon=?, measurement_type=?, chips_json=?
      WHERE id=? AND deleted_at IS NULL
    `).run(
      data.label, data.category || '', data.icon || '',
      data.measurement_type || 'percentage', JSON.stringify(data.chips || []),
      id
    );
    return db.prepare('SELECT * FROM custom_patterns WHERE id = ?').get(id);
  });

  safeHandle('customPatterns:delete', (_event, id: number) => {
    db.prepare("UPDATE custom_patterns SET deleted_at = datetime('now') WHERE id = ?").run(id);
    return true;
  });

  // ── Settings ──
  safeHandle('settings:get', (_event, key: string) => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any;
    return row?.value || null;
  });

  safeHandle('settings:set', (_event, key: string, value: string) => {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);

    // Audit log: EULA acceptance during onboarding
    if (key === 'terms_accepted') {
      auditLog({
        actionType: 'eula_accepted',
        entityType: 'system',
        entityId: null,
        detail: {
          eula_version: '1.0',
          accepted_at: value,
          acceptance_method: 'in_app_onboarding',
        },
      });
    }

    return true;
  });

  // ── Security ──
  safeHandle('security:isPinEnabled', () => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('pin_hash') as any;
    return !!row?.value;
  });

  safeHandle('security:setPin', (_event, newPin: string, currentPin?: string) => {
    if (!/^\d{4}$/.test(newPin)) {
      return { success: false, error: 'PIN must be exactly 4 digits' };
    }

    const existingHash = (db.prepare('SELECT value FROM settings WHERE key = ?').get('pin_hash') as any)?.value;
    if (existingHash) {
      if (!currentPin) {
        return { success: false, error: 'Current PIN is required to change PIN' };
      }
      const existingSalt = (db.prepare('SELECT value FROM settings WHERE key = ?').get('pin_salt') as any)?.value;
      const checkHash = crypto.createHmac('sha256', existingSalt).update(currentPin).digest('hex');
      if (checkHash !== existingHash) {
        return { success: false, error: 'Current PIN is incorrect' };
      }
    }

    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.createHmac('sha256', salt).update(newPin).digest('hex');

    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('pin_salt', salt);
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('pin_hash', hash);

    return { success: true };
  });

  safeHandle('security:verifyPin', (_event, pin: string) => {
    const hashRow = (db.prepare('SELECT value FROM settings WHERE key = ?').get('pin_hash') as any);
    const saltRow = (db.prepare('SELECT value FROM settings WHERE key = ?').get('pin_salt') as any);

    if (!hashRow?.value || !saltRow?.value) return false;

    const checkHash = crypto.createHmac('sha256', saltRow.value).update(pin).digest('hex');
    return checkHash === hashRow.value;
  });

  safeHandle('security:removePin', (_event, currentPin: string) => {
    const hashRow = (db.prepare('SELECT value FROM settings WHERE key = ?').get('pin_hash') as any);
    const saltRow = (db.prepare('SELECT value FROM settings WHERE key = ?').get('pin_salt') as any);

    if (!hashRow?.value || !saltRow?.value) {
      return { success: false, error: 'No PIN is currently set' };
    }

    const checkHash = crypto.createHmac('sha256', saltRow.value).update(currentPin).digest('hex');
    if (checkHash !== hashRow.value) {
      return { success: false, error: 'Incorrect PIN' };
    }

    db.prepare('DELETE FROM settings WHERE key = ?').run('pin_hash');
    db.prepare('DELETE FROM settings WHERE key = ?').run('pin_salt');

    return { success: true };
  });

  // --- PIN Recovery ---
  // Generates a recovery token file in the data folder. The user must open it,
  // read the code, and type it back in to prove they own the file system.
  safeHandle('security:requestPinReset', () => {
    const token = crypto.randomBytes(4).toString('hex').toUpperCase(); // 8-char hex code
    const recoveryPath = path.join(path.dirname(dbPath), 'PIN_RECOVERY.txt');
    const content = [
      '=== PocketChart PIN Recovery ===',
      '',
      `Your recovery code is:  ${token}`,
      '',
      'Enter this code in PocketChart to reset your PIN.',
      'This file will be automatically deleted after the reset.',
      '',
      `Generated: ${new Date().toLocaleString()}`,
    ].join('\n');
    fs.writeFileSync(recoveryPath, content, 'utf-8');

    // Store token hash so we can verify it later without storing it in plaintext in the DB
    const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('pin_recovery_token', ?)").run(tokenHash);
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('pin_recovery_expires', ?)").run(
      (Date.now() + 15 * 60 * 1000).toString() // expires in 15 minutes
    );

    // Open the folder so the user can find the file easily
    shell.showItemInFolder(recoveryPath);

    return { success: true, filePath: recoveryPath };
  });

  safeHandle('security:verifyRecoveryToken', (_event, token: string) => {
    const storedHash = (db.prepare("SELECT value FROM settings WHERE key = 'pin_recovery_token'").get() as any)?.value;
    const expiresStr = (db.prepare("SELECT value FROM settings WHERE key = 'pin_recovery_expires'").get() as any)?.value;

    if (!storedHash || !expiresStr) {
      return { success: false, error: 'No recovery request found. Please start over.' };
    }

    const expires = parseInt(expiresStr, 10);
    if (Date.now() > expires) {
      // Clean up expired token
      db.prepare("DELETE FROM settings WHERE key IN ('pin_recovery_token', 'pin_recovery_expires')").run();
      return { success: false, error: 'Recovery code has expired. Please request a new one.' };
    }

    const inputHash = crypto.createHash('sha256').update(token.toUpperCase().trim()).digest('hex');
    if (inputHash !== storedHash) {
      return { success: false, error: 'Incorrect recovery code. Check the file and try again.' };
    }

    // Token is valid — remove PIN and clean up
    db.prepare("DELETE FROM settings WHERE key IN ('pin_hash', 'pin_salt', 'pin_recovery_token', 'pin_recovery_expires')").run();

    // Delete the recovery file
    const recoveryPath = path.join(path.dirname(dbPath), 'PIN_RECOVERY.txt');
    try { fs.unlinkSync(recoveryPath); } catch { /* file may already be gone */ }

    return { success: true };
  });

  safeHandle('security:getTimeoutMinutes', () => {
    const row = (db.prepare('SELECT value FROM settings WHERE key = ?').get('auto_timeout_minutes') as any);
    return row?.value ? parseInt(row.value, 10) : 0;
  });

  safeHandle('security:setTimeoutMinutes', (_event, minutes: number) => {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run('auto_timeout_minutes', minutes.toString());
    return true;
  });

  // ── Secure Credentials ──
  // Store sensitive data (API keys, etc.) using OS-level encryption

  safeHandle('secureStorage:isAvailable', () => {
    return safeStorage.isEncryptionAvailable();
  });

  safeHandle('secureStorage:set', (_event, key: string, value: string) => {
    const encrypted = encryptSecure(value);
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(`secure_${key}`, encrypted);
    return true;
  });

  safeHandle('secureStorage:get', (_event, key: string) => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(`secure_${key}`) as any;
    if (!row?.value) return null;
    try {
      return decryptSecure(row.value);
    } catch (err) {
      console.error('Failed to decrypt secure setting:', err);
      return null;
    }
  });

  safeHandle('secureStorage:getMasked', (_event, key: string) => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(`secure_${key}`) as any;
    if (!row?.value) return null;
    try {
      const decrypted = decryptSecure(row.value);
      return maskSecret(decrypted);
    } catch (err) {
      console.error('Failed to decrypt secure setting for masking:', err);
      return null;
    }
  });

  safeHandle('secureStorage:delete', (_event, key: string) => {
    db.prepare('DELETE FROM settings WHERE key = ?').run(`secure_${key}`);
    return true;
  });

  safeHandle('secureStorage:exists', (_event, key: string) => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(`secure_${key}`) as any;
    return !!row?.value;
  });

  // ── Shell (open external links in default system browser) ──
  safeHandle('shell:openExternal', async (_event, url: string) => {
    // Only allow http/https URLs for security
    if (url.startsWith('http://') || url.startsWith('https://')) {
      await shell.openExternal(url);
      return true;
    }
    return false;
  });

  // ── Review Prompt System ──

  safeHandle('review-prompts:check-eligible', () => {
    // Gate check: look at most recent review_prompts row
    const lastPrompt = db.prepare(
      'SELECT * FROM review_prompts ORDER BY created_at DESC LIMIT 1'
    ).get() as any;

    if (lastPrompt) {
      // If dismissed, review_site, or feedback → never show again
      if (['dismissed', 'review_site', 'feedback'].includes(lastPrompt.action)) {
        return { eligible: false, milestone: null };
      }
      // If remind_later, must be >90 days ago
      if (lastPrompt.action === 'remind_later') {
        const promptedDate = new Date(lastPrompt.prompted_at);
        const daysSince = (Date.now() - promptedDate.getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince < 90) {
          return { eligible: false, milestone: null };
        }
      }
    }

    // Milestone 1: 50th signed note
    const signedNotes = (db.prepare(
      'SELECT COUNT(*) as count FROM notes WHERE signed_at IS NOT NULL AND deleted_at IS NULL'
    ).get() as any).count;
    if (signedNotes >= 50) {
      return { eligible: true, milestone: '50_notes_signed' };
    }

    // Milestone 2: 30 days since first signed note
    const firstNote = db.prepare(
      'SELECT MIN(signed_at) as first FROM notes WHERE signed_at IS NOT NULL AND deleted_at IS NULL'
    ).get() as any;
    if (firstNote?.first) {
      const daysSinceFirst = (Date.now() - new Date(firstNote.first).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceFirst >= 30) {
        return { eligible: true, milestone: '30_days_active' };
      }
    }

    // Milestone 3: First invoice generated
    const invoiceCount = (db.prepare(
      'SELECT COUNT(*) as count FROM invoices WHERE deleted_at IS NULL'
    ).get() as any).count;
    if (invoiceCount >= 1) {
      return { eligible: true, milestone: 'first_invoice' };
    }

    // Milestone 4: 100th appointment
    const apptCount = (db.prepare(
      'SELECT COUNT(*) as count FROM appointments WHERE deleted_at IS NULL'
    ).get() as any).count;
    if (apptCount >= 100) {
      return { eligible: true, milestone: '100_appointments' };
    }

    return { eligible: false, milestone: null };
  });

  safeHandle('review-prompts:record', (_event, data: { rating: number | null; action: string }) => {
    const result = db.prepare(
      "INSERT INTO review_prompts (prompted_at, rating, action) VALUES (datetime('now'), ?, ?)"
    ).run(data.rating, data.action);
    return { id: result.lastInsertRowid };
  });

  // ── Stripe Payment Integration ──

  // Helper to get decrypted Stripe API key
  const getStripeClient = (): Stripe | null => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get('secure_stripe_secret_key') as any;
    if (!row?.value) return null;

    try {
      const stripeKey = decryptSecure(row.value);
      if (!stripeKey) return null;
      return new Stripe(stripeKey);
    } catch (err) {
      console.error('Failed to initialize Stripe client:', err);
      return null;
    }
  };

  // Create or get Stripe customer for a client
  safeHandle('stripe:getOrCreateCustomer', async (_event, clientId: number) => {
    const stripe = getStripeClient();
    if (!stripe) throw new Error('Stripe API key not configured');

    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(clientId) as any;
    if (!client) throw new Error('Client not found');

    // If customer already exists, return it
    if (client.stripe_customer_id) {
      return { customerId: client.stripe_customer_id, created: false };
    }

    // Create new Stripe customer
    const customer = await stripe.customers.create({
      email: client.email || undefined,
      name: `${client.first_name} ${client.last_name}`,
      phone: client.phone || undefined,
      metadata: {
        pocketchart_client_id: clientId.toString(),
      },
    });

    // Save customer ID to database
    db.prepare('UPDATE clients SET stripe_customer_id = ? WHERE id = ?')
      .run(customer.id, clientId);

    return { customerId: customer.id, created: true };
  });

  // Create a Payment Link for an invoice
  safeHandle('stripe:createPaymentLink', async (_event, invoiceId: number) => {
    const stripe = getStripeClient();
    if (!stripe) throw new Error('Stripe API key not configured');

    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as any;
    if (!invoice) throw new Error('Invoice not found');

    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(invoice.client_id) as any;
    if (!client) throw new Error('Client not found');

    // If payment link already exists and invoice not yet paid, return existing
    if (invoice.stripe_payment_link_url && invoice.status !== 'paid') {
      return {
        url: invoice.stripe_payment_link_url,
        id: invoice.stripe_payment_link_id,
        existing: true
      };
    }

    // Ensure customer exists in Stripe
    let customerId = client.stripe_customer_id;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: client.email || undefined,
        name: `${client.first_name} ${client.last_name}`,
        metadata: { pocketchart_client_id: client.id.toString() },
      });
      customerId = customer.id;
      db.prepare('UPDATE clients SET stripe_customer_id = ? WHERE id = ?')
        .run(customerId, client.id);
    }

    // Create a one-time price for this invoice amount
    const amountInCents = Math.round(invoice.total_amount * 100);

    const price = await stripe.prices.create({
      currency: 'usd',
      unit_amount: amountInCents,
      product_data: {
        name: `Invoice ${invoice.invoice_number}`,
        metadata: {
          pocketchart_invoice_id: invoiceId.toString(),
        },
      },
    });

    // Create the payment link
    const paymentLink = await stripe.paymentLinks.create({
      line_items: [{ price: price.id, quantity: 1 }],
      metadata: {
        pocketchart_invoice_id: invoiceId.toString(),
        pocketchart_client_id: client.id.toString(),
      },
      after_completion: {
        type: 'hosted_confirmation',
        hosted_confirmation: {
          custom_message: `Thank you for your payment! Invoice ${invoice.invoice_number} has been paid.`,
        },
      },
    });

    // Store the payment link in the database
    db.prepare(`
      UPDATE invoices SET
        stripe_payment_link_id = ?,
        stripe_payment_link_url = ?
      WHERE id = ?
    `).run(paymentLink.id, paymentLink.url, invoiceId);

    return { url: paymentLink.url, id: paymentLink.id, existing: false };
  });

  // Check payment status for an invoice (polling-based)
  safeHandle('stripe:checkPaymentStatus', async (_event, invoiceId: number) => {
    const stripe = getStripeClient();
    if (!stripe) throw new Error('Stripe API key not configured');

    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as any;
    if (!invoice) throw new Error('Invoice not found');

    // If already marked as paid, no need to check
    if (invoice.status === 'paid') {
      return { status: 'paid', alreadyRecorded: true };
    }

    // If no payment link exists, nothing to check
    if (!invoice.stripe_payment_link_id) {
      return { status: 'no_payment_link' };
    }

    // Check for completed checkout sessions associated with this payment link
    const sessions = await stripe.checkout.sessions.list({
      payment_link: invoice.stripe_payment_link_id,
      limit: 5,
    });

    for (const session of sessions.data) {
      if (session.payment_status === 'paid') {
        // Check if we've already recorded this payment
        const existingPayment = db.prepare(
          'SELECT id FROM payments WHERE stripe_payment_intent_id = ?'
        ).get(session.payment_intent as string);

        if (!existingPayment) {
          // Record the payment
          db.prepare(`
            INSERT INTO payments (
              client_id, invoice_id, payment_date, amount,
              payment_method, stripe_payment_intent_id, notes
            ) VALUES (?, ?, ?, ?, 'stripe', ?, ?)
          `).run(
            invoice.client_id,
            invoiceId,
            new Date().toISOString().slice(0, 10),
            invoice.total_amount,
            session.payment_intent,
            'Paid via Stripe Payment Link'
          );

          // Update invoice status to paid
          db.prepare('UPDATE invoices SET status = ? WHERE id = ?')
            .run('paid', invoiceId);

          // Log the payment
          db.prepare(`
            INSERT INTO audit_log (entity_type, entity_id, action, client_id, amount, description)
            VALUES ('payment', ?, 'stripe_payment_received', ?, ?, ?)
          `).run(
            invoiceId,
            invoice.client_id,
            invoice.total_amount,
            `Payment received via Stripe for Invoice ${invoice.invoice_number}`
          );
        }

        return {
          status: 'paid',
          paymentIntentId: session.payment_intent,
          amountPaid: session.amount_total ? session.amount_total / 100 : invoice.total_amount
        };
      }
    }

    return { status: 'pending' };
  });

  // Check ALL outstanding payment links at once (for background polling)
  safeHandle('stripe:checkAllPendingPayments', async () => {
    const stripe = getStripeClient();
    if (!stripe) return { checked: 0, paid: [] };

    const pendingInvoices = db.prepare(`
      SELECT id, invoice_number, stripe_payment_link_id, client_id, total_amount
      FROM invoices
      WHERE status NOT IN ('paid', 'void')
      AND stripe_payment_link_id IS NOT NULL
    `).all() as any[];

    const paidInvoices: any[] = [];

    for (const invoice of pendingInvoices) {
      try {
        const sessions = await stripe.checkout.sessions.list({
          payment_link: invoice.stripe_payment_link_id,
          limit: 5,
        });

        for (const session of sessions.data) {
          if (session.payment_status === 'paid') {
            const existingPayment = db.prepare(
              'SELECT id FROM payments WHERE stripe_payment_intent_id = ?'
            ).get(session.payment_intent as string);

            if (!existingPayment) {
              db.prepare(`
                INSERT INTO payments (
                  client_id, invoice_id, payment_date, amount,
                  payment_method, stripe_payment_intent_id, notes
                ) VALUES (?, ?, ?, ?, 'stripe', ?, ?)
              `).run(
                invoice.client_id,
                invoice.id,
                new Date().toISOString().slice(0, 10),
                invoice.total_amount,
                session.payment_intent,
                'Paid via Stripe Payment Link'
              );

              db.prepare('UPDATE invoices SET status = ? WHERE id = ?')
                .run('paid', invoice.id);

              db.prepare(`
                INSERT INTO audit_log (entity_type, entity_id, action, client_id, amount, description)
                VALUES ('payment', ?, 'stripe_payment_received', ?, ?, ?)
              `).run(
                invoice.id,
                invoice.client_id,
                invoice.total_amount,
                `Payment received via Stripe for Invoice ${invoice.invoice_number}`
              );

              paidInvoices.push({
                invoiceId: invoice.id,
                invoiceNumber: invoice.invoice_number,
                amount: invoice.total_amount,
              });
            }
          }
        }
      } catch (err) {
        console.error(`Failed to check payment for invoice ${invoice.id}:`, err);
      }
    }

    return { checked: pendingInvoices.length, paid: paidInvoices };
  });

  // ── Feedback (Airtable) ──
  const AIRTABLE_FEEDBACK_PAT = 'patdhgeybhMRMb4aG.b4fa8c6301aa78bd09ebc65ae5c248bc0eb285a7ec4077263f34f7abf5e95c16';
  const AIRTABLE_FEEDBACK_BASE = 'appcWqWC6UTtB0T1O';
  const AIRTABLE_FEEDBACK_TABLE = 'tblgF2plUJQvqDD6j';

  safeHandle('feedback:submit', async (_event, data: {
    description: string;
    category: string;
    appVersion: string;
    discipline: string;
    practiceName: string;
    os: string;
  }) => {
    if (!AIRTABLE_FEEDBACK_PAT) {
      throw new Error('Feedback submission is not configured. Please set AIRTABLE_FEEDBACK_PAT.');
    }

    const response = await fetch(
      `https://api.airtable.com/v0/${AIRTABLE_FEEDBACK_BASE}/${AIRTABLE_FEEDBACK_TABLE}`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${AIRTABLE_FEEDBACK_PAT}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          records: [{
            fields: {
              'Description': data.description,
              'Category': data.category,
              'App Version': data.appVersion,
              'Discipline': data.discipline,
              'Practice Name': data.practiceName,
              'OS': data.os,
              'Submitted At': new Date().toISOString(),
              'Status': 'New',
            },
          }],
        }),
      }
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => 'Unknown error');
      console.error('[Feedback] Airtable POST failed:', response.status, errText);
      throw new Error('Failed to submit feedback. Please check your internet connection.');
    }

    return { success: true };
  });

  // ── License (Lemon Squeezy Integration) ──

  const getSetting = (key: string): string | null => {
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
    return row?.value || null;
  };

  const setSetting = (key: string, value: string) => {
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run(key, value);
  };

  const deleteSetting = (key: string) => {
    db.prepare("DELETE FROM settings WHERE key = ?").run(key);
  };

  // ── 30-Day Free Trial ──
  // Record install_date on first launch (never overwrite)
  const TRIAL_DAYS = 30;
  if (!getSetting('install_date')) {
    setSetting('install_date', new Date().toISOString());
  }

  /**
   * Calculates the effective tier considering trial status.
   * - If user has a real license (basic/pro), return that tier directly.
   * - If unlicensed and within 30-day trial window, return 'basic'.
   * - If unlicensed and trial expired, return 'unlicensed'.
   */
  function getEffectiveTier(): { effectiveTier: AppTier; trialActive: boolean; trialExpired: boolean; trialDaysRemaining: number } {
    const storedTier = (getSetting('app_tier') || 'unlicensed') as AppTier;

    // If user has a real license, no trial logic needed
    if (storedTier !== 'unlicensed') {
      return { effectiveTier: storedTier, trialActive: false, trialExpired: false, trialDaysRemaining: 0 };
    }

    // Calculate trial status
    const installDate = getSetting('install_date');
    if (!installDate) {
      // Shouldn't happen (set above), but guard anyway
      return { effectiveTier: 'unlicensed', trialActive: false, trialExpired: false, trialDaysRemaining: 0 };
    }

    const installed = new Date(installDate);
    const now = new Date();
    const daysSinceInstall = Math.floor((now.getTime() - installed.getTime()) / (1000 * 60 * 60 * 24));
    const daysRemaining = Math.max(0, TRIAL_DAYS - daysSinceInstall);

    if (daysRemaining > 0) {
      // Active trial — grant basic tier
      return { effectiveTier: 'basic', trialActive: true, trialExpired: false, trialDaysRemaining: daysRemaining };
    } else {
      // Trial expired
      return { effectiveTier: 'unlicensed', trialActive: false, trialExpired: true, trialDaysRemaining: 0 };
    }
  }

  /**
   * Validate a license key against the Lemon Squeezy API.
   * Returns the product variant name to determine tier (basic vs pro).
   */
  async function validateLemonSqueezyLicense(licenseKey: string): Promise<{
    valid: boolean;
    tier: AppTier;
    subscriptionStatus: string | null;
    subscriptionExpiresAt: string | null;
    error?: string;
  }> {
    try {
      const response = await fetch('https://api.lemonsqueezy.com/v1/licenses/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          license_key: licenseKey,
          instance_name: os.hostname(),
        }),
      });

      const data = await response.json() as any;

      if (!data.valid) {
        // Check if this is an expired/cancelled Pro key — they should fall to basic, not unlicensed
        const keyStatus = data.license_key?.status;
        if (keyStatus === 'expired' || keyStatus === 'disabled') {
          const pName = (data.meta?.product_name || '').toLowerCase();
          const vName = (data.meta?.variant_name || '').toLowerCase();
          const wasPro = pName.includes('pro') || vName.includes('pro');
          return {
            valid: false,
            tier: 'basic',
            subscriptionStatus: keyStatus === 'expired' ? 'expired' : 'cancelled',
            subscriptionExpiresAt: data.license_key?.expires_at || null,
            error: wasPro
              ? `Pro subscription ${keyStatus === 'expired' ? 'expired' : 'cancelled'} — reverting to Basic`
              : data.error || 'License expired',
          };
        }
        return { valid: false, tier: 'unlicensed', subscriptionStatus: null, subscriptionExpiresAt: null, error: data.error || 'Invalid license key' };
      }

      // Determine tier from the product/variant name
      const productName = (data.meta?.product_name || '').toLowerCase();
      const variantName = (data.meta?.variant_name || '').toLowerCase();
      let tier: AppTier = 'basic';

      if (productName.includes('pro') || variantName.includes('pro')) {
        tier = 'pro';
      }

      // Check subscription status for Pro (annual subscription)
      let subscriptionStatus: string | null = null;
      let subscriptionExpiresAt: string | null = null;

      if (data.license_key?.status === 'active') {
        subscriptionStatus = 'active';
      } else if (data.license_key?.status === 'expired') {
        subscriptionStatus = 'expired';
        // Pro subscription expired → basic (they still own the documentation tool)
        if (tier === 'pro') tier = 'basic';
      } else if (data.license_key?.status === 'disabled') {
        subscriptionStatus = 'cancelled';
        // Pro subscription cancelled → basic (they still own the documentation tool)
        if (tier === 'pro') tier = 'basic';
      }

      if (data.license_key?.expires_at) {
        subscriptionExpiresAt = data.license_key.expires_at;
      }

      return { valid: true, tier, subscriptionStatus, subscriptionExpiresAt };
    } catch (err: any) {
      console.warn('Lemon Squeezy validation failed (offline?):', err?.message);
      // Return null to indicate network failure — caller should use cached state
      return { valid: false, tier: 'unlicensed', subscriptionStatus: null, subscriptionExpiresAt: null, error: 'network_error' };
    }
  }

  /**
   * Activate a license key via the Lemon Squeezy /activate endpoint.
   * This registers this machine as an instance (counts toward the device limit).
   */
  async function activateLemonSqueezyLicense(licenseKey: string): Promise<{
    valid: boolean;
    tier: AppTier;
    subscriptionStatus: string | null;
    subscriptionExpiresAt: string | null;
    instanceId: string | null;
    activationLimit: number | null;
    activationUsage: number | null;
    error?: string;
  }> {
    try {
      const response = await fetch('https://api.lemonsqueezy.com/v1/licenses/activate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          license_key: licenseKey,
          instance_name: os.hostname(),
        }),
      });

      const data = await response.json() as any;

      // Check for activation limit reached
      if (!response.ok && data.error) {
        if (data.error === 'This license key has reached its activation limit.' ||
            (data.meta?.activation_usage >= data.meta?.activation_limit)) {
          return {
            valid: false,
            tier: 'unlicensed',
            subscriptionStatus: null,
            subscriptionExpiresAt: null,
            instanceId: null,
            activationLimit: data.meta?.activation_limit || 2,
            activationUsage: data.meta?.activation_usage || null,
            error: 'activation_limit_reached',
          };
        }
        return {
          valid: false,
          tier: 'unlicensed',
          subscriptionStatus: null,
          subscriptionExpiresAt: null,
          instanceId: null,
          activationLimit: null,
          activationUsage: null,
          error: data.error,
        };
      }

      if (!data.activated) {
        return {
          valid: false,
          tier: 'unlicensed',
          subscriptionStatus: null,
          subscriptionExpiresAt: null,
          instanceId: null,
          activationLimit: null,
          activationUsage: null,
          error: data.error || 'Activation failed',
        };
      }

      // Determine tier from product/variant name (same logic as validate)
      const productName = (data.meta?.product_name || '').toLowerCase();
      const variantName = (data.meta?.variant_name || '').toLowerCase();
      let tier: AppTier = 'basic';
      if (productName.includes('pro') || variantName.includes('pro')) {
        tier = 'pro';
      }

      // Subscription status (same logic as validate)
      let subscriptionStatus: string | null = null;
      let subscriptionExpiresAt: string | null = null;

      if (data.license_key?.status === 'active') {
        subscriptionStatus = 'active';
      } else if (data.license_key?.status === 'expired') {
        subscriptionStatus = 'expired';
        if (tier === 'pro') tier = 'basic';
      } else if (data.license_key?.status === 'disabled') {
        subscriptionStatus = 'cancelled';
        if (tier === 'pro') tier = 'basic';
      }

      if (data.license_key?.expires_at) {
        subscriptionExpiresAt = data.license_key.expires_at;
      }

      return {
        valid: true,
        tier,
        subscriptionStatus,
        subscriptionExpiresAt,
        instanceId: data.instance?.id || null,
        activationLimit: data.meta?.activation_limit || null,
        activationUsage: data.meta?.activation_usage || null,
      };
    } catch (err: any) {
      console.warn('Lemon Squeezy activation failed (offline?):', err?.message);
      return {
        valid: false,
        tier: 'unlicensed',
        subscriptionStatus: null,
        subscriptionExpiresAt: null,
        instanceId: null,
        activationLimit: null,
        activationUsage: null,
        error: 'network_error',
      };
    }
  }

  safeHandle('license:getStatus', () => {
    // In development mode or when FORCE_PRO is enabled, grant Pro tier access for testing
    if (isDev || FORCE_PRO) {
      return {
        tier: 'pro' as AppTier,
        licenseKey: 'DEV_MODE',
        activatedAt: new Date().toISOString(),
        subscriptionStatus: 'active' as const,
        subscriptionExpiresAt: null,
        lastValidatedAt: new Date().toISOString(),
        trialActive: false,
        trialExpired: false,
        trialDaysRemaining: 0,
      };
    }

    const { effectiveTier, trialActive, trialExpired, trialDaysRemaining } = getEffectiveTier();
    const licenseKey = getSetting('license_key');
    const activatedAt = getSetting('license_activated_at');
    const subscriptionStatus = getSetting('subscription_status') as 'active' | 'expired' | 'cancelled' | null;
    const subscriptionExpiresAt = getSetting('subscription_expires_at');
    const lastValidatedAt = getSetting('last_license_validation');

    return {
      tier: effectiveTier,
      licenseKey,
      activatedAt,
      subscriptionStatus,
      subscriptionExpiresAt,
      lastValidatedAt,
      trialActive,
      trialExpired,
      trialDaysRemaining,
    };
  });

  safeHandle('license:activate', async (_event, licenseKey: string) => {
    // Activate via Lemon Squeezy /activate endpoint (registers this device)
    const result = await activateLemonSqueezyLicense(licenseKey);

    if (result.error === 'network_error') {
      return {
        success: false,
        tier: 'unlicensed' as AppTier,
        error: 'Unable to validate license. Please check your internet connection and try again.',
      };
    }

    if (result.error === 'activation_limit_reached') {
      return {
        success: false,
        tier: 'unlicensed' as AppTier,
        error: `This license key is already active on ${result.activationUsage} of ${result.activationLimit} allowed devices. Please deactivate one of your other devices first, then try again.`,
      };
    }

    if (!result.valid) {
      return { success: false, tier: 'unlicensed' as AppTier, error: result.error || 'Invalid license key' };
    }

    // Store license info including instance_id
    setSetting('license_key', licenseKey);
    setSetting('app_tier', result.tier);
    setSetting('license_activated_at', new Date().toISOString());
    setSetting('last_license_validation', new Date().toISOString());
    if (result.instanceId) {
      setSetting('license_instance_id', result.instanceId);
    }
    if (result.subscriptionStatus) {
      setSetting('subscription_status', result.subscriptionStatus);
    }
    if (result.subscriptionExpiresAt) {
      setSetting('subscription_expires_at', result.subscriptionExpiresAt);
    }

    return { success: true, tier: result.tier };
  });

  safeHandle('license:deactivate', async () => {
    const licenseKey = getSetting('license_key');
    const instanceId = getSetting('license_instance_id');

    // Call Lemon Squeezy deactivate API to free the activation slot
    if (licenseKey && instanceId) {
      try {
        await fetch('https://api.lemonsqueezy.com/v1/licenses/deactivate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            license_key: licenseKey,
            instance_id: instanceId,
          }),
        });
      } catch (err: any) {
        // Log but don't block — user should still be able to deactivate locally
        // The activation slot will be freed on next validation or can be
        // managed through Lemon Squeezy dashboard
        console.warn('Failed to deactivate with Lemon Squeezy:', err?.message);
      }
    }

    // Clear local settings regardless of API result
    deleteSetting('license_key');
    setSetting('app_tier', 'unlicensed');
    deleteSetting('license_activated_at');
    deleteSetting('license_instance_id');
    deleteSetting('subscription_status');
    deleteSetting('subscription_expires_at');
    deleteSetting('last_license_validation');

    return { success: true, tier: 'unlicensed' as AppTier };
  });

  safeHandle('license:getActivationInfo', async () => {
    const licenseKey = getSetting('license_key');
    if (!licenseKey) {
      return { activationUsage: 0, activationLimit: 2 };
    }

    // Use validate (not activate) to check current usage without consuming a slot
    try {
      const response = await fetch('https://api.lemonsqueezy.com/v1/licenses/validate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ license_key: licenseKey }),
      });
      const data = await response.json() as any;
      return {
        activationUsage: data.meta?.activation_usage ?? null,
        activationLimit: data.meta?.activation_limit ?? 2,
      };
    } catch {
      return { activationUsage: null, activationLimit: 2 };
    }
  });

  // Background re-validation: check license every 7-14 days
  async function backgroundLicenseValidation() {
    const licenseKey = getSetting('license_key');
    if (!licenseKey) return;

    const lastValidated = getSetting('last_license_validation');
    if (lastValidated) {
      const daysSinceValidation = (Date.now() - new Date(lastValidated).getTime()) / (1000 * 60 * 60 * 24);
      if (daysSinceValidation < 7) return; // Re-validate every 7 days minimum
    }

    const result = await validateLemonSqueezyLicense(licenseKey);

    if (result.error === 'network_error') {
      // Offline — check grace period (30 days)
      if (lastValidated) {
        const daysSince = (Date.now() - new Date(lastValidated).getTime()) / (1000 * 60 * 60 * 24);
        if (daysSince > 30) {
          console.warn('License validation grace period expired (30 days offline)');
          // Don't downgrade yet, but flag for user notification
          setSetting('license_grace_expired', 'true');
        }
      }
      return;
    }

    if (result.valid) {
      setSetting('app_tier', result.tier);
      setSetting('last_license_validation', new Date().toISOString());
      deleteSetting('license_grace_expired');
      if (result.subscriptionStatus) {
        setSetting('subscription_status', result.subscriptionStatus);
      }
      if (result.subscriptionExpiresAt) {
        setSetting('subscription_expires_at', result.subscriptionExpiresAt);
      }
    } else {
      // License no longer valid — use the tier from validation
      // (expired/cancelled Pro keys return 'basic', truly invalid keys return 'unlicensed')
      setSetting('app_tier', result.tier);
      if (result.subscriptionStatus) {
        setSetting('subscription_status', result.subscriptionStatus);
      } else {
        deleteSetting('subscription_status');
      }
      if (result.subscriptionExpiresAt) {
        setSetting('subscription_expires_at', result.subscriptionExpiresAt);
      } else {
        deleteSetting('subscription_expires_at');
      }
    }
  }

  // Startup validation: always validate on every app launch (no day-gate).
  // Runs after a short delay so the window is already up & network is likely ready.
  async function startupLicenseValidation() {
    const licenseKey = getSetting('license_key');
    if (!licenseKey) return;

    const result = await validateLemonSqueezyLicense(licenseKey);

    if (result.error === 'network_error') {
      // Offline — fall through to cached tier; grace period handled by background check
      return;
    }

    // Apply the result (same logic as backgroundLicenseValidation)
    setSetting('app_tier', result.tier);
    setSetting('last_license_validation', new Date().toISOString());
    if (result.valid) {
      deleteSetting('license_grace_expired');
    }
    if (result.subscriptionStatus) {
      setSetting('subscription_status', result.subscriptionStatus);
    } else {
      deleteSetting('subscription_status');
    }
    if (result.subscriptionExpiresAt) {
      setSetting('subscription_expires_at', result.subscriptionExpiresAt);
    } else {
      deleteSetting('subscription_expires_at');
    }

    // Notify the renderer so the UI reflects the updated tier immediately
    const wins = BrowserWindow.getAllWindows();
    for (const w of wins) {
      w.webContents.send('license:tierChanged', result.tier);
    }
  }

  // Run startup validation after 5 seconds (window up, network ready)
  setTimeout(() => startupLicenseValidation(), 5000);

  // Background re-validation every 6 hours (the 7-day gate still applies for the periodic check)
  const licenseIntervalId = setInterval(() => backgroundLicenseValidation(), 6 * 60 * 60 * 1000);

  // ── Graceful shutdown: close DB + clear intervals ──
  app.on('before-quit', () => {
    clearInterval(licenseIntervalId);
    closeDatabase();
  });

  // ── Tier-Gated Helper ──
  function requireTier(requiredTier: 'basic' | 'pro'): void {
    if (FORCE_PRO) return; // Bypass tier check when workshopping Pro features
    const { effectiveTier } = getEffectiveTier();
    const tierRank = { unlicensed: 0, basic: 1, pro: 2 };
    if (tierRank[effectiveTier] < tierRank[requiredTier]) {
      throw new Error(`This feature requires PocketChart ${requiredTier === 'pro' ? 'Pro' : 'Basic'}. Please upgrade to access this feature.`);
    }
  }

  // ── Backup & Export ──
  const dbPath = path.join(getDataPath(), 'pocketchart.db');

  safeHandle('backup:exportManual', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export Database Backup',
      defaultPath: `pocketchart_backup_${new Date().toISOString().slice(0, 10)}.pcbackup`,
      filters: [
        { name: 'PocketChart Backup', extensions: ['pcbackup'] },
        { name: 'SQLite Database (legacy)', extensions: ['db'] },
      ],
    });
    if (canceled || !filePath) return null;

    if (filePath.endsWith('.pcbackup')) {
      // Create zip archive containing DB + keystore
      await new Promise<void>((resolve, reject) => {
        const output = fs.createWriteStream(filePath);
        const archive = archiver('zip', { zlib: { level: 1 } }); // minimal compression — DB is already encrypted
        output.on('close', () => resolve());
        archive.on('error', (err: Error) => reject(err));
        archive.pipe(output);
        archive.file(dbPath, { name: 'pocketchart.db' });
        // Include keystore data
        const keystoreData = loadKeystore();
        if (keystoreData) {
          archive.append(JSON.stringify(keystoreData, null, 2), { name: 'keystore.json' });
        }
        archive.finalize();
      });
    } else {
      // Legacy .db export
      fs.copyFileSync(dbPath, filePath);
    }

    // Stamp the last backup date so the dashboard can show reminders
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_backup_date', ?)").run(new Date().toISOString());
    auditLog({ actionType: 'bulk_export_performed', entityType: 'backup', detail: { export_type: 'database', format: filePath.endsWith('.pcbackup') ? 'pcbackup' : 'legacy_db' } });
    return filePath;
  });

  safeHandle('backup:getDbPath', () => {
    return dbPath;
  });

  safeHandle('backup:exportClientPdf', (_event, { clientId }: { clientId: number }) => {
    const pdfBuffer = buildClientChartPdf(clientId);
    auditLog({ actionType: 'chart_exported', entityType: 'client', entityId: clientId, clientId, detail: { export_type: 'clinical' } });
    return pdfBuffer.toString('base64');
  });

  safeHandle('backup:exportAllChartsPdf', async () => {
    const clients = db.prepare('SELECT * FROM clients WHERE deleted_at IS NULL ORDER BY last_name, first_name').all() as any[];
    if (clients.length === 0) throw new Error('No clients to export');

    const today = new Date().toISOString().slice(0, 10);
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Choose Export Folder',
      properties: ['openDirectory'],
    });
    if (canceled || !filePaths?.[0]) return null;

    const exportRoot = path.join(filePaths[0], `PocketChart_Export_${today}`);
    fs.mkdirSync(exportRoot, { recursive: true });

    const noteFormatVal = (db.prepare("SELECT value FROM settings WHERE key = 'note_format'").get() as any)?.value || 'SOAP';
    const pdfSections = NOTE_FORMAT_SECTIONS[noteFormatVal as NoteFormat].filter((s: any) => s.label !== '(unused)');
    let totalDocs = 0;

    for (let ci = 0; ci < clients.length; ci++) {
      const client = clients[ci];
      const safeLast = (client.last_name || 'Unknown').replace(/[^a-zA-Z0-9_-]/g, '');
      const safeFirst = (client.first_name || 'Unknown').replace(/[^a-zA-Z0-9_-]/g, '');
      const clientDir = path.join(exportRoot, `${safeLast}_${safeFirst}`);
      fs.mkdirSync(clientDir, { recursive: true });

      // Send progress to renderer
      mainWindow?.webContents.send('export:progress', {
        current: ci + 1,
        total: clients.length,
        clientName: `${client.first_name} ${client.last_name}`,
      });

      // Export evaluations as individual PDFs
      const evals = db.prepare('SELECT * FROM evaluations WHERE client_id = ? AND deleted_at IS NULL ORDER BY eval_date DESC').all(client.id) as any[];
      for (const evalItem of evals) {
        try {
          const pdfBuffer = buildSingleEvalPdf(client, evalItem);
          const dateStr = evalItem.eval_date || 'undated';
          fs.writeFileSync(path.join(clientDir, `Evaluation_${dateStr}.pdf`), pdfBuffer);
          totalDocs++;
        } catch (err) {
          console.error(`Failed to generate eval PDF for client ${client.id}, eval ${evalItem.id}:`, err);
        }
      }

      // Export notes as individual PDFs
      const notes = db.prepare('SELECT * FROM notes WHERE client_id = ? AND deleted_at IS NULL ORDER BY date_of_service DESC').all(client.id) as any[];
      for (const note of notes) {
        try {
          const pdfBuffer = buildSingleNotePdf(client, note, pdfSections);
          const dateStr = note.date_of_service || 'undated';
          let docType = 'SOAP';
          if (note.note_type === 'progress_report') docType = 'Progress_Report';
          else if (note.note_type === 'discharge') docType = 'Discharge_Summary';
          fs.writeFileSync(path.join(clientDir, `${docType}_${dateStr}.pdf`), pdfBuffer);
          totalDocs++;
        } catch (err) {
          console.error(`Failed to generate note PDF for client ${client.id}, note ${note.id}:`, err);
        }
      }

      // If client has no docs, export their chart summary as a single PDF
      if (evals.length === 0 && notes.length === 0) {
        try {
          const pdfBuffer = buildClientChartPdf(client.id);
          fs.writeFileSync(path.join(clientDir, `Client_Summary.pdf`), pdfBuffer);
          totalDocs++;
        } catch (err) {
          console.error(`Failed to generate summary PDF for client ${client.id}:`, err);
        }
      }
    }

    return { path: exportRoot, clientCount: clients.length, documentCount: totalDocs };
  });

  safeHandle('backup:savePdf', async (_event, { base64Pdf, defaultFilename }: { base64Pdf: string; defaultFilename: string }) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Save Client Chart PDF',
      defaultPath: defaultFilename,
      filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) return null;
    const buffer = Buffer.from(base64Pdf, 'base64');
    fs.writeFileSync(filePath, buffer);
    return filePath;
  });

  safeHandle('backup:exportCsv', async () => {
    const clients = db.prepare('SELECT * FROM clients WHERE deleted_at IS NULL ORDER BY last_name, first_name').all() as any[];

    const headers = ['first_name', 'last_name', 'dob', 'phone', 'email', 'discipline', 'status', 'primary_dx_code', 'primary_dx_description', 'created_at'];
    const escapeCsv = (val: any): string => {
      const str = val == null ? '' : String(val);
      if (str.includes(',') || str.includes('"') || str.includes('\n')) {
        return `"${str.replace(/"/g, '""')}"`;
      }
      return str;
    };

    const rows = [headers.join(',')];
    for (const client of clients) {
      rows.push(headers.map((h) => escapeCsv(client[h])).join(','));
    }
    const csvContent = rows.join('\n');

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export All Clients (CSV)',
      defaultPath: `pocketchart_clients_${new Date().toISOString().slice(0, 10)}.csv`,
      filters: [{ name: 'CSV File', extensions: ['csv'] }],
    });
    if (canceled || !filePath) return null;
    fs.writeFileSync(filePath, csvContent, 'utf-8');
    return filePath;
  });

  // ── Superbill ──

  function buildSuperbillPdf(client: any, notesData: any[], practice: any): { base64Pdf: string; filename: string } {
    const doc = new jsPDF({ unit: 'pt', format: 'letter' });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const marginLeft = 40;
    const marginRight = 40;
    const maxWidth = pageWidth - marginLeft - marginRight;
    let y = 40;

    const checkPageBreak = (needed: number) => {
      if (y + needed > pageHeight - 60) {
        doc.addPage();
        y = 40;
      }
    };

    // ── Header: Practice Info with Logo ──
    let textStartX = marginLeft;
    const logoData = getLogoBase64();
    if (logoData) {
      try {
        const logoFormat = logoData.includes('image/png') ? 'PNG' : 'JPEG';
        doc.addImage(logoData, logoFormat, marginLeft, y - 6, 48, 48);
        textStartX = marginLeft + 56;
      } catch { /* skip logo */ }
    }

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(PDF_COLORS.heading[0], PDF_COLORS.heading[1], PDF_COLORS.heading[2]);
    doc.text(practice?.name || 'Practice Name', textStartX, y);
    y += 14;
    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(PDF_COLORS.label[0], PDF_COLORS.label[1], PDF_COLORS.label[2]);
    if (practice?.address) {
      const addrLine = [practice.address, practice.city, practice.state, practice.zip].filter(Boolean).join(', ');
      doc.text(addrLine, textStartX, y);
      y += 11;
    }
    if (practice?.phone) {
      doc.text(`Phone: ${practice.phone}`, textStartX, y);
      y += 11;
    }

    const npiTaxParts: string[] = [];
    if (practice?.npi) npiTaxParts.push(`NPI: ${practice.npi}`);
    if (practice?.tax_id) npiTaxParts.push(`Tax ID: ${practice.tax_id}`);
    if (npiTaxParts.length > 0) {
      doc.text(npiTaxParts.join('  |  '), textStartX, y);
      y += 11;
    }

    // Make sure y is past the logo
    if (logoData) y = Math.max(y, 90);
    y += 4;
    doc.setLineWidth(1.5);
    doc.setDrawColor(PDF_COLORS.accent[0], PDF_COLORS.accent[1], PDF_COLORS.accent[2]);
    doc.line(marginLeft, y, pageWidth - marginRight, y);
    doc.setDrawColor(0, 0, 0);
    doc.setTextColor(PDF_COLORS.body[0], PDF_COLORS.body[1], PDF_COLORS.body[2]);
    y += 16;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('SUPERBILL / STATEMENT OF SERVICES', marginLeft, y);
    y += 20;

    // ── Client Info Section ──
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Patient Information', marginLeft, y);
    y += 14;

    doc.setFontSize(9);
    const clientInfoLeft = marginLeft;
    const clientInfoRight = pageWidth / 2 + 20;

    doc.setFont('helvetica', 'bold');
    doc.text('Name: ', clientInfoLeft, y);
    doc.setFont('helvetica', 'normal');
    doc.text(`${client.first_name} ${client.last_name}`, clientInfoLeft + doc.getTextWidth('Name: '), y);

    if (client.dob) {
      doc.setFont('helvetica', 'bold');
      doc.text('DOB: ', clientInfoRight, y);
      doc.setFont('helvetica', 'normal');
      doc.text(client.dob, clientInfoRight + doc.getTextWidth('DOB: '), y);
    }
    y += 13;

    if (client.address) {
      doc.setFont('helvetica', 'bold');
      doc.text('Address: ', clientInfoLeft, y);
      doc.setFont('helvetica', 'normal');
      doc.text(client.address, clientInfoLeft + doc.getTextWidth('Address: '), y);
      y += 13;
    }

    y += 6;

    // ── Insurance Info Section (skip entirely if no insurance data) ──
    if (client.insurance_payer || client.insurance_member_id) {
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text('Insurance Information', marginLeft, y);
      y += 14;
      doc.setFontSize(9);

      if (client.insurance_payer) {
        doc.setFont('helvetica', 'bold');
        doc.text('Payer: ', clientInfoLeft, y);
        doc.setFont('helvetica', 'normal');
        doc.text(client.insurance_payer, clientInfoLeft + doc.getTextWidth('Payer: '), y);
        y += 13;
      }

      if (client.insurance_member_id) {
        doc.setFont('helvetica', 'bold');
        doc.text('Member ID: ', clientInfoLeft, y);
        doc.setFont('helvetica', 'normal');
        doc.text(client.insurance_member_id, clientInfoLeft + doc.getTextWidth('Member ID: '), y);
        y += 13;
      }
    }

    if (client.insurance_group) {
      doc.setFont('helvetica', 'bold');
      doc.text('Group #: ', clientInfoRight, y);
      doc.setFont('helvetica', 'normal');
      doc.text(client.insurance_group, clientInfoRight + doc.getTextWidth('Group #: '), y);
    }
    y += 18;

    doc.setLineWidth(0.5);
    doc.line(marginLeft, y, pageWidth - marginRight, y);
    y += 14;

    // ── Diagnosis Codes ──
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Diagnosis Codes', marginLeft, y);
    y += 14;
    doc.setFontSize(9);

    let dxIndex = 1;
    if (client.primary_dx_code) {
      doc.setFont('helvetica', 'bold');
      doc.text(`Dx ${dxIndex}: `, marginLeft, y);
      doc.setFont('helvetica', 'normal');
      const dxText = `${client.primary_dx_code}${client.primary_dx_description ? ' - ' + client.primary_dx_description : ''}`;
      doc.text(dxText, marginLeft + doc.getTextWidth(`Dx ${dxIndex}: `), y);
      y += 13;
      dxIndex++;
    }

    let secondaryDxList: string[] = [];
    try {
      const parsed = JSON.parse(client.secondary_dx || '[]');
      if (Array.isArray(parsed)) {
        secondaryDxList = parsed;
      }
    } catch { /* ignore parse errors */ }

    for (const sdx of secondaryDxList) {
      checkPageBreak(14);
      doc.setFont('helvetica', 'bold');
      doc.text(`Dx ${dxIndex}: `, marginLeft, y);
      doc.setFont('helvetica', 'normal');
      doc.text(String(sdx), marginLeft + doc.getTextWidth(`Dx ${dxIndex}: `), y);
      y += 13;
      dxIndex++;
    }

    y += 8;

    // ── Services Table ──
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Services Rendered', marginLeft, y);
    y += 16;

    const colDate = marginLeft;
    const colCpt = marginLeft + 120;
    const colUnits = marginLeft + 230;
    const colDx = marginLeft + 290;
    const colTimeIn = marginLeft + 410;

    doc.setFontSize(8);
    doc.setFont('helvetica', 'bold');
    doc.setFillColor(240, 240, 240);
    doc.rect(marginLeft, y - 10, maxWidth, 14, 'F');
    doc.text('Date of Service', colDate, y);
    doc.text('CPT Code', colCpt, y);
    doc.text('Units', colUnits, y);
    doc.text('Diagnosis Ptr', colDx, y);
    doc.text('Time', colTimeIn, y);
    y += 16;

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    const sortedNotes = [...notesData].sort(
      (a, b) => new Date(a.date_of_service).getTime() - new Date(b.date_of_service).getTime()
    );

    for (let i = 0; i < sortedNotes.length; i++) {
      const note = sortedNotes[i];
      checkPageBreak(18);

      if (i % 2 === 0) {
        doc.setFillColor(250, 250, 250);
        doc.rect(marginLeft, y - 10, maxWidth, 14, 'F');
      }

      doc.text(note.date_of_service || '--', colDate, y);
      doc.text(note.cpt_code || client.default_cpt_code || '--', colCpt, y);
      doc.text(String(note.units || '1'), colUnits, y);

      const dxPointer = client.primary_dx_code ? '1' : '--';
      doc.text(dxPointer, colDx, y);

      const timeStr = (note.time_in && note.time_out) ? `${note.time_in}-${note.time_out}` : '--';
      doc.text(timeStr, colTimeIn, y);

      y += 16;
    }

    y += 4;
    doc.setLineWidth(0.5);
    doc.line(marginLeft, y, pageWidth - marginRight, y);
    y += 14;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`Total Sessions: ${sortedNotes.length}`, marginLeft, y);

    const totalUnits = sortedNotes.reduce((sum: number, n: any) => sum + (n.units || 1), 0);
    doc.text(`Total Units: ${totalUnits}`, colCpt, y);
    y += 24;

    // ── Referring Physician ──
    checkPageBreak(50);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Referring Physician', marginLeft, y);
    y += 14;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');

    if (client.referring_physician) {
      doc.text(`Name: ${client.referring_physician}`, marginLeft, y);
      y += 13;
    }
    if (client.referring_npi) {
      doc.text(`NPI: ${client.referring_npi}`, marginLeft, y);
      y += 13;
    }
    y += 14;

    // ── Provider Signature ──
    checkPageBreak(70);
    doc.setLineWidth(0.5);
    doc.line(marginLeft, y, pageWidth - marginRight, y);
    y += 20;

    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Provider Attestation', marginLeft, y);
    y += 16;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('I certify that the services listed above were medically necessary and were personally rendered', marginLeft, y);
    y += 12;
    doc.text('by me or under my direct supervision.', marginLeft, y);
    y += 30;

    doc.setLineWidth(0.5);
    doc.line(marginLeft, y, marginLeft + 250, y);
    y += 14;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');

    const providerLine = practice?.name || 'Provider Name';
    const credentialParts: string[] = [];
    if (practice?.discipline) credentialParts.push(practice.discipline);
    if (practice?.license_number && practice?.license_state) {
      credentialParts.push(`Lic# ${practice.license_number} (${practice.license_state})`);
    }
    const fullProviderLine = credentialParts.length > 0
      ? `${providerLine}, ${credentialParts.join(', ')}`
      : providerLine;
    doc.text(fullProviderLine, marginLeft, y);
    y += 13;
    if (practice?.npi) {
      doc.text(`NPI: ${practice.npi}`, marginLeft, y);
      y += 13;
    }

    y += 10;
    doc.setLineWidth(0.5);
    doc.line(marginLeft, y, marginLeft + 150, y);
    y += 14;
    doc.text('Date', marginLeft, y);

    // Add confidentiality footer to all pages
    const sbTotalPages = doc.getNumberOfPages();
    for (let i = 1; i <= sbTotalPages; i++) {
      doc.setPage(i);
      doc.setFontSize(7);
      doc.setTextColor(128, 128, 128);
      doc.text(
        'This document contains confidential health information. Unauthorized disclosure is prohibited.',
        pageWidth / 2,
        pageHeight - 20,
        { align: 'center' }
      );
      if (sbTotalPages > 1) {
        doc.text(`Page ${i} of ${sbTotalPages}`, pageWidth / 2, pageHeight - 12, { align: 'center' });
      }
      doc.setTextColor(0, 0, 0);
    }

    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `Superbill_${client.last_name}_${client.first_name}_${dateStr}.pdf`;

    const pdfOutput = doc.output('arraybuffer');
    const base64Pdf = Buffer.from(pdfOutput).toString('base64');

    return { base64Pdf, filename };
  }

  safeHandle('superbill:generate', (_event, data: { clientId: number; noteIds: number[]; practiceInfo?: any }) => {
    const client = db.prepare('SELECT * FROM clients WHERE id = ? AND deleted_at IS NULL').get(data.clientId) as any;
    if (!client) throw new Error('Client not found');

    const practice = data.practiceInfo || db.prepare('SELECT * FROM practice WHERE id = 1').get() || {};

    if (!data.noteIds || data.noteIds.length === 0) {
      throw new Error('No note IDs provided');
    }
    const placeholders = data.noteIds.map(() => '?').join(',');
    const notesData = db.prepare(
      `SELECT * FROM notes WHERE id IN (${placeholders}) AND client_id = ? AND deleted_at IS NULL ORDER BY date_of_service`
    ).all(...data.noteIds, data.clientId) as any[];

    return buildSuperbillPdf(client, notesData, practice);
  });

  safeHandle('superbill:save', async (_event, data: { base64Pdf: string; filename: string }) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Save Superbill PDF',
      defaultPath: data.filename,
      filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) return false;
    const buffer = Buffer.from(data.base64Pdf, 'base64');
    fs.writeFileSync(filePath, buffer);
    return true;
  });

  safeHandle('superbill:generateBulk', (_event, data: { clientId: number; startDate: string; endDate: string }) => {
    const client = db.prepare('SELECT * FROM clients WHERE id = ? AND deleted_at IS NULL').get(data.clientId) as any;
    if (!client) throw new Error('Client not found');

    const practice = db.prepare('SELECT * FROM practice WHERE id = 1').get() || {};

    const notesData = db.prepare(
      `SELECT * FROM notes WHERE client_id = ? AND date_of_service >= ? AND date_of_service <= ? AND deleted_at IS NULL ORDER BY date_of_service`
    ).all(data.clientId, data.startDate, data.endDate) as any[];

    if (notesData.length === 0) {
      throw new Error('No notes found in the specified date range');
    }

    return buildSuperbillPdf(client, notesData, practice);
  });

  // ── CMS-1500 Claim Form ──

  // Helper to read CMS-1500 print options from settings
  function getCMS1500Options(): CMS1500Options {
    const printMode = (db.prepare("SELECT value FROM settings WHERE key = 'cms1500_print_mode'")
      .get() as any)?.value || 'full';
    const offsetX = parseFloat(
      (db.prepare("SELECT value FROM settings WHERE key = 'cms1500_offset_x'")
        .get() as any)?.value || '0'
    );
    const offsetY = parseFloat(
      (db.prepare("SELECT value FROM settings WHERE key = 'cms1500_offset_y'")
        .get() as any)?.value || '0'
    );
    return {
      printMode: printMode as CMS1500PrintMode,
      offsetX,
      offsetY,
    };
  }

  safeHandle('cms1500:generate', (_event, data: { clientId: number; noteIds: number[]; printMode?: 'full' | 'data-only' }) => {
    const client = db.prepare('SELECT * FROM clients WHERE id = ? AND deleted_at IS NULL').get(data.clientId) as any;
    if (!client) throw new Error('Client not found');

    const practice = db.prepare('SELECT * FROM practice WHERE id = 1').get() || {};

    if (!data.noteIds || data.noteIds.length === 0) {
      throw new Error('No note IDs provided');
    }
    const placeholders = data.noteIds.map(() => '?').join(',');
    const notesData = db.prepare(
      `SELECT * FROM notes WHERE id IN (${placeholders}) AND client_id = ? AND deleted_at IS NULL ORDER BY date_of_service`
    ).all(...data.noteIds, data.clientId) as any[];

    const cms1500Data = assembleCMS1500Data({ client, practice, notes: notesData });
    const options = getCMS1500Options();
    if (data.printMode) options.printMode = data.printMode;
    const base64Pdf = generateCMS1500(cms1500Data, options);

    const dateStr = new Date().toISOString().slice(0, 10);
    const filename = `CMS1500_${client.last_name}_${client.first_name}_${dateStr}.pdf`;

    return { base64Pdf, filename };
  });

  safeHandle('cms1500:save', async (_event, data: { base64Pdf: string; filename: string }) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Save CMS-1500 PDF',
      defaultPath: data.filename,
      filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) return null;
    const buffer = Buffer.from(data.base64Pdf, 'base64');
    fs.writeFileSync(filePath, buffer);
    return filePath;
  });

  safeHandle('cms1500:openPreview', async (_event, data: { base64Pdf: string; filename: string }) => {
    const tempDir = path.join(os.tmpdir(), 'pocketchart-preview');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    // Sanitize filename — remove characters illegal in Windows paths
    const safeFilename = data.filename.replace(/[<>:"/\\|?*]/g, '_');
    const tempPath = path.join(tempDir, safeFilename);
    fs.writeFileSync(tempPath, Buffer.from(data.base64Pdf, 'base64'));
    await shell.openPath(tempPath);
    return tempPath;
  });

  safeHandle('cms1500:getUnbilledClients', () => {
    // Get all clients who have at least one signed note with NULL cms1500_generated_at
    const clients = db.prepare(`
      SELECT DISTINCT c.* FROM clients c
      INNER JOIN notes n ON n.client_id = c.id
      WHERE c.deleted_at IS NULL
        AND n.deleted_at IS NULL
        AND n.signed_at IS NOT NULL
        AND n.cms1500_generated_at IS NULL
      ORDER BY c.last_name, c.first_name
    `).all() as any[];

    return clients.map((client: any) => {
      const unbilledNotes = db.prepare(`
        SELECT id, date_of_service, cpt_code, cpt_codes, charge_amount, signed_at
        FROM notes
        WHERE client_id = ? AND deleted_at IS NULL
          AND signed_at IS NOT NULL
          AND cms1500_generated_at IS NULL
        ORDER BY date_of_service
      `).all(client.id) as any[];

      return {
        id: client.id,
        first_name: client.first_name,
        last_name: client.last_name,
        insurance_payer: client.insurance_payer || '',
        insurance_member_id: client.insurance_member_id || '',
        primary_dx_code: client.primary_dx_code || '',
        unbilledNoteCount: unbilledNotes.length,
        unbilledNotes,
        // Pass full client for renderer-side readiness computation
        _fullClient: client,
      };
    });
  });

  safeHandle('cms1500:generateBulk', (_event, data: {
    entries: Array<{ clientId: number; noteIds: number[] }>;
    outputMode: 'combined' | 'separate';
    printMode?: 'full' | 'data-only';
  }) => {
    const practice = db.prepare('SELECT * FROM practice WHERE id = 1').get() || {};
    const options = getCMS1500Options();
    if (data.printMode) options.printMode = data.printMode;
    const results: Array<{ base64Pdf: string; filename: string; clientId: number }> = [];
    const allNoteIds: number[] = [];
    const dateStr = new Date().toISOString().slice(0, 10);

    if (data.outputMode === 'combined') {
      // Create a single jsPDF document with all clients' CMS-1500 forms
      const { jsPDF } = require('jspdf');
      const doc = new jsPDF({ orientation: 'portrait', unit: 'pt', format: 'letter' });
      let firstClient = true;

      for (const entry of data.entries) {
        const client = db.prepare('SELECT * FROM clients WHERE id = ? AND deleted_at IS NULL').get(entry.clientId) as any;
        if (!client || !entry.noteIds.length) continue;

        const placeholders = entry.noteIds.map(() => '?').join(',');
        const notesData = db.prepare(
          `SELECT * FROM notes WHERE id IN (${placeholders}) AND client_id = ? AND deleted_at IS NULL ORDER BY date_of_service`
        ).all(...entry.noteIds, entry.clientId) as any[];
        if (!notesData.length) continue;

        const cms1500Data = assembleCMS1500Data({ client, practice, notes: notesData });

        if (!firstClient) doc.addPage();
        firstClient = false;

        renderCMS1500Pages(doc, cms1500Data, options);
        allNoteIds.push(...entry.noteIds);
      }

      if (!firstClient) {
        const base64Pdf = doc.output('datauristring').split(',')[1];
        results.push({ base64Pdf, filename: `CMS1500_Batch_${dateStr}.pdf`, clientId: 0 });
      }
    } else {
      // Generate separate PDFs per client
      for (const entry of data.entries) {
        const client = db.prepare('SELECT * FROM clients WHERE id = ? AND deleted_at IS NULL').get(entry.clientId) as any;
        if (!client || !entry.noteIds.length) continue;

        const placeholders = entry.noteIds.map(() => '?').join(',');
        const notesData = db.prepare(
          `SELECT * FROM notes WHERE id IN (${placeholders}) AND client_id = ? AND deleted_at IS NULL ORDER BY date_of_service`
        ).all(...entry.noteIds, entry.clientId) as any[];
        if (!notesData.length) continue;

        const cms1500Data = assembleCMS1500Data({ client, practice, notes: notesData });
        const base64Pdf = generateCMS1500(cms1500Data, options);

        results.push({
          base64Pdf,
          filename: `CMS1500_${client.last_name}_${client.first_name}_${dateStr}.pdf`,
          clientId: entry.clientId,
        });
        allNoteIds.push(...entry.noteIds);
      }
    }

    return { pdfs: results, notesMarked: allNoteIds };
  });

  safeHandle('cms1500:markBilled', (_event, noteIds: number[]) => {
    if (!noteIds.length) return;
    const now = new Date().toISOString();
    const placeholders = noteIds.map(() => '?').join(',');
    db.prepare(`UPDATE notes SET cms1500_generated_at = ? WHERE id IN (${placeholders})`).run(now, ...noteIds);
  });

  safeHandle('cms1500:clearBilled', (_event, noteIds: number[]) => {
    if (!noteIds.length) return;
    const placeholders = noteIds.map(() => '?').join(',');
    db.prepare(`UPDATE notes SET cms1500_generated_at = NULL WHERE id IN (${placeholders})`).run(...noteIds);
  });

  safeHandle('cms1500:saveBulk', async (_event, data: { pdfs: Array<{ base64Pdf: string; filename: string }> }) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Choose Folder for CMS-1500 PDFs',
      properties: ['openDirectory'],
    });
    if (canceled || !filePaths?.[0]) return null;

    const folder = filePaths[0];
    for (const pdf of data.pdfs) {
      const buffer = Buffer.from(pdf.base64Pdf, 'base64');
      fs.writeFileSync(path.join(folder, pdf.filename), buffer);
    }
    return folder;
  });

  safeHandle('cms1500:generateAlignmentTest', () => {
    const options = getCMS1500Options();
    const base64Pdf = generateAlignmentTestPage(options);
    return {
      base64Pdf,
      filename: 'CMS1500_Alignment_Test.pdf',
    };
  });

  // ── Storage Location ──
  safeHandle('storage:getDataPath', () => {
    return getDataPath();
  });

  safeHandle('storage:setDataPath', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Choose Data Storage Location',
      properties: ['openDirectory'],
    });
    if (canceled || filePaths.length === 0) return null;

    const newDir = filePaths[0];
    const cloud = detectCloudStorage(newDir);
    const currentDir = getDataPath();
    const currentDbPath = path.join(currentDir, 'pocketchart.db');

    if (fs.existsSync(currentDbPath)) {
      const newDbPath = path.join(newDir, 'pocketchart.db');
      fs.copyFileSync(currentDbPath, newDbPath);
    }

    const logoFiles = fs.readdirSync(currentDir).filter(f => f.startsWith('practice_logo.'));
    for (const logoFile of logoFiles) {
      fs.copyFileSync(path.join(currentDir, logoFile), path.join(newDir, logoFile));
    }

    const docsDir = path.join(currentDir, 'documents');
    if (fs.existsSync(docsDir)) {
      copyDirSync(docsDir, path.join(newDir, 'documents'));
    }

    setDataPath(newDir);
    return { newPath: newDir, cloud };
  });

  // Cloud detection for any path (read-only check)
  safeHandle('storage:detectCloud', (_event: any, folderPath: string) => {
    return detectCloudStorage(folderPath);
  });

  safeHandle('storage:getDefaultPath', () => {
    return getDefaultDataPath();
  });

  safeHandle('storage:resetDataPath', () => {
    resetDataPath();
    return getDefaultDataPath();
  });

  // ── Practice Logo ──
  safeHandle('logo:upload', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Select Practice Logo',
      filters: [{ name: 'Images', extensions: ['png', 'jpg', 'jpeg'] }],
      properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0) return null;

    const selectedFile = filePaths[0];
    const ext = path.extname(selectedFile).toLowerCase();
    const dataDir = getDataPath();
    const destFilename = `practice_logo${ext}`;
    const destPath = path.join(dataDir, destFilename);

    const existingLogos = fs.readdirSync(dataDir).filter(f => f.startsWith('practice_logo.'));
    for (const old of existingLogos) {
      fs.unlinkSync(path.join(dataDir, old));
    }

    fs.copyFileSync(selectedFile, destPath);
    return destPath;
  });

  safeHandle('logo:get', () => {
    const dataDir = getDataPath();
    const files = fs.readdirSync(dataDir).filter(f => f.startsWith('practice_logo.'));
    if (files.length === 0) return null;
    return path.join(dataDir, files[0]);
  });

  safeHandle('logo:getBase64', () => {
    const dataDir = getDataPath();
    const files = fs.readdirSync(dataDir).filter(f => f.startsWith('practice_logo.'));
    if (files.length === 0) return null;

    const filePath = path.join(dataDir, files[0]);
    const ext = path.extname(files[0]).toLowerCase().replace('.', '');
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
    const fileBuffer = fs.readFileSync(filePath);
    return `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
  });

  safeHandle('logo:remove', () => {
    const dataDir = getDataPath();
    const files = fs.readdirSync(dataDir).filter(f => f.startsWith('practice_logo.'));
    for (const f of files) {
      fs.unlinkSync(path.join(dataDir, f));
    }
    return true;
  });

  // ── Client Documents ──
  safeHandle('documents:upload', async (_event, data: {
    clientId: number;
    category?: string;
    certification_period_start?: string;
    certification_period_end?: string;
    received_date?: string;
    sent_date?: string;
    physician_name?: string;
  }) => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Upload Document',
      filters: [
        { name: 'Documents', extensions: ['pdf', 'png', 'jpg', 'jpeg', 'doc', 'docx', 'txt'] },
      ],
      properties: ['openFile'],
    });
    if (canceled || filePaths.length === 0) return null;

    const selectedFile = filePaths[0];
    const originalName = path.basename(selectedFile);
    const ext = path.extname(selectedFile);
    const fileStats = fs.statSync(selectedFile);
    const fileType = ext.toLowerCase().replace('.', '');
    const uuidName = `${uuidv4()}${ext}`;

    const dataDir = getDataPath();
    const clientDocsDir = path.join(dataDir, 'documents', String(data.clientId));
    fs.mkdirSync(clientDocsDir, { recursive: true });

    const destPath = path.join(clientDocsDir, uuidName);
    fs.copyFileSync(selectedFile, destPath);

    const result = db.prepare(`
      INSERT INTO client_documents (client_id, filename, original_name, file_type, file_size, category,
        certification_period_start, certification_period_end, received_date, sent_date, physician_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.clientId, uuidName, originalName, fileType, fileStats.size, data.category || 'other',
      data.certification_period_start || '', data.certification_period_end || '',
      data.received_date || '', data.sent_date || '', data.physician_name || ''
    );

    return db.prepare('SELECT * FROM client_documents WHERE id = ?').get(result.lastInsertRowid);
  });

  safeHandle('documents:updateMeta', (_event, data: {
    documentId: number;
    certification_period_start?: string;
    certification_period_end?: string;
    received_date?: string;
    sent_date?: string;
    physician_name?: string;
    category?: string;
  }) => {
    const doc = db.prepare('SELECT * FROM client_documents WHERE id = ? AND deleted_at IS NULL').get(data.documentId) as any;
    if (!doc) throw new Error('Document not found');

    db.prepare(`
      UPDATE client_documents SET
        certification_period_start = ?,
        certification_period_end = ?,
        received_date = ?,
        sent_date = ?,
        physician_name = ?,
        category = ?
      WHERE id = ?
    `).run(
      data.certification_period_start ?? doc.certification_period_start,
      data.certification_period_end ?? doc.certification_period_end,
      data.received_date ?? doc.received_date,
      data.sent_date ?? doc.sent_date,
      data.physician_name ?? doc.physician_name,
      data.category ?? doc.category,
      data.documentId
    );

    return db.prepare('SELECT * FROM client_documents WHERE id = ?').get(data.documentId);
  });

  safeHandle('documents:list', (_event, data: { clientId: number }) => {
    return db.prepare(
      'SELECT * FROM client_documents WHERE client_id = ? AND deleted_at IS NULL ORDER BY created_at DESC'
    ).all(data.clientId);
  });

  safeHandle('documents:open', (_event, data: { documentId: number }) => {
    const doc = db.prepare('SELECT * FROM client_documents WHERE id = ? AND deleted_at IS NULL').get(data.documentId) as any;
    if (!doc) throw new Error('Document not found');

    const dataDir = getDataPath();
    const filePath = path.join(dataDir, 'documents', String(doc.client_id), doc.filename);
    return shell.openPath(filePath);
  });

  // Soft delete for documents
  safeHandle('documents:delete', (_event, data: { documentId: number }) => {
    const doc = db.prepare('SELECT * FROM client_documents WHERE id = ? AND deleted_at IS NULL').get(data.documentId) as any;
    if (!doc) throw new Error('Document not found');

    // Don't delete the file — soft delete only. File stays for HIPAA retention.
    db.prepare('UPDATE client_documents SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(data.documentId);
    auditLog({ actionType: 'document_deleted', entityType: 'document', entityId: data.documentId, clientId: doc.client_id, detail: { filename: doc.filename } });
    return true;
  });

  safeHandle('documents:getPath', (_event, data: { documentId: number }) => {
    const doc = db.prepare('SELECT * FROM client_documents WHERE id = ? AND deleted_at IS NULL').get(data.documentId) as any;
    if (!doc) throw new Error('Document not found');

    const dataDir = getDataPath();
    return path.join(dataDir, 'documents', String(doc.client_id), doc.filename);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // GOOD FAITH ESTIMATE (No Surprises Act)
  // ══════════════════════════════════════════════════════════════════════════

  safeHandle('gfe:generate', (_event, data: {
    clientId: number;
    servicePeriodStart: string;
    servicePeriodEnd: string;
    lineItems: Array<{ description: string; cpt_code: string; quantity: number; rate: number; total: number }>;
    diagnosisCodes: string[];
  }) => {
    const client = db.prepare('SELECT * FROM clients WHERE id = ? AND deleted_at IS NULL').get(data.clientId) as any;
    if (!client) throw new Error('Client not found');
    const practice = db.prepare('SELECT * FROM practice WHERE id = 1').get() as any || {};

    const estimatedTotal = data.lineItems.reduce((sum, li) => sum + li.total, 0);

    // Mark any existing active GFE for this client as superseded
    const existingActive = db.prepare(
      'SELECT id FROM good_faith_estimates WHERE client_id = ? AND status = ? AND deleted_at IS NULL'
    ).all(data.clientId, 'active') as any[];

    for (const old of existingActive) {
      db.prepare('UPDATE good_faith_estimates SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run('superseded', old.id);
      auditLog({
        actionType: 'gfe_superseded',
        entityType: 'good_faith_estimate',
        entityId: old.id,
        clientId: data.clientId,
        detail: { superseded_by: 'new_gfe' },
      });
    }

    // Generate the PDF
    const { base64Pdf, filename } = buildGfePdf(client, practice, data);

    // Save PDF to client documents
    const dataDir = getDataPath();
    const clientDocsDir = path.join(dataDir, 'documents', String(data.clientId));
    fs.mkdirSync(clientDocsDir, { recursive: true });

    const uuidName = `${uuidv4()}.pdf`;
    const destPath = path.join(clientDocsDir, uuidName);
    const buffer = Buffer.from(base64Pdf, 'base64');
    fs.writeFileSync(destPath, buffer);

    const docNotes = `Good Faith Estimate — ${data.servicePeriodStart} to ${data.servicePeriodEnd} — Estimated total: ${new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(estimatedTotal)}`;

    const docResult = db.prepare(`
      INSERT INTO client_documents (client_id, filename, original_name, file_type, file_size, category, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.clientId, uuidName, filename, 'pdf', buffer.length, 'good_faith_estimate', docNotes
    );
    const documentId = docResult.lastInsertRowid as number;

    // Save structured GFE record
    const gfeResult = db.prepare(`
      INSERT INTO good_faith_estimates (client_id, document_id, service_period_start, service_period_end,
        estimated_total, line_items, diagnosis_codes, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'active')
    `).run(
      data.clientId, documentId, data.servicePeriodStart, data.servicePeriodEnd,
      estimatedTotal, JSON.stringify(data.lineItems), JSON.stringify(data.diagnosisCodes)
    );

    // Update superseded records with the new ID
    const newGfeId = gfeResult.lastInsertRowid as number;
    for (const old of existingActive) {
      // Update the audit detail with actual new ID
      auditLog({
        actionType: 'gfe_superseded',
        entityType: 'good_faith_estimate',
        entityId: old.id,
        clientId: data.clientId,
        detail: { superseded_by: newGfeId },
      });
    }

    auditLog({
      actionType: 'gfe_created',
      entityType: 'good_faith_estimate',
      entityId: newGfeId,
      clientId: data.clientId,
      detail: {
        estimated_total: estimatedTotal,
        service_period: `${data.servicePeriodStart} to ${data.servicePeriodEnd}`,
        line_item_count: data.lineItems.length,
      },
    });

    return {
      gfeId: newGfeId,
      documentId,
      base64Pdf,
      filename,
      estimatedTotal,
    };
  });

  safeHandle('gfe:save', async (_event, data: { base64Pdf: string; filename: string }) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Save Good Faith Estimate PDF',
      defaultPath: data.filename,
      filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) return false;
    const buffer = Buffer.from(data.base64Pdf, 'base64');
    fs.writeFileSync(filePath, buffer);
    return true;
  });

  safeHandle('gfe:list', (_event, clientId: number) => {
    return db.prepare(
      'SELECT * FROM good_faith_estimates WHERE client_id = ? AND deleted_at IS NULL ORDER BY created_at DESC'
    ).all(clientId);
  });

  safeHandle('gfe:get', (_event, id: number) => {
    return db.prepare('SELECT * FROM good_faith_estimates WHERE id = ? AND deleted_at IS NULL').get(id);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // V2/V3 BILLING IPC HANDLERS
  // ══════════════════════════════════════════════════════════════════════════

  // ── Fee Schedule ──
  safeHandle('feeSchedule:list', () => {
    return db.prepare('SELECT * FROM fee_schedule WHERE deleted_at IS NULL ORDER BY cpt_code').all();
  });

  safeHandle('feeSchedule:get', (_event, id: number) => {
    return db.prepare('SELECT * FROM fee_schedule WHERE id = ? AND deleted_at IS NULL').get(id);
  });

  safeHandle('feeSchedule:create', (_event, data: any) => {
    const result = db.prepare(`
      INSERT INTO fee_schedule (cpt_code, description, default_units, amount, effective_date)
      VALUES (?, ?, ?, ?, ?)
    `).run(
      data.cpt_code,
      data.description || '',
      data.default_units || 1,
      data.amount || 0,
      data.effective_date || null
    );
    return db.prepare('SELECT * FROM fee_schedule WHERE id = ?').get(result.lastInsertRowid);
  });

  safeHandle('feeSchedule:update', (_event, id: number, data: any) => {
    db.prepare(`
      UPDATE fee_schedule SET
        cpt_code = COALESCE(?, cpt_code),
        description = COALESCE(?, description),
        default_units = COALESCE(?, default_units),
        amount = COALESCE(?, amount),
        effective_date = COALESCE(?, effective_date)
      WHERE id = ? AND deleted_at IS NULL
    `).run(data.cpt_code, data.description, data.default_units, data.amount, data.effective_date, id);
    return db.prepare('SELECT * FROM fee_schedule WHERE id = ?').get(id);
  });

  safeHandle('feeSchedule:delete', (_event, id: number) => {
    db.prepare('UPDATE fee_schedule SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    auditLog({ actionType: 'fee_schedule_deleted', entityType: 'fee_schedule', entityId: id });
    return true;
  });

  safeHandle('feeSchedule:reset', (_event, discipline: string) => {
    const { resetFeeSchedule } = require('./seed');
    resetFeeSchedule(db, discipline);
    return { success: true };
  });

  // ── Invoice number generation ──
  const generateInvoiceNumber = (): string => {
    const now = new Date();
    const prefix = `INV-${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
    const lastInvoice = db.prepare(
      `SELECT invoice_number FROM invoices WHERE invoice_number LIKE ? ORDER BY invoice_number DESC LIMIT 1`
    ).get(`${prefix}-%`) as any;
    let seq = 1;
    if (lastInvoice) {
      const parts = lastInvoice.invoice_number.split('-');
      const lastSeq = parseInt(parts[2], 10);
      if (!isNaN(lastSeq)) seq = lastSeq + 1;
    }
    return `${prefix}-${String(seq).padStart(3, '0')}`;
  };

  // ── Invoices ──
  safeHandle('invoices:list', (_event, filters?: { clientId?: number; entityId?: number; status?: string; startDate?: string; endDate?: string }) => {
    let query = `SELECT i.*, GROUP_CONCAT(DISTINCT ii.cpt_code) as cpt_summary
      FROM invoices i
      LEFT JOIN invoice_items ii ON ii.invoice_id = i.id AND ii.cpt_code != ''
      WHERE i.deleted_at IS NULL`;
    const params: any[] = [];

    if (filters?.clientId) {
      query += ' AND i.client_id = ?';
      params.push(filters.clientId);
    }
    if (filters?.entityId) {
      query += ' AND i.entity_id = ?';
      params.push(filters.entityId);
    }
    if (filters?.status) {
      query += ' AND i.status = ?';
      params.push(filters.status);
    }
    if (filters?.startDate) {
      query += ' AND i.invoice_date >= ?';
      params.push(filters.startDate);
    }
    if (filters?.endDate) {
      query += ' AND i.invoice_date <= ?';
      params.push(filters.endDate);
    }

    query += ' GROUP BY i.id ORDER BY i.invoice_date DESC';
    return db.prepare(query).all(...params);
  });

  safeHandle('invoices:get', (_event, id: number) => {
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ? AND deleted_at IS NULL').get(id) as any;
    if (!invoice) throw new Error('Invoice not found');
    const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(id);
    return { ...invoice, items };
  });

  safeHandle('invoices:create', (_event, data: any, items: any[]) => {
    const invoiceNumber = generateInvoiceNumber();
    const result = db.prepare(`
      INSERT INTO invoices (client_id, entity_id, invoice_number, invoice_date, due_date, subtotal, discount_amount, total_amount, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.client_id || null,
      data.entity_id || null,
      invoiceNumber,
      data.invoice_date || new Date().toISOString().slice(0, 10),
      data.due_date || null,
      data.subtotal || 0,
      data.discount_amount || 0,
      data.total_amount || 0,
      data.status || 'draft',
      data.notes || ''
    );
    const invoiceId = result.lastInsertRowid;

    // Insert line items
    const insertItem = db.prepare(`
      INSERT INTO invoice_items (invoice_id, note_id, description, cpt_code, service_date, units, unit_price, amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of items || []) {
      insertItem.run(
        invoiceId,
        item.note_id || null,
        item.description || '',
        item.cpt_code || '',
        item.service_date || '',
        item.units || 1,
        item.unit_price || 0,
        item.amount || 0
      );
    }

    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId) as any;

    // Audit log
    db.prepare(`
      INSERT INTO audit_log (entity_type, entity_id, action, new_values, client_id, amount, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      'invoice',
      invoiceId,
      'create',
      JSON.stringify({ invoice_number: invoiceNumber, status: 'draft', items_count: (items || []).length }),
      data.client_id,
      data.total_amount || 0,
      `Invoice ${invoiceNumber} created for $${data.total_amount || 0}`
    );

    return invoice;
  });

  safeHandle('invoices:update', (_event, id: number, data: any) => {
    db.prepare(`
      UPDATE invoices SET
        invoice_date = COALESCE(?, invoice_date),
        due_date = COALESCE(?, due_date),
        subtotal = COALESCE(?, subtotal),
        discount_amount = COALESCE(?, discount_amount),
        total_amount = COALESCE(?, total_amount),
        status = COALESCE(?, status),
        notes = COALESCE(?, notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND deleted_at IS NULL
    `).run(data.invoice_date, data.due_date, data.subtotal, data.discount_amount, data.total_amount, data.status, data.notes, id);
    return db.prepare('SELECT * FROM invoices WHERE id = ?').get(id);
  });

  safeHandle('invoices:delete', (_event, id: number) => {
    const invoice = db.prepare('SELECT client_id, invoice_number FROM invoices WHERE id = ?').get(id) as any;
    db.prepare('UPDATE invoices SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    auditLog({ actionType: 'invoice_deleted', entityType: 'invoice', entityId: id, clientId: invoice?.client_id, detail: { invoice_number: invoice?.invoice_number } });
    return true;
  });

  // Generate invoice PDF
  safeHandle('invoices:generatePdf', async (_event, invoiceId: number) => {
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ? AND deleted_at IS NULL').get(invoiceId) as any;
    if (!invoice) throw new Error('Invoice not found');

    const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(invoiceId) as any[];
    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(invoice.client_id) as any;
    const practice = db.prepare('SELECT * FROM practice WHERE id = 1').get() as any;

    const { base64Pdf, filename } = buildInvoicePdf(invoice, items, client, practice);
    return { base64Pdf, filename };
  });

  safeHandle('invoices:savePdf', async (_event, data: { base64Pdf: string; filename: string }) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Save Invoice PDF',
      defaultPath: data.filename,
      filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) return null;
    const buffer = Buffer.from(data.base64Pdf, 'base64');
    fs.writeFileSync(filePath, buffer);
    return filePath;
  });

  // Get invoice status for notes (which notes are invoiced and paid)
  // Also detects invoices created from appointments (via quickInvoiceFromAppointment)
  safeHandle('invoices:noteStatuses', (_event) => {
    const map: Record<number, { invoice_id: number; invoice_number: string; status: string }> = {};

    // 1) Direct note → invoice linkage
    const noteRows = db.prepare(`
      SELECT ii.note_id, i.id as invoice_id, i.invoice_number, i.status
      FROM invoice_items ii
      JOIN invoices i ON i.id = ii.invoice_id AND i.deleted_at IS NULL AND i.status != 'void'
      WHERE ii.note_id IS NOT NULL
    `).all() as Array<{ note_id: number; invoice_id: number; invoice_number: string; status: string }>;
    for (const row of noteRows) {
      map[row.note_id] = { invoice_id: row.invoice_id, invoice_number: row.invoice_number, status: row.status };
    }

    // 2) Appointment → invoice linkage (for invoices created from pipeline $ button)
    // Match notes to appointments by client_id + date, then check if that appointment has an invoice
    const apptRows = db.prepare(`
      SELECT n.id as note_id, i.id as invoice_id, i.invoice_number, i.status
      FROM notes n
      JOIN appointments a ON a.client_id = n.client_id AND a.scheduled_date = n.date_of_service AND a.deleted_at IS NULL
      JOIN invoice_items ii ON ii.appointment_id = a.id
      JOIN invoices i ON i.id = ii.invoice_id AND i.deleted_at IS NULL AND i.status != 'void'
      WHERE n.deleted_at IS NULL AND n.signed_at IS NOT NULL
    `).all() as Array<{ note_id: number; invoice_id: number; invoice_number: string; status: string }>;
    for (const row of apptRows) {
      if (!map[row.note_id]) {
        map[row.note_id] = { invoice_id: row.invoice_id, invoice_number: row.invoice_number, status: row.status };
      }
    }

    return map;
  });

  safeHandle('invoices:generateFromNotes', (_event, clientId: number, noteIds: number[], entityId?: number) => {
    // Guard: check if any of these notes (or their linked appointments) already have an invoice
    for (const nid of noteIds) {
      // Check direct note linkage
      const directInvoice = db.prepare(`
        SELECT i.invoice_number FROM invoice_items ii
        JOIN invoices i ON i.id = ii.invoice_id AND i.deleted_at IS NULL AND i.status != 'void'
        WHERE ii.note_id = ?
      `).get(nid) as any;
      if (directInvoice) {
        throw new Error(`Note already has invoice ${directInvoice.invoice_number}`);
      }
      // Check appointment linkage (invoice created via pipeline $ button)
      const apptInvoice = db.prepare(`
        SELECT i.invoice_number FROM notes n
        JOIN appointments a ON a.client_id = n.client_id AND a.scheduled_date = n.date_of_service AND a.deleted_at IS NULL
        JOIN invoice_items ii ON ii.appointment_id = a.id
        JOIN invoices i ON i.id = ii.invoice_id AND i.deleted_at IS NULL AND i.status != 'void'
        WHERE n.id = ? AND n.deleted_at IS NULL
      `).get(nid) as any;
      if (apptInvoice) {
        throw new Error(`Session already invoiced (${apptInvoice.invoice_number})`);
      }
    }

    const feeSchedule = db.prepare('SELECT * FROM fee_schedule WHERE deleted_at IS NULL').all() as any[];
    const feeMap = new Map(feeSchedule.map(f => [f.cpt_code, f]));

    // If entity, also load entity fee schedule for rate overrides
    let entityFeeMap = new Map<string, any>();
    if (entityId) {
      const entityFees = db.prepare('SELECT * FROM entity_fee_schedules WHERE entity_id = ? AND deleted_at IS NULL').all(entityId) as any[];
      entityFeeMap = new Map(entityFees.filter(f => f.cpt_code).map(f => [f.cpt_code, f]));
    }

    // Load active client discounts (for non-entity invoices)
    let activeDiscounts: any[] = [];
    if (clientId && !entityId) {
      // Auto-expire past-due discounts
      db.prepare(`
        UPDATE client_discounts SET status = 'expired', updated_at = CURRENT_TIMESTAMP
        WHERE client_id = ? AND status = 'active' AND end_date IS NOT NULL AND end_date < date('now') AND deleted_at IS NULL
      `).run(clientId);
      activeDiscounts = db.prepare(
        "SELECT * FROM client_discounts WHERE client_id = ? AND status = 'active' AND deleted_at IS NULL ORDER BY created_at DESC"
      ).all(clientId) as any[];
    }

    const placeholders = noteIds.map(() => '?').join(',');
    // Support fetching by entity_id or client_id
    let noteQuery: string;
    let noteParams: any[];
    if (entityId) {
      noteQuery = `SELECT * FROM notes WHERE id IN (${placeholders}) AND entity_id = ? AND deleted_at IS NULL`;
      noteParams = [...noteIds, entityId];
    } else {
      noteQuery = `SELECT * FROM notes WHERE id IN (${placeholders}) AND client_id = ? AND deleted_at IS NULL`;
      noteParams = [...noteIds, clientId];
    }
    const notes = db.prepare(noteQuery).all(...noteParams) as any[];

    let subtotal = 0;
    let discountAmount = 0;
    const items: any[] = [];
    // Track usage per discount: discountId → sessions applied this invoice
    const discountUsage = new Map<number, number>();

    for (const note of notes) {
      // Parse cpt_codes JSON to support multiple CPT lines per note
      let cptLines: { code: string; units: number }[] = [];
      try {
        const parsed = JSON.parse(note.cpt_codes || '[]');
        if (Array.isArray(parsed) && parsed.length > 0) {
          cptLines = parsed.filter((l: any) => l.code && l.code.trim());
        }
      } catch { /* ignore parse errors */ }

      // Fallback to single cpt_code if cpt_codes is empty/invalid
      if (cptLines.length === 0) {
        cptLines = [{ code: note.cpt_code || '', units: note.units || 1 }];
      }

      // Create one invoice item per CPT line
      for (const cptLine of cptLines) {
        const lineCode = cptLine.code;
        const lineUnits = cptLine.units || 1;

        // Base rate: Entity fee → Note override → Global fee schedule → Charge amount
        const entityFee = entityFeeMap.get(lineCode);
        const fee = feeMap.get(lineCode);
        let unitPrice = entityFee?.default_rate || note.rate_override || fee?.amount || note.charge_amount || 0;
        const basePrice = unitPrice;

        // Apply active client discounts — try session-based first, then persistent
        if (activeDiscounts.length > 0) {
          let applied = false;

          // 1) Try session-based discounts (package / flat_rate) — first one with remaining sessions wins
          for (const disc of activeDiscounts) {
            if (applied) break;
            const usedSoFar = discountUsage.get(disc.id) || 0;

            if (disc.discount_type === 'package') {
              const remaining = disc.total_sessions - (disc.sessions_used + usedSoFar);
              if (remaining > 0) {
                const packageRate = (disc.paid_sessions * disc.session_rate) / disc.total_sessions;
                unitPrice = packageRate;
                discountUsage.set(disc.id, usedSoFar + 1);
                applied = true;
              }
            } else if (disc.discount_type === 'flat_rate') {
              const remaining = disc.flat_rate_sessions
                ? disc.flat_rate_sessions - (disc.flat_rate_sessions_used + usedSoFar)
                : Infinity;
              if (remaining > 0) {
                unitPrice = disc.flat_rate;
                discountUsage.set(disc.id, usedSoFar + 1);
                applied = true;
              }
            }
          }

          // 2) If no session-based discount applied, apply persistent discounts (stack them)
          if (!applied) {
            for (const disc of activeDiscounts) {
              if (disc.discount_type === 'persistent') {
                if (disc.discount_percent) {
                  unitPrice = unitPrice * (1 - disc.discount_percent / 100);
                } else if (disc.discount_fixed) {
                  unitPrice = Math.max(0, unitPrice - disc.discount_fixed);
                }
              }
            }
          }

          discountAmount += (basePrice - unitPrice) * lineUnits;
        }

        const amount = unitPrice * lineUnits;
        subtotal += amount;
        items.push({
          note_id: note.id,
          description: entityFee?.description || fee?.description || `Service on ${note.date_of_service}`,
          cpt_code: lineCode,
          service_date: note.date_of_service,
          units: lineUnits,
          unit_price: Math.round(unitPrice * 100) / 100,
          amount: Math.round(amount * 100) / 100,
        });
      }
    }

    // Increment discount usage for session-based discounts
    for (const disc of activeDiscounts) {
      const sessionsApplied = discountUsage.get(disc.id) || 0;
      if (sessionsApplied > 0) {
        if (disc.discount_type === 'package') {
          const newUsed = disc.sessions_used + sessionsApplied;
          const newStatus = newUsed >= disc.total_sessions ? 'exhausted' : 'active';
          db.prepare('UPDATE client_discounts SET sessions_used = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(newUsed, newStatus, disc.id);
        } else if (disc.discount_type === 'flat_rate') {
          const newUsed = disc.flat_rate_sessions_used + sessionsApplied;
          const newStatus = disc.flat_rate_sessions && newUsed >= disc.flat_rate_sessions ? 'exhausted' : 'active';
          db.prepare('UPDATE client_discounts SET flat_rate_sessions_used = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
            .run(newUsed, newStatus, disc.id);
        }
      }
    }

    // Build invoice notes with discount info
    let invoiceNotes = '';
    const appliedLabels = activeDiscounts.filter(d => {
      if (d.discount_type === 'persistent') return true;
      return (discountUsage.get(d.id) || 0) > 0;
    }).map(d => d.label || d.discount_type);
    if (appliedLabels.length > 0) {
      invoiceNotes = `Discounts applied: ${appliedLabels.join(', ')}`;
    }

    const invoiceNumber = generateInvoiceNumber();
    const totalAmount = Math.round(subtotal * 100) / 100;
    const result = db.prepare(`
      INSERT INTO invoices (client_id, entity_id, invoice_number, invoice_date, subtotal, discount_amount, total_amount, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?)
    `).run(clientId || null, entityId || null, invoiceNumber, new Date().toISOString().slice(0, 10),
      totalAmount + Math.round(discountAmount * 100) / 100, Math.round(discountAmount * 100) / 100, totalAmount, invoiceNotes);
    const invoiceId = result.lastInsertRowid;

    const insertItem = db.prepare(`
      INSERT INTO invoice_items (invoice_id, note_id, description, cpt_code, service_date, units, unit_price, amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of items) {
      insertItem.run(invoiceId, item.note_id, item.description, item.cpt_code, item.service_date, item.units, item.unit_price, item.amount);
    }

    return db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
  });

  // Create a fee invoice (late cancel / no-show)
  safeHandle('invoices:createFeeInvoice', (_event, data: { client_id?: number; entity_id?: number; description: string; amount: number; service_date: string }) => {
    const invoiceNumber = generateInvoiceNumber();
    const result = db.prepare(`
      INSERT INTO invoices (client_id, entity_id, invoice_number, invoice_date, subtotal, total_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'draft')
    `).run(data.client_id || null, data.entity_id || null, invoiceNumber, new Date().toISOString().slice(0, 10), data.amount, data.amount);
    const invoiceId = result.lastInsertRowid;
    db.prepare(`
      INSERT INTO invoice_items (invoice_id, description, service_date, units, unit_price, amount)
      VALUES (?, ?, ?, 1, ?, ?)
    `).run(invoiceId, data.description, data.service_date, data.amount, data.amount);
    return db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
  });

  // ── Revenue Pipeline ──

  safeHandle('billing:getPipelineData', async (_event, options?: { paidDays?: number }) => {
    const paidDays = options?.paidDays || 30;
    const paidCutoff = new Date();
    paidCutoff.setDate(paidCutoff.getDate() - paidDays);
    const paidCutoffStr = paidCutoff.toISOString().slice(0, 10);

    // Column 1: Completed appointments without a note
    // Also detect if already billed (via invoice_items.appointment_id) and get default CPT
    const needsNote = db.prepare(`
      SELECT
        a.id as appointment_id,
        a.client_id,
        a.scheduled_date,
        a.visit_type,
        a.entity_id,
        c.first_name,
        c.last_name,
        c.default_cpt_code,
        e.name as entity_name,
        CAST(julianday('now') - julianday(a.scheduled_date) AS INTEGER) as days_old,
        CASE WHEN EXISTS (
          SELECT 1 FROM invoice_items ii
          JOIN invoices i ON i.id = ii.invoice_id AND i.status != 'void' AND i.deleted_at IS NULL
          WHERE ii.appointment_id = a.id
        ) THEN 1 ELSE 0 END as already_billed,
        (SELECT i.id FROM invoice_items ii
          JOIN invoices i ON i.id = ii.invoice_id AND i.status != 'void' AND i.deleted_at IS NULL
          WHERE ii.appointment_id = a.id
          LIMIT 1) as billed_invoice_id
      FROM appointments a
      LEFT JOIN clients c ON c.id = a.client_id AND c.deleted_at IS NULL
      LEFT JOIN contracted_entities e ON e.id = a.entity_id
      WHERE a.status = 'completed'
        AND a.deleted_at IS NULL
        AND a.note_id IS NULL
        AND a.evaluation_id IS NULL
        AND c.id IS NOT NULL
      ORDER BY a.scheduled_date DESC
    `).all();

    // Column 2: Unsigned notes (drafts)
    const needsSignature = db.prepare(`
      SELECT
        n.id as note_id,
        n.note_type,
        n.client_id,
        n.date_of_service,
        n.cpt_code,
        n.cpt_codes,
        n.units,
        n.charge_amount,
        n.entity_id,
        c.first_name,
        c.last_name,
        e.name as entity_name,
        CAST(julianday('now') - julianday(n.date_of_service) AS INTEGER) as days_old
      FROM notes n
      LEFT JOIN clients c ON c.id = n.client_id AND c.deleted_at IS NULL
      LEFT JOIN contracted_entities e ON e.id = n.entity_id
      WHERE (n.signed_at IS NULL OR n.signed_at = '')
        AND n.deleted_at IS NULL
        AND c.id IS NOT NULL
      ORDER BY n.date_of_service DESC
    `).all();

    // Also get unsigned evaluations
    const unsignedEvals = db.prepare(`
      SELECT
        ev.id as eval_id,
        'evaluation' as note_type,
        ev.client_id,
        ev.eval_date as date_of_service,
        c.first_name,
        c.last_name,
        CAST(julianday('now') - julianday(ev.eval_date) AS INTEGER) as days_old
      FROM evaluations ev
      LEFT JOIN clients c ON c.id = ev.client_id AND c.deleted_at IS NULL
      WHERE (ev.signed_at IS NULL OR ev.signed_at = '')
        AND ev.deleted_at IS NULL
        AND c.id IS NOT NULL
      ORDER BY ev.eval_date DESC
    `).all();

    // Column 3: Signed notes without an invoice
    const readyToBill = db.prepare(`
      SELECT
        n.id as note_id,
        n.note_type,
        n.client_id,
        n.date_of_service,
        n.cpt_code,
        n.cpt_codes,
        n.units,
        n.charge_amount,
        n.signed_at,
        n.entity_id,
        c.first_name,
        c.last_name,
        e.name as entity_name,
        CAST(julianday('now') - julianday(n.signed_at) AS INTEGER) as days_uninvoiced
      FROM notes n
      LEFT JOIN clients c ON c.id = n.client_id AND c.deleted_at IS NULL
      LEFT JOIN contracted_entities e ON e.id = n.entity_id
      WHERE n.signed_at IS NOT NULL AND n.signed_at != ''
        AND n.deleted_at IS NULL
        AND c.id IS NOT NULL
        AND n.id NOT IN (
          SELECT DISTINCT ii.note_id
          FROM invoice_items ii
          JOIN invoices i ON i.id = ii.invoice_id
          WHERE ii.note_id IS NOT NULL
            AND i.status != 'void'
            AND i.deleted_at IS NULL
        )
      ORDER BY n.signed_at DESC
    `).all();

    // Column 4: Unpaid invoices (excluding drafts and void)
    const awaitingPayment = db.prepare(`
      SELECT
        i.id as invoice_id,
        i.invoice_number,
        i.client_id,
        i.invoice_date,
        i.total_amount,
        i.status,
        i.stripe_payment_link_url,
        i.entity_id,
        c.first_name,
        c.last_name,
        e.name as entity_name,
        CAST(julianday('now') - julianday(i.invoice_date) AS INTEGER) as days_since_sent
      FROM invoices i
      LEFT JOIN clients c ON c.id = i.client_id AND c.deleted_at IS NULL
      LEFT JOIN contracted_entities e ON e.id = i.entity_id
      WHERE i.status IN ('sent', 'outstanding', 'partial', 'overdue')
        AND i.deleted_at IS NULL
      ORDER BY i.invoice_date DESC
    `).all();

    // Draft invoices (for the "unsent drafts" indicator in column 3)
    const draftInvoices = db.prepare(`
      SELECT
        i.id as invoice_id,
        i.invoice_number,
        i.client_id,
        i.total_amount,
        c.first_name,
        c.last_name
      FROM invoices i
      LEFT JOIN clients c ON c.id = i.client_id AND c.deleted_at IS NULL
      WHERE i.status = 'draft'
        AND i.deleted_at IS NULL
      ORDER BY i.created_at DESC
    `).all();

    // Column 5: Recently paid
    const paid = db.prepare(`
      SELECT
        i.id as invoice_id,
        i.invoice_number,
        i.client_id,
        i.total_amount,
        i.entity_id,
        c.first_name,
        c.last_name,
        e.name as entity_name,
        p.payment_date,
        p.payment_method
      FROM invoices i
      LEFT JOIN clients c ON c.id = i.client_id AND c.deleted_at IS NULL
      LEFT JOIN contracted_entities e ON e.id = i.entity_id
      LEFT JOIN payments p ON p.invoice_id = i.id AND p.deleted_at IS NULL
      WHERE i.status = 'paid'
        AND i.deleted_at IS NULL
        AND p.payment_date >= ?
      ORDER BY p.payment_date DESC
    `).all(paidCutoffStr);

    return {
      needsNote,
      needsSignature: [...needsSignature, ...unsignedEvals],
      readyToBill,
      awaitingPayment,
      draftInvoices,
      paid,
    };
  });

  safeHandle('billing:quickInvoice', async (_event, data: {
    clientId: number;
    noteIds: number[];
    entityId?: number;
  }) => {
    const { clientId, noteIds, entityId } = data;

    // Reuse the existing generateFromNotes logic
    const feeSchedule = db.prepare('SELECT * FROM fee_schedule WHERE deleted_at IS NULL').all() as any[];
    const feeMap = new Map(feeSchedule.map((f: any) => [f.cpt_code, f]));

    let entityFeeMap = new Map<string, any>();
    if (entityId) {
      const entityFees = db.prepare('SELECT * FROM entity_fee_schedules WHERE entity_id = ? AND deleted_at IS NULL').all(entityId) as any[];
      entityFeeMap = new Map(entityFees.filter((f: any) => f.cpt_code).map((f: any) => [f.cpt_code, f]));
    }

    // Load active client discounts (for non-entity invoices)
    let activeDiscounts: any[] = [];
    if (clientId && !entityId) {
      db.prepare(`
        UPDATE client_discounts SET status = 'expired', updated_at = CURRENT_TIMESTAMP
        WHERE client_id = ? AND status = 'active' AND end_date IS NOT NULL AND end_date < date('now') AND deleted_at IS NULL
      `).run(clientId);
      activeDiscounts = db.prepare(
        "SELECT * FROM client_discounts WHERE client_id = ? AND status = 'active' AND deleted_at IS NULL ORDER BY created_at DESC"
      ).all(clientId) as any[];
    }

    const placeholders = noteIds.map(() => '?').join(',');
    const notes = db.prepare(
      `SELECT * FROM notes WHERE id IN (${placeholders}) AND deleted_at IS NULL`
    ).all(...noteIds) as any[];

    let subtotal = 0;
    let discountAmount = 0;
    const items: any[] = [];
    const discountUsage = new Map<number, number>();

    for (const note of notes) {
      let cptLines: { code: string; units: number }[] = [];
      try {
        const parsed = JSON.parse(note.cpt_codes || '[]');
        if (Array.isArray(parsed) && parsed.length > 0) {
          cptLines = parsed.filter((l: any) => l.code && l.code.trim());
        }
      } catch { /* ignore */ }

      if (cptLines.length === 0) {
        cptLines = [{ code: note.cpt_code || '', units: note.units || 1 }];
      }

      for (const cptLine of cptLines) {
        const lineCode = cptLine.code;
        const lineUnits = cptLine.units || 1;

        const entityFee = entityFeeMap.get(lineCode);
        const fee = feeMap.get(lineCode);
        let unitPrice = entityFee?.default_rate || note.rate_override || fee?.amount || note.charge_amount || 0;
        const basePrice = unitPrice;

        if (activeDiscounts.length > 0) {
          let applied = false;
          for (const disc of activeDiscounts) {
            if (applied) break;
            const usedSoFar = discountUsage.get(disc.id) || 0;
            if (disc.discount_type === 'package') {
              const remaining = disc.total_sessions - (disc.sessions_used + usedSoFar);
              if (remaining > 0) {
                unitPrice = (disc.paid_sessions * disc.session_rate) / disc.total_sessions;
                discountUsage.set(disc.id, usedSoFar + 1);
                applied = true;
              }
            } else if (disc.discount_type === 'flat_rate') {
              const remaining = disc.flat_rate_sessions ? disc.flat_rate_sessions - (disc.flat_rate_sessions_used + usedSoFar) : Infinity;
              if (remaining > 0) {
                unitPrice = disc.flat_rate;
                discountUsage.set(disc.id, usedSoFar + 1);
                applied = true;
              }
            }
          }
          if (!applied) {
            for (const disc of activeDiscounts) {
              if (disc.discount_type === 'persistent') {
                if (disc.discount_percent) unitPrice = unitPrice * (1 - disc.discount_percent / 100);
                else if (disc.discount_fixed) unitPrice = Math.max(0, unitPrice - disc.discount_fixed);
              }
            }
          }
          discountAmount += (basePrice - unitPrice) * lineUnits;
        }

        const amount = unitPrice * lineUnits;
        subtotal += amount;
        items.push({
          note_id: note.id,
          description: entityFee?.description || fee?.description || `Service on ${note.date_of_service}`,
          cpt_code: lineCode,
          service_date: note.date_of_service,
          units: lineUnits,
          unit_price: Math.round(unitPrice * 100) / 100,
          amount: Math.round(amount * 100) / 100,
        });
      }
    }

    // Increment discount usage
    for (const disc of activeDiscounts) {
      const sessionsApplied = discountUsage.get(disc.id) || 0;
      if (sessionsApplied > 0) {
        if (disc.discount_type === 'package') {
          const newUsed = disc.sessions_used + sessionsApplied;
          const newStatus = newUsed >= disc.total_sessions ? 'exhausted' : 'active';
          db.prepare('UPDATE client_discounts SET sessions_used = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newUsed, newStatus, disc.id);
        } else if (disc.discount_type === 'flat_rate') {
          const newUsed = disc.flat_rate_sessions_used + sessionsApplied;
          const newStatus = disc.flat_rate_sessions && newUsed >= disc.flat_rate_sessions ? 'exhausted' : 'active';
          db.prepare('UPDATE client_discounts SET flat_rate_sessions_used = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(newUsed, newStatus, disc.id);
        }
      }
    }

    let invoiceNotes = '';
    const appliedLabels = activeDiscounts.filter(d => {
      if (d.discount_type === 'persistent') return true;
      return (discountUsage.get(d.id) || 0) > 0;
    }).map(d => d.label || d.discount_type);
    if (appliedLabels.length > 0) {
      invoiceNotes = `Discounts applied: ${appliedLabels.join(', ')}`;
    }

    const invoiceNumber = generateInvoiceNumber();
    const totalAmount = Math.round(subtotal * 100) / 100;
    // Quick invoice starts as 'sent' — the act of clicking "Bill Now" implies intent to collect
    const result = db.prepare(`
      INSERT INTO invoices (client_id, entity_id, invoice_number, invoice_date, subtotal, discount_amount, total_amount, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'sent', ?)
    `).run(clientId || null, entityId || null, invoiceNumber, new Date().toISOString().slice(0, 10),
      totalAmount + Math.round(discountAmount * 100) / 100, Math.round(discountAmount * 100) / 100, totalAmount, invoiceNotes);
    const invoiceId = result.lastInsertRowid;

    const insertItem = db.prepare(`
      INSERT INTO invoice_items (invoice_id, note_id, description, cpt_code, service_date, units, unit_price, amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    for (const item of items) {
      insertItem.run(invoiceId, item.note_id, item.description, item.cpt_code, item.service_date, item.units, item.unit_price, item.amount);
    }

    return db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
  });

  // Bill from appointment without a note — uses client's default_cpt_code + fee schedule
  safeHandle('billing:quickInvoiceFromAppointment', async (_event, data: {
    appointmentId: number;
    clientId: number;
    entityId?: number;
    cptCode?: string;
  }) => {
    const { appointmentId, clientId, entityId } = data;

    // Guard: check if this appointment already has an invoice
    const existingInvoice = db.prepare(`
      SELECT i.invoice_number FROM invoice_items ii
      JOIN invoices i ON i.id = ii.invoice_id AND i.deleted_at IS NULL AND i.status != 'void'
      WHERE ii.appointment_id = ?
    `).get(appointmentId) as any;
    if (existingInvoice) {
      throw new Error(`Appointment already invoiced (${existingInvoice.invoice_number})`);
    }

    // Get appointment
    const appointment = db.prepare('SELECT * FROM appointments WHERE id = ? AND deleted_at IS NULL').get(appointmentId) as any;
    if (!appointment) throw new Error('Appointment not found');

    // Use provided CPT code or fall back to client's default
    let cptCode = data.cptCode;
    if (!cptCode) {
      const client = db.prepare('SELECT default_cpt_code FROM clients WHERE id = ? AND deleted_at IS NULL').get(clientId) as any;
      cptCode = client?.default_cpt_code;
    }
    if (!cptCode) throw new Error('No CPT code provided and client has no default CPT code.');

    // Look up fee schedule for rate
    const feeSchedule = db.prepare('SELECT * FROM fee_schedule WHERE deleted_at IS NULL').all() as any[];
    const feeMap = new Map(feeSchedule.map((f: any) => [f.cpt_code, f]));

    let entityFeeMap = new Map<string, any>();
    if (entityId) {
      const entityFees = db.prepare('SELECT * FROM entity_fee_schedules WHERE entity_id = ? AND deleted_at IS NULL').all(entityId) as any[];
      entityFeeMap = new Map(entityFees.filter((f: any) => f.cpt_code).map((f: any) => [f.cpt_code, f]));
    }

    const entityFee = entityFeeMap.get(cptCode);
    const fee = feeMap.get(cptCode);
    const unitPrice = entityFee?.default_rate || fee?.amount || 0;
    const units = fee?.default_units || 1;

    if (unitPrice === 0) throw new Error(`No rate found for CPT ${cptCode} in fee schedule.`);

    // Load active client discounts
    let activeDiscounts: any[] = [];
    let discountAmount = 0;
    let finalPrice = unitPrice;

    if (clientId && !entityId) {
      db.prepare(`
        UPDATE client_discounts SET status = 'expired', updated_at = CURRENT_TIMESTAMP
        WHERE client_id = ? AND status = 'active' AND end_date IS NOT NULL AND end_date < date('now') AND deleted_at IS NULL
      `).run(clientId);
      activeDiscounts = db.prepare(
        "SELECT * FROM client_discounts WHERE client_id = ? AND status = 'active' AND deleted_at IS NULL ORDER BY created_at DESC"
      ).all(clientId) as any[];

      if (activeDiscounts.length > 0) {
        let applied = false;
        for (const disc of activeDiscounts) {
          if (applied) break;
          if (disc.discount_type === 'package') {
            const remaining = disc.total_sessions - disc.sessions_used;
            if (remaining > 0) {
              finalPrice = (disc.paid_sessions * disc.session_rate) / disc.total_sessions;
              db.prepare('UPDATE client_discounts SET sessions_used = sessions_used + 1, status = CASE WHEN sessions_used + 1 >= total_sessions THEN \'exhausted\' ELSE \'active\' END, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(disc.id);
              applied = true;
            }
          } else if (disc.discount_type === 'flat_rate') {
            const remaining = disc.flat_rate_sessions ? disc.flat_rate_sessions - disc.flat_rate_sessions_used : Infinity;
            if (remaining > 0) {
              finalPrice = disc.flat_rate;
              db.prepare('UPDATE client_discounts SET flat_rate_sessions_used = flat_rate_sessions_used + 1, status = CASE WHEN flat_rate_sessions IS NOT NULL AND flat_rate_sessions_used + 1 >= flat_rate_sessions THEN \'exhausted\' ELSE \'active\' END, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(disc.id);
              applied = true;
            }
          }
        }
        if (!applied) {
          for (const disc of activeDiscounts) {
            if (disc.discount_type === 'persistent') {
              if (disc.discount_percent) finalPrice = finalPrice * (1 - disc.discount_percent / 100);
              else if (disc.discount_fixed) finalPrice = Math.max(0, finalPrice - disc.discount_fixed);
            }
          }
        }
        discountAmount = (unitPrice - finalPrice) * units;
      }
    }

    const amount = Math.round(finalPrice * units * 100) / 100;
    const subtotal = Math.round((unitPrice * units) * 100) / 100;
    const discRounded = Math.round(discountAmount * 100) / 100;

    let invoiceNotes = '';
    const appliedLabels = activeDiscounts.filter(d => d.discount_type === 'persistent' || d.discount_type === 'package' || d.discount_type === 'flat_rate').map(d => d.label || d.discount_type);
    if (appliedLabels.length > 0 && discRounded > 0) {
      invoiceNotes = `Discounts applied: ${appliedLabels.join(', ')}`;
    }

    const invoiceNumber = generateInvoiceNumber();
    const description = entityFee?.description || fee?.description || `Service on ${appointment.scheduled_date}`;

    const result = db.prepare(`
      INSERT INTO invoices (client_id, entity_id, invoice_number, invoice_date, subtotal, discount_amount, total_amount, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'sent', ?)
    `).run(clientId, entityId || null, invoiceNumber, new Date().toISOString().slice(0, 10),
      subtotal, discRounded, amount, invoiceNotes);
    const invoiceId = result.lastInsertRowid;

    db.prepare(`
      INSERT INTO invoice_items (invoice_id, appointment_id, description, cpt_code, service_date, units, unit_price, amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(invoiceId, appointmentId, description, cptCode, appointment.scheduled_date, units, Math.round(finalPrice * 100) / 100, amount);

    return db.prepare('SELECT * FROM invoices WHERE id = ?').get(invoiceId);
  });

  // ── Payments ──
  safeHandle('payments:list', (_event, filters?: { clientId?: number; startDate?: string; endDate?: string }) => {
    let query = 'SELECT * FROM payments WHERE deleted_at IS NULL';
    const params: any[] = [];

    if (filters?.clientId) {
      query += ' AND client_id = ?';
      params.push(filters.clientId);
    }
    if (filters?.startDate) {
      query += ' AND payment_date >= ?';
      params.push(filters.startDate);
    }
    if (filters?.endDate) {
      query += ' AND payment_date <= ?';
      params.push(filters.endDate);
    }

    query += ' ORDER BY payment_date DESC';
    return db.prepare(query).all(...params);
  });

  safeHandle('payments:create', (_event, data: any) => {
    const result = db.prepare(`
      INSERT INTO payments (client_id, invoice_id, payment_date, amount, payment_method, reference_number, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.client_id,
      data.invoice_id || null,
      data.payment_date || new Date().toISOString().slice(0, 10),
      data.amount,
      data.payment_method || 'other',
      data.reference_number || '',
      data.notes || ''
    );
    const payment = db.prepare('SELECT * FROM payments WHERE id = ?').get(result.lastInsertRowid) as any;

    // Audit log
    db.prepare(`
      INSERT INTO audit_log (entity_type, entity_id, action, new_values, client_id, amount, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      'payment',
      payment.id,
      'create',
      JSON.stringify({ payment_method: data.payment_method, invoice_id: data.invoice_id }),
      data.client_id,
      data.amount,
      `Payment recorded: $${data.amount} via ${data.payment_method || 'other'}`
    );

    return payment;
  });

  safeHandle('payments:update', (_event, id: number, data: any) => {
    db.prepare(`
      UPDATE payments SET invoice_id = ?, notes = ? WHERE id = ? AND deleted_at IS NULL
    `).run(data.invoice_id ?? null, data.notes ?? '', id);
    return db.prepare('SELECT * FROM payments WHERE id = ?').get(id);
  });

  safeHandle('payments:refund', (_event, id: number) => {
    const payment = db.prepare('SELECT * FROM payments WHERE id = ? AND deleted_at IS NULL').get(id) as any;
    if (!payment) throw new Error('Payment not found');

    // Create a negative refund entry
    const result = db.prepare(`
      INSERT INTO payments (client_id, invoice_id, payment_date, amount, payment_method, reference_number, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      payment.client_id,
      payment.invoice_id,
      new Date().toISOString().slice(0, 10),
      -payment.amount,
      payment.payment_method,
      `REFUND-${payment.reference_number || payment.id}`,
      `Refund of payment #${payment.id}`
    );
    const refund = db.prepare('SELECT * FROM payments WHERE id = ?').get(result.lastInsertRowid) as any;

    // If linked to an invoice, revert its status
    if (payment.invoice_id) {
      const remainingPaid = db.prepare(
        'SELECT COALESCE(SUM(amount), 0) as total FROM payments WHERE invoice_id = ? AND deleted_at IS NULL'
      ).get(payment.invoice_id) as any;
      const invoice = db.prepare('SELECT * FROM invoices WHERE id = ?').get(payment.invoice_id) as any;
      if (invoice) {
        const newStatus = remainingPaid.total <= 0 ? 'sent' : remainingPaid.total < invoice.total_amount ? 'partial' : 'paid';
        db.prepare('UPDATE invoices SET status = ? WHERE id = ?').run(newStatus, payment.invoice_id);
      }
    }

    // Audit log
    db.prepare(`
      INSERT INTO audit_log (entity_type, entity_id, action, new_values, client_id, amount, description)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('payment', refund.id, 'refund', JSON.stringify({ original_payment_id: id }), payment.client_id, -payment.amount, `Refund of $${payment.amount}`);

    return refund;
  });

  safeHandle('payments:delete', (_event, id: number) => {
    db.prepare('UPDATE payments SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    return true;
  });

  // ── CSV Payment Import ──

  safeHandle('csvImport:pickFile', async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Select CSV Payment File',
      filters: [
        { name: 'CSV Files', extensions: ['csv', 'tsv', 'txt'] },
      ],
      properties: ['openFile'],
    });
    if (canceled || !filePaths?.[0]) return null;
    return filePaths[0];
  });

  safeHandle('csvImport:parseFile', (_event, filePath: string) => {
    return parseCSVFile(filePath);
  });

  safeHandle('csvImport:autoDetectColumns', (_event, headers: string[]) => {
    return autoDetectCSVColumns(headers);
  });

  safeHandle('csvImport:matchClients', (_event, data: { filePath: string; mapping: CSVColumnMapping }) => {
    const clients = db.prepare(
      "SELECT id, first_name, last_name FROM clients WHERE deleted_at IS NULL ORDER BY last_name, first_name"
    ).all() as Array<{ id: number; first_name: string; last_name: string }>;
    return matchCSVClients(data.filePath, data.mapping, clients);
  });

  safeHandle('csvImport:prepareRows', (_event, data: {
    filePath: string;
    mapping: CSVColumnMapping;
    clientMatches: Record<string, number>;
    fixedClientId?: number;
  }) => {
    return prepareImportRows(data.filePath, data.mapping, data.clientMatches, db, data.fixedClientId);
  });

  safeHandle('csvImport:execute', (_event, data: { rows: CSVPaymentRow[]; skipDuplicates: boolean }) => {
    return executeCSVImport(data.rows, db, data.skipDuplicates);
  });

  // ── Authorizations ──
  safeHandle('authorizations:listByClient', (_event, clientId: number) => {
    return db.prepare(
      'SELECT * FROM authorizations WHERE client_id = ? AND deleted_at IS NULL ORDER BY start_date DESC'
    ).all(clientId);
  });

  safeHandle('authorizations:create', (_event, data: any) => {
    const result = db.prepare(`
      INSERT INTO authorizations (client_id, payer_name, payer_id, auth_number, start_date, end_date, units_approved, units_used, cpt_codes, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.client_id,
      data.payer_name || '',
      data.payer_id || '',
      data.auth_number,
      data.start_date || null,
      data.end_date || null,
      data.units_approved || 0,
      data.units_used || 0,
      JSON.stringify(data.cpt_codes || []),
      data.status || 'active',
      data.notes || ''
    );
    return db.prepare('SELECT * FROM authorizations WHERE id = ?').get(result.lastInsertRowid);
  });

  safeHandle('authorizations:update', (_event, id: number, data: any) => {
    db.prepare(`
      UPDATE authorizations SET
        payer_name = COALESCE(?, payer_name),
        payer_id = COALESCE(?, payer_id),
        auth_number = COALESCE(?, auth_number),
        start_date = COALESCE(?, start_date),
        end_date = COALESCE(?, end_date),
        units_approved = COALESCE(?, units_approved),
        units_used = COALESCE(?, units_used),
        cpt_codes = COALESCE(?, cpt_codes),
        status = COALESCE(?, status),
        notes = COALESCE(?, notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND deleted_at IS NULL
    `).run(
      data.payer_name,
      data.payer_id,
      data.auth_number,
      data.start_date,
      data.end_date,
      data.units_approved,
      data.units_used,
      data.cpt_codes ? JSON.stringify(data.cpt_codes) : null,
      data.status,
      data.notes,
      id
    );
    return db.prepare('SELECT * FROM authorizations WHERE id = ?').get(id);
  });

  safeHandle('authorizations:delete', (_event, id: number) => {
    db.prepare('UPDATE authorizations SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    return true;
  });

  // ── Claims (V3) ──
  safeHandle('claims:list', (_event, filters?: { clientId?: number; status?: string; startDate?: string; endDate?: string }) => {
    let query = `SELECT c.*, (cl.first_name || ' ' || cl.last_name) AS client_name
      FROM claims c
      LEFT JOIN clients cl ON c.client_id = cl.id
      WHERE c.deleted_at IS NULL`;
    const params: any[] = [];

    if (filters?.clientId) {
      query += ' AND c.client_id = ?';
      params.push(filters.clientId);
    }
    if (filters?.status) {
      query += ' AND c.status = ?';
      params.push(filters.status);
    }
    if (filters?.startDate) {
      query += ' AND c.service_date_start >= ?';
      params.push(filters.startDate);
    }
    if (filters?.endDate) {
      query += ' AND c.service_date_end <= ?';
      params.push(filters.endDate);
    }

    query += ' ORDER BY c.created_at DESC';
    return db.prepare(query).all(...params);
  });

  safeHandle('claims:get', (_event, id: number) => {
    const claim = db.prepare(`
      SELECT c.*, (cl.first_name || ' ' || cl.last_name) AS client_name
      FROM claims c
      LEFT JOIN clients cl ON c.client_id = cl.id
      WHERE c.id = ? AND c.deleted_at IS NULL
    `).get(id) as any;
    if (!claim) throw new Error('Claim not found');
    const lines = db.prepare('SELECT * FROM claim_lines WHERE claim_id = ? ORDER BY line_number').all(id);
    return { ...claim, lines };
  });

  safeHandle('claims:create', (_event, data: any, lines: any[]) => {
    // Sequential claim number: PC-YYYY-NNNN
    const year = new Date().getFullYear();
    const lastClaim = db.prepare("SELECT claim_number FROM claims WHERE claim_number LIKE ? ORDER BY id DESC LIMIT 1")
      .get(`PC-${year}-%`) as any;
    let seq = 1;
    if (lastClaim?.claim_number) {
      const parts = lastClaim.claim_number.split('-');
      seq = (parseInt(parts[2], 10) || 0) + 1;
    }
    const claimNumber = `PC-${year}-${String(seq).padStart(4, '0')}`;
    const result = db.prepare(`
      INSERT INTO claims (client_id, claim_number, payer_name, payer_id, service_date_start, service_date_end, total_charge, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.client_id,
      claimNumber,
      data.payer_name || '',
      data.payer_id || '',
      data.service_date_start || '',
      data.service_date_end || '',
      data.total_charge || 0,
      data.status || 'draft'
    );
    const claimId = result.lastInsertRowid;

    const insertLine = db.prepare(`
      INSERT INTO claim_lines (claim_id, note_id, line_number, service_date, cpt_code, modifiers, units, charge_amount, diagnosis_pointers, place_of_service)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    let lineNum = 1;
    for (const line of lines || []) {
      insertLine.run(
        claimId,
        line.note_id || null,
        lineNum++,
        line.service_date || '',
        line.cpt_code || '',
        JSON.stringify(line.modifiers || []),
        line.units || 1,
        line.charge_amount || 0,
        JSON.stringify(line.diagnosis_pointers || [1]),
        line.place_of_service || '11'
      );
    }

    return db.prepare('SELECT * FROM claims WHERE id = ?').get(claimId);
  });

  safeHandle('claims:update', (_event, id: number, data: any) => {
    db.prepare(`
      UPDATE claims SET
        payer_name = COALESCE(?, payer_name),
        payer_id = COALESCE(?, payer_id),
        service_date_start = COALESCE(?, service_date_start),
        service_date_end = COALESCE(?, service_date_end),
        total_charge = COALESCE(?, total_charge),
        status = COALESCE(?, status),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND deleted_at IS NULL
    `).run(data.payer_name, data.payer_id, data.service_date_start, data.service_date_end, data.total_charge, data.status, id);
    return db.prepare('SELECT * FROM claims WHERE id = ?').get(id);
  });

  safeHandle('claims:delete', (_event, id: number) => {
    db.prepare('UPDATE claims SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    return true;
  });

  // ── Claims: Create from Notes (V3 Insurance) ──
  safeHandle('claims:createFromNotes', (_event, clientId: number, noteIds: number[]) => {
    requireTier('pro');
    if (!noteIds || noteIds.length === 0) throw new Error('No notes selected');

    const client = db.prepare('SELECT * FROM clients WHERE id = ? AND deleted_at IS NULL').get(clientId) as any;
    if (!client) throw new Error('Client not found');

    // Fetch signed notes
    const placeholders = noteIds.map(() => '?').join(',');
    const notes = db.prepare(`SELECT * FROM notes WHERE id IN (${placeholders}) AND signed_at IS NOT NULL AND deleted_at IS NULL ORDER BY date_of_service`).all(...noteIds) as any[];
    if (notes.length === 0) throw new Error('No signed notes found');

    // Sequential claim number: PC-YYYY-NNNN
    const year = new Date().getFullYear();
    const lastClaim = db.prepare("SELECT claim_number FROM claims WHERE claim_number LIKE ? ORDER BY id DESC LIMIT 1")
      .get(`PC-${year}-%`) as any;
    let seq = 1;
    if (lastClaim?.claim_number) {
      const parts = lastClaim.claim_number.split('-');
      seq = (parseInt(parts[2], 10) || 0) + 1;
    }
    const claimNumber = `PC-${year}-${String(seq).padStart(4, '0')}`;

    // Aggregate dates and charges
    const serviceDates = notes.map((n: any) => n.date_of_service).filter(Boolean).sort();
    let totalCharge = 0;

    // Build claim lines
    const lineData: any[] = [];
    for (const note of notes) {
      let cptLines: Array<{ code: string; units: number }> = [];
      try { cptLines = JSON.parse(note.cpt_codes || '[]'); } catch {}
      if (cptLines.length === 0 && note.cpt_code) {
        cptLines = [{ code: note.cpt_code, units: note.units || 1 }];
      }

      let modifiers: string[] = [];
      try { modifiers = JSON.parse(note.cpt_modifiers || '[]'); } catch {}

      let diagPointers: number[] = [];
      try { diagPointers = JSON.parse(note.diagnosis_pointers || '[1]'); } catch {}

      const mainCpt = cptLines[0] || { code: '', units: 1 };
      const chargeAmount = note.charge_amount || 0;
      totalCharge += chargeAmount;

      lineData.push({
        note_id: note.id,
        service_date: note.date_of_service || '',
        cpt_code: mainCpt.code,
        modifiers,
        units: mainCpt.units || 1,
        charge_amount: chargeAmount,
        diagnosis_pointers: diagPointers,
        place_of_service: note.place_of_service || '11',
      });
    }

    // Create claim
    const result = db.prepare(`
      INSERT INTO claims (client_id, claim_number, payer_name, payer_id, service_date_start, service_date_end, total_charge, status)
      VALUES (?, ?, ?, ?, ?, ?, ?, 'draft')
    `).run(
      clientId,
      claimNumber,
      client.insurance_payer || '',
      client.insurance_payer_id || '',
      serviceDates[0] || '',
      serviceDates[serviceDates.length - 1] || '',
      totalCharge
    );
    const claimId = result.lastInsertRowid;

    // Insert claim lines
    const insertLine = db.prepare(`
      INSERT INTO claim_lines (claim_id, note_id, line_number, service_date, cpt_code, modifiers, units, charge_amount, diagnosis_pointers, place_of_service)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    lineData.forEach((line, idx) => {
      insertLine.run(claimId, line.note_id, idx + 1, line.service_date, line.cpt_code, JSON.stringify(line.modifiers), line.units, line.charge_amount, JSON.stringify(line.diagnosis_pointers), line.place_of_service);
    });

    auditLog({ actionType: 'claim_created_from_notes', entityType: 'claim', entityId: Number(claimId), clientId, detail: { claimNumber, noteCount: notes.length, totalCharge } });

    const claim = db.prepare(`
      SELECT c.*, (cl.first_name || ' ' || cl.last_name) AS client_name
      FROM claims c LEFT JOIN clients cl ON c.client_id = cl.id WHERE c.id = ?
    `).get(claimId);
    return claim;
  });

  // ── Claims: Generate 837P EDI ──
  safeHandle('claims:generate837P', (_event, claimId: number) => {
    requireTier('pro');
    const claim = db.prepare('SELECT * FROM claims WHERE id = ? AND deleted_at IS NULL').get(claimId) as any;
    if (!claim) throw new Error('Claim not found');

    const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(claim.client_id) as any;
    if (!client) throw new Error('Client not found');

    const practice = db.prepare('SELECT * FROM practice LIMIT 1').get() as any;
    if (!practice) throw new Error('Practice not configured');

    // Fetch notes linked through claim_lines
    const claimLines = db.prepare('SELECT * FROM claim_lines WHERE claim_id = ? ORDER BY line_number').all(claimId) as any[];
    const noteIds = claimLines.map((l: any) => l.note_id).filter(Boolean);
    const notes = noteIds.length > 0
      ? db.prepare(`SELECT * FROM notes WHERE id IN (${noteIds.map(() => '?').join(',')}) ORDER BY date_of_service`).all(...noteIds) as any[]
      : [];

    // Get control number from settings (increment per 837P generation)
    const settingsRow = db.prepare("SELECT value FROM settings WHERE key = 'edi_control_number'").get() as any;
    let controlNumber = settingsRow ? parseInt(settingsRow.value, 10) || 1 : 1;

    // Assemble 837P input
    const submitterId = practice.npi || '';
    const receiverId = client.insurance_payer_id || '';

    const ediInput = assemble837PInput({
      client,
      practice,
      notes,
      claimNumber: claim.claim_number,
      claimId: Number(claimId),
      submitterId,
      receiverId,
    });

    // Generate EDI content
    const ediContent = generate837P(ediInput, controlNumber);

    // Store EDI content and update status
    db.prepare(`
      UPDATE claims SET edi_837_content = ?, status = 'validated', validated_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(ediContent, claimId);

    // Increment control number
    controlNumber++;
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('edi_control_number', ?)").run(String(controlNumber));

    auditLog({ actionType: 'claim_837p_generated', entityType: 'claim', entityId: Number(claimId), clientId: claim.client_id, detail: { claimNumber: claim.claim_number, controlNumber } });

    return { ediContent, claimNumber: claim.claim_number };
  });

  // ── Clearinghouse (Provider-Agnostic) ──

  // Provider management (mirrors fax provider pattern)
  safeHandle('clearinghouse:setProvider', (_event, type: ClearinghouseProviderType, credentials: Record<string, string>) => {
    requireTier('pro');
    clearinghouseRouter.setProvider(type, credentials, db, encryptSecure);
    auditLog({ actionType: 'clearinghouse_provider_set', entityType: 'settings', entityId: 0, detail: { provider: type } });
    return true;
  });

  safeHandle('clearinghouse:getProviderStatus', () => {
    return {
      configured: clearinghouseRouter.isConfigured(),
      provider: clearinghouseRouter.getProviderType(),
    };
  });

  safeHandle('clearinghouse:testProvider', async () => {
    requireTier('pro');
    const result = await clearinghouseRouter.testConnection();
    auditLog({ actionType: 'clearinghouse_connection_test', entityType: 'settings', entityId: 0, detail: { success: result.success, message: result.message } });
    return result;
  });

  safeHandle('clearinghouse:removeProvider', () => {
    requireTier('pro');
    clearinghouseRouter.removeProvider(db);
    auditLog({ actionType: 'clearinghouse_provider_removed', entityType: 'settings', entityId: 0, detail: {} });
    return true;
  });

  // Operations (routed through active provider)
  safeHandle('clearinghouse:getPayerList', async () => {
    requireTier('pro');
    return clearinghouseRouter.getProvider().getPayerList();
  });

  safeHandle('clearinghouse:checkEnrollment', async (_event, payerId: string) => {
    requireTier('pro');
    return clearinghouseRouter.getProvider().checkEnrollmentStatus(payerId);
  });

  safeHandle('clearinghouse:submitClaim', async (_event, claimId: number) => {
    requireTier('pro');
    const claim = db.prepare('SELECT * FROM claims WHERE id = ? AND deleted_at IS NULL').get(claimId) as any;
    if (!claim) throw new Error('Claim not found');
    if (!claim.edi_837_content) throw new Error('No EDI content generated. Generate 837P first.');

    const result = await clearinghouseRouter.getProvider().submitClaim(claim.edi_837_content);

    if (result.success) {
      db.prepare(`
        UPDATE claims SET status = 'submitted', submitted_at = CURRENT_TIMESTAMP, clearinghouse_claim_id = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `).run(result.clearinghouseClaimId || '', claimId);
      auditLog({ actionType: 'claim_submitted', entityType: 'claim', entityId: claimId, clientId: claim.client_id, detail: { claimNumber: claim.claim_number, clearinghouseClaimId: result.clearinghouseClaimId } });
    }

    return result;
  });

  safeHandle('clearinghouse:checkClaimStatus', async (_event, claimId: number) => {
    requireTier('pro');
    const claim = db.prepare('SELECT * FROM claims WHERE id = ? AND deleted_at IS NULL').get(claimId) as any;
    if (!claim) throw new Error('Claim not found');
    if (!claim.clearinghouse_claim_id) throw new Error('Claim has not been submitted to clearinghouse');
    return clearinghouseRouter.getProvider().checkClaimStatus(claim.clearinghouse_claim_id);
  });

  safeHandle('clearinghouse:checkEligibility', async (_event, _clientId: number) => {
    requireTier('pro');
    // 270 eligibility generator not yet implemented — placeholder
    return { success: false, message: 'Eligibility checking via EDI 270/271 is not yet implemented. Coming soon.' };
  });

  safeHandle('clearinghouse:getRemittance', async (_event, startDate: string, endDate: string) => {
    requireTier('pro');
    return clearinghouseRouter.getProvider().getRemittances(startDate, endDate);
  });

  // ── Eligibility Checks ──
  safeHandle('eligibilityChecks:listByClient', (_event, clientId: number) => {
    requireTier('pro');
    return db.prepare('SELECT * FROM eligibility_checks WHERE client_id = ? ORDER BY check_date DESC').all(clientId);
  });

  safeHandle('eligibilityChecks:getLatest', (_event, clientId: number) => {
    requireTier('pro');
    return db.prepare('SELECT * FROM eligibility_checks WHERE client_id = ? ORDER BY check_date DESC LIMIT 1').get(clientId) || null;
  });

  // ── Denial Codes ──
  safeHandle('denialCodes:lookup', (_event, code: string) => {
    return db.prepare('SELECT * FROM denial_codes WHERE code = ?').get(code) || null;
  });

  safeHandle('denialCodes:listCommon', () => {
    return db.prepare('SELECT * FROM denial_codes WHERE common_in_therapy = 1 ORDER BY code').all();
  });

  // ── Payers ──
  safeHandle('payers:list', () => {
    return db.prepare('SELECT * FROM payers ORDER BY name').all();
  });

  safeHandle('payers:create', (_event, data: any) => {
    const result = db.prepare(`
      INSERT INTO payers (name, edi_payer_id, clearinghouse, enrollment_required, enrollment_status, enrollment_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.name,
      data.edi_payer_id || '',
      data.clearinghouse || '',
      data.enrollment_required ? 1 : 0,
      data.enrollment_status || 'not_started',
      data.enrollment_date || null,
      data.notes || ''
    );
    return db.prepare('SELECT * FROM payers WHERE id = ?').get(result.lastInsertRowid);
  });

  safeHandle('payers:update', (_event, id: number, data: any) => {
    db.prepare(`
      UPDATE payers SET
        name = COALESCE(?, name),
        edi_payer_id = COALESCE(?, edi_payer_id),
        clearinghouse = COALESCE(?, clearinghouse),
        enrollment_required = COALESCE(?, enrollment_required),
        enrollment_status = COALESCE(?, enrollment_status),
        enrollment_date = COALESCE(?, enrollment_date),
        notes = COALESCE(?, notes)
      WHERE id = ?
    `).run(
      data.name,
      data.edi_payer_id,
      data.clearinghouse,
      data.enrollment_required !== undefined ? (data.enrollment_required ? 1 : 0) : null,
      data.enrollment_status,
      data.enrollment_date,
      data.notes,
      id
    );
    return db.prepare('SELECT * FROM payers WHERE id = ?').get(id);
  });

  safeHandle('payers:delete', (_event, id: number) => {
    const payer = db.prepare('SELECT name FROM payers WHERE id = ?').get(id) as any;
    db.prepare('DELETE FROM payers WHERE id = ?').run(id);
    auditLog({ actionType: 'payer_deleted', entityType: 'payer', entityId: id, detail: { name: payer?.name } });
    return true;
  });

  // ── Onboarding ──
  safeHandle('onboarding:getStatus', () => {
    const practice = db.prepare('SELECT name, npi FROM practice LIMIT 1').get() as any;
    const pinHash = db.prepare("SELECT value FROM settings WHERE key = 'pin_hash'").get() as any;
    const clientCount = (db.prepare('SELECT COUNT(*) as count FROM clients WHERE deleted_at IS NULL').get() as any)?.count || 0;
    const noteCount = (db.prepare('SELECT COUNT(*) as count FROM notes WHERE deleted_at IS NULL').get() as any)?.count || 0;
    const signedNoteCount = (db.prepare('SELECT COUNT(*) as count FROM notes WHERE signed_at IS NOT NULL AND deleted_at IS NULL').get() as any)?.count || 0;
    const lastBackup = db.prepare("SELECT value FROM settings WHERE key = 'last_backup_date'").get() as any;

    return {
      practiceSetUp: !!(practice?.name && practice?.npi),
      pinSet: !!pinHash?.value,
      hasClient: clientCount > 0,
      hasNote: noteCount > 0,
      hasSignedNote: signedNoteCount > 0,
      hasBackup: !!lastBackup?.value,
    };
  });

  // ── Audit Log ──
  safeHandle('auditLog:list', (_event, filters?: {
    entityType?: string;
    entityId?: number;
    clientId?: number;
    actionType?: string;
    startDate?: string;
    endDate?: string;
    limit?: number;
    offset?: number;
  }) => {
    let whereClause = ' WHERE 1=1';
    const params: any[] = [];

    if (filters?.entityType) {
      whereClause += ' AND entity_type = ?';
      params.push(filters.entityType);
    }
    if (filters?.entityId) {
      whereClause += ' AND entity_id = ?';
      params.push(filters.entityId);
    }
    if (filters?.clientId) {
      whereClause += ' AND client_id = ?';
      params.push(filters.clientId);
    }
    if (filters?.actionType) {
      whereClause += ' AND action_type = ?';
      params.push(filters.actionType);
    }
    if (filters?.startDate) {
      whereClause += ' AND created_at >= ?';
      params.push(filters.startDate);
    }
    if (filters?.endDate) {
      whereClause += ' AND created_at <= ?';
      params.push(filters.endDate);
    }

    // Total count for pagination
    const countRow = db.prepare('SELECT COUNT(*) as total FROM audit_log' + whereClause).get(...params) as any;
    const total = countRow?.total || 0;

    let query = 'SELECT * FROM audit_log' + whereClause + ' ORDER BY created_at DESC';

    const limit = filters?.limit || 50;
    query += ' LIMIT ?';
    params.push(limit);

    if (filters?.offset) {
      query += ' OFFSET ?';
      params.push(filters.offset);
    }

    const rows = db.prepare(query).all(...params);
    return { rows, total };
  });

  safeHandle('auditLog:create', (_event, data: {
    entityType: string;
    entityId?: number;
    action: string;
    oldValues?: any;
    newValues?: any;
    clientId?: number;
    amount?: number;
    description?: string;
  }) => {
    const result = db.prepare(`
      INSERT INTO audit_log (entity_type, entity_id, action, old_values, new_values, client_id, amount, description)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.entityType,
      data.entityId || null,
      data.action,
      data.oldValues ? JSON.stringify(data.oldValues) : null,
      data.newValues ? JSON.stringify(data.newValues) : null,
      data.clientId || null,
      data.amount || null,
      data.description || null
    );
    return db.prepare('SELECT * FROM audit_log WHERE id = ?').get(result.lastInsertRowid);
  });

  // Log warning dismissals from renderer (uses the proper hash-chained auditLog helper)
  safeHandle('auditLog:logWarningDismissal', (_event, data: {
    actionType: string;
    detail: Record<string, any>;
  }) => {
    auditLog({
      actionType: data.actionType,
      entityType: 'system',
      entityId: null,
      detail: data.detail,
    });
    return true;
  });

  // ══════════════════════════════════════════════════════════════════════
  // ── Data Integrity Checks ──
  // ══════════════════════════════════════════════════════════════════════

  safeHandle('integrity:runCheck', () => {
    const results = {
      notes: 0,
      evaluations: 0,
      tamperedNotes: [] as number[],
      tamperedEvals: [] as number[],
    };

    // Check signed notes
    const signedNotes = db.prepare(
      'SELECT id, content_hash, subjective, objective, assessment, plan FROM notes WHERE signed_at IS NOT NULL AND content_hash IS NOT NULL AND deleted_at IS NULL'
    ).all() as any[];
    for (const note of signedNotes) {
      const expected = computeContentHash({
        subjective: note.subjective,
        objective: note.objective,
        assessment: note.assessment,
        plan: note.plan,
      });
      if (expected !== note.content_hash) {
        results.tamperedNotes.push(note.id);
        auditLog({
          actionType: 'integrity_violation_detected',
          entityType: 'note',
          entityId: note.id,
          detail: { expected_hash: note.content_hash, actual_hash: expected },
        });
      }
      results.notes++;
    }

    // Check signed evaluations
    const signedEvals = db.prepare(
      'SELECT id, content_hash, content FROM evaluations WHERE signed_at IS NOT NULL AND content_hash IS NOT NULL AND deleted_at IS NULL'
    ).all() as any[];
    for (const ev of signedEvals) {
      const expected = computeContentHash(JSON.parse(ev.content || '{}'));
      if (expected !== ev.content_hash) {
        results.tamperedEvals.push(ev.id);
        auditLog({
          actionType: 'integrity_violation_detected',
          entityType: 'evaluation',
          entityId: ev.id,
          detail: { expected_hash: ev.content_hash, actual_hash: expected },
        });
      }
      results.evaluations++;
    }

    return results;
  });

  safeHandle('integrity:verifyAuditChain', () => {
    const entries = db.prepare(
      'SELECT id, entry_hash, action_type, entity_type, entity_id, client_id, timestamp FROM audit_log WHERE entry_hash IS NOT NULL ORDER BY id ASC'
    ).all() as any[];

    if (entries.length === 0) return { intact: true, checked: 0 };

    let previousHash = 'GENESIS';
    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i];
      const entryContent = JSON.stringify({
        actionType: entry.action_type,
        entityType: entry.entity_type,
        entityId: entry.entity_id ?? null,
        clientId: entry.client_id ?? null,
        timestamp: entry.timestamp,
      });
      const expectedHash = crypto.createHash('sha256')
        .update(previousHash + entryContent)
        .digest('hex');

      if (expectedHash !== entry.entry_hash) {
        return {
          intact: false,
          checked: entries.length,
          breakAtId: entry.id,
          breakAtIndex: i,
        };
      }
      previousHash = entry.entry_hash;
    }

    return { intact: true, checked: entries.length };
  });

  safeHandle('integrity:startupCheck', () => {
    const timestamp = new Date().toISOString();

    // 1. Always run quick_check
    const quickCheckResult = runQuickCheck();
    const quickCheckPassed = quickCheckResult === 'ok';

    auditLog({
      actionType: quickCheckPassed ? 'integrity_quick_check_passed' : 'integrity_quick_check_failed',
      entityType: 'system',
      detail: { result: quickCheckResult },
    });

    // 2. Run full integrity_check if >7 days since last run (or never run)
    let fullCheckPassed: boolean | undefined;
    let fullCheckResult: string | undefined;
    let fullCheckRan = false;

    const lastFullCheck = getSetting('last_integrity_check');
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const shouldRunFull = !lastFullCheck || (Date.now() - new Date(lastFullCheck).getTime()) > sevenDaysMs;

    if (shouldRunFull) {
      fullCheckResult = runIntegrityCheck();
      fullCheckPassed = fullCheckResult === 'ok';
      fullCheckRan = true;

      auditLog({
        actionType: fullCheckPassed ? 'integrity_full_check_passed' : 'integrity_full_check_failed',
        entityType: 'system',
        detail: { result: fullCheckResult },
      });

      // Update last check timestamp
      db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_integrity_check', ?)").run(timestamp);
    }

    return {
      quickCheckPassed,
      quickCheckResult,
      fullCheckPassed,
      fullCheckResult,
      fullCheckRan,
      timestamp,
    };
  });

  // ══════════════════════════════════════════════════════════════════════
  // ── Restore & Import (Post-DB) ──
  // ══════════════════════════════════════════════════════════════════════

  safeHandle('restore:getCurrentSummary', () => {
    return getCurrentDbSummary();
  });

  safeHandle('restore:getPendingRecoveryKey', () => {
    const tempKeyPath = path.join(getDataPath(), '.pending_recovery_key');
    try {
      if (fs.existsSync(tempKeyPath)) {
        return fs.readFileSync(tempKeyPath, 'utf-8');
      }
    } catch {}
    return null;
  });

  safeHandle('restore:clearPendingRecoveryKey', () => {
    const tempKeyPath = path.join(getDataPath(), '.pending_recovery_key');
    try {
      if (fs.existsSync(tempKeyPath)) {
        fs.unlinkSync(tempKeyPath);
      }
    } catch {}
  });

  safeHandle('restore:getBackupClients', (_event, filePath: string, passphrase: string) => {
    let tempDir: string | null = null;
    try {
      const extracted = extractBackupArchive(filePath);
      tempDir = extracted.tempDir;

      let masterKeyHex: string;
      if (extracted.keystoreData) {
        masterKeyHex = unlockFromExternalKeystore(extracted.keystoreData, passphrase);
      } else {
        if (keystoreExists()) {
          masterKeyHex = unlockWithPassphrase(passphrase);
        } else {
          return { error: 'Cannot decrypt backup — no keystore available.' };
        }
      }

      const clients = getBackupClients(extracted.dbPath, masterKeyHex);

      // Also get basic backup info
      const stats = fs.statSync(filePath);
      const vResult = validateBackupFile(extracted.dbPath, masterKeyHex);

      return {
        clients,
        backupInfo: {
          filePath,
          fileModified: stats.mtime.toISOString(),
          schemaVersion: vResult.schemaVersion,
        },
      };
    } catch (err: any) {
      return { error: err.message || 'Failed to read backup clients' };
    } finally {
      cleanupTempDir(tempDir);
    }
  });

  safeHandle('restore:importClients', (_event, filePath: string, passphrase: string, clientIds: number[]) => {
    let tempDir: string | null = null;
    try {
      const extracted = extractBackupArchive(filePath);
      tempDir = extracted.tempDir;

      let masterKeyHex: string;
      if (extracted.keystoreData) {
        masterKeyHex = unlockFromExternalKeystore(extracted.keystoreData, passphrase);
      } else {
        if (keystoreExists()) {
          masterKeyHex = unlockWithPassphrase(passphrase);
        } else {
          return { success: false, warnings: ['Cannot decrypt backup — no keystore available.'], clients: 0, notes: 0, evaluations: 0, goals: 0, appointments: 0, documents: 0, documentFilesMissing: 0, invoices: 0, payments: 0, entities: 0 };
        }
      }

      const result = importSelectedClients(extracted.dbPath, masterKeyHex, clientIds);

      if (result.success) {
        auditLog({
          actionType: 'client_import_from_backup',
          entityType: 'system',
          detail: {
            source: filePath,
            clientsImported: result.clients,
            notesImported: result.notes,
            evalsImported: result.evaluations,
            goalsImported: result.goals,
          },
        });
      }

      return result;
    } catch (err: any) {
      return {
        success: false,
        clients: 0, notes: 0, evaluations: 0, goals: 0, appointments: 0,
        documents: 0, documentFilesMissing: 0, invoices: 0, payments: 0, entities: 0,
        warnings: [`Import failed: ${err.message || 'Unknown error'}`],
      };
    } finally {
      cleanupTempDir(tempDir);
    }
  });

  // Settings restore — triggers app restart
  safeHandle('restore:executeFromSettings', async (_event, filePath: string, passphrase: string) => {
    let tempDir: string | null = null;
    try {
      const extracted = extractBackupArchive(filePath);
      tempDir = extracted.tempDir;

      let masterKeyHex: string;
      if (extracted.keystoreData) {
        masterKeyHex = unlockFromExternalKeystore(extracted.keystoreData, passphrase);
      } else {
        if (keystoreExists()) {
          masterKeyHex = unlockWithPassphrase(passphrase);
        } else {
          return { success: false, error: 'Cannot decrypt backup — no keystore available.' };
        }
      }

      // Auto-backup current DB
      const currentDbPath = path.join(getDataPath(), 'pocketchart.db');
      if (fs.existsSync(currentDbPath)) {
        const backupName = `pocketchart_pre_restore_backup_${Date.now()}.db`;
        try { fs.copyFileSync(currentDbPath, path.join(getDataPath(), backupName)); } catch {}
      }

      // Close, restore, replace keystore
      closeDatabase();
      restoreFullDatabase(extracted.dbPath);
      const recoveryKey = replaceKeystoreForRestore(masterKeyHex, passphrase);

      // Store recovery key in a temp file so it can be shown after restart
      const tempKeyPath = path.join(getDataPath(), '.pending_recovery_key');
      fs.writeFileSync(tempKeyPath, recoveryKey, 'utf-8');

      auditLog({
        actionType: 'database_restored_from_settings',
        entityType: 'system',
        detail: { source: filePath },
      });

      // Schedule restart
      setTimeout(() => {
        app.relaunch();
        app.exit(0);
      }, 500);

      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Restore failed' };
    } finally {
      cleanupTempDir(tempDir);
    }
  });

  // ══════════════════════════════════════════════════════════════════════
  // ── Contracted Entities (Pro Only) ──
  // ══════════════════════════════════════════════════════════════════════

  safeHandle('contractedEntities:list', () => {
    requireTier('pro');
    return db.prepare('SELECT * FROM contracted_entities WHERE deleted_at IS NULL ORDER BY name').all();
  });

  safeHandle('contractedEntities:get', (_event, id: number) => {
    requireTier('pro');
    return db.prepare('SELECT * FROM contracted_entities WHERE id = ? AND deleted_at IS NULL').get(id);
  });

  safeHandle('contractedEntities:create', (_event, data: any) => {
    requireTier('pro');
    const result = db.prepare(`
      INSERT INTO contracted_entities (name, contact_name, contact_email, contact_phone,
        billing_address_street, billing_address_city, billing_address_state, billing_address_zip,
        default_note_type, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.name, data.contact_name || '', data.contact_email || '', data.contact_phone || '',
      data.billing_address_street || '', data.billing_address_city || '',
      data.billing_address_state || '', data.billing_address_zip || '',
      data.default_note_type || 'soap', data.notes || ''
    );
    return db.prepare('SELECT * FROM contracted_entities WHERE id = ?').get(result.lastInsertRowid);
  });

  safeHandle('contractedEntities:update', (_event, id: number, data: any) => {
    requireTier('pro');
    const fields: string[] = [];
    const values: any[] = [];
    const allowed = ['name', 'contact_name', 'contact_email', 'contact_phone',
      'billing_address_street', 'billing_address_city', 'billing_address_state', 'billing_address_zip',
      'default_note_type', 'notes'];
    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(data[key]);
      }
    }
    if (fields.length === 0) throw new Error('No fields to update');
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    db.prepare(`UPDATE contracted_entities SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return db.prepare('SELECT * FROM contracted_entities WHERE id = ?').get(id);
  });

  safeHandle('contractedEntities:delete', (_event, id: number) => {
    requireTier('pro');
    const entity = db.prepare('SELECT name FROM contracted_entities WHERE id = ?').get(id) as any;
    db.prepare("UPDATE contracted_entities SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    auditLog({ actionType: 'entity_deleted', entityType: 'contracted_entity', entityId: id, detail: { name: entity?.name } });
    return true;
  });

  // Entity Fee Schedules
  safeHandle('contractedEntities:listFeeSchedule', (_event, entityId: number) => {
    requireTier('pro');
    return db.prepare('SELECT * FROM entity_fee_schedules WHERE entity_id = ? AND deleted_at IS NULL ORDER BY service_type').all(entityId);
  });

  safeHandle('contractedEntities:createFeeScheduleEntry', (_event, data: any) => {
    requireTier('pro');
    const result = db.prepare(`
      INSERT INTO entity_fee_schedules (entity_id, service_type, cpt_code, description, default_rate, unit, effective_date, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(data.entity_id, data.service_type, data.cpt_code || '', data.description || '', data.default_rate,
      data.unit || 'per_visit', data.effective_date || '', data.notes || '');
    return db.prepare('SELECT * FROM entity_fee_schedules WHERE id = ?').get(result.lastInsertRowid);
  });

  safeHandle('contractedEntities:updateFeeScheduleEntry', (_event, id: number, data: any) => {
    requireTier('pro');
    const fields: string[] = [];
    const values: any[] = [];
    const allowed = ['service_type', 'cpt_code', 'description', 'default_rate', 'unit', 'effective_date', 'notes'];
    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(data[key]);
      }
    }
    if (fields.length === 0) throw new Error('No fields to update');
    values.push(id);
    db.prepare(`UPDATE entity_fee_schedules SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return db.prepare('SELECT * FROM entity_fee_schedules WHERE id = ?').get(id);
  });

  safeHandle('contractedEntities:deleteFeeScheduleEntry', (_event, id: number) => {
    requireTier('pro');
    db.prepare("UPDATE entity_fee_schedules SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    return true;
  });

  // ══════════════════════════════════════════════════════════════════════
  // ── Entity Documents (Pro Only) ──
  // ══════════════════════════════════════════════════════════════════════

  safeHandle('entityDocuments:list', (_event, entityId: number) => {
    requireTier('pro');
    return db.prepare('SELECT * FROM entity_documents WHERE entity_id = ? AND deleted_at IS NULL ORDER BY uploaded_at DESC').all(entityId);
  });

  safeHandle('entityDocuments:upload', async (_event, data: { entityId: number; category?: string }) => {
    requireTier('pro');
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Upload Entity Document',
      properties: ['openFile'],
      filters: [
        { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'txt'] },
      ],
    });
    if (canceled || !filePaths?.length) return null;

    const sourcePath = filePaths[0];
    const originalName = path.basename(sourcePath);
    const ext = path.extname(originalName);
    const filename = `entity_${data.entityId}_${uuidv4()}${ext}`;
    const docsDir = path.join(getDataPath(), 'entity_documents');
    fs.mkdirSync(docsDir, { recursive: true });
    const destPath = path.join(docsDir, filename);
    fs.copyFileSync(sourcePath, destPath);

    const result = db.prepare(`
      INSERT INTO entity_documents (entity_id, filename, original_name, file_path, category, notes)
      VALUES (?, ?, ?, ?, ?, '')
    `).run(data.entityId, filename, originalName, destPath, data.category || 'other');
    return db.prepare('SELECT * FROM entity_documents WHERE id = ?').get(result.lastInsertRowid);
  });

  safeHandle('entityDocuments:open', (_event, documentId: number) => {
    requireTier('pro');
    const doc = db.prepare('SELECT * FROM entity_documents WHERE id = ?').get(documentId) as any;
    if (!doc) throw new Error('Document not found');
    shell.openPath(doc.file_path);
    return doc.file_path;
  });

  safeHandle('entityDocuments:delete', (_event, documentId: number) => {
    requireTier('pro');
    const doc = db.prepare('SELECT entity_id, filename FROM entity_documents WHERE id = ?').get(documentId) as any;
    db.prepare("UPDATE entity_documents SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run(documentId);
    auditLog({ actionType: 'entity_document_deleted', entityType: 'entity_document', entityId: documentId, detail: { entity_id: doc?.entity_id, filename: doc?.filename } });
    return true;
  });

  // ══════════════════════════════════════════════════════════════════════
  // ── Professional Vault (Pro Only) ──
  // ══════════════════════════════════════════════════════════════════════

  safeHandle('vault:list', () => {
    requireTier('pro');
    return db.prepare('SELECT * FROM vault_documents WHERE deleted_at IS NULL ORDER BY document_type, uploaded_at DESC').all();
  });

  safeHandle('vault:upload', async (_event, data: {
    documentType: string; customLabel?: string; expirationDate?: string;
    issueDate?: string; reminderDaysBefore?: number;
  }) => {
    requireTier('pro');
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: 'Upload Credential Document',
      properties: ['openFile'],
      filters: [
        { name: 'Documents', extensions: ['pdf', 'doc', 'docx', 'jpg', 'jpeg', 'png', 'txt'] },
      ],
    });
    if (canceled || !filePaths?.length) return null;

    const sourcePath = filePaths[0];
    const originalName = path.basename(sourcePath);
    const ext = path.extname(originalName);
    const filename = `vault_${uuidv4()}${ext}`;
    const vaultDir = path.join(getDataPath(), 'vault_documents');
    fs.mkdirSync(vaultDir, { recursive: true });
    const destPath = path.join(vaultDir, filename);
    fs.copyFileSync(sourcePath, destPath);

    const result = db.prepare(`
      INSERT INTO vault_documents (document_type, custom_label, filename, original_name, file_path,
        issue_date, expiration_date, reminder_days_before, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, '')
    `).run(
      data.documentType, data.customLabel || null, filename, originalName, destPath,
      data.issueDate || null, data.expirationDate || null, data.reminderDaysBefore ?? 60
    );
    return db.prepare('SELECT * FROM vault_documents WHERE id = ?').get(result.lastInsertRowid);
  });

  safeHandle('vault:update', (_event, id: number, data: any) => {
    requireTier('pro');
    const fields: string[] = [];
    const values: any[] = [];
    const allowed = ['document_type', 'custom_label', 'issue_date', 'expiration_date',
      'reminder_days_before', 'notes'];
    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(data[key]);
      }
    }
    if (fields.length === 0) throw new Error('No fields to update');
    fields.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    db.prepare(`UPDATE vault_documents SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return db.prepare('SELECT * FROM vault_documents WHERE id = ?').get(id);
  });

  safeHandle('vault:delete', (_event, id: number) => {
    requireTier('pro');
    const doc = db.prepare('SELECT doc_type, title FROM vault_documents WHERE id = ?').get(id) as any;
    db.prepare("UPDATE vault_documents SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    auditLog({ actionType: 'vault_document_deleted', entityType: 'vault_document', entityId: id, detail: { doc_type: doc?.doc_type, title: doc?.title } });
    return true;
  });

  safeHandle('vault:open', (_event, id: number) => {
    requireTier('pro');
    const doc = db.prepare('SELECT * FROM vault_documents WHERE id = ?').get(id) as any;
    if (!doc) throw new Error('Document not found');
    shell.openPath(doc.file_path);
    return doc.file_path;
  });

  safeHandle('vault:getExpiringDocuments', () => {
    requireTier('pro');
    // Return documents that are expired or expiring within their reminder window
    return db.prepare(`
      SELECT * FROM vault_documents
      WHERE deleted_at IS NULL
        AND expiration_date IS NOT NULL
        AND date(expiration_date) <= date('now', '+' || reminder_days_before || ' days')
      ORDER BY expiration_date ASC
    `).all();
  });

  safeHandle('vault:exportCredentialingPacket', async (_event, documentIds: number[]) => {
    requireTier('pro');
    if (!documentIds?.length) throw new Error('No documents selected');

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export Credentialing Packet',
      defaultPath: `credentialing_packet_${new Date().toISOString().slice(0, 10)}.zip`,
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
    });
    if (canceled || !filePath) return null;

    const output = fs.createWriteStream(filePath);
    const archive = archiver('zip', { zlib: { level: 9 } });
    archive.pipe(output);

    for (const docId of documentIds) {
      const doc = db.prepare('SELECT * FROM vault_documents WHERE id = ? AND deleted_at IS NULL').get(docId) as any;
      if (doc && fs.existsSync(doc.file_path)) {
        archive.file(doc.file_path, { name: doc.original_name || doc.filename });
      }
    }

    await archive.finalize();
    return filePath;
  });

  // ══════════════════════════════════════════════════════════════════════
  // ── Compliance Tracking (Basic + Pro) ──
  // ══════════════════════════════════════════════════════════════════════

  safeHandle('compliance:getByClient', (_event, clientId: number) => {
    requireTier('basic');
    let record = db.prepare('SELECT * FROM compliance_tracking WHERE client_id = ?').get(clientId) as any;
    if (!record) {
      // Auto-create compliance tracking for the client with defaults
      const result = db.prepare(`
        INSERT INTO compliance_tracking (client_id) VALUES (?)
      `).run(clientId);
      record = db.prepare('SELECT * FROM compliance_tracking WHERE id = ?').get(result.lastInsertRowid);
    }
    return record;
  });

  safeHandle('compliance:updateSettings', (_event, clientId: number, data: any) => {
    requireTier('basic');
    // Ensure record exists and capture before-state for audit
    let record = db.prepare('SELECT * FROM compliance_tracking WHERE client_id = ?').get(clientId) as any;
    if (!record) {
      db.prepare('INSERT INTO compliance_tracking (client_id) VALUES (?)').run(clientId);
      record = db.prepare('SELECT * FROM compliance_tracking WHERE client_id = ?').get(clientId) as any;
    }

    const fields: string[] = [];
    const values: any[] = [];
    const allowed = ['tracking_enabled', 'compliance_preset', 'progress_visit_threshold',
      'progress_day_threshold', 'recert_day_threshold', 'physician_order_required',
      'physician_order_expiration', 'physician_order_document_id'];
    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(data[key]);
      }
    }
    if (fields.length > 0) {
      fields.push('updated_at = CURRENT_TIMESTAMP');
      values.push(clientId);
      db.prepare(`UPDATE compliance_tracking SET ${fields.join(', ')} WHERE client_id = ?`).run(...values);
    }

    // ── Audit: log when compliance tracking is disabled ──
    if (record?.tracking_enabled && data.tracking_enabled === 0) {
      auditLog({ actionType: 'compliance_tracking_disabled', entityType: 'compliance', clientId,
        detail: { previous_preset: record.compliance_preset || 'unknown' } });
    }

    return db.prepare('SELECT * FROM compliance_tracking WHERE client_id = ?').get(clientId);
  });

  safeHandle('compliance:incrementVisit', (_event, clientId: number) => {
    requireTier('basic');
    db.prepare(`
      UPDATE compliance_tracking
      SET visits_since_last_progress = visits_since_last_progress + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE client_id = ?
    `).run(clientId);
    return db.prepare('SELECT * FROM compliance_tracking WHERE client_id = ?').get(clientId);
  });

  safeHandle('compliance:resetProgressCounter', (_event, clientId: number) => {
    requireTier('basic');
    const now = new Date().toISOString().slice(0, 10);
    db.prepare(`
      UPDATE compliance_tracking
      SET visits_since_last_progress = 0,
          last_progress_date = ?,
          next_progress_due = date(?, '+' || progress_day_threshold || ' days'),
          updated_at = CURRENT_TIMESTAMP
      WHERE client_id = ?
    `).run(now, now, clientId);
    return db.prepare('SELECT * FROM compliance_tracking WHERE client_id = ?').get(clientId);
  });

  safeHandle('compliance:resetRecertCounter', (_event, clientId: number) => {
    requireTier('basic');
    const now = new Date().toISOString().slice(0, 10);
    db.prepare(`
      UPDATE compliance_tracking
      SET last_recert_date = ?,
          next_recert_due = date(?, '+' || recert_day_threshold || ' days'),
          recert_md_signature_received = 0,
          updated_at = CURRENT_TIMESTAMP
      WHERE client_id = ?
    `).run(now, now, clientId);
    return db.prepare('SELECT * FROM compliance_tracking WHERE client_id = ?').get(clientId);
  });

  safeHandle('compliance:getAlerts', () => {
    requireTier('basic');
    const alerts: any[] = [];
    const records = db.prepare(`
      SELECT ct.*, c.first_name, c.last_name
      FROM compliance_tracking ct
      JOIN clients c ON c.id = ct.client_id
      WHERE ct.tracking_enabled = 1
        AND c.deleted_at IS NULL
        AND c.status = 'active'
    `).all() as any[];

    const today = new Date().toISOString().slice(0, 10);

    for (const r of records) {
      const clientName = `${r.first_name} ${r.last_name}`;
      const visitPct = r.progress_visit_threshold > 0
        ? r.visits_since_last_progress / r.progress_visit_threshold
        : 0;

      // Progress report alerts
      if (r.visits_since_last_progress >= r.progress_visit_threshold) {
        alerts.push({
          client_id: r.client_id, client_name: clientName,
          alert_type: 'progress_overdue',
          detail: `${r.visits_since_last_progress}/${r.progress_visit_threshold} visits — progress report overdue`,
          visits_count: r.visits_since_last_progress, threshold: r.progress_visit_threshold,
        });
      } else if (visitPct >= 0.8) {
        alerts.push({
          client_id: r.client_id, client_name: clientName,
          alert_type: 'progress_due',
          detail: `${r.visits_since_last_progress}/${r.progress_visit_threshold} visits — progress report due soon`,
          visits_count: r.visits_since_last_progress, threshold: r.progress_visit_threshold,
        });
      }

      // Day-based progress check
      if (r.next_progress_due && r.next_progress_due <= today) {
        alerts.push({
          client_id: r.client_id, client_name: clientName,
          alert_type: 'progress_overdue',
          detail: `Progress report overdue since ${r.next_progress_due}`,
        });
      }

      // Recertification alerts
      if (r.next_recert_due) {
        if (r.next_recert_due <= today) {
          alerts.push({
            client_id: r.client_id, client_name: clientName,
            alert_type: 'recert_overdue',
            detail: `Recertification overdue since ${r.next_recert_due}`,
          });
        } else {
          // Check if within 14 days
          const recertDate = new Date(r.next_recert_due);
          const daysUntil = (recertDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24);
          if (daysUntil <= 14) {
            alerts.push({
              client_id: r.client_id, client_name: clientName,
              alert_type: 'recert_due',
              detail: `Recertification due ${r.next_recert_due} (${Math.ceil(daysUntil)} days)`,
            });
          }
        }
      }
    }

    return alerts;
  });

  safeHandle('compliance:getDueItems', (_event, clientId: number) => {
    requireTier('basic');
    // Similar to getAlerts but for a single client
    const r = db.prepare(`
      SELECT ct.*, c.first_name, c.last_name
      FROM compliance_tracking ct
      JOIN clients c ON c.id = ct.client_id
      WHERE ct.client_id = ?
    `).get(clientId) as any;

    if (!r) return [];

    const alerts: any[] = [];
    const today = new Date().toISOString().slice(0, 10);
    const clientName = `${r.first_name} ${r.last_name}`;

    if (r.visits_since_last_progress >= r.progress_visit_threshold) {
      alerts.push({ client_id: clientId, client_name: clientName, alert_type: 'progress_overdue',
        detail: `${r.visits_since_last_progress}/${r.progress_visit_threshold} visits`, visits_count: r.visits_since_last_progress, threshold: r.progress_visit_threshold });
    } else if (r.progress_visit_threshold > 0 && r.visits_since_last_progress / r.progress_visit_threshold >= 0.8) {
      alerts.push({ client_id: clientId, client_name: clientName, alert_type: 'progress_due',
        detail: `${r.visits_since_last_progress}/${r.progress_visit_threshold} visits`, visits_count: r.visits_since_last_progress, threshold: r.progress_visit_threshold });
    }

    if (r.next_recert_due && r.next_recert_due <= today) {
      alerts.push({ client_id: clientId, client_name: clientName, alert_type: 'recert_overdue', detail: `Overdue since ${r.next_recert_due}` });
    }

    return alerts;
  });

  // ══════════════════════════════════════════════════════════════════════
  // ── Basic Alerts (Basic + Pro) ──
  // ══════════════════════════════════════════════════════════════════════

  safeHandle('dashboard:getBasicAlerts', () => {
    requireTier('basic');
    const today = new Date().toISOString().slice(0, 10);

    // Unsigned notes
    const unsignedNotes = db.prepare(`
      SELECT n.id, n.client_id, n.date_of_service, n.created_at,
        c.first_name || ' ' || c.last_name AS client_name
      FROM notes n
      JOIN clients c ON c.id = n.client_id
      WHERE n.signed_at IS NULL AND n.deleted_at IS NULL AND c.deleted_at IS NULL
      ORDER BY n.date_of_service DESC
    `).all();

    // Compliance alerts (progress reports + recertifications)
    const complianceAlerts: any[] = [];
    const complianceRecords = db.prepare(`
      SELECT ct.*, c.first_name, c.last_name
      FROM compliance_tracking ct
      JOIN clients c ON c.id = ct.client_id
      WHERE ct.tracking_enabled = 1 AND c.deleted_at IS NULL AND c.status = 'active'
    `).all() as any[];

    for (const r of complianceRecords) {
      const clientName = `${r.first_name} ${r.last_name}`;
      const visitPct = r.progress_visit_threshold > 0
        ? r.visits_since_last_progress / r.progress_visit_threshold
        : 0;

      // Visit-based progress report
      if (r.visits_since_last_progress >= r.progress_visit_threshold) {
        complianceAlerts.push({ client_id: r.client_id, client_name: clientName, alert_type: 'progress_overdue',
          detail: `${r.visits_since_last_progress}/${r.progress_visit_threshold} visits — progress report overdue` });
      } else if (visitPct >= 0.8) {
        complianceAlerts.push({ client_id: r.client_id, client_name: clientName, alert_type: 'progress_due',
          detail: `${r.visits_since_last_progress}/${r.progress_visit_threshold} visits — progress report due soon` });
      }

      // Day-based progress
      if (r.next_progress_due && r.next_progress_due <= today) {
        complianceAlerts.push({ client_id: r.client_id, client_name: clientName, alert_type: 'progress_overdue',
          detail: `Progress report overdue since ${r.next_progress_due}` });
      }

      // Recertification
      if (r.next_recert_due) {
        if (r.next_recert_due <= today) {
          complianceAlerts.push({ client_id: r.client_id, client_name: clientName, alert_type: 'recert_overdue',
            detail: `Recertification overdue since ${r.next_recert_due}` });
        } else {
          const daysUntil = (new Date(r.next_recert_due).getTime() - Date.now()) / (1000 * 60 * 60 * 24);
          if (daysUntil <= 14) {
            complianceAlerts.push({ client_id: r.client_id, client_name: clientName, alert_type: 'recert_due',
              detail: `Recertification due ${r.next_recert_due} (${Math.ceil(daysUntil)} days)` });
          }
        }
      }
    }

    // Expiring physician orders (within 30 days)
    const expiringOrders = db.prepare(`
      SELECT ct.client_id, ct.physician_order_expiration,
        c.first_name || ' ' || c.last_name AS client_name
      FROM compliance_tracking ct
      JOIN clients c ON c.id = ct.client_id
      WHERE ct.physician_order_required = 1
        AND ct.physician_order_expiration IS NOT NULL
        AND date(ct.physician_order_expiration) <= date('now', '+30 days')
        AND c.deleted_at IS NULL AND c.status = 'active'
      ORDER BY ct.physician_order_expiration
    `).all();

    // Authorization alerts (>80% used or <30 days remaining)
    const authorizationAlerts = db.prepare(`
      SELECT a.*, c.first_name || ' ' || c.last_name AS client_name
      FROM authorizations a
      JOIN clients c ON c.id = a.client_id
      WHERE a.deleted_at IS NULL AND a.status = 'active'
        AND (
          (a.units_approved > 0 AND CAST(a.units_used AS REAL) / a.units_approved >= 0.8)
          OR (a.end_date IS NOT NULL AND date(a.end_date) <= date('now', '+30 days'))
        )
      ORDER BY a.end_date
    `).all();

    // Incomplete charts — only critical status (missing DOB or diagnosis) for active clients
    const activeClients = db.prepare(`
      SELECT id, first_name, last_name, dob, primary_dx_code
      FROM clients
      WHERE deleted_at IS NULL AND status = 'active'
        AND (dob IS NULL OR dob = '' OR primary_dx_code IS NULL OR primary_dx_code = '')
      ORDER BY last_name, first_name
    `).all() as any[];

    const incompleteCharts = activeClients.map((c: any) => {
      const missingFields: string[] = [];
      if (!c.dob) missingFields.push('Date of Birth');
      if (!c.primary_dx_code) missingFields.push('Primary Diagnosis');
      return { clientId: c.id, clientName: `${c.first_name} ${c.last_name}`, missingFields };
    });

    return { unsignedNotes, complianceAlerts, expiringOrders, authorizationAlerts, incompleteCharts };
  });

  // Outstanding balance for dashboard stat card (no Pro gate)
  safeHandle('dashboard:getOutstandingBalance', () => {
    const outstanding = (db.prepare(`
      SELECT COALESCE(SUM(total_amount), 0) AS total
      FROM invoices
      WHERE status NOT IN ('paid', 'void') AND deleted_at IS NULL
    `).get() as any).total;

    const unpaidCount = (db.prepare(`
      SELECT COUNT(*) AS cnt
      FROM invoices
      WHERE status NOT IN ('paid', 'void') AND deleted_at IS NULL
    `).get() as any).cnt;

    return { outstanding, unpaidCount };
  });

  safeHandle('dashboard:getAnalytics', (_event, filters?: { startDate?: string; endDate?: string; monthsBack?: number }) => {
    requireTier('pro');

    const now = new Date();

    // Determine date range from filters
    let rangeStartDate: string;
    let rangeEndDate: string;
    let monthsBack = 6; // default

    if (filters?.startDate && filters?.endDate) {
      // Custom date range
      rangeStartDate = filters.startDate;
      rangeEndDate = filters.endDate;
      // Calculate months between for generating month buckets
      const sd = new Date(filters.startDate + 'T00:00:00');
      const ed = new Date(filters.endDate + 'T00:00:00');
      monthsBack = Math.max(1, (ed.getFullYear() - sd.getFullYear()) * 12 + (ed.getMonth() - sd.getMonth()) + 1);
    } else {
      monthsBack = filters?.monthsBack || 6;
      const startMonth = new Date(now.getFullYear(), now.getMonth() - (monthsBack - 1), 1);
      rangeStartDate = startMonth.toISOString().slice(0, 10);
      rangeEndDate = now.toISOString().slice(0, 10);
    }

    // Build month buckets
    const months: string[] = [];
    if (filters?.startDate && filters?.endDate) {
      const sd = new Date(filters.startDate + 'T00:00:00');
      for (let i = 0; i < monthsBack; i++) {
        const d = new Date(sd.getFullYear(), sd.getMonth() + i, 1);
        months.push(d.toISOString().slice(0, 7));
      }
    } else {
      for (let i = monthsBack - 1; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        months.push(d.toISOString().slice(0, 7));
      }
    }

    // Revenue by month: invoiced vs collected
    const revenueByMonth = months.map((m) => {
      const invoiced = (db.prepare(`
        SELECT COALESCE(SUM(total_amount), 0) AS total
        FROM invoices
        WHERE substr(invoice_date, 1, 7) = ? AND status != 'void' AND deleted_at IS NULL
      `).get(m) as any).total;

      const collected = (db.prepare(`
        SELECT COALESCE(SUM(amount), 0) AS total
        FROM payments
        WHERE substr(payment_date, 1, 7) = ? AND amount > 0 AND deleted_at IS NULL
      `).get(m) as any).total;

      return { month: m, invoiced, collected };
    });

    // Client growth: new clients per month
    const clientGrowth = months.map((m) => {
      const count = (db.prepare(`
        SELECT COUNT(*) AS cnt
        FROM clients
        WHERE substr(created_at, 1, 7) = ? AND deleted_at IS NULL
      `).get(m) as any).cnt;
      return { month: m, newClients: count };
    });

    // Sessions volume: signed notes per month
    const sessionsVolume = months.map((m) => {
      const count = (db.prepare(`
        SELECT COUNT(*) AS cnt
        FROM notes
        WHERE signed_at IS NOT NULL AND substr(date_of_service, 1, 7) = ? AND deleted_at IS NULL
      `).get(m) as any).cnt;
      return { month: m, sessions: count };
    });

    // Collection rate & avg revenue scoped to the selected range
    const rangeStartMonth = months[0]; // 'YYYY-MM'
    const rangeEndMonth = months[months.length - 1];

    const totalInvoiced = (db.prepare(`
      SELECT COALESCE(SUM(total_amount), 0) AS total FROM invoices
      WHERE status != 'void' AND deleted_at IS NULL
        AND substr(invoice_date, 1, 7) >= ? AND substr(invoice_date, 1, 7) <= ?
    `).get(rangeStartMonth, rangeEndMonth) as any).total;

    const totalCollected = (db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS total FROM payments
      WHERE amount > 0 AND deleted_at IS NULL
        AND substr(payment_date, 1, 7) >= ? AND substr(payment_date, 1, 7) <= ?
    `).get(rangeStartMonth, rangeEndMonth) as any).total;

    const collectionRate = totalInvoiced > 0 ? Math.round((totalCollected / totalInvoiced) * 100 * 10) / 10 : 0;

    // Average revenue per session scoped to range
    const totalSignedNotes = (db.prepare(`
      SELECT COUNT(*) AS cnt FROM notes
      WHERE signed_at IS NOT NULL AND deleted_at IS NULL
        AND substr(date_of_service, 1, 7) >= ? AND substr(date_of_service, 1, 7) <= ?
    `).get(rangeStartMonth, rangeEndMonth) as any).cnt;
    const avgRevenuePerSession = totalSignedNotes > 0 ? Math.round((totalCollected / totalSignedNotes) * 100) / 100 : 0;

    // Stats (these are always current, not range-scoped)
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

    const outstanding = (db.prepare(`
      SELECT COALESCE(SUM(total_amount), 0) AS total
      FROM invoices
      WHERE status NOT IN ('paid', 'void') AND deleted_at IS NULL
    `).get() as any).total;

    const paidThisMonth = (db.prepare(`
      SELECT COALESCE(SUM(amount), 0) AS total
      FROM payments
      WHERE payment_date >= ? AND amount > 0 AND deleted_at IS NULL
    `).get(startOfMonth) as any).total;

    const draftCount = (db.prepare(`
      SELECT COUNT(*) AS cnt FROM invoices WHERE status = 'draft' AND deleted_at IS NULL
    `).get() as any).cnt;

    const overdueCount = (db.prepare(`
      SELECT COUNT(*) AS cnt FROM invoices WHERE status = 'overdue' AND deleted_at IS NULL
    `).get() as any).cnt;

    return {
      revenueByMonth,
      clientGrowth,
      sessionsVolume,
      collectionRate,
      avgRevenuePerSession,
      stats: { outstanding, paidThisMonth, draftCount, overdueCount },
    };
  });

  // ══════════════════════════════════════════════════════════════════════
  // ── Mileage Tracking (Pro Only) ──
  // ══════════════════════════════════════════════════════════════════════

  safeHandle('mileage:list', (_event, filters?: any) => {
    requireTier('pro');
    let query = `
      SELECT m.*,
        CASE WHEN m.client_id IS NOT NULL THEN (SELECT first_name || ' ' || last_name FROM clients WHERE id = m.client_id) END AS client_name,
        CASE WHEN m.entity_id IS NOT NULL THEN (SELECT name FROM contracted_entities WHERE id = m.entity_id) END AS entity_name
      FROM mileage_log m
      WHERE m.deleted_at IS NULL
    `;
    const params: any[] = [];
    if (filters?.startDate) { query += ' AND m.date >= ?'; params.push(filters.startDate); }
    if (filters?.endDate) { query += ' AND m.date <= ?'; params.push(filters.endDate); }
    if (filters?.entityId) { query += ' AND m.entity_id = ?'; params.push(filters.entityId); }
    if (filters?.clientId) { query += ' AND m.client_id = ?'; params.push(filters.clientId); }
    query += ' ORDER BY m.date DESC';
    return db.prepare(query).all(...params);
  });

  safeHandle('mileage:create', (_event, data: any) => {
    requireTier('pro');
    const reimbAmount = data.reimbursement_rate && data.miles
      ? data.miles * data.reimbursement_rate : null;
    const result = db.prepare(`
      INSERT INTO mileage_log (date, appointment_id, client_id, entity_id, origin_address,
        destination_address, miles, reimbursement_rate, reimbursement_amount, is_reimbursable, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.date, data.appointment_id || null, data.client_id || null, data.entity_id || null,
      data.origin_address || '', data.destination_address || '', data.miles,
      data.reimbursement_rate || null, reimbAmount, data.is_reimbursable ?? 1, data.notes || ''
    );
    return db.prepare('SELECT * FROM mileage_log WHERE id = ?').get(result.lastInsertRowid);
  });

  safeHandle('mileage:update', (_event, id: number, data: any) => {
    requireTier('pro');
    const fields: string[] = [];
    const values: any[] = [];
    const allowed = ['date', 'appointment_id', 'client_id', 'entity_id', 'origin_address',
      'destination_address', 'miles', 'reimbursement_rate', 'reimbursement_amount',
      'is_reimbursable', 'notes'];
    for (const key of allowed) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        values.push(data[key]);
      }
    }
    // Recalculate reimbursement if rate or miles changed
    if (data.miles !== undefined || data.reimbursement_rate !== undefined) {
      const existing = db.prepare('SELECT * FROM mileage_log WHERE id = ?').get(id) as any;
      const miles = data.miles ?? existing?.miles ?? 0;
      const rate = data.reimbursement_rate ?? existing?.reimbursement_rate;
      if (rate) {
        fields.push('reimbursement_amount = ?');
        values.push(miles * rate);
      }
    }
    if (fields.length === 0) throw new Error('No fields to update');
    values.push(id);
    db.prepare(`UPDATE mileage_log SET ${fields.join(', ')} WHERE id = ?`).run(...values);
    return db.prepare('SELECT * FROM mileage_log WHERE id = ?').get(id);
  });

  safeHandle('mileage:delete', (_event, id: number) => {
    requireTier('pro');
    db.prepare("UPDATE mileage_log SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    auditLog({ actionType: 'mileage_deleted', entityType: 'mileage', entityId: id });
    return true;
  });

  safeHandle('mileage:getSummary', (_event, startDate: string, endDate: string) => {
    requireTier('pro');
    const row = db.prepare(`
      SELECT
        COALESCE(SUM(miles), 0) AS totalMiles,
        COALESCE(SUM(CASE WHEN is_reimbursable = 1 THEN reimbursement_amount ELSE 0 END), 0) AS reimbursable,
        COALESCE(SUM(CASE WHEN is_reimbursable = 1 THEN miles ELSE 0 END), 0) AS reimbursableMiles,
        COALESCE(SUM(CASE WHEN is_reimbursable = 0 THEN miles ELSE 0 END), 0) AS deductibleMiles
      FROM mileage_log
      WHERE deleted_at IS NULL AND date >= ? AND date <= ?
    `).get(startDate, endDate) as any;
    return {
      totalMiles: row.totalMiles,
      reimbursable: row.reimbursable,
      deductible: row.deductibleMiles,
    };
  });

  safeHandle('mileage:exportCsv', async (_event, startDate: string, endDate: string) => {
    requireTier('pro');
    const rows = db.prepare(`
      SELECT m.*,
        CASE WHEN m.client_id IS NOT NULL THEN (SELECT first_name || ' ' || last_name FROM clients WHERE id = m.client_id) END AS client_name,
        CASE WHEN m.entity_id IS NOT NULL THEN (SELECT name FROM contracted_entities WHERE id = m.entity_id) END AS entity_name
      FROM mileage_log m
      WHERE m.deleted_at IS NULL AND m.date >= ? AND m.date <= ?
      ORDER BY m.date
    `).all(startDate, endDate) as any[];

    const headers = ['Date', 'Client', 'Entity', 'Origin', 'Destination', 'Miles', 'Rate', 'Amount', 'Reimbursable', 'Notes'];
    const csvRows = [headers.join(',')];
    for (const r of rows) {
      csvRows.push([
        r.date, `"${r.client_name || ''}"`, `"${r.entity_name || ''}"`,
        `"${r.origin_address || ''}"`, `"${r.destination_address || ''}"`,
        r.miles, r.reimbursement_rate || '', r.reimbursement_amount || '',
        r.is_reimbursable ? 'Yes' : 'No', `"${(r.notes || '').replace(/"/g, '""')}"`,
      ].join(','));
    }

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export Mileage',
      defaultPath: `mileage_${startDate}_to_${endDate}.csv`,
      filters: [{ name: 'CSV', extensions: ['csv'] }],
    });
    if (canceled || !filePath) return null;
    fs.writeFileSync(filePath, csvRows.join('\n'), 'utf-8');
    return filePath;
  });

  // ══════════════════════════════════════════════════════════════════════
  // ── Communication Log (Pro Only) ──
  // ══════════════════════════════════════════════════════════════════════

  safeHandle('communicationLog:list', (_event, clientId: number) => {
    requireTier('pro');
    return db.prepare(`
      SELECT * FROM communication_log
      WHERE client_id = ? AND deleted_at IS NULL
      ORDER BY communication_date DESC
    `).all(clientId);
  });

  safeHandle('communicationLog:create', (_event, data: any) => {
    requireTier('pro');
    const result = db.prepare(`
      INSERT INTO communication_log (client_id, entity_id, communication_date, type, direction, contact_name, summary)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.client_id, data.entity_id || null,
      data.communication_date || new Date().toISOString(),
      data.type, data.direction, data.contact_name || '', data.summary
    );
    return db.prepare('SELECT * FROM communication_log WHERE id = ?').get(result.lastInsertRowid);
  });

  safeHandle('communicationLog:delete', (_event, id: number) => {
    requireTier('pro');
    const entry = db.prepare('SELECT client_id FROM communication_log WHERE id = ?').get(id) as any;
    db.prepare("UPDATE communication_log SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
    auditLog({ actionType: 'communication_deleted', entityType: 'communication_log', entityId: id, clientId: entry?.client_id });
    return true;
  });

  // ══════════════════════════════════════════════════════════════════════
  // ── Physician Directory ──
  // ══════════════════════════════════════════════════════════════════════

  safeHandle('physicians:list', (_event, filters?: { search?: string; favoritesOnly?: boolean }) => {
    let query = 'SELECT * FROM physicians WHERE deleted_at IS NULL';
    const params: any[] = [];

    if (filters?.search) {
      query += ' AND (name LIKE ? OR npi LIKE ? OR clinic_name LIKE ? OR specialty LIKE ?)';
      const q = `%${filters.search}%`;
      params.push(q, q, q, q);
    }
    if (filters?.favoritesOnly) {
      query += ' AND is_favorite = 1';
    }

    query += ' ORDER BY is_favorite DESC, name ASC';
    return db.prepare(query).all(...params);
  });

  safeHandle('physicians:get', (_event, id: number) => {
    return db.prepare('SELECT * FROM physicians WHERE id = ? AND deleted_at IS NULL').get(id);
  });

  safeHandle('physicians:create', (_event, data: any) => {
    const result = db.prepare(`
      INSERT INTO physicians (name, npi, fax_number, phone, specialty, clinic_name, address, city, state, zip, notes, is_favorite)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.name || '',
      data.npi || '',
      data.fax_number || '',
      data.phone || '',
      data.specialty || '',
      data.clinic_name || '',
      data.address || '',
      data.city || '',
      data.state || '',
      data.zip || '',
      data.notes || '',
      data.is_favorite ? 1 : 0
    );
    return db.prepare('SELECT * FROM physicians WHERE id = ?').get(result.lastInsertRowid);
  });

  safeHandle('physicians:update', (_event, id: number, data: any) => {
    const fields: string[] = [];
    const params: any[] = [];

    for (const key of ['name', 'npi', 'fax_number', 'phone', 'specialty', 'clinic_name', 'address', 'city', 'state', 'zip', 'notes']) {
      if (data[key] !== undefined) {
        fields.push(`${key} = ?`);
        params.push(data[key]);
      }
    }
    if (data.is_favorite !== undefined) {
      fields.push('is_favorite = ?');
      params.push(data.is_favorite ? 1 : 0);
    }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')");
      params.push(id);
      db.prepare(`UPDATE physicians SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    }

    return db.prepare('SELECT * FROM physicians WHERE id = ?').get(id);
  });

  safeHandle('physicians:delete', (_event, id: number) => {
    db.prepare("UPDATE physicians SET deleted_at = datetime('now') WHERE id = ?").run(id);
    return true;
  });

  safeHandle('physicians:search', (_event, query: string) => {
    const q = `%${query}%`;
    return db.prepare(
      'SELECT * FROM physicians WHERE deleted_at IS NULL AND (name LIKE ? OR npi LIKE ? OR clinic_name LIKE ? OR fax_number LIKE ?) ORDER BY is_favorite DESC, name ASC LIMIT 20'
    ).all(q, q, q, q);
  });

  // ══════════════════════════════════════════════════════════════════════
  // ── Intake Forms ──
  // ══════════════════════════════════════════════════════════════════════

  safeHandle('intakeForms:listTemplates', () => {
    const rows = db.prepare('SELECT * FROM intake_form_templates ORDER BY sort_order ASC').all() as any[];
    return rows.map((r: any) => ({
      ...r,
      sections: JSON.parse(r.sections || '[]'),
      is_active: !!r.is_active,
    }));
  });

  safeHandle('intakeForms:getTemplate', (_event, id: number) => {
    const row = db.prepare('SELECT * FROM intake_form_templates WHERE id = ?').get(id) as any;
    if (!row) throw new Error('Template not found');
    return { ...row, sections: JSON.parse(row.sections || '[]'), is_active: !!row.is_active };
  });

  safeHandle('intakeForms:updateTemplate', (_event, id: number, data: any) => {
    const fields: string[] = [];
    const params: any[] = [];

    if (data.name !== undefined) { fields.push('name = ?'); params.push(data.name); }
    if (data.description !== undefined) { fields.push('description = ?'); params.push(data.description); }
    if (data.sections !== undefined) { fields.push('sections = ?'); params.push(JSON.stringify(data.sections)); }
    if (data.is_active !== undefined) { fields.push('is_active = ?'); params.push(data.is_active ? 1 : 0); }
    if (data.sort_order !== undefined) { fields.push('sort_order = ?'); params.push(data.sort_order); }

    if (fields.length > 0) {
      fields.push("updated_at = datetime('now')");
      params.push(id);
      db.prepare(`UPDATE intake_form_templates SET ${fields.join(', ')} WHERE id = ?`).run(...params);
    }

    const row = db.prepare('SELECT * FROM intake_form_templates WHERE id = ?').get(id) as any;
    return { ...row, sections: JSON.parse(row.sections || '[]'), is_active: !!row.is_active };
  });

  safeHandle('intakeForms:resetTemplate', (_event, slug: string) => {
    const defaultTmpl = DEFAULT_INTAKE_TEMPLATES.find(t => t.slug === slug);
    if (!defaultTmpl) throw new Error(`No default template for slug: ${slug}`);

    db.prepare('DELETE FROM intake_form_templates WHERE slug = ?').run(slug);
    db.prepare(
      'INSERT INTO intake_form_templates (name, slug, description, sections, is_active, sort_order) VALUES (?, ?, ?, ?, 1, ?)'
    ).run(defaultTmpl.name, defaultTmpl.slug, defaultTmpl.description, JSON.stringify(defaultTmpl.sections), defaultTmpl.sort_order);

    const row = db.prepare('SELECT * FROM intake_form_templates WHERE slug = ?').get(slug) as any;
    return { ...row, sections: JSON.parse(row.sections || '[]'), is_active: !!row.is_active };
  });

  safeHandle('intakeForms:generatePdf', async (_event, data: { templateIds: number[]; clientId?: number; fillable?: boolean }) => {
    const templates = data.templateIds.map(id => {
      const row = db.prepare('SELECT * FROM intake_form_templates WHERE id = ?').get(id) as any;
      if (!row) throw new Error(`Template ${id} not found`);
      return { ...row, sections: JSON.parse(row.sections || '[]') };
    });

    const practiceRow = db.prepare("SELECT value FROM settings WHERE key = 'practice_info'").get() as any;
    const practiceInfo = practiceRow ? JSON.parse(practiceRow.value) : {};

    let clientInfo: any = undefined;
    if (data.clientId) {
      clientInfo = db.prepare('SELECT * FROM clients WHERE id = ?').get(data.clientId);
    }

    const pdfBytes = await generateIntakePdf({
      templates,
      practiceInfo: {
        name: practiceInfo.name || '',
        phone: practiceInfo.phone || '',
        address: practiceInfo.address || '',
        city: practiceInfo.city || '',
        state: practiceInfo.state || '',
        zip: practiceInfo.zip || '',
        npi: practiceInfo.npi || '',
        tax_id: practiceInfo.tax_id || '',
      },
      clientInfo,
      fillable: data.fillable,
      logoBase64: getLogoBase64(),
    });

    const base64Pdf = Buffer.from(pdfBytes).toString('base64');
    const clientName = clientInfo ? `${clientInfo.first_name}_${clientInfo.last_name}` : 'blank';
    const filename = `intake_packet_${clientName}_${new Date().toISOString().slice(0, 10)}.pdf`;

    return { base64Pdf, filename };
  });

  safeHandle('intakeForms:savePdf', async (_event, data: { base64Pdf: string; filename: string }) => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      defaultPath: data.filename,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });
    if (canceled || !filePath) return null;

    fs.writeFileSync(filePath, Buffer.from(data.base64Pdf, 'base64'));
    return filePath;
  });

  safeHandle('intakeForms:reorderTemplates', (_event, ids: number[]) => {
    const stmt = db.prepare("UPDATE intake_form_templates SET sort_order = ?, updated_at = datetime('now') WHERE id = ?");
    const txn = db.transaction(() => {
      ids.forEach((id: number, i: number) => stmt.run(i + 1, id));
    });
    txn();
    return true;
  });

  // ══════════════════════════════════════════════════════════════════════
  // ── Fax (SRFax) ──
  // ══════════════════════════════════════════════════════════════════════

  // Helper: generate a single document PDF buffer from a docType + id
  function buildDocumentPdf(docId: number, docType: string, fallbackClientId?: number): { buffer: Buffer; label: string; fileName: string; clientName: string } {
    if (docType === 'eval') {
      const evalItem = db.prepare('SELECT * FROM evaluations WHERE id = ? AND deleted_at IS NULL').get(docId) as any;
      if (!evalItem) throw new Error('Evaluation not found');
      const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(evalItem.client_id || fallbackClientId) as any;
      if (!client) throw new Error('Client not found');
      const buffer = buildSingleEvalPdf(client, evalItem);
      const evalTypeLabel = evalItem.eval_type === 'reassessment' ? 'Reassessment' : 'Evaluation';
      return { buffer, label: evalTypeLabel, fileName: `${evalTypeLabel}_${evalItem.eval_date || 'undated'}.pdf`, clientName: `${client.first_name} ${client.last_name}` };
    } else if (docType === 'note') {
      const note = db.prepare('SELECT * FROM notes WHERE id = ? AND deleted_at IS NULL').get(docId) as any;
      if (!note) throw new Error('Note not found');
      const client = db.prepare('SELECT * FROM clients WHERE id = ?').get(note.client_id || fallbackClientId) as any;
      if (!client) throw new Error('Client not found');
      const noteFormatVal = (db.prepare("SELECT value FROM settings WHERE key = 'note_format'").get() as any)?.value || 'SOAP';
      const pdfSections = NOTE_FORMAT_SECTIONS[noteFormatVal as NoteFormat].filter((s: any) => s.label !== '(unused)');
      const buffer = buildSingleNotePdf(client, note, pdfSections);
      let prefix = 'Treatment Note';
      if (note.note_type === 'progress_report') prefix = 'Progress Report';
      else if (note.note_type === 'discharge') prefix = 'Discharge Summary';
      return { buffer, label: prefix, fileName: `${prefix.replace(/ /g, '_')}_${note.date_of_service || 'undated'}.pdf`, clientName: `${client.first_name} ${client.last_name}` };
    } else {
      const docRecord = db.prepare('SELECT * FROM client_documents WHERE id = ?').get(docId) as any;
      if (!docRecord) throw new Error('Document not found');
      const docPath = path.join(getDataPath(), 'documents', docRecord.filename);
      if (!fs.existsSync(docPath)) throw new Error('Document file not found on disk');
      const buffer = fs.readFileSync(docPath);
      return { buffer, label: docRecord.category?.replace(/_/g, ' ') || 'Document', fileName: docRecord.original_name || docRecord.filename, clientName: '' };
    }
  }

  safeHandle('fax:send', async (_event, data: {
    documentId?: number;
    docType?: 'eval' | 'note' | 'document';
    documents?: Array<{ id: number; type: 'eval' | 'note' | 'document' }>;
    physicianId?: number;
    faxNumber: string;
    clientId?: number;
    requestSignature?: boolean;
  }) => {
    const provider = faxRouter.getProvider(); // Throws if not configured

    const practice = db.prepare('SELECT * FROM practice WHERE id = 1').get() as any;
    let clientName = 'Patient';
    const documentLabels: string[] = [];
    const pdfBuffers: Buffer[] = [];
    let fileName = 'document.pdf';

    // Look up physician name for cover page
    let recipientName = '';
    if (data.physicianId) {
      const phys = db.prepare('SELECT name FROM physicians WHERE id = ?').get(data.physicianId) as any;
      if (phys) recipientName = phys.name;
    }

    // Look up client name
    if (data.clientId) {
      const cl = db.prepare('SELECT first_name, last_name FROM clients WHERE id = ?').get(data.clientId) as any;
      if (cl) clientName = `${cl.first_name} ${cl.last_name}`;
    }

    // Build list of documents to process — support both single doc and multi-doc
    const docList: Array<{ id: number; type: string }> = [];
    if (data.documents && data.documents.length > 0) {
      docList.push(...data.documents);
    } else if (data.documentId) {
      docList.push({ id: data.documentId, type: data.docType || 'document' });
    }

    if (docList.length === 0) throw new Error('No documents selected to fax');

    // Generate PDFs for each document
    for (const doc of docList) {
      const result = buildDocumentPdf(doc.id, doc.type, data.clientId);
      pdfBuffers.push(result.buffer);
      documentLabels.push(result.label);
      if (result.clientName) clientName = result.clientName;
      if (docList.length === 1) fileName = result.fileName;
    }

    // If multiple docs, set a combined filename
    if (docList.length > 1) {
      fileName = `Fax_${docList.length}_documents_${new Date().toISOString().split('T')[0]}.pdf`;
    }

    // Merge all document PDFs into one
    let documentBuffer: Buffer;
    if (pdfBuffers.length === 1) {
      documentBuffer = pdfBuffers[0];
    } else {
      const mergedDoc = await PDFLibDocument.create();
      for (const buf of pdfBuffers) {
        try {
          const srcDoc = await PDFLibDocument.load(buf);
          const pages = await mergedDoc.copyPages(srcDoc, srcDoc.getPageIndices());
          for (const page of pages) mergedDoc.addPage(page);
        } catch (err) {
          console.error('[Fax] Failed to merge a document PDF, skipping:', err);
        }
      }
      documentBuffer = Buffer.from(await mergedDoc.save());
    }

    // Get practice fax number (caller ID) for cover page "return fax" line
    const practiceFax = faxRouter.getProviderFaxNumber();

    // Count document pages for cover page "Pages:" field
    let docPageCount = 1;
    try {
      const tempDoc = await PDFLibDocument.load(documentBuffer);
      docPageCount = tempDoc.getPageCount();
    } catch { /* non-PDF file, assume 1 page */ }

    // Build document label for cover page
    const documentLabel = docList.length === 1
      ? documentLabels[0]
      : `${docList.length} Documents (${documentLabels.join(', ')})`;

    // Generate cover page
    const coverBuffer = buildFaxCoverPage({
      practice,
      recipientName,
      recipientFax: data.faxNumber,
      clientName,
      documentLabel,
      totalPages: docPageCount + 1, // +1 for cover page
      requestSignature: data.requestSignature,
      practiceFax,
    });

    // Merge cover page + document(s) into single PDF
    const finalBuffer = await mergePdfs(coverBuffer, documentBuffer);
    const fileContent = finalBuffer.toString('base64');

    // Send via active fax provider
    const result = await provider.sendFax({
      toFaxNumber: data.faxNumber,
      files: [{ fileName, contentBase64: fileContent }],
      senderName: practice?.name || '',
    });

    if (!result.success) {
      throw new Error(result.error || 'Failed to send fax');
    }

    // Only store document_id when it's a single client_documents FK
    const faxLogDocId = (docList.length === 1 && docList[0].type === 'document') ? docList[0].id : null;

    // Track which eval/note was faxed (if exactly one in the list)
    const evalIds = docList.filter(d => d.type === 'eval').map(d => d.id);
    const noteIds = docList.filter(d => d.type === 'note').map(d => d.id);
    const faxLogEvalId = evalIds.length === 1 ? evalIds[0] : null;
    const faxLogNoteId = noteIds.length === 1 ? noteIds[0] : null;

    const currentProviderType = faxRouter.getProviderType() || '';

    const insertResult = db.prepare(`
      INSERT INTO fax_log (direction, client_id, physician_id, fax_number, document_id, eval_id, note_id, srfax_id, provider_fax_id, fax_provider, status, sent_at)
      VALUES ('outbound', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'queued', datetime('now', 'localtime'))
    `).run(
      data.clientId || null,
      data.physicianId || null,
      data.faxNumber,
      faxLogDocId,
      faxLogEvalId,
      faxLogNoteId,
      result.faxId, // backward compat: also store in srfax_id
      result.faxId,
      currentProviderType
    );

    return db.prepare('SELECT * FROM fax_log WHERE id = ?').get(insertResult.lastInsertRowid);
  });

  safeHandle('fax:getStatus', (_event, faxLogId: number) => {
    const entry = db.prepare('SELECT * FROM fax_log WHERE id = ?').get(faxLogId) as any;
    if (!entry) throw new Error('Fax log entry not found');
    return entry;
  });

  safeHandle('fax:listInbox', () => {
    return db.prepare(`
      SELECT fl.*,
        c.first_name || ' ' || c.last_name AS client_name,
        p.name AS physician_name,
        cd.original_name AS document_name
      FROM fax_log fl
      LEFT JOIN clients c ON fl.client_id = c.id
      LEFT JOIN physicians p ON fl.physician_id = p.id
      LEFT JOIN client_documents cd ON fl.document_id = cd.id
      WHERE fl.direction = 'inbound'
      ORDER BY fl.created_at DESC
    `).all();
  });

  safeHandle('fax:listOutbox', () => {
    return db.prepare(`
      SELECT fl.*,
        c.first_name || ' ' || c.last_name AS client_name,
        p.name AS physician_name,
        cd.original_name AS document_name
      FROM fax_log fl
      LEFT JOIN clients c ON fl.client_id = c.id
      LEFT JOIN physicians p ON fl.physician_id = p.id
      LEFT JOIN client_documents cd ON fl.document_id = cd.id
      WHERE fl.direction = 'outbound'
      ORDER BY fl.created_at DESC
    `).all();
  });

  safeHandle('fax:retrieveFax', async (_event, providerFaxId: string) => {
    const provider = faxRouter.getProvider();
    const base64Pdf = await provider.downloadFax(providerFaxId, 'in');
    return { base64Pdf, filename: `fax_${providerFaxId}.pdf` };
  });

  safeHandle('fax:matchToClient', (_event, faxLogId: number, clientId: number) => {
    db.prepare(
      "UPDATE fax_log SET client_id = ?, matched_confidence = 'exact' WHERE id = ?"
    ).run(clientId, faxLogId);
    return db.prepare('SELECT * FROM fax_log WHERE id = ?').get(faxLogId);
  });

  // Get all outbound faxes with eval/note links for a client (for sent/received-back markers)
  safeHandle('faxLog:getOutboundByClient', (_event, clientId: number) => {
    return db.prepare(`
      SELECT fl.id, fl.eval_id, fl.note_id, fl.document_id, fl.status, fl.sent_at,
        (SELECT COUNT(*) FROM fax_log inb
         WHERE inb.linked_outbound_fax_id = fl.id AND inb.direction = 'inbound') AS has_received_back
      FROM fax_log fl
      WHERE fl.client_id = ? AND fl.direction = 'outbound'
        AND (fl.eval_id IS NOT NULL OR fl.note_id IS NOT NULL)
      ORDER BY fl.sent_at DESC
    `).all(clientId);
  });

  // Save a received fax to a client's chart as a document
  safeHandle('fax:saveToChart', async (_event, data: {
    faxLogId: number;
    clientId: number;
    category: string;
    linkToOutboundFaxId?: number;
  }) => {
    const provider = faxRouter.getProvider();

    const faxEntry = db.prepare('SELECT * FROM fax_log WHERE id = ?').get(data.faxLogId) as any;
    if (!faxEntry) throw new Error('Fax log entry not found');
    const faxId = faxEntry.provider_fax_id || faxEntry.srfax_id;
    if (!faxId) throw new Error('No provider fax ID for this entry');

    // 1. Retrieve the PDF from the fax provider
    const base64Pdf = await provider.downloadFax(faxId, 'in');
    if (!base64Pdf) throw new Error('Failed to retrieve fax PDF from provider');

    // 2. Save PDF to filesystem
    const uuidName = `${uuidv4()}.pdf`;
    const clientDocsDir = path.join(getDataPath(), 'documents', String(data.clientId));
    fs.mkdirSync(clientDocsDir, { recursive: true });
    const destPath = path.join(clientDocsDir, uuidName);
    fs.writeFileSync(destPath, Buffer.from(base64Pdf, 'base64'));
    const fileSize = fs.statSync(destPath).size;

    // 3. Create client_documents record
    const dateStr = faxEntry.received_at || faxEntry.created_at || '';
    const datePart = dateStr ? dateStr.split('T')[0] : new Date().toISOString().split('T')[0];
    const originalName = `Received_Fax_${(faxEntry.fax_number || 'unknown').replace(/\D/g, '')}_${datePart}.pdf`;

    const docResult = db.prepare(`
      INSERT INTO client_documents (client_id, filename, original_name, file_type, file_size, category)
      VALUES (?, ?, ?, 'application/pdf', ?, ?)
    `).run(
      data.clientId,
      uuidName,
      originalName,
      fileSize,
      data.category || 'correspondence'
    );

    // 4. Update fax_log: set document_id + optionally link to outbound fax
    if (data.linkToOutboundFaxId) {
      db.prepare(`
        UPDATE fax_log SET document_id = ?, client_id = ?, matched_confidence = 'exact',
          linked_outbound_fax_id = ?, status = 'matched'
        WHERE id = ?
      `).run(docResult.lastInsertRowid, data.clientId, data.linkToOutboundFaxId, data.faxLogId);
    } else {
      db.prepare(`
        UPDATE fax_log SET document_id = ?, client_id = ?, matched_confidence = 'exact', status = 'matched'
        WHERE id = ?
      `).run(docResult.lastInsertRowid, data.clientId, data.faxLogId);
    }

    return db.prepare('SELECT * FROM fax_log WHERE id = ?').get(data.faxLogId);
  });

  safeHandle('fax:pollStatuses', async () => {
    if (!faxRouter.isConfigured()) return { updated: 0 };
    const provider = faxRouter.getProvider();

    const pending = db.prepare(
      "SELECT * FROM fax_log WHERE direction = 'outbound' AND status IN ('queued', 'sending')"
    ).all() as any[];

    let updated = 0;
    for (const entry of pending) {
      const faxId = entry.provider_fax_id || entry.srfax_id;
      if (!faxId) continue;
      try {
        const status = await provider.checkStatus(faxId);
        let newStatus = entry.status;
        if (status.status === 'sent') newStatus = 'sent';
        else if (status.status === 'failed') newStatus = 'failed';
        else if (status.status === 'sending') newStatus = 'sending';

        if (newStatus !== entry.status) {
          db.prepare(
            'UPDATE fax_log SET status = ?, pages = ?, error_message = ? WHERE id = ?'
          ).run(newStatus, status.pages || 0, status.errorMessage || '', entry.id);
          updated++;
        }
      } catch (err) {
        console.error(`[Fax] Failed to poll status for ${faxId}:`, err);
      }
    }

    return { updated };
  });

  safeHandle('fax:pollInbox', async () => {
    if (!faxRouter.isConfigured()) return { newFaxes: 0 };
    const provider = faxRouter.getProvider();
    const currentProviderType = faxRouter.getProviderType() || '';

    try {
      const inboxEntries = await provider.getInbox();
      let newFaxes = 0;

      for (const entry of inboxEntries) {
        // Check for duplicates using provider_fax_id (or legacy srfax_id)
        const existing = db.prepare(
          "SELECT id FROM fax_log WHERE (provider_fax_id = ? OR srfax_id = ?) AND direction = 'inbound'"
        ).get(entry.faxId, entry.faxId);

        if (!existing) {
          const match = matchFaxToClient(entry.fromFaxNumber, db);
          db.prepare(`
            INSERT INTO fax_log (direction, client_id, fax_number, srfax_id, provider_fax_id, fax_provider, status, pages, received_at, matched_confidence)
            VALUES ('inbound', ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            match.clientId,
            entry.fromFaxNumber,
            entry.faxId, // backward compat: also store in srfax_id
            entry.faxId,
            currentProviderType,
            match.clientId ? 'matched' : 'unmatched',
            entry.pages,
            entry.receivedAt,
            match.confidence
          );
          newFaxes++;
        }
      }

      return { newFaxes };
    } catch (err) {
      console.error('[Fax] Failed to poll inbox:', err);
      return { newFaxes: 0 };
    }
  });

  // ── Fax Provider Management ──

  safeHandle('fax:setProvider', (_event, type: FaxProviderType, credentials: Record<string, string>) => {
    requireTier('pro');
    faxRouter.setProvider(type, credentials, db, encryptSecure);
    auditLog({ actionType: 'fax_provider_set', entityType: 'settings', entityId: 0, detail: { provider: type } });
    return true;
  });

  safeHandle('fax:getProviderStatus', () => {
    return {
      configured: faxRouter.isConfigured(),
      provider: faxRouter.getProviderType(),
      faxNumber: faxRouter.getProviderFaxNumber(),
    };
  });

  safeHandle('fax:testProvider', async () => {
    requireTier('pro');
    return faxRouter.testConnection();
  });

  safeHandle('fax:removeProvider', () => {
    requireTier('pro');
    faxRouter.removeProvider(db);
    auditLog({ actionType: 'fax_provider_removed', entityType: 'settings', entityId: 0, detail: {} });
    return true;
  });

  // ══════════════════════════════════════════════════════════════════════
  // ── Dashboard (Pro Only) ──
  // ══════════════════════════════════════════════════════════════════════

  safeHandle('dashboard:getOverview', () => {
    requireTier('pro');
    const today = new Date().toISOString().slice(0, 10);

    // Today's appointments
    const todayAppointments = db.prepare(`
      SELECT a.*, c.first_name, c.last_name, c.discipline AS client_discipline,
        CASE WHEN a.entity_id IS NOT NULL THEN (SELECT name FROM contracted_entities WHERE id = a.entity_id) END AS entity_name
      FROM appointments a
      JOIN clients c ON c.id = a.client_id
      WHERE a.scheduled_date = ? AND a.deleted_at IS NULL AND a.status != 'cancelled'
      ORDER BY a.scheduled_time
    `).all(today);

    // Unsigned notes (notes without signed_at)
    const unsignedNotes = db.prepare(`
      SELECT n.id, n.client_id, n.date_of_service, n.created_at,
        c.first_name || ' ' || c.last_name AS client_name
      FROM notes n
      JOIN clients c ON c.id = n.client_id
      WHERE n.signed_at IS NULL AND n.deleted_at IS NULL AND c.deleted_at IS NULL
      ORDER BY n.date_of_service DESC
    `).all();

    // Expiring credentials (vault)
    const expiringCredentials = db.prepare(`
      SELECT * FROM vault_documents
      WHERE deleted_at IS NULL
        AND expiration_date IS NOT NULL
        AND date(expiration_date) <= date('now', '+' || reminder_days_before || ' days')
      ORDER BY expiration_date ASC
    `).all();

    // Outstanding invoices
    const outstandingInvoices = db.prepare(`
      SELECT i.*,
        CASE WHEN i.entity_id IS NOT NULL THEN (SELECT name FROM contracted_entities WHERE id = i.entity_id) END AS entity_name
      FROM invoices i
      WHERE i.deleted_at IS NULL AND i.status IN ('sent', 'overdue', 'partial')
      ORDER BY i.invoice_date DESC
    `).all();

    // Compliance alerts (reuse logic)
    // We'll call the alert logic inline
    const complianceAlerts: any[] = [];
    const complianceRecords = db.prepare(`
      SELECT ct.*, c.first_name, c.last_name
      FROM compliance_tracking ct
      JOIN clients c ON c.id = ct.client_id
      WHERE ct.tracking_enabled = 1 AND c.deleted_at IS NULL AND c.status = 'active'
    `).all() as any[];

    for (const r of complianceRecords) {
      const clientName = `${r.first_name} ${r.last_name}`;
      if (r.visits_since_last_progress >= r.progress_visit_threshold) {
        complianceAlerts.push({ client_id: r.client_id, client_name: clientName, alert_type: 'progress_overdue',
          detail: `${r.visits_since_last_progress}/${r.progress_visit_threshold} visits`, visits_count: r.visits_since_last_progress, threshold: r.progress_visit_threshold });
      }
      if (r.next_recert_due && r.next_recert_due <= today) {
        complianceAlerts.push({ client_id: r.client_id, client_name: clientName, alert_type: 'recert_overdue', detail: `Overdue since ${r.next_recert_due}` });
      }
    }

    // Expiring physician orders
    const expiringOrders = db.prepare(`
      SELECT ct.*, c.first_name, c.last_name
      FROM compliance_tracking ct
      JOIN clients c ON c.id = ct.client_id
      WHERE ct.physician_order_required = 1
        AND ct.physician_order_expiration IS NOT NULL
        AND date(ct.physician_order_expiration) <= date('now', '+30 days')
        AND c.deleted_at IS NULL AND c.status = 'active'
      ORDER BY ct.physician_order_expiration
    `).all();

    // Authorization alerts (>80% used or <30 days remaining)
    const authorizationAlerts = db.prepare(`
      SELECT * FROM authorizations
      WHERE deleted_at IS NULL AND status = 'active'
        AND (
          (units_approved > 0 AND CAST(units_used AS REAL) / units_approved >= 0.8)
          OR (end_date IS NOT NULL AND date(end_date) <= date('now', '+30 days'))
        )
      ORDER BY end_date
    `).all();

    return {
      todayAppointments,
      complianceAlerts,
      unsignedNotes,
      expiringCredentials,
      expiringOrders,
      authorizationAlerts,
      outstandingInvoices,
    };
  });

  // ══════════════════════════════════════════════════════════════════════
  // ── Year-End Reports (Pro Only) ──
  // ══════════════════════════════════════════════════════════════════════

  safeHandle('reports:yearEndSummary', (_event, year: number) => {
    requireTier('pro');
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    // Revenue by entity (from invoices)
    const revenueByEntity = db.prepare(`
      SELECT i.entity_id, ce.name AS entity_name, SUM(i.total_amount) AS total
      FROM invoices i
      LEFT JOIN contracted_entities ce ON ce.id = i.entity_id
      WHERE i.deleted_at IS NULL AND i.status = 'paid'
        AND i.invoice_date >= ? AND i.invoice_date <= ?
        AND i.entity_id IS NOT NULL
      GROUP BY i.entity_id
      ORDER BY total DESC
    `).all(startDate, endDate);

    // Private pay revenue
    const ppRow = db.prepare(`
      SELECT COALESCE(SUM(total_amount), 0) AS total
      FROM invoices
      WHERE deleted_at IS NULL AND status = 'paid'
        AND invoice_date >= ? AND invoice_date <= ?
        AND entity_id IS NULL
    `).get(startDate, endDate) as any;

    // Mileage summary
    const mileageRow = db.prepare(`
      SELECT
        COALESCE(SUM(miles), 0) AS totalMileage,
        COALESCE(SUM(CASE WHEN is_reimbursable = 1 THEN reimbursement_amount ELSE 0 END), 0) AS reimbursedMileage,
        COALESCE(SUM(CASE WHEN is_reimbursable = 0 THEN miles ELSE 0 END), 0) AS deductibleMileage
      FROM mileage_log
      WHERE deleted_at IS NULL AND date >= ? AND date <= ?
    `).get(startDate, endDate) as any;

    // Visits by entity
    const visitsByEntity = db.prepare(`
      SELECT n.entity_id, ce.name AS entity_name, COUNT(*) AS count
      FROM notes n
      LEFT JOIN contracted_entities ce ON ce.id = n.entity_id
      WHERE n.deleted_at IS NULL AND n.signed_at IS NOT NULL
        AND n.date_of_service >= ? AND n.date_of_service <= ?
        AND n.entity_id IS NOT NULL
      GROUP BY n.entity_id
      ORDER BY count DESC
    `).all(startDate, endDate);

    return {
      revenueByEntity,
      revenuePrivatePay: ppRow.total,
      totalMileage: mileageRow.totalMileage,
      reimbursedMileage: mileageRow.reimbursedMileage,
      deductibleMileage: mileageRow.deductibleMileage,
      visitsByEntity,
    };
  });

  safeHandle('reports:exportYearEnd', async (_event, year: number, format: 'pdf' | 'csv') => {
    requireTier('pro');
    // For now, export as CSV (PDF can be added later with jsPDF)
    const summary = db.prepare("SELECT 1").get(); // Trigger to ensure DB is ready
    // Re-run the summary query
    const startDate = `${year}-01-01`;
    const endDate = `${year}-12-31`;

    const { canceled, filePath } = await dialog.showSaveDialog({
      title: `Export ${year} Year-End Summary`,
      defaultPath: `year_end_summary_${year}.csv`,
      filters: [{ name: format === 'csv' ? 'CSV' : 'PDF', extensions: [format] }],
    });
    if (canceled || !filePath) return null;

    if (format === 'csv') {
      const lines: string[] = [`PocketChart Year-End Summary - ${year}`, ''];

      // Revenue by entity
      lines.push('Revenue by Contracted Entity');
      lines.push('Entity,Total Revenue');
      const revenueByEntity = db.prepare(`
        SELECT ce.name, SUM(i.total_amount) AS total
        FROM invoices i LEFT JOIN contracted_entities ce ON ce.id = i.entity_id
        WHERE i.deleted_at IS NULL AND i.status = 'paid' AND i.invoice_date >= ? AND i.invoice_date <= ? AND i.entity_id IS NOT NULL
        GROUP BY i.entity_id ORDER BY total DESC
      `).all(startDate, endDate) as any[];
      for (const r of revenueByEntity) {
        lines.push(`"${r.name}",${r.total.toFixed(2)}`);
      }

      // Private pay
      const pp = db.prepare(`SELECT COALESCE(SUM(total_amount), 0) AS total FROM invoices WHERE deleted_at IS NULL AND status = 'paid' AND invoice_date >= ? AND invoice_date <= ? AND entity_id IS NULL`).get(startDate, endDate) as any;
      lines.push('', `Private Pay Revenue,${pp.total.toFixed(2)}`);

      // Mileage
      const m = db.prepare(`SELECT COALESCE(SUM(miles), 0) AS total, COALESCE(SUM(CASE WHEN is_reimbursable = 1 THEN reimbursement_amount ELSE 0 END), 0) AS reimb FROM mileage_log WHERE deleted_at IS NULL AND date >= ? AND date <= ?`).get(startDate, endDate) as any;
      lines.push('', 'Mileage Summary');
      lines.push(`Total Miles,${m.total.toFixed(1)}`);
      lines.push(`Total Reimbursed,$${m.reimb.toFixed(2)}`);

      fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
    }

    return filePath;
  });

  // ══════════════════════════════════════════════════════════════════════
  // ── Direct Access Rules ──
  // ══════════════════════════════════════════════════════════════════════

  safeHandle('directAccess:requiresReferral', (_event, state: string, discipline: string) => {
    return checkDirectAccess(state, discipline as any);
  });

  safeHandle('directAccess:getRules', () => {
    return getDirectAccessRules();
  });

  // ══════════════════════════════════════════════════════════════════════
  // ── Client Discounts & Packages ──
  // ══════════════════════════════════════════════════════════════════════

  safeHandle('clientDiscounts:listByClient', (_event, clientId: number) => {
    return db.prepare(
      'SELECT * FROM client_discounts WHERE client_id = ? AND deleted_at IS NULL ORDER BY created_at DESC'
    ).all(clientId);
  });

  safeHandle('clientDiscounts:getActive', (_event, clientId: number) => {
    // Expire any that are past end_date
    db.prepare(`
      UPDATE client_discounts SET status = 'expired', updated_at = CURRENT_TIMESTAMP
      WHERE client_id = ? AND status = 'active' AND end_date IS NOT NULL AND end_date < date('now') AND deleted_at IS NULL
    `).run(clientId);

    return db.prepare(
      "SELECT * FROM client_discounts WHERE client_id = ? AND status = 'active' AND deleted_at IS NULL ORDER BY created_at DESC"
    ).all(clientId) || [];
  });

  safeHandle('clientDiscounts:create', (_event, data: any) => {
    const result = db.prepare(`
      INSERT INTO client_discounts (client_id, discount_type, label,
        total_sessions, paid_sessions, sessions_used, session_rate,
        flat_rate, flat_rate_sessions, flat_rate_sessions_used,
        discount_percent, discount_fixed,
        start_date, end_date, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.client_id, data.discount_type, data.label || '',
      data.total_sessions ?? null, data.paid_sessions ?? null, data.sessions_used || 0, data.session_rate ?? null,
      data.flat_rate ?? null, data.flat_rate_sessions ?? null, data.flat_rate_sessions_used || 0,
      data.discount_percent ?? null, data.discount_fixed ?? null,
      data.start_date || null, data.end_date || null, data.status || 'active', data.notes || ''
    );

    auditLog({
      actionType: 'discount_created', entityType: 'client_discount', entityId: Number(result.lastInsertRowid),
      clientId: data.client_id, detail: { discount_type: data.discount_type, label: data.label || '' }
    });

    return db.prepare('SELECT * FROM client_discounts WHERE id = ?').get(result.lastInsertRowid);
  });

  safeHandle('clientDiscounts:update', (_event, id: number, data: any) => {
    const existing = db.prepare('SELECT * FROM client_discounts WHERE id = ? AND deleted_at IS NULL').get(id) as any;
    if (!existing) throw new Error('Discount not found');

    db.prepare(`
      UPDATE client_discounts SET
        label = COALESCE(?, label),
        total_sessions = COALESCE(?, total_sessions),
        paid_sessions = COALESCE(?, paid_sessions),
        session_rate = COALESCE(?, session_rate),
        flat_rate = COALESCE(?, flat_rate),
        flat_rate_sessions = COALESCE(?, flat_rate_sessions),
        discount_percent = COALESCE(?, discount_percent),
        discount_fixed = COALESCE(?, discount_fixed),
        start_date = COALESCE(?, start_date),
        end_date = COALESCE(?, end_date),
        status = COALESCE(?, status),
        notes = COALESCE(?, notes),
        updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND deleted_at IS NULL
    `).run(
      data.label, data.total_sessions, data.paid_sessions, data.session_rate,
      data.flat_rate, data.flat_rate_sessions,
      data.discount_percent, data.discount_fixed,
      data.start_date, data.end_date, data.status, data.notes, id
    );

    return db.prepare('SELECT * FROM client_discounts WHERE id = ?').get(id);
  });

  safeHandle('clientDiscounts:delete', (_event, id: number) => {
    db.prepare("UPDATE client_discounts SET deleted_at = CURRENT_TIMESTAMP, status = 'cancelled' WHERE id = ?").run(id);
    return true;
  });

  safeHandle('clientDiscounts:incrementUsage', (_event, id: number, count?: number) => {
    const inc = count || 1;
    const discount = db.prepare('SELECT * FROM client_discounts WHERE id = ? AND deleted_at IS NULL').get(id) as any;
    if (!discount) throw new Error('Discount not found');

    if (discount.discount_type === 'package') {
      const newUsed = discount.sessions_used + inc;
      const newStatus = newUsed >= discount.total_sessions ? 'exhausted' : 'active';
      db.prepare('UPDATE client_discounts SET sessions_used = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(newUsed, newStatus, id);
    } else if (discount.discount_type === 'flat_rate') {
      const newUsed = discount.flat_rate_sessions_used + inc;
      const newStatus = discount.flat_rate_sessions && newUsed >= discount.flat_rate_sessions ? 'exhausted' : 'active';
      db.prepare('UPDATE client_discounts SET flat_rate_sessions_used = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(newUsed, newStatus, id);
    }

    return db.prepare('SELECT * FROM client_discounts WHERE id = ?').get(id);
  });

  safeHandle('clientDiscounts:decrementUsage', (_event, id: number, count?: number) => {
    const dec = count || 1;
    const discount = db.prepare('SELECT * FROM client_discounts WHERE id = ? AND deleted_at IS NULL').get(id) as any;
    if (!discount) throw new Error('Discount not found');

    if (discount.discount_type === 'package') {
      const newUsed = Math.max(0, discount.sessions_used - dec);
      db.prepare("UPDATE client_discounts SET sessions_used = ?, status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(newUsed, id);
    } else if (discount.discount_type === 'flat_rate') {
      const newUsed = Math.max(0, discount.flat_rate_sessions_used - dec);
      db.prepare("UPDATE client_discounts SET flat_rate_sessions_used = ?, status = 'active', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .run(newUsed, id);
    }

    return db.prepare('SELECT * FROM client_discounts WHERE id = ?').get(id);
  });

  // ── Discount Templates ──

  safeHandle('discountTemplates:list', () => {
    return db.prepare('SELECT * FROM discount_templates WHERE deleted_at IS NULL ORDER BY name').all();
  });

  safeHandle('discountTemplates:create', (_event, data: any) => {
    const result = db.prepare(`
      INSERT INTO discount_templates (name, discount_type,
        total_sessions, paid_sessions, session_rate,
        flat_rate, flat_rate_sessions,
        discount_percent, discount_fixed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.name, data.discount_type,
      data.total_sessions ?? null, data.paid_sessions ?? null, data.session_rate ?? null,
      data.flat_rate ?? null, data.flat_rate_sessions ?? null,
      data.discount_percent ?? null, data.discount_fixed ?? null
    );
    return db.prepare('SELECT * FROM discount_templates WHERE id = ?').get(result.lastInsertRowid);
  });

  safeHandle('discountTemplates:update', (_event, id: number, data: any) => {
    db.prepare(`
      UPDATE discount_templates SET
        name = COALESCE(?, name),
        discount_type = COALESCE(?, discount_type),
        total_sessions = COALESCE(?, total_sessions),
        paid_sessions = COALESCE(?, paid_sessions),
        session_rate = COALESCE(?, session_rate),
        flat_rate = COALESCE(?, flat_rate),
        flat_rate_sessions = COALESCE(?, flat_rate_sessions),
        discount_percent = COALESCE(?, discount_percent),
        discount_fixed = COALESCE(?, discount_fixed)
      WHERE id = ? AND deleted_at IS NULL
    `).run(
      data.name, data.discount_type,
      data.total_sessions, data.paid_sessions, data.session_rate,
      data.flat_rate, data.flat_rate_sessions,
      data.discount_percent, data.discount_fixed, id
    );
    return db.prepare('SELECT * FROM discount_templates WHERE id = ?').get(id);
  });

  safeHandle('discountTemplates:delete', (_event, id: number) => {
    db.prepare('UPDATE discount_templates SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    return true;
  });

  // ── Dashboard Scratchpad ──

  safeHandle('scratchpad:get', () => {
    const row = db.prepare('SELECT * FROM dashboard_notes ORDER BY id LIMIT 1').get();
    return row || null;
  });

  safeHandle('scratchpad:save', (_event, content: string) => {
    const existing = db.prepare('SELECT id FROM dashboard_notes ORDER BY id LIMIT 1').get() as any;
    if (existing) {
      db.prepare('UPDATE dashboard_notes SET content = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(content, existing.id);
      return db.prepare('SELECT * FROM dashboard_notes WHERE id = ?').get(existing.id);
    } else {
      const result = db.prepare('INSERT INTO dashboard_notes (content) VALUES (?)').run(content);
      return db.prepare('SELECT * FROM dashboard_notes WHERE id = ?').get(result.lastInsertRowid);
    }
  });

  // ── Dashboard Todos ──

  safeHandle('dashboardTodos:list', () => {
    return db.prepare('SELECT * FROM dashboard_todos ORDER BY completed ASC, priority DESC, position ASC').all();
  });

  safeHandle('dashboardTodos:create', (_event, text: string) => {
    const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) as mp FROM dashboard_todos').get() as any;
    const position = (maxPos?.mp ?? -1) + 1;
    const result = db.prepare('INSERT INTO dashboard_todos (text, position) VALUES (?, ?)').run(text, position);
    return db.prepare('SELECT * FROM dashboard_todos WHERE id = ?').get(result.lastInsertRowid);
  });

  safeHandle('dashboardTodos:update', (_event, id: number, data: { text?: string; completed?: number; position?: number; priority?: number }) => {
    const sets: string[] = [];
    const values: any[] = [];
    if (data.text !== undefined) { sets.push('text = ?'); values.push(data.text); }
    if (data.completed !== undefined) { sets.push('completed = ?'); values.push(data.completed); }
    if (data.position !== undefined) { sets.push('position = ?'); values.push(data.position); }
    if (data.priority !== undefined) { sets.push('priority = ?'); values.push(data.priority); }
    if (sets.length === 0) return db.prepare('SELECT * FROM dashboard_todos WHERE id = ?').get(id);
    sets.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    db.prepare(`UPDATE dashboard_todos SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return db.prepare('SELECT * FROM dashboard_todos WHERE id = ?').get(id);
  });

  safeHandle('dashboardTodos:delete', (_event, id: number) => {
    db.prepare('DELETE FROM dashboard_todos WHERE id = ?').run(id);
    return true;
  });

  safeHandle('dashboardTodos:search', (_event, query: string) => {
    return db.prepare('SELECT * FROM dashboard_todos WHERE text LIKE ? ORDER BY completed ASC, priority DESC, position ASC').all(`%${query}%`);
  });

  safeHandle('dashboardTodos:reorder', (_event, items: Array<{ id: number; position: number }>) => {
    const update = db.prepare('UPDATE dashboard_todos SET position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?');
    const reorder = db.transaction(() => {
      for (const item of items) {
        update.run(item.position, item.id);
      }
    });
    reorder();
    return db.prepare('SELECT * FROM dashboard_todos ORDER BY completed ASC, priority DESC, position ASC').all();
  });

  safeHandle('dashboardTodos:listIncomplete', () => {
    return db.prepare('SELECT * FROM dashboard_todos WHERE completed = 0 ORDER BY position ASC').all();
  });

  // ── Calendar Blocks (admin time blocks — non-clinical, no audit) ──

  safeHandle('calendarBlocks:list', (_event, filters?: { startDate?: string; endDate?: string }) => {
    let query = 'SELECT * FROM calendar_blocks WHERE 1=1';
    const params: any[] = [];
    if (filters?.startDate) { query += ' AND scheduled_date >= ?'; params.push(filters.startDate); }
    if (filters?.endDate) { query += ' AND scheduled_date <= ?'; params.push(filters.endDate); }
    query += ' ORDER BY scheduled_date, scheduled_time';
    return db.prepare(query).all(...params);
  });

  safeHandle('calendarBlocks:create', (_event, data: { title: string; scheduled_date: string; scheduled_time?: string; duration_minutes?: number; source_todo_id?: number }) => {
    const result = db.prepare(
      'INSERT INTO calendar_blocks (title, scheduled_date, scheduled_time, duration_minutes, source_todo_id) VALUES (?, ?, ?, ?, ?)'
    ).run(data.title, data.scheduled_date, data.scheduled_time || '09:00', data.duration_minutes || 30, data.source_todo_id || null);
    return db.prepare('SELECT * FROM calendar_blocks WHERE id = ?').get(result.lastInsertRowid);
  });

  safeHandle('calendarBlocks:delete', (_event, id: number) => {
    db.prepare('DELETE FROM calendar_blocks WHERE id = ?').run(id);
    return true;
  });

  safeHandle('calendarBlocks:update', (_event, id: number, data: { completed?: number; title?: string; scheduled_date?: string; scheduled_time?: string; duration_minutes?: number }) => {
    const sets: string[] = [];
    const values: any[] = [];
    if (data.completed !== undefined) { sets.push('completed = ?'); values.push(data.completed); }
    if (data.title !== undefined) { sets.push('title = ?'); values.push(data.title); }
    if (data.scheduled_date !== undefined) { sets.push('scheduled_date = ?'); values.push(data.scheduled_date); }
    if (data.scheduled_time !== undefined) { sets.push('scheduled_time = ?'); values.push(data.scheduled_time); }
    if (data.duration_minutes !== undefined) { sets.push('duration_minutes = ?'); values.push(data.duration_minutes); }
    if (sets.length === 0) return db.prepare('SELECT * FROM calendar_blocks WHERE id = ?').get(id);
    values.push(id);
    db.prepare(`UPDATE calendar_blocks SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return db.prepare('SELECT * FROM calendar_blocks WHERE id = ?').get(id);
  });

  safeHandle('calendarBlocks:deleteAndRestore', (_event, id: number) => {
    const block = db.prepare('SELECT * FROM calendar_blocks WHERE id = ?').get(id) as any;
    if (!block) return false;
    const doIt = db.transaction(() => {
      db.prepare('DELETE FROM calendar_blocks WHERE id = ?').run(id);
      if (block.source_todo_id) {
        db.prepare('UPDATE dashboard_todos SET completed = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(block.source_todo_id);
      }
    });
    doIt();
    return true;
  });

  // ── Quick Links ──

  safeHandle('quickLinks:list', () => {
    return db.prepare('SELECT * FROM quick_links ORDER BY position ASC').all();
  });

  safeHandle('quickLinks:create', (_event, data: { title: string; url: string }) => {
    const maxPos = db.prepare('SELECT COALESCE(MAX(position), -1) as mp FROM quick_links').get() as any;
    const position = (maxPos?.mp ?? -1) + 1;
    const result = db.prepare('INSERT INTO quick_links (title, url, position) VALUES (?, ?, ?)').run(data.title, data.url, position);
    return db.prepare('SELECT * FROM quick_links WHERE id = ?').get(result.lastInsertRowid);
  });

  safeHandle('quickLinks:update', (_event, id: number, data: { title?: string; url?: string; position?: number }) => {
    const sets: string[] = [];
    const values: any[] = [];
    if (data.title !== undefined) { sets.push('title = ?'); values.push(data.title); }
    if (data.url !== undefined) { sets.push('url = ?'); values.push(data.url); }
    if (data.position !== undefined) { sets.push('position = ?'); values.push(data.position); }
    if (sets.length === 0) return db.prepare('SELECT * FROM quick_links WHERE id = ?').get(id);
    values.push(id);
    db.prepare(`UPDATE quick_links SET ${sets.join(', ')} WHERE id = ?`).run(...values);
    return db.prepare('SELECT * FROM quick_links WHERE id = ?').get(id);
  });

  safeHandle('quickLinks:delete', (_event, id: number) => {
    db.prepare('DELETE FROM quick_links WHERE id = ?').run(id);
    return true;
  });

  // ══════════════════════════════════════════════════════════════════════
  // ── Waitlist (Pro) ──
  // ══════════════════════════════════════════════════════════════════════

  safeHandle('waitlist:list', (_event, filters?: { status?: string; discipline?: string }) => {
    requireTier('pro');
    let query = 'SELECT * FROM waitlist WHERE deleted_at IS NULL';
    const params: any[] = [];
    if (filters?.status) { query += ' AND status = ?'; params.push(filters.status); }
    if (filters?.discipline) { query += ' AND discipline = ?'; params.push(filters.discipline); }
    query += ' ORDER BY priority DESC, created_at DESC';
    return db.prepare(query).all(...params);
  });

  safeHandle('waitlist:create', (_event, data: {
    first_name: string;
    last_name?: string;
    phone?: string;
    email?: string;
    discipline?: string;
    referral_source?: string;
    notes?: string;
    priority?: number;
  }) => {
    requireTier('pro');
    const result = db.prepare(`
      INSERT INTO waitlist (first_name, last_name, phone, email, discipline, referral_source, notes, priority)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.first_name,
      data.last_name || '',
      data.phone || '',
      data.email || '',
      data.discipline || '',
      data.referral_source || '',
      data.notes || '',
      data.priority || 0
    );
    return db.prepare('SELECT * FROM waitlist WHERE id = ?').get(result.lastInsertRowid);
  });

  safeHandle('waitlist:update', (_event, id: number, data: {
    first_name?: string;
    last_name?: string;
    phone?: string;
    email?: string;
    discipline?: string;
    referral_source?: string;
    notes?: string;
    status?: string;
    priority?: number;
    last_contacted?: string | null;
  }) => {
    requireTier('pro');
    const sets: string[] = [];
    const values: any[] = [];
    for (const [key, val] of Object.entries(data)) {
      if (val !== undefined) { sets.push(`${key} = ?`); values.push(val); }
    }
    if (sets.length === 0) return db.prepare('SELECT * FROM waitlist WHERE id = ?').get(id);
    sets.push('updated_at = CURRENT_TIMESTAMP');
    values.push(id);
    db.prepare(`UPDATE waitlist SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`).run(...values);
    return db.prepare('SELECT * FROM waitlist WHERE id = ?').get(id);
  });

  safeHandle('waitlist:delete', (_event, id: number) => {
    requireTier('pro');
    db.prepare('UPDATE waitlist SET deleted_at = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    return true;
  });

  safeHandle('waitlist:search', (_event, query: string) => {
    requireTier('pro');
    const q = `%${query}%`;
    return db.prepare(`
      SELECT * FROM waitlist
      WHERE deleted_at IS NULL
        AND (first_name LIKE ? OR last_name LIKE ? OR phone LIKE ? OR email LIKE ? OR referral_source LIKE ? OR notes LIKE ?)
      ORDER BY priority DESC, created_at DESC
    `).all(q, q, q, q, q, q);
  });

  safeHandle('waitlist:convertToClient', (_event, id: number) => {
    requireTier('pro');
    db.prepare(`
      UPDATE waitlist SET status = 'converted', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL
    `).run(id);
    return db.prepare('SELECT * FROM waitlist WHERE id = ?').get(id);
  });

  safeHandle('waitlist:linkClient', (_event, waitlistId: number, clientId: number) => {
    requireTier('pro');
    db.prepare(`
      UPDATE waitlist SET converted_client_id = ?, status = 'converted', updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND deleted_at IS NULL
    `).run(clientId, waitlistId);
    return db.prepare('SELECT * FROM waitlist WHERE id = ?').get(waitlistId);
  });

  safeHandle('waitlist:count', () => {
    requireTier('pro');
    const row = db.prepare("SELECT COUNT(*) as count FROM waitlist WHERE deleted_at IS NULL AND status NOT IN ('converted', 'declined')").get() as any;
    return row?.count || 0;
  });

  // ── Dev: Seed Demo Data (temporary) ──
  safeHandle('dev:seedDemoData', () => {
    return seedDemoData(db);
  });

  // ── Dev: Force app tier (for demos) ──
  safeHandle('dev:setTier', (_event, tier: string) => {
    const valid = ['unlicensed', 'basic', 'pro'];
    if (!valid.includes(tier)) return { success: false, message: `Invalid tier: ${tier}` };
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('app_tier', tier);
    return { success: true, tier };
  });
}

// Helper: build an invoice PDF and return as base64
// ── Good Faith Estimate PDF Builder ──

function buildGfePdf(
  client: any,
  practice: any,
  data: {
    servicePeriodStart: string;
    servicePeriodEnd: string;
    lineItems: Array<{ description: string; cpt_code: string; quantity: number; rate: number; total: number }>;
    diagnosisCodes: string[];
  }
): { base64Pdf: string; filename: string } {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 40;
  const marginRight = 40;
  const maxWidth = pageWidth - marginLeft - marginRight;
  let y = 40;
  let pageCount = 1;

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

  const estimatedTotal = data.lineItems.reduce((sum, li) => sum + li.total, 0);

  const checkPageBreak = (needed: number) => {
    if (y + needed > pageHeight - 60) {
      doc.addPage();
      pageCount++;
      y = 40;
    }
  };

  // ── Header: Practice Info with Logo ──
  let textStartX = marginLeft;
  const logoData = getLogoBase64();
  if (logoData) {
    try {
      const logoFormat = logoData.includes('image/png') ? 'PNG' : 'JPEG';
      doc.addImage(logoData, logoFormat, marginLeft, y - 6, 48, 48);
      textStartX = marginLeft + 56;
    } catch { /* skip logo */ }
  }

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(PDF_COLORS.heading[0], PDF_COLORS.heading[1], PDF_COLORS.heading[2]);
  doc.text(practice?.name || 'Practice Name', textStartX, y);
  y += 14;

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(PDF_COLORS.label[0], PDF_COLORS.label[1], PDF_COLORS.label[2]);
  if (practice?.address) { doc.text(practice.address, textStartX, y); y += 11; }
  const cityStateZip = [practice?.city, practice?.state, practice?.zip].filter(Boolean).join(', ');
  if (cityStateZip) { doc.text(cityStateZip, textStartX, y); y += 11; }
  if (practice?.phone) { doc.text(`Phone: ${practice.phone}`, textStartX, y); y += 11; }
  if (practice?.npi) { doc.text(`NPI: ${practice.npi}`, textStartX, y); y += 11; }
  if (practice?.tax_id) { doc.text(`Tax ID: ${practice.tax_id}`, textStartX, y); y += 11; }

  // ── Title (right aligned) ──
  const rightX = pageWidth - marginRight;
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(PDF_COLORS.accent[0], PDF_COLORS.accent[1], PDF_COLORS.accent[2]);
  doc.text('GOOD FAITH', rightX, 48, { align: 'right' });
  doc.text('ESTIMATE', rightX, 66, { align: 'right' });

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(PDF_COLORS.label[0], PDF_COLORS.label[1], PDF_COLORS.label[2]);
  const today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  doc.text(`Date: ${today}`, rightX, 82, { align: 'right' });
  const endDateFmt = (() => {
    try { return new Date(data.servicePeriodEnd + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch { return data.servicePeriodEnd; }
  })();
  doc.text(`Valid through: ${endDateFmt}`, rightX, 94, { align: 'right' });

  // Ensure y is past header
  if (logoData) y = Math.max(y, 96);
  y = Math.max(y, 110);

  // ── Divider ──
  doc.setLineWidth(1.5);
  doc.setDrawColor(PDF_COLORS.accent[0], PDF_COLORS.accent[1], PDF_COLORS.accent[2]);
  doc.line(marginLeft, y, pageWidth - marginRight, y);
  doc.setDrawColor(0, 0, 0);
  y += 20;

  // ── Patient Information ──
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(PDF_COLORS.heading[0], PDF_COLORS.heading[1], PDF_COLORS.heading[2]);
  doc.text('PATIENT INFORMATION', marginLeft, y);
  y += 16;

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(PDF_COLORS.body[0], PDF_COLORS.body[1], PDF_COLORS.body[2]);
  const clientName = `${client?.first_name || ''} ${client?.last_name || ''}`.trim();
  if (clientName) { doc.text(`Name: ${clientName}`, marginLeft, y); y += 14; }
  if (client?.dob) {
    const dobFmt = (() => {
      try { return new Date(client.dob + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
      catch { return client.dob; }
    })();
    doc.text(`Date of Birth: ${dobFmt}`, marginLeft, y); y += 14;
  }
  if (client?.address) { doc.text(`Address: ${client.address}`, marginLeft, y); y += 14; }
  const clientCityStateZip = [client?.city, client?.state, client?.zip].filter(Boolean).join(', ');
  if (clientCityStateZip) { doc.text(`         ${clientCityStateZip}`, marginLeft, y); y += 14; }
  y += 14;

  // ── Diagnosis ──
  checkPageBreak(50);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(PDF_COLORS.heading[0], PDF_COLORS.heading[1], PDF_COLORS.heading[2]);
  doc.text('DIAGNOSIS', marginLeft, y);
  y += 16;

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(PDF_COLORS.body[0], PDF_COLORS.body[1], PDF_COLORS.body[2]);
  if (data.diagnosisCodes.length === 0 || (data.diagnosisCodes.length === 1 && !data.diagnosisCodes[0])) {
    doc.text('To be determined following initial evaluation', marginLeft, y);
    y += 14;
  } else {
    // Primary
    const primary = [client?.primary_dx_code, client?.primary_dx_description].filter(Boolean).join(' — ');
    if (primary) {
      doc.text(`Primary: ${primary}`, marginLeft, y);
      y += 14;
    }
    // Secondary
    try {
      const secondaryDx = typeof client?.secondary_dx === 'string' ? JSON.parse(client.secondary_dx) : client?.secondary_dx;
      if (Array.isArray(secondaryDx) && secondaryDx.length > 0) {
        for (const dx of secondaryDx) {
          checkPageBreak(14);
          const dxText = typeof dx === 'object' ? [dx.code, dx.description].filter(Boolean).join(' — ') : String(dx);
          if (dxText) { doc.text(`Secondary: ${dxText}`, marginLeft, y); y += 14; }
        }
      }
    } catch { /* ignore parse errors */ }
  }
  y += 14;

  // ── Expected Services Table ──
  checkPageBreak(60);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(PDF_COLORS.heading[0], PDF_COLORS.heading[1], PDF_COLORS.heading[2]);
  doc.text('EXPECTED SERVICES', marginLeft, y);
  y += 16;

  const startDateFmt = (() => {
    try { return new Date(data.servicePeriodStart + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
    catch { return data.servicePeriodStart; }
  })();
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(PDF_COLORS.label[0], PDF_COLORS.label[1], PDF_COLORS.label[2]);
  doc.text(`Service Period: ${startDateFmt} to ${endDateFmt}`, marginLeft, y);
  y += 16;

  // Table header
  const colX = {
    description: marginLeft,
    cpt: marginLeft + 250,
    qty: marginLeft + 340,
    rate: marginLeft + 400,
    total: pageWidth - marginRight - 70,
  };

  doc.setFillColor(245, 245, 245);
  doc.rect(marginLeft, y - 12, maxWidth, 20, 'F');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(PDF_COLORS.heading[0], PDF_COLORS.heading[1], PDF_COLORS.heading[2]);
  doc.text('Service', colX.description, y);
  doc.text('CPT', colX.cpt, y);
  doc.text('Qty', colX.qty, y);
  doc.text('Rate', colX.rate, y);
  doc.text('Total', colX.total, y);
  y += 20;

  // Table rows
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(PDF_COLORS.body[0], PDF_COLORS.body[1], PDF_COLORS.body[2]);
  for (const item of data.lineItems) {
    checkPageBreak(22);
    const descLines = doc.splitTextToSize(item.description || 'Service', 230);
    doc.text(descLines, colX.description, y);
    doc.text(item.cpt_code || '-', colX.cpt, y);
    doc.text(String(item.quantity || 1), colX.qty, y);
    doc.text(formatCurrency(item.rate || 0), colX.rate, y);
    doc.text(formatCurrency(item.total || 0), colX.total, y);
    y += Math.max(descLines.length * 14, 18);
  }

  // Total line
  y += 10;
  doc.setDrawColor(PDF_COLORS.accent[0], PDF_COLORS.accent[1], PDF_COLORS.accent[2]);
  doc.setLineWidth(1);
  doc.line(colX.rate - 20, y, pageWidth - marginRight, y);
  y += 18;

  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(PDF_COLORS.heading[0], PDF_COLORS.heading[1], PDF_COLORS.heading[2]);
  const totalStr = formatCurrency(estimatedTotal);
  const totalWidth = doc.getTextWidth(totalStr);
  doc.text('ESTIMATED TOTAL:', colX.total - totalWidth - 8, y, { align: 'right' });
  doc.text(totalStr, pageWidth - marginRight, y, { align: 'right' });
  y += 30;

  // ── Disclaimers ──
  checkPageBreak(280);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(PDF_COLORS.heading[0], PDF_COLORS.heading[1], PDF_COLORS.heading[2]);
  doc.text('IMPORTANT DISCLAIMERS', marginLeft, y);
  y += 16;

  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(PDF_COLORS.body[0], PDF_COLORS.body[1], PDF_COLORS.body[2]);

  const disclaimers = [
    'This Good Faith Estimate shows the costs of items and services that are reasonably expected for your health care needs for the item or service listed above. The estimate is based on information known at the time the estimate was created.',
    'The Good Faith Estimate does not include any unknown or unexpected costs that may arise during treatment. You could be charged more if complications or special circumstances occur. If this happens, federal law allows you to dispute (appeal) the bill.',
    'If you are billed for more than this Good Faith Estimate, you have the right to dispute the bill. You may contact the health care provider or facility listed to let them know the billed charges are higher than the Good Faith Estimate. You can ask them to update the bill to match the Good Faith Estimate, ask to negotiate the bill, or ask if there is financial assistance available.',
    'You may also start a dispute resolution process with the U.S. Department of Health and Human Services (HHS). If you choose to use the dispute resolution process, you must start the dispute process within 120 calendar days (about 4 months) of the date on the original bill.',
    'There is a $25 fee to use the dispute process. If the agency reviewing your dispute agrees with you, you will have to pay the price on this Good Faith Estimate. If the agency disagrees with you and agrees with the health care provider or facility, you will have to pay the higher amount.',
    'This Good Faith Estimate is not a contract and does not require you to obtain the items or services from the provider(s) listed.',
  ];

  for (let i = 0; i < disclaimers.length; i++) {
    const text = `${i + 1}. ${disclaimers[i]}`;
    const lines = doc.splitTextToSize(text, maxWidth - 10);
    checkPageBreak(lines.length * 11 + 6);
    doc.text(lines, marginLeft + 5, y);
    y += lines.length * 11 + 6;
  }

  y += 8;
  checkPageBreak(30);
  doc.setFontSize(8);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(PDF_COLORS.accent[0], PDF_COLORS.accent[1], PDF_COLORS.accent[2]);
  const cmsLines = doc.splitTextToSize(
    'To learn more and get a form to start the dispute process, go to www.cms.gov/nosurprises or call 1-800-985-3059.',
    maxWidth - 10
  );
  doc.text(cmsLines, marginLeft + 5, y);
  y += cmsLines.length * 11 + 10;

  // Contact info
  checkPageBreak(20);
  doc.setTextColor(PDF_COLORS.body[0], PDF_COLORS.body[1], PDF_COLORS.body[2]);
  const contactLine = `For questions about this estimate, contact: ${practice?.name || ''} — ${practice?.phone || ''}`;
  doc.text(contactLine, marginLeft + 5, y);
  y += 20;

  // ── Signature Lines ──
  checkPageBreak(60);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(PDF_COLORS.body[0], PDF_COLORS.body[1], PDF_COLORS.body[2]);

  doc.text('Provider Signature: ___________________________  Date: __________', marginLeft, y);
  y += 20;
  doc.text('Patient Signature:  ___________________________  Date: __________', marginLeft, y);
  y += 20;

  // ── Confidentiality Footer ──
  const addFooters = () => {
    const totalPages = doc.getNumberOfPages();
    for (let p = 1; p <= totalPages; p++) {
      doc.setPage(p);
      doc.setFontSize(7);
      doc.setFont('helvetica', 'italic');
      doc.setTextColor(PDF_COLORS.confidential[0], PDF_COLORS.confidential[1], PDF_COLORS.confidential[2]);
      doc.text(
        'This document contains confidential health information. Unauthorized disclosure is prohibited.',
        pageWidth / 2, pageHeight - 20, { align: 'center' }
      );
      if (totalPages > 1) {
        doc.setTextColor(PDF_COLORS.footer[0], PDF_COLORS.footer[1], PDF_COLORS.footer[2]);
        doc.text(`Page ${p} of ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
      }
    }
  };
  addFooters();

  doc.setTextColor(0, 0, 0);

  const clientLastName = (client?.last_name || 'Client').replace(/[^a-zA-Z0-9]/g, '');
  const clientFirstName = (client?.first_name || '').replace(/[^a-zA-Z0-9]/g, '');
  const dateStr = new Date().toISOString().split('T')[0];
  const filename = `GFE_${clientLastName}_${clientFirstName}_${dateStr}.pdf`;

  const pdfOutput = doc.output('arraybuffer');
  const base64Pdf = Buffer.from(pdfOutput).toString('base64');

  return { base64Pdf, filename };
}

function buildInvoicePdf(invoice: any, items: any[], client: any, practice: any): { base64Pdf: string; filename: string } {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 40;
  const marginRight = 40;
  const maxWidth = pageWidth - marginLeft - marginRight;
  let y = 40;

  // Format currency
  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
  };

  // ── Header: Practice Info with Logo ──
  let textStartX = marginLeft;
  const logoData = getLogoBase64();
  if (logoData) {
    try {
      const logoFormat = logoData.includes('image/png') ? 'PNG' : 'JPEG';
      doc.addImage(logoData, logoFormat, marginLeft, y - 6, 48, 48);
      textStartX = marginLeft + 56;
    } catch { /* skip logo */ }
  }

  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(PDF_COLORS.heading[0], PDF_COLORS.heading[1], PDF_COLORS.heading[2]);
  doc.text(practice?.name || 'Practice Name', textStartX, y);
  y += 14;

  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(PDF_COLORS.label[0], PDF_COLORS.label[1], PDF_COLORS.label[2]);
  if (practice?.address) {
    doc.text(practice.address, textStartX, y);
    y += 11;
  }
  const cityStateZip = [practice?.city, practice?.state, practice?.zip].filter(Boolean).join(', ');
  if (cityStateZip) {
    doc.text(cityStateZip, textStartX, y);
    y += 11;
  }
  if (practice?.phone) {
    doc.text(`Phone: ${practice.phone}`, textStartX, y);
    y += 11;
  }
  if (practice?.npi) {
    doc.text(`NPI: ${practice.npi}`, textStartX, y);
    y += 11;
  }
  doc.setTextColor(PDF_COLORS.body[0], PDF_COLORS.body[1], PDF_COLORS.body[2]);

  // ── Invoice Title & Number (right aligned) ──
  const invoiceRightX = pageWidth - marginRight;
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(PDF_COLORS.accent[0], PDF_COLORS.accent[1], PDF_COLORS.accent[2]);
  doc.text('INVOICE', invoiceRightX, 56, { align: 'right' });
  doc.setTextColor(PDF_COLORS.body[0], PDF_COLORS.body[1], PDF_COLORS.body[2]);

  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(PDF_COLORS.label[0], PDF_COLORS.label[1], PDF_COLORS.label[2]);
  doc.text(`Invoice #: ${invoice.invoice_number}`, invoiceRightX, 72, { align: 'right' });
  doc.text(`Date: ${invoice.invoice_date}`, invoiceRightX, 84, { align: 'right' });
  if (invoice.due_date) {
    doc.text(`Due: ${invoice.due_date}`, invoiceRightX, 96, { align: 'right' });
  }
  doc.setTextColor(PDF_COLORS.body[0], PDF_COLORS.body[1], PDF_COLORS.body[2]);

  // Make sure y is past the logo
  if (logoData) y = Math.max(y, 96);
  y = Math.max(y, 110);

  // ── Divider ──
  doc.setLineWidth(1.5);
  doc.setDrawColor(PDF_COLORS.accent[0], PDF_COLORS.accent[1], PDF_COLORS.accent[2]);
  doc.line(marginLeft, y, pageWidth - marginRight, y);
  doc.setDrawColor(0, 0, 0);
  y += 20;

  // ── Bill To Section ──
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('Bill To:', marginLeft, y);
  y += 16;

  doc.setFont('helvetica', 'normal');
  doc.text(`${client?.first_name || ''} ${client?.last_name || ''}`, marginLeft, y);
  y += 14;

  if (client?.address) {
    doc.text(client.address, marginLeft, y);
    y += 14;
  }
  const clientCityStateZip = [client?.city, client?.state, client?.zip].filter(Boolean).join(', ');
  if (clientCityStateZip) {
    doc.text(clientCityStateZip, marginLeft, y);
    y += 14;
  }
  if (client?.email) {
    doc.text(client.email, marginLeft, y);
    y += 14;
  }

  y += 20;

  // ── Line Items Table ──
  const colX = {
    description: marginLeft,
    cpt: marginLeft + 250,
    units: marginLeft + 340,
    rate: marginLeft + 400,
    amount: pageWidth - marginRight - 70,
  };

  // Table header
  doc.setFillColor(245, 245, 245);
  doc.rect(marginLeft, y - 12, maxWidth, 20, 'F');
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text('Description', colX.description, y);
  doc.text('CPT', colX.cpt, y);
  doc.text('Units', colX.units, y);
  doc.text('Rate', colX.rate, y);
  doc.text('Amount', colX.amount, y);
  y += 20;

  // Table rows
  doc.setFont('helvetica', 'normal');
  for (const item of items) {
    if (y > pageHeight - 100) {
      doc.addPage();
      y = 50;
    }

    // Description (wrap if needed)
    const descLines = doc.splitTextToSize(item.description || 'Service', 230);
    doc.text(descLines, colX.description, y);
    doc.text(item.cpt_code || '-', colX.cpt, y);
    doc.text(String(item.units || 1), colX.units, y);
    doc.text(formatCurrency(item.unit_price || 0), colX.rate, y);
    doc.text(formatCurrency(item.amount || 0), colX.amount, y);

    y += Math.max(descLines.length * 14, 18);
  }

  y += 10;
  doc.setDrawColor(200, 200, 200);
  doc.line(marginLeft, y, pageWidth - marginRight, y);
  y += 20;

  // ── Totals ──
  const totalsX = pageWidth - marginRight - 150;

  doc.setFont('helvetica', 'normal');
  doc.text('Subtotal:', totalsX, y);
  doc.text(formatCurrency(invoice.subtotal || 0), colX.amount, y);
  y += 16;

  if (invoice.discount_amount > 0) {
    doc.text('Discount:', totalsX, y);
    doc.text(`-${formatCurrency(invoice.discount_amount)}`, colX.amount, y);
    y += 16;
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text('Total:', totalsX, y);
  doc.text(formatCurrency(invoice.total_amount || 0), colX.amount, y);
  y += 30;

  // ── Status Badge ──
  const statusColors: Record<string, { bg: [number, number, number]; text: [number, number, number] }> = {
    draft: { bg: [229, 231, 235], text: [55, 65, 81] },
    sent: { bg: [219, 234, 254], text: [29, 78, 216] },
    paid: { bg: [209, 250, 229], text: [21, 128, 61] },
    partial: { bg: [254, 243, 199], text: [180, 83, 9] },
    overdue: { bg: [254, 226, 226], text: [185, 28, 28] },
    void: { bg: [254, 226, 226], text: [185, 28, 28] },
  };
  const statusColor = statusColors[invoice.status] || statusColors.draft;

  doc.setFillColor(statusColor.bg[0], statusColor.bg[1], statusColor.bg[2]);
  doc.roundedRect(marginLeft, y, 80, 22, 4, 4, 'F');
  doc.setFontSize(10);
  doc.setTextColor(statusColor.text[0], statusColor.text[1], statusColor.text[2]);
  doc.text(invoice.status.toUpperCase(), marginLeft + 40, y + 15, { align: 'center' });
  doc.setTextColor(0, 0, 0);

  // ── Notes ──
  if (invoice.notes) {
    y += 40;
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Notes:', marginLeft, y);
    y += 14;
    doc.setFont('helvetica', 'normal');
    const noteLines = doc.splitTextToSize(invoice.notes, maxWidth);
    doc.text(noteLines, marginLeft, y);
  }

  // ── Footer ──
  doc.setFontSize(8);
  doc.setTextColor(128, 128, 128);
  doc.text(
    'Thank you for your business!',
    pageWidth / 2,
    pageHeight - 30,
    { align: 'center' }
  );
  doc.setTextColor(0, 0, 0);

  // Generate filename
  const clientLastName = (client?.last_name || 'Client').replace(/[^a-zA-Z0-9]/g, '');
  const filename = `Invoice_${invoice.invoice_number}_${clientLastName}.pdf`;

  const pdfOutput = doc.output('arraybuffer');
  const base64Pdf = Buffer.from(pdfOutput).toString('base64');

  return { base64Pdf, filename };
}

// ── Per-Document PDF Builders (for bulk export) ──

/** Shared PDF utilities for per-document exports with professional styling */
// ── PDF Styling Constants ──
const PDF_COLORS = {
  heading:      [35, 55, 75] as [number, number, number],
  body:         [51, 51, 51] as [number, number, number],
  label:        [100, 110, 120] as [number, number, number],
  light:        [140, 150, 160] as [number, number, number],
  accent:       [44, 82, 130] as [number, number, number],
  accentLight:  [235, 242, 250] as [number, number, number],
  cardBg:       [248, 249, 251] as [number, number, number],
  cardBorder:   [218, 225, 232] as [number, number, number],
  divider:      [210, 216, 224] as [number, number, number],
  activeGreen:  [21, 128, 61] as [number, number, number],
  activeBg:     [220, 252, 231] as [number, number, number],
  metBlue:      [29, 78, 216] as [number, number, number],
  metBg:        [219, 234, 254] as [number, number, number],
  dcGray:       [75, 85, 99] as [number, number, number],
  dcBg:         [229, 231, 235] as [number, number, number],
  signedGreen:  [21, 128, 61] as [number, number, number],
  footer:       [100, 110, 120] as [number, number, number],
  confidential: [180, 50, 50] as [number, number, number],
  // SOAP section left-border colors
  soapS:        [59, 130, 246] as [number, number, number],
  soapO:        [16, 185, 129] as [number, number, number],
  soapA:        [245, 158, 11] as [number, number, number],
  soapP:        [139, 92, 246] as [number, number, number],
  // Goal type badges
  stgBg:        [254, 243, 199] as [number, number, number],
  stgText:      [146, 64, 14] as [number, number, number],
  notMetBg:     [254, 226, 226] as [number, number, number],
  notMetText:   [153, 27, 27] as [number, number, number],
};

const PDF_FONTS = {
  sectionHeader: 13,
  subsectionHeader: 11,
  fieldLabel: 9,
  fieldValue: 10,
  body: 10,
  metadata: 8,
  footerText: 7.5,
  documentType: 11,
};

const DISCIPLINE_DOCUMENT_LABELS: Record<string, string> = {
  PT: 'Physical Therapy Medical Record',
  OT: 'Occupational Therapy Medical Record',
  ST: 'Speech-Language Pathology Medical Record',
  MFT: 'Marriage & Family Therapy Clinical Record',
};

/** SOAP section color map by label initial */
const SOAP_COLORS: Record<string, [number, number, number]> = {
  'Subjective': PDF_COLORS.soapS, 'S': PDF_COLORS.soapS,
  'Objective': PDF_COLORS.soapO, 'O': PDF_COLORS.soapO,
  'Assessment': PDF_COLORS.soapA, 'A': PDF_COLORS.soapA,
  'Plan': PDF_COLORS.soapP, 'P': PDF_COLORS.soapP,
  // DAP format
  'Data': PDF_COLORS.soapS, 'D': PDF_COLORS.soapS,
  'Response': PDF_COLORS.soapO, 'R': PDF_COLORS.soapO,
  // BIRP
  'Behavior': PDF_COLORS.soapS, 'B': PDF_COLORS.soapS,
  'Intervention': PDF_COLORS.soapO, 'I': PDF_COLORS.soapO,
};

/** Format date nicely for PDFs */
function formatPdfDate(dateStr: string): string {
  if (!dateStr) return '';
  try {
    const d = new Date(dateStr + (dateStr.length === 10 ? 'T12:00:00' : ''));
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return dateStr; }
}

function createPdfHelpers(doc: any, options?: { client?: any; practice?: any }) {
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 72;
  const marginRight = 72;
  const maxWidth = pageWidth - marginLeft - marginRight;
  const headerHeight = 72;
  const footerHeight = 40;
  let y = headerHeight;

  const practice = options?.practice || null;
  const client = options?.client || null;

  const setColor = (c: [number, number, number]) => doc.setTextColor(c[0], c[1], c[2]);
  const setFill = (c: [number, number, number]) => doc.setFillColor(c[0], c[1], c[2]);
  const setDraw = (c: [number, number, number]) => doc.setDrawColor(c[0], c[1], c[2]);

  const checkPageBreak = (needed: number) => {
    if (y + needed > pageHeight - footerHeight) {
      doc.addPage();
      y = headerHeight;
    }
  };

  /** Draw a small rounded-rect pill badge */
  const drawBadge = (text: string, x: number, badgeY: number, bgColor: [number, number, number], textColor: [number, number, number]): number => {
    doc.setFontSize(7.5);
    doc.setFont('helvetica', 'bold');
    const tw = doc.getTextWidth(text);
    const pw = tw + 8;
    const ph = 12;
    setFill(bgColor);
    doc.roundedRect(x, badgeY - 9, pw, ph, 2, 2, 'F');
    setColor(textColor);
    doc.text(text, x + 4, badgeY - 1);
    setColor(PDF_COLORS.body);
    return pw;
  };

  /** Section header with accent bar and light background */
  const addSectionHeader = (text: string) => {
    checkPageBreak(40);
    y += 16;
    const barH = 20;
    // Background fill
    setFill(PDF_COLORS.accentLight);
    doc.roundedRect(marginLeft, y - 14, maxWidth, barH, 2, 2, 'F');
    // Left accent bar
    setFill(PDF_COLORS.accent);
    doc.rect(marginLeft, y - 14, 3, barH, 'F');
    // Title text centered in bar
    doc.setFontSize(PDF_FONTS.sectionHeader);
    doc.setFont('helvetica', 'bold');
    setColor(PDF_COLORS.heading);
    doc.text(text, marginLeft + 10, y - 1);
    setColor(PDF_COLORS.body);
    y += 14;
  };

  /** Field with muted label and body-color value */
  const addField = (label: string, value: string) => {
    if (!value || value === '--' || value.trim() === '' || value.trim() === '-') return;
    checkPageBreak(18);
    doc.setFontSize(PDF_FONTS.fieldLabel);
    doc.setFont('helvetica', 'normal');
    setColor(PDF_COLORS.label);
    doc.text(`${label}: `, marginLeft, y);
    const labelWidth = doc.getTextWidth(`${label}: `);
    doc.setFontSize(PDF_FONTS.fieldValue);
    doc.setFont('helvetica', 'normal');
    setColor(PDF_COLORS.body);
    const lines = doc.splitTextToSize(value, maxWidth - labelWidth);
    doc.text(lines, marginLeft + labelWidth, y);
    y += lines.length * 14;
  };

  /** Field with emphasized (accent-color bold) label */
  const addEmphasisField = (label: string, value: string) => {
    if (!value || value.trim() === '') return;
    checkPageBreak(18);
    doc.setFontSize(PDF_FONTS.fieldLabel);
    doc.setFont('helvetica', 'bold');
    setColor(PDF_COLORS.accent);
    doc.text(`${label}: `, marginLeft, y);
    const labelWidth = doc.getTextWidth(`${label}: `);
    doc.setFontSize(PDF_FONTS.fieldValue);
    doc.setFont('helvetica', 'bold');
    setColor(PDF_COLORS.body);
    const lines = doc.splitTextToSize(value, maxWidth - labelWidth);
    doc.text(lines, marginLeft + labelWidth, y);
    y += lines.length * 14;
  };

  /** Wrapped body text */
  const addWrappedText = (text: string, indent = 0) => {
    if (!text) return;
    doc.setFontSize(PDF_FONTS.body);
    doc.setFont('helvetica', 'normal');
    setColor(PDF_COLORS.body);
    const lines = doc.splitTextToSize(text, maxWidth - indent);
    for (const line of lines) {
      checkPageBreak(15);
      doc.text(line, marginLeft + indent, y);
      y += 14;
    }
  };

  /** Render a SOAP-style section with colored left border */
  const addSOAPSection = (label: string, content: string) => {
    if (!content) return;
    checkPageBreak(30);
    const color = SOAP_COLORS[label] || PDF_COLORS.accent;
    y += 4;
    const startY = y;
    // Label
    doc.setFontSize(PDF_FONTS.fieldLabel);
    doc.setFont('helvetica', 'bold');
    setColor(color);
    doc.text(`${label}:`, marginLeft + 8, y);
    y += 13;
    // Content
    doc.setFontSize(PDF_FONTS.body);
    doc.setFont('helvetica', 'normal');
    setColor(PDF_COLORS.body);
    const lines = doc.splitTextToSize(content, maxWidth - 16);
    for (const line of lines) {
      checkPageBreak(15);
      doc.text(line, marginLeft + 10, y);
      y += 14;
    }
    // Draw left border bar from startY to current y
    setFill(color);
    const barLen = y - startY + 2;
    doc.rect(marginLeft, startY - 12, 2.5, barLen, 'F');
    y += 4;
    setColor(PDF_COLORS.body);
  };

  /** Two-column client info card */
  const addClientInfoCard = (clientData: any) => {
    if (!clientData) return;
    checkPageBreak(70);
    const cardX = marginLeft;
    const cardW = maxWidth;
    const innerPad = 10;
    const colMid = marginLeft + maxWidth / 2;
    const startY = y;

    // Prepare data
    const name = `${clientData.first_name || ''} ${clientData.last_name || ''}`.trim();
    const dob = clientData.dob || '';
    const status = clientData.status || '';
    const discipline = clientData.discipline || '';
    const dxParts = [clientData.primary_dx_code, clientData.primary_dx_description].filter(Boolean).join(' — ');

    // Calculate card height
    let rows = 2; // name+status, dob+discipline
    if (dxParts) rows++;
    const cardH = rows * 16 + innerPad * 2 + 2;

    // Card background + border
    setFill(PDF_COLORS.cardBg);
    setDraw(PDF_COLORS.cardBorder);
    doc.setLineWidth(0.75);
    doc.roundedRect(cardX, startY - 2, cardW, cardH, 3, 3, 'FD');
    doc.setLineWidth(0.3);

    let iy = startY + innerPad + 6;
    // Row 1: Name + Status
    doc.setFontSize(PDF_FONTS.fieldLabel);
    doc.setFont('helvetica', 'normal');
    setColor(PDF_COLORS.label);
    doc.text('Name:', cardX + innerPad, iy);
    doc.setFontSize(PDF_FONTS.fieldValue);
    doc.setFont('helvetica', 'bold');
    setColor(PDF_COLORS.body);
    doc.text(name, cardX + innerPad + doc.getTextWidth('Name: '), iy);

    // Status badge
    if (status) {
      doc.setFontSize(PDF_FONTS.fieldLabel);
      doc.setFont('helvetica', 'normal');
      setColor(PDF_COLORS.label);
      doc.text('Status:', colMid, iy);
      const statusX = colMid + doc.getTextWidth('Status: ');
      const sUpper = status.charAt(0).toUpperCase() + status.slice(1);
      if (status.toLowerCase() === 'active') {
        drawBadge(sUpper, statusX, iy, PDF_COLORS.activeBg, PDF_COLORS.activeGreen);
      } else {
        drawBadge(sUpper, statusX, iy, PDF_COLORS.dcBg, PDF_COLORS.dcGray);
      }
    }
    iy += 16;

    // Row 2: DOB + Discipline
    if (dob) {
      doc.setFontSize(PDF_FONTS.fieldLabel);
      doc.setFont('helvetica', 'normal');
      setColor(PDF_COLORS.label);
      doc.text('DOB:', cardX + innerPad, iy);
      doc.setFontSize(PDF_FONTS.fieldValue);
      doc.setFont('helvetica', 'bold');
      setColor(PDF_COLORS.body);
      doc.text(dob, cardX + innerPad + doc.getTextWidth('DOB: '), iy);
    }
    if (discipline) {
      doc.setFontSize(PDF_FONTS.fieldLabel);
      doc.setFont('helvetica', 'normal');
      setColor(PDF_COLORS.label);
      doc.text('Discipline:', colMid, iy);
      doc.setFontSize(PDF_FONTS.fieldValue);
      doc.setFont('helvetica', 'bold');
      setColor(PDF_COLORS.body);
      doc.text(discipline, colMid + doc.getTextWidth('Discipline: '), iy);
    }
    iy += 16;

    // Row 3: Primary Dx (full width)
    if (dxParts) {
      doc.setFontSize(PDF_FONTS.fieldLabel);
      doc.setFont('helvetica', 'normal');
      setColor(PDF_COLORS.label);
      doc.text('Primary Dx:', cardX + innerPad, iy);
      doc.setFontSize(PDF_FONTS.fieldValue);
      doc.setFont('helvetica', 'normal');
      setColor(PDF_COLORS.body);
      const dxLabelW = doc.getTextWidth('Primary Dx: ');
      const dxLines = doc.splitTextToSize(dxParts, cardW - innerPad * 2 - dxLabelW);
      doc.text(dxLines, cardX + innerPad + dxLabelW, iy);
    }

    y = startY + cardH + 8;
    setColor(PDF_COLORS.body);
    setDraw([0, 0, 0]);
  };

  /** Render a goal row with type + status badges */
  const addGoalRow = (goal: any) => {
    checkPageBreak(30);
    let bx = marginLeft;
    // Type badge
    const gType = (goal.goal_type || 'STG').toUpperCase();
    const typeBg = gType === 'LTG' ? PDF_COLORS.accentLight : PDF_COLORS.stgBg;
    const typeText = gType === 'LTG' ? PDF_COLORS.accent : PDF_COLORS.stgText;
    const tw = drawBadge(gType, bx, y, typeBg, typeText);
    bx += tw + 6;
    // Status badge
    const st = (goal.status || 'active').toLowerCase();
    const stLabel = st.charAt(0).toUpperCase() + st.slice(1);
    let stBg = PDF_COLORS.activeBg;
    let stText = PDF_COLORS.activeGreen;
    if (st === 'met') { stBg = PDF_COLORS.metBg; stText = PDF_COLORS.metBlue; }
    else if (st === 'discontinued') { stBg = PDF_COLORS.dcBg; stText = PDF_COLORS.dcGray; }
    else if (st === 'not met' || st === 'not_met') { stBg = PDF_COLORS.notMetBg; stText = PDF_COLORS.notMetText; }
    const sw = drawBadge(stLabel, bx, y, stBg, stText);
    bx += sw + 8;
    // Goal text
    doc.setFontSize(PDF_FONTS.body);
    doc.setFont('helvetica', 'normal');
    setColor(PDF_COLORS.body);
    const goalTextW = pageWidth - marginRight - bx;
    const gLines = doc.splitTextToSize(goal.goal_text || '', goalTextW);
    if (gLines.length > 0) {
      doc.text(gLines[0], bx, y - 1);
      // Continuation lines at full width below badges
      for (let li = 1; li < gLines.length; li++) {
        y += 13;
        checkPageBreak(14);
        doc.text(gLines[li], marginLeft + 10, y);
      }
    }
    y += 6;
    // Target/Met dates
    if (goal.target_date) {
      doc.setFontSize(PDF_FONTS.metadata);
      doc.setFont('helvetica', 'normal');
      setColor(PDF_COLORS.light);
      doc.text(`Target: ${goal.target_date}${goal.met_date ? '   Met: ' + goal.met_date : ''}`, marginLeft + 10, y);
      y += 10;
    }
    y += 4;
    setColor(PDF_COLORS.body);
  };

  /** Note header bar for individual note PDFs */
  const addNoteHeader = (note: any) => {
    checkPageBreak(42);
    // Background bar
    setFill(PDF_COLORS.cardBg);
    doc.roundedRect(marginLeft, y - 4, maxWidth, 32, 2, 2, 'F');

    // Date left
    const dateFormatted = formatPdfDate(note.date_of_service);
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    setColor(PDF_COLORS.heading);
    doc.text(dateFormatted, marginLeft + 8, y + 10);

    // CPT right-aligned
    let cptStr = '';
    try {
      const cptLines = JSON.parse(note.cpt_codes || '[]');
      if (Array.isArray(cptLines) && cptLines.length > 0) {
        cptStr = cptLines.map((l: any) => `${l.code} (${l.units} unit${l.units !== 1 ? 's' : ''})`).join(', ');
      }
    } catch {}
    if (!cptStr && note.cpt_code) cptStr = `${note.cpt_code} (${note.units || 1} unit${(note.units || 1) !== 1 ? 's' : ''})`;

    const isStandaloneDC = note.note_type === 'discharge' && (!note.cpt_code || note.charge_amount === 0);
    if (cptStr && !isStandaloneDC) {
      doc.setFontSize(PDF_FONTS.body);
      doc.setFont('helvetica', 'normal');
      setColor(PDF_COLORS.label);
      const cptWidth = doc.getTextWidth(cptStr);
      let rightX = pageWidth - marginRight - 8;
      // Signed badge
      if (note.signed_at) {
        const bw = drawBadge('\u2713 Signed', rightX - 50, y + 10, PDF_COLORS.activeBg, PDF_COLORS.signedGreen);
        rightX -= (bw + 10);
      } else {
        const bw = drawBadge('Draft', rightX - 34, y + 10, PDF_COLORS.dcBg, PDF_COLORS.dcGray);
        rightX -= (bw + 10);
      }
      doc.setFontSize(PDF_FONTS.body);
      doc.setFont('helvetica', 'normal');
      setColor(PDF_COLORS.label);
      doc.text(cptStr, rightX - cptWidth, y + 10);
    } else {
      // Just signed badge
      if (note.signed_at) {
        drawBadge('\u2713 Signed', pageWidth - marginRight - 58, y + 10, PDF_COLORS.activeBg, PDF_COLORS.signedGreen);
      } else {
        drawBadge('Draft', pageWidth - marginRight - 42, y + 10, PDF_COLORS.dcBg, PDF_COLORS.dcGray);
      }
    }

    y += 30;
    // Time range
    if (note.time_in || note.time_out) {
      doc.setFontSize(PDF_FONTS.fieldLabel);
      doc.setFont('helvetica', 'normal');
      setColor(PDF_COLORS.label);
      const timeStr = (note.time_in && note.time_out) ? `${note.time_in} \u2014 ${note.time_out}` :
        note.time_in ? `Time in: ${note.time_in}` : `Time out: ${note.time_out}`;
      doc.text(timeStr, marginLeft + 8, y);
      y += 12;
    }
    // Divider below header bar
    setDraw(PDF_COLORS.divider);
    doc.setLineWidth(0.75);
    doc.line(marginLeft, y, pageWidth - marginRight, y);
    doc.setLineWidth(0.3);
    setDraw([0, 0, 0]);
    y += 10;
    setColor(PDF_COLORS.body);
  };

  /** Start a card container (returns startY for endCard) */
  const startCard = (): number => {
    checkPageBreak(30);
    return y;
  };

  /** End a card container — draws the border around content from startY to current y */
  const endCard = (cardStartY: number) => {
    const cardH = y - cardStartY + 6;
    setDraw(PDF_COLORS.cardBorder);
    doc.setLineWidth(0.75);
    doc.roundedRect(marginLeft - 4, cardStartY - 6, maxWidth + 8, cardH, 3, 3, 'S');
    doc.setLineWidth(0.3);
    setDraw([0, 0, 0]);
    y += 8;
  };

  /** Note separator for chart export */
  const addNoteSeparator = () => {
    y += 8;
    setDraw(PDF_COLORS.divider);
    doc.setLineWidth(0.3);
    const sepStart = marginLeft + maxWidth * 0.2;
    const sepEnd = pageWidth - marginRight - maxWidth * 0.2;
    // Dashed effect via short segments
    for (let sx = sepStart; sx < sepEnd; sx += 8) {
      doc.line(sx, y, Math.min(sx + 4, sepEnd), y);
    }
    setDraw([0, 0, 0]);
    y += 8;
  };

  /** Practice header + client footer on every page */
  const addHeaderFooter = () => {
    const totalPages = doc.getNumberOfPages();
    const logoData = getLogoBase64();
    const genDate = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });

    for (let i = 1; i <= totalPages; i++) {
      doc.setPage(i);

      // ── Header Band ──
      // Subtle background
      setFill(PDF_COLORS.cardBg);
      doc.rect(0, 0, pageWidth, 62, 'F');

      if (practice) {
        let hy = 22;
        let textStartX = marginLeft;

        // Logo
        if (logoData) {
          try {
            const logoFormat = logoData.includes('image/png') ? 'PNG' : 'JPEG';
            doc.addImage(logoData, logoFormat, marginLeft, 10, 36, 36);
            textStartX = marginLeft + 44;
          } catch {}
        }

        // Practice name
        if (practice.name) {
          doc.setFontSize(PDF_FONTS.sectionHeader);
          doc.setFont('helvetica', 'bold');
          setColor(PDF_COLORS.heading);
          doc.text(practice.name, textStartX, hy);
          hy += 12;
        }
        // Provider line
        doc.setFontSize(PDF_FONTS.fieldLabel);
        doc.setFont('helvetica', 'normal');
        setColor(PDF_COLORS.label);
        const sigName = getSetting('signature_name');
        const sigCreds = getSetting('signature_credentials');
        const providerParts: string[] = [];
        if (sigName) providerParts.push(sigCreds ? `${sigName}, ${sigCreds}` : sigName);
        if (practice.npi) providerParts.push(`NPI: ${practice.npi}`);
        if (providerParts.length > 0) {
          doc.text(providerParts.join('  |  '), textStartX, hy);
          hy += 11;
        }
        // Address line
        const addrParts: string[] = [];
        if (practice.address) addrParts.push(practice.address);
        const cityStateZip = [practice.city, practice.state, practice.zip].filter(Boolean).join(', ');
        if (cityStateZip) addrParts.push(cityStateZip);
        if (practice.phone) addrParts.push(practice.phone);
        if (addrParts.length > 0) {
          doc.text(addrParts.join('  |  '), textStartX, hy);
        }

        // Generated date right-aligned on first text line
        doc.setFontSize(PDF_FONTS.metadata);
        doc.setFont('helvetica', 'normal');
        setColor(PDF_COLORS.light);
        doc.text(`Generated: ${genDate}`, pageWidth - marginRight, 22, { align: 'right' });
      }

      // Accent rule at bottom of header band
      doc.setLineWidth(1.5);
      setDraw(PDF_COLORS.accent);
      doc.line(marginLeft, 60, pageWidth - marginRight, 60);
      doc.setLineWidth(0.3);

      // ── Three-column Footer ──
      // Hairline rule
      doc.setLineWidth(0.5);
      setDraw(PDF_COLORS.divider);
      doc.line(marginLeft, pageHeight - 32, pageWidth - marginRight, pageHeight - 32);
      doc.setLineWidth(0.3);

      // Left: page number
      doc.setFontSize(PDF_FONTS.footerText);
      doc.setFont('helvetica', 'normal');
      setColor(PDF_COLORS.footer);
      doc.text(`Page ${i} of ${totalPages}`, marginLeft, pageHeight - 20);

      // Center: client info
      if (client) {
        const centerParts: string[] = [];
        if (client.last_name || client.first_name) {
          centerParts.push(`${client.last_name || ''}, ${client.first_name || ''}`);
        }
        if (client.dob) centerParts.push(`DOB: ${client.dob}`);
        if (centerParts.length > 0) {
          doc.text(centerParts.join('  |  '), pageWidth / 2, pageHeight - 20, { align: 'center' });
        }
      }

      // Right: CONFIDENTIAL
      doc.setFont('helvetica', 'bold');
      setColor(PDF_COLORS.confidential);
      doc.text('CONFIDENTIAL', pageWidth - marginRight, pageHeight - 20, { align: 'right' });

      // Reset
      setColor(PDF_COLORS.body);
      setDraw([0, 0, 0]);
    }
  };

  /** Signature block */
  const addSignatureBlock = (signatureTyped: string, signatureImage?: string, signedAt?: string) => {
    if (!signatureTyped && !signatureImage) return;
    checkPageBreak(80);
    y += 14;

    // Drawn signature image
    if (signatureImage) {
      try {
        const sigFormat = signatureImage.includes('image/png') ? 'PNG' : 'JPEG';
        doc.addImage(signatureImage, sigFormat, marginLeft, y, 150, 45);
        y += 50;
      } catch {}
    } else {
      // Signature line if no drawn signature
      setDraw(PDF_COLORS.divider);
      doc.setLineWidth(0.5);
      doc.line(marginLeft, y + 2, marginLeft + 150, y + 2);
      doc.setLineWidth(0.3);
      setDraw([0, 0, 0]);
      y += 8;
    }

    // Typed name
    if (signatureTyped) {
      doc.setFontSize(PDF_FONTS.fieldLabel);
      doc.setFont('helvetica', 'oblique');
      setColor(PDF_COLORS.heading);
      doc.text(signatureTyped, marginLeft, y);
      y += 12;
    }

    // Signed date
    if (signedAt) {
      doc.setFontSize(PDF_FONTS.footerText);
      doc.setFont('helvetica', 'normal');
      setColor(PDF_COLORS.light);
      doc.text(`Signed: ${new Date(signedAt).toLocaleString()}`, marginLeft, y);
      y += 10;
    }
    setColor(PDF_COLORS.body);
    doc.setFont('helvetica', 'normal');
  };

  /** Blank physician signature / date lines for MD to sign on paper */
  const addPhysicianSignatureLine = () => {
    checkPageBreak(90);
    y += 20;

    // Section label
    doc.setFontSize(PDF_FONTS.fieldLabel);
    doc.setFont('helvetica', 'bold');
    setColor(PDF_COLORS.accent);
    doc.text('Physician / Ordering Provider', marginLeft, y);
    y += 18;

    // Signature line
    setDraw(PDF_COLORS.divider);
    doc.setLineWidth(0.5);
    doc.line(marginLeft, y, marginLeft + 250, y);
    doc.line(marginLeft + 290, y, marginLeft + 400, y);
    doc.setLineWidth(0.3);
    setDraw([0, 0, 0]);
    y += 12;

    // Labels below lines
    doc.setFontSize(PDF_FONTS.footerText);
    doc.setFont('helvetica', 'normal');
    setColor(PDF_COLORS.label);
    doc.text('Physician Signature', marginLeft, y);
    doc.text('Date', marginLeft + 290, y);
    y += 20;

    // Print name line
    setDraw(PDF_COLORS.divider);
    doc.setLineWidth(0.5);
    doc.line(marginLeft, y, marginLeft + 250, y);
    doc.setLineWidth(0.3);
    setDraw([0, 0, 0]);
    y += 12;

    doc.setFontSize(PDF_FONTS.footerText);
    setColor(PDF_COLORS.label);
    doc.text('Physician Name (Print)', marginLeft, y);
    y += 10;

    setColor(PDF_COLORS.body);
    doc.setFont('helvetica', 'normal');
  };

  return {
    pageWidth, pageHeight, marginLeft, marginRight, maxWidth,
    get y() { return y; },
    set y(val: number) { y = val; },
    checkPageBreak, addSectionHeader, addField, addEmphasisField, addWrappedText,
    addSOAPSection, addClientInfoCard, addGoalRow, addNoteHeader,
    startCard, endCard, addNoteSeparator,
    addHeaderFooter, addSignatureBlock, addPhysicianSignatureLine,
    setColor, setFill, setDraw, drawBadge, formatPdfDate: formatPdfDate,
  };
}

/** Retrieve a setting value from the database */
function getSetting(key: string): string {
  try {
    const db = getDatabase();
    const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as any;
    return row?.value || '';
  } catch {
    return '';
  }
}

/** Get practice logo as base64 data URL (or null) */
function getLogoBase64(): string | null {
  try {
    const dataDir = getDataPath();
    const files = fs.readdirSync(dataDir).filter(f => f.startsWith('practice_logo.'));
    if (files.length === 0) return null;
    const filePath = path.join(dataDir, files[0]);
    const ext = path.extname(files[0]).toLowerCase().replace('.', '');
    const mimeType = ext === 'png' ? 'image/png' : 'image/jpeg';
    const fileBuffer = fs.readFileSync(filePath);
    return `data:${mimeType};base64,${fileBuffer.toString('base64')}`;
  } catch {
    return null;
  }
}

/** Build a one-page HIPAA fax cover sheet */
function buildFaxCoverPage(options: {
  practice: any;
  recipientName?: string;
  recipientFax: string;
  clientName: string;
  documentLabel: string;
  totalPages: number; // including cover
  requestSignature?: boolean;
  practiceFax?: string;
}): Buffer {
  const { practice, recipientName, recipientFax, clientName, documentLabel, totalPages, requestSignature, practiceFax } = options;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginLeft = 54;
  const maxWidth = pageWidth - 108;
  let y = 54;

  // -- Practice header --
  const logo = getLogoBase64();
  if (logo) {
    try {
      const fmt = logo.includes('image/png') ? 'PNG' : 'JPEG';
      doc.addImage(logo, fmt, marginLeft, y, 48, 48);
    } catch {}
  }
  const headerX = logo ? marginLeft + 58 : marginLeft;
  doc.setFontSize(16);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(35, 55, 75);
  doc.text(practice?.name || 'Practice', headerX, y + 16);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(100, 110, 120);
  const addr = [practice?.address, practice?.city, practice?.state, practice?.zip].filter(Boolean).join(', ');
  if (addr) { doc.text(addr, headerX, y + 30); }
  const contactLine = [practice?.phone ? `Phone: ${practice.phone}` : '', practice?.npi ? `NPI: ${practice.npi}` : ''].filter(Boolean).join('  |  ');
  if (contactLine) { doc.text(contactLine, headerX, y + 42); }
  y += 62;

  // Divider
  doc.setDrawColor(210, 216, 224);
  doc.setLineWidth(1);
  doc.line(marginLeft, y, marginLeft + maxWidth, y);
  y += 24;

  // -- FACSIMILE COVER SHEET title --
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(44, 82, 130);
  doc.text('FACSIMILE COVER SHEET', pageWidth / 2, y, { align: 'center' });
  y += 36;

  // -- To / From / Date / Re / Pages grid --
  const fieldLabel = (label: string, value: string, yPos: number) => {
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(35, 55, 75);
    doc.text(label, marginLeft, yPos);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 51, 51);
    doc.text(value, marginLeft + 80, yPos);
  };

  fieldLabel('To:', recipientName || recipientFax, y);
  y += 18;
  fieldLabel('Fax:', recipientFax, y);
  y += 18;
  fieldLabel('From:', [practice?.name, getSetting('signature_name')].filter(Boolean).join(' — '), y);
  y += 18;
  if (practiceFax) {
    fieldLabel('Our Fax:', practiceFax, y);
    y += 18;
  }
  fieldLabel('Date:', new Date().toLocaleString(), y);
  y += 18;
  fieldLabel('Re:', `${documentLabel} for ${clientName}`, y);
  y += 18;
  fieldLabel('Pages:', `${totalPages} (including cover)`, y);
  y += 30;

  // Divider
  doc.setDrawColor(210, 216, 224);
  doc.line(marginLeft, y, marginLeft + maxWidth, y);
  y += 20;

  // -- Request Signature action box (conditional) --
  if (requestSignature) {
    const boxY = y;
    doc.setFillColor(255, 248, 235);
    doc.setDrawColor(245, 158, 11);
    doc.setLineWidth(1.5);
    doc.roundedRect(marginLeft, boxY, maxWidth, 52, 4, 4, 'FD');
    doc.setFontSize(12);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(180, 90, 0);
    doc.text('ACTION REQUESTED', marginLeft + 14, boxY + 20);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(51, 51, 51);
    const returnLine = practiceFax
      ? `Please sign and return the attached document via fax to ${practiceFax}.`
      : 'Please sign and return the attached document via fax.';
    doc.text(returnLine, marginLeft + 14, boxY + 38);
    y = boxY + 68;
  }

  // -- HIPAA Confidentiality Notice --
  doc.setFillColor(248, 249, 251);
  doc.setDrawColor(218, 225, 232);
  doc.setLineWidth(0.5);
  const noticeY = y;
  const noticeText =
    'CONFIDENTIALITY NOTICE: This facsimile transmission contains Protected Health Information (PHI) ' +
    'that is legally privileged and confidential under HIPAA regulations. This information is intended ' +
    'only for the use of the individual or entity named above. If you are not the intended recipient, ' +
    'you are hereby notified that any disclosure, copying, distribution, or action taken in reliance on ' +
    'the contents of this fax is strictly prohibited. If you have received this fax in error, please ' +
    'immediately notify the sender by telephone and destroy all copies of this document.';
  doc.setFontSize(8.5);
  doc.setFont('helvetica', 'normal');
  const noticeLines = doc.splitTextToSize(noticeText, maxWidth - 20);
  const noticeH = noticeLines.length * 11 + 16;
  doc.roundedRect(marginLeft, noticeY, maxWidth, noticeH, 3, 3, 'FD');
  doc.setTextColor(100, 110, 120);
  doc.text(noticeLines, marginLeft + 10, noticeY + 14);

  // -- Footer --
  doc.setFontSize(7.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(180, 50, 50);
  doc.text('CONFIDENTIAL', pageWidth / 2, doc.internal.pageSize.getHeight() - 30, { align: 'center' });

  const pdfOutput = doc.output('arraybuffer');
  return Buffer.from(pdfOutput);
}

/** Merge a cover page PDF with a document PDF using pdf-lib */
async function mergePdfs(coverBuffer: Buffer, documentBuffer: Buffer): Promise<Buffer> {
  const mergedDoc = await PDFLibDocument.create();
  const coverDoc = await PDFLibDocument.load(coverBuffer);
  const docDoc = await PDFLibDocument.load(documentBuffer);

  const coverPages = await mergedDoc.copyPages(coverDoc, coverDoc.getPageIndices());
  for (const page of coverPages) mergedDoc.addPage(page);

  const docPages = await mergedDoc.copyPages(docDoc, docDoc.getPageIndices());
  for (const page of docPages) mergedDoc.addPage(page);

  const mergedBytes = await mergedDoc.save();
  return Buffer.from(mergedBytes);
}

/** Build a PDF for a single evaluation */
function buildSingleEvalPdf(client: any, evalItem: any): Buffer {
  const db = getDatabase();
  const practice = db.prepare('SELECT * FROM practice WHERE id = 1').get() as any;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const h = createPdfHelpers(doc, { client, practice });

  // Understated document type line
  const evalTypeLabel = evalItem.eval_type === 'reassessment' ? 'Reassessment' : 'Initial Evaluation';
  const dateFormatted = formatPdfDate(evalItem.eval_date);
  doc.setFontSize(PDF_FONTS.documentType);
  doc.setFont('helvetica', 'normal');
  h.setColor(PDF_COLORS.label);
  doc.text(`${evalTypeLabel} \u2014 ${dateFormatted}`, h.marginLeft, h.y);
  // Signed badge
  if (evalItem.signed_at) {
    const labelW = doc.getTextWidth(`${evalTypeLabel} \u2014 ${dateFormatted}  `);
    h.drawBadge('\u2713 Signed', h.marginLeft + labelW, h.y, PDF_COLORS.activeBg, PDF_COLORS.signedGreen);
  }
  h.setColor(PDF_COLORS.body);
  h.y += 16;

  // Client info card
  h.addClientInfoCard(client);

  // Eval content
  h.addSectionHeader(`Evaluation Details`);
  h.addField('Discipline', evalItem.discipline);

  const emphasisKeys = new Set(['treatment_plan', 'frequency_duration']);
  if (evalItem.content) {
    try {
      const content = JSON.parse(evalItem.content);
      if (typeof content === 'object') {
        const rehabLabel = evalItem.eval_type === 'reassessment'
          ? 'Rehabilitation Potential / Justification for Continued Services'
          : 'Rehabilitation Potential / Medical Necessity';
        const evalFieldLabels: Record<string, string> = {
          referral_source: 'Referral Source',
          medical_history: 'Medical History',
          prior_level_of_function: 'Prior Level of Function',
          current_complaints: 'Current Complaints',
          clinical_impression: 'Clinical Impression',
          rehabilitation_potential: rehabLabel,
          precautions: 'Precautions / Contraindications',
          goals: 'Goals',
          treatment_plan: 'Treatment Plan',
          frequency_duration: 'Frequency & Duration',
          // Legacy camelCase keys from older eval versions
          chiefComplaint: 'Chief Complaint',
          socialHistory: 'Social History',
          homeSetup: 'Home Setup',
          dmeNeeds: 'DME Needs',
          priorTherapy: 'Prior Therapy',
          functionalLimitations: 'Functional Limitations',
          patientGoals: 'Patient Goals',
          therapistImpression: 'Therapist Impression',
          planOfCare: 'Plan of Care',
          dischargeRecommendations: 'Discharge Recommendations',
        };
        // Convert camelCase or snake_case keys to readable labels as fallback
        const humanizeKey = (key: string): string => {
          // snake_case → Title Case
          if (key.includes('_')) return key.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          // camelCase → Title Case
          return key.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase()).trim();
        };
        for (const [key, val] of Object.entries(content)) {
          if (key === 'goal_entries' || key === 'created_goal_ids' || key === 'objective_assessment') continue;
          if (key === 'enabled_objective_fields' || key === 'session_note' || key === 'carried_over_count') continue;
          if (!val || (typeof val === 'string' && !val.trim())) continue;
          if (Array.isArray(val)) continue; // skip arrays that aren't display-ready
          const label = evalFieldLabels[key] || humanizeKey(key);
          if (emphasisKeys.has(key)) {
            h.addEmphasisField(label, String(val));
          } else {
            h.addField(label, String(val));
          }
        }
        if (content.objective_assessment && typeof content.objective_assessment === 'object') {
          h.addSectionHeader('Objective Assessment');
          // Clinical measures inset box
          const objFields: Record<string, string> = {
            rom: 'ROM', strength_mmt: 'Strength / MMT', posture: 'Posture',
            gait_analysis: 'Gait Analysis', balance: 'Balance',
            functional_mobility: 'Functional Mobility', pain_assessment: 'Pain Assessment',
            adl_assessment: 'ADL Assessment', hand_function: 'Hand Function',
            cognition_screening: 'Cognition Screening', sensory: 'Sensory',
            visual_perceptual: 'Visual-Perceptual', home_safety: 'Home Safety',
            speech_intelligibility: 'Speech Intelligibility',
            language_comprehension: 'Language Comprehension',
            language_expression: 'Language Expression', voice: 'Voice',
            fluency: 'Fluency', swallowing_dysphagia: 'Swallowing / Dysphagia',
            cognition_communication: 'Cognition-Communication',
          };
          // Collect populated fields
          const populatedFields = Object.entries(content.objective_assessment as Record<string, string>)
            .filter(([_, v]) => v && v.trim());
          if (populatedFields.length > 0) {
            // Inset box with left accent border
            const boxStartY = h.y;
            h.setFill(PDF_COLORS.cardBg);
            // We'll draw the box after we know the height
            h.y += 4;
            for (const [oKey, oVal] of populatedFields) {
              const oLabel = objFields[oKey] || oKey;
              h.addField(oLabel, String(oVal));
            }
            const boxH = h.y - boxStartY + 4;
            // Draw inset background
            h.setFill(PDF_COLORS.cardBg);
            doc.roundedRect(h.marginLeft - 2, boxStartY - 2, h.maxWidth + 4, boxH, 2, 2, 'F');
            h.setFill(PDF_COLORS.accent);
            doc.rect(h.marginLeft - 2, boxStartY - 2, 2.5, boxH, 'F');
            // Re-render text on top of the filled rect (jsPDF draws in order)
            // Since jsPDF doesn't support z-order, we need to draw the box first, so let's reset and redraw
            h.y = boxStartY + 4;
            for (const [oKey, oVal] of populatedFields) {
              const oLabel = objFields[oKey] || oKey;
              h.addField(oLabel, String(oVal));
            }
            h.y += 4;
          }
        }
      } else {
        h.addWrappedText(evalItem.content, 10);
      }
    } catch {
      h.addWrappedText(evalItem.content, 10);
    }
  }

  h.addSignatureBlock(evalItem.signature_typed, evalItem.signature_image, evalItem.signed_at);

  // MD / Physician Signature line (blank for paper signing)
  h.addPhysicianSignatureLine();

  h.addHeaderFooter();
  const pdfOutput = doc.output('arraybuffer');
  return Buffer.from(pdfOutput);
}

/** Build a PDF for a single note (SOAP, progress report, or discharge summary) */
function buildSingleNotePdf(client: any, note: any, pdfSections: any[]): Buffer {
  const db = getDatabase();
  const practice = db.prepare('SELECT * FROM practice WHERE id = 1').get() as any;
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const h = createPdfHelpers(doc, { client, practice });

  const isProgressReport = note.note_type === 'progress_report';
  const isDischargeNote = note.note_type === 'discharge';

  // Understated document type line
  let docTypeLabel = 'Treatment Note';
  if (isProgressReport) docTypeLabel = 'Progress Report';
  else if (isDischargeNote) docTypeLabel = 'Discharge Summary';
  const dateFormatted = formatPdfDate(note.date_of_service);
  doc.setFontSize(PDF_FONTS.documentType);
  doc.setFont('helvetica', 'normal');
  h.setColor(PDF_COLORS.label);
  doc.text(`${docTypeLabel} \u2014 ${dateFormatted}`, h.marginLeft, h.y);
  h.setColor(PDF_COLORS.body);
  h.y += 16;

  // Client info card
  h.addClientInfoCard(client);

  // Note header bar (date, CPT, signed badge, time)
  h.addNoteHeader(note);

  // Note sections with SOAP color coding
  for (const sec of pdfSections) {
    const value = (note as any)[sec.field];
    if (value) {
      h.addSOAPSection(sec.label, value);
    }
  }

  // Progress Report additional sections
  if (isProgressReport) {
    const prGoals = db.prepare('SELECT * FROM progress_report_goals WHERE note_id = ? AND deleted_at IS NULL').all(note.id) as any[];
    if (prGoals.length > 0) {
      h.addSectionHeader('Goal Progress');
      for (const prGoal of prGoals) {
        h.checkPageBreak(40);
        const statusLabel = prGoal.status_at_report ? prGoal.status_at_report.charAt(0).toUpperCase() + prGoal.status_at_report.slice(1) : 'N/A';
        let stBg = PDF_COLORS.activeBg;
        let stText = PDF_COLORS.activeGreen;
        const stLower = (prGoal.status_at_report || '').toLowerCase();
        if (stLower === 'met') { stBg = PDF_COLORS.metBg; stText = PDF_COLORS.metBlue; }
        else if (stLower === 'discontinued') { stBg = PDF_COLORS.dcBg; stText = PDF_COLORS.dcGray; }
        else if (stLower === 'not met' || stLower === 'not_met') { stBg = PDF_COLORS.notMetBg; stText = PDF_COLORS.notMetText; }
        const bw = h.drawBadge(statusLabel, h.marginLeft, h.y, stBg, stText);
        doc.setFontSize(PDF_FONTS.body);
        doc.setFont('helvetica', 'normal');
        h.setColor(PDF_COLORS.body);
        if (prGoal.goal_text_snapshot) {
          const goalTextX = h.marginLeft + bw + 8;
          const goalLines = doc.splitTextToSize(prGoal.goal_text_snapshot, h.maxWidth - bw - 12);
          doc.text(goalLines[0] || '', goalTextX, h.y - 1);
          for (let li = 1; li < goalLines.length; li++) {
            h.y += 13;
            h.checkPageBreak(14);
            doc.text(goalLines[li], h.marginLeft + 10, h.y);
          }
        }
        h.y += 6;
        if (prGoal.performance_data) h.addField('  Performance', prGoal.performance_data);
        if (prGoal.clinical_notes) h.addField('  Clinical Notes', prGoal.clinical_notes);
        h.y += 4;
      }
    }

    if (note.progress_report_data) {
      try {
        const prData = JSON.parse(note.progress_report_data);
        if (prData.clinical_summary) {
          h.addSectionHeader('Clinical Summary');
          h.addWrappedText(prData.clinical_summary, 10);
        }
        if (prData.continued_treatment_justification) {
          h.addSectionHeader('Continued Treatment Justification');
          h.addWrappedText(prData.continued_treatment_justification, 10);
        }
        if (prData.plan_of_care_update) {
          h.addSectionHeader('Plan of Care Update');
          h.addWrappedText(prData.plan_of_care_update, 10);
        }
        const freqParts: string[] = [];
        if (prData.frequency_per_week) freqParts.push(`${prData.frequency_per_week}x/week`);
        if (prData.duration_weeks) freqParts.push(`for ${prData.duration_weeks} weeks`);
        if (freqParts.length > 0) h.addEmphasisField('Frequency/Duration', freqParts.join(' '));
        if (prData.report_period_start || prData.report_period_end) {
          h.addField('Report Period', [prData.report_period_start, prData.report_period_end].filter(Boolean).join(' to '));
        }
        if (prData.visits_in_period) h.addField('Visits in Period', String(prData.visits_in_period));
      } catch { /* skip invalid JSON */ }
    }
  }

  // Discharge Summary sections
  if (isDischargeNote && note.discharge_data) {
    try {
      const dcData = JSON.parse(note.discharge_data) as DischargeData;

      h.addSectionHeader('Discharge Details');
      const reasonLabel = DISCHARGE_REASON_LABELS[dcData.discharge_reason] || dcData.discharge_reason;
      h.addField('Discharge Reason', reasonLabel);
      if (dcData.discharge_reason_detail) h.addField('Details', dcData.discharge_reason_detail);

      h.addField('Start of Care', dcData.start_of_care || '');
      h.addField('Discharge Date', dcData.discharge_date || note.date_of_service);
      h.addField('Total Visits', String(dcData.total_visits));
      if (dcData.primary_dx) h.addField('Primary Diagnosis', dcData.primary_dx);

      const dcGoals = db.prepare('SELECT * FROM progress_report_goals WHERE note_id = ? AND deleted_at IS NULL').all(note.id) as any[];
      if (dcGoals.length > 0) {
        h.addSectionHeader('Final Goal Status');
        for (const goal of dcGoals) {
          h.checkPageBreak(40);
          const statusLabel = DISCHARGE_GOAL_STATUS_LABELS[goal.status_at_report as DischargeGoalStatus]
            || goal.status_at_report || 'N/A';
          const stLower = (goal.status_at_report || '').toLowerCase();
          let gBg = PDF_COLORS.activeBg; let gText = PDF_COLORS.activeGreen;
          if (stLower === 'met' || stLower === 'fully_met') { gBg = PDF_COLORS.metBg; gText = PDF_COLORS.metBlue; }
          else if (stLower === 'discontinued' || stLower === 'deferred') { gBg = PDF_COLORS.dcBg; gText = PDF_COLORS.dcGray; }
          else if (stLower === 'not_met' || stLower === 'not met') { gBg = PDF_COLORS.notMetBg; gText = PDF_COLORS.notMetText; }
          else if (stLower === 'partially_met') { gBg = PDF_COLORS.stgBg; gText = PDF_COLORS.stgText; }
          const bw = h.drawBadge(statusLabel, h.marginLeft, h.y, gBg, gText);
          doc.setFontSize(PDF_FONTS.body);
          doc.setFont('helvetica', 'normal');
          h.setColor(PDF_COLORS.body);
          if (goal.goal_text_snapshot) {
            const goalLines = doc.splitTextToSize(goal.goal_text_snapshot, h.maxWidth - bw - 12);
            doc.text(goalLines[0] || '', h.marginLeft + bw + 8, h.y - 1);
            for (let li = 1; li < goalLines.length; li++) {
              h.y += 13;
              h.checkPageBreak(14);
              doc.text(goalLines[li], h.marginLeft + 10, h.y);
            }
          }
          h.y += 6;
          if (goal.performance_data) h.addField('  Final Performance', goal.performance_data);
          if (goal.clinical_notes) h.addField('  Summary', goal.clinical_notes);
          h.y += 4;
        }
      }

      if (dcData.prior_level_of_function || dcData.current_level_of_function) {
        h.addSectionHeader('Functional Outcomes');
        if (dcData.prior_level_of_function) h.addField('Prior Level of Function', dcData.prior_level_of_function);
        if (dcData.current_level_of_function) h.addField('Current Level of Function', dcData.current_level_of_function);
      }

      const hasRecs = (dcData.recommendations && dcData.recommendations.length > 0) || dcData.additional_recommendations;
      if (hasRecs) {
        h.addSectionHeader('Discharge Recommendations');
        for (const rec of dcData.recommendations || []) {
          const recLabel = DISCHARGE_RECOMMENDATION_LABELS[rec] || rec;
          h.addField('\u2713', recLabel);
          if (rec === 'referral' && dcData.referral_to) h.addField('  Referred to', dcData.referral_to);
          if (rec === 'return_to_therapy' && dcData.return_to_therapy_if) h.addField('  Return if', dcData.return_to_therapy_if);
          if (rec === 'equipment' && dcData.equipment_details) h.addField('  Equipment', dcData.equipment_details);
        }
        if (dcData.additional_recommendations) h.addWrappedText(dcData.additional_recommendations, 10);
      }
    } catch { /* skip invalid JSON */ }
  }

  h.addSignatureBlock(note.signature_typed, note.signature_image, note.signed_at);

  // MD / Physician Signature line for progress reports (recertification orders)
  if (isProgressReport) {
    h.addPhysicianSignatureLine();
  }

  h.addHeaderFooter();
  const pdfOutput = doc.output('arraybuffer');
  return Buffer.from(pdfOutput);
}

// Helper: build a single-client chart PDF and return as Buffer
function buildClientChartPdf(clientId: number): Buffer {
  const db = getDatabase();
  const client = db.prepare('SELECT * FROM clients WHERE id = ? AND deleted_at IS NULL').get(clientId) as any;
  if (!client) throw new Error('Client not found');

  const evals = db.prepare('SELECT * FROM evaluations WHERE client_id = ? AND deleted_at IS NULL ORDER BY eval_date DESC').all(clientId) as any[];
  const notes = db.prepare('SELECT * FROM notes WHERE client_id = ? AND deleted_at IS NULL ORDER BY date_of_service DESC').all(clientId) as any[];
  const goals = db.prepare('SELECT * FROM goals WHERE client_id = ? AND deleted_at IS NULL ORDER BY created_at DESC').all(clientId) as any[];
  const practice = db.prepare('SELECT * FROM practice WHERE id = 1').get() as any;

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const h = createPdfHelpers(doc, { client, practice });

  // Understated discipline label instead of big "Client Chart" title
  const discLabel = DISCIPLINE_DOCUMENT_LABELS[client.discipline] || 'Clinical Medical Record';
  doc.setFontSize(PDF_FONTS.documentType);
  doc.setFont('helvetica', 'normal');
  h.setColor(PDF_COLORS.label);
  doc.text(discLabel, h.marginLeft, h.y);
  h.setColor(PDF_COLORS.body);
  h.y += 16;

  // Client info card (two-column)
  h.addClientInfoCard(client);

  // Additional client fields
  const clientAddr = [client.address, client.city, client.state, client.zip].filter(Boolean).join(', ');
  if (clientAddr) h.addField('Address', clientAddr);
  if (client.phone) h.addField('Phone', client.phone);
  if (client.email) h.addField('Email', client.email);
  h.y += 4;

  // Insurance
  if (client.insurance_payer || client.insurance_member_id) {
    h.addSectionHeader('Insurance');
    h.addField('Payer', client.insurance_payer);
    h.addField('Member ID', client.insurance_member_id);
    h.addField('Group #', client.insurance_group_number);
  }

  // Goals with badge rendering
  if (goals.length > 0) {
    h.addSectionHeader(`Goals (${goals.length})`);
    for (const goal of goals) {
      h.addGoalRow(goal);
    }
  }

  // Evaluations in card containers
  if (evals.length > 0) {
    h.addSectionHeader(`Evaluations / Plan of Care (${evals.length})`);
    const baseEvalFieldLabels: Record<string, string> = {
      referral_source: 'Referral Source', medical_history: 'Medical History',
      prior_level_of_function: 'Prior Level of Function', current_complaints: 'Current Complaints',
      clinical_impression: 'Clinical Impression',
      precautions: 'Precautions / Contraindications', goals: 'Goals',
      treatment_plan: 'Treatment Plan', frequency_duration: 'Frequency & Duration',
    };
    const objFields: Record<string, string> = {
      rom: 'ROM', strength_mmt: 'Strength / MMT', posture: 'Posture',
      gait_analysis: 'Gait Analysis', balance: 'Balance',
      functional_mobility: 'Functional Mobility', pain_assessment: 'Pain Assessment',
      adl_assessment: 'ADL Assessment', hand_function: 'Hand Function',
      cognition_screening: 'Cognition Screening', sensory: 'Sensory',
      visual_perceptual: 'Visual-Perceptual', home_safety: 'Home Safety',
      speech_intelligibility: 'Speech Intelligibility', language_comprehension: 'Language Comprehension',
      language_expression: 'Language Expression', voice: 'Voice',
      fluency: 'Fluency', swallowing_dysphagia: 'Swallowing / Dysphagia',
      cognition_communication: 'Cognition-Communication',
    };

    for (const evalItem of evals) {
      const cardStart = h.startCard();
      // Eval header
      const evalTypeLabel = evalItem.eval_type === 'reassessment' ? 'Reassessment' : 'Initial Evaluation';
      doc.setFontSize(PDF_FONTS.subsectionHeader);
      doc.setFont('helvetica', 'bold');
      h.setColor(PDF_COLORS.heading);
      doc.text(formatPdfDate(evalItem.eval_date), h.marginLeft + 4, h.y);
      const dateW = doc.getTextWidth(formatPdfDate(evalItem.eval_date) + '  ');
      doc.setFontSize(PDF_FONTS.body);
      doc.setFont('helvetica', 'normal');
      h.setColor(PDF_COLORS.label);
      doc.text(`${evalItem.discipline} \u2014 ${evalTypeLabel}`, h.marginLeft + 4 + dateW, h.y);
      // Signed badge
      if (evalItem.signed_at) {
        const lineW = dateW + doc.getTextWidth(`${evalItem.discipline} \u2014 ${evalTypeLabel}  `);
        h.drawBadge('\u2713 Signed', h.marginLeft + 4 + lineW, h.y, PDF_COLORS.activeBg, PDF_COLORS.signedGreen);
      }
      h.setColor(PDF_COLORS.body);
      h.y += 14;

      if (evalItem.content) {
        try {
          const content = JSON.parse(evalItem.content);
          if (typeof content === 'object') {
            const evalFieldLabels: Record<string, string> = {
              ...baseEvalFieldLabels,
              rehabilitation_potential: evalItem.eval_type === 'reassessment'
                ? 'Rehabilitation Potential / Justification for Continued Services'
                : 'Rehabilitation Potential / Medical Necessity',
            };
            const emphasisKeys = new Set(['treatment_plan', 'frequency_duration']);
            for (const [key, val] of Object.entries(content)) {
              if (key === 'goal_entries' || key === 'created_goal_ids' || key === 'objective_assessment') continue;
              if (!val || (typeof val === 'string' && !val.trim())) continue;
              const label = evalFieldLabels[key] || key;
              if (emphasisKeys.has(key)) {
                h.addEmphasisField(label, String(val));
              } else {
                h.addField(label, String(val));
              }
            }
            if (content.objective_assessment && typeof content.objective_assessment === 'object') {
              const populated = Object.entries(content.objective_assessment as Record<string, string>)
                .filter(([_, v]) => v && v.trim());
              if (populated.length > 0) {
                doc.setFontSize(PDF_FONTS.fieldLabel);
                doc.setFont('helvetica', 'bold');
                h.setColor(PDF_COLORS.accent);
                h.checkPageBreak(14);
                doc.text('Objective Assessment:', h.marginLeft, h.y);
                h.y += 13;
                h.setColor(PDF_COLORS.body);
                for (const [oKey, oVal] of populated) {
                  h.addField(objFields[oKey] || oKey, String(oVal));
                }
              }
            }
          } else {
            h.addWrappedText(evalItem.content, 10);
          }
        } catch {
          h.addWrappedText(evalItem.content, 10);
        }
      }
      if (evalItem.signature_typed) {
        h.addSignatureBlock(evalItem.signature_typed, evalItem.signature_image, evalItem.signed_at);
      }
      h.endCard(cardStart);
    }
  }

  // Notes in card containers
  if (notes.length > 0) {
    const noteFormatVal = (db.prepare("SELECT value FROM settings WHERE key = 'note_format'").get() as any)?.value || 'SOAP';
    const pdfSections = NOTE_FORMAT_SECTIONS[noteFormatVal as NoteFormat].filter((s: any) => s.label !== '(unused)');
    h.addSectionHeader(`${noteFormatVal} Notes (${notes.length})`);

    for (let ni = 0; ni < notes.length; ni++) {
      const note = notes[ni];
      const cardStart = h.startCard();

      // Note header bar
      h.addNoteHeader(note);

      // SOAP sections with color coding
      for (const sec of pdfSections) {
        const value = (note as any)[sec.field];
        if (value) {
          h.addSOAPSection(sec.label, value);
        }
      }

      // Progress Report sections
      if (note.note_type === 'progress_report') {
        const prGoals = db.prepare('SELECT * FROM progress_report_goals WHERE note_id = ? AND deleted_at IS NULL').all(note.id) as any[];
        if (prGoals.length > 0) {
          doc.setFontSize(PDF_FONTS.fieldLabel);
          doc.setFont('helvetica', 'bold');
          h.setColor(PDF_COLORS.accent);
          h.checkPageBreak(14);
          doc.text('Goal Progress:', h.marginLeft, h.y);
          h.y += 13;
          h.setColor(PDF_COLORS.body);
          for (const prGoal of prGoals) {
            h.checkPageBreak(30);
            const stLabel = prGoal.status_at_report ? prGoal.status_at_report.charAt(0).toUpperCase() + prGoal.status_at_report.slice(1) : 'N/A';
            const stLower = (prGoal.status_at_report || '').toLowerCase();
            let gBg = PDF_COLORS.activeBg; let gText = PDF_COLORS.activeGreen;
            if (stLower === 'met') { gBg = PDF_COLORS.metBg; gText = PDF_COLORS.metBlue; }
            else if (stLower === 'discontinued') { gBg = PDF_COLORS.dcBg; gText = PDF_COLORS.dcGray; }
            const bw = h.drawBadge(stLabel, h.marginLeft, h.y, gBg, gText);
            doc.setFontSize(PDF_FONTS.body);
            doc.setFont('helvetica', 'normal');
            h.setColor(PDF_COLORS.body);
            if (prGoal.goal_text_snapshot) {
              const gl = doc.splitTextToSize(prGoal.goal_text_snapshot, h.maxWidth - bw - 12);
              doc.text(gl[0] || '', h.marginLeft + bw + 8, h.y - 1);
              for (let li = 1; li < gl.length; li++) { h.y += 13; h.checkPageBreak(14); doc.text(gl[li], h.marginLeft + 10, h.y); }
            }
            h.y += 6;
            if (prGoal.performance_data) h.addField('  Performance', prGoal.performance_data);
            if (prGoal.clinical_notes) h.addField('  Clinical Notes', prGoal.clinical_notes);
            h.y += 4;
          }
        }
        if (note.progress_report_data) {
          try {
            const prData = JSON.parse(note.progress_report_data);
            if (prData.clinical_summary) { h.addField('Clinical Summary', prData.clinical_summary); }
            if (prData.continued_treatment_justification) { h.addField('Continued Treatment Justification', prData.continued_treatment_justification); }
            if (prData.plan_of_care_update) { h.addField('Plan of Care Update', prData.plan_of_care_update); }
            const fp: string[] = [];
            if (prData.frequency_per_week) fp.push(`${prData.frequency_per_week}x/week`);
            if (prData.duration_weeks) fp.push(`for ${prData.duration_weeks} weeks`);
            if (fp.length > 0) h.addEmphasisField('Frequency/Duration', fp.join(' '));
          } catch {}
        }
      }

      // Discharge sections
      if (note.note_type === 'discharge' && note.discharge_data) {
        try {
          const dcData = JSON.parse(note.discharge_data) as DischargeData;
          const reasonLabel = DISCHARGE_REASON_LABELS[dcData.discharge_reason] || dcData.discharge_reason;
          h.addField('Discharge Reason', reasonLabel);
          if (dcData.discharge_reason_detail) h.addField('Details', dcData.discharge_reason_detail);
          if (dcData.start_of_care) h.addField('Start of Care', dcData.start_of_care);
          h.addField('Discharge Date', dcData.discharge_date || note.date_of_service);
          h.addField('Total Visits', String(dcData.total_visits));
          if (dcData.primary_dx) h.addField('Primary Diagnosis', dcData.primary_dx);

          const dcGoals = db.prepare('SELECT * FROM progress_report_goals WHERE note_id = ? AND deleted_at IS NULL').all(note.id) as any[];
          if (dcGoals.length > 0) {
            doc.setFontSize(PDF_FONTS.fieldLabel);
            doc.setFont('helvetica', 'bold');
            h.setColor(PDF_COLORS.accent);
            h.checkPageBreak(14);
            doc.text('Final Goal Status:', h.marginLeft, h.y);
            h.y += 13;
            h.setColor(PDF_COLORS.body);
            for (const goal of dcGoals) {
              h.checkPageBreak(30);
              const sLabel = DISCHARGE_GOAL_STATUS_LABELS[goal.status_at_report as DischargeGoalStatus] || goal.status_at_report || 'N/A';
              const stLower = (goal.status_at_report || '').toLowerCase();
              let gBg = PDF_COLORS.activeBg; let gText = PDF_COLORS.activeGreen;
              if (stLower === 'met' || stLower === 'fully_met') { gBg = PDF_COLORS.metBg; gText = PDF_COLORS.metBlue; }
              else if (stLower === 'discontinued' || stLower === 'deferred') { gBg = PDF_COLORS.dcBg; gText = PDF_COLORS.dcGray; }
              else if (stLower === 'not_met' || stLower === 'not met') { gBg = PDF_COLORS.notMetBg; gText = PDF_COLORS.notMetText; }
              else if (stLower === 'partially_met') { gBg = PDF_COLORS.stgBg; gText = PDF_COLORS.stgText; }
              const bw = h.drawBadge(sLabel, h.marginLeft, h.y, gBg, gText);
              doc.setFontSize(PDF_FONTS.body);
              doc.setFont('helvetica', 'normal');
              h.setColor(PDF_COLORS.body);
              if (goal.goal_text_snapshot) {
                const gl = doc.splitTextToSize(goal.goal_text_snapshot, h.maxWidth - bw - 12);
                doc.text(gl[0] || '', h.marginLeft + bw + 8, h.y - 1);
                for (let li = 1; li < gl.length; li++) { h.y += 13; h.checkPageBreak(14); doc.text(gl[li], h.marginLeft + 10, h.y); }
              }
              h.y += 6;
              if (goal.performance_data) h.addField('  Final Performance', goal.performance_data);
              if (goal.clinical_notes) h.addField('  Summary', goal.clinical_notes);
              h.y += 4;
            }
          }

          if (dcData.prior_level_of_function || dcData.current_level_of_function) {
            doc.setFontSize(PDF_FONTS.fieldLabel);
            doc.setFont('helvetica', 'bold');
            h.setColor(PDF_COLORS.accent);
            h.checkPageBreak(14);
            doc.text('Functional Outcomes:', h.marginLeft, h.y);
            h.y += 13;
            h.setColor(PDF_COLORS.body);
            if (dcData.prior_level_of_function) h.addField('Prior Level of Function', dcData.prior_level_of_function);
            if (dcData.current_level_of_function) h.addField('Current Level of Function', dcData.current_level_of_function);
          }

          const hasRecs = (dcData.recommendations && dcData.recommendations.length > 0) || dcData.additional_recommendations;
          if (hasRecs) {
            doc.setFontSize(PDF_FONTS.fieldLabel);
            doc.setFont('helvetica', 'bold');
            h.setColor(PDF_COLORS.accent);
            h.checkPageBreak(14);
            doc.text('Discharge Recommendations:', h.marginLeft, h.y);
            h.y += 13;
            h.setColor(PDF_COLORS.body);
            for (const rec of dcData.recommendations || []) {
              const recLabel = DISCHARGE_RECOMMENDATION_LABELS[rec] || rec;
              h.addField('\u2713', recLabel);
            }
            if (dcData.additional_recommendations) h.addWrappedText(dcData.additional_recommendations, 10);
          }
        } catch {}
      }

      if (note.signature_typed) {
        h.addSignatureBlock(note.signature_typed, note.signature_image, note.signed_at);
      }
      h.endCard(cardStart);

      // Note separator between notes
      if (ni < notes.length - 1) {
        h.addNoteSeparator();
      }
    }
  }

  h.addHeaderFooter();
  const pdfOutput = doc.output('arraybuffer');
  return Buffer.from(pdfOutput);
}

// Helper: recursively copy a directory
function copyDirSync(src: string, dest: string): void {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}
