import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Plus,
  X,
  RotateCcw,
  Target,
  Check,
} from 'lucide-react';
import type { Discipline, PatternOverride } from '../../shared/types';
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

  // Load overrides on mount
  useEffect(() => {
    loadOverrides();
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

      {/* Patterns by category */}
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
