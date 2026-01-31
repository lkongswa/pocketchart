import React from 'react';
import { ChevronLeft, ChevronRight, Search, Plus } from 'lucide-react';

interface CalendarToolbarProps {
  currentView: 'day' | 'week' | 'month';
  onViewChange: (view: 'day' | 'week' | 'month') => void;
  currentDate: Date;
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
  dateLabel: string;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onAddAppointment: () => void;
}

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
  dateLabel,
  searchQuery,
  onSearchChange,
  onAddAppointment,
}: CalendarToolbarProps) {
  return (
    <div className="flex items-center justify-between mb-4">
      {/* Left: Navigation */}
      <div className="flex items-center gap-2">
        <button
          className="btn-secondary"
          onClick={() => onNavigate('prev')}
          aria-label="Previous"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <button
          className="btn-secondary"
          onClick={() => onNavigate('next')}
          aria-label="Next"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <button
          className="btn-ghost text-sm font-medium"
          onClick={() => onNavigate('today')}
        >
          Today
        </button>
      </div>

      {/* Center: Date Label */}
      <span className="text-lg font-semibold text-[var(--color-text)]">
        {dateLabel}
      </span>

      {/* Right: View toggle, Search, Add */}
      <div className="flex items-center gap-3">
        {/* View Toggle Group */}
        <div className="inline-flex">
          {VIEW_OPTIONS.map((opt, idx) => {
            const isActive = currentView === opt.value;
            const isFirst = idx === 0;
            const isLast = idx === VIEW_OPTIONS.length - 1;

            return (
              <button
                key={opt.value}
                onClick={() => onViewChange(opt.value)}
                className={`px-3 py-1.5 text-sm font-medium transition-colors duration-150 cursor-pointer ${
                  isFirst ? 'rounded-l-lg' : ''
                } ${isLast ? 'rounded-r-lg' : ''} ${
                  isActive
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'bg-white text-[var(--color-text)] border border-[var(--color-border)] hover:bg-gray-50'
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-secondary)] pointer-events-none" />
          <input
            type="text"
            className="input pl-8"
            style={{ width: 200 }}
            placeholder="Search appointments..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        {/* Add Appointment */}
        <button className="btn-primary" onClick={onAddAppointment}>
          <Plus className="w-4 h-4 mr-2" />
          Add Appointment
        </button>
      </div>
    </div>
  );
}
