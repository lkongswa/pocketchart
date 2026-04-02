import React from 'react';
import type { MeasurementType } from '../../shared/types';
import { formatMetricValue } from '../../shared/compose-goal-text';
import { calculateProgress, getMetricDirection } from '../../shared/goal-metrics';

interface GoalProgressBarProps {
  measurement_type: MeasurementType;
  baseline_value: string;
  baseline_numeric: number;
  current_value?: string;
  current_numeric?: number;
  target_value: string;
  target_numeric: number;
  instrument?: string;
  compact?: boolean;
}

const GoalProgressBar: React.FC<GoalProgressBarProps> = ({
  measurement_type,
  baseline_value,
  baseline_numeric,
  current_value,
  current_numeric,
  target_value,
  target_numeric,
  instrument,
  compact = false,
}) => {
  const direction = getMetricDirection(measurement_type);
  const hasCurrent = current_value !== undefined && current_value !== '';
  const progress = hasCurrent
    ? calculateProgress(baseline_numeric, current_numeric ?? 0, target_numeric, direction)
    : 0;

  const baselineLabel = formatMetricValue(measurement_type, baseline_value, instrument);
  const targetLabel = formatMetricValue(measurement_type, target_value, instrument);
  const currentLabel = hasCurrent ? formatMetricValue(measurement_type, current_value!, instrument) : '';

  if (compact) {
    return (
      <div className="mt-1">
        <div className="flex items-center gap-1 text-[10px] mb-0.5">
          <span className="text-amber-600">{baselineLabel}</span>
          {hasCurrent && (
            <>
              <span className="text-[var(--color-text-secondary)]">&rarr;</span>
              <span className="text-blue-600 font-semibold">{currentLabel}</span>
            </>
          )}
          <span className="text-[var(--color-text-secondary)]">&rarr;</span>
          <span className="text-emerald-600">{targetLabel}</span>
        </div>
        {hasCurrent && (
          <div className="h-1 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-teal-500 rounded-full transition-all"
              style={{ width: `${Math.min(100, progress)}%` }}
            />
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="mb-2">
      <div className="flex items-center justify-between text-[10px] mb-1">
        <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-700">{baselineLabel}</span>
        {hasCurrent && (
          <span className="px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 font-bold">{currentLabel}</span>
        )}
        <span className="px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700">{targetLabel}</span>
      </div>
      <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
        <div
          className="h-full bg-teal-500 rounded-full transition-all"
          style={{ width: `${hasCurrent ? Math.min(100, progress) : 0}%` }}
        />
      </div>
    </div>
  );
};

export default GoalProgressBar;
