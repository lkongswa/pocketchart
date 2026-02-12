import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  X,
  RotateCcw,
  Target,
  Check,
  Pencil,
  Trash2,
} from 'lucide-react';
import type { Discipline, PatternOverride, CustomPattern, MeasurementType } from '../../shared/types';
import { MEASUREMENT_TYPE_LABELS } from '../../shared/types';
import {
  ALL_PATTERNS,
  getPatternsForDiscipline,
  getPatternCategories,
  applyOverrides,
  type GoalPattern,
  type PatternComponent,
} from '../../shared/goal-patterns';

interface Props {
  embedded?: boolean;
}

const DISCIPLINE_TABS: Array<{ value: Discipline; label: string }> = [
  { value: 'ST', label: 'ST' },
  { value: 'PT', label: 'PT' },
  { value: 'OT', label: 'OT' },
  { value: 'MFT', label: 'MFT' },
];

export default function GoalPatternSettingsPage({ embedded }: Props) {
  const [discipline, setDiscipline] = useState<Discipline>('ST');
  const [overrides, setOverrides] = useState<PatternOverride[]>([]);
  const [expandedPatterns, setExpandedPatterns] = useState<Set<string>>(new Set());
  const [addingOption, setAddingOption] = useState<{ patternId: string; componentKey: string } | null>(null);
  const [newOptionText, setNewOptionText] = useState('');
  const addInputRef = useRef<HTMLInputElement>(null);

  // Custom patterns state
  const [customPatterns, setCustomPatterns] = useState<CustomPattern[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingCustomId, setEditingCustomId] = useState<number | null>(null);
  const [customForm, setCustomForm] = useState({
    label: '',
    icon: '',
    category: '',
    measurement_type: 'percentage' as MeasurementType,
    chips: [] as string[],
    newChip: '',
  });

  // Load overrides and custom patterns on mount
  useEffect(() => {
    loadOverrides();
    loadCustomPatterns();
  }, []);

  // Focus the add-option input when it appears
  useEffect(() => {
    if (addingOption && addInputRef.current) {
      addInputRef.current.focus();
    }
  }, [addingOption]);

  const loadOverrides = useCallback(async () => {
    try {
      const data = await window.api.patternOverrides.list();
      setOverrides(data);
    } catch (e) {
      console.error('Failed to load pattern overrides:', e);
    }
  }, []);

  const loadCustomPatterns = useCallback(async () => {
    try {
      const data = await window.api.customPatterns.list();
      setCustomPatterns(data);
    } catch (e) {
      console.error('Failed to load custom patterns:', e);
    }
  }, []);

  const resetCustomForm = () => {
    setCustomForm({ label: '', icon: '', category: '', measurement_type: 'percentage', chips: [], newChip: '' });
    setShowCreateForm(false);
    setEditingCustomId(null);
  };

  const handleSaveCustomPattern = async () => {
    if (!customForm.label.trim()) return;
    const payload = {
      discipline,
      category: customForm.category.trim() || 'Custom',
      label: customForm.label.trim(),
      icon: customForm.icon.trim(),
      measurement_type: customForm.measurement_type,
      chips_json: JSON.stringify(customForm.chips),
    };
    if (editingCustomId) {
      await window.api.customPatterns.update(editingCustomId, payload);
    } else {
      await window.api.customPatterns.create(payload);
    }
    await loadCustomPatterns();
    resetCustomForm();
  };

  const handleEditCustomPattern = (cp: CustomPattern) => {
    const chips = (() => {
      try { return typeof cp.chips_json === 'string' ? JSON.parse(cp.chips_json) : []; } catch { return []; }
    })();
    setCustomForm({
      label: cp.label,
      icon: cp.icon,
      category: cp.category,
      measurement_type: cp.measurement_type,
      chips,
      newChip: '',
    });
    setEditingCustomId(cp.id);
    setShowCreateForm(true);
  };

  const handleDeleteCustomPattern = async (id: number) => {
    if (!confirm('Delete this custom pattern? Goals using it will still work but new goals won\'t find it.')) return;
    await window.api.customPatterns.delete(id);
    await loadCustomPatterns();
  };

  const addChipToForm = () => {
    const val = customForm.newChip.trim();
    if (!val || customForm.chips.includes(val)) return;
    setCustomForm(prev => ({ ...prev, chips: [...prev.chips, val], newChip: '' }));
  };

  const removeChipFromForm = (chip: string) => {
    setCustomForm(prev => ({ ...prev, chips: prev.chips.filter(c => c !== chip) }));
  };

  const toggleExpanded = (patternId: string) => {
    setExpandedPatterns(prev => {
      const next = new Set(prev);
      if (next.has(patternId)) next.delete(patternId);
      else next.add(patternId);
      return next;
    });
  };

  // Get the current override for a specific pattern + component
  const getOverride = (patternId: string, componentKey: string): PatternOverride | undefined => {
    return overrides.find(o => o.pattern_id === patternId && o.component_key === componentKey);
  };

  // Add a custom option to a component
  const handleAddOption = async (patternId: string, componentKey: string, value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return;

    const existing = getOverride(patternId, componentKey);
    const customOptions = [...(existing?.custom_options || [])];
    if (customOptions.includes(trimmed)) return; // Already exists
    customOptions.push(trimmed);

    await window.api.patternOverrides.upsert(
      patternId,
      componentKey,
      customOptions,
      existing?.removed_options || []
    );
    await loadOverrides();
    setAddingOption(null);
    setNewOptionText('');
  };

  // Remove an option (add to removed_options if it's a default, or remove from custom_options if custom)
  const handleRemoveOption = async (patternId: string, componentKey: string, option: string, isCustom: boolean) => {
    const existing = getOverride(patternId, componentKey);

    if (isCustom) {
      // Remove from custom_options
      const customOptions = (existing?.custom_options || []).filter(o => o !== option);
      if (customOptions.length === 0 && (existing?.removed_options || []).length === 0) {
        // No overrides left — delete the row
        await window.api.patternOverrides.delete(patternId, componentKey);
      } else {
        await window.api.patternOverrides.upsert(patternId, componentKey, customOptions, existing?.removed_options || []);
      }
    } else {
      // Add to removed_options
      const removedOptions = [...(existing?.removed_options || [])];
      if (!removedOptions.includes(option)) removedOptions.push(option);
      await window.api.patternOverrides.upsert(
        patternId,
        componentKey,
        existing?.custom_options || [],
        removedOptions
      );
    }
    await loadOverrides();
  };

  // Restore a removed default option
  const handleRestoreOption = async (patternId: string, componentKey: string, option: string) => {
    const existing = getOverride(patternId, componentKey);
    if (!existing) return;

    const removedOptions = existing.removed_options.filter(o => o !== option);
    if (removedOptions.length === 0 && existing.custom_options.length === 0) {
      await window.api.patternOverrides.delete(patternId, componentKey);
    } else {
      await window.api.patternOverrides.upsert(patternId, componentKey, existing.custom_options, removedOptions);
    }
    await loadOverrides();
  };

  // Reset all overrides for a pattern
  const handleResetPattern = async (patternId: string) => {
    await window.api.patternOverrides.deleteAll(patternId);
    await loadOverrides();
  };

  const patterns = getPatternsForDiscipline(discipline);
  const categories = getPatternCategories(discipline);
  const customPatternsForDiscipline = customPatterns.filter(cp => cp.discipline === discipline);

  // Check if a pattern has any overrides
  const patternHasOverrides = (patternId: string) => {
    return overrides.some(o => o.pattern_id === patternId);
  };

  // Get editable components (chip_single, chip_multi, select — NOT text, number, consistency)
  const getEditableComponents = (pattern: GoalPattern): PatternComponent[] => {
    return pattern.components.filter(c =>
      c.type === 'chip_single' || c.type === 'chip_multi' || c.type === 'select'
    );
  };

  return (
    <div className={embedded ? 'p-4' : 'p-6 max-w-4xl mx-auto'}>
      {!embedded && (
        <div className="mb-6">
          <h1 className="text-xl font-bold text-[var(--color-text)] flex items-center gap-2">
            <Target size={20} className="text-[var(--color-primary)]" />
            Goal Pattern Settings
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">
            Customize the options available when creating goals. Add or hide options for each pattern.
          </p>
        </div>
      )}

      {/* Discipline tabs */}
      <div className="flex items-center gap-1 mb-4">
        {DISCIPLINE_TABS.map(tab => (
          <button
            key={tab.value}
            onClick={() => setDiscipline(tab.value)}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              discipline === tab.value
                ? 'bg-[var(--color-primary)] text-white shadow-sm'
                : 'bg-gray-100 text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:bg-gray-200'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Custom Patterns Section */}
      <div className="mb-6 border border-emerald-200 rounded-lg overflow-hidden">
        <div className="bg-emerald-50 px-4 py-2 border-b border-emerald-200 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-emerald-800 flex items-center gap-1.5">
            <span>🔧</span> Custom Patterns ({customPatternsForDiscipline.length})
          </h3>
          {!showCreateForm && (
            <button
              onClick={() => { resetCustomForm(); setShowCreateForm(true); }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs font-medium bg-emerald-600 text-white hover:bg-emerald-700 transition-colors"
            >
              <Plus size={12} /> Create Custom Pattern
            </button>
          )}
        </div>

        {/* Create/Edit form */}
        {showCreateForm && (
          <div className="p-4 bg-emerald-50/30 border-b border-emerald-200 space-y-3">
            <div className="grid grid-cols-[1fr_auto_1fr] gap-2">
              <div>
                <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Label *</label>
                <input
                  type="text"
                  className="input text-sm"
                  placeholder="e.g. Oral Motor Exercises"
                  value={customForm.label}
                  onChange={e => setCustomForm(prev => ({ ...prev, label: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Icon</label>
                <input
                  type="text"
                  className="input text-sm w-16 text-center"
                  placeholder="🔧"
                  value={customForm.icon}
                  onChange={e => setCustomForm(prev => ({ ...prev, icon: e.target.value }))}
                />
              </div>
              <div>
                <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Category</label>
                <input
                  type="text"
                  className="input text-sm"
                  list="custom-categories"
                  placeholder="e.g. Articulation"
                  value={customForm.category}
                  onChange={e => setCustomForm(prev => ({ ...prev, category: e.target.value }))}
                />
                <datalist id="custom-categories">
                  {categories.map(c => <option key={c} value={c} />)}
                </datalist>
              </div>
            </div>
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Measurement Type</label>
              <select
                className="select text-sm"
                value={customForm.measurement_type}
                onChange={e => setCustomForm(prev => ({ ...prev, measurement_type: e.target.value as MeasurementType }))}
              >
                {Object.entries(MEASUREMENT_TYPE_LABELS).map(([k, v]) => (
                  <option key={k} value={k}>{v}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-medium text-gray-500 uppercase tracking-wide">Chip Items (sub-items for quick selection)</label>
              <div className="flex flex-wrap gap-1.5 mb-2">
                {customForm.chips.map(chip => (
                  <span key={chip} className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-emerald-50 border border-emerald-300 text-emerald-800">
                    {chip}
                    <button onClick={() => removeChipFromForm(chip)} className="text-emerald-400 hover:text-red-500">
                      <X size={12} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-1.5">
                <input
                  type="text"
                  className="input text-sm flex-1"
                  placeholder="Type a chip item and press Enter..."
                  value={customForm.newChip}
                  onChange={e => setCustomForm(prev => ({ ...prev, newChip: e.target.value }))}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addChipToForm(); } }}
                />
                <button
                  type="button"
                  onClick={addChipToForm}
                  className="px-3 py-1 rounded-md text-xs font-medium bg-emerald-100 text-emerald-700 hover:bg-emerald-200 transition-colors"
                >
                  Add
                </button>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button onClick={resetCustomForm} className="btn-secondary text-xs">Cancel</button>
              <button
                onClick={handleSaveCustomPattern}
                disabled={!customForm.label.trim()}
                className="btn-primary text-xs"
              >
                {editingCustomId ? 'Update Pattern' : 'Create Pattern'}
              </button>
            </div>
          </div>
        )}

        {/* List of existing custom patterns for this discipline */}
        {customPatternsForDiscipline.length > 0 ? (
          <div className="divide-y divide-emerald-100">
            {customPatternsForDiscipline.map(cp => {
              const chips = (() => {
                try { return typeof cp.chips_json === 'string' ? JSON.parse(cp.chips_json) : []; } catch { return []; }
              })();
              return (
                <div key={cp.id} className="px-4 py-3 flex items-center gap-3 hover:bg-emerald-50/30">
                  <span className="text-base">{cp.icon || '🔧'}</span>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-[var(--color-text)]">{cp.label}</div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-[10px] text-[var(--color-text-secondary)]">{cp.category || 'Custom'}</span>
                      <span className="text-[10px] px-1.5 py-0 rounded-full bg-blue-50 text-blue-700 font-medium">
                        {MEASUREMENT_TYPE_LABELS[cp.measurement_type]?.split('(')[0]?.trim() || cp.measurement_type}
                      </span>
                      {chips.length > 0 && (
                        <span className="text-[10px] text-[var(--color-text-secondary)]">{chips.length} chips</span>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={() => handleEditCustomPattern(cp)}
                    className="p-1.5 rounded hover:bg-emerald-100 text-gray-400 hover:text-emerald-700 transition-colors"
                    title="Edit"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    onClick={() => handleDeleteCustomPattern(cp.id)}
                    className="p-1.5 rounded hover:bg-red-100 text-gray-400 hover:text-red-600 transition-colors"
                    title="Delete"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="px-4 py-4 text-sm text-[var(--color-text-secondary)] italic text-center">
            No custom patterns for {discipline} yet. Create one above!
          </div>
        )}
      </div>

      {/* Built-in Patterns by category */}
      <div className="space-y-4">
        {categories.map(category => {
          const categoryPatterns = patterns.filter(p => p.category === category);
          if (categoryPatterns.length === 0) return null;

          return (
            <div key={category} className="border border-[var(--color-border)] rounded-lg overflow-hidden">
              {/* Category header */}
              <div className="bg-gray-50 px-4 py-2 border-b border-[var(--color-border)]">
                <h3 className="text-sm font-semibold text-[var(--color-text)]">{category}</h3>
              </div>

              {/* Patterns within category */}
              <div className="divide-y divide-[var(--color-border)]">
                {categoryPatterns.map(pattern => {
                  const isExpanded = expandedPatterns.has(pattern.id);
                  const editableComponents = getEditableComponents(pattern);
                  const hasOverrides = patternHasOverrides(pattern.id);

                  return (
                    <div key={pattern.id}>
                      {/* Pattern header row */}
                      <button
                        onClick={() => toggleExpanded(pattern.id)}
                        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-gray-50 transition-colors text-left"
                      >
                        <span className="text-gray-400">
                          {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                        </span>
                        <span className="text-base">{pattern.icon}</span>
                        <span className="text-sm font-medium text-[var(--color-text)] flex-1">
                          {pattern.label}
                        </span>
                        {/* Measurement type badge */}
                        <span className="text-[10px] px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 font-medium">
                          {MEASUREMENT_TYPE_LABELS[pattern.measurement_type]?.split('(')[0]?.trim() || pattern.measurement_type}
                        </span>
                        {hasOverrides && (
                          <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 font-medium">
                            Customized
                          </span>
                        )}
                      </button>

                      {/* Expanded component editors */}
                      {isExpanded && (
                        <div className="px-4 pb-4 space-y-3 bg-gray-50/50">
                          {editableComponents.length === 0 ? (
                            <p className="text-xs text-[var(--color-text-secondary)] italic py-2">
                              This pattern has no editable chip/select options.
                            </p>
                          ) : (
                            editableComponents.map(comp => {
                              const override = getOverride(pattern.id, comp.key);
                              const defaultOptions = comp.options || [];
                              const customOptions = override?.custom_options || [];
                              const removedOptions = new Set(override?.removed_options || []);

                              return (
                                <div key={comp.key} className="space-y-1.5">
                                  <div className="text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">
                                    {comp.label}
                                  </div>
                                  <div className="flex flex-wrap items-center gap-1.5">
                                    {/* Default options (active) */}
                                    {defaultOptions.filter(o => !removedOptions.has(o)).map(option => (
                                      <span
                                        key={option}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-white border border-gray-200 text-[var(--color-text)] group"
                                      >
                                        {option}
                                        <button
                                          onClick={() => handleRemoveOption(pattern.id, comp.key, option, false)}
                                          className="text-gray-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                          title="Hide this option"
                                        >
                                          <X size={12} />
                                        </button>
                                      </span>
                                    ))}

                                    {/* Custom options (green border) */}
                                    {customOptions.map(option => (
                                      <span
                                        key={`custom-${option}`}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-emerald-50 border border-emerald-300 text-emerald-800 group"
                                      >
                                        {option}
                                        <button
                                          onClick={() => handleRemoveOption(pattern.id, comp.key, option, true)}
                                          className="text-emerald-300 hover:text-red-500 transition-colors opacity-0 group-hover:opacity-100"
                                          title="Remove this custom option"
                                        >
                                          <X size={12} />
                                        </button>
                                      </span>
                                    ))}

                                    {/* Removed default options (gray, strikethrough) */}
                                    {defaultOptions.filter(o => removedOptions.has(o)).map(option => (
                                      <button
                                        key={`removed-${option}`}
                                        onClick={() => handleRestoreOption(pattern.id, comp.key, option)}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs bg-gray-50 border border-dashed border-gray-300 text-gray-400 line-through hover:border-gray-400 hover:text-gray-500 transition-colors"
                                        title="Click to restore"
                                      >
                                        {option}
                                        <RotateCcw size={10} />
                                      </button>
                                    ))}

                                    {/* Add button */}
                                    {addingOption?.patternId === pattern.id && addingOption?.componentKey === comp.key ? (
                                      <span className="inline-flex items-center gap-1">
                                        <input
                                          ref={addInputRef}
                                          type="text"
                                          value={newOptionText}
                                          onChange={e => setNewOptionText(e.target.value)}
                                          onKeyDown={e => {
                                            if (e.key === 'Enter') {
                                              handleAddOption(pattern.id, comp.key, newOptionText);
                                            } else if (e.key === 'Escape') {
                                              setAddingOption(null);
                                              setNewOptionText('');
                                            }
                                          }}
                                          placeholder="Type option..."
                                          className="w-32 px-2 py-1 text-xs border border-[var(--color-primary)] rounded-full focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)]"
                                        />
                                        <button
                                          onClick={() => handleAddOption(pattern.id, comp.key, newOptionText)}
                                          className="text-[var(--color-primary)] hover:text-[var(--color-primary-hover)]"
                                        >
                                          <Check size={14} />
                                        </button>
                                        <button
                                          onClick={() => { setAddingOption(null); setNewOptionText(''); }}
                                          className="text-gray-400 hover:text-gray-600"
                                        >
                                          <X size={14} />
                                        </button>
                                      </span>
                                    ) : (
                                      <button
                                        onClick={() => { setAddingOption({ patternId: pattern.id, componentKey: comp.key }); setNewOptionText(''); }}
                                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs border border-dashed border-[var(--color-primary)]/40 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/5 transition-colors"
                                      >
                                        <Plus size={12} />
                                        Add
                                      </button>
                                    )}
                                  </div>
                                </div>
                              );
                            })
                          )}

                          {/* Reset button */}
                          {hasOverrides && (
                            <div className="pt-2 border-t border-gray-200">
                              <button
                                onClick={() => handleResetPattern(pattern.id)}
                                className="text-xs text-gray-500 hover:text-[var(--color-primary)] flex items-center gap-1 transition-colors"
                              >
                                <RotateCcw size={12} />
                                Reset to Defaults
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
