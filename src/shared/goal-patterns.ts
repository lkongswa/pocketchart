import type { Discipline, MeasurementType } from './types';

/** A single component field within a goal pattern */
export interface PatternComponent {
  key: string;              // Unique field key: 'target_sounds', 'position', etc.
  label: string;            // UI label: "Target Sound(s)", "Position"
  type: 'chip_single'       // Single-select chips
      | 'chip_multi'        // Multi-select chips
      | 'number'            // Numeric input
      | 'text'              // Free text input
      | 'select'            // Dropdown select
      | 'consistency';      // Special: consistency criterion with sub-fields
  options?: string[];        // For chip/select types
  defaultValue?: any;        // Smart default
  placeholder?: string;      // For text/number inputs
  suffix?: string;           // Display suffix: "ft", "°", "sec"
  required?: boolean;        // If true, must be filled (rare — most are optional)
}

/** A complete goal pattern definition */
export interface GoalPattern {
  id: string;                // Unique: 'st_sound_production', 'pt_ambulation'
  discipline: Discipline;
  category: string;          // Maps to existing category system
  label: string;             // Card title: "Sound Production"
  icon?: string;             // Emoji for the card
  verb: string;              // Composition verb: "produce", "ambulate"
  measurement_type: MeasurementType;
  instrument?: string;       // Default for standardized_score types
  components: PatternComponent[];
  compositionOrder: string[]; // Order of component keys in composed text
}

// ══════════════════════════════════════════════════════════════════════
// ST (Speech-Language Pathology) Patterns
// ══════════════════════════════════════════════════════════════════════

