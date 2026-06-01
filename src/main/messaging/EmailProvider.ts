// Email Provider Abstraction Layer — Interface + Types + Credential Schemas
// All email providers (Gmail SMTP, and later generic SMTP) implement EmailProvider.
// The MessagingRouter routes calls to whichever provider the user has configured.
//
// PHI note: email is sent DIRECTLY from the user's machine through their own
// BAA-covered account (e.g. a paid Google Workspace). Credentials are stored
// encrypted via safeStorage. There is no PocketChart server in the path — message
// contents never transit our infrastructure. This mirrors the fax module's model.

export type EmailProviderType = 'gmail_smtp';

export interface EmailAttachment {
  fileName: string;
  contentBase64: string;     // Base64-encoded file (e.g. a superbill PDF)
  contentType?: string;      // Defaults to application/pdf
}

export interface SendEmailParams {
  to: string;
  subject: string;
  bodyText: string;          // Plain-text body (always required)
  bodyHtml?: string;         // Optional HTML body
  attachments?: EmailAttachment[];
  replyTo?: string;
  fromName?: string;         // Optional display name for the From header (e.g. practice name).
                             // When omitted, the provider account's own display name is used.
}

export interface SendEmailResult {
  success: boolean;
  messageId: string;         // Provider message-id
  error?: string;
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  fromAddress?: string;
}

/**
 * Common interface that all email providers must implement.
 * The main process MessagingRouter delegates to whichever provider
 * the user has configured in Settings.
 */
export interface EmailProvider {
  /** Verify credentials and SMTP connectivity */
  testConnection(): Promise<ConnectionTestResult>;

  /** Send an email (optionally with attachments) */
  sendEmail(params: SendEmailParams): Promise<SendEmailResult>;

  /** The address mail is sent from (for display / From header) */
  getFromAddress(): string;
}

// ── Provider Credential Schemas ──
// Drives the Settings UI; mirrors PROVIDER_CREDENTIAL_SCHEMAS in the fax module,
// including the per-provider `baaInfo` line so the BAA expectation is shown inline.

export interface ProviderCredentialField {
  key: string;
  label: string;
  type: 'text' | 'password';
  placeholder: string;
  helpText?: string;
}

export const EMAIL_PROVIDER_CREDENTIAL_SCHEMAS: Record<EmailProviderType, {
  name: string;
  description: string;
  website: string;
  baaInfo: string;
  fields: ProviderCredentialField[];
}> = {
  gmail_smtp: {
    name: 'Google Workspace (Gmail)',
    description: 'Send from your own paid Google Workspace account over SMTP.',
    website: 'https://admin.google.com',
    baaInfo:
      'Requires a PAID Google Workspace plan with the BAA accepted in Admin console → ' +
      'Account → Legal & compliance. Free @gmail.com accounts are NOT covered by a BAA — ' +
      'do not send PHI from them.',
    fields: [
      {
        key: 'fromAddress',
        label: 'Email Address',
        type: 'text',
        placeholder: 'you@yourpractice.com',
        helpText: 'Your Workspace email — used as the From address.',
      },
      {
        key: 'appPassword',
        label: 'App Password',
        type: 'password',
        placeholder: '16-character app password',
        helpText:
          'Google Account → Security → 2-Step Verification → App passwords. ' +
          'Requires 2FA enabled. This is NOT your normal login password.',
      },
    ],
  },
};
