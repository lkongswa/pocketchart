import React, { useState, useEffect, useCallback } from 'react';
import { X, Plus, Trash2, ChevronRight, Target, TrendingUp } from 'lucide-react';
import type { Goal, GoalType, Discipline, GoalsBankEntry } from '../../shared/types';
import GoalBuilderChips from './GoalBuilderChips';

interface GoalBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: number;
  discipline: Discipline;
  onGoalsSaved: () => void;
  // Optional: for linking to eval/note
  evalId?: number;
  noteId?: number;
}

interface DraftGoal {
  id: string; // temp ID for UI
  goal_type: GoalType;
  category: string;
  baseTemplate: string;
  baseline: number;
  target: number;
  targetDays: number;
  customText: string;
  useCustomText: boolean;
}

const CATEGORY_OPTIONS: Record<Discipline, string[]> = {
  PT: ['Mobility', 'Strength', 'Balance', 'ROM', 'Pain Management', 'Gait', 'Functional Activity', 'Endurance', 'Transfers', 'Posture'],
  OT: ['ADLs', 'Fine Motor', 'Visual Motor', 'Sensory Processing', 'Handwriting', 'Self-Care', 'Feeding', 'Upper Extremity', 'Cognitive', 'Play Skills'],
  ST: ['Articulation', 'Language Comprehension', 'Language Expression', 'Fluency', 'Voice', 'Pragmatics', 'Phonological Awareness', 'Feeding/Swallowing', 'AAC', 'Cognitive-Communication'],
  MFT: ['Depression', 'Anxiety', 'Trauma', 'Relationship', 'Family Systems', 'Coping Skills', 'Self-Esteem', 'Grief', 'Behavioral'],
};

const GOAL_SUBJECT: Record<Discipline, string> = {
  PT: 'Patient', OT: 'Patient', ST: 'Patient', MFT: 'Client',
};

function generateGoalText(draft: DraftGoal, discipline: Discipline): string {
  if (draft.useCustomText) return draft.customText;

  let baseText = draft.baseTemplate || 'achieve functional goal';

  // Strip any existing subject prefix to avoid "Patient will pt will..."
  baseText = baseText.replace(/^(Pt|Patient|Client(?:\/couple)?|Family(?:\s+members)?|Parent\(s\))\s+will\s+/i, '');

  const timeframe = `${draft.targetDays} days`;
  const subject = GOAL_SUBJECT[discipline] || 'Patient';

  // Substitute inline {target} and {baseline} placeholders if present
  const hasTarget = baseText.includes('{target}');
  const hasBaseline = baseText.includes('{baseline}');

  if (hasTarget) baseText = baseText.replace(/\{target\}/g, `${draft.target}%`);
  if (hasBaseline) baseText = baseText.replace(/\{baseline\}/g, `${draft.baseline}%`);

  let goalText = `${subject} will ${baseText.charAt(0).toLowerCase()}${baseText.slice(1)}`;

  // Only append performance suffix if template didn't have inline placeholders
  if (!hasTarget && !hasBaseline) {
    goalText += `, improving from ${draft.baseline}% to ${draft.target}% accuracy/independence`;
  }

  goalText += ` within ${timeframe}.`;
  return goalText;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
}

