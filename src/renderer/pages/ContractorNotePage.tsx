import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Save, PenLine, CheckCircle, Clock, User, Building2, ClipboardList, Stethoscope } from 'lucide-react';

interface NoteState {
  subjective: string;
  objective: string;
  assessment: string;
  plan: string;
  time_in: string;
  time_out: string;
  medical_history: string;
  interventions_provided: string;
}

const EMPTY_NOTE: NoteState = { subjective: '', objective: '', assessment: '', plan: '', time_in: '', time_out: '', medical_history: '', interventions_provided: '' };

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
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      if (!isNew && noteId) {
        const n = await window.api.contractorNotes.get(parseInt(noteId));
        if (n) {
          setExistingNote(n);
          setNote({ subjective: n.subjective || '', objective: n.objective || '', assessment: n.assessment || '', plan: n.plan || '', time_in: n.time_in || '', time_out: n.time_out || '', medical_history: n.medical_history || '', interventions_provided: n.interventions_provided || '' });
          setSigned(Boolean(n.signed_at));
          if (n.signed_at) setSignatureName(n.signature_typed || '');
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
          // If a note already exists for this appointment, load it
          if (a.note_id) {
            const n = await window.api.contractorNotes.get(a.note_id).catch(() => null);
            if (n) {
              setExistingNote(n);
              setNote({ subjective: n.subjective || '', objective: n.objective || '', assessment: n.assessment || '', plan: n.plan || '', time_in: n.time_in || '', time_out: n.time_out || '', medical_history: n.medical_history || '', interventions_provided: n.interventions_provided || '' });
              setSigned(Boolean(n.signed_at));
              if (n.signed_at) setSignatureName(n.signature_typed || '');
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
  }, [noteId, appointmentId, isNew]);

  useEffect(() => { load(); }, [load]);

  const doSave = useCallback(async (noteData: NoteState, sig?: { signed_at: string; signature_typed: string }) => {
    if (!appt && !existingNote) return null;
    setSaving(true);
    try {
      if (existingNote) {
        const updated = await window.api.contractorNotes.update(existingNote.id, { ...noteData, ...sig });
        setExistingNote(updated);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
        return updated;
      } else {
        const created = await window.api.contractorNotes.create({
          ...noteData,
          ...sig,
          contractor_patient_id: appt.contractor_patient_id || null,
          entity_id: appt.entity_id || null,
          patient_name: appt.contractor_patient_name || appt.patient_name || '',
          date_of_service: appt.scheduled_date,
          appointment_id: appt.id,
          note_type: appt.session_type === 'eval' ? 'evaluation' : 'soap',
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

  // Debounced auto-save
  const handleChange = (field: keyof NoteState, value: string) => {
    const next = { ...note, [field]: value };
    setNote(next);
    if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
    autoSaveTimer.current = setTimeout(() => doSave(next), 1500);
  };

  const handleSign = async () => {
    if (!signatureName.trim()) return;
    const sig = { signed_at: new Date().toISOString(), signature_typed: signatureName.trim() };
    const result = await doSave(note, sig);
    if (result) { setSigned(true); setShowSignForm(false); }
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

  const patientName = existingNote?.contractor_patient_name || appt?.contractor_patient_name || appt?.patient_name || 'Unknown patient';
  const entityName = existingNote?.entity_name || appt?.entity_name || '';
  const dateOfService = existingNote?.date_of_service || appt?.scheduled_date || '';
  const isEval = existingNote ? existingNote.note_type === 'evaluation' : appt?.session_type === 'eval';

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
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {saved && (
              <span className="text-xs text-emerald-600 font-medium flex items-center gap-1">
                <CheckCircle size={13} /> Saved
              </span>
            )}
            {signed ? (
              <span className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-100 text-emerald-700 text-xs font-medium">
                <CheckCircle size={13} /> Signed
              </span>
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
        </div>
      )}

      {/* SOAP fields */}
      <div className="space-y-4">
        {(['subjective', 'objective', 'assessment', 'plan'] as const).map((field) => (
          <div key={field} className="card p-4">
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
        ))}
      </div>

      {/* Manual save button */}
      {!signed && (
        <div className="flex justify-end mt-4">
          <button className="btn-secondary btn-sm gap-1.5" onClick={() => doSave(note)} disabled={saving}>
            <Save size={14} /> {saving ? 'Saving…' : 'Save'}
          </button>
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
    </div>
  );
};

export default ContractorNotePage;
