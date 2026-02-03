export type Discipline = 'PT' | 'OT' | 'ST';
export type ClientStatus = 'active' | 'discharged' | 'hold';
export type GoalType = 'STG' | 'LTG';
export type GoalStatus = 'active' | 'met' | 'discontinued' | 'modified';
export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'no-show';
export type SOAPSection = 'S' | 'O' | 'A' | 'P';

// V2/V3 Billing Types

// Gender for 837P compliance
export type Gender = 'M' | 'F' | 'U' | '';

// Subscriber relationship codes (SBR segment)
export type SubscriberRelationship =
  | '18' // Self
  | '01' // Spouse
  | '19' // Child
  | '20' // Employee
  | '21' // Unknown
  | 'G8' // Other
  | '';

// Place of service codes
export type PlaceOfService =
  | '02' // Telehealth (other than home)
  | '10' // Telehealth in patient home
  | '11' // Office
  | '12' // Home
  | '22' // Outpatient hospital
  | '31' // Skilled nursing facility
  | '32' // Nursing facility
  | '99' // Other
  | '';

// Common CPT modifiers for therapy
export type CPTModifier =
  | '59' // Distinct procedural service
  | '76' // Repeat procedure same physician
  | '77' // Repeat procedure different physician
  | 'GP' // Physical therapy services
  | 'GO' // Occupational therapy services
  | 'GN' // Speech-language pathology services
  | 'KX' // Requirements met
  | 'CO' // Concurrent outpatient rehab
  | '';

// Invoice status
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'partial' | 'void' | 'overdue';

// Payment method
export type PaymentMethod = 'card' | 'cash' | 'check' | 'insurance' | 'other';

// Claim status
export type ClaimStatus =
  | 'draft'
  | 'ready'
  | 'submitted'
  | 'accepted'
  | 'rejected'
  | 'pending'
  | 'paid'
  | 'denied'
  | 'appealed'
  | 'void';

// Authorization status
export type AuthorizationStatus = 'active' | 'expired' | 'exhausted' | 'pending';

// Payer enrollment status
export type EnrollmentStatus = 'not_started' | 'pending' | 'active' | 'rejected';

export interface CptLine {
  code: string;
  units: number;
}

export interface EvalGoalEntry {
  goal_text: string;
  goal_type: GoalType;
  category: string;
  target_date: string;
}

export interface Practice {
  id: number;
  name: string;
  address: string;
  city: string;           // V2/V3: EDI-ready
  state: string;          // V2/V3: EDI-ready
  zip: string;            // V2/V3: EDI-ready
  phone: string;
  npi: string;
  tax_id: string;
  license_number: string;
  license_state: string;
  discipline: Discipline | 'MULTI';
  taxonomy_code: string;  // V2/V3: EDI-ready
}

