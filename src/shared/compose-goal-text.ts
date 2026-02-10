import type { Discipline, MeasurementType } from './types';
import type { GoalPattern } from './goal-patterns';
import { METRIC_OPTIONS } from './goal-metrics';

const GOAL_SUBJECT: Record<Discipline, string> = {
  PT: 'Patient', OT: 'Patient', ST: 'Patient', MFT: 'Client',
};

export interface GoalCompositionInput {
  pattern: GoalPattern;
  discipline: Discipline;
  components: Record<string, any>;  // Keyed by component.key
  measurement_type: MeasurementType;
  baseline_value: string;
  target_value: string;
  baseline_cueing?: string;         // Cueing at baseline (if different from target)
  instrument?: string;              // For standardized_score
  consistency_type?: 'consecutive_sessions' | 'trials' | null;
  consistency_count?: number;       // e.g., 3 (consecutive sessions)
  trials_num?: number;              // e.g., 4 (in 4 of 5)
  trials_denom?: number;            // e.g., 5 (in 4 of 5)
  target_date?: string;             // ISO date
  target_days?: number;             // Alternative to date
  isCustomText?: boolean;           // If true, user wrote it manually
  customText?: string;
}

/**
 * Compose a complete, grammatically correct SMART goal from structured components.
 * Gracefully omits any component not provided — no blanks, no broken grammar.
 */
export function composeGoalText(input: GoalCompositionInput): string {
  if (input.isCustomText && input.customText) return input.customText;

  const subject = GOAL_SUBJECT[input.discipline] || 'Patient';
  const { pattern, components } = input;

  // Build segments in composition order
  const segments: string[] = [];

  for (const key of pattern.compositionOrder) {
    const segment = renderSegment(key, input);
    if (segment) segments.push(segment);
  }

  // Assemble: "Patient will [verb] [segments joined with spaces]"
  let text = `${subject} will ${pattern.verb} ${segments.join(' ')}`;

  // Clean up: normalize whitespace, ensure single period
  text = text.replace(/\s+/g, ' ').trim();
  text = text.replace(/[.,;:]+$/, '') + '.';

  return text;
}

/**
 * Render a single composition segment.
 * Returns empty string if the component has no data → graceful omission.
 */
function renderSegment(key: string, input: GoalCompositionInput): string {
  const { components, measurement_type, baseline_value, target_value } = input;

  // ── Special built-in segments ──

  if (key === 'metric_target') {
    return renderMetricTarget(input);
  }

  if (key === 'baseline_suffix') {
    // CLOF baseline is tracked separately — not included in goal text narrative
    return '';
  }

  if (key === 'timeframe') {
    return renderTimeframe(input.target_days, input.target_date);
  }

  if (key === 'consistency') {
    return renderConsistency(input);
  }

  // ── Pattern-specific phrase segments ──

  if (key === 'intelligibility_phrase') {
    return 'intelligible speech to';
  }

  if (key === 'process_phrase') {
    const process = components.process;
    return process ? `the phonological process of ${process} in` : 'phonological processes in';
  }

  if (key === 'sit_to_stand_phrase') {
    return 'sit-to-stand from';
  }

  if (key === 'pain_phrase') {
    return 'pain level of';
  }

  if (key === 'regulation_phrase') {
    return 'improved self-regulation in';
  }

  if (key === 'symptom_reduction_phrase') {
    return 'reduction in symptoms as measured by';
  }

  // ── Component value segments ──

  const value = components[key];
  if (!value) return ''; // Graceful omission!

  // Handle arrays (chip_multi selections)
  if (Array.isArray(value)) {
    if (value.length === 0) return '';
    return joinNatural(value);
  }

  // Handle component-specific formatting
  const comp = input.pattern.components.find(c => c.key === key);
  if (!comp) return String(value);

  // Number with suffix
  if (comp.type === 'number' && comp.suffix) {
    return `${value} ${comp.suffix}`;
  }

  return String(value);
}

/**
 * Render the target metric phrase.
 * Examples: "with 80% accuracy", "with standby assist", "to 3/10 pain"
 */
function renderMetricTarget(input: GoalCompositionInput): string {
  const { measurement_type, target_value, instrument } = input;
  if (!target_value) return '';

  switch (measurement_type) {
    case 'percentage':
      return `with ${target_value}% accuracy`;
    case 'assist_level':
      return `with ${expandAssistLevel(target_value)}`;
    case 'cue_level':
      return `with ${expandCueLevel(target_value)}`;
    case 'pain_scale':
      return `${target_value}/10`;
    case 'mmt_grade':
      return `of ${target_value}`;
    case 'rom_degrees':
      return `of ${target_value}\u00B0 AROM`;
    case 'timed_seconds':
      return `for ${target_value} seconds`;
    case 'standardized_score':
      return instrument
        ? `${instrument} score of ${target_value} or below`
        : `score of ${target_value} or below`;
    case 'frequency':
      return `${target_value} per week`;
    case 'severity':
      return `to ${target_value.toLowerCase()} severity`;
    case 'fim_score':
      return `FIM level ${target_value}/7`;
    default:
      return '';
  }
}

