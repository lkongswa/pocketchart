import { app, BrowserWindow, ipcMain, dialog, shell, safeStorage } from 'electron';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { initDatabase, getDatabase, getDataPath, setDataPath, resetDataPath, getDefaultDataPath } from './database';
import { jsPDF } from 'jspdf';
import { v4 as uuidv4 } from 'uuid';
import archiver from 'archiver';
import { autoUpdater } from 'electron-updater';
import Stripe from 'stripe';

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
  const iconPath = path.join(__dirname, '../../build/icon.ico');

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
  const iconPath = path.join(__dirname, '../../build/icon.ico');

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
  initDatabase();
  registerIpcHandlers();
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
});

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
    app.quit();
  }
});

function registerIpcHandlers() {
  const db = getDatabase();

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
    const existing = db.prepare('SELECT id FROM practice WHERE id = 1').get();
    if (existing) {
      db.prepare(`
        UPDATE practice SET name=?, address=?, phone=?, npi=?, tax_id=?,
        license_number=?, license_state=?, discipline=? WHERE id=1
      `).run(data.name, data.address, data.phone, data.npi, data.tax_id,
        data.license_number, data.license_state, data.discipline);
    } else {
      db.prepare(`
        INSERT INTO practice (id, name, address, phone, npi, tax_id, license_number, license_state, discipline)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(data.name, data.address, data.phone, data.npi, data.tax_id,
        data.license_number, data.license_state, data.discipline);
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
      INSERT INTO clients (first_name, last_name, dob, phone, email, address,
        primary_dx_code, primary_dx_description, secondary_dx, default_cpt_code,
        insurance_payer, insurance_member_id, insurance_group,
        referring_physician, referring_npi, status, discipline)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.first_name, data.last_name, data.dob, data.phone, data.email, data.address,
      data.primary_dx_code, data.primary_dx_description, data.secondary_dx || '[]',
      data.default_cpt_code, data.insurance_payer, data.insurance_member_id,
      data.insurance_group, data.referring_physician, data.referring_npi,
      data.status || 'active', data.discipline
    );
    return db.prepare('SELECT * FROM clients WHERE id = ?').get(result.lastInsertRowid);
  });

  safeHandle('clients:update', (_event, id: number, data) => {
    db.prepare(`
      UPDATE clients SET first_name=?, last_name=?, dob=?, phone=?, email=?, address=?,
        primary_dx_code=?, primary_dx_description=?, secondary_dx=?, default_cpt_code=?,
        insurance_payer=?, insurance_member_id=?, insurance_group=?,
        referring_physician=?, referring_npi=?, status=?, discipline=?,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND deleted_at IS NULL
    `).run(
      data.first_name, data.last_name, data.dob, data.phone, data.email, data.address,
      data.primary_dx_code, data.primary_dx_description, data.secondary_dx || '[]',
      data.default_cpt_code, data.insurance_payer, data.insurance_member_id,
      data.insurance_group, data.referring_physician, data.referring_npi,
      data.status, data.discipline, id
    );
    return db.prepare('SELECT * FROM clients WHERE id = ?').get(id);
  });

  // Soft delete: sets deleted_at timestamp instead of hard deleting
  safeHandle('clients:delete', (_event, id: number) => {
    db.prepare(
      "UPDATE clients SET status = 'discharged', deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL"
    ).run(id);
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
      INSERT INTO goals (client_id, goal_text, goal_type, category, status, target_date)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(data.client_id, data.goal_text, data.goal_type, data.category,
      data.status || 'active', data.target_date);
    return db.prepare('SELECT * FROM goals WHERE id = ?').get(result.lastInsertRowid);
  });

  safeHandle('goals:update', (_event, id: number, data) => {
    db.prepare(`
      UPDATE goals SET goal_text=?, goal_type=?, category=?, status=?, target_date=?, met_date=?
      WHERE id=? AND deleted_at IS NULL
    `).run(data.goal_text, data.goal_type, data.category, data.status,
      data.target_date, data.met_date, id);
    return db.prepare('SELECT * FROM goals WHERE id = ?').get(id);
  });

  // Soft delete
  safeHandle('goals:delete', (_event, id: number) => {
    db.prepare('UPDATE goals SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL').run(id);
    return true;
  });

  // ── Notes ──
  safeHandle('notes:listByClient', (_event, clientId: number) => {
    return db.prepare(
      'SELECT * FROM notes WHERE client_id = ? AND deleted_at IS NULL ORDER BY date_of_service DESC'
    ).all(clientId);
  });

  safeHandle('notes:get', (_event, id: number) => {
    return db.prepare('SELECT * FROM notes WHERE id = ? AND deleted_at IS NULL').get(id);
  });

  safeHandle('notes:create', (_event, data) => {
    const result = db.prepare(`
      INSERT INTO notes (client_id, date_of_service, time_in, time_out, units, cpt_code,
        subjective, objective, assessment, plan, goals_addressed, signed_at,
        cpt_codes, signature_image, signature_typed)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.client_id, data.date_of_service, data.time_in, data.time_out, data.units,
      data.cpt_code, data.subjective, data.objective, data.assessment, data.plan,
      data.goals_addressed || '[]', data.signed_at,
      data.cpt_codes || '[]', data.signature_image || '', data.signature_typed || ''
    );
    return db.prepare('SELECT * FROM notes WHERE id = ?').get(result.lastInsertRowid);
  });

  safeHandle('notes:update', (_event, id: number, data) => {
    db.prepare(`
      UPDATE notes SET date_of_service=?, time_in=?, time_out=?, units=?, cpt_code=?,
        subjective=?, objective=?, assessment=?, plan=?, goals_addressed=?, signed_at=?,
        cpt_codes=?, signature_image=?, signature_typed=?,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND deleted_at IS NULL
    `).run(
      data.date_of_service, data.time_in, data.time_out, data.units, data.cpt_code,
      data.subjective, data.objective, data.assessment, data.plan,
      data.goals_addressed || '[]', data.signed_at,
      data.cpt_codes || '[]', data.signature_image || '', data.signature_typed || '',
      id
    );
    return db.prepare('SELECT * FROM notes WHERE id = ?').get(id);
  });

  // Soft delete
  safeHandle('notes:delete', (_event, id: number) => {
    db.prepare('UPDATE notes SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL').run(id);
    return true;
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
        signature_image, signature_typed)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(data.client_id, data.eval_date, data.discipline, data.content, data.signed_at,
      data.signature_image || '', data.signature_typed || '');
    return db.prepare('SELECT * FROM evaluations WHERE id = ?').get(result.lastInsertRowid);
  });

  safeHandle('evaluations:update', (_event, id: number, data) => {
    db.prepare(`
      UPDATE evaluations SET eval_date=?, discipline=?, content=?, signed_at=?,
        signature_image=?, signature_typed=?,
        updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND deleted_at IS NULL
    `).run(data.eval_date, data.discipline, data.content, data.signed_at,
      data.signature_image || '', data.signature_typed || '', id);
    return db.prepare('SELECT * FROM evaluations WHERE id = ?').get(id);
  });

  // Soft delete
  safeHandle('evaluations:delete', (_event, id: number) => {
    db.prepare('UPDATE evaluations SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL').run(id);
    return true;
  });

  // ── Appointments ──
  safeHandle('appointments:list', (_event, filters?: { startDate?: string; endDate?: string; clientId?: number }) => {
    let query = `
      SELECT a.*, c.first_name, c.last_name, c.discipline as client_discipline
      FROM appointments a
      JOIN clients c ON a.client_id = c.id
      WHERE a.deleted_at IS NULL AND c.deleted_at IS NULL
    `;
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
      INSERT INTO appointments (client_id, scheduled_date, scheduled_time, duration_minutes, status)
      VALUES (?, ?, ?, ?, ?)
    `).run(data.client_id, data.scheduled_date, data.scheduled_time,
      data.duration_minutes || 60, data.status || 'scheduled');
    return db.prepare(`
      SELECT a.*, c.first_name, c.last_name, c.discipline as client_discipline
      FROM appointments a JOIN clients c ON a.client_id = c.id WHERE a.id = ?
    `).get(result.lastInsertRowid);
  });

  safeHandle('appointments:update', (_event, id: number, data) => {
    db.prepare(`
      UPDATE appointments SET client_id=?, scheduled_date=?, scheduled_time=?,
        duration_minutes=?, status=?, note_id=?
      WHERE id=? AND deleted_at IS NULL
    `).run(data.client_id, data.scheduled_date, data.scheduled_time,
      data.duration_minutes, data.status, data.note_id, id);
    return db.prepare(`
      SELECT a.*, c.first_name, c.last_name, c.discipline as client_discipline
      FROM appointments a JOIN clients c ON a.client_id = c.id WHERE a.id = ?
    `).get(id);
  });

  // Soft delete
  safeHandle('appointments:delete', (_event, id: number) => {
    db.prepare('UPDATE appointments SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL').run(id);
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
    db.prepare('UPDATE note_bank SET is_favorite = NOT is_favorite WHERE id = ?').run(id);
    return db.prepare('SELECT * FROM note_bank WHERE id = ?').get(id);
  });

  // ── Goals Bank ──
  safeHandle('goalsBank:list', (_event, filters?: { discipline?: string; category?: string }) => {
    let query = 'SELECT * FROM goals_bank WHERE 1=1';
    const params: any[] = [];

    if (filters?.discipline) {
      query += ' AND discipline = ?';
      params.push(filters.discipline);
    }
    if (filters?.category) {
      query += ' AND category = ?';
      params.push(filters.category);
    }

    query += ' ORDER BY category, goal_template';
    return db.prepare(query).all(...params);
  });

  safeHandle('goalsBank:create', (_event, data) => {
    const result = db.prepare(`
      INSERT INTO goals_bank (discipline, category, goal_template, is_default)
      VALUES (?, ?, ?, ?)
    `).run(data.discipline, data.category, data.goal_template, data.is_default ? 1 : 0);
    return db.prepare('SELECT * FROM goals_bank WHERE id = ?').get(result.lastInsertRowid);
  });

  safeHandle('goalsBank:update', (_event, id: number, data) => {
    db.prepare(`
      UPDATE goals_bank SET discipline=?, category=?, goal_template=?
      WHERE id=?
    `).run(data.discipline, data.category, data.goal_template, id);
    return db.prepare('SELECT * FROM goals_bank WHERE id = ?').get(id);
  });

  safeHandle('goalsBank:delete', (_event, id: number) => {
    db.prepare('DELETE FROM goals_bank WHERE id = ?').run(id);
    return true;
  });

  // ── Settings ──
  safeHandle('settings:get', (_event, key: string) => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as any;
    return row?.value || null;
  });

  safeHandle('settings:set', (_event, key: string, value: string) => {
    db.prepare('INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)').run(key, value);
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
            ) VALUES (?, ?, ?, ?, 'card', ?, ?)
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

  // ── License ──
  safeHandle('license:getStatus', () => {
    const tier = (db.prepare("SELECT value FROM settings WHERE key = 'app_tier'").get() as any)?.value || 'free';
    const key = (db.prepare("SELECT value FROM settings WHERE key = 'license_key'").get() as any)?.value || null;
    const activatedAt = (db.prepare("SELECT value FROM settings WHERE key = 'license_activated_at'").get() as any)?.value || null;
    return { tier, licenseKey: key, activatedAt };
  });

  safeHandle('license:activate', (_event, licenseKey: string) => {
    // TODO: Validate against LemonSqueezy API when ready
    // For now, store the key and mark as pro
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('license_key', licenseKey);
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('app_tier', 'pro');
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('license_activated_at', new Date().toISOString());
    return { success: true, tier: 'pro' };
  });

  safeHandle('license:deactivate', () => {
    db.prepare("DELETE FROM settings WHERE key = 'license_key'");
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").run('app_tier', 'free');
    db.prepare("DELETE FROM settings WHERE key = 'license_activated_at'");
    return { success: true, tier: 'free' };
  });

  // ── Backup & Export ──
  const dbPath = path.join(getDataPath(), 'pocketchart.db');

  safeHandle('backup:exportManual', async () => {
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export Database Backup',
      defaultPath: `pocketchart_backup_${new Date().toISOString().slice(0, 10)}.db`,
      filters: [{ name: 'SQLite Database', extensions: ['db'] }],
    });
    if (canceled || !filePath) return null;
    fs.copyFileSync(dbPath, filePath);
    // Stamp the last backup date so the dashboard can show reminders
    db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('last_backup_date', ?)").run(new Date().toISOString());
    return filePath;
  });

  safeHandle('backup:getDbPath', () => {
    return dbPath;
  });

  safeHandle('backup:exportClientPdf', (_event, { clientId }: { clientId: number }) => {
    const pdfBuffer = buildClientChartPdf(clientId);
    return pdfBuffer.toString('base64');
  });

  safeHandle('backup:exportAllChartsPdf', async () => {
    const clients = db.prepare('SELECT * FROM clients WHERE deleted_at IS NULL ORDER BY last_name, first_name').all() as any[];
    if (clients.length === 0) throw new Error('No clients to export');

    const today = new Date().toISOString().slice(0, 10);
    const { canceled, filePath } = await dialog.showSaveDialog({
      title: 'Export All Client Charts',
      defaultPath: `pocketchart_charts_${today}.zip`,
      filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
    });
    if (canceled || !filePath) return null;

    return new Promise<{ path: string; clientCount: number }>((resolve, reject) => {
      const output = fs.createWriteStream(filePath);
      const archive = archiver('zip', { zlib: { level: 5 } });

      output.on('close', () => {
        resolve({ path: filePath, clientCount: clients.length });
      });
      archive.on('error', (err: Error) => reject(err));
      archive.pipe(output);

      for (const client of clients) {
        try {
          const pdfBuffer = buildClientChartPdf(client.id);
          const safeLast = (client.last_name || 'Unknown').replace(/[^a-zA-Z0-9]/g, '');
          const safeFirst = (client.first_name || 'Unknown').replace(/[^a-zA-Z0-9]/g, '');
          const filename = `${safeLast}_${safeFirst}_${client.id}.pdf`;
          archive.append(pdfBuffer, { name: filename });
        } catch (err) {
          console.error(`Failed to generate PDF for client ${client.id}:`, err);
        }
      }

      archive.finalize();
    });
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

    // ── Header: Practice Info ──
    doc.setFontSize(16);
    doc.setFont('helvetica', 'bold');
    doc.text(practice?.name || 'Practice Name', marginLeft, y);
    y += 16;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    if (practice?.address) {
      doc.text(practice.address, marginLeft, y);
      y += 12;
    }
    if (practice?.phone) {
      doc.text(`Phone: ${practice.phone}`, marginLeft, y);
      y += 12;
    }

    const npiTaxParts: string[] = [];
    if (practice?.npi) npiTaxParts.push(`NPI: ${practice.npi}`);
    if (practice?.tax_id) npiTaxParts.push(`Tax ID: ${practice.tax_id}`);
    if (npiTaxParts.length > 0) {
      doc.text(npiTaxParts.join('    '), marginLeft, y);
      y += 12;
    }

    y += 6;
    doc.setDrawColor(0, 0, 0);
    doc.setLineWidth(1);
    doc.line(marginLeft, y, pageWidth - marginRight, y);
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

    doc.setFont('helvetica', 'bold');
    doc.text('DOB: ', clientInfoRight, y);
    doc.setFont('helvetica', 'normal');
    doc.text(client.dob || '--', clientInfoRight + doc.getTextWidth('DOB: '), y);
    y += 13;

    if (client.address) {
      doc.setFont('helvetica', 'bold');
      doc.text('Address: ', clientInfoLeft, y);
      doc.setFont('helvetica', 'normal');
      doc.text(client.address, clientInfoLeft + doc.getTextWidth('Address: '), y);
      y += 13;
    }

    y += 6;

    // ── Insurance Info Section ──
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('Insurance Information', marginLeft, y);
    y += 14;
    doc.setFontSize(9);

    doc.setFont('helvetica', 'bold');
    doc.text('Payer: ', clientInfoLeft, y);
    doc.setFont('helvetica', 'normal');
    doc.text(client.insurance_payer || '--', clientInfoLeft + doc.getTextWidth('Payer: '), y);
    y += 13;

    doc.setFont('helvetica', 'bold');
    doc.text('Member ID: ', clientInfoLeft, y);
    doc.setFont('helvetica', 'normal');
    doc.text(client.insurance_member_id || '--', clientInfoLeft + doc.getTextWidth('Member ID: '), y);

    doc.setFont('helvetica', 'bold');
    doc.text('Group #: ', clientInfoRight, y);
    doc.setFont('helvetica', 'normal');
    doc.text(client.insurance_group || '--', clientInfoRight + doc.getTextWidth('Group #: '), y);
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
    return newDir;
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
  safeHandle('documents:upload', async (_event, data: { clientId: number; category?: string }) => {
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
      INSERT INTO client_documents (client_id, filename, original_name, file_type, file_size, category)
      VALUES (?, ?, ?, ?, ?, ?)
    `).run(data.clientId, uuidName, originalName, fileType, fileStats.size, data.category || 'general');

    return db.prepare('SELECT * FROM client_documents WHERE id = ?').get(result.lastInsertRowid);
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
    return true;
  });

  safeHandle('documents:getPath', (_event, data: { documentId: number }) => {
    const doc = db.prepare('SELECT * FROM client_documents WHERE id = ? AND deleted_at IS NULL').get(data.documentId) as any;
    if (!doc) throw new Error('Document not found');

    const dataDir = getDataPath();
    return path.join(dataDir, 'documents', String(doc.client_id), doc.filename);
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
    return true;
  });

  // ── Invoices ──
  safeHandle('invoices:list', (_event, filters?: { clientId?: number; status?: string; startDate?: string; endDate?: string }) => {
    let query = 'SELECT * FROM invoices WHERE deleted_at IS NULL';
    const params: any[] = [];

    if (filters?.clientId) {
      query += ' AND client_id = ?';
      params.push(filters.clientId);
    }
    if (filters?.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }
    if (filters?.startDate) {
      query += ' AND invoice_date >= ?';
      params.push(filters.startDate);
    }
    if (filters?.endDate) {
      query += ' AND invoice_date <= ?';
      params.push(filters.endDate);
    }

    query += ' ORDER BY invoice_date DESC';
    return db.prepare(query).all(...params);
  });

  safeHandle('invoices:get', (_event, id: number) => {
    const invoice = db.prepare('SELECT * FROM invoices WHERE id = ? AND deleted_at IS NULL').get(id) as any;
    if (!invoice) throw new Error('Invoice not found');
    const items = db.prepare('SELECT * FROM invoice_items WHERE invoice_id = ?').all(id);
    return { ...invoice, items };
  });

  safeHandle('invoices:create', (_event, data: any, items: any[]) => {
    const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;
    const result = db.prepare(`
      INSERT INTO invoices (client_id, invoice_number, invoice_date, due_date, subtotal, discount_amount, total_amount, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      data.client_id,
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
    db.prepare('UPDATE invoices SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
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

  safeHandle('invoices:generateFromNotes', (_event, clientId: number, noteIds: number[]) => {
    const feeSchedule = db.prepare('SELECT * FROM fee_schedule WHERE deleted_at IS NULL').all() as any[];
    const feeMap = new Map(feeSchedule.map(f => [f.cpt_code, f]));

    const placeholders = noteIds.map(() => '?').join(',');
    const notes = db.prepare(
      `SELECT * FROM notes WHERE id IN (${placeholders}) AND client_id = ? AND deleted_at IS NULL`
    ).all(...noteIds, clientId) as any[];

    let subtotal = 0;
    const items: any[] = [];

    for (const note of notes) {
      const fee = feeMap.get(note.cpt_code);
      const unitPrice = fee?.amount || note.charge_amount || 0;
      const amount = unitPrice * (note.units || 1);
      subtotal += amount;
      items.push({
        note_id: note.id,
        description: fee?.description || `Service on ${note.date_of_service}`,
        cpt_code: note.cpt_code,
        service_date: note.date_of_service,
        units: note.units || 1,
        unit_price: unitPrice,
        amount,
      });
    }

    const invoiceNumber = `INV-${Date.now().toString(36).toUpperCase()}`;
    const result = db.prepare(`
      INSERT INTO invoices (client_id, invoice_number, invoice_date, subtotal, total_amount, status)
      VALUES (?, ?, ?, ?, ?, 'draft')
    `).run(clientId, invoiceNumber, new Date().toISOString().slice(0, 10), subtotal, subtotal);
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

  safeHandle('payments:delete', (_event, id: number) => {
    db.prepare('UPDATE payments SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    return true;
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
    let query = 'SELECT * FROM claims WHERE deleted_at IS NULL';
    const params: any[] = [];

    if (filters?.clientId) {
      query += ' AND client_id = ?';
      params.push(filters.clientId);
    }
    if (filters?.status) {
      query += ' AND status = ?';
      params.push(filters.status);
    }
    if (filters?.startDate) {
      query += ' AND service_date_start >= ?';
      params.push(filters.startDate);
    }
    if (filters?.endDate) {
      query += ' AND service_date_end <= ?';
      params.push(filters.endDate);
    }

    query += ' ORDER BY created_at DESC';
    return db.prepare(query).all(...params);
  });

  safeHandle('claims:get', (_event, id: number) => {
    const claim = db.prepare('SELECT * FROM claims WHERE id = ? AND deleted_at IS NULL').get(id) as any;
    if (!claim) throw new Error('Claim not found');
    const lines = db.prepare('SELECT * FROM claim_lines WHERE claim_id = ? ORDER BY line_number').all(id);
    return { ...claim, lines };
  });

  safeHandle('claims:create', (_event, data: any, lines: any[]) => {
    const claimNumber = `CLM-${Date.now().toString(36).toUpperCase()}`;
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
    db.prepare('DELETE FROM payers WHERE id = ?').run(id);
    return true;
  });

  // ── Audit Log ──
  safeHandle('auditLog:list', (_event, filters?: {
    entityType?: string;
    entityId?: number;
    clientId?: number;
    startDate?: string;
    endDate?: string;
    limit?: number;
  }) => {
    let query = 'SELECT * FROM audit_log WHERE 1=1';
    const params: any[] = [];

    if (filters?.entityType) {
      query += ' AND entity_type = ?';
      params.push(filters.entityType);
    }
    if (filters?.entityId) {
      query += ' AND entity_id = ?';
      params.push(filters.entityId);
    }
    if (filters?.clientId) {
      query += ' AND client_id = ?';
      params.push(filters.clientId);
    }
    if (filters?.startDate) {
      query += ' AND created_at >= ?';
      params.push(filters.startDate);
    }
    if (filters?.endDate) {
      query += ' AND created_at <= ?';
      params.push(filters.endDate);
    }

    query += ' ORDER BY created_at DESC';

    if (filters?.limit) {
      query += ' LIMIT ?';
      params.push(filters.limit);
    }

    return db.prepare(query).all(...params);
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
}

// Helper: build an invoice PDF and return as base64
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

  // ── Header: Practice Info ──
  doc.setFontSize(18);
  doc.setFont('helvetica', 'bold');
  doc.text(practice?.name || 'Practice Name', marginLeft, y);
  y += 20;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  if (practice?.address) {
    doc.text(practice.address, marginLeft, y);
    y += 14;
  }
  const cityStateZip = [practice?.city, practice?.state, practice?.zip].filter(Boolean).join(', ');
  if (cityStateZip) {
    doc.text(cityStateZip, marginLeft, y);
    y += 14;
  }
  if (practice?.phone) {
    doc.text(`Phone: ${practice.phone}`, marginLeft, y);
    y += 14;
  }
  if (practice?.npi) {
    doc.text(`NPI: ${practice.npi}`, marginLeft, y);
    y += 14;
  }

  // ── Invoice Title & Number (right aligned) ──
  const invoiceRightX = pageWidth - marginRight;
  doc.setFontSize(24);
  doc.setFont('helvetica', 'bold');
  doc.text('INVOICE', invoiceRightX, 60, { align: 'right' });

  doc.setFontSize(11);
  doc.setFont('helvetica', 'normal');
  doc.text(`Invoice #: ${invoice.invoice_number}`, invoiceRightX, 80, { align: 'right' });
  doc.text(`Date: ${invoice.invoice_date}`, invoiceRightX, 95, { align: 'right' });
  if (invoice.due_date) {
    doc.text(`Due: ${invoice.due_date}`, invoiceRightX, 110, { align: 'right' });
  }

  y = Math.max(y, 130);

  // ── Divider ──
  doc.setDrawColor(200, 200, 200);
  doc.setLineWidth(1);
  doc.line(marginLeft, y, pageWidth - marginRight, y);
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

// Helper: build a single-client chart PDF and return as Buffer
function buildClientChartPdf(clientId: number): Buffer {
  const db = getDatabase();
  const client = db.prepare('SELECT * FROM clients WHERE id = ? AND deleted_at IS NULL').get(clientId) as any;
  if (!client) throw new Error('Client not found');

  const evals = db.prepare('SELECT * FROM evaluations WHERE client_id = ? AND deleted_at IS NULL ORDER BY eval_date DESC').all(clientId) as any[];
  const notes = db.prepare('SELECT * FROM notes WHERE client_id = ? AND deleted_at IS NULL ORDER BY date_of_service DESC').all(clientId) as any[];
  const goals = db.prepare('SELECT * FROM goals WHERE client_id = ? AND deleted_at IS NULL ORDER BY created_at DESC').all(clientId) as any[];

  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginLeft = 40;
  const marginRight = 40;
  const maxWidth = pageWidth - marginLeft - marginRight;
  let y = 50;

  const checkPageBreak = (needed: number) => {
    if (y + needed > doc.internal.pageSize.getHeight() - 50) {
      doc.addPage();
      y = 50;
    }
  };

  const addSectionHeader = (text: string) => {
    checkPageBreak(30);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(text, marginLeft, y);
    y += 8;
    doc.setLineWidth(0.5);
    doc.line(marginLeft, y, pageWidth - marginRight, y);
    y += 14;
  };

  const addField = (label: string, value: string) => {
    checkPageBreak(18);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}: `, marginLeft, y);
    const labelWidth = doc.getTextWidth(`${label}: `);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(value || '--', maxWidth - labelWidth);
    doc.text(lines, marginLeft + labelWidth, y);
    y += lines.length * 13;
  };

  const addWrappedText = (text: string, indent = 0) => {
    if (!text) return;
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(text, maxWidth - indent);
    for (const line of lines) {
      checkPageBreak(14);
      doc.text(line, marginLeft + indent, y);
      y += 13;
    }
  };

  // Title
  doc.setFontSize(20);
  doc.setFont('helvetica', 'bold');
  doc.text('Client Chart', marginLeft, y);
  y += 10;
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated: ${new Date().toLocaleDateString()}`, marginLeft, y + 10);
  y += 30;

  // Client Info
  addSectionHeader('Client Information');
  addField('Name', `${client.first_name} ${client.last_name}`);
  addField('DOB', client.dob || '--');
  addField('Phone', client.phone || '--');
  addField('Email', client.email || '--');
  addField('Address', [client.address, client.city, client.state, client.zip].filter(Boolean).join(', ') || '--');
  addField('Status', client.status || '--');
  addField('Discipline', client.discipline || '--');
  addField('Primary Dx', `${client.primary_dx_code || ''} - ${client.primary_dx_description || ''}`);
  y += 6;

  // Insurance
  if (client.insurance_payer || client.insurance_member_id) {
    addSectionHeader('Insurance');
    addField('Payer', client.insurance_payer || '--');
    addField('Member ID', client.insurance_member_id || '--');
    addField('Group #', client.insurance_group_number || '--');
    y += 6;
  }

  // Goals
  if (goals.length > 0) {
    addSectionHeader(`Goals (${goals.length})`);
    for (const goal of goals) {
      checkPageBreak(40);
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(`[${goal.goal_type}] ${goal.status.toUpperCase()}`, marginLeft, y);
      y += 13;
      doc.setFont('helvetica', 'normal');
      addWrappedText(goal.goal_text, 10);
      if (goal.target_date) {
        addField('  Target', goal.target_date);
      }
      if (goal.met_date) {
        addField('  Met', goal.met_date);
      }
      y += 6;
    }
  }

  // Evaluations
  if (evals.length > 0) {
    addSectionHeader(`Evaluations (${evals.length})`);
    for (const evalItem of evals) {
      checkPageBreak(40);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(`${evalItem.eval_date} - ${evalItem.discipline}`, marginLeft, y);
      if (evalItem.signed_at) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text('  (Signed)', marginLeft + doc.getTextWidth(`${evalItem.eval_date} - ${evalItem.discipline}`), y);
      }
      y += 14;
      if (evalItem.content) {
        try {
          const content = JSON.parse(evalItem.content);
          if (typeof content === 'object') {
            for (const [key, val] of Object.entries(content)) {
              if (val && key !== 'goal_entries' && key !== 'created_goal_ids' && key !== 'objective_assessment') {
                addField(`  ${key}`, String(val));
              }
              if (key === 'objective_assessment' && val && typeof val === 'object') {
                for (const [oKey, oVal] of Object.entries(val as Record<string, string>)) {
                  if (oVal) addField(`    ${oKey}`, String(oVal));
                }
              }
            }
          } else {
            addWrappedText(evalItem.content, 10);
          }
        } catch {
          addWrappedText(evalItem.content, 10);
        }
      }
      if (evalItem.signature_typed) {
        addField('  Signed by', evalItem.signature_typed);
      }
      y += 8;
    }
  }

  // Notes
  if (notes.length > 0) {
    addSectionHeader(`SOAP Notes (${notes.length})`);
    for (const note of notes) {
      checkPageBreak(60);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');

      let cptDisplay = note.cpt_code || '--';
      let unitsDisplay = String(note.units || '--');
      try {
        const cptLines = JSON.parse(note.cpt_codes || '[]');
        if (Array.isArray(cptLines) && cptLines.length > 0) {
          cptDisplay = cptLines.map((l: any) => `${l.code} (${l.units}u)`).join(', ');
          unitsDisplay = String(cptLines.reduce((s: number, l: any) => s + (l.units || 0), 0));
        }
      } catch { /* use legacy fields */ }

      const noteHeader = `${note.date_of_service} | CPT: ${cptDisplay} | Units: ${unitsDisplay}`;
      doc.text(noteHeader, marginLeft, y);
      if (note.signed_at) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.text('  (Signed)', marginLeft + doc.getTextWidth(noteHeader), y);
      }
      y += 14;

      if (note.time_in || note.time_out) {
        addField('  Time', `${note.time_in || '--'} to ${note.time_out || '--'}`);
      }
      if (note.subjective) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        checkPageBreak(14);
        doc.text('  Subjective:', marginLeft, y);
        y += 13;
        addWrappedText(note.subjective, 20);
      }
      if (note.objective) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        checkPageBreak(14);
        doc.text('  Objective:', marginLeft, y);
        y += 13;
        addWrappedText(note.objective, 20);
      }
      if (note.assessment) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        checkPageBreak(14);
        doc.text('  Assessment:', marginLeft, y);
        y += 13;
        addWrappedText(note.assessment, 20);
      }
      if (note.plan) {
        doc.setFont('helvetica', 'bold');
        doc.setFontSize(9);
        checkPageBreak(14);
        doc.text('  Plan:', marginLeft, y);
        y += 13;
        addWrappedText(note.plan, 20);
      }
      if (note.signature_typed) {
        addField('  Signed by', note.signature_typed);
      }
      y += 10;
      doc.setLineWidth(0.25);
      doc.setDrawColor(200, 200, 200);
      doc.line(marginLeft + 20, y, pageWidth - marginRight - 20, y);
      y += 10;
    }
  }

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
