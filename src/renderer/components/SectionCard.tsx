import React, { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { sectionColorMap } from '../utils/sectionColors';
import type { SectionColor } from '../utils/sectionColors';

interface SectionCardProps {
  /** Section color key for visual differentiation */
  color: SectionColor;
  /** Lucide icon element (e.g., <FileText size={18} />) */
  icon: React.ReactElement;
  /** Section title */
  title: string;
  /** Optional item count shown in parentheses */
  count?: number;
  /** Optional badge node (e.g., "3 unsigned" warning badge) */
  badge?: React.ReactNode;
  /** Right-side action buttons */
  actions?: React.ReactNode;
  /** Whether the section can be collapsed */
  collapsible?: boolean;
  /** Initial expanded state (default true) */
  defaultExpanded?: boolean;
  /** Controlled expanded state */
  expanded?: boolean;
  /** Called when toggle is clicked */
  onToggle?: (expanded: boolean) => void;
  /** Card content */
  children: React.ReactNode;
}

/**
 * A visually distinct section card with colored left border,
 * tinted header bar, and section-colored icon.
 */
export default function SectionCard({
  color,
  icon,
  title,
  count,
  badge,
  actions,
  collapsible = false,
  defaultExpanded = true,
  expanded: controlledExpanded,
  onToggle,
  children,
}: SectionCardProps) {
  const [internalExpanded, setInternalExpanded] = useState(defaultExpanded);
  const isExpanded = controlledExpanded !== undefined ? controlledExpanded : internalExpanded;

  const scheme = sectionColorMap[color];

  const handleToggle = () => {
    const next = !isExpanded;
    if (controlledExpanded === undefined) {
      setInternalExpanded(next);
    }
    onToggle?.(next);
  };

  const headerContent = (
    <>
      {collapsible && (
        isExpanded
          ? <ChevronDown size={14} className="shrink-0 text-[var(--color-text-secondary)]" />
          : <ChevronRight size={14} className="shrink-0 text-[var(--color-text-secondary)]" />
      )}
      <span className={`shrink-0 ${scheme.icon}`}>
        {icon}
      </span>
      <h3 className="font-semibold text-[var(--color-text)] text-sm">
        {title}
        {count !== undefined && (
          <span className="text-xs font-normal text-[var(--color-text-secondary)] ml-1.5">
            ({count})
          </span>
        )}
      </h3>
      {badge && <span className="ml-1">{badge}</span>}
    </>
  );

  return (
    <div
      className={`card border-l-4 ${scheme.border} overflow-hidden`}
      role="region"
      aria-label={title}
    >
      {/* Header */}
      <div
        className={`flex items-center justify-between px-4 py-3 ${scheme.bg} border-b ${scheme.headerBorder} ${
          collapsible ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''
        }`}
        onClick={collapsible ? handleToggle : undefined}
        role={collapsible ? 'button' : undefined}
        aria-expanded={collapsible ? isExpanded : undefined}
        tabIndex={collapsible ? 0 : undefined}
        onKeyDown={collapsible ? (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            handleToggle();
          }
        } : undefined}
      >
        <div className="flex items-center gap-2 min-w-0">
          {headerContent}
        </div>
        {actions && (
          <div className="flex items-center gap-2 shrink-0" onClick={(e) => collapsible && e.stopPropagation()}>
            {actions}
          </div>
        )}
      </div>

      {/* Content */}
      {(!collapsible || isExpanded) && children}
    </div>
  );
}
