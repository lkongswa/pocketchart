import React, { useState, useEffect } from 'react';

interface FreqDurationEditorProps {
  issueId: string;
  currentValue: string;
  onChange: (issueId: string, value: string) => void;
}

export function FreqDurationEditor({ issueId, currentValue, onChange }: FreqDurationEditorProps) {
  const [freq, setFreq] = useState<number>(0);
  const [dur, setDur] = useState<number>(0);

  useEffect(() => {
    if (freq > 0 && dur > 0) {
      onChange(issueId, `${freq}x/week for ${dur} weeks`);
    } else if (freq > 0) {
      onChange(issueId, `${freq}x/week`);
    }
  }, [freq, dur]);

  return (
    <div className="mt-2 mb-1 flex items-center gap-3">
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          className="text-sm px-2 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-blue-400 w-16 text-center"
          min="1"
          max="7"
          value={freq || ''}
          onChange={(e) => setFreq(parseInt(e.target.value) || 0)}
          placeholder="#"
        />
        <span className="text-sm text-[var(--color-text-secondary)]">x/week for</span>
      </div>
      <div className="flex items-center gap-1.5">
        <input
          type="number"
          className="text-sm px-2 py-1.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-blue-400 w-16 text-center"
          min="1"
          max="52"
          value={dur || ''}
          onChange={(e) => setDur(parseInt(e.target.value) || 0)}
          placeholder="#"
        />
        <span className="text-sm text-[var(--color-text-secondary)]">weeks</span>
      </div>
    </div>
  );
}
