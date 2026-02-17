/**
 * Claim.MD Clearinghouse API Client
 *
 * PocketChart generates EDI data locally and sends it directly from the user's
 * machine to Claim.MD's API. No PHI passes through our servers.
 *
 * API Docs: https://www.claim.md/developer
 * Sandbox: https://sandbox.claim.md
 */

import { safeStorage } from 'electron';
import Store from 'electron-store';

const CLAIMMD_SANDBOX_URL = 'https://svc.claim.md/services/claimmdapi/api';
const CLAIMMD_PRODUCTION_URL = 'https://svc.claim.md/services/claimmdapi/api';

// Use sandbox by default; switch to production when ready
const CLAIMMD_BASE_URL = CLAIMMD_SANDBOX_URL;

const CREDENTIAL_KEY = 'claimmd_api_key';
const ACCOUNT_KEY = 'claimmd_account_key';

interface StoreSchema {
  claimmd_api_key_encrypted?: string;
  claimmd_account_key?: string;
  claimmd_use_sandbox?: boolean;
}

const store = new Store<StoreSchema>() as any;

// ── Credential Management ──

export function setCredentials(apiKey: string, accountKey?: string): void {
  if (safeStorage.isEncryptionAvailable()) {
    const encrypted = safeStorage.encryptString(apiKey);
    store.set(CREDENTIAL_KEY, encrypted.toString('base64'));
  } else {
    // Fallback: basic obfuscation (not truly secure)
    store.set(CREDENTIAL_KEY, Buffer.from(apiKey).toString('base64'));
  }
  if (accountKey) {
    store.set(ACCOUNT_KEY, accountKey);
  }
}

export function getCredentials(): { apiKey: string | null; accountKey: string | null } {
  const stored = store.get(CREDENTIAL_KEY) as string | undefined;
  const accountKey = store.get(ACCOUNT_KEY) as string | undefined;

  if (!stored) return { apiKey: null, accountKey: accountKey || null };

  try {
    if (safeStorage.isEncryptionAvailable()) {
      const decrypted = safeStorage.decryptString(Buffer.from(stored, 'base64'));
      return { apiKey: decrypted, accountKey: accountKey || null };
    } else {
      return { apiKey: Buffer.from(stored, 'base64').toString('utf-8'), accountKey: accountKey || null };
    }
  } catch {
    return { apiKey: null, accountKey: accountKey || null };
  }
}

export function getMaskedApiKey(): string | null {
  const { apiKey } = getCredentials();
  if (!apiKey) return null;
  if (apiKey.length <= 8) return '****';
  return apiKey.slice(0, 4) + '****' + apiKey.slice(-4);
}

export function removeCredentials(): void {
  store.delete(CREDENTIAL_KEY);
  store.delete(ACCOUNT_KEY);
}

export function hasCredentials(): boolean {
  return !!store.get(CREDENTIAL_KEY);
}

// ── API Calls ──

interface ClaimMDResponse {
  status: number;
  message?: string;
  data?: any;
  errors?: string[];
}

async function apiCall(
  endpoint: string,
  method: 'GET' | 'POST' = 'POST',
  body?: Record<string, any>
): Promise<ClaimMDResponse> {
  const { apiKey, accountKey } = getCredentials();

  if (!apiKey) {
    return { status: 401, message: 'No API key configured. Set up your clearinghouse credentials in Settings.' };
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
  };

  const payload: Record<string, any> = {
    ...(body || {}),
    api_key: apiKey,
    ...(accountKey ? { account_key: accountKey } : {}),
  };

  try {
    const response = await fetch(`${CLAIMMD_BASE_URL}/${endpoint}`, {
      method,
      headers,
      body: method === 'POST' ? JSON.stringify(payload) : undefined,
    });

    if (!response.ok) {
      const text = await response.text().catch(() => '');
      return {
        status: response.status,
        message: `Clearinghouse API error: ${response.status} ${response.statusText}`,
        errors: [text || response.statusText],
      };
    }

    const data = await response.json();
    return { status: 200, data };
  } catch (err: any) {
    if (err.code === 'ENOTFOUND' || err.code === 'ECONNREFUSED') {
      return { status: 0, message: 'Cannot reach clearinghouse. Check your internet connection.' };
    }
    return { status: 0, message: `Network error: ${err.message}` };
  }
}

