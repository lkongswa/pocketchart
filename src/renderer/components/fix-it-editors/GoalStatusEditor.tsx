import React, { useState } from 'react';
import type { GoalIssueContext } from '../../../shared/types/validation';

interface GoalStatusEditorProps {
  issueId: string;
  goals: GoalIssueContext[];
  onChange: (issueId: string, value: Record<number, string>) => void;
}

const STATUS_OPTIONS = [
  { value: 'progressing', label: 'Progressing' },
  { value: 'met', label: 'Met' },
  { value: 'regressed', label: 'Regressed' },
  { value: 'plateau', label: 'Plateau' },
  { value: 'discontinued', label: 'Discontinued' },
  { value: 'modified', label: 'Modified' },
];

export function GoalStatusEditor({ issueId, goals, onChange }: GoalStatusEditorProps) {
  const [statuses, setStatuses] = useState<Record<number, string>>({});

  const updateStatus = (goalId: number, status: string) => {
    const next = { ...statuses, [goalId]: status };
    setStatuses(next);
    onChange(issueId, next);
  };

  return (
    <div className="mt-2 mb-1 space-y-2">
      {goals.map(goal => (
        <div key={goal.goalId} className="flex items-center gap-3">
          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 font-medium shrink-0">
            {goal.goalType}
          </span>
          <span className="text-xs text-[var(--color-text)] flex-1 truncate" title={goal.goalText}>
            {goal.goalText}
          </span>
          <select
            className="text-xs px-2 py-1 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-blue-400 w-36 shrink-0"
            value={statuses[goal.goalId] || ''}
            onChange={(e) => updateStatus(goal.goalId, e.target.value)}
          >
            <option value="">Set status...</option>
            {STATUS_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      ))}
    </div>
  );
}
