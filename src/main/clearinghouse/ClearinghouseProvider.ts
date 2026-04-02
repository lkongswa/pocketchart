// Clearinghouse Provider Abstraction Layer — Interface + Types + Credential Schemas
// All clearinghouse providers (Claim.MD, Availity, Office Ally) implement the
// ClearinghouseProvider interface. The ClearinghouseRouter routes calls to
// whichever provider the user has configured.

export type ClearinghouseProviderType = 'claimmd' | 'availity' | 'officeally';

// ── Result Interfaces ──

export interface ConnectionTestResult {
  success: boolean;
  message: string;
}

export interface PayerInfo {
  payerId: string;
  payerName: string;
  [key: string]: any;  // Provider-specific fields pass through
}

export interface EnrollmentStatusResult {
  status: string;
  message: string;
}

export interface ClaimSubmissionResult {
  success: boolean;
  clearinghouseClaimId?: string;
  message: string;
  errors?: string[];
}

export interface ClaimStatusResult {
  status: string;
  message: string;
  rawResponse?: any;
}

export interface EligibilityResult {
  success: boolean;
  rawResponse?: string;
  message: string;
  errors?: string[];
}

export interface RemittanceResult {
  success: boolean;
  remittances: any[];
  message: string;
}

/**
 * Common interface that all clearinghouse providers must implement.
 *
 * IMPORTANT: The EDI file generators (837P, 270, 835 parser) are NOT part of
 * this interface. They produce/consume standard X12 format regardless of
 * clearinghouse. This interface only covers transport: how we submit files,
 * check status, and retrieve responses.
 */
export interface ClearinghouseProvider {
  /** Verify credentials and connectivity */
  testConnection(): Promise<ConnectionTestResult>;

  /** Fetch the payer directory from the clearinghouse */
  getPayerList(): Promise<PayerInfo[]>;

  /** Check enrollment status for a specific payer */
  checkEnrollmentStatus(payerId: string): Promise<EnrollmentStatusResult>;

  /** Submit a pre-generated 837P EDI string to the clearinghouse */
  submitClaim(edi837Content: string): Promise<ClaimSubmissionResult>;

  /** Check status of a previously submitted claim */
  checkClaimStatus(clearinghouseClaimId: string): Promise<ClaimStatusResult>;

  /** Submit a pre-generated 270 EDI string, get back raw 271 */
  checkEligibility(edi270Content: string): Promise<EligibilityResult>;

  /** Fetch available 835/ERA remittance files from the clearinghouse */
  getRemittances(startDate: string, endDate: string): Promise<RemittanceResult>;
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

export const CLEARINGHOUSE_CREDENTIAL_SCHEMAS: Record<ClearinghouseProviderType, {
  name: string;
  description: string;
  website: string;
  pricingNote: string;
  fields: ProviderCredentialField[];
}> = {
  claimmd: {
    name: 'Claim.MD',
    description: 'Developer-friendly REST API with per-claim pricing. Great for solo practices.',
    website: 'https://www.claim.md',
    pricingNote: 'Approximately $0.25–0.35 per claim. No monthly minimum.',
    fields: [
      { key: 'apiKey', label: 'API Key', type: 'password', placeholder: 'Your Claim.MD API key' },
      { key: 'accountKey', label: 'Account Key (optional)', type: 'text', placeholder: 'Optional account key', helpText: 'Required if your account uses sub-accounts' },
    ],
  },
  availity: {
    name: 'Availity',
    description: 'Largest US clearinghouse. Enterprise-focused with broad payer coverage. (Coming soon)',
    website: 'https://www.availity.com',
    pricingNote: 'Pricing varies. Contact Availity for solo practitioner rates.',
    fields: [
      { key: 'clientId', label: 'Client ID', type: 'text', placeholder: 'Your Availity Client ID' },
      { key: 'clientSecret', label: 'Client Secret', type: 'password', placeholder: 'Your Availity Client Secret' },
    ],
  },
  officeally: {
    name: 'Office Ally',
    description: 'Free claim submission option. Web-portal focused with limited API. (Coming soon)',
    website: 'https://www.officeally.com',
    pricingNote: 'Free for claim submission. ERA and other services may have fees.',
    fields: [
      { key: 'username', label: 'Username', type: 'text', placeholder: 'Your Office Ally username' },
      { key: 'password', label: 'Password', type: 'password', placeholder: 'Your Office Ally password' },
    ],
  },
};
