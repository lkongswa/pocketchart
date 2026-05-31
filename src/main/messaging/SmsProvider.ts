// SMS Provider Abstraction Layer — Interface + Types + Credential Schemas
// SMS providers (Twilio, and later others) implement SmsProvider.
// The MessagingRouter routes calls to whichever provider the user has configured.
//
// PHI note: appointment reminders are sent from the user's own BAA-covered provider
// account (e.g. Twilio with a signed BAA + HIPAA-eligible config). Credentials are stored
// encrypted via safeStorage. Keep PHI OUT of message bodies — send minimal reminders
// (date/time + practice name + confirm/cancel prompt), never clinical detail.
//
// Inbound is POLLED (no public webhook) — consistent with the local-first design and the
// fax inbox pattern. See MessagingRouter / the App.tsx poll loop.

export type SmsProviderType = 'twilio';

export interface SendSmsParams {
  to: string;        // E.164 (+15551234567)
  body: string;      // Minimal — no clinical PHI
}

export interface SendSmsResult {
  success: boolean;
  messageSid: string;
  error?: string;
}

export type SmsDeliveryStatus =
  | 'queued'
  | 'sending'
  | 'sent'
  | 'delivered'
  | 'undelivered'
  | 'failed'
  | 'received'
  | 'unknown';

export interface SmsStatusResult {
  messageSid: string;
  status: SmsDeliveryStatus;
  to: string;
  errorMessage?: string;
}

export interface InboundSms {
  messageSid: string;
  from: string;          // E.164 sender
  body: string;
  receivedAt: string;    // ISO date string
}

export interface ConnectionTestResult {
  success: boolean;
  message: string;
  fromNumber?: string;
}

/**
 * Common interface all SMS providers implement. The MessagingRouter delegates to
 * whichever provider the user configured in Settings. Shape mirrors FaxProvider
 * (send + status + polled inbox).
 */
export interface SmsProvider {
  /** Verify credentials and connectivity */
  testConnection(): Promise<ConnectionTestResult>;

  /** Send an SMS */
  sendSms(params: SendSmsParams): Promise<SendSmsResult>;

  /** Check the delivery status of a sent message */
  checkStatus(messageSid: string): Promise<SmsStatusResult>;

  /** List inbound messages since a given date (polled — no webhook needed) */
  getInbox(since?: Date): Promise<InboundSms[]>;

  /** The number messages are sent from */
  getFromNumber(): string;
}

// ── Provider Credential Schemas ──
// Drives the Settings UI; mirrors the fax/email schemas, including the `baaInfo` line.

export interface ProviderCredentialField {
  key: string;
  label: string;
  type: 'text' | 'password';
  placeholder: string;
  helpText?: string;
}

export const SMS_PROVIDER_CREDENTIAL_SCHEMAS: Record<SmsProviderType, {
  name: string;
  description: string;
  website: string;
  baaInfo: string;
  fields: ProviderCredentialField[];
}> = {
  twilio: {
    name: 'Twilio',
    description: 'Programmable SMS for appointment reminders. HIPAA-eligible with a signed BAA.',
    website: 'https://www.twilio.com',
    baaInfo:
      'Request a BAA from Twilio (paid account) and enable their HIPAA-eligible configuration ' +
      'before sending PHI. Keep message bodies free of clinical detail.',
    fields: [
      { key: 'accountSid', label: 'Account SID', type: 'text', placeholder: 'ACxxxxxxxxxxxxxxxx', helpText: 'Twilio Console → Account Info.' },
      { key: 'authToken', label: 'Auth Token', type: 'password', placeholder: 'Your Twilio auth token' },
      { key: 'fromNumber', label: 'From Number', type: 'text', placeholder: '+15551234567', helpText: 'Your Twilio phone number in E.164 format.' },
    ],
  },
};