const ST_PATTERNS: GoalPattern[] = [
  // ── Articulation ──
  {
    id: 'st_sound_production',
    discipline: 'ST',
    category: 'Articulation',
    label: 'Sound Production',
    icon: '🎯',
    verb: 'produce',
    measurement_type: 'percentage',
    components: [
      {
        key: 'target_sounds',
        label: 'Target Sound(s)',
        type: 'chip_multi',
        options: ['/s/', '/z/', '/r/', '/l/', '/θ/', '/ð/', '/ʃ/', '/tʃ/', '/dʒ/', '/k/', '/g/', '/f/', '/v/'],
      },
      {
        key: 'position',
        label: 'Position',
        type: 'chip_multi',
        options: ['initial', 'medial', 'final', 'all positions'],
        defaultValue: ['all positions'],
      },
      {
        key: 'linguistic_level',
        label: 'Linguistic Level',
        type: 'chip_single',
        options: ['isolation', 'syllable', 'word', 'phrase', 'sentence', 'conversation'],
        defaultValue: 'sentence',
      },
      {
        key: 'cueing',
        label: 'Cueing Level (Target)',
        type: 'chip_single',
        options: ['independently', 'given min verbal cues', 'given mod verbal cues', 'given max verbal/visual cues'],
      },
      {
        key: 'cueing_baseline',
        label: 'Cueing Level (Baseline)',
        type: 'chip_single',
        options: ['independently', 'with min cues', 'with mod cues', 'with max cues'],
      },
      {
        key: 'consistency',
        label: 'Consistency Criterion',
        type: 'consistency',
      },
    ],
    compositionOrder: ['target_sounds', 'position', 'linguistic_level', 'metric_target', 'cueing', 'consistency', 'baseline_suffix', 'timeframe'],
  },

  {
    id: 'st_intelligibility',
    discipline: 'ST',
    category: 'Articulation',
    label: 'Overall Intelligibility',
    icon: '🗣️',
    verb: 'demonstrate',
    measurement_type: 'percentage',
    components: [
      {
        key: 'listener',
        label: 'Listener',
        type: 'chip_single',
        options: ['familiar listeners', 'unfamiliar listeners', 'all listeners'],
      },
      {
        key: 'context',
        label: 'Context',
        type: 'chip_single',
        options: ['structured activity', 'conversation', 'classroom setting', 'community setting'],
      },
      {
        key: 'cueing',
        label: 'Cueing Level (Target)',
        type: 'chip_single',
        options: ['independently', 'given min cues for self-correction', 'given mod cues'],
      },
      { key: 'consistency', label: 'Consistency Criterion', type: 'consistency' },
    ],
    compositionOrder: ['intelligibility_phrase', 'listener', 'context', 'metric_target', 'cueing', 'consistency', 'baseline_suffix', 'timeframe'],
  },

  {
    id: 'st_phonological_process',
    discipline: 'ST',
    category: 'Articulation',
    label: 'Phonological Process Reduction',
    icon: '🔤',
    verb: 'reduce',
    measurement_type: 'percentage',
    components: [
      {
        key: 'process',
        label: 'Phonological Process',
        type: 'chip_single',
        options: ['fronting', 'stopping', 'final consonant deletion', 'cluster reduction', 'gliding', 'deaffrication', 'backing', 'stridency deletion'],
      },
      {
        key: 'context',
        label: 'Context',
        type: 'chip_single',
        options: ['single words', 'phrases', 'sentences', 'conversation'],
      },
      {
        key: 'cueing',
        label: 'Cueing Level (Target)',
        type: 'chip_single',
        options: ['independently', 'given min cues', 'given mod cues'],
      },
      { key: 'consistency', label: 'Consistency Criterion', type: 'consistency' },
    ],
    compositionOrder: ['process_phrase', 'context', 'metric_target', 'cueing', 'consistency', 'baseline_suffix', 'timeframe'],
  },

  // ── Language Expression ──
  {
    id: 'st_expressive_language',
    discipline: 'ST',
    category: 'Language Expression',
    label: 'Expressive Language Skill',
    icon: '💬',
    verb: 'demonstrate',
    measurement_type: 'percentage',
    components: [
      {
        key: 'skill',
        label: 'Target Skill',
        type: 'chip_single',
        options: [
          'use complete sentences',
          'use age-appropriate grammar',
          'use descriptive vocabulary',
          'answer wh-questions',
          'retell a story with key elements',
          'formulate sentences with target structures',
          'use morphological markers correctly',
        ],
      },
      {
        key: 'context',
        label: 'Context',
        type: 'chip_single',
        options: ['structured activity', 'conversation', 'narrative retell', 'play-based activity', 'classroom discussion'],
      },
      {
        key: 'cueing',
        label: 'Cueing Level (Target)',
        type: 'chip_single',
        options: ['independently', 'given min verbal cues', 'given mod cues', 'given max cues with models'],
      },
      { key: 'consistency', label: 'Consistency Criterion', type: 'consistency' },
    ],
    compositionOrder: ['skill', 'context', 'metric_target', 'cueing', 'consistency', 'baseline_suffix', 'timeframe'],
  },

  // ── Language Comprehension ──
  {
    id: 'st_receptive_language',
    discipline: 'ST',
    category: 'Language Comprehension',
    label: 'Receptive Language Skill',
    icon: '👂',
    verb: 'demonstrate',
    measurement_type: 'percentage',
    components: [
      {
        key: 'skill',
        label: 'Target Skill',
        type: 'chip_single',
        options: [
          'follow multi-step directions',
          'identify vocabulary by description',
          'answer comprehension questions',
          'identify main idea and details',
          'make inferences from context',
          'follow classroom instructions',
        ],
      },
      {
        key: 'complexity',
        label: 'Complexity',
        type: 'chip_single',
        options: ['1-step', '2-step', '3-step', 'multi-step', 'paragraph-level'],
      },
      {
        key: 'cueing',
        label: 'Cueing Level (Target)',
        type: 'chip_single',
        options: ['independently', 'given min verbal cues', 'given mod cues', 'given max cues with repetition'],
      },
      { key: 'consistency', label: 'Consistency Criterion', type: 'consistency' },
    ],
    compositionOrder: ['skill', 'complexity', 'metric_target', 'cueing', 'consistency', 'baseline_suffix', 'timeframe'],
  },

  // ── Fluency ──
  {
    id: 'st_fluency_management',
    discipline: 'ST',
    category: 'Fluency',
    label: 'Fluency Strategy Use',
    icon: '🌊',
    verb: 'utilize',
    measurement_type: 'percentage',
    components: [
      {
        key: 'strategy',
        label: 'Strategy',
        type: 'chip_multi',
        options: ['easy onset', 'light articulatory contact', 'pausing/phrasing', 'reduced rate', 'cancellations', 'pull-outs', 'preparatory sets'],
      },
      {
        key: 'context',
        label: 'Context',
        type: 'chip_single',
        options: ['structured activity', 'reading', 'conversation', 'classroom participation', 'phone calls'],
      },
      {
        key: 'cueing',
        label: 'Cueing Level (Target)',
        type: 'chip_single',
        options: ['independently', 'given min cues', 'given mod cues'],
      },
      { key: 'consistency', label: 'Consistency Criterion', type: 'consistency' },
    ],
    compositionOrder: ['strategy', 'context', 'metric_target', 'cueing', 'consistency', 'baseline_suffix', 'timeframe'],
  },

  // ── Pragmatics ──
  {
    id: 'st_social_communication',
    discipline: 'ST',
    category: 'Pragmatics',
    label: 'Social Communication Skill',
    icon: '🤝',
    verb: 'demonstrate',
    measurement_type: 'cue_level',
    components: [
      {
        key: 'skill',
        label: 'Target Skill',
        type: 'chip_single',
        options: [
          'appropriate turn-taking',
          'topic initiation and maintenance',
          'eye contact during conversation',
          'appropriate personal space',
          'reading nonverbal cues',
          'perspective-taking',
          'conversational repair strategies',
        ],
      },
      {
        key: 'context',
        label: 'Context',
        type: 'chip_single',
        options: ['structured activity', 'peer interaction', 'group setting', 'conversation with adult'],
      },
      { key: 'consistency', label: 'Consistency Criterion', type: 'consistency' },
    ],
    compositionOrder: ['skill', 'context', 'metric_target', 'consistency', 'baseline_suffix', 'timeframe'],
  },

  // ── Voice ──
  {
    id: 'st_vocal_quality',
    discipline: 'ST',
    category: 'Voice',
    label: 'Vocal Quality/Use',
    icon: '🎵',
    verb: 'demonstrate',
    measurement_type: 'severity',
    components: [
      {
        key: 'parameter',
        label: 'Target Parameter',
        type: 'chip_single',
        options: ['appropriate vocal pitch', 'appropriate vocal volume', 'reduced vocal strain', 'improved resonance', 'consistent vocal hygiene'],
      },
      {
        key: 'context',
        label: 'Context',
        type: 'chip_single',
        options: ['structured tasks', 'conversation', 'classroom', 'vocally demanding situations'],
      },
      {
        key: 'cueing',
        label: 'Cueing Level (Target)',
        type: 'chip_single',
        options: ['independently', 'given min cues for self-monitoring', 'given mod cues'],
      },
    ],
    compositionOrder: ['parameter', 'context', 'metric_target', 'cueing', 'baseline_suffix', 'timeframe'],
  },

  // ── Feeding/Swallowing ──
  {
    id: 'st_diet_advancement',
    discipline: 'ST',
    category: 'Feeding/Swallowing',
    label: 'Diet Advancement',
    icon: '🍽️',
    verb: 'safely tolerate',
    measurement_type: 'severity',
    components: [
      {
        key: 'target_diet',
        label: 'Target Diet',
        type: 'chip_single',
        options: ['thin liquids', 'nectar-thick liquids', 'honey-thick liquids', 'puree', 'mechanical soft', 'soft and bite-sized', 'regular'],
      },
      {
        key: 'strategy',
        label: 'Compensatory Strategy',
        type: 'chip_multi',
        options: ['chin tuck', 'head turn', 'effortful swallow', 'supraglottic swallow', 'multiple swallows per bolus', 'alternating solids/liquids'],
      },
      {
        key: 'evidence',
        label: 'Evidenced By',
        type: 'chip_single',
        options: ['without signs/symptoms of aspiration', 'with adequate oral clearance', 'maintaining adequate nutrition/hydration'],
      },
    ],
    compositionOrder: ['target_diet', 'strategy', 'evidence', 'baseline_suffix', 'timeframe'],
  },

  // ── Cognitive-Communication ──
  {
    id: 'st_cognitive_task',
    discipline: 'ST',
    category: 'Cognitive-Communication',
    label: 'Cognitive-Communication Task',
    icon: '🧠',
    verb: 'demonstrate',
    measurement_type: 'cue_level',
    components: [
      {
        key: 'domain',
        label: 'Cognitive Domain',
        type: 'chip_single',
        options: ['sustained attention', 'working memory', 'problem-solving', 'reasoning', 'executive function', 'safety awareness', 'functional memory strategies'],
      },
      {
        key: 'task_complexity',
        label: 'Task Complexity',
        type: 'chip_single',
        options: ['simple/routine', 'moderate complexity', 'complex/novel'],
      },
      {
        key: 'cueing',
        label: 'Cueing Level (Target)',
        type: 'chip_single',
        options: ['independently', 'given min cues', 'given mod cues', 'given max cues'],
      },
      { key: 'consistency', label: 'Consistency Criterion', type: 'consistency' },
    ],
    compositionOrder: ['domain', 'task_complexity', 'metric_target', 'cueing', 'consistency', 'baseline_suffix', 'timeframe'],
  },

  // ── AAC ──
  {
    id: 'st_aac_use',
    discipline: 'ST',
    category: 'AAC',
    label: 'AAC Device/System Use',
    icon: '📱',
    verb: 'use',
    measurement_type: 'cue_level',
    components: [
      {
        key: 'system',
        label: 'AAC System',
        type: 'text',
        placeholder: 'e.g., SGD, PECS, communication board',
      },
      {
        key: 'function',
        label: 'Communicative Function',
        type: 'chip_multi',
        options: ['request', 'comment', 'answer questions', 'greet', 'protest', 'share information'],
      },
      {
        key: 'context',
        label: 'Context',
        type: 'chip_single',
        options: ['structured activity', 'classroom', 'mealtime', 'peer interaction', 'community outing'],
      },
      {
        key: 'cueing',
        label: 'Cueing Level (Target)',
        type: 'chip_single',
        options: ['independently', 'given min cues', 'given gestural cues', 'given mod cues', 'given hand-over-hand'],
      },
      { key: 'consistency', label: 'Consistency Criterion', type: 'consistency' },
    ],
    compositionOrder: ['system', 'function', 'context', 'metric_target', 'cueing', 'consistency', 'baseline_suffix', 'timeframe'],
  },
];

