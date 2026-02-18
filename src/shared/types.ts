export type Discipline = 'PT' | 'OT' | 'ST' | 'MFT';
export type ClientStatus = 'active' | 'discharged' | 'hold';
export type GoalType = 'STG' | 'LTG';
export type GoalStatus = 'active' | 'met' | 'discontinued' | 'modified';
export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'no-show';
export type VisitType = 'T' | 'H' | 'O' | 'C';
export type SessionType = 'visit' | 'eval' | 'recert';
export type WaitlistStatus = 'waiting' | 'contacted' | 'scheduled_intake' | 'converted' | 'declined';
export type StagedGoalStatus = 'staged' | 'promoted' | 'dismissed';
export type ProgressReportGoalStatus = 'progressing' | 'met' | 'regressed' | 'plateau' | 'discontinued' | 'modified';

export type MeasurementType =
  | 'percentage'        // 0-100%, used for ST artic accuracy, language tasks, OT fine motor
  | 'assist_level'      // Dep → MaxA → ModA → MinA → CGA → SBA → Sup → Ind (PT mobility, transfers, OT ADLs)
  | 'cue_level'         // Max → Mod → Min → Ind (ST language, OT cognitive)
  | 'pain_scale'        // 0-10 numeric (PT pain management)
  | 'mmt_grade'         // 0/5 through 5/5 with ± variants (PT strength)
  | 'rom_degrees'       // 0-360 numeric degrees (PT ROM)
  | 'timed_seconds'     // Numeric seconds (PT balance, endurance)
  | 'standardized_score'// Named instrument + numeric score (PHQ-9, GAD-7, Berg, PCL-5, etc.)
  | 'frequency'         // Count per time period (MFT behavioral: X per week → Y per week)
  | 'severity'          // Severe → Mod → Mild → Minimal → Resolved (MFT, some ST)
  | 'fim_score'         // 1-7 FIM scale (OT ADLs when FIM is used)
  | 'custom_text';      // No structured metric — freeform goal, status-only tracking

export const MEASUREMENT_TYPE_LABELS: Record<MeasurementType, string> = {
  percentage: 'Percentage (e.g., 80% accuracy)',
  assist_level: 'Assist level (Ind / SBA / Min A / Mod A / Max A)',
  cue_level: 'Cue level (Independent / Min / Mod / Max cues)',
  pain_scale: 'Pain scale (0-10)',
  mmt_grade: 'Muscle strength (0/5 – 5/5)',
  rom_degrees: 'Range of motion (degrees)',
  timed_seconds: 'Timed performance (seconds)',
  standardized_score: 'Score on a test (PHQ-9, Berg, etc.)',
  frequency: 'Frequency count (per week/day)',
  severity: 'Severity rating (Severe → Resolved)',
  fim_score: 'FIM score (1-7)',
  custom_text: 'Other / no specific measure',
};

export const VISIT_TYPE_LABELS: Record<VisitType, string> = {
  T: 'Telehealth',
  H: 'Home Visit',
  O: 'Office',
  C: 'Community',
};

export const SESSION_TYPE_LABELS: Record<SessionType, string> = {
  visit: 'Visit',
  eval: 'Evaluation',
  recert: 'Recertification',
};

export const PROGRESS_REPORT_GOAL_STATUS_LABELS: Record<ProgressReportGoalStatus, string> = {
  progressing: 'Progressing',
  met: 'Met',
  regressed: 'Regressed',
  plateau: 'Plateau',
  discontinued: 'Discontinued',
  modified: 'Modified',
};
export type SOAPSection = 'S' | 'O' | 'A' | 'P';

// Note Format Types
export type NoteFormat = 'SOAP' | 'DAP' | 'BIRP';

export const NOTE_FORMAT_LABELS: Record<NoteFormat, string> = {
  SOAP: 'SOAP (Subjective, Objective, Assessment, Plan)',
  DAP: 'DAP (Data, Assessment, Plan)',
  BIRP: 'BIRP (Behavior, Intervention, Response, Plan)',
};

/**
 * Maps note format sections to the underlying database fields.
 * All formats store to the same 4 fields — only the labels change.
 */
export const NOTE_FORMAT_SECTIONS: Record<NoteFormat, { field: string; label: string; placeholder: string }[]> = {
  SOAP: [
    { field: 'subjective', label: 'Subjective', placeholder: "Patient's reported symptoms, concerns, and relevant history..." },
    { field: 'objective', label: 'Objective', placeholder: 'Measurable findings, observations, clinical data...' },
    { field: 'assessment', label: 'Assessment', placeholder: 'Clinical interpretation of progress and response to treatment...' },
    { field: 'plan', label: 'Plan', placeholder: 'Next steps, treatment plan, follow-up...' },
  ],
  DAP: [
    { field: 'subjective', label: 'Data', placeholder: 'Objective and subjective data from session — what was observed, discussed, reported...' },
    { field: 'objective', label: 'Assessment', placeholder: 'Clinical assessment of progress, therapeutic interpretation, treatment response...' },
    { field: 'assessment', label: 'Plan', placeholder: 'Treatment plan, interventions to continue, homework, next session focus...' },
    { field: 'plan', label: '(unused)', placeholder: '' },
  ],
  BIRP: [
    { field: 'subjective', label: 'Behavior', placeholder: "Client's presenting behavior, mood, affect, and reported symptoms..." },
    { field: 'objective', label: 'Intervention', placeholder: 'Therapeutic interventions used — techniques, modalities, approaches...' },
    { field: 'assessment', label: 'Response', placeholder: "Client's response to interventions, engagement, progress indicators..." },
    { field: 'plan', label: 'Plan', placeholder: 'Treatment plan, next session goals, homework, referrals...' },
  ],
};

export const DISCIPLINE_DEFAULT_FORMAT: Record<Discipline, NoteFormat> = {
  PT: 'SOAP',
  OT: 'SOAP',
  ST: 'SOAP',
  MFT: 'DAP',
};

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

// CMS-1500 Y/N fields
export type YesNo = 'Y' | 'N';

// CMS-1500 onset qualifier codes (Box 14)
export type OnsetQualifier =
  | '431' // Onset of current symptoms or illness
  | '484' // Last menstrual period
  | '304' // Latest visit or consultation
  | '453' // Acute manifestation of chronic condition
  | '439' // Accident
  | '455' // Last X-ray
  | '471' // Prescription
  | '';

