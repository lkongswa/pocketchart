import React, { useState } from 'react';
import {
  ChevronDown,
  BookOpen,
  X,
  Pen,
  RefreshCw,
  Lock,
  Flag,
  Edit,
  Trash2,
} from 'lucide-react';
import type { GoalCardData, GoalCardFieldUpdate } from '../../shared/goal-card-data';
import type { Discipline, GoalType, GoalStatus, MeasurementType, PatternOverride } from '../../shared/types';
import type { GoalPattern } from '../../shared/goal-patterns';
import { formatMetricValue } from '../../shared/compose-goal-text';
import { calculateProgress, getMetricDirection } from '../../shared/goal-metrics';
import { METRIC_OPTIONS, DEFAULT_INSTRUMENTS } from '../../shared/goal-metrics';
import GoalComponentFields, { classifyComponents } from './GoalComponentFields';
import GoalPatternPicker from './GoalPatternPicker';
import CueingSection from './CueingSection';

const COMMON_INSTRUMENTS = ['PHQ-9', 'GAD-7', 'Berg', 'PCL-5', 'ORS', 'SRS', 'BDI-II'];

// ── Status dropdown config (shared with ClientDetailPage) ──

const STATUS_CONFIG: Record<GoalStatus, { label: string; className: string }> = {
  active: { label: 'Active', className: 'bg-emerald-100 text-emerald-700' },
  met: { label: 'Met', className: 'bg-green-100 text-green-700' },
  discontinued: { label: "DC'd", className: 'bg-red-100 text-red-700' },
  modified: { label: 'Modified', className: 'bg-amber-100 text-amber-700' },
};

interface ExpandedGoalCardProps {
  data: GoalCardData;
  discipline: Discipline;
  patternOverrides: PatternOverride[];
  disabled?: boolean;
  onCollapse: () => void;
  onFieldChange: (field: GoalCardFieldUpdate) => void;
  onComponentChange: (key: string, value: any) => void;
  onDelete?: () => void;
  onPatternSelect?: (pattern: GoalPattern) => void;
  onPatternClear?: () => void;
  onCustomPattern?: () => void;
  onStatusChange?: (status: GoalStatus) => void;
  onFlagCheckpoint?: () => void;
  onEditModal?: () => void;
  categoryOptions: string[];
  usedCategories: string[];
}

const TIMEFRAME_OPTIONS = [
  { label: '1 wk', days: 7 },
  { label: '2 wk', days: 14 },
  { label: '30 d', days: 30 },
  { label: '60 d', days: 60 },
  { label: '90 d', days: 90 },
  { label: '6 mo', days: 180 },
  { label: '1 yr', days: 365 },
];

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

