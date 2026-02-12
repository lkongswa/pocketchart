/**
 * Keystore & Crypto Module
 *
 * Handles all encryption key management for PocketChart's SQLCipher database encryption.
 *
 * Architecture:
 * - A random 32-byte MASTER KEY is the actual SQLCipher PRAGMA key
 * - The master key is wrapped (AES-256-GCM encrypted) twice:
 *   1. Passphrase wrap: derived from user's passphrase via PBKDF2
 *   2. Recovery wrap: derived from the recovery key via PBKDF2
 * - Both wrapped copies stored in electron-store (JSON config, outside the DB)
 * - Either passphrase OR recovery key can unwrap the master key
 * - Changing the passphrase only re-wraps; no DB re-encryption needed
 *
 * Security invariants:
 * - The master key is NEVER stored in plaintext on disk
 * - The passphrase is NEVER stored anywhere
 * - The recovery key is NEVER stored after the initial ceremony
 * - All key derivation uses PBKDF2-SHA512 with 600K iterations
 */

import crypto from 'crypto';
import Store from 'electron-store';

// ── Constants ──

const PBKDF2_ITERATIONS = 600_000;
const PBKDF2_DIGEST = 'sha512';
const KEY_LENGTH = 32; // 256 bits
const SALT_LENGTH = 32; // 256-bit salts
const IV_LENGTH = 16; // AES-GCM IV
const CIPHER_ALGORITHM = 'aes-256-gcm';
const KEYSTORE_VERSION = 1;

// ── Types ──

interface WrappedKey {
  /** Base64-encoded AES-256-GCM ciphertext */
  encrypted: string;
  /** Base64-encoded initialization vector */
  iv: string;
  /** Base64-encoded GCM authentication tag */
  authTag: string;
  /** Base64-encoded PBKDF2 salt used to derive the wrapping key */
  salt: string;
}

export interface KeystoreData {
  version: number;
  passphraseWrappedKey: WrappedKey;
  recoveryWrappedKey: WrappedKey;
}

interface KeystoreStoreSchema {
  dataPath?: string;
  encryption?: KeystoreData;
}

// ── electron-store instance (shared with database.ts via same config file) ──

interface TypedKeystoreStore {
  get(key: 'encryption'): KeystoreData | undefined;
  get(key: 'dataPath'): string | undefined;
  set(key: 'encryption', value: KeystoreData): void;
  delete(key: 'encryption'): void;
  has(key: string): boolean;
}

const store = new Store<KeystoreStoreSchema>() as unknown as TypedKeystoreStore;

// ── Low-Level Crypto ──

/**
 * Derive a 256-bit key from a passphrase using PBKDF2-SHA512.
 * This is intentionally slow (~1-2 seconds) to resist brute force.
 */
function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return crypto.pbkdf2Sync(passphrase, salt, PBKDF2_ITERATIONS, KEY_LENGTH, PBKDF2_DIGEST);
}

/**
 * Wrap (encrypt) a master key using AES-256-GCM with a wrapping key.
 */
