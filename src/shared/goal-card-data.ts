import type {
  EvalGoalEntry,
  Goal,
  GoalType,
  GoalStatus,
  MeasurementType,
  GoalProgressEntry,
  PatternOverride,
} from './types';
import type { GoalPattern } from './goal-patterns';
import { getPatternById, applyOverrides } from './goal-patterns';

/** Unified shape consumed by CollapsedGoalCard and ExpandedGoalCard */
export interface GoalCardData {
  index: number;
  goalId: number | null;

  goal_text: string;
  goal_text_manual: boolean;  // User hand-edited the text — pattern re-compose suppressed
  goal_type: GoalType;
  category: string;
  target_date: string;
  measurement_type: MeasurementType;
  baseline: number;
  target: number;
  baseline_value: string;
  target_value: string;
  instrument: string;

  pattern_id: string | undefined;
  components: Record<string, any>;
  resolvedPattern: GoalPattern | null;

  status: GoalStatus | null;
  isSynced: boolean;
  isCarriedOver: boolean;
  progressHistory: GoalProgressEntry[];

  context: 'eval' | 'client';
}

/** Fields the card can update — matches EvalGoalEntry fields */
export interface GoalCardFieldUpdate {
  goal_type?: GoalType;
  category?: string;
  target_date?: string;
  measurement_type?: MeasurementType;
  baseline_value?: string;
  baseline?: number;
  target_value?: string;
  target?: number;
  instrument?: string;
  goal_text?: string;
  goal_text_manual?: boolean;
  pattern_id?: string | undefined;
  components?: Record<string, any> | undefined;
}

function resolvePattern(
  patternId: string | undefined,
  overrides: PatternOverride[],
  customPatterns?: GoalPattern[],
): GoalPattern | null {
  if (!patternId || patternId === 'custom_freeform') return null;
  let pattern = getPatternById(patternId) ?? customPatterns?.find(p => p.id === patternId) ?? null;
  if (pattern && overrides.length > 0) pattern = applyOverrides(pattern, overrides);
  return pattern;
}

export function evalEntryToCardData(
  entry: EvalGoalEntry,
  index: number,
  linkedGoalId: number | null,
  history: GoalProgressEntry[],
  patternOverrides: PatternOverride[],
  customPatterns?: GoalPattern[],
): GoalCardData {
  return {
    index,
    goalId: linkedGoalId,
    goal_text: entry.goal_text,
    goal_text_manual: !!entry.goal_text_manual,
    goal_type: entry.goal_type,
    category: entry.category,
    target_date: entry.target_date,
    measurement_type: entry.measurement_type,
    baseline: entry.baseline,
    target: entry.target,
    baseline_value: entry.baseline_value,
    target_value: entry.target_value,
    instrument: entry.instrument,
    pattern_id: entry.pattern_id,
    components: entry.components || {},
    resolvedPattern: resolvePattern(entry.pattern_id, patternOverrides, customPatterns),
    status: null,
    isSynced: linkedGoalId != null && linkedGoalId > 0,
    isCarriedOver: !!entry.is_carried_over,
    progressHistory: history,
    context: 'eval',
  };
}

export function goalToCardData(
  goal: Goal,
  index: number,
  history: GoalProgressEntry[],
  patternOverrides: PatternOverride[],
): GoalCardData {
  let components: Record<string, any> = {};
  try {
    components = goal.components_json ? JSON.parse(goal.components_json) : {};
  } catch { /* leave empty */ }

  return {
    index,
    goalId: goal.id,
    goal_text: goal.goal_text,
    goal_text_manual: false,  // Saved goals store frozen text; no live re-compose
    goal_type: goal.goal_type,
    category: goal.category,
    target_date: goal.target_date,
    measurement_type: goal.measurement_type,
    baseline: goal.baseline,
    target: goal.target,
    baseline_value: goal.baseline_value,
    target_value: goal.target_value,
    instrument: goal.instrument,
    pattern_id: goal.pattern_id || undefined,
    components,
    resolvedPattern: resolvePattern(goal.pattern_id, patternOverrides),
    status: goal.status,
    isSynced: !!goal.source_document_id,
    isCarriedOver: false,
    progressHistory: history,
    context: 'client',
  };
}

/**
 * Generate a short fingerprint string for the collapsed goal card.
 * Examples: "/s/ /z/ +2 · all positions", "following directions · 2-step"
 */
export function generateGoalFingerprint(
  patternId: string | undefined,
  components: Record<string, any>,
  category: string,
): string {
  if (!patternId || patternId === 'custom_freeform') {
    return category || 'Custom Goal';
  }
  const pattern = getPatternById(patternId);
  if (!pattern) return category || 'Goal';

  const snippets: string[] = [];
  for (const comp of pattern.components) {
    // Skip cueing and consistency — not useful for fingerprint
    if (comp.key === 'consistency' || comp.key === 'cueing' || comp.key === 'cueing_baseline') continue;
    const val = components[comp.key];
    if (!val) continue;
    if (Array.isArray(val)) {
      if (val.length === 0) continue;
      snippets.push(val.length <= 3 ? val.join(', ') : `${val.slice(0, 2).join(', ')} +${val.length - 2}`);
    } else {
      snippets.push(String(val));
    }
    if (snippets.length >= 3) break;
  }

  return snippets.length > 0 ? snippets.join(' · ') : pattern.label;
}

/** A nested goal-card group: goal type (STG/LTG) → skill (category). */
export interface GoalCardGroup {
  goalType: GoalType;
  category: string;                               // "skill" label; '' → "Other"
  items: { card: GoalCardData; index: number }[]; // index = original array position
}

const GOAL_TYPE_ORDER: GoalType[] = ['STG', 'LTG'];

/**
 * Group goal cards for nested display: primary by goal type (STG before LTG),
 * secondary by category ("skill"). Each item keeps its ORIGINAL array index so
 * callers can leave their index-based handlers (expand/delete/update) untouched.
 */
export function groupGoalCards(cards: GoalCardData[]): GoalCardGroup[] {
  const groups: GoalCardGroup[] = [];
  const byKey = new Map<string, GoalCardGroup>();

  cards.forEach((card, index) => {
    const goalType: GoalType = card.goal_type === 'LTG' ? 'LTG' : 'STG';
    const category = card.category?.trim() || 'Other';
    const key = `${goalType}|||${category}`;
    let group = byKey.get(key);
    if (!group) {
      group = { goalType, category, items: [] };
      byKey.set(key, group);
      groups.push(group);
    }
    group.items.push({ card, index });
  });

  // STG before LTG; then category alphabetical with "Other" pushed to the end.
  groups.sort((a, b) => {
    const byType = GOAL_TYPE_ORDER.indexOf(a.goalType) - GOAL_TYPE_ORDER.indexOf(b.goalType);
    if (byType !== 0) return byType;
    if (a.category === 'Other' && b.category !== 'Other') return 1;
    if (b.category === 'Other' && a.category !== 'Other') return -1;
    return a.category.localeCompare(b.category);
  });

  return groups;
}
