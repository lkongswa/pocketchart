import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { GoalProgressEntry, MeasurementType } from '../../shared/types';
import { formatMetricValue } from '../../shared/compose-goal-text';
import { calculateProgress, getMetricDirection } from '../../shared/goal-metrics';

interface GoalProgressTimelineProps {
  history: GoalProgressEntry[];
  measurement_type: string;
  target_value: string;
  target_numeric: number;
  baseline_numeric?: number;
  instrument?: string;
  compact?: boolean;
  defaultExpanded?: boolean;
}

const SOURCE_LABELS: Record<string, string> = {
  eval: 'Eval',
  progress_report: 'PR',
  recert: 'Recert',
  discharge: 'DC',
};

function formatShortDate(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  if (!m || !d) return dateStr;
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

function getProgressColor(
  progress: number,
): string {
  if (progress >= 67) return 'bg-emerald-100 text-emerald-700 border-emerald-200';
  if (progress >= 33) return 'bg-amber-100 text-amber-700 border-amber-200';
  return 'bg-red-100 text-red-700 border-red-200';
}

const GoalProgressTimeline: React.FC<GoalProgressTimelineProps> = ({
  history,
  measurement_type,
  target_value,
  target_numeric,
  baseline_numeric,
  instrument,
  compact = false,
  defaultExpanded = false,
}) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [showAll, setShowAll] = useState(false);

  // Don't show timeline if fewer than 2 entries
  if (history.length < 2) return null;

  const mt = measurement_type as MeasurementType;
  const direction = getMetricDirection(mt);
  const baseNum = baseline_numeric ?? (history.length > 0 ? history[0].numeric_value : 0);
  const targetLabel = formatMetricValue(mt, target_value, instrument);

  // Show last 5 entries if not showing all
  const MAX_VISIBLE = 5;
  const hiddenCount = history.length > MAX_VISIBLE && !showAll ? history.length - MAX_VISIBLE : 0;
  const visibleHistory = hiddenCount > 0 ? history.slice(history.length - MAX_VISIBLE) : history;

  const header = (
    <button
      type="button"
      className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors w-full"
      onClick={() => setExpanded(!expanded)}
    >
      {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      <span className="font-medium">Progress History</span>
      <span className="text-[10px] opacity-70">({history.length} checkpoint{history.length !== 1 ? 's' : ''})</span>
      {!expanded && history.length >= 2 && (
        <span className="ml-auto text-[10px] opacity-60">
          {formatMetricValue(mt, history[0].value, instrument)} → {formatMetricValue(mt, history[history.length - 1].value, instrument)}
        </span>
      )}
    </button>
  );

  if (compact) {
    return (
      <div className="mt-1.5 mb-1">
        {header}
        {expanded && (
          <div className="mt-1.5 flex items-center gap-0.5 overflow-x-auto pb-1">
            {hiddenCount > 0 && (
              <button
                type="button"
                className="shrink-0 text-[9px] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] px-1"
                onClick={() => setShowAll(true)}
              >
                ← {hiddenCount} earlier
              </button>
            )}
            {visibleHistory.map((entry, idx) => {
              const progress = calculateProgress(baseNum, entry.numeric_value, target_numeric, direction);
              const colorClass = getProgressColor(progress);
              return (
                <div key={entry.id} className="flex items-center shrink-0">
                  {idx > 0 && <div className="w-3 h-px bg-gray-300 shrink-0" />}
                  <div
                    className={`px-1.5 py-0.5 rounded text-[9px] font-medium border ${colorClass}`}
                    title={`${SOURCE_LABELS[entry.source_type] || entry.source_type} — ${entry.recorded_date}`}
                  >
                    {formatMetricValue(mt, entry.value, instrument)}
                  </div>
                </div>
              );
            })}
            <div className="flex items-center shrink-0">
              <div className="w-3 h-px bg-gray-300 shrink-0" />
              <div className="px-1.5 py-0.5 rounded text-[9px] font-medium border border-dashed border-emerald-300 text-emerald-600 bg-emerald-50">
                {targetLabel}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // Full (non-compact) version
  return (
    <div className="mb-3">
      {header}
      {expanded && (
        <div className="mt-2">
          {/* Timeline strip */}
          <div className="flex items-stretch gap-0 overflow-x-auto pb-1">
            {hiddenCount > 0 && (
              <button
                type="button"
                className="shrink-0 flex flex-col items-center justify-center px-2 text-[9px] text-[var(--color-text-secondary)] hover:text-[var(--color-text)] border-r border-dashed border-gray-200"
                onClick={() => setShowAll(true)}
              >
                <span>← {hiddenCount}</span>
                <span>earlier</span>
              </button>
            )}
            {visibleHistory.map((entry, idx) => {
              const progress = calculateProgress(baseNum, entry.numeric_value, target_numeric, direction);
              const colorClass = getProgressColor(progress);
              const isFirst = idx === 0 && hiddenCount === 0;
              const isLast = idx === visibleHistory.length - 1;
              return (
                <div key={entry.id} className="flex items-stretch shrink-0">
                  {(idx > 0 || hiddenCount > 0) && (
                    <div className="flex items-center">
                      <div className="w-4 h-px bg-gray-300" />
                    </div>
                  )}
                  <div className="flex flex-col items-center gap-0.5 px-1 min-w-[56px]">
                    <span className="text-[9px] text-[var(--color-text-secondary)] font-medium whitespace-nowrap">
                      {SOURCE_LABELS[entry.source_type] || entry.source_type}
                    </span>
                    <div
                      className={`px-2 py-1 rounded text-xs font-bold border ${colorClass}`}
                    >
                      {formatMetricValue(mt, entry.value, instrument)}
                    </div>
                    <span className="text-[9px] text-[var(--color-text-tertiary)] whitespace-nowrap">
                      {formatShortDate(entry.recorded_date)}
                    </span>
                  </div>
                </div>
              );
            })}
            {/* Target marker */}
            <div className="flex items-stretch shrink-0">
              <div className="flex items-center">
                <div className="w-4 h-px bg-gray-300" />
              </div>
              <div className="flex flex-col items-center gap-0.5 px-1 min-w-[56px]">
                <span className="text-[9px] text-[var(--color-text-secondary)] font-medium">Target</span>
                <div className="px-2 py-1 rounded text-xs font-bold border border-dashed border-emerald-300 text-emerald-600 bg-emerald-50">
                  {targetLabel}
                </div>
                <span className="text-[9px] text-[var(--color-text-tertiary)]">&nbsp;</span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default GoalProgressTimeline;
