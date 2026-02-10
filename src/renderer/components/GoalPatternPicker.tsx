import React, { useState } from 'react';
import type { Discipline, PatternOverride } from '../../shared/types';
import type { GoalPattern } from '../../shared/goal-patterns';
import { getPatternsForDiscipline, getPatternsForCategory, getPatternCategories, applyOverrides, CUSTOM_PATTERN } from '../../shared/goal-patterns';

interface GoalPatternPickerProps {
  discipline: Discipline;
  category?: string;           // Pre-filter to a category
  onSelect: (pattern: GoalPattern) => void;
  onCustom: () => void;        // "Write Custom Goal" selected
  overrides?: PatternOverride[];  // Pattern overrides from settings
}

const GoalPatternPicker: React.FC<GoalPatternPickerProps> = ({
  discipline,
  category: initialCategory,
  onSelect,
  onCustom,
  overrides,
}) => {
  const [selectedCategory, setSelectedCategory] = useState(initialCategory || '');
  const categories = getPatternCategories(discipline);
  const rawPatterns = selectedCategory
    ? getPatternsForCategory(discipline, selectedCategory)
    : getPatternsForDiscipline(discipline);
  // Apply user overrides to patterns (adds/removes chip options)
  const patterns = overrides
    ? rawPatterns.map(p => applyOverrides(p, overrides))
    : rawPatterns;

  return (
    <div className="space-y-3">
      {/* Category filter chips */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          className={`px-2.5 py-1 text-xs rounded-full border transition-colors cursor-pointer ${
            !selectedCategory
              ? 'bg-violet-500 text-white border-violet-500'
              : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-violet-400'
          }`}
          onClick={() => setSelectedCategory('')}
        >
          All
        </button>
        {categories.map(cat => (
          <button
            key={cat}
            type="button"
            className={`px-2.5 py-1 text-xs rounded-full border transition-colors cursor-pointer ${
              selectedCategory === cat
                ? 'bg-violet-500 text-white border-violet-500'
                : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-violet-400'
            }`}
            onClick={() => setSelectedCategory(cat)}
          >
            {cat}
          </button>
        ))}
      </div>

      {/* Pattern cards grid */}
      <div className="grid grid-cols-2 gap-2">
        {patterns.map(pattern => (
          <button
            key={pattern.id}
            type="button"
            className="p-3 rounded-lg border border-[var(--color-border)] bg-white hover:border-violet-400 hover:bg-violet-50/50 transition-colors cursor-pointer text-left group"
            onClick={() => onSelect(pattern)}
          >
            <div className="flex items-center gap-2 mb-1">
              {pattern.icon && <span className="text-base">{pattern.icon}</span>}
              <span className="text-xs font-semibold text-[var(--color-text)] group-hover:text-violet-700">
                {pattern.label}
              </span>
            </div>
            <div className="text-[10px] text-[var(--color-text-secondary)]">
              {pattern.category}
            </div>
          </button>
        ))}

        {/* Write Custom Goal card */}
        <button
          type="button"
          className="p-3 rounded-lg border-2 border-dashed border-[var(--color-border)] bg-gray-50/50 hover:border-violet-400 hover:bg-violet-50/30 transition-colors cursor-pointer text-left group"
          onClick={onCustom}
        >
          <div className="flex items-center gap-2 mb-1">
            <span className="text-base">✏️</span>
            <span className="text-xs font-semibold text-[var(--color-text-secondary)] group-hover:text-violet-700">
              Write Custom Goal
            </span>
          </div>
          <div className="text-[10px] text-[var(--color-text-secondary)]">
            Free-text goal entry
          </div>
        </button>
      </div>
    </div>
  );
};

export default GoalPatternPicker;
