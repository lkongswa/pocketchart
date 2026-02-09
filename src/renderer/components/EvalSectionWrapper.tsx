import React from 'react';
import { ChevronDown } from 'lucide-react';
import type { SectionStatus } from '../hooks/useEvalSections';

interface EvalSectionWrapperProps {
  id: string;
  title: string;
  icon?: React.ReactNode;
  status: SectionStatus;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
  sectionRef?: (el: HTMLDivElement | null) => void;
  badge?: React.ReactNode;
}

const STATUS_DOT: Record<SectionStatus, string> = {
  complete: 'bg-emerald-400',
  'optional-empty': 'bg-amber-400',
  'required-empty': 'bg-red-400',
};

const COLLAPSED_BORDER: Record<SectionStatus, string> = {
  complete: 'border-[var(--color-border)]',
  'optional-empty': 'border-amber-200',
  'required-empty': 'border-red-200',
};

export default function EvalSectionWrapper({
  id,
  title,
  icon,
  status,
  isExpanded,
  onToggle,
  children,
  sectionRef,
  badge,
}: EvalSectionWrapperProps) {
  return (
    <div
      ref={sectionRef}
      data-section-id={id}
      className={`card mb-6 transition-all ${!isExpanded ? COLLAPSED_BORDER[status] : ''}`}
    >
      {/* Clickable header */}
      <div
        className="flex items-center gap-2 px-6 py-3 cursor-pointer select-none"
        onClick={onToggle}
      >
        {icon && <span className="shrink-0 text-[var(--color-primary)]">{icon}</span>}
        <h2 className="text-lg font-semibold text-[var(--color-text)] flex-1 mb-0">{title}</h2>
        {badge}
        <span
          className={`w-2.5 h-2.5 shrink-0 rounded-full ${STATUS_DOT[status]}`}
          title={status === 'complete' ? 'Complete' : status === 'required-empty' ? 'Required — empty' : 'Optional — empty'}
        />
        <ChevronDown
          className={`w-4 h-4 shrink-0 text-[var(--color-text-secondary)] transition-transform duration-200 ${isExpanded ? 'rotate-180' : ''}`}
        />
      </div>

      {/* Collapsible content */}
      {isExpanded && (
        <div className="px-6 pb-6 pt-1 border-t border-[var(--color-border)]/30">
          {children}
        </div>
      )}
    </div>
  );
}
