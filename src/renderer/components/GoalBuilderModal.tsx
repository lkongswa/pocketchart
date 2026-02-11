import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Target, TrendingUp } from 'lucide-react';
import type { GoalType, Discipline, MeasurementType, PatternOverride } from '../../shared/types';
import type { GoalPattern } from '../../shared/goal-patterns';
import { CUSTOM_PATTERN, getPatternById, applyOverrides } from '../../shared/goal-patterns';
import { composeGoalText, metricValueToNumeric } from '../../shared/compose-goal-text';
import type { ConsistencyValue } from './ConsistencyCriterion';
import GoalPatternPicker from './GoalPatternPicker';
import GoalComponentFields, { classifyComponents } from './GoalComponentFields';
import MeasurementChips from './MeasurementChips';
import MeasurementTypeSelector from './MeasurementTypeSelector';
import { CATEGORY_DEFAULT_MEASUREMENT, DEFAULT_INSTRUMENTS } from '../../shared/goal-metrics';

interface GoalBuilderModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: number;
  discipline: Discipline;
  onGoalsSaved: () => void;
  evalId?: number;
  noteId?: number;
}

interface DraftGoal {
  id: string;
  goal_type: GoalType;
  pattern_id: string;
  pattern: GoalPattern;
  category: string;
  components: Record<string, any>;
  consistency: ConsistencyValue | null;
  measurement_type: MeasurementType;
  baseline_value: string;
  baseline_numeric: number;
  target_value: string;
  target_numeric: number;
  instrument: string;
  targetDays: number;
  customText: string;
  isCustom: boolean;
}

