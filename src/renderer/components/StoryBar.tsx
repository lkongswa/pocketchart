import React, { useState } from 'react';
import { ChevronRight } from 'lucide-react';

/**
 * StoryBar — the quiet "story bar" primitive for the redesigned client chart.
 * One pattern everywhere on the Clinical tab:  ▸ Title  │stat│ │stat│      → action
 * Collapsed at rest; the whole title row toggles; an optional right-aligned
 * action does NOT toggle. Color = status only (via stat tones).
 */

export type StatTone = 'neutral' | 'amber' | 'orange' | 'green' | 'teal';

const STAT_TONE: Record<StatTone, string> = {
  neutral: 'border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text-secondary)]',
  amber: 'border-amber-200 bg-amber-50 text-amber-700',
  orange: 'border-orange-200 bg-orange-50 text-orange-700',
  green: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  teal: 'border-teal-200 bg-teal-50 text-teal-700',
};

export interface StoryStat {
  label: React.ReactNode;
  tone?: StatTone;
}

/** A single status chip — reused inside story-bar headers and bodies. */
export function StatChip({ tone = 'neutral', children }: { tone?: StatTone; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 text-[11px] font-semibold px-1.5 py-0.5 rounded-md border ${STAT_TONE[tone]}`}>
      {children}
    </span>
  );
}

interface StoryBarProps {
  title: React.ReactNode;
  /** status chips shown next to the title */
  stats?: StoryStat[];
  /** right-aligned action (e.g. "+ Note") — clicking it does NOT toggle the bar */
  action?: React.ReactNode;
  /** uncontrolled initial state (default collapsed) */
  defaultExpanded?: boolean;
  /** controlled open state */
  expanded?: boolean;
  onToggle?: (next: boolean) => void;
  children: React.ReactNode;
}

export default function StoryBar({
  title,
  stats,
  action,
  defaultExpanded = false,
  expanded: controlled,
  onToggle,
  children,
}: StoryBarProps) {
  const [internal, setInternal] = useState(defaultExpanded);
  const open = controlled !== undefined ? controlled : internal;

  const toggle = () => {
    const next = !open;
    if (controlled === undefined) setInternal(next);
    onToggle?.(next);
  };

  return (
    <div className="card overflow-hidden">
      <div className="w-full flex items-center gap-2.5 px-4 py-3">
        <button
          type="button"
          className="flex items-center gap-2.5 flex-1 min-w-0 text-left"
          onClick={toggle}
          aria-expanded={open}
        >
          <ChevronRight
            size={15}
            className={`shrink-0 text-[var(--color-text-secondary)] transition-transform duration-150 ${open ? 'rotate-90' : ''}`}
          />
          <span className="font-semibold text-[var(--color-text)] shrink-0">{title}</span>
          {stats && stats.length > 0 && (
            <span className="flex items-center gap-1.5 flex-wrap min-w-0">
              {stats.map((s, i) => (
                <StatChip key={i} tone={s.tone}>{s.label}</StatChip>
              ))}
            </span>
          )}
        </button>
        {action && <div className="shrink-0 ml-auto">{action}</div>}
      </div>
      {open && <div className="border-t border-[var(--color-border)]">{children}</div>}
    </div>
  );
}
