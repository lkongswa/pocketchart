import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
} from 'lucide-react';
import type { Client, Note, Goal, GoalStatus, Discipline, SOAPSection, CptLine, PlaceOfService, ContractedEntity, EntityFeeSchedule } from '../../shared/types';

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
  { value: 'GN', label: 'GN - Speech-Language Pathology' },
  { value: 'GO', label: 'GO - Occupational Therapy' },
  { value: 'GP', label: 'GP - Physical Therapy' },
  { value: '59', label: '59 - Distinct Procedural Service' },
  { value: 'KX', label: 'KX - Requirements Met' },
  { value: '76', label: '76 - Repeat Procedure Same Physician' },
  { value: '77', label: '77 - Repeat Procedure Different Physician' },
  { value: 'CO', label: 'CO - Concurrent Outpatient Rehab' },
];
import NoteBankPopover from '../components/NoteBankPopover';
import SmartTextarea from '../components/SmartTextarea';
import SignaturePad from '../components/SignaturePad';

// ── Helpers ──

function todayISO(): string {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function nowTime(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
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
  const isEditing = Boolean(noteId);

  // Data
  const [client, setClient] = useState<Client | null>(null);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [recentNotes, setRecentNotes] = useState<Note[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Form state
  const [dateOfService, setDateOfService] = useState(todayISO());
  const [timeIn, setTimeIn] = useState('');
  const [timeOut, setTimeOut] = useState('');
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

  // Contracted entity state
  const [isContractedVisit, setIsContractedVisit] = useState(false);
  const [entityId, setEntityId] = useState<number | null>(null);
  const [entities, setEntities] = useState<ContractedEntity[]>([]);
  const [entityFeeSchedule, setEntityFeeSchedule] = useState<EntityFeeSchedule[]>([]);
  const [rateOverride, setRateOverride] = useState<number | null>(null);
  const [rateOverrideReason, setRateOverrideReason] = useState('');
  const [noteType, setNoteType] = useState('');

  // UI state
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [expandedNoteIds, setExpandedNoteIds] = useState<Set<number>>(new Set());

  // Note bank popover state
  const [noteBankOpen, setNoteBankOpen] = useState<SOAPSection | null>(null);

  // Delete state
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // Post-sign state
  const [justSigned, setJustSigned] = useState(false);
  const [savedNoteId, setSavedNoteId] = useState<number | null>(null);
  const [creatingInvoice, setCreatingInvoice] = useState(false);

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

  // ── Data Loading ──

  const loadData = useCallback(async () => {
    if (!clientId) return;
    try {
      setLoading(true);
      const cid = parseInt(clientId, 10);

      const [clientData, goalsData, notesData, entitiesData] = await Promise.all([
        window.api.clients.get(cid),
        window.api.goals.listByClient(cid),
        window.api.notes.listByClient(cid),
        window.api.contractedEntities.list().catch(() => [] as ContractedEntity[]),
      ]);

      setEntities(entitiesData);

      setClient(clientData);
      setGoals(goalsData);
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
        setSignatureImage(note.signature_image || '');
        setSignatureTyped(note.signature_typed || '');
        setExistingSignedAt(note.signed_at || '');
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
          setRateOverride(note.rate_override ?? null);
          setRateOverrideReason(note.rate_override_reason || '');
          setNoteType(note.note_type || '');
          // Load fee schedule for entity
          try {
            const fees = await window.api.contractedEntities.listFeeSchedule(note.entity_id);
            setEntityFeeSchedule(fees);
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

  const handleSave = async (sign: boolean) => {
    if (!clientId) return;
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
        note_type: isContractedVisit ? noteType as Note['note_type'] : undefined,
      };

      let resultNoteId: number | null = null;
      if (isEditing && noteId) {
        await window.api.notes.update(parseInt(noteId, 10), noteData);
        resultNoteId = parseInt(noteId, 10);
      } else {
        const created = await window.api.notes.create(noteData);
        resultNoteId = created?.id ?? null;
      }

      if (sign && resultNoteId) {
        setToast('Note signed and saved');
        setSavedNoteId(resultNoteId);
        setJustSigned(true);
        setExistingSignedAt(new Date().toISOString());
        // Don't navigate away — show invoice prompt
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
              onClick={() => navigate(`/clients/${clientId}`)}
              title="Back to client"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <p className="text-sm text-[var(--color-text-secondary)]">
                {client.first_name} {client.last_name}
              </p>
              <h1 className="page-title flex items-center gap-2">
                <FileText className="w-6 h-6 text-[var(--color-primary)]" />
                {isEditing ? 'Edit SOAP Note' : 'New SOAP Note'}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
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

        {/* Session Info */}
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
                  <input
                    type="text"
                    className="input flex-1"
                    placeholder="CPT Code (e.g. 92507)"
                    value={line.code}
                    onChange={(e) => setCptLines(prev => prev.map((l, i) => i === idx ? { ...l, code: e.target.value } : l))}
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
                  {cptModifiers.map((mod) => (
                    <span
                      key={mod}
                      className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs"
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
                  ))}
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
              )}
            </div>
          )}
        </div>

        {/* Subjective */}
        <SOAPSectionCard
          title="Subjective"
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
        />

        {/* Objective */}
        <SOAPSectionCard
          title="Objective"
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
        />

        {/* Assessment */}
        <div className="card p-6 mb-6 bg-violet-50/50">
          <div className="flex items-center justify-between mb-4">
            <h2 className="section-title mb-0">Assessment</h2>
            <div className="relative">
              <button
                ref={assessmentBtnRef}
                className="btn-ghost btn-sm flex items-center gap-1.5"
                onClick={() =>
                  setNoteBankOpen(noteBankOpen === 'A' ? null : 'A')
                }
              >
                <BookOpen className="w-3.5 h-3.5" />
                Insert from Note Bank
              </button>
              <NoteBankPopover
                isOpen={noteBankOpen === 'A'}
                onClose={() => setNoteBankOpen(null)}
                onInsert={getNoteBankInsertHandler('A')}
                discipline={discipline}
                section="A"
                anchorRef={assessmentBtnRef}
              />
            </div>
          </div>
          <SmartTextarea
            ref={assessmentRef}
            className="textarea"
            rows={4}
            placeholder="Clinical assessment and progress toward goals..."
            value={assessment}
            onChange={setAssessment}
            discipline={discipline}
            section="A"
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

        {/* Plan */}
        <SOAPSectionCard
          title="Plan"
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
        />

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
            <SignaturePad
              value={signatureImage}
              onChange={setSignatureImage}
              disabled={Boolean(existingSignedAt)}
            />
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
          <div className="card p-5 mb-8 border-l-4 border-l-emerald-400 bg-emerald-50/50">
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
              className="btn-secondary flex items-center gap-2"
              onClick={() => handleSave(false)}
              disabled={saving}
            >
              <Save className="w-4 h-4" />
              {saving ? 'Saving...' : 'Save Draft'}
            </button>
            <button
              className="btn-primary flex items-center gap-2"
              onClick={() => handleSave(true)}
              disabled={saving || Boolean(existingSignedAt)}
            >
              <CheckCircle className="w-4 h-4" />
              {saving ? 'Saving...' : 'Sign & Save'}
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
                  {goals.map((goal) => (
                    <div
                      key={goal.id}
                      className={`card p-2.5 text-xs bg-amber-50/60 border-l-4 border-l-amber-400 ${goal.status !== 'active' ? 'opacity-60' : ''}`}
                    >
                      <p className="text-[var(--color-text)] leading-snug mb-1.5">
                        {goal.goal_text}
                      </p>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={`badge text-[10px] ${goal.goal_type === 'STG' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
                          {goal.goal_type}
                        </span>
                        <select
                          className={`text-[10px] border rounded px-1.5 py-0.5 cursor-pointer ${
                            goal.status === 'met' ? 'bg-green-50 text-green-700 border-green-200' :
                            goal.status === 'discontinued' ? 'bg-gray-50 text-gray-600 border-gray-200' :
                            goal.status === 'modified' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                            'bg-emerald-50 text-emerald-700 border-emerald-200'
                          }`}
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
                </div>
              )}
            </div>

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
                <button
                  className="w-full btn-primary btn-sm flex items-center justify-center gap-1.5"
                  onClick={handleCreateInvoice}
                  disabled={creatingInvoice || !savedNoteId}
                >
                  <Receipt className="w-3.5 h-3.5" />
                  {creatingInvoice ? 'Creating...' : 'Create Invoice'}
                </button>
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
}: SOAPSectionCardProps) {
  return (
    <div className={`card p-6 mb-6 ${soapSectionTint[sectionCode]}`}>
      <div className="flex items-center justify-between mb-4">
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
            Insert from Note Bank
          </button>
          <NoteBankPopover
            isOpen={noteBankOpen === sectionCode}
            onClose={() => setNoteBankOpen(null)}
            onInsert={onInsert}
            discipline={discipline}
            section={sectionCode}
            anchorRef={anchorRef}
          />
        </div>
      </div>
      <SmartTextarea
        ref={textareaRef}
        className="textarea"
        rows={4}
        placeholder={`Enter ${title.toLowerCase()} findings...`}
        value={value}
        onChange={onChange}
        discipline={discipline}
        section={sectionCode}
      />
    </div>
  );
}