export interface Client {
  id: number;
  first_name: string;
  last_name: string;
  dob: string;
  phone: string;
  email: string;
  address: string;
  city: string;                              // V2/V3: EDI-ready
  state: string;                             // V2/V3: EDI-ready
  zip: string;                               // V2/V3: EDI-ready
  gender: Gender;                            // V2/V3: EDI-ready
  primary_dx_code: string;
  primary_dx_description: string;
  secondary_dx: string; // JSON array
  default_cpt_code: string;
  insurance_payer: string;
  insurance_member_id: string;
  insurance_group: string;
  insurance_payer_id: string;                // V2/V3: EDI payer ID
  subscriber_relationship: SubscriberRelationship; // V2/V3: EDI-ready
  subscriber_first_name: string;             // V2/V3: EDI-ready
  subscriber_last_name: string;              // V2/V3: EDI-ready
  subscriber_dob: string;                    // V2/V3: EDI-ready
  referring_physician: string;
  referring_npi: string;
  referral_source: string;                   // V2/V3: Tracking
  stripe_customer_id: string;                // V2: Stripe integration
  status: ClientStatus;
  discipline: Discipline;
  assigned_user_id: number | null;           // V4: Multi-provider
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Goal {
  id: number;
  client_id: number;
  goal_text: string;
  goal_type: GoalType;
  category: string;
  status: GoalStatus;
  target_date: string;
  met_date: string;
  created_by_user_id: number | null;         // V4: Multi-provider
  created_at: string;
  deleted_at: string | null;
}

export interface Evaluation {
  id: number;
  client_id: number;
  eval_date: string;
  discipline: Discipline;
  content: string; // JSON blob
  signature_image: string;
  signature_typed: string;
  signed_at: string;
  created_by_user_id: number | null;         // V4: Multi-provider
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Note {
  id: number;
  client_id: number;
  date_of_service: string;
  time_in: string;
  time_out: string;
  units: number;
  cpt_code: string;
  cpt_codes: string; // JSON array of CptLine[]
  cpt_modifiers: string;                     // V2/V3: JSON array like ["GN", "59"]
  charge_amount: number;                     // V2/V3: Charge per service
  place_of_service: PlaceOfService;          // V2/V3: EDI-ready
  diagnosis_pointers: string;                // V2/V3: JSON array like [1] or [1,2]
  rendering_provider_npi: string;            // V2/V3: EDI-ready
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  goals_addressed: string; // JSON array of goal IDs
  signature_image: string;
  signature_typed: string;
  signed_at: string;
  created_by_user_id: number | null;         // V4: Multi-provider
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Appointment {
  id: number;
  client_id: number;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  status: AppointmentStatus;
  note_id: number | null;
  user_id: number | null;                    // V4: Multi-provider
  cancelled_at: string | null;               // V2/V3: Cancellation tracking
  cancellation_reason: string;               // V2/V3: Cancellation tracking
  late_cancel: boolean;                      // V2/V3: Cancellation tracking
  created_at: string;
  deleted_at: string | null;
  // Joined fields
  first_name?: string;
  last_name?: string;
  client_discipline?: Discipline;
}

export interface NoteBankEntry {
  id: number;
  discipline: Discipline | 'ALL';
  category: string;
  section: SOAPSection;
  phrase: string;
  is_default: boolean;
  is_favorite: boolean;
  created_at: string;
}

export interface GoalsBankEntry {
  id: number;
  discipline: Discipline;
  category: string;
  goal_template: string;
  is_default: boolean;
  created_at: string;
}

// Client Document types
export interface ClientDocument {
  id: number;
  client_id: number;
  filename: string;
  original_name: string;
  file_type: string;
  file_size: number;
  category: string;
  notes: string;
  created_at: string;
}

// Superbill types
export interface SuperbillGenerateRequest {
  clientId: number;
  noteIds: number[];
  practiceInfo?: Partial<Practice>;
}

export interface SuperbillSaveRequest {
  base64Pdf: string;
  filename: string;
}

export interface SuperbillBulkRequest {
  clientId: number;
  startDate: string;
  endDate: string;
}

export interface SuperbillResult {
  base64Pdf: string;
  filename: string;
}

export interface PinSetupResult {
  success: boolean;
  error?: string;
}

export type AppTier = 'free' | 'pro';

export interface LicenseStatus {
  tier: AppTier;
  licenseKey: string | null;
  activatedAt: string | null;
}

export interface LicenseActivateResult {
  success: boolean;
  tier: AppTier;
}

// V2 Billing Interfaces

export interface FeeScheduleEntry {
  id: number;
  cpt_code: string;
  description: string;
  default_units: number;
  amount: number;
  effective_date: string;
  created_at: string;
  deleted_at: string | null;
}

export interface Invoice {
  id: number;
  client_id: number;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  status: InvoiceStatus;
  notes: string;
  stripe_invoice_id: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface InvoiceItem {
  id: number;
  invoice_id: number;
  note_id: number | null;
  description: string;
  cpt_code: string;
  service_date: string;
  units: number;
  unit_price: number;
  amount: number;
  created_at: string;
}

export interface Payment {
  id: number;
  client_id: number;
  invoice_id: number | null;
  payment_date: string;
  amount: number;
  payment_method: PaymentMethod;
  reference_number: string;
  stripe_payment_intent_id: string;
  notes: string;
  created_at: string;
  deleted_at: string | null;
}

// V3 Insurance Billing Interfaces

export interface Payer {
  id: number;
  name: string;
  edi_payer_id: string;
  clearinghouse: string;
  enrollment_required: boolean;
  enrollment_status: EnrollmentStatus;
  enrollment_date: string;
  notes: string;
  created_at: string;
}

export interface Authorization {
  id: number;
  client_id: number;
  payer_name: string;
  payer_id: string;
  auth_number: string;
  start_date: string;
  end_date: string;
  units_approved: number;
  units_used: number;
  cpt_codes: string; // JSON array
  status: AuthorizationStatus;
  notes: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface Claim {
  id: number;
  client_id: number;
  claim_number: string;
  clearinghouse_claim_id: string;
  payer_claim_number: string;
  payer_name: string;
  payer_id: string;
  service_date_start: string;
  service_date_end: string;
  total_charge: number;
  status: ClaimStatus;
  submitted_at: string | null;
  accepted_at: string | null;
  paid_at: string | null;
  rejection_codes: string; // JSON array
  rejection_reasons: string; // JSON array
  paid_amount: number;
  adjustment_amount: number;
  patient_responsibility: number;
  era_id: number | null;
  edi_837_content: string;
  edi_835_content: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface ClaimLine {
  id: number;
  claim_id: number;
  note_id: number | null;
  line_number: number;
  service_date: string;
  cpt_code: string;
  modifiers: string; // JSON array
  units: number;
  charge_amount: number;
  diagnosis_pointers: string; // JSON array
  place_of_service: PlaceOfService;
  paid_amount: number;
  adjustment_amount: number;
  adjustment_reason_codes: string; // JSON array
  patient_responsibility: number;
  created_at: string;
}

// Audit Log
export interface AuditLogEntry {
  id: number;
  entity_type: string;
  entity_id: number | null;
  action: string;
  old_values: string | null; // JSON
  new_values: string | null; // JSON
  user_id: number | null;
  client_id: number | null;
  amount: number | null;
  description: string | null;
  ip_address: string | null;
  created_at: string;
}

// API interface exposed through preload
export interface PocketChartAPI {
  app: {
    getVersion: () => Promise<string>;
  };
  practice: {
    get: () => Promise<Practice | null>;
    save: (data: Partial<Practice>) => Promise<Practice>;
  };
  clients: {
    list: (filters?: { status?: string; discipline?: string; search?: string }) => Promise<Client[]>;
    get: (id: number) => Promise<Client>;
    create: (data: Partial<Client>) => Promise<Client>;
    update: (id: number, data: Partial<Client>) => Promise<Client>;
    delete: (id: number) => Promise<boolean>;
  };
  goals: {
    listByClient: (clientId: number) => Promise<Goal[]>;
    create: (data: Partial<Goal>) => Promise<Goal>;
    update: (id: number, data: Partial<Goal>) => Promise<Goal>;
    delete: (id: number) => Promise<boolean>;
  };
  notes: {
    listByClient: (clientId: number) => Promise<Note[]>;
    get: (id: number) => Promise<Note>;
    create: (data: Partial<Note>) => Promise<Note>;
    update: (id: number, data: Partial<Note>) => Promise<Note>;
    delete: (id: number) => Promise<boolean>;
  };
  evaluations: {
    listByClient: (clientId: number) => Promise<Evaluation[]>;
    get: (id: number) => Promise<Evaluation>;
    create: (data: Partial<Evaluation>) => Promise<Evaluation>;
    update: (id: number, data: Partial<Evaluation>) => Promise<Evaluation>;
    delete: (id: number) => Promise<boolean>;
  };
  appointments: {
    list: (filters?: { startDate?: string; endDate?: string; clientId?: number }) => Promise<Appointment[]>;
    create: (data: Partial<Appointment>) => Promise<Appointment>;
    update: (id: number, data: Partial<Appointment>) => Promise<Appointment>;
    delete: (id: number) => Promise<boolean>;
  };
  noteBank: {
    list: (filters?: { discipline?: string; section?: string; category?: string }) => Promise<NoteBankEntry[]>;
    create: (data: Partial<NoteBankEntry>) => Promise<NoteBankEntry>;
    update: (id: number, data: Partial<NoteBankEntry>) => Promise<NoteBankEntry>;
    delete: (id: number) => Promise<boolean>;
    toggleFavorite: (id: number) => Promise<NoteBankEntry>;
  };
  goalsBank: {
    list: (filters?: { discipline?: string; category?: string }) => Promise<GoalsBankEntry[]>;
    create: (data: Partial<GoalsBankEntry>) => Promise<GoalsBankEntry>;
    update: (id: number, data: Partial<GoalsBankEntry>) => Promise<GoalsBankEntry>;
    delete: (id: number) => Promise<boolean>;
  };
  settings: {
    get: (key: string) => Promise<string | null>;
    set: (key: string, value: string) => Promise<boolean>;
  };
  superbill: {
    generate: (data: SuperbillGenerateRequest) => Promise<SuperbillResult>;
    save: (data: SuperbillSaveRequest) => Promise<boolean>;
    generateBulk: (data: SuperbillBulkRequest) => Promise<SuperbillResult>;
  };
  backup: {
    exportManual: () => Promise<string | null>;
    getDbPath: () => Promise<string>;
    exportClientPdf: (data: { clientId: number }) => Promise<string>;
    savePdf: (data: { base64Pdf: string; defaultFilename: string }) => Promise<string | null>;
    exportCsv: () => Promise<string | null>;
    exportAllChartsPdf: () => Promise<{ path: string; clientCount: number } | null>;
  };
  storage: {
    getDataPath: () => Promise<string>;
    setDataPath: () => Promise<string | null>;
    getDefaultPath: () => Promise<string>;
    resetDataPath: () => Promise<string>;
  };
  logo: {
    upload: () => Promise<string | null>;
    get: () => Promise<string | null>;
    getBase64: () => Promise<string | null>;
    remove: () => Promise<boolean>;
  };
  security: {
    isPinEnabled: () => Promise<boolean>;
    setPin: (newPin: string, currentPin?: string) => Promise<PinSetupResult>;
    verifyPin: (pin: string) => Promise<boolean>;
    removePin: (currentPin: string) => Promise<PinSetupResult>;
    requestPinReset: () => Promise<{ success: boolean; filePath?: string }>;
    verifyRecoveryToken: (token: string) => Promise<{ success: boolean; error?: string }>;
    getTimeoutMinutes: () => Promise<number>;
    setTimeoutMinutes: (minutes: number) => Promise<boolean>;
  };
  documents: {
    upload: (data: { clientId: number; category?: string }) => Promise<ClientDocument | null>;
    list: (data: { clientId: number }) => Promise<ClientDocument[]>;
    open: (data: { documentId: number }) => Promise<string>;
    delete: (data: { documentId: number }) => Promise<boolean>;
    getPath: (data: { documentId: number }) => Promise<string>;
  };
  license: {
    getStatus: () => Promise<LicenseStatus>;
    activate: (licenseKey: string) => Promise<LicenseActivateResult>;
    deactivate: () => Promise<LicenseActivateResult>;
  };
  secureStorage: {
    /** Check if OS-level encryption is available */
    isAvailable: () => Promise<boolean>;
    /** Store a value securely (encrypted at rest) */
    set: (key: string, value: string) => Promise<boolean>;
    /** Retrieve a securely stored value (decrypted) */
    get: (key: string) => Promise<string | null>;
    /** Get a masked version of a secret for display (e.g., sk_live_...1234) */
    getMasked: (key: string) => Promise<string | null>;
    /** Delete a securely stored value */
    delete: (key: string) => Promise<boolean>;
    /** Check if a key exists in secure storage */
    exists: (key: string) => Promise<boolean>;
  };
  // V2 Billing APIs
  feeSchedule: {
    list: () => Promise<FeeScheduleEntry[]>;
    get: (id: number) => Promise<FeeScheduleEntry>;
    create: (data: Partial<FeeScheduleEntry>) => Promise<FeeScheduleEntry>;
    update: (id: number, data: Partial<FeeScheduleEntry>) => Promise<FeeScheduleEntry>;
    delete: (id: number) => Promise<boolean>;
  };
  invoices: {
    list: (filters?: { clientId?: number; status?: InvoiceStatus; startDate?: string; endDate?: string }) => Promise<Invoice[]>;
    get: (id: number) => Promise<Invoice & { items: InvoiceItem[] }>;
    create: (data: Partial<Invoice>, items: Partial<InvoiceItem>[]) => Promise<Invoice>;
    update: (id: number, data: Partial<Invoice>) => Promise<Invoice>;
    delete: (id: number) => Promise<boolean>;
    generateFromNotes: (clientId: number, noteIds: number[]) => Promise<Invoice>;
    generatePdf: (invoiceId: number) => Promise<{ base64Pdf: string; filename: string }>;
    savePdf: (data: { base64Pdf: string; filename: string }) => Promise<string | null>;
  };
  payments: {
    list: (filters?: { clientId?: number; startDate?: string; endDate?: string }) => Promise<Payment[]>;
    create: (data: Partial<Payment>) => Promise<Payment>;
    delete: (id: number) => Promise<boolean>;
  };
  // V3 Insurance Billing APIs
  authorizations: {
    listByClient: (clientId: number) => Promise<Authorization[]>;
    create: (data: Partial<Authorization>) => Promise<Authorization>;
    update: (id: number, data: Partial<Authorization>) => Promise<Authorization>;
    delete: (id: number) => Promise<boolean>;
  };
  claims: {
    list: (filters?: { clientId?: number; status?: ClaimStatus; startDate?: string; endDate?: string }) => Promise<Claim[]>;
    get: (id: number) => Promise<Claim & { lines: ClaimLine[] }>;
    create: (data: Partial<Claim>, lines: Partial<ClaimLine>[]) => Promise<Claim>;
    update: (id: number, data: Partial<Claim>) => Promise<Claim>;
    delete: (id: number) => Promise<boolean>;
  };
  payers: {
    list: () => Promise<Payer[]>;
    create: (data: Partial<Payer>) => Promise<Payer>;
    update: (id: number, data: Partial<Payer>) => Promise<Payer>;
    delete: (id: number) => Promise<boolean>;
  };
  auditLog: {
    list: (filters?: {
      entityType?: string;
      entityId?: number;
      clientId?: number;
      startDate?: string;
      endDate?: string;
      limit?: number;
    }) => Promise<AuditLogEntry[]>;
    create: (data: {
      entityType: string;
      entityId?: number;
      action: string;
      oldValues?: any;
      newValues?: any;
      clientId?: number;
      amount?: number;
      description?: string;
    }) => Promise<AuditLogEntry>;
  };
  update: {
    check: () => Promise<{ updateAvailable: boolean }>;
    download: () => Promise<boolean>;
    install: () => void;
    onAvailable: (callback: (info: { version: string; releaseNotes?: string; releaseDate?: string }) => void) => void;
    onNotAvailable: (callback: () => void) => void;
    onProgress: (callback: (progress: { percent: number; transferred: number; total: number }) => void) => void;
    onDownloaded: (callback: (info: { version: string }) => void) => void;
  };
}

declare global {
  interface Window {
    api: PocketChartAPI;
  }
}
