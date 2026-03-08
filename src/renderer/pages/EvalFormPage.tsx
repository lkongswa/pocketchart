import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useParams, useNavigate, useLocation, useBlocker, useSearchParams } from 'react-router-dom';
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
  Receipt,
  AlertTriangle,
} from 'lucide-react';
import type { Client, Evaluation, Discipline, GoalType, EvalGoalEntry, CptLine, PlaceOfService, SOAPSection, MeasurementType, PatternOverride, Physician } from '../../shared/types';
import FaxPrompt from '../components/FaxPrompt';
import { composeGoalText as sharedComposeGoalText, isAutoComposedGoalText, metricValueToNumeric } from '../../shared/compose-goal-text';
import type { GoalPattern } from '../../shared/goal-patterns';
import { getPatternById, applyOverrides, customPatternToGoalPattern } from '../../shared/goal-patterns';
import type { CustomPattern } from '../../shared/types';
import type { GoalProgressEntry } from '../../shared/types';
import { CATEGORY_DEFAULT_MEASUREMENT, DEFAULT_INSTRUMENTS } from '../../shared/goal-metrics';
import { evalEntryToCardData, generateGoalFingerprint } from '../../shared/goal-card-data';
import CollapsedGoalCard from '../components/CollapsedGoalCard';
import ExpandedGoalCard from '../components/ExpandedGoalCard';
import type { ValidationIssue, ValidationFixes } from '../../shared/types/validation';

import SignConfirmDialog from '../components/SignConfirmDialog';
import EvalSectionWrapper from '../components/EvalSectionWrapper';
import EvalOutlineNav from '../components/EvalOutlineNav';
import CptCombobox from '../components/CptCombobox';
import { validateEightMinuteRule, appliesTo as eightMinRuleApplies, formatIndicatorSummary, calculateTreatmentMinutes } from '../../shared/eightMinuteRule';
import { checkDisciplineCptMismatch, formatMismatchWarning } from '../../shared/cptDisciplineMap';
import SmartTextarea from '../components/SmartTextarea';
import PhysicianCombobox from '../components/PhysicianCombobox';
import QuickChips from '../components/QuickChips';
import NoteBankPopover from '../components/NoteBankPopover';
import { useEvalSections } from '../hooks/useEvalSections';

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

interface SessionNoteData {
  date_of_service: string;
  time_in: string;
  time_out: string;
  cpt_codes: CptLine[];
  cpt_modifiers?: string[];
  place_of_service: string;
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
}

interface EvalContent {
  referral_source: string;
  referral_physician_id?: number | null;
  referral_physician_npi?: string;
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
  carried_over_count?: number; // Number of goals carried from prior eval
  treatment_plan: string;
  frequency_duration: string;
  session_note?: SessionNoteData;
  enabled_objective_fields?: string[];
}

const CATEGORY_OPTIONS: Record<Discipline, string[]> = {
  PT: ['Mobility', 'Strength', 'Balance', 'ROM', 'Pain Management', 'Gait', 'Functional Activity', 'Endurance', 'Transfers', 'Posture', 'Gross Motor Development', 'Coordination'],
  OT: ['ADLs', 'Fine Motor', 'Visual Motor', 'Sensory Processing', 'Handwriting', 'Self-Care', 'Feeding', 'Upper Extremity', 'Cognitive', 'Play Skills', 'Self-Regulation'],
  ST: ['Articulation', 'Language Comprehension', 'Language Expression', 'Early Language', 'Fluency', 'Voice', 'Pragmatics', 'Social Communication', 'Phonological Awareness', 'Feeding/Swallowing', 'AAC', 'Cognitive-Communication', 'Literacy'],
  MFT: ['Depression', 'Anxiety', 'Trauma', 'Relationship', 'Family Systems', 'Coping Skills', 'Self-Esteem', 'Grief', 'Behavioral', 'Communication'],
};

// ── Treatment Plan Quick Chips by Discipline ──

const TREATMENT_PLAN_CHIPS: Record<Discipline, string[]> = {
  PT: [
    'Therapeutic exercise', 'Manual therapy', 'Neuromuscular re-education',
    'Gait training', 'Balance training', 'Modalities (e-stim, US, heat/cold)',
    'Functional mobility training', 'Patient/caregiver education',
    'Home exercise program', 'Aquatic therapy', 'Stretching/flexibility',
    'Gross motor training', 'Developmental positioning',
    'NDT/neurodevelopmental treatment', 'Play-based gross motor intervention',
    'Orthotics/bracing education', 'Coordination/ball skills training',
  ],
  OT: [
    'ADL training', 'Fine motor training', 'Therapeutic exercise',
    'Neuromuscular re-education', 'Sensory integration', 'Cognitive retraining',
    'Splinting/orthotics', 'Visual-motor training', 'Feeding therapy',
    'Home modification education', 'Adaptive equipment training',
    'Handwriting intervention', 'Sensory diet implementation',
    'Self-regulation training', 'Play-based intervention',
    'School-based accommodations', 'Caregiver/teacher training',
  ],
  ST: [
    'Articulation therapy', 'Language intervention', 'Fluency shaping',
    'Voice therapy', 'Dysphagia management', 'Cognitive-communication training',
    'AAC training', 'Aided language stimulation', 'Core vocabulary instruction',
    'Oral motor exercises', 'Pragmatic language training',
    'Phonological awareness training', 'Parent/caregiver training',
    'Play-based intervention', 'Naturalistic intervention',
    'Narrative intervention', 'Social skills training',
    'Literacy intervention', 'Feeding therapy (SOS/food chaining)',
    'Communication partner training', 'Sensory-motor speech approach',
  ],
  MFT: [
    'Individual psychotherapy', 'Couples therapy', 'Family therapy',
    'CBT techniques', 'DBT skills training', 'EMDR',
    'Play therapy', 'Art/expressive therapy', 'Crisis intervention',
    'Psychoeducation', 'Mindfulness/relaxation training',
  ],
};

const PLACE_OF_SERVICE_OPTIONS = [
  { value: '11', label: 'Office' },
  { value: '12', label: 'Home' },
  { value: '02', label: 'Telehealth' },
  { value: '10', label: 'Telehealth (Patient Home)' },
  { value: '22', label: 'Outpatient Hospital' },
  { value: '31', label: 'Skilled Nursing Facility' },
];

const EMPTY_SESSION_NOTE: SessionNoteData = {
  date_of_service: '',
  time_in: '',
  time_out: '',
  cpt_codes: [{ code: '', units: 1 }],
  place_of_service: '11',
  subjective: '',
  objective: '',
  assessment: '',
  plan: '',
};

const MODIFIER_OPTIONS = [
  { value: 'GN', label: 'GN - Speech-Language Pathology', tooltip: 'Services delivered under a speech-language pathology plan of care.' },
  { value: 'GO', label: 'GO - Occupational Therapy', tooltip: 'Services delivered under an occupational therapy plan of care.' },
  { value: 'GP', label: 'GP - Physical Therapy', tooltip: 'Services delivered under a physical therapy plan of care.' },
  { value: '59', label: '59 - Distinct Procedural Service', tooltip: 'Procedure/service distinct from other services on the same day.' },
  { value: 'KX', label: 'KX - Requirements Met', tooltip: 'Medicare therapy threshold requirements met; services are medically necessary.' },
  { value: '76', label: '76 - Repeat Procedure Same Physician', tooltip: 'Procedure repeated by the same physician on the same day.' },
  { value: 'CO', label: 'CO - Concurrent Outpatient Rehab', tooltip: 'Concurrent outpatient rehabilitation services.' },
];

