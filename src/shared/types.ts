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
  // Contractor module fields
  entity_id: number | null;
  rate_override: number | null;
  rate_override_reason: string;
  // Frequency/duration structured data (for evals/progress reports)
  frequency_per_week: number | null;
  duration_weeks: number | null;
  frequency_notes: string;
  // Note type for compliance engine
  note_type: 'soap' | 'progress_report' | 'recertification' | 'discharge';
  patient_name: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  // Joined fields
  entity_name?: string;
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
  // Contractor module fields
  entity_id: number | null;
  entity_rate: number | null;
  rate_override_reason: string;
  patient_name: string;
  created_at: string;
  deleted_at: string | null;
  // Joined fields
  first_name?: string;
  last_name?: string;
  client_discipline?: Discipline;
  entity_name?: string;
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

export type AppTier = 'unlicensed' | 'basic' | 'pro';

export interface LicenseStatus {
  tier: AppTier;
  licenseKey: string | null;
  activatedAt: string | null;
  subscriptionStatus: 'active' | 'expired' | 'cancelled' | null;
  subscriptionExpiresAt: string | null;
  lastValidatedAt: string | null;
}

export interface LicenseActivateResult {
  success: boolean;
  tier: AppTier;
  error?: string;
}

// ── Contractor Module Types ──

