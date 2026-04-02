/**
 * 8-Minute Rule Validation Engine
 *
 * CMS Medicare billing guideline (April 2000) that determines how therapists
 * calculate billable units for time-based CPT codes.
 *
 * Core rule: Each time-based CPT code = 15 minutes of direct treatment.
 * Minimum 8 minutes required to bill 1 unit.
 * Units calculated from TOTAL timed minutes across all time-based services.
 *
 * Applies to: PT, OT, SLP (ST)
 * Does NOT apply to: MFT (uses service-based codes like 90834, 90837)
 */

// ── Timed CPT codes (subject to 8-minute rule) ──
// These require direct, one-on-one patient contact, billed in 15-minute units

export const TIMED_CPT_CODES = new Set([
  '97110', // Therapeutic Exercise
  '97112', // Neuromuscular Re-Education
  '97116', // Gait Training
  '97140', // Manual Therapy
  '97530', // Therapeutic Activities
  '97533', // Sensory Integration Techniques
  '97535', // Self-Care/Home Management Training
  '97537', // Community/Work Reintegration Training
  '97542', // Wheelchair Management
  '97750', // Physical Performance Test or Measurement
  '97032', // Electrical Stimulation (Attended/Manual)
  '97033', // Iontophoresis
  '97034', // Contrast Baths
  '97035', // Ultrasound
  '97036', // Hubbard Tank
  '92507', // Speech/Language Treatment
  '92526', // Oral Function Treatment
  '97129', // Cognitive Function Intervention, first 15 min
  '97130', // Cognitive Function Intervention, add-on 15 min
]);

// ── Untimed (service-based) CPT codes — NOT subject to 8-minute rule ──
// These are billed as 1 unit regardless of time spent

export const UNTIMED_CPT_CODES = new Set([
  '97161', // PT Evaluation — Low Complexity
  '97162', // PT Evaluation — Moderate Complexity
  '97163', // PT Evaluation — High Complexity
  '97164', // PT Re-Evaluation
  '97165', // OT Evaluation — Low Complexity
  '97166', // OT Evaluation — Moderate Complexity
  '97167', // OT Evaluation — High Complexity
  '97168', // OT Re-Evaluation
  '92521', // SLP Evaluation — Fluency
  '92522', // SLP Evaluation — Language
  '92523', // SLP Evaluation — Language + Speech
  '92524', // SLP Evaluation — Voice
  '97010', // Hot/Cold Packs
  '97014', // Electrical Stimulation (Unattended)
  'G0283', // Electrical Stimulation (Unattended) — Medicare specific
  '97150', // Group Therapy
  '92508', // Speech/Language Treatment (Group)
  '92610', // Swallowing Function Evaluation
  '92609', // AAC Device Therapeutic Service (untimed, service-based)
  '92618', // AAC Device Re-Evaluation (untimed, service-based)
]);

// Disciplines that use the 8-minute rule
export const EIGHT_MIN_RULE_DISCIPLINES = new Set(['PT', 'OT', 'ST']);

/**
 * Check if a CPT code is a timed (time-based) code subject to the 8-minute rule.
 * Returns true for known timed codes, false for known untimed codes.
 * For unknown codes, defaults to false (conservative — won't flag unknown codes).
 */
export function isTimedCode(cptCode: string): boolean {
  return TIMED_CPT_CODES.has(cptCode.trim().toUpperCase());
}

/**
 * Check if the 8-minute rule applies to a given discipline.
 * MFT is excluded — they use service-based codes (90834, 90837, etc.)
 */
export function appliesTo(discipline: string): boolean {
  return EIGHT_MIN_RULE_DISCIPLINES.has(discipline.toUpperCase());
}

/**
 * CMS 8-Minute Rule Unit Chart
 *
 * | Total Timed Minutes | Maximum Billable Units |
 * |---------------------|-----------------------|
 * | < 8 minutes         | 0 units (cannot bill) |
 * | 8–22 minutes        | 1 unit                |
 * | 23–37 minutes       | 2 units               |
 * | 38–52 minutes       | 3 units               |
 * | 53–67 minutes       | 4 units               |
 * | 68–82 minutes       | 5 units               |
 * | 83–97 minutes       | 6 units               |
 * | 98–112 minutes      | 7 units               |
 * | 113–127 minutes     | 8 units               |
 *
 * Formula: maxUnits = floor((totalMinutes - 8) / 15) + 1 (when >= 8)
 */
export function getMaxUnits(totalTimedMinutes: number): number {
  if (totalTimedMinutes < 8) return 0;
  return Math.floor((totalTimedMinutes - 8) / 15) + 1;
}

export interface CptLineInput {
  code: string;
  units: number;
}

export interface EightMinuteRuleResult {
  /** Whether the billed units comply (overbilling = false) */
  valid: boolean;
  /** Maximum billable timed units for the given minutes */
  maxTimedUnits: number;
  /** Total timed units the therapist billed */
  billedTimedUnits: number;
  /** Total untimed (service-based) units */
  untimedUnits: number;
  /** Total treatment minutes from time-in/time-out */
  totalMinutes: number;
  /** Whether the therapist is potentially underbilling */
  underbilling: boolean;
  /** How many units over/under */
  unitDifference: number;
  /** Human-readable message (null if everything matches) */
  message: string | null;
  /** 'error' for overbilling, 'warning' for underbilling, null for match */
  severity: 'error' | 'warning' | null;
}

