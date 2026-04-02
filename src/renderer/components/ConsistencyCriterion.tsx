import React from 'react';

export interface ConsistencyValue {
  type: 'consecutive_sessions' | 'trials';
  count: number;       // For consecutive_sessions: N sessions. For trials: numerator
  trials_denom?: number; // For trials: denominator (e.g., "in 4 of 5 trials")
}

interface ConsistencyCriterionProps {
  value?: ConsistencyValue | null;
  onChange: (val: ConsistencyValue | null) => void;
  disabled?: boolean;
}

const ConsistencyCriterion: React.FC<ConsistencyCriterionProps> = ({
  value,
  onChange,
  disabled = false,
}) => {
  const isConsecutive = value?.type === 'consecutive_sessions';
  const isTrials = value?.type === 'trials';

  return (
    <div className="space-y-1.5">
      <label className="label text-xs">Consistency Criterion</label>
      <div className="space-y-1">
        {/* Consecutive sessions option */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isConsecutive}
            disabled={disabled}
            className="rounded border-gray-300"
            onChange={() => {
              if (isConsecutive) {
                onChange(null);
              } else {
                onChange({ type: 'consecutive_sessions', count: 3 });
              }
            }}
          />
          <span className="text-xs text-[var(--color-text)]">across</span>
          <input
            type="number"
            min={2}
            max={10}
            disabled={disabled || !isConsecutive}
            className="input text-xs w-12 px-1.5 py-0.5 text-center"
            value={isConsecutive ? value.count : 3}
            onChange={(e) => onChange({ type: 'consecutive_sessions', count: parseInt(e.target.value, 10) || 3 })}
          />
          <span className="text-xs text-[var(--color-text)]">consecutive sessions</span>
        </label>

        {/* Trials option */}
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={isTrials}
            disabled={disabled}
            className="rounded border-gray-300"
            onChange={() => {
              if (isTrials) {
                onChange(null);
              } else {
                onChange({ type: 'trials', count: 4, trials_denom: 5 });
              }
            }}
          />
          <span className="text-xs text-[var(--color-text)]">in</span>
          <input
            type="number"
            min={1}
            max={20}
            disabled={disabled || !isTrials}
            className="input text-xs w-12 px-1.5 py-0.5 text-center"
            value={isTrials ? value.count : 4}
            onChange={(e) => onChange({ type: 'trials', count: parseInt(e.target.value, 10) || 4, trials_denom: value?.trials_denom || 5 })}
          />
          <span className="text-xs text-[var(--color-text)]">of</span>
          <input
            type="number"
            min={1}
            max={20}
            disabled={disabled || !isTrials}
            className="input text-xs w-12 px-1.5 py-0.5 text-center"
            value={isTrials ? (value.trials_denom || 5) : 5}
            onChange={(e) => onChange({ type: 'trials', count: value?.count || 4, trials_denom: parseInt(e.target.value, 10) || 5 })}
          />
          <span className="text-xs text-[var(--color-text)]">trials</span>
        </label>
      </div>
    </div>
  );
};

export default ConsistencyCriterion;
