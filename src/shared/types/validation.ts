/**
 * Fix-It Sign Dialog — Validation Types
 *
 * Represents structured validation issues found during pre-sign checks.
 * Issues can be blocking (errors) or non-blocking (warnings).
 * Fixable issues include metadata for rendering inline editors.
 */

export type IssueSeverity = 'error' | 'warning';
export type IssueTarget = 'document' | 'client' | 'settings';

export type FixableFieldType =
  | 'textarea'
  | 'select'
  | 'chips'
  | 'composed'
  | 'date'
  | 'icd10_search'
  | 'select_gender'
  | 'goal_status'
  | 'goal_perf'
  | 'freq_duration'
  | 'none';

export interface ChipOption {
  label: string;
  value: string;
}

export interface SelectOption {
  label: string;
  value: string;
}

export interface GoalIssueContext {
  goalId: number;
  goalText: string;
  goalType: 'STG' | 'LTG';
}

export interface ValidationIssue {
  id: string;
  message: string;
  severity: IssueSeverity;
  fixable: boolean;
  fieldType: FixableFieldType;
  target: IssueTarget;
  currentValue?: any;
  options?: SelectOption[];
  chipOptions?: ChipOption[];
  composedSelectOptions?: SelectOption[];
  goalContext?: GoalIssueContext[];
  hint?: string;
  guidance?: string;
  scrollTarget?: string;
}

export interface ValidationFixes {
  documentFixes: Record<string, any>;
  clientFixes: Record<string, any>;
  goalFixes: Record<number, Record<string, any>>;
}

/** Map issue IDs to document form field names */
export const ISSUE_TO_FIELD_MAP: Record<string, string> = {
  eval_rehab_potential: 'rehabilitation_potential',
  eval_prior_lof: 'prior_level_of_function',
  eval_clinical_impression: 'clinical_impression',
  eval_treatment_plan: 'treatment_plan',
  eval_freq_duration: 'frequency_duration',
  eval_medical_history: 'medical_history',
  note_no_dos: 'date_of_service',
  note_empty_subjective: 'subjective',
  note_empty_objective: 'objective',
  note_empty_assessment: 'assessment',
  note_empty_plan: 'plan',
  note_short_subjective: 'subjective',
  note_short_objective: 'objective',
  note_short_assessment: 'assessment',
  note_short_plan: 'plan',
  dc_no_reason: 'discharge_reason',
  dc_no_reason_detail: 'discharge_reason_detail',
  dc_no_current_lof: 'current_level_of_function',
};

/** Map issue IDs to client record field names */
export const ISSUE_TO_CLIENT_FIELD_MAP: Record<string, string> = {
  client_dob: 'dob',
  client_dx: 'primary_dx_code',
  client_gender: 'gender',
};

/** Compose rehabilitation potential narrative from rating + reasons */
export function composeRehabNarrative(rating: string, reasons: string[]): string {
  if (!rating) return '';
  const base = `Rehabilitation potential is ${rating.toLowerCase()}`;
  if (reasons.length === 0) return `${base}.`;
  return `${base}: ${reasons.join(', ')}.`;
}