/**
 * Level 1 Validation: Total unit cap check
 *
 * Compares total timed units billed against total treatment time.
 * This is the "minimum viable" validation that catches overbilling.
 *
 * Note: Uses total session time (time-in to time-out) as proxy for total timed minutes.
 * This is conservative — the session may include untimed service time, which means
 * the overbilling check is slightly lenient (safe direction for the therapist).
 *
 * @param cptLines - Array of CPT code lines with codes and units
 * @param totalMinutes - Total session minutes (from time-in/time-out)
 */
export function validateEightMinuteRule(
  cptLines: CptLineInput[],
  totalMinutes: number,
): EightMinuteRuleResult {
  // Separate timed and untimed codes
  let billedTimedUnits = 0;
  let untimedUnits = 0;

  for (const line of cptLines) {
    const code = line.code?.trim();
    if (!code || code.length < 4) continue;

    if (isTimedCode(code)) {
      billedTimedUnits += line.units;
    } else {
      untimedUnits += line.units;
    }
  }

  // If no timed codes, nothing to validate
  if (billedTimedUnits === 0) {
    return {
      valid: true,
      maxTimedUnits: 0,
      billedTimedUnits: 0,
      untimedUnits,
      totalMinutes,
      underbilling: false,
      unitDifference: 0,
      message: null,
      severity: null,
    };
  }

  const maxTimedUnits = getMaxUnits(totalMinutes);
  const unitDifference = billedTimedUnits - maxTimedUnits;

  // Overbilling — BLOCKING
  if (billedTimedUnits > maxTimedUnits) {
    if (totalMinutes < 8) {
      return {
        valid: false,
        maxTimedUnits,
        billedTimedUnits,
        untimedUnits,
        totalMinutes,
        underbilling: false,
        unitDifference,
        message: `Cannot bill timed units for less than 8 minutes of treatment. You documented ${totalMinutes} minutes.`,
        severity: 'error',
      };
    }
    return {
      valid: false,
      maxTimedUnits,
      billedTimedUnits,
      untimedUnits,
      totalMinutes,
      underbilling: false,
      unitDifference,
      message: `${totalMinutes} minutes of timed services supports ${maxTimedUnits} unit(s). You billed ${billedTimedUnits} unit(s). Reduce by ${unitDifference} unit(s) to comply with the 8-minute rule.`,
      severity: 'error',
    };
  }

  // Underbilling — WARNING (non-blocking)
  if (billedTimedUnits < maxTimedUnits) {
    return {
      valid: true,
      maxTimedUnits,
      billedTimedUnits,
      untimedUnits,
      totalMinutes,
      underbilling: true,
      unitDifference,
      message: `You may be underbilling. ${totalMinutes} minutes supports up to ${maxTimedUnits} unit(s), but you billed ${billedTimedUnits}.`,
      severity: 'warning',
    };
  }

  // Perfect match
  return {
    valid: true,
    maxTimedUnits,
    billedTimedUnits,
    untimedUnits,
    totalMinutes,
    underbilling: false,
    unitDifference: 0,
    message: null,
    severity: null,
  };
}

/**
 * Calculate treatment minutes from time-in/time-out strings (HH:MM format)
 */
export function calculateTreatmentMinutes(timeIn: string, timeOut: string): number {
  if (!timeIn || !timeOut) return 0;
  const [inH, inM] = timeIn.split(':').map(Number);
  const [outH, outM] = timeOut.split(':').map(Number);
  const inMinutes = inH * 60 + inM;
  const outMinutes = outH * 60 + outM;
  const diff = outMinutes - inMinutes;
  return diff > 0 ? diff : 0;
}

/**
 * Format a summary line for the real-time indicator on the note form.
 * Returns null if the 8-minute rule doesn't apply (no timed codes, or MFT).
 */
export function formatIndicatorSummary(result: EightMinuteRuleResult): {
  icon: '✅' | '❌' | '⚠️';
  text: string;
  color: 'green' | 'red' | 'amber';
} | null {
  if (result.billedTimedUnits === 0) return null;

  if (!result.valid) {
    return {
      icon: '❌',
      text: `8-Min Rule: ${result.billedTimedUnits} timed unit(s) billed, but ${result.totalMinutes} min only supports ${result.maxTimedUnits}`,
      color: 'red',
    };
  }

  if (result.underbilling) {
    return {
      icon: '⚠️',
      text: `8-Min Rule: ${result.billedTimedUnits} timed unit(s) billed — ${result.totalMinutes} min supports up to ${result.maxTimedUnits}`,
      color: 'amber',
    };
  }

  return {
    icon: '✅',
    text: `8-Min Rule: ${result.billedTimedUnits} timed unit(s) (max ${result.maxTimedUnits})${result.untimedUnits > 0 ? ` + ${result.untimedUnits} service-based` : ''}`,
    color: 'green',
  };
}
