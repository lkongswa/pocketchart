/**
 * Maps treatment plan intervention chips → goal pattern categories.
 * Used by "Generate Goals from Plan" to auto-create goal stubs.
 *
 * Interventions that are purely supportive (e.g., "Patient/caregiver education")
 * are intentionally omitted — they don't map to a standalone goal category.
 */
import type { Discipline } from './types';

/** Intervention label (lowercased) → goal category name */
const ST_MAP: Record<string, string> = {
  'articulation therapy': 'Articulation',
  'sensory-motor speech approach': 'Articulation',
  'language intervention': 'Language Expression',
  'naturalistic intervention': 'Language Expression',
  'narrative intervention': 'Language Expression',
  'literacy intervention': 'Language Expression',
  'phonological awareness training': 'Phonological Awareness',
  'fluency shaping': 'Fluency',
  'voice therapy': 'Voice',
  'dysphagia management': 'Feeding/Swallowing',
  'oral motor exercises': 'Feeding/Swallowing',
  'feeding therapy (sos/food chaining)': 'Feeding/Swallowing',
  'cognitive-communication training': 'Cognitive-Communication',
  'aac training': 'AAC',
  'aided language stimulation': 'AAC',
  'core vocabulary instruction': 'AAC',
  'communication partner training': 'AAC',
  'pragmatic language training': 'Pragmatics',
  'social skills training': 'Pragmatics',
  'play-based intervention': 'Pragmatics',
};

const PT_MAP: Record<string, string> = {
  'gait training': 'Gait',
  'functional mobility training': 'Mobility',
  'aquatic therapy': 'Mobility',
  'gross motor training': 'Mobility',
  'ndt/neurodevelopmental treatment': 'Mobility',
  'play-based gross motor intervention': 'Mobility',
  'balance training': 'Balance',
  'coordination/ball skills training': 'Balance',
  'neuromuscular re-education': 'Balance',
  'therapeutic exercise': 'Strength',
  'manual therapy': 'ROM',
  'stretching/flexibility': 'ROM',
  'modalities (e-stim, us, heat/cold)': 'Pain Management',
};

const OT_MAP: Record<string, string> = {
  'adl training': 'ADLs',
  'adaptive equipment training': 'ADLs',
  'feeding therapy': 'ADLs',
  'fine motor training': 'Fine Motor',
  'visual-motor training': 'Fine Motor',
  'play-based intervention': 'Fine Motor',
  'handwriting intervention': 'Handwriting',
  'therapeutic exercise': 'Upper Extremity',
  'neuromuscular re-education': 'Upper Extremity',
  'splinting/orthotics': 'Upper Extremity',
  'cognitive retraining': 'Cognitive',
  'sensory integration': 'Sensory Processing',
  'sensory diet implementation': 'Sensory Processing',
  'self-regulation training': 'Sensory Processing',
};

const MFT_MAP: Record<string, string> = {
  'cbt techniques': 'Depression',
  'dbt skills training': 'Coping Skills',
  'emdr': 'Trauma',
  'crisis intervention': 'Trauma',
  'couples therapy': 'Relationship',
  'family therapy': 'Family Systems',
  'mindfulness/relaxation training': 'Anxiety',
  'play therapy': 'Behavioral',
  'art/expressive therapy': 'Coping Skills',
  'individual psychotherapy': 'Coping Skills',
};

export const INTERVENTION_TO_CATEGORY: Record<Discipline, Record<string, string>> = {
  ST: ST_MAP,
  PT: PT_MAP,
  OT: OT_MAP,
  MFT: MFT_MAP,
};

/**
 * Parse a treatment plan string and return the deduplicated list of
 * goal categories that should have goals generated.
 */
export function getGoalCategoriesFromPlan(
  discipline: Discipline,
  treatmentPlan: string,
): string[] {
  if (!treatmentPlan.trim()) return [];

  const map = INTERVENTION_TO_CATEGORY[discipline] || {};
  const items = treatmentPlan.split(';').map(s => s.trim().toLowerCase()).filter(Boolean);
  const categories = new Set<string>();

  for (const item of items) {
    const cat = map[item];
    if (cat) categories.add(cat);
  }

  return [...categories];
}
