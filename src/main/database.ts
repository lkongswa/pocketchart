import Database from 'better-sqlite3';
import path from 'path';
import { app } from 'electron';
import Store from 'electron-store';
import { seedDefaultData, seedDefaultQuickChips, seedPayers, seedFeeSchedule, seedMFTData, seedCategoryAlignedPhrases, autoFixFeeSchedule } from './seed';

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
  // V2 Pro tables
  'contracted_entities', 'entity_fee_schedules', 'entity_documents',
  'vault_documents', 'compliance_tracking', 'mileage_log', 'communication_log',
  // V5 Progress Report tables
  'staged_goals', 'progress_report_goals',
  // Discount system
  'client_discounts', 'discount_templates',
  // V6 Amendments
  'note_amendments',
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
  seedDefaultQuickChips(db);
  seedMFTData(db);
  seedCategoryAlignedPhrases(db);
  // V2/V3 billing seed data (run after migrations create tables)
  seedPayers(db);
  seedFeeSchedule(db);
  autoFixFeeSchedule(db);
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
