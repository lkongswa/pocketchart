import React, { useState } from 'react';

interface TextareaEditorProps {
  issueId: string;
  currentValue: string;
  placeholder?: string;
  hint?: string;
  rows?: number;
  onChange: (issueId: string, value: string) => void;
}

export function TextareaEditor({ issueId, currentValue, placeholder, hint, rows = 3, onChange }: TextareaEditorProps) {
  const [value, setValue] = useState(currentValue);

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setValue(e.target.value);
    onChange(issueId, e.target.value);
  };

  return (
    <div className="mt-2 mb-1">
      <textarea
        className="w-full text-sm px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y"
        rows={rows}
        placeholder={placeholder}
        value={value}
        onChange={handleChange}
        autoFocus={!currentValue}
      />
      {hint && <p className="text-xs text-[var(--color-text-tertiary)] mt-1">{hint}</p>}
    </div>
  );
}
