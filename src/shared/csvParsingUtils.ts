/**
 * csvParsingUtils.ts — Pure utility functions for CSV payment import.
 * Shared between main process (parsing) and renderer (previews).
 */

import type { PaymentMethod } from './types';

// ── Amount Parsing ──

/** Strip $, commas, whitespace. Handle (123.45) and -$45.00 as negative. */
export function parseAmount(raw: string): number | null {
  if (!raw || typeof raw !== 'string') return null;
  let s = raw.trim();
  if (!s) return null;

  // Detect parenthesized negatives: (123.45) → -123.45
  const isParens = s.startsWith('(') && s.endsWith(')');
  if (isParens) s = s.slice(1, -1);

  // Strip currency symbols, commas, spaces
  s = s.replace(/[$\s,]/g, '');

  // Handle empty after stripping
  if (!s) return null;

  const num = parseFloat(s);
  if (isNaN(num)) return null;

  return isParens ? -Math.abs(num) : num;
}

// ── Date Parsing ──

const DATE_FORMATS: { regex: RegExp; parse: (m: RegExpMatchArray) => string | null }[] = [
  // YYYY-MM-DD (ISO)
  {
    regex: /^(\d{4})-(\d{1,2})-(\d{1,2})$/,
    parse: (m) => toISO(parseInt(m[1]), parseInt(m[2]), parseInt(m[3])),
  },
  // YYYY/MM/DD
  {
    regex: /^(\d{4})\/(\d{1,2})\/(\d{1,2})$/,
    parse: (m) => toISO(parseInt(m[1]), parseInt(m[2]), parseInt(m[3])),
  },
  // MM/DD/YYYY or M/D/YYYY
  {
    regex: /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/,
    parse: (m) => toISO(parseInt(m[3]), parseInt(m[1]), parseInt(m[2])),
  },
  // MM-DD-YYYY
  {
    regex: /^(\d{1,2})-(\d{1,2})-(\d{4})$/,
    parse: (m) => toISO(parseInt(m[3]), parseInt(m[1]), parseInt(m[2])),
  },
  // MM/DD/YY or M/D/YY
  {
    regex: /^(\d{1,2})\/(\d{1,2})\/(\d{2})$/,
    parse: (m) => {
      const yy = parseInt(m[3]);
      const year = yy < 50 ? 2000 + yy : 1900 + yy;
      return toISO(year, parseInt(m[1]), parseInt(m[2]));
    },
  },
  // Month DD, YYYY (e.g., "January 15, 2025")
  {
    regex: /^(\w+)\s+(\d{1,2}),?\s*(\d{4})$/,
    parse: (m) => {
      const month = MONTH_MAP[m[1].toLowerCase()];
      if (!month) return null;
      return toISO(parseInt(m[3]), month, parseInt(m[2]));
    },
  },
];

const MONTH_MAP: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
};

function toISO(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31 || year < 1900 || year > 2100) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

/** Try multiple date formats, return YYYY-MM-DD or null */
export function parseDate(raw: string): string | null {
  if (!raw || typeof raw !== 'string') return null;
  const s = raw.trim();
  if (!s) return null;

  for (const fmt of DATE_FORMATS) {
    const m = s.match(fmt.regex);
    if (m) {
      const result = fmt.parse(m);
      if (result) return result;
    }
  }
  return null;
}

/** Detect the most likely date format label from sample values */
export function detectDateFormat(samples: string[]): string {
  const valid = samples.filter(s => s && s.trim());
  if (valid.length === 0) return 'Unknown';

  // Check what patterns match most samples
  const labels = ['YYYY-MM-DD', 'YYYY/MM/DD', 'MM/DD/YYYY', 'MM-DD-YYYY', 'MM/DD/YY', 'Month DD, YYYY'];
  let bestIdx = 0;
  let bestCount = 0;

  for (let i = 0; i < DATE_FORMATS.length; i++) {
    let count = 0;
    for (const s of valid) {
      const m = s.trim().match(DATE_FORMATS[i].regex);
      if (m && DATE_FORMATS[i].parse(m)) count++;
    }
    if (count > bestCount) {
      bestCount = count;
      bestIdx = i;
    }
  }

  return bestCount > 0 ? labels[bestIdx] : 'Unknown';
}

