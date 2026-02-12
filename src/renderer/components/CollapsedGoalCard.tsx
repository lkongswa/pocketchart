import React from 'react';
import { ChevronRight, RefreshCw, Lock } from 'lucide-react';
import type { GoalCardData } from '../../shared/goal-card-data';
import type { MeasurementType, GoalProgressEntry } from '../../shared/types';
import { formatMetricValue } from '../../shared/compose-goal-text';
import { calculateProgress, getMetricDirection } from '../../shared/goal-metrics';

interface CollapsedGoalCardProps {
  data: GoalCardData;
  fingerprint: string;
  onClick: () => void;
}

function formatShortDate(dateStr: string): string {
  if (!dateStr) return '';
  const [y, m, d] = dateStr.split('-');
  if (!m || !d) return dateStr;
  return `${parseInt(m, 10)}/${parseInt(d, 10)}`;
}

function getProgressColor(progress: number): string {
  if (progress >= 67) return 'bg-emerald-100 text-emerald-700';
  if (progress >= 33) return 'bg-amber-100 text-amber-700';
  return 'bg-red-100 text-red-700';
}

function ProgressPills({ history, mt, targetNumeric, baselineNumeric, targetValue, instrument }: {
  history: GoalProgressEntry[];
  mt: MeasurementType;
  targetNumeric: number;
  baselineNumeric: number;
  targetValue: string;
  instrument: string;
}) {
  if (history.length < 1) return null;
  const direction = getMetricDirection(mt);
  const baseNum = baselineNumeric ?? (history.length > 0 ? history[0].numeric_value : 0);
  // Show last 3 entries max
  const visible = history.slice(-3);
  const targetLabel = formatMetricValue(mt, targetValue, instrument);

  return (
    <div className="flex items-center gap-0.5 shrink-0">
      {visible.map((entry, i) => {
        const progress = calculateProgress(baseNum, entry.numeric_value, targetNumeric, direction);
        const colorCls = getProgressColor(progress);
        return (
          <span
            key={entry.id}
            className={`px-1.5 py-0.5 rounded text-[9px] font-semibold ${colorCls}`}
            title={`${entry.source_type} ${formatShortDate(entry.recorded_date)}`}
          >
            {formatMetricValue(mt, entry.value, instrument)}
          </span>
        );
      })}
      <span className="px-1.5 py-0.5 rounded text-[9px] font-semibold border border-dashed border-blue-300 text-blue-600 bg-blue-50">
        {targetLabel}
      </span>
    </div>
  );
}

const CollapsedGoalCard: React.FC<CollapsedGoalCardProps> = ({ data, fingerprint, onClick }) => {
  const isSTG = data.goal_type === 'STG';
  const borderColor = isSTG ? 'border-l-blue-400' : 'border-l-purple-400';
  const typeBg = isSTG ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700';
  const isEstablished = data.context === 'client' && data.isSynced;

  return (
    <div
      onClick={onClick}
      className={`bg-white rounded-lg border border-[var(--color-border)] border-l-[3.5px] ${borderColor}
        px-3 py-2.5 cursor-pointer hover:shadow-sm hover:border-gray-300 transition-all`}
    >
      {/* Row 1: Type + Pattern + Fingerprint + badges + date + chevron */}
      <div className="flex items-center gap-1.5 mb-1">
        <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${typeBg}`}>
          {data.goal_type}
        </span>
        {data.resolvedPattern ? (
          <span className="text-xs font-semibold text-[var(--color-text)]">
            {data.resolvedPattern.label}
          </span>
        ) : (
          <span className="text-xs font-medium text-[var(--color-text-secondary)] italic">
            {data.category || 'Custom Goal'}
          </span>
        )}
        <span className="text-[10px] text-[var(--color-text-secondary)]">·</span>
        <span className="text-[11px] text-[var(--color-text-secondary)] truncate max-w-[200px]">{fingerprint}</span>

        <div className="ml-auto flex items-center gap-1.5 shrink-0">
          {isEstablished && (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-blue-100 text-blue-600">
              <Lock size={8} /> Est.
            </span>
          )}
          {data.isSynced && data.context === 'eval' && (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-100 text-emerald-700">
              <RefreshCw size={8} /> Synced
            </span>
          )}
          {data.target_date && (
            <span className="text-[10px] text-[var(--color-text-secondary)]">
              Due {formatShortDate(data.target_date)}
            </span>
          )}
          <ChevronRight size={14} className="text-gray-400" />
        </div>
      </div>

      {/* Row 2: Truncated goal text + progress pills */}
      <div className="flex items-center justify-between gap-3">
        <p className="text-[11.5px] text-[var(--color-text-secondary)] truncate flex-1 min-w-0">
          {data.goal_text || <span className="italic opacity-60">No goal text</span>}
        </p>
        {data.progressHistory.length >= 1 && (
          <ProgressPills
            history={data.progressHistory}
            mt={data.measurement_type}
            targetNumeric={data.target}
            baselineNumeric={data.baseline}
            targetValue={data.target_value || `${data.target}`}
            instrument={data.instrument}
          />
        )}
      </div>
    </div>
  );
};

export default React.memo(CollapsedGoalCard);
