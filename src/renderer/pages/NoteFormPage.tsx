import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation, useBlocker, useSearchParams } from 'react-router-dom';
import { useSectionColor } from '../hooks/useSectionColor';
import {
  ArrowLeft,
  FileText,
  Clock,
  Save,
  CheckCircle,
  PanelRightOpen,
  PanelRightClose,
  BookOpen,
  Target,
  History,
  ChevronDown,
  ChevronRight,
  Clipboard,
  Plus,
  X,
  PenLine,
  Trash2,
  Receipt,
  DollarSign,
  CreditCard,
  Flag,
  TrendingUp,
  ClipboardCheck,
  LogOut,
  Archive,
  AlertTriangle,
} from 'lucide-react';
import type { Client, Note, Goal, GoalStatus, Discipline, SOAPSection, NoteFormat, CptLine, PlaceOfService, ContractedEntity, EntityFeeSchedule, StagedGoal, ProgressReportGoalStatus, ProgressReportData, ComplianceTracking, VisitType, Evaluation, NoteMode, DischargeData, DischargeGoalStatus, DischargeReason, DischargeRecommendation, EpisodeSummary, MeasurementType } from '../../shared/types';
import { getPatternCategories } from '../../shared/goal-patterns';
import { NOTE_FORMAT_SECTIONS, PROGRESS_REPORT_GOAL_STATUS_LABELS, DISCHARGE_REASON_LABELS, DISCHARGE_GOAL_STATUS_LABELS, DISCHARGE_RECOMMENDATION_LABELS, MEASUREMENT_TYPE_LABELS } from '../../shared/types';
import { formatMetricValue } from '../../shared/compose-goal-text';
import MeasurementChips from '../components/MeasurementChips';
import GoalProgressBar from '../components/GoalProgressBar';
import { METRIC_OPTIONS, calculateProgress, getMetricDirection } from '../../shared/goal-metrics';
import type { ValidationIssue, ValidationFixes } from '../../shared/types/validation';
import SignConfirmDialog from '../components/SignConfirmDialog';
import CptCombobox from '../components/CptCombobox';

// Place of service options
const PLACE_OF_SERVICE_OPTIONS = [
  { value: '11', label: 'Office' },
  { value: '12', label: 'Home' },
  { value: '02', label: 'Telehealth' },
  { value: '10', label: 'Telehealth (Patient Home)' },
  { value: '22', label: 'Outpatient Hospital' },
  { value: '31', label: 'Skilled Nursing Facility' },
];

// Common modifiers for therapy
const MODIFIER_OPTIONS = [
  { value: 'GN', label: 'GN - Speech-Language Pathology', tooltip: 'Identifies services delivered under a speech-language pathology plan of care.' },
  { value: 'GO', label: 'GO - Occupational Therapy', tooltip: 'Identifies services delivered under an occupational therapy plan of care.' },
  { value: 'GP', label: 'GP - Physical Therapy', tooltip: 'Identifies services delivered under a physical therapy plan of care.' },
  { value: '59', label: '59 - Distinct Procedural Service', tooltip: 'Indicates a procedure/service that is distinct from other services on the same day.' },
  { value: 'KX', label: 'KX - Requirements Met', tooltip: 'Certifies that Medicare therapy threshold requirements are met and services are medically necessary. Required when billed charges exceed the annual therapy cap.' },
  { value: '76', label: '76 - Repeat Procedure Same Physician', tooltip: 'Indicates a procedure was repeated by the same physician on the same day.' },
  { value: '77', label: '77 - Repeat Procedure Different Physician', tooltip: 'Indicates a procedure was repeated by a different physician on the same day.' },
  { value: 'CO', label: 'CO - Concurrent Outpatient Rehab', tooltip: 'Identifies concurrent outpatient rehabilitation services.' },
];
import NoteBankPopover from '../components/NoteBankPopover';
import SmartTextarea from '../components/SmartTextarea';

import QuickChips from '../components/QuickChips';
import { useTier } from '../hooks/useTier';

// ── Helpers ──

