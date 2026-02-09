import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation, useBlocker } from 'react-router-dom';
import { useSectionColor } from '../hooks/useSectionColor';
import {
  ArrowLeft,
  ClipboardList,
  Save,
  CheckCircle,
  Stethoscope,
  User,
  FileText,
  Target,
  CalendarDays,
  PenLine,
  Plus,
  X,
  Trash2,
  BookOpen,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { Client, Evaluation, Discipline, GoalType, EvalGoalEntry, GoalsBankEntry } from '../../shared/types';

import SignConfirmDialog from '../components/SignConfirmDialog';

// ── Types ──

interface PTObjectiveAssessment {
  rom: string;
  strength_mmt: string;
  posture: string;
  gait_analysis: string;
  balance: string;
  functional_mobility: string;
  pain_assessment: string;
}

interface OTObjectiveAssessment {
  adl_assessment: string;
  hand_function: string;
  cognition_screening: string;
  sensory: string;
  visual_perceptual: string;
  home_safety: string;
}

interface STObjectiveAssessment {
  speech_intelligibility: string;
  language_comprehension: string;
  language_expression: string;
  voice: string;
  fluency: string;
  swallowing_dysphagia: string;
  cognition_communication: string;
}

interface MFTObjectiveAssessment {
  presenting_problem: string;
  mental_status: string;
  risk_assessment: string;
  relationship_dynamics: string;
  functional_impairment: string;
  diagnostic_impressions: string;
}

type ObjectiveAssessment = PTObjectiveAssessment | OTObjectiveAssessment | STObjectiveAssessment | MFTObjectiveAssessment;

interface EvalContent {
  referral_source: string;
  medical_history: string;
  prior_level_of_function: string;
  current_complaints: string;
  objective_assessment: ObjectiveAssessment;
  clinical_impression: string;
  rehabilitation_potential: string;
  precautions: string;
  goals: string; // legacy free-text
  goal_entries?: EvalGoalEntry[]; // structured goals
  created_goal_ids?: number[]; // IDs of created Goal records
  treatment_plan: string;
  frequency_duration: string;
}

const CATEGORY_OPTIONS: Record<Discipline, string[]> = {
  PT: ['Mobility', 'Strength', 'Balance', 'ROM', 'Pain Management', 'Gait', 'Functional Activity', 'Endurance', 'Transfers', 'Posture'],
  OT: ['ADLs', 'Fine Motor', 'Visual Motor', 'Sensory Processing', 'Handwriting', 'Self-Care', 'Feeding', 'Upper Extremity', 'Cognitive', 'Play Skills'],
  ST: ['Articulation', 'Language Comprehension', 'Language Expression', 'Fluency', 'Voice', 'Pragmatics', 'Phonological Awareness', 'Feeding/Swallowing', 'AAC', 'Cognitive-Communication'],
  MFT: ['Depression', 'Anxiety', 'Trauma', 'Relationship', 'Family Systems', 'Coping Skills', 'Self-Esteem', 'Grief', 'Behavioral', 'Communication'],
};

// ── Treatment Plan Quick Chips by Discipline ──

const TREATMENT_PLAN_CHIPS: Record<Discipline, string[]> = {
  PT: [
    'Therapeutic exercise', 'Manual therapy', 'Neuromuscular re-education',
    'Gait training', 'Balance training', 'Modalities (e-stim, US, heat/cold)',
    'Functional mobility training', 'Patient/caregiver education',
    'Home exercise program', 'Aquatic therapy', 'Stretching/flexibility',
  ],
  OT: [
    'ADL training', 'Fine motor training', 'Therapeutic exercise',
    'Neuromuscular re-education', 'Sensory integration', 'Cognitive retraining',
    'Splinting/orthotics', 'Visual-motor training', 'Feeding therapy',
    'Home modification education', 'Adaptive equipment training',
  ],
  ST: [
    'Articulation therapy', 'Language intervention', 'Fluency shaping',
    'Voice therapy', 'Dysphagia management', 'Cognitive-communication training',
    'AAC training', 'Oral motor exercises', 'Pragmatic language training',
    'Phonological awareness', 'Parent/caregiver training',
  ],
  MFT: [
    'Individual psychotherapy', 'Couples therapy', 'Family therapy',
    'CBT techniques', 'DBT skills training', 'EMDR',
    'Play therapy', 'Art/expressive therapy', 'Crisis intervention',
    'Psychoeducation', 'Mindfulness/relaxation training',
  ],
};

// ── Helpers ──

function todayISO(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function emptyPTObjective(): PTObjectiveAssessment {
  return {
    rom: '',
    strength_mmt: '',
    posture: '',
    gait_analysis: '',
    balance: '',
    functional_mobility: '',
    pain_assessment: '',
  };
}

function emptyOTObjective(): OTObjectiveAssessment {
  return {
    adl_assessment: '',
    hand_function: '',
    cognition_screening: '',
    sensory: '',
    visual_perceptual: '',
    home_safety: '',
  };
}

function emptySTObjective(): STObjectiveAssessment {
  return {
    speech_intelligibility: '',
    language_comprehension: '',
    language_expression: '',
    voice: '',
    fluency: '',
    swallowing_dysphagia: '',
    cognition_communication: '',
  };
}

function emptyMFTObjective(): MFTObjectiveAssessment {
  return {
    presenting_problem: '',
    mental_status: '',
    risk_assessment: '',
    relationship_dynamics: '',
    functional_impairment: '',
    diagnostic_impressions: '',
  };
}

function emptyObjectiveForDiscipline(discipline: Discipline): ObjectiveAssessment {
  switch (discipline) {
    case 'PT': return emptyPTObjective();
    case 'OT': return emptyOTObjective();
    case 'ST': return emptySTObjective();
    case 'MFT': return emptyMFTObjective();
  }
}

function emptyContent(discipline: Discipline): EvalContent {
  return {
    referral_source: '',
    medical_history: '',
    prior_level_of_function: '',
    current_complaints: '',
    objective_assessment: emptyObjectiveForDiscipline(discipline),
    clinical_impression: '',
    rehabilitation_potential: '',
    precautions: '',
    goals: '',
    treatment_plan: '',
    frequency_duration: '',
  };
}

const PT_OBJECTIVE_FIELDS: Array<{ key: keyof PTObjectiveAssessment; label: string }> = [
  { key: 'rom', label: 'ROM' },
  { key: 'strength_mmt', label: 'Strength / MMT' },
  { key: 'posture', label: 'Posture' },
  { key: 'gait_analysis', label: 'Gait Analysis' },
  { key: 'balance', label: 'Balance' },
  { key: 'functional_mobility', label: 'Functional Mobility' },
  { key: 'pain_assessment', label: 'Pain Assessment' },
];

const OT_OBJECTIVE_FIELDS: Array<{ key: keyof OTObjectiveAssessment; label: string }> = [
  { key: 'adl_assessment', label: 'ADL Assessment' },
  { key: 'hand_function', label: 'Hand Function' },
  { key: 'cognition_screening', label: 'Cognition Screening' },
  { key: 'sensory', label: 'Sensory' },
  { key: 'visual_perceptual', label: 'Visual-Perceptual' },
  { key: 'home_safety', label: 'Home Safety' },
];

const ST_OBJECTIVE_FIELDS: Array<{ key: keyof STObjectiveAssessment; label: string }> = [
  { key: 'speech_intelligibility', label: 'Speech Intelligibility' },
  { key: 'language_comprehension', label: 'Language Comprehension' },
  { key: 'language_expression', label: 'Language Expression' },
  { key: 'voice', label: 'Voice' },
  { key: 'fluency', label: 'Fluency' },
  { key: 'swallowing_dysphagia', label: 'Swallowing / Dysphagia' },
  { key: 'cognition_communication', label: 'Cognition-Communication' },
];

const MFT_OBJECTIVE_FIELDS: Array<{ key: keyof MFTObjectiveAssessment; label: string }> = [
  { key: 'presenting_problem', label: 'Presenting Problem' },
  { key: 'mental_status', label: 'Mental Status Exam' },
  { key: 'risk_assessment', label: 'Risk Assessment (SI/HI/Abuse)' },
  { key: 'relationship_dynamics', label: 'Relationship / Family Dynamics' },
  { key: 'functional_impairment', label: 'Functional Impairment' },
  { key: 'diagnostic_impressions', label: 'Diagnostic Impressions' },
];

function getObjectiveFields(discipline: Discipline) {
  switch (discipline) {
    case 'PT': return PT_OBJECTIVE_FIELDS;
    case 'OT': return OT_OBJECTIVE_FIELDS;
    case 'ST': return ST_OBJECTIVE_FIELDS;
    case 'MFT': return MFT_OBJECTIVE_FIELDS;
  }
}

const DISCIPLINE_LABELS: Record<Discipline, string> = {
  PT: 'Physical Therapy',
  OT: 'Occupational Therapy',
  ST: 'Speech Therapy',
  MFT: 'Marriage & Family Therapy',
};

// ── Rehab Potential Section ──

const REHAB_RATINGS = ['Good', 'Fair', 'Poor'] as const;
type RehabRating = typeof REHAB_RATINGS[number];

const REHAB_REASON_CHIPS: string[] = [
  'patient demonstrates motivation',
  'family/caregiver support available',
  'prior functional level consistent with expected recovery',
  'good cognitive awareness',
  'active participation in treatment',
  'responds well to therapeutic interventions',
  'medical complexity limits progress',
  'limited support system',
  'cognitive deficits may slow progress',
  'multiple comorbidities present',
];

/** Build a proper narrative from rating + selected reasons */
function composeRehabNarrative(rating: RehabRating | null, reasons: string[]): string {
  if (!rating && reasons.length === 0) return '';
  if (!rating && reasons.length > 0) return reasons.join(', ') + '.';
  if (rating && reasons.length === 0) return `Rehabilitation potential is ${rating.toLowerCase()}.`;
  // rating + reasons
  if (reasons.length === 1) {
    return `Rehabilitation potential is ${rating!.toLowerCase()} due to ${reasons[0]}.`;
  }
  const allButLast = reasons.slice(0, -1).join(', ');
  const last = reasons[reasons.length - 1];
  return `Rehabilitation potential is ${rating!.toLowerCase()} due to ${allButLast}, and ${last}.`;
}

/** Parse active reasons from the current narrative text */
function parseActiveReasons(text: string): string[] {
  return REHAB_REASON_CHIPS.filter((r) => text.toLowerCase().includes(r.toLowerCase()));
}

function RehabPotentialSection({
  value,
  onChange,
}: {
  value: string;
  onChange: (val: string) => void;
}) {
  // Parse current rating from value
  const currentRating = REHAB_RATINGS.find((r) =>
    value.toLowerCase().includes(`potential is ${r.toLowerCase()}`)
  ) || null;

  const activeReasons = parseActiveReasons(value);

  const selectRating = (rating: RehabRating) => {
    if (currentRating === rating) {
      // Toggle off — rebuild with no rating
      onChange(composeRehabNarrative(null, activeReasons));
      return;
    }
    onChange(composeRehabNarrative(rating, activeReasons));
  };

  const toggleReasonChip = (reason: string) => {
    const isActive = activeReasons.some(r => r.toLowerCase() === reason.toLowerCase());
    let newReasons: string[];
    if (isActive) {
      newReasons = activeReasons.filter(r => r.toLowerCase() !== reason.toLowerCase());
    } else {
      newReasons = [...activeReasons, reason];
    }
    onChange(composeRehabNarrative(currentRating, newReasons));
  };

  const ratingColors: Record<RehabRating, { active: string; inactive: string }> = {
    Good: { active: 'bg-emerald-500 text-white border-emerald-500', inactive: 'bg-white text-emerald-700 border-emerald-300 hover:bg-emerald-50' },
    Fair: { active: 'bg-amber-500 text-white border-amber-500', inactive: 'bg-white text-amber-700 border-amber-300 hover:bg-amber-50' },
    Poor: { active: 'bg-red-500 text-white border-red-500', inactive: 'bg-white text-red-700 border-red-300 hover:bg-red-50' },
  };

  return (
    <div className="card p-6 mb-6">
      <h2 className="section-title">Rehabilitation Potential / Prognosis</h2>

      {/* Rating chips */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xs font-medium text-[var(--color-text-secondary)] mr-1">Rating:</span>
        {REHAB_RATINGS.map((rating) => {
          const isSelected = currentRating === rating;
          const colors = ratingColors[rating];
          return (
            <button
              key={rating}
              type="button"
              className={`px-4 py-1.5 rounded-full text-sm font-semibold border transition-colors ${
                isSelected ? colors.active : colors.inactive
              }`}
              onClick={() => selectRating(rating)}
            >
              {rating}
            </button>
          );
        })}
      </div>

      {/* Reason chips */}
      <div className="flex flex-wrap gap-1.5 mb-3">
        {REHAB_REASON_CHIPS.map((reason) => {
          const isActive = activeReasons.some(r => r.toLowerCase() === reason.toLowerCase());
          const displayLabel = reason.charAt(0).toUpperCase() + reason.slice(1);
          return (
            <button
              key={reason}
              type="button"
              className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border transition-colors cursor-pointer ${
                isActive
                  ? 'bg-violet-100 text-violet-700 border-violet-300'
                  : 'bg-gray-50 text-[var(--color-text-secondary)] border-[var(--color-border)] hover:bg-violet-50 hover:text-violet-600'
              }`}
              onClick={() => toggleReasonChip(reason)}
            >
              {displayLabel}
            </button>
          );
        })}
      </div>

      {/* Editable textarea */}
      <textarea
        className="textarea"
        rows={3}
        placeholder="Select a rating and reasons above, or type freely..."
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

// ── Component ──

export default function EvalFormPage() {
  const { id: clientId, evalId } = useParams<{ id: string; evalId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const sectionColor = useSectionColor();
  const isEditing = Boolean(evalId);

  // Reassessment mode via route state
  const isReassessment = Boolean((location.state as any)?.reassessment);
  const [evalType, setEvalType] = useState<'initial' | 'reassessment' | 'discharge'>(
    isReassessment ? 'reassessment' : 'initial'
  );
  const [priorFieldKeys, setPriorFieldKeys] = useState<Set<string>>(new Set());

  const [client, setClient] = useState<Client | null>(null);
  const [practiceInfo, setPracticeInfo] = useState<{ license_number?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [signDialogOpen, setSignDialogOpen] = useState(false);
  const [signDialogErrors, setSignDialogErrors] = useState<string[]>([]);
  const [signDialogWarnings, setSignDialogWarnings] = useState<string[]>([]);

  const [evalDate, setEvalDate] = useState(todayISO());
  const [content, setContent] = useState<EvalContent | null>(null);
  const [signatureImage, setSignatureImage] = useState('');
  const [signatureTyped, setSignatureTyped] = useState('');
  const [existingSignedAt, setExistingSignedAt] = useState('');
  const [goalEntries, setGoalEntries] = useState<EvalGoalEntry[]>([]);
  const [goalsAlreadyCreated, setGoalsAlreadyCreated] = useState(false);
  const [completedGoals, setCompletedGoals] = useState<{ id: number; goal_text: string; goal_type: string; status: string; met_date: string; category: string }[]>([]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Goal bank state
  const [goalsBankEntries, setGoalsBankEntries] = useState<GoalsBankEntry[]>([]);
  const [showGoalBank, setShowGoalBank] = useState<number | null>(null); // index of goal entry showing bank

  // Frequency & Duration state
  const [freqValue, setFreqValue] = useState<number>(0);
  const [durValue, setDurValue] = useState<number>(0);

  // Auto-save state
  const [savedEvalId, setSavedEvalId] = useState<number | null>(evalId ? parseInt(evalId, 10) : null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lastAutoSaved, setLastAutoSaved] = useState<string | null>(null);
  const isDirty = useRef(false); // true once user edits any field

  // ── Data Loading ──

  const loadData = useCallback(async () => {
    if (!clientId) return;
    try {
      setLoading(true);
      const cid = parseInt(clientId, 10);
      const [clientData, practiceData] = await Promise.all([
        window.api.clients.get(cid),
        window.api.practice.get().catch(() => null),
      ]);
      setClient(clientData);
      if (practiceData) setPracticeInfo(practiceData);

      const discipline = clientData.discipline as Discipline;

      // Load goals bank entries
      try {
        const bankEntries = await window.api.goalsBank.list({ discipline });
        setGoalsBankEntries(bankEntries);
      } catch (err) {
        console.error('Failed to load goals bank:', err);
      }

      if (evalId) {
        const evaluation = await window.api.evaluations.get(parseInt(evalId, 10));
        setEvalDate(evaluation.eval_date || todayISO());
        setSignatureImage(evaluation.signature_image || '');
        setSignatureTyped(evaluation.signature_typed || '');
        setExistingSignedAt(evaluation.signed_at || '');
        if ((evaluation as any).eval_type) {
          setEvalType((evaluation as any).eval_type);
        }
        try {
          const parsed = JSON.parse(evaluation.content || '{}') as Partial<EvalContent>;
          // Merge with empty content to fill in any missing keys
          const base = emptyContent(discipline);
          setContent({
            ...base,
            ...parsed,
            objective_assessment: {
              ...base.objective_assessment,
              ...(parsed.objective_assessment || {}),
            },
          });
          // Load structured goal entries if present
          let loadedEntries: EvalGoalEntry[] = [];
          let alreadyCreatedIds: number[] = [];
          if (parsed.goal_entries && Array.isArray(parsed.goal_entries)) {
            loadedEntries = parsed.goal_entries;
            if (parsed.created_goal_ids && parsed.created_goal_ids.length > 0) {
              alreadyCreatedIds = parsed.created_goal_ids;
              setGoalsAlreadyCreated(true);
            }
          }

          // Two-way sync: merge client goals into draft eval
          if (!evaluation.signed_at) {
            try {
              const clientGoals = await window.api.goals.listByClient(cid);
              const activeClientGoals = clientGoals.filter((g: any) => g.status === 'active');
              const metOrDcGoals = clientGoals.filter((g: any) => g.status === 'met' || g.status === 'discontinued');
              setCompletedGoals(metOrDcGoals.map((g: any) => ({ id: g.id, goal_text: g.goal_text, goal_type: g.goal_type, status: g.status, met_date: g.met_date || '', category: g.category || '' })));
              for (const cg of activeClientGoals) {
                // Skip goals already tracked by this eval
                if (alreadyCreatedIds.includes(cg.id)) continue;
                // Skip if goal text already present in entries
                const alreadyInEntries = loadedEntries.some(
                  (e) => e.goal_text.trim().toLowerCase() === (cg.goal_text || '').trim().toLowerCase()
                );
                if (alreadyInEntries) continue;
                // Add as a linked goal entry (from goals card)
                loadedEntries.push({
                  goal_text: cg.goal_text || '',
                  goal_type: cg.goal_type || 'STG',
                  category: cg.category || '',
                  target_date: cg.target_date || '',
                });
                alreadyCreatedIds.push(cg.id);
              }
              if (alreadyCreatedIds.length > 0) {
                setGoalsAlreadyCreated(true);
              }
            } catch (err) {
              console.error('Failed to merge client goals:', err);
            }
          }

          setGoalEntries(loadedEntries);
          // Update content with merged goal IDs
          if (alreadyCreatedIds.length > 0) {
            setContent(prev => prev ? { ...prev, created_goal_ids: alreadyCreatedIds } : prev);
          }

          // Parse frequency/duration
          if (parsed.frequency_duration) {
            const freqMatch = parsed.frequency_duration.match(/(\d+)x?\s*\/?\s*week/i);
            const durMatch = parsed.frequency_duration.match(/(\d+)\s*weeks/i);
            if (freqMatch) setFreqValue(parseInt(freqMatch[1], 10));
            if (durMatch) setDurValue(parseInt(durMatch[1], 10));
          }
        } catch {
          setContent(emptyContent(discipline));
        }
      } else if (isReassessment) {
        // ── Pre-populate from prior signed eval ──
        try {
          const prior = await window.api.evaluations.createReassessment(cid);
          if (prior && prior.priorContent) {
            const parsed = typeof prior.priorContent === 'string'
              ? JSON.parse(prior.priorContent) as Partial<EvalContent>
              : prior.priorContent as Partial<EvalContent>;
            const base = emptyContent(discipline);
            const prePopulated: EvalContent = {
              ...base,
              referral_source: parsed.referral_source || '',
              medical_history: parsed.medical_history || '',
              prior_level_of_function: '', // blank — user fills new CLOF
              current_complaints: '', // blank — user fills new complaints
              objective_assessment: base.objective_assessment, // blank — new objective needed
              clinical_impression: parsed.clinical_impression || '',
              rehabilitation_potential: parsed.rehabilitation_potential || '',
              precautions: parsed.precautions || '',
              goals: '',
              treatment_plan: parsed.treatment_plan || '',
              frequency_duration: parsed.frequency_duration || '',
            };
            setContent(prePopulated);

            // Track which fields were pre-populated for UPDATE badges
            const prefilled = new Set<string>();
            if (parsed.referral_source?.trim()) prefilled.add('referral_source');
            if (parsed.medical_history?.trim()) prefilled.add('medical_history');
            if (parsed.clinical_impression?.trim()) prefilled.add('clinical_impression');
            if (parsed.rehabilitation_potential?.trim()) prefilled.add('rehabilitation_potential');
            if (parsed.precautions?.trim()) prefilled.add('precautions');
            if (parsed.treatment_plan?.trim()) prefilled.add('treatment_plan');
            if (parsed.frequency_duration?.trim()) prefilled.add('frequency_duration');
            setPriorFieldKeys(prefilled);

            // Parse frequency/duration from prior
            if (parsed.frequency_duration) {
              const freqMatch = parsed.frequency_duration.match(/(\d+)x?\s*\/?\s*week/i);
              const durMatch = parsed.frequency_duration.match(/(\d+)\s*weeks/i);
              if (freqMatch) setFreqValue(parseInt(freqMatch[1], 10));
              if (durMatch) setDurValue(parseInt(durMatch[1], 10));
            }

            // Load met/completed goals for display
            try {
              const allClientGoals = await window.api.goals.listByClient(cid);
              const metOrDcGoals = allClientGoals.filter((g: any) => g.status === 'met' || g.status === 'discontinued');
              setCompletedGoals(metOrDcGoals.map((g: any) => ({ id: g.id, goal_text: g.goal_text, goal_type: g.goal_type, status: g.status, met_date: g.met_date || '', category: g.category || '' })));
            } catch { /* not critical */ }

            // Load active goals if present — link them to existing Goal records
            if (prior.activeGoals && Array.isArray(prior.activeGoals) && prior.activeGoals.length > 0) {
              const entries = prior.activeGoals.map((g: any) => ({
                goal_text: g.goal_text || '',
                goal_type: g.goal_type || 'STG',
                category: g.category || '',
                target_date: g.target_date || '',
              }));
              const linkedIds = prior.activeGoals.map((g: any) => g.id).filter(Boolean);
              setGoalEntries(entries);
              if (linkedIds.length > 0) {
                setContent(prev => prev ? { ...prev, created_goal_ids: linkedIds } : prev);
                setGoalsAlreadyCreated(true);
              }
            }

            isDirty.current = true; // Mark dirty so autosave persists pre-populated data
            setToast('Pre-populated from prior evaluation — review and update fields');
          } else {
            setContent(emptyContent(discipline));
            setToast('No prior signed evaluation found — starting fresh');
          }
        } catch (err) {
          console.error('Failed to load prior eval for reassessment:', err);
          setContent(emptyContent(discipline));
        }
        // Pre-fill signature from settings
        const [sigName, sigCreds, sigImage] = await Promise.all([
          window.api.settings.get('signature_name'),
          window.api.settings.get('signature_credentials'),
          window.api.settings.get('signature_image'),
        ]);
        const typed = [sigName, sigCreds].filter(Boolean).join(', ');
        setSignatureTyped(typed);
        if (sigImage) setSignatureImage(sigImage);
      } else {
        const newContent = emptyContent(discipline);
        setContent(newContent);

        // Load existing client goals into new eval
        try {
          const clientGoals = await window.api.goals.listByClient(cid);
          const activeClientGoals = clientGoals.filter((g: any) => g.status === 'active');
          const metOrDcGoals = clientGoals.filter((g: any) => g.status === 'met' || g.status === 'discontinued');
          setCompletedGoals(metOrDcGoals.map((g: any) => ({ id: g.id, goal_text: g.goal_text, goal_type: g.goal_type, status: g.status, met_date: g.met_date || '', category: g.category || '' })));
          if (activeClientGoals.length > 0) {
            const entries: EvalGoalEntry[] = activeClientGoals.map((cg: any) => ({
              goal_text: cg.goal_text || '',
              goal_type: cg.goal_type || 'STG',
              category: cg.category || '',
              target_date: cg.target_date || '',
            }));
            const linkedIds = activeClientGoals.map((cg: any) => cg.id);
            setGoalEntries(entries);
            setContent(prev => prev ? { ...prev, created_goal_ids: linkedIds } : prev);
            setGoalsAlreadyCreated(true);
          }
        } catch (err) {
          console.error('Failed to load client goals for new eval:', err);
        }

        // Pre-fill signature from settings
        const [sigName, sigCreds, sigImage] = await Promise.all([
          window.api.settings.get('signature_name'),
          window.api.settings.get('signature_credentials'),
          window.api.settings.get('signature_image'),
        ]);
        const typed = [sigName, sigCreds].filter(Boolean).join(', ');
        setSignatureTyped(typed);
        if (sigImage) setSignatureImage(sigImage);
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, [clientId, evalId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // ── Reload goals bank when category changes ──

  const loadGoalsBankForCategory = useCallback(async (category: string) => {
    if (!client) return;
    try {
      const filters: any = { discipline: client.discipline };
      if (category) filters.category = category;
      const entries = await window.api.goalsBank.list(filters);
      setGoalsBankEntries(entries);
    } catch (err) {
      console.error('Failed to load goals bank:', err);
    }
  }, [client]);

  // ── Auto-Save ──

  const performAutoSave = useCallback(async () => {
    if (!clientId || !client || !content || existingSignedAt) return;
    // Don't autosave until user has actually edited something
    if (!isDirty.current && !savedEvalId) return;

    try {
      const cid = parseInt(clientId, 10);

      // Sync goal records to the goals table on every autosave
      let updatedGoalIds: number[] = [...(content.created_goal_ids || [])];

      // Delete any orphaned goals (IDs beyond current goalEntries length)
      if (updatedGoalIds.length > goalEntries.length) {
        const orphanedIds = updatedGoalIds.slice(goalEntries.length);
        for (const oid of orphanedIds) {
          if (oid) {
            try { await window.api.goals.delete(oid); } catch (err) { console.error('Auto-save: failed to delete orphaned goal:', err); }
          }
        }
        updatedGoalIds = updatedGoalIds.slice(0, goalEntries.length);
      }

      for (let i = 0; i < goalEntries.length; i++) {
        const entry = goalEntries[i];
        if (!entry.goal_text.trim()) continue;
        const existingId = i < updatedGoalIds.length ? updatedGoalIds[i] : null;
        if (existingId) {
          try {
            await window.api.goals.update(existingId, {
              goal_text: entry.goal_text,
              goal_type: entry.goal_type,
              category: entry.category,
              target_date: entry.target_date,
              status: 'active',
              met_date: undefined,
            });
          } catch (err) {
            console.error('Auto-save: failed to update linked goal:', err);
          }
        } else {
          try {
            const goal = await window.api.goals.create({
              client_id: cid,
              goal_text: entry.goal_text,
              goal_type: entry.goal_type,
              category: entry.category,
              target_date: entry.target_date,
              status: 'active',
            });
            while (updatedGoalIds.length <= i) updatedGoalIds.push(0);
            updatedGoalIds[i] = goal.id;
          } catch (err) {
            console.error('Auto-save: failed to create goal:', err);
          }
        }
      }

      // Update content state with any newly created goal IDs
      if (JSON.stringify(updatedGoalIds) !== JSON.stringify(content.created_goal_ids || [])) {
        setContent(prev => prev ? { ...prev, created_goal_ids: updatedGoalIds } : prev);
      }

      const contentToSave = {
        ...content,
        goal_entries: goalEntries,
        created_goal_ids: updatedGoalIds,
      };

      const evalData: any = {
        client_id: cid,
        eval_date: evalDate,
        discipline: client.discipline,
        content: JSON.stringify(contentToSave),
        signature_image: '',
        signature_typed: '',
        signed_at: null,
        eval_type: evalType,
      };

      if (savedEvalId) {
        await window.api.evaluations.update(savedEvalId, evalData);
      } else {
        const created = await window.api.evaluations.create(evalData);
        if (created?.id) setSavedEvalId(created.id);
      }
      setLastAutoSaved(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Auto-save failed:', err);
    }
  }, [clientId, client, content, goalEntries, evalDate, savedEvalId, existingSignedAt, evalType]);

  // Debounced auto-save: triggers 3 seconds after any user change
  useEffect(() => {
    if (loading || !content || existingSignedAt) return;
    // Skip autosave until user has actually edited something
    if (!isDirty.current && !savedEvalId) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      performAutoSave();
    }, 3000);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [content, goalEntries, evalDate, performAutoSave, loading, existingSignedAt, savedEvalId]);

  // Keep a ref to the latest performAutoSave so useBlocker can call it
  const performAutoSaveRef = useRef(performAutoSave);
  performAutoSaveRef.current = performAutoSave;

  // Block navigation and auto-save before leaving
  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      isDirty.current && !existingSignedAt && currentLocation.pathname !== nextLocation.pathname
  );

  useEffect(() => {
    if (blocker.state === 'blocked') {
      // Save then proceed
      performAutoSaveRef.current().then(() => {
        blocker.proceed();
      }).catch(() => {
        blocker.proceed(); // proceed even if save fails
      });
    }
  }, [blocker]);

  // Save on window close (fire-and-forget, don't block close)
  useEffect(() => {
    const handler = () => {
      if (isDirty.current && !existingSignedAt) {
        performAutoSaveRef.current();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [content, goalEntries]);

  // ── Field update helpers ──

  const updateField = (field: keyof Omit<EvalContent, 'objective_assessment'>, value: string) => {
    isDirty.current = true;
    setContent((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const updateObjectiveField = (key: string, value: string) => {
    isDirty.current = true;
    setContent((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        objective_assessment: {
          ...prev.objective_assessment,
          [key]: value,
        },
      };
    });
  };

  // ── Frequency & Duration helpers ──

  const updateFreqDuration = (freq: number, dur: number) => {
    setFreqValue(freq);
    setDurValue(dur);
    if (freq > 0 && dur > 0) {
      updateField('frequency_duration', `${freq}x/week for ${dur} weeks`);
    } else if (freq > 0) {
      updateField('frequency_duration', `${freq}x/week`);
    } else if (dur > 0) {
      updateField('frequency_duration', `${dur} weeks`);
    }
  };

  // ── Treatment Plan chip insert ──

  const insertTreatmentChip = (chip: string) => {
    isDirty.current = true;
    setContent((prev) => {
      if (!prev) return prev;
      const current = prev.treatment_plan.trim();
      const separator = current ? '; ' : '';
      return { ...prev, treatment_plan: current + separator + chip };
    });
  };

  // ── Goal bank template insert ──

  const insertGoalFromBank = (template: string, category: string, goalIdx: number) => {
    isDirty.current = true;
    setGoalEntries(prev =>
      prev.map((g, i) => i === goalIdx ? { ...g, goal_text: template, category } : g)
    );
    setShowGoalBank(null);
  };

  // Wrapper to mark dirty when goal entries change inline
  const updateGoalEntries = (updater: React.SetStateAction<EvalGoalEntry[]>) => {
    isDirty.current = true;
    setGoalEntries(updater);
  };

  // ── Save ──

  /** Pre-sign validation for evaluations */
  const runSignValidation = (): { errors: string[]; warnings: string[] } => {
    const errors: string[] = [];
    const warnings: string[] = [];

    if (!content) {
      errors.push('Evaluation content is empty.');
      return { errors, warnings };
    }

    // Required fields that block signing
    if (goalEntries.length === 0 && !content.goals?.trim()) {
      errors.push('At least one goal is required before signing.');
    }

    // Check for unfilled template blanks in goals
    const hasUnfilledBlanks = goalEntries.some(g => g.goal_text.includes('___'));
    if (hasUnfilledBlanks) {
      errors.push('Some goals have unfilled template blanks (___). Please complete all goals before signing.');
    }

    // Non-blocking warnings
    if (!content.clinical_impression?.trim()) warnings.push('Clinical Impression is empty.');
    if (!content.frequency_duration?.trim()) warnings.push('Frequency & Duration is empty.');

    if (!signatureTyped.trim()) {
      warnings.push('Provider signature name is not set. Update it in Settings > Provider Information.');
    }
    if (!practiceInfo?.license_number?.trim()) {
      warnings.push('Provider license number is not set. Update it in Settings > Provider Information.');
    }

    return { errors, warnings };
  };

  const handleSignClick = () => {
    const { errors, warnings } = runSignValidation();
    setSignDialogErrors(errors);
    setSignDialogWarnings(warnings);
    setSignDialogOpen(true);
  };

  const handleSave = async (sign: boolean) => {
    if (!clientId || !client || !content) return;

    try {
      setSaving(true);
      const cid = parseInt(clientId, 10);

      // Sync Goal records: update existing linked goals, create new ones
      let createdGoalIds: number[] = [...(content.created_goal_ids || [])];

      // Delete any orphaned goals (IDs beyond current goalEntries length)
      if (createdGoalIds.length > goalEntries.length) {
        const orphanedIds = createdGoalIds.slice(goalEntries.length);
        for (const oid of orphanedIds) {
          if (oid) {
            try { await window.api.goals.delete(oid); } catch (err) { console.error('Failed to delete orphaned goal:', err); }
          }
        }
        createdGoalIds = createdGoalIds.slice(0, goalEntries.length);
      }

      for (let i = 0; i < goalEntries.length; i++) {
        const entry = goalEntries[i];
        if (!entry.goal_text.trim()) continue; // skip empty entries but keep index alignment
        const existingId = i < createdGoalIds.length ? createdGoalIds[i] : null;
        if (existingId) {
          // Update existing goal in the goals table
          try {
            await window.api.goals.update(existingId, {
              goal_text: entry.goal_text,
              goal_type: entry.goal_type,
              category: entry.category,
              target_date: entry.target_date,
              status: 'active',
              met_date: undefined,
            });
          } catch (err) {
            console.error('Failed to update linked goal:', err);
          }
        } else {
          // Create new goal
          const goal = await window.api.goals.create({
            client_id: cid,
            goal_text: entry.goal_text,
            goal_type: entry.goal_type,
            category: entry.category,
            target_date: entry.target_date,
            status: 'active',
          });
          // Ensure createdGoalIds array is long enough
          while (createdGoalIds.length <= i) createdGoalIds.push(0);
          createdGoalIds[i] = goal.id;
        }
      }

      // Store goal_entries and created_goal_ids in content
      const contentToSave = {
        ...content,
        goal_entries: goalEntries,
        created_goal_ids: createdGoalIds,
      };

      const evalData: any = {
        client_id: cid,
        eval_date: evalDate,
        discipline: client.discipline,
        content: JSON.stringify(contentToSave),
        signature_image: sign ? signatureImage : '',
        signature_typed: sign ? signatureTyped : '',
        signed_at: sign ? new Date().toISOString() : null,
        eval_type: evalType,
      };

      if (savedEvalId) {
        await window.api.evaluations.update(savedEvalId, evalData);
      } else {
        const created = await window.api.evaluations.create(evalData);
        if (created?.id) setSavedEvalId(created.id);
      }

      setToast(sign ? 'Evaluation signed and saved' : 'Draft saved');
      setTimeout(() => navigate(`/clients/${clientId}`), 500);
    } catch (err) {
      console.error('Failed to save evaluation:', err);
      setToast('Failed to save evaluation. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmingDelete) {
      setConfirmingDelete(true);
      setTimeout(() => setConfirmingDelete(false), 3000);
      return;
    }
    const idToDelete = savedEvalId || (evalId ? parseInt(evalId, 10) : null);
    if (!idToDelete) return;
    try {
      await window.api.evaluations.delete(idToDelete);
      setToast('Evaluation deleted');
      setTimeout(() => navigate(`/clients/${clientId}`), 500);
    } catch (err) {
      console.error('Failed to delete evaluation:', err);
      setToast('Failed to delete evaluation.');
    }
  };

  // ── Render ──

  if (loading || !content) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-[var(--color-text-secondary)]">Loading...</div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-[var(--color-text-secondary)]">Client not found</div>
      </div>
    );
  }

  const discipline = client.discipline as Discipline;
  const objectiveFields = getObjectiveFields(discipline);

  // Filter bank entries for the currently active goal category
  const getFilteredBankEntries = (category: string): GoalsBankEntry[] => {
    if (!category) return goalsBankEntries;
    return goalsBankEntries.filter(e =>
      e.category?.toLowerCase() === category.toLowerCase()
    );
  };

  return (
    <div className="overflow-y-auto h-full p-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-emerald-600 text-white px-4 py-3 rounded-lg shadow-lg">
          <CheckCircle className="w-4 h-4" />
          <span className="text-sm font-medium">{toast}</span>
        </div>
      )}

      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6 bg-violet-50/60 -mx-6 -mt-6 px-6 pt-6 pb-4 rounded-t-lg border-b-2 border-violet-200">
          <div className="flex items-center gap-3">
            <button
              className="btn-ghost p-2"
              onClick={async () => {
                if (!existingSignedAt && isDirty.current) {
                  await performAutoSave();
                }
                navigate(`/clients/${clientId}`);
              }}
              title="Back to client"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="page-title flex items-center gap-2">
                <ClipboardList className="w-6 h-6" style={{ color: sectionColor.color }} />
                {isEditing ? 'Edit Evaluation' : evalType === 'reassessment' ? 'Reassessment / Updated Plan of Care' : 'New Evaluation'}
                {evalType === 'reassessment' && (
                  <span className="ml-2 px-2 py-0.5 rounded text-xs font-bold bg-blue-100 text-blue-700">
                    UPDATE
                  </span>
                )}
              </h1>
              <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                <span className="text-sm font-medium text-[var(--color-text)]">
                  {client.first_name} {client.last_name}
                </span>
                {client.discipline && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-teal-50 text-teal-600 font-semibold">{client.discipline}</span>
                )}
                {(client.primary_dx_code || client.primary_dx_description) && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-violet-50 text-violet-600 font-medium">
                    {[client.primary_dx_code, client.primary_dx_description].filter(Boolean).join(' — ')}
                  </span>
                )}
                {content?.frequency_duration?.trim() && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">{content.frequency_duration}</span>
                )}
                {content?.treatment_plan?.trim() && (
                  <span className="text-[10px] text-[var(--color-text-tertiary)] truncate max-w-xs" title={content.treatment_plan}>
                    Tx: {content.treatment_plan.length > 50 ? content.treatment_plan.slice(0, 50) + '…' : content.treatment_plan}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {lastAutoSaved && (
              <span className="text-xs text-[var(--color-text-secondary)]">
                Auto-saved {lastAutoSaved}
              </span>
            )}
            <span className={`badge badge-${discipline.toLowerCase()}`}>
              {DISCIPLINE_LABELS[discipline]}
            </span>
          </div>
        </div>

        {/* Eval Date */}
        <div className="card p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <CalendarDays className="w-5 h-5 text-[var(--color-primary)]" />
            <h2 className="section-title mb-0">Evaluation Date</h2>
          </div>
          <div className="max-w-xs">
            <input
              type="date"
              className="input"
              value={evalDate}
              onChange={(e) => { isDirty.current = true; setEvalDate(e.target.value); }}
            />
          </div>
        </div>

        {/* Referral Source */}
        <div className="card p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <User className="w-5 h-5 text-[var(--color-primary)]" />
            <h2 className="section-title mb-0">Referral Source</h2>
          </div>
          <input
            type="text"
            className="input"
            placeholder="Referring physician, self-referral, etc."
            value={content.referral_source}
            onChange={(e) => updateField('referral_source', e.target.value)}
          />
        </div>

        {/* Medical History */}
        <div className="card p-6 mb-6">
          <div className="flex items-center gap-2">
            <h2 className="section-title">Medical History</h2>
            {priorFieldKeys.has('medical_history') && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700 mb-2">
                UPDATE
              </span>
            )}
          </div>
          <textarea
            className="textarea"
            rows={4}
            placeholder="Pertinent medical history, surgical history, medications..."
            value={content.medical_history}
            onChange={(e) => updateField('medical_history', e.target.value)}
          />
        </div>

        {/* Prior / Current Level of Function */}
        <div className="card p-6 mb-6">
          <h2 className="section-title">
            {evalType === 'reassessment' ? 'Current Level of Function' : 'Prior Level of Function'}
          </h2>
          <textarea
            className="textarea"
            rows={3}
            placeholder={evalType === 'reassessment'
              ? "Patient's current functional status at time of reassessment..."
              : "Patient's functional status prior to current condition..."
            }
            value={content.prior_level_of_function}
            onChange={(e) => updateField('prior_level_of_function', e.target.value)}
          />
        </div>

        {/* Current Complaints */}
        <div className="card p-6 mb-6">
          <h2 className="section-title">Current Complaints</h2>
          <textarea
            className="textarea"
            rows={3}
            placeholder="Chief complaint, onset, mechanism of injury, current symptoms..."
            value={content.current_complaints}
            onChange={(e) => updateField('current_complaints', e.target.value)}
          />
        </div>

        {/* Objective Assessment - discipline-specific */}
        <div className="card p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Stethoscope className="w-5 h-5 text-[var(--color-primary)]" />
            <h2 className="section-title mb-0">Objective Assessment</h2>
            <span className={`badge badge-${discipline.toLowerCase()} ml-2`}>
              {discipline}
            </span>
          </div>
          <div className="space-y-4">
            {objectiveFields.map((field) => (
              <div key={field.key}>
                <label className="label">{field.label}</label>
                <textarea
                  className="textarea"
                  rows={3}
                  placeholder={`Enter ${field.label.toLowerCase()} findings...`}
                  value={(content.objective_assessment as unknown as Record<string, string>)[field.key] || ''}
                  onChange={(e) => updateObjectiveField(field.key, e.target.value)}
                />
              </div>
            ))}
          </div>
        </div>

        {/* Clinical Impression */}
        <div className="card p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <FileText className="w-5 h-5 text-[var(--color-primary)]" />
            <h2 className="section-title mb-0">Clinical Impression</h2>
            {priorFieldKeys.has('clinical_impression') && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">
                UPDATE
              </span>
            )}
          </div>
          <textarea
            className="textarea"
            rows={4}
            placeholder="Clinical impression, diagnosis, prognosis, justification for skilled services..."
            value={content.clinical_impression}
            onChange={(e) => updateField('clinical_impression', e.target.value)}
          />
        </div>

        {/* Rehabilitation Potential / Prognosis */}
        <RehabPotentialSection
          value={content.rehabilitation_potential}
          onChange={(val) => updateField('rehabilitation_potential', val)}
        />

        {/* Precautions / Contraindications */}
        <div className="card p-6 mb-6">
          <h2 className="section-title">Precautions / Contraindications</h2>
          <textarea
            className="textarea"
            rows={3}
            placeholder="Fall risk, weight-bearing restrictions, cardiac precautions, aspiration risk, swallowing precautions, behavioral considerations..."
            value={content.precautions}
            onChange={(e) => updateField('precautions', e.target.value)}
          />
        </div>

        {/* Goals */}
        <div className="card p-6 mb-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Target className="w-5 h-5 text-[var(--color-primary)]" />
              <h2 className="section-title mb-0">Goals</h2>
            </div>
            {!existingSignedAt && (
              <button
                type="button"
                className="btn-ghost btn-sm gap-1 text-xs"
                onClick={() =>
                  updateGoalEntries(prev => [
                    ...prev,
                    { goal_text: '', goal_type: 'STG' as GoalType, category: (CATEGORY_OPTIONS[discipline] || [])[0] || '', target_date: '' },
                  ])
                }
              >
                <Plus size={14} />
                Add Goal
              </button>
            )}
          </div>

          {/* Legacy free-text goals (backward compat) */}
          {content.goals && goalEntries.length === 0 && !goalsAlreadyCreated && (
            <div className="mb-4">
              <p className="text-xs text-[var(--color-text-secondary)] mb-1">Legacy goals text:</p>
              <textarea
                className="textarea"
                rows={3}
                value={content.goals}
                onChange={(e) => updateField('goals', e.target.value)}
              />
            </div>
          )}

          {/* Structured goal entries */}
          {goalEntries.length === 0 && !content.goals ? (
            <div className="text-center py-6">
              <Target className="w-8 h-8 text-gray-300 mx-auto mb-2" />
              <p className="text-sm text-[var(--color-text-secondary)]">
                No goals added yet. Click "Add Goal" to create structured goals.
              </p>
              <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                Goals will be automatically added to the client's Goals tab on save.
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {goalEntries.map((entry, idx) => {
                const bankForCategory = getFilteredBankEntries(entry.category);
                const showBank = showGoalBank === idx;
                const isLinked = Boolean((content.created_goal_ids || [])[idx]);
                return (
                <div key={idx} className={`p-4 rounded-lg border ${isLinked ? 'bg-blue-50/40 border-blue-200' : 'bg-gray-50 border-[var(--color-border)]'}`}>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase">
                        Goal {idx + 1}
                      </span>
                      {isLinked && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-medium bg-blue-100 text-blue-600">
                          Synced
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
                          showBank ? 'bg-violet-100 text-violet-700' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] hover:bg-violet-50'
                        }`}
                        onClick={() => {
                          if (showBank) {
                            setShowGoalBank(null);
                          } else {
                            loadGoalsBankForCategory(entry.category);
                            setShowGoalBank(idx);
                          }
                        }}
                        title="Browse goals bank"
                      >
                        <BookOpen size={12} />
                        Goal Bank
                      </button>
                      <button
                        type="button"
                        className="p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                        onClick={async () => {
                          // Delete the linked goal from the database if it exists
                          const goalId = (content?.created_goal_ids || [])[idx];
                          if (goalId) {
                            try {
                              await window.api.goals.delete(goalId);
                            } catch (err) {
                              console.error('Failed to delete linked goal:', err);
                            }
                          }
                          // Remove the linked ID at this index
                          setContent(prev => {
                            if (!prev) return prev;
                            const ids = [...(prev.created_goal_ids || [])];
                            ids.splice(idx, 1);
                            return { ...prev, created_goal_ids: ids };
                          });
                          updateGoalEntries(prev => prev.filter((_, i) => i !== idx));
                        }}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Goal Bank Dropdown */}
                  {showBank && (
                    <div className="mb-3 p-3 bg-violet-50 rounded-lg border border-violet-200 max-h-48 overflow-y-auto">
                      <p className="text-xs font-semibold text-violet-700 mb-2">
                        {entry.category ? `${entry.category} Templates` : 'All Templates'} ({bankForCategory.length})
                      </p>
                      {bankForCategory.length === 0 ? (
                        <p className="text-xs text-[var(--color-text-secondary)] italic">
                          No templates found for this category. Try selecting a different category.
                        </p>
                      ) : (
                        <div className="space-y-1">
                          {bankForCategory.map((bankEntry) => (
                            <button
                              key={bankEntry.id}
                              type="button"
                              className="w-full text-left p-2 rounded text-xs text-[var(--color-text)] hover:bg-violet-100 transition-colors leading-snug"
                              onClick={() => insertGoalFromBank(bankEntry.goal_template, bankEntry.category, idx)}
                            >
                              {bankEntry.goal_template}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div>
                      <label className="label text-xs">Type</label>
                      <select
                        className="select text-sm"
                        value={entry.goal_type}
                        onChange={(e) =>
                          updateGoalEntries(prev =>
                            prev.map((g, i) => i === idx ? { ...g, goal_type: e.target.value as GoalType } : g)
                          )
                        }
                      >
                        <option value="STG">STG</option>
                        <option value="LTG">LTG</option>
                      </select>
                    </div>
                    <div>
                      <label className="label text-xs">Category</label>
                      <select
                        className="select text-sm"
                        value={entry.category}
                        onChange={(e) => {
                          const newCat = e.target.value;
                          updateGoalEntries(prev =>
                            prev.map((g, i) => i === idx ? { ...g, category: newCat } : g)
                          );
                          // Reload bank for new category
                          if (showGoalBank === idx) {
                            loadGoalsBankForCategory(newCat);
                          }
                        }}
                      >
                        <option value="">Select</option>
                        {(CATEGORY_OPTIONS[discipline] || []).map(cat => (
                          <option key={cat} value={cat}>{cat}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="label text-xs">Target Date</label>
                      <input
                        type="date"
                        className="input text-sm"
                        value={entry.target_date}
                        onChange={(e) =>
                          updateGoalEntries(prev =>
                            prev.map((g, i) => i === idx ? { ...g, target_date: e.target.value } : g)
                          )
                        }
                      />
                    </div>
                  </div>
                  <div>
                    <label className="label text-xs">Goal Text</label>
                    <textarea
                      className="textarea text-sm"
                      rows={2}
                      placeholder="Enter goal text or select from Goal Bank above..."
                      value={entry.goal_text}
                      onChange={(e) =>
                        updateGoalEntries(prev =>
                          prev.map((g, i) => i === idx ? { ...g, goal_text: e.target.value } : g)
                        )
                      }
                    />
                  </div>
                </div>
                );
              })}
            </div>
          )}

          {goalEntries.length > 0 && (() => {
            const linkedCount = (content.created_goal_ids || []).filter(Boolean).length;
            const newCount = goalEntries.length - linkedCount;
            return (
              <div className="mt-3 p-2 bg-blue-50 rounded-lg space-y-1">
                {linkedCount > 0 && (
                  <p className="text-xs text-blue-700">
                    {linkedCount} goal{linkedCount > 1 ? 's' : ''} synced with the client's Goals tab. Edits here will update the Goals tab on save.
                  </p>
                )}
                {newCount > 0 && (
                  <p className="text-xs text-amber-700">
                    {newCount} new goal{newCount > 1 ? 's' : ''} will be added to the Goals tab when you save.
                  </p>
                )}
              </div>
            );
          })()}
        </div>

        {/* Goals Met / Completed */}
        {completedGoals.length > 0 && (
          <div className="card p-5 mb-6 bg-green-50/30 border-l-4 border-l-green-400">
            <h2 className="text-base font-semibold text-[var(--color-text)] mb-3 flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-500" />
              Goals Met / Completed
              <span className="text-xs font-normal text-[var(--color-text-secondary)]">({completedGoals.length})</span>
            </h2>
            <div className="space-y-1.5">
              {completedGoals.map((goal) => (
                <div key={goal.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/60 border border-green-100">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                    goal.status === 'met' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {goal.status === 'met' ? '✓ Met' : "DC'd"}
                  </span>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${goal.goal_type === 'STG' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
                    {goal.goal_type}
                  </span>
                  <span className="text-xs text-[var(--color-text-secondary)] flex-1">{goal.goal_text}</span>
                  {goal.met_date && <span className="text-[10px] text-green-600 font-medium">{goal.met_date}</span>}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Treatment Plan */}
        <div className="card p-6 mb-6">
          <div className="flex items-center gap-2">
            <h2 className="section-title">Treatment Plan</h2>
            {priorFieldKeys.has('treatment_plan') && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700 mb-2">
                UPDATE
              </span>
            )}
          </div>
          {/* Quick chips for treatment plan */}
          <div className="flex flex-wrap gap-1.5 mb-3">
            {(TREATMENT_PLAN_CHIPS[discipline] || []).map((chip) => (
              <button
                key={chip}
                type="button"
                className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium
                  bg-teal-50 text-teal-700 border border-teal-200
                  hover:bg-teal-100 active:bg-teal-200
                  transition-colors cursor-pointer"
                onClick={() => insertTreatmentChip(chip)}
              >
                {chip}
              </button>
            ))}
          </div>
          <textarea
            className="textarea"
            rows={4}
            placeholder="Planned interventions, modalities, techniques... (click chips above to add)"
            value={content.treatment_plan}
            onChange={(e) => updateField('treatment_plan', e.target.value)}
          />
        </div>

        {/* Frequency & Duration */}
        <div className="card p-6 mb-6">
          <div className="flex items-center gap-2">
            <h2 className="section-title">Frequency & Duration</h2>
            {priorFieldKeys.has('frequency_duration') && (
              <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700 mb-2">
                UPDATE
              </span>
            )}
          </div>

          {/* Frequency quick taps */}
          <div className="mb-4">
            <label className="label text-xs mb-2">Frequency (times/week)</label>
            <div className="flex items-center gap-2">
              {[1, 2, 3].map((f) => (
                <button
                  key={f}
                  type="button"
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors border ${
                    freqValue === f
                      ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                      : 'bg-white text-[var(--color-text)] border-[var(--color-border)] hover:bg-gray-50'
                  }`}
                  onClick={() => updateFreqDuration(f, durValue)}
                >
                  {f}x
                </button>
              ))}
              <div className="flex items-center gap-1 ml-2">
                <input
                  type="number"
                  className="input w-16 text-sm text-center"
                  placeholder="Other"
                  min={1}
                  max={7}
                  value={freqValue > 3 ? freqValue : ''}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10) || 0;
                    updateFreqDuration(v, durValue);
                  }}
                />
                <span className="text-xs text-[var(--color-text-secondary)]">x/wk</span>
              </div>
            </div>
          </div>

          {/* Duration quick taps */}
          <div className="mb-4">
            <label className="label text-xs mb-2">Duration (weeks)</label>
            <div className="flex items-center gap-2">
              {[4, 8, 12].map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`px-4 py-2 rounded-lg text-sm font-semibold transition-colors border ${
                    durValue === d
                      ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                      : 'bg-white text-[var(--color-text)] border-[var(--color-border)] hover:bg-gray-50'
                  }`}
                  onClick={() => updateFreqDuration(freqValue, d)}
                >
                  {d} wks
                </button>
              ))}
              <div className="flex items-center gap-1 ml-2">
                <input
                  type="number"
                  className="input w-16 text-sm text-center"
                  placeholder="Other"
                  min={1}
                  max={52}
                  value={![4, 8, 12].includes(durValue) && durValue > 0 ? durValue : ''}
                  onChange={(e) => {
                    const v = parseInt(e.target.value, 10) || 0;
                    updateFreqDuration(freqValue, v);
                  }}
                />
                <span className="text-xs text-[var(--color-text-secondary)]">wks</span>
              </div>
            </div>
          </div>

          {/* Editable summary */}
          <input
            type="text"
            className="input"
            placeholder="e.g., 2x/week for 8 weeks"
            value={content.frequency_duration}
            onChange={(e) => updateField('frequency_duration', e.target.value)}
          />
        </div>

        {/* Signature */}
        <div className="card p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <PenLine className="w-5 h-5 text-[var(--color-primary)]" />
            <h2 className="section-title mb-0">Signature</h2>
          </div>

          {/* Typed Signature */}
          <div className="mb-4">
            <label className="label">Typed Signature</label>
            <input
              type="text"
              className="input"
              placeholder="e.g. Jane Smith, PT, DPT"
              value={signatureTyped}
              onChange={(e) => setSignatureTyped(e.target.value)}
              disabled={Boolean(existingSignedAt)}
            />
          </div>

          {/* Drawn Signature */}
          <div>
            <label className="label">Drawn Signature</label>
            {signatureImage ? (
              <div className="border-2 border-gray-200 rounded-lg overflow-hidden bg-white p-2">
                <img
                  src={signatureImage}
                  alt="Provider signature"
                  className="w-full max-h-[150px] object-contain"
                />
              </div>
            ) : (
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center">
                <p className="text-sm text-[var(--color-text-secondary)]">
                  No signature configured. Add one in Settings &gt; Signature.
                </p>
              </div>
            )}
          </div>

          {existingSignedAt && (
            <div className="mt-3 p-2 bg-emerald-50 rounded-lg">
              <p className="text-xs text-emerald-700 font-medium">
                Signed on {new Date(existingSignedAt).toLocaleString()}
              </p>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-between pb-8">
          <div>
            {(isEditing || savedEvalId) && !existingSignedAt && (
              <button
                className={`flex items-center gap-2 text-sm font-medium px-3 py-2 rounded-lg transition-colors ${
                  confirmingDelete
                    ? 'bg-red-600 text-white hover:bg-red-700'
                    : 'text-red-600 hover:bg-red-50'
                }`}
                onClick={handleDelete}
                disabled={saving}
              >
                <Trash2 className="w-4 h-4" />
                {confirmingDelete ? 'Click again to confirm' : 'Delete Evaluation'}
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
          <button
            className="btn-ghost"
            onClick={() => navigate(`/clients/${clientId}`)}
            disabled={saving}
          >
            Cancel
          </button>
          <button
            className="btn-primary flex items-center gap-2"
            onClick={() => handleSave(false)}
            disabled={saving}
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Draft'}
          </button>
          <button
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border-2 border-amber-500 text-amber-700 bg-white hover:bg-amber-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            onClick={handleSignClick}
            disabled={saving || Boolean(existingSignedAt)}
          >
            <CheckCircle className="w-4 h-4" />
            {saving ? 'Saving...' : 'Sign & Finalize'}
          </button>
          </div>
        </div>
      </div>

      {/* Sign Confirmation Dialog */}
      <SignConfirmDialog
        isOpen={signDialogOpen}
        onClose={() => setSignDialogOpen(false)}
        onConfirm={() => {
          setSignDialogOpen(false);
          handleSave(true);
        }}
        errors={signDialogErrors}
        warnings={signDialogWarnings}
      />
    </div>
  );
}