const SOAP_SECTION_TINT: Record<SOAPSection, string> = {
  S: 'bg-sky-50/50',
  O: 'bg-amber-50/50',
  A: 'bg-violet-50/50',
  P: 'bg-rose-50/50',
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

type ObjectiveFieldType = 'textarea' | 'pain_scale';

interface ObjectiveFieldDef {
  key: string;
  label: string;
  fieldType: ObjectiveFieldType;
  placeholder?: string;
}

const PT_OBJECTIVE_FIELDS: ObjectiveFieldDef[] = [
  { key: 'rom', label: 'ROM', fieldType: 'textarea' },
  { key: 'strength_mmt', label: 'Strength / MMT', fieldType: 'textarea' },
  { key: 'posture', label: 'Posture', fieldType: 'textarea' },
  { key: 'gait_analysis', label: 'Gait Analysis', fieldType: 'textarea' },
  { key: 'balance', label: 'Balance', fieldType: 'textarea' },
  { key: 'functional_mobility', label: 'Functional Mobility', fieldType: 'textarea' },
  { key: 'pain_assessment', label: 'Pain Assessment', fieldType: 'pain_scale' },
];

const OT_OBJECTIVE_FIELDS: ObjectiveFieldDef[] = [
  { key: 'adl_assessment', label: 'ADL Assessment', fieldType: 'textarea' },
  { key: 'hand_function', label: 'Hand Function', fieldType: 'textarea' },
  { key: 'cognition_screening', label: 'Cognition Screening', fieldType: 'textarea' },
  { key: 'sensory', label: 'Sensory', fieldType: 'textarea' },
  { key: 'visual_perceptual', label: 'Visual-Perceptual', fieldType: 'textarea' },
  { key: 'home_safety', label: 'Home Safety', fieldType: 'textarea' },
];

const ST_OBJECTIVE_FIELDS: ObjectiveFieldDef[] = [
  { key: 'speech_intelligibility', label: 'Speech Intelligibility', fieldType: 'textarea' },
  { key: 'language_comprehension', label: 'Language Comprehension', fieldType: 'textarea' },
  { key: 'language_expression', label: 'Language Expression', fieldType: 'textarea' },
  { key: 'voice', label: 'Voice', fieldType: 'textarea' },
  { key: 'fluency', label: 'Fluency', fieldType: 'textarea' },
  { key: 'swallowing_dysphagia', label: 'Swallowing / Dysphagia', fieldType: 'textarea' },
  { key: 'cognition_communication', label: 'Cognition-Communication', fieldType: 'textarea' },
];

const MFT_OBJECTIVE_FIELDS: ObjectiveFieldDef[] = [
  { key: 'presenting_problem', label: 'Presenting Problem', fieldType: 'textarea' },
  { key: 'mental_status', label: 'Mental Status Exam', fieldType: 'textarea' },
  { key: 'risk_assessment', label: 'Risk Assessment (SI/HI/Abuse)', fieldType: 'textarea' },
  { key: 'relationship_dynamics', label: 'Relationship / Family Dynamics', fieldType: 'textarea' },
  { key: 'functional_impairment', label: 'Functional Impairment', fieldType: 'textarea' },
  { key: 'diagnostic_impressions', label: 'Diagnostic Impressions', fieldType: 'textarea' },
];

function getObjectiveFields(discipline: Discipline): ObjectiveFieldDef[] {
  switch (discipline) {
    case 'PT': return PT_OBJECTIVE_FIELDS;
    case 'OT': return OT_OBJECTIVE_FIELDS;
    case 'ST': return ST_OBJECTIVE_FIELDS;
    case 'MFT': return MFT_OBJECTIVE_FIELDS;
  }
}

/** Pain scale component — 0-10 colored buttons + optional notes */
function PainScaleInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // Parse existing value: "6/10 - some notes" or just "6/10" or free text
  const match = value.match(/^(\d+)\/10(?:\s*-\s*(.*))?$/s);
  const currentRating = match ? parseInt(match[1], 10) : null;
  const currentNotes = match ? (match[2] || '') : (value || '');

  const handleRatingClick = (rating: number) => {
    const notes = currentNotes.trim();
    onChange(notes ? `${rating}/10 - ${notes}` : `${rating}/10`);
  };

  const handleNotesChange = (notes: string) => {
    if (currentRating !== null) {
      onChange(notes.trim() ? `${currentRating}/10 - ${notes}` : `${currentRating}/10`);
    } else {
      onChange(notes);
    }
  };

  const getButtonColor = (n: number) => {
    if (n <= 3) return currentRating === n ? 'bg-emerald-500 text-white' : 'bg-emerald-50 text-emerald-700 hover:bg-emerald-100';
    if (n <= 6) return currentRating === n ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100';
    return currentRating === n ? 'bg-red-500 text-white' : 'bg-red-50 text-red-700 hover:bg-red-100';
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-1">
        {Array.from({ length: 11 }, (_, i) => (
          <button
            key={i}
            type="button"
            onClick={() => handleRatingClick(i)}
            className={`w-8 h-8 rounded-lg text-xs font-bold transition-colors border ${getButtonColor(i)} ${currentRating === i ? 'ring-2 ring-offset-1 ring-blue-400 border-transparent' : 'border-gray-200'}`}
          >
            {i}
          </button>
        ))}
        {currentRating !== null && (
          <span className="ml-2 text-sm font-semibold text-[var(--color-text)]">{currentRating}/10</span>
        )}
      </div>
      <textarea
        className="textarea"
        rows={2}
        placeholder="Additional pain notes (location, quality, aggravating factors...)"
        value={currentNotes}
        onChange={(e) => handleNotesChange(e.target.value)}
      />
    </div>
  );
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

const RehabPotentialSection = React.memo(function RehabPotentialSection({
  value,
  onChange,
  evalType = 'initial',
  hideHeader = false,
}: {
  value: string;
  onChange: (val: string) => void;
  evalType?: 'initial' | 'reassessment' | 'discharge';
  hideHeader?: boolean;
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

  const innerContent = (
    <>
      <p className="text-xs text-[var(--color-text-secondary)] mb-3">
        {evalType === 'reassessment'
          ? 'Document why this patient continues to require skilled therapy services for the upcoming certification period.'
          : 'This section serves as your statement of medical necessity for skilled services.'}
      </p>

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
    </>
  );

  if (hideHeader) return innerContent;

  return (
    <div className="card p-6 mb-6">
      <h2 className="section-title">
        {evalType === 'reassessment'
          ? 'Rehabilitation Potential / Justification for Continued Services'
          : 'Rehabilitation Potential / Medical Necessity'}
      </h2>
      {innerContent}
    </div>
  );
});

// ── Component ──

export default function EvalFormPage() {
  const { id: clientId, evalId } = useParams<{ id: string; evalId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const sectionColor = useSectionColor();
  const isEditing = Boolean(evalId);

  // Reassessment mode via route state or query param (?type=reassessment)
  const [searchParams] = useSearchParams();
  const queryEvalType = searchParams.get('type'); // 'reassessment' | 'discharge' | null
  const isReassessment = Boolean((location.state as any)?.reassessment) || queryEvalType === 'reassessment';
  const [evalType, setEvalType] = useState<'initial' | 'reassessment' | 'discharge'>(
    isReassessment ? 'reassessment'
      : queryEvalType === 'discharge' ? 'discharge'
      : 'initial'
  );
  const [priorFieldKeys, setPriorFieldKeys] = useState<Set<string>>(new Set());

  // Appointment context (when opening eval from calendar)
  const appointmentId = (location.state as any)?.appointmentId as number | undefined;
  const appointmentDate = (location.state as any)?.appointmentDate as string | undefined;

  const [client, setClient] = useState<Client | null>(null);
  const disciplineRef = useRef<Discipline>('PT');
  if (client) disciplineRef.current = client.discipline as Discipline;
  const [practiceInfo, setPracticeInfo] = useState<{ license_number?: string; npi?: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [signDialogOpen, setSignDialogOpen] = useState(false);
  const [showFaxPrompt, setShowFaxPrompt] = useState(false);
  const [signDialogIssues, setSignDialogIssues] = useState<ValidationIssue[]>([]);

  const [evalDate, setEvalDate] = useState(appointmentDate || todayISO());
  const [content, setContent] = useState<EvalContent | null>(null);
  const [signatureImage, setSignatureImage] = useState('');
  const [signatureTyped, setSignatureTyped] = useState('');
  const [existingSignedAt, setExistingSignedAt] = useState('');
  const [goalEntries, setGoalEntries] = useState<EvalGoalEntry[]>([]);
  const [goalHistories, setGoalHistories] = useState<Record<number, GoalProgressEntry[]>>({});
  const [goalsAlreadyCreated, setGoalsAlreadyCreated] = useState(false);
  const [completedGoals, setCompletedGoals] = useState<{ id: number; goal_text: string; goal_type: string; status: string; met_date: string; category: string; baseline: number; target: number }[]>([]);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Goal pattern state
  const [expandedGoalIdx, setExpandedGoalIdx] = useState<number | null>(null);
  const [patternOverrides, setPatternOverrides] = useState<PatternOverride[]>([]);
  const [customGoalPatterns, setCustomGoalPatterns] = useState<GoalPattern[]>([]);
  // Refs for stable goal handler callbacks
  const patternOverridesRef = useRef(patternOverrides);
  patternOverridesRef.current = patternOverrides;
  const customGoalPatternsRef = useRef(customGoalPatterns);
  customGoalPatternsRef.current = customGoalPatterns;

  // Objective assessment checkbox state
  const [enabledObjectiveFields, setEnabledObjectiveFields] = useState<Set<string>>(new Set());

  // Session Note & Billing state
  const [sessionNote, setSessionNote] = useState<SessionNoteData>({ ...EMPTY_SESSION_NOTE });
  const [snModifiers, setSnModifiers] = useState<string[]>([]);
  const [snNoteBankOpen, setSnNoteBankOpen] = useState<SOAPSection | null>(null);
  const snSubjectiveRef = useRef<HTMLTextAreaElement | null>(null);
  const snObjectiveRef = useRef<HTMLTextAreaElement | null>(null);
  const snAssessmentRef = useRef<HTMLTextAreaElement | null>(null);
  const snPlanRef = useRef<HTMLTextAreaElement | null>(null);
  const snSubjectiveBtnRef = useRef<HTMLButtonElement | null>(null);
  const snObjectiveBtnRef = useRef<HTMLButtonElement | null>(null);
  const snAssessmentBtnRef = useRef<HTMLButtonElement | null>(null);
  const snPlanBtnRef = useRef<HTMLButtonElement | null>(null);

  // Frequency & Duration state
  const [freqValue, setFreqValue] = useState<number>(0);
  const [durValue, setDurValue] = useState<number>(0);

  // Auto-save state
  const [savedEvalId, setSavedEvalId] = useState<number | null>(evalId ? parseInt(evalId, 10) : null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lastAutoSaved, setLastAutoSaved] = useState<string | null>(null);
  const isDirty = useRef(false); // true once user edits any field

  // Physician sync state
  const [physicianSyncBanner, setPhysicianSyncBanner] = useState<{ name: string; id?: number; npi?: string; fax?: string; cleared?: boolean } | null>(null);
  const lastClientCheckRef = useRef<number>(0);
  const evalPhysicianIdAtLoad = useRef<number | null | undefined>(undefined); // tracks physician ID from when eval was loaded

  // ── Section collapsing & outline nav ──
  const {
    sections: evalSections,
    expandedSections,
    toggleSection,
    expandAll,
    collapseAll,
    allExpanded,
    activeSectionId,
    sectionRefs,
    scrollToSection,
    scrollContainerRef,
  } = useEvalSections({
    content: content as any,
    evalDate,
    goalEntries,
    completedGoals,
    signatureImage,
    signatureTyped,
    evalType,
    sessionNote,
  });

  // Helper to get section status by id
  const getSectionStatus = (id: string) => evalSections.find(s => s.id === id)?.status ?? 'optional-empty';

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

      // Load pattern overrides
      try {
        const overrides = await window.api.patternOverrides.list();
        setPatternOverrides(overrides);
      } catch (err) {
        console.error('Failed to load pattern overrides:', err);
      }

      // Load custom patterns and convert to GoalPattern format
      try {
        const cps: CustomPattern[] = await window.api.customPatterns.list();
        setCustomGoalPatterns(cps.map(customPatternToGoalPattern));
      } catch (err) {
        console.error('Failed to load custom patterns:', err);
      }

      if (evalId) {
        const evaluation = await window.api.evaluations.get(parseInt(evalId, 10));
        setEvalDate(evaluation.eval_date || todayISO());
        setExistingSignedAt(evaluation.signed_at || '');

        // For unsigned drafts with no saved signature, pre-fill from settings
        if (evaluation.signature_image) {
          setSignatureImage(evaluation.signature_image);
          setSignatureTyped(evaluation.signature_typed || '');
        } else if (!evaluation.signed_at) {
          const [sigName, sigCreds, sigImage] = await Promise.all([
            window.api.settings.get('signature_name'),
            window.api.settings.get('signature_credentials'),
            window.api.settings.get('signature_image'),
          ]);
          const typed = [sigName, sigCreds].filter(Boolean).join(', ');
          setSignatureTyped(evaluation.signature_typed || typed);
          if (sigImage) setSignatureImage(sigImage);
        } else {
          setSignatureTyped(evaluation.signature_typed || '');
        }
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

          // Restore enabled objective fields from saved data or compute from non-empty values
          if (parsed.enabled_objective_fields) {
            setEnabledObjectiveFields(new Set(parsed.enabled_objective_fields));
          } else {
            // Backwards compatibility: auto-check any non-empty fields
            const objData = parsed.objective_assessment as Record<string, string> | undefined;
            if (objData) {
              const nonEmpty = Object.entries(objData).filter(([_, v]) => v && v.trim()).map(([k]) => k);
              setEnabledObjectiveFields(new Set(nonEmpty));
            }
          }

          // Load structured goal entries if present
          let loadedEntries: EvalGoalEntry[] = [];
          let alreadyCreatedIds: number[] = [];
          if (parsed.goal_entries && Array.isArray(parsed.goal_entries)) {
            loadedEntries = parsed.goal_entries.map((g: any) => ({
              ...g,
              measurement_type: g.measurement_type || 'percentage',
              baseline: g.baseline ?? 0,
              target: g.target ?? 0,
              baseline_value: g.baseline_value || `${g.baseline ?? 0}`,
              target_value: g.target_value || `${g.target ?? 0}`,
              instrument: g.instrument || '',
            }));
            if (parsed.created_goal_ids && parsed.created_goal_ids.length > 0) {
              alreadyCreatedIds = parsed.created_goal_ids;
              setGoalsAlreadyCreated(true);
            }
            // Note: is_carried_over is stamped on each EvalGoalEntry directly
          }

          // Two-way sync: merge client goals into draft eval
          if (!evaluation.signed_at) {
            try {
              const clientGoals = await window.api.goals.listByClient(cid);
              const activeClientGoals = clientGoals.filter((g: any) => g.status === 'active');
              const metOrDcGoals = clientGoals.filter((g: any) => g.status === 'met' || g.status === 'discontinued');
              setCompletedGoals(metOrDcGoals.map((g: any) => ({ id: g.id, goal_text: g.goal_text, goal_type: g.goal_type, status: g.status, met_date: g.met_date || '', category: g.category || '', baseline: g.baseline ?? 0, target: g.target ?? 0 })));
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
                  measurement_type: cg.measurement_type || 'percentage',
                  baseline: cg.baseline ?? 0,
                  target: cg.target ?? 0,
                  baseline_value: cg.baseline_value || `${cg.baseline ?? 0}`,
                  target_value: cg.target_value || `${cg.target ?? 0}`,
                  instrument: cg.instrument || '',
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
            // Load progress histories for linked goals
            try {
              const validIds = alreadyCreatedIds.filter((id: number) => id > 0);
              if (validIds.length > 0) {
                const histories = await window.api.goals.getProgressHistoryBatch(validIds);
                setGoalHistories(histories);
              }
            } catch { /* not critical */ }
          }

          // Parse frequency/duration
          if (parsed.frequency_duration) {
            const freqMatch = parsed.frequency_duration.match(/(\d+)x?\s*\/?\s*week/i);
            const durMatch = parsed.frequency_duration.match(/(\d+)\s*weeks/i);
            if (freqMatch) setFreqValue(parseInt(freqMatch[1], 10));
            if (durMatch) setDurValue(parseInt(durMatch[1], 10));
          }

          // Load session note data if present
          if (parsed.session_note) {
            setSessionNote({
              ...EMPTY_SESSION_NOTE,
              ...parsed.session_note,
              cpt_codes: parsed.session_note.cpt_codes?.length > 0
                ? parsed.session_note.cpt_codes
                : [{ code: '', units: 1 }],
            });
            if (parsed.session_note.cpt_modifiers && Array.isArray(parsed.session_note.cpt_modifiers)) {
              setSnModifiers(parsed.session_note.cpt_modifiers);
            }
          }

          // ── Client → Eval physician sync check (for unsigned drafts) ──
          evalPhysicianIdAtLoad.current = parsed.referral_physician_id ?? null;
          if (!evaluation.signed_at) {
            const clientMD = clientData.referring_physician?.trim() || '';
            const clientMDId = clientData.referring_physician_id;
            const evalMD = (parsed.referral_source || '').trim();
            const evalMDId = parsed.referral_physician_id;

            if (clientMD && (clientMDId !== evalMDId || clientMD !== evalMD)) {
              // Client has a (different) physician — offer to update eval
              setPhysicianSyncBanner({
                name: clientMD,
                id: clientMDId ?? undefined,
                npi: clientData.referring_npi || undefined,
                fax: clientData.referring_fax || undefined,
              });
            } else if (!clientMD && evalMD && evalMDId) {
              // Client physician was cleared — offer to clear eval too
              setPhysicianSyncBanner({
                name: '',
                cleared: true,
              });
            } else {
              setPhysicianSyncBanner(null);
            }
          }
        } catch {
          setContent(emptyContent(discipline));
        }
      } else if (isReassessment) {
        // ── Pre-populate from prior signed eval ──
        // Performance: collect all async data first, then batch setState calls
        try {
          const prior = await window.api.evaluations.createReassessment(cid);
          if (prior && prior.priorContent) {
            const parsed = typeof prior.priorContent === 'string'
              ? JSON.parse(prior.priorContent) as Partial<EvalContent>
              : prior.priorContent as Partial<EvalContent>;
            const base = emptyContent(discipline);
            const prePopulated: EvalContent = {
              ...base,
              referral_source: parsed.referral_source || (clientData.referring_physician_id && clientData.referring_physician ? clientData.referring_physician : [clientData.referring_physician, clientData.referral_source].filter(Boolean).join(' — ') || ''),
              referral_physician_id: parsed.referral_physician_id ?? clientData.referring_physician_id ?? null,
              referral_physician_npi: parsed.referral_physician_npi || clientData.referring_npi || '',
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

            // Track which fields were pre-populated for UPDATE badges
            const prefilled = new Set<string>();
            if (parsed.referral_source?.trim()) prefilled.add('referral_source');
            if (parsed.medical_history?.trim()) prefilled.add('medical_history');
            if (parsed.clinical_impression?.trim()) prefilled.add('clinical_impression');
            if (parsed.rehabilitation_potential?.trim()) prefilled.add('rehabilitation_potential');
            if (parsed.precautions?.trim()) prefilled.add('precautions');
            if (parsed.treatment_plan?.trim()) prefilled.add('treatment_plan');
            if (parsed.frequency_duration?.trim()) prefilled.add('frequency_duration');

            // Parse frequency/duration from prior (local vars)
            let parsedFreq: number | null = null;
            let parsedDur: number | null = null;
            if (parsed.frequency_duration) {
              const freqMatch = parsed.frequency_duration.match(/(\d+)x?\s*\/?\s*week/i);
              const durMatch = parsed.frequency_duration.match(/(\d+)\s*weeks/i);
              if (freqMatch) parsedFreq = parseInt(freqMatch[1], 10);
              if (durMatch) parsedDur = parseInt(durMatch[1], 10);
            }

            // Load met/completed goals for display (async)
            let completedGoalsList: any[] = [];
            try {
              const allClientGoals = await window.api.goals.listByClient(cid);
              completedGoalsList = allClientGoals
                .filter((g: any) => g.status === 'met' || g.status === 'discontinued')
                .map((g: any) => ({ id: g.id, goal_text: g.goal_text, goal_type: g.goal_type, status: g.status, met_date: g.met_date || '', category: g.category || '', baseline: g.baseline ?? 0, target: g.target ?? 0 }));
            } catch { /* not critical */ }

            // Build active goal entries (local vars)
            let entries: EvalGoalEntry[] = [];
            let linkedIds: number[] = [];
            if (prior.activeGoals && Array.isArray(prior.activeGoals) && prior.activeGoals.length > 0) {
              entries = prior.activeGoals.map((g: any) => ({
                goal_text: g.goal_text || '',
                goal_type: g.goal_type || 'STG',
                category: g.category || '',
                target_date: g.target_date || '',
                measurement_type: g.measurement_type || 'percentage',
                baseline: g.baseline ?? 0,
                target: g.target ?? 0,
                baseline_value: g.baseline_value || `${g.baseline ?? 0}`,
                target_value: g.target_value || `${g.target ?? 0}`,
                instrument: g.instrument || '',
                pattern_id: g.pattern_id || '',
                components: g.components_json ? JSON.parse(g.components_json) : undefined,
                is_carried_over: true,
              }));
              linkedIds = prior.activeGoals.map((g: any) => g.id).filter(Boolean);
            }

            // Merge goal IDs into prePopulated content before setting state
            if (linkedIds.length > 0) {
              prePopulated.created_goal_ids = linkedIds;
              prePopulated.carried_over_count = entries.length;
            }

            // ── BATCH: all setState calls in one synchronous block ──
            setContent(prePopulated);
            setPriorFieldKeys(prefilled);
            if (parsedFreq !== null) setFreqValue(parsedFreq);
            if (parsedDur !== null) setDurValue(parsedDur);
            if (completedGoalsList.length > 0) setCompletedGoals(completedGoalsList);
            if (entries.length > 0) setGoalEntries(entries);
            if (linkedIds.length > 0) setGoalsAlreadyCreated(true);

            isDirty.current = true; // Mark dirty so autosave persists pre-populated data
            setToast('Pre-populated from prior evaluation — review and update fields');
          } else {
            const freshContent = emptyContent(discipline);
            if (clientData.referring_physician_id && clientData.referring_physician) {
              freshContent.referral_source = clientData.referring_physician;
            } else {
              const refParts = [clientData.referring_physician, clientData.referral_source].filter(Boolean);
              if (refParts.length > 0) freshContent.referral_source = refParts.join(' — ');
            }
            freshContent.referral_physician_id = clientData.referring_physician_id ?? null;
            freshContent.referral_physician_npi = clientData.referring_npi || '';
            setContent(freshContent);
            setToast('No prior signed evaluation found — starting fresh');
          }
        } catch (err) {
          console.error('Failed to load prior eval for reassessment:', err);
          const fallbackContent = emptyContent(discipline);
          if (clientData.referring_physician_id && clientData.referring_physician) {
            fallbackContent.referral_source = clientData.referring_physician;
          } else {
            const refParts2 = [clientData.referring_physician, clientData.referral_source].filter(Boolean);
            if (refParts2.length > 0) fallbackContent.referral_source = refParts2.join(' — ');
          }
          fallbackContent.referral_physician_id = clientData.referring_physician_id ?? null;
          fallbackContent.referral_physician_npi = clientData.referring_npi || '';
          setContent(fallbackContent);
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
        // Auto-populate referral source from client record
        if (clientData.referring_physician_id && clientData.referring_physician) {
          // Physician from directory — use just the name so combobox can match
          newContent.referral_source = clientData.referring_physician;
        } else {
          const refParts = [clientData.referring_physician, clientData.referral_source].filter(Boolean);
          if (refParts.length > 0) newContent.referral_source = refParts.join(' — ');
        }
        newContent.referral_physician_id = clientData.referring_physician_id ?? null;
        newContent.referral_physician_npi = clientData.referring_npi || '';

        // Load existing client goals (async first, then batch setState)
        let completedGoalsList: any[] = [];
        let entries: EvalGoalEntry[] = [];
        let linkedIds: number[] = [];
        try {
          const clientGoals = await window.api.goals.listByClient(cid);
          const activeClientGoals = clientGoals.filter((g: any) => g.status === 'active');
          completedGoalsList = clientGoals
            .filter((g: any) => g.status === 'met' || g.status === 'discontinued')
            .map((g: any) => ({ id: g.id, goal_text: g.goal_text, goal_type: g.goal_type, status: g.status, met_date: g.met_date || '', category: g.category || '', baseline: g.baseline ?? 0, target: g.target ?? 0 }));
          if (activeClientGoals.length > 0) {
            entries = activeClientGoals.map((cg: any) => ({
              goal_text: cg.goal_text || '',
              goal_type: cg.goal_type || 'STG',
              category: cg.category || '',
              target_date: cg.target_date || '',
              measurement_type: cg.measurement_type || 'percentage',
              baseline: cg.baseline ?? 0,
              target: cg.target ?? 0,
              baseline_value: cg.baseline_value || `${cg.baseline ?? 0}`,
              target_value: cg.target_value || `${cg.target ?? 0}`,
              instrument: cg.instrument || '',
              pattern_id: cg.pattern_id || '',
              components: cg.components_json ? JSON.parse(cg.components_json) : undefined,
              is_carried_over: true,
            }));
            linkedIds = activeClientGoals.map((cg: any) => cg.id);
          }
        } catch (err) {
          console.error('Failed to load client goals for new eval:', err);
        }

        // Merge goal IDs into content before setting state
        if (linkedIds.length > 0) {
          newContent.created_goal_ids = linkedIds;
          newContent.carried_over_count = entries.length;
        }

        // ── BATCH: all setState calls in one synchronous block ──
        setContent(newContent);
        if (completedGoalsList.length > 0) setCompletedGoals(completedGoalsList);
        if (entries.length > 0) setGoalEntries(entries);
        if (linkedIds.length > 0) setGoalsAlreadyCreated(true);

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

  // ── Client → Eval physician sync (detect changes when window regains focus) ──
  useEffect(() => {
    if (!clientId || existingSignedAt) return; // Skip for signed evals

    const checkClientSync = async () => {
      const now = Date.now();
      if (now - lastClientCheckRef.current < 5000) return; // Throttle: max once per 5s
      lastClientCheckRef.current = now;

      try {
        const freshClient = await window.api.clients.get(parseInt(clientId, 10));
        if (!freshClient) return;

        // Update local client state silently
        setClient(freshClient);

        // Compare client's physician with eval's
        const clientMD = freshClient.referring_physician?.trim() || '';
        const clientMDId = freshClient.referring_physician_id;

        setContent(prev => {
          if (!prev) return prev;
          const evalMD = prev.referral_source?.trim() || '';
          const evalMDId = prev.referral_physician_id;

          // If client has a physician and it differs from eval
          if (clientMD && (clientMDId !== evalMDId || clientMD !== evalMD)) {
            setPhysicianSyncBanner({
              name: clientMD,
              id: clientMDId ?? undefined,
              npi: freshClient.referring_npi || undefined,
              fax: freshClient.referring_fax || undefined,
            });
          } else {
            setPhysicianSyncBanner(null);
          }
          return prev; // Don't modify content
        });
      } catch { /* ignore */ }
    };

    const handleFocus = () => checkClientSync();
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') checkClientSync();
    };

    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibility);
    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [clientId, existingSignedAt]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // ── Reload goals bank when category changes ──

  // Track which categories have been used in current goal entries
  const usedCategories = useMemo(() => {
    return [...new Set(goalEntries.map(g => g.category).filter(Boolean))];
  }, [goalEntries]);

  // Build GoalCardData[] for the new accordion cards
  const goalCards = useMemo(() =>
    goalEntries.map((entry, idx) => {
      const goalId = (content?.created_goal_ids || [])[idx] || null;
      const history = goalId ? (goalHistories[goalId] || []) : [];
      return evalEntryToCardData(entry, idx, goalId, history, patternOverrides, customGoalPatterns);
    }),
    [goalEntries, content?.created_goal_ids, goalHistories, patternOverrides, customGoalPatterns]
  );

  // ── Auto-Save (ref-based to avoid re-render cascade) ──

  // Store all auto-save inputs as refs so performAutoSave is stable
  const autoSaveDataRef = useRef({
    clientId, client, content, goalEntries, evalDate, savedEvalId,
    existingSignedAt, evalType, enabledObjectiveFields, appointmentId,
    sessionNote, snModifiers,
  });
  autoSaveDataRef.current = {
    clientId, client, content, goalEntries, evalDate, savedEvalId,
    existingSignedAt, evalType, enabledObjectiveFields, appointmentId,
    sessionNote, snModifiers,
  };

  const performAutoSave = useCallback(async () => {
    const d = autoSaveDataRef.current;
    if (!d.clientId || !d.client || !d.content || d.existingSignedAt) return;
    if (!isDirty.current && !d.savedEvalId) return;

    try {
      const cid = parseInt(d.clientId as string, 10);

      // Sync goal records to the goals table on every autosave
      let updatedGoalIds: number[] = [...(d.content.created_goal_ids || [])];

      // Delete any orphaned goals (IDs beyond current goalEntries length)
      if (updatedGoalIds.length > d.goalEntries.length) {
        const orphanedIds = updatedGoalIds.slice(d.goalEntries.length).filter(Boolean);
        if (orphanedIds.length > 0) {
          await Promise.all(orphanedIds.map(oid =>
            window.api.goals.delete(oid).catch(err => console.error('Auto-save: failed to delete orphaned goal:', err))
          ));
        }
        updatedGoalIds = updatedGoalIds.slice(0, d.goalEntries.length);
      }

      // Parallel goal sync — fire all updates/creates concurrently
      const goalPromises = d.goalEntries.map(async (entry, i) => {
        if (!entry.goal_text.trim()) return;
        const existingId = i < updatedGoalIds.length ? updatedGoalIds[i] : null;
        const goalData = {
          goal_text: entry.goal_text,
          goal_type: entry.goal_type,
          category: entry.category,
          target_date: entry.target_date,
          measurement_type: entry.measurement_type || 'percentage',
          baseline: entry.baseline || 0,
          target: entry.target || 0,
          baseline_value: entry.baseline_value || '',
          target_value: entry.target_value || '',
          instrument: entry.instrument || '',
          pattern_id: entry.pattern_id || '',
          components_json: entry.components ? JSON.stringify(entry.components) : '',
          status: 'active' as const,
        };
        if (existingId) {
          try {
            await window.api.goals.update(existingId, { ...goalData, met_date: undefined });
          } catch (err) { console.error('Auto-save: failed to update linked goal:', err); }
        } else {
          try {
            const goal = await window.api.goals.create({ ...goalData, client_id: cid });
            while (updatedGoalIds.length <= i) updatedGoalIds.push(0);
            updatedGoalIds[i] = goal.id;
          } catch (err) { console.error('Auto-save: failed to create goal:', err); }
        }
      });
      await Promise.all(goalPromises);

      // Update content state with any newly created goal IDs
      if (JSON.stringify(updatedGoalIds) !== JSON.stringify(d.content.created_goal_ids || [])) {
        setContent(prev => prev ? { ...prev, created_goal_ids: updatedGoalIds } : prev);
      }

      const contentToSave = {
        ...d.content,
        goal_entries: d.goalEntries,
        created_goal_ids: updatedGoalIds,
        session_note: { ...d.sessionNote, cpt_modifiers: d.snModifiers },
        enabled_objective_fields: [...d.enabledObjectiveFields],
      };

      const evalData: any = {
        client_id: cid,
        eval_date: d.evalDate,
        discipline: d.client.discipline,
        content: JSON.stringify(contentToSave),
        signature_image: '',
        signature_typed: '',
        signed_at: null,
        eval_type: d.evalType,
      };

      if (d.savedEvalId) {
        await window.api.evaluations.update(d.savedEvalId, evalData);
      } else {
        const created = await window.api.evaluations.create(evalData);
        if (created?.id) {
          setSavedEvalId(created.id);
          // Link eval back to appointment if we opened from calendar
          if (d.appointmentId) {
            try {
              await window.api.appointments.linkEval(d.appointmentId, created.id);
            } catch (err) {
              console.error('Failed to link eval to appointment:', err);
            }
          }
        }
      }
      setLastAutoSaved(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Auto-save failed:', err);
    }
  }, []); // Stable — reads from ref

  // Debounced auto-save: triggers 5 seconds after any user change
  useEffect(() => {
    if (loading || !content || existingSignedAt) return;
    if (!isDirty.current && !savedEvalId) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      performAutoSave();
    }, 5000);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [content, goalEntries, evalDate, loading, existingSignedAt, savedEvalId]);

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

  // Wrapper to mark dirty when goal entries change inline
  const updateGoalEntries = useCallback((updater: React.SetStateAction<EvalGoalEntry[]>) => {
    isDirty.current = true;
    setGoalEntries(updater);
  }, []);

  /** Auto-compose goal text from structured fields (pattern-based or custom) */
  const composeGoalText = useCallback((entry: EvalGoalEntry): string => {
    const cgp = customGoalPatternsRef.current;
    const po = patternOverridesRef.current;
    let pattern = entry.pattern_id ? (getPatternById(entry.pattern_id) || cgp.find(p => p.id === entry.pattern_id)) : undefined;
    if (pattern && po.length > 0) pattern = applyOverrides(pattern, po);
    if (pattern && pattern.id !== 'custom_freeform') {
      return sharedComposeGoalText({
        pattern,
        discipline: disciplineRef.current,
        components: entry.components || {},
        measurement_type: entry.measurement_type || 'percentage',
        baseline_value: entry.baseline_value || `${entry.baseline ?? 0}`,
        target_value: entry.target_value || `${entry.target ?? 80}`,
        instrument: entry.instrument || '',
        // target_date intentionally omitted — date chip is sufficient, no need in goal narrative
      });
    }
    // Custom/legacy: return existing text as-is (user writes it manually)
    return entry.goal_text || '';
  }, []);

  /** Update a goal entry field and auto-compose text if appropriate */
  const updateGoalField = useCallback((idx: number, field: Partial<EvalGoalEntry>) => {
    updateGoalEntries(prev =>
      prev.map((g, i) => {
        if (i !== idx) return g;
        const updated = { ...g, ...field };
        // If category changed without explicit measurement_type override, auto-update
        if (field.category && field.category !== g.category && !field.measurement_type) {
          const newMt = CATEGORY_DEFAULT_MEASUREMENT[field.category] || 'percentage';
          if (newMt !== g.measurement_type) {
            updated.measurement_type = newMt as MeasurementType;
            updated.baseline_value = '';
            updated.target_value = '';
            updated.baseline = 0;
            updated.target = 0;
            updated.instrument = newMt === 'standardized_score'
              ? (DEFAULT_INSTRUMENTS[field.category] || '') : '';
          }
        }
        // Auto-compose if pattern-based goal, or if text was previously auto-composed
        if (updated.pattern_id && updated.pattern_id !== 'custom_freeform') {
          updated.goal_text = composeGoalText(updated);
        } else if (!g.goal_text.trim() || isAutoComposedGoalText(g.goal_text)) {
          // Legacy: only recompose if it was auto-composed before
          updated.goal_text = composeGoalText(updated);
        }
        return updated;
      })
    );
  }, [composeGoalText, updateGoalEntries]);

  // Stable goal card handler callbacks (avoid re-creating on every render)
  const handleGoalCollapse = useCallback(() => setExpandedGoalIdx(null), []);
  const handleGoalExpand = useCallback((idx: number) => setExpandedGoalIdx(idx), []);

  const contentRef = useRef(content);
  contentRef.current = content;

  const handleGoalComponentChange = useCallback((idx: number, key: string, value: any) => {
    // Use functional updater to read current components and merge, then recompose text
    setGoalEntries(prev => {
      const entry = prev[idx];
      if (!entry) return prev;
      const updatedComps = { ...(entry.components || {}), [key]: value };
      const updated = { ...entry, components: updatedComps };
      // Recompose goal text so the narrative reflects the new component choice
      if (updated.pattern_id && updated.pattern_id !== 'custom_freeform') {
        updated.goal_text = composeGoalText(updated);
      }
      return prev.map((g, i) => i !== idx ? g : updated);
    });
    isDirty.current = true;
  }, [composeGoalText]);

  const handleGoalDelete = useCallback(async (idx: number) => {
    const c = contentRef.current;
    const goalId = (c?.created_goal_ids || [])[idx];
    if (goalId) {
      try { await window.api.goals.delete(goalId); } catch (err) { console.error('Failed to delete linked goal:', err); }
    }
    setContent(prev => {
      if (!prev) return prev;
      const ids = [...(prev.created_goal_ids || [])];
      ids.splice(idx, 1);
      return { ...prev, created_goal_ids: ids };
    });
    updateGoalEntries(prev => prev.filter((_, i) => i !== idx));
    setExpandedGoalIdx(null);
  }, [updateGoalEntries]);

  const handleGoalPatternSelect = useCallback((idx: number, pattern: GoalPattern) => {
    const defaultComponents: Record<string, any> = {};
    for (const comp of pattern.components) {
      if (comp.defaultValue !== undefined) {
        defaultComponents[comp.key] = comp.defaultValue;
      }
    }
    const mt = pattern.measurement_type || 'percentage';
    const inst = pattern.instrument || (mt === 'standardized_score' ? (DEFAULT_INSTRUMENTS[pattern.category] || '') : '');
    updateGoalField(idx, {
      pattern_id: pattern.id,
      components: defaultComponents,
      category: pattern.category,
      measurement_type: mt as MeasurementType,
      instrument: inst,
    });
  }, [updateGoalField]);

  const handleGoalPatternClear = useCallback((idx: number) => {
    updateGoalField(idx, { pattern_id: undefined, components: undefined });
  }, [updateGoalField]);

  const handleGoalCustomPattern = useCallback((idx: number) => {
    updateGoalField(idx, { pattern_id: 'custom_freeform', components: undefined });
  }, [updateGoalField]);

  // ── Session Note SOAP helpers ──

  const snInsertAtCursor = useCallback((
    textareaRef: React.RefObject<HTMLTextAreaElement | null>,
    field: keyof SessionNoteData,
    phrase: string,
  ) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setSessionNote(prev => ({ ...prev, [field]: prev[field as keyof SessionNoteData] ? prev[field as keyof SessionNoteData] + ' ' + phrase : phrase }));
      return;
    }
    const currentValue = textarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = currentValue.slice(0, start);
    const after = currentValue.slice(end);
    const needsSpace = before.length > 0 && !before.endsWith(' ') && !before.endsWith('\n');
    const newValue = before + (needsSpace ? ' ' : '') + phrase + after;
    setSessionNote(prev => ({ ...prev, [field]: newValue }));
    setTimeout(() => {
      const pos = start + (needsSpace ? 1 : 0) + phrase.length;
      textarea.focus();
      textarea.setSelectionRange(pos, pos);
    }, 0);
  }, []);

  const snInsertS = useCallback((phrase: string) => snInsertAtCursor(snSubjectiveRef, 'subjective', phrase), [snInsertAtCursor]);
  const snInsertO = useCallback((phrase: string) => snInsertAtCursor(snObjectiveRef, 'objective', phrase), [snInsertAtCursor]);
  const snInsertA = useCallback((phrase: string) => snInsertAtCursor(snAssessmentRef, 'assessment', phrase), [snInsertAtCursor]);
  const snInsertP = useCallback((phrase: string) => snInsertAtCursor(snPlanRef, 'plan', phrase), [snInsertAtCursor]);

  const getSnInsertHandler = (section: SOAPSection) => {
    switch (section) {
      case 'S': return snInsertS;
      case 'O': return snInsertO;
      case 'A': return snInsertA;
      case 'P': return snInsertP;
    }
  };

  const getSnBtnRef = (section: SOAPSection) => {
    switch (section) {
      case 'S': return snSubjectiveBtnRef;
      case 'O': return snObjectiveBtnRef;
      case 'A': return snAssessmentBtnRef;
      case 'P': return snPlanBtnRef;
    }
  };

  const getSnTextareaRef = (section: SOAPSection) => {
    switch (section) {
      case 'S': return snSubjectiveRef;
      case 'O': return snObjectiveRef;
      case 'A': return snAssessmentRef;
      case 'P': return snPlanRef;
    }
  };

  // ── Save ──

  /** Pre-sign validation for evaluations — returns structured ValidationIssue[] for Fix-It dialog */
  const runSignValidation = (): ValidationIssue[] => {
    const issues: ValidationIssue[] = [];

    if (!content) {
      issues.push({ id: 'eval_empty', message: 'Evaluation content is empty', severity: 'error', fixable: false, fieldType: 'none', target: 'document', guidance: 'Go back and fill in the evaluation form.' });
      return issues;
    }

    // ── Non-fixable goal issues ──

    if (goalEntries.length === 0 && !content.goals?.trim()) {
      issues.push({ id: 'eval_no_goals', message: 'At least one goal is required before signing', severity: 'error', fixable: false, fieldType: 'none', target: 'document', guidance: 'Go back and add goals in the Goals section.' });
    }

    if (goalEntries.length > 0) {
      const hasLTG = goalEntries.some(g => g.goal_type === 'LTG' && g.goal_text.trim());
      if (!hasLTG) {
        issues.push({ id: 'eval_no_ltg', message: 'At least one Long-Term Goal (LTG) required', severity: 'error', fixable: false, fieldType: 'none', target: 'document', guidance: 'Change at least one goal to LTG type.' });
      }
    }

    const goalsWithoutDates = goalEntries.filter(g => g.goal_text.trim() && !g.target_date);
    if (goalsWithoutDates.length > 0) {
      issues.push({ id: 'eval_goal_no_date', message: `${goalsWithoutDates.length} goal(s) missing target dates`, severity: 'error', fixable: false, fieldType: 'none', target: 'document', guidance: 'Set target dates on all goals.' });
    }

    const hasUnfilledBlanks = goalEntries.some(g => g.goal_text.includes('___'));
    if (hasUnfilledBlanks) {
      issues.push({ id: 'eval_goal_blanks', message: 'Goals have unfilled template blanks (___)', severity: 'error', fixable: false, fieldType: 'none', target: 'document', guidance: 'Complete all ___ placeholders in your goals.' });
    }

    // ── Fixable document fields ──

    if (!content.rehabilitation_potential?.trim()) {
      issues.push({
        id: 'eval_rehab_potential', message: 'Rehabilitation Potential is empty', severity: 'error', fixable: true,
        fieldType: 'composed', target: 'document', currentValue: content.rehabilitation_potential || '',
        composedSelectOptions: [
          { value: 'Good', label: 'Good' }, { value: 'Fair', label: 'Fair' }, { value: 'Poor', label: 'Poor' },
        ],
        chipOptions: [
          { value: 'patient demonstrates motivation', label: 'Patient motivated' },
          { value: 'family/caregiver support available', label: 'Family support' },
          { value: 'prior functional level consistent with expected recovery', label: 'Prior level supports recovery' },
          { value: 'good cognitive awareness', label: 'Good cognition' },
          { value: 'active participation in treatment', label: 'Active participation' },
          { value: 'responds well to therapeutic interventions', label: 'Responds to treatment' },
          { value: 'medical complexity limits progress', label: 'Medical complexity' },
          { value: 'limited support system', label: 'Limited support' },
          { value: 'cognitive deficits may slow progress', label: 'Cognitive deficits' },
          { value: 'multiple comorbidities present', label: 'Multiple comorbidities' },
        ],
        hint: 'Select a rating and tap reasons — PocketChart will compose the narrative.',
      });
    }

    if (!content.prior_level_of_function?.trim()) {
      issues.push({
        id: 'eval_prior_lof', message: 'Prior Level of Function is empty', severity: 'error', fixable: true,
        fieldType: 'textarea', target: 'document', currentValue: '',
        hint: "Describe the patient's functional status before the onset of the current condition.",
      });
    }

    if (!content.clinical_impression?.trim()) {
      issues.push({
        id: 'eval_clinical_impression', message: 'Clinical Impression is required', severity: 'error', fixable: true,
        fieldType: 'textarea', target: 'document', currentValue: '',
        hint: 'Summarize the clinical presentation and your professional assessment.',
      });
    }

    if (!content.treatment_plan?.trim()) {
      issues.push({
        id: 'eval_treatment_plan', message: 'Treatment Plan is required', severity: 'error', fixable: true,
        fieldType: 'textarea', target: 'document', currentValue: '',
        hint: 'Outline the planned therapeutic approach, modalities, and interventions.',
      });
    }

    if (!content.frequency_duration?.trim()) {
      issues.push({
        id: 'eval_freq_duration', message: 'Frequency & Duration is required', severity: 'error', fixable: true,
        fieldType: 'freq_duration', target: 'document', currentValue: '',
      });
    }

    // ── Client-level fixes ──

    if (!client?.primary_dx_code) {
      issues.push({
        id: 'client_dx', message: 'Primary diagnosis missing', severity: 'error', fixable: true,
        fieldType: 'icd10_search', target: 'client',
      });
    }

    // ── Non-blocking warnings ──

    if (!content.medical_history?.trim()) {
      issues.push({
        id: 'eval_medical_history', message: 'Medical History is empty', severity: 'warning', fixable: true,
        fieldType: 'textarea', target: 'document', currentValue: '',
        hint: 'Enter relevant medical history, surgeries, or medications.',
      });
    }

    if (!client?.gender) {
      issues.push({
        id: 'client_gender', message: 'Client gender is missing', severity: 'warning', fixable: true,
        fieldType: 'select_gender', target: 'client', currentValue: '',
        options: [{ value: 'M', label: 'Male' }, { value: 'F', label: 'Female' }, { value: 'U', label: 'Unknown' }],
      });
    }

    if (!signatureTyped.trim()) {
      issues.push({
        id: 'provider_signature', message: 'Provider signature name not set', severity: 'warning', fixable: false,
        fieldType: 'none', target: 'settings', guidance: 'Update in Settings > Provider Information.',
      });
    }

    if (!practiceInfo?.license_number?.trim()) {
      issues.push({
        id: 'provider_license', message: 'Provider license number not set', severity: 'warning', fixable: false,
        fieldType: 'none', target: 'settings', guidance: 'Update in Settings > Provider Information.',
      });
    }

    // ── Future date prevention ──
    if (evalDate) {
      const evalDateObj = new Date(evalDate + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      if (evalDateObj > today) {
        issues.push({
          id: 'eval_future_date', message: 'Evaluation date cannot be in the future', severity: 'error', fixable: true,
          fieldType: 'date', target: 'document', currentValue: evalDate,
        });
      }
    }

    // ── Backdated note warning ──
    if (evalDate) {
      const evalDateObj = new Date(evalDate + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffDays = Math.floor((today.getTime() - evalDateObj.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays > 7) {
        issues.push({
          id: 'eval_backdated', message: `Evaluation date is ${diffDays} days ago`, severity: 'warning', fixable: false,
          fieldType: 'none', target: 'document',
          guidance: 'Medicare requires timely documentation. If this is intentional, proceed.',
        });
      }
    }

    // ── 8-Minute Rule validation on session note (PT, OT, ST only) ──
    if (sessionNote.time_in && sessionNote.time_out && client?.discipline && eightMinRuleApplies(client.discipline)) {
      const totalMin = calculateTreatmentMinutes(sessionNote.time_in, sessionNote.time_out);
      if (totalMin > 0) {
        const result = validateEightMinuteRule(sessionNote.cpt_codes, totalMin);
        if (!result.valid) {
          issues.push({
            id: 'eight_min_rule_overbill',
            message: result.message || 'Session note: billed units exceed 8-minute rule maximum',
            severity: 'error',
            fixable: false,
            fieldType: 'none',
            target: 'document',
            guidance: 'Adjust your CPT code units or session time to comply with Medicare\'s 8-minute rule.',
          });
        } else if (result.underbilling) {
          issues.push({
            id: 'eight_min_rule_underbill',
            message: result.message || 'Session note: you may be underbilling for documented time',
            severity: 'warning',
            fixable: false,
            fieldType: 'none',
            target: 'document',
            guidance: 'Review your units — you may be leaving reimbursement on the table.',
          });
        }
      }
    }

    // ── Discipline / CPT mismatch on session note ──
    if (client?.discipline && sessionNote.cpt_codes.some(l => l.code?.trim())) {
      const codes = sessionNote.cpt_codes.map(l => l.code).filter(c => c?.trim());
      const mismatches = checkDisciplineCptMismatch(codes, client.discipline);
      if (mismatches.length > 0) {
        issues.push({
          id: 'cpt_discipline_mismatch',
          message: formatMismatchWarning(mismatches),
          severity: 'warning',
          fixable: false,
          fieldType: 'none',
          target: 'document',
          guidance: 'Using CPT codes outside your discipline scope may result in claim denials.',
        });
      }
    }

    // ── Modifier 59 documentation warning on session note ──
    if (snModifiers.includes('59')) {
      issues.push({
        id: 'modifier_59_warning',
        message: 'Modifier 59 (Distinct Procedural Service) requires supporting documentation',
        severity: 'warning',
        fixable: false,
        fieldType: 'none',
        target: 'document',
        guidance: 'Your note must clearly document why the services were distinct and independent. This is a common audit trigger.',
      });
    }

    // ── NPI warning ──
    if (!practiceInfo?.npi?.trim()) {
      issues.push({
        id: 'provider_npi', message: 'Practice NPI is not set', severity: 'warning', fixable: false,
        fieldType: 'none', target: 'settings',
        guidance: 'NPI is required on all Medicare documents. Update in Settings > Practice Information.',
      });
    }

    return issues;
  };

  const handleSignClick = () => {
    const issues = runSignValidation();
    setSignDialogIssues(issues);
    setSignDialogOpen(true);
  };

  /** Handle fix-it sign: apply fixes from dialog, then save+sign */
  const handleSignWithFixes = (fixes: ValidationFixes) => {
    // Apply document fixes to eval content state (for UI display)
    if (Object.keys(fixes.documentFixes).length > 0) {
      setContent(prev => {
        if (!prev) return prev;
        return { ...prev, ...fixes.documentFixes };
      });
    }

    setSignDialogOpen(false);
    // Pass fixes directly into handleSave so they're merged at save time
    // (avoids stale closure where setContent hasn't resolved yet)
    const docFixes = Object.keys(fixes.documentFixes).length > 0 ? fixes.documentFixes : undefined;
    const goalFixes = Object.keys(fixes.goalFixes).length > 0 ? fixes.goalFixes : undefined;
    setTimeout(() => handleSave(true, docFixes, goalFixes), 50);
  };

  /** Save fixes from the Sign dialog WITHOUT signing — stay on page for continued editing */
  const handleSaveFixesOnly = (fixes: ValidationFixes) => {
    // Apply document fixes to eval content state (for UI display)
    if (Object.keys(fixes.documentFixes).length > 0) {
      setContent(prev => {
        if (!prev) return prev;
        return { ...prev, ...fixes.documentFixes };
      });
    }

    setSignDialogOpen(false);
    // Pass fixes directly into handleSave so they're merged at save time.
    // stayOnPage=true prevents navigation so user can continue editing.
    const docFixes = Object.keys(fixes.documentFixes).length > 0 ? fixes.documentFixes : undefined;
    const goalFixes = Object.keys(fixes.goalFixes).length > 0 ? fixes.goalFixes : undefined;
    setTimeout(() => handleSave(false, docFixes, goalFixes, true), 50);
  };

  /** Handle client record updates from Fix-It dialog */
  const handleClientUpdate = async (updates: Record<string, any>) => {
    if (!client) return;
    await window.api.clients.update(client.id, updates);
    const updated = await window.api.clients.get(client.id);
    setClient(updated);
  };

  // ── Eval → Client physician sync ──
  const syncPhysicianToClient = useCallback(async (physician: Physician) => {
    if (!client) return;
    // Already the same physician on client?
    if (client.referring_physician_id === physician.id) return;

    const currentMD = client.referring_physician?.trim();
    if (currentMD && currentMD !== physician.name) {
      const ok = window.confirm(
        `The client chart currently has "${currentMD}" as the referring physician.\n\nUpdate it to "${physician.name}"?`
      );
      if (!ok) return;
    }

    try {
      // Fetch full client record, merge physician fields, then save
      const fullClient = await window.api.clients.get(client.id);
      await window.api.clients.update(client.id, {
        ...fullClient,
        referring_physician: physician.name,
        referring_physician_id: physician.id,
        referring_npi: physician.npi || '',
        referring_fax: physician.fax_number || '',
      });
      const updated = await window.api.clients.get(client.id);
      setClient(updated);
      setToast(`Client chart updated — referring physician set to ${physician.name}`);
    } catch (err) {
      console.error('Failed to sync physician to client:', err);
    }
  }, [client]);

  const clearPhysicianFromClient = useCallback(async () => {
    if (!client) return;
    try {
      const fullClient = await window.api.clients.get(client.id);
      await window.api.clients.update(client.id, {
        ...fullClient,
        referring_physician: '',
        referring_physician_id: null,
        referring_npi: '',
        referring_fax: '',
      });
      const updated = await window.api.clients.get(client.id);
      setClient(updated);
      setToast('Referring physician cleared from client chart');
    } catch (err) {
      console.error('Failed to clear physician from client:', err);
    }
  }, [client]);

  const handleSave = async (sign: boolean, documentFixes?: Record<string, any>, goalFixes?: Record<number, any>, stayOnPage?: boolean) => {
    if (!clientId || !client || !content) return;

    // Cancel any pending auto-save to prevent it from overwriting signed_at
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

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
            baseline: entry.baseline || 0,
            target: entry.target || 0,
            measurement_type: entry.measurement_type || 'percentage',
            baseline_value: entry.baseline_value || '',
            target_value: entry.target_value || '',
            instrument: entry.instrument || '',
            status: 'active',
          });
          // Ensure createdGoalIds array is long enough
          while (createdGoalIds.length <= i) createdGoalIds.push(0);
          createdGoalIds[i] = goal.id;
        }
      }

      // Store goal_entries, created_goal_ids, and session_note in content
      // Merge in any document fixes from the Sign dialog (passed directly to avoid stale closure)
      const contentToSave = {
        ...content,
        ...(documentFixes || {}),
        goal_entries: goalEntries,
        created_goal_ids: createdGoalIds,
        session_note: { ...sessionNote, cpt_modifiers: snModifiers },
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

      let finalEvalId = savedEvalId;
      if (savedEvalId) {
        await window.api.evaluations.update(savedEvalId, evalData);
      } else {
        const created = await window.api.evaluations.create(evalData);
        if (created?.id) {
          setSavedEvalId(created.id);
          finalEvalId = created.id;
          // Link eval back to appointment (marks appointment completed)
          if (appointmentId) {
            try { await window.api.appointments.linkEval(appointmentId, created.id); } catch {}
          }
        }
      }

      // Tag goals as established by this signed eval
      if (sign && finalEvalId) {
        for (let i = 0; i < createdGoalIds.length; i++) {
          const gid = createdGoalIds[i];
          if (!gid) continue;
          try { await window.api.goals.tagSource(gid, finalEvalId, 'eval'); } catch (_) { /* ignore */ }

          // Write baseline as first progress history entry
          const entry = goalEntries[i];
          if (entry && (entry.baseline_value || entry.baseline)) {
            try {
              await window.api.goals.addProgressEntry({
                goal_id: gid,
                client_id: cid,
                recorded_date: evalDate || new Date().toISOString().split('T')[0],
                measurement_type: entry.measurement_type || 'percentage',
                value: entry.baseline_value || `${entry.baseline || 0}`,
                numeric_value: entry.baseline || 0,
                instrument: entry.instrument || '',
                source_type: 'eval',
                source_document_id: finalEvalId,
              });
            } catch (_) { /* ignore */ }
          }
        }
      }

      // Auto-create a billable note if session_note has SOAP content
      if (sign && (sessionNote.subjective?.trim() || sessionNote.objective?.trim() || sessionNote.assessment?.trim() || sessionNote.plan?.trim())) {
        try {
          const filteredCptLines = sessionNote.cpt_codes.filter(l => l.code.trim());
          await window.api.notes.create({
            client_id: cid,
            date_of_service: sessionNote.date_of_service || evalDate,
            time_in: sessionNote.time_in || '',
            time_out: sessionNote.time_out || '',
            units: filteredCptLines.reduce((sum, l) => sum + (l.units || 0), 0) || 1,
            cpt_code: filteredCptLines[0]?.code || '',
            cpt_codes: JSON.stringify(filteredCptLines),
            cpt_modifiers: JSON.stringify(snModifiers),
            place_of_service: (sessionNote.place_of_service || '11') as PlaceOfService,
            subjective: sessionNote.subjective || '',
            objective: sessionNote.objective || '',
            assessment: sessionNote.assessment || '',
            plan: sessionNote.plan || '',
            goals_addressed: JSON.stringify(createdGoalIds.filter(Boolean)),
            signature_image: signatureImage,
            signature_typed: signatureTyped,
            signed_at: new Date().toISOString(),
            note_type: 'soap',
            patient_name: client ? `${client.first_name} ${client.last_name}`.trim() : '',
          });
        } catch (err) {
          console.error('Failed to auto-create session note from eval:', err);
        }
      }

      // Mark form clean to prevent blocker/autosave from overwriting signed_at
      isDirty.current = false;
      if (sign) {
        setExistingSignedAt(new Date().toISOString());
      }
      if (stayOnPage) {
        setToast('Fixes applied — continue editing or try signing again');
      } else if (sign && savedEvalId && client?.referring_fax?.trim()) {
        setToast('Evaluation signed and saved');
        setShowFaxPrompt(true);
      } else {
        setToast(sign ? 'Evaluation signed and saved' : 'Draft saved');
        setTimeout(() => navigate(`/clients/${clientId}`), 500);
      }
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

  const discipline = (client?.discipline || 'PT') as Discipline;
  const objectiveFields = useMemo(() => getObjectiveFields(discipline), [discipline]);

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

  return (
    <div className="overflow-y-auto h-full p-6" ref={scrollContainerRef}>
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-emerald-600 text-white px-4 py-3 rounded-lg shadow-lg">
          <CheckCircle className="w-4 h-4" />
          <span className="text-sm font-medium">{toast}</span>
        </div>
      )}

      {/* Sticky Outline Nav */}
      <EvalOutlineNav
        sections={evalSections}
        activeSectionId={activeSectionId}
        onSectionClick={scrollToSection}
        allExpanded={allExpanded}
        onToggleAll={() => allExpanded ? collapseAll() : expandAll()}
      />

      <div className="max-w-4xl mx-auto mr-48">
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

        {/* Collapse All / Expand All */}
        <div className="flex justify-end mb-3">
          <button
            type="button"
            className="btn-ghost btn-sm gap-1 text-xs"
            onClick={() => allExpanded ? collapseAll() : expandAll()}
          >
            {allExpanded ? (
              <><ChevronRight className="w-3.5 h-3.5" /> Collapse All</>
            ) : (
              <><ChevronDown className="w-3.5 h-3.5" /> Expand All</>
            )}
          </button>
        </div>

        {/* Eval Date */}
        <EvalSectionWrapper
          id="evalDate"
          title="Evaluation Date"
          icon={<CalendarDays className="w-5 h-5" />}
          status={getSectionStatus('evalDate')}
          isExpanded={expandedSections['evalDate'] ?? true}
          onToggle={() => toggleSection('evalDate')}
          sectionRef={(el) => { sectionRefs.current['evalDate'] = el; }}
        >
          <div className="max-w-xs">
            <input
              type="date"
              className="input"
              value={evalDate}
              onChange={(e) => { isDirty.current = true; setEvalDate(e.target.value); }}
            />
          </div>
        </EvalSectionWrapper>

        {/* Referral Source */}
        <EvalSectionWrapper
          id="referralSource"
          title="Referral Source"
          icon={<User className="w-5 h-5" />}
          status={getSectionStatus('referralSource')}
          isExpanded={expandedSections['referralSource'] ?? true}
          onToggle={() => toggleSection('referralSource')}
          sectionRef={(el) => { sectionRefs.current['referralSource'] = el; }}
        >
          {/* Amber sync banner: client chart physician differs from eval */}
          {physicianSyncBanner && (
            <div className="flex items-center gap-2 px-3 py-2 mb-2 rounded-lg bg-amber-50 border border-amber-200 text-sm">
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
              <span className="flex-1 text-amber-800">
                {physicianSyncBanner.cleared
                  ? <>Referring physician was <strong>removed</strong> from the client chart. Clear it from this eval too?</>
                  : <>Client chart was updated to <strong>{physicianSyncBanner.name}</strong>. Update this eval to match?</>
                }
              </span>
              <button
                type="button"
                className="px-2 py-1 text-xs rounded bg-white border border-amber-300 text-amber-700 hover:bg-amber-100"
                onClick={() => setPhysicianSyncBanner(null)}
              >
                Keep Current
              </button>
              <button
                type="button"
                className="px-2 py-1 text-xs rounded bg-amber-500 text-white hover:bg-amber-600"
                onClick={() => {
                  isDirty.current = true;
                  if (physicianSyncBanner.cleared) {
                    setContent(prev => prev ? {
                      ...prev,
                      referral_source: '',
                      referral_physician_id: null,
                      referral_physician_npi: '',
                    } : prev);
                    setToast('Referral source cleared to match client chart');
                  } else {
                    setContent(prev => prev ? {
                      ...prev,
                      referral_source: physicianSyncBanner.name,
                      referral_physician_id: physicianSyncBanner.id ?? null,
                      referral_physician_npi: physicianSyncBanner.npi || '',
                    } : prev);
                    setToast('Referral source updated to match client chart');
                  }
                  setPhysicianSyncBanner(null);
                }}
              >
                {physicianSyncBanner.cleared ? 'Clear' : 'Update'}
              </button>
            </div>
          )}

          <PhysicianCombobox
            value={content.referral_source}
            onChange={(physician, name) => {
              isDirty.current = true;
              if (physician) {
                // Selected a physician from dropdown — store metadata + sync to client
                evalPhysicianIdAtLoad.current = physician.id;
                setContent(prev => prev ? {
                  ...prev,
                  referral_source: physician.name,
                  referral_physician_id: physician.id,
                  referral_physician_npi: physician.npi || '',
                } : prev);
                setPhysicianSyncBanner(null); // Dismiss banner if present
                syncPhysicianToClient(physician);
              } else {
                // Free-text typing — update name, clear physician metadata
                setContent(prev => prev ? {
                  ...prev,
                  referral_source: name,
                  referral_physician_id: null,
                  referral_physician_npi: '',
                } : prev);
                // If field was fully cleared and there was a physician before, offer to clear client too
                if (!name.trim() && (evalPhysicianIdAtLoad.current || client?.referring_physician_id)) {
                  evalPhysicianIdAtLoad.current = null; // prevent re-prompting
                  const ok = window.confirm(
                    `Clear the referring physician from the client chart as well?`
                  );
                  if (ok) {
                    clearPhysicianFromClient();
                  }
                }
              }
            }}
            placeholder="Search physicians or type referral source..."
          />
        </EvalSectionWrapper>

        {/* Medical History */}
        <EvalSectionWrapper
          id="medicalHistory"
          title="Medical History"
          status={getSectionStatus('medicalHistory')}
          isExpanded={expandedSections['medicalHistory'] ?? true}
          onToggle={() => toggleSection('medicalHistory')}
          sectionRef={(el) => { sectionRefs.current['medicalHistory'] = el; }}
          badge={priorFieldKeys.has('medical_history') ? (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">
              UPDATE
            </span>
          ) : undefined}
        >
          <textarea
            className="textarea"
            rows={4}
            placeholder="Pertinent medical history, surgical history, medications..."
            value={content.medical_history}
            onChange={(e) => updateField('medical_history', e.target.value)}
          />
        </EvalSectionWrapper>

        {/* Prior / Current Level of Function */}
        <EvalSectionWrapper
          id="priorLevelOfFunction"
          title={evalType === 'reassessment' ? 'Current Level of Function' : 'Prior Level of Function'}
          status={getSectionStatus('priorLevelOfFunction')}
          isExpanded={expandedSections['priorLevelOfFunction'] ?? true}
          onToggle={() => toggleSection('priorLevelOfFunction')}
          sectionRef={(el) => { sectionRefs.current['priorLevelOfFunction'] = el; }}
        >
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
        </EvalSectionWrapper>

        {/* Current Complaints */}
        <EvalSectionWrapper
          id="currentComplaints"
          title="Current Complaints"
          status={getSectionStatus('currentComplaints')}
          isExpanded={expandedSections['currentComplaints'] ?? true}
          onToggle={() => toggleSection('currentComplaints')}
          sectionRef={(el) => { sectionRefs.current['currentComplaints'] = el; }}
        >
          <textarea
            className="textarea"
            rows={3}
            placeholder="Chief complaint, onset, mechanism of injury, current symptoms..."
            value={content.current_complaints}
            onChange={(e) => updateField('current_complaints', e.target.value)}
          />
        </EvalSectionWrapper>

        {/* Objective Assessment - discipline-specific */}
        <EvalSectionWrapper
          id="objectiveAssessment"
          title="Objective Assessment"
          icon={<Stethoscope className="w-5 h-5" />}
          status={getSectionStatus('objectiveAssessment')}
          isExpanded={expandedSections['objectiveAssessment'] ?? true}
          onToggle={() => toggleSection('objectiveAssessment')}
          sectionRef={(el) => { sectionRefs.current['objectiveAssessment'] = el; }}
          badge={<span className={`badge badge-${discipline.toLowerCase()} ml-1`}>{discipline}</span>}
        >
          <div className="space-y-3">
            {/* Checkbox row to select which fields to fill */}
            <div className="flex flex-wrap gap-2 pb-3 border-b border-gray-200">
              {objectiveFields.map((field) => {
                const isChecked = enabledObjectiveFields.has(field.key);
                const fieldValue = (content.objective_assessment as unknown as Record<string, string>)[field.key] || '';
                return (
                  <label
                    key={field.key}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-colors border ${
                      isChecked
                        ? 'bg-violet-50 border-violet-300 text-violet-800'
                        : 'bg-gray-50 border-gray-200 text-gray-500 hover:border-gray-300'
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="rounded border-gray-300 text-violet-600 focus:ring-violet-500"
                      checked={isChecked}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setEnabledObjectiveFields(prev => new Set([...prev, field.key]));
                          isDirty.current = true;
                        } else if (!fieldValue.trim()) {
                          setEnabledObjectiveFields(prev => {
                            const next = new Set(prev);
                            next.delete(field.key);
                            return next;
                          });
                          isDirty.current = true;
                        }
                      }}
                    />
                    {field.label}
                  </label>
                );
              })}
            </div>

            {/* Only render checked fields */}
            {objectiveFields
              .filter((field) => enabledObjectiveFields.has(field.key))
              .map((field) => (
                <div key={field.key}>
                  <label className="label">{field.label}</label>
                  {field.fieldType === 'pain_scale' ? (
                    <PainScaleInput
                      value={(content.objective_assessment as unknown as Record<string, string>)[field.key] || ''}
                      onChange={(v) => updateObjectiveField(field.key, v)}
                    />
                  ) : (
                    <textarea
                      className="textarea"
                      rows={3}
                      placeholder={`Enter ${field.label.toLowerCase()} findings...`}
                      value={(content.objective_assessment as unknown as Record<string, string>)[field.key] || ''}
                      onChange={(e) => updateObjectiveField(field.key, e.target.value)}
                    />
                  )}
                </div>
              ))}

            {enabledObjectiveFields.size === 0 && (
              <p className="text-sm text-[var(--color-text-secondary)] italic py-2 text-center">
                Check the fields above to add objective assessment data
              </p>
            )}
          </div>
        </EvalSectionWrapper>

        {/* Clinical Impression */}
        <EvalSectionWrapper
          id="clinicalImpression"
          title="Clinical Impression"
          icon={<FileText className="w-5 h-5" />}
          status={getSectionStatus('clinicalImpression')}
          isExpanded={expandedSections['clinicalImpression'] ?? true}
          onToggle={() => toggleSection('clinicalImpression')}
          sectionRef={(el) => { sectionRefs.current['clinicalImpression'] = el; }}
          badge={priorFieldKeys.has('clinical_impression') ? (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">
              UPDATE
            </span>
          ) : undefined}
        >
          <textarea
            className="textarea"
            rows={4}
            placeholder="Clinical impression, diagnosis, prognosis, justification for skilled services..."
            value={content.clinical_impression}
            onChange={(e) => updateField('clinical_impression', e.target.value)}
          />
        </EvalSectionWrapper>

        {/* Rehabilitation Potential / Medical Necessity */}
        <EvalSectionWrapper
          id="rehabPotential"
          title={evalType === 'reassessment'
            ? 'Rehabilitation Potential / Justification for Continued Services'
            : 'Rehabilitation Potential / Medical Necessity'}
          status={getSectionStatus('rehabPotential')}
          isExpanded={expandedSections['rehabPotential'] ?? true}
          onToggle={() => toggleSection('rehabPotential')}
          sectionRef={(el) => { sectionRefs.current['rehabPotential'] = el; }}
        >
          <RehabPotentialSection
            value={content.rehabilitation_potential}
            onChange={(val) => updateField('rehabilitation_potential', val)}
            evalType={evalType}
            hideHeader
          />
        </EvalSectionWrapper>

        {/* Precautions / Contraindications */}
        <EvalSectionWrapper
          id="precautions"
          title="Precautions / Contraindications"
          status={getSectionStatus('precautions')}
          isExpanded={expandedSections['precautions'] ?? true}
          onToggle={() => toggleSection('precautions')}
          sectionRef={(el) => { sectionRefs.current['precautions'] = el; }}
        >
          <textarea
            className="textarea"
            rows={3}
            placeholder="Fall risk, weight-bearing restrictions, cardiac precautions, aspiration risk, swallowing precautions, behavioral considerations..."
            value={content.precautions}
            onChange={(e) => updateField('precautions', e.target.value)}
          />
        </EvalSectionWrapper>

        {/* Goals */}
        <EvalSectionWrapper
          id="goals"
          title="Goals"
          icon={<Target className="w-5 h-5" />}
          status={getSectionStatus('goals')}
          isExpanded={expandedSections['goals'] ?? true}
          onToggle={() => toggleSection('goals')}
          sectionRef={(el) => { sectionRefs.current['goals'] = el; }}
          badge={!existingSignedAt ? (
            <button
              type="button"
              className="btn-ghost btn-sm gap-1 text-xs ml-auto"
              onClick={(e) => {
                e.stopPropagation();
                const newIdx = goalEntries.length;
                updateGoalEntries(prev => {
                  const cat = (CATEGORY_OPTIONS[discipline] || [])[0] || '';
                  const mt = CATEGORY_DEFAULT_MEASUREMENT[cat] || 'percentage';
                  const inst = mt === 'standardized_score' ? (DEFAULT_INSTRUMENTS[cat] || '') : '';
                  return [
                    ...prev,
                    { goal_text: '', goal_type: 'STG' as GoalType, category: cat, target_date: '', measurement_type: mt as MeasurementType, baseline: 0, target: 0, baseline_value: '', target_value: '', instrument: inst, pattern_id: '', components: undefined },
                  ];
                });
                setExpandedGoalIdx(newIdx);
              }}
            >
              <Plus size={14} />
              Add Goal
            </button>
          ) : undefined}
        >
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
            <div className="space-y-2">
              {goalCards.map((card, idx) =>
                expandedGoalIdx === idx ? (
                  <ExpandedGoalCard
                    key={idx}
                    data={card}
                    discipline={discipline as Discipline}
                    patternOverrides={patternOverrides}
                    customPatterns={customGoalPatterns}
                    disabled={!!existingSignedAt}
                    onCollapse={handleGoalCollapse}
                    onFieldChange={(field) => updateGoalField(idx, field)}
                    onComponentChange={(key, value) => handleGoalComponentChange(idx, key, value)}
                    onDelete={!existingSignedAt ? () => handleGoalDelete(idx) : undefined}
                    onPatternSelect={(pattern) => handleGoalPatternSelect(idx, pattern)}
                    onPatternClear={() => handleGoalPatternClear(idx)}
                    onCustomPattern={() => handleGoalCustomPattern(idx)}
                  />
                ) : (
                  <CollapsedGoalCard
                    key={idx}
                    data={card}
                    fingerprint={generateGoalFingerprint(card.pattern_id, card.components, card.category)}
                    onClick={() => setExpandedGoalIdx(idx)}
                  />
                )
              )}
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
        </EvalSectionWrapper>

        {/* Goals Met / Completed */}
        {completedGoals.length > 0 && (
          <EvalSectionWrapper
            id="goalsMet"
            title="Goals Met / Completed"
            icon={<CheckCircle className="w-5 h-5 text-green-500" />}
            status="complete"
            isExpanded={expandedSections['goalsMet'] ?? true}
            onToggle={() => toggleSection('goalsMet')}
            sectionRef={(el) => { sectionRefs.current['goalsMet'] = el; }}
            badge={<span className="text-xs font-normal text-[var(--color-text-secondary)]">({completedGoals.length})</span>}
          >
            <div className="space-y-1.5">
              {completedGoals.map((goal) => (
                <div key={goal.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-green-50/30 border border-green-100">
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                    goal.status === 'met' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>
                    {goal.status === 'met' ? '✓ Met' : "DC'd"}
                  </span>
                  <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${goal.goal_type === 'STG' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
                    {goal.goal_type}
                  </span>
                  <span className="text-xs text-[var(--color-text-secondary)] flex-1">{goal.goal_text}</span>
                  {(goal.baseline > 0 || goal.target > 0) && (
                    <span className="flex items-center gap-1 text-[10px] font-medium shrink-0">
                      <span className="px-1 py-0.5 rounded bg-amber-50 text-amber-600">{goal.baseline}%</span>
                      <span className="text-[var(--color-text-secondary)]">&rarr;</span>
                      <span className="px-1 py-0.5 rounded bg-emerald-50 text-emerald-600">{goal.target}%</span>
                    </span>
                  )}
                  {goal.met_date && <span className="text-[10px] text-green-600 font-medium">{goal.met_date}</span>}
                </div>
              ))}
            </div>
          </EvalSectionWrapper>
        )}

        {/* Treatment Plan */}
        <EvalSectionWrapper
          id="treatmentPlan"
          title="Treatment Plan"
          status={getSectionStatus('treatmentPlan')}
          isExpanded={expandedSections['treatmentPlan'] ?? true}
          onToggle={() => toggleSection('treatmentPlan')}
          sectionRef={(el) => { sectionRefs.current['treatmentPlan'] = el; }}
          badge={priorFieldKeys.has('treatment_plan') ? (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">
              UPDATE
            </span>
          ) : undefined}
        >
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
        </EvalSectionWrapper>

        {/* Frequency & Duration */}
        <EvalSectionWrapper
          id="frequencyDuration"
          title="Frequency & Duration"
          status={getSectionStatus('frequencyDuration')}
          isExpanded={expandedSections['frequencyDuration'] ?? true}
          onToggle={() => toggleSection('frequencyDuration')}
          sectionRef={(el) => { sectionRefs.current['frequencyDuration'] = el; }}
          badge={priorFieldKeys.has('frequency_duration') ? (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">
              UPDATE
            </span>
          ) : undefined}
        >
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
        </EvalSectionWrapper>

        {/* Session Note & Billing */}
        <EvalSectionWrapper
          id="sessionNote"
          title="Session Note & Billing"
          icon={<Receipt className="w-5 h-5" />}
          status={getSectionStatus('sessionNote')}
          isExpanded={expandedSections['sessionNote'] ?? true}
          onToggle={() => toggleSection('sessionNote')}
          sectionRef={(el) => { sectionRefs.current['sessionNote'] = el; }}
        >
          <p className="text-xs text-[var(--color-text-secondary)] mb-4 italic">
            Optional — fill this in to auto-create a billable session note when you sign the eval.
          </p>

          {/* Date / Time row */}
          <div className="grid grid-cols-3 gap-4 mb-4">
            <div>
              <label className="label">Date of Service</label>
              <input
                type="date"
                className="input"
                value={sessionNote.date_of_service || evalDate}
                onChange={(e) => setSessionNote(prev => ({ ...prev, date_of_service: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">Time In</label>
              <input
                type="time"
                className="input"
                value={sessionNote.time_in}
                onChange={(e) => setSessionNote(prev => ({ ...prev, time_in: e.target.value }))}
              />
            </div>
            <div>
              <label className="label">Time Out</label>
              <input
                type="time"
                className="input"
                value={sessionNote.time_out}
                onChange={(e) => setSessionNote(prev => ({ ...prev, time_out: e.target.value }))}
              />
            </div>
          </div>

          {/* CPT Codes */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">CPT Codes & Units</label>
              <button
                type="button"
                className="btn-ghost btn-sm gap-1 text-xs"
                onClick={() => setSessionNote(prev => ({ ...prev, cpt_codes: [...prev.cpt_codes, { code: '', units: 1 }] }))}
              >
                <Plus size={14} />
                Add CPT Code
              </button>
            </div>
            <div className="space-y-2">
              {sessionNote.cpt_codes.map((line, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <CptCombobox
                    value={line.code}
                    onChange={(code) => setSessionNote(prev => ({
                      ...prev,
                      cpt_codes: prev.cpt_codes.map((l, i) => i === idx ? { ...l, code } : l),
                    }))}
                    placeholder="Search CPT code..."
                    className="flex-1"
                  />
                  <div className="w-24">
                    <input
                      type="number"
                      className="input text-center"
                      min={1}
                      value={line.units}
                      onChange={(e) => setSessionNote(prev => ({
                        ...prev,
                        cpt_codes: prev.cpt_codes.map((l, i) => i === idx ? { ...l, units: parseInt(e.target.value, 10) || 1 } : l),
                      }))}
                    />
                  </div>
                  <span className="text-xs text-[var(--color-text-secondary)] w-10">units</span>
                  {sessionNote.cpt_codes.length > 1 && (
                    <button
                      type="button"
                      className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                      onClick={() => setSessionNote(prev => ({
                        ...prev,
                        cpt_codes: prev.cpt_codes.filter((_, i) => i !== idx),
                      }))}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* 8-Minute Rule Real-Time Indicator (Session Note) */}
          {client?.discipline && eightMinRuleApplies(client.discipline) && (() => {
            const totalMin = calculateTreatmentMinutes(sessionNote.time_in, sessionNote.time_out);
            if (totalMin <= 0) return null;
            const result = validateEightMinuteRule(sessionNote.cpt_codes, totalMin);
            const indicator = formatIndicatorSummary(result);
            if (!indicator) return null;
            const colorClasses = {
              green: 'bg-emerald-50 border-emerald-200 text-emerald-700',
              red: 'bg-red-50 border-red-200 text-red-700',
              amber: 'bg-amber-50 border-amber-200 text-amber-700',
            };
            return (
              <div className={`mb-4 px-3 py-2 rounded-lg border text-xs font-medium flex items-center gap-2 ${colorClasses[indicator.color]}`}>
                <span>{indicator.icon}</span>
                <span>{indicator.text}</span>
              </div>
            );
          })()}

          {/* Billing Fields row */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="label">Place of Service</label>
              <select
                className="select"
                value={sessionNote.place_of_service}
                onChange={(e) => setSessionNote(prev => ({ ...prev, place_of_service: e.target.value }))}
              >
                {PLACE_OF_SERVICE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Modifiers</label>
              <select
                className="select"
                value=""
                onChange={(e) => {
                  if (e.target.value && !snModifiers.includes(e.target.value)) {
                    setSnModifiers(prev => [...prev, e.target.value]);
                  }
                  e.target.value = '';
                }}
              >
                <option value="">Add modifier...</option>
                {MODIFIER_OPTIONS.filter(m => !snModifiers.includes(m.value)).map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              {snModifiers.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {snModifiers.map((mod) => {
                    const modInfo = MODIFIER_OPTIONS.find(m => m.value === mod);
                    return (
                      <span
                        key={mod}
                        className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs cursor-help"
                        title={modInfo?.tooltip}
                      >
                        {mod}
                        <button
                          type="button"
                          className="hover:text-blue-900"
                          onClick={() => setSnModifiers(prev => prev.filter(m => m !== mod))}
                        >
                          <X size={12} />
                        </button>
                      </span>
                    );
                  })}
                </div>
              )}
            </div>
          </div>

          {/* SOAP sections with full features */}
          <div className="border-t border-[var(--color-border)] pt-4 space-y-3">
            <p className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">SOAP Note</p>
            {([
              { code: 'S' as SOAPSection, label: 'Subjective', field: 'subjective' as const, ref: snSubjectiveRef, btnRef: snSubjectiveBtnRef, placeholder: "Patient's reported symptoms, complaints, and history..." },
              { code: 'O' as SOAPSection, label: 'Objective', field: 'objective' as const, ref: snObjectiveRef, btnRef: snObjectiveBtnRef, placeholder: 'Measurable observations, test results, vitals...' },
              { code: 'A' as SOAPSection, label: 'Assessment', field: 'assessment' as const, ref: snAssessmentRef, btnRef: snAssessmentBtnRef, placeholder: 'Clinical interpretation and progress toward goals...' },
              { code: 'P' as SOAPSection, label: 'Plan', field: 'plan' as const, ref: snPlanRef, btnRef: snPlanBtnRef, placeholder: 'Treatment plan, next steps, follow-up...' },
            ]).map(({ code, label, field, ref, btnRef, placeholder }) => (
              <div key={code} className={`rounded-lg p-3 ${SOAP_SECTION_TINT[code]}`}>
                <div className="flex items-center justify-between mb-2">
                  <label className="label text-xs mb-0 font-semibold">{label}</label>
                  <div className="relative">
                    <button
                      ref={btnRef}
                      type="button"
                      className="btn-ghost btn-sm flex items-center gap-1 text-[10px]"
                      onClick={() => setSnNoteBankOpen(snNoteBankOpen === code ? null : code)}
                    >
                      <BookOpen className="w-3 h-3" />
                      Note Bank
                    </button>
                    <NoteBankPopover
                      isOpen={snNoteBankOpen === code}
                      onClose={() => setSnNoteBankOpen(null)}
                      onInsert={getSnInsertHandler(code)}
                      discipline={discipline}
                      section={code}
                      anchorRef={btnRef}
                    />
                  </div>
                </div>
                <div className="mb-2">
                  <QuickChips
                    discipline={discipline}
                    section={code}
                    onInsert={getSnInsertHandler(code)}
                    maxChips={5}
                    onOpenFullBank={() => setSnNoteBankOpen(code)}
                  />
                </div>
                <SmartTextarea
                  ref={ref}
                  className="textarea text-sm"
                  rows={3}
                  placeholder={placeholder}
                  value={sessionNote[field]}
                  onChange={(val) => setSessionNote(prev => ({ ...prev, [field]: val }))}
                  discipline={discipline}
                  section={code}
                  disabled={Boolean(existingSignedAt)}
                />
              </div>
            ))}
          </div>
        </EvalSectionWrapper>

        {/* Signature */}
        <EvalSectionWrapper
          id="signature"
          title="Signature"
          icon={<PenLine className="w-5 h-5" />}
          status={getSectionStatus('signature')}
          isExpanded={expandedSections['signature'] ?? true}
          onToggle={() => toggleSection('signature')}
          sectionRef={(el) => { sectionRefs.current['signature'] = el; }}
        >
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
        </EvalSectionWrapper>

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
          {!existingSignedAt && (
          <button
            className="btn-primary flex items-center gap-2"
            onClick={() => handleSave(false)}
            disabled={saving}
          >
            <Save className="w-4 h-4" />
            {saving ? 'Saving...' : 'Save Draft'}
          </button>
          )}
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
        onConfirm={handleSignWithFixes}
        onSaveAndClose={handleSaveFixesOnly}
        issues={signDialogIssues}
        onClientUpdate={handleClientUpdate}
        clientName={client ? `${client.first_name} ${client.last_name}`.trim() : undefined}
      />

      <FaxPrompt
        isOpen={showFaxPrompt}
        onClose={() => {
          setShowFaxPrompt(false);
          navigate(`/clients/${clientId}`);
        }}
        clientId={parseInt(clientId!, 10)}
        clientName={client ? `${client.first_name} ${client.last_name}`.trim() : ''}
        physicianName={client?.referring_physician || ''}
        physicianId={client?.referring_physician_id || undefined}
        faxNumber={client?.referring_fax || ''}
        documentType="eval"
        documentId={savedEvalId!}
        onFaxSent={async () => {
          try {
            await window.api.compliance.updateSignatureStatus(parseInt(clientId!, 10), 'sent');
          } catch (err) {
            console.error('Failed to advance recert stepper:', err);
          }
        }}
      />
    </div>
  );
}
