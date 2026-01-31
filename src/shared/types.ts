export type Discipline = 'PT' | 'OT' | 'ST';
export type ClientStatus = 'active' | 'discharged' | 'hold';
export type GoalType = 'STG' | 'LTG';
export type GoalStatus = 'active' | 'met' | 'discontinued' | 'modified';
export type AppointmentStatus = 'scheduled' | 'completed' | 'cancelled' | 'no-show';
export type SOAPSection = 'S' | 'O' | 'A' | 'P';

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
  phone: string;
  npi: string;
  tax_id: string;
  license_number: string;
  license_state: string;
  discipline: Discipline | 'MULTI';
}

export interface Client {
  id: number;
  first_name: string;
  last_name: string;
  dob: string;
  phone: string;
  email: string;
  address: string;
  primary_dx_code: string;
  primary_dx_description: string;
  secondary_dx: string; // JSON array
  default_cpt_code: string;
  insurance_payer: string;
  insurance_member_id: string;
  insurance_group: string;
  referring_physician: string;
  referring_npi: string;
  status: ClientStatus;
  discipline: Discipline;
  created_at: string;
  updated_at: string;
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
  created_at: string;
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
  created_at: string;
  updated_at: string;
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
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  goals_addressed: string; // JSON array of goal IDs
  signature_image: string;
  signature_typed: string;
  signed_at: string;
  created_at: string;
  updated_at: string;
}

export interface Appointment {
  id: number;
  client_id: number;
  scheduled_date: string;
  scheduled_time: string;
  duration_minutes: number;
  status: AppointmentStatus;
  note_id: number | null;
  created_at: string;
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
