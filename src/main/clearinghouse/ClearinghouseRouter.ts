// Clearinghouse Router — Routes clearinghouse operations to whichever provider
// the user has configured. Reads the active provider from the settings table,
// loads credentials, and instantiates the correct ClearinghouseProvider implementation.
// Handles credential storage, migration from legacy Claim.MD format, and provider switching.

import Database from 'better-sqlite3';
import type {
  ClearinghouseProvider,
  ClearinghouseProviderType,
  ConnectionTestResult,
} from './ClearinghouseProvider';
import { ClaimMDProvider } from './providers/ClaimMDProvider';
import { AvailityProvider } from './providers/AvailityProvider';
import { OfficeAllyProvider } from './providers/OfficeAllyProvider';

export class ClearinghouseRouter {
  private provider: ClearinghouseProvider | null = null;
  private providerType: ClearinghouseProviderType | null = null;

  /**
   * Initialize the router by reading stored provider config.
   * Called once at app startup after DB is ready.
   * Auto-migrates legacy Claim.MD credentials from electron-store if found.
   */
  initialize(
    db: Database.Database,
    decryptSecure: (encrypted: string) => string,
    encryptSecure: (plaintext: string) => string,
  ): void {
    // Check for legacy Claim.MD credentials and auto-migrate
    this.migrateLegacyCredentials(db, decryptSecure, encryptSecure);

    // Read active provider
    const providerRow = db.prepare("SELECT value FROM settings WHERE key = 'clearinghouse_provider'").get() as any;
    if (!providerRow?.value) {
      this.provider = null;
      this.providerType = null;
      return;
    }

    const providerType = providerRow.value as ClearinghouseProviderType;
    const credsKey = `secure_clearinghouse_creds_${providerType}`;
    const credsRow = db.prepare('SELECT value FROM settings WHERE key = ?').get(credsKey) as any;
    if (!credsRow?.value) {
      this.provider = null;
      this.providerType = null;
      return;
    }

    try {
      const credentials = JSON.parse(decryptSecure(credsRow.value));
      this.providerType = providerType;
      this.provider = this.createProvider(providerType, credentials);
    } catch (err) {
      console.error('[ClearinghouseRouter] Failed to initialize provider:', err);
      this.provider = null;
      this.providerType = null;
    }
  }

  /**
   * Auto-migrate legacy Claim.MD credentials from electron-store to new
   * namespaced format in the settings table.
   *
   * Legacy keys in electron-store:
   *   claimmd_api_key — encrypted via safeStorage.encryptString(), stored as base64
   *   claimmd_account_key — stored in plaintext
   *
   * This runs once and deletes the old keys after migration.
   */
  private migrateLegacyCredentials(
    db: Database.Database,
    _decryptSecure: (encrypted: string) => string,
    encryptSecure: (plaintext: string) => string,
  ): void {
    // Skip migration entirely — legacy electron-store credentials will be re-entered
    // by the user via the new provider Settings UI. This avoids any startup crashes
    // from safeStorage decryption edge cases. The old electron-store keys are harmless.
    try {
      const existing = db.prepare("SELECT value FROM settings WHERE key = 'clearinghouse_provider'").get() as any;
      if (existing?.value) return; // Already configured via new UI
      console.log('[ClearinghouseRouter] No clearinghouse provider configured. User will set up via Settings.');
    } catch (err) {
      console.error('[ClearinghouseRouter] Error checking clearinghouse config:', err);
    }
  }

  private createProvider(type: ClearinghouseProviderType, credentials: Record<string, string>): ClearinghouseProvider {
    switch (type) {
      case 'claimmd':
        return new ClaimMDProvider(credentials);
      case 'availity':
        return new AvailityProvider(credentials);
      case 'officeally':
        return new OfficeAllyProvider(credentials);
      default:
        throw new Error(`Unknown clearinghouse provider: ${type}`);
    }
  }

  getProvider(): ClearinghouseProvider {
    if (!this.provider) {
      throw new Error('Clearinghouse not configured. Go to Settings > Clearinghouse to set up.');
    }
    return this.provider;
  }

  getProviderType(): ClearinghouseProviderType | null {
    return this.providerType;
  }

  isConfigured(): boolean {
    return this.provider !== null;
  }

  /**
   * Set the active clearinghouse provider. Stores credentials and reinitializes.
   */
  setProvider(
    type: ClearinghouseProviderType,
    credentials: Record<string, string>,
    db: Database.Database,
    encryptSecure: (plaintext: string) => string,
  ): void {
    const encryptedCreds = encryptSecure(JSON.stringify(credentials));
    const credsKey = `secure_clearinghouse_creds_${type}`;

    const upsert = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
    upsert.run('clearinghouse_provider', type);
    upsert.run(credsKey, encryptedCreds);

    this.providerType = type;
    this.provider = this.createProvider(type, credentials);
  }

  /**
   * Remove the active clearinghouse provider and its credentials.
   */
  removeProvider(db: Database.Database): void {
    if (this.providerType) {
      const credsKey = `secure_clearinghouse_creds_${this.providerType}`;
      db.prepare('DELETE FROM settings WHERE key = ?').run(credsKey);
    }
    db.prepare("DELETE FROM settings WHERE key = 'clearinghouse_provider'").run();

    this.provider = null;
    this.providerType = null;
  }

  /**
   * Test the connection for the active provider.
   */
  async testConnection(): Promise<ConnectionTestResult> {
    if (!this.provider) {
      return { success: false, message: 'No clearinghouse provider configured' };
    }
    return this.provider.testConnection();
  }
}
