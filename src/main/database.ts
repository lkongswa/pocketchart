import Database from 'better-sqlite3';
// V2: Using better-sqlite3 for plaintext mode. @journeyapps/sqlcipher is kept as a dependency
// for future encryption re-enablement but is not used in V2.
// Alias for compatibility with existing code that references SqlcipherDatabase
const SqlcipherDatabase = Database;
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { app } from 'electron';
import Store from 'electron-store';
import { seedDefaultData, seedDefaultQuickChips, seedPayers, seedFeeSchedule, seedMFTData, seedCategoryAlignedPhrases, autoFixFeeSchedule } from './seed';

let db: InstanceType<typeof Database>;

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
  'client_documents', 'pattern_overrides',
  // V2/V3 billing tables
  'fee_schedule', 'invoices', 'invoice_items', 'payments',
  // Dashboard workspace tables
  'dashboard_notes', 'dashboard_todos', 'calendar_blocks', 'quick_links',
  'payers', 'authorizations', 'claims', 'claim_lines',
  // Audit log
  'audit_log',
  // V2 Pro tables
  'contracted_entities', 'entity_fee_schedules', 'entity_documents',
  'vault_documents', 'compliance_tracking', 'mileage_log', 'communication_log',
  // V5 Progress Report tables
  'staged_goals', 'progress_report_goals',
  // Discount system
  'client_discounts', 'discount_templates',
  // V6 Amendments
  'note_amendments',
  // Dashboard workspace
  'dashboard_notes', 'dashboard_todos',
  'custom_patterns',
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

export function getDatabase(): InstanceType<typeof Database> {
  if (!db) {
    throw new Error('Database not initialized. Call initDatabase first.');
  }
  return db;
}

/** Flush WAL and close database cleanly. Safe to call multiple times. */
export function closeDatabase(): void {
  if (!db) return;
  try {
    db.pragma('wal_checkpoint(TRUNCATE)');
  } catch (_) { /* already closed or no WAL */ }
  try {
    db.close();
  } catch (_) { /* already closed */ }
}

/**
 * Initialize the database connection. If masterKeyHex is provided, the database
 * is opened with SQLCipher encryption using that key as the PRAGMA key.
 *
 * @param masterKeyHex - Optional 64-char hex string (32 bytes) for SQLCipher encryption.
 *                       If omitted, the database is opened without encryption (legacy/migration).
 */
export function initDatabase(masterKeyHex?: string): void {
  const dataDir = getDataPath();
  const dbPath = path.join(dataDir, 'pocketchart.db');
  db = new SqlcipherDatabase(dbPath);

  // If an encryption key is provided, set it BEFORE any other operations.
  // SQLCipher requires the key pragma to be the very first statement.
  if (masterKeyHex) {
    db.pragma(`key = "x'${masterKeyHex}'"`);
  }

  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');

  createTables();
  runMigrations();
  createIndexes();
  seedDefaultData(db);
  seedDefaultQuickChips(db);
  seedMFTData(db);
  seedCategoryAlignedPhrases(db);
  // V2/V3 billing seed data (run after migrations create tables)
  seedPayers(db);
  seedFeeSchedule(db);
  autoFixFeeSchedule(db);
}

/**
 * Check whether the database file on disk is encrypted (SQLCipher) or plaintext.
 * Returns false if the database file doesn't exist yet (fresh install).
 */
export function isDatabaseEncrypted(): boolean {
  const dbPath = path.join(getDataPath(), 'pocketchart.db');
  if (!fs.existsSync(dbPath)) return false;

  // Read the first 16 bytes of the file. An unencrypted SQLite database
  // starts with the magic string "SQLite format 3\0". An encrypted file
  // will have random bytes instead.
  try {
    const fd = fs.openSync(dbPath, 'r');
    const header = Buffer.alloc(16);
    fs.readSync(fd, header, 0, 16, 0);
    fs.closeSync(fd);
    return header.toString('utf8', 0, 15) !== 'SQLite format 3';
  } catch {
    return false;
  }
}

/**
 * Check whether a database file exists at the configured data path.
 */
export function databaseFileExists(): boolean {
  const dbPath = path.join(getDataPath(), 'pocketchart.db');
  return fs.existsSync(dbPath);
}

/**
 * Migrate an existing unencrypted database to an encrypted one.
 * Uses SQLCipher's ATTACH + sqlcipher_export pattern.
 *
 * 1. Opens the plaintext DB
 * 2. ATTACHes a new encrypted DB file
 * 3. Exports all data into the encrypted copy
 * 4. Secure-deletes the original plaintext file
 * 5. Renames the encrypted file to the original path
 *
 * @param masterKeyHex - The 64-char hex key for the new encrypted database
 */
export function migrateToEncrypted(masterKeyHex: string): void {
  const dbPath = path.join(getDataPath(), 'pocketchart.db');
  const tempPath = dbPath + '.encrypting';

  // Close the current DB connection if one exists
  closeDatabase();

  // 1. Open existing plaintext DB without encryption key
  const plainDb = new SqlcipherDatabase(dbPath);

  // 2. Attach a new encrypted database
  plainDb.exec(`ATTACH DATABASE '${tempPath.replace(/'/g, "''")}' AS encrypted KEY "x'${masterKeyHex}'"`);

  // 3. Export all data from main to encrypted
  plainDb.exec("SELECT sqlcipher_export('encrypted')");

  // 4. Set WAL mode on the encrypted DB
  plainDb.exec("PRAGMA encrypted.journal_mode = WAL");

  // 5. Detach and close
  plainDb.exec("DETACH DATABASE encrypted");
  plainDb.close();

  // 6. Secure-delete the original plaintext file (overwrite with random data)
  try {
    const fileSize = fs.statSync(dbPath).size;
    const randomData = crypto.randomBytes(Math.min(fileSize, 64 * 1024 * 1024)); // Cap at 64MB per write
    let offset = 0;
    const fd = fs.openSync(dbPath, 'w');
    while (offset < fileSize) {
      const chunk = offset + randomData.length > fileSize
        ? randomData.subarray(0, fileSize - offset)
        : randomData;
      fs.writeSync(fd, chunk, 0, chunk.length, offset);
      offset += chunk.length;
    }
    fs.closeSync(fd);
  } catch (err) {
    console.error('Warning: could not securely overwrite plaintext DB:', err);
  }
  fs.unlinkSync(dbPath);

  // 7. Clean up WAL/SHM files from the old plaintext DB
  for (const ext of ['-wal', '-shm']) {
    const f = dbPath + ext;
    if (fs.existsSync(f)) {
      try { fs.unlinkSync(f); } catch { /* ignore */ }
    }
  }

  // 8. Rename encrypted file to the original path
  fs.renameSync(tempPath, dbPath);

  // Clean up temp WAL/SHM if any
  for (const ext of ['-wal', '-shm']) {
    const f = tempPath + ext;
    if (fs.existsSync(f)) {
      try { fs.unlinkSync(f); } catch { /* ignore */ }
    }
  }
}

/**
 * Decrypt an encrypted database back to plaintext.
 * This is the reverse of migrateToEncrypted():
 * 1. Opens the encrypted DB with the master key
 * 2. Attaches a new plaintext database (no key)
 * 3. Exports all data into the plaintext copy
 * 4. Replaces the encrypted file with the plaintext one
 *
 * Used when bypassing encryption for V2 launch while preserving existing data.
 *
 * @param masterKeyHex - The 64-char hex key for the current encrypted database
 */
