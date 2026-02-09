import { useMemo } from 'react';
import type { Client } from '@shared/types';

export interface MissingField {
  field: string;
  reason: string;
  priority: 'required' | 'recommended';
  section: string;  // maps to form section: 'demographics', 'diagnosis', 'insurance', 'referral'
}

export interface CompletenessResult {
  complete: number;
  total: number;
  missing: MissingField[];
  status: 'complete' | 'needs-attention' | 'critical';
}

/**
 * Evaluates chart completeness for a client record.
 * Returns a count of completed vs applicable fields and a list of what's missing with explanations.
 *
 * Status:
 * - 'critical'        — Missing DOB or primary diagnosis (affects every note)
 * - 'needs-attention'  — Missing recommended fields but all required present
 * - 'complete'         — All applicable fields filled
 */
export function useChartCompleteness(client: Client | null): CompletenessResult {
  return useMemo(() => {
    if (!client) {
      return { complete: 0, total: 0, missing: [], status: 'critical' as const };
    }

    const missing: MissingField[] = [];
    let totalFields = 0;

    // ── Core Required Fields ──

    totalFields++;
    if (!client.dob) {
      missing.push({
        field: 'Date of Birth',
        reason: 'Required on all clinical documentation and superbills',
        priority: 'required',
        section: 'demographics',
      });
    }

    totalFields++;
    if (!client.primary_dx_code) {
      missing.push({
        field: 'Primary Diagnosis (ICD-10)',
        reason: 'Required for insurance claims and compliant documentation',
        priority: 'required',
        section: 'diagnosis',
      });
    }

    // ── Core Recommended Fields ──

    totalFields++;
    if (!client.gender) {
      missing.push({
        field: 'Gender',
        reason: 'Required for insurance claim submission',
        priority: 'recommended',
        section: 'demographics',
      });
    }

    totalFields++;
    if (!client.phone && !client.email) {
      missing.push({
        field: 'Phone or Email',
        reason: 'Needed for client contact',
        priority: 'recommended',
        section: 'demographics',
      });
    }

    totalFields++;
    if (!client.address || !client.city || !client.state || !client.zip) {
      missing.push({
        field: 'Address',
        reason: 'Required on superbills and insurance claims',
        priority: 'recommended',
        section: 'demographics',
      });
    }

    // ── Conditional Fields ──

    // Insurance info — only flag if neither payer nor member ID is set
    // (they might be private pay, so keep this as recommended)
    totalFields++;
    if (!client.insurance_payer && !client.insurance_member_id) {
      missing.push({
        field: 'Insurance Information',
        reason: 'Needed for billing — skip if client is private pay',
        priority: 'recommended',
        section: 'insurance',
      });
    }

    const complete = totalFields - missing.length;
    const hasRequired = missing.some(m => m.priority === 'required');
    const status: CompletenessResult['status'] = hasRequired
      ? 'critical'
      : missing.length > 0
        ? 'needs-attention'
        : 'complete';

    return { complete, total: totalFields, missing, status };
  }, [client]);
}
