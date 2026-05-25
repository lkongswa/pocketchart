import React, { useEffect, useRef, useState } from 'react';
import { X, ChevronDown, Search, ExternalLink, Loader2 } from 'lucide-react';
import type { Client } from '../../../shared/types';

interface QuickCreatePopoverProps {
  /** Viewport position to anchor the popover to. The popover flips above / left as needed. */
  anchor: { x: number; y: number };
  /** Pre-filled date in "YYYY-MM-DD". */
  date: string;
  /** Pre-filled time in "HH:MM". */
  time: string;
  /** Pre-filled duration in minutes. */
  duration: number;
  /** Called with the picked client + final duration on Save. The caller does the IPC create. */
  onSave: (data: { clientId: number; duration: number; clientName: string }) => Promise<void>;
  /** Called when the user wants the full appointment modal instead (with current values preserved). */
  onMoreOptions: (data: { clientId: number | null; duration: number; clientName: string }) => void;
  onClose: () => void;
}

const POPOVER_WIDTH = 280;
const POPOVER_MAX_HEIGHT = 360;

const DURATION_PRESETS = [15, 30, 45, 60, 75, 90, 120];

/** "HH:MM" → "9:00a" / "9:30a" / "12p" / "3:45p" */
function formatTime12(time24: string): string {
  const [hStr, mStr] = time24.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const suffix = h >= 12 ? 'p' : 'a';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${mStr}${suffix}`;
}

/** Add duration minutes to a "HH:MM" start, return the formatted end label. */
function endLabel(time24: string, durationMin: number): string {
  const [hStr, mStr] = time24.split(':');
  const total = parseInt(hStr, 10) * 60 + parseInt(mStr, 10) + durationMin;
  const eh = Math.floor(total / 60) % 24;
  const em = total % 60;
  return formatTime12(`${eh.toString().padStart(2, '0')}:${em.toString().padStart(2, '0')}`);
}

export default function QuickCreatePopover({
  anchor,
  date,
  time,
  duration: initialDuration,
  onSave,
  onMoreOptions,
  onClose,
}: QuickCreatePopoverProps) {
  const [search, setSearch] = useState('');
  const [results, setResults] = useState<Client[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<Client | null>(null);
  const [duration, setDuration] = useState(initialDuration);
  const [saving, setSaving] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Autofocus the search input — the whole point of this popover is "start typing".
  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  // Debounced client search. Empty query shows recent / active clients (top ~8).
  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const clients = await window.api.clients.list({
          status: 'active',
          search: search.trim() || undefined,
        });
        if (!cancelled) {
          setResults(clients.slice(0, 8));
          setHighlightedIdx(0);
        }
      } catch (err) {
        console.error('Quick-create client search failed:', err);
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search]);

  // Close on outside click.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    // setTimeout so the click that OPENED the popover doesn't immediately close it.
    const tid = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => {
      clearTimeout(tid);
      document.removeEventListener('mousedown', handler);
    };
  }, [onClose]);

  const handleSave = async () => {
    if (!selected || saving) return;
    setSaving(true);
    try {
      const clientName = `${selected.first_name || ''} ${selected.last_name || ''}`.trim() || 'Client';
      await onSave({ clientId: selected.id, duration, clientName });
      onClose();
    } catch (err) {
      console.error('Quick-create save failed:', err);
      setSaving(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIdx((i) => Math.min(i + 1, results.length - 1));
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIdx((i) => Math.max(i - 1, 0));
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      if (selected) {
        handleSave();
      } else if (results[highlightedIdx]) {
        setSelected(results[highlightedIdx]);
      }
      return;
    }
  };

  // Position: flip leftwards if too close to right edge, flip up if too close to bottom.
  // We measure against the viewport using window.innerWidth/Height.
  const flipLeft = anchor.x + POPOVER_WIDTH + 16 > window.innerWidth;
  const flipUp = anchor.y + POPOVER_MAX_HEIGHT + 16 > window.innerHeight;
  const left = flipLeft ? Math.max(8, anchor.x - POPOVER_WIDTH - 8) : anchor.x + 8;
  const top = flipUp ? Math.max(8, anchor.y - POPOVER_MAX_HEIGHT - 8) : anchor.y + 8;

  const startLabel = formatTime12(time);
  const finish = endLabel(time, duration);

  return (
    <div
      ref={popoverRef}
      className="fixed z-50 bg-white rounded-lg shadow-xl border border-[var(--color-border)] p-3 animate-in fade-in zoom-in-95 duration-100"
      style={{ left, top, width: POPOVER_WIDTH }}
      onKeyDown={handleKeyDown}
    >
      {/* Header: time range + close */}
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs text-[var(--color-text-secondary)]">
          <span className="font-medium text-[var(--color-text)]">{startLabel} → {finish}</span>
          <span className="mx-1.5">·</span>
          <span>{date}</span>
        </div>
        <button
          className="p-0.5 rounded hover:bg-gray-100 text-[var(--color-text-secondary)]"
          onClick={onClose}
          title="Close (Esc)"
        >
          <X size={13} />
        </button>
      </div>

      {/* Selected client chip OR search */}
      {selected ? (
        <button
          className="w-full flex items-center justify-between px-2.5 py-1.5 mb-2 bg-teal-50 border border-teal-200 rounded-md text-sm text-teal-900 hover:bg-teal-100 transition-colors"
          onClick={() => {
            setSelected(null);
            setSearch('');
            setTimeout(() => searchInputRef.current?.focus(), 0);
          }}
          title="Change client"
        >
          <span className="truncate">
            {selected.first_name} {selected.last_name}
          </span>
          <X size={12} className="flex-shrink-0 opacity-60" />
        </button>
      ) : (
        <div className="relative mb-2">
          <Search size={13} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)] pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            className="w-full pl-7 pr-2 py-1.5 text-sm border border-[var(--color-border)] rounded-md focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400/30"
            placeholder="Type a client name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {/* Results list (only when nothing selected yet) */}
      {!selected && (
        <div className="max-h-44 overflow-y-auto mb-2 -mx-1">
          {searching ? (
            <div className="flex items-center justify-center py-4 text-xs text-[var(--color-text-secondary)]">
              <Loader2 size={12} className="animate-spin mr-1.5" /> Searching...
            </div>
          ) : results.length === 0 ? (
            <div className="text-center py-3 text-xs text-[var(--color-text-secondary)]">
              {search.trim() ? 'No matching clients' : 'Start typing to search'}
            </div>
          ) : (
            results.map((c, idx) => (
              <button
                key={c.id}
                className={`w-full text-left px-2 py-1.5 text-sm rounded-md transition-colors ${
                  idx === highlightedIdx ? 'bg-teal-50 text-teal-900' : 'hover:bg-gray-50 text-[var(--color-text)]'
                }`}
                onMouseEnter={() => setHighlightedIdx(idx)}
                onClick={() => setSelected(c)}
              >
                <div className="truncate font-medium">{c.first_name} {c.last_name}</div>
                {c.discipline && (
                  <div className="text-[10px] text-[var(--color-text-secondary)] uppercase tracking-wide">{c.discipline}</div>
                )}
              </button>
            ))
          )}
        </div>
      )}

      {/* Duration row */}
      <div className="flex items-center gap-2 mb-3">
        <label className="text-xs text-[var(--color-text-secondary)]">Duration</label>
        <select
          className="flex-1 text-xs border border-[var(--color-border)] rounded-md px-2 py-1 focus:outline-none focus:border-teal-400"
          value={duration}
          onChange={(e) => setDuration(parseInt(e.target.value, 10))}
        >
          {DURATION_PRESETS.map((d) => (
            <option key={d} value={d}>{d < 60 ? `${d} min` : d % 60 === 0 ? `${d / 60}h` : `${Math.floor(d / 60)}h ${d % 60}m`}</option>
          ))}
        </select>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2">
        <button
          className="flex-1 px-3 py-1.5 bg-teal-500 text-white text-sm font-medium rounded-md hover:bg-teal-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={!selected || saving}
          onClick={handleSave}
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
        <button
          className="px-2 py-1.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text)] flex items-center gap-1"
          onClick={() => {
            const clientName = selected ? `${selected.first_name || ''} ${selected.last_name || ''}`.trim() : '';
            onMoreOptions({ clientId: selected?.id ?? null, duration, clientName });
          }}
          title="Open full appointment form"
        >
          More <ChevronDown size={12} />
        </button>
      </div>

      <p className="mt-2 text-[10px] text-[var(--color-text-secondary)] text-center">
        ↵ to save · Esc to cancel · <span className="inline-flex items-center gap-0.5">More <ExternalLink size={9} /></span> for full options
      </p>
    </div>
  );
}
