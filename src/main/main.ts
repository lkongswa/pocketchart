import { app, BrowserWindow, ipcMain, dialog, shell } from 'electron';
import path from 'path';
import crypto from 'crypto';
import fs from 'fs';
import { initDatabase, getDatabase, getDataPath, setDataPath, resetDataPath, getDefaultDataPath } from './database';
import { jsPDF } from 'jspdf';
import { v4 as uuidv4 } from 'uuid';
import archiver from 'archiver';
import { autoUpdater } from 'electron-updater';

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