// ══════════════════════════════════════════════════════════════════════
// PT (Physical Therapy) Patterns
// ══════════════════════════════════════════════════════════════════════

const PT_PATTERNS: GoalPattern[] = [
  {
    id: 'pt_ambulation',
    discipline: 'PT',
    category: 'Mobility',
    label: 'Ambulation',
    icon: '🚶',
    verb: 'ambulate',
    measurement_type: 'assist_level',
    components: [
      { key: 'distance', label: 'Distance', type: 'number', placeholder: '100', suffix: 'ft' },
      { key: 'surface', label: 'Surface', type: 'chip_single', options: ['level surfaces', 'uneven surfaces', 'outdoor terrain', 'ramp', 'carpet'] },
      { key: 'device', label: 'Device', type: 'chip_single', options: ['no device', 'cane', 'SBQC', 'WBQC', 'FWW', 'RW', '2-wheel walker', 'hemi-walker'] },
    ],
    compositionOrder: ['distance', 'surface', 'device', 'metric_target', 'baseline_suffix', 'timeframe'],
  },
  {
    id: 'pt_stair_navigation',
    discipline: 'PT',
    category: 'Mobility',
    label: 'Stair Navigation',
    icon: '🪜',
    verb: 'navigate',
    measurement_type: 'assist_level',
    components: [
      { key: 'flights', label: 'Flights/Steps', type: 'text', placeholder: 'e.g., 1 flight, 12 steps' },
      { key: 'direction', label: 'Direction', type: 'chip_single', options: ['ascending and descending', 'ascending', 'descending'] },
      { key: 'railing', label: 'Railing', type: 'chip_single', options: ['with railing', 'without railing', 'with bilateral railing'] },
    ],
    compositionOrder: ['flights', 'direction', 'railing', 'metric_target', 'baseline_suffix', 'timeframe'],
  },
  {
    id: 'pt_sit_to_stand',
    discipline: 'PT',
    category: 'Transfers',
    label: 'Sit-to-Stand',
    icon: '🪑',
    verb: 'perform',
    measurement_type: 'assist_level',
    components: [
      { key: 'surface', label: 'Surface', type: 'chip_single', options: ['standard height chair', 'low surface', 'elevated surface', 'toilet', 'bed edge'] },
      { key: 'repetitions', label: 'Repetitions', type: 'text', placeholder: 'e.g., x5 reps' },
      { key: 'use_of_UE', label: 'Upper Extremity Use', type: 'chip_single', options: ['without UE support', 'with bilateral UE support', 'with unilateral UE support'] },
    ],
    compositionOrder: ['sit_to_stand_phrase', 'surface', 'repetitions', 'use_of_UE', 'metric_target', 'baseline_suffix', 'timeframe'],
  },
  {
    id: 'pt_functional_transfer',
    discipline: 'PT',
    category: 'Transfers',
    label: 'Functional Transfer',
    icon: '🔄',
    verb: 'complete',
    measurement_type: 'assist_level',
    components: [
      { key: 'transfer_type', label: 'Transfer', type: 'chip_single', options: ['bed mobility', 'supine to/from sit', 'toilet transfer', 'tub/shower transfer', 'car transfer', 'floor transfer'] },
    ],
    compositionOrder: ['transfer_type', 'metric_target', 'baseline_suffix', 'timeframe'],
  },
  {
    id: 'pt_muscle_strength',
    discipline: 'PT',
    category: 'Strength',
    label: 'Muscle Strength',
    icon: '💪',
    verb: 'demonstrate',
    measurement_type: 'mmt_grade',
    components: [
      { key: 'muscle_group', label: 'Muscle Group / Motion', type: 'text', placeholder: 'e.g., hip flexion, knee extension, ankle DF' },
      { key: 'side', label: 'Side', type: 'chip_single', options: ['bilateral', 'left', 'right'] },
    ],
    compositionOrder: ['muscle_group', 'side', 'metric_target', 'baseline_suffix', 'timeframe'],
  },
  {
    id: 'pt_rom',
    discipline: 'PT',
    category: 'ROM',
    label: 'Range of Motion',
    icon: '📐',
    verb: 'achieve',
    measurement_type: 'rom_degrees',
    components: [
      { key: 'joint_motion', label: 'Joint / Motion', type: 'text', placeholder: 'e.g., shoulder flexion, knee extension' },
      { key: 'rom_type', label: 'ROM Type', type: 'chip_single', options: ['AROM', 'PROM', 'AAROM'], defaultValue: 'AROM' },
      { key: 'side', label: 'Side', type: 'chip_single', options: ['bilateral', 'left', 'right'] },
    ],
    compositionOrder: ['joint_motion', 'rom_type', 'side', 'metric_target', 'baseline_suffix', 'timeframe'],
  },
  {
    id: 'pt_static_balance',
    discipline: 'PT',
    category: 'Balance',
    label: 'Static Balance',
    icon: '⚖️',
    verb: 'maintain',
    measurement_type: 'timed_seconds',
    components: [
      { key: 'position', label: 'Position', type: 'chip_single', options: ['standing', 'tandem stance', 'single-leg stance'], defaultValue: 'standing' },
      { key: 'surface', label: 'Surface', type: 'chip_single', options: ['firm surface', 'foam surface', 'BOSU'] },
      { key: 'eyes', label: 'Eyes', type: 'chip_single', options: ['eyes open', 'eyes closed'] },
      { key: 'safety_criterion', label: 'Safety', type: 'chip_single', options: ['without LOB', 'without UE support', 'with min LOB'] },
    ],
    compositionOrder: ['position', 'surface', 'eyes', 'metric_target', 'safety_criterion', 'baseline_suffix', 'timeframe'],
  },
  {
    id: 'pt_standardized_balance',
    discipline: 'PT',
    category: 'Balance',
    label: 'Standardized Balance Assessment',
    icon: '📊',
    verb: 'achieve',
    measurement_type: 'standardized_score',
    instrument: 'Berg Balance Scale',
    components: [
      { key: 'instrument', label: 'Assessment Tool', type: 'select', options: ['Berg Balance Scale (/56)', 'Tinetti (/28)', 'TUG (seconds)', 'Dynamic Gait Index (/24)', '5x Sit-to-Stand (seconds)'] },
    ],
    compositionOrder: ['instrument', 'metric_target', 'baseline_suffix', 'timeframe'],
  },
  {
    id: 'pt_pain_reduction',
    discipline: 'PT',
    category: 'Pain Management',
    label: 'Pain Reduction',
    icon: '🩹',
    verb: 'report',
    measurement_type: 'pain_scale',
    components: [
      { key: 'context', label: 'Activity Context', type: 'chip_single', options: ['at rest', 'with functional activities', 'during ambulation', 'during transfers', 'with ADLs'] },
    ],
    compositionOrder: ['pain_phrase', 'context', 'metric_target', 'baseline_suffix', 'timeframe'],
  },
  {
    id: 'pt_gait_quality',
    discipline: 'PT',
    category: 'Gait',
    label: 'Gait Quality',
    icon: '👣',
    verb: 'demonstrate',
    measurement_type: 'assist_level',
    components: [
      { key: 'parameter', label: 'Gait Parameter', type: 'chip_multi', options: ['normalized step length', 'symmetric gait pattern', 'appropriate cadence', 'heel-toe pattern', 'appropriate arm swing', 'reduced compensatory patterns'] },
      { key: 'device', label: 'Device', type: 'chip_single', options: ['no device', 'cane', 'FWW', 'RW'] },
    ],
    compositionOrder: ['parameter', 'device', 'metric_target', 'baseline_suffix', 'timeframe'],
  },
  {
    id: 'pt_endurance',
    discipline: 'PT',
    category: 'Endurance',
    label: 'Activity Tolerance',
    icon: '❤️',
    verb: 'tolerate',
    measurement_type: 'timed_seconds',
    components: [
      { key: 'activity', label: 'Activity', type: 'chip_single', options: ['continuous ambulation', 'functional mobility tasks', 'UE exercise', 'community-level ambulation'] },
      { key: 'duration_or_distance', label: 'Duration / Distance', type: 'text', placeholder: 'e.g., 10 min, 500 ft' },
      { key: 'vitals_criterion', label: 'Vitals Criterion', type: 'chip_single', options: ['without vital sign changes', 'maintaining HR within target zone', 'without O2 desaturation below 90%'] },
    ],
    compositionOrder: ['activity', 'duration_or_distance', 'vitals_criterion', 'baseline_suffix', 'timeframe'],
  },
];

