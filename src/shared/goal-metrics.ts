import type { Discipline, MeasurementType } from './types';

export interface MetricOption {
  label: string;       // Display text for chip: "Min A", "80%", "3/10"
  value: string;       // Stored in baseline_value/target_value: "MinA", "80", "3"
  numeric: number;     // For sorting/progress bars/charts
  direction: 'higher_is_better' | 'lower_is_better';
}

export const METRIC_OPTIONS: Record<MeasurementType, MetricOption[] | null> = {

  percentage: Array.from({ length: 11 }, (_, i) => ({
    label: `${i * 10}%`,
    value: `${i * 10}`,
    numeric: i * 10,
    direction: 'higher_is_better' as const,
  })),

  assist_level: [
    { label: 'Dep',   value: 'Dep',  numeric: 0, direction: 'higher_is_better' },
    { label: 'Max A', value: 'MaxA', numeric: 1, direction: 'higher_is_better' },
    { label: 'Mod A', value: 'ModA', numeric: 2, direction: 'higher_is_better' },
    { label: 'Min A', value: 'MinA', numeric: 3, direction: 'higher_is_better' },
    { label: 'CGA',   value: 'CGA',  numeric: 4, direction: 'higher_is_better' },
    { label: 'SBA',   value: 'SBA',  numeric: 5, direction: 'higher_is_better' },
    { label: 'Sup',   value: 'Sup',  numeric: 6, direction: 'higher_is_better' },
    { label: 'Ind',   value: 'Ind',  numeric: 7, direction: 'higher_is_better' },
  ],

  cue_level: [
    { label: 'Max cues',  value: 'Max',  numeric: 0, direction: 'higher_is_better' },
    { label: 'Mod cues',  value: 'Mod',  numeric: 1, direction: 'higher_is_better' },
    { label: 'Min cues',  value: 'Min',  numeric: 2, direction: 'higher_is_better' },
    { label: 'Ind',       value: 'Ind',  numeric: 3, direction: 'higher_is_better' },
  ],

  pain_scale: Array.from({ length: 11 }, (_, i) => ({
    label: `${i}/10`,
    value: `${i}`,
    numeric: i,
    direction: 'lower_is_better' as const,
  })),

  mmt_grade: [
    { label: '0/5',  value: '0/5',  numeric: 0,   direction: 'higher_is_better' },
    { label: '1/5',  value: '1/5',  numeric: 1,   direction: 'higher_is_better' },
    { label: '1+/5', value: '1+/5', numeric: 1.5, direction: 'higher_is_better' },
    { label: '2-/5', value: '2-/5', numeric: 1.7, direction: 'higher_is_better' },
    { label: '2/5',  value: '2/5',  numeric: 2,   direction: 'higher_is_better' },
    { label: '2+/5', value: '2+/5', numeric: 2.5, direction: 'higher_is_better' },
    { label: '3-/5', value: '3-/5', numeric: 2.7, direction: 'higher_is_better' },
    { label: '3/5',  value: '3/5',  numeric: 3,   direction: 'higher_is_better' },
    { label: '3+/5', value: '3+/5', numeric: 3.5, direction: 'higher_is_better' },
    { label: '4-/5', value: '4-/5', numeric: 3.7, direction: 'higher_is_better' },
    { label: '4/5',  value: '4/5',  numeric: 4,   direction: 'higher_is_better' },
    { label: '4+/5', value: '4+/5', numeric: 4.5, direction: 'higher_is_better' },
    { label: '5/5',  value: '5/5',  numeric: 5,   direction: 'higher_is_better' },
  ],

  severity: [
    { label: 'Severe',   value: 'Severe',   numeric: 0, direction: 'higher_is_better' },
    { label: 'Mod-Sev',  value: 'Mod-Sev',  numeric: 1, direction: 'higher_is_better' },
    { label: 'Moderate',  value: 'Moderate', numeric: 2, direction: 'higher_is_better' },
    { label: 'Mild-Mod', value: 'Mild-Mod', numeric: 3, direction: 'higher_is_better' },
    { label: 'Mild',     value: 'Mild',     numeric: 4, direction: 'higher_is_better' },
    { label: 'Minimal',  value: 'Minimal',  numeric: 5, direction: 'higher_is_better' },
    { label: 'WNL',      value: 'WNL',      numeric: 6, direction: 'higher_is_better' },
  ],

  fim_score: Array.from({ length: 7 }, (_, i) => ({
    label: `FIM ${i + 1}`,
    value: `${i + 1}`,
    numeric: i + 1,
    direction: 'higher_is_better' as const,
  })),

  // These use numeric inputs, not chips — null means "render a number input"
  rom_degrees: null,
  timed_seconds: null,
  standardized_score: null,
  frequency: null,
  custom_text: null,
};

