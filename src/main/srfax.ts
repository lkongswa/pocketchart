// SRFax API Client — Live integration
// API endpoint: https://secure.srfax.com/SRF_SecWebSvc.php
// All operations use HTTPS POST with JSON body. Every call includes access_id + access_pwd.

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
  senderEmail?: string;
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

// ── SRFax API ──

const SRFAX_ENDPOINT = 'https://secure.srfax.com/SRF_SecWebSvc.php';

async function srfaxPost(config: SRFaxConfig, action: string, params: Record<string, any> = {}): Promise<any> {
  const body = {
    action,
    access_id: config.access_id,
    access_pwd: config.access_pwd,
    ...params,
  };

  const response = await fetch(SRFAX_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    throw new Error(`SRFax HTTP error: ${response.status} ${response.statusText}`);
  }

  const data = await response.json() as { Status: string; Result: any };

  if (data.Status === 'Failed') {
    throw new Error(`SRFax error: ${data.Result || 'Unknown error'}`);
  }

  return data;
}

export async function queueFax(config: SRFaxConfig, params: QueueFaxParams): Promise<{ srfax_id: string; status: string }> {
  const faxNumber = params.faxNumber.replace(/\D/g, '');

  const requestParams: Record<string, any> = {
    sCallerID: (params.callerID || config.caller_id).replace(/\D/g, '').slice(-10),
    sSenderEmail: params.senderEmail || '',
    sFaxType: 'SINGLE',
    sToFaxNumber: faxNumber,
    sFileName_1: params.fileName,
    sFileContent_1: params.fileContent,
  };

  const data = await srfaxPost(config, 'Queue_Fax', requestParams);

  // data.Result is the FaxDetailsID string
  return { srfax_id: String(data.Result), status: 'Queued' };
}

export async function getFaxStatus(config: SRFaxConfig, srfaxId: string): Promise<FaxStatusResult> {
  const data = await srfaxPost(config, 'Get_FaxStatus', {
    sFaxDetailsID: srfaxId,
  });

  const result = data.Result;

  // SRFax returns SentStatus: 'Queued' | 'Sent' | 'Sending' | 'Failed'
  return {
    status: result.SentStatus || 'Unknown',
    pages: parseInt(result.Pages, 10) || 0,
    sentDate: result.DateSent || result.EpochTime || '',
    errorMessage: result.ErrorCode || '',
  };
}

export async function getInbox(config: SRFaxConfig, params?: { period?: string; startDate?: string; endDate?: string }): Promise<InboxEntry[]> {
  const requestParams: Record<string, any> = {
    sPeriod: params?.period || 'ALL',
  };
  if (params?.startDate) requestParams.sStartDate = params.startDate;
  if (params?.endDate) requestParams.sEndDate = params.endDate;

  const data = await srfaxPost(config, 'Get_Fax_Inbox', requestParams);

  // Result is an array of inbox entries, or "No Faxes Found" string
  if (!Array.isArray(data.Result)) return [];

  return data.Result.map((entry: any) => ({
    fileName: entry.FileName || '',
    receiveStatus: entry.ReceiveStatus || '',
    date: entry.Date || '',
    callerID: entry.CallerID || '',
    pages: parseInt(entry.Pages, 10) || 0,
    epochTime: entry.EpochTime || '',
  }));
}

export async function retrieveFax(config: SRFaxConfig, params: { fileName: string; direction: 'IN' | 'OUT' }): Promise<string> {
  const data = await srfaxPost(config, 'Retrieve_Fax', {
    sFaxFileName: params.fileName,
    sDirection: params.direction,
  });

  // Result is the base64-encoded PDF content
  return typeof data.Result === 'string' ? data.Result : '';
}
