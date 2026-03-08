/**
 * CPT Code ↔ Discipline Mapping
 *
 * Maps CPT codes to the discipline(s) they're typically billed under.
 * Used for cross-checking that a therapist isn't billing codes outside their scope.
 *
 * Note: Some codes (therapeutic exercise, manual therapy, etc.) are shared
 * across PT and OT. This map reflects CMS fee schedule assignments.
 */

/** Disciplines that can appropriately bill each CPT code */
const CPT_DISCIPLINE_MAP: Record<string, string[]> = {
  // ── PT/OT Shared Treatment Codes (Timed) ──
  '97110': ['PT', 'OT'],       // Therapeutic Exercise
  '97112': ['PT', 'OT'],       // Neuromuscular Re-Education
  '97116': ['PT'],              // Gait Training (primarily PT)
  '97140': ['PT', 'OT'],       // Manual Therapy
  '97530': ['PT', 'OT'],       // Therapeutic Activities
  '97533': ['OT'],              // Sensory Integration (primarily OT)
  '97535': ['PT', 'OT'],       // Self-Care/Home Management Training
  '97537': ['PT', 'OT'],       // Community/Work Reintegration
  '97542': ['PT', 'OT'],       // Wheelchair Management
  '97750': ['PT', 'OT'],       // Physical Performance Test

  // ── Modality Codes (Timed) ──
  '97032': ['PT', 'OT'],       // Electrical Stimulation (Attended)
  '97033': ['PT'],              // Iontophoresis
  '97034': ['PT'],              // Contrast Baths
  '97035': ['PT', 'OT'],       // Ultrasound
  '97036': ['PT'],              // Hubbard Tank

  // ── Modality Codes (Untimed) ──
  '97010': ['PT', 'OT'],       // Hot/Cold Packs
  '97014': ['PT', 'OT'],       // Electrical Stimulation (Unattended)
  'G0283': ['PT', 'OT'],       // E-Stim (Unattended) — Medicare

  // ── PT Evaluation Codes ──
  '97161': ['PT'],              // PT Eval — Low
  '97162': ['PT'],              // PT Eval — Moderate
  '97163': ['PT'],              // PT Eval — High
  '97164': ['PT'],              // PT Re-Evaluation

  // ── OT Evaluation Codes ──
  '97165': ['OT'],              // OT Eval — Low
  '97166': ['OT'],              // OT Eval — Moderate
  '97167': ['OT'],              // OT Eval — High
  '97168': ['OT'],              // OT Re-Evaluation

  // ── SLP Treatment Codes ──
  '92507': ['ST'],              // Speech/Language Treatment
  '92526': ['ST'],              // Oral Function Treatment
  '97129': ['ST', 'OT'],       // Cognitive Function Intervention (first 15)
  '97130': ['ST', 'OT'],       // Cognitive Function Intervention (add-on)

  // ── SLP Evaluation Codes ──
  '92521': ['ST'],              // SLP Eval — Fluency
  '92522': ['ST'],              // SLP Eval — Language
  '92523': ['ST'],              // SLP Eval — Language + Speech
  '92524': ['ST'],              // SLP Eval — Voice
  '92610': ['ST'],              // Swallowing Function Eval

  // ── SLP AAC Codes ──
  '92609': ['ST'],              // Therapeutic service for AAC device
  '92618': ['ST'],              // Re-evaluation of AAC device

  // ── SLP Group ──
  '92508': ['ST'],              // Speech/Language Treatment (Group)

  // ── Group Therapy ──
  '97150': ['PT', 'OT', 'ST'], // Group Therapy (all disciplines)

  // ── MFT Codes (not subject to therapy discipline checks) ──
  '90791': ['MFT'],
  '90832': ['MFT'],
  '90834': ['MFT'],
  '90837': ['MFT'],
  '90846': ['MFT'],
  '90847': ['MFT'],
  '90853': ['MFT'],
};

export interface DisciplineMismatch {
  code: string;
  expectedDisciplines: string[];
  clientDiscipline: string;
}

/**
 * Check if any CPT codes are outside the client's discipline scope.
 * Returns an array of mismatched codes (empty if all are valid).
 *
 * Unknown codes are not flagged — they may be custom/user-added.
 */
export function checkDisciplineCptMismatch(
  cptCodes: string[],
  clientDiscipline: string,
): DisciplineMismatch[] {
  const mismatches: DisciplineMismatch[] = [];
  const disc = clientDiscipline.toUpperCase();

  for (const rawCode of cptCodes) {
    const code = rawCode.trim().toUpperCase();
    if (!code || code.length < 4) continue;

    const allowed = CPT_DISCIPLINE_MAP[code];
    if (!allowed) continue; // Unknown code — don't flag

    if (!allowed.includes(disc)) {
      mismatches.push({
        code,
        expectedDisciplines: allowed,
        clientDiscipline: disc,
      });
    }
  }

  return mismatches;
}

/**
 * Format a human-readable warning for discipline/CPT mismatches.
 */
export function formatMismatchWarning(mismatches: DisciplineMismatch[]): string {
  if (mismatches.length === 0) return '';
  if (mismatches.length === 1) {
    const m = mismatches[0];
    return `CPT ${m.code} is typically billed by ${m.expectedDisciplines.join('/')} — this client's discipline is ${m.clientDiscipline}.`;
  }
  const codes = mismatches.map(m => m.code).join(', ');
  return `CPT codes ${codes} may not match this client's discipline (${mismatches[0].clientDiscipline}). Verify these are appropriate.`;
}
