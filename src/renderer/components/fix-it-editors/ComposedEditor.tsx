import React, { useState, useEffect } from 'react';
import type { SelectOption, ChipOption } from '../../../shared/types/validation';
import { composeRehabNarrative } from '../../../shared/types/validation';

interface ComposedEditorProps {
  issueId: string;
  currentValue: string;
  selectOptions: SelectOption[];
  chipOptions: ChipOption[];
  hint?: string;
  onChange: (issueId: string, value: any) => void;
}

export function ComposedEditor({ issueId, currentValue, selectOptions, chipOptions, hint, onChange }: ComposedEditorProps) {
  const [rating, setRating] = useState('');
  const [selectedChips, setSelectedChips] = useState<string[]>([]);

  useEffect(() => {
    const narrative = composeRehabNarrative(rating, selectedChips);
    onChange(issueId, { composed: narrative, rating, reasons: selectedChips });
  }, [rating, selectedChips]);

  const toggleChip = (chipValue: string) => {
    setSelectedChips(prev =>
      prev.includes(chipValue)
        ? prev.filter(c => c !== chipValue)
        : [...prev, chipValue]
    );
  };

  const narrative = composeRehabNarrative(rating, selectedChips);

  return (
    <div className="mt-2 mb-1 space-y-2">
      <select
        className="text-sm px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-blue-400 w-48"
        value={rating}
        onChange={(e) => setRating(e.target.value)}
      >
        <option value="">Select rating...</option>
        {selectOptions.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>

      <div className="flex flex-wrap gap-1.5">
        {chipOptions.map(chip => (
          <button
            key={chip.value}
            className={`px-2.5 py-1 text-xs rounded-full border transition-colors
              ${selectedChips.includes(chip.value)
                ? 'bg-blue-100 border-blue-300 text-blue-700'
                : 'bg-gray-50 border-gray-200 text-gray-600 hover:bg-gray-100'
              }`}
            onClick={() => toggleChip(chip.value)}
            type="button"
          >
            {chip.label}
          </button>
        ))}
      </div>

      {narrative && (
        <div className="p-2 bg-green-50 border border-green-200 rounded text-xs text-green-800 italic">
          {narrative}
        </div>
      )}

      {hint && <p className="text-xs text-[var(--color-text-tertiary)]">{hint}</p>}
    </div>
  );
}