// ══════════════════════════════════════════════════════════════════════
// OT (Occupational Therapy) Patterns
// ══════════════════════════════════════════════════════════════════════

const OT_PATTERNS: GoalPattern[] = [
  {
    id: 'ot_self_care_task',
    discipline: 'OT',
    category: 'ADLs',
    label: 'Self-Care Task',
    icon: '👕',
    verb: 'complete',
    measurement_type: 'assist_level',
    components: [
      { key: 'task', label: 'Task', type: 'chip_single', options: ['upper body dressing', 'lower body dressing', 'grooming', 'bathing', 'toileting', 'feeding/eating', 'oral hygiene'] },
      { key: 'detail', label: 'Specific Detail', type: 'text', placeholder: 'e.g., including buttons and zippers, using adapted utensils' },
      { key: 'cueing', label: 'Cueing (Target)', type: 'chip_single', options: ['independently', 'with setup assistance', 'given min verbal cues', 'given mod verbal/gestural cues'] },
    ],
    compositionOrder: ['task', 'detail', 'metric_target', 'cueing', 'baseline_suffix', 'timeframe'],
  },
  {
    id: 'ot_meal_prep',
    discipline: 'OT',
    category: 'ADLs',
    label: 'Meal Preparation',
    icon: '🍳',
    verb: 'prepare',
    measurement_type: 'assist_level',
    components: [
      { key: 'complexity', label: 'Complexity', type: 'chip_single', options: ['cold meal', 'hot simple meal', 'multi-step meal'] },
      { key: 'safety', label: 'Safety', type: 'chip_single', options: ['with safe use of appliances', 'with safe knife handling', 'using energy conservation techniques'] },
      { key: 'cueing', label: 'Cueing (Target)', type: 'chip_single', options: ['independently', 'given min verbal cues', 'given mod cues for sequencing'] },
    ],
    compositionOrder: ['complexity', 'metric_target', 'cueing', 'safety', 'baseline_suffix', 'timeframe'],
  },
  {
    id: 'ot_fine_motor',
    discipline: 'OT',
    category: 'Fine Motor',
    label: 'Grasp / Manipulation',
    icon: '✋',
    verb: 'demonstrate',
    measurement_type: 'percentage',
    components: [
      { key: 'task', label: 'Task', type: 'chip_single', options: ['tripod grasp for writing', 'bilateral coordination tasks', 'in-hand manipulation', 'scissor use', 'utensil use', 'button/zipper fastening'] },
      { key: 'cueing', label: 'Cueing (Target)', type: 'chip_single', options: ['independently', 'given min cues', 'given mod cues', 'given hand-over-hand assistance'] },
      { key: 'consistency', label: 'Consistency Criterion', type: 'consistency' },
    ],
    compositionOrder: ['task', 'metric_target', 'cueing', 'consistency', 'baseline_suffix', 'timeframe'],
  },
  {
    id: 'ot_ue_function',
    discipline: 'OT',
    category: 'Upper Extremity',
    label: 'Upper Extremity Function',
    icon: '💪',
    verb: 'demonstrate',
    measurement_type: 'assist_level',
    components: [
      { key: 'functional_task', label: 'Functional Task', type: 'text', placeholder: 'e.g., reaching overhead, bilateral carry tasks' },
      { key: 'side', label: 'Side', type: 'chip_single', options: ['bilateral', 'left UE', 'right UE', 'affected UE'] },
    ],
    compositionOrder: ['functional_task', 'side', 'metric_target', 'baseline_suffix', 'timeframe'],
  },
  {
    id: 'ot_cognitive_strategy',
    discipline: 'OT',
    category: 'Cognitive',
    label: 'Cognitive Strategy Use',
    icon: '🧠',
    verb: 'demonstrate',
    measurement_type: 'cue_level',
    components: [
      { key: 'domain', label: 'Domain', type: 'chip_single', options: ['task sequencing', 'safety awareness', 'problem-solving', 'time management', 'money management', 'medication management'] },
      { key: 'task', label: 'Specific Task', type: 'text', placeholder: 'e.g., 3-step morning routine, weekly medication setup' },
      { key: 'cueing', label: 'Cueing (Target)', type: 'chip_single', options: ['independently', 'given min cues', 'given mod cues', 'given written checklist'] },
      { key: 'consistency', label: 'Consistency Criterion', type: 'consistency' },
    ],
    compositionOrder: ['domain', 'task', 'metric_target', 'cueing', 'consistency', 'baseline_suffix', 'timeframe'],
  },
  {
    id: 'ot_handwriting',
    discipline: 'OT',
    category: 'Handwriting',
    label: 'Handwriting',
    icon: '✏️',
    verb: 'demonstrate',
    measurement_type: 'percentage',
    components: [
      { key: 'component', label: 'Component', type: 'chip_single', options: ['legible letter formation', 'appropriate letter sizing', 'consistent spacing', 'baseline alignment', 'appropriate pencil pressure'] },
      { key: 'level', label: 'Task Level', type: 'chip_single', options: ['copying', 'dictation', 'spontaneous writing'] },
      { key: 'consistency', label: 'Consistency Criterion', type: 'consistency' },
    ],
    compositionOrder: ['component', 'level', 'metric_target', 'consistency', 'baseline_suffix', 'timeframe'],
  },
  {
    id: 'ot_sensory_regulation',
    discipline: 'OT',
    category: 'Sensory Processing',
    label: 'Sensory Regulation',
    icon: '🌀',
    verb: 'demonstrate',
    measurement_type: 'severity',
    components: [
      { key: 'context', label: 'Context', type: 'chip_single', options: ['classroom', 'mealtime', 'transitions', 'noisy environments', 'grooming activities'] },
      { key: 'strategy', label: 'Strategy', type: 'text', placeholder: 'e.g., sensory diet activities, self-regulation strategies' },
      { key: 'cueing', label: 'Cueing (Target)', type: 'chip_single', options: ['independently', 'given min cues', 'given mod cues to use strategies'] },
    ],
    compositionOrder: ['regulation_phrase', 'context', 'strategy', 'metric_target', 'cueing', 'baseline_suffix', 'timeframe'],
  },
];