/** Category → default measurement type mapping (smart defaults) */
export const CATEGORY_DEFAULT_MEASUREMENT: Record<string, MeasurementType> = {
  // PT
  'Mobility': 'assist_level',
  'Transfers': 'assist_level',
  'Strength': 'mmt_grade',
  'ROM': 'rom_degrees',
  'Balance': 'timed_seconds',
  'Pain Management': 'pain_scale',
  'Functional Activity': 'assist_level',
  'Gait': 'assist_level',
  'Endurance': 'timed_seconds',
  'Posture': 'percentage',
  // OT
  'ADLs': 'assist_level',
  'Fine Motor': 'percentage',
  'Visual Motor': 'percentage',
  'Sensory Processing': 'severity',
  'Handwriting': 'percentage',
  'Self-Care': 'assist_level',
  'Feeding': 'assist_level',
  'Upper Extremity': 'assist_level',
  'Cognitive': 'cue_level',
  'Play Skills': 'cue_level',
  // ST
  'Articulation': 'percentage',
  'Language Comprehension': 'percentage',
  'Language Expression': 'percentage',
  'Fluency': 'severity',
  'Voice': 'severity',
  'Pragmatics': 'cue_level',
  'Phonological Awareness': 'percentage',
  'Feeding/Swallowing': 'severity',
  'AAC': 'cue_level',
  'Cognitive-Communication': 'cue_level',
  // MFT
  'Depression': 'standardized_score',
  'Anxiety': 'standardized_score',
  'Trauma': 'standardized_score',
  'Relationship': 'severity',
  'Family Systems': 'severity',
  'Coping Skills': 'severity',
  'Self-Esteem': 'severity',
  'Grief': 'severity',
  'Behavioral': 'frequency',
};

/** Measurement types available per discipline for the override dropdown */
export const DISCIPLINE_MEASUREMENT_OPTIONS: Record<Discipline, MeasurementType[]> = {
  PT: ['assist_level', 'mmt_grade', 'rom_degrees', 'timed_seconds', 'pain_scale', 'percentage', 'standardized_score', 'custom_text'],
  OT: ['assist_level', 'cue_level', 'percentage', 'fim_score', 'severity', 'custom_text'],
  ST: ['percentage', 'cue_level', 'severity', 'custom_text'],
  MFT: ['standardized_score', 'severity', 'frequency', 'percentage', 'custom_text'],
};

/** Default instrument names for standardized_score by category */
export const DEFAULT_INSTRUMENTS: Record<string, string> = {
  'Depression': 'PHQ-9',
  'Anxiety': 'GAD-7',
  'Trauma': 'PCL-5',
  'Balance': 'Berg Balance Scale',
};

/**
 * Get the direction for a measurement type (used for progress calculation).
 */
export function getMetricDirection(type: MeasurementType): 'higher_is_better' | 'lower_is_better' {
  const options = METRIC_OPTIONS[type];
  if (options && options.length > 0) return options[0].direction;
  // Numeric input types
  if (type === 'pain_scale') return 'lower_is_better';
  if (type === 'frequency') return 'lower_is_better';
  return 'higher_is_better';
}

/**
 * Calculate progress percentage between baseline and target.
 */
export function calculateProgress(
  baselineNumeric: number,
  currentNumeric: number,
  targetNumeric: number,
  direction: 'higher_is_better' | 'lower_is_better'
): number {
  const range = Math.abs(targetNumeric - baselineNumeric);
  if (range === 0) return currentNumeric === targetNumeric ? 100 : 0;

  const progress = direction === 'higher_is_better'
    ? (currentNumeric - baselineNumeric) / range
    : (baselineNumeric - currentNumeric) / range;

  return Math.max(0, Math.min(100, Math.round(progress * 100)));
}