/**
 * Render the baseline comparison suffix.
 * Only included if baseline data is present.
 * Examples: ", improving from mod assist", ", from baseline PHQ-9 of 18"
 */
function renderBaselineSuffix(input: GoalCompositionInput): string {
  const { measurement_type, baseline_value, baseline_cueing, instrument } = input;
  if (!baseline_value) return '';

  const parts: string[] = [];

  switch (measurement_type) {
    case 'percentage':
      parts.push(`improving from ${baseline_value}%`);
      if (baseline_cueing) parts.push(baseline_cueing);
      break;
    case 'assist_level':
      parts.push(`improving from ${expandAssistLevel(baseline_value)}`);
      break;
    case 'cue_level':
      parts.push(`improving from ${expandCueLevel(baseline_value)}`);
      break;
    case 'pain_scale':
      parts.push(`reducing from ${baseline_value}/10`);
      break;
    case 'mmt_grade':
      parts.push(`improving from ${baseline_value}`);
      break;
    case 'rom_degrees':
      parts.push(`improving from ${baseline_value}\u00B0`);
      break;
    case 'timed_seconds':
      parts.push(`improving from ${baseline_value} seconds`);
      break;
    case 'standardized_score':
      parts.push(`from baseline ${instrument || 'score'} of ${baseline_value}`);
      break;
    case 'frequency':
      parts.push(`reducing from ${baseline_value} per week`);
      break;
    case 'severity':
      parts.push(`improving from ${baseline_value.toLowerCase()} severity`);
      break;
    case 'fim_score':
      parts.push(`improving from FIM ${baseline_value}/7`);
      break;
  }

  return parts.length > 0 ? `, ${parts.join(' ')}` : '';
}

/**
 * Render consistency criterion.
 */
function renderConsistency(input: GoalCompositionInput): string {
  if (input.consistency_type === 'consecutive_sessions') {
    return `across ${input.consistency_count || 3} consecutive sessions`;
  }
  if (input.consistency_type === 'trials') {
    return `in ${input.trials_num || 4} of ${input.trials_denom || 5} trials`;
  }
  return '';
}

/**
 * Render timeframe.
 */
function renderTimeframe(days?: number, date?: string): string {
  if (date) {
    const diff = Math.round((new Date(date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
    if (diff <= 0) return '';
    if (diff <= 14) return `within ${diff} days`;
    if (diff <= 60) return `within ${Math.round(diff / 7)} weeks`;
    return `within ${Math.round(diff / 30)} months`;
  }
  if (days) {
    if (days <= 14) return `within ${days} days`;
    if (days <= 60) return `within ${Math.round(days / 7)} weeks`;
    return `within ${Math.round(days / 30)} months`;
  }
  return '';
}

// ── Helpers ──

function expandAssistLevel(value: string): string {
  const map: Record<string, string> = {
    'Dep': 'dependent', 'MaxA': 'max assist', 'ModA': 'mod assist',
    'MinA': 'min assist', 'CGA': 'contact guard assist', 'SBA': 'standby assist',
    'Sup': 'supervision', 'Ind': 'independence',
  };
  return map[value] || value;
}

function expandCueLevel(value: string): string {
  const map: Record<string, string> = {
    'Max': 'max cues', 'Mod': 'mod cues', 'Min': 'min cues', 'Ind': 'independence',
  };
  return map[value] || value;
}

function joinNatural(items: string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0];
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(', ')}, and ${items[items.length - 1]}`;
}

/**
 * Format a metric value for display in goal text.
 * Used by GoalProgressBar, lookback panel, discharge summary, etc.
 */
export function formatMetricValue(type: MeasurementType, value: string, instrument?: string): string {
  if (!value) return '___';

  switch (type) {
    case 'percentage':
      return `${value}%`;
    case 'assist_level':
      return expandAssistLevel(value);
    case 'cue_level':
      return expandCueLevel(value);
    case 'pain_scale':
      return `${value}/10`;
    case 'mmt_grade':
      return value;
    case 'rom_degrees':
      return `${value}\u00B0`;
    case 'timed_seconds':
      return `${value} seconds`;
    case 'standardized_score':
      return instrument ? `${instrument} score of ${value}` : `score of ${value}`;
    case 'frequency':
      return `${value} per week`;
    case 'severity':
      return `${value.toLowerCase()} severity`;
    case 'fim_score':
      return `FIM ${value}/7`;
    default:
      return value;
  }
}

/**
 * Check if goal text was auto-composed (for detecting when to re-compose on field changes).
 */
export function isAutoComposedGoalText(text: string): boolean {
  if (!text?.trim()) return true; // Empty counts as auto-composable
  const patterns = [
    /^(Patient|Client) will /i,
    /^Pt will improve .+ skills from /i,
  ];
  return patterns.some(p => p.test(text.trim()));
}

/**
 * Look up the numeric value for a given metric option.
 */
export function metricValueToNumeric(type: MeasurementType, value: string): number {
  const options = METRIC_OPTIONS[type];
  if (!options) {
    return parseInt(value, 10) || 0;
  }
  const match = options.find(o => o.value === value);
  return match?.numeric ?? 0;
}
