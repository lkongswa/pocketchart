import React, { useState, useRef, useEffect } from 'react';
import { searchICD10, type ICD10Entry } from '../../../shared/icd10Data';

interface ICD10SearchEditorProps {
  issueId: string;
  onChange: (issueId: string, value: { code: string; description: string }) => void;
}

export function ICD10SearchEditor({ issueId, onChange }: ICD10SearchEditorProps) {
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<ICD10Entry[]>([]);
  const [selected, setSelected] = useState<ICD10Entry | null>(null);
  const [showDropdown, setShowDropdown] = useState(false);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.length >= 2 && !selected) {
      const results = searchICD10(query, 8);
      setSuggestions(results);
      setShowDropdown(results.length > 0);
    } else {
      setSuggestions([]);
      setShowDropdown(false);
    }
  }, [query, selected]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setShowDropdown(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectEntry = (entry: ICD10Entry) => {
    setSelected(entry);
    setQuery(`${entry.code} — ${entry.description}`);
    setShowDropdown(false);
    onChange(issueId, { code: entry.code, description: entry.description });
  };

  const clearSelection = () => {
    setSelected(null);
    setQuery('');
    onChange(issueId, { code: '', description: '' });
  };

  return (
    <div className="mt-2 mb-1 relative" ref={wrapperRef}>
      <div className="flex items-center gap-2">
        <input
          type="text"
          className="flex-1 text-sm px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-blue-400"
          placeholder="Search ICD-10 code or description..."
          value={query}
          onChange={(e) => { setQuery(e.target.value); if (selected) setSelected(null); }}
          onFocus={() => { if (suggestions.length > 0 && !selected) setShowDropdown(true); }}
        />
        {selected && (
          <button
            type="button"
            className="text-xs text-red-500 hover:text-red-700"
            onClick={clearSelection}
          >
            Clear
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute z-10 mt-1 w-full bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-lg max-h-48 overflow-y-auto">
          {suggestions.map((entry) => (
            <button
              key={entry.code}
              type="button"
              className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50 flex items-center gap-2"
              onClick={() => selectEntry(entry)}
            >
              <span className="font-mono text-xs font-medium text-blue-600 shrink-0">{entry.code}</span>
              <span className="text-[var(--color-text)] truncate">{entry.description}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