const ExpandedGoalCard: React.FC<ExpandedGoalCardProps> = ({
  data,
  discipline,
  patternOverrides,
  disabled = false,
  onCollapse,
  onFieldChange,
  onComponentChange,
  onDelete,
  onPatternSelect,
  onPatternClear,
  onCustomPattern,
  onStatusChange,
  onFlagCheckpoint,
  onEditModal,
  categoryOptions,
  usedCategories,
}) => {
  const [showPatternPicker, setShowPatternPicker] = useState(false);
  const [editingText, setEditingText] = useState(false);
  const [statusMenuOpen, setStatusMenuOpen] = useState(false);

  const isSTG = data.goal_type === 'STG';
  const borderColor = isSTG ? 'border-l-blue-400' : 'border-l-purple-400';
  const typeBg = isSTG ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700';

  const hasPattern = data.resolvedPattern && data.pattern_id !== 'custom_freeform';
  const classified = data.resolvedPattern ? classifyComponents(data.resolvedPattern) : null;
  const cueExcludeKeys = classified ? [
    ...(classified.cueBaselineKey ? [classified.cueBaselineKey] : []),
    ...(classified.cueTargetKey ? [classified.cueTargetKey] : []),
  ] : [];
  const cueBaselineComp = classified?.cueBaselineKey && data.resolvedPattern
    ? data.resolvedPattern.components.find(c => c.key === classified.cueBaselineKey) ?? null
    : null;
  const cueTargetComp = classified?.cueTargetKey && data.resolvedPattern
    ? data.resolvedPattern.components.find(c => c.key === classified.cueTargetKey) ?? null
    : null;

  const mt = data.measurement_type as MeasurementType;
  const direction = getMetricDirection(mt);
  const baseNum = data.baseline ?? 0;

  const isEstablished = data.context === 'client' && data.isSynced;

  return (
    <div className={`bg-white rounded-xl border border-[var(--color-border)] border-l-[3.5px] ${borderColor} overflow-hidden shadow-sm`}>
      {/* ══ ZONE 1: HEADER BAR ══ */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-50 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${typeBg}`}>
            GOAL {data.index + 1}
          </span>
          {isEstablished && (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-blue-100 text-blue-600">
              <Lock size={8} /> Established
            </span>
          )}
          {data.isSynced && data.context === 'eval' && (
            <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-semibold bg-emerald-100 text-emerald-700">
              <RefreshCw size={8} /> Synced
            </span>
          )}
          {data.resolvedPattern && (
            <span className="text-xs text-teal-600 font-semibold">
              {data.resolvedPattern.icon} {data.resolvedPattern.label}
            </span>
          )}
          {/* Status dropdown (client context only) */}
          {data.context === 'client' && data.status && onStatusChange && (
            <div className="relative">
              <button
                className={`badge text-xs cursor-pointer hover:opacity-80 transition-opacity ${STATUS_CONFIG[data.status]?.className || ''}`}
                onClick={() => setStatusMenuOpen(!statusMenuOpen)}
              >
                {STATUS_CONFIG[data.status]?.label || data.status}
                <ChevronDown size={10} className="ml-0.5 opacity-60 inline" />
              </button>
              {statusMenuOpen && (
                <div className="absolute left-0 top-full mt-1 z-50 bg-white rounded-lg shadow-lg border border-[var(--color-border)] py-1 min-w-[140px]">
                  {(Object.entries(STATUS_CONFIG) as [GoalStatus, typeof STATUS_CONFIG.active][]).map(([status, cfg]) => (
                    <button
                      key={status}
                      className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-gray-50 transition-colors ${data.status === status ? 'font-semibold bg-gray-50' : ''}`}
                      onClick={() => {
                        setStatusMenuOpen(false);
                        if (status !== data.status) onStatusChange(status as GoalStatus);
                      }}
                    >
                      {cfg.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {/* Pattern picker toggle */}
          {!disabled && onPatternSelect && (
            <button
              className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors cursor-pointer ${
                showPatternPicker ? 'bg-violet-100 text-violet-700' : 'text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] hover:bg-violet-50'
              }`}
              onClick={() => setShowPatternPicker(!showPatternPicker)}
            >
              <BookOpen size={12} />
              {hasPattern ? 'Change Pattern' : 'Goal Patterns'}
            </button>
          )}
          {/* Clear pattern */}
          {!disabled && hasPattern && onPatternClear && (
            <button
              className="inline-flex items-center gap-1 px-2 py-1 rounded text-xs text-[var(--color-text-secondary)] hover:text-red-500 hover:bg-red-50 transition-colors cursor-pointer"
              onClick={onPatternClear}
            >
              <X size={12} /> Clear
            </button>
          )}
          {/* Client-context actions */}
          {data.context === 'client' && onFlagCheckpoint && (
            <button className="p-1 rounded hover:bg-amber-50 text-amber-500 hover:text-amber-600" title="Flag for Checkpoint" onClick={onFlagCheckpoint}>
              <Flag size={12} />
            </button>
          )}
          {data.context === 'client' && !isEstablished && onEditModal && (
            <button className="p-1 rounded hover:bg-gray-100 text-[var(--color-text-secondary)]" title="Edit" onClick={onEditModal}>
              <Edit size={12} />
            </button>
          )}
          {/* Delete button */}
          {onDelete && !disabled && (
            <button
              className="p-1 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
              onClick={onDelete}
            >
              <Trash2 size={14} />
            </button>
          )}
          {/* Collapse */}
          <button
            onClick={onCollapse}
            className="p-1 rounded-lg hover:bg-gray-100 text-[var(--color-text-secondary)]"
          >
            <ChevronDown size={14} />
          </button>
        </div>
      </div>

      {/* Pattern Picker Dropdown */}
      {showPatternPicker && onPatternSelect && (
        <div className="mx-4 mt-3 mb-1 p-3 bg-violet-50 rounded-lg border border-violet-200 max-h-64 overflow-y-auto">
          <GoalPatternPicker
            discipline={discipline}
            category={data.category || undefined}
            overrides={patternOverrides}
            onSelect={(pattern) => {
              onPatternSelect(pattern);
              setShowPatternPicker(false);
            }}
            onCustom={() => {
              onCustomPattern?.();
              setShowPatternPicker(false);
            }}
          />
        </div>
      )}

      {/* ══ ZONE 2: TOP ZONE — Metadata + Goal Text + Progress ══ */}
      <div className="px-4 py-3">
        {/* Row A: Type / Category / Date — all on one line */}
        <div className="flex items-center gap-2 mb-3">
          <select
            className="select text-xs py-1 w-16"
            value={data.goal_type}
            disabled={disabled}
            onChange={(e) => onFieldChange({ goal_type: e.target.value as GoalType })}
          >
            <option value="STG">STG</option>
            <option value="LTG">LTG</option>
          </select>
          <select
            className="select text-xs py-1 flex-1 min-w-0"
            value={data.category}
            disabled={disabled}
            onChange={(e) => onFieldChange({ category: e.target.value })}
          >
            <option value="">Category</option>
            {usedCategories.length > 0 && (
              <optgroup label="Current Goals">
                {usedCategories.map(cat => (
                  <option key={`used-${cat}`} value={cat}>{cat}</option>
                ))}
              </optgroup>
            )}
            <optgroup label={usedCategories.length > 0 ? 'All Categories' : ''}>
              {categoryOptions
                .filter(cat => !usedCategories.includes(cat))
                .map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
            </optgroup>
          </select>
          <select
            className="select text-xs py-1 w-20"
            value={data.target_date}
            disabled={disabled}
            onChange={(e) => onFieldChange({ target_date: e.target.value })}
          >
            <option value="">Date</option>
            {TIMEFRAME_OPTIONS.map(({ label, days }) => {
              const d = new Date();
              d.setDate(d.getDate() + days);
              const iso = d.toISOString().slice(0, 10);
              return (
                <option key={label} value={iso}>{label}</option>
              );
            })}
          </select>
        </div>

        {/* Row B: Goal Text */}
        <div className="p-3 rounded-lg bg-teal-50/40 border border-teal-200/60 mb-3">
          <div className="flex items-center justify-between mb-1">
            <span className="text-[9px] font-bold uppercase tracking-wide text-teal-600">Goal Text</span>
            {!disabled && hasPattern && (
              <button
                className="text-[10px] text-teal-600 hover:underline cursor-pointer flex items-center gap-1"
                onClick={() => setEditingText(!editingText)}
              >
                <Pen size={9} /> {editingText ? 'use pattern' : 'edit manually'}
              </button>
            )}
          </div>
          {editingText || !hasPattern ? (
            <textarea
              className="w-full text-sm text-[var(--color-text)] bg-white/60 rounded border border-teal-200 p-2 resize-none focus:outline-none focus:border-teal-400"
              rows={2}
              placeholder="Enter goal text..."
              value={data.goal_text}
              disabled={disabled}
              onChange={(e) => onFieldChange({ goal_text: e.target.value })}
            />
          ) : (
            <p className="text-[12.5px] text-teal-900 leading-relaxed">
              {data.goal_text || <span className="italic text-teal-500">Fill in fields to preview goal text</span>}
            </p>
          )}
        </div>

        {/* Row C: Progress pills + Accuracy dropdowns */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Historical progress pills */}
          {data.progressHistory.length >= 2 && data.progressHistory.slice(-4).map((entry) => {
            const progress = calculateProgress(baseNum, entry.numeric_value, data.target, direction);
            const colorCls = getProgressColor(progress);
            return (
              <div key={entry.id} className={`flex items-center gap-1 px-2 py-0.5 rounded ${colorCls}`}>
                <span className="text-[10px] font-bold">{formatMetricValue(mt, entry.value, data.instrument)}</span>
                <span className="text-[9px] opacity-70">
                  {entry.source_type === 'eval' ? 'Eval' : entry.source_type === 'progress_report' ? 'PR' : entry.source_type}
                  {' '}{formatShortDate(entry.recorded_date)}
                </span>
              </div>
            );
          })}

          {data.progressHistory.length >= 2 && (
            <div className="w-px h-4 bg-[var(--color-border)]" />
          )}

          {/* Current accuracy (dropdown) */}
          <div className="flex items-center gap-1">
            <span className="text-[9px] font-semibold text-amber-700">Current</span>
            {mt === 'standardized_score' && (
              <select
                className="select text-xs py-0.5 w-24"
                disabled={disabled}
                value={data.instrument || DEFAULT_INSTRUMENTS[data.category || ''] || ''}
                onChange={(e) => onFieldChange({ instrument: e.target.value })}
              >
                <option value="">Instrument</option>
                {COMMON_INSTRUMENTS.map(inst => (
                  <option key={inst} value={inst}>{inst}</option>
                ))}
              </select>
            )}
            {METRIC_OPTIONS[mt] ? (
              <select
                className="select text-xs py-0.5"
                disabled={disabled}
                value={data.baseline_value || `${data.baseline ?? 0}`}
                onChange={(e) => {
                  const opt = METRIC_OPTIONS[mt]!.find(o => o.value === e.target.value);
                  onFieldChange({ baseline_value: e.target.value, baseline: opt?.numeric ?? 0 });
                }}
              >
                <option value="">—</option>
                {METRIC_OPTIONS[mt]!.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : (
              <input
                type="number"
                min={0}
                disabled={disabled}
                className="input text-xs w-16 px-2 py-0.5"
                placeholder="Value"
                value={data.baseline_value || ''}
                onChange={(e) => onFieldChange({ baseline_value: e.target.value, baseline: parseInt(e.target.value, 10) || 0 })}
              />
            )}
          </div>

          {/* Target accuracy (dropdown) */}
          <div className="flex items-center gap-1">
            <span className="text-[9px] font-semibold text-blue-700">Target</span>
            {METRIC_OPTIONS[mt] ? (
              <select
                className="select text-xs py-0.5"
                disabled={disabled}
                value={data.target_value || `${data.target ?? 0}`}
                onChange={(e) => {
                  const opt = METRIC_OPTIONS[mt]!.find(o => o.value === e.target.value);
                  onFieldChange({ target_value: e.target.value, target: opt?.numeric ?? 0 });
                }}
              >
                <option value="">—</option>
                {METRIC_OPTIONS[mt]!.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            ) : (
              <input
                type="number"
                min={0}
                disabled={disabled}
                className="input text-xs w-16 px-2 py-0.5"
                placeholder="Value"
                value={data.target_value || ''}
                onChange={(e) => onFieldChange({ target_value: e.target.value, target: parseInt(e.target.value, 10) || 0 })}
              />
            )}
          </div>

        </div>
      </div>

      {/* ══ ZONE 3: PATTERN COMPONENTS ══ */}
      {hasPattern && data.resolvedPattern && data.resolvedPattern.components.length > 0 && (
        <div className="px-4 pb-3">
          <div className="p-3 rounded-lg bg-violet-50/30 border border-violet-100">
            <GoalComponentFields
              pattern={data.resolvedPattern}
              components={data.components}
              onChange={(key, value) => onComponentChange(key, value)}
              disabled={disabled}
              excludeKeys={cueExcludeKeys}
            />
          </div>
        </div>
      )}

      {/* ══ ZONE 4: CUEING SECTION ══ */}
      <CueingSection
        cueBaselineComp={cueBaselineComp}
        cueTargetComp={cueTargetComp}
        components={data.components}
        onChange={(key, value) => onComponentChange(key, value)}
        disabled={disabled}
      />
    </div>
  );
};

export default ExpandedGoalCard;
