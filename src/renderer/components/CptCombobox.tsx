import React, { useState, useRef, useEffect, useCallback } from 'react';
import type { FeeScheduleEntry } from '../../shared/types';

interface CptComboboxProps {
  value: string;
  onChange: (code: string) => void;
  placeholder?: string;
  className?: string;
}

let cachedEntries: FeeScheduleEntry[] | null = null;

export default function CptCombobox({
  value,
  onChange,
  placeholder = 'Search CPT code or description...',
  className = '',
}: CptComboboxProps) {
  const [entries, setEntries] = useState<FeeScheduleEntry[]>(cachedEntries || []);
  const [query, setQuery] = useState(value);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load fee schedule once
  useEffect(() => {
    if (cachedEntries) return;
    window.api.feeSchedule.list().then((data: FeeScheduleEntry[]) => {
      const active = data.filter(e => !e.deleted_at);
      cachedEntries = active;
      setEntries(active);
    });
  }, []);

  // Sync external value changes (e.g. initial load)
  useEffect(() => {
    if (value !== query) {
      const match = entries.find(e => e.cpt_code === value);
      setQuery(match ? `${match.cpt_code} — ${match.description}` : value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, entries]);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const filtered = useCallback(() => {
    if (!query || query.length < 1) return entries.slice(0, 20);
    const q = query.toLowerCase();
    return entries
      .filter(e => e.cpt_code.toLowerCase().includes(q) || e.description.toLowerCase().includes(q))
      .slice(0, 20);
  }, [query, entries]);

  const suggestions = filtered();

  const selectEntry = (entry: FeeScheduleEntry) => {
    setQuery(`${entry.cpt_code} — ${entry.description}`);
    setShowDropdown(false);
    setHighlightIdx(-1);
    onChange(entry.cpt_code);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setShowDropdown(true);
    setHighlightIdx(-1);
    // If user clears, emit empty
    if (!val.trim()) {
      onChange('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx(prev => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx(prev => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && highlightIdx >= 0 && highlightIdx < suggestions.length) {
      e.preventDefault();
      selectEntry(suggestions[highlightIdx]);
    } else if (e.key === 'Escape') {
      setShowDropdown(false);
    }
  };

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIdx >= 0 && listRef.current) {
      const item = listRef.current.children[highlightIdx] as HTMLElement;
      if (item) item.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightIdx]);

  return (
    <div className={`relative ${className}`} ref={wrapperRef}>
      <input
        type="text"
        className="input w-full"
        placeholder={placeholder}
        value={query}
        onChange={handleInputChange}
        onFocus={() => { setShowDropdown(true); setHighlightIdx(-1); }}
        onKeyDown={handleKeyDown}
      />

      {showDropdown && suggestions.length > 0 && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-lg max-h-48 overflow-y-auto"
        >
          {suggestions.map((entry, idx) => (
            <button
              key={entry.id}
              type="button"
              className={`w-full text-left px-3 py-2 text-sm flex items-center gap-2 ${
                idx === highlightIdx ? 'bg-blue-50' : 'hover:bg-blue-50'
              }`}
              onMouseDown={(e) => { e.preventDefault(); selectEntry(entry); }}
            >
              <span className="font-mono text-xs font-medium text-blue-600 shrink-0">{entry.cpt_code}</span>
              <span className="text-[var(--color-text)] truncate">{entry.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
