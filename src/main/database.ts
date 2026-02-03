import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import Store from 'electron-store';
import { seedDefaultData, seedPayers, seedFeeSchedule } from './seed';

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
  // V2/V3 billing tables
  'fee_schedule', 'invoices', 'invoice_items', 'payments',
  'payers', 'authorizations', 'claims', 'claim_lines',
  // Audit log
  'audit_log',
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
  // V2/V3 billing seed data (run after migrations create tables)
  seedPayers(db);
  seedFeeSchedule(db);
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
    // V2/V3 Billing Preparation Migrations
    {
      version: 6,
      description: 'Add EDI-ready fields to practice table',
      up: () => {
        if (!columnExists('practice', 'city')) {
          db.exec("ALTER TABLE practice ADD COLUMN city TEXT DEFAULT ''");
        }
        if (!columnExists('practice', 'state')) {
          db.exec("ALTER TABLE practice ADD COLUMN state TEXT DEFAULT ''");
        }
        if (!columnExists('practice', 'zip')) {
          db.exec("ALTER TABLE practice ADD COLUMN zip TEXT DEFAULT ''");
        }
        if (!columnExists('practice', 'taxonomy_code')) {
          db.exec("ALTER TABLE practice ADD COLUMN taxonomy_code TEXT DEFAULT ''");
        }
      },
    },
    {
      version: 7,
      description: 'Add EDI-ready fields to clients table',
      up: () => {
        // Gender for 837P DMG segment
        if (!columnExists('clients', 'gender')) {
          db.exec("ALTER TABLE clients ADD COLUMN gender TEXT DEFAULT ''");
        }
        // Structured address for 837P N3/N4 segments
        if (!columnExists('clients', 'city')) {
          db.exec("ALTER TABLE clients ADD COLUMN city TEXT DEFAULT ''");
        }
        if (!columnExists('clients', 'state')) {
          db.exec("ALTER TABLE clients ADD COLUMN state TEXT DEFAULT ''");
        }
        if (!columnExists('clients', 'zip')) {
          db.exec("ALTER TABLE clients ADD COLUMN zip TEXT DEFAULT ''");
        }
        // EDI Payer ID (Loop 2010BB)
        if (!columnExists('clients', 'insurance_payer_id')) {
          db.exec("ALTER TABLE clients ADD COLUMN insurance_payer_id TEXT DEFAULT ''");
        }
        // Subscriber relationship code (SBR segment) - 18=Self
        if (!columnExists('clients', 'subscriber_relationship')) {
          db.exec("ALTER TABLE clients ADD COLUMN subscriber_relationship TEXT DEFAULT '18'");
        }
        // Subscriber info when patient is not the subscriber
        if (!columnExists('clients', 'subscriber_first_name')) {
          db.exec("ALTER TABLE clients ADD COLUMN subscriber_first_name TEXT DEFAULT ''");
        }
        if (!columnExists('clients', 'subscriber_last_name')) {
          db.exec("ALTER TABLE clients ADD COLUMN subscriber_last_name TEXT DEFAULT ''");
        }
        if (!columnExists('clients', 'subscriber_dob')) {
          db.exec("ALTER TABLE clients ADD COLUMN subscriber_dob TEXT DEFAULT ''");
        }
        // Referral tracking
        if (!columnExists('clients', 'referral_source')) {
          db.exec("ALTER TABLE clients ADD COLUMN referral_source TEXT DEFAULT ''");
        }
        // Stripe customer ID for payments
        if (!columnExists('clients', 'stripe_customer_id')) {
          db.exec("ALTER TABLE clients ADD COLUMN stripe_customer_id TEXT DEFAULT ''");
        }
      },
    },
    {
      version: 8,
      description: 'Add EDI-ready fields to notes table',
      up: () => {
        // CPT modifiers (SV1 segment) - JSON array like ["GN", "59"]
        if (!columnExists('notes', 'cpt_modifiers')) {
          db.exec("ALTER TABLE notes ADD COLUMN cpt_modifiers TEXT DEFAULT '[]'");
        }
        // Charge amount per service
        if (!columnExists('notes', 'charge_amount')) {
          db.exec("ALTER TABLE notes ADD COLUMN charge_amount REAL DEFAULT 0");
        }
        // Place of service code (11=Office, 12=Home, 02=Telehealth)
        if (!columnExists('notes', 'place_of_service')) {
          db.exec("ALTER TABLE notes ADD COLUMN place_of_service TEXT DEFAULT '11'");
        }
        // Diagnosis pointers - JSON array like [1] or [1,2]
        if (!columnExists('notes', 'diagnosis_pointers')) {
          db.exec("ALTER TABLE notes ADD COLUMN diagnosis_pointers TEXT DEFAULT '[1]'");
        }
        // Rendering provider NPI (if different from billing provider)
        if (!columnExists('notes', 'rendering_provider_npi')) {
          db.exec("ALTER TABLE notes ADD COLUMN rendering_provider_npi TEXT DEFAULT ''");
        }
      },
    },
    {
      version: 9,
      description: 'Add cancellation tracking to appointments',
      up: () => {
        if (!columnExists('appointments', 'cancelled_at')) {
          db.exec("ALTER TABLE appointments ADD COLUMN cancelled_at DATETIME DEFAULT NULL");
        }
        if (!columnExists('appointments', 'cancellation_reason')) {
          db.exec("ALTER TABLE appointments ADD COLUMN cancellation_reason TEXT DEFAULT ''");
        }
        if (!columnExists('appointments', 'late_cancel')) {
          db.exec("ALTER TABLE appointments ADD COLUMN late_cancel INTEGER DEFAULT 0");
        }
      },
    },
    {
      version: 10,
      description: 'Add user ID fields for future multi-provider support',
      up: () => {
        // These are nullable - will be populated in V4 when users table exists
        if (!columnExists('clients', 'assigned_user_id')) {
          db.exec("ALTER TABLE clients ADD COLUMN assigned_user_id INTEGER DEFAULT NULL");
        }
        if (!columnExists('notes', 'created_by_user_id')) {
          db.exec("ALTER TABLE notes ADD COLUMN created_by_user_id INTEGER DEFAULT NULL");
        }
        if (!columnExists('evaluations', 'created_by_user_id')) {
          db.exec("ALTER TABLE evaluations ADD COLUMN created_by_user_id INTEGER DEFAULT NULL");
        }
        if (!columnExists('goals', 'created_by_user_id')) {
          db.exec("ALTER TABLE goals ADD COLUMN created_by_user_id INTEGER DEFAULT NULL");
        }
        if (!columnExists('appointments', 'user_id')) {
          db.exec("ALTER TABLE appointments ADD COLUMN user_id INTEGER DEFAULT NULL");
        }
      },
    },
    {
      version: 11,
      description: 'Add billing tables for V2',
      up: () => {
        // Fee schedule
        db.exec(`
          CREATE TABLE IF NOT EXISTS fee_schedule (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            cpt_code TEXT NOT NULL,
            description TEXT,
            default_units REAL DEFAULT 1,
            amount REAL NOT NULL,
            effective_date TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME DEFAULT NULL
          )
        `);

        // Invoices
        db.exec(`
          CREATE TABLE IF NOT EXISTS invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER REFERENCES clients(id),
            invoice_number TEXT,
            invoice_date TEXT NOT NULL,
            due_date TEXT,
            subtotal REAL DEFAULT 0,
            discount_amount REAL DEFAULT 0,
            total_amount REAL DEFAULT 0,
            status TEXT DEFAULT 'draft',
            notes TEXT,
            stripe_invoice_id TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME DEFAULT NULL
          )
        `);

        // Invoice line items
        db.exec(`
          CREATE TABLE IF NOT EXISTS invoice_items (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            invoice_id INTEGER REFERENCES invoices(id),
            note_id INTEGER REFERENCES notes(id),
            description TEXT,
            cpt_code TEXT,
            service_date TEXT,
            units REAL DEFAULT 1,
            unit_price REAL DEFAULT 0,
            amount REAL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Payments
        db.exec(`
          CREATE TABLE IF NOT EXISTS payments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER REFERENCES clients(id),
            invoice_id INTEGER REFERENCES invoices(id),
            payment_date TEXT NOT NULL,
            amount REAL NOT NULL,
            payment_method TEXT,
            reference_number TEXT,
            stripe_payment_intent_id TEXT,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME DEFAULT NULL
          )
        `);
      },
    },
    {
      version: 12,
      description: 'Add insurance billing tables for V3',
      up: () => {
        // Payers reference table
        db.exec(`
          CREATE TABLE IF NOT EXISTS payers (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            edi_payer_id TEXT,
            clearinghouse TEXT DEFAULT '',
            enrollment_required INTEGER DEFAULT 1,
            enrollment_status TEXT DEFAULT 'not_started',
            enrollment_date TEXT,
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Authorizations
        db.exec(`
          CREATE TABLE IF NOT EXISTS authorizations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER REFERENCES clients(id),
            payer_name TEXT,
            payer_id TEXT,
            auth_number TEXT NOT NULL,
            start_date TEXT,
            end_date TEXT,
            units_approved INTEGER DEFAULT 0,
            units_used INTEGER DEFAULT 0,
            cpt_codes TEXT DEFAULT '[]',
            status TEXT DEFAULT 'active',
            notes TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME DEFAULT NULL
          )
        `);

        // Claims
        db.exec(`
          CREATE TABLE IF NOT EXISTS claims (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER REFERENCES clients(id),
            claim_number TEXT,
            clearinghouse_claim_id TEXT,
            payer_claim_number TEXT,
            payer_name TEXT,
            payer_id TEXT,
            service_date_start TEXT,
            service_date_end TEXT,
            total_charge REAL DEFAULT 0,
            status TEXT DEFAULT 'draft',
            submitted_at DATETIME,
            accepted_at DATETIME,
            paid_at DATETIME,
            rejection_codes TEXT DEFAULT '[]',
            rejection_reasons TEXT DEFAULT '[]',
            paid_amount REAL DEFAULT 0,
            adjustment_amount REAL DEFAULT 0,
            patient_responsibility REAL DEFAULT 0,
            era_id INTEGER,
            edi_837_content TEXT,
            edi_835_content TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME DEFAULT NULL
          )
        `);

        // Claim line items
        db.exec(`
          CREATE TABLE IF NOT EXISTS claim_lines (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            claim_id INTEGER REFERENCES claims(id),
            note_id INTEGER REFERENCES notes(id),
            line_number INTEGER,
            service_date TEXT,
            cpt_code TEXT,
            modifiers TEXT DEFAULT '[]',
            units REAL DEFAULT 1,
            charge_amount REAL DEFAULT 0,
            diagnosis_pointers TEXT DEFAULT '[1]',
            place_of_service TEXT DEFAULT '11',
            paid_amount REAL DEFAULT 0,
            adjustment_amount REAL DEFAULT 0,
            adjustment_reason_codes TEXT DEFAULT '[]',
            patient_responsibility REAL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);
      },
    },
    {
      version: 13,
      description: 'Add audit log table for billing transactions',
      up: () => {
        db.exec(`
          CREATE TABLE IF NOT EXISTS audit_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_type TEXT NOT NULL,
            entity_id INTEGER,
            action TEXT NOT NULL,
            old_values TEXT,
            new_values TEXT,
            user_id INTEGER,
            client_id INTEGER,
            amount REAL,
            description TEXT,
            ip_address TEXT,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);
      },
    },
    {
      version: 14,
      description: 'Add Stripe payment link columns for invoices',
      up: () => {
        // Add payment link tracking to invoices
        db.exec(`
          ALTER TABLE invoices ADD COLUMN stripe_payment_link_id TEXT DEFAULT '';
        `);
        db.exec(`
          ALTER TABLE invoices ADD COLUMN stripe_payment_link_url TEXT DEFAULT '';
        `);
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

  // V2/V3 billing table indexes (run after migrations create tables)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_fee_schedule_cpt_code ON fee_schedule(cpt_code);
    CREATE INDEX IF NOT EXISTS idx_fee_schedule_deleted_at ON fee_schedule(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_invoices_client_id ON invoices(client_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(status);
    CREATE INDEX IF NOT EXISTS idx_invoices_invoice_date ON invoices(invoice_date);
    CREATE INDEX IF NOT EXISTS idx_invoices_deleted_at ON invoices(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_invoice_items_invoice_id ON invoice_items(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_invoice_items_note_id ON invoice_items(note_id);
    CREATE INDEX IF NOT EXISTS idx_payments_client_id ON payments(client_id);
    CREATE INDEX IF NOT EXISTS idx_payments_invoice_id ON payments(invoice_id);
    CREATE INDEX IF NOT EXISTS idx_payments_deleted_at ON payments(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_authorizations_client_id ON authorizations(client_id);
    CREATE INDEX IF NOT EXISTS idx_authorizations_status ON authorizations(status);
    CREATE INDEX IF NOT EXISTS idx_authorizations_deleted_at ON authorizations(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_claims_client_id ON claims(client_id);
    CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status);
    CREATE INDEX IF NOT EXISTS idx_claims_deleted_at ON claims(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_claim_lines_claim_id ON claim_lines(claim_id);
    CREATE INDEX IF NOT EXISTS idx_claim_lines_note_id ON claim_lines(note_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_entity_type ON audit_log(entity_type);
    CREATE INDEX IF NOT EXISTS idx_audit_log_entity_id ON audit_log(entity_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_client_id ON audit_log(client_id);
    CREATE INDEX IF NOT EXISTS idx_audit_log_created_at ON audit_log(created_at);
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
