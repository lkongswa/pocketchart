import React from 'react';
import type { GoalPattern, PatternComponent } from '../../shared/goal-patterns';

interface GoalComponentFieldsProps {
  pattern: GoalPattern;
  components: Record<string, any>;
  onChange: (key: string, value: any) => void;
  disabled?: boolean;
  excludeKeys?: string[];
}

/** Classification result for 2-column layout */
export interface ComponentClassification {
  leftKeys: string[];
  rightKeys: string[];
  cueBaselineKey: string | null;
  cueTargetKey: string | null;
  widthMap: Record<string, 'full' | 'half'>;
}

/**
 * Classify pattern components for layout.
 * - cueing_baseline → pulled out for cueing section
 * - cueing (when cueing_baseline also exists) → pulled out for cueing section
 * - consistency → skipped entirely
 * - everything else → leftKeys (full-width)
 */
export function classifyComponents(pattern: GoalPattern): ComponentClassification {
  const hasCueBaseline = pattern.components.some(c => c.key === 'cueing_baseline');
  let cueBaselineKey: string | null = null;
  let cueTargetKey: string | null = null;
  const leftKeys: string[] = [];
  const rightKeys: string[] = [];
  const widthMap: Record<string, 'full' | 'half'> = {};

  for (const comp of pattern.components) {
    if (comp.key === 'cueing_baseline') {
      cueBaselineKey = comp.key;
    } else if (comp.key === 'cueing' && hasCueBaseline) {
      cueTargetKey = comp.key;
    } else if (comp.type === 'consistency') {
      // Skip consistency — not displayed
      continue;
    } else {
      leftKeys.push(comp.key);
    }

    widthMap[comp.key] = 'full';
  }

  return { leftKeys, rightKeys, cueBaselineKey, cueTargetKey, widthMap };
}

/** Render a single component field (extracted for reuse) */
function renderComponent(
  comp: PatternComponent,
  components: Record<string, any>,
  onChange: (key: string, value: any) => void,
  disabled: boolean,
): React.ReactNode {
  if (comp.type === 'consistency') {
    return null; // Consistency criterion removed from UI
  }

  if (comp.type === 'chip_single') {
    const selected = components[comp.key] || '';
    return (
      <div key={comp.key}>
        <label className="label text-xs">{comp.label}</label>
        <div className="flex items-center gap-1 flex-wrap">
          {comp.options?.map(opt => (
            <button
              key={opt}
              type="button"
              disabled={disabled}
              className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors cursor-pointer ${
                selected === opt
                  ? 'bg-violet-500 text-white border-violet-500'
                  : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-violet-400 hover:text-violet-600'
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => onChange(comp.key, selected === opt ? '' : opt)}
            >
              {opt}
            </button>
          ))}
        </div>
      </div>
    );
  }

  if (comp.type === 'chip_multi') {
    const selected: string[] = components[comp.key] || [];
    return (
      <div key={comp.key}>
        <label className="label text-xs">{comp.label}</label>
        <div className="flex items-center gap-1 flex-wrap">
          {comp.options?.map(opt => {
            const isSelected = selected.includes(opt);
            return (
              <button
                key={opt}
                type="button"
                disabled={disabled}
                className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors cursor-pointer ${
                  isSelected
                    ? 'bg-violet-500 text-white border-violet-500'
                    : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-violet-400 hover:text-violet-600'
                } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
                onClick={() => {
                  const updated = isSelected
                    ? selected.filter(s => s !== opt)
                    : [...selected, opt];
                  onChange(comp.key, updated);
                }}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (comp.type === 'number') {
    return (
      <div key={comp.key}>
        <label className="label text-xs">{comp.label}</label>
        <div className="flex items-center gap-1.5">
          <input
            type="number"
            min={0}
            disabled={disabled}
            className="input text-xs w-20 px-2 py-1"
            placeholder={comp.placeholder}
            value={components[comp.key] || ''}
            onChange={(e) => onChange(comp.key, e.target.value)}
          />
          {comp.suffix && (
            <span className="text-xs text-[var(--color-text-secondary)]">{comp.suffix}</span>
          )}
        </div>
      </div>
    );
  }

  if (comp.type === 'text') {
    return (
      <div key={comp.key}>
        <label className="label text-xs">{comp.label}</label>
        <input
          type="text"
          disabled={disabled}
          className="input text-xs w-full px-2 py-1"
          placeholder={comp.placeholder}
          value={components[comp.key] || ''}
          onChange={(e) => onChange(comp.key, e.target.value)}
        />
      </div>
    );
  }

  if (comp.type === 'select') {
    return (
      <div key={comp.key}>
        <label className="label text-xs">{comp.label}</label>
        <select
          disabled={disabled}
          className="select text-xs py-1 w-full"
          value={components[comp.key] || ''}
          onChange={(e) => onChange(comp.key, e.target.value)}
        >
          <option value="">Select...</option>
          {comp.options?.map(opt => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </div>
    );
  }

  return null;
}

const GoalComponentFields: React.FC<GoalComponentFieldsProps> = ({
  pattern,
  components,
  onChange,
  disabled = false,
  excludeKeys = [],
}) => {
  // Filter out excluded keys and consistency
  const visibleComps = pattern.components.filter(
    c => !excludeKeys.includes(c.key) && c.type !== 'consistency'
  );

  return (
    <div className="space-y-3">
      {visibleComps.map(comp =>
        renderComponent(comp, components, onChange, disabled)
      )}
    </div>
  );
};

export default GoalComponentFields;
