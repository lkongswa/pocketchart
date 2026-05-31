// Messaging Router — routes email + SMS operations to whichever provider the user has
// configured. Reads the active provider from the settings table, loads encrypted
// credentials, and instantiates the correct provider. Mirrors FaxRouter.
//
// Settings keys:
//   email_provider / secure_email_creds_<type>   → email (Gmail SMTP)
//   sms_provider   / secure_sms_creds_<type>      → SMS (Twilio)

import Database from 'better-sqlite3';
import type { EmailProvider, EmailProviderType, ConnectionTestResult } from './EmailProvider';
import type { SmsProvider, SmsProviderType, ConnectionTestResult as SmsConnectionTestResult } from './SmsProvider';
import { GmailSmtpProvider } from './providers/GmailSmtpProvider';
import { TwilioProvider } from './providers/TwilioProvider';

export class MessagingRouter {
  private emailProvider: EmailProvider | null = null;
  private emailProviderType: EmailProviderType | null = null;
  private smsProvider: SmsProvider | null = null;
  private smsProviderType: SmsProviderType | null = null;

  /**
   * Initialize the router by reading stored provider config (email + SMS).
   * Called once at app startup after DB is ready.
   */
  initialize(
    db: Database.Database,
    decryptSecure: (encrypted: string) => string,
    _encryptSecure: (plaintext: string) => string,
  ): void {
    this.initializeEmail(db, decryptSecure);
    this.initializeSms(db, decryptSecure);
  }

  // ════════════════════════════════════════════════════════════
  // ── Email ──
  // ════════════════════════════════════════════════════════════

  private initializeEmail(db: Database.Database, decryptSecure: (encrypted: string) => string): void {
    const providerRow = db.prepare("SELECT value FROM settings WHERE key = 'email_provider'").get() as any;
    if (!providerRow?.value) {
      this.emailProvider = null;
      this.emailProviderType = null;
      return;
    }

    const providerType = providerRow.value as EmailProviderType;
    const credsKey = `secure_email_creds_${providerType}`;
    const credsRow = db.prepare('SELECT value FROM settings WHERE key = ?').get(credsKey) as any;
    if (!credsRow?.value) {
      this.emailProvider = null;
      this.emailProviderType = null;
      return;
    }

    try {
      const credentials = JSON.parse(decryptSecure(credsRow.value));
      this.emailProviderType = providerType;
      this.emailProvider = this.createEmailProvider(providerType, credentials);
    } catch (err) {
      console.error('[MessagingRouter] Failed to initialize email provider:', err);
      this.emailProvider = null;
      this.emailProviderType = null;
    }
  }

  private createEmailProvider(type: EmailProviderType, credentials: Record<string, string>): EmailProvider {
    switch (type) {
      case 'gmail_smtp':
        return new GmailSmtpProvider(credentials);
      default:
        throw new Error(`Unknown email provider: ${type}`);
    }
  }

  getEmailProvider(): EmailProvider {
    if (!this.emailProvider) {
      throw new Error('Email provider not configured. Go to Settings → Email to set up.');
    }
    return this.emailProvider;
  }

  getEmailProviderType(): EmailProviderType | null {
    return this.emailProviderType;
  }

  getEmailFromAddress(): string {
    return this.emailProvider?.getFromAddress() || '';
  }

  isEmailConfigured(): boolean {
    return this.emailProvider !== null;
  }

  setEmailProvider(
    type: EmailProviderType,
    credentials: Record<string, string>,
    db: Database.Database,
    encryptSecure: (plaintext: string) => string,
  ): void {
    const encryptedCreds = encryptSecure(JSON.stringify(credentials));
    const credsKey = `secure_email_creds_${type}`;

    const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    upsert.run('email_provider', type);
    upsert.run(credsKey, encryptedCreds);

    this.emailProviderType = type;
    this.emailProvider = this.createEmailProvider(type, credentials);
  }

  removeEmailProvider(db: Database.Database): void {
    if (this.emailProviderType) {
      db.prepare('DELETE FROM settings WHERE key = ?').run(`secure_email_creds_${this.emailProviderType}`);
    }
    db.prepare("DELETE FROM settings WHERE key = 'email_provider'").run();

    this.emailProvider = null;
    this.emailProviderType = null;
  }

  async testEmailConnection(): Promise<ConnectionTestResult> {
    if (!this.emailProvider) {
      return { success: false, message: 'No email provider configured' };
    }
    return this.emailProvider.testConnection();
  }

  // ════════════════════════════════════════════════════════════
  // ── SMS ──
  // ════════════════════════════════════════════════════════════

  private initializeSms(db: Database.Database, decryptSecure: (encrypted: string) => string): void {
    const providerRow = db.prepare("SELECT value FROM settings WHERE key = 'sms_provider'").get() as any;
    if (!providerRow?.value) {
      this.smsProvider = null;
      this.smsProviderType = null;
      return;
    }

    const providerType = providerRow.value as SmsProviderType;
    const credsKey = `secure_sms_creds_${providerType}`;
    const credsRow = db.prepare('SELECT value FROM settings WHERE key = ?').get(credsKey) as any;
    if (!credsRow?.value) {
      this.smsProvider = null;
      this.smsProviderType = null;
      return;
    }

    try {
      const credentials = JSON.parse(decryptSecure(credsRow.value));
      this.smsProviderType = providerType;
      this.smsProvider = this.createSmsProvider(providerType, credentials);
    } catch (err) {
      console.error('[MessagingRouter] Failed to initialize SMS provider:', err);
      this.smsProvider = null;
      this.smsProviderType = null;
    }
  }

  private createSmsProvider(type: SmsProviderType, credentials: Record<string, string>): SmsProvider {
    switch (type) {
      case 'twilio':
        return new TwilioProvider(credentials);
      default:
        throw new Error(`Unknown SMS provider: ${type}`);
    }
  }

  getSmsProvider(): SmsProvider {
    if (!this.smsProvider) {
      throw new Error('SMS provider not configured. Go to Settings → Text Messaging to set up.');
    }
    return this.smsProvider;
  }

  getSmsProviderType(): SmsProviderType | null {
    return this.smsProviderType;
  }

  getSmsFromNumber(): string {
    return this.smsProvider?.getFromNumber() || '';
  }

  isSmsConfigured(): boolean {
    return this.smsProvider !== null;
  }

  setSmsProvider(
    type: SmsProviderType,
    credentials: Record<string, string>,
    db: Database.Database,
    encryptSecure: (plaintext: string) => string,
  ): void {
    const encryptedCreds = encryptSecure(JSON.stringify(credentials));
    const credsKey = `secure_sms_creds_${type}`;

    const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    upsert.run('sms_provider', type);
    upsert.run(credsKey, encryptedCreds);

    this.smsProviderType = type;
    this.smsProvider = this.createSmsProvider(type, credentials);
  }

  removeSmsProvider(db: Database.Database): void {
    if (this.smsProviderType) {
      db.prepare('DELETE FROM settings WHERE key = ?').run(`secure_sms_creds_${this.smsProviderType}`);
    }
    db.prepare("DELETE FROM settings WHERE key = 'sms_provider'").run();

    this.smsProvider = null;
    this.smsProviderType = null;
  }

  async testSmsConnection(): Promise<SmsConnectionTestResult> {
    if (!this.smsProvider) {
      return { success: false, message: 'No SMS provider configured' };
    }
    return this.smsProvider.testConnection();
  }
}
