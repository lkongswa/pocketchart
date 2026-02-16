// SRFax API Client (STUBBED — awaiting live credentials)
// When ready to go live, replace stub functions with real SRFax REST API calls.
// API endpoint: https://www.srfax.com/SRF_SecWebSvc.php

import Database from 'better-sqlite3';

export interface SRFaxConfig {
  access_id: string;
  access_pwd: string;
  caller_id: string; // The fax number assigned to the account
}

interface QueueFaxParams {
  faxNumber: string;
  fileContent: string; // base64 PDF
  fileName: string;
  callerID?: string;
}

interface FaxStatusResult {
  status: string;
  pages: number;
  sentDate: string;
  errorMessage: string;
}

interface InboxEntry {
  fileName: string;
  receiveStatus: string;
  date: string;
  callerID: string;
  pages: number;
  epochTime: string;
}

// ── Credential helpers ──

let cachedConfig: SRFaxConfig | null = null;

export function getSRFaxConfig(db: Database.Database, decryptSecure: (encrypted: string) => string): SRFaxConfig | null {
  if (cachedConfig) return cachedConfig;

  const getKey = (key: string): string => {
    const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(`secure_${key}`) as any;
    if (!row?.value) return '';
    return decryptSecure(row.value);
  };

  const access_id = getKey('srfax_access_id');
  const access_pwd = getKey('srfax_access_pwd');
  const caller_id = getKey('srfax_caller_id');

  if (!access_id || !access_pwd) return null;

  cachedConfig = { access_id, access_pwd, caller_id };
  return cachedConfig;
}

export function clearSRFaxConfigCache(): void {
  cachedConfig = null;
}

// ── Fax number normalization ──

export function normalizeFaxNumber(fax: string): string {
  // Strip everything except digits
  const digits = fax.replace(/\D/g, '');
  // Remove leading country code
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits;
}

// ── Smart client matching ──

export type MatchConfidence = 'exact' | 'name' | 'partial' | 'unmatched';

export function matchFaxToClient(
  callerFaxNumber: string,
  db: Database.Database
): { clientId: number | null; confidence: MatchConfidence } {
  const normalized = normalizeFaxNumber(callerFaxNumber);
  if (!normalized) return { clientId: null, confidence: 'unmatched' };

  // Tier 1: Exact match on client's referring_fax
  const clients = db.prepare(
    "SELECT id, referring_fax FROM clients WHERE deleted_at IS NULL AND referring_fax != ''"
  ).all() as Array<{ id: number; referring_fax: string }>;

  for (const client of clients) {
    if (normalizeFaxNumber(client.referring_fax) === normalized) {
      return { clientId: client.id, confidence: 'exact' };
    }
  }

  // Tier 2: Match via physicians table
  const physicians = db.prepare(
    "SELECT id, fax_number FROM physicians WHERE deleted_at IS NULL AND fax_number != ''"
  ).all() as Array<{ id: number; fax_number: string }>;

  for (const physician of physicians) {
    if (normalizeFaxNumber(physician.fax_number) === normalized) {
      // Find client linked to this physician
      const linked = db.prepare(
        'SELECT id FROM clients WHERE deleted_at IS NULL AND referring_physician_id = ?'
      ).get(physician.id) as { id: number } | undefined;
      if (linked) {
        return { clientId: linked.id, confidence: 'name' };
      }
    }
  }

  // Tier 3: Partial match on last 7 digits of phone numbers
  const last7 = normalized.slice(-7);
  if (last7.length === 7) {
    const phoneClients = db.prepare(
      "SELECT id, phone FROM clients WHERE deleted_at IS NULL AND phone != ''"
    ).all() as Array<{ id: number; phone: string }>;

    for (const client of phoneClients) {
      const clientDigits = normalizeFaxNumber(client.phone);
      if (clientDigits.slice(-7) === last7) {
        return { clientId: client.id, confidence: 'partial' };
      }
    }
  }

  // Tier 4: No match
  return { clientId: null, confidence: 'unmatched' };
}

// ── Stub API functions ──
// These return mock data. Replace with real SRFax API calls when ready.

export async function queueFax(_config: SRFaxConfig, params: QueueFaxParams): Promise<{ srfax_id: string; status: string }> {
  console.log('[SRFax STUB] queueFax called:', params.faxNumber, params.fileName);
  // Simulate queuing
  const mockId = `STUB-${Date.now().toString(36).toUpperCase()}`;
  return { srfax_id: mockId, status: 'Queued' };
}

export async function getFaxStatus(_config: SRFaxConfig, srfaxId: string): Promise<FaxStatusResult> {
  console.log('[SRFax STUB] getFaxStatus called:', srfaxId);
  return {
    status: srfaxId.startsWith('STUB-') ? 'Sent' : 'Unknown',
    pages: 1,
    sentDate: new Date().toISOString(),
    errorMessage: '',
  };
}

export async function getInbox(_config: SRFaxConfig, _params?: { period?: string; startDate?: string; endDate?: string }): Promise<InboxEntry[]> {
  console.log('[SRFax STUB] getInbox called');
  return [];
}

export async function retrieveFax(_config: SRFaxConfig, _params: { fileName: string; direction: 'IN' | 'OUT' }): Promise<string> {
  console.log('[SRFax STUB] retrieveFax called');
  return ''; // Empty base64
}
