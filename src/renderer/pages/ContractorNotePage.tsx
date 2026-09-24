import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save, PenLine, CheckCircle, Clock, User, Building2, ClipboardList, Stethoscope, Download, Target, Unlock, Plus, X, Mail, ShieldAlert, FileCheck, Paperclip, LogOut, FileText } from 'lucide-react';
import type { ContractedEntity, EntityDocument, ContractDischargeData, ContractDischargeGoalStatus, DischargeReason, DischargeGoalStatus, DischargeRecommendation } from '@shared/types';
import { DISCHARGE_REASON_LABELS, DISCHARGE_GOAL_STATUS_LABELS, DISCHARGE_RECOMMENDATION_LABELS } from '@shared/types';
import { METRIC_OPTIONS } from '@shared/goal-metrics';
import { stripGoalConditionTail } from '@shared/compose-goal-text';
import EmailComposeModal from '../components/EmailComposeModal';

const PERCENT_OPTIONS = METRIC_OPTIONS.percentage || [];

/** One LTG or STG entry. `timeframe` is free text but a datalist suggests common values. */
interface GoalEntry {
  text: string;
  timeframe: string;
}

interface NoteState {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  time_in: string;
  time_out: string;
  medical_history: string;
  interventions_provided: string;
  long_term_goals: GoalEntry[];
  short_term_goals: GoalEntry[];
}

const EMPTY_NOTE: NoteState = { subjective: '', objective: '', assessment: '', plan: '', time_in: '', time_out: '', medical_history: '', interventions_provided: '', long_term_goals: [], short_term_goals: [] };

type ContractNoteType = 'soap' | 'evaluation' | 'discharge';

const EMPTY_DISCHARGE: ContractDischargeData = {
  discharge_reason: 'goals_met',
  discharge_reason_detail: '',
  start_of_care: '',
  discharge_date: '',
  total_visits: 0,
  frequency_per_week: null,
  duration_weeks: null,
  primary_dx: '',
  discipline: '',
  discharge_summary: '',
  goal_statuses: [],
  recommendations: [],
  referral_to: '',
  return_to_therapy_if: '',
  equipment_details: '',
  additional_recommendations: '',
};

const DISCHARGE_REASONS = Object.keys(DISCHARGE_REASON_LABELS) as DischargeReason[];
const DISCHARGE_GOAL_STATUSES = Object.keys(DISCHARGE_GOAL_STATUS_LABELS) as DischargeGoalStatus[];
const DISCHARGE_RECOMMENDATIONS = Object.keys(DISCHARGE_RECOMMENDATION_LABELS) as DischargeRecommendation[];

/** Stable key matching a goal-status entry to a free-text goal on the note. */
const goalStatusKey = (goalType: 'LTG' | 'STG', text: string) => `${goalType}::${text.trim()}`;

/** Datalist options for the timeframe input — clinically common LTG/STG horizons. */
const TIMEFRAME_OPTIONS = ['1 week', '2 weeks', '4 weeks', '6 weeks', '8 weeks', '12 weeks', '6 months', '1 year'];

/** Parse a goal list from the raw DB column. Handles three cases:
 *   1. Empty/null → empty list.
 *   2. JSON array of {text, timeframe} → use as-is.
 *   3. Anything else (legacy plaintext from before we structured it) → wrap in a single entry.
 *  This is what makes the upgrade non-destructive for notes saved under the old freetext UI. */
function parseGoalList(raw: string | null | undefined): GoalEntry[] {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.map((g: any) => ({
        text: String(g?.text ?? ''),
        timeframe: String(g?.timeframe ?? ''),
      }));
    }
  } catch {
    // Not JSON — legacy plaintext. Preserve as the first entry's text.
  }
  return [{ text: raw, timeframe: '' }];
}