// ══════════════════════════════════════════════════════════════════════
// MFT (Marriage & Family Therapy) Patterns
// ══════════════════════════════════════════════════════════════════════

const MFT_PATTERNS: GoalPattern[] = [
  {
    id: 'mft_symptom_reduction',
    discipline: 'MFT',
    category: 'Depression',
    label: 'Symptom Reduction',
    icon: '📊',
    verb: 'report',
    measurement_type: 'standardized_score',
    instrument: 'PHQ-9',
    components: [
      { key: 'instrument', label: 'Assessment Tool', type: 'select', options: ['PHQ-9', 'BDI-II', 'GAD-7', 'PCL-5', 'ORS', 'SRS', 'Y-BOCS', 'AUDIT'] },
    ],
    compositionOrder: ['symptom_reduction_phrase', 'instrument', 'metric_target', 'baseline_suffix', 'timeframe'],
  },
  {
    id: 'mft_behavioral_activation',
    discipline: 'MFT',
    category: 'Depression',
    label: 'Behavioral Activation',
    icon: '✨',
    verb: 'engage in',
    measurement_type: 'frequency',
    components: [
      { key: 'activity_type', label: 'Activity Type', type: 'chip_single', options: ['pleasurable activities', 'social activities', 'physical activities', 'meaningful activities'] },
      { key: 'evidence', label: 'Evidenced By', type: 'chip_single', options: ['as reported in session', 'as documented in activity log', 'as confirmed by collateral'] },
    ],
    compositionOrder: ['activity_type', 'metric_target', 'evidence', 'baseline_suffix', 'timeframe'],
  },
  {
    id: 'mft_coping_strategy',
    discipline: 'MFT',
    category: 'Coping Skills',
    label: 'Coping Strategy Acquisition',
    icon: '🛡️',
    verb: 'identify and practice',
    measurement_type: 'severity',
    components: [
      { key: 'num_strategies', label: 'Number of Strategies', type: 'number', placeholder: '3' },
      { key: 'type', label: 'Strategy Type', type: 'chip_single', options: ['healthy coping mechanisms', 'grounding techniques', 'distress tolerance skills', 'emotion regulation strategies', 'mindfulness practices'] },
      { key: 'context', label: 'For Managing', type: 'text', placeholder: 'e.g., depressive episodes, anxious thoughts, interpersonal conflict' },
      { key: 'evidence', label: 'Evidenced By', type: 'chip_single', options: ['as demonstrated in session', 'as reported using between sessions', 'as observed by treatment team'] },
    ],
    compositionOrder: ['num_strategies', 'type', 'context', 'evidence', 'baseline_suffix', 'timeframe'],
  },
  {
    id: 'mft_anxiety_management',
    discipline: 'MFT',
    category: 'Anxiety',
    label: 'Anxiety Management Technique',
    icon: '🧘',
    verb: 'demonstrate use of',
    measurement_type: 'frequency',
    components: [
      { key: 'technique', label: 'Technique', type: 'chip_multi', options: ['grounding exercises', 'progressive muscle relaxation', 'diaphragmatic breathing', 'cognitive restructuring', 'exposure hierarchy steps'] },
      { key: 'context', label: 'When Experiencing', type: 'text', placeholder: 'e.g., anticipatory anxiety, panic symptoms, social situations' },
      { key: 'evidence', label: 'Evidenced By', type: 'chip_single', options: ['as reported in session', 'reduction in avoidance behaviors', 'completion of between-session practice'] },
    ],
    compositionOrder: ['technique', 'context', 'metric_target', 'evidence', 'baseline_suffix', 'timeframe'],
  },
  {
    id: 'mft_communication_skills',
    discipline: 'MFT',
    category: 'Relationship',
    label: 'Communication Skills',
    icon: '💬',
    verb: 'demonstrate',
    measurement_type: 'frequency',
    components: [
      { key: 'skill', label: 'Communication Skill', type: 'chip_single', options: ['I-statements', 'active listening', 'de-escalation techniques', 'assertive communication', 'empathic reflection', 'repair attempts after conflict'] },
      { key: 'context', label: 'Context', type: 'chip_single', options: ['during session', 'during conflict discussions', 'in daily interactions as reported', 'in parenting situations'] },
    ],
    compositionOrder: ['skill', 'context', 'metric_target', 'baseline_suffix', 'timeframe'],
  },
  {
    id: 'mft_conflict_reduction',
    discipline: 'MFT',
    category: 'Relationship',
    label: 'Conflict Reduction',
    icon: '🕊️',
    verb: 'reduce',
    measurement_type: 'frequency',
    components: [
      { key: 'conflict_type', label: 'Conflict Type', type: 'text', placeholder: 'e.g., escalated arguments, verbal conflicts, shutting down during disagreements' },
      { key: 'replacement', label: 'Replacement Behavior', type: 'text', placeholder: 'e.g., using timeout protocol, de-escalation skills' },
    ],
    compositionOrder: ['conflict_type', 'metric_target', 'replacement', 'baseline_suffix', 'timeframe'],
  },
  {
    id: 'mft_boundary_setting',
    discipline: 'MFT',
    category: 'Family Systems',
    label: 'Boundary Setting',
    icon: '🚧',
    verb: 'establish and maintain',
    measurement_type: 'severity',
    components: [
      { key: 'boundary_type', label: 'Boundary Type', type: 'text', placeholder: 'e.g., emotional boundaries, screen time limits, in-law boundaries' },
      { key: 'evidence', label: 'Evidenced By', type: 'chip_single', options: ['as reported in session', 'as observed in session interactions', 'demonstrated through decreased conflict around identified issue'] },
    ],
    compositionOrder: ['boundary_type', 'evidence', 'metric_target', 'baseline_suffix', 'timeframe'],
  },
  {
    id: 'mft_behavior_reduction',
    discipline: 'MFT',
    category: 'Behavioral',
    label: 'Behavior Reduction',
    icon: '📉',
    verb: 'reduce frequency of',
    measurement_type: 'frequency',
    components: [
      { key: 'target_behavior', label: 'Target Behavior', type: 'text', placeholder: 'e.g., verbal outbursts, self-harm urges, substance use episodes' },
      { key: 'replacement_behavior', label: 'Replacement Behavior', type: 'text', placeholder: 'e.g., using coping skills, journaling, contacting support person' },
    ],
    compositionOrder: ['target_behavior', 'metric_target', 'replacement_behavior', 'baseline_suffix', 'timeframe'],
  },
  {
    id: 'mft_cognitive_restructuring',
    discipline: 'MFT',
    category: 'Self-Esteem',
    label: 'Cognitive Restructuring',
    icon: '🔄',
    verb: 'identify and challenge',
    measurement_type: 'severity',
    components: [
      { key: 'num_beliefs', label: 'Number of Beliefs', type: 'number', placeholder: '3' },
      { key: 'technique', label: 'Technique', type: 'chip_single', options: ['thought records', 'Socratic questioning', 'behavioral experiments', 'evidence examination'] },
      { key: 'evidence', label: 'Evidenced By', type: 'chip_single', options: ['demonstration in session', 'completed thought records between sessions', 'report of improved self-perception'] },
    ],
    compositionOrder: ['num_beliefs', 'technique', 'metric_target', 'evidence', 'baseline_suffix', 'timeframe'],
  },
  {
    id: 'mft_grief_processing',
    discipline: 'MFT',
    category: 'Grief',
    label: 'Grief Processing',
    icon: '🕯️',
    verb: 'process',
    measurement_type: 'severity',
    components: [
      { key: 'aspect', label: 'Aspect of Grief', type: 'text', placeholder: 'e.g., loss of spouse, death of parent, perinatal loss' },
      { key: 'evidence', label: 'Evidenced By', type: 'chip_single', options: ['decreased emotional distress in session', 'ability to discuss loss without overwhelming distress', 'engagement in meaning-making activities', 'development of continuing bond rituals'] },
    ],
    compositionOrder: ['aspect', 'evidence', 'metric_target', 'baseline_suffix', 'timeframe'],
  },
  {
    id: 'mft_safety_plan',
    discipline: 'MFT',
    category: 'Trauma',
    label: 'Safety Planning',
    icon: '🛡️',
    verb: 'develop and utilize',
    measurement_type: 'custom_text',
    components: [
      { key: 'components', label: 'Plan Components', type: 'chip_multi', options: ['trigger identification', 'coping strategies', 'safe contacts', 'environmental safety measures', 'crisis resources'] },
      { key: 'evidence', label: 'Evidenced By', type: 'chip_single', options: ['completion of written safety plan', 'demonstration of plan use in session', 'report of successful plan activation'] },
    ],
    compositionOrder: ['components', 'evidence', 'timeframe'],
  },
];