/** Render template text with highlighted placeholders (___, {target}, {baseline}) */
function renderTemplateText(text: string): React.ReactNode {
  const parts = text.split(/(___+|\{target\}|\{baseline\})/g);
  return parts.map((part, i) => {
    if (/^___+$/.test(part)) {
      return (
        <span key={i} className="inline-block bg-amber-100 text-amber-700 px-1 py-0.5 rounded text-xs font-mono mx-0.5">
          {part}
        </span>
      );
    }
    if (part === '{target}') {
      return (
        <span key={i} className="inline-block bg-emerald-100 text-emerald-700 px-1 py-0.5 rounded text-xs font-mono mx-0.5">
          target%
        </span>
      );
    }
    if (part === '{baseline}') {
      return (
        <span key={i} className="inline-block bg-amber-100 text-amber-700 px-1 py-0.5 rounded text-xs font-mono mx-0.5">
          baseline%
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

const GoalBuilderModal: React.FC<GoalBuilderModalProps> = ({
  isOpen,
  onClose,
  clientId,
  discipline,
  onGoalsSaved,
}) => {
  const [stgDrafts, setStgDrafts] = useState<DraftGoal[]>([]);
  const [ltgDrafts, setLtgDrafts] = useState<DraftGoal[]>([]);
  const [bankGoals, setBankGoals] = useState<GoalsBankEntry[]>([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankCategory, setBankCategory] = useState<string>('');
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'stg' | 'ltg'>('stg');

  const categories = CATEGORY_OPTIONS[discipline] || [];

  const loadBankGoals = useCallback(async (cat?: string) => {
    setBankLoading(true);
    try {
      const filters: { discipline?: string; category?: string } = { discipline };
      if (cat) filters.category = cat;
      const entries = await window.api.goalsBank.list(filters);
      setBankGoals(entries);
    } catch (err) {
      console.error('Failed to load goals bank:', err);
    } finally {
      setBankLoading(false);
    }
  }, [discipline]);

  useEffect(() => {
    if (isOpen) {
      loadBankGoals();
      setStgDrafts([]);
      setLtgDrafts([]);
      setBankCategory('');
      setActiveTab('stg');
    }
  }, [isOpen, loadBankGoals]);

  const handleBankCategoryChange = (cat: string) => {
    setBankCategory(cat);
    loadBankGoals(cat || undefined);
  };

  const addGoalFromBank = (entry: GoalsBankEntry, goalType: GoalType) => {
    const draft: DraftGoal = {
      id: generateId(),
      goal_type: goalType,
      category: entry.category || '',
      baseTemplate: entry.goal_template,
      baseline: 20,
      target: 80,
      targetDays: goalType === 'STG' ? 30 : 90,
      customText: '',
      useCustomText: false,
    };

    if (goalType === 'STG') {
      setStgDrafts((prev) => [...prev, draft]);
    } else {
      setLtgDrafts((prev) => [...prev, draft]);
    }
  };

  const addEmptyGoal = (goalType: GoalType) => {
    const draft: DraftGoal = {
      id: generateId(),
      goal_type: goalType,
      category: categories[0] || '',
      baseTemplate: '',
      baseline: 20,
      target: 80,
      targetDays: goalType === 'STG' ? 30 : 90,
      customText: '',
      useCustomText: true,
    };

    if (goalType === 'STG') {
      setStgDrafts((prev) => [...prev, draft]);
    } else {
      setLtgDrafts((prev) => [...prev, draft]);
    }
  };

  const updateDraft = (id: string, updates: Partial<DraftGoal>, goalType: GoalType) => {
    const setter = goalType === 'STG' ? setStgDrafts : setLtgDrafts;
    setter((prev) => prev.map((d) => (d.id === id ? { ...d, ...updates } : d)));
  };

  const removeDraft = (id: string, goalType: GoalType) => {
    const setter = goalType === 'STG' ? setStgDrafts : setLtgDrafts;
    setter((prev) => prev.filter((d) => d.id !== id));
  };

  const handleSaveAll = async () => {
    const allDrafts = [...stgDrafts, ...ltgDrafts];
    if (allDrafts.length === 0) {
      onClose();
      return;
    }

    setSaving(true);
    try {
      for (const draft of allDrafts) {
        const targetDate = new Date();
        targetDate.setDate(targetDate.getDate() + draft.targetDays);

        await window.api.goals.create({
          client_id: clientId,
          goal_text: generateGoalText(draft, discipline),
          goal_type: draft.goal_type,
          category: draft.category,
          status: 'active',
          target_date: targetDate.toISOString().slice(0, 10),
        });
      }
      onGoalsSaved();
      onClose();
    } catch (err) {
      console.error('Failed to save goals:', err);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  const renderDraftCard = (draft: DraftGoal) => {
    const goalType = draft.goal_type;
    const borderColor = goalType === 'STG' ? 'border-l-blue-400' : 'border-l-purple-400';
    const bgColor = goalType === 'STG' ? 'bg-blue-50/50' : 'bg-purple-50/50';

    return (
      <div key={draft.id} className={`card p-4 ${bgColor} border-l-4 ${borderColor}`}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            <span className={`badge text-xs font-semibold ${goalType === 'STG' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
              {goalType}
            </span>
            <select
              className="text-xs border border-[var(--color-border)] rounded px-2 py-1 bg-white"
              value={draft.category}
              onChange={(e) => updateDraft(draft.id, { category: e.target.value }, goalType)}
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
          </div>
          <button
            className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
            onClick={() => removeDraft(draft.id, goalType)}
          >
            <Trash2 size={14} />
          </button>
        </div>

        {/* Base template or custom text */}
        {draft.useCustomText ? (
          <textarea
            className="textarea text-sm mb-3"
            rows={2}
            placeholder="Enter custom goal text..."
            value={draft.customText}
            onChange={(e) => updateDraft(draft.id, { customText: e.target.value }, goalType)}
          />
        ) : (
          <>
            <p className="text-sm text-[var(--color-text)] mb-1 italic">
              "{renderTemplateText(draft.baseTemplate)}"
            </p>
            {draft.baseTemplate.includes('___') && (
              <p className="text-[10px] text-amber-600 mb-1">
                {(draft.baseTemplate.match(/___/g) || []).length} placeholder(s) remaining — tap chips to fill
              </p>
            )}
            <GoalBuilderChips
              discipline={discipline}
              category={draft.category}
              onInsert={(value) => {
                const updated = draft.baseTemplate.replace('___', value);
                updateDraft(draft.id, { baseTemplate: updated }, goalType);
              }}
            />
          </>
        )}

        {/* CLOF and Target Row */}
        <div className="grid grid-cols-3 gap-3 mb-3">
          <div>
            <label className="text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)] font-semibold mb-1 block">
              CLOF (Baseline)
            </label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={draft.baseline}
                onChange={(e) => updateDraft(draft.id, { baseline: Number(e.target.value) }, goalType)}
                className="flex-1 h-1.5 accent-amber-500"
              />
              <span className="text-sm font-bold text-amber-600 w-10 text-right">{draft.baseline}%</span>
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)] font-semibold mb-1 block">
              Target
            </label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min="0"
                max="100"
                step="5"
                value={draft.target}
                onChange={(e) => updateDraft(draft.id, { target: Number(e.target.value) }, goalType)}
                className="flex-1 h-1.5 accent-emerald-500"
              />
              <span className="text-sm font-bold text-emerald-600 w-10 text-right">{draft.target}%</span>
            </div>
          </div>
          <div>
            <label className="text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)] font-semibold mb-1 block">
              Timeframe
            </label>
            <select
              className="select text-xs py-1.5 w-full"
              value={draft.targetDays}
              onChange={(e) => updateDraft(draft.id, { targetDays: Number(e.target.value) }, goalType)}
            >
              <option value={30}>30 days</option>
              <option value={60}>60 days</option>
              <option value={90}>90 days</option>
              <option value={120}>120 days</option>
            </select>
          </div>
        </div>

        {/* Preview */}
        <div className="bg-white/60 rounded-lg p-2.5 border border-[var(--color-border)]">
          <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)] font-semibold mb-1">
            Goal Preview
          </p>
          <p className="text-sm text-[var(--color-text)]">
            {generateGoalText(draft, discipline)}
          </p>
        </div>

        {/* Toggle custom text */}
        {!draft.useCustomText && (
          <button
            className="text-xs text-[var(--color-primary)] mt-2 hover:underline"
            onClick={() => updateDraft(draft.id, { useCustomText: true, customText: generateGoalText(draft, discipline) }, goalType)}
          >
            Edit goal text manually
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-5xl max-h-[90vh] overflow-hidden mx-4 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)] shrink-0">
          <div className="flex items-center gap-3">
            <Target className="w-5 h-5 text-[var(--color-primary)]" />
            <h2 className="text-lg font-semibold text-[var(--color-text)]">Goal Builder</h2>
            <span className="text-sm text-[var(--color-text-secondary)]">
              {stgDrafts.length + ltgDrafts.length} goal(s) ready
            </span>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 text-[var(--color-text-secondary)]"
          >
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex flex-1 overflow-hidden">
          {/* Left: Goals Bank */}
          <div className="w-80 border-r border-[var(--color-border)] flex flex-col shrink-0 bg-gray-50/50">
            <div className="p-4 border-b border-[var(--color-border)]">
              <h3 className="text-sm font-semibold text-[var(--color-text)] mb-2">Goals Bank</h3>
              <select
                className="select text-sm w-full"
                value={bankCategory}
                onChange={(e) => handleBankCategoryChange(e.target.value)}
              >
                <option value="">All Categories</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-1">
              {bankLoading ? (
                <div className="text-sm text-[var(--color-text-secondary)] text-center py-8">
                  Loading...
                </div>
              ) : bankGoals.length === 0 ? (
                <div className="text-sm text-[var(--color-text-secondary)] text-center py-8">
                  No goals found
                </div>
              ) : (
                bankGoals.map((entry) => (
                  <div
                    key={entry.id}
                    className="p-2.5 rounded-lg bg-white border border-[var(--color-border)] hover:border-[var(--color-primary)]/50 transition-colors group"
                  >
                    <p className="text-sm text-[var(--color-text)] mb-2 leading-snug">
                      {renderTemplateText(entry.goal_template)}
                    </p>
                    <div className="flex items-center gap-1.5">
                      <button
                        className="flex-1 btn-sm text-xs gap-1 bg-blue-50 text-blue-600 hover:bg-blue-100 border-0"
                        onClick={() => addGoalFromBank(entry, 'STG')}
                      >
                        <Plus size={12} /> STG
                      </button>
                      <button
                        className="flex-1 btn-sm text-xs gap-1 bg-purple-50 text-purple-600 hover:bg-purple-100 border-0"
                        onClick={() => addGoalFromBank(entry, 'LTG')}
                      >
                        <Plus size={12} /> LTG
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Right: Selected Goals */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Tabs */}
            <div className="flex items-center border-b border-[var(--color-border)] px-4 shrink-0">
              <button
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'stg'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
                }`}
                onClick={() => setActiveTab('stg')}
              >
                Short-Term Goals ({stgDrafts.length})
              </button>
              <button
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'ltg'
                    ? 'border-purple-500 text-purple-600'
                    : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
                }`}
                onClick={() => setActiveTab('ltg')}
              >
                Long-Term Goals ({ltgDrafts.length})
              </button>
              <div className="flex-1" />
              <button
                className="btn-ghost btn-sm gap-1 text-xs"
                onClick={() => addEmptyGoal(activeTab === 'stg' ? 'STG' : 'LTG')}
              >
                <Plus size={14} /> Custom Goal
              </button>
            </div>

            {/* Goals List */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {activeTab === 'stg' ? (
                stgDrafts.length === 0 ? (
                  <div className="text-center py-12 text-[var(--color-text-secondary)]">
                    <TrendingUp className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No short-term goals added yet</p>
                    <p className="text-xs mt-1">Click a goal from the bank or add a custom goal</p>
                  </div>
                ) : (
                  stgDrafts.map(renderDraftCard)
                )
              ) : (
                ltgDrafts.length === 0 ? (
                  <div className="text-center py-12 text-[var(--color-text-secondary)]">
                    <Target className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No long-term goals added yet</p>
                    <p className="text-xs mt-1">Click a goal from the bank or add a custom goal</p>
                  </div>
                ) : (
                  ltgDrafts.map(renderDraftCard)
                )
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--color-border)] bg-gray-50 shrink-0">
          <div className="text-sm text-[var(--color-text-secondary)]">
            {stgDrafts.length} STG + {ltgDrafts.length} LTG = {stgDrafts.length + ltgDrafts.length} total goals
          </div>
          <div className="flex items-center gap-3">
            <button className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn-primary gap-1.5"
              onClick={handleSaveAll}
              disabled={saving || (stgDrafts.length === 0 && ltgDrafts.length === 0)}
            >
              {saving ? 'Saving...' : `Save ${stgDrafts.length + ltgDrafts.length} Goal(s)`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default GoalBuilderModal;
