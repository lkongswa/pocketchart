import React, { useState } from 'react';

interface DateEditorProps {
  issueId: string;
  currentValue: string;
  hint?: string;
  onChange: (issueId: string, value: string) => void;
}

export function DateEditor({ issueId, currentValue, hint, onChange }: DateEditorProps) {
  const [value, setValue] = useState(currentValue);

  return (
    <div className="mt-2 mb-1">
      <input
        type="date"
        className="text-sm px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-blue-400 w-48"
        value={value}
        onChange={(e) => { setValue(e.target.value); onChange(issueId, e.target.value); }}
      />
      {hint && <p className="text-xs text-[var(--color-text-tertiary)] mt-1">{hint}</p>}
    </div>
  );
}
