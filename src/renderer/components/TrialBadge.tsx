import React from 'react';
import { Clock, AlertTriangle, Key } from 'lucide-react';
import { useTier } from '../hooks/useTier';

/**
 * Subtle trial badge shown in the sidebar during the 30-day free trial.
 * - Days 30–15: calm blue/teal styling
 * - Days 14–4: warm amber nudge
 * - Days 3–1: urgent red/orange
 * - Expired: shows activation prompt
 * Not shown for licensed users.
 */
export default function TrialBadge() {
  const { trialActive, trialExpired, trialDaysRemaining } = useTier();

  // Don't show for licensed users
  if (!trialActive && !trialExpired) return null;

  if (trialExpired) {
    return (
      <button
        onClick={() => { window.location.hash = '#/settings'; }}
        className="w-full flex items-center gap-2 px-3 py-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 hover:bg-red-100 transition-colors cursor-pointer text-left"
      >
        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
        <div className="min-w-0">
          <p className="text-xs font-semibold">Trial Expired</p>
          <p className="text-[10px] opacity-80">Activate to continue</p>
        </div>
      </button>
    );
  }

  // Active trial — pick urgency color
  let bgColor: string;
  let borderColor: string;
  let textColor: string;
  let Icon = Clock;

  if (trialDaysRemaining <= 3) {
    bgColor = 'bg-red-50';
    borderColor = 'border-red-200';
    textColor = 'text-red-700';
    Icon = AlertTriangle;
  } else if (trialDaysRemaining <= 14) {
    bgColor = 'bg-amber-50';
    borderColor = 'border-amber-200';
    textColor = 'text-amber-700';
  } else {
    bgColor = 'bg-sky-50';
    borderColor = 'border-sky-200';
    textColor = 'text-sky-700';
  }

  const dayLabel = trialDaysRemaining === 1 ? 'day' : 'days';

  return (
    <button
      onClick={() => { window.location.hash = '#/settings'; }}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg ${bgColor} border ${borderColor} ${textColor} hover:opacity-90 transition-colors cursor-pointer text-left`}
    >
      <Icon className="w-3.5 h-3.5 flex-shrink-0" />
      <div className="min-w-0">
        <p className="text-xs font-medium">
          {trialDaysRemaining} {dayLabel} left in trial
        </p>
        <p className="text-[10px] opacity-70">Click to activate</p>
      </div>
    </button>
  );
}
