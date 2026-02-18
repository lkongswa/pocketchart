// Fax Utilities — Provider-agnostic helpers for fax number normalization and smart matching.
// Extracted from srfax.ts — these functions work identically regardless of which fax provider is active.

import Database from 'better-sqlite3';

// ── Fax number normalization ──

export function normalizeFaxNumber(fax: string): string {
  // Strip everything except digits
  const digits = fax.replace(/\D/g, '');
  // Remove leading country code
  if (digits.length === 11 && digits.startsWith('1')) return digits.slice(1);
  return digits;
}

// ── Smart client matching ──

export type MatchConfidence = 'exact' | 'name' | 'partial' | 'unmatched' | 'ambiguous';

/**
 * 4-tier smart matching: attempts to match an inbound fax caller ID to a client.
 * 1. Exact match on client.referring_fax
 * 2. Match via physicians table (fax_number → linked clients)
 * 3. Partial match on last 7 digits of phone numbers
 * 4. No match
 */
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
      // Find client(s) linked to this physician — handle same MD for multiple clients
      const linkedClients = db.prepare(
        'SELECT id FROM clients WHERE deleted_at IS NULL AND referring_physician_id = ?'
      ).all(physician.id) as Array<{ id: number }>;
      if (linkedClients.length === 1) {
        return { clientId: linkedClients[0].id, confidence: 'name' };
      } else if (linkedClients.length > 1) {
        return { clientId: null, confidence: 'ambiguous' };
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
