import React from 'react';
import { ClipboardCheck, Send, Clock, CheckCircle2, RotateCcw, Settings } from 'lucide-react';
import type { ComplianceTracking, RecertSignatureStatus } from '@shared/types';

interface RecertStepperProps {
  compliance: ComplianceTracking;
  hasEval: boolean;
  compact?: boolean;
  onAdvanceStatus: (newStatus: RecertSignatureStatus) => void;
  onClearEvalGate: () => void;
  onResetRecert: () => void;
  onEditSettings: () => void;
}

type StepKey = 'eval' | 'not_sent' | 'sent' | 'received';

interface StepDef {
  key: StepKey;
  label: string;
  icon: React.ReactNode;
}

const STEPS: StepDef[] = [
  { key: 'eval', label: 'Eval', icon: <ClipboardCheck size={12} /> },
  { key: 'not_sent', label: 'Send', icon: <Send size={12} /> },
  { key: 'sent', label: 'Awaiting', icon: <Clock size={12} /> },
  { key: 'received', label: 'Received', icon: <CheckCircle2 size={12} /> },
];

function computeCurrentStep(
  hasEval: boolean,
  evalCleared: boolean,
  signatureStatus: RecertSignatureStatus,
): number {
  // Eval step is complete if client has an eval OR user manually cleared
  const evalDone = hasEval || evalCleared;
  if (!evalDone) return 0; // stuck at eval step
  // Map signature status to step index (offset by 1 for eval step)
  const sigMap: Record<RecertSignatureStatus, number> = { not_sent: 1, sent: 2, received: 3 };
  return sigMap[signatureStatus] || 1;
}

function getStepState(stepIdx: number, currentIdx: number): 'completed' | 'current' | 'future' {
  if (stepIdx < currentIdx) return 'completed';
  if (stepIdx === currentIdx) return 'current';
  return 'future';
}