function generateId(): string {
  return Math.random().toString(36).substring(2, 9);
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
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState<'stg' | 'ltg'>('stg');
  const [patternOverrides, setPatternOverrides] = useState<PatternOverride[]>([]);

  useEffect(() => {
    if (isOpen) {
      setStgDrafts([]);
      setLtgDrafts([]);
      setActiveTab('stg');
      // Load pattern overrides
      window.api.patternOverrides.list().then(setPatternOverrides).catch(() => {});
    }
  }, [isOpen]);

  const addPatternGoal = (pattern: GoalPattern, goalType: GoalType) => {
    // Build default components from pattern definition
    const defaultComponents: Record<string, any> = {};
    for (const comp of pattern.components) {
      if (comp.defaultValue !== undefined) {
        defaultComponents[comp.key] = comp.defaultValue;
      }
    }

    const mt = pattern.measurement_type || 'percentage';
    const inst = pattern.instrument || (mt === 'standardized_score' ? (DEFAULT_INSTRUMENTS[pattern.category] || '') : '');

    const draft: DraftGoal = {
      id: generateId(),
      goal_type: goalType,
      pattern_id: pattern.id,
      pattern,
      category: pattern.category,
      components: defaultComponents,
      consistency: null,
      measurement_type: mt,
      baseline_value: '',
      baseline_numeric: 0,
      target_value: '',
      target_numeric: 0,
      instrument: inst,
      targetDays: goalType === 'STG' ? 30 : 90,
      customText: '',
      isCustom: false,
    };

    const setter = goalType === 'STG' ? setStgDrafts : setLtgDrafts;
    setter((prev) => [...prev, draft]);
  };

  const addCustomGoal = (goalType: GoalType) => {
    const mt = CATEGORY_DEFAULT_MEASUREMENT[''] || 'percentage';
    const draft: DraftGoal = {
      id: generateId(),
      goal_type: goalType,
      pattern_id: 'custom_freeform',
      pattern: { ...CUSTOM_PATTERN, discipline },
      category: '',
      components: {},
      consistency: null,
      measurement_type: mt,
      baseline_value: '',
      baseline_numeric: 0,
      target_value: '',
      target_numeric: 0,
      instrument: '',
      targetDays: goalType === 'STG' ? 30 : 90,
      customText: '',
      isCustom: true,
    };

    const setter = goalType === 'STG' ? setStgDrafts : setLtgDrafts;
    setter((prev) => [...prev, draft]);
  };

  const updateDraft = (id: string, updates: Partial<DraftGoal>, goalType: GoalType) => {
    const setter = goalType === 'STG' ? setStgDrafts : setLtgDrafts;
    setter((prev) => prev.map((d) => d.id === id ? { ...d, ...updates } : d));
  };

  const removeDraft = (id: string, goalType: GoalType) => {
    const setter = goalType === 'STG' ? setStgDrafts : setLtgDrafts;
    setter((prev) => prev.filter((d) => d.id !== id));
  };

  const getGoalText = (draft: DraftGoal): string => {
    if (draft.isCustom) {
      return draft.customText || '';
    }
    return composeGoalText({
      pattern: draft.pattern,
      discipline,
      components: draft.components,
      measurement_type: draft.measurement_type,
      baseline_value: draft.baseline_value,
      target_value: draft.target_value,
      instrument: draft.instrument,
      consistency_type: draft.consistency?.type || null,
      consistency_count: draft.consistency?.type === 'consecutive_sessions' ? draft.consistency.count : undefined,
      trials_num: draft.consistency?.type === 'trials' ? draft.consistency.count : undefined,
      trials_denom: draft.consistency?.type === 'trials' ? draft.consistency.trials_denom : undefined,
      // target_days intentionally omitted — timeframe chip is sufficient, no need in goal narrative
    });
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
          goal_text: getGoalText(draft),
          goal_type: draft.goal_type,
          category: draft.category,
          status: 'active',
          target_date: targetDate.toISOString().slice(0, 10),
          measurement_type: draft.measurement_type,
          baseline: draft.baseline_numeric,
          target: draft.target_numeric,
          baseline_value: draft.baseline_value,
          target_value: draft.target_value,
          instrument: draft.instrument,
          pattern_id: draft.pattern_id,
          components_json: draft.isCustom ? '' : JSON.stringify(draft.components),
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

    // Classify components for 2-column layout and cueing-CLOF pairing
    const classified = classifyComponents(draft.pattern);
    const excludeKeys = [
      ...(classified.cueBaselineKey ? [classified.cueBaselineKey] : []),
      ...(classified.cueTargetKey ? [classified.cueTargetKey] : []),
    ];

    // Find the actual component definitions for cueing fields (for inline rendering in CLOF box)
    const cueBaselineComp = classified.cueBaselineKey
      ? draft.pattern.components.find(c => c.key === classified.cueBaselineKey)
      : null;
    const cueTargetComp = classified.cueTargetKey
      ? draft.pattern.components.find(c => c.key === classified.cueTargetKey)
      : null;

    const renderCueingChips = (comp: typeof cueBaselineComp, colorClass: string) => {
      if (!comp || comp.type !== 'chip_single') return null;
      const selected = draft.components[comp.key] || '';
      return (
        <div className="mb-2">
          <label className="label text-[10px]">{comp.label}</label>
          <div className="flex items-center gap-1 flex-wrap">
            {comp.options?.map(opt => (
              <button
                key={opt}
                type="button"
                className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors cursor-pointer ${
                  selected === opt
                    ? colorClass
                    : 'border-amber-200 text-amber-600 hover:border-amber-400 hover:text-amber-700'
                }`}
                onClick={() => {
                  updateDraft(draft.id, {
                    components: { ...draft.components, [comp.key]: selected === opt ? '' : opt },
                  }, goalType);
                }}
              >
                {opt}
              </button>
            ))}
          </div>
        </div>
      );
    };

    return (
      <div key={draft.id} className={`card p-4 ${bgColor} border-l-4 ${borderColor}`}>
        {/* Header: badge, category, pattern label, remove */}
        <div className="flex items-start justify-between gap-3 mb-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`badge text-xs font-semibold ${goalType === 'STG' ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'}`}>
              {goalType}
            </span>
            {!draft.isCustom && (
              <span className="text-xs text-violet-600 font-medium">
                {draft.pattern.icon} {draft.pattern.label}
              </span>
            )}
            {draft.isCustom && (
              <span className="text-xs text-[var(--color-text-secondary)] italic">Custom Goal</span>
            )}
            {draft.category && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-[var(--color-text-secondary)]">
                {draft.category}
              </span>
            )}
          </div>
          <button
            className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
            onClick={() => removeDraft(draft.id, goalType)}
          >
            <Trash2 size={14} />
          </button>
        </div>

        {/* Pattern component fields OR custom textarea */}
        {draft.isCustom ? (
          <textarea
            className="textarea text-sm mb-3"
            rows={3}
            placeholder="Enter custom goal text..."
            value={draft.customText}
            onChange={(e) => updateDraft(draft.id, { customText: e.target.value }, goalType)}
          />
        ) : draft.pattern.components.length > 0 ? (
          <div className="mb-3">
            <GoalComponentFields
              pattern={draft.pattern}
              components={draft.components}
              onChange={(key, value) => {
                updateDraft(draft.id, {
                  components: { ...draft.components, [key]: value },
                }, goalType);
              }}
              consistency={draft.consistency}
              onConsistencyChange={(val) => updateDraft(draft.id, { consistency: val }, goalType)}
              excludeKeys={excludeKeys}
            />
          </div>
        ) : null}

        {/* Timeframe */}
        <div className="mb-3">
          <label className="text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)] font-semibold mb-1 block">
            Timeframe
          </label>
          <div className="flex items-center gap-1.5">
            {[
              { label: '30 days', value: 30 },
              { label: '60 days', value: 60 },
              { label: '90 days', value: 90 },
              { label: '120 days', value: 120 },
            ].map(({ label, value }) => (
              <button
                key={value}
                type="button"
                className={`px-2.5 py-0.5 text-[10px] rounded-full border transition-colors cursor-pointer ${
                  draft.targetDays === value
                    ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                    : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]'
                }`}
                onClick={() => updateDraft(draft.id, { targetDays: draft.targetDays === value ? 0 : value }, goalType)}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Live Preview */}
        <div className="bg-white/60 rounded-lg p-2.5 border border-[var(--color-border)] mb-3">
          <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)] font-semibold mb-1">
            Goal Preview
          </p>
          <p className="text-sm text-[var(--color-text)]">
            {getGoalText(draft) || <span className="italic text-[var(--color-text-secondary)]">Fill in fields above to preview goal text</span>}
          </p>
        </div>

        {/* Switch to custom text editing */}
        {!draft.isCustom && (
          <button
            className="text-xs text-[var(--color-primary)] mb-3 hover:underline cursor-pointer"
            onClick={() => updateDraft(draft.id, {
              isCustom: true,
              customText: getGoalText(draft),
              pattern_id: 'custom_freeform',
            }, goalType)}
          >
            Edit goal text manually
          </button>
        )}

        {/* CLOF / Measurement Tracking — visually separate from goal text */}
        <div className="p-3 rounded-lg bg-amber-50/40 border border-amber-200/60">
          <p className="text-[10px] uppercase tracking-wide text-amber-700 font-semibold mb-2">
            Current Level of Function (CLOF)
          </p>
          <div className="mb-2">
            <MeasurementTypeSelector
              currentType={draft.measurement_type}
              discipline={discipline}
              onChange={(type) => {
                const inst = type === 'standardized_score'
                  ? (DEFAULT_INSTRUMENTS[draft.category] || '') : '';
                updateDraft(draft.id, {
                  measurement_type: type,
                  baseline_value: '',
                  target_value: '',
                  baseline_numeric: 0,
                  target_numeric: 0,
                  instrument: inst,
                }, goalType);
              }}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              {renderCueingChips(cueBaselineComp, 'bg-amber-500 text-white border-amber-500')}
              <MeasurementChips
                measurement_type={draft.measurement_type}
                label="Baseline (CLOF)"
                value={draft.baseline_value}
                numericValue={draft.baseline_numeric}
                instrument={draft.instrument}
                category={draft.category}
                colorScheme="baseline"
                onSelect={(val, num) => updateDraft(draft.id, { baseline_value: val, baseline_numeric: num }, goalType)}
                onInstrumentChange={(inst) => updateDraft(draft.id, { instrument: inst }, goalType)}
              />
            </div>
            <div>
              {renderCueingChips(cueTargetComp, 'bg-emerald-500 text-white border-emerald-500')}
              <MeasurementChips
                measurement_type={draft.measurement_type}
                label="Goal Level (Target)"
                value={draft.target_value}
                numericValue={draft.target_numeric}
                instrument={draft.instrument}
                category={draft.category}
                colorScheme="target"
                onSelect={(val, num) => updateDraft(draft.id, { target_value: val, target_numeric: num }, goalType)}
              />
            </div>
          </div>
        </div>
      </div>
    );
  };

  const currentGoalType: GoalType = activeTab === 'stg' ? 'STG' : 'LTG';

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
          {/* Left: Pattern Picker */}
          <div className="w-80 border-r border-[var(--color-border)] flex flex-col shrink-0 bg-gray-50/50">
            <div className="p-4 border-b border-[var(--color-border)]">
              <h3 className="text-sm font-semibold text-[var(--color-text)] mb-1">Goal Patterns</h3>
              <p className="text-[10px] text-[var(--color-text-secondary)]">
                Select a pattern to add as {currentGoalType}
              </p>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              <GoalPatternPicker
                discipline={discipline}
                onSelect={(pattern) => addPatternGoal(pattern, currentGoalType)}
                onCustom={() => addCustomGoal(currentGoalType)}
                overrides={patternOverrides}
              />
            </div>
          </div>

          {/* Right: Selected Goals */}
          <div className="flex-1 flex flex-col overflow-hidden">
            {/* Tabs */}
            <div className="flex items-center border-b border-[var(--color-border)] px-4 shrink-0">
              <button
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
                  activeTab === 'stg'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
                }`}
                onClick={() => setActiveTab('stg')}
              >
                Short-Term Goals ({stgDrafts.length})
              </button>
              <button
                className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors cursor-pointer ${
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
                className="btn-ghost btn-sm gap-1 text-xs cursor-pointer"
                onClick={() => addCustomGoal(currentGoalType)}
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
                    <p className="text-xs mt-1">Select a pattern from the left or add a custom goal</p>
                  </div>
                ) : (
                  stgDrafts.map(renderDraftCard)
                )
              ) : (
                ltgDrafts.length === 0 ? (
                  <div className="text-center py-12 text-[var(--color-text-secondary)]">
                    <Target className="w-10 h-10 mx-auto mb-3 opacity-30" />
                    <p className="text-sm">No long-term goals added yet</p>
                    <p className="text-xs mt-1">Select a pattern from the left or add a custom goal</p>
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
