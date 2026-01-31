import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import Store from 'electron-store';
import { seedDefaultData } from './seed';

let db: Database.Database;

interface StoreSchema {
  dataPath?: string;
}

// electron-store's base class (conf) is ESM-only, so TypeScript with
// moduleResolution:"node" cannot resolve the inherited method types.
// We define the methods we use and cast accordingly.
interface TypedStore {
  get(key: keyof StoreSchema): string | undefined;
  set(key: keyof StoreSchema, value: string): void;
  delete(key: keyof StoreSchema): void;
}

const store = new Store<StoreSchema>() as unknown as TypedStore;

// Valid table names for safe pragma queries
const VALID_TABLES = new Set([
  'practice', 'clients', 'goals', 'evaluations', 'notes',
  'appointments', 'note_bank', 'goals_bank', 'settings',
  'client_documents',
]);

export function getDataPath(): string {
  const customPath = store.get('dataPath') as string | undefined;
  return customPath || app.getPath('userData');
}

export function setDataPath(newPath: string): void {
  store.set('dataPath', newPath);
}

export function resetDataPath(): void {
  store.delete('dataPath');
}

export function getDefaultDataPath(): string {
  return app.getPath('userData');
}

export function getDatabase(): Database.Database {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase first.');
  }
  return db;
}

export function initDatabase(): void {
  const dataDir = getDataPath();
  const dbPath = path.join(dataDir, 'pocketchart.db');
  db = new Database(dbPath);

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  createTables();
  runMigrations();
  createIndexes();
  seedDefaultData(db);
}

function getSchemaVersion(): number {
  // Check if settings table exists first
  const tableExists = db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='settings'"
  ).get();
  if (!tableExists) return 0;

  const row = db.prepare(
    "SELECT value FROM settings WHERE key = 'schema_version'"
  ).get() as { value: string } | undefined;
  return row ? parseInt(row.value, 10) : 0;
}

function setSchemaVersion(version: number): void {
  db.prepare(
    'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)'
  ).run('schema_version', version.toString());
}

function columnExists(tableName: string, columnName: string): boolean {
  if (!VALID_TABLES.has(tableName)) {
    throw new Error(`Invalid table name: ${tableName}`);
  }
  const cols = db.pragma(`table_info(${tableName})`) as Array<{ name: string }>;
  return cols.some((col) => col.name === columnName);
}

function runMigrations(): void {
  const currentVersion = getSchemaVersion();

  const migrations: Array<{ version: number; description: string; up: () => void }> = [
    {
      version: 1,
      description: 'Add multiple CPT codes per note',
      up: () => {
        if (!columnExists('notes', 'cpt_codes')) {
          db.exec("ALTER TABLE notes ADD COLUMN cpt_codes TEXT DEFAULT '[]'");
        }
      },
    },
    {
      version: 2,
      description: 'Add signature support to notes',
      up: () => {
        if (!columnExists('notes', 'signature_image')) {
          db.exec("ALTER TABLE notes ADD COLUMN signature_image TEXT DEFAULT ''");
        }
        if (!columnExists('notes', 'signature_typed')) {
          db.exec("ALTER TABLE notes ADD COLUMN signature_typed TEXT DEFAULT ''");
        }
      },
    },
    {
      version: 3,
      description: 'Add signature support to evaluations',
      up: () => {
        if (!columnExists('evaluations', 'signature_image')) {
          db.exec("ALTER TABLE evaluations ADD COLUMN signature_image TEXT DEFAULT ''");
        }
        if (!columnExists('evaluations', 'signature_typed')) {
          db.exec("ALTER TABLE evaluations ADD COLUMN signature_typed TEXT DEFAULT ''");
        }
      },
    },
    {
      version: 4,
      description: 'Add soft-delete columns to all clinical tables',
      up: () => {
        const tables = ['clients', 'notes', 'evaluations', 'goals', 'appointments', 'client_documents'];
        for (const table of tables) {
          if (!columnExists(table, 'deleted_at')) {
            db.exec(`ALTER TABLE ${table} ADD COLUMN deleted_at DATETIME DEFAULT NULL`);
          }
        }
      },
    },
    {
      version: 5,
      description: 'Add license key and tier settings',
      up: () => {
        // These are stored in the settings key-value table, no schema change needed.
        // Just ensure defaults exist.
        const existing = db.prepare("SELECT value FROM settings WHERE key = 'app_tier'").get();
        if (!existing) {
          db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run('app_tier', 'free');
        }
      },
    },
  ];

  const pendingMigrations = migrations.filter((m) => m.version > currentVersion);

  if (pendingMigrations.length === 0) return;

  const runAll = db.transaction(() => {
    for (const migration of pendingMigrations) {
      migration.up();
      setSchemaVersion(migration.version);
    }
  });

  runAll();
}

