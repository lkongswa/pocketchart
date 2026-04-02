import React, { useState } from 'react';
import type { GoalIssueContext } from '../../../shared/types/validation';

interface GoalPerfEditorProps {
  issueId: string;
  goals: GoalIssueContext[];
  onChange: (issueId: string, value: Record<number, string>) => void;
}

export function GoalPerfEditor({ issueId, goals, onChange }: GoalPerfEditorProps) {
  const [perfData, setPerfData] = useState<Record<number, string>>({});

  const updatePerf = (goalId: number, text: string) => {
    const next = { ...perfData, [goalId]: text };
    setPerfData(next);
    onChange(issueId, next);
  };

  return (
    <div className="mt-2 mb-1 space-y-3">
      {goals.map(goal => (
        <div key={goal.goalId}>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 font-medium shrink-0">
              {goal.goalType}
            </span>
            <span className="text-xs text-[var(--color-text)] truncate" title={goal.goalText}>
              {goal.goalText}
            </span>
          </div>
          <textarea
            className="w-full text-sm px-3 py-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y"
            rows={2}
            placeholder="Enter performance data..."
            value={perfData[goal.goalId] || ''}
            onChange={(e) => updatePerf(goal.goalId, e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}