function wrapKey(masterKey: Buffer, wrappingKey: Buffer): Omit<WrappedKey, 'salt'> {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(CIPHER_ALGORITHM, wrappingKey, iv);
  const encrypted = Buffer.concat([cipher.update(masterKey), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    encrypted: encrypted.toString('base64'),
    iv: iv.toString('base64'),
    authTag: authTag.toString('base64'),
  };
}

/**
 * Unwrap (decrypt) a master key using AES-256-GCM with a wrapping key.
 * Throws if the wrapping key is wrong (auth tag verification fails).
 */
function unwrapKey(wrapped: Omit<WrappedKey, 'salt'>, wrappingKey: Buffer): Buffer {
  const decipher = crypto.createDecipheriv(
    CIPHER_ALGORITHM,
    wrappingKey,
    Buffer.from(wrapped.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(wrapped.authTag, 'base64'));
  const decrypted = Buffer.concat([
    decipher.update(Buffer.from(wrapped.encrypted, 'base64')),
    decipher.final(),
  ]);
  return decrypted;
}

// ── Recovery Key Generation ──

/**
 * Generate a 32-character alphanumeric recovery key formatted in groups of 4.
 * Example: A7K2-M9P4-X3B8-Q5R1-T6W2-J8C4-N7F3-V9H1
 */
export function generateRecoveryKey(): string {
  // Use a charset that avoids ambiguous characters (0/O, 1/I/L)
  const charset = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
  const bytes = crypto.randomBytes(32);
  let key = '';
  for (let i = 0; i < 32; i++) {
    key += charset[bytes[i] % charset.length];
  }
  // Format as groups of 4 separated by dashes
  return key.match(/.{1,4}/g)!.join('-');
}

/**
 * Strip dashes from a recovery key for processing.
 */
function normalizeRecoveryKey(key: string): string {
  return key.replace(/-/g, '').toUpperCase();
}

// ── Keystore CRUD ──

export function keystoreExists(): boolean {
  return store.has('encryption');
}

export function loadKeystore(): KeystoreData | null {
  const data = store.get('encryption');
  return data || null;
}

function saveKeystore(data: KeystoreData): void {
  store.set('encryption', data);
}

/**
 * Remove the encryption keystore entirely.
 * Used when reverting from encrypted to plaintext mode.
 */
export function clearKeystore(): void {
  store.delete('encryption');
}

// ── High-Level Operations ──

/**
 * First-time encryption setup.
 * Generates a master key, wraps it with both passphrase and recovery key,
 * stores the wrapped keys in electron-store.
 *
 * @returns { masterKeyHex, recoveryKey } — caller uses masterKeyHex to init DB,
 *          and presents recoveryKey to the user in the ceremony.
 */
export function setupEncryption(passphrase: string): { masterKeyHex: string; recoveryKey: string } {
  // Generate random master key
  const masterKey = crypto.randomBytes(KEY_LENGTH);
  const masterKeyHex = masterKey.toString('hex');

  // Generate recovery key
  const recoveryKey = generateRecoveryKey();
  const normalizedRecovery = normalizeRecoveryKey(recoveryKey);

  // Derive wrapping keys
  const passphraseSalt = crypto.randomBytes(SALT_LENGTH);
  const recoverySalt = crypto.randomBytes(SALT_LENGTH);
  const passphraseWrappingKey = deriveKey(passphrase, passphraseSalt);
  const recoveryWrappingKey = deriveKey(normalizedRecovery, recoverySalt);

  // Wrap master key with both
  const passphraseWrap = wrapKey(masterKey, passphraseWrappingKey);
  const recoveryWrap = wrapKey(masterKey, recoveryWrappingKey);

  // Store in electron-store
  saveKeystore({
    version: KEYSTORE_VERSION,
    passphraseWrappedKey: { ...passphraseWrap, salt: passphraseSalt.toString('base64') },
    recoveryWrappedKey: { ...recoveryWrap, salt: recoverySalt.toString('base64') },
  });

  // Zero out sensitive buffers
  masterKey.fill(0);
  passphraseWrappingKey.fill(0);
  recoveryWrappingKey.fill(0);

  return { masterKeyHex, recoveryKey };
}

/**
 * Unlock the database with the user's passphrase.
 * @returns masterKeyHex for use as SQLCipher PRAGMA key
 * @throws if passphrase is wrong or keystore doesn't exist
 */
export function unlockWithPassphrase(passphrase: string): string {
  const keystore = loadKeystore();
  if (!keystore) throw new Error('No encryption keystore found');

  const wrap = keystore.passphraseWrappedKey;
  const salt = Buffer.from(wrap.salt, 'base64');
  const wrappingKey = deriveKey(passphrase, salt);

  try {
    const masterKey = unwrapKey(wrap, wrappingKey);
    const hex = masterKey.toString('hex');
    masterKey.fill(0);
    wrappingKey.fill(0);
    return hex;
  } catch {
    wrappingKey.fill(0);
    throw new Error('Incorrect passphrase');
  }
}

/**
 * Unlock the database with the recovery key.
 * @returns masterKeyHex for use as SQLCipher PRAGMA key
 * @throws if recovery key is wrong or keystore doesn't exist
 */
export function unlockWithRecoveryKey(recoveryKey: string): string {
  const keystore = loadKeystore();
  if (!keystore) throw new Error('No encryption keystore found');

  const normalizedKey = normalizeRecoveryKey(recoveryKey);
  const wrap = keystore.recoveryWrappedKey;
  const salt = Buffer.from(wrap.salt, 'base64');
  const wrappingKey = deriveKey(normalizedKey, salt);

  try {
    const masterKey = unwrapKey(wrap, wrappingKey);
    const hex = masterKey.toString('hex');
    masterKey.fill(0);
    wrappingKey.fill(0);
    return hex;
  } catch {
    wrappingKey.fill(0);
    throw new Error('Incorrect recovery key');
  }
}

/**
 * Change the encryption passphrase. Re-wraps the master key with the new passphrase.
 * Does NOT require re-encrypting the database.
 *
 * @param currentPassphrase - to prove identity and unwrap the master key
 * @param newPassphrase - the new passphrase to wrap with
 */
export function changePassphrase(currentPassphrase: string, newPassphrase: string): void {
  const keystore = loadKeystore();
  if (!keystore) throw new Error('No encryption keystore found');

  // Unwrap with current passphrase
  const currentWrap = keystore.passphraseWrappedKey;
  const currentSalt = Buffer.from(currentWrap.salt, 'base64');
  const currentWrappingKey = deriveKey(currentPassphrase, currentSalt);

  let masterKey: Buffer;
  try {
    masterKey = unwrapKey(currentWrap, currentWrappingKey);
  } catch {
    currentWrappingKey.fill(0);
    throw new Error('Current passphrase is incorrect');
  }
  currentWrappingKey.fill(0);

  // Re-wrap with new passphrase
  const newSalt = crypto.randomBytes(SALT_LENGTH);
  const newWrappingKey = deriveKey(newPassphrase, newSalt);
  const newWrap = wrapKey(masterKey, newWrappingKey);

  // Update keystore (keep recovery wrap unchanged)
  saveKeystore({
    ...keystore,
    passphraseWrappedKey: { ...newWrap, salt: newSalt.toString('base64') },
  });

  masterKey.fill(0);
  newWrappingKey.fill(0);
}

/**
 * Generate a new recovery key. Invalidates the old one.
 * Requires the current passphrase to unwrap the master key.
 *
 * @returns the new recovery key string (displayed to user)
 */
export function regenerateRecoveryKey(passphrase: string): string {
  const keystore = loadKeystore();
  if (!keystore) throw new Error('No encryption keystore found');

  // Unwrap master key with passphrase
  const wrap = keystore.passphraseWrappedKey;
  const salt = Buffer.from(wrap.salt, 'base64');
  const wrappingKey = deriveKey(passphrase, salt);

  let masterKey: Buffer;
  try {
    masterKey = unwrapKey(wrap, wrappingKey);
  } catch {
    wrappingKey.fill(0);
    throw new Error('Passphrase is incorrect');
  }
  wrappingKey.fill(0);

  // Generate new recovery key and re-wrap
  const newRecoveryKey = generateRecoveryKey();
  const normalizedRecovery = normalizeRecoveryKey(newRecoveryKey);
  const recoverySalt = crypto.randomBytes(SALT_LENGTH);
  const recoveryWrappingKey = deriveKey(normalizedRecovery, recoverySalt);
  const recoveryWrap = wrapKey(masterKey, recoveryWrappingKey);

  // Update keystore (keep passphrase wrap unchanged)
  saveKeystore({
    ...keystore,
    recoveryWrappedKey: { ...recoveryWrap, salt: recoverySalt.toString('base64') },
  });

  masterKey.fill(0);
  recoveryWrappingKey.fill(0);

  return newRecoveryKey;
}

/**
 * Verify that a passphrase is correct without fully unlocking.
 * Used by Settings page before allowing passphrase change.
 */
export function verifyPassphrase(passphrase: string): boolean {
  try {
    const hex = unlockWithPassphrase(passphrase);
    // Zero out — we don't need the key, just verification
    Buffer.from(hex, 'hex').fill(0);
    return true;
  } catch {
    return false;
  }
}

/**
 * Unlock a master key from an external keystore (e.g. extracted from a .pcbackup archive).
 * Same logic as unlockWithPassphrase but operates on provided keystore data
 * instead of the local electron-store.
 *
 * @param keystoreData - The keystore JSON from the backup's keystore.json
 * @param passphrase - The passphrase that was active when the backup was created
 * @returns masterKeyHex for use as SQLCipher PRAGMA key
 * @throws if passphrase is wrong
 */
export function unlockFromExternalKeystore(keystoreData: KeystoreData, passphrase: string): string {
  const wrap = keystoreData.passphraseWrappedKey;
  const salt = Buffer.from(wrap.salt, 'base64');
  const wrappingKey = deriveKey(passphrase, salt);

  try {
    const masterKey = unwrapKey(wrap, wrappingKey);
    const hex = masterKey.toString('hex');
    masterKey.fill(0);
    wrappingKey.fill(0);
    return hex;
  } catch {
    wrappingKey.fill(0);
    throw new Error('Incorrect passphrase for this backup');
  }
}

/**
 * Replace the local keystore for a database restore operation.
 * Takes an existing master key (from the backup) and re-wraps it with the
 * provided passphrase and a new recovery key. This differs from setupEncryption
 * in that it does NOT generate a new master key — it preserves the backup's key.
 *
 * @param masterKeyHex - The 64-char hex master key derived from the backup
 * @param passphrase - The passphrase to wrap with (usually the same one used for the backup)
 * @returns the new recovery key string (must be shown to the user)
 */
export function replaceKeystoreForRestore(masterKeyHex: string, passphrase: string): string {
  const masterKey = Buffer.from(masterKeyHex, 'hex');

  // Generate a new recovery key
  const recoveryKey = generateRecoveryKey();
  const normalizedRecovery = normalizeRecoveryKey(recoveryKey);

  // Derive wrapping keys
  const passphraseSalt = crypto.randomBytes(SALT_LENGTH);
  const recoverySalt = crypto.randomBytes(SALT_LENGTH);
  const passphraseWrappingKey = deriveKey(passphrase, passphraseSalt);
  const recoveryWrappingKey = deriveKey(normalizedRecovery, recoverySalt);

  // Wrap master key with both
  const passphraseWrap = wrapKey(masterKey, passphraseWrappingKey);
  const recoveryWrap = wrapKey(masterKey, recoveryWrappingKey);

  // Overwrite the keystore
  saveKeystore({
    version: KEYSTORE_VERSION,
    passphraseWrappedKey: { ...passphraseWrap, salt: passphraseSalt.toString('base64') },
    recoveryWrappedKey: { ...recoveryWrap, salt: recoverySalt.toString('base64') },
  });

  // Zero out sensitive buffers
  masterKey.fill(0);
  passphraseWrappingKey.fill(0);
  recoveryWrappingKey.fill(0);

  return recoveryKey;
}