export const ONSET_QUALIFIER_LABELS: Record<string, string> = {
  '431': 'Onset of Current Symptoms',
  '484': 'Last Menstrual Period',
  '304': 'Latest Visit/Consultation',
  '453': 'Acute Manifestation',
  '439': 'Accident',
  '455': 'Last X-Ray',
  '471': 'Prescription',
};

// CMS-1500 signature source
export type SignatureSource = 'SOF' | 'P' | '';

export const SIGNATURE_SOURCE_LABELS: Record<string, string> = {
  'SOF': 'Signature On File',
  'P': 'Patient Present',
};

// CMS-1500 referring provider qualifier (Box 17a)
export type ReferringQualifier = 'DN' | 'DK' | 'DQ' | '';

export const REFERRING_QUALIFIER_LABELS: Record<string, string> = {
  'DN': 'Referring Provider',
  'DK': 'Ordering Provider',
  'DQ': 'Supervising Provider',
};

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
export type PaymentMethod = 'card' | 'cash' | 'check' | 'stripe' | 'insurance' | 'other';

// Claim status
export type ClaimStatus =
  | 'draft'
  | 'ready'
  | 'validated'
  | 'submitted'
  | 'accepted'
  | 'acknowledged'
  | 'rejected'
  | 'pending'
  | 'paid'
  | 'denied'
  | 'appeal_in_progress'
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
  measurement_type: MeasurementType;
  baseline: number;         // numeric for sorting/charts
  target: number;           // numeric for sorting/charts
  baseline_value: string;   // human-readable: "ModA", "40", "7"
  target_value: string;     // human-readable: "SBA", "80", "3"
  instrument: string;       // for standardized_score: "PHQ-9", "Berg"
  pattern_id?: string;      // Which goal pattern was used
  components?: Record<string, any>;  // Component selections for pattern-based goals
  is_carried_over?: boolean;  // Carried from prior eval (reassessment/PR)
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
  referring_physician_qualifier: ReferringQualifier; // CMS-1500 Box 17a
  referral_source: string;                   // V2/V3: Tracking
  referring_fax: string;                     // V4: Physician fax number
  referring_physician_id: number | null;     // V4: FK to physicians table
  stripe_customer_id: string;                // V2: Stripe integration
  // CMS-1500 claim fields
  onset_date: string;                        // CMS-1500 Box 14
  onset_qualifier: OnsetQualifier;           // CMS-1500 Box 14 qualifier
  employment_related: YesNo;                 // CMS-1500 Box 10a
  auto_accident: YesNo;                      // CMS-1500 Box 10b
  auto_accident_state: string;               // CMS-1500 Box 10b state
  other_accident: YesNo;                     // CMS-1500 Box 10c
  claim_accept_assignment: YesNo;            // CMS-1500 Box 27
  patient_signature_source: SignatureSource;  // CMS-1500 Box 12
  insured_signature_source: SignatureSource;  // CMS-1500 Box 13
  prior_auth_number: string;                 // CMS-1500 Box 23
  additional_claim_info: string;             // CMS-1500 Box 19
  service_facility_name: string;             // CMS-1500 Box 32
  service_facility_npi: string;              // CMS-1500 Box 32a
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
  measurement_type: MeasurementType;         // What metric this goal tracks
  baseline: number;                          // numeric for sorting/charts
  target: number;                            // numeric for sorting/charts
  baseline_value: string;                    // human-readable: "ModA", "40", "7"
  target_value: string;                      // human-readable: "SBA", "80", "3"
  instrument: string;                        // for standardized_score: "PHQ-9", "Berg"
  pattern_id: string;                        // Which goal pattern was used (for re-editing)
  components_json: string;                   // Serialized component selections (for re-editing)
  created_by_user_id: number | null;         // V4: Multi-provider
  source_document_id: number | null;         // eval ID or note ID that established this goal
  source_document_type: string | null;       // 'eval' | 'progress_report' | null (null = pending)
  created_at: string;
  deleted_at: string | null;
}