function computeTimeProgress(compliance: ComplianceTracking) {
  const lastRecert = compliance.last_recert_date ? new Date(compliance.last_recert_date) : null;
  const nextDue = compliance.next_recert_due ? new Date(compliance.next_recert_due) : null;
  if (!lastRecert || !nextDue) return { percent: 0, daysLeft: null, urgency: 'calm' as const, dueDate: nextDue };

  const now = new Date();
  const totalSpan = nextDue.getTime() - lastRecert.getTime();
  const elapsed = now.getTime() - lastRecert.getTime();
  const percent = totalSpan > 0 ? Math.min(100, Math.max(0, (elapsed / totalSpan) * 100)) : 0;
  const daysLeft = Math.ceil((nextDue.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  let urgency: 'calm' | 'approaching' | 'overdue';
  if (daysLeft <= 0) urgency = 'overdue';
  else if (daysLeft <= 14) urgency = 'approaching';
  else urgency = 'calm';

  return { percent, daysLeft, urgency, dueDate: nextDue };
}

function daysSince(dateStr: string | null): number | null {
  if (!dateStr) return null;
  const d = new Date(dateStr);
  const now = new Date();
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

const URGENCY_BAR: Record<string, string> = {
  calm: 'bg-teal-500',
  approaching: 'bg-amber-500',
  overdue: 'bg-red-500',
};

const URGENCY_TEXT: Record<string, string> = {
  calm: 'text-[var(--color-text-secondary)]',
  approaching: 'text-amber-600 font-medium',
  overdue: 'text-red-600 font-semibold',
};

export default function RecertStepper({
  compliance, hasEval, compact, onAdvanceStatus, onClearEvalGate, onResetRecert, onEditSettings,
}: RecertStepperProps) {
  const signatureStatus = compliance.recert_md_signature_status || 'not_sent';
  const evalCleared = !!compliance.recert_eval_cleared;
  const currentIdx = computeCurrentStep(hasEval, evalCleared, signatureStatus);
  const { percent, daysLeft, urgency, dueDate } = computeTimeProgress(compliance);
  const sentDaysAgo = daysSince(compliance.recert_md_signature_sent_at);

  const borderColor = urgency === 'overdue'
    ? 'border-l-red-400'
    : urgency === 'approaching'
      ? 'border-l-amber-400'
      : 'border-l-teal-400';

  const bgColor = urgency === 'overdue'
    ? 'bg-red-50/50'
    : urgency === 'approaching'
      ? 'bg-amber-50/30'
      : 'bg-teal-50/30';

  // Determine action button
  let actionLabel = '';
  let actionHandler: (() => void) | null = null;
  if (currentIdx === 0) {
    // Eval step — no primary action (user must create eval or skip)
  } else if (currentIdx === 1) {
    actionLabel = 'Mark as Sent';
    actionHandler = () => onAdvanceStatus('sent');
  } else if (currentIdx === 2) {
    actionLabel = 'Mark Received';
    actionHandler = () => onAdvanceStatus('received');
  }

  return (
    <div className={`card ${compact ? 'p-3' : 'p-4'} border-l-4 ${borderColor} ${bgColor}`}>
      {/* Header */}
      <div className="flex items-center justify-between mb-2">
        <h4 className={`${compact ? 'text-xs' : 'text-sm'} font-semibold text-[var(--color-text)] flex items-center gap-1.5`}>
          Eval / Recert
        </h4>
        <div className="flex items-center gap-1">
          <button className="btn-ghost p-1" onClick={onResetRecert} title="Reset recert date">
            <RotateCcw size={compact ? 11 : 12} />
          </button>
          <button className="btn-ghost p-1" onClick={onEditSettings} title="Settings">
            <Settings size={compact ? 11 : 12} />
          </button>
        </div>
      </div>

      {/* Stepper */}
      <div className="flex items-center px-1 mb-3">
        {STEPS.map((step, idx) => {
          const state = getStepState(idx, currentIdx);
          return (
            <React.Fragment key={step.key}>
              {idx > 0 && (
                <div className={`flex-1 h-0.5 mx-0.5 ${
                  state === 'future'
                    ? 'border-t border-dashed border-gray-300'
                    : 'bg-teal-400'
                }`} />
              )}
              <div className="flex flex-col items-center gap-0.5">
                <div className={`
                  w-6 h-6 rounded-full flex items-center justify-center transition-colors duration-200
                  ${state === 'completed'
                    ? 'bg-green-500 text-white'
                    : state === 'current'
                      ? 'bg-teal-500 text-white ring-2 ring-teal-200'
                      : 'border-2 border-dashed border-gray-300 text-gray-400'
                  }
                `}>
                  {state === 'completed'
                    ? <CheckCircle2 size={12} />
                    : step.icon
                  }
                </div>
                <span className={`text-[10px] leading-tight text-center ${
                  state === 'current'
                    ? 'text-teal-700 font-semibold'
                    : state === 'completed'
                      ? 'text-green-600'
                      : 'text-gray-400'
                }`}>
                  {step.label}
                </span>
              </div>
            </React.Fragment>
          );
        })}
      </div>

      {/* Context: eval needed */}
      {currentIdx === 0 && (
        <div className="mb-2 px-1">
          <p className="text-[10px] text-[var(--color-text-secondary)] mb-1.5">
            Complete an initial evaluation to begin the recertification cycle.
          </p>
          <button
            className="text-[10px] text-teal-600 hover:text-teal-700 font-medium hover:underline"
            onClick={onClearEvalGate}
          >
            Skip this step
          </button>
        </div>
      )}

      {/* Context: sent X days ago */}
      {currentIdx === 2 && sentDaysAgo !== null && (
        <p className="text-[10px] text-[var(--color-text-secondary)] mb-2 px-1">
          Sent {sentDaysAgo === 0 ? 'today' : `${sentDaysAgo} day${sentDaysAgo !== 1 ? 's' : ''} ago`}
        </p>
      )}

      {/* Time progress bar + due date */}
      {daysLeft !== null && dueDate && currentIdx > 0 && (
        <div className="mb-2 px-1">
          <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden mb-1">
            <div
              className={`h-full rounded-full transition-all ${URGENCY_BAR[urgency]}`}
              style={{ width: `${Math.min(100, percent)}%` }}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className={`text-[10px] ${URGENCY_TEXT[urgency]}`}>
              {daysLeft <= 0 ? 'OVERDUE' : `Due in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}`}
            </span>
            <span className="text-[10px] text-[var(--color-text-secondary)]">
              {dueDate.toLocaleDateString()}
            </span>
          </div>
        </div>
      )}

      {/* Action button */}
      {actionLabel && actionHandler && (
        <button
          className="btn-secondary btn-sm text-xs w-full"
          onClick={actionHandler}
        >
          {actionLabel}
        </button>
      )}

      {/* All complete indicator */}
      {currentIdx === 3 && (
        <p className="text-[10px] text-green-600 font-medium text-center px-1">
          MD signature received
        </p>
      )}
    </div>
  );
}
