import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Plus } from 'lucide-react';
import type { Physician } from '../../shared/types';

interface PhysicianComboboxProps {
  value: string; // physician name displayed in input
  physicianId?: number | null;
  onChange: (physician: Physician | null, name: string) => void;
  onNewPhysician?: (name: string) => void;
  placeholder?: string;
  className?: string;
}

let cachedPhysicians: Physician[] | null = null;

export default function PhysicianCombobox({
  value,
  physicianId,
  onChange,
  onNewPhysician,
  placeholder = 'Search physician name, NPI, or clinic...',
  className = '',
}: PhysicianComboboxProps) {
  const [entries, setEntries] = useState<Physician[]>(cachedPhysicians || []);
  const [query, setQuery] = useState(value);
  const [showDropdown, setShowDropdown] = useState(false);
  const [highlightIdx, setHighlightIdx] = useState(-1);
  const wrapperRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Load physicians once
  useEffect(() => {
    if (cachedPhysicians) return;
    window.api.physicians.list().then((data: Physician[]) => {
      cachedPhysicians = data;
      setEntries(data);
    });
  }, []);

  // Sync external value changes
  useEffect(() => {
    if (value !== query) {
      setQuery(value);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

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
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.clinic_name.toLowerCase().includes(q) ||
          p.npi.toLowerCase().includes(q) ||
          p.specialty.toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [query, entries]);

  const suggestions = filtered();
  const hasExactMatch = suggestions.some(
    (p) => p.name.toLowerCase() === query?.toLowerCase()
  );

  const selectPhysician = (physician: Physician) => {
    setQuery(physician.name);
    setShowDropdown(false);
    setHighlightIdx(-1);
    onChange(physician, physician.name);
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setShowDropdown(true);
    setHighlightIdx(-1);
    // Always propagate the typed value so parent stays in sync
    onChange(null, val);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightIdx((prev) => Math.min(prev + 1, suggestions.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightIdx((prev) => Math.max(prev - 1, 0));
    } else if (e.key === 'Enter' && highlightIdx >= 0 && highlightIdx < suggestions.length) {
      e.preventDefault();
      selectPhysician(suggestions[highlightIdx]);
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

  // Invalidate cache when directory modal creates a physician
  useEffect(() => {
    const handler = () => {
      cachedPhysicians = null;
      window.api.physicians.list().then((data: Physician[]) => {
        cachedPhysicians = data;
        setEntries(data);
      });
    };
    window.addEventListener('physicians-updated', handler);
    return () => window.removeEventListener('physicians-updated', handler);
  }, []);

  return (
    <div className={`relative ${className}`} ref={wrapperRef}>
      <input
        type="text"
        className="input w-full"
        placeholder={placeholder}
        value={query}
        onChange={handleInputChange}
        onFocus={() => {
          setShowDropdown(true);
          setHighlightIdx(-1);
        }}
        onKeyDown={handleKeyDown}
      />

      {showDropdown && (suggestions.length > 0 || (query && query.length > 1 && !hasExactMatch)) && (
        <div
          ref={listRef}
          className="absolute z-50 mt-1 w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-lg max-h-56 overflow-y-auto"
        >
          {suggestions.map((physician, idx) => (
            <button
              key={physician.id}
              type="button"
              className={`w-full text-left px-3 py-2 text-sm ${
                idx === highlightIdx ? 'bg-blue-50' : 'hover:bg-blue-50'
              }`}
              onMouseDown={(e) => {
                e.preventDefault();
                selectPhysician(physician);
              }}
            >
              <div className="flex items-center gap-2">
                <span className="font-medium text-[var(--color-text)]">{physician.name}</span>
                {physician.specialty && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-600 font-medium">
                    {physician.specialty}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-3 text-xs text-[var(--color-text-secondary)] mt-0.5">
                {physician.clinic_name && <span>{physician.clinic_name}</span>}
                {physician.fax_number && <span>Fax: {physician.fax_number}</span>}
                {physician.npi && <span>NPI: {physician.npi}</span>}
              </div>
            </button>
          ))}

          {query && query.length > 1 && !hasExactMatch && onNewPhysician && (
            <button
              type="button"
              className="w-full text-left px-3 py-2 text-sm border-t border-[var(--color-border)] text-blue-600 hover:bg-blue-50 flex items-center gap-2"
              onMouseDown={(e) => {
                e.preventDefault();
                setShowDropdown(false);
                onNewPhysician(query);
              }}
            >
              <Plus size={14} />
              <span>Add &quot;{query}&quot; to Physician Directory</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