function todayISO(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function addMinutesToTime(time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + minutes;
  const newH = Math.floor(total / 60) % 24;
  const newM = total % 60;
  return `${String(newH).padStart(2, '0')}:${String(newM).padStart(2, '0')}`;
}

function calculateUnits(timeIn: string, timeOut: string): number {
  if (!timeIn || !timeOut) return 0;
  const [hIn, mIn] = timeIn.split(':').map(Number);
  const [hOut, mOut] = timeOut.split(':').map(Number);
  const totalMinutes = hOut * 60 + mOut - (hIn * 60 + mIn);
  if (totalMinutes <= 0) return 0;
  return Math.ceil(totalMinutes / 15);
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// ── Component ──

export default function NoteFormPage() {
  const { id: clientId, noteId } = useParams<{ id: string; noteId?: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const sectionColor = useSectionColor();
  const { isPro } = useTier();
  const isEditing = Boolean(noteId);

  // Appointment context passed from calendar or discharge navigation
  const apptState = (location.state as {
    appointmentDate?: string;
    appointmentTime?: string;
    appointmentDuration?: number;
    noteMode?: NoteMode;
    standalone?: boolean;
  }) || {};

  const isStandaloneDischarge = apptState.standalone === true && apptState.noteMode === 'discharge';
  const [searchParams] = useSearchParams();
  const queryType = searchParams.get('type'); // 'progress_report' | 'discharge' | null

  // Data
  const [client, setClient] = useState<Client | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [recentNotes, setRecentNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [signDialogOpen, setSignDialogOpen] = useState(false);
  const [signDialogIssues, setSignDialogIssues] = useState<ValidationIssue[]>([]);

  // Form state — pre-fill from appointment context if available
  const [dateOfService, setDateOfService] = useState(apptState.appointmentDate || todayISO());
  const [timeIn, setTimeIn] = useState(apptState.appointmentTime || '');
  const [timeOut, setTimeOut] = useState(
    apptState.appointmentTime && apptState.appointmentDuration
      ? addMinutesToTime(apptState.appointmentTime, apptState.appointmentDuration)
      : ''
  );
  const [cptLines, setCptLines] = useState<CptLine[]>([{ code: '', units: 1 }]);
  const [subjective, setSubjective] = useState('');
  const [objective, setObjective] = useState('');
  const [assessment, setAssessment] = useState('');
  const [plan, setPlan] = useState('');
  const [goalsAddressed, setGoalsAddressed] = useState<number[]>([]);
  const [signatureImage, setSignatureImage] = useState('');
  const [signatureTyped, setSignatureTyped] = useState('');
  const [existingSignedAt, setExistingSignedAt] = useState('');
  // V2/V3 Billing fields
  const [placeOfService, setPlaceOfService] = useState<PlaceOfService>('11');
  const [cptModifiers, setCptModifiers] = useState<string[]>([]);
  const [chargeAmount, setChargeAmount] = useState<number>(0);

  // Practice info (for validation)
  const [practiceInfo, setPracticeInfo] = useState<{ license_number?: string } | null>(null);

  // Contracted entity state
  const [isContractedVisit, setIsContractedVisit] = useState(false);
  const [entityId, setEntityId] = useState<number | null>(null);
  const [entities, setEntities] = useState<ContractedEntity[]>([]);
  const [entityFeeSchedule, setEntityFeeSchedule] = useState<EntityFeeSchedule[]>([]);
  const [rateOverride, setRateOverride] = useState<number | null>(null);
  const [rateOverrideReason, setRateOverrideReason] = useState('');
  const [noteType, setNoteType] = useState('');
  const [patientName, setPatientName] = useState('');

  // UI state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedNoteIds, setExpandedNoteIds] = useState<Set<number>>(new Set());

  // Note format
  const [noteFormat, setNoteFormat] = useState<NoteFormat>('SOAP');

  // Note bank popover state
  const [noteBankOpen, setNoteBankOpen] = useState<SOAPSection | null>(null);

  // Delete state
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Post-sign state
  const [justSigned, setJustSigned] = useState(false);
  const [savedNoteId, setSavedNoteId] = useState<number | null>(null);
  const [showProNudge, setShowProNudge] = useState(false);

  // Autosave state
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [lastAutoSaved, setLastAutoSaved] = useState<string | null>(null);
  const [creatingInvoice, setCreatingInvoice] = useState(false);
  const [existingInvoice, setExistingInvoice] = useState<{ invoice_id: number; invoice_number: string; status: string } | null>(null);

  // Refs for textareas (for cursor insertion)
  const subjectiveRef = useRef<HTMLTextAreaElement>(null);
  const objectiveRef = useRef<HTMLTextAreaElement>(null);
  const assessmentRef = useRef<HTMLTextAreaElement>(null);
  const planRef = useRef<HTMLTextAreaElement>(null);

  // Refs for note bank buttons (positioning)
  const subjectiveBtnRef = useRef<HTMLButtonElement>(null);
  const objectiveBtnRef = useRef<HTMLButtonElement>(null);
  const assessmentBtnRef = useRef<HTMLButtonElement>(null);
  const planBtnRef = useRef<HTMLButtonElement>(null);

  // Staged goals state
  const [stagedGoals, setStagedGoals] = useState<StagedGoal[]>([]);
  const [showStagedForm, setShowStagedForm] = useState(false);
  const [stagedGoalText, setStagedGoalText] = useState('');
  const [stagedGoalType, setStagedGoalType] = useState<'STG' | 'LTG'>('STG');
  const [stagedGoalCategory, setStagedGoalCategory] = useState('');
  const [stagedGoalRationale, setStagedGoalRationale] = useState('');
  const [patternCategories, setPatternCategories] = useState<string[]>([]);
  const [treatmentPlanSummary, setTreatmentPlanSummary] = useState<{ treatmentPlan: string; frequencyDuration: string } | null>(null);

  // Note mode state (replaces isProgressReport boolean)
  // Priority: standalone discharge > query param > default soap
  const initialNoteMode: NoteMode = isStandaloneDischarge ? 'discharge'
    : (queryType === 'progress_report' || queryType === 'discharge') ? queryType
    : 'soap';
  const [noteMode, setNoteMode] = useState<NoteMode>(initialNoteMode);
  const isProgressReport = noteMode === 'progress_report';
  const isDischarge = noteMode === 'discharge';

  // Addressed goal categories for Quick Chips intelligence
  const addressedCategories = useMemo(() => {
    if (!goals || goalsAddressed.length === 0) return [];
    return [...new Set(
      goals
        .filter(g => goalsAddressed.includes(g.id))
        .map(g => g.category)
        .filter(Boolean)
    )];
  }, [goals, goalsAddressed]);

  // Discharge state
  const [dischargeData, setDischargeData] = useState<DischargeData>({
    discharge_reason: 'goals_met' as DischargeReason,
    discharge_reason_detail: '',
    start_of_care: '',
    discharge_date: '',
    total_visits: 0,
    frequency_per_week: null,
    duration_weeks: null,
    frequency_notes: '',
    primary_dx: '',
    discipline: '',
    prior_level_of_function: '',
    current_level_of_function: '',
    recommendations: [],
    referral_to: '',
    return_to_therapy_if: '',
    equipment_details: '',
    additional_recommendations: '',
    is_standalone: isStandaloneDischarge,
  });
  const [dischargeGoals, setDischargeGoals] = useState<{
    goal_id: number;
    goal_text_snapshot: string;
    goal_type: string;
    status_at_report: string;
    performance_data: string;
    clinical_notes: string;
    is_new_goal: boolean;
    is_staged_promotion: boolean;
    staged_goal_id: number | null;
    baseline_snapshot: number;
    target_snapshot: number;
    measurement_type?: MeasurementType;
    current_value?: string;
    current_numeric?: number;
    baseline_value_snapshot?: string;
    target_value_snapshot?: string;
  }[]>([]);
  const [complianceData, setComplianceData] = useState<ComplianceTracking | null>(null);
  const [progressReportGoals, setProgressReportGoals] = useState<{
    goal_id: number;
    goal_text_snapshot: string;
    goal_type: string;
    status_at_report: ProgressReportGoalStatus;
    performance_data: string;
    clinical_notes: string;
    is_new_goal: boolean;
    is_staged_promotion: boolean;
    staged_goal_id: number | null;
    baseline_snapshot: number;
    target_snapshot: number;
    measurement_type?: MeasurementType;
    current_value?: string;
    current_numeric?: number;
    baseline_value_snapshot?: string;
    target_value_snapshot?: string;
  }[]>([]);
  const [clinicalSummary, setClinicalSummary] = useState('');
  const [continuedTreatmentJustification, setContinuedTreatmentJustification] = useState('');
  const [planOfCareUpdate, setPlanOfCareUpdate] = useState('');
  const [prFrequencyPerWeek, setPrFrequencyPerWeek] = useState<number | null>(null);
  const [prDurationWeeks, setPrDurationWeeks] = useState<number | null>(null);

  // ── Data Loading ──

  const loadData = useCallback(async () => {
    if (!clientId) return;
    try {
      setLoading(true);
      const cid = parseInt(clientId, 10);

      const [clientData, goalsData, notesData, entitiesData, noteFormatVal, stagedGoalsData, complianceResult, practiceData] = await Promise.all([
        window.api.clients.get(cid),
        window.api.goals.listByClient(cid),
        window.api.notes.listByClient(cid),
        window.api.contractedEntities.list().catch(() => [] as ContractedEntity[]),
        window.api.settings.get('note_format').catch(() => null),
        window.api.stagedGoals.listByClient(cid),
        window.api.compliance.getByClient(cid).catch(() => null),
        window.api.practice.get().catch(() => null),
      ]);
      if (practiceData) setPracticeInfo(practiceData);

      if (noteFormatVal) setNoteFormat(noteFormatVal as NoteFormat);
      setStagedGoals(stagedGoalsData);
      setComplianceData(complianceResult);

      setEntities(entitiesData);

      setClient(clientData);
      setGoals(goalsData);

      // Derive categories from goal patterns
      setPatternCategories(getPatternCategories(clientData.discipline as Discipline));

      // Load latest eval's treatment plan for header context
      try {
        const evals = await window.api.evaluations.listByClient(cid) as Evaluation[];
        const signedEvals = evals.filter(e => e.signed_at).sort((a, b) =>
          new Date(b.eval_date).getTime() - new Date(a.eval_date).getTime()
        );
        const latestEval = signedEvals[0] || evals.sort((a, b) =>
          new Date(b.eval_date).getTime() - new Date(a.eval_date).getTime()
        )[0];
        if (latestEval?.content) {
          const parsed = JSON.parse(latestEval.content);
          if (parsed.treatment_plan || parsed.frequency_duration) {
            setTreatmentPlanSummary({
              treatmentPlan: parsed.treatment_plan || '',
              frequencyDuration: parsed.frequency_duration || '',
            });
          }
        }
      } catch { /* eval lookup not critical */ }

      // Sort notes by date descending, take last 3
      const sortedNotes = notesData.sort(
        (a: Note, b: Note) =>
          new Date(b.date_of_service).getTime() - new Date(a.date_of_service).getTime()
      );
      setRecentNotes(sortedNotes.slice(0, 3));

      // Pre-fill CPT code from client defaults
      if (!isEditing) {
        setCptLines([{ code: clientData.default_cpt_code || '', units: 1 }]);
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

      // If editing, load the note
      if (noteId) {
        setSavedNoteId(parseInt(noteId, 10));
        // Check if this note already has an invoice
        try {
          const invoiceStatuses = await window.api.invoices.noteStatuses();
          const noteIdNum = parseInt(noteId, 10);
          if (invoiceStatuses[noteIdNum]) {
            setExistingInvoice(invoiceStatuses[noteIdNum]);
          }
        } catch {}
        const note = await window.api.notes.get(parseInt(noteId, 10));
        setDateOfService(note.date_of_service || todayISO());
        setTimeIn(note.time_in || '');
        setTimeOut(note.time_out || '');
        // Load CPT lines with backward compatibility
        let loadedCptLines: CptLine[] = [];
        try {
          const parsed = JSON.parse(note.cpt_codes || '[]');
          if (Array.isArray(parsed) && parsed.length > 0) loadedCptLines = parsed;
        } catch {}
        if (loadedCptLines.length === 0 && note.cpt_code) {
          loadedCptLines = [{ code: note.cpt_code, units: note.units || 1 }];
        }
        if (loadedCptLines.length > 0) setCptLines(loadedCptLines);
        setSubjective(note.subjective || '');
        setObjective(note.objective || '');
        setAssessment(note.assessment || '');
        setPlan(note.plan || '');
        try {
          const parsedGoals = JSON.parse(note.goals_addressed || '[]');
          setGoalsAddressed(parsedGoals);
        } catch {
          setGoalsAddressed([]);
        }
        setExistingSignedAt(note.signed_at || '');
        // For unsigned drafts with no saved signature, pre-fill from settings
        if (note.signature_image) {
          setSignatureImage(note.signature_image);
          setSignatureTyped(note.signature_typed || '');
        } else if (!note.signed_at) {
          const [sigNameEdit, sigCredsEdit, sigImageEdit] = await Promise.all([
            window.api.settings.get('signature_name'),
            window.api.settings.get('signature_credentials'),
            window.api.settings.get('signature_image'),
          ]);
          const typedEdit = [sigNameEdit, sigCredsEdit].filter(Boolean).join(', ');
          setSignatureTyped(note.signature_typed || typedEdit);
          if (sigImageEdit) setSignatureImage(sigImageEdit);
        } else {
          setSignatureTyped(note.signature_typed || '');
        }
        // V2/V3 Billing fields
        setPlaceOfService((note.place_of_service as PlaceOfService) || '11');
        setChargeAmount(note.charge_amount || 0);
        try {
          const parsedModifiers = JSON.parse(note.cpt_modifiers || '[]');
          setCptModifiers(Array.isArray(parsedModifiers) ? parsedModifiers : []);
        } catch {
          setCptModifiers([]);
        }
        // Entity fields
        if (note.entity_id) {
          setIsContractedVisit(true);
          setEntityId(note.entity_id);
          setPatientName(note.patient_name || '');
          setRateOverride(note.rate_override ?? null);
          setRateOverrideReason(note.rate_override_reason || '');
          setNoteType(note.note_type || '');
          // Load fee schedule for entity
          try {
            const fees = await window.api.contractedEntities.listFeeSchedule(note.entity_id);
            setEntityFeeSchedule(fees);
          } catch {}
        }

        // Progress report fields
        if (note.note_type === 'progress_report') {
          setNoteMode('progress_report');
          try {
            const prData: ProgressReportData = JSON.parse(note.progress_report_data || '{}');
            setClinicalSummary(prData.clinical_summary || '');
            setContinuedTreatmentJustification(prData.continued_treatment_justification || '');
            setPlanOfCareUpdate(prData.plan_of_care_update || '');
            setPrFrequencyPerWeek(prData.frequency_per_week ?? null);
            setPrDurationWeeks(prData.duration_weeks ?? null);
          } catch {}
          try {
            const prGoals = await window.api.progressReportGoals.listByNote(parseInt(noteId, 10));
            setProgressReportGoals(prGoals.map((g: any) => ({
              goal_id: g.goal_id,
              goal_text_snapshot: g.goal_text_snapshot,
              goal_type: g.goal_type || 'STG',
              status_at_report: g.status_at_report,
              performance_data: g.performance_data || '',
              clinical_notes: g.clinical_notes || '',
              is_new_goal: g.is_new_goal || false,
              is_staged_promotion: g.is_staged_promotion || false,
              staged_goal_id: g.staged_goal_id || null,
              baseline_snapshot: g.baseline_snapshot ?? 0,
              target_snapshot: g.target_snapshot ?? 0,
              measurement_type: g.measurement_type || 'percentage',
              current_value: g.current_value || '',
              current_numeric: g.current_numeric ?? 0,
              baseline_value_snapshot: g.baseline_value_snapshot || '',
              target_value_snapshot: g.target_value_snapshot || '',
            })));
          } catch {}
        }

        // Discharge fields
        if (note.note_type === 'discharge') {
          setNoteMode('discharge');
          try {
            const dcData: DischargeData = JSON.parse(note.discharge_data || '{}');
            setDischargeData(dcData);
          } catch {}
          try {
            const dcGoals = await window.api.progressReportGoals.listByNote(parseInt(noteId, 10));
            setDischargeGoals(dcGoals.map((g: any) => ({
              goal_id: g.goal_id,
              goal_text_snapshot: g.goal_text_snapshot,
              goal_type: g.goal_type || 'STG',
              status_at_report: g.status_at_report || '',
              performance_data: g.performance_data || '',
              clinical_notes: g.clinical_notes || '',
              is_new_goal: false,
              is_staged_promotion: false,
              staged_goal_id: null,
              baseline_snapshot: g.baseline_snapshot ?? 0,
              target_snapshot: g.target_snapshot ?? 0,
              measurement_type: g.measurement_type || 'percentage',
              current_value: g.current_value || '',
              current_numeric: g.current_numeric ?? 0,
              baseline_value_snapshot: g.baseline_value_snapshot || '',
              target_value_snapshot: g.target_value_snapshot || '',
            })));
          } catch {}
        }
      }
    } catch (err) {
      console.error('Failed to load data:', err);
    } finally {
      setLoading(false);
    }
  }, [clientId, noteId, isEditing]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // ── Auto-populate charge amount from fee schedule ──
  useEffect(() => {
    const validLines = cptLines.filter(l => l.code?.trim() && l.code.trim().length >= 4);
    if (validLines.length === 0) return;

    (async () => {
      try {
        const fees = await window.api.feeSchedule.list();
        let total = 0;
        let anyMatch = false;
        for (const line of cptLines) {
          const code = line.code?.trim();
          if (!code || code.length < 4) continue;
          const match = fees.find((f: any) => f.cpt_code === code);
          if (match && match.amount) {
            total += match.amount * (line.units || 1);
            anyMatch = true;
          }
        }
        if (anyMatch) {
          setChargeAmount(Math.round(total * 100) / 100);
        }
      } catch {
        // Silently fail - fee schedule lookup is optional
      }
    })();
  }, [cptLines]);

  // ── Unsaved changes detection ──
  const hasFormContent = Boolean(
    subjective.trim() || objective.trim() || assessment.trim() || plan.trim()
  );

  // Track if form has been saved
  const [formSaved, setFormSaved] = useState(false);
  const hasUnsavedChanges = hasFormContent && !formSaved;

  // Save on window close (fire-and-forget, don't block close)
  useEffect(() => {
    const handler = () => {
      if (hasUnsavedChanges && !existingSignedAt) {
        performAutoSaveRef.current();
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasUnsavedChanges, existingSignedAt]);

  // Keep a ref to the latest performAutoSave so useBlocker can call it
  const performAutoSaveRef = useRef<() => Promise<void>>(async () => {});

  // Block React Router navigation and auto-save before leaving
  const noteBlocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      hasUnsavedChanges && !existingSignedAt && currentLocation.pathname !== nextLocation.pathname
  );

  useEffect(() => {
    if (noteBlocker.state === 'blocked') {
      performAutoSaveRef.current().then(() => {
        noteBlocker.proceed();
      }).catch(() => {
        noteBlocker.proceed();
      });
    }
  }, [noteBlocker]);

  // ── Autosave (debounced 3s) ──
  const performAutoSave = useCallback(async () => {
    if (!clientId || !client || existingSignedAt) return;
    if (!subjective.trim() && !objective.trim() && !assessment.trim() && !plan.trim()) return;

    try {
      const filteredCptLines = cptLines.filter(l => l.code.trim());
      const noteData: Partial<Note> = {
        client_id: parseInt(clientId, 10),
        date_of_service: dateOfService,
        time_in: timeIn,
        time_out: timeOut,
        units: filteredCptLines.reduce((sum, l) => sum + (l.units || 0), 0),
        cpt_code: filteredCptLines[0]?.code || '',
        cpt_codes: JSON.stringify(filteredCptLines),
        cpt_modifiers: JSON.stringify(cptModifiers),
        place_of_service: placeOfService,
        charge_amount: chargeAmount,
        subjective,
        objective,
        assessment,
        plan,
        goals_addressed: JSON.stringify(goalsAddressed),
        signature_image: '',
        signature_typed: '',
        signed_at: '',
        entity_id: isContractedVisit ? entityId ?? undefined : undefined,
        rate_override: isContractedVisit ? rateOverride ?? undefined : undefined,
        rate_override_reason: isContractedVisit ? rateOverrideReason : '',
        note_type: noteMode !== 'soap' ? noteMode as Note['note_type'] : (isContractedVisit ? noteType as Note['note_type'] : 'soap' as Note['note_type']),
        progress_report_data: isProgressReport ? JSON.stringify({
          clinical_summary: clinicalSummary,
          continued_treatment_justification: continuedTreatmentJustification,
          frequency_per_week: prFrequencyPerWeek,
          duration_weeks: prDurationWeeks,
          plan_of_care_update: planOfCareUpdate,
          report_period_start: complianceData?.last_progress_date || '',
          report_period_end: dateOfService,
          visits_in_period: complianceData?.visits_since_last_progress || 0,
        } as ProgressReportData) : '',
        discharge_data: isDischarge ? JSON.stringify(dischargeData) : '',
        patient_name: isContractedVisit ? patientName : '',
      };

      // Standalone discharge: zero out billing fields
      if (isStandaloneDischarge) {
        noteData.charge_amount = 0;
        noteData.cpt_code = '';
        noteData.cpt_codes = '[]';
        noteData.time_in = '';
        noteData.time_out = '';
        noteData.units = 0;
      }

      if (savedNoteId) {
        await window.api.notes.update(savedNoteId, noteData);
      } else {
        const created = await window.api.notes.create(noteData);
        if (created?.id) setSavedNoteId(created.id);
      }
      setLastAutoSaved(new Date().toLocaleTimeString());
    } catch (err) {
      console.error('Auto-save failed:', err);
    }
  }, [clientId, client, existingSignedAt, subjective, objective, assessment, plan, dateOfService, timeIn, timeOut, cptLines, cptModifiers, placeOfService, chargeAmount, goalsAddressed, savedNoteId, isContractedVisit, entityId, rateOverride, rateOverrideReason, noteType, patientName, noteMode, isProgressReport, isDischarge, clinicalSummary, continuedTreatmentJustification, planOfCareUpdate, prFrequencyPerWeek, prDurationWeeks, complianceData, dischargeData, isStandaloneDischarge]);

  // Keep ref current for the navigation blocker
  performAutoSaveRef.current = performAutoSave;

  // Debounced auto-save: triggers 3 seconds after any content change
  useEffect(() => {
    if (loading || existingSignedAt) return;
    if (!subjective.trim() && !objective.trim() && !assessment.trim() && !plan.trim()) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      performAutoSave();
    }, 3000);
    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [subjective, objective, assessment, plan, dateOfService, timeIn, timeOut, cptLines, performAutoSave, loading, existingSignedAt, noteMode, clinicalSummary, continuedTreatmentJustification, planOfCareUpdate, prFrequencyPerWeek, prDurationWeeks, dischargeData]);

  // ── Actions ──

  const handleStartFromLastNote = () => {
    if (recentNotes.length === 0) return;
    const lastNote = recentNotes[0];
    setObjective(lastNote.objective || '');
    setPlan(lastNote.plan || '');
    setToast('Pre-filled Objective and Plan from last note');
  };

  const insertAtCursor = (
    textareaRef: React.RefObject<HTMLTextAreaElement | null>,
    setter: React.Dispatch<React.SetStateAction<string>>,
    currentValue: string,
    phrase: string
  ) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      // Fallback: append
      setter((prev) => (prev ? prev + ' ' + phrase : phrase));
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const before = currentValue.slice(0, start);
    const after = currentValue.slice(end);
    const needsSpace = before.length > 0 && !before.endsWith(' ') && !before.endsWith('\n');
    const newValue = before + (needsSpace ? ' ' : '') + phrase + after;
    setter(newValue);
    // Restore cursor position after insertion
    setTimeout(() => {
      const pos = start + (needsSpace ? 1 : 0) + phrase.length;
      textarea.focus();
      textarea.setSelectionRange(pos, pos);
    }, 0);
  };

  const getNoteBankInsertHandler = (section: SOAPSection) => {
    return (phrase: string) => {
      switch (section) {
        case 'S':
          insertAtCursor(subjectiveRef, setSubjective, subjective, phrase);
          break;
        case 'O':
          insertAtCursor(objectiveRef, setObjective, objective, phrase);
          break;
        case 'A':
          insertAtCursor(assessmentRef, setAssessment, assessment, phrase);
          break;
        case 'P':
          insertAtCursor(planRef, setPlan, plan, phrase);
          break;
      }
    };
  };

  const getNoteBankButtonRef = (section: SOAPSection) => {
    switch (section) {
      case 'S': return subjectiveBtnRef;
      case 'O': return objectiveBtnRef;
      case 'A': return assessmentBtnRef;
      case 'P': return planBtnRef;
    }
  };

  const toggleGoalAddressed = (goalId: number) => {
    setGoalsAddressed((prev) =>
      prev.includes(goalId) ? prev.filter((id) => id !== goalId) : [...prev, goalId]
    );
  };

  const toggleExpandedNote = (id: number) => {
    setExpandedNoteIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  /** Pre-sign validation: collect blocking errors and non-blocking warnings */
  const runSignValidation = (): ValidationIssue[] => {
    const issues: ValidationIssue[] = [];

    // Date of service
    if (!dateOfService) {
      issues.push({
        id: 'note_no_dos', message: 'Date of service is required', severity: 'error', fixable: true,
        fieldType: 'date', target: 'document', currentValue: '',
      });
    }

    // ── Discharge-specific ──
    if (isDischarge) {
      if (!dischargeData.discharge_reason) {
        issues.push({
          id: 'dc_no_reason', message: 'Discharge reason is required', severity: 'error', fixable: true,
          fieldType: 'select', target: 'document', currentValue: '',
          options: [
            { value: 'goals_met', label: 'Goals met / max benefit reached' },
            { value: 'patient_choice', label: 'Patient choice' },
            { value: 'non_compliance', label: 'Non-compliance / attendance' },
            { value: 'moved', label: 'Moved / relocated' },
            { value: 'physician_order', label: 'Physician order to discharge' },
            { value: 'auth_exhausted', label: 'Authorization / insurance exhausted' },
            { value: 'referred_out', label: 'Referred to another provider' },
            { value: 'medical_change', label: 'Medical status change' },
            { value: 'other', label: 'Other' },
          ],
        });
      }
      if (dischargeData.discharge_reason === 'other' && !dischargeData.discharge_reason_detail.trim()) {
        issues.push({
          id: 'dc_no_reason_detail', message: 'Discharge reason details required', severity: 'error', fixable: true,
          fieldType: 'textarea', target: 'document', currentValue: '',
          hint: 'Provide details for the "Other" discharge reason.',
        });
      }
      const hasUnresolvedGoals = dischargeGoals.some(g => !g.status_at_report || g.status_at_report === 'progressing');
      if (hasUnresolvedGoals) {
        issues.push({
          id: 'dc_goal_no_status', message: 'All goals must have final status for discharge', severity: 'error', fixable: false,
          fieldType: 'none', target: 'document', guidance: 'Go back and set a terminal status on all goals.',
        });
      }
      if (!dischargeData.current_level_of_function.trim()) {
        issues.push({
          id: 'dc_no_current_lof', message: 'Current Level of Function is empty', severity: 'error', fixable: true,
          fieldType: 'textarea', target: 'document', currentValue: '',
          hint: "Describe the patient's current functional status at discharge.",
        });
      }
    }

    // ── SOAP / note section content ──
    if (!isStandaloneDischarge) {
      const sections = NOTE_FORMAT_SECTIONS[noteFormat];
      const sectionValues: Record<string, string> = {
        subjective: subjective.trim(),
        objective: objective.trim(),
        assessment: assessment.trim(),
        plan: plan.trim(),
      };
      const activeSections = sections.filter(s => s.label !== '(unused)');
      const sectionFieldMap: Record<string, string> = {
        subjective: 'note_empty_subjective',
        objective: 'note_empty_objective',
        assessment: 'note_empty_assessment',
        plan: 'note_empty_plan',
      };
      const shortFieldMap: Record<string, string> = {
        subjective: 'note_short_subjective',
        objective: 'note_short_objective',
        assessment: 'note_short_assessment',
        plan: 'note_short_plan',
      };

      for (const s of activeSections) {
        const val = sectionValues[s.field];
        if (!val) {
          issues.push({
            id: sectionFieldMap[s.field] || `note_empty_${s.field}`,
            message: `${s.label} section is empty`,
            severity: 'error', fixable: true,
            fieldType: 'textarea', target: 'document', currentValue: '',
            hint: s.placeholder,
          });
        } else if (val.length < 20) {
          issues.push({
            id: shortFieldMap[s.field] || `note_short_${s.field}`,
            message: `${s.label} section appears incomplete (${val.length} chars)`,
            severity: 'warning', fixable: true,
            fieldType: 'textarea', target: 'document', currentValue: val,
            hint: 'Consider adding more detail.',
          });
        }
      }

      // Copy-paste detection
      const obj = sectionValues.objective;
      const asmt = sectionValues.assessment;
      if (obj && asmt && (asmt === obj || obj.includes(asmt) || asmt.includes(obj))) {
        issues.push({
          id: 'note_copypaste_warning', message: 'Assessment appears identical to Objective', severity: 'warning', fixable: false,
          fieldType: 'none', target: 'document', guidance: 'Consider adding clinical interpretation to differentiate the Assessment.',
        });
      }
    }

    // ── Progress report goals ──
    if (isProgressReport && progressReportGoals.length > 0) {
      const blanks = progressReportGoals.filter(g => !g.status_at_report);
      if (blanks.length > 0) {
        issues.push({
          id: 'pr_goal_no_status',
          message: `${blanks.length} goal(s) need a status for progress report`,
          severity: 'error', fixable: true, fieldType: 'goal_status', target: 'document',
          goalContext: blanks.map(g => ({
            goalId: g.goal_id,
            goalText: g.goal_text_snapshot.slice(0, 80),
            goalType: g.goal_type as 'STG' | 'LTG',
          })),
        });
      }

      const noPerf = progressReportGoals.filter(g => g.status_at_report && !g.performance_data?.trim());
      if (noPerf.length > 0) {
        issues.push({
          id: 'pr_goal_no_perf',
          message: `${noPerf.length} goal(s) missing performance data`,
          severity: 'warning', fixable: true, fieldType: 'goal_perf', target: 'document',
          goalContext: noPerf.map(g => ({
            goalId: g.goal_id,
            goalText: g.goal_text_snapshot.slice(0, 80),
            goalType: g.goal_type as 'STG' | 'LTG',
          })),
        });
      }
    }

    // Progress report: nudge for clinical justification
    if (isProgressReport && !isStandaloneDischarge) {
      if (!assessment.trim() || assessment.trim().length < 20) {
        // Only add if we didn't already flag assessment as empty
        if (!issues.some(i => i.id === 'note_empty_assessment')) {
          issues.push({
            id: 'note_pr_assessment_brief', message: 'Assessment is very brief for a progress report', severity: 'warning', fixable: false,
            fieldType: 'none', target: 'document', guidance: 'Consider including clinical justification for continued services.',
          });
        }
      }
    }

    // ── Client completeness ──
    if (client) {
      if (!client.dob) {
        issues.push({
          id: 'client_dob', message: 'Client date of birth is missing', severity: 'error', fixable: true,
          fieldType: 'date', target: 'client', currentValue: '',
        });
      }
      if (!client.primary_dx_code) {
        issues.push({
          id: 'client_dx', message: 'Primary diagnosis missing', severity: 'error', fixable: true,
          fieldType: 'icd10_search', target: 'client',
        });
      }
    }

    // ── Provider info ──
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

    // ── Backdated note warning ──
    if (dateOfService) {
      const dosDate = new Date(dateOfService + 'T00:00:00');
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const diffDays = Math.floor((today.getTime() - dosDate.getTime()) / (1000 * 60 * 60 * 24));
      if (diffDays > 7) {
        issues.push({
          id: 'note_backdated', message: `Date of service is ${diffDays} days ago`, severity: 'warning', fixable: false,
          fieldType: 'none', target: 'document',
          guidance: 'Medicare requires timely documentation. If this is intentional, proceed.',
        });
      }
    }

    return issues;
  };

  /** Opens the sign confirmation dialog with validation results */
  const handleSignClick = async () => {
    // Fetch authorization data for exceeded warning
    let authExceeded = false;
    let authDetail = { units_used: 0, units_approved: 0 };
    if (client) {
      try {
        const auths: any[] = await window.api.authorizations.listByClient(client.id);
        const active = auths.find((a: any) => a.status === 'active');
        if (active && active.units_used >= active.units_approved && active.units_approved > 0) {
          authExceeded = true;
          authDetail = { units_used: active.units_used, units_approved: active.units_approved };
        }
      } catch (_) { /* ignore — auth check is advisory */ }
    }

    const issues = runSignValidation();

    if (authExceeded) {
      issues.push({
        id: 'auth_exceeded',
        message: `This visit may exceed authorization (${authDetail.units_used}/${authDetail.units_approved} visits used)`,
        severity: 'warning', fixable: false, fieldType: 'none', target: 'document',
        guidance: 'Ensure a new authorization has been obtained before billing.',
      });
    }

    setSignDialogIssues(issues);
    setSignDialogOpen(true);
  };

  /** Handle fix-it sign: apply fixes from dialog, then save+sign */
  const handleSignWithFixes = (fixes: ValidationFixes) => {
    // Apply document-level section fixes
    if (fixes.documentFixes.subjective !== undefined) setSubjective(fixes.documentFixes.subjective);
    if (fixes.documentFixes.objective !== undefined) setObjective(fixes.documentFixes.objective);
    if (fixes.documentFixes.assessment !== undefined) setAssessment(fixes.documentFixes.assessment);
    if (fixes.documentFixes.plan !== undefined) setPlan(fixes.documentFixes.plan);
    if (fixes.documentFixes.date_of_service !== undefined) setDateOfService(fixes.documentFixes.date_of_service);

    // Apply discharge fixes
    if (isDischarge) {
      const dcUpdates: Partial<DischargeData> = {};
      if (fixes.documentFixes.discharge_reason !== undefined) dcUpdates.discharge_reason = fixes.documentFixes.discharge_reason;
      if (fixes.documentFixes.discharge_reason_detail !== undefined) dcUpdates.discharge_reason_detail = fixes.documentFixes.discharge_reason_detail;
      if (fixes.documentFixes.current_level_of_function !== undefined) dcUpdates.current_level_of_function = fixes.documentFixes.current_level_of_function;
      if (Object.keys(dcUpdates).length > 0) {
        setDischargeData(prev => ({ ...prev, ...dcUpdates }));
      }
    }

    // Apply goal fixes (progress report goal statuses and performance data)
    if (Object.keys(fixes.goalFixes).length > 0) {
      setProgressReportGoals(prev => prev.map(g => {
        const goalFix = fixes.goalFixes[g.goal_id];
        if (!goalFix) return g;
        return {
          ...g,
          ...(goalFix.status_at_report ? { status_at_report: goalFix.status_at_report as ProgressReportGoalStatus } : {}),
          ...(goalFix.performance_data !== undefined ? { performance_data: goalFix.performance_data } : {}),
        };
      }));
    }

    setSignDialogOpen(false);
    setTimeout(() => handleSave(true), 50);
  };

  /** Save fixes from the Sign dialog WITHOUT signing — just apply and close */
  const handleSaveFixesOnly = (fixes: ValidationFixes) => {
    // Apply document-level section fixes
    if (fixes.documentFixes.subjective !== undefined) setSubjective(fixes.documentFixes.subjective);
    if (fixes.documentFixes.objective !== undefined) setObjective(fixes.documentFixes.objective);
    if (fixes.documentFixes.assessment !== undefined) setAssessment(fixes.documentFixes.assessment);
    if (fixes.documentFixes.plan !== undefined) setPlan(fixes.documentFixes.plan);
    if (fixes.documentFixes.date_of_service !== undefined) setDateOfService(fixes.documentFixes.date_of_service);

    // Apply discharge fixes
    if (isDischarge) {
      const dcUpdates: Partial<DischargeData> = {};
      if (fixes.documentFixes.discharge_reason !== undefined) dcUpdates.discharge_reason = fixes.documentFixes.discharge_reason;
      if (fixes.documentFixes.discharge_reason_detail !== undefined) dcUpdates.discharge_reason_detail = fixes.documentFixes.discharge_reason_detail;
      if (fixes.documentFixes.current_level_of_function !== undefined) dcUpdates.current_level_of_function = fixes.documentFixes.current_level_of_function;
      if (Object.keys(dcUpdates).length > 0) {
        setDischargeData(prev => ({ ...prev, ...dcUpdates }));
      }
    }

    // Apply goal fixes (progress report goal statuses and performance data)
    if (Object.keys(fixes.goalFixes).length > 0) {
      setProgressReportGoals(prev => prev.map(g => {
        const goalFix = fixes.goalFixes[g.goal_id];
        if (!goalFix) return g;
        return {
          ...g,
          ...(goalFix.status_at_report ? { status_at_report: goalFix.status_at_report as ProgressReportGoalStatus } : {}),
          ...(goalFix.performance_data !== undefined ? { performance_data: goalFix.performance_data } : {}),
        };
      }));
    }

    setSignDialogOpen(false);
    // Trigger a non-signing draft save so fixes are persisted
    setTimeout(() => handleSave(false), 50);
  };

  /** Handle client record updates from Fix-It dialog */
  const handleClientUpdate = async (updates: Record<string, any>) => {
    if (!client) return;
    await window.api.clients.update(client.id, updates);
    const updated = await window.api.clients.get(client.id);
    setClient(updated);
  };

  const handleSave = async (sign: boolean) => {
    if (!clientId) return;

    // Cancel any pending auto-save to prevent it from overwriting signed_at
    if (autoSaveTimerRef.current) {
      clearTimeout(autoSaveTimerRef.current);
      autoSaveTimerRef.current = null;
    }

    try {
      setSaving(true);
      const filteredCptLines = cptLines.filter(l => l.code.trim());
      const noteData: Partial<Note> = {
        client_id: parseInt(clientId, 10),
        date_of_service: dateOfService,
        time_in: timeIn,
        time_out: timeOut,
        units: filteredCptLines.reduce((sum, l) => sum + (l.units || 0), 0),
        cpt_code: filteredCptLines[0]?.code || '',
        cpt_codes: JSON.stringify(filteredCptLines),
        // V2/V3 Billing fields
        cpt_modifiers: JSON.stringify(cptModifiers),
        place_of_service: placeOfService,
        charge_amount: chargeAmount,
        subjective,
        objective,
        assessment,
        plan,
        goals_addressed: JSON.stringify(goalsAddressed),
        signature_image: sign ? signatureImage : '',
        signature_typed: sign ? signatureTyped : '',
        signed_at: sign ? new Date().toISOString() : '',
        // Contracted entity fields
        entity_id: isContractedVisit ? entityId ?? undefined : undefined,
        rate_override: isContractedVisit ? rateOverride ?? undefined : undefined,
        rate_override_reason: isContractedVisit ? rateOverrideReason : '',
        note_type: noteMode !== 'soap' ? noteMode as Note['note_type'] : (isContractedVisit ? noteType as Note['note_type'] : 'soap' as Note['note_type']),
        progress_report_data: isProgressReport ? JSON.stringify({
          clinical_summary: clinicalSummary,
          continued_treatment_justification: continuedTreatmentJustification,
          frequency_per_week: prFrequencyPerWeek,
          duration_weeks: prDurationWeeks,
          plan_of_care_update: planOfCareUpdate,
          report_period_start: complianceData?.last_progress_date || '',
          report_period_end: dateOfService,
          visits_in_period: complianceData?.visits_since_last_progress || 0,
        } as ProgressReportData) : '',
        discharge_data: isDischarge ? JSON.stringify(dischargeData) : '',
        patient_name: isContractedVisit ? patientName : '',
      };

      // Standalone discharge: zero out billing fields
      if (isStandaloneDischarge) {
        noteData.charge_amount = 0;
        noteData.cpt_code = '';
        noteData.cpt_codes = '[]';
        noteData.time_in = '';
        noteData.time_out = '';
        noteData.units = 0;
      }

      let resultNoteId: number | null = null;
      if (isEditing && noteId) {
        await window.api.notes.update(parseInt(noteId, 10), noteData);
        resultNoteId = parseInt(noteId, 10);
      } else {
        const created = await window.api.notes.create(noteData);
        resultNoteId = created?.id ?? null;
      }

      // Save progress report goals and update goal statuses
      if (sign && isProgressReport) {
        const noteIdForPR = resultNoteId;
        if (noteIdForPR) {
          await window.api.progressReportGoals.upsert(noteIdForPR, progressReportGoals);
          for (const prg of progressReportGoals) {
            // Tag goal as established by this progress report (graduates pending → established)
            try { await window.api.goals.tagSource(prg.goal_id, noteIdForPR, 'progress_report'); } catch (_) { /* ignore */ }
            if (prg.status_at_report === 'met') {
              await window.api.goals.update(prg.goal_id, { status: 'met', met_date: dateOfService } as any);
            } else if (prg.status_at_report === 'discontinued') {
              await window.api.goals.update(prg.goal_id, { status: 'discontinued' } as any);
            } else if (prg.status_at_report === 'modified') {
              await window.api.goals.update(prg.goal_id, { status: 'modified' } as any);
            }
          }
        }
      }

      // Save discharge goals and update goal statuses
      if (sign && isDischarge) {
        const noteIdForDC = resultNoteId;
        if (noteIdForDC) {
          await window.api.progressReportGoals.upsert(noteIdForDC, dischargeGoals as any);
          for (const dg of dischargeGoals) {
            // Tag goal as established by this discharge
            try { await window.api.goals.tagSource(dg.goal_id, noteIdForDC, 'progress_report'); } catch (_) { /* ignore */ }
            const goalStatus: GoalStatus = dg.status_at_report === 'met' ? 'met' : 'discontinued';
            const metDate = dg.status_at_report === 'met' ? dateOfService : undefined;
            await window.api.goals.update(dg.goal_id, {
              status: goalStatus,
              met_date: metDate,
            } as any);
          }
        }
      }

      setFormSaved(true);
      if (sign && resultNoteId) {
        if (isDischarge) {
          if (isStandaloneDischarge) {
            // Check for unbilled notes
            try {
              const unbilled = await window.api.notes.getUnbilledForClient(parseInt(clientId, 10));
              if (unbilled.length > 0) {
                const createInvoice = window.confirm(
                  `Discharge summary signed. There are ${unbilled.length} unbilled visit(s) for this client.\n\nWould you like to generate a final invoice?`
                );
                if (createInvoice) {
                  const invoice = await window.api.invoices.generateFromNotes(
                    parseInt(clientId, 10),
                    unbilled.map((n: any) => n.id)
                  );
                  setToast('Discharge signed — final invoice created');
                  setTimeout(() => navigate(`/clients/${clientId}`, { state: { tab: 'billing', invoiceId: invoice.id } }), 800);
                  return;
                }
              }
            } catch { /* unbilled check not critical */ }
            setToast('Discharge summary signed — client discharged');
            setTimeout(() => navigate(`/clients/${clientId}`), 800);
          } else {
            // Billed discharge — normal invoice flow
            setToast('Discharge summary signed — client discharged');
            setSavedNoteId(resultNoteId);
            setJustSigned(true);
            setExistingSignedAt(new Date().toISOString());
          }
        } else {
          setToast('Note signed and saved');
          setSavedNoteId(resultNoteId);
          setJustSigned(true);
          setExistingSignedAt(new Date().toISOString());
          // Pro nudge for Basic users (once per month)
          if (!isPro) {
            try {
              const lastShown = await window.api.settings.get('pro_nudge_last_shown');
              const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;
              if (!lastShown || new Date(lastShown).getTime() < thirtyDaysAgo) {
                setShowProNudge(true);
              }
            } catch { /* ignore */ }
          }
          // Don't navigate away — show invoice prompt
        }
      } else {
        setToast('Draft saved');
        setTimeout(() => navigate(`/clients/${clientId}`), 500);
      }
    } catch (err) {
      console.error('Failed to save note:', err);
      setToast('Failed to save note. Please try again.');
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
    if (!noteId) return;
    try {
      await window.api.notes.delete(parseInt(noteId, 10));
      setToast('Note deleted');
      setTimeout(() => navigate(`/clients/${clientId}`), 500);
    } catch (err) {
      console.error('Failed to delete note:', err);
      setToast('Failed to delete note.');
    }
  };

  const handleCreateInvoice = async () => {
    if (!clientId || !savedNoteId) return;
    try {
      setCreatingInvoice(true);
      const invoice = await window.api.invoices.generateFromNotes(
        parseInt(clientId, 10),
        [savedNoteId]
      );
      setExistingInvoice({ invoice_id: invoice.id, invoice_number: invoice.invoice_number, status: invoice.status });
      setToast('Invoice created');
      // Navigate to billing tab on the client page
      setTimeout(() => navigate(`/clients/${clientId}`, { state: { tab: 'billing', invoiceId: invoice.id } }), 500);
    } catch (err) {
      console.error('Failed to create invoice:', err);
      setToast('Failed to create invoice');
    } finally {
      setCreatingInvoice(false);
    }
  };

  // ── Render ──

  if (loading) {
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
  const activeGoals = goals.filter((g) => g.status === 'active');
  const allGoals = goals; // For discharge — includes met/discontinued too

  // Handle note mode changes (dropdown)
  const handleNoteModeChange = async (mode: NoteMode) => {
    setNoteMode(mode);

    if (mode === 'progress_report' && activeGoals.length > 0) {
      // Build initial PR goals, then pre-fill current_value from last signed PR
      const prGoals = activeGoals.map(g => ({
        goal_id: g.id, goal_text_snapshot: g.goal_text, goal_type: g.goal_type || 'STG',
        status_at_report: 'progressing' as ProgressReportGoalStatus,
        performance_data: '', clinical_notes: '',
        is_new_goal: false, is_staged_promotion: false, staged_goal_id: null,
        baseline_snapshot: g.baseline ?? 0, target_snapshot: g.target ?? 0,
        measurement_type: g.measurement_type || 'percentage',
        current_value: '', current_numeric: 0,
        baseline_value_snapshot: g.baseline_value || '',
        target_value_snapshot: g.target_value || '',
      }));

      // Pre-fill from last signed progress report
      for (let i = 0; i < prGoals.length; i++) {
        try {
          const lastPR = await window.api.progressReportGoals.getLastForGoal(prGoals[i].goal_id);
          if (lastPR?.current_value) {
            prGoals[i].current_value = lastPR.current_value;
            prGoals[i].current_numeric = lastPR.current_numeric ?? 0;
          }
        } catch { /* not critical */ }
      }

      setProgressReportGoals(prGoals);
    }

    if (mode === 'discharge') {
      // Initialize discharge goals from all goals (active get empty status, met/discontinued get their status)
      const dcGoals = goals.map(g => ({
        goal_id: g.id,
        goal_text_snapshot: g.goal_text,
        goal_type: g.goal_type || 'STG',
        status_at_report: g.status === 'met' ? 'met' : g.status === 'discontinued' ? 'discontinued' : '',
        performance_data: '',
        clinical_notes: '',
        is_new_goal: false,
        is_staged_promotion: false,
        staged_goal_id: null,
        baseline_snapshot: g.baseline ?? 0,
        target_snapshot: g.target ?? 0,
        measurement_type: g.measurement_type || 'percentage',
        current_value: '', current_numeric: 0,
        baseline_value_snapshot: g.baseline_value || '',
        target_value_snapshot: g.target_value || '',
      }));

      // Pre-fill current_value from last signed progress report
      for (let i = 0; i < dcGoals.length; i++) {
        try {
          const lastPR = await window.api.progressReportGoals.getLastForGoal(dcGoals[i].goal_id);
          if (lastPR?.current_value) {
            dcGoals[i].current_value = lastPR.current_value;
            dcGoals[i].current_numeric = lastPR.current_numeric ?? 0;
          }
        } catch { /* not critical */ }
      }

      setDischargeGoals(dcGoals);

      // Load episode summary
      try {
        const cid = parseInt(clientId!, 10);
        const summary = await window.api.notes.getEpisodeSummary(cid);
        setDischargeData(prev => ({
          ...prev,
          start_of_care: summary.start_of_care || '',
          discharge_date: dateOfService,
          total_visits: summary.total_visits,
          frequency_per_week: summary.frequency_per_week,
          duration_weeks: summary.duration_weeks,
          frequency_notes: summary.frequency_notes,
          primary_dx: [summary.primary_dx_code, summary.primary_dx_description].filter(Boolean).join(' — '),
          discipline: summary.discipline,
        }));
      } catch { /* episode summary not critical */ }

      // Try to load prior level of function from eval
      try {
        const cid = parseInt(clientId!, 10);
        const evals = await window.api.evaluations.listByClient(cid) as Evaluation[];
        const sortedEvals = evals.sort((a, b) => new Date(a.eval_date).getTime() - new Date(b.eval_date).getTime());
        const earliest = sortedEvals[0];
        if (earliest?.content) {
          const parsed = JSON.parse(earliest.content);
          if (parsed.prior_level_of_function || parsed.history) {
            setDischargeData(prev => ({
              ...prev,
              prior_level_of_function: parsed.prior_level_of_function || parsed.history || '',
            }));
          }
        }
      } catch { /* eval lookup not critical */ }
    }
  };

  const handleGoalStatusChange = async (goalId: number, newStatus: GoalStatus) => {
    const goal = goals.find((g) => g.id === goalId);
    if (!goal) return;
    try {
      await window.api.goals.update(goalId, {
        ...goal,
        status: newStatus,
        met_date: newStatus === 'met' ? todayISO() : goal.met_date,
      });
      setGoals((prev) =>
        prev.map((g) =>
          g.id === goalId
            ? { ...g, status: newStatus, met_date: newStatus === 'met' ? todayISO() : g.met_date }
            : g
        )
      );
    } catch (err) {
      console.error('Failed to update goal status:', err);
    }
  };

  return (
    <div className="flex h-full">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-emerald-600 text-white px-4 py-3 rounded-lg shadow-lg">
          <CheckCircle className="w-4 h-4" />
          <span className="text-sm font-medium">{toast}</span>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 overflow-y-auto p-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <button
              className="btn-ghost p-2"
              onClick={async () => {
                if (hasUnsavedChanges && !existingSignedAt) {
                  // Auto-save draft before navigating away
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
                <FileText className="w-6 h-6" style={{ color: sectionColor.color }} />
                {isEditing ? 'Edit SOAP Note' : 'New SOAP Note'}
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
                {treatmentPlanSummary?.frequencyDuration && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-600 font-medium">{treatmentPlanSummary.frequencyDuration}</span>
                )}
                {treatmentPlanSummary?.treatmentPlan && (
                  <span className="text-[10px] text-[var(--color-text-tertiary)] truncate max-w-xs" title={treatmentPlanSummary.treatmentPlan}>
                    Tx: {treatmentPlanSummary.treatmentPlan.length > 50 ? treatmentPlanSummary.treatmentPlan.slice(0, 50) + '…' : treatmentPlanSummary.treatmentPlan}
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
            {!isEditing && recentNotes.length > 0 && (
              <button
                className="btn-secondary flex items-center gap-2"
                onClick={handleStartFromLastNote}
              >
                <Clipboard className="w-4 h-4" />
                Start from Last Note
              </button>
            )}
            <button
              className="btn-ghost p-2"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              title={sidebarOpen ? 'Close lookback panel' : 'Open lookback panel'}
            >
              {sidebarOpen ? (
                <PanelRightClose className="w-5 h-5" />
              ) : (
                <PanelRightOpen className="w-5 h-5" />
              )}
            </button>
          </div>
        </div>

        {/* Standalone Discharge Header */}
        {isStandaloneDischarge && (
          <div className="card p-4 mb-4 bg-amber-50/50 border-l-4 border-l-amber-400">
            <div className="flex items-center gap-2 text-amber-700">
              <LogOut className="w-5 h-5" />
              <span className="text-base font-semibold">Administrative Discharge</span>
              <span className="text-xs text-amber-600 ml-2">No treatment session — documentation only</span>
            </div>
          </div>
        )}

        {/* Session Info — hidden for standalone discharge */}
        {isStandaloneDischarge ? (
          <div className="card p-6 mb-6">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-[var(--color-primary)]" />
              <h2 className="section-title mb-0">Discharge Date</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label className="label">Discharge Date</label>
                <input type="date" className="input" value={dateOfService} onChange={(e) => setDateOfService(e.target.value)} />
              </div>
            </div>
          </div>
        ) : (
        <div className="card p-6 mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-[var(--color-primary)]" />
            <h2 className="section-title mb-0">Session Info</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="label">Date of Service</label>
              <input
                type="date"
                className="input"
                value={dateOfService}
                onChange={(e) => setDateOfService(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Time In</label>
              <input
                type="time"
                className="input"
                value={timeIn}
                onChange={(e) => setTimeIn(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Time Out</label>
              <input
                type="time"
                className="input"
                value={timeOut}
                onChange={(e) => setTimeOut(e.target.value)}
              />
            </div>
          </div>

          {/* CPT Code Lines */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="label mb-0">CPT Codes & Units</label>
              <button
                type="button"
                className="btn-ghost btn-sm gap-1 text-xs"
                onClick={() => setCptLines(prev => [...prev, { code: '', units: 1 }])}
              >
                <Plus size={14} />
                Add CPT Code
              </button>
            </div>
            <div className="space-y-2">
              {cptLines.map((line, idx) => (
                <div key={idx} className="flex items-center gap-3">
                  <CptCombobox
                    value={line.code}
                    onChange={(code) => setCptLines(prev => prev.map((l, i) => i === idx ? { ...l, code } : l))}
                    placeholder="Search CPT code..."
                    className="flex-1"
                  />
                  <div className="w-24">
                    <input
                      type="number"
                      className="input text-center"
                      min={1}
                      value={line.units}
                      onChange={(e) => setCptLines(prev => prev.map((l, i) => i === idx ? { ...l, units: parseInt(e.target.value, 10) || 1 } : l))}
                    />
                  </div>
                  <span className="text-xs text-[var(--color-text-secondary)] w-10">units</span>
                  {cptLines.length > 1 && (
                    <button
                      type="button"
                      className="p-1.5 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                      onClick={() => setCptLines(prev => prev.filter((_, i) => i !== idx))}
                    >
                      <X size={16} />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Billing Fields */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-4 pt-4 border-t border-[var(--color-border)]">
            <div>
              <label className="label">Place of Service</label>
              <select
                className="select"
                value={placeOfService}
                onChange={(e) => setPlaceOfService(e.target.value as PlaceOfService)}
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
                  if (e.target.value && !cptModifiers.includes(e.target.value)) {
                    setCptModifiers(prev => [...prev, e.target.value]);
                  }
                  e.target.value = '';
                }}
              >
                <option value="">Add modifier...</option>
                {MODIFIER_OPTIONS.filter(m => !cptModifiers.includes(m.value)).map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              {cptModifiers.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {cptModifiers.map((mod) => {
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
                        onClick={() => setCptModifiers(prev => prev.filter(m => m !== mod))}
                      >
                        <X size={12} />
                      </button>
                    </span>
                    );
                  })}
                </div>
              )}
            </div>
            <div>
              <label className="label">Charge Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]">$</span>
                <input
                  type="number"
                  className="input pl-7"
                  placeholder="0.00"
                  min={0}
                  step={0.01}
                  value={chargeAmount || ''}
                  onChange={(e) => setChargeAmount(parseFloat(e.target.value) || 0)}
                />
              </div>
              <p className="text-xs text-[var(--color-text-tertiary)] mt-1">For billing purposes</p>
            </div>
          </div>

          {/* Contracted Entity */}
          {entities.length > 0 && (
            <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
              <label className="flex items-center gap-2 cursor-pointer mb-3">
                <input
                  type="checkbox"
                  checked={isContractedVisit}
                  onChange={(e) => {
                    setIsContractedVisit(e.target.checked);
                    if (!e.target.checked) {
                      setEntityId(null);
                      setEntityFeeSchedule([]);
                      setRateOverride(null);
                      setRateOverrideReason('');
                      setNoteType('');
                    }
                  }}
                  className="w-4 h-4 rounded border-gray-300 accent-[var(--color-primary)]"
                />
                <span className="text-sm font-medium text-[var(--color-text)]">
                  Contracted visit
                </span>
              </label>

              {isContractedVisit && (
                <div className="space-y-3">
                <div>
                  <label className="label">Patient Name</label>
                  <input
                    type="text"
                    className="input w-full"
                    placeholder="Name of the agency's patient/client"
                    value={patientName}
                    onChange={(e) => setPatientName(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div>
                    <label className="label">Entity</label>
                    <select
                      className="select w-full"
                      value={entityId ?? ''}
                      onChange={async (e) => {
                        const eid = parseInt(e.target.value, 10) || null;
                        setEntityId(eid);
                        if (eid) {
                          try {
                            const fees = await window.api.contractedEntities.listFeeSchedule(eid);
                            setEntityFeeSchedule(fees);
                            // Auto-set note type from entity default
                            const ent = entities.find((en) => en.id === eid);
                            if (ent?.default_note_type) setNoteType(ent.default_note_type);
                            // Auto-populate rate from fee schedule if note_type matches
                            const matchingFee = fees.find((f: EntityFeeSchedule) => f.service_type === (ent?.default_note_type || noteType));
                            if (matchingFee) {
                              setChargeAmount(matchingFee.default_rate);
                            }
                          } catch {}
                        } else {
                          setEntityFeeSchedule([]);
                        }
                      }}
                    >
                      <option value="">Select entity...</option>
                      {entities.map((ent) => (
                        <option key={ent.id} value={ent.id}>{ent.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">Service Type</label>
                    <select
                      className="select w-full"
                      value={noteType}
                      onChange={(e) => {
                        setNoteType(e.target.value);
                        // Auto-populate rate
                        const matchingFee = entityFeeSchedule.find((f) => f.service_type === e.target.value);
                        if (matchingFee) {
                          setChargeAmount(matchingFee.default_rate);
                          setRateOverride(null);
                        }
                      }}
                    >
                      <option value="">Select...</option>
                      <option value="soap">SOAP Note</option>
                      <option value="progress_report">Progress Report</option>
                      <option value="recertification">Recertification</option>
                      <option value="discharge">Discharge</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">Rate Override</label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]">$</span>
                      <input
                        type="number"
                        className="input pl-7 w-full"
                        placeholder="Use default"
                        step={0.01}
                        value={rateOverride ?? ''}
                        onChange={(e) => {
                          const val = parseFloat(e.target.value);
                          setRateOverride(isNaN(val) ? null : val);
                          if (!isNaN(val)) setChargeAmount(val);
                        }}
                      />
                    </div>
                  </div>
                  {rateOverride !== null && (
                    <div className="md:col-span-3">
                      <label className="label">Override Reason</label>
                      <input
                        className="input w-full"
                        placeholder="Reason for rate override..."
                        value={rateOverrideReason}
                        onChange={(e) => setRateOverrideReason(e.target.value)}
                      />
                    </div>
                  )}
                </div>
                </div>
              )}
            </div>
          )}
        </div>
        )}

        {/* ── Compliance Status & Note Mode Dropdown ── */}
        {complianceData && (() => {
          const isOverdue = complianceData.next_progress_due && new Date(complianceData.next_progress_due) < new Date();
          const isApproaching = complianceData.visits_since_last_progress >= (complianceData.progress_visit_threshold - 2);
          const isDue = isOverdue || isApproaching;
          return (
            <div className={`card p-4 mb-4 ${isProgressReport ? 'border-l-4 border-l-teal-500 bg-teal-50/30' : isDischarge ? 'border-l-4 border-l-amber-500 bg-amber-50/30' : isDue ? 'border-l-4 border-l-red-400' : ''}`}>
              {/* Compliance Info — always visible */}
              <div className={`flex items-center gap-3 text-xs ${isDue ? '' : 'text-teal-700'}`}>
                <div className="flex items-center gap-1.5">
                  <ClipboardCheck className={`w-4 h-4 ${isDue ? 'text-red-500' : 'text-teal-600'}`} />
                  <span className={`font-semibold ${isDue ? 'text-red-600' : ''}`}>
                    Visits: {complianceData.visits_since_last_progress} / {complianceData.progress_visit_threshold}
                  </span>
                </div>
                {complianceData.next_progress_due && (
                  <span className={isDue ? 'font-bold text-red-600 animate-pulse' : 'text-teal-600'}>
                    {isOverdue ? '⚠ PR OVERDUE' : `Due: ${complianceData.next_progress_due}`}
                  </span>
                )}
                {complianceData.last_progress_date && (
                  <span className="text-[var(--color-text-tertiary)]">
                    Last: {complianceData.last_progress_date}
                  </span>
                )}
                {isDue && !existingSignedAt && noteMode === 'soap' && (
                  <button
                    className="text-xs font-semibold text-red-600 hover:text-red-800 underline ml-auto"
                    onClick={() => handleNoteModeChange('progress_report')}
                  >
                    Enable Progress Report
                  </button>
                )}
              </div>

              {/* Note Mode dropdown */}
              {!existingSignedAt && (
                <div className="flex items-center gap-3 mt-3 pt-3 border-t border-[var(--color-border)]">
                  <label className="text-sm font-semibold text-[var(--color-text)]">Note Type:</label>
                  <select
                    className="select text-sm"
                    value={noteMode}
                    onChange={(e) => handleNoteModeChange(e.target.value as NoteMode)}
                    disabled={!!existingSignedAt || isStandaloneDischarge}
                  >
                    <option value="soap">Standard SOAP</option>
                    <option value="progress_report">Progress Report</option>
                    <option value="discharge">Discharge Summary</option>
                  </select>
                </div>
              )}
              {existingSignedAt && noteMode !== 'soap' && (
                <div className="flex items-center gap-2 mt-2">
                  {isProgressReport && <ClipboardCheck className="w-4 h-4 text-teal-600" />}
                  {isDischarge && <LogOut className="w-4 h-4 text-amber-600" />}
                  <span className={`text-sm font-semibold ${isProgressReport ? 'text-teal-700' : 'text-amber-700'}`}>
                    {isProgressReport ? 'Progress Report' : 'Discharge Summary'}
                  </span>
                </div>
              )}
            </div>
          );
        })()}
        {!complianceData && (
          <div className={`card p-4 mb-4 ${isProgressReport ? 'border-l-4 border-l-teal-500 bg-teal-50/30' : isDischarge ? 'border-l-4 border-l-amber-500 bg-amber-50/30' : ''}`}>
            {!existingSignedAt ? (
              <div className="flex items-center gap-3">
                <label className="text-sm font-semibold text-[var(--color-text)]">Note Type:</label>
                <select
                  className="select text-sm"
                  value={noteMode}
                  onChange={(e) => handleNoteModeChange(e.target.value as NoteMode)}
                  disabled={!!existingSignedAt || isStandaloneDischarge}
                >
                  <option value="soap">Standard SOAP</option>
                  <option value="progress_report">Progress Report</option>
                  <option value="discharge">Discharge Summary</option>
                </select>
              </div>
            ) : noteMode !== 'soap' ? (
              <div className="flex items-center gap-2">
                {isProgressReport && <ClipboardCheck className="w-4 h-4 text-teal-600" />}
                {isDischarge && <LogOut className="w-4 h-4 text-amber-600" />}
                <span className={`text-sm font-semibold ${isProgressReport ? 'text-teal-700' : 'text-amber-700'}`}>
                  {isProgressReport ? 'Progress Report' : 'Discharge Summary'}
                </span>
              </div>
            ) : null}
          </div>
        )}

        {/* SOAP Sections — hidden for standalone discharge */}
        {!isStandaloneDischarge && (<>
        {/* Section 1 (Subjective / Data / Behavior) */}
        <SOAPSectionCard
          title={NOTE_FORMAT_SECTIONS[noteFormat][0].label}
          sectionCode="S"
          discipline={discipline}
          value={subjective}
          onChange={setSubjective}
          textareaRef={subjectiveRef}
          noteBankBtnRef={subjectiveBtnRef}
          noteBankOpen={noteBankOpen}
          setNoteBankOpen={setNoteBankOpen}
          onInsert={getNoteBankInsertHandler('S')}
          anchorRef={getNoteBankButtonRef('S')}
          placeholder={NOTE_FORMAT_SECTIONS[noteFormat][0].placeholder}
          disabled={!!existingSignedAt}
          priorityCategories={addressedCategories}
        />

        {/* Section 2 (Objective / Assessment / Intervention) */}
        <SOAPSectionCard
          title={NOTE_FORMAT_SECTIONS[noteFormat][1].label}
          sectionCode="O"
          discipline={discipline}
          value={objective}
          onChange={setObjective}
          textareaRef={objectiveRef}
          noteBankBtnRef={objectiveBtnRef}
          noteBankOpen={noteBankOpen}
          setNoteBankOpen={setNoteBankOpen}
          onInsert={getNoteBankInsertHandler('O')}
          anchorRef={getNoteBankButtonRef('O')}
          placeholder={NOTE_FORMAT_SECTIONS[noteFormat][1].placeholder}
          disabled={!!existingSignedAt}
          priorityCategories={addressedCategories}
        />

        {/* ── Goal Progress (Progress Report only) ── */}
        {isProgressReport && (
          <div className="card p-5 mb-4 bg-teal-50/30 border-l-4 border-l-teal-400">
            <h2 className="text-base font-semibold text-[var(--color-text)] mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-teal-600" />
              Goal Progress
            </h2>
            <div className="space-y-4">
              {progressReportGoals.map((prg, idx) => (
                <div key={prg.goal_id} className="p-4 rounded-lg bg-white border border-[var(--color-border)]">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${prg.goal_type === 'LTG' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                      {prg.goal_type}
                    </span>
                    <p className="text-sm font-medium text-[var(--color-text)] flex-1">{prg.goal_text_snapshot}</p>
                  </div>
                  {/* GoalProgressBar */}
                  {(prg.baseline_value_snapshot || prg.baseline_snapshot > 0 || prg.target_value_snapshot || prg.target_snapshot > 0) && (
                    <GoalProgressBar
                      measurement_type={(prg.measurement_type || 'percentage') as MeasurementType}
                      baseline_value={prg.baseline_value_snapshot || `${prg.baseline_snapshot}`}
                      baseline_numeric={prg.baseline_snapshot ?? 0}
                      current_value={prg.current_value || undefined}
                      current_numeric={prg.current_numeric ?? undefined}
                      target_value={prg.target_value_snapshot || `${prg.target_snapshot}`}
                      target_numeric={prg.target_snapshot ?? 0}
                    />
                  )}
                  {/* Current Level chips for measurement type */}
                  {prg.measurement_type && prg.measurement_type !== 'custom_text' && (
                    <div className="mb-3">
                      <MeasurementChips
                        measurement_type={(prg.measurement_type || 'percentage') as MeasurementType}
                        label="Current Level"
                        value={prg.current_value || ''}
                        numericValue={prg.current_numeric ?? 0}
                        colorScheme="target"
                        disabled={!!existingSignedAt}
                        onSelect={(val, num) => {
                          const updated = [...progressReportGoals];
                          updated[idx] = { ...updated[idx], current_value: val, current_numeric: num };
                          setProgressReportGoals(updated);
                        }}
                      />
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="label text-xs">Status</label>
                      <select className="select text-sm w-full" value={prg.status_at_report}
                        disabled={!!existingSignedAt}
                        onChange={(e) => {
                          const updated = [...progressReportGoals];
                          updated[idx] = { ...updated[idx], status_at_report: e.target.value as ProgressReportGoalStatus };
                          setProgressReportGoals(updated);
                        }}>
                        {Object.entries(PROGRESS_REPORT_GOAL_STATUS_LABELS).map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="label text-xs">Performance Summary</label>
                      <input className="input text-sm w-full" placeholder="Brief narrative (metric captured above)"
                        disabled={!!existingSignedAt}
                        value={prg.performance_data}
                        onChange={(e) => {
                          const updated = [...progressReportGoals];
                          updated[idx] = { ...updated[idx], performance_data: e.target.value };
                          setProgressReportGoals(updated);
                        }} />
                    </div>
                  </div>
                  <div className="mt-2">
                    <label className="label text-xs">Clinical Notes</label>
                    <textarea className="textarea text-sm" rows={2}
                      disabled={!!existingSignedAt}
                      placeholder="Goal-specific observations..."
                      value={prg.clinical_notes}
                      onChange={(e) => {
                        const updated = [...progressReportGoals];
                        updated[idx] = { ...updated[idx], clinical_notes: e.target.value };
                        setProgressReportGoals(updated);
                      }} />
                  </div>
                </div>
              ))}
            </div>

            {/* Goals Met / Completed */}
            {goals.filter(g => g.status === 'met' || g.status === 'discontinued').length > 0 && (
              <div className="mt-5 pt-4 border-t border-teal-200">
                <h3 className="text-sm font-semibold text-[var(--color-text)] mb-2 flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-green-500" />
                  Goals Met / Completed
                </h3>
                <div className="space-y-1.5">
                  {goals.filter(g => g.status === 'met' || g.status === 'discontinued').map((goal) => (
                    <div key={goal.id} className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/60 border border-green-100">
                      <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded ${
                        goal.status === 'met' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {goal.status === 'met' ? '✓ Met' : "DC'd"}
                      </span>
                      <span className="text-xs text-[var(--color-text-secondary)] flex-1">{goal.goal_text}</span>
                      {(goal.baseline_value || goal.baseline > 0 || goal.target_value || goal.target > 0) && (
                        <span className="flex items-center gap-1 text-[10px] font-medium shrink-0">
                          <span className="px-1 py-0.5 rounded bg-amber-50 text-amber-600">
                            {goal.baseline_value
                              ? formatMetricValue((goal.measurement_type || 'percentage') as MeasurementType, goal.baseline_value)
                              : `${goal.baseline}%`}
                          </span>
                          <span className="text-[var(--color-text-secondary)]">&rarr;</span>
                          <span className="px-1 py-0.5 rounded bg-emerald-50 text-emerald-600">
                            {goal.target_value
                              ? formatMetricValue((goal.measurement_type || 'percentage') as MeasurementType, goal.target_value)
                              : `${goal.target}%`}
                          </span>
                        </span>
                      )}
                      {goal.met_date && <span className="text-[10px] text-green-600">{goal.met_date}</span>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Staged goals promotion area */}
            {stagedGoals.length > 0 && !existingSignedAt && (
              <div className="mt-5 pt-4 border-t border-teal-200">
                <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3 flex items-center gap-2">
                  <Flag className="w-4 h-4 text-amber-500" />
                  Staged Goals for Review
                </h3>
                <div className="space-y-2">
                  {stagedGoals.map((sg) => (
                    <div key={sg.id} className="flex items-start gap-3 p-3 rounded-lg bg-amber-50 border border-amber-200">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-[var(--color-text)]">{sg.goal_text}</p>
                        {sg.rationale && <p className="text-xs text-[var(--color-text-secondary)] italic mt-0.5">{sg.rationale}</p>}
                      </div>
                      <button className="btn-primary text-xs px-2 py-1 whitespace-nowrap" onClick={async () => {
                        const noteIdForPromote = savedNoteId;
                        if (!noteIdForPromote || !clientId) return;
                        try {
                          const result = await window.api.stagedGoals.promote(sg.id, noteIdForPromote);
                          setProgressReportGoals(prev => [...prev, {
                            goal_id: result.goal.id, goal_text_snapshot: result.goal.goal_text,
                            goal_type: result.goal.goal_type || 'STG',
                            status_at_report: 'progressing' as ProgressReportGoalStatus,
                            performance_data: '', clinical_notes: '',
                            is_new_goal: true, is_staged_promotion: true, staged_goal_id: sg.id,
                            baseline_snapshot: result.goal.baseline ?? 0, target_snapshot: result.goal.target ?? 0,
                            measurement_type: result.goal.measurement_type || 'percentage',
                            current_value: '', current_numeric: 0,
                            baseline_value_snapshot: result.goal.baseline_value || '',
                            target_value_snapshot: result.goal.target_value || '',
                          }]);
                          const [updatedStaged, updatedGoals] = await Promise.all([
                            window.api.stagedGoals.listByClient(parseInt(clientId, 10)),
                            window.api.goals.listByClient(parseInt(clientId, 10)),
                          ]);
                          setStagedGoals(updatedStaged);
                          setGoals(updatedGoals);
                        } catch (err) { console.error('Failed to promote staged goal:', err); }
                      }}>+ Add to POC</button>
                      <button className="btn-ghost text-xs px-2 py-1 whitespace-nowrap" onClick={async () => {
                        if (!clientId) return;
                        await window.api.stagedGoals.dismiss(sg.id, 'Dismissed during progress report');
                        const updatedStaged = await window.api.stagedGoals.listByClient(parseInt(clientId, 10));
                        setStagedGoals(updatedStaged);
                      }}>Dismiss</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Section 3 (Assessment / Plan / Response) */}
        <div className="card p-6 mb-6 bg-violet-50/50">
          <div className="flex items-center justify-between mb-3">
            <h2 className="section-title mb-0">{NOTE_FORMAT_SECTIONS[noteFormat][2].label}</h2>
            <div className="relative">
              <button
                ref={assessmentBtnRef}
                className="btn-ghost btn-sm flex items-center gap-1.5"
                onClick={() =>
                  setNoteBankOpen(noteBankOpen === 'A' ? null : 'A')
                }
              >
                <BookOpen className="w-3.5 h-3.5" />
                Note Bank
              </button>
              <NoteBankPopover
                isOpen={noteBankOpen === 'A'}
                onClose={() => setNoteBankOpen(null)}
                onInsert={getNoteBankInsertHandler('A')}
                discipline={discipline}
                section="A"
                anchorRef={assessmentBtnRef}
                priorityCategories={addressedCategories}
              />
            </div>
          </div>

          {/* Quick Chips Row */}
          <div className="mb-3">
            <QuickChips
              discipline={discipline}
              section="A"
              onInsert={getNoteBankInsertHandler('A')}
              maxChips={6}
              onOpenFullBank={() => setNoteBankOpen('A')}
              priorityCategories={addressedCategories}
            />
          </div>

          <SmartTextarea
            ref={assessmentRef}
            className="textarea"
            rows={4}
            placeholder={NOTE_FORMAT_SECTIONS[noteFormat][2].placeholder || 'Clinical assessment and progress toward goals...'}
            value={assessment}
            onChange={setAssessment}
            discipline={discipline}
            section="A"
            disabled={!!existingSignedAt}
          />

          {/* Goals Addressed */}
          {activeGoals.length > 0 && (
            <div className="mt-4 pt-4 border-t border-[var(--color-border)]">
              <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3 flex items-center gap-2">
                <Target className="w-4 h-4 text-[var(--color-primary)]" />
                Goals Addressed
              </h3>
              <div className="space-y-2">
                {activeGoals.map((goal) => (
                  <label
                    key={goal.id}
                    className="flex items-start gap-3 p-2 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                  >
                    <input
                      type="checkbox"
                      checked={goalsAddressed.includes(goal.id)}
                      onChange={() => toggleGoalAddressed(goal.id)}
                      className="mt-0.5 w-4 h-4 rounded border-gray-300 text-[var(--color-primary)] accent-[var(--color-primary)]"
                    />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-[var(--color-text)] leading-snug">
                        {goal.goal_text}
                      </span>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className={`badge text-[10px] ${goal.goal_type === 'STG' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                          {goal.goal_type}
                        </span>
                        {goal.category && (
                          <span className="text-[10px] text-[var(--color-text-secondary)]">
                            {goal.category}
                          </span>
                        )}
                      </div>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* ── Clinical Summary (Progress Report only) ── */}
        {isProgressReport && (
          <div className="card p-5 mb-4 bg-teal-50/30 border-l-4 border-l-teal-400">
            <h2 className="text-base font-semibold text-[var(--color-text)] mb-3">Clinical Summary</h2>
            <textarea
              className="textarea"
              rows={4}
              disabled={!!existingSignedAt}
              placeholder="Summarize overall progress, changes in functional status, response to treatment, and rationale for continued skilled services..."
              value={clinicalSummary}
              onChange={(e) => setClinicalSummary(e.target.value)}
            />
          </div>
        )}

        {/* Section 4 (Plan) — hidden for DAP format */}
        {NOTE_FORMAT_SECTIONS[noteFormat][3].label !== '(unused)' && (
          <SOAPSectionCard
            title={NOTE_FORMAT_SECTIONS[noteFormat][3].label}
            sectionCode="P"
            discipline={discipline}
            value={plan}
            onChange={setPlan}
            textareaRef={planRef}
            noteBankBtnRef={planBtnRef}
            noteBankOpen={noteBankOpen}
            setNoteBankOpen={setNoteBankOpen}
            onInsert={getNoteBankInsertHandler('P')}
            anchorRef={getNoteBankButtonRef('P')}
            placeholder={NOTE_FORMAT_SECTIONS[noteFormat][3].placeholder}
            disabled={!!existingSignedAt}
            priorityCategories={addressedCategories}
          />
        )}

        {/* ── Plan of Care Update (Progress Report only) ── */}
        {isProgressReport && (
          <div className="card p-5 mb-4 bg-teal-50/30 border-l-4 border-l-teal-400">
            <h2 className="text-base font-semibold text-[var(--color-text)] mb-3">Plan of Care Update</h2>
            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <label className="label text-xs">Frequency (sessions/week)</label>
                <input type="number" className="input" min={1} max={7}
                  disabled={!!existingSignedAt}
                  value={prFrequencyPerWeek ?? ''}
                  onChange={(e) => setPrFrequencyPerWeek(parseInt(e.target.value) || null)} />
              </div>
              <div>
                <label className="label text-xs">Duration (weeks)</label>
                <input type="number" className="input" min={1}
                  disabled={!!existingSignedAt}
                  value={prDurationWeeks ?? ''}
                  onChange={(e) => setPrDurationWeeks(parseInt(e.target.value) || null)} />
              </div>
            </div>
            <div className="mb-4">
              <label className="label text-xs">Continued Treatment Justification</label>
              <textarea className="textarea" rows={3}
                disabled={!!existingSignedAt}
                placeholder="Justify continued skilled therapy services: patient demonstrates ongoing potential for functional improvement as evidenced by..."
                value={continuedTreatmentJustification}
                onChange={(e) => setContinuedTreatmentJustification(e.target.value)} />
            </div>
            <div>
              <label className="label text-xs">Additional Plan of Care Notes</label>
              <textarea className="textarea" rows={2}
                disabled={!!existingSignedAt}
                placeholder="Updates to treatment approach, goals, or discharge planning..."
                value={planOfCareUpdate}
                onChange={(e) => setPlanOfCareUpdate(e.target.value)} />
            </div>
          </div>
        )}
        </>)}

        {/* ══════════ DISCHARGE CONTENT SECTIONS ══════════ */}
        {isDischarge && (
          <>
          {/* Section 1: Discharge Reason */}
          <div className="card p-5 mb-4 bg-amber-50/30 border-l-4 border-l-amber-400">
            <h2 className="text-base font-semibold text-[var(--color-text)] mb-4 flex items-center gap-2">
              <LogOut className="w-5 h-5 text-amber-600" />
              Discharge Reason
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="label text-xs">Reason</label>
                <select
                  className="select text-sm w-full"
                  value={dischargeData.discharge_reason}
                  disabled={!!existingSignedAt}
                  onChange={(e) => setDischargeData(prev => ({ ...prev, discharge_reason: e.target.value as DischargeReason }))}
                >
                  {Object.entries(DISCHARGE_REASON_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label text-xs">Details {dischargeData.discharge_reason === 'other' && <span className="text-red-500">*</span>}</label>
                <input
                  className="input text-sm w-full"
                  placeholder="Additional details..."
                  disabled={!!existingSignedAt}
                  value={dischargeData.discharge_reason_detail}
                  onChange={(e) => setDischargeData(prev => ({ ...prev, discharge_reason_detail: e.target.value }))}
                />
              </div>
            </div>
          </div>

          {/* Section 2: Episode Summary (Auto-Populated) */}
          <div className="card p-5 mb-4 bg-amber-50/30 border-l-4 border-l-amber-400">
            <h2 className="text-base font-semibold text-[var(--color-text)] mb-4 flex items-center gap-2">
              <FileText className="w-5 h-5 text-amber-600" />
              Episode Summary
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <label className="label text-xs">Start of Care</label>
                <input type="date" className="input text-sm" disabled={!!existingSignedAt}
                  value={dischargeData.start_of_care}
                  onChange={(e) => setDischargeData(prev => ({ ...prev, start_of_care: e.target.value }))} />
              </div>
              <div>
                <label className="label text-xs">Discharge Date</label>
                <input type="date" className="input text-sm" disabled={!!existingSignedAt}
                  value={dischargeData.discharge_date || dateOfService}
                  onChange={(e) => setDischargeData(prev => ({ ...prev, discharge_date: e.target.value }))} />
              </div>
              <div>
                <label className="label text-xs">Total Visits</label>
                <input type="number" className="input text-sm" disabled={!!existingSignedAt}
                  value={dischargeData.total_visits}
                  onChange={(e) => setDischargeData(prev => ({ ...prev, total_visits: parseInt(e.target.value) || 0 }))} />
              </div>
              <div>
                <label className="label text-xs">Frequency (sessions/week)</label>
                <input type="number" className="input text-sm" min={1} max={7} disabled={!!existingSignedAt}
                  value={dischargeData.frequency_per_week ?? ''}
                  onChange={(e) => setDischargeData(prev => ({ ...prev, frequency_per_week: parseInt(e.target.value) || null }))} />
              </div>
              <div>
                <label className="label text-xs">Duration (weeks)</label>
                <input type="number" className="input text-sm" min={1} disabled={!!existingSignedAt}
                  value={dischargeData.duration_weeks ?? ''}
                  onChange={(e) => setDischargeData(prev => ({ ...prev, duration_weeks: parseInt(e.target.value) || null }))} />
              </div>
              <div>
                <label className="label text-xs">Discipline</label>
                <input className="input text-sm" disabled={!!existingSignedAt}
                  value={dischargeData.discipline}
                  onChange={(e) => setDischargeData(prev => ({ ...prev, discipline: e.target.value }))} />
              </div>
            </div>
            <div className="mt-3">
              <label className="label text-xs">Primary Diagnosis</label>
              <input className="input text-sm w-full" disabled={!!existingSignedAt}
                value={dischargeData.primary_dx}
                onChange={(e) => setDischargeData(prev => ({ ...prev, primary_dx: e.target.value }))} />
            </div>
          </div>

          {/* Section 3: Final Goal Status (REQUIRED) */}
          <div className="card p-5 mb-4 bg-amber-50/30 border-l-4 border-l-amber-400">
            <h2 className="text-base font-semibold text-[var(--color-text)] mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-amber-600" />
              Final Goal Status
            </h2>
            {dischargeGoals.some(g => !g.status_at_report) && (
              <div className="flex items-center gap-2 text-xs text-amber-700 bg-amber-100 rounded-lg p-2.5 mb-4">
                <AlertTriangle className="w-4 h-4" />
                All goals must have a final status to sign.
              </div>
            )}
            <div className="space-y-4">
              {dischargeGoals.map((dg, idx) => (
                <div key={dg.goal_id} className="p-4 rounded-lg bg-white border border-[var(--color-border)]">
                  <div className="flex items-center gap-2 mb-2">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${dg.goal_type === 'LTG' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                      {dg.goal_type}
                    </span>
                    <p className="text-sm font-medium text-[var(--color-text)] flex-1">{dg.goal_text_snapshot}</p>
                  </div>
                  {/* GoalProgressBar for discharge */}
                  {(dg.baseline_value_snapshot || dg.baseline_snapshot > 0 || dg.target_value_snapshot || dg.target_snapshot > 0) && (
                    <GoalProgressBar
                      measurement_type={(dg.measurement_type || 'percentage') as MeasurementType}
                      baseline_value={dg.baseline_value_snapshot || `${dg.baseline_snapshot}`}
                      baseline_numeric={dg.baseline_snapshot ?? 0}
                      current_value={dg.current_value || undefined}
                      current_numeric={dg.current_numeric ?? undefined}
                      target_value={dg.target_value_snapshot || `${dg.target_snapshot}`}
                      target_numeric={dg.target_snapshot ?? 0}
                    />
                  )}
                  {/* Final Level chips for measurement type */}
                  {dg.measurement_type && dg.measurement_type !== 'custom_text' && (
                    <div className="mb-3">
                      <MeasurementChips
                        measurement_type={(dg.measurement_type || 'percentage') as MeasurementType}
                        label="Final Level at Discharge"
                        value={dg.current_value || ''}
                        numericValue={dg.current_numeric ?? 0}
                        colorScheme="target"
                        disabled={!!existingSignedAt}
                        onSelect={(val, num) => {
                          const updated = [...dischargeGoals];
                          updated[idx] = { ...updated[idx], current_value: val, current_numeric: num };
                          setDischargeGoals(updated);
                        }}
                      />
                    </div>
                  )}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div>
                      <label className="label text-xs">Final Status <span className="text-red-500">*</span></label>
                      <select className="select text-sm w-full" value={dg.status_at_report}
                        disabled={!!existingSignedAt}
                        onChange={(e) => {
                          const updated = [...dischargeGoals];
                          updated[idx] = { ...updated[idx], status_at_report: e.target.value };
                          setDischargeGoals(updated);
                        }}>
                        <option value="">— Select —</option>
                        {Object.entries(DISCHARGE_GOAL_STATUS_LABELS).map(([val, label]) => (
                          <option key={val} value={val}>{label}</option>
                        ))}
                      </select>
                    </div>
                    <div className="md:col-span-2">
                      <label className="label text-xs">Final Performance</label>
                      <input className="input text-sm w-full" placeholder="e.g., 90% accuracy, independent"
                        disabled={!!existingSignedAt}
                        value={dg.performance_data}
                        onChange={(e) => {
                          const updated = [...dischargeGoals];
                          updated[idx] = { ...updated[idx], performance_data: e.target.value };
                          setDischargeGoals(updated);
                        }} />
                    </div>
                  </div>
                  <div className="mt-2">
                    <label className="label text-xs">Summary</label>
                    <textarea className="textarea text-sm" rows={2}
                      disabled={!!existingSignedAt}
                      placeholder="Goal-specific summary..."
                      value={dg.clinical_notes}
                      onChange={(e) => {
                        const updated = [...dischargeGoals];
                        updated[idx] = { ...updated[idx], clinical_notes: e.target.value };
                        setDischargeGoals(updated);
                      }} />
                  </div>
                </div>
              ))}
              {dischargeGoals.length === 0 && (
                <p className="text-sm text-[var(--color-text-secondary)] italic">No goals found for this client.</p>
              )}
            </div>
          </div>

          {/* Section 4: Functional Outcomes */}
          <div className="card p-5 mb-4 bg-amber-50/30 border-l-4 border-l-amber-400">
            <h2 className="text-base font-semibold text-[var(--color-text)] mb-4 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-amber-600" />
              Functional Outcomes
            </h2>
            <div className="space-y-4">
              <div>
                <label className="label text-xs">Prior Level of Function</label>
                <textarea className="textarea text-sm" rows={3}
                  disabled={!!existingSignedAt}
                  placeholder="Describe the patient's functional level prior to treatment..."
                  value={dischargeData.prior_level_of_function}
                  onChange={(e) => setDischargeData(prev => ({ ...prev, prior_level_of_function: e.target.value }))} />
              </div>
              <div>
                <label className="label text-xs">Current Level of Function</label>
                <textarea className="textarea text-sm" rows={3}
                  disabled={!!existingSignedAt}
                  placeholder="Describe the patient's current functional level at discharge..."
                  value={dischargeData.current_level_of_function}
                  onChange={(e) => setDischargeData(prev => ({ ...prev, current_level_of_function: e.target.value }))} />
              </div>
            </div>
          </div>

          {/* Section 5: Discharge Recommendations */}
          <div className="card p-5 mb-4 bg-amber-50/30 border-l-4 border-l-amber-400">
            <h2 className="text-base font-semibold text-[var(--color-text)] mb-4 flex items-center gap-2">
              <ClipboardCheck className="w-5 h-5 text-amber-600" />
              Discharge Recommendations
            </h2>
            <div className="space-y-3">
              {(Object.entries(DISCHARGE_RECOMMENDATION_LABELS) as [DischargeRecommendation, string][]).map(([key, label]) => (
                <div key={key}>
                  <label className="flex items-start gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={dischargeData.recommendations.includes(key)}
                      disabled={!!existingSignedAt}
                      onChange={(e) => {
                        setDischargeData(prev => ({
                          ...prev,
                          recommendations: e.target.checked
                            ? [...prev.recommendations, key]
                            : prev.recommendations.filter(r => r !== key),
                        }));
                      }}
                      className="mt-0.5 w-4 h-4 rounded border-gray-300 accent-amber-600"
                    />
                    <span className="text-sm text-[var(--color-text)]">{label}</span>
                  </label>
                  {key === 'referral' && dischargeData.recommendations.includes('referral') && (
                    <input className="input text-sm mt-1 ml-6" placeholder="Referred to..."
                      disabled={!!existingSignedAt}
                      value={dischargeData.referral_to}
                      onChange={(e) => setDischargeData(prev => ({ ...prev, referral_to: e.target.value }))} />
                  )}
                  {key === 'return_to_therapy' && dischargeData.recommendations.includes('return_to_therapy') && (
                    <input className="input text-sm mt-1 ml-6" placeholder="Return to therapy if..."
                      disabled={!!existingSignedAt}
                      value={dischargeData.return_to_therapy_if}
                      onChange={(e) => setDischargeData(prev => ({ ...prev, return_to_therapy_if: e.target.value }))} />
                  )}
                  {key === 'equipment' && dischargeData.recommendations.includes('equipment') && (
                    <input className="input text-sm mt-1 ml-6" placeholder="Equipment details..."
                      disabled={!!existingSignedAt}
                      value={dischargeData.equipment_details}
                      onChange={(e) => setDischargeData(prev => ({ ...prev, equipment_details: e.target.value }))} />
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4">
              <label className="label text-xs">Additional Recommendations</label>
              <textarea className="textarea text-sm" rows={3}
                disabled={!!existingSignedAt}
                placeholder="Any additional recommendations, home program details, or follow-up instructions..."
                value={dischargeData.additional_recommendations}
                onChange={(e) => setDischargeData(prev => ({ ...prev, additional_recommendations: e.target.value }))} />
            </div>
          </div>
          </>
        )}

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
        {justSigned ? (
          <>
            <div className="card p-5 mb-4 border-l-4 border-l-emerald-400 bg-emerald-50/50">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-emerald-800 flex items-center gap-2">
                    <CheckCircle className="w-4 h-4" />
                    Note signed and saved
                  </p>
                  <p className="text-xs text-emerald-700 mt-1">
                    Would you like to create an invoice for this session?
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="btn-ghost btn-sm"
                    onClick={() => navigate(`/clients/${clientId}`)}
                  >
                    Skip
                  </button>
                  <button
                    className="btn-primary btn-sm flex items-center gap-1.5"
                    onClick={handleCreateInvoice}
                    disabled={creatingInvoice}
                  >
                    <Receipt className="w-4 h-4" />
                    {creatingInvoice ? 'Creating...' : 'Create Invoice'}
                  </button>
                </div>
              </div>
            </div>
            {showProNudge && (
              <div className="flex items-center justify-between px-4 py-2.5 mb-8 rounded-lg bg-[var(--color-primary)]/5 border border-[var(--color-primary)]/20">
                <p className="text-xs text-[var(--color-text-secondary)]">
                  Pro tip: PocketChart Pro can auto-generate skilled documentation from quick taps.
                </p>
                <button
                  className="text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text)] ml-4 flex-shrink-0"
                  onClick={async () => {
                    setShowProNudge(false);
                    try { await window.api.settings.set('pro_nudge_last_shown', new Date().toISOString()); } catch { /* ignore */ }
                  }}
                >
                  Dismiss
                </button>
              </div>
            )}
          </>
        ) : (
          <div className="flex items-center justify-between pb-8">
            <div>
              {isEditing && !existingSignedAt && (
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
                  {confirmingDelete ? 'Click again to confirm' : 'Delete Note'}
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
        )}
      </div>

      {/* Quick Lookback Sidebar */}
      {sidebarOpen && (
        <div className="w-80 border-l border-[var(--color-border)] bg-gray-50/50 overflow-y-auto flex-shrink-0">
          <div className="p-4">
            <h2 className="text-sm font-semibold text-[var(--color-text)] mb-4 flex items-center gap-2">
              <History className="w-4 h-4 text-[var(--color-primary)]" />
              Quick Lookback
            </h2>

            {/* Goals */}
            <div className="mb-5">
              <h3 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <Target className="w-3.5 h-3.5" />
                Goals
              </h3>
              {goals.length === 0 ? (
                <p className="text-xs text-[var(--color-text-secondary)] italic">
                  No goals
                </p>
              ) : (
                <div className="space-y-2">
                  {/* Active goals */}
                  {activeGoals.map((goal) => (
                    <div
                      key={goal.id}
                      className="card p-2.5 text-xs bg-amber-50/60 border-l-4 border-l-amber-400"
                    >
                      <p className="text-[var(--color-text)] leading-snug mb-1.5">
                        {goal.goal_text}
                      </p>
                      {/* Measurement progress bar */}
                      {(goal.baseline_value || goal.baseline > 0 || goal.target_value || goal.target > 0) && (
                        <GoalProgressBar
                          measurement_type={(goal.measurement_type || 'percentage') as MeasurementType}
                          baseline_value={goal.baseline_value || `${goal.baseline}`}
                          baseline_numeric={goal.baseline ?? 0}
                          target_value={goal.target_value || `${goal.target}`}
                          target_numeric={goal.target ?? 0}
                          compact
                        />
                      )}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`badge text-[10px] ${goal.goal_type === 'STG' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                          {goal.goal_type}
                        </span>
                        <select
                          className="text-[10px] border rounded px-1.5 py-0.5 cursor-pointer bg-emerald-50 text-emerald-700 border-emerald-200"
                          value={goal.status}
                          onChange={(e) => handleGoalStatusChange(goal.id, e.target.value as GoalStatus)}
                        >
                          <option value="active">Active</option>
                          <option value="met">Met</option>
                          <option value="discontinued">DC'd</option>
                          <option value="modified">Modified</option>
                        </select>
                        {goal.target_date && (
                          <span className="text-[var(--color-text-secondary)] text-[10px]">
                            Target: {formatDate(goal.target_date)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                  {/* Met / Inactive goals — collapsed */}
                  {goals.filter(g => g.status !== 'active').length > 0 && (
                    <details className="group">
                      <summary className="flex items-center gap-1.5 text-[10px] font-medium text-[var(--color-text-secondary)] cursor-pointer hover:text-[var(--color-text)] py-1">
                        <CheckCircle size={11} className="text-green-500" />
                        Goals Met / Completed ({goals.filter(g => g.status === 'met').length} met, {goals.filter(g => g.status !== 'active' && g.status !== 'met').length} other)
                      </summary>
                      <div className="space-y-1.5 mt-1.5">
                        {goals.filter(g => g.status !== 'active').map((goal) => (
                          <div
                            key={goal.id}
                            className="card p-2 text-xs bg-gray-50/80 border-l-4 border-l-gray-300 opacity-70"
                          >
                            <p className="text-[var(--color-text-secondary)] leading-snug mb-1">
                              {goal.goal_text}
                            </p>
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className={`badge text-[10px] ${goal.goal_type === 'STG' ? 'bg-blue-50 text-blue-600' : 'bg-purple-50 text-purple-600'}`}>
                                {goal.goal_type}
                              </span>
                              <span className={`text-[10px] font-medium ${
                                goal.status === 'met' ? 'text-green-600' :
                                goal.status === 'discontinued' ? 'text-gray-500' :
                                'text-amber-600'
                              }`}>
                                {goal.status === 'met' ? '✓ Met' : goal.status === 'discontinued' ? "DC'd" : 'Modified'}
                              </span>
                              {goal.met_date && (
                                <span className="text-[10px] text-green-600">{formatDate(goal.met_date)}</span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}
            </div>

            {/* Staged Goals in Sidebar */}
            {stagedGoals.length > 0 && (
              <div className="mb-4">
                <h3 className="text-xs font-semibold text-amber-600 uppercase tracking-wider mb-2 flex items-center gap-1.5">
                  <Flag className="w-3.5 h-3.5" />
                  Flagged for Checkpoint ({stagedGoals.length})
                </h3>
                <div className="space-y-2">
                  {stagedGoals.map((sg) => (
                    <div key={sg.id} className="p-2 rounded-lg text-xs bg-amber-50/80 border-l-3 border-l-amber-400 group relative">
                      <button
                        type="button"
                        className="absolute top-1 right-1 p-0.5 rounded text-gray-300 hover:text-red-500 hover:bg-red-50 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="Remove flagged goal"
                        onClick={async () => {
                          if (!clientId) return;
                          await window.api.stagedGoals.dismiss(sg.id, 'Removed by user');
                          const updated = await window.api.stagedGoals.listByClient(parseInt(clientId, 10));
                          setStagedGoals(updated);
                        }}
                      >
                        <X size={12} />
                      </button>
                      <p className="text-[var(--color-text)] leading-snug pr-5">{sg.goal_text}</p>
                      <div className="flex items-center gap-1 mt-1">
                        <span className="text-[10px] font-medium px-1 py-0.5 rounded bg-amber-100 text-amber-700">{sg.goal_type}</span>
                        {sg.category && <span className="text-[10px] text-[var(--color-text-secondary)]">{sg.category}</span>}
                      </div>
                      {sg.rationale && <p className="text-[10px] text-[var(--color-text-secondary)] mt-1 italic">{sg.rationale}</p>}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Flag Goal for Checkpoint */}
            {!existingSignedAt && (
              <div className="mb-4">
                <button
                  type="button"
                  className="w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-amber-600 hover:bg-amber-50 border border-amber-200 transition-colors"
                  onClick={() => setShowStagedForm(!showStagedForm)}
                >
                  <Flag className="w-3.5 h-3.5" />
                  Flag Goal for Checkpoint
                </button>
                {showStagedForm && (
                  <div className="mt-2 p-3 rounded-lg bg-amber-50/50 border border-amber-200 space-y-2">
                    {/* Category dropdown from goal patterns */}
                    <select
                      className="w-full px-2 py-1 text-xs border border-amber-200 rounded-md bg-white"
                      value={stagedGoalCategory}
                      onChange={(e) => setStagedGoalCategory(e.target.value)}
                    >
                      <option value="">Select category...</option>
                      {patternCategories.map((cat) => (
                        <option key={cat} value={cat}>{cat}</option>
                      ))}
                    </select>
                    <textarea
                      className="w-full px-2 py-1.5 text-xs border border-amber-200 rounded-md bg-white"
                      rows={2}
                      placeholder="Goal idea..."
                      value={stagedGoalText}
                      onChange={(e) => setStagedGoalText(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <select className="flex-1 px-2 py-1 text-xs border border-amber-200 rounded-md bg-white" value={stagedGoalType}
                        onChange={(e) => setStagedGoalType(e.target.value as 'STG' | 'LTG')}>
                        <option value="STG">STG</option>
                        <option value="LTG">LTG</option>
                      </select>
                    </div>
                    <textarea
                      className="w-full px-2 py-1.5 text-xs border border-amber-200 rounded-md bg-white"
                      rows={1}
                      placeholder="Rationale — what prompted this? (optional)"
                      value={stagedGoalRationale}
                      onChange={(e) => setStagedGoalRationale(e.target.value)}
                    />
                    <div className="flex gap-2">
                      <button type="button" className="flex-1 px-2 py-1 text-xs rounded-md text-gray-600 hover:bg-gray-100" onClick={() => { setShowStagedForm(false); setStagedGoalText(''); setStagedGoalCategory(''); setStagedGoalRationale(''); }}>Cancel</button>
                      <button type="button" className="flex-1 px-2 py-1 text-xs rounded-md bg-amber-500 text-white hover:bg-amber-600 font-medium" onClick={async () => {
                        if (!stagedGoalText.trim() || !clientId) return;
                        await window.api.stagedGoals.create({
                          client_id: parseInt(clientId, 10),
                          goal_text: stagedGoalText.trim(),
                          goal_type: stagedGoalType,
                          category: stagedGoalCategory.trim(),
                          rationale: stagedGoalRationale.trim(),
                          flagged_from_note_id: savedNoteId,
                        });
                        setStagedGoalText(''); setStagedGoalCategory(''); setStagedGoalRationale(''); setShowStagedForm(false);
                        const updated = await window.api.stagedGoals.listByClient(parseInt(clientId, 10));
                        setStagedGoals(updated);
                      }}>Flag Goal</button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Recent Notes */}
            <div>
              <h3 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-2 flex items-center gap-1.5">
                <FileText className="w-3.5 h-3.5" />
                Recent Notes
              </h3>
              {recentNotes.length === 0 ? (
                <p className="text-xs text-[var(--color-text-secondary)] italic">
                  No previous notes
                </p>
              ) : (
                <div className="space-y-2">
                  {recentNotes.map((note) => {
                    const isExpanded = expandedNoteIds.has(note.id);
                    return (
                      <div key={note.id} className="card p-2.5 text-xs bg-blue-50/60 border-l-4 border-l-blue-400">
                        <button
                          className="w-full text-left flex items-start gap-1.5"
                          onClick={() => toggleExpandedNote(note.id)}
                        >
                          {isExpanded ? (
                            <ChevronDown className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-[var(--color-text-secondary)]" />
                          ) : (
                            <ChevronRight className="w-3.5 h-3.5 mt-0.5 flex-shrink-0 text-[var(--color-text-secondary)]" />
                          )}
                          <div className="flex-1 min-w-0">
                            <p className="font-medium text-[var(--color-text)]">
                              {formatDate(note.date_of_service)}
                            </p>
                            {!isExpanded && (
                              <p className="text-[var(--color-text-secondary)] line-clamp-2 mt-0.5">
                                {note.subjective
                                  ? note.subjective.slice(0, 100) +
                                    (note.subjective.length > 100 ? '...' : '')
                                  : 'No subjective recorded'}
                              </p>
                            )}
                          </div>
                        </button>
                        {isExpanded && (
                          <div className="mt-2 ml-5 space-y-2 text-[var(--color-text)]">
                            <div>
                              <p className="font-semibold text-[var(--color-primary)] text-[10px] uppercase">
                                Subjective
                              </p>
                              <p className="leading-snug">{note.subjective || '--'}</p>
                            </div>
                            <div>
                              <p className="font-semibold text-[var(--color-primary)] text-[10px] uppercase">
                                Objective
                              </p>
                              <p className="leading-snug">{note.objective || '--'}</p>
                            </div>
                            <div>
                              <p className="font-semibold text-[var(--color-primary)] text-[10px] uppercase">
                                Assessment
                              </p>
                              <p className="leading-snug">{note.assessment || '--'}</p>
                            </div>
                            <div>
                              <p className="font-semibold text-[var(--color-primary)] text-[10px] uppercase">
                                Plan
                              </p>
                              <p className="leading-snug">{note.plan || '--'}</p>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Quick Invoice Action */}
            {existingSignedAt && clientId && (
              <div className="mt-5 pt-4 border-t border-[var(--color-border)]">
                {existingInvoice ? (
                  <button
                    className="w-full btn-secondary btn-sm flex items-center justify-center gap-1.5"
                    onClick={() => navigate(`/clients/${clientId}`, { state: { tab: 'billing', invoiceId: existingInvoice.invoice_id } })}
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    Show Invoice ({existingInvoice.invoice_number})
                  </button>
                ) : (
                  <button
                    className="w-full btn-primary btn-sm flex items-center justify-center gap-1.5"
                    onClick={handleCreateInvoice}
                    disabled={creatingInvoice || !savedNoteId}
                  >
                    <Receipt className="w-3.5 h-3.5" />
                    {creatingInvoice ? 'Creating...' : 'Create Invoice'}
                  </button>
                )}
                <button
                  className="w-full btn-ghost btn-sm flex items-center justify-center gap-1.5 mt-1"
                  onClick={() => navigate(`/clients/${clientId}`, { state: { tab: 'billing' } })}
                >
                  <CreditCard className="w-3.5 h-3.5" />
                  View Billing
                </button>
              </div>
            )}
          </div>
        </div>
      )}
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
    </div>
  );
}

// ── SOAP Section Card sub-component ──

interface SOAPSectionCardProps {
  title: string;
  sectionCode: SOAPSection;
  discipline: Discipline;
  value: string;
  onChange: (value: string) => void;
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  noteBankBtnRef: React.RefObject<HTMLButtonElement | null>;
  noteBankOpen: SOAPSection | null;
  setNoteBankOpen: (section: SOAPSection | null) => void;
  onInsert: (phrase: string) => void;
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  placeholder?: string;
  disabled?: boolean;
  priorityCategories?: string[];
}

const soapSectionTint: Record<SOAPSection, string> = {
  S: 'bg-sky-50/50',
  O: 'bg-amber-50/50',
  A: 'bg-violet-50/50',
  P: 'bg-rose-50/50',
};

function SOAPSectionCard({
  title,
  sectionCode,
  discipline,
  value,
  onChange,
  textareaRef,
  noteBankBtnRef,
  noteBankOpen,
  setNoteBankOpen,
  onInsert,
  anchorRef,
  placeholder: customPlaceholder,
  disabled,
  priorityCategories = [],
}: SOAPSectionCardProps) {
  return (
    <div className={`card p-6 mb-6 ${soapSectionTint[sectionCode]}`}>
      <div className="flex items-center justify-between mb-3">
        <h2 className="section-title mb-0">{title}</h2>
        <div className="relative">
          <button
            ref={noteBankBtnRef}
            className="btn-ghost btn-sm flex items-center gap-1.5"
            onClick={() =>
              setNoteBankOpen(noteBankOpen === sectionCode ? null : sectionCode)
            }
          >
            <BookOpen className="w-3.5 h-3.5" />
            Note Bank
          </button>
          <NoteBankPopover
            isOpen={noteBankOpen === sectionCode}
            onClose={() => setNoteBankOpen(null)}
            onInsert={onInsert}
            discipline={discipline}
            section={sectionCode}
            anchorRef={anchorRef}
            priorityCategories={priorityCategories}
          />
        </div>
      </div>

      {/* Quick Chips Row */}
      <div className="mb-3">
        <QuickChips
          discipline={discipline}
          section={sectionCode}
          onInsert={onInsert}
          maxChips={6}
          onOpenFullBank={() => setNoteBankOpen(sectionCode)}
          priorityCategories={priorityCategories}
        />
      </div>

      <SmartTextarea
        ref={textareaRef}
        className="textarea"
        rows={4}
        placeholder={customPlaceholder || `Enter ${title.toLowerCase()} findings...`}
        value={value}
        onChange={onChange}
        discipline={discipline}
        section={sectionCode}
        disabled={disabled}
      />
    </div>
  );
}