// ── Name Utilities ──

/** Normalize a name for matching: trim, lowercase, collapse whitespace */
export function normalizeName(raw: string): string {
  if (!raw) return '';
  return raw.trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Split "Last, First" into { first, last }, or "First Last" format */
export function splitName(raw: string): { first: string; last: string } {
  if (!raw) return { first: '', last: '' };
  const s = raw.trim();

  // Handle "Last, First" format
  if (s.includes(',')) {
    const parts = s.split(',').map(p => p.trim());
    return { first: parts[1] || '', last: parts[0] || '' };
  }

  // Handle "First Last" or "First Middle Last"
  const parts = s.split(/\s+/);
  if (parts.length === 1) return { first: parts[0], last: '' };
  return { first: parts.slice(0, -1).join(' '), last: parts[parts.length - 1] };
}

// ── Payment Method Inference ──

const METHOD_MAP: Array<{ keywords: string[]; method: PaymentMethod }> = [
  { keywords: ['visa', 'mastercard', 'amex', 'american express', 'discover', 'credit card', 'credit', 'debit', 'card'], method: 'card' },
  { keywords: ['check', 'cheque', 'ach'], method: 'check' },
  { keywords: ['cash'], method: 'cash' },
  { keywords: ['insurance', 'ins'], method: 'insurance' },
];

/** Infer PaymentMethod from CSV text */
export function inferPaymentMethod(raw: string): PaymentMethod {
  if (!raw) return 'other';
  const lower = raw.trim().toLowerCase();
  for (const entry of METHOD_MAP) {
    for (const kw of entry.keywords) {
      if (lower.includes(kw)) return entry.method;
    }
  }
  return 'other';
}

// ── Column Auto-Detection ──

const COLUMN_PATTERNS: Record<string, string[]> = {
  date: ['date', 'payment date', 'payment_date', 'transaction date', 'transaction_date', 'trans date', 'trans_date', 'pmt date'],
  amount: ['amount', 'total', 'payment amount', 'payment_amount', 'sum', 'payment', 'net', 'charge'],
  clientName: ['client', 'client name', 'client_name', 'patient', 'patient name', 'patient_name', 'customer', 'customer name', 'customer_name', 'name', 'full name', 'full_name'],
  method: ['method', 'payment method', 'payment_method', 'payment type', 'payment_type', 'type', 'tender type', 'tender_type'],
  reference: ['reference', 'reference number', 'reference_number', 'ref', 'ref #', 'transaction id', 'transaction_id', 'trans id', 'confirmation', 'check number', 'check_number', 'id'],
  notes: ['notes', 'note', 'memo', 'description', 'comment', 'comments', 'details'],
};

/** Auto-detect column mappings from CSV headers */
export function autoDetectColumns(headers: string[]): Record<string, string | undefined> {
  const result: Record<string, string | undefined> = {};
  const normalized = headers.map(h => h.trim().toLowerCase());

  for (const [field, patterns] of Object.entries(COLUMN_PATTERNS)) {
    for (const pattern of patterns) {
      const idx = normalized.indexOf(pattern);
      if (idx !== -1 && !result[field]) {
        result[field] = headers[idx]; // return original header casing
        break;
      }
    }
  }

  // If no exact match for clientName but we have separate first/last
  if (!result.clientName) {
    const firstIdx = normalized.findIndex(h => ['first name', 'first_name', 'fname', 'first'].includes(h));
    const lastIdx = normalized.findIndex(h => ['last name', 'last_name', 'lname', 'last'].includes(h));
    if (firstIdx !== -1) result.clientFirstName = headers[firstIdx];
    if (lastIdx !== -1) result.clientLastName = headers[lastIdx];
  }

  return result;
}
