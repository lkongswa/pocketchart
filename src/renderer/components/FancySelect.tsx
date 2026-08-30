import React, { useEffect, useRef, useState } from 'react';

export interface FancySelectOption {
  value: string;
  label: string;
}

interface FancySelectProps {
  value: string;
  onChange: (value: string) => void;
  options: FancySelectOption[];
  className?: string;
  disabled?: boolean;
}

/**
 * FancySelect — in-page replacement for native <select>.
 *
 * Native select popups are drawn by the OS at 100% scale, so when the window
 * is zoomed (PocketChart defaults to zoom level -2) they render oversized and
 * mispositioned. This component draws its own listbox inside the page, so it
 * zooms and positions with the rest of the UI.
 */
export default function FancySelect({
  value,
  onChange,
  options,
  className = '',
  disabled,
}: FancySelectProps) {
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(-1);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const selected = options.find((o) => o.value === value);

  // Close on click outside
  useEffect(() => {
    if (!open) return;
    const handleMouseDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleMouseDown);
    return () => document.removeEventListener('mousedown', handleMouseDown);
  }, [open]);

  // On open, highlight the current value
  useEffect(() => {
    if (open) setHighlight(options.findIndex((o) => o.value === value));
  }, [open, options, value]);

  // Keep the highlighted option scrolled into view
  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector('[data-highlighted="true"]')
      ?.scrollIntoView({ block: 'nearest' });
  }, [highlight, open]);

  const commit = (idx: number) => {
    const opt = options[idx];
    if (opt) onChange(opt.value);
    setOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (open && highlight >= 0) commit(highlight);
      else setOpen(true);
    } else if (e.key === 'Escape') {
      setOpen(false);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) setOpen(true);
      else setHighlight((h) => Math.min(h + 1, options.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (!open) setOpen(true);
      else setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        className={`select text-left ${className}`}
        disabled={disabled}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={handleKeyDown}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        {selected ? selected.label : ' '}
      </button>
      {open && (
        <div
          ref={listRef}
          role="listbox"
          className="absolute z-50 mt-1 left-0 right-0 max-h-56 overflow-y-auto rounded-lg border border-[var(--color-border)] bg-white shadow-xl py-1"
        >
          {options.map((opt, idx) => (
            <div
              key={opt.value || `opt-${idx}`}
              role="option"
              aria-selected={opt.value === value}
              data-highlighted={idx === highlight ? 'true' : 'false'}
              className={`px-3 py-1.5 text-sm cursor-pointer ${
                idx === highlight
                  ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                  : 'text-[var(--color-text)]'
              } ${opt.value === value ? 'font-semibold' : ''}`}
              onMouseEnter={() => setHighlight(idx)}
              onMouseDown={(e) => {
                e.preventDefault();
                commit(idx);
              }}
            >
              {opt.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
