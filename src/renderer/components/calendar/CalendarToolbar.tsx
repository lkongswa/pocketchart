import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface CalendarToolbarProps {
  currentView: 'day' | 'week' | 'month';
  onViewChange: (view: 'day' | 'week' | 'month') => void;
  currentDate: Date;
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
  month: number; // 0–11
  onMonthChange: (month: number) => void;
  year: number;
  onYearChange: (year: number) => void;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const VIEW_OPTIONS: Array<{ value: 'day' | 'week' | 'month'; label: string }> = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

export default function CalendarToolbar({
  currentView,
  onViewChange,
  currentDate,
  onNavigate,
  month,
  onMonthChange,
  year,
  onYearChange,
}: CalendarToolbarProps) {
  // Year options: a generous window around the current calendar year.
  const nowYear = new Date().getFullYear();
  const years: number[] = [];
  for (let y = nowYear - 6; y <= nowYear + 3; y++) years.push(y);
  if (!years.includes(year)) years.push(year);
  years.sort((a, b) => a - b);

  const navButtonClass =
    'p-2 border border-gray-300 rounded-lg bg-white text-[var(--color-text)] hover:bg-gray-100 shadow-sm transition-colors';

  return (
    <div className="mb-4 bg-white border border-gray-300 rounded-xl px-3 py-2 shadow-sm space-y-2">
      {/* ── Top row: view switcher (left) · Today (center) · billing/search/add (right) ── */}
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        <div className="flex items-center justify-start">
          <div className="inline-flex bg-gray-100 rounded-lg p-0.5">
            {VIEW_OPTIONS.map((opt) => {
              const isActive = currentView === opt.value;
              return (
                <button
                  key={opt.value}
                  onClick={() => onViewChange(opt.value)}
                  className={`px-3 py-1 text-sm font-medium rounded-md transition-all duration-150 ${
                    isActive
                      ? 'bg-white text-[var(--color-text)] shadow-sm'
                      : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Today: outlined pill, clearly clickable */}
        <button
          className="px-3 py-1.5 text-sm font-medium border border-[var(--color-border)] rounded-lg text-[var(--color-text)] hover:bg-gray-50 transition-colors justify-self-center"
          onClick={() => onNavigate('today')}
          title="Jump to today (T)"
        >
          Today
        </button>

        {/* Right cell: empty spacer — search lives above the task panel now,
            and new appointments are created directly on the grid (click / right-click / N). */}
        <div />
      </div>

      {/* ── Bottom row: ‹ [Month ▾] [Year ▾] › centered — the calendar's "where am I".
          The dropdowns read as always-visible teal pills; the arrows get breathing room. ── */}
      <div className="flex items-center justify-center gap-3">
        <button
          className={`${navButtonClass} mr-4`}
          onClick={() => onNavigate('prev')}
          aria-label="Previous period"
          title="Previous (← or J)"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>

        <select
          className="text-xl font-bold text-[var(--color-text)] bg-white border-2 border-teal-400 rounded-full cursor-pointer px-3 py-0.5 hover:bg-teal-50 focus:outline-none focus:border-teal-500 transition-colors"
          value={month}
          onChange={(e) => onMonthChange(parseInt(e.target.value, 10))}
          title="Jump to month"
        >
          {MONTH_NAMES.map((name, i) => (
            <option key={name} value={i}>{name}</option>
          ))}
        </select>

        <select
          className="text-xl font-bold text-[var(--color-text)] bg-white border-2 border-teal-400 rounded-full cursor-pointer px-3 py-0.5 hover:bg-teal-50 focus:outline-none focus:border-teal-500 transition-colors"
          value={year}
          onChange={(e) => onYearChange(parseInt(e.target.value, 10))}
          title="Jump to year"
        >
          {years.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>

        <button
          className={`${navButtonClass} ml-4`}
          onClick={() => onNavigate('next')}
          aria-label="Next period"
          title="Next (→ or K)"
        >
          <ChevronRight className="w-5 h-5" />
        </button>
      </div>
    </div>
  );
}