export function decryptToPlaintext(masterKeyHex: string): void {
  const dbPath = path.join(getDataPath(), 'pocketchart.db');
  const tempPath = dbPath + '.decrypting';

  // Close the current DB connection if one exists
  closeDatabase();

  // 1. Open the encrypted DB with the key
  const encDb = new SqlcipherDatabase(dbPath);
  encDb.pragma(`key = "x'${masterKeyHex}'"`);

  // Verify the DB is readable (will throw "file is not a database" if key is wrong)
  try {
    encDb.pragma('quick_check');
  } catch (err: any) {
    encDb.close();
    throw new Error('Failed to decrypt database — incorrect key or corrupt file: ' + err.message);
  }

  // 2. Attach a new plaintext database (empty key = no encryption)
  encDb.exec(`ATTACH DATABASE '${tempPath.replace(/'/g, "''")}' AS plaintext KEY ''`);

  // 3. Export all data from encrypted to plaintext
  encDb.exec("SELECT sqlcipher_export('plaintext')");

  // 4. Set WAL mode on the plaintext DB
  encDb.exec("PRAGMA plaintext.journal_mode = WAL");

  // 5. Detach and close
  encDb.exec("DETACH DATABASE plaintext");
  encDb.close();

  // Verify the plaintext file was actually created
  if (!fs.existsSync(tempPath)) {
    throw new Error('Decryption export failed — plaintext file was not created');
  }

  // 6. Remove the old encrypted file
  fs.unlinkSync(dbPath);

  // 7. Clean up WAL/SHM files from the old encrypted DB
  for (const ext of ['-wal', '-shm']) {
    const f = dbPath + ext;
    if (fs.existsSync(f)) {
      try { fs.unlinkSync(f); } catch { /* ignore */ }
    }
  }

  // 8. Rename plaintext file to the original path
  fs.renameSync(tempPath, dbPath);

  // Clean up temp WAL/SHM if any
  for (const ext of ['-wal', '-shm']) {
    const f = tempPath + ext;
    if (fs.existsSync(f)) {
      try { fs.unlinkSync(f); } catch { /* ignore */ }
    }
  }
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
          db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)").run('app_tier', 'unlicensed');
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
    {
      version: 15,
      description: 'V2 Pro: Contractor module, Professional Vault, Compliance Engine, Mileage, Communication Log',
      up: () => {
        // ── New Tables ──

        // Contracted Entities
        db.exec(`
          CREATE TABLE IF NOT EXISTS contracted_entities (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            contact_name TEXT DEFAULT '',
            contact_email TEXT DEFAULT '',
            contact_phone TEXT DEFAULT '',
            billing_address_street TEXT DEFAULT '',
            billing_address_city TEXT DEFAULT '',
            billing_address_state TEXT DEFAULT '',
            billing_address_zip TEXT DEFAULT '',
            default_note_type TEXT DEFAULT 'soap',
            notes TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME DEFAULT NULL
          )
        `);

        // Entity Fee Schedules
        db.exec(`
          CREATE TABLE IF NOT EXISTS entity_fee_schedules (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_id INTEGER NOT NULL REFERENCES contracted_entities(id),
            service_type TEXT NOT NULL,
            description TEXT DEFAULT '',
            default_rate REAL NOT NULL,
            unit TEXT DEFAULT 'per_visit',
            effective_date TEXT DEFAULT '',
            notes TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME DEFAULT NULL
          )
        `);

        // Entity Documents
        db.exec(`
          CREATE TABLE IF NOT EXISTS entity_documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            entity_id INTEGER NOT NULL REFERENCES contracted_entities(id),
            filename TEXT NOT NULL,
            original_name TEXT NOT NULL DEFAULT '',
            file_path TEXT NOT NULL,
            category TEXT DEFAULT 'other',
            expiration_date TEXT DEFAULT NULL,
            notes TEXT DEFAULT '',
            uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME DEFAULT NULL
          )
        `);

        // Professional Vault
        db.exec(`
          CREATE TABLE IF NOT EXISTS vault_documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_type TEXT NOT NULL,
            custom_label TEXT DEFAULT NULL,
            filename TEXT NOT NULL,
            original_name TEXT NOT NULL DEFAULT '',
            file_path TEXT NOT NULL,
            issue_date TEXT DEFAULT NULL,
            expiration_date TEXT DEFAULT NULL,
            reminder_days_before INTEGER DEFAULT 60,
            notes TEXT DEFAULT '',
            uploaded_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME DEFAULT NULL
          )
        `);

        // Compliance Tracking (per-client)
        db.exec(`
          CREATE TABLE IF NOT EXISTS compliance_tracking (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER NOT NULL REFERENCES clients(id),
            tracking_enabled INTEGER DEFAULT 1,
            compliance_preset TEXT DEFAULT 'medicare',
            progress_visit_threshold INTEGER DEFAULT 10,
            progress_day_threshold INTEGER DEFAULT 30,
            recert_day_threshold INTEGER DEFAULT 90,
            visits_since_last_progress INTEGER DEFAULT 0,
            last_progress_date TEXT DEFAULT NULL,
            last_recert_date TEXT DEFAULT NULL,
            next_progress_due TEXT DEFAULT NULL,
            next_recert_due TEXT DEFAULT NULL,
            recert_md_signature_received INTEGER DEFAULT 0,
            physician_order_required INTEGER DEFAULT 0,
            physician_order_expiration TEXT DEFAULT NULL,
            physician_order_document_id INTEGER DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Mileage Log
        db.exec(`
          CREATE TABLE IF NOT EXISTS mileage_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            date TEXT NOT NULL,
            appointment_id INTEGER REFERENCES appointments(id),
            client_id INTEGER REFERENCES clients(id),
            entity_id INTEGER REFERENCES contracted_entities(id),
            origin_address TEXT DEFAULT '',
            destination_address TEXT DEFAULT '',
            miles REAL NOT NULL,
            reimbursement_rate REAL DEFAULT NULL,
            reimbursement_amount REAL DEFAULT NULL,
            is_reimbursable INTEGER DEFAULT 1,
            notes TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME DEFAULT NULL
          )
        `);

        // Communication Log
        db.exec(`
          CREATE TABLE IF NOT EXISTS communication_log (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER NOT NULL REFERENCES clients(id),
            entity_id INTEGER REFERENCES contracted_entities(id),
            communication_date DATETIME DEFAULT CURRENT_TIMESTAMP,
            type TEXT NOT NULL,
            direction TEXT NOT NULL,
            contact_name TEXT DEFAULT '',
            summary TEXT NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME DEFAULT NULL
          )
        `);

        // ── Column additions to existing tables ──

        // Notes: contractor + frequency/duration + note_type
        if (!columnExists('notes', 'entity_id')) {
          db.exec("ALTER TABLE notes ADD COLUMN entity_id INTEGER DEFAULT NULL REFERENCES contracted_entities(id)");
        }
        if (!columnExists('notes', 'rate_override')) {
          db.exec("ALTER TABLE notes ADD COLUMN rate_override REAL DEFAULT NULL");
        }
        if (!columnExists('notes', 'rate_override_reason')) {
          db.exec("ALTER TABLE notes ADD COLUMN rate_override_reason TEXT DEFAULT ''");
        }
        if (!columnExists('notes', 'frequency_per_week')) {
          db.exec("ALTER TABLE notes ADD COLUMN frequency_per_week INTEGER DEFAULT NULL");
        }
        if (!columnExists('notes', 'duration_weeks')) {
          db.exec("ALTER TABLE notes ADD COLUMN duration_weeks INTEGER DEFAULT NULL");
        }
        if (!columnExists('notes', 'frequency_notes')) {
          db.exec("ALTER TABLE notes ADD COLUMN frequency_notes TEXT DEFAULT ''");
        }
        if (!columnExists('notes', 'note_type')) {
          db.exec("ALTER TABLE notes ADD COLUMN note_type TEXT DEFAULT 'soap'");
        }

        // Appointments: contractor fields
        if (!columnExists('appointments', 'entity_id')) {
          db.exec("ALTER TABLE appointments ADD COLUMN entity_id INTEGER DEFAULT NULL REFERENCES contracted_entities(id)");
        }
        if (!columnExists('appointments', 'entity_rate')) {
          db.exec("ALTER TABLE appointments ADD COLUMN entity_rate REAL DEFAULT NULL");
        }
        if (!columnExists('appointments', 'rate_override_reason')) {
          db.exec("ALTER TABLE appointments ADD COLUMN rate_override_reason TEXT DEFAULT ''");
        }

        // Invoices: entity link
        if (!columnExists('invoices', 'entity_id')) {
          db.exec("ALTER TABLE invoices ADD COLUMN entity_id INTEGER DEFAULT NULL REFERENCES contracted_entities(id)");
        }

        // Authorizations: entity link
        if (!columnExists('authorizations', 'entity_id')) {
          db.exec("ALTER TABLE authorizations ADD COLUMN entity_id INTEGER DEFAULT NULL REFERENCES contracted_entities(id)");
        }
      },
    },
    {
      version: 16,
      description: 'Invoice enhancements, entity fee CPT codes, patient name, cancel/no-show fees',
      up: () => {
        // Invoice number unique index
        db.exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_invoices_invoice_number ON invoices(invoice_number)");

        // Entity fee schedule: add CPT code
        if (!columnExists('entity_fee_schedules', 'cpt_code')) {
          db.exec("ALTER TABLE entity_fee_schedules ADD COLUMN cpt_code TEXT DEFAULT ''");
        }

        // Patient name on appointments and notes (for agency work)
        if (!columnExists('appointments', 'patient_name')) {
          db.exec("ALTER TABLE appointments ADD COLUMN patient_name TEXT DEFAULT ''");
        }
        if (!columnExists('notes', 'patient_name')) {
          db.exec("ALTER TABLE notes ADD COLUMN patient_name TEXT DEFAULT ''");
        }
      },
    },
    {
      version: 17,
      description: 'Expand client_documents with structured categories and certification metadata',
      up: () => {
        // Add certification period tracking
        if (!columnExists('client_documents', 'certification_period_start')) {
          db.exec("ALTER TABLE client_documents ADD COLUMN certification_period_start TEXT DEFAULT ''");
        }
        if (!columnExists('client_documents', 'certification_period_end')) {
          db.exec("ALTER TABLE client_documents ADD COLUMN certification_period_end TEXT DEFAULT ''");
        }
        // When the document was received back (e.g., signed POC returned)
        if (!columnExists('client_documents', 'received_date')) {
          db.exec("ALTER TABLE client_documents ADD COLUMN received_date TEXT DEFAULT ''");
        }
        // When the document was originally sent out
        if (!columnExists('client_documents', 'sent_date')) {
          db.exec("ALTER TABLE client_documents ADD COLUMN sent_date TEXT DEFAULT ''");
        }
        // Who signed it (for physician orders/POCs)
        if (!columnExists('client_documents', 'physician_name')) {
          db.exec("ALTER TABLE client_documents ADD COLUMN physician_name TEXT DEFAULT ''");
        }
        // Future fax integration link
        if (!columnExists('client_documents', 'fax_confirmation_id')) {
          db.exec("ALTER TABLE client_documents ADD COLUMN fax_confirmation_id TEXT DEFAULT ''");
        }

        // Migrate existing categories to new structured values
        db.exec(`
          UPDATE client_documents SET category = 'physician_order'
          WHERE category IN ('referral', 'prescription', 'Referral', 'Prescription')
          AND deleted_at IS NULL
        `);
        db.exec(`
          UPDATE client_documents SET category = 'intake_form'
          WHERE category IN ('intake', 'Intake Form', 'intake_form')
          AND deleted_at IS NULL
        `);
        // Leave 'general' and 'other' as 'other'
        db.exec(`
          UPDATE client_documents SET category = 'other'
          WHERE category IN ('general', 'General', '')
          AND deleted_at IS NULL
        `);
        // Map insurance and medical_records to appropriate new categories
        db.exec(`
          UPDATE client_documents SET category = 'prior_authorization'
          WHERE category IN ('insurance', 'Insurance')
          AND deleted_at IS NULL
        `);
        db.exec(`
          UPDATE client_documents SET category = 'correspondence'
          WHERE category IN ('medical_records', 'Medical Records')
          AND deleted_at IS NULL
        `);
      },
    },
    {
      version: 18,
      description: 'Add eval_type column to evaluations',
      up: () => {
        // Add eval_type column for initial/reassessment/discharge tracking
        const cols = db.prepare("PRAGMA table_info('evaluations')").all() as any[];
        if (!cols.find((c: any) => c.name === 'eval_type')) {
          db.exec("ALTER TABLE evaluations ADD COLUMN eval_type TEXT DEFAULT 'initial'");
        }
      },
    },
    {
      version: 19,
      description: 'Normalize goals_bank categories to match UI display names',
      up: () => {
        // Map old seed category names → CATEGORY_OPTIONS display names
        const renames: [string, string][] = [
          // PT
          ['mobility', 'Mobility'], ['strength', 'Strength'], ['balance', 'Balance'],
          ['pain', 'Pain Management'], ['function', 'Functional Activity'], ['transfers', 'Transfers'],
          // OT
          ['ADL', 'ADLs'], ['IADL', 'ADLs'], ['hand_function', 'Fine Motor'],
          ['cognition', 'Cognitive'], ['UE_function', 'Upper Extremity'], ['safety', 'Self-Care'],
          // ST
          ['articulation', 'Articulation'], ['language_expression', 'Language Expression'],
          ['language_comprehension', 'Language Comprehension'], ['voice', 'Voice'],
          ['fluency', 'Fluency'], ['swallowing', 'Feeding/Swallowing'],
          // MFT
          ['depression', 'Depression'], ['anxiety', 'Anxiety'], ['trauma', 'Trauma'],
          ['relationship', 'Relationship'], ['family_systems', 'Family Systems'],
          ['coping_skills', 'Coping Skills'], ['self_esteem', 'Self-Esteem'],
          ['grief', 'Grief'], ['behavioral', 'Behavioral'],
        ];
        const stmt = db.prepare('UPDATE goals_bank SET category = ? WHERE category = ?');
        for (const [oldCat, newCat] of renames) {
          stmt.run(newCat, oldCat);
        }
        // Also normalize in goals table
        const stmtGoals = db.prepare('UPDATE goals SET category = ? WHERE category = ?');
        for (const [oldCat, newCat] of renames) {
          stmtGoals.run(newCat, oldCat);
        }
      },
    },
    {
      version: 20,
      description: 'Add staged_goals, progress_report_goals tables, visit_type and progress_report_data columns',
      up: () => {
        // 1. staged_goals table
        db.exec(`
          CREATE TABLE IF NOT EXISTS staged_goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER NOT NULL REFERENCES clients(id),
            goal_text TEXT NOT NULL DEFAULT '',
            goal_type TEXT NOT NULL DEFAULT 'STG',
            category TEXT NOT NULL DEFAULT '',
            rationale TEXT NOT NULL DEFAULT '',
            flagged_at TEXT NOT NULL DEFAULT (datetime('now')),
            flagged_from_note_id INTEGER REFERENCES notes(id),
            status TEXT NOT NULL DEFAULT 'staged',
            promoted_at TEXT,
            promoted_in_note_id INTEGER REFERENCES notes(id),
            promoted_to_goal_id INTEGER REFERENCES goals(id),
            dismissed_at TEXT,
            dismiss_reason TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            deleted_at TEXT
          )
        `);

        // 2. progress_report_goals table
        db.exec(`
          CREATE TABLE IF NOT EXISTS progress_report_goals (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            note_id INTEGER NOT NULL REFERENCES notes(id),
            goal_id INTEGER NOT NULL REFERENCES goals(id),
            status_at_report TEXT NOT NULL DEFAULT 'progressing',
            performance_data TEXT NOT NULL DEFAULT '',
            clinical_notes TEXT NOT NULL DEFAULT '',
            goal_text_snapshot TEXT NOT NULL DEFAULT '',
            is_new_goal INTEGER NOT NULL DEFAULT 0,
            is_staged_promotion INTEGER NOT NULL DEFAULT 0,
            staged_goal_id INTEGER REFERENCES staged_goals(id),
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            deleted_at TEXT
          )
        `);

        // 3. notes.progress_report_data column
        if (!columnExists('notes', 'progress_report_data')) {
          db.exec("ALTER TABLE notes ADD COLUMN progress_report_data TEXT DEFAULT ''");
        }

        // 4. appointments.visit_type column
        if (!columnExists('appointments', 'visit_type')) {
          db.exec("ALTER TABLE appointments ADD COLUMN visit_type TEXT DEFAULT 'O'");
        }
      },
    },
    {
      version: 21,
      description: 'Add discharge_data column to notes for discharge summaries',
      up: () => {
        if (!columnExists('notes', 'discharge_data')) {
          db.exec("ALTER TABLE notes ADD COLUMN discharge_data TEXT DEFAULT ''");
        }
      },
    },
    {
      version: 22,
      description: 'Audit trail v2, note amendments, content hashing',
      up: () => {
        // Upgrade audit_log with new columns for clinical audit trail
        if (!columnExists('audit_log', 'timestamp')) {
          db.exec("ALTER TABLE audit_log ADD COLUMN timestamp TEXT NOT NULL DEFAULT (datetime('now'))");
        }
        if (!columnExists('audit_log', 'user_role')) {
          db.exec("ALTER TABLE audit_log ADD COLUMN user_role TEXT NOT NULL DEFAULT 'owner'");
        }
        if (!columnExists('audit_log', 'session_id')) {
          db.exec("ALTER TABLE audit_log ADD COLUMN session_id TEXT");
        }
        if (!columnExists('audit_log', 'action_type')) {
          db.exec("ALTER TABLE audit_log ADD COLUMN action_type TEXT NOT NULL DEFAULT ''");
        }
        if (!columnExists('audit_log', 'detail')) {
          db.exec("ALTER TABLE audit_log ADD COLUMN detail TEXT");
        }
        if (!columnExists('audit_log', 'content_hash')) {
          db.exec("ALTER TABLE audit_log ADD COLUMN content_hash TEXT");
        }
        if (!columnExists('audit_log', 'device_identifier')) {
          db.exec("ALTER TABLE audit_log ADD COLUMN device_identifier TEXT");
        }

        // Note amendments table
        db.exec(`
          CREATE TABLE IF NOT EXISTS note_amendments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            note_id INTEGER NOT NULL REFERENCES notes(id),
            amendment_type TEXT NOT NULL,
            content TEXT NOT NULL,
            original_text TEXT,
            corrected_text TEXT,
            reason TEXT,
            created_at TEXT NOT NULL DEFAULT (datetime('now')),
            signed_at TEXT,
            signature_typed TEXT,
            signature_image TEXT,
            content_hash TEXT
          )
        `);
        db.exec('CREATE INDEX IF NOT EXISTS idx_amendments_note ON note_amendments(note_id)');

        // Content hash columns on notes and evaluations
        if (!columnExists('notes', 'content_hash')) {
          db.exec("ALTER TABLE notes ADD COLUMN content_hash TEXT");
        }
        if (!columnExists('evaluations', 'content_hash')) {
          db.exec("ALTER TABLE evaluations ADD COLUMN content_hash TEXT");
        }

        // Audit log indexes for the new fields
        db.exec('CREATE INDEX IF NOT EXISTS idx_audit_action_type ON audit_log(action_type)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_log(timestamp)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_audit_session ON audit_log(session_id)');
      },
    },
    {
      version: 23,
      description: 'Add client_discounts and discount_templates tables',
      up: () => {
        db.exec(`
          CREATE TABLE IF NOT EXISTS client_discounts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            client_id INTEGER NOT NULL REFERENCES clients(id),
            discount_type TEXT NOT NULL,
            label TEXT NOT NULL DEFAULT '',
            total_sessions INTEGER DEFAULT NULL,
            paid_sessions INTEGER DEFAULT NULL,
            sessions_used INTEGER DEFAULT 0,
            session_rate REAL DEFAULT NULL,
            flat_rate REAL DEFAULT NULL,
            flat_rate_sessions INTEGER DEFAULT NULL,
            flat_rate_sessions_used INTEGER DEFAULT 0,
            discount_percent REAL DEFAULT NULL,
            discount_fixed REAL DEFAULT NULL,
            start_date TEXT DEFAULT NULL,
            end_date TEXT DEFAULT NULL,
            status TEXT NOT NULL DEFAULT 'active',
            notes TEXT DEFAULT '',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME DEFAULT NULL
          )
        `);
        db.exec('CREATE INDEX IF NOT EXISTS idx_client_discounts_client ON client_discounts(client_id)');
        db.exec('CREATE INDEX IF NOT EXISTS idx_client_discounts_status ON client_discounts(status)');

        db.exec(`
          CREATE TABLE IF NOT EXISTS discount_templates (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL,
            discount_type TEXT NOT NULL,
            total_sessions INTEGER DEFAULT NULL,
            paid_sessions INTEGER DEFAULT NULL,
            session_rate REAL DEFAULT NULL,
            flat_rate REAL DEFAULT NULL,
            flat_rate_sessions INTEGER DEFAULT NULL,
            discount_percent REAL DEFAULT NULL,
            discount_fixed REAL DEFAULT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            deleted_at DATETIME DEFAULT NULL
          )
        `);
      },
    },
    {
      version: 24,
      description: 'Add CMS-1500 claim form fields to clients table',
      up: () => {
        // Onset/illness info (Box 14, 15)
        if (!columnExists('clients', 'onset_date')) {
          db.exec("ALTER TABLE clients ADD COLUMN onset_date TEXT DEFAULT ''");
        }
        if (!columnExists('clients', 'onset_qualifier')) {
          db.exec("ALTER TABLE clients ADD COLUMN onset_qualifier TEXT DEFAULT '431'"); // 431=Onset of current symptoms
        }
        // Condition related to (Box 10a, 10b, 10c)
        if (!columnExists('clients', 'employment_related')) {
          db.exec("ALTER TABLE clients ADD COLUMN employment_related TEXT DEFAULT 'N'");
        }
        if (!columnExists('clients', 'auto_accident')) {
          db.exec("ALTER TABLE clients ADD COLUMN auto_accident TEXT DEFAULT 'N'");
        }
        if (!columnExists('clients', 'auto_accident_state')) {
          db.exec("ALTER TABLE clients ADD COLUMN auto_accident_state TEXT DEFAULT ''");
        }
        if (!columnExists('clients', 'other_accident')) {
          db.exec("ALTER TABLE clients ADD COLUMN other_accident TEXT DEFAULT 'N'");
        }
        // Assignment / signatures (Box 12, 13, 27)
        if (!columnExists('clients', 'claim_accept_assignment')) {
          db.exec("ALTER TABLE clients ADD COLUMN claim_accept_assignment TEXT DEFAULT 'Y'");
        }
        if (!columnExists('clients', 'patient_signature_source')) {
          db.exec("ALTER TABLE clients ADD COLUMN patient_signature_source TEXT DEFAULT 'SOF'"); // Signature On File
        }
        if (!columnExists('clients', 'insured_signature_source')) {
          db.exec("ALTER TABLE clients ADD COLUMN insured_signature_source TEXT DEFAULT 'SOF'");
        }
        // Prior authorization (Box 23)
        if (!columnExists('clients', 'prior_auth_number')) {
          db.exec("ALTER TABLE clients ADD COLUMN prior_auth_number TEXT DEFAULT ''");
        }
        // Referring provider qualifier (Box 17a)
        if (!columnExists('clients', 'referring_physician_qualifier')) {
          db.exec("ALTER TABLE clients ADD COLUMN referring_physician_qualifier TEXT DEFAULT 'DN'"); // DN = Referring Provider
        }
        // Additional claim info (Box 19)
        if (!columnExists('clients', 'additional_claim_info')) {
          db.exec("ALTER TABLE clients ADD COLUMN additional_claim_info TEXT DEFAULT ''");
        }
        // Service facility (Box 32)
        if (!columnExists('clients', 'service_facility_name')) {
          db.exec("ALTER TABLE clients ADD COLUMN service_facility_name TEXT DEFAULT ''");
        }
        if (!columnExists('clients', 'service_facility_npi')) {
          db.exec("ALTER TABLE clients ADD COLUMN service_facility_npi TEXT DEFAULT ''");
        }
      },
    },
    {
      version: 25,
      description: 'Add entry_hash column to audit_log for hash chain integrity',
      up: () => {
        if (!columnExists('audit_log', 'entry_hash')) {
          db.exec("ALTER TABLE audit_log ADD COLUMN entry_hash TEXT");
        }
      },
    },
    {
      version: 26,
      description: 'Add source_document_id and source_document_type to goals for established/pending tracking',
      up: () => {
        if (!columnExists('goals', 'source_document_id')) {
          db.exec("ALTER TABLE goals ADD COLUMN source_document_id INTEGER DEFAULT NULL");
        }
        if (!columnExists('goals', 'source_document_type')) {
          db.exec("ALTER TABLE goals ADD COLUMN source_document_type TEXT DEFAULT NULL");
        }

        // Backfill: tag goals created by signed evaluations
        const signedEvals = db.prepare(
          "SELECT id, content FROM evaluations WHERE signed_at IS NOT NULL AND deleted_at IS NULL"
        ).all() as Array<{ id: number; content: string }>;

        const updateGoalSource = db.prepare(
          "UPDATE goals SET source_document_id = ?, source_document_type = 'eval' WHERE id = ? AND source_document_id IS NULL"
        );

        for (const evalRow of signedEvals) {
          try {
            const parsed = JSON.parse(evalRow.content || '{}');
            const goalIds: number[] = parsed.created_goal_ids || [];
            for (const gid of goalIds) {
              if (gid) updateGoalSource.run(evalRow.id, gid);
            }
          } catch { /* skip malformed JSON */ }
        }

        // Backfill: tag goals referenced in signed progress reports
        const signedPRNotes = db.prepare(
          "SELECT id FROM notes WHERE note_type = 'progress_report' AND signed_at IS NOT NULL AND deleted_at IS NULL"
        ).all() as Array<{ id: number }>;

        const updateGoalSourcePR = db.prepare(
          "UPDATE goals SET source_document_id = ?, source_document_type = 'progress_report' WHERE id = ? AND source_document_id IS NULL"
        );

        for (const note of signedPRNotes) {
          const prGoals = db.prepare(
            "SELECT goal_id FROM progress_report_goals WHERE note_id = ? AND deleted_at IS NULL"
          ).all(note.id) as Array<{ goal_id: number }>;
          for (const prg of prGoals) {
            if (prg.goal_id) updateGoalSourcePR.run(note.id, prg.goal_id);
          }
        }

        db.exec("CREATE INDEX IF NOT EXISTS idx_goals_source ON goals(source_document_type, source_document_id)");
      },
    },
    {
      version: 27,
      description: 'Update default goals_bank templates to SMART format (no subject prefix, no timeframe suffix, inline {target}/{baseline})',
      up: () => {
        // Only update default templates (is_default = 1). Custom user templates are untouched.
        const templateUpdates: Array<[string, string]> = [
          // PT
          ['Pt will ambulate ___ ft with ___ device and ___ assist in ___ weeks.', 'ambulate ___ ft with ___ device and ___ assist'],
          ['Pt will ambulate on level surfaces with normalized gait pattern, no device, within ___ weeks.', 'ambulate on level surfaces with normalized gait pattern, no device'],
          ['Pt will navigate stairs with ___ assist and ___ railing in ___ weeks.', 'navigate stairs with ___ assist and ___ railing'],
          ['Pt will perform sit-to-stand from standard height chair with ___ assist in ___ weeks.', 'perform sit-to-stand from standard height chair with ___ assist'],
          ['Pt will demonstrate ___ strength of ___/5 in ___ within ___ weeks.', 'demonstrate ___ strength of ___/5 in ___'],
          ['Pt will improve grip strength to ___lbs bilaterally within ___ weeks.', 'improve grip strength to ___ lbs bilaterally'],
          ['Pt will achieve ___ AROM of ___ degrees within ___ weeks.', 'achieve ___ AROM of ___ degrees'],
          ['Pt will demonstrate functional ROM for ___ within ___ weeks.', 'demonstrate functional ROM for ___'],
          ['Pt will maintain static standing balance for ___ seconds without LOB within ___ weeks.', 'maintain static standing balance for ___ seconds without LOB'],
          ['Pt will achieve Berg Balance Scale score of ___/56 within ___ weeks.', 'achieve Berg Balance Scale score of ___/56'],
          ['Pt will perform dynamic balance activities with ___ LOB in ___ weeks.', 'perform dynamic balance activities with ___ LOB'],
          ['Pt will report pain reduction to ___/10 with functional activities within ___ weeks.', 'report pain reduction to ___/10 with functional activities'],
          ['Pt will independently perform HEP with correct form within ___ weeks.', 'independently perform HEP with correct form'],
          ['Pt will return to ___ (work/sport/activity) without limitations within ___ weeks.', 'return to ___ (work/sport/activity) without limitations'],
          ['Pt will complete bed mobility with ___ assist within ___ weeks.', 'complete bed mobility with ___ assist'],
          ['Pt will perform all transfers with ___ assist within ___ weeks.', 'perform all transfers with ___ assist'],
          // OT
          ['Pt will complete upper body dressing with ___ assist within ___ weeks.', 'complete upper body dressing with ___ assist'],
          ['Pt will complete lower body dressing with ___ assist within ___ weeks.', 'complete lower body dressing with ___ assist'],
          ['Pt will complete grooming tasks with ___ assist within ___ weeks.', 'complete grooming tasks with ___ assist'],
          ['Pt will complete bathing with ___ assist within ___ weeks.', 'complete bathing with ___ assist'],
          ['Pt will independently feed self with ___ setup within ___ weeks.', 'independently feed self with ___ setup'],
          ['Pt will prepare a simple meal with ___ assist within ___ weeks.', 'prepare a simple meal with ___ assist'],
          ['Pt will manage medications with ___ assist within ___ weeks.', 'manage medications with ___ assist'],
          ['Pt will perform light housekeeping with ___ assist within ___ weeks.', 'perform light housekeeping with ___ assist'],
          ['Pt will demonstrate functional grasp/release for ___ tasks within ___ weeks.', 'demonstrate functional grasp/release for ___ tasks'],
          ['Pt will improve fine motor coordination for ___ within ___ weeks.', 'improve fine motor coordination for ___'],
          ['Pt will achieve grip strength of ___lbs for functional tasks within ___ weeks.', 'achieve grip strength of ___ lbs for functional tasks'],
          ['Pt will follow ___-step commands with ___ cues within ___ weeks.', 'follow ___-step commands with ___ cues'],
          ['Pt will demonstrate improved sequencing for ___-step tasks within ___ weeks.', 'demonstrate improved sequencing for ___-step tasks'],
          ['Pt will utilize compensatory strategies for ___ with ___ cues within ___ weeks.', 'utilize compensatory strategies for ___ with ___ cues'],
          ['Pt will achieve functional AROM of ___ for ___ within ___ weeks.', 'achieve functional AROM of ___ for ___'],
          ['Pt will demonstrate safe ___ techniques with ___ cues within ___ weeks.', 'demonstrate safe ___ techniques with ___ cues'],
          // ST
          ['Pt will produce target sounds in ___ position with ___% accuracy at ___ level within ___ weeks.', 'produce target sounds in ___ position with {target} accuracy at ___ level'],
          ['Pt will produce ___% intelligible speech in ___ context within ___ weeks.', 'produce {target} intelligible speech in ___ context'],
          ['Pt will name ___ items in ___ categories with ___% accuracy within ___ weeks.', 'name ___ items in ___ categories with {target} accuracy'],
          ['Pt will produce grammatically correct sentences of ___+ words within ___ weeks.', 'produce grammatically correct sentences of ___+ words'],
          ['Pt will use ___ word retrieval strategies with ___ cues within ___ weeks.', 'use ___ word retrieval strategies with ___ cues'],
          ['Pt will follow ___-step commands with ___% accuracy within ___ weeks.', 'follow ___-step commands with {target} accuracy'],
          ['Pt will answer ___ questions about ___ with ___% accuracy within ___ weeks.', 'answer ___ questions about ___ with {target} accuracy'],
          ['Pt will identify main idea in ___ with ___% accuracy within ___ weeks.', 'identify main idea in ___ with {target} accuracy'],
          ['Pt will demonstrate appropriate vocal quality during ___ tasks within ___ weeks.', 'demonstrate appropriate vocal quality during ___ tasks'],
          ['Pt will maintain adequate breath support for ___ within ___ weeks.', 'maintain adequate breath support for ___'],
          ['Pt will use ___ fluency strategy with ___% success in ___ context within ___ weeks.', 'use ___ fluency strategy with {target} success in ___ context'],
          ['Pt will demonstrate ___% fluent speech in ___ speaking tasks within ___ weeks.', 'demonstrate {target} fluent speech in ___ speaking tasks'],
          ['Pt will safely tolerate ___ consistency with ___ strategy within ___ weeks.', 'safely tolerate ___ consistency with ___ strategy'],
          ['Pt will demonstrate safe swallow with ___ diet with no s/s aspiration within ___ weeks.', 'demonstrate safe swallow with ___ diet with no s/s aspiration'],
          ['Pt will recall ___/5 items after ___ delay with ___ cues within ___ weeks.', 'recall ___/5 items after ___ delay with ___ cues'],
          ['Pt will sustain attention for ___ min on ___ task within ___ weeks.', 'sustain attention for ___ min on ___ task'],
          ['Pt will identify ___/5 safety concerns in functional scenarios within ___ weeks.', 'identify ___/5 safety concerns in functional scenarios'],
          // MFT
          ['Client will report reduction in depressive symptoms to a PHQ-9 score of ___ or below within ___ weeks.', 'report reduction in depressive symptoms to a PHQ-9 score of ___ or below'],
          ['Client will identify ___ positive coping strategies for managing depressive episodes within ___ weeks.', 'identify ___ positive coping strategies for managing depressive episodes'],
          ['Client will engage in ___ pleasurable activities per week as reported in session within ___ weeks.', 'engage in ___ pleasurable activities per week as reported in session'],
          ['Client will report reduction in anxiety symptoms to a GAD-7 score of ___ or below within ___ weeks.', 'report reduction in anxiety symptoms to a GAD-7 score of ___ or below'],
          ['Client will demonstrate use of ___ anxiety management techniques in daily life within ___ weeks.', 'demonstrate use of ___ anxiety management techniques in daily life'],
          ['Client will reduce avoidance behaviors related to ___ as evidenced by ___ within ___ weeks.', 'reduce avoidance behaviors related to ___ as evidenced by ___'],
          ['Client will demonstrate reduction in trauma-related symptoms as measured by ___ within ___ weeks.', 'demonstrate reduction in trauma-related symptoms as measured by ___'],
          ['Client will develop and utilize a safety plan for managing trauma triggers within ___ weeks.', 'develop and utilize a safety plan for managing trauma triggers'],
          ['Client will process traumatic experiences as evidenced by decreased avoidance and intrusive symptoms within ___ weeks.', 'process traumatic experiences as evidenced by decreased avoidance and intrusive symptoms'],
          ['Client/couple will demonstrate improved communication skills as evidenced by ___ within ___ weeks.', 'demonstrate improved communication skills as evidenced by ___'],
          ['Client/couple will reduce frequency of escalated conflicts from ___ to ___ per week within ___ weeks.', 'reduce frequency of escalated conflicts from ___ to ___ per week'],
          ['Client/couple will identify and modify ___ negative interaction patterns within ___ weeks.', 'identify and modify ___ negative interaction patterns'],
          ['Client/couple will report improved relationship satisfaction as measured by ___ within ___ weeks.', 'report improved relationship satisfaction as measured by ___'],
          ['Family will establish and maintain ___ healthy boundaries as evidenced by ___ within ___ weeks.', 'establish and maintain ___ healthy boundaries as evidenced by ___'],
          ['Family members will demonstrate improved conflict resolution skills within ___ weeks.', 'demonstrate improved conflict resolution skills'],
          ['Family will increase frequency of positive interactions to ___ per week within ___ weeks.', 'increase frequency of positive interactions to ___ per week'],
          ['Parent(s) will implement ___ consistent parenting strategies as discussed in session within ___ weeks.', 'implement ___ consistent parenting strategies as discussed in session'],
          ['Client will identify and practice ___ healthy coping mechanisms for managing ___ within ___ weeks.', 'identify and practice ___ healthy coping mechanisms for managing ___'],
          ['Client will demonstrate ability to use grounding techniques when experiencing ___ within ___ weeks.', 'demonstrate ability to use grounding techniques when experiencing ___'],
          ['Client will develop a personalized wellness plan including ___ self-care activities within ___ weeks.', 'develop a personalized wellness plan including ___ self-care activities'],
          ['Client will identify ___ personal strengths and report improved self-perception within ___ weeks.', 'identify ___ personal strengths and report improved self-perception'],
          ['Client will challenge ___ negative self-beliefs per session as evidenced by cognitive restructuring within ___ weeks.', 'challenge ___ negative self-beliefs per session as evidenced by cognitive restructuring'],
          ['Client will process grief related to ___ as evidenced by decreased emotional distress within ___ weeks.', 'process grief related to ___ as evidenced by decreased emotional distress'],
          ['Client will identify ___ healthy ways to honor/memorialize their loss within ___ weeks.', 'identify ___ healthy ways to honor/memorialize their loss'],
          ['Client will reduce frequency of ___ (target behavior) from ___ to ___ per week within ___ weeks.', 'reduce frequency of ___ (target behavior) from ___ to ___ per week'],
          ['Client will increase frequency of ___ (replacement behavior) to ___ per week within ___ weeks.', 'increase frequency of ___ (replacement behavior) to ___ per week'],
          ['Client will identify ___ triggers for maladaptive behaviors and develop alternative responses within ___ weeks.', 'identify ___ triggers for maladaptive behaviors and develop alternative responses'],
        ];

        const updateStmt = db.prepare(
          "UPDATE goals_bank SET goal_template = ? WHERE goal_template = ? AND is_default = 1"
        );

        for (const [oldTemplate, newTemplate] of templateUpdates) {
          updateStmt.run(newTemplate, oldTemplate);
        }
      },
    },
    {
      version: 28,
      description: 'Add baseline and target percentage columns to goals table',
      up: () => {
        db.exec(`ALTER TABLE goals ADD COLUMN baseline INTEGER DEFAULT 0`);
        db.exec(`ALTER TABLE goals ADD COLUMN target INTEGER DEFAULT 0`);
      },
    },
    {
      version: 29,
      description: 'Add baseline/target snapshots to progress_report_goals for percentage tracking',
      up: () => {
        if (!columnExists('progress_report_goals', 'baseline_snapshot')) {
          db.exec(`ALTER TABLE progress_report_goals ADD COLUMN baseline_snapshot INTEGER DEFAULT 0`);
        }
        if (!columnExists('progress_report_goals', 'target_snapshot')) {
          db.exec(`ALTER TABLE progress_report_goals ADD COLUMN target_snapshot INTEGER DEFAULT 0`);
        }
      },
    },
    {
      version: 30,
      description: 'Add measurement_type and structured value fields to goals, goals_bank, progress_report_goals',
      up: () => {
        // ── goals table ──
        if (!columnExists('goals', 'measurement_type')) {
          db.exec("ALTER TABLE goals ADD COLUMN measurement_type TEXT DEFAULT 'percentage'");
        }
        if (!columnExists('goals', 'baseline_value')) {
          db.exec("ALTER TABLE goals ADD COLUMN baseline_value TEXT DEFAULT ''");
        }
        if (!columnExists('goals', 'target_value')) {
          db.exec("ALTER TABLE goals ADD COLUMN target_value TEXT DEFAULT ''");
        }
        if (!columnExists('goals', 'instrument')) {
          db.exec("ALTER TABLE goals ADD COLUMN instrument TEXT DEFAULT ''");
        }

        // Backfill existing goals: their baseline/target are integers 0-100, treat as percentage
        const existingGoals = db.prepare(
          "SELECT id, baseline, target FROM goals WHERE deleted_at IS NULL"
        ).all() as Array<{ id: number; baseline: number; target: number }>;

        const updateStmt = db.prepare(
          "UPDATE goals SET measurement_type = 'percentage', baseline_value = ?, target_value = ? WHERE id = ?"
        );
        for (const goal of existingGoals) {
          updateStmt.run(
            `${goal.baseline || 0}`,
            `${goal.target || 0}`,
            goal.id
          );
        }

        // ── goals_bank table ──
        if (!columnExists('goals_bank', 'measurement_type')) {
          db.exec("ALTER TABLE goals_bank ADD COLUMN measurement_type TEXT DEFAULT 'percentage'");
        }

        // Backfill bank entries based on category
        const categoryMeasurements: Record<string, string> = {
          'Mobility': 'assist_level', 'Transfers': 'assist_level',
          'Strength': 'mmt_grade', 'ROM': 'rom_degrees',
          'Balance': 'timed_seconds', 'Pain Management': 'pain_scale',
          'Functional Activity': 'assist_level', 'Gait': 'assist_level',
          'Endurance': 'timed_seconds', 'Posture': 'percentage',
          'ADLs': 'assist_level', 'Fine Motor': 'percentage',
          'Visual Motor': 'percentage', 'Sensory Processing': 'severity',
          'Handwriting': 'percentage', 'Self-Care': 'assist_level',
          'Feeding': 'assist_level', 'Upper Extremity': 'assist_level',
          'Cognitive': 'cue_level', 'Play Skills': 'cue_level',
          'Articulation': 'percentage', 'Language Comprehension': 'percentage',
          'Language Expression': 'percentage', 'Fluency': 'severity',
          'Voice': 'severity', 'Pragmatics': 'cue_level',
          'Phonological Awareness': 'percentage', 'Feeding/Swallowing': 'severity',
          'AAC': 'cue_level', 'Cognitive-Communication': 'cue_level',
          'Depression': 'standardized_score', 'Anxiety': 'standardized_score',
          'Trauma': 'standardized_score', 'Relationship': 'severity',
          'Family Systems': 'severity', 'Coping Skills': 'severity',
          'Self-Esteem': 'severity', 'Grief': 'severity',
          'Behavioral': 'frequency',
        };

        const updateBank = db.prepare(
          'UPDATE goals_bank SET measurement_type = ? WHERE category = ?'
        );
        for (const [category, mtype] of Object.entries(categoryMeasurements)) {
          updateBank.run(mtype, category);
        }

        // ── progress_report_goals table ──
        if (!columnExists('progress_report_goals', 'measurement_type')) {
          db.exec("ALTER TABLE progress_report_goals ADD COLUMN measurement_type TEXT DEFAULT ''");
        }
        if (!columnExists('progress_report_goals', 'current_value')) {
          db.exec("ALTER TABLE progress_report_goals ADD COLUMN current_value TEXT DEFAULT ''");
        }
        if (!columnExists('progress_report_goals', 'current_numeric')) {
          db.exec("ALTER TABLE progress_report_goals ADD COLUMN current_numeric INTEGER DEFAULT 0");
        }
        if (!columnExists('progress_report_goals', 'baseline_value_snapshot')) {
          db.exec("ALTER TABLE progress_report_goals ADD COLUMN baseline_value_snapshot TEXT DEFAULT ''");
        }
        if (!columnExists('progress_report_goals', 'target_value_snapshot')) {
          db.exec("ALTER TABLE progress_report_goals ADD COLUMN target_value_snapshot TEXT DEFAULT ''");
        }
      },
    },
    {
      version: 31,
      description: 'Overhaul goals_bank with measurement-type-aware templates for all disciplines',
      up: () => {
        // Delete ALL default goals bank entries — they'll be re-seeded with proper measurement_type
        db.prepare("DELETE FROM goals_bank WHERE is_default = 1").run();

        // Re-seed using inline INSERT since seed functions have guards that prevent re-running
        const ins = db.prepare(
          'INSERT INTO goals_bank (discipline, category, goal_template, measurement_type, is_default) VALUES (?, ?, ?, ?, 1)'
        );

        // PT
        ins.run('PT', 'Mobility', 'ambulate ___ ft with ___ device', 'assist_level');
        ins.run('PT', 'Mobility', 'ambulate on level surfaces with normalized gait pattern', 'assist_level');
        ins.run('PT', 'Mobility', 'navigate stairs with ___ railing', 'assist_level');
        ins.run('PT', 'Mobility', 'perform sit-to-stand from standard height chair', 'assist_level');
        ins.run('PT', 'Mobility', 'ambulate community distances of ___ ft on uneven surfaces', 'assist_level');
        ins.run('PT', 'Strength', 'demonstrate ___ strength in ___', 'mmt_grade');
        ins.run('PT', 'Strength', 'improve ___ (LE/UE) strength for functional mobility', 'mmt_grade');
        ins.run('PT', 'Strength', 'improve core stability for upright functional tasks', 'mmt_grade');
        ins.run('PT', 'ROM', 'achieve ___ AROM', 'rom_degrees');
        ins.run('PT', 'ROM', 'demonstrate functional ROM for ___ activities', 'rom_degrees');
        ins.run('PT', 'ROM', 'improve ___ flexibility for pain-free movement', 'rom_degrees');
        ins.run('PT', 'Balance', 'maintain static standing balance without LOB', 'timed_seconds');
        ins.run('PT', 'Balance', 'perform dynamic balance activities without LOB', 'timed_seconds');
        ins.run('PT', 'Balance', 'maintain single-leg stance', 'timed_seconds');
        ins.run('PT', 'Balance', 'achieve improved Berg Balance Scale score', 'standardized_score');
        ins.run('PT', 'Pain Management', 'report reduced pain with functional activities', 'pain_scale');
        ins.run('PT', 'Pain Management', 'manage pain during ADLs using learned strategies', 'pain_scale');
        ins.run('PT', 'Functional Activity', 'independently perform HEP with correct form', 'assist_level');
        ins.run('PT', 'Functional Activity', 'return to ___ (work/sport/activity) without limitations', 'assist_level');
        ins.run('PT', 'Functional Activity', 'tolerate upright activity for ___ minutes', 'assist_level');
        ins.run('PT', 'Transfers', 'complete bed mobility', 'assist_level');
        ins.run('PT', 'Transfers', 'perform all functional transfers', 'assist_level');
        ins.run('PT', 'Transfers', 'perform car transfer safely', 'assist_level');
        ins.run('PT', 'Gait', 'demonstrate normalized gait mechanics', 'assist_level');
        ins.run('PT', 'Gait', 'ambulate with reciprocal gait pattern', 'assist_level');

        // OT
        ins.run('OT', 'ADLs', 'complete upper body dressing', 'assist_level');
        ins.run('OT', 'ADLs', 'complete lower body dressing', 'assist_level');
        ins.run('OT', 'ADLs', 'complete grooming tasks', 'assist_level');
        ins.run('OT', 'ADLs', 'complete bathing', 'assist_level');
        ins.run('OT', 'ADLs', 'feed self with appropriate utensils', 'assist_level');
        ins.run('OT', 'ADLs', 'prepare a simple meal', 'assist_level');
        ins.run('OT', 'ADLs', 'manage medications', 'assist_level');
        ins.run('OT', 'ADLs', 'perform light housekeeping tasks', 'assist_level');
        ins.run('OT', 'ADLs', 'complete toileting and hygiene', 'assist_level');
        ins.run('OT', 'Fine Motor', 'demonstrate functional grasp/release for ___ tasks', 'percentage');
        ins.run('OT', 'Fine Motor', 'improve fine motor coordination for ___ tasks', 'percentage');
        ins.run('OT', 'Fine Motor', 'demonstrate bilateral coordination for functional tasks', 'percentage');
        ins.run('OT', 'Cognitive', 'follow ___-step commands for functional tasks', 'cue_level');
        ins.run('OT', 'Cognitive', 'demonstrate improved sequencing for ___-step tasks', 'cue_level');
        ins.run('OT', 'Cognitive', 'utilize compensatory strategies for ___ tasks', 'cue_level');
        ins.run('OT', 'Cognitive', 'demonstrate safe problem-solving during ___ tasks', 'cue_level');
        ins.run('OT', 'Upper Extremity', 'achieve functional UE AROM for ___ activities', 'assist_level');
        ins.run('OT', 'Upper Extremity', 'demonstrate functional UE strength for ___ tasks', 'assist_level');
        ins.run('OT', 'Self-Care', 'demonstrate safe ___ techniques', 'assist_level');
        ins.run('OT', 'Self-Care', 'use adaptive equipment for ___ tasks', 'assist_level');
        ins.run('OT', 'Sensory Processing', 'tolerate ___ sensory input during functional tasks', 'severity');
        ins.run('OT', 'Sensory Processing', 'demonstrate improved self-regulation strategies', 'severity');

        // ST
        ins.run('ST', 'Articulation', 'produce target sounds in ___ position at ___ level', 'percentage');
        ins.run('ST', 'Articulation', 'produce intelligible speech in ___ context', 'percentage');
        ins.run('ST', 'Articulation', 'self-correct articulation errors in ___ context', 'percentage');
        ins.run('ST', 'Language Expression', 'name items in ___ categories', 'percentage');
        ins.run('ST', 'Language Expression', 'produce grammatically correct sentences of ___+ words', 'percentage');
        ins.run('ST', 'Language Expression', 'use word retrieval strategies in conversation', 'percentage');
        ins.run('ST', 'Language Expression', 'formulate complete sentences to express wants/needs', 'percentage');
        ins.run('ST', 'Language Expression', 'retell a story/event with appropriate detail', 'percentage');
        ins.run('ST', 'Language Comprehension', 'follow ___-step directions', 'percentage');
        ins.run('ST', 'Language Comprehension', 'answer ___ questions about presented material', 'percentage');
        ins.run('ST', 'Language Comprehension', 'identify main idea and details in ___ material', 'percentage');
        ins.run('ST', 'Language Comprehension', 'demonstrate understanding of age-appropriate vocabulary', 'percentage');
        ins.run('ST', 'Language Comprehension', 'make inferences from presented material', 'percentage');
        ins.run('ST', 'Voice', 'demonstrate appropriate vocal quality during ___ tasks', 'severity');
        ins.run('ST', 'Voice', 'maintain adequate breath support for connected speech', 'severity');
        ins.run('ST', 'Voice', 'use resonant voice techniques in ___ context', 'severity');
        ins.run('ST', 'Fluency', 'use ___ fluency strategy in ___ context', 'severity');
        ins.run('ST', 'Fluency', 'demonstrate fluent speech in ___ speaking tasks', 'severity');
        ins.run('ST', 'Fluency', 'self-monitor speech rate during conversation', 'severity');
        ins.run('ST', 'Feeding/Swallowing', 'safely tolerate ___ consistency', 'severity');
        ins.run('ST', 'Feeding/Swallowing', 'demonstrate safe swallow with ___ diet with no s/s aspiration', 'severity');
        ins.run('ST', 'Feeding/Swallowing', 'use ___ compensatory swallow strategy during meals', 'severity');
        ins.run('ST', 'Cognitive-Communication', 'recall ___/5 items after ___ delay', 'cue_level');
        ins.run('ST', 'Cognitive-Communication', 'sustain attention for ___ min on ___ task', 'cue_level');
        ins.run('ST', 'Cognitive-Communication', 'identify safety concerns in functional scenarios', 'cue_level');
        ins.run('ST', 'Cognitive-Communication', 'demonstrate functional problem-solving skills', 'cue_level');
        ins.run('ST', 'Cognitive-Communication', 'use compensatory memory strategies during daily tasks', 'cue_level');
        ins.run('ST', 'Pragmatics', 'maintain appropriate topic during conversation', 'cue_level');
        ins.run('ST', 'Pragmatics', 'demonstrate appropriate turn-taking in conversation', 'cue_level');

        // MFT
        ins.run('MFT', 'Depression', 'report reduction in depressive symptoms as measured by PHQ-9', 'standardized_score');
        ins.run('MFT', 'Depression', 'identify and practice ___ positive coping strategies for managing depressive episodes', 'standardized_score');
        ins.run('MFT', 'Depression', 'engage in ___ pleasurable activities per week as reported in session', 'standardized_score');
        ins.run('MFT', 'Anxiety', 'report reduction in anxiety symptoms as measured by GAD-7', 'standardized_score');
        ins.run('MFT', 'Anxiety', 'demonstrate use of ___ anxiety management techniques in daily life', 'standardized_score');
        ins.run('MFT', 'Anxiety', 'reduce avoidance behaviors related to ___', 'standardized_score');
        ins.run('MFT', 'Trauma', 'demonstrate reduction in trauma-related symptoms as measured by PCL-5', 'standardized_score');
        ins.run('MFT', 'Trauma', 'develop and utilize a safety plan for managing trauma triggers', 'standardized_score');
        ins.run('MFT', 'Trauma', 'process traumatic experiences as evidenced by decreased avoidance and intrusive symptoms', 'standardized_score');
        ins.run('MFT', 'Relationship', 'demonstrate improved communication skills with partner/family', 'severity');
        ins.run('MFT', 'Relationship', 'identify and modify negative interaction patterns', 'severity');
        ins.run('MFT', 'Relationship', 'report improved relationship satisfaction', 'severity');
        ins.run('MFT', 'Relationship', 'demonstrate effective conflict resolution strategies', 'severity');
        ins.run('MFT', 'Family Systems', 'establish and maintain healthy boundaries with family members', 'severity');
        ins.run('MFT', 'Family Systems', 'demonstrate improved conflict resolution skills within the family', 'severity');
        ins.run('MFT', 'Family Systems', 'implement consistent parenting strategies as discussed in session', 'severity');
        ins.run('MFT', 'Family Systems', 'increase frequency of positive family interactions', 'severity');
        ins.run('MFT', 'Coping Skills', 'identify and practice ___ healthy coping mechanisms for managing ___', 'severity');
        ins.run('MFT', 'Coping Skills', 'demonstrate ability to use grounding techniques when experiencing distress', 'severity');
        ins.run('MFT', 'Coping Skills', 'develop a personalized wellness plan including ___ self-care activities', 'severity');
        ins.run('MFT', 'Self-Esteem', 'identify personal strengths and report improved self-perception', 'severity');
        ins.run('MFT', 'Self-Esteem', 'challenge negative self-beliefs as evidenced by cognitive restructuring', 'severity');
        ins.run('MFT', 'Grief', 'process grief related to ___ as evidenced by decreased emotional distress', 'severity');
        ins.run('MFT', 'Grief', 'identify healthy ways to honor/memorialize their loss', 'severity');
        ins.run('MFT', 'Behavioral', 'reduce frequency of ___ (target behavior)', 'frequency');
        ins.run('MFT', 'Behavioral', 'increase frequency of ___ (replacement behavior)', 'frequency');
        ins.run('MFT', 'Behavioral', 'identify triggers for maladaptive behaviors and develop alternative responses', 'frequency');
      },
    },
    {
      version: 32,
      description: 'Add pattern_id and components_json columns for pattern-based goals',
      up: () => {
        // goals table
        try { db.exec("ALTER TABLE goals ADD COLUMN pattern_id TEXT DEFAULT ''"); } catch {}
        try { db.exec("ALTER TABLE goals ADD COLUMN components_json TEXT DEFAULT ''"); } catch {}
      },
    },
    {
      version: 33,
      description: 'Add pattern_overrides table, drop goals_bank',
      up: () => {
        db.exec(`
          CREATE TABLE IF NOT EXISTS pattern_overrides (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            pattern_id TEXT NOT NULL,
            component_key TEXT NOT NULL,
            custom_options TEXT NOT NULL DEFAULT '[]',
            removed_options TEXT NOT NULL DEFAULT '[]',
            UNIQUE(pattern_id, component_key)
          )
        `);
        db.exec('DROP TABLE IF EXISTS goals_bank');
      },
    },
    {
      version: 34,
      description: 'Add dashboard scratchpad and todo tables',
      up: () => {
        db.exec(`
          CREATE TABLE IF NOT EXISTS dashboard_notes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            content TEXT NOT NULL DEFAULT '',
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);
        db.exec(`
          CREATE TABLE IF NOT EXISTS dashboard_todos (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            text TEXT NOT NULL DEFAULT '',
            completed INTEGER NOT NULL DEFAULT 0,
            position INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);
      },
    },
    {
      version: 35,
      description: 'Add calendar_blocks table for admin time blocks',
      up: () => {
        db.exec(`
          CREATE TABLE IF NOT EXISTS calendar_blocks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL DEFAULT '',
            scheduled_date TEXT NOT NULL,
            scheduled_time TEXT NOT NULL DEFAULT '09:00',
            duration_minutes INTEGER NOT NULL DEFAULT 30,
            source_todo_id INTEGER,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);
      },
    },
    {
      version: 36,
      description: 'Add completed to calendar_blocks, create quick_links table',
      up: () => {
        db.exec(`ALTER TABLE calendar_blocks ADD COLUMN completed INTEGER NOT NULL DEFAULT 0`);
        db.exec(`
          CREATE TABLE IF NOT EXISTS quick_links (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            title TEXT NOT NULL DEFAULT '',
            url TEXT NOT NULL DEFAULT '',
            position INTEGER NOT NULL DEFAULT 0,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);
      },
    },
    {
      version: 37,
      description: 'Add priority flag to dashboard_todos',
      up: () => {
        db.exec(`ALTER TABLE dashboard_todos ADD COLUMN priority INTEGER NOT NULL DEFAULT 0`);
      },
    },
    {
      version: 38,
      description: 'Create goal_progress_history table and backfill from existing data',
      up: () => {
        // Create the table
        db.exec(`
          CREATE TABLE IF NOT EXISTS goal_progress_history (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            goal_id INTEGER NOT NULL REFERENCES goals(id),
            client_id INTEGER NOT NULL REFERENCES clients(id),
            recorded_date TEXT NOT NULL,
            measurement_type TEXT NOT NULL DEFAULT 'percentage',
            value TEXT NOT NULL DEFAULT '',
            numeric_value INTEGER NOT NULL DEFAULT 0,
            instrument TEXT DEFAULT '',
            source_type TEXT NOT NULL,
            source_document_id INTEGER,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            deleted_at TEXT DEFAULT NULL
          )
        `);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_goal_progress_goal ON goal_progress_history(goal_id, deleted_at)`);
        db.exec(`CREATE INDEX IF NOT EXISTS idx_goal_progress_source ON goal_progress_history(source_type, source_document_id)`);

        // Backfill Step 1: Eval baselines
        // For each goal established by a signed eval, insert the baseline as the first history entry
        const insertHistory = db.prepare(`
          INSERT INTO goal_progress_history
            (goal_id, client_id, recorded_date, measurement_type, value, numeric_value, instrument, source_type, source_document_id)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const goalsWithEvalSource = db.prepare(`
          SELECT g.id, g.client_id, g.baseline_value, g.baseline, g.measurement_type, g.instrument,
                 g.source_document_id, e.signed_at
          FROM goals g
          JOIN evaluations e ON e.id = g.source_document_id
          WHERE g.source_document_type = 'eval'
            AND g.deleted_at IS NULL
            AND e.signed_at IS NOT NULL
            AND e.deleted_at IS NULL
        `).all() as any[];

        for (const goal of goalsWithEvalSource) {
          const dateStr = goal.signed_at ? goal.signed_at.split('T')[0] : new Date().toISOString().split('T')[0];
          const val = goal.baseline_value || `${goal.baseline || 0}`;
          if (val && val !== '0' && val !== '') {
            insertHistory.run(
              goal.id,
              goal.client_id,
              dateStr,
              goal.measurement_type || 'percentage',
              val,
              goal.baseline || 0,
              goal.instrument || '',
              'eval',
              goal.source_document_id
            );
          }
        }

        // Backfill Step 2: Progress report / recert / discharge checkpoints
        const prGoalEntries = db.prepare(`
          SELECT prg.goal_id, n.date_of_service, prg.current_value, prg.current_numeric,
                 prg.measurement_type, n.id as note_id, n.note_type, g.client_id, g.instrument
          FROM progress_report_goals prg
          JOIN notes n ON n.id = prg.note_id
          JOIN goals g ON g.id = prg.goal_id
          WHERE n.signed_at IS NOT NULL
            AND n.deleted_at IS NULL
            AND prg.deleted_at IS NULL
            AND prg.current_value IS NOT NULL
            AND prg.current_value != ''
        `).all() as any[];

        for (const entry of prGoalEntries) {
          let sourceType = 'progress_report';
          if (entry.note_type === 'discharge') sourceType = 'discharge';
          else if (entry.note_type === 'recertification') sourceType = 'recert';

          insertHistory.run(
            entry.goal_id,
            entry.client_id,
            entry.date_of_service,
            entry.measurement_type || 'percentage',
            entry.current_value,
            entry.current_numeric || 0,
            entry.instrument || '',
            sourceType,
            entry.note_id
          );
        }
      },
    },
    {
      version: 39,
      description: 'Create custom_patterns table for user-defined goal patterns',
      up: () => {
        db.exec(`
          CREATE TABLE IF NOT EXISTS custom_patterns (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            discipline TEXT NOT NULL,
            category TEXT NOT NULL DEFAULT '',
            label TEXT NOT NULL,
            icon TEXT DEFAULT '',
            measurement_type TEXT NOT NULL DEFAULT 'percentage',
            chips_json TEXT NOT NULL DEFAULT '[]',
            created_at TEXT DEFAULT CURRENT_TIMESTAMP,
            deleted_at TEXT DEFAULT NULL
          )
        `);
      },
    },
    {
      version: 40,
      description: 'Add session_type and evaluation_id columns to appointments',
      up: () => {
        const cols = db.pragma('table_info(appointments)') as any[];
        if (!cols.find((c: any) => c.name === 'session_type')) {
          db.exec("ALTER TABLE appointments ADD COLUMN session_type TEXT DEFAULT 'visit'");
        }
        if (!cols.find((c: any) => c.name === 'evaluation_id')) {
          db.exec("ALTER TABLE appointments ADD COLUMN evaluation_id INTEGER DEFAULT NULL");
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
    CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
    CREATE INDEX IF NOT EXISTS idx_clients_deleted_at ON clients(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_notes_deleted_at ON notes(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_evaluations_deleted_at ON evaluations(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_goals_deleted_at ON goals(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_appointments_deleted_at ON appointments(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_dashboard_todos_position ON dashboard_todos(position);
    CREATE INDEX IF NOT EXISTS idx_calendar_blocks_date ON calendar_blocks(scheduled_date);
    CREATE INDEX IF NOT EXISTS idx_quick_links_position ON quick_links(position);
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

  // V2 Pro table indexes (run after migration 15 creates tables)
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_contracted_entities_deleted_at ON contracted_entities(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_entity_fee_schedules_entity_id ON entity_fee_schedules(entity_id);
    CREATE INDEX IF NOT EXISTS idx_entity_fee_schedules_deleted_at ON entity_fee_schedules(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_entity_documents_entity_id ON entity_documents(entity_id);
    CREATE INDEX IF NOT EXISTS idx_entity_documents_deleted_at ON entity_documents(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_vault_documents_document_type ON vault_documents(document_type);
    CREATE INDEX IF NOT EXISTS idx_vault_documents_expiration_date ON vault_documents(expiration_date);
    CREATE INDEX IF NOT EXISTS idx_vault_documents_deleted_at ON vault_documents(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_compliance_tracking_client_id ON compliance_tracking(client_id);
    CREATE INDEX IF NOT EXISTS idx_mileage_log_date ON mileage_log(date);
    CREATE INDEX IF NOT EXISTS idx_mileage_log_entity_id ON mileage_log(entity_id);
    CREATE INDEX IF NOT EXISTS idx_mileage_log_client_id ON mileage_log(client_id);
    CREATE INDEX IF NOT EXISTS idx_mileage_log_deleted_at ON mileage_log(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_communication_log_client_id ON communication_log(client_id);
    CREATE INDEX IF NOT EXISTS idx_communication_log_deleted_at ON communication_log(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_notes_entity_id ON notes(entity_id);
    CREATE INDEX IF NOT EXISTS idx_notes_note_type ON notes(note_type);
    CREATE INDEX IF NOT EXISTS idx_appointments_entity_id ON appointments(entity_id);
    CREATE INDEX IF NOT EXISTS idx_invoices_entity_id ON invoices(entity_id);
  `);

  // V5 Progress Report & Staged Goals indexes
  db.exec(`
    CREATE INDEX IF NOT EXISTS idx_staged_goals_client_id ON staged_goals(client_id);
    CREATE INDEX IF NOT EXISTS idx_staged_goals_status ON staged_goals(status);
    CREATE INDEX IF NOT EXISTS idx_staged_goals_deleted_at ON staged_goals(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_progress_report_goals_note_id ON progress_report_goals(note_id);
    CREATE INDEX IF NOT EXISTS idx_progress_report_goals_goal_id ON progress_report_goals(goal_id);
    CREATE INDEX IF NOT EXISTS idx_progress_report_goals_deleted_at ON progress_report_goals(deleted_at);
    CREATE INDEX IF NOT EXISTS idx_appointments_visit_type ON appointments(visit_type);
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

// ── Backup, Restore & Integrity Functions ──

const LATEST_SCHEMA_VERSION = 40;

/**
 * Run PRAGMA quick_check — a fast consistency check on every launch.
 * Returns 'ok' on success or a description of the first error found.
 */
export function runQuickCheck(): string {
  try {
    const result = db.pragma('quick_check') as Array<Record<string, string>>;
    const first = result[0];
    if (!first) return 'ok';
    const val = Object.values(first)[0];
    return val || 'ok';
  } catch (err: any) {
    return err.message || 'quick_check failed';
  }
}

/**
 * Run PRAGMA integrity_check — a thorough check, suitable for weekly runs.
 * Returns 'ok' on success or a description of errors.
 */
export function runIntegrityCheck(): string {
  try {
    const result = db.pragma('integrity_check') as Array<Record<string, string>>;
    const first = result[0];
    if (!first) return 'ok';
    const val = Object.values(first)[0];
    return val || 'ok';
  } catch (err: any) {
    return err.message || 'integrity_check failed';
  }
}

/**
 * Get a summary of the current database (for display in restore confirmation).
 */
export function getCurrentDbSummary(): {
  clientCount: number;
  activeClients: number;
  noteCount: number;
  signedNotes: number;
  evalCount: number;
  goalCount: number;
  appointmentCount: number;
  invoiceCount: number;
  entityCount: number;
  earliestDate: string;
  latestDate: string;
  schemaVersion: number;
} {
  const clientCount = (db.prepare("SELECT COUNT(*) as c FROM clients WHERE deleted_at IS NULL").get() as any)?.c || 0;
  const activeClients = (db.prepare("SELECT COUNT(*) as c FROM clients WHERE deleted_at IS NULL AND status = 'active'").get() as any)?.c || 0;
  const noteCount = (db.prepare("SELECT COUNT(*) as c FROM notes WHERE deleted_at IS NULL").get() as any)?.c || 0;
  const signedNotes = (db.prepare("SELECT COUNT(*) as c FROM notes WHERE deleted_at IS NULL AND signed_at IS NOT NULL AND signed_at != ''").get() as any)?.c || 0;
  const evalCount = (db.prepare("SELECT COUNT(*) as c FROM evaluations WHERE deleted_at IS NULL").get() as any)?.c || 0;
  const goalCount = (db.prepare("SELECT COUNT(*) as c FROM goals WHERE deleted_at IS NULL").get() as any)?.c || 0;
  const appointmentCount = (db.prepare("SELECT COUNT(*) as c FROM appointments WHERE deleted_at IS NULL").get() as any)?.c || 0;
  const invoiceCount = (db.prepare("SELECT COUNT(*) as c FROM invoices WHERE deleted_at IS NULL").get() as any)?.c || 0;
  const entityCount = (db.prepare("SELECT COUNT(*) as c FROM contracted_entities WHERE deleted_at IS NULL").get() as any)?.c || 0;
  const dates = db.prepare("SELECT MIN(date_of_service) as earliest, MAX(date_of_service) as latest FROM notes WHERE deleted_at IS NULL").get() as any;
  const schemaVersion = getSchemaVersion();

  return {
    clientCount,
    activeClients,
    noteCount,
    signedNotes,
    evalCount,
    goalCount,
    appointmentCount,
    invoiceCount,
    entityCount,
    earliestDate: dates?.earliest || '',
    latestDate: dates?.latest || '',
    schemaVersion,
  };
}

/**
 * Validate a backup database file and return a summary of its contents.
 * Opens the file as a separate read-only connection (does not affect the running DB).
 *
 * @param filePath - Path to the backup .db file
 * @param masterKeyHex - 64-char hex string to decrypt the file (or empty for unencrypted)
 * @returns BackupSummary-compatible object
 */
export function validateBackupFile(
  filePath: string,
  masterKeyHex: string
): {
  clientCount: number;
  activeClients: number;
  noteCount: number;
  signedNotes: number;
  evalCount: number;
  goalCount: number;
  appointmentCount: number;
  invoiceCount: number;
  entityCount: number;
  earliestDate: string;
  latestDate: string;
  schemaVersion: number;
  practiceInfo: { name?: string; discipline?: string } | null;
  isCompatible: boolean;
  validationPassed: boolean;
} {
  const backupDb = new SqlcipherDatabase(filePath, { readonly: true });

  try {
    // Set encryption key if provided
    if (masterKeyHex) {
      backupDb.pragma(`key = "x'${masterKeyHex}'"`);
    }

    // Quick check to validate the file
    const qc = backupDb.pragma('quick_check') as Array<Record<string, string>>;
    const qcResult = Object.values(qc[0] || {})[0] || 'ok';
    if (qcResult !== 'ok') {
      return {
        clientCount: 0, activeClients: 0, noteCount: 0, signedNotes: 0,
        evalCount: 0, goalCount: 0, appointmentCount: 0, invoiceCount: 0,
        entityCount: 0, earliestDate: '', latestDate: '', schemaVersion: 0,
        practiceInfo: null, isCompatible: false, validationPassed: false,
      };
    }

    // Check required tables exist
    const tables = backupDb.prepare("SELECT name FROM sqlite_master WHERE type='table'").all() as Array<{ name: string }>;
    const tableNames = new Set(tables.map(t => t.name));
    const required = ['clients', 'notes', 'evaluations', 'goals', 'appointments', 'settings'];
    for (const t of required) {
      if (!tableNames.has(t)) {
        return {
          clientCount: 0, activeClients: 0, noteCount: 0, signedNotes: 0,
          evalCount: 0, goalCount: 0, appointmentCount: 0, invoiceCount: 0,
          entityCount: 0, earliestDate: '', latestDate: '', schemaVersion: 0,
          practiceInfo: null, isCompatible: false, validationPassed: false,
        };
      }
    }

    // Read schema version
    const vRow = backupDb.prepare("SELECT value FROM settings WHERE key = 'schema_version'").get() as { value: string } | undefined;
    const schemaVersion = vRow ? parseInt(vRow.value, 10) : 0;

    // Counts (safely handle missing columns with try/catch)
    const safeCount = (sql: string): number => {
      try { return (backupDb.prepare(sql).get() as any)?.c || 0; } catch { return 0; }
    };

    const clientCount = safeCount("SELECT COUNT(*) as c FROM clients WHERE deleted_at IS NULL");
    const activeClients = safeCount("SELECT COUNT(*) as c FROM clients WHERE deleted_at IS NULL AND status = 'active'");
    const noteCount = safeCount("SELECT COUNT(*) as c FROM notes WHERE deleted_at IS NULL");
    const signedNotes = safeCount("SELECT COUNT(*) as c FROM notes WHERE deleted_at IS NULL AND signed_at IS NOT NULL AND signed_at != ''");
    const evalCount = safeCount("SELECT COUNT(*) as c FROM evaluations WHERE deleted_at IS NULL");
    const goalCount = safeCount("SELECT COUNT(*) as c FROM goals WHERE deleted_at IS NULL");
    const appointmentCount = safeCount("SELECT COUNT(*) as c FROM appointments WHERE deleted_at IS NULL");
    const invoiceCount = tableNames.has('invoices') ? safeCount("SELECT COUNT(*) as c FROM invoices WHERE deleted_at IS NULL") : 0;
    const entityCount = tableNames.has('contracted_entities') ? safeCount("SELECT COUNT(*) as c FROM contracted_entities WHERE deleted_at IS NULL") : 0;

    // Date range
    let earliestDate = '';
    let latestDate = '';
    try {
      const dates = backupDb.prepare("SELECT MIN(date_of_service) as earliest, MAX(date_of_service) as latest FROM notes WHERE deleted_at IS NULL").get() as any;
      earliestDate = dates?.earliest || '';
      latestDate = dates?.latest || '';
    } catch {}

    // Practice info
    let practiceInfo: { name?: string; discipline?: string } | null = null;
    try {
      const practice = backupDb.prepare("SELECT name, discipline FROM practice LIMIT 1").get() as any;
      if (practice) {
        practiceInfo = { name: practice.name, discipline: practice.discipline };
      }
    } catch {}

    return {
      clientCount,
      activeClients,
      noteCount,
      signedNotes,
      evalCount,
      goalCount,
      appointmentCount,
      invoiceCount,
      entityCount,
      earliestDate,
      latestDate,
      schemaVersion,
      practiceInfo,
      isCompatible: schemaVersion <= LATEST_SCHEMA_VERSION,
      validationPassed: true,
    };
  } finally {
    try { backupDb.close(); } catch {}
  }
}

/**
 * Get a list of clients from a backup file for the selective import selector.
 * Opens the backup read-only, queries clients with sub-counts.
 */
export function getBackupClients(
  filePath: string,
  masterKeyHex: string
): Array<{
  id: number;
  first_name: string;
  last_name: string;
  dob: string;
  status: string;
  discipline: string;
  noteCount: number;
  signedNoteCount: number;
  evalCount: number;
  goalCount: number;
  appointmentCount: number;
  earliestService: string;
  latestService: string;
  existsInCurrent: boolean;
}> {
  const backupDb = new SqlcipherDatabase(filePath, { readonly: true });

  try {
    if (masterKeyHex) {
      backupDb.pragma(`key = "x'${masterKeyHex}'"`);
    }

    // Get all clients (including soft-deleted for full picture)
    const clients = backupDb.prepare(`
      SELECT id, first_name, last_name, dob, status, discipline
      FROM clients
      WHERE deleted_at IS NULL
      ORDER BY last_name, first_name
    `).all() as Array<{
      id: number; first_name: string; last_name: string;
      dob: string; status: string; discipline: string;
    }>;

    const currentDb = db; // The running database

    return clients.map(client => {
      // Sub-counts
      const noteCount = (backupDb.prepare("SELECT COUNT(*) as c FROM notes WHERE client_id = ? AND deleted_at IS NULL").get(client.id) as any)?.c || 0;
      const signedNoteCount = (backupDb.prepare("SELECT COUNT(*) as c FROM notes WHERE client_id = ? AND deleted_at IS NULL AND signed_at IS NOT NULL AND signed_at != ''").get(client.id) as any)?.c || 0;
      const evalCount = (backupDb.prepare("SELECT COUNT(*) as c FROM evaluations WHERE client_id = ? AND deleted_at IS NULL").get(client.id) as any)?.c || 0;
      const goalCount = (backupDb.prepare("SELECT COUNT(*) as c FROM goals WHERE client_id = ? AND deleted_at IS NULL").get(client.id) as any)?.c || 0;
      const appointmentCount = (backupDb.prepare("SELECT COUNT(*) as c FROM appointments WHERE client_id = ? AND deleted_at IS NULL").get(client.id) as any)?.c || 0;

      // Date range
      const dates = backupDb.prepare("SELECT MIN(date_of_service) as earliest, MAX(date_of_service) as latest FROM notes WHERE client_id = ? AND deleted_at IS NULL").get(client.id) as any;

      // Check if same-name client exists in current DB
      let existsInCurrent = false;
      try {
        const match = currentDb.prepare(
          "SELECT id FROM clients WHERE LOWER(first_name) = LOWER(?) AND LOWER(last_name) = LOWER(?) AND deleted_at IS NULL"
        ).get(client.first_name, client.last_name);
        existsInCurrent = !!match;
      } catch {}

      return {
        id: client.id,
        first_name: client.first_name,
        last_name: client.last_name,
        dob: client.dob || '',
        status: client.status || 'active',
        discipline: client.discipline || '',
        noteCount,
        signedNoteCount,
        evalCount,
        goalCount,
        appointmentCount,
        earliestService: dates?.earliest || '',
        latestService: dates?.latest || '',
        existsInCurrent,
      };
    });
  } finally {
    try { backupDb.close(); } catch {}
  }
}

/**
 * Replace the current database file with a backup.
 * MUST call closeDatabase() before this, and initDatabase() after.
 */
export function restoreFullDatabase(backupDbPath: string): void {
  const dataPath = getDataPath();
  const dbPath = path.join(dataPath, 'pocketchart.db');

  // Ensure data directory exists
  if (!fs.existsSync(dataPath)) {
    fs.mkdirSync(dataPath, { recursive: true });
  }

  // Copy backup over current
  fs.copyFileSync(backupDbPath, dbPath);

  // Clean up stale WAL/SHM files
  const walPath = dbPath + '-wal';
  const shmPath = dbPath + '-shm';
  if (fs.existsSync(walPath)) fs.unlinkSync(walPath);
  if (fs.existsSync(shmPath)) fs.unlinkSync(shmPath);
}

/**
 * Import selected clients from a backup into the current database.
 * Performs a full deep copy with ID remapping across all FK relationships.
 * All work is wrapped in a single transaction (all-or-nothing).
 */
export function importSelectedClients(
  backupPath: string,
  masterKeyHex: string,
  clientIds: number[]
): {
  success: boolean;
  clients: number;
  notes: number;
  evaluations: number;
  goals: number;
  appointments: number;
  documents: number;
  documentFilesMissing: number;
  invoices: number;
  payments: number;
  entities: number;
  warnings: string[];
} {
  const backupDb = new SqlcipherDatabase(backupPath, { readonly: true });
  const warnings: string[] = [];
  const counts = {
    clients: 0, notes: 0, evaluations: 0, goals: 0, appointments: 0,
    documents: 0, documentFilesMissing: 0, invoices: 0, payments: 0, entities: 0,
  };

  try {
    if (masterKeyHex) {
      backupDb.pragma(`key = "x'${masterKeyHex}'"`);
    }

    // ID remapping tables
    const clientIdMap = new Map<number, number>();
    const entityIdMap = new Map<number, number>();
    const evalIdMap = new Map<number, number>();
    const noteIdMap = new Map<number, number>();
    const goalIdMap = new Map<number, number>();
    const appointmentIdMap = new Map<number, number>();
    const invoiceIdMap = new Map<number, number>();
    const claimIdMap = new Map<number, number>();
    const stagedGoalIdMap = new Map<number, number>();

    // Helper: check if table exists in backup
    const backupTableExists = (name: string): boolean => {
      const row = backupDb.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name);
      return !!row;
    };

    // Helper: check if column exists in backup table
    const backupColumnExists = (table: string, col: string): boolean => {
      try {
        const cols = backupDb.pragma(`table_info(${table})`) as Array<{ name: string }>;
        return cols.some(c => c.name === col);
      } catch { return false; }
    };

    // Helper: remap a nullable FK
    const remap = (map: Map<number, number>, oldId: number | null): number | null => {
      if (oldId === null || oldId === undefined || oldId === 0) return null;
      return map.get(oldId) ?? null;
    };

    const importTransaction = db.transaction(() => {
      // 1. Collect entity IDs referenced by selected clients' records
      const entityIdsNeeded = new Set<number>();
      if (backupTableExists('contracted_entities')) {
        for (const cid of clientIds) {
          // Check notes, appointments, invoices for entity_id references
          const noteEntities = backupDb.prepare(
            "SELECT DISTINCT entity_id FROM notes WHERE client_id = ? AND entity_id IS NOT NULL AND deleted_at IS NULL"
          ).all(cid) as Array<{ entity_id: number }>;
          noteEntities.forEach(r => entityIdsNeeded.add(r.entity_id));

          if (backupTableExists('appointments') && backupColumnExists('appointments', 'entity_id')) {
            const apptEntities = backupDb.prepare(
              "SELECT DISTINCT entity_id FROM appointments WHERE client_id = ? AND entity_id IS NOT NULL AND deleted_at IS NULL"
            ).all(cid) as Array<{ entity_id: number }>;
            apptEntities.forEach(r => entityIdsNeeded.add(r.entity_id));
          }
        }
      }

      // 2. Import entities (match by name or create new)
      for (const oldEntityId of entityIdsNeeded) {
        const entity = backupDb.prepare("SELECT * FROM contracted_entities WHERE id = ?").get(oldEntityId) as any;
        if (!entity) continue;

        const existing = db.prepare(
          "SELECT id FROM contracted_entities WHERE LOWER(name) = LOWER(?) AND deleted_at IS NULL"
        ).get(entity.name) as any;

        if (existing) {
          entityIdMap.set(oldEntityId, existing.id);
        } else {
          const result = db.prepare(`
            INSERT INTO contracted_entities (name, contact_name, contact_email, contact_phone,
              billing_address_street, billing_address_city, billing_address_state, billing_address_zip,
              default_note_type, notes, created_at, updated_at, deleted_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            entity.name, entity.contact_name || '', entity.contact_email || '', entity.contact_phone || '',
            entity.billing_address_street || '', entity.billing_address_city || '', entity.billing_address_state || '', entity.billing_address_zip || '',
            entity.default_note_type || 'soap', entity.notes || '', entity.created_at, entity.updated_at, entity.deleted_at
          );
          entityIdMap.set(oldEntityId, Number(result.lastInsertRowid));
          counts.entities++;
        }
      }

      // 3. Import clients
      for (const oldClientId of clientIds) {
        const client = backupDb.prepare("SELECT * FROM clients WHERE id = ?").get(oldClientId) as any;
        if (!client) {
          warnings.push(`Client ID ${oldClientId} not found in backup`);
          continue;
        }

        const result = db.prepare(`
          INSERT INTO clients (first_name, last_name, dob, phone, email, address, city, state, zip, gender,
            primary_dx_code, primary_dx_description, secondary_dx, default_cpt_code,
            insurance_payer, insurance_member_id, insurance_group, insurance_payer_id,
            subscriber_relationship, subscriber_first_name, subscriber_last_name, subscriber_dob,
            referring_physician, referring_npi, referring_physician_qualifier, referral_source,
            stripe_customer_id, onset_date, onset_qualifier, employment_related, auto_accident,
            auto_accident_state, other_accident, claim_accept_assignment, patient_signature_source,
            insured_signature_source, prior_auth_number, additional_claim_info,
            service_facility_name, service_facility_npi,
            status, discipline, assigned_user_id, created_at, updated_at, deleted_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          client.first_name, client.last_name, client.dob || '', client.phone || '', client.email || '',
          client.address || '', client.city || '', client.state || '', client.zip || '', client.gender || '',
          client.primary_dx_code || '', client.primary_dx_description || '', client.secondary_dx || '[]', client.default_cpt_code || '',
          client.insurance_payer || '', client.insurance_member_id || '', client.insurance_group || '', client.insurance_payer_id || '',
          client.subscriber_relationship || '', client.subscriber_first_name || '', client.subscriber_last_name || '', client.subscriber_dob || '',
          client.referring_physician || '', client.referring_npi || '', client.referring_physician_qualifier || '', client.referral_source || '',
          client.stripe_customer_id || '', client.onset_date || '', client.onset_qualifier || '', client.employment_related || '',
          client.auto_accident || '', client.auto_accident_state || '', client.other_accident || '', client.claim_accept_assignment || '',
          client.patient_signature_source || '', client.insured_signature_source || '', client.prior_auth_number || '',
          client.additional_claim_info || '', client.service_facility_name || '', client.service_facility_npi || '',
          client.status || 'active', client.discipline || '', client.assigned_user_id, client.created_at, client.updated_at, client.deleted_at
        );
        clientIdMap.set(oldClientId, Number(result.lastInsertRowid));
        counts.clients++;
      }

      // 4. Import evaluations
      for (const oldClientId of clientIds) {
        const newClientId = clientIdMap.get(oldClientId);
        if (!newClientId) continue;

        const evals = backupDb.prepare("SELECT * FROM evaluations WHERE client_id = ?").all(oldClientId) as any[];
        for (const ev of evals) {
          const result = db.prepare(`
            INSERT INTO evaluations (client_id, eval_date, discipline, content, signature_image, signature_typed,
              signed_at, created_by_user_id, created_at, updated_at, deleted_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            newClientId, ev.eval_date, ev.discipline || '', ev.content || '', ev.signature_image || '',
            ev.signature_typed || '', ev.signed_at || '', ev.created_by_user_id, ev.created_at, ev.updated_at, ev.deleted_at
          );
          evalIdMap.set(ev.id, Number(result.lastInsertRowid));
          counts.evaluations++;
        }
      }

      // 5. Import notes
      for (const oldClientId of clientIds) {
        const newClientId = clientIdMap.get(oldClientId);
        if (!newClientId) continue;

        const notes = backupDb.prepare("SELECT * FROM notes WHERE client_id = ?").all(oldClientId) as any[];
        for (const note of notes) {
          const result = db.prepare(`
            INSERT INTO notes (client_id, date_of_service, time_in, time_out, units, cpt_code, cpt_codes,
              cpt_modifiers, charge_amount, place_of_service, diagnosis_pointers, rendering_provider_npi,
              subjective, objective, assessment, plan, goals_addressed,
              signature_image, signature_typed, signed_at, created_by_user_id,
              entity_id, rate_override, rate_override_reason,
              frequency_per_week, duration_weeks, frequency_notes,
              note_type, patient_name, progress_report_data, discharge_data,
              created_at, updated_at, deleted_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            newClientId, note.date_of_service || '', note.time_in || '', note.time_out || '',
            note.units || 0, note.cpt_code || '', note.cpt_codes || '[]',
            note.cpt_modifiers || '[]', note.charge_amount || 0, note.place_of_service || '',
            note.diagnosis_pointers || '[]', note.rendering_provider_npi || '',
            note.subjective || '', note.objective || '', note.assessment || '', note.plan || '',
            note.goals_addressed || '[]',
            note.signature_image || '', note.signature_typed || '', note.signed_at || '', note.created_by_user_id,
            remap(entityIdMap, note.entity_id), note.rate_override, note.rate_override_reason || '',
            note.frequency_per_week, note.duration_weeks, note.frequency_notes || '',
            note.note_type || 'soap', note.patient_name || '', note.progress_report_data || '', note.discharge_data || '',
            note.created_at, note.updated_at, note.deleted_at
          );
          noteIdMap.set(note.id, Number(result.lastInsertRowid));
          counts.notes++;
        }
      }

      // 6. Import goals
      for (const oldClientId of clientIds) {
        const newClientId = clientIdMap.get(oldClientId);
        if (!newClientId) continue;

        const goals = backupDb.prepare("SELECT * FROM goals WHERE client_id = ?").all(oldClientId) as any[];
        for (const goal of goals) {
          const sourceDocId = goal.source_document_type === 'eval'
            ? remap(evalIdMap, goal.source_document_id)
            : remap(noteIdMap, goal.source_document_id);

          const result = db.prepare(`
            INSERT INTO goals (client_id, goal_text, goal_type, category, status, target_date, met_date,
              measurement_type, baseline, target, baseline_value, target_value, instrument,
              pattern_id, components_json, created_by_user_id, source_document_id, source_document_type,
              created_at, deleted_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            newClientId, goal.goal_text || '', goal.goal_type || 'STG', goal.category || '',
            goal.status || 'active', goal.target_date || '', goal.met_date || '',
            goal.measurement_type || 'custom_text', goal.baseline || 0, goal.target || 0,
            goal.baseline_value || '', goal.target_value || '', goal.instrument || '',
            goal.pattern_id || '', goal.components_json || '', goal.created_by_user_id,
            sourceDocId, goal.source_document_type || '', goal.created_at, goal.deleted_at
          );
          goalIdMap.set(goal.id, Number(result.lastInsertRowid));
          counts.goals++;
        }
      }

      // 6b. Update goals_addressed JSON in imported notes
      for (const [oldNoteId, newNoteId] of noteIdMap.entries()) {
        const note = backupDb.prepare("SELECT goals_addressed FROM notes WHERE id = ?").get(oldNoteId) as any;
        if (!note?.goals_addressed) continue;
        try {
          const oldGoalIds: number[] = JSON.parse(note.goals_addressed);
          if (!Array.isArray(oldGoalIds) || oldGoalIds.length === 0) continue;
          const newGoalIds = oldGoalIds.map(id => goalIdMap.get(id)).filter(Boolean);
          db.prepare("UPDATE notes SET goals_addressed = ? WHERE id = ?").run(
            JSON.stringify(newGoalIds), newNoteId
          );
        } catch {}
      }

      // 7. Import appointments
      for (const oldClientId of clientIds) {
        const newClientId = clientIdMap.get(oldClientId);
        if (!newClientId) continue;

        const appts = backupDb.prepare("SELECT * FROM appointments WHERE client_id = ?").all(oldClientId) as any[];
        for (const appt of appts) {
          const result = db.prepare(`
            INSERT INTO appointments (client_id, scheduled_date, scheduled_time, duration_minutes, status,
              note_id, user_id, cancelled_at, cancellation_reason, late_cancel,
              entity_id, entity_rate, rate_override_reason, patient_name,
              visit_type, session_type, evaluation_id, created_at, deleted_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            newClientId, appt.scheduled_date || '', appt.scheduled_time || '', appt.duration_minutes || 60,
            appt.status || 'scheduled', remap(noteIdMap, appt.note_id), appt.user_id,
            appt.cancelled_at, appt.cancellation_reason || '', appt.late_cancel ? 1 : 0,
            remap(entityIdMap, appt.entity_id), appt.entity_rate, appt.rate_override_reason || '',
            appt.patient_name || '', appt.visit_type || 'O', appt.session_type || 'visit',
            remap(evalIdMap, appt.evaluation_id), appt.created_at, appt.deleted_at
          );
          appointmentIdMap.set(appt.id, Number(result.lastInsertRowid));
          counts.appointments++;
        }
      }

      // 8. Import invoices + invoice_items + payments
      if (backupTableExists('invoices')) {
        for (const oldClientId of clientIds) {
          const newClientId = clientIdMap.get(oldClientId);
          if (!newClientId) continue;

          const invoices = backupDb.prepare("SELECT * FROM invoices WHERE client_id = ?").all(oldClientId) as any[];
          for (const inv of invoices) {
            const result = db.prepare(`
              INSERT INTO invoices (client_id, entity_id, invoice_number, invoice_date, due_date,
                subtotal, discount_amount, total_amount, status, notes,
                stripe_invoice_id, stripe_payment_link_id, stripe_payment_link_url,
                created_at, updated_at, deleted_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              newClientId, remap(entityIdMap, inv.entity_id), inv.invoice_number || '',
              inv.invoice_date || '', inv.due_date || '', inv.subtotal || 0, inv.discount_amount || 0,
              inv.total_amount || 0, inv.status || 'draft', inv.notes || '',
              inv.stripe_invoice_id || '', inv.stripe_payment_link_id || '', inv.stripe_payment_link_url || '',
              inv.created_at, inv.updated_at, inv.deleted_at
            );
            invoiceIdMap.set(inv.id, Number(result.lastInsertRowid));
            counts.invoices++;

            // Invoice items
            if (backupTableExists('invoice_items')) {
              const items = backupDb.prepare("SELECT * FROM invoice_items WHERE invoice_id = ?").all(inv.id) as any[];
              for (const item of items) {
                db.prepare(`
                  INSERT INTO invoice_items (invoice_id, note_id, description, cpt_code, service_date, units, unit_price, amount, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                  invoiceIdMap.get(inv.id), remap(noteIdMap, item.note_id),
                  item.description || '', item.cpt_code || '', item.service_date || '',
                  item.units || 0, item.unit_price || 0, item.amount || 0, item.created_at
                );
              }
            }
          }

          // Payments
          if (backupTableExists('payments')) {
            const payments = backupDb.prepare("SELECT * FROM payments WHERE client_id = ?").all(oldClientId) as any[];
            for (const pmt of payments) {
              db.prepare(`
                INSERT INTO payments (client_id, invoice_id, payment_date, amount, payment_method, reference_number,
                  stripe_payment_intent_id, notes, created_at, deleted_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                newClientId, remap(invoiceIdMap, pmt.invoice_id), pmt.payment_date || '', pmt.amount || 0,
                pmt.payment_method || 'cash', pmt.reference_number || '',
                pmt.stripe_payment_intent_id || '', pmt.notes || '', pmt.created_at, pmt.deleted_at
              );
              counts.payments++;
            }
          }
        }
      }

      // 9. Import remaining FK tables (authorizations, claims, compliance, communication_log, mileage, discounts, documents, staged goals, etc.)
      for (const oldClientId of clientIds) {
        const newClientId = clientIdMap.get(oldClientId);
        if (!newClientId) continue;

        // Authorizations
        if (backupTableExists('authorizations')) {
          const auths = backupDb.prepare("SELECT * FROM authorizations WHERE client_id = ?").all(oldClientId) as any[];
          for (const auth of auths) {
            db.prepare(`
              INSERT INTO authorizations (client_id, entity_id, payer_name, payer_id, auth_number,
                start_date, end_date, units_approved, units_used, cpt_codes, status, notes,
                created_at, updated_at, deleted_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              newClientId, remap(entityIdMap, auth.entity_id), auth.payer_name || '', auth.payer_id || '',
              auth.auth_number || '', auth.start_date || '', auth.end_date || '',
              auth.units_approved || 0, auth.units_used || 0, auth.cpt_codes || '[]',
              auth.status || 'active', auth.notes || '', auth.created_at, auth.updated_at, auth.deleted_at
            );
          }
        }

        // Claims + claim_lines
        if (backupTableExists('claims')) {
          const claims = backupDb.prepare("SELECT * FROM claims WHERE client_id = ?").all(oldClientId) as any[];
          for (const claim of claims) {
            const result = db.prepare(`
              INSERT INTO claims (client_id, claim_number, clearinghouse_claim_id, payer_claim_number,
                payer_name, payer_id, service_date_start, service_date_end, total_charge, status,
                submitted_at, accepted_at, paid_at, rejection_codes, rejection_reasons,
                paid_amount, adjustment_amount, patient_responsibility, era_id,
                edi_837_content, edi_835_content, created_at, updated_at, deleted_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              newClientId, claim.claim_number || '', claim.clearinghouse_claim_id || '', claim.payer_claim_number || '',
              claim.payer_name || '', claim.payer_id || '', claim.service_date_start || '', claim.service_date_end || '',
              claim.total_charge || 0, claim.status || 'draft',
              claim.submitted_at, claim.accepted_at, claim.paid_at, claim.rejection_codes || '[]',
              claim.rejection_reasons || '[]', claim.paid_amount || 0, claim.adjustment_amount || 0,
              claim.patient_responsibility || 0, claim.era_id,
              claim.edi_837_content || '', claim.edi_835_content || '', claim.created_at, claim.updated_at, claim.deleted_at
            );
            claimIdMap.set(claim.id, Number(result.lastInsertRowid));

            if (backupTableExists('claim_lines')) {
              const lines = backupDb.prepare("SELECT * FROM claim_lines WHERE claim_id = ?").all(claim.id) as any[];
              for (const line of lines) {
                db.prepare(`
                  INSERT INTO claim_lines (claim_id, note_id, line_number, service_date, cpt_code, modifiers,
                    units, charge_amount, diagnosis_pointers, place_of_service,
                    paid_amount, adjustment_amount, adjustment_reason_codes, patient_responsibility, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
                `).run(
                  claimIdMap.get(claim.id), remap(noteIdMap, line.note_id), line.line_number || 0,
                  line.service_date || '', line.cpt_code || '', line.modifiers || '[]',
                  line.units || 0, line.charge_amount || 0, line.diagnosis_pointers || '[]',
                  line.place_of_service || '', line.paid_amount || 0, line.adjustment_amount || 0,
                  line.adjustment_reason_codes || '[]', line.patient_responsibility || 0, line.created_at
                );
              }
            }
          }
        }

        // Compliance tracking
        if (backupTableExists('compliance_tracking')) {
          const comp = backupDb.prepare("SELECT * FROM compliance_tracking WHERE client_id = ?").all(oldClientId) as any[];
          for (const c of comp) {
            db.prepare(`
              INSERT INTO compliance_tracking (client_id, tracking_enabled, compliance_preset,
                progress_visit_threshold, progress_day_threshold, recert_day_threshold,
                visits_since_last_progress, last_progress_date, last_recert_date,
                next_progress_due, next_recert_due, recert_md_signature_received,
                physician_order_required, physician_order_expiration, physician_order_document_id,
                created_at, updated_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              newClientId, c.tracking_enabled ? 1 : 0, c.compliance_preset || 'none',
              c.progress_visit_threshold || 10, c.progress_day_threshold || 30, c.recert_day_threshold || 90,
              c.visits_since_last_progress || 0, c.last_progress_date, c.last_recert_date,
              c.next_progress_due, c.next_recert_due, c.recert_md_signature_received ? 1 : 0,
              c.physician_order_required ? 1 : 0, c.physician_order_expiration, null,
              c.created_at, c.updated_at
            );
          }
        }

        // Communication log
        if (backupTableExists('communication_log')) {
          const logs = backupDb.prepare("SELECT * FROM communication_log WHERE client_id = ?").all(oldClientId) as any[];
          for (const log of logs) {
            db.prepare(`
              INSERT INTO communication_log (client_id, entity_id, communication_date, type, direction,
                contact_name, summary, created_at, deleted_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              newClientId, remap(entityIdMap, log.entity_id), log.communication_date || '',
              log.type || 'other', log.direction || 'outgoing', log.contact_name || '',
              log.summary || '', log.created_at, log.deleted_at
            );
          }
        }

        // Mileage
        if (backupTableExists('mileage_log')) {
          const miles = backupDb.prepare("SELECT * FROM mileage_log WHERE client_id = ?").all(oldClientId) as any[];
          for (const m of miles) {
            db.prepare(`
              INSERT INTO mileage_log (date, appointment_id, client_id, entity_id,
                origin_address, destination_address, miles, reimbursement_rate, reimbursement_amount,
                is_reimbursable, notes, created_at, deleted_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              m.date || '', remap(appointmentIdMap, m.appointment_id), newClientId,
              remap(entityIdMap, m.entity_id), m.origin_address || '', m.destination_address || '',
              m.miles || 0, m.reimbursement_rate, m.reimbursement_amount,
              m.is_reimbursable ? 1 : 0, m.notes || '', m.created_at, m.deleted_at
            );
          }
        }

        // Client discounts
        if (backupTableExists('client_discounts')) {
          const discounts = backupDb.prepare("SELECT * FROM client_discounts WHERE client_id = ?").all(oldClientId) as any[];
          for (const d of discounts) {
            db.prepare(`
              INSERT INTO client_discounts (client_id, discount_type, label, total_sessions, paid_sessions,
                sessions_used, session_rate, flat_rate, flat_rate_sessions, flat_rate_sessions_used,
                discount_percent, discount_fixed, start_date, end_date, status, notes,
                created_at, updated_at, deleted_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              newClientId, d.discount_type || 'package', d.label || '', d.total_sessions, d.paid_sessions,
              d.sessions_used || 0, d.session_rate, d.flat_rate, d.flat_rate_sessions, d.flat_rate_sessions_used || 0,
              d.discount_percent, d.discount_fixed, d.start_date, d.end_date, d.status || 'active',
              d.notes || '', d.created_at, d.updated_at, d.deleted_at
            );
          }
        }

        // Client documents (DB records only — physical file copying deferred)
        const docs = backupDb.prepare("SELECT * FROM client_documents WHERE client_id = ?").all(oldClientId) as any[];
        for (const doc of docs) {
          db.prepare(`
            INSERT INTO client_documents (client_id, filename, original_name, file_type, file_size, category, notes, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          `).run(
            newClientId, doc.filename || '', doc.original_name || '', doc.file_type || '',
            doc.file_size || 0, doc.category || 'other', doc.notes || '', doc.created_at
          );
          counts.documents++;
        }
        if (docs.length > 0) {
          const docClient = backupDb.prepare("SELECT first_name, last_name FROM clients WHERE id = ?").get(oldClientId) as any;
          warnings.push(`${docs.length} document records imported for ${docClient?.first_name || 'client'} — physical files may need to be re-uploaded.`);
        }

        // Staged goals
        if (backupTableExists('staged_goals')) {
          const staged = backupDb.prepare("SELECT * FROM staged_goals WHERE client_id = ?").all(oldClientId) as any[];
          for (const sg of staged) {
            const result = db.prepare(`
              INSERT INTO staged_goals (client_id, goal_text, goal_type, category, rationale,
                flagged_at, flagged_from_note_id, status, promoted_at, promoted_in_note_id,
                promoted_to_goal_id, dismissed_at, dismiss_reason, created_at, deleted_at)
              VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            `).run(
              newClientId, sg.goal_text || '', sg.goal_type || 'STG', sg.category || '',
              sg.rationale || '', sg.flagged_at || '', remap(noteIdMap, sg.flagged_from_note_id),
              sg.status || 'staged', sg.promoted_at, remap(noteIdMap, sg.promoted_in_note_id),
              remap(goalIdMap, sg.promoted_to_goal_id), sg.dismissed_at, sg.dismiss_reason || '',
              sg.created_at, sg.deleted_at
            );
            stagedGoalIdMap.set(sg.id, Number(result.lastInsertRowid));
          }
        }

        // Progress report goals
        if (backupTableExists('progress_report_goals')) {
          // Only import for notes that were imported
          for (const [oldNoteId, newNoteId] of noteIdMap.entries()) {
            const prGoals = backupDb.prepare("SELECT * FROM progress_report_goals WHERE note_id = ?").all(oldNoteId) as any[];
            for (const prg of prGoals) {
              // Only import if the referenced client matches
              const noteClient = backupDb.prepare("SELECT client_id FROM notes WHERE id = ?").get(oldNoteId) as any;
              if (!noteClient || noteClient.client_id !== oldClientId) continue;

              db.prepare(`
                INSERT INTO progress_report_goals (note_id, goal_id, status_at_report, performance_data,
                  clinical_notes, goal_text_snapshot, measurement_type, current_value, current_numeric,
                  baseline_value_snapshot, target_value_snapshot, baseline_snapshot, target_snapshot,
                  is_new_goal, is_staged_promotion, staged_goal_id, created_at, deleted_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                newNoteId, remap(goalIdMap, prg.goal_id), prg.status_at_report || 'progressing',
                prg.performance_data || '', prg.clinical_notes || '', prg.goal_text_snapshot || '',
                prg.measurement_type || 'custom_text', prg.current_value || '', prg.current_numeric || 0,
                prg.baseline_value_snapshot || '', prg.target_value_snapshot || '',
                prg.baseline_snapshot || 0, prg.target_snapshot || 0,
                prg.is_new_goal ? 1 : 0, prg.is_staged_promotion ? 1 : 0,
                remap(stagedGoalIdMap, prg.staged_goal_id), prg.created_at, prg.deleted_at
              );
            }
          }
        }

        // Goal progress history
        if (backupTableExists('goal_progress_history')) {
          for (const [oldGoalId, newGoalId] of goalIdMap.entries()) {
            const entries = backupDb.prepare("SELECT * FROM goal_progress_history WHERE goal_id = ?").all(oldGoalId) as any[];
            for (const entry of entries) {
              // Only import for goals belonging to this client
              const goal = backupDb.prepare("SELECT client_id FROM goals WHERE id = ?").get(oldGoalId) as any;
              if (!goal || goal.client_id !== oldClientId) continue;

              db.prepare(`
                INSERT INTO goal_progress_history (goal_id, client_id, recorded_date, measurement_type,
                  value, numeric_value, instrument, source_type, source_document_id)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                newGoalId, newClientId, entry.recorded_date || '', entry.measurement_type || '',
                entry.value || '', entry.numeric_value || 0, entry.instrument || '',
                entry.source_type || '', remap(noteIdMap, entry.source_document_id) ?? remap(evalIdMap, entry.source_document_id)
              );
            }
          }
        }

        // Note amendments
        if (backupTableExists('note_amendments')) {
          for (const [oldNoteId, newNoteId] of noteIdMap.entries()) {
            const noteClient = backupDb.prepare("SELECT client_id FROM notes WHERE id = ?").get(oldNoteId) as any;
            if (!noteClient || noteClient.client_id !== oldClientId) continue;

            const amendments = backupDb.prepare("SELECT * FROM note_amendments WHERE note_id = ?").all(oldNoteId) as any[];
            for (const am of amendments) {
              db.prepare(`
                INSERT INTO note_amendments (note_id, amendment_text, reason, amended_by_name,
                  signature_typed, signature_image, signed_at, content_hash, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                newNoteId, am.amendment_text || '', am.reason || '', am.amended_by_name || '',
                am.signature_typed || '', am.signature_image || '', am.signed_at || '',
                am.content_hash || '', am.created_at
              );
            }
          }
        }
      }
    });

    importTransaction();

    return { success: true, ...counts, warnings };
  } catch (err: any) {
    return {
      success: false, ...counts,
      warnings: [...warnings, `Import failed: ${err.message || 'Unknown error'}`],
    };
  } finally {
    try { backupDb.close(); } catch {}
  }
}