export interface ContractedEntity {
  id: number;
  name: string;
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  billing_address_street: string;
  billing_address_city: string;
  billing_address_state: string;
  billing_address_zip: string;
  default_note_type: 'soap' | 'evaluation' | 'progress_report';
  notes: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export type EntityFeeUnit = 'per_visit' | 'per_hour' | 'per_unit';

export interface EntityFeeSchedule {
  id: number;
  entity_id: number;
  service_type: string;
  cpt_code: string;
  description: string;
  default_rate: number;
  unit: EntityFeeUnit;
  effective_date: string;
  notes: string;
  created_at: string;
  deleted_at: string | null;
}

export type EntityDocumentCategory = 'contract' | 'credentialing' | 'w9' | 'other';

export interface EntityDocument {
  id: number;
  entity_id: number;
  filename: string;
  original_name: string;
  file_path: string;
  category: EntityDocumentCategory;
  expiration_date: string | null;
  notes: string;
  uploaded_at: string;
  deleted_at: string | null;
}

// ── Professional Vault Types ──

export type VaultDocumentType =
  | 'state_license'
  | 'malpractice_insurance'
  | 'asha_certification'
  | 'npi_confirmation'
  | 'tb_test'
  | 'flu_shot'
  | 'cpr_certification'
  | 'drivers_license'
  | 'auto_insurance'
  | 'resume_cv'
  | 'w9'
  | 'business_license'
  | 'dei_training'
  | 'hipaa_training'
  | 'background_check'
  | 'cloud_baa'        // Cloud Storage Business Associate Agreement
  | 'other';

// ── Cloud Detection Types ──

export type CloudProvider = 'google_drive' | 'dropbox' | 'onedrive' | 'icloud';

export interface CloudDetectionResult {
  isCloudSynced: boolean;
  provider: CloudProvider | null;
  providerDisplayName: string | null;
  baaUrl: string | null;
  baaAvailable: boolean;
}

export interface SetDataPathResult {
  newPath: string;
  cloud: CloudDetectionResult;
}

export interface VaultDocument {
  id: number;
  document_type: VaultDocumentType;
  custom_label: string | null;
  filename: string;
  original_name: string;
  file_path: string;
  issue_date: string | null;
  expiration_date: string | null;
  reminder_days_before: number;
  notes: string;
  uploaded_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// ── Compliance Engine Types ──

export type CompliancePreset = 'medicare' | 'custom' | 'none';

export interface ComplianceTracking {
  id: number;
  client_id: number;
  tracking_enabled: boolean;
  compliance_preset: CompliancePreset;
  progress_visit_threshold: number;
  progress_day_threshold: number;
  recert_day_threshold: number;
  visits_since_last_progress: number;
  last_progress_date: string | null;
  last_recert_date: string | null;
  next_progress_due: string | null;
  next_recert_due: string | null;
  recert_md_signature_received: boolean;
  physician_order_required: boolean;
  physician_order_expiration: string | null;
  physician_order_document_id: number | null;
  created_at: string;
  updated_at: string;
}

// ── Mileage Types ──

export interface MileageEntry {
  id: number;
  date: string;
  appointment_id: number | null;
  client_id: number | null;
  entity_id: number | null;
  origin_address: string;
  destination_address: string;
  miles: number;
  reimbursement_rate: number | null;
  reimbursement_amount: number | null;
  is_reimbursable: boolean;
  notes: string;
  created_at: string;
  deleted_at: string | null;
  // Joined fields
  client_name?: string;
  entity_name?: string;
}

// ── Communication Log Types ──

export type CommunicationType = 'phone' | 'email' | 'fax' | 'in_person' | 'other';
export type CommunicationDirection = 'outgoing' | 'incoming';

export interface CommunicationLogEntry {
  id: number;
  client_id: number;
  entity_id: number | null;
  communication_date: string;
  type: CommunicationType;
  direction: CommunicationDirection;
  contact_name: string;
  summary: string;
  created_at: string;
  deleted_at: string | null;
}

// ── Dashboard Types ──

export interface DashboardOverview {
  todayAppointments: Appointment[];
  complianceAlerts: ComplianceAlert[];
  unsignedNotes: UnsignedNote[];
  expiringCredentials: VaultDocument[];
  expiringOrders: ComplianceTracking[];
  authorizationAlerts: Authorization[];
  outstandingInvoices: Invoice[];
}

export interface ComplianceAlert {
  client_id: number;
  client_name: string;
  alert_type: 'progress_due' | 'progress_overdue' | 'recert_due' | 'recert_overdue';
  detail: string;
  visits_count?: number;
  threshold?: number;
}

export interface UnsignedNote {
  id: number;
  client_id: number;
  client_name: string;
  date_of_service: string;
  created_at: string;
}

// ── Year-End Tax Summary Types ──

export interface YearEndSummary {
  revenueByEntity: { entity_id: number; entity_name: string; total: number }[];
  revenuePrivatePay: number;
  totalMileage: number;
  reimbursedMileage: number;
  deductibleMileage: number;
  visitsByEntity: { entity_id: number; entity_name: string; count: number }[];
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
  entity_id: number | null;
  invoice_number: string;
  invoice_date: string;
  due_date: string;
  subtotal: number;
  discount_amount: number;
  total_amount: number;
  status: InvoiceStatus;
  notes: string;
  stripe_invoice_id: string;
  stripe_payment_link_id: string;
  stripe_payment_link_url: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  // Joined fields
  entity_name?: string;
  cpt_summary?: string;
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
  entity_id: number | null;
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
    list: (filters?: { clientId?: number; entityId?: number; signed?: boolean }) => Promise<Note[]>;
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
    createBatch: (items: Partial<Appointment>[]) => Promise<Appointment[]>;
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
    setDataPath: () => Promise<SetDataPathResult | null>;
    getDefaultPath: () => Promise<string>;
    resetDataPath: () => Promise<string>;
    detectCloud: (folderPath: string) => Promise<CloudDetectionResult>;
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
  /** Shell operations - open URLs in default system browser */
  shell: {
    /** Open a URL in the user's default browser (only http/https allowed) */
    openExternal: (url: string) => Promise<boolean>;
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
    list: (filters?: { clientId?: number; entityId?: number; status?: InvoiceStatus; startDate?: string; endDate?: string }) => Promise<Invoice[]>;
    get: (id: number) => Promise<Invoice & { items: InvoiceItem[] }>;
    create: (data: Partial<Invoice>, items: Partial<InvoiceItem>[]) => Promise<Invoice>;
    update: (id: number, data: Partial<Invoice>) => Promise<Invoice>;
    delete: (id: number) => Promise<boolean>;
    generateFromNotes: (clientId: number, noteIds: number[], entityId?: number) => Promise<Invoice>;
    generatePdf: (invoiceId: number) => Promise<{ base64Pdf: string; filename: string }>;
    savePdf: (data: { base64Pdf: string; filename: string }) => Promise<string | null>;
    createFeeInvoice: (data: { client_id?: number; entity_id?: number; description: string; amount: number; service_date: string }) => Promise<Invoice>;
    noteStatuses: () => Promise<Record<number, { invoice_id: number; invoice_number: string; status: string }>>;
  };
  payments: {
    list: (filters?: { clientId?: number; startDate?: string; endDate?: string }) => Promise<Payment[]>;
    create: (data: Partial<Payment>) => Promise<Payment>;
    update: (id: number, data: Partial<Payment>) => Promise<Payment>;
    refund: (id: number) => Promise<Payment>;
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
  /** Stripe Payment Integration */
  stripe: {
    /** Get or create a Stripe customer for a client */
    getOrCreateCustomer: (clientId: number) => Promise<{ customerId: string; created: boolean }>;
    /** Create a payment link for an invoice (client pays via browser) */
    createPaymentLink: (invoiceId: number) => Promise<{ url: string; id: string; existing: boolean }>;
    /** Check if an invoice's payment link has been paid (polling-based) */
    checkPaymentStatus: (invoiceId: number) => Promise<{
      status: 'paid' | 'pending' | 'no_payment_link';
      alreadyRecorded?: boolean;
      paymentIntentId?: string;
      amountPaid?: number;
    }>;
  };
  // ── Contracted Entities (Pro) ──
  contractedEntities: {
    list: () => Promise<ContractedEntity[]>;
    get: (id: number) => Promise<ContractedEntity>;
    create: (data: Partial<ContractedEntity>) => Promise<ContractedEntity>;
    update: (id: number, data: Partial<ContractedEntity>) => Promise<ContractedEntity>;
    delete: (id: number) => Promise<boolean>;
    listFeeSchedule: (entityId: number) => Promise<EntityFeeSchedule[]>;
    createFeeScheduleEntry: (data: Partial<EntityFeeSchedule>) => Promise<EntityFeeSchedule>;
    updateFeeScheduleEntry: (id: number, data: Partial<EntityFeeSchedule>) => Promise<EntityFeeSchedule>;
    deleteFeeScheduleEntry: (id: number) => Promise<boolean>;
  };
  // ── Entity Documents (Pro) ──
  entityDocuments: {
    list: (entityId: number) => Promise<EntityDocument[]>;
    upload: (data: { entityId: number; category?: EntityDocumentCategory }) => Promise<EntityDocument | null>;
    open: (documentId: number) => Promise<string>;
    delete: (documentId: number) => Promise<boolean>;
  };
  // ── Professional Vault (Pro) ──
  vault: {
    list: () => Promise<VaultDocument[]>;
    upload: (data: { documentType: VaultDocumentType; customLabel?: string; expirationDate?: string; issueDate?: string; reminderDaysBefore?: number }) => Promise<VaultDocument | null>;
    update: (id: number, data: Partial<VaultDocument>) => Promise<VaultDocument>;
    delete: (id: number) => Promise<boolean>;
    open: (id: number) => Promise<string>;
    getExpiringDocuments: () => Promise<VaultDocument[]>;
    exportCredentialingPacket: (documentIds: number[]) => Promise<string | null>;
  };
  // ── Compliance Tracking (Pro) ──
  compliance: {
    getByClient: (clientId: number) => Promise<ComplianceTracking | null>;
    updateSettings: (clientId: number, data: Partial<ComplianceTracking>) => Promise<ComplianceTracking>;
    incrementVisit: (clientId: number) => Promise<ComplianceTracking>;
    resetProgressCounter: (clientId: number) => Promise<ComplianceTracking>;
    resetRecertCounter: (clientId: number) => Promise<ComplianceTracking>;
    getAlerts: () => Promise<ComplianceAlert[]>;
    getDueItems: (clientId: number) => Promise<ComplianceAlert[]>;
  };
  // ── Mileage (Pro) ──
  mileage: {
    list: (filters?: { startDate?: string; endDate?: string; entityId?: number; clientId?: number }) => Promise<MileageEntry[]>;
    create: (data: Partial<MileageEntry>) => Promise<MileageEntry>;
    update: (id: number, data: Partial<MileageEntry>) => Promise<MileageEntry>;
    delete: (id: number) => Promise<boolean>;
    getSummary: (startDate: string, endDate: string) => Promise<{ totalMiles: number; reimbursable: number; deductible: number }>;
    exportCsv: (startDate: string, endDate: string) => Promise<string | null>;
  };
  // ── Communication Log (Pro) ──
  communicationLog: {
    list: (clientId: number) => Promise<CommunicationLogEntry[]>;
    create: (data: Partial<CommunicationLogEntry>) => Promise<CommunicationLogEntry>;
    delete: (id: number) => Promise<boolean>;
  };
  // ── Dashboard (Pro) ──
  dashboard: {
    getOverview: () => Promise<DashboardOverview>;
  };
  // ── Reports (Pro) ──
  reports: {
    yearEndSummary: (year: number) => Promise<YearEndSummary>;
    exportYearEnd: (year: number, format: 'pdf' | 'csv') => Promise<string | null>;
  };
  // ── Direct Access Rules ──
  directAccess: {
    requiresReferral: (state: string, discipline: Discipline) => Promise<boolean>;
    getRules: () => Promise<Array<{ state: string; discipline: Discipline; requires_referral: boolean }>>;
  };
}

declare global {
  interface Window {
    api: PocketChartAPI;
  }
}
