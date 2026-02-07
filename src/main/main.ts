import { app, BrowserWindow, ipcMain, dialog, shell, safeStorage } from 'electron';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import { initDatabase, getDatabase, getDataPath, setDataPath, resetDataPath, getDefaultDataPath } from './database';
import { jsPDF } from 'jspdf';
import { v4 as uuidv4 } from 'uuid';
import archiver from 'archiver';
import { autoUpdater } from 'electron-updater';
import Stripe from 'stripe';
import { requiresReferral as checkDirectAccess, getAllRules as getDirectAccessRules } from '../shared/directAccessRules';
import { detectCloudStorage } from './cloudDetection';
import type { AppTier, NoteFormat } from '../shared/types';
import { NOTE_FORMAT_SECTIONS } from '../shared/types';

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
        frequency_per_week, duration_weeks, frequency_notes, note_type, patient_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      data.frequency_notes || '', data.note_type || 'soap', data.patient_name || ''
    );

    const note = db.prepare('SELECT * FROM notes WHERE id = ?').get(result.lastInsertRowid) as any;

    // If note is signed, increment compliance visit counter
    if (data.signed_at && data.client_id) {
      try {
        const compliance = db.prepare('SELECT * FROM compliance_tracking WHERE client_id = ?').get(data.client_id) as any;
        if (compliance?.tracking_enabled) {
          db.prepare(`
            UPDATE compliance_tracking
            SET visits_since_last_progress = visits_since_last_progress + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE client_id = ?
          `).run(data.client_id);
        }
      } catch { /* compliance tracking may not exist yet */ }
    }

    return note;
  });

  safeHandle('notes:update', (_event, id: number, data) => {
    // Check if this update is adding a signature (going from unsigned to signed)
    const existingNote = db.prepare('SELECT signed_at, client_id FROM notes WHERE id = ?').get(id) as any;
    const isNewlySignedNote = !existingNote?.signed_at && data.signed_at;

    db.prepare(`
      UPDATE notes SET date_of_service=?, time_in=?, time_out=?, units=?, cpt_code=?,
        subjective=?, objective=?, assessment=?, plan=?, goals_addressed=?, signed_at=?,
        cpt_codes=?, signature_image=?, signature_typed=?,
        cpt_modifiers=?, charge_amount=?, place_of_service=?, diagnosis_pointers=?,
        rendering_provider_npi=?,
        entity_id=?, rate_override=?, rate_override_reason=?,
        frequency_per_week=?, duration_weeks=?, frequency_notes=?, note_type=?,
        patient_name=?,
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
      data.patient_name || '',
      id
    );

    // If note was just signed, increment compliance visit counter
    if (isNewlySignedNote && existingNote?.client_id) {
      try {
        const compliance = db.prepare('SELECT * FROM compliance_tracking WHERE client_id = ?').get(existingNote.client_id) as any;
        if (compliance?.tracking_enabled) {
          db.prepare(`
            UPDATE compliance_tracking
            SET visits_since_last_progress = visits_since_last_progress + 1,
                updated_at = CURRENT_TIMESTAMP
            WHERE client_id = ?
          `).run(existingNote.client_id);
        }
      } catch { /* compliance tracking may not exist yet */ }
    }

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
        signature_image, signature_typed, eval_type)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(data.client_id, data.eval_date, data.discipline, data.content, data.signed_at,
      data.signature_image || '', data.signature_typed || '', data.eval_type || 'initial');
    return db.prepare('SELECT * FROM evaluations WHERE id = ?').get(result.lastInsertRowid);
  });

  safeHandle('evaluations:update', (_event, id: number, data) => {
    db.prepare(`
      UPDATE evaluations SET eval_date=?, discipline=?, content=?, signed_at=?,
        signature_image=?, signature_typed=?, eval_type=COALESCE(?, eval_type),
        updated_at=CURRENT_TIMESTAMP
      WHERE id=? AND deleted_at IS NULL
    `).run(data.eval_date, data.discipline, data.content, data.signed_at,
      data.signature_image || '', data.signature_typed || '', data.eval_type || null, id);
    return db.prepare('SELECT * FROM evaluations WHERE id = ?').get(id);
  });

  // Soft delete
  safeHandle('evaluations:delete', (_event, id: number) => {
    db.prepare('UPDATE evaluations SET deleted_at = CURRENT_TIMESTAMP WHERE id = ? AND deleted_at IS NULL').run(id);
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
      INSERT INTO appointments (client_id, scheduled_date, scheduled_time, duration_minutes, status, entity_id, entity_rate, patient_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run(data.client_id || 0, data.scheduled_date, data.scheduled_time,
      data.duration_minutes || 60, data.status || 'scheduled',
      data.entity_id || null, data.entity_rate || null, data.patient_name || '');
    return db.prepare(apptSelectQuery + ' AND a.id = ?').get(result.lastInsertRowid);
  });

  // Batch create for recurring appointments
  safeHandle('appointments:createBatch', (_event, items: any[]) => {
    const insert = db.prepare(`
      INSERT INTO appointments (client_id, scheduled_date, scheduled_time, duration_minutes, status, entity_id, entity_rate, patient_name)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const created: any[] = [];
    const txn = db.transaction(() => {
      for (const data of items) {
        const result = insert.run(
          data.client_id || 0, data.scheduled_date, data.scheduled_time,
          data.duration_minutes || 60, data.status || 'scheduled',
          data.entity_id || null, data.entity_rate || null, data.patient_name || ''
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
        duration_minutes=?, status=?, note_id=?, entity_id=?, entity_rate=?, patient_name=?
      WHERE id=? AND deleted_at IS NULL
    `).run(data.client_id, data.scheduled_date, data.scheduled_time,
      data.duration_minutes, data.status, data.note_id,
      data.entity_id || null, data.entity_rate || null, data.patient_name || '', id);
    return db.prepare(apptSelectQuery + ' AND a.id = ?').get(id);
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
      query += ' AND category = ? COLLATE NOCASE';
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

      if (!data.valid && data.error) {
        return { valid: false, tier: 'unlicensed', subscriptionStatus: null, subscriptionExpiresAt: null, error: data.error };
      }

      if (!data.valid) {
        return { valid: false, tier: 'unlicensed', subscriptionStatus: null, subscriptionExpiresAt: null, error: 'Invalid license key' };
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
        // Pro subscription expired → unlicensed (they never paid for Basic)
        if (tier === 'pro') tier = 'unlicensed';
      } else if (data.license_key?.status === 'disabled') {
        subscriptionStatus = 'cancelled';
        // Pro subscription cancelled → unlicensed
        if (tier === 'pro') tier = 'unlicensed';
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
      };
    }

    const tier = (getSetting('app_tier') || 'unlicensed') as AppTier;
    const licenseKey = getSetting('license_key');
    const activatedAt = getSetting('license_activated_at');
    const subscriptionStatus = getSetting('subscription_status') as 'active' | 'expired' | 'cancelled' | null;
    const subscriptionExpiresAt = getSetting('subscription_expires_at');
    const lastValidatedAt = getSetting('last_license_validation');

    return {
      tier,
      licenseKey,
      activatedAt,
      subscriptionStatus,
      subscriptionExpiresAt,
      lastValidatedAt,
    };
  });

  safeHandle('license:activate', async (_event, licenseKey: string) => {
    // Validate against Lemon Squeezy API
    const result = await validateLemonSqueezyLicense(licenseKey);

    if (result.error === 'network_error') {
      // Can't reach API — store key optimistically but don't set tier yet
      // User can retry when online
      return { success: false, tier: 'unlicensed' as AppTier, error: 'Unable to validate license. Please check your internet connection and try again.' };
    }

    if (!result.valid) {
      return { success: false, tier: 'unlicensed' as AppTier, error: result.error || 'Invalid license key' };
    }

    // Store license info
    setSetting('license_key', licenseKey);
    setSetting('app_tier', result.tier);
    setSetting('license_activated_at', new Date().toISOString());
    setSetting('last_license_validation', new Date().toISOString());

    if (result.subscriptionStatus) {
      setSetting('subscription_status', result.subscriptionStatus);
    }
    if (result.subscriptionExpiresAt) {
      setSetting('subscription_expires_at', result.subscriptionExpiresAt);
    }

    return { success: true, tier: result.tier };
  });

  safeHandle('license:deactivate', () => {
    deleteSetting('license_key');
    setSetting('app_tier', 'unlicensed');
    deleteSetting('license_activated_at');
    deleteSetting('subscription_status');
    deleteSetting('subscription_expires_at');
    deleteSetting('last_license_validation');
    return { success: true, tier: 'unlicensed' as AppTier };
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
      // License no longer valid — drop to unlicensed
      setSetting('app_tier', 'unlicensed');
      deleteSetting('subscription_status');
      deleteSetting('subscription_expires_at');
    }
  }

  // Run background validation after 30 seconds, then every 6 hours
  setTimeout(() => backgroundLicenseValidation(), 30000);
  setInterval(() => backgroundLicenseValidation(), 6 * 60 * 60 * 1000);

  // ── Tier-Gated Helper ──
  function requireTier(requiredTier: 'basic' | 'pro'): void {
    if (FORCE_PRO) return; // Bypass tier check when workshopping Pro features
    const currentTier = (getSetting('app_tier') || 'unlicensed') as AppTier;
    const tierRank = { unlicensed: 0, basic: 1, pro: 2 };
    if (tierRank[currentTier] < tierRank[requiredTier]) {
      throw new Error(`This feature requires PocketChart ${requiredTier === 'pro' ? 'Pro' : 'Basic'}. Please upgrade to access this feature.`);
    }
  }

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

  // Get invoice status for notes (which notes are invoiced and paid)
  safeHandle('invoices:noteStatuses', (_event) => {
    const rows = db.prepare(`
      SELECT ii.note_id, i.id as invoice_id, i.invoice_number, i.status
      FROM invoice_items ii
      JOIN invoices i ON i.id = ii.invoice_id AND i.deleted_at IS NULL
      WHERE ii.note_id IS NOT NULL
    `).all() as Array<{ note_id: number; invoice_id: number; invoice_number: string; status: string }>;
    const map: Record<number, { invoice_id: number; invoice_number: string; status: string }> = {};
    for (const row of rows) {
      map[row.note_id] = { invoice_id: row.invoice_id, invoice_number: row.invoice_number, status: row.status };
    }
    return map;
  });

  safeHandle('invoices:generateFromNotes', (_event, clientId: number, noteIds: number[], entityId?: number) => {
    const feeSchedule = db.prepare('SELECT * FROM fee_schedule WHERE deleted_at IS NULL').all() as any[];
    const feeMap = new Map(feeSchedule.map(f => [f.cpt_code, f]));

    // If entity, also load entity fee schedule for rate overrides
    let entityFeeMap = new Map<string, any>();
    if (entityId) {
      const entityFees = db.prepare('SELECT * FROM entity_fee_schedules WHERE entity_id = ? AND deleted_at IS NULL').all(entityId) as any[];
      entityFeeMap = new Map(entityFees.filter(f => f.cpt_code).map(f => [f.cpt_code, f]));
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
    const items: any[] = [];

    for (const note of notes) {
      // Prefer entity fee schedule rate, then global fee schedule, then note charge_amount
      const entityFee = entityFeeMap.get(note.cpt_code);
      const fee = feeMap.get(note.cpt_code);
      const unitPrice = entityFee?.default_rate || note.rate_override || fee?.amount || note.charge_amount || 0;
      const amount = unitPrice * (note.units || 1);
      subtotal += amount;
      items.push({
        note_id: note.id,
        description: entityFee?.description || fee?.description || `Service on ${note.date_of_service}`,
        cpt_code: note.cpt_code,
        service_date: note.date_of_service,
        units: note.units || 1,
        unit_price: unitPrice,
        amount,
      });
    }

    const invoiceNumber = generateInvoiceNumber();
    const result = db.prepare(`
      INSERT INTO invoices (client_id, entity_id, invoice_number, invoice_date, subtotal, total_amount, status)
      VALUES (?, ?, ?, ?, ?, ?, 'draft')
    `).run(clientId || null, entityId || null, invoiceNumber, new Date().toISOString().slice(0, 10), subtotal, subtotal);
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
    db.prepare("UPDATE contracted_entities SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
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
    db.prepare("UPDATE entity_documents SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run(documentId);
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
    db.prepare("UPDATE vault_documents SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
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
  // ── Compliance Tracking (Pro Only) ──
  // ══════════════════════════════════════════════════════════════════════

  safeHandle('compliance:getByClient', (_event, clientId: number) => {
    requireTier('pro');
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
    requireTier('pro');
    // Ensure record exists
    let record = db.prepare('SELECT * FROM compliance_tracking WHERE client_id = ?').get(clientId) as any;
    if (!record) {
      db.prepare('INSERT INTO compliance_tracking (client_id) VALUES (?)').run(clientId);
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
    return db.prepare('SELECT * FROM compliance_tracking WHERE client_id = ?').get(clientId);
  });

  safeHandle('compliance:incrementVisit', (_event, clientId: number) => {
    requireTier('pro');
    db.prepare(`
      UPDATE compliance_tracking
      SET visits_since_last_progress = visits_since_last_progress + 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE client_id = ?
    `).run(clientId);
    return db.prepare('SELECT * FROM compliance_tracking WHERE client_id = ?').get(clientId);
  });

  safeHandle('compliance:resetProgressCounter', (_event, clientId: number) => {
    requireTier('pro');
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
    requireTier('pro');
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
    requireTier('pro');
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
    requireTier('pro');
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
    db.prepare("UPDATE communication_log SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?").run(id);
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
    if (!value || value === '--' || value.trim() === '' || value.trim() === '-') return;
    checkPageBreak(18);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text(`${label}: `, marginLeft, y);
    const labelWidth = doc.getTextWidth(`${label}: `);
    doc.setFont('helvetica', 'normal');
    const lines = doc.splitTextToSize(value, maxWidth - labelWidth);
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
  addField('DOB', client.dob);
  addField('Phone', client.phone);
  addField('Email', client.email);
  const clientAddr = [client.address, client.city, client.state, client.zip].filter(Boolean).join(', ');
  addField('Address', clientAddr);
  addField('Status', client.status);
  addField('Discipline', client.discipline);
  const dxParts = [client.primary_dx_code, client.primary_dx_description].filter(Boolean).join(' - ');
  if (dxParts) addField('Primary Dx', dxParts);
  y += 6;

  // Insurance
  if (client.insurance_payer || client.insurance_member_id) {
    addSectionHeader('Insurance');
    addField('Payer', client.insurance_payer);
    addField('Member ID', client.insurance_member_id);
    addField('Group #', client.insurance_group_number);
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
    addSectionHeader(`Evaluations / Plan of Care (${evals.length})`);
    for (const evalItem of evals) {
      checkPageBreak(40);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      const evalHeaderLabel = 'Initial Evaluation / Plan of Care';
      doc.text(`${evalItem.eval_date} - ${evalItem.discipline} — ${evalHeaderLabel}`, marginLeft, y);
      if (evalItem.signed_at) {
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        const headerText = `${evalItem.eval_date} - ${evalItem.discipline} — ${evalHeaderLabel}`;
        doc.text('  (Signed)', marginLeft + doc.getTextWidth(headerText), y);
      }
      y += 14;
      if (evalItem.content) {
        try {
          const content = JSON.parse(evalItem.content);
          if (typeof content === 'object') {
            // Pretty field labels for eval content
            const evalFieldLabels: Record<string, string> = {
              referral_source: 'Referral Source',
              medical_history: 'Medical History',
              prior_level_of_function: 'Prior Level of Function',
              current_complaints: 'Current Complaints',
              clinical_impression: 'Clinical Impression',
              rehabilitation_potential: 'Rehabilitation Potential / Prognosis',
              precautions: 'Precautions / Contraindications',
              goals: 'Goals',
              treatment_plan: 'Treatment Plan',
              frequency_duration: 'Frequency & Duration',
            };
            for (const [key, val] of Object.entries(content)) {
              if (key === 'goal_entries' || key === 'created_goal_ids' || key === 'objective_assessment') continue;
              if (!val || (typeof val === 'string' && !val.trim())) continue;
              const label = evalFieldLabels[key] || key;
              addField(`  ${label}`, String(val));
            }
            if (content.objective_assessment && typeof content.objective_assessment === 'object') {
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
              for (const [oKey, oVal] of Object.entries(content.objective_assessment as Record<string, string>)) {
                if (oVal && oVal.trim()) {
                  const oLabel = objFields[oKey] || oKey;
                  addField(`    ${oLabel}`, String(oVal));
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
    const noteFormatVal = (db.prepare("SELECT value FROM settings WHERE key = 'note_format'").get() as any)?.value || 'SOAP';
    const pdfSections = NOTE_FORMAT_SECTIONS[noteFormatVal as NoteFormat].filter((s: any) => s.label !== '(unused)');
    addSectionHeader(`${noteFormatVal} Notes (${notes.length})`);
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

      if (note.time_in && note.time_out) {
        addField('  Time', `${note.time_in} to ${note.time_out}`);
      } else if (note.time_in) {
        addField('  Time In', note.time_in);
      } else if (note.time_out) {
        addField('  Time Out', note.time_out);
      }
      for (const sec of pdfSections) {
        const value = (note as any)[sec.field];
        if (value) {
          doc.setFont('helvetica', 'bold');
          doc.setFontSize(9);
          checkPageBreak(14);
          doc.text(`  ${sec.label}:`, marginLeft, y);
          y += 13;
          addWrappedText(value, 20);
        }
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

  // Add confidentiality footer to all pages
  const totalPages = doc.getNumberOfPages();
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i);
    doc.setFontSize(7);
    doc.setTextColor(128, 128, 128);
    doc.text(
      'This document contains confidential health information. Unauthorized disclosure is prohibited.',
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 20,
      { align: 'center' }
    );
    // Page numbers only for multi-page documents
    if (totalPages > 1) {
      doc.text(
        `Page ${i} of ${totalPages}`,
        pageWidth / 2,
        doc.internal.pageSize.getHeight() - 12,
        { align: 'center' }
      );
    }
    doc.setTextColor(0, 0, 0);
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