function createIndexes(): void {
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_notes_client_id ON notes(client_id);
    CREATE INDEX IF NOT EXISTS idx_notes_date_of_service ON notes(date_of_service);
    CREATE INDEX IF NOT EXISTS idx_goals_client_id ON goals(client_id);
    CREATE INDEX IF NOT EXISTS idx_evaluations_client_id ON evaluations(client_id);
    CREATE INDEX IF NOT EXISTS idx_appointments_client_id ON appointments(client_id);
    CREATE INDEX IF NOT EXISTS idx_appointments_scheduled_date ON appointments(scheduled_date);
    CREATE INDEX IF NOT EXISTS idx_client_documents_client_id ON client_documents(client_id);
    CREATE INDEX IF NOT EXISTS idx_note_bank_discipline ON note_bank(discipline);
    CREATE INDEX IF NOT EXISTS idx_goals_bank_discipline ON goals_bank(discipline);
    CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
    CREATE INDEX IF NOT EXISTS idx_clients_deleted_at ON clients(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_notes_deleted_at ON notes(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_evaluations_deleted_at ON evaluations(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_goals_deleted_at ON goals(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_appointments_deleted_at ON appointments(deleted_at);
  `);
}

function createTables(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS practice (
      id INTEGER PRIMARY KEY,
      name TEXT,
      address TEXT,
      phone TEXT,
      npi TEXT,
      tax_id TEXT,
      license_number TEXT,
      license_state TEXT,
      discipline TEXT
    );

    CREATE TABLE IF NOT EXISTS clients (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      first_name TEXT NOT NULL,
      last_name TEXT NOT NULL,
      dob TEXT,
      phone TEXT,
      email TEXT,
      address TEXT,
      primary_dx_code TEXT,
      primary_dx_description TEXT,
      secondary_dx TEXT DEFAULT '[]',
      default_cpt_code TEXT,
      insurance_payer TEXT,
      insurance_member_id TEXT,
      insurance_group TEXT,
      referring_physician TEXT,
      referring_npi TEXT,
      status TEXT DEFAULT 'active',
      discipline TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS goals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER REFERENCES clients(id),
      goal_text TEXT NOT NULL,
      goal_type TEXT,
      category TEXT,
      status TEXT DEFAULT 'active',
      target_date TEXT,
      met_date TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS evaluations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER REFERENCES clients(id),
      eval_date TEXT NOT NULL,
      discipline TEXT,
      content TEXT,
      signed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS notes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER REFERENCES clients(id),
      date_of_service TEXT NOT NULL,
      time_in TEXT,
      time_out TEXT,
      units REAL,
      cpt_code TEXT,
      subjective TEXT,
      objective TEXT,
      assessment TEXT,
      plan TEXT,
      goals_addressed TEXT DEFAULT '[]',
      signed_at DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS appointments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER REFERENCES clients(id),
      scheduled_date TEXT NOT NULL,
      scheduled_time TEXT,
      duration_minutes INTEGER DEFAULT 60,
      status TEXT DEFAULT 'scheduled',
      note_id INTEGER REFERENCES notes(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS note_bank (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discipline TEXT,
      category TEXT,
      section TEXT,
      phrase TEXT NOT NULL,
      is_default INTEGER DEFAULT 0,
      is_favorite INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS goals_bank (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      discipline TEXT,
      category TEXT,
      goal_template TEXT NOT NULL,
      is_default INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS client_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      client_id INTEGER REFERENCES clients(id),
      filename TEXT NOT NULL,
      original_name TEXT NOT NULL,
      file_type TEXT,
      file_size INTEGER,
      category TEXT DEFAULT 'general',
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );
  `);
}
