/**
 * Clinical Context Utility
 *
 * Maps client demographics (age, diagnoses, discipline) to relevant
 * note-bank categories so QuickChips and NoteBankPopover can surface
 * the most relevant phrases first.
 *
 * Pure utility — no Electron, React, or database dependencies.
 */

// ── Age helpers ──

export function calculateAgeInYears(dob: string): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  if (isNaN(birth.getTime())) return null;
  const today = new Date();
  let age = today.getFullYear() - birth.getFullYear();
  const m = today.getMonth() - birth.getMonth();
  if (m < 0 || (m === 0 && today.getDate() < birth.getDate())) {
    age--;
  }
  return age;
}

export function isPediatric(dob: string, threshold = 18): boolean {
  const age = calculateAgeInYears(dob);
  if (age === null) return false;
  return age < threshold;
}

// ── Diagnosis → Note-Bank Category Mapping ──
//
// Each entry: [ICD-10 prefix, categories to prioritize]
// Prefix matching: "F80" matches F80.0, F80.1, F80.81, etc.

const DX_CATEGORY_MAP: [string, string[]][] = [
  // Aphasia / Dysphasia
  ['R47.01', ['Language Comprehension', 'Language Expression', 'Cognitive-Communication', 'AAC']],
  ['R47.02', ['Language Comprehension', 'Language Expression', 'Cognitive-Communication']],

  // Dysarthria
  ['R47.1', ['Articulation']],

  // Dysphagia
  ['R13', ['Feeding/Swallowing', 'peds_feeding']],

  // Phonological disorder
  ['F80.0', ['Articulation', 'Phonological Awareness', 'peds']],

  // Expressive language disorder
  ['F80.1', ['Language Expression', 'peds']],

  // Mixed receptive-expressive
  ['F80.2', ['Language Comprehension', 'Language Expression', 'peds']],

  // Speech/language delay due to hearing loss
  ['F80.4', ['Language Comprehension', 'Language Expression', 'peds']],

  // Childhood onset fluency disorder (stuttering)
  ['F80.81', ['Fluency']],

  // Social pragmatic communication disorder
  ['F80.82', ['Pragmatics', 'peds_pragmatics', 'AAC']],

  // Catch-all F80 (developmental speech-language)
  ['F80.9', ['Language Expression', 'Language Comprehension', 'peds']],

  // Autism spectrum
  ['F84', ['Pragmatics', 'peds_pragmatics', 'AAC', 'Sensory Processing']],

  // ADHD
  ['F90', ['Cognitive-Communication', 'Cognitive']],

  // Specific developmental disorder of motor function (DCD)
  ['F82', ['Fine Motor', 'Sensory Processing']],

  // Specific reading disorder / dyslexia
  ['F81.0', ['Phonological Awareness', 'Literacy']],
  ['R48.0', ['Phonological Awareness', 'Literacy']],

  // Disorder of written expression
  ['F81.81', ['Handwriting', 'Fine Motor']],

  // General developmental delays
  ['F88', ['Language Expression', 'Language Comprehension', 'Fine Motor']],
  ['F89', ['Language Expression', 'Language Comprehension']],
  ['R62', ['peds']],

  // Feeding difficulties (pediatric)
  ['R63.3', ['Feeding/Swallowing', 'peds_feeding']],
  ['P92', ['Feeding/Swallowing', 'peds_feeding']],
  ['F98.2', ['Feeding/Swallowing', 'peds_feeding']],

  // Cerebral palsy
  ['G80', ['Mobility', 'ADLs', 'Upper Extremity', 'Feeding/Swallowing', 'AAC']],

  // Down syndrome
  ['Q90', ['Language Expression', 'Language Comprehension', 'AAC', 'Fine Motor']],

  // Fragile X
  ['Q99.2', ['Language Expression', 'Pragmatics', 'Sensory Processing']],

  // Cleft palate/lip
  ['Q35', ['Articulation', 'Feeding/Swallowing']],
  ['Q37', ['Articulation', 'Feeding/Swallowing']],

  // Voice disorders
  ['R49', ['Voice']],
  ['J38', ['Voice']],

  // Cognitive deficits
  ['R41', ['Cognitive-Communication', 'Cognitive']],
  ['G31.84', ['Cognitive-Communication', 'Cognitive']],
  ['F06.7', ['Cognitive-Communication', 'Cognitive']],

  // Stroke / CVA
  ['I63', ['Language Comprehension', 'Language Expression', 'Cognitive-Communication', 'Mobility', 'ADLs', 'Feeding/Swallowing']],
  ['I69', ['Language Comprehension', 'Language Expression', 'Cognitive-Communication', 'Mobility', 'ADLs']],

  // Hemiplegia
  ['G81', ['Mobility', 'Transfers', 'ADLs', 'Upper Extremity']],

  // Parkinson's
  ['G20', ['Voice', 'Feeding/Swallowing', 'Cognitive-Communication', 'Mobility', 'Balance', 'Gait']],

  // Multiple sclerosis
  ['G35', ['Mobility', 'Balance', 'Cognitive-Communication', 'Feeding/Swallowing', 'ADLs']],

  // Muscular dystrophy
  ['G71.0', ['Mobility', 'Strength', 'ADLs']],

  // Concussion / TBI
  ['S06', ['Cognitive-Communication', 'Cognitive', 'Balance']],

  // Hearing loss (impacts SLP)
  ['H90', ['Language Comprehension', 'Language Expression', 'AAC']],
  ['H91', ['Language Comprehension', 'Language Expression']],

  // Scoliosis (pediatric)
  ['M41.1', ['Posture', 'Strength']],

  // Screening encounters
  ['Z13.4', ['peds']],
];

// ── Main function ──

export interface ContextParams {
  dob?: string;
  primaryDxCode?: string;
  secondaryDx?: string; // JSON string: [{code,description},...] or string[]
  discipline?: string;
}

export function getContextCategories(params: ContextParams): string[] {
  const categories = new Set<string>();

  // 1. Age-based: inject pediatric categories
  if (params.dob && isPediatric(params.dob)) {
    categories.add('peds');

    if (params.discipline === 'ST') {
      categories.add('peds_feeding');
      categories.add('peds_pragmatics');
      categories.add('aac');
    }
    if (params.discipline === 'OT') {
      categories.add('peds_fine_motor');
      categories.add('peds_sensory');
      categories.add('peds_ADL');
      categories.add('peds_play');
      categories.add('peds_visual_motor');
    }
    if (params.discipline === 'PT') {
      categories.add('peds_gross_motor');
    }
  }

  // 2. Diagnosis-based: match ICD-10 prefixes
  const allCodes: string[] = [];
  if (params.primaryDxCode) allCodes.push(params.primaryDxCode);
  if (params.secondaryDx) {
    try {
      const parsed = JSON.parse(params.secondaryDx);
      if (Array.isArray(parsed)) {
        for (const dx of parsed) {
          const code = typeof dx === 'string' ? dx : dx?.code;
          if (code) allCodes.push(code);
        }
      }
    } catch { /* invalid JSON — skip */ }
  }

  for (const code of allCodes) {
    const upper = code.toUpperCase();
    for (const [prefix, cats] of DX_CATEGORY_MAP) {
      if (upper.startsWith(prefix.toUpperCase())) {
        for (const cat of cats) categories.add(cat);
      }
    }
  }

  return [...categories];
}
