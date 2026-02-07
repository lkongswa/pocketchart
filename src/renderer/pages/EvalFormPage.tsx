import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
} from 'lucide-react';
import type { Client, Evaluation, Discipline, GoalType, EvalGoalEntry } from '../../shared/types';
import SignaturePad from '../components/SignaturePad';

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

type ObjectiveAssessment = PTObjectiveAssessment | OTObjectiveAssessment | STObjectiveAssessment;

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

function emptyObjectiveForDiscipline(discipline: Discipline): ObjectiveAssessment {
  switch (discipline) {
    case 'PT': return emptyPTObjective();
    case 'OT': return emptyOTObjective();
    case 'ST': return emptySTObjective();
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

function getObjectiveFields(discipline: Discipline) {
  switch (discipline) {
    case 'PT': return PT_OBJECTIVE_FIELDS;
    case 'OT': return OT_OBJECTIVE_FIELDS;
    case 'ST': return ST_OBJECTIVE_FIELDS;
  }
}

const DISCIPLINE_LABELS: Record<Discipline, string> = {
  PT: 'Physical Therapy',
  OT: 'Occupational Therapy',
  ST: 'Speech Therapy',
};

// ── Component ──

export default function EvalFormPage() {
  const { id: clientId, evalId } = useParams<{ id: string; evalId?: string }>();
  const navigate = useNavigate();
  const sectionColor = useSectionColor();
  const isEditing = Boolean(evalId);

  const [client, setClient] = useState<Client | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const [evalDate, setEvalDate] = useState(todayISO());
  const [content, setContent] = useState<EvalContent | null>(null);
  const [signatureImage, setSignatureImage] = useState('');
  const [signatureTyped, setSignatureTyped] = useState('');
  const [existingSignedAt, setExistingSignedAt] = useState('');
  const [goalEntries, setGoalEntries] = useState<EvalGoalEntry[]>([]);
  const [goalsAlreadyCreated, setGoalsAlreadyCreated] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  // ── Data Loading ──

  const loadData = useCallback(async () => {
    if (!clientId) return;
    try {
      setLoading(true);
      const cid = parseInt(clientId, 10);
      const clientData = await window.api.clients.get(cid);
      setClient(clientData);

      const discipline = clientData.discipline as Discipline;

      if (evalId) {
        const evaluation = await window.api.evaluations.get(parseInt(evalId, 10));
        setEvalDate(evaluation.eval_date || todayISO());
        setSignatureImage(evaluation.signature_image || '');
        setSignatureTyped(evaluation.signature_typed || '');
        setExistingSignedAt(evaluation.signed_at || '');
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
          if (parsed.goal_entries && Array.isArray(parsed.goal_entries)) {
            setGoalEntries(parsed.goal_entries);
            if (parsed.created_goal_ids && parsed.created_goal_ids.length > 0) {
              setGoalsAlreadyCreated(true);
            }
          }
        } catch {
          setContent(emptyContent(discipline));
        }
      } else {
        setContent(emptyContent(discipline));
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

  // ── Field update helpers ──

  const updateField = (field: keyof Omit<EvalContent, 'objective_assessment'>, value: string) => {
    setContent((prev) => (prev ? { ...prev, [field]: value } : prev));
  };

  const updateObjectiveField = (key: string, value: string) => {
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

  // ── Save ──

  const handleSave = async (sign: boolean) => {
    if (!clientId || !client || !content) return;

    // Soft validation before signing — warn about missing critical fields
    if (sign) {
      const missingFields: string[] = [];
      if (!content.clinical_impression?.trim()) missingFields.push('Clinical Impression');
      if (!content.frequency_duration?.trim()) missingFields.push('Frequency & Duration');
      if (goalEntries.length === 0 && !content.goals?.trim()) missingFields.push('Goals');
      if (missingFields.length > 0) {
        const proceed = window.confirm(
          `The following fields are empty:\n\n• ${missingFields.join('\n• ')}\n\nThese are important for compliance. Sign anyway?`
        );
        if (!proceed) return;
      }
    }

    try {
      setSaving(true);
      const cid = parseInt(clientId, 10);

      // Create Goal records from structured entries (only on new evals, not edits)
      let createdGoalIds: number[] = [];
      if (!isEditing && goalEntries.length > 0) {
        const validEntries = goalEntries.filter(e => e.goal_text.trim());
        for (const entry of validEntries) {
          const goal = await window.api.goals.create({
            client_id: cid,
            goal_text: entry.goal_text,
            goal_type: entry.goal_type,
            category: entry.category,
            target_date: entry.target_date,
            status: 'active',
          });
          createdGoalIds.push(goal.id);
        }
      }

      // Store goal_entries and created_goal_ids in content
      const contentToSave = {
        ...content,
        goal_entries: goalEntries,
        created_goal_ids: isEditing
          ? (content.created_goal_ids || [])
          : createdGoalIds,
      };

      const evalData: Partial<Evaluation> = {
        client_id: cid,
        eval_date: evalDate,
        discipline: client.discipline,
        content: JSON.stringify(contentToSave),
        signature_image: sign ? signatureImage : '',
        signature_typed: sign ? signatureTyped : '',
        signed_at: sign ? new Date().toISOString() : '',
      };

      if (isEditing && evalId) {
        await window.api.evaluations.update(parseInt(evalId, 10), evalData);
      } else {
        await window.api.evaluations.create(evalData);
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
    if (!evalId) return;
    try {
      await window.api.evaluations.delete(parseInt(evalId, 10));
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
                <ClipboardList className="w-6 h-6" style={{ color: sectionColor.color }} />
                {isEditing ? 'Edit Evaluation' : 'New Evaluation'}
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
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
              onChange={(e) => setEvalDate(e.target.value)}
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
          <h2 className="section-title">Medical History</h2>
          <textarea
            className="textarea"
            rows={4}
            placeholder="Pertinent medical history, surgical history, medications..."
            value={content.medical_history}
            onChange={(e) => updateField('medical_history', e.target.value)}
          />
        </div>

        {/* Prior Level of Function */}
        <div className="card p-6 mb-6">
          <h2 className="section-title">Prior Level of Function</h2>
          <textarea
            className="textarea"
            rows={3}
            placeholder="Patient's functional status prior to current condition..."
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
        <div className="card p-6 mb-6">
          <h2 className="section-title">Rehabilitation Potential / Prognosis</h2>
          <textarea
            className="textarea"
            rows={3}
            placeholder="Good/Fair/Poor. Patient demonstrates motivation, family support, and prior functional level consistent with expected recovery..."
            value={content.rehabilitation_potential}
            onChange={(e) => updateField('rehabilitation_potential', e.target.value)}
          />
        </div>

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
            {!goalsAlreadyCreated && (
              <button
                type="button"
                className="btn-ghost btn-sm gap-1 text-xs"
                onClick={() =>
                  setGoalEntries(prev => [
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
              {goalEntries.map((entry, idx) => (
                <div key={idx} className="p-4 bg-gray-50 rounded-lg border border-[var(--color-border)]">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase">
                      Goal {idx + 1}
                    </span>
                    {!goalsAlreadyCreated && (
                      <button
                        type="button"
                        className="p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                        onClick={() => setGoalEntries(prev => prev.filter((_, i) => i !== idx))}
                      >
                        <X size={16} />
                      </button>
                    )}
                  </div>
                  <div className="grid grid-cols-3 gap-3 mb-3">
                    <div>
                      <label className="label text-xs">Type</label>
                      <select
                        className="select text-sm"
                        value={entry.goal_type}
                        disabled={goalsAlreadyCreated}
                        onChange={(e) =>
                          setGoalEntries(prev =>
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
                        disabled={goalsAlreadyCreated}
                        onChange={(e) =>
                          setGoalEntries(prev =>
                            prev.map((g, i) => i === idx ? { ...g, category: e.target.value } : g)
                          )
                        }
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
                        disabled={goalsAlreadyCreated}
                        onChange={(e) =>
                          setGoalEntries(prev =>
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
                      placeholder="Enter goal text..."
                      value={entry.goal_text}
                      disabled={goalsAlreadyCreated}
                      onChange={(e) =>
                        setGoalEntries(prev =>
                          prev.map((g, i) => i === idx ? { ...g, goal_text: e.target.value } : g)
                        )
                      }
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {goalsAlreadyCreated && goalEntries.length > 0 && (
            <div className="mt-3 p-2 bg-blue-50 rounded-lg">
              <p className="text-xs text-blue-700">
                These goals have been created in the client's Goals tab. Edit them from the Goals tab.
              </p>
            </div>
          )}

          {!goalsAlreadyCreated && goalEntries.length > 0 && (
            <div className="mt-3 p-2 bg-amber-50 rounded-lg">
              <p className="text-xs text-amber-700">
                These goals will be added to the client's Goals tab when you save this evaluation.
              </p>
            </div>
          )}
        </div>

        {/* Treatment Plan */}
        <div className="card p-6 mb-6">
          <h2 className="section-title">Treatment Plan</h2>
          <textarea
            className="textarea"
            rows={4}
            placeholder="Planned interventions, modalities, techniques..."
            value={content.treatment_plan}
            onChange={(e) => updateField('treatment_plan', e.target.value)}
          />
        </div>

        {/* Frequency & Duration */}
        <div className="card p-6 mb-6">
          <h2 className="section-title">Frequency & Duration</h2>
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
            disabled={saving}
          >
            <CheckCircle className="w-4 h-4" />
            {saving ? 'Saving...' : 'Sign & Save'}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}
