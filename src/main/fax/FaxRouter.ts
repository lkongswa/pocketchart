// Fax Router — Routes fax operations to whichever provider the user has configured.
// Reads the active provider from the settings table, loads credentials, and instantiates
// the correct FaxProvider implementation. Handles credential storage, migration from
// legacy SRFax format, and provider switching.

import Database from 'better-sqlite3';
import type { FaxProvider, FaxProviderType, ConnectionTestResult } from './FaxProvider';
import { SRFaxProvider } from './providers/SRFaxProvider';
import { FaxageProvider } from './providers/FaxageProvider';
import { PhaxioProvider } from './providers/PhaxioProvider';

export class FaxRouter {
  private provider: FaxProvider | null = null;
  private providerType: FaxProviderType | null = null;
  private providerFaxNumber: string = '';

  /**
   * Initialize the router by reading stored provider config.
   * Called once at app startup after DB is ready.
   * Auto-migrates legacy SRFax credentials if found.
   */
  initialize(
    db: Database.Database,
    decryptSecure: (encrypted: string) => string,
    encryptSecure: (plaintext: string) => string,
  ): void {
    // Check for legacy SRFax credentials and auto-migrate
    this.migrateLegacyCredentials(db, decryptSecure, encryptSecure);

    // Read active provider
    const providerRow = db.prepare("SELECT value FROM settings WHERE key = 'fax_provider'").get() as any;
    if (!providerRow?.value) {
      this.provider = null;
      this.providerType = null;
      return;
    }

    const providerType = providerRow.value as FaxProviderType;
    const credsKey = `secure_fax_creds_${providerType}`;
    const credsRow = db.prepare('SELECT value FROM settings WHERE key = ?').get(credsKey) as any;
    if (!credsRow?.value) {
      this.provider = null;
      this.providerType = null;
      return;
    }

    try {
      const credentials = JSON.parse(decryptSecure(credsRow.value));
      this.providerType = providerType;
      this.providerFaxNumber = credentials.faxNumber || '';
      this.provider = this.createProvider(providerType, credentials);
    } catch (err) {
      console.error('[FaxRouter] Failed to initialize provider:', err);
      this.provider = null;
      this.providerType = null;
    }
  }

  /**
   * Auto-migrate legacy SRFax credentials (stored as separate keys) to new namespaced format.
   * This is a one-time migration that runs transparently on first launch after update.
   */
  private migrateLegacyCredentials(
    db: Database.Database,
    decryptSecure: (encrypted: string) => string,
    encryptSecure: (plaintext: string) => string,
  ): void {
    // Check if already migrated (fax_provider setting exists)
    const existing = db.prepare("SELECT value FROM settings WHERE key = 'fax_provider'").get() as any;
    if (existing?.value) return;

    // Check for legacy SRFax credentials
    const accessIdRow = db.prepare("SELECT value FROM settings WHERE key = 'secure_srfax_access_id'").get() as any;
    const accessPwdRow = db.prepare("SELECT value FROM settings WHERE key = 'secure_srfax_access_pwd'").get() as any;

    if (!accessIdRow?.value || !accessPwdRow?.value) return;

    try {
      const accountNumber = decryptSecure(accessIdRow.value);
      const password = decryptSecure(accessPwdRow.value);

      let faxNumber = '';
      const callerIdRow = db.prepare("SELECT value FROM settings WHERE key = 'secure_srfax_caller_id'").get() as any;
      if (callerIdRow?.value) {
        faxNumber = decryptSecure(callerIdRow.value);
      }

      const credentials = { accountNumber, password, faxNumber };
      const encryptedCreds = encryptSecure(JSON.stringify(credentials));

      // Store in new format
      const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
      upsert.run('fax_provider', 'srfax');
      upsert.run('secure_fax_creds_srfax', encryptedCreds);

      console.log('[FaxRouter] Migrated legacy SRFax credentials to new format');
    } catch (err) {
      console.error('[FaxRouter] Failed to migrate legacy SRFax credentials:', err);
    }
  }

  private createProvider(type: FaxProviderType, credentials: Record<string, string>): FaxProvider {
    switch (type) {
      case 'srfax':
        return new SRFaxProvider(credentials);
      case 'faxage':
        return new FaxageProvider(credentials);
      case 'phaxio':
        return new PhaxioProvider(credentials);
      default:
        throw new Error(`Unknown fax provider: ${type}`);
    }
  }

  getProvider(): FaxProvider {
    if (!this.provider) {
      throw new Error('Fax provider not configured. Go to Settings > Fax to set up.');
    }
    return this.provider;
  }

  getProviderType(): FaxProviderType | null {
    return this.providerType;
  }

  getProviderFaxNumber(): string {
    return this.providerFaxNumber;
  }

  isConfigured(): boolean {
    return this.provider !== null;
  }

  /**
   * Set the active fax provider. Stores credentials and reinitializes the router.
   */
  setProvider(
    type: FaxProviderType,
    credentials: Record<string, string>,
    db: Database.Database,
    encryptSecure: (plaintext: string) => string,
  ): void {
    const encryptedCreds = encryptSecure(JSON.stringify(credentials));
    const credsKey = `secure_fax_creds_${type}`;

    const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    upsert.run('fax_provider', type);
    upsert.run(credsKey, encryptedCreds);

    this.providerType = type;
    this.providerFaxNumber = credentials.faxNumber || '';
    this.provider = this.createProvider(type, credentials);
  }

  /**
   * Remove the active fax provider and its credentials.
   */
  removeProvider(db: Database.Database): void {
    if (this.providerType) {
      const credsKey = `secure_fax_creds_${this.providerType}`;
      db.prepare('DELETE FROM settings WHERE key = ?').run(credsKey);
    }
    db.prepare("DELETE FROM settings WHERE key = 'fax_provider'").run();

    this.provider = null;
    this.providerType = null;
    this.providerFaxNumber = '';
  }

  /**
   * Test the connection for the active provider.
   */
  async testConnection(): Promise<ConnectionTestResult> {
    if (!this.provider) {
      return { success: false, message: 'No fax provider configured' };
    }
    return this.provider.testConnection();
  }
}
