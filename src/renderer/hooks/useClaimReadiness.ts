import { useMemo } from 'react';
import type { Client, Practice, Note, CMS1500Readiness, CMS1500ReadinessCheck } from '../../shared/types';

/**
 * computeClaimReadiness — Pure function for CMS-1500 pre-flight checks.
 * Can be used outside of React components (e.g., in BillingPage loops).
 */
export function computeClaimReadiness(
  client: Client | null,
  practice: Practice | null,
  notes?: Note[]
): CMS1500Readiness {
  if (!client) {
    return { ready: false, checks: [], passCount: 0, failCount: 0, warnCount: 0 };
  }

  const checks: CMS1500ReadinessCheck[] = [];

  // --- Patient Info (Box 1-5) ---
  checks.push({
    field: 'insurance_payer',
    label: 'Insurance Payer (Box 1)',
    status: client.insurance_payer ? 'pass' : 'fail',
    message: client.insurance_payer ? undefined : 'Insurance payer is required',
  });

  checks.push({
    field: 'insurance_member_id',
    label: 'Member ID (Box 1a)',
    status: client.insurance_member_id ? 'pass' : 'fail',
    message: client.insurance_member_id ? undefined : 'Insurance member ID is required',
  });

  const hasFullName = client.first_name && client.last_name;
  checks.push({
    field: 'patient_name',
    label: 'Patient Name (Box 2)',
    status: hasFullName ? 'pass' : 'fail',
    message: hasFullName ? undefined : 'Patient first and last name required',
  });

  checks.push({
    field: 'dob',
    label: 'Date of Birth (Box 3)',
    status: client.dob ? 'pass' : 'fail',
    message: client.dob ? undefined : 'Patient date of birth is required',
  });

  checks.push({
    field: 'gender',
    label: 'Gender (Box 3)',
    status: client.gender ? 'pass' : 'warn',
    message: client.gender ? undefined : 'Gender recommended for claims',
  });

  const hasAddress = client.address && client.city && client.state && client.zip;
  checks.push({
    field: 'address',
    label: 'Patient Address (Box 5)',
    status: hasAddress ? 'pass' : 'fail',
    message: hasAddress ? undefined : 'Complete address (street, city, state, zip) is required',
  });

  checks.push({
    field: 'phone',
    label: 'Patient Phone (Box 5)',
    status: client.phone ? 'pass' : 'warn',
    message: client.phone ? undefined : 'Phone number recommended',
  });

  // --- Insurance / Subscriber (Box 4, 6, 7, 9, 11) ---
  if (client.subscriber_relationship !== '18') {
    const hasSub = client.subscriber_first_name && client.subscriber_last_name;
    checks.push({
      field: 'subscriber_name',
      label: 'Subscriber Name (Box 4)',
      status: hasSub ? 'pass' : 'fail',
      message: hasSub ? undefined : 'Subscriber name required when patient is not the insured',
    });
  }

  checks.push({
    field: 'insurance_group',
    label: 'Group Number (Box 11)',
    status: client.insurance_group ? 'pass' : 'warn',
    message: client.insurance_group ? undefined : 'Group number recommended',
  });

  // --- Diagnosis (Box 21) ---
  checks.push({
    field: 'primary_dx_code',
    label: 'Primary Diagnosis (Box 21)',
    status: client.primary_dx_code ? 'pass' : 'fail',
    message: client.primary_dx_code ? undefined : 'At least one ICD-10 diagnosis code is required',
  });

  // --- Condition / Onset (Box 10, 14) ---
  checks.push({
    field: 'onset_date',
    label: 'Date of Onset (Box 14)',
    status: client.onset_date ? 'pass' : 'warn',
    message: client.onset_date ? undefined : 'Date of onset recommended for claims',
  });

  // --- Signatures (Box 12, 13) ---
  checks.push({
    field: 'patient_signature_source',
    label: 'Patient Signature (Box 12)',
    status: client.patient_signature_source ? 'pass' : 'fail',
    message: client.patient_signature_source ? undefined : 'Patient signature source required',
  });

  checks.push({
    field: 'insured_signature_source',
    label: 'Insured Signature (Box 13)',
    status: client.insured_signature_source ? 'pass' : 'warn',
    message: client.insured_signature_source ? undefined : 'Insured signature recommended',
  });

  // --- Referring Provider (Box 17) ---
  checks.push({
    field: 'referring_physician',
    label: 'Referring Provider (Box 17)',
    status: client.referring_physician ? 'pass' : 'warn',
    message: client.referring_physician ? undefined : 'Referring provider recommended',
  });

  checks.push({
    field: 'referring_npi',
    label: 'Referring NPI (Box 17b)',
    status: client.referring_npi ? 'pass' : 'warn',
    message: client.referring_npi ? undefined : 'Referring provider NPI recommended',
  });

  // --- Practice Info (Box 25, 33) ---
  checks.push({
    field: 'practice_tax_id',
    label: 'Practice Tax ID (Box 25)',
    status: practice?.tax_id ? 'pass' : 'fail',
    message: practice?.tax_id ? undefined : 'Practice Tax ID is required for claims',
  });

  checks.push({
    field: 'practice_npi',
    label: 'Billing NPI (Box 33a)',
    status: practice?.npi ? 'pass' : 'fail',
    message: practice?.npi ? undefined : 'Billing provider NPI is required',
  });

  const hasPracticeAddress = practice?.address && practice?.city && practice?.state && practice?.zip;
  checks.push({
    field: 'practice_address',
    label: 'Billing Address (Box 33)',
    status: hasPracticeAddress ? 'pass' : 'fail',
    message: hasPracticeAddress ? undefined : 'Billing provider address is required',
  });

  // --- Notes check ---
  if (notes !== undefined) {
    const signedNotes = notes.filter(n => n.signed_at);
    checks.push({
      field: 'signed_notes',
      label: 'Signed Notes',
      status: signedNotes.length > 0 ? 'pass' : 'fail',
      message: signedNotes.length > 0 ? `${signedNotes.length} signed note(s) available` : 'At least one signed note is required',
    });
  }

  const passCount = checks.filter(c => c.status === 'pass').length;
  const failCount = checks.filter(c => c.status === 'fail').length;
  const warnCount = checks.filter(c => c.status === 'warn').length;

  return {
    ready: failCount === 0,
    checks,
    passCount,
    failCount,
    warnCount,
  };
}

/**
 * useClaimReadiness — React hook wrapper around computeClaimReadiness.
 * Returns a memoized readiness object.
 */
export function useClaimReadiness(
  client: Client | null,
  practice: Practice | null,
  notes?: Note[]
): CMS1500Readiness {
  return useMemo(() => computeClaimReadiness(client, practice, notes), [client, practice, notes]);
}
