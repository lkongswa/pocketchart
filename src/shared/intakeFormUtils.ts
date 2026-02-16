/**
 * Shared intake form utilities used by both main process (PDF generator)
 * and renderer (live preview).
 */

export interface PracticeInfo {
  name: string;
  phone: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  npi: string;
  tax_id: string;
}

export interface ClientInfo {
  first_name: string;
  last_name: string;
  dob: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  gender: string;
  primary_dx_code: string;
  primary_dx_description: string;
  insurance_payer: string;
  insurance_member_id: string;
  insurance_group: string;
  referring_physician: string;
}

// ── Field detection patterns ──
// Used by both preview (highlight) and PDF generator (create form fields)
export const FIELD_PATTERNS = {
  /** Labeled field: "Label: ___+" */
  labeledField: /^(.*?)(_{3,})\s*(.*)$/,
  /** Standalone underscore line */
  standaloneField: /^_{3,}\s*$/,
  /** Checkbox: [ ] text */
  checkbox: /\[ \]\s*([^\[]*)/g,
  /** Detect if line has underscores (general) */
  hasUnderscores: /_{3,}/,
  /** Signature-related label */
  isSignatureLabel: /signature|sign here|patient.*sign|authorized.*sign/i,
  /** Date-related label */
  isDateLabel: /\bdate\b/i,
};

/**
 * Replace template variables with actual values.
 * Used by both PDF generation (main) and HTML preview (renderer).
 */
export function replaceVariables(
  content: string,
  practice: Partial<PracticeInfo>,
  client?: Partial<ClientInfo>,
): string {
  const now = new Date();
  let result = content;

  // Practice variables
  result = result.replace(/\{\{practice_name\}\}/g, practice.name || '');
  result = result.replace(/\{\{practice_phone\}\}/g, practice.phone || '');
  result = result.replace(/\{\{practice_address\}\}/g, practice.address || '');
  result = result.replace(/\{\{practice_city\}\}/g, practice.city || '');
  result = result.replace(/\{\{practice_state\}\}/g, practice.state || '');
  result = result.replace(/\{\{practice_zip\}\}/g, practice.zip || '');
  result = result.replace(/\{\{practice_npi\}\}/g, practice.npi || '');
  result = result.replace(/\{\{practice_tax_id\}\}/g, practice.tax_id || '');

  // Client variables
  if (client) {
    result = result.replace(/\{\{client_name\}\}/g, `${client.first_name || ''} ${client.last_name || ''}`.trim());
    result = result.replace(/\{\{client_first_name\}\}/g, client.first_name || '');
    result = result.replace(/\{\{client_last_name\}\}/g, client.last_name || '');
    result = result.replace(/\{\{client_dob\}\}/g, client.dob || '');
    result = result.replace(/\{\{client_phone\}\}/g, client.phone || '');
    result = result.replace(/\{\{client_email\}\}/g, client.email || '');
    result = result.replace(/\{\{client_address\}\}/g, client.address || '');
    result = result.replace(/\{\{client_city\}\}/g, client.city || '');
    result = result.replace(/\{\{client_state\}\}/g, client.state || '');
    result = result.replace(/\{\{client_zip\}\}/g, client.zip || '');
    result = result.replace(/\{\{client_gender\}\}/g, client.gender || '');
    result = result.replace(
      /\{\{client_primary_dx\}\}/g,
      client.primary_dx_code ? `${client.primary_dx_code} - ${client.primary_dx_description || ''}` : '',
    );
    result = result.replace(/\{\{client_insurance_payer\}\}/g, client.insurance_payer || '');
    result = result.replace(/\{\{client_insurance_member_id\}\}/g, client.insurance_member_id || '');
    result = result.replace(/\{\{client_insurance_group\}\}/g, client.insurance_group || '');
    result = result.replace(/\{\{client_referring_physician\}\}/g, client.referring_physician || '');
  } else {
    // Clear client variables if no client
    result = result.replace(/\{\{client_[^}]+\}\}/g, '');
  }

  // Date variables
  result = result.replace(/\{\{date\}\}/g, now.toLocaleDateString('en-US'));
  result = result.replace(/\{\{year\}\}/g, String(now.getFullYear()));

  return result;
}

/**
 * Replace template variables with highlighted placeholder badges (for preview).
 * Returns HTML string with unreplaced vars shown as teal badges.
 */
export function replaceVariablesForPreview(
  content: string,
  practice: Partial<PracticeInfo>,
  client?: Partial<ClientInfo>,
): string {
  // First do the normal replacement
  let result = replaceVariables(content, practice, client);

  // Replace any remaining {{variable}} patterns with preview badges
  result = result.replace(
    /\{\{([^}]+)\}\}/g,
    (_match, varName: string) => {
      const label = varName.replace(/_/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase());
      return `<span class="inline-block px-1.5 py-0.5 bg-teal-100 text-teal-700 text-[10px] rounded font-medium">[${label}]</span>`;
    },
  );

  return result;
}
