import React from 'react';
import { ChevronLeft, ChevronRight, Search, Plus, DollarSign } from 'lucide-react';

interface CalendarToolbarProps {
  currentView: 'day' | 'week' | 'month';
  onViewChange: (view: 'day' | 'week' | 'month') => void;
  currentDate: Date;
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
  dateLabel: string;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  onAddAppointment: () => void;
  showBilling?: boolean;
  onToggleBilling?: (show: boolean) => void;
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
  showBilling,
  onToggleBilling,
}: CalendarToolbarProps) {
  return (
    <div className="flex items-center gap-3 mb-4">
      {/* ── Left cluster: nav + today + date heading ── */}
      <div className="flex items-center gap-2 min-w-0 flex-1">
        {/* Prev/next: paired icon buttons in a single rounded container */}
        <div className="flex items-center border border-[var(--color-border)] rounded-lg overflow-hidden">
          <button
            className="p-1.5 hover:bg-gray-100 text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
            onClick={() => onNavigate('prev')}
            aria-label="Previous period"
            title="Previous (← or J)"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          <div className="w-px h-5 bg-[var(--color-border)]" />
          <button
            className="p-1.5 hover:bg-gray-100 text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
            onClick={() => onNavigate('next')}
            aria-label="Next period"
            title="Next (→ or K)"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Today: outlined pill, clearly clickable */}
        <button
          className="px-3 py-1.5 text-sm font-medium border border-[var(--color-border)] rounded-lg text-[var(--color-text)] hover:bg-gray-50 transition-colors"
          onClick={() => onNavigate('today')}
          title="Jump to today (T)"
        >
          Today
        </button>

        {/* Date heading — large, single line, truncates only if no other choice */}
        <h2 className="text-xl font-bold text-[var(--color-text)] ml-2 truncate whitespace-nowrap">
          {dateLabel}
        </h2>
      </div>

      {/* ── Right cluster: view toggle + billing + search + add ── */}
      <div className="flex items-center gap-2 flex-shrink-0">
        {/* View toggle — segmented control on a gray track (Google-style) */}
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

        {/* Billing toggle — icon-only, subtle */}
        {onToggleBilling && (
          <button
            className={`p-1.5 rounded-lg transition-colors ${
              showBilling
                ? 'bg-emerald-100 text-emerald-700'
                : 'text-[var(--color-text-secondary)] hover:bg-gray-100 hover:text-[var(--color-text)]'
            }`}
            onClick={() => onToggleBilling(!showBilling)}
            title={showBilling ? 'Hide payment badges' : 'Show payment badges'}
          >
            <DollarSign size={15} />
          </button>
        )}

        {/* Search — narrower than before so the toolbar breathes */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--color-text-secondary)] pointer-events-none" />
          <input
            type="text"
            className="input pl-8 text-sm py-1.5"
            style={{ width: 180 }}
            placeholder="Search..."
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
          />
        </div>

        {/* Add — compact label so the toolbar doesn't get pushed around */}
        <button
          className="btn-primary text-sm py-1.5 px-3 whitespace-nowrap"
          onClick={onAddAppointment}
          title="New appointment (N)"
        >
          <Plus className="w-4 h-4 mr-1" />
          New
        </button>
      </div>
    </div>
  );
}
