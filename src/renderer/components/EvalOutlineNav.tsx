import React from 'react';
import { ChevronDown, ChevronRight, Navigation } from 'lucide-react';
import type { EvalSectionDef, SectionStatus } from '../hooks/useEvalSections';

interface EvalOutlineNavProps {
  sections: EvalSectionDef[];
  activeSectionId: string | null;
  onSectionClick: (id: string) => void;
  allExpanded: boolean;
  onToggleAll: () => void;
}

const STATUS_TEXT: Record<SectionStatus, string> = {
  complete: 'text-emerald-600',
  'optional-empty': 'text-amber-500',
  'required-empty': 'text-red-500',
};

const STATUS_DOT: Record<SectionStatus, string> = {
  complete: 'bg-emerald-400',
  'optional-empty': 'bg-amber-400',
  'required-empty': 'bg-red-400',
};

function EvalOutlineNav({
  sections,
  activeSectionId,
  onSectionClick,
  allExpanded,
  onToggleAll,
}: EvalOutlineNavProps) {
  const visibleSections = sections.filter((s) => s.visible);

  const completeCount = visibleSections.filter((s) => s.status === 'complete').length;
  const totalCount = visibleSections.length;

  return (
    <div className="fixed right-3 top-1/2 -translate-y-1/2 w-44 z-30">
      <div className="card p-3 shadow-md border border-[var(--color-border)]">
        {/* Header */}
        <div className="flex items-center gap-1.5 mb-2 pb-2 border-b border-[var(--color-border)]/50">
          <Navigation className="w-3.5 h-3.5 text-[var(--color-text-secondary)]" />
          <span className="text-[11px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">
            Navigator
          </span>
        </div>

        {/* Collapse All / Expand All */}
        <button
          type="button"
          className="w-full flex items-center justify-center gap-1 px-2 py-1 mb-2 text-[10px] font-medium text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] hover:bg-gray-50 rounded transition-colors"
          onClick={onToggleAll}
        >
          {allExpanded ? (
            <>
              <ChevronRight className="w-3 h-3" />
              Collapse All
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3" />
              Expand All
            </>
          )}
        </button>

        {/* Section list */}
        <div className="space-y-0.5 max-h-[60vh] overflow-y-auto">
          {visibleSections.map((section) => {
            const isActive = section.id === activeSectionId;
            return (
              <button
                key={section.id}
                type="button"
                className={`w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors ${
                  isActive ? 'bg-gray-100' : 'hover:bg-gray-50'
                }`}
                onClick={() => onSectionClick(section.id)}
              >
                <span
                  className={`w-1.5 h-1.5 shrink-0 rounded-full ${STATUS_DOT[section.status]}`}
                />
                <span
                  className={`text-[11px] font-medium truncate leading-tight ${STATUS_TEXT[section.status]}`}
                >
                  {section.title}
                </span>
              </button>
            );
          })}
        </div>

        {/* Progress bar */}
        <div className="mt-2 pt-2 border-t border-[var(--color-border)]/50">
          <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-emerald-400 rounded-full transition-all duration-300"
              style={{ width: `${totalCount > 0 ? (completeCount / totalCount) * 100 : 0}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export default React.memo(EvalOutlineNav);