// ══════════════════════════════════════════════════════════════════════
// Custom / Write-Your-Own Pattern
// ══════════════════════════════════════════════════════════════════════

export const CUSTOM_PATTERN: GoalPattern = {
  id: 'custom_freeform',
  discipline: 'PT', // Overridden per use
  category: '',     // Overridden per use
  label: 'Write Custom Goal',
  icon: '✏️',
  verb: '',         // N/A
  measurement_type: 'custom_text', // Default; user can override
  components: [],   // No structured fields
  compositionOrder: [],
};

// ══════════════════════════════════════════════════════════════════════
// Exports & Helpers
// ══════════════════════════════════════════════════════════════════════

export const ALL_PATTERNS: GoalPattern[] = [
  ...ST_PATTERNS,
  ...PT_PATTERNS,
  ...OT_PATTERNS,
  ...MFT_PATTERNS,
];

/** Get all patterns for a discipline */
export function getPatternsForDiscipline(discipline: Discipline): GoalPattern[] {
  return ALL_PATTERNS.filter(p => p.discipline === discipline);
}

/** Get patterns for a specific discipline + category */
export function getPatternsForCategory(discipline: Discipline, category: string): GoalPattern[] {
  return ALL_PATTERNS.filter(p => p.discipline === discipline && p.category === category);
}

/** Look up a pattern by its unique ID */
export function getPatternById(id: string): GoalPattern | undefined {
  if (id === 'custom_freeform') return CUSTOM_PATTERN;
  return ALL_PATTERNS.find(p => p.id === id);
}

/** Get unique categories for a discipline (from patterns) */
export function getPatternCategories(discipline: Discipline): string[] {
  const cats = new Set(ALL_PATTERNS.filter(p => p.discipline === discipline).map(p => p.category));
  return [...cats].sort();
}
