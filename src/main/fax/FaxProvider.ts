// Fax Provider Abstraction Layer — Interface + Types + Credential Schemas
// All fax providers (SRFax, Faxage, Phaxio) implement the FaxProvider interface.
// The FaxRouter routes calls to whichever provider the user has configured.

export type FaxProviderType = 'srfax' | 'faxage' | 'phaxio';

export interface FaxProviderConfig {
  provider: FaxProviderType;
  credentials: Record<string, string>;
  faxNumber: string;
  callerID?: string;
}

export interface SendFaxParams {
  toFaxNumber: string;       // With country code: 15551234567
  files: FaxFile[];          // One or more files to send
  coverPageText?: string;
  senderName?: string;       // Practice name for fax header
}

export interface FaxFile {
  fileName: string;
  contentBase64: string;     // Base64-encoded PDF
}

export interface SendFaxResult {
  success: boolean;
  faxId: string;             // Provider-specific job/details ID
  error?: string;
}

export interface FaxStatusResult {
  faxId: string;
  status: 'queued' | 'sending' | 'sent' | 'failed' | 'partial';
  dateSent?: string;
  pages?: number;
  duration?: number;
  toFaxNumber: string;
  errorMessage?: string;
}

export interface InboundFax {
  faxId: string;
  fromFaxNumber: string;
  receivedAt: string;        // ISO date string
  pages: number;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  faxNumber?: string;
  balance?: string;
}

/**
 * Common interface that all fax providers must implement.
 * The main process FaxRouter delegates to whichever provider
 * the user has configured in Settings.
 */
export interface FaxProvider {
  /** Verify credentials and connectivity */
  testConnection(): Promise<ConnectionTestResult>;

  /** Send a fax (one or more PDF files) */
  sendFax(params: SendFaxParams): Promise<SendFaxResult>;

  /** Check the delivery status of a sent fax */
  checkStatus(faxId: string): Promise<FaxStatusResult>;

  /** List received faxes (inbox) since a given date, or all */
  getInbox(since?: Date): Promise<InboundFax[]>;

  /** Download a received fax as base64-encoded PDF */
  downloadFax(faxId: string, direction: 'in' | 'out'): Promise<string>;

  /** Delete a fax from the provider's server (after local download) */
  deleteFax(faxId: string, direction: 'in' | 'out'): Promise<void>;
}

// ── Provider Credential Schemas ──
// Used by Settings UI to dynamically render credential fields per provider.

export interface ProviderCredentialField {
  key: string;
  label: string;
  type: 'text' | 'password';
  placeholder: string;
  helpText?: string;
}

export const PROVIDER_CREDENTIAL_SCHEMAS: Record<FaxProviderType, {
  name: string;
  description: string;
  website: string;
  baaInfo: string;
  fields: ProviderCredentialField[];
}> = {
  srfax: {
    name: 'SRFax',
    description: 'Healthcare-focused fax service. Popular with therapy practices.',
    website: 'https://www.srfax.com',
    baaInfo: 'SRFax signs BAAs. Request via their website or support.',
    fields: [
      { key: 'accountNumber', label: 'Account Number', type: 'text', placeholder: 'Your SRFax account number' },
      { key: 'password', label: 'Password', type: 'password', placeholder: 'Your SRFax password' },
      { key: 'faxNumber', label: 'Fax Number', type: 'text', placeholder: '15551234567', helpText: 'Include country code (1 for US)' },
    ],
  },
  faxage: {
    name: 'Faxage',
    description: 'Value-priced fax service with HITRUST certification. Signs BAAs.',
    website: 'https://www.faxage.com',
    baaInfo: 'Email support@faxage.com to request a BAA. Free with any account.',
    fields: [
      { key: 'company', label: 'Company/Login', type: 'text', placeholder: 'Your Faxage company login' },
      { key: 'username', label: 'Username', type: 'text', placeholder: 'Your Faxage username' },
      { key: 'password', label: 'Password', type: 'password', placeholder: 'Your Faxage password' },
      { key: 'faxNumber', label: 'Fax Number', type: 'text', placeholder: '15551234567', helpText: 'Your Faxage DID number with country code' },
    ],
  },
  phaxio: {
    name: 'Phaxio (Sinch)',
    description: 'Developer-friendly fax API with modern REST/JSON interface. HIPAA compliant.',
    website: 'https://www.phaxio.com',
    baaInfo: 'Sign BAA in the Phaxio/Sinch dashboard under Build > HIPAA settings.',
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'text', placeholder: 'Your Phaxio API key' },
      { key: 'apiSecret', label: 'API Secret', type: 'password', placeholder: 'Your Phaxio API secret' },
      { key: 'faxNumber', label: 'Fax Number', type: 'text', placeholder: '+15551234567', helpText: 'Your Phaxio number in E.164 format' },
    ],
  },
};
