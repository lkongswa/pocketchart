import React from 'react';
import type { MeasurementType } from '../../shared/types';
import { METRIC_OPTIONS, DEFAULT_INSTRUMENTS } from '../../shared/goal-metrics';

interface MeasurementChipsProps {
  measurement_type: MeasurementType;
  label: string;                    // "CLOF (Baseline)" or "Goal Level (Target)"
  value: string;                    // Current selected value
  numericValue: number;             // Current numeric value (for range inputs)
  instrument?: string;              // For standardized_score
  category?: string;                // For default instrument lookup
  onSelect: (value: string, numeric: number) => void;
  onInstrumentChange?: (instrument: string) => void;
  disabled?: boolean;
  colorScheme?: 'baseline' | 'target'; // baseline = amber, target = emerald
}

const COMMON_INSTRUMENTS = ['PHQ-9', 'GAD-7', 'Berg', 'PCL-5', 'ORS', 'SRS', 'BDI-II'];

const MeasurementChips: React.FC<MeasurementChipsProps> = ({
  measurement_type,
  label,
  value,
  numericValue,
  instrument,
  category,
  onSelect,
  onInstrumentChange,
  disabled = false,
  colorScheme = 'baseline',
}) => {
  const options = METRIC_OPTIONS[measurement_type];
  const isBaseline = colorScheme === 'baseline';
  const activeColor = isBaseline ? 'bg-amber-500 text-white border-amber-500' : 'bg-emerald-500 text-white border-emerald-500';
  const hoverColor = isBaseline ? 'hover:border-amber-400 hover:text-amber-600' : 'hover:border-emerald-400 hover:text-emerald-600';

  // custom_text: no UI needed
  if (measurement_type === 'custom_text') {
    return null;
  }

  // Chip-based options (ordinal scales)
  if (options) {
    return (
      <div>
        <label className="label text-xs">{label}</label>
        <div className="flex items-center gap-1 flex-wrap">
          {options.map(opt => (
            <button
              key={opt.value}
              type="button"
              disabled={disabled}
              className={`px-1.5 py-0.5 text-[10px] rounded-full border transition-colors cursor-pointer ${
                value === opt.value
                  ? activeColor
                  : `border-[var(--color-border)] text-[var(--color-text-secondary)] ${hoverColor}`
              } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
              onClick={() => {
                if (value === opt.value) {
                  onSelect('', 0); // Toggle off
                } else {
                  onSelect(opt.value, opt.numeric);
                }
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      </div>
    );
  }

  // Numeric input types
  const renderNumericInput = () => {
    switch (measurement_type) {
      case 'rom_degrees':
        return (
          <div>
            <label className="label text-xs">{label}</label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                max={360}
                disabled={disabled}
                className="input text-xs w-20 px-2 py-1"
                value={value || ''}
                onChange={(e) => {
                  const v = e.target.value;
                  onSelect(v, parseInt(v, 10) || 0);
                }}
              />
              <span className="text-xs text-[var(--color-text-secondary)]">&deg;</span>
            </div>
          </div>
        );

      case 'timed_seconds':
        return (
          <div>
            <label className="label text-xs">{label}</label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                disabled={disabled}
                className="input text-xs w-20 px-2 py-1"
                value={value || ''}
                onChange={(e) => {
                  const v = e.target.value;
                  onSelect(v, parseInt(v, 10) || 0);
                }}
              />
              <span className="text-xs text-[var(--color-text-secondary)]">sec</span>
            </div>
          </div>
        );

      case 'standardized_score':
        return (
          <div>
            <label className="label text-xs">{label}</label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {onInstrumentChange && (
                <select
                  className="select text-xs py-1 w-24"
                  disabled={disabled}
                  value={instrument || DEFAULT_INSTRUMENTS[category || ''] || ''}
                  onChange={(e) => onInstrumentChange(e.target.value)}
                >
                  <option value="">Instrument</option>
                  {COMMON_INSTRUMENTS.map(inst => (
                    <option key={inst} value={inst}>{inst}</option>
                  ))}
                </select>
              )}
              <input
                type="number"
                min={0}
                disabled={disabled}
                className="input text-xs w-16 px-2 py-1"
                placeholder="Score"
                value={value || ''}
                onChange={(e) => {
                  const v = e.target.value;
                  onSelect(v, parseInt(v, 10) || 0);
                }}
              />
            </div>
          </div>
        );

      case 'frequency':
        return (
          <div>
            <label className="label text-xs">{label}</label>
            <div className="flex items-center gap-1.5">
              <input
                type="number"
                min={0}
                disabled={disabled}
                className="input text-xs w-16 px-2 py-1"
                value={value || ''}
                onChange={(e) => {
                  const v = e.target.value;
                  onSelect(v, parseInt(v, 10) || 0);
                }}
              />
              <span className="text-xs text-[var(--color-text-secondary)]">per week</span>
            </div>
          </div>
        );

      default:
        return null;
    }
  };

  return renderNumericInput();
};

export default MeasurementChips;
