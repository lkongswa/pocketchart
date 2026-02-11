import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import type { PatternComponent } from '../../shared/goal-patterns';

interface CueSectionProps {
  cueBaselineComp: PatternComponent | null;
  cueTargetComp: PatternComponent | null;
  components: Record<string, any>;
  onChange: (key: string, value: any) => void;
  disabled?: boolean;
}

const CueingSection: React.FC<CueSectionProps> = ({
  cueBaselineComp,
  cueTargetComp,
  components,
  onChange,
  disabled = false,
}) => {
  const [open, setOpen] = useState(false);

  // Don't render if pattern has no cueing fields
  if (!cueBaselineComp && !cueTargetComp) return null;

  const baselineVal = cueBaselineComp ? (components[cueBaselineComp.key] || '') : '';
  const targetVal = cueTargetComp ? (components[cueTargetComp.key] || '') : '';
  const hasCueing = !!baselineVal || !!targetVal;

  const renderChips = (comp: PatternComponent, value: string, activeColor: string) => (
    <div>
      <label className="block text-[10px] font-semibold text-amber-700 mb-1.5">{comp.label}</label>
      <div className="flex items-center gap-1 flex-wrap">
        {comp.options?.map(opt => (
          <button
            key={opt}
            type="button"
            disabled={disabled}
            className={`px-2 py-0.5 text-[10px] rounded-full border transition-colors cursor-pointer ${
              value === opt
                ? activeColor
                : 'border-amber-200 text-amber-600 hover:border-amber-400 hover:text-amber-700'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={() => onChange(comp.key, value === opt ? '' : opt)}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );

  return (
    <div className="border-t border-[var(--color-border)]">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full flex items-center gap-2 px-4 py-2 text-left transition-colors ${
          open ? 'bg-amber-50/60' : 'bg-amber-50/30 hover:bg-amber-50/50'
        } ${!open ? 'rounded-b-xl' : ''}`}
      >
        {open ? <ChevronDown size={14} className="text-amber-600" /> : <ChevronRight size={14} className="text-amber-600" />}
        <span className="text-[11px] font-semibold text-amber-700">Cueing Level</span>
        {!open && hasCueing && (
          <span className="text-[10px] text-amber-600">
            — {baselineVal || '(none)'} → {targetVal || '(none)'}
          </span>
        )}
        {!open && !hasCueing && (
          <span className="text-[10px] text-[var(--color-text-secondary)] italic">optional</span>
        )}
      </button>

      {open && (
        <div className="px-4 py-3 bg-amber-50/40 rounded-b-xl">
          <div className="grid grid-cols-2 gap-3">
            {cueBaselineComp && (
              <div className="p-2.5 rounded-lg bg-amber-50/60 border border-amber-200/60">
                {renderChips(cueBaselineComp, baselineVal, 'bg-amber-500 text-white border-amber-500')}
              </div>
            )}
            {cueTargetComp && (
              <div className="p-2.5 rounded-lg bg-amber-50/60 border border-amber-200/60">
                {renderChips(cueTargetComp, targetVal, 'bg-emerald-500 text-white border-emerald-500')}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default CueingSection;
