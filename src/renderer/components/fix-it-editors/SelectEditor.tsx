import React, { useState } from 'react';
import type { SelectOption } from '../../../shared/types/validation';

interface SelectEditorProps {
  issueId: string;
  currentValue: string;
  options: SelectOption[];
  placeholder?: string;
  onChange: (issueId: string, value: string) => void;
}

export function SelectEditor({ issueId, currentValue, options, placeholder, onChange }: SelectEditorProps) {
  const [value, setValue] = useState(currentValue);

  return (
    <div className="mt-2 mb-1">
      <select
        className="text-sm px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-blue-400 w-full max-w-xs"
        value={value}
        onChange={(e) => { setValue(e.target.value); onChange(issueId, e.target.value); }}
      >
        <option value="">{placeholder || 'Select...'}</option>
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}