export interface GoalProgressEntry {
  id: number;
  goal_id: number;
  client_id: number;
  recorded_date: string;
  measurement_type: string;
  value: string;
  numeric_value: number;
  instrument: string;
  source_type: 'eval' | 'progress_report' | 'recert' | 'discharge';
  source_document_id: number;
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
  progress_report_data: string;          // JSON ProgressReportData
  discharge_data: string;                // JSON DischargeData
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
  cms1500_generated_at: string | null;
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
  visit_type: VisitType;
  session_type: SessionType;
  evaluation_id: number | null;
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

export interface PatternOverride {
  id: number;
  pattern_id: string;
  component_key: string;
  custom_options: string[];    // User-added options (JSON in DB)
  removed_options: string[];   // Default options hidden by user (JSON in DB)
}

export interface CustomPattern {
  id: number;
  discipline: Discipline;
  category: string;
  label: string;
  icon: string;
  measurement_type: MeasurementType;
  chips_json: string;          // JSON array of string[]
  created_at: string;
  deleted_at: string | null;
}

// Client Document types
export type ClientDocumentCategory =
  | 'signed_poc'           // Signed Plan of Care
  | 'recertification'      // Signed Recertification
  | 'physician_order'      // Orders, Rx, Referrals — all "MD says go"
  | 'prior_authorization'  // Auth letters from insurance
  | 'intake_form'          // Intake / consent forms
  | 'correspondence'       // Letters, fax confirmations, misc
  | 'discharge_summary'    // Discharge documentation
  | 'other';               // Catch-all

export const CLIENT_DOCUMENT_CATEGORY_LABELS: Record<ClientDocumentCategory, string> = {
  signed_poc: 'Signed Plan of Care',
  recertification: 'Recertification',
  physician_order: 'Orders / Referrals',
  prior_authorization: 'Prior Authorization',
  intake_form: 'Intake / Consent Forms',
  correspondence: 'Correspondence',
  discharge_summary: 'Discharge Summary',
  other: 'Other',
};

export interface ClientDocument {
  id: number;
  client_id: number;
  filename: string;
  original_name: string;
  file_type: string;
  file_size: number;
  category: ClientDocumentCategory;
  notes: string;
  // Certification/order tracking fields
  certification_period_start: string;
  certification_period_end: string;
  received_date: string;
  sent_date: string;
  physician_name: string;
  fax_confirmation_id: string;
  // Standard fields
  created_at: string;
  deleted_at: string | null;
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

// Dashboard Workspace types
export interface DashboardNote {
  id: number;
  content: string;
  updated_at: string;
  created_at: string;
}

export interface DashboardTodo {
  id: number;
  text: string;
  completed: number; // 0 or 1
  position: number;
  priority: number; // 0 or 1
  created_at: string;
  updated_at: string;
}

export interface CalendarBlock {
  id: number;
  title: string;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  source_todo_id: number | null;
  completed: number; // 0 or 1
  created_at: string;
}

export interface QuickLink {
  id: number;
  title: string;
  url: string;
  position: number;
  created_at: string;
}

export type AppTier = 'unlicensed' | 'basic' | 'pro';

export interface LicenseStatus {
  tier: AppTier;
  licenseKey: string | null;
  activatedAt: string | null;
  subscriptionStatus: 'active' | 'expired' | 'cancelled' | null;
  subscriptionExpiresAt: string | null;
  lastValidatedAt: string | null;
  // Trial fields
  trialActive: boolean;
  trialExpired: boolean;
  trialDaysRemaining: number;
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

// ── Staged Goals & Progress Report Types ──

export interface StagedGoal {
  id: number;
  client_id: number;
  goal_text: string;
  goal_type: GoalType;
  category: string;
  rationale: string;
  flagged_at: string;
  flagged_from_note_id: number | null;
  status: StagedGoalStatus;
  promoted_at: string | null;
  promoted_in_note_id: number | null;
  promoted_to_goal_id: number | null;
  dismissed_at: string | null;
  dismiss_reason: string;
  created_at: string;
  deleted_at: string | null;
}

export interface ProgressReportGoal {
  id: number;
  note_id: number;
  goal_id: number;
  status_at_report: ProgressReportGoalStatus;
  performance_data: string;
  clinical_notes: string;
  goal_text_snapshot: string;
  measurement_type: MeasurementType;
  current_value: string;
  current_numeric: number;
  baseline_value_snapshot: string;
  target_value_snapshot: string;
  baseline_snapshot: number;
  target_snapshot: number;
  is_new_goal: boolean;
  is_staged_promotion: boolean;
  staged_goal_id: number | null;
  created_at: string;
  deleted_at: string | null;
}

export interface ProgressReportData {
  clinical_summary: string;
  continued_treatment_justification: string;
  frequency_per_week: number | null;
  duration_weeks: number | null;
  plan_of_care_update: string;
  report_period_start: string;
  report_period_end: string;
  visits_in_period: number;
}

// ── Discharge Summary Types ──

export type NoteMode = 'soap' | 'progress_report' | 'discharge';

export type DischargeReason =
  | 'goals_met'
  | 'patient_choice'
  | 'non_compliance'
  | 'moved'
  | 'physician_order'
  | 'auth_exhausted'
  | 'referred_out'
  | 'medical_change'
  | 'other';

export const DISCHARGE_REASON_LABELS: Record<DischargeReason, string> = {
  goals_met: 'Goals met / max benefit reached',
  patient_choice: 'Patient choice',
  non_compliance: 'Non-compliance / attendance',
  moved: 'Moved / relocated',
  physician_order: 'Physician order to discharge',
  auth_exhausted: 'Authorization / insurance exhausted',
  referred_out: 'Referred to another provider',
  medical_change: 'Medical status change',
  other: 'Other',
};

export type DischargeGoalStatus = 'met' | 'partially_met' | 'not_met' | 'discontinued' | 'deferred';

export const DISCHARGE_GOAL_STATUS_LABELS: Record<DischargeGoalStatus, string> = {
  met: 'Met',
  partially_met: 'Partially Met',
  not_met: 'Not Met',
  discontinued: 'Discontinued',
  deferred: 'Deferred (referred out)',
};

export type DischargeRecommendation =
  | 'home_program'
  | 'caregiver_training'
  | 'referral'
  | 'return_to_therapy'
  | 'follow_up_physician'
  | 'equipment';

export const DISCHARGE_RECOMMENDATION_LABELS: Record<DischargeRecommendation, string> = {
  home_program: 'Home exercise program / home program provided',
  caregiver_training: 'Caregiver / family training completed',
  referral: 'Referral to another provider',
  return_to_therapy: 'Return to therapy if condition changes',
  follow_up_physician: 'Follow up with physician',
  equipment: 'Equipment recommendations',
};

export interface DischargeData {
  discharge_reason: DischargeReason;
  discharge_reason_detail: string;
  start_of_care: string;
  discharge_date: string;
  total_visits: number;
  frequency_per_week: number | null;
  duration_weeks: number | null;
  frequency_notes: string;
  primary_dx: string;
  discipline: string;
  prior_level_of_function: string;
  current_level_of_function: string;
  recommendations: DischargeRecommendation[];
  referral_to: string;
  return_to_therapy_if: string;
  equipment_details: string;
  additional_recommendations: string;
  is_standalone: boolean;
}

export interface EpisodeSummary {
  start_of_care: string | null;
  total_visits: number;
  frequency_per_week: number | null;
  duration_weeks: number | null;
  frequency_notes: string;
  primary_dx_code: string;
  primary_dx_description: string;
  discipline: string;
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

// ── CMS-1500 Readiness Types ──

export interface CMS1500ReadinessCheck {
  field: string;
  label: string;
  status: 'pass' | 'fail' | 'warn';
  message?: string;
}

export interface CMS1500Readiness {
  ready: boolean;
  checks: CMS1500ReadinessCheck[];
  passCount: number;
  failCount: number;
  warnCount: number;
}

// ── CMS-1500 Bulk Generation Types ──

export interface CMS1500UnbilledNote {
  id: number;
  date_of_service: string;
  cpt_code: string;
  cpt_codes: string;
  charge_amount: number;
  signed_at: string;
}

export interface CMS1500UnbilledClient {
  id: number;
  first_name: string;
  last_name: string;
  insurance_payer: string;
  insurance_member_id: string;
  primary_dx_code: string;
  unbilledNoteCount: number;
  unbilledNotes: CMS1500UnbilledNote[];
}

export interface CMS1500BulkRequest {
  entries: Array<{ clientId: number; noteIds: number[] }>;
  outputMode: 'combined' | 'separate';
}

export interface CMS1500BulkResult {
  pdfs: Array<{ base64Pdf: string; filename: string; clientId: number }>;
  notesMarked: number[];
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

// ── Physician Directory Types ──

export interface Physician {
  id: number;
  name: string;
  npi: string;
  fax_number: string;
  phone: string;
  specialty: string;
  clinic_name: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  notes: string;
  is_favorite: boolean;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// ── Fax Types ──

export type FaxDirection = 'inbound' | 'outbound';
export type FaxStatus = 'queued' | 'sending' | 'sent' | 'delivered' | 'failed' | 'received' | 'matched' | 'unmatched';
export type FaxMatchConfidence = 'exact' | 'name' | 'partial' | 'unmatched' | 'ambiguous' | '';

export type FaxProviderType = 'srfax' | 'faxage' | 'phaxio';

export type ClearinghouseProviderType = 'claimmd' | 'availity' | 'officeally';

export type ReviewPromptAction = 'review_site' | 'feedback' | 'dismissed' | 'remind_later';

export interface FaxLogEntry {
  id: number;
  direction: FaxDirection;
  client_id: number | null;
  physician_id: number | null;
  fax_number: string;
  document_id: number | null;
  eval_id: number | null;
  note_id: number | null;
  linked_outbound_fax_id: number | null;
  srfax_id: string;
  provider_fax_id: string;
  fax_provider: string;
  status: FaxStatus;
  pages: number;
  sent_at: string | null;
  received_at: string | null;
  matched_confidence: FaxMatchConfidence;
  error_message: string;
  created_at: string;
  // Joined fields for display
  client_name?: string;
  physician_name?: string;
  document_name?: string;
}

export interface FaxTrackingEntry {
  id: number;
  eval_id: number | null;
  note_id: number | null;
  document_id: number | null;
  status: FaxStatus;
  sent_at: string | null;
  has_received_back: number;
}

// ── Intake Form Types ──

export interface IntakeFormSection {
  id: string;
  title: string;
  content: string;
  enabled: boolean;
  sort_order: number;
}

export interface IntakeFormTemplate {
  id: number;
  name: string;
  slug: string;
  description: string;
  sections: IntakeFormSection[];
  is_active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type IntakeTemplateSlug =
  | 'patient_information'
  | 'consent_to_treat'
  | 'hipaa_notice'
  | 'financial_agreement'
  | 'release_of_information'
  | 'assignment_of_benefits';

// ── Waitlist Types ──

export interface WaitlistEntry {
  id: number;
  first_name: string;
  last_name: string;
  phone: string;
  email: string;
  discipline: string;
  referral_source: string;
  notes: string;
  status: WaitlistStatus;
  priority: number;
  last_contacted: string | null;
  converted_client_id: number | null;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

// ── Dashboard Types ──

export interface IncompleteChart {
  clientId: number;
  clientName: string;
  missingFields: string[];
}

export interface BasicAlerts {
  unsignedNotes: UnsignedNote[];
  complianceAlerts: ComplianceAlert[];
  expiringOrders: { client_id: number; client_name: string; physician_order_expiration: string }[];
  authorizationAlerts: (Authorization & { client_name: string })[];
  incompleteCharts: IncompleteChart[];
}

export interface AnalyticsData {
  revenueByMonth: { month: string; invoiced: number; collected: number }[];
  clientGrowth: { month: string; newClients: number }[];
  sessionsVolume: { month: string; sessions: number }[];
  collectionRate: number;
  avgRevenuePerSession: number;
  stats: {
    outstanding: number;
    paidThisMonth: number;
    draftCount: number;
    overdueCount: number;
  };
}

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
  is_timed: number | null;   // 1 = timed (8-min rule), 0 = service-based, null = N/A (MFT)
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

// Revenue Pipeline Types

export interface PipelineData {
  needsNote: Array<{
    appointment_id: number;
    client_id: number;
    scheduled_date: string;
    visit_type: string;
    entity_id: number | null;
    first_name: string;
    last_name: string;
    default_cpt_code: string | null;
    entity_name: string | null;
    days_old: number;
    already_billed: number;
    billed_invoice_id: number | null;
  }>;
  needsSignature: Array<{
    note_id?: number;
    eval_id?: number;
    note_type: string;
    client_id: number;
    date_of_service: string;
    cpt_code?: string;
    cpt_codes?: string;
    units?: number;
    charge_amount?: number;
    entity_id?: number | null;
    first_name: string;
    last_name: string;
    entity_name?: string | null;
    days_old: number;
  }>;
  readyToBill: Array<{
    note_id: number;
    note_type: string;
    client_id: number;
    date_of_service: string;
    cpt_code: string;
    cpt_codes: string;
    units: number;
    charge_amount: number;
    signed_at: string;
    entity_id: number | null;
    first_name: string;
    last_name: string;
    entity_name: string | null;
    days_uninvoiced: number;
  }>;
  awaitingPayment: Array<{
    invoice_id: number;
    invoice_number: string;
    client_id: number;
    invoice_date: string;
    total_amount: number;
    status: string;
    stripe_payment_link_url: string | null;
    entity_id: number | null;
    first_name: string;
    last_name: string;
    entity_name: string | null;
    days_since_sent: number;
  }>;
  draftInvoices: Array<{
    invoice_id: number;
    invoice_number: string;
    client_id: number;
    total_amount: number;
    first_name: string;
    last_name: string;
  }>;
  paid: Array<{
    invoice_id: number;
    invoice_number: string;
    client_id: number;
    total_amount: number;
    entity_id: number | null;
    first_name: string;
    last_name: string;
    entity_name: string | null;
    payment_date: string;
    payment_method: string;
  }>;
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
  validated_at: string | null;
  acknowledged_at: string | null;
  denied_at: string | null;
  appeal_submitted_at: string | null;
  appeal_notes: string;
  correction_notes: string;
  original_claim_id: number | null;
  client_name?: string; // Joined field
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

// V3 Insurance: Eligibility Check
export interface EligibilityCheck {
  id: number;
  client_id: number;
  payer_name: string;
  payer_id: string;
  check_date: string;
  raw_response: string | null;
  plan_name: string | null;
  plan_type: string | null;
  coverage_active: number;
  copay_amount: number | null;
  coinsurance_percent: number | null;
  deductible_total: number | null;
  deductible_met: number | null;
  out_of_pocket_max: number | null;
  out_of_pocket_met: number | null;
  therapy_visits_allowed: number | null;
  therapy_visits_used: number | null;
  therapy_visits_remaining: number | null;
  auth_required: number;
  auth_number: string | null;
  referral_required: number;
  benefit_period_start: string | null;
  benefit_period_end: string | null;
  parsed_benefits: string; // JSON
  notes: string | null;
  created_at: string;
}

// V3 Insurance: Denial Code reference
export interface DenialCode {
  id: number;
  code: string;
  group_code: string;
  description: string;
  plain_english: string;
  what_to_do: string;
  common_in_therapy: number;
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

// Discount System
export type DiscountType = 'package' | 'flat_rate' | 'persistent';
export type DiscountStatus = 'active' | 'exhausted' | 'expired' | 'cancelled';

export interface ClientDiscount {
  id: number;
  client_id: number;
  discount_type: DiscountType;
  label: string;
  total_sessions: number | null;
  paid_sessions: number | null;
  sessions_used: number;
  session_rate: number | null;
  flat_rate: number | null;
  flat_rate_sessions: number | null;
  flat_rate_sessions_used: number;
  discount_percent: number | null;
  discount_fixed: number | null;
  start_date: string | null;
  end_date: string | null;
  status: DiscountStatus;
  notes: string;
  created_at: string;
  updated_at: string;
  deleted_at: string | null;
}

export interface DiscountTemplate {
  id: number;
  name: string;
  discount_type: DiscountType;
  total_sessions: number | null;
  paid_sessions: number | null;
  session_rate: number | null;
  flat_rate: number | null;
  flat_rate_sessions: number | null;
  discount_percent: number | null;
  discount_fixed: number | null;
  created_at: string;
  deleted_at: string | null;
}

// ── Backup & Restore Types ──

export interface BackupSummary {
  filePath: string;
  fileSize: number;
  schemaVersion: number;
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
  practiceInfo: { name?: string; discipline?: string } | null;
  fileModified: string;
  isEncrypted: boolean;
  isCompatible: boolean;
  currentSchemaVersion: number;
}

export interface BackupClientInfo {
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
}

export interface ImportResult {
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
}

export interface IntegrityCheckResult {
  quickCheckPassed: boolean;
  quickCheckResult: string;
  fullCheckPassed?: boolean;
  fullCheckResult?: string;
  fullCheckRan: boolean;
  timestamp: string;
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
    canRemove: (id: number) => Promise<{ canRemove: boolean; notes: number; evals: number; appts: number; goals: number }>;
    remove: (id: number) => Promise<boolean>;
  };
  goals: {
    listByClient: (clientId: number) => Promise<Goal[]>;
    create: (data: Partial<Goal>) => Promise<Goal>;
    update: (id: number, data: Partial<Goal>) => Promise<Goal>;
    delete: (id: number) => Promise<boolean>;
    tagSource: (goalId: number, docId: number, docType: string) => Promise<boolean>;
    getProgressHistory: (goalId: number) => Promise<GoalProgressEntry[]>;
    getProgressHistoryBatch: (goalIds: number[]) => Promise<Record<number, GoalProgressEntry[]>>;
    addProgressEntry: (data: Omit<GoalProgressEntry, 'id'>) => Promise<{ id: number }>;
  };
  stagedGoals: {
    listByClient: (clientId: number) => Promise<StagedGoal[]>;
    listAllByClient: (clientId: number) => Promise<StagedGoal[]>;
    create: (data: Partial<StagedGoal>) => Promise<StagedGoal>;
    update: (id: number, data: Partial<StagedGoal>) => Promise<StagedGoal>;
    promote: (id: number, noteId: number) => Promise<{ stagedGoal: StagedGoal; goal: Goal }>;
    dismiss: (id: number, reason: string) => Promise<StagedGoal>;
  };
  progressReportGoals: {
    listByNote: (noteId: number) => Promise<ProgressReportGoal[]>;
    upsert: (noteId: number, goals: Partial<ProgressReportGoal>[]) => Promise<ProgressReportGoal[]>;
    getLastForGoal: (goalId: number) => Promise<ProgressReportGoal | null>;
  };
  notes: {
    list: (filters?: { clientId?: number; entityId?: number; signed?: boolean }) => Promise<Note[]>;
    listByClient: (clientId: number) => Promise<Note[]>;
    get: (id: number) => Promise<Note>;
    create: (data: Partial<Note>) => Promise<Note>;
    update: (id: number, data: Partial<Note>) => Promise<Note>;
    delete: (id: number) => Promise<boolean>;
    getEpisodeSummary: (clientId: number) => Promise<EpisodeSummary>;
    getUnbilledForClient: (clientId: number) => Promise<Array<{ id: number; date_of_service: string; cpt_code: string; charge_amount: number; entity_id: number | null }>>;
  };
  evaluations: {
    listByClient: (clientId: number) => Promise<Evaluation[]>;
    get: (id: number) => Promise<Evaluation>;
    create: (data: Partial<Evaluation>) => Promise<Evaluation>;
    update: (id: number, data: Partial<Evaluation>) => Promise<Evaluation>;
    delete: (id: number) => Promise<boolean>;
    createReassessment: (clientId: number) => Promise<{ priorContent: string; activeGoals: any[] } | null>;
    countIncomplete: () => Promise<number>;
    listIncomplete: () => Promise<any[]>;
    listAll: () => Promise<any[]>;
  };
  appointments: {
    list: (filters?: { startDate?: string; endDate?: string; clientId?: number }) => Promise<Appointment[]>;
    create: (data: Partial<Appointment>) => Promise<Appointment>;
    createBatch: (items: Partial<Appointment>[]) => Promise<Appointment[]>;
    update: (id: number, data: Partial<Appointment>) => Promise<Appointment>;
    delete: (id: number) => Promise<boolean>;
    linkEval: (appointmentId: number, evaluationId: number) => Promise<boolean>;
    linkNote: (appointmentId: number, noteId: number) => Promise<boolean>;
  };
  customPatterns: {
    list: () => Promise<CustomPattern[]>;
    create: (data: Partial<CustomPattern>) => Promise<CustomPattern>;
    update: (id: number, data: Partial<CustomPattern>) => Promise<CustomPattern>;
    delete: (id: number) => Promise<boolean>;
  };
  noteBank: {
    list: (filters?: { discipline?: string; section?: string; category?: string }) => Promise<NoteBankEntry[]>;
    create: (data: Partial<NoteBankEntry>) => Promise<NoteBankEntry>;
    update: (id: number, data: Partial<NoteBankEntry>) => Promise<NoteBankEntry>;
    delete: (id: number) => Promise<boolean>;
    toggleFavorite: (id: number) => Promise<NoteBankEntry>;
    getCategories: (discipline: string) => Promise<string[]>;
  };
  patternOverrides: {
    list: () => Promise<PatternOverride[]>;
    upsert: (patternId: string, componentKey: string, customOptions: string[], removedOptions: string[]) => Promise<PatternOverride>;
    delete: (patternId: string, componentKey: string) => Promise<boolean>;
    deleteAll: (patternId: string) => Promise<boolean>;
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
    exportAllChartsPdf: () => Promise<{ path: string; clientCount: number; documentCount: number } | null>;
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
    upload: (data: {
      clientId: number;
      category?: string;
      certification_period_start?: string;
      certification_period_end?: string;
      received_date?: string;
      sent_date?: string;
      physician_name?: string;
    }) => Promise<ClientDocument | null>;
    updateMeta: (data: {
      documentId: number;
      certification_period_start?: string;
      certification_period_end?: string;
      received_date?: string;
      sent_date?: string;
      physician_name?: string;
      category?: string;
    }) => Promise<ClientDocument>;
    list: (data: { clientId: number }) => Promise<ClientDocument[]>;
    open: (data: { documentId: number }) => Promise<string>;
    delete: (data: { documentId: number }) => Promise<boolean>;
    getPath: (data: { documentId: number }) => Promise<string>;
  };
  license: {
    getStatus: () => Promise<LicenseStatus>;
    activate: (licenseKey: string) => Promise<LicenseActivateResult>;
    deactivate: () => Promise<LicenseActivateResult>;
    getActivationInfo: () => Promise<{ activationUsage: number | null; activationLimit: number }>;
    onTierChanged: (callback: (tier: string) => void) => () => void;
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
  // System events (power, sleep, etc.)
  system: {
    onLock: (callback: () => void) => () => void;
  };
  // V2 Billing APIs
  feeSchedule: {
    list: () => Promise<FeeScheduleEntry[]>;
    get: (id: number) => Promise<FeeScheduleEntry>;
    create: (data: Partial<FeeScheduleEntry>) => Promise<FeeScheduleEntry>;
    update: (id: number, data: Partial<FeeScheduleEntry>) => Promise<FeeScheduleEntry>;
    delete: (id: number) => Promise<boolean>;
    reset: (discipline: string) => Promise<boolean>;
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
  billing: {
    getPipelineData: (options?: { paidDays?: number }) => Promise<PipelineData>;
    quickInvoice: (data: { clientId: number; noteIds: number[]; entityId?: number }) => Promise<Invoice>;
    quickInvoiceFromAppointment: (data: { appointmentId: number; clientId: number; entityId?: number; cptCode?: string }) => Promise<Invoice>;
  };
  payments: {
    list: (filters?: { clientId?: number; startDate?: string; endDate?: string }) => Promise<Payment[]>;
    create: (data: Partial<Payment>) => Promise<Payment>;
    update: (id: number, data: Partial<Payment>) => Promise<Payment>;
    refund: (id: number) => Promise<Payment>;
    delete: (id: number) => Promise<boolean>;
  };
  // CSV Payment Import
  csvImport: {
    pickFile: () => Promise<string | null>;
    parseFile: (filePath: string) => Promise<{
      headers: string[];
      previewRows: Record<string, string>[];
      totalRows: number;
      fileSizeBytes: number;
      delimiter: string;
    }>;
    autoDetectColumns: (headers: string[]) => Promise<Record<string, string | undefined>>;
    matchClients: (data: {
      filePath: string;
      mapping: {
        dateColumn: string;
        amountColumn: string;
        clientNameColumn?: string;
        clientFirstNameColumn?: string;
        clientLastNameColumn?: string;
        methodColumn?: string;
        referenceColumn?: string;
        notesColumn?: string;
      };
    }) => Promise<Array<{
      csvName: string;
      paymentCount: number;
      totalAmount: number;
      suggestedClientId: number | null;
      suggestedClientName: string | null;
      matchConfidence: 'exact' | 'high' | 'partial' | 'none';
      allCandidates: Array<{ clientId: number; clientName: string; confidence: string }>;
    }>>;
    prepareRows: (data: {
      filePath: string;
      mapping: any;
      clientMatches: Record<string, number>;
      fixedClientId?: number;
    }) => Promise<Array<{
      rowIndex: number;
      paymentDate: string;
      amount: number;
      csvName: string;
      clientId: number | null;
      clientName: string;
      paymentMethod: string;
      referenceNumber: string;
      notes: string;
      isDuplicate: boolean;
      skipReason: string | null;
    }>>;
    execute: (data: {
      rows: any[];
      skipDuplicates: boolean;
    }) => Promise<{
      imported: number;
      skipped: number;
      duplicatesSkipped: number;
      totalAmount: number;
      errors: string[];
      importTag: string;
    }>;
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
    createFromNotes: (clientId: number, noteIds: number[]) => Promise<Claim>;
    generate837P: (claimId: number) => Promise<{ ediContent: string; claimNumber: string }>;
  };
  payers: {
    list: () => Promise<Payer[]>;
    create: (data: Partial<Payer>) => Promise<Payer>;
    update: (id: number, data: Partial<Payer>) => Promise<Payer>;
    delete: (id: number) => Promise<boolean>;
  };
  clearinghouse: {
    setProvider: (type: string, credentials: Record<string, string>) => Promise<boolean>;
    getProviderStatus: () => Promise<{ configured: boolean; provider: ClearinghouseProviderType | null }>;
    testProvider: () => Promise<{ success: boolean; message: string }>;
    removeProvider: () => Promise<boolean>;
    getPayerList: () => Promise<any[]>;
    checkEnrollment: (payerId: string) => Promise<{ status: string; message: string }>;
    submitClaim: (claimId: number) => Promise<{ success: boolean; clearinghouseClaimId?: string; message: string; errors?: string[] }>;
    checkClaimStatus: (claimId: number) => Promise<{ status: string; message: string; rawResponse?: any }>;
    checkEligibility: (clientId: number) => Promise<{ success: boolean; message: string }>;
    getRemittance: (startDate: string, endDate: string) => Promise<{ success: boolean; remittances: any[]; message: string }>;
  };
  eligibilityChecks: {
    listByClient: (clientId: number) => Promise<EligibilityCheck[]>;
    getLatest: (clientId: number) => Promise<EligibilityCheck | null>;
  };
  denialCodes: {
    lookup: (code: string) => Promise<DenialCode | null>;
    listCommon: () => Promise<DenialCode[]>;
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
    onAvailable: (callback: (info: { version: string; releaseNotes?: string; releaseDate?: string }) => void) => () => void;
    onNotAvailable: (callback: () => void) => () => void;
    onProgress: (callback: (progress: { percent: number; transferred: number; total: number }) => void) => () => void;
    onDownloaded: (callback: (info: { version: string }) => void) => () => void;
    onBackupComplete?: (callback: (info: { backupPath: string }) => void) => () => void;
    onBackupFailed?: (callback: () => void) => () => void;
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
    /** Check all outstanding payment links at once (background polling) */
    checkAllPendingPayments: () => Promise<{
      checked: number;
      paid: Array<{ invoiceId: number; invoiceNumber: string; amount: number }>;
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
  // ── Dashboard ──
  dashboard: {
    getBasicAlerts: () => Promise<BasicAlerts>;
    getOverview: () => Promise<DashboardOverview>;
    getAnalytics: (filters?: { startDate?: string; endDate?: string; monthsBack?: number }) => Promise<AnalyticsData>;
    getOutstandingBalance: () => Promise<{ outstanding: number; unpaidCount: number }>;
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
  // ── Client Discounts & Packages ──
  clientDiscounts: {
    listByClient: (clientId: number) => Promise<ClientDiscount[]>;
    getActive: (clientId: number) => Promise<ClientDiscount[]>;
    create: (data: Partial<ClientDiscount>) => Promise<ClientDiscount>;
    update: (id: number, data: Partial<ClientDiscount>) => Promise<ClientDiscount>;
    delete: (id: number) => Promise<boolean>;
    incrementUsage: (id: number, count?: number) => Promise<ClientDiscount>;
    decrementUsage: (id: number, count?: number) => Promise<ClientDiscount>;
  };
  discountTemplates: {
    list: () => Promise<DiscountTemplate[]>;
    create: (data: Partial<DiscountTemplate>) => Promise<DiscountTemplate>;
    update: (id: number, data: Partial<DiscountTemplate>) => Promise<DiscountTemplate>;
    delete: (id: number) => Promise<boolean>;
  };
  // ── CMS-1500 Claim Form Generator ──
  cms1500: {
    generate: (data: { clientId: number; noteIds: number[]; printMode?: 'full' | 'data-only' }) => Promise<{ base64Pdf: string; filename: string }>;
    save: (data: { base64Pdf: string; filename: string }) => Promise<string | null>;
    openPreview: (data: { base64Pdf: string; filename: string }) => Promise<string>;
    getUnbilledClients: () => Promise<CMS1500UnbilledClient[]>;
    generateBulk: (data: CMS1500BulkRequest & { printMode?: 'full' | 'data-only' }) => Promise<CMS1500BulkResult>;
    markBilled: (noteIds: number[]) => Promise<void>;
    clearBilled: (noteIds: number[]) => Promise<void>;
    saveBulk: (data: { pdfs: Array<{ base64Pdf: string; filename: string }> }) => Promise<string | null>;
    generateAlignmentTest: () => Promise<{ base64Pdf: string; filename: string }>;
  };
  // ── Data Integrity ──
  integrity: {
    runCheck: () => Promise<{ tamperedDocuments: Array<{ type: string; id: number; clientId: number; date: string }>; totalChecked: number }>;
    verifyAuditChain: () => Promise<{ intact: boolean; breakPoint?: number; totalEntries: number }>;
    startupCheck: () => Promise<IntegrityCheckResult>;
  };
  // ── Dashboard Scratchpad ──
  scratchpad: {
    get: () => Promise<DashboardNote | null>;
    save: (content: string) => Promise<DashboardNote>;
  };
  // ── Dashboard Todos ──
  dashboardTodos: {
    list: () => Promise<DashboardTodo[]>;
    create: (text: string) => Promise<DashboardTodo>;
    update: (id: number, data: Partial<Pick<DashboardTodo, 'text' | 'completed' | 'position' | 'priority'>>) => Promise<DashboardTodo>;
    delete: (id: number) => Promise<boolean>;
    search: (query: string) => Promise<DashboardTodo[]>;
    reorder: (items: Array<{ id: number; position: number }>) => Promise<DashboardTodo[]>;
    listIncomplete: () => Promise<DashboardTodo[]>;
  };
  // ── Calendar Blocks (admin time blocks) ──
  calendarBlocks: {
    list: (filters?: { startDate?: string; endDate?: string }) => Promise<CalendarBlock[]>;
    create: (data: { title: string; scheduled_date: string; scheduled_time?: string; duration_minutes?: number; source_todo_id?: number }) => Promise<CalendarBlock>;
    delete: (id: number) => Promise<boolean>;
    update: (id: number, data: { completed?: number; title?: string; scheduled_date?: string; scheduled_time?: string; duration_minutes?: number }) => Promise<CalendarBlock>;
    deleteAndRestore: (id: number) => Promise<boolean>;
  };
  // ── Quick Links ──
  quickLinks: {
    list: () => Promise<QuickLink[]>;
    create: (data: { title: string; url: string }) => Promise<QuickLink>;
    update: (id: number, data: Partial<Pick<QuickLink, 'title' | 'url' | 'position'>>) => Promise<QuickLink>;
    delete: (id: number) => Promise<boolean>;
  };
  // ── Feedback ──
  feedback: {
    submit: (data: {
      description: string;
      category: string;
      appVersion: string;
      discipline: string;
      practiceName: string;
      os: string;
    }) => Promise<{ success: boolean }>;
  };
  // ── Review Prompts ──
  reviewPrompts: {
    checkEligible: () => Promise<{ eligible: boolean; milestone: string | null }>;
    record: (data: { rating: number | null; action: string }) => Promise<{ id: number }>;
  };
  // ── Restore ──
  restore: {
    pickFile: () => Promise<string | null>;
    validateAndSummarize: (filePath: string, passphrase: string) => Promise<{ summary?: BackupSummary; error?: string }>;
    execute: (filePath: string, passphrase: string) => Promise<{ success: boolean; recoveryKey?: string; error?: string }>;
    executeFromSettings: (filePath: string, passphrase: string) => Promise<{ success: boolean; error?: string }>;
    getBackupClients: (filePath: string, passphrase: string) => Promise<{ clients?: BackupClientInfo[]; backupInfo?: { filePath: string; fileModified: string; schemaVersion: number }; error?: string }>;
    importClients: (filePath: string, passphrase: string, clientIds: number[]) => Promise<ImportResult>;
    getCurrentSummary: () => Promise<BackupSummary>;
    getPendingRecoveryKey: () => Promise<string | null>;
    clearPendingRecoveryKey: () => Promise<void>;
  };
  // ── Encryption ──
  encryption: {
    getStatus: () => Promise<{ needsSetup: boolean; needsPassphrase: boolean; needsMigration: boolean; decryptionNeeded?: boolean }>;
    setup: (passphrase: string) => Promise<{ success: boolean; recoveryKey?: string; error?: string }>;
    setupPlaintext: () => Promise<{ success: boolean }>;
    unlock: (passphrase: string) => Promise<{ success: boolean; error?: string }>;
    unlockWithRecovery: (recoveryKey: string) => Promise<{ success: boolean; error?: string }>;
    changePassphrase: (current: string, newPass: string) => Promise<{ success: boolean; error?: string }>;
    regenerateRecoveryKey: (passphrase: string) => Promise<{ success: boolean; recoveryKey?: string; error?: string }>;
    verifyPassphrase: (passphrase: string) => Promise<boolean>;
    migrateAndSetup: (passphrase: string) => Promise<{ success: boolean; recoveryKey?: string; error?: string }>;
    onDbReady: (callback: () => void) => () => void;
  };
  // ── Physician Directory ──
  physicians: {
    list: (filters?: { search?: string; favoritesOnly?: boolean }) => Promise<Physician[]>;
    get: (id: number) => Promise<Physician>;
    create: (data: Partial<Physician>) => Promise<Physician>;
    update: (id: number, data: Partial<Physician>) => Promise<Physician>;
    delete: (id: number) => Promise<boolean>;
    search: (query: string) => Promise<Physician[]>;
  };
  // ── Fax ──
  fax: {
    send: (data: { documentId?: number; docType?: 'eval' | 'note' | 'document'; documents?: Array<{ id: number; type: 'eval' | 'note' | 'document' }>; physicianId?: number; faxNumber: string; clientId?: number; requestSignature?: boolean }) => Promise<FaxLogEntry>;
    getStatus: (faxLogId: number) => Promise<FaxLogEntry>;
    listInbox: () => Promise<FaxLogEntry[]>;
    listOutbox: () => Promise<FaxLogEntry[]>;
    retrieveFax: (providerFaxId: string) => Promise<{ base64Pdf: string; filename: string }>;
    matchToClient: (faxLogId: number, clientId: number) => Promise<FaxLogEntry>;
    getOutboundByClient: (clientId: number) => Promise<FaxTrackingEntry[]>;
    saveToChart: (data: { faxLogId: number; clientId: number; category: string; linkToOutboundFaxId?: number }) => Promise<FaxLogEntry>;
    pollStatuses: () => Promise<{ updated: number }>;
    pollInbox: () => Promise<{ newFaxes: number }>;
    // Provider management
    setProvider: (type: string, credentials: Record<string, string>) => Promise<boolean>;
    getProviderStatus: () => Promise<{ configured: boolean; provider: FaxProviderType | null; faxNumber?: string }>;
    testProvider: () => Promise<{ success: boolean; message: string; faxNumber?: string; balance?: string }>;
    removeProvider: () => Promise<boolean>;
  };
  // ── Intake Forms ──
  intakeForms: {
    listTemplates: () => Promise<IntakeFormTemplate[]>;
    getTemplate: (id: number) => Promise<IntakeFormTemplate>;
    updateTemplate: (id: number, data: Partial<IntakeFormTemplate>) => Promise<IntakeFormTemplate>;
    resetTemplate: (slug: string) => Promise<IntakeFormTemplate>;
    generatePdf: (data: { templateIds: number[]; clientId?: number; fillable?: boolean }) => Promise<{ base64Pdf: string; filename: string }>;
    savePdf: (data: { base64Pdf: string; filename: string }) => Promise<string | null>;
    reorderTemplates: (ids: number[]) => Promise<boolean>;
  };
  // ── Waitlist (Pro) ──
  waitlist: {
    list: (filters?: { status?: string; discipline?: string }) => Promise<WaitlistEntry[]>;
    create: (data: Partial<WaitlistEntry>) => Promise<WaitlistEntry>;
    update: (id: number, data: Partial<WaitlistEntry>) => Promise<WaitlistEntry>;
    delete: (id: number) => Promise<boolean>;
    search: (query: string) => Promise<WaitlistEntry[]>;
    convertToClient: (id: number) => Promise<WaitlistEntry>;
    linkClient: (waitlistId: number, clientId: number) => Promise<WaitlistEntry>;
    count: () => Promise<number>;
  };
  // ── Dev (temporary) ──
  dev: {
    seedDemoData: () => Promise<{ seeded: boolean; message: string; counts?: any }>;
  };
}

declare global {
  interface Window {
    api: PocketChartAPI;
  }
}