const ContractorNotePage: React.FC = () => {
  const { noteId } = useParams<{ noteId: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const appointmentId = searchParams.get('appointmentId');
  const isNew = !noteId || noteId === 'new';

  const [appt, setAppt] = useState<any>(null);
  const [note, setNote] = useState<NoteState>(EMPTY_NOTE);
  const [existingNote, setExistingNote] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [signed, setSigned] = useState(false);
  const [signatureName, setSignatureName] = useState('');
  const [showSignForm, setShowSignForm] = useState(false);
  const [showUnsignConfirm, setShowUnsignConfirm] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Note type + discharge summary. note_type is persisted on the note; discharge_data holds
  // the discharge payload (JSON) when noteType === 'discharge'. Refs mirror the latest values
  // so the debounced save always writes fresh note_type/discharge_data.
  const [noteType, setNoteType] = useState<ContractNoteType>('soap');
  const [dischargeData, setDischargeData] = useState<ContractDischargeData>(EMPTY_DISCHARGE);
  const noteTypeRef = useRef<ContractNoteType>(noteType);
  const dischargeRef = useRef<ContractDischargeData>(dischargeData);
  useEffect(() => { noteTypeRef.current = noteType; }, [noteType]);
  useEffect(() => { dischargeRef.current = dischargeData; }, [dischargeData]);

  // "Goals this session" for a contract SESSION note — pulled from the patient's most recent
  // eval note so % + skilled-language can be documented quickly. Keyed by "TYPE::text".
  const [sessionGoals, setSessionGoals] = useState<{ goalType: 'LTG' | 'STG'; text: string }[]>([]);
  const [sessionGoalPct, setSessionGoalPct] = useState<Record<string, string>>({});
  const [discipline, setDiscipline] = useState('');

  // Email-to-agency state (mirrors EntityDetailPage: BAA gate + route sheets attach).
  const [entity, setEntity] = useState<ContractedEntity | null>(null);
  const [routeSheets, setRouteSheets] = useState<EntityDocument[]>([]);
  const [practiceName, setPracticeName] = useState('');
  const [emailModal, setEmailModal] = useState<{ to: string; subject: string; body: string; label: string } | null>(null);
  const [showBaaPrompt, setShowBaaPrompt] = useState(false);

  // Set note-type + discharge payload from a loaded note row.
  const hydrateType = useCallback((n: any) => {
    const t: ContractNoteType = n.note_type === 'evaluation' ? 'evaluation' : n.note_type === 'discharge' ? 'discharge' : 'soap';
    setNoteType(t);
    if (n.discharge_data) {
      try { setDischargeData({ ...EMPTY_DISCHARGE, ...JSON.parse(n.discharge_data) }); }
      catch { setDischargeData(EMPTY_DISCHARGE); }
    } else {
      setDischargeData(EMPTY_DISCHARGE);
    }
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (!isNew && noteId) {
        const n = await window.api.contractorNotes.get(parseInt(noteId));
        if (n) {
          setExistingNote(n);
          setNote({ subjective: n.subjective || '', objective: n.objective || '', assessment: n.assessment || '', plan: n.plan || '', time_in: n.time_in || '', time_out: n.time_out || '', medical_history: n.medical_history || '', interventions_provided: n.interventions_provided || '', long_term_goals: parseGoalList(n.long_term_goals), short_term_goals: parseGoalList(n.short_term_goals) });
          setSigned(Boolean(n.signed_at));
          if (n.signed_at) setSignatureName(n.signature_typed || '');
          hydrateType(n);
        }
        if (appointmentId) {
          const appts = await window.api.appointments.list({}).catch(() => []);
          const a = (appts as any[]).find((a: any) => a.id === parseInt(appointmentId));
          if (a) setAppt(a);
        }
      } else if (appointmentId) {
        const appts = await window.api.appointments.list({}).catch(() => []);
        const a = (appts as any[]).find((a: any) => a.id === parseInt(appointmentId));
        if (a) {
          setAppt(a);
          // Brand-new note: seed the type from the appointment (eval vs session).
          if (!a.note_id) setNoteType(a.session_type === 'eval' ? 'evaluation' : 'soap');
          // If a note already exists for this appointment, load it
          if (a.note_id) {
            const n = await window.api.contractorNotes.get(a.note_id).catch(() => null);
            if (n) {
              setExistingNote(n);
              setNote({ subjective: n.subjective || '', objective: n.objective || '', assessment: n.assessment || '', plan: n.plan || '', time_in: n.time_in || '', time_out: n.time_out || '', medical_history: n.medical_history || '', interventions_provided: n.interventions_provided || '', long_term_goals: parseGoalList(n.long_term_goals), short_term_goals: parseGoalList(n.short_term_goals) });
              setSigned(Boolean(n.signed_at));
              if (n.signed_at) setSignatureName(n.signature_typed || '');
              hydrateType(n);
            }
          }
          // Pre-fill time_in from appointment
          if (!note.time_in && a.scheduled_time) {
            setNote(prev => ({ ...prev, time_in: a.scheduled_time }));
          }
        }
      }
    } catch (err) {
      console.error('Failed to load contractor note:', err);
    } finally {
      setLoading(false);
    }
  }, [noteId, appointmentId, isNew, hydrateType]);

  useEffect(() => { load(); }, [load]);

  /** Convert structured goal arrays to JSON strings for the TEXT columns in the DB. */
  const serializeForSave = (noteData: NoteState) => ({
    ...noteData,
    long_term_goals: JSON.stringify(noteData.long_term_goals),
    short_term_goals: JSON.stringify(noteData.short_term_goals),
  });

  const doSave = useCallback(async (noteData: NoteState, sig?: { signed_at: string; signature_typed: string }) => {
    if (!appt && !existingNote) return null;
    setSaving(true);
    try {
      const payload = serializeForSave(noteData);
      // Read note_type/discharge_data from refs so a debounced save writes the latest values.
      const typeAndDischarge = {
        note_type: noteTypeRef.current,
        discharge_data: noteTypeRef.current === 'discharge' ? JSON.stringify(dischargeRef.current) : '',
      };
      if (existingNote) {
        const updated = await window.api.contractorNotes.update(existingNote.id, { ...payload, ...typeAndDischarge, ...sig });
        setExistingNote(updated);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        return updated;
      } else {
        const created = await window.api.contractorNotes.create({
          ...payload,
          ...typeAndDischarge,
          ...sig,
          contractor_patient_id: appt.contractor_patient_id || null,
          entity_id: appt.entity_id || null,
          patient_name: appt.contractor_patient_name || appt.patient_name || '',
          date_of_service: appt.scheduled_date,
          appointment_id: appt.id,
        });
        setExistingNote(created);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        return created;
      }
    } catch (err) {
      console.error('Save failed:', err);
      return null;
    } finally {
      setSaving(false);
    }
  }, [appt, existingNote]);

  /** Schedule a debounced save against a freshly-built note state. */
  const queueSave = (next: NoteState) => {
    setNote(next);
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => doSave(next), 1500);
  };

  // Debounced auto-save for simple string fields
  const handleChange = (field: Exclude<keyof NoteState, 'long_term_goals' | 'short_term_goals'>, value: string) => {
    queueSave({ ...note, [field]: value });
  };

  // ── Goal list mutations (LTG/STG share the same shape) ──
  type GoalListKey = 'long_term_goals' | 'short_term_goals';

  const addGoal = (kind: GoalListKey) => {
    queueSave({ ...note, [kind]: [...note[kind], { text: '', timeframe: '' }] });
  };

  const updateGoalField = (kind: GoalListKey, idx: number, field: keyof GoalEntry, value: string) => {
    const list = note[kind].map((g, i) => (i === idx ? { ...g, [field]: value } : g));
    queueSave({ ...note, [kind]: list });
  };

  const removeGoal = (kind: GoalListKey, idx: number) => {
    queueSave({ ...note, [kind]: note[kind].filter((_, i) => i !== idx) });
  };

  // ── Note-type + discharge mutations ──
  // Refs are synced immediately (not just via useEffect) so the save we schedule here
  // reads the new value even before the next render.
  const changeNoteType = (t: ContractNoteType) => {
    setNoteType(t);
    noteTypeRef.current = t;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => doSave(note), 600);
  };

  const updateDischarge = (patch: Partial<ContractDischargeData>) => {
    const next = { ...dischargeRef.current, ...patch };
    setDischargeData(next);
    dischargeRef.current = next;
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => doSave(note), 1500);
  };

  const toggleRecommendation = (rec: DischargeRecommendation) => {
    const cur = dischargeRef.current.recommendations;
    updateDischarge({ recommendations: cur.includes(rec) ? cur.filter(r => r !== rec) : [...cur, rec] });
  };

  const setGoalStatus = (goalType: 'LTG' | 'STG', text: string, status: DischargeGoalStatus) => {
    const key = goalStatusKey(goalType, text);
    const kept = dischargeRef.current.goal_statuses.filter(g => goalStatusKey(g.goal_type, g.text) !== key);
    updateDischarge({ goal_statuses: [...kept, { goal_type: goalType, text: text.trim(), status }] });
  };

  const getGoalStatus = (goalType: 'LTG' | 'STG', text: string): DischargeGoalStatus | '' => {
    const key = goalStatusKey(goalType, text);
    return dischargeRef.current.goal_statuses.find(g => goalStatusKey(g.goal_type, g.text) === key)?.status ?? '';
  };

  // Pull episode-summary defaults from the patient's existing history (attended visits,
  // first visit = start of care, discipline). `force` overwrites current values; otherwise
  // only fills fields the user hasn't set, so edits are never clobbered.
  const applyDischargeDefaults = async (force: boolean) => {
    const cpId: number | undefined = appt?.contractor_patient_id ?? existingNote?.contractor_patient_id ?? undefined;
    if (!cpId) return;
    try {
      const d = await window.api.contractorNotes.dischargeDefaults(cpId);
      const cur = dischargeRef.current;
      const today = new Date().toISOString().slice(0, 10);
      const dos = existingNote?.date_of_service || appt?.scheduled_date || today;

      // Derive frequency/duration from the visit span when we have both ends.
      let duration_weeks = cur.duration_weeks;
      let frequency_per_week = cur.frequency_per_week;
      if (d.start_of_care && d.last_visit) {
        const days = Math.max(0, (new Date(d.last_visit).getTime() - new Date(d.start_of_care).getTime()) / 86400000);
        const weeks = Math.max(1, Math.round(days / 7));
        if (force || cur.duration_weeks == null) duration_weeks = weeks;
        if ((force || cur.frequency_per_week == null) && d.total_visits > 0) {
          frequency_per_week = Math.max(1, Math.round(d.total_visits / weeks));
        }
      }

      updateDischarge({
        start_of_care: force || !cur.start_of_care ? (d.start_of_care || cur.start_of_care) : cur.start_of_care,
        discharge_date: cur.discharge_date || dos,
        total_visits: force || !cur.total_visits ? (d.total_visits || cur.total_visits) : cur.total_visits,
        discipline: force || !cur.discipline ? (d.discipline || cur.discipline) : cur.discipline,
        duration_weeks,
        frequency_per_week,
      });
    } catch (err) {
      console.error('Failed to load discharge defaults:', err);
    }
  };

  // Auto-prefill once when a note first becomes a discharge with empty episode data.
  const dischargePrefilled = useRef(false);
  useEffect(() => {
    if (noteType !== 'discharge' || dischargePrefilled.current) return;
    const cur = dischargeRef.current;
    if (!cur.start_of_care && !cur.total_visits) {
      dischargePrefilled.current = true;
      applyDischargeDefaults(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noteType, appt, existingNote]);

  // Discipline (for skilled-language phrasing) from the practice record.
  useEffect(() => {
    window.api.practice.get().then((p: any) => setDiscipline(p?.discipline || '')).catch(() => {});
  }, []);

  // Load the patient's goals from their most recent eval note — powers "Goals this session"
  // on a contract SESSION note.
  useEffect(() => {
    const cpId: number | undefined = appt?.contractor_patient_id ?? existingNote?.contractor_patient_id ?? undefined;
    if (!cpId || noteType !== 'soap') { setSessionGoals([]); return; }
    window.api.contractorNotes.list(cpId).then((notes) => {
      const ev = (notes as any[]).find(n => n.note_type === 'evaluation'); // list is date DESC → most recent eval
      if (!ev) { setSessionGoals([]); return; }
      const ltg = parseGoalList(ev.long_term_goals).filter(g => g.text.trim()).map(g => ({ goalType: 'LTG' as const, text: g.text }));
      const stg = parseGoalList(ev.short_term_goals).filter(g => g.text.trim()).map(g => ({ goalType: 'STG' as const, text: g.text }));
      setSessionGoals([...ltg, ...stg]);
    }).catch(() => setSessionGoals([]));
  }, [appt, existingNote, noteType]);

  // Append a skilled-language line for a goal (with the chosen %) into the Objective field.
  const insertGoalToObjective = (goalType: 'LTG' | 'STG', text: string) => {
    const key = `${goalType}::${text}`;
    const pct = sessionGoalPct[key];
    const provider = discipline || 'Clinician';
    const rawCore = text.replace(/^(Patient|Client|Pt)\s+will\s+/i, '').replace(/\.\s*$/, '');
    const core = stripGoalConditionTail(rawCore) || rawCore;
    const coreLc = core.charAt(0).toLowerCase() + core.slice(1);
    const perf = pct ? `${pct}% accuracy` : '___% accuracy';
    const line = `${provider} trained Pt to ${coreLc}. Pt completed with ${perf}.`;
    const next = note.objective.trim() ? `${note.objective.replace(/\s*$/, '')}\n${line}` : line;
    queueSave({ ...note, objective: next });
  };

  const handleSign = async () => {
    if (!signatureName.trim()) return;
    const sig = { signed_at: new Date().toISOString(), signature_typed: signatureName.trim() };
    const result = await doSave(note, sig);
    if (result) { setSigned(true); setShowSignForm(false); }
  };

  const handleUnsign = async () => {
    // Clear signature → flip back to draft. Re-signing re-stamps signed_at + signature_typed.
    const result = await doSave(note, { signed_at: '', signature_typed: '' });
    if (result) {
      setSigned(false);
      setShowUnsignConfirm(false);
      // Keep signatureName in state so re-signing pre-fills with the previous name
    }
  };

  const handleDownloadPdf = async () => {
    if (!existingNote?.id) return;
    try {
      const { base64Pdf, filename } = await window.api.notes.generatePdf(existingNote.id);
      await window.api.notes.savePdf({ base64Pdf, filename });
    } catch (err) {
      console.error('Failed to download note PDF:', err);
    }
  };

  // ── Email to agency (BAA-gated; route sheets for this visit ride along) ──

  const noteApptId: number | undefined = existingNote?.appointment_id || appt?.id;
  const noteEntityId: number | undefined = existingNote?.entity_id || appt?.entity_id;

  useEffect(() => {
    if (!noteEntityId) return;
    window.api.contractedEntities.get(noteEntityId).then(setEntity).catch(() => setEntity(null));
    window.api.entityDocuments.list(noteEntityId)
      .then((docs) => setRouteSheets(docs.filter((d) => d.category === 'route_sheet' && d.appointment_id === noteApptId)))
      .catch(() => setRouteSheets([]));
    window.api.practice.get().then((p: any) => setPracticeName(p?.name || '')).catch(() => {});
  }, [noteEntityId, noteApptId]);

  const composeEmail = () => {
    if (!entity || !existingNote) return;
    const label = existingNote.note_type === 'evaluation' ? 'Evaluation'
      : existingNote.note_type === 'discharge' ? 'Discharge summary'
      : 'Session note';
    const patient = (existingNote.patient_name || appt?.patient_name || 'patient').trim();
    const date = existingNote.date_of_service || appt?.scheduled_date || '';
    const greeting = entity.contact_name ? `Hi ${entity.contact_name},` : 'Hi,';
    setEmailModal({
      to: entity.contact_email || '',
      subject: `${label} — ${patient} (${date})`,
      body: `${greeting}\n\nPlease find attached the ${label.toLowerCase()} for ${patient}, dated ${date}.${routeSheets.length ? ' The route sheet for the visit is attached as well.' : ''}\n\nBest regards,\n${practiceName}`.trimEnd(),
      label: `${label} — ${patient} (${date}).pdf${routeSheets.length ? ` + ${routeSheets.length} route sheet${routeSheets.length === 1 ? '' : 's'}` : ''}`,
    });
  };

  const handleEmailClick = () => {
    if (!entity) return;
    if (entity.baa_on_file) composeEmail();
    else setShowBaaPrompt(true);
  };

  // Attaches to the VISIT (entity_documents.appointment_id), so the sheet also
  // shows on the entity's appointments table and rides along with note emails.
  const handleAttachRouteSheet = async () => {
    if (!noteEntityId || !noteApptId) return;
    try {
      const doc = await window.api.entityDocuments.upload({
        entityId: noteEntityId,
        category: 'route_sheet',
        appointmentId: noteApptId,
      });
      if (doc) setRouteSheets((prev) => [...prev, doc]);
    } catch (err) {
      console.error('Failed to attach route sheet:', err);
    }
  };

  const confirmBaaOnFile = async () => {
    if (!entity) return;
    try {
      const updated = await window.api.contractedEntities.update(entity.id, { baa_on_file: 1 });
      setEntity(updated);
      setShowBaaPrompt(false);
      // Compose with the freshly updated entity
      setTimeout(composeEmail, 0);
    } catch (err) {
      console.error('Failed to update BAA status:', err);
    }
  };

  const handleSendEmail = async (to: string, subject: string, body: string) => {
    if (!existingNote?.id) return;
    const gen = await window.api.notes.generatePdf(existingNote.id);
    const attachments = [{ fileName: gen.filename, contentBase64: gen.base64Pdf, contentType: 'application/pdf' }];
    for (const sheet of routeSheets) {
      attachments.push(await window.api.entityDocuments.readAsAttachment(sheet.id));
    }
    await window.api.email.send({ to, subject, bodyText: body, attachments });
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="card p-12 text-center text-[var(--color-text-secondary)]">Loading…</div>
      </div>
    );
  }

  if (!appt && !existingNote) {
    return (
      <div className="p-6">
        <div className="card p-12 text-center">
          <h3 className="text-lg font-semibold text-[var(--color-text)] mb-2">Appointment not found</h3>
          <button className="btn-primary" onClick={() => navigate('/calendar')}>Back to Calendar</button>
        </div>
      </div>
    );
  }

  /** Reusable card renderer for the LTG/STG repeating lists. Kept inside the component
   *  so it closes over `disabled` / handler refs without prop-drilling them. */
  function renderGoalListCard(opts: {
    kind: GoalListKey;
    title: string;
    shortLabel: 'LTG' | 'STG';
    placeholder: string;
    entries: GoalEntry[];
    disabled: boolean;
    onAdd: () => void;
    onUpdate: (idx: number, field: keyof GoalEntry, value: string) => void;
    onRemove: (idx: number) => void;
  }) {
    const datalistId = `${opts.kind}-timeframes`;
    return (
      <div className="card p-4" key={opts.kind}>
        <div className="flex items-center gap-2 mb-3">
          <span className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center text-violet-600">
            <Target size={13} />
          </span>
          <h3 className="text-sm font-semibold text-[var(--color-text)]">{opts.title}</h3>
        </div>

        {/* Shared datalist so both inputs in this card see the same suggestions */}
        <datalist id={datalistId}>
          {TIMEFRAME_OPTIONS.map(t => <option key={t} value={t} />)}
        </datalist>

        {opts.entries.length === 0 && (
          <p className="text-xs text-[var(--color-text-secondary)]/70 italic mb-3">
            No {opts.shortLabel.toLowerCase()}s yet — add one below.
          </p>
        )}

        <div className="space-y-3">
          {opts.entries.map((g, idx) => (
            <div key={idx} className="rounded-lg border border-[var(--color-border)] p-3 bg-[var(--color-surface-alt)]/30">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-semibold text-violet-600">
                  {opts.shortLabel} {idx + 1}
                </span>
                {!opts.disabled && (
                  <button
                    type="button"
                    className="text-[var(--color-text-secondary)]/60 hover:text-red-600 transition-colors"
                    onClick={() => opts.onRemove(idx)}
                    title={`Remove ${opts.shortLabel} ${idx + 1}`}
                  >
                    <X size={14} />
                  </button>
                )}
              </div>
              <textarea
                className="w-full min-h-[70px] text-sm text-[var(--color-text)] bg-transparent resize-y focus:outline-none placeholder:text-[var(--color-text-secondary)]/50"
                placeholder={opts.placeholder}
                value={g.text}
                disabled={opts.disabled}
                onChange={e => opts.onUpdate(idx, 'text', e.target.value)}
              />
              <div className="flex items-center gap-2 mt-2 pt-2 border-t border-[var(--color-border)]/60">
                <label className="text-xs text-[var(--color-text-secondary)] whitespace-nowrap">Timeframe:</label>
                <input
                  type="text"
                  list={datalistId}
                  className="text-xs px-2 py-1 border border-[var(--color-border)] rounded bg-white focus:outline-none focus:border-violet-400 w-32"
                  placeholder="e.g., 12 weeks"
                  value={g.timeframe}
                  disabled={opts.disabled}
                  onChange={e => opts.onUpdate(idx, 'timeframe', e.target.value)}
                />
              </div>
            </div>
          ))}
        </div>

        {!opts.disabled && (
          <button
            type="button"
            className="mt-3 inline-flex items-center gap-1.5 text-xs font-medium text-violet-600 hover:text-violet-700 transition-colors"
            onClick={opts.onAdd}
          >
            <Plus size={14} /> Add {opts.shortLabel.toLowerCase() === 'ltg' ? 'long-term' : 'short-term'} goal
          </button>
        )}
      </div>
    );
  }

  const patientName = existingNote?.contractor_patient_name || appt?.contractor_patient_name || appt?.patient_name || 'Unknown patient';
  const entityName = existingNote?.entity_name || appt?.entity_name || '';
  const dateOfService = existingNote?.date_of_service || appt?.scheduled_date || '';
  const isEval = noteType === 'evaluation';
  const isDischarge = noteType === 'discharge';
  // Goals entered on this note, flattened for the discharge Final Goal Status card.
  const dischargeGoalRows: { goalType: 'LTG' | 'STG'; text: string }[] = [
    ...note.long_term_goals.filter(g => g.text.trim()).map(g => ({ goalType: 'LTG' as const, text: g.text })),
    ...note.short_term_goals.filter(g => g.text.trim()).map(g => ({ goalType: 'STG' as const, text: g.text })),
  ];

  return (
    <div className="p-6 max-w-3xl mx-auto">
      <button className="btn-ghost btn-sm gap-1.5 mb-4" onClick={() => navigate('/calendar')}>
        <ArrowLeft size={16} /> Back to Calendar
      </button>

      {/* Header */}
      <div className="card p-5 mb-6">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
              <User size={22} className="text-purple-600" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-[var(--color-text)]">{patientName}</h1>
              {entityName && (
                <div className="flex items-center gap-1.5 text-sm text-[var(--color-text-secondary)] mt-0.5">
                  <Building2 size={13} />
                  {entityName}
                </div>
              )}
              <div className="flex items-center gap-3 mt-1 text-xs text-[var(--color-text-secondary)]">
                <span>{dateOfService}</span>
                {isEval && (
                  <span className="px-1.5 py-0.5 rounded bg-violet-100 text-violet-700 font-medium">Eval</span>
                )}
                {isDischarge && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium flex items-center gap-1">
                    <LogOut size={11} /> Discharge Summary
                  </span>
                )}
              </div>
              {/* Note Type — lets a session be turned into a discharge summary. Locked once signed. */}
              {!signed && (
                <div className="flex items-center gap-2 mt-2">
                  <label className="text-xs font-medium text-[var(--color-text-secondary)]">Note Type:</label>
                  <select
                    className="select text-xs py-1"
                    value={noteType}
                    onChange={(e) => changeNoteType(e.target.value as ContractNoteType)}
                  >
                    <option value="soap">Session Note</option>
                    <option value="evaluation">Evaluation</option>
                    <option value="discharge">Discharge Summary</option>
                  </select>
                </div>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            {saved && (
              <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                <CheckCircle size={13} /> Saved
              </span>
            )}
            {existingNote && (
              <button
                className="btn-ghost btn-sm gap-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                onClick={handleDownloadPdf}
                title="Download note as PDF"
              >
                <Download size={14} /> PDF
              </button>
            )}
            {entity && noteApptId && (
              routeSheets.length > 0 ? (
                <span className="inline-flex items-center">
                  <button
                    className="btn-ghost btn-sm gap-1.5 text-teal-600 hover:text-teal-700"
                    onClick={() => window.api.entityDocuments.open(routeSheets[0].id)}
                    title={`Route sheet attached (${routeSheets[0].original_name}) — click to open. It rides along when this note is emailed.`}
                  >
                    <Paperclip size={14} /> Route sheet{routeSheets.length > 1 ? ` (${routeSheets.length})` : ''}
                  </button>
                  <button
                    className="btn-ghost btn-sm p-1 text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                    onClick={handleAttachRouteSheet}
                    title="Attach another route sheet"
                  >
                    <Plus size={12} />
                  </button>
                </span>
              ) : (
                <button
                  className="btn-ghost btn-sm gap-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                  onClick={handleAttachRouteSheet}
                  title="Attach a route sheet to this visit — it rides along when the note is emailed"
                >
                  <Paperclip size={14} /> Route sheet
                </button>
              )
            )}
            {existingNote && entity && (
              <button
                className="btn-ghost btn-sm gap-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                onClick={handleEmailClick}
                title={`Email this note to ${entity.name}${entity.contact_email ? ` (${entity.contact_email})` : ''}`}
              >
                <Mail size={14} /> Email
              </button>
            )}
            {signed ? (
              <>
                <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-medium">
                  <CheckCircle size={13} /> Signed
                </span>
                <button
                  className="btn-ghost btn-sm gap-1.5 text-[var(--color-text-secondary)] hover:text-amber-600"
                  onClick={() => setShowUnsignConfirm(true)}
                  title="Reopen this note for editing"
                  disabled={saving}
                >
                  <Unlock size={14} /> Reopen
                </button>
              </>
            ) : (
              <button className="btn-primary btn-sm gap-1.5" onClick={() => setShowSignForm(true)} disabled={saving}>
                <PenLine size={14} /> Sign Note
              </button>
            )}
          </div>
        </div>

        {/* Time in/out */}
        <div className="flex items-center gap-4 mt-4 pt-4 border-t border-[var(--color-border)]">
          <Clock size={14} className="text-[var(--color-text-secondary)]" />
          <div className="flex items-center gap-3">
            <label className="text-xs text-[var(--color-text-secondary)]">Time in</label>
            <input type="time" className="text-xs px-2 py-1 border border-[var(--color-border)] rounded"
              value={note.time_in} disabled={signed}
              onChange={e => handleChange('time_in', e.target.value)} />
            <label className="text-xs text-[var(--color-text-secondary)]">Time out</label>
            <input type="time" className="text-xs px-2 py-1 border border-[var(--color-border)] rounded"
              value={note.time_out} disabled={signed}
              onChange={e => handleChange('time_out', e.target.value)} />
          </div>
        </div>
      </div>

      {/* Eval-only fields: Background / Med Hx + What Was Completed */}
      {isEval && (
        <div className="space-y-4 mb-4">
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center text-violet-600">
                <ClipboardList size={13} />
              </span>
              <h3 className="text-sm font-semibold text-[var(--color-text)]">Background / Medical History</h3>
            </div>
            <textarea
              className="w-full min-h-[100px] text-sm text-[var(--color-text)] bg-transparent resize-y focus:outline-none placeholder:text-[var(--color-text-secondary)]/50"
              placeholder="Relevant medical history, prior level of function, comorbidities, precautions…"
              value={note.medical_history}
              disabled={signed}
              onChange={e => handleChange('medical_history', e.target.value)}
            />
          </div>
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center text-violet-600">
                <Stethoscope size={13} />
              </span>
              <h3 className="text-sm font-semibold text-[var(--color-text)]">What Was Completed</h3>
            </div>
            <textarea
              className="w-full min-h-[100px] text-sm text-[var(--color-text)] bg-transparent resize-y focus:outline-none placeholder:text-[var(--color-text-secondary)]/50"
              placeholder="Tests/measures administered, interventions provided this session…"
              value={note.interventions_provided}
              disabled={signed}
              onChange={e => handleChange('interventions_provided', e.target.value)}
            />
          </div>
          {renderGoalListCard({
            kind: 'long_term_goals',
            title: 'Long-Term Goals',
            shortLabel: 'LTG',
            placeholder: 'Functional outcomes targeted by end of plan of care…',
            entries: note.long_term_goals,
            disabled: signed,
            onAdd: () => addGoal('long_term_goals'),
            onUpdate: (idx, field, value) => updateGoalField('long_term_goals', idx, field, value),
            onRemove: (idx) => removeGoal('long_term_goals', idx),
          })}
          {renderGoalListCard({
            kind: 'short_term_goals',
            title: 'Short-Term Goals',
            shortLabel: 'STG',
            placeholder: 'Measurable benchmark toward a long-term goal…',
            entries: note.short_term_goals,
            disabled: signed,
            onAdd: () => addGoal('short_term_goals'),
            onUpdate: (idx, field, value) => updateGoalField('short_term_goals', idx, field, value),
            onRemove: (idx) => removeGoal('short_term_goals', idx),
          })}
        </div>
      )}

      {/* ── Discharge Summary section ── */}
      {isDischarge && (
        <div className="space-y-4 mb-4">
          {/* Reason + Episode Summary */}
          <div className="card p-4 border-l-4 border-l-amber-400 bg-amber-50/30">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                  <LogOut size={13} />
                </span>
                <h3 className="text-sm font-semibold text-[var(--color-text)]">Discharge Details</h3>
              </div>
              {!signed && (
                <button
                  type="button"
                  className="text-xs font-medium text-amber-700 hover:text-amber-800 hover:underline"
                  onClick={() => applyDischargeDefaults(true)}
                  title="Re-pull start of care, visit count, and discipline from this patient's history"
                >
                  Pull from chart
                </button>
              )}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="label text-xs">Reason for Discharge</label>
                <select
                  className="select text-sm w-full"
                  value={dischargeData.discharge_reason}
                  disabled={signed}
                  onChange={(e) => updateDischarge({ discharge_reason: e.target.value as DischargeReason })}
                >
                  {DISCHARGE_REASONS.map(r => <option key={r} value={r}>{DISCHARGE_REASON_LABELS[r]}</option>)}
                </select>
              </div>
              <div>
                <label className="label text-xs">Reason Detail (optional)</label>
                <input className="input text-sm w-full" disabled={signed}
                  placeholder="Any specifics…"
                  value={dischargeData.discharge_reason_detail}
                  onChange={(e) => updateDischarge({ discharge_reason_detail: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
              <div>
                <label className="label text-xs">Start of Care</label>
                <input type="date" className="input text-sm w-full" disabled={signed}
                  value={dischargeData.start_of_care}
                  onChange={(e) => updateDischarge({ start_of_care: e.target.value })} />
              </div>
              <div>
                <label className="label text-xs">Discharge Date</label>
                <input type="date" className="input text-sm w-full" disabled={signed}
                  value={dischargeData.discharge_date || dateOfService}
                  onChange={(e) => updateDischarge({ discharge_date: e.target.value })} />
              </div>
              <div>
                <label className="label text-xs">Total Visits</label>
                <input type="number" min={0} className="input text-sm w-full" disabled={signed}
                  value={dischargeData.total_visits}
                  onChange={(e) => updateDischarge({ total_visits: parseInt(e.target.value) || 0 })} />
              </div>
              <div>
                <label className="label text-xs">Frequency (/week)</label>
                <input type="number" min={1} max={7} className="input text-sm w-full" disabled={signed}
                  value={dischargeData.frequency_per_week ?? ''}
                  onChange={(e) => updateDischarge({ frequency_per_week: parseInt(e.target.value) || null })} />
              </div>
              <div>
                <label className="label text-xs">Duration (weeks)</label>
                <input type="number" min={1} className="input text-sm w-full" disabled={signed}
                  value={dischargeData.duration_weeks ?? ''}
                  onChange={(e) => updateDischarge({ duration_weeks: parseInt(e.target.value) || null })} />
              </div>
              <div>
                <label className="label text-xs">Discipline</label>
                <input className="input text-sm w-full" disabled={signed}
                  placeholder="PT / OT / SLP…"
                  value={dischargeData.discipline}
                  onChange={(e) => updateDischarge({ discipline: e.target.value })} />
              </div>
            </div>
            <div className="mt-3">
              <label className="label text-xs">Primary Diagnosis</label>
              <input className="input text-sm w-full" disabled={signed}
                value={dischargeData.primary_dx}
                onChange={(e) => updateDischarge({ primary_dx: e.target.value })} />
            </div>
          </div>

          {/* Goals to close out — enter them here, then set a final status below */}
          {renderGoalListCard({
            kind: 'long_term_goals',
            title: 'Long-Term Goals',
            shortLabel: 'LTG',
            placeholder: 'Functional outcome targeted this episode…',
            entries: note.long_term_goals,
            disabled: signed,
            onAdd: () => addGoal('long_term_goals'),
            onUpdate: (idx, field, value) => updateGoalField('long_term_goals', idx, field, value),
            onRemove: (idx) => removeGoal('long_term_goals', idx),
          })}
          {renderGoalListCard({
            kind: 'short_term_goals',
            title: 'Short-Term Goals',
            shortLabel: 'STG',
            placeholder: 'Measurable benchmark…',
            entries: note.short_term_goals,
            disabled: signed,
            onAdd: () => addGoal('short_term_goals'),
            onUpdate: (idx, field, value) => updateGoalField('short_term_goals', idx, field, value),
            onRemove: (idx) => removeGoal('short_term_goals', idx),
          })}

          {/* Final Goal Status — one status per goal entered above */}
          <div className="card p-4 border-l-4 border-l-amber-400 bg-amber-50/30">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                <Target size={13} />
              </span>
              <h3 className="text-sm font-semibold text-[var(--color-text)]">Final Goal Status</h3>
            </div>
            {dischargeGoalRows.length === 0 ? (
              <p className="text-xs text-[var(--color-text-secondary)]/70 italic">
                Add long- or short-term goals above to set a final status for each.
              </p>
            ) : (
              <div className="space-y-2">
                {dischargeGoalRows.map((g) => (
                  <div key={`${g.goalType}-${g.text}`} className="flex items-center gap-3 p-2.5 rounded-lg bg-white border border-[var(--color-border)]">
                    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0 self-start mt-0.5 ${g.goalType === 'LTG' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                      {g.goalType}
                    </span>
                    <p className="text-sm text-[var(--color-text)] flex-1 min-w-0 leading-snug">{g.text}</p>
                    <select
                      className="select text-xs py-1 w-40 flex-shrink-0"
                      value={getGoalStatus(g.goalType, g.text)}
                      disabled={signed}
                      onChange={(e) => setGoalStatus(g.goalType, g.text, e.target.value as DischargeGoalStatus)}
                    >
                      <option value="">— status —</option>
                      {DISCHARGE_GOAL_STATUSES.map(s => <option key={s} value={s}>{DISCHARGE_GOAL_STATUS_LABELS[s]}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Discharge narrative */}
          <div className="card p-4 border-l-4 border-l-amber-400 bg-amber-50/30">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                <FileText size={13} />
              </span>
              <h3 className="text-sm font-semibold text-[var(--color-text)]">Discharge Summary</h3>
            </div>
            <textarea
              className="w-full min-h-[100px] text-sm text-[var(--color-text)] bg-transparent resize-y focus:outline-none placeholder:text-[var(--color-text-secondary)]/50"
              placeholder="Course of care, response to treatment, current level of function, and status at discharge…"
              value={dischargeData.discharge_summary}
              disabled={signed}
              onChange={(e) => updateDischarge({ discharge_summary: e.target.value })}
            />
          </div>

          {/* Recommendations */}
          <div className="card p-4 border-l-4 border-l-amber-400 bg-amber-50/30">
            <div className="flex items-center gap-2 mb-3">
              <span className="w-6 h-6 rounded-full bg-amber-100 flex items-center justify-center text-amber-600">
                <ClipboardList size={13} />
              </span>
              <h3 className="text-sm font-semibold text-[var(--color-text)]">Recommendations</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mb-3">
              {DISCHARGE_RECOMMENDATIONS.map(rec => (
                <label key={rec} className={`flex items-center gap-2 text-sm ${signed ? '' : 'cursor-pointer'}`}>
                  <input
                    type="checkbox"
                    className="rounded border-gray-300 accent-amber-500"
                    checked={dischargeData.recommendations.includes(rec)}
                    disabled={signed}
                    onChange={() => toggleRecommendation(rec)}
                  />
                  <span className="text-[var(--color-text)]">{DISCHARGE_RECOMMENDATION_LABELS[rec]}</span>
                </label>
              ))}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="label text-xs">Referral To (if any)</label>
                <input className="input text-sm w-full" disabled={signed}
                  value={dischargeData.referral_to}
                  onChange={(e) => updateDischarge({ referral_to: e.target.value })} />
              </div>
              <div>
                <label className="label text-xs">Return to Therapy If…</label>
                <input className="input text-sm w-full" disabled={signed}
                  value={dischargeData.return_to_therapy_if}
                  onChange={(e) => updateDischarge({ return_to_therapy_if: e.target.value })} />
              </div>
              <div>
                <label className="label text-xs">Equipment Details</label>
                <input className="input text-sm w-full" disabled={signed}
                  value={dischargeData.equipment_details}
                  onChange={(e) => updateDischarge({ equipment_details: e.target.value })} />
              </div>
              <div>
                <label className="label text-xs">Additional Recommendations</label>
                <input className="input text-sm w-full" disabled={signed}
                  value={dischargeData.additional_recommendations}
                  onChange={(e) => updateDischarge({ additional_recommendations: e.target.value })} />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SOAP fields — the "Goals This Session" card is injected right under Objective */}
      <div className="space-y-4">
        {(['subjective', 'objective', 'assessment', 'plan'] as const).map((field) => (
          <React.Fragment key={field}>
          <div className="card p-4">
            <div className="flex items-center gap-2 mb-2">
              <span className="w-6 h-6 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center text-[11px] font-bold text-[var(--color-primary)]">
                {field[0].toUpperCase()}
              </span>
              <h3 className="text-sm font-semibold text-[var(--color-text)] capitalize">{field}</h3>
            </div>
            <textarea
              className="w-full min-h-[100px] text-sm text-[var(--color-text)] bg-transparent resize-y focus:outline-none placeholder:text-[var(--color-text-secondary)]/50"
              placeholder={
                field === 'subjective' ? "Patient's reported symptoms, complaints, and goals…" :
                field === 'objective' ? 'Measurable findings, ROM, strength, function…' :
                field === 'assessment' ? 'Clinical impression, progress toward goals…' :
                'Treatment plan, frequency, HEP, next steps…'
              }
              value={note[field]}
              disabled={signed}
              onChange={e => handleChange(field, e.target.value)}
            />
          </div>
          {/* Goals This Session — sits directly under Objective */}
          {field === 'objective' && noteType === 'soap' && sessionGoals.length > 0 && (
            <div className="card p-4">
              <div className="flex items-center gap-2 mb-1">
                <span className="w-6 h-6 rounded-full bg-violet-100 flex items-center justify-center text-violet-600">
                  <Target size={13} />
                </span>
                <h3 className="text-sm font-semibold text-[var(--color-text)]">Goals This Session</h3>
              </div>
              <p className="text-[11px] text-[var(--color-text-secondary)] mb-2">
                Check off what you worked on — pick a % and drop skilled-language into Objective.
              </p>
              <div className="space-y-1.5">
                {sessionGoals.map((g) => {
                  const key = `${g.goalType}::${g.text}`;
                  return (
                    <div key={key} className="flex items-center gap-2">
                      <span className={`badge text-[10px] flex-shrink-0 ${g.goalType === 'LTG' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                        {g.goalType}
                      </span>
                      <span className="text-sm text-[var(--color-text)] flex-1 min-w-0 truncate" title={g.text}>{g.text}</span>
                      <select
                        className="select text-xs py-1 w-[5rem] flex-shrink-0"
                        value={sessionGoalPct[key] || ''}
                        disabled={signed}
                        onChange={(e) => setSessionGoalPct(prev => ({ ...prev, [key]: e.target.value }))}
                        title="This session %"
                      >
                        <option value="">—%</option>
                        {PERCENT_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <button
                        type="button"
                        className="btn-secondary btn-sm text-xs flex-shrink-0"
                        disabled={signed}
                        onClick={() => insertGoalToObjective(g.goalType, g.text)}
                        title="Insert skilled-language line into Objective"
                      >
                        <Plus size={12} /> Obj
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          </React.Fragment>
        ))}
      </div>

      {/* Manual save button — flips to a confirmed green "Saved ✓" state for ~2s after success,
          so the user gets feedback right where their eye and cursor already are. */}
      {!signed && (
        <div className="flex justify-end items-center gap-3 mt-4">
          {saved && (
            <span className="text-xs text-emerald-600 font-medium flex items-center gap-1 animate-in fade-in duration-150">
              <CheckCircle size={13} /> Saved
            </span>
          )}
          <button
            className={`btn-sm gap-1.5 transition-colors ${
              saved ? 'bg-emerald-500 text-white hover:bg-emerald-600 border border-emerald-500' : 'btn-secondary'
            }`}
            onClick={() => doSave(note)}
            disabled={saving}
          >
            {saved ? <CheckCircle size={14} /> : <Save size={14} />}
            {saving ? 'Saving…' : saved ? 'Saved' : 'Save'}
          </button>
        </div>
      )}

      {/* Reopen (unsign) confirm modal */}
      {showUnsignConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowUnsignConfirm(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <div className="flex items-center gap-2 mb-1">
              <Unlock size={18} className="text-amber-500" />
              <h3 className="text-lg font-semibold text-[var(--color-text)]">Reopen Note for Editing?</h3>
            </div>
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              This will clear the signature and put the note back in draft state. You can re-sign after edits.
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setShowUnsignConfirm(false)}>Cancel</button>
              <button
                className="btn-primary gap-1.5 bg-amber-500 hover:bg-amber-600 border-amber-500"
                onClick={handleUnsign}
                disabled={saving}
              >
                <Unlock size={14} /> {saving ? 'Reopening…' : 'Reopen Note'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sign modal */}
      {showSignForm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowSignForm(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-6">
            <h3 className="text-lg font-semibold text-[var(--color-text)] mb-1">Sign Note</h3>
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              Type your full name to sign. This cannot be undone.
            </p>
            <input
              type="text"
              className="input mb-4"
              placeholder="Full name"
              value={signatureName}
              onChange={e => setSignatureName(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSign()}
              autoFocus
            />
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setShowSignForm(false)}>Cancel</button>
              <button className="btn-primary gap-1.5" onClick={handleSign} disabled={!signatureName.trim() || saving}>
                <PenLine size={14} /> {saving ? 'Signing…' : 'Sign & Lock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* BAA acknowledgement gate — emailing clinical docs needs a BAA on file */}
      {showBaaPrompt && entity && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setShowBaaPrompt(false)}>
          <div className="card w-full max-w-md p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-lg bg-amber-100 text-amber-600 flex-shrink-0">
                <ShieldAlert size={20} />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-[var(--color-text)] mb-1">No BAA on file for {entity.name}</h3>
                <p className="text-xs text-[var(--color-text-secondary)] leading-relaxed">
                  Emailing clinical documentation to an agency requires a signed Business Associate
                  Agreement. If one is in place, mark it on file to continue.
                </p>
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary btn-sm" onClick={() => setShowBaaPrompt(false)}>Cancel</button>
              <button className="btn-primary btn-sm gap-1.5" onClick={confirmBaaOnFile}>
                <FileCheck size={14} />
                BAA is on file — continue
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Email-to-agency compose */}
      <EmailComposeModal
        isOpen={!!emailModal}
        onClose={() => setEmailModal(null)}
        heading={`Email note to ${entity?.name || 'agency'}`}
        attachmentLabel={emailModal?.label}
        defaultTo={emailModal?.to || ''}
        defaultSubject={emailModal?.subject || ''}
        defaultBody={emailModal?.body || ''}
        onSend={handleSendEmail}
        onConfigureEmail={() => navigate('/settings?section=email')}
      />
    </div>
  );
};

export default ContractorNotePage;