// ── Public API Methods ──

/**
 * Test connection to Claim.MD
 */
export async function testConnection(): Promise<{ success: boolean; message: string }> {
  if (!hasCredentials()) {
    return { success: false, message: 'No API key configured.' };
  }

  const result = await apiCall('ping');

  if (result.status === 200) {
    return { success: true, message: 'Successfully connected to Claim.MD' };
  }

  return {
    success: false,
    message: result.message || 'Connection failed. Check your API key.',
  };
}

/**
 * Get connection status
 */
export async function getConnectionStatus(): Promise<{ connected: boolean; error?: string }> {
  if (!hasCredentials()) {
    return { connected: false, error: 'No API key configured' };
  }

  const result = await testConnection();
  return {
    connected: result.success,
    error: result.success ? undefined : result.message,
  };
}

/**
 * Fetch payer directory from Claim.MD
 */
export async function getPayerList(): Promise<any[]> {
  const result = await apiCall('payers');

  if (result.status === 200 && result.data?.payers) {
    return result.data.payers;
  }

  return [];
}

/**
 * Check payer enrollment status
 */
export async function checkEnrollment(payerId: string): Promise<{ status: string; message: string }> {
  const result = await apiCall('enrollment/status', 'POST', { payer_id: payerId });

  if (result.status === 200 && result.data) {
    return {
      status: result.data.enrollment_status || 'unknown',
      message: result.data.message || 'Status retrieved',
    };
  }

  return { status: 'error', message: result.message || 'Failed to check enrollment' };
}

/**
 * Submit an 837P claim
 */
export async function submitClaim(ediContent: string): Promise<{
  success: boolean;
  clearinghouseClaimId?: string;
  message: string;
  errors?: string[];
}> {
  const result = await apiCall('claims/submit', 'POST', {
    edi_content: ediContent,
    format: '837P',
  });

  if (result.status === 200 && result.data) {
    return {
      success: true,
      clearinghouseClaimId: result.data.claim_id || result.data.tracking_id,
      message: 'Claim submitted successfully',
    };
  }

  return {
    success: false,
    message: result.message || 'Claim submission failed',
    errors: result.errors || (result.data?.errors ? [result.data.errors] : []),
  };
}

/**
 * Check claim status via Claim.MD
 */
export async function checkClaimStatus(clearinghouseClaimId: string): Promise<{
  status: string;
  message: string;
  rawResponse?: any;
}> {
  const result = await apiCall('claims/status', 'POST', {
    claim_id: clearinghouseClaimId,
  });

  if (result.status === 200 && result.data) {
    return {
      status: result.data.status || 'unknown',
      message: result.data.message || '',
      rawResponse: result.data,
    };
  }

  return { status: 'error', message: result.message || 'Failed to check claim status' };
}

/**
 * Send 270 eligibility check request
 */
export async function checkEligibility(ediContent: string): Promise<{
  success: boolean;
  rawResponse?: string;
  message: string;
  errors?: string[];
}> {
  const result = await apiCall('eligibility/check', 'POST', {
    edi_content: ediContent,
    format: '270',
  });

  if (result.status === 200 && result.data) {
    return {
      success: true,
      rawResponse: result.data.edi_response || JSON.stringify(result.data),
      message: 'Eligibility check completed',
    };
  }

  return {
    success: false,
    message: result.message || 'Eligibility check failed',
    errors: result.errors,
  };
}

/**
 * Fetch available ERA/835 remittance documents
 */
export async function getRemittances(startDate: string, endDate: string): Promise<{
  success: boolean;
  remittances: any[];
  message: string;
}> {
  const result = await apiCall('remittance/list', 'POST', {
    start_date: startDate,
    end_date: endDate,
  });

  if (result.status === 200 && result.data) {
    return {
      success: true,
      remittances: result.data.remittances || [],
      message: 'Remittances retrieved',
    };
  }

  return {
    success: false,
    remittances: [],
    message: result.message || 'Failed to fetch remittances',
  };
}
