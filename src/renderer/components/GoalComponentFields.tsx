import React from 'react';
import type { GoalPattern } from '../../shared/goal-patterns';
import ConsistencyCriterion from './ConsistencyCriterion';
import type { ConsistencyValue } from './ConsistencyCriterion';

interface GoalComponentFieldsProps {
  pattern: GoalPattern;
  components: Record<string, any>;
  onChange: (key: string, value: any) => void;
  consistency?: ConsistencyValue | null;
  onConsistencyChange?: (val: ConsistencyValue | null) => void;
  disabled?: boolean;
}

const GoalComponentFields: React.FC<GoalComponentFieldsProps> = ({
  pattern,
  components,
  onChange,
  consistency,
  onConsistencyChange,
  disabled = false,
}) => {
  return (
    <div className="space-y-3">
      {pattern.components.map(comp => {
        if (comp.type === 'consistency') {
          return (
            <ConsistencyCriterion
              key={comp.key}
              value={consistency}
              onChange={(val) => onConsistencyChange?.(val)}
              disabled={disabled}
            />
          );
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
      })}
    </div>
  );
};

export default GoalComponentFields;
