import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, ChevronRight, RotateCcw, Shield, X, ChevronDown } from 'lucide-react';
import type { Appointment, ComplianceTracking } from '@shared/types';

/**
 * CertHeatmap — the redesigned client chart's right-column (30%) appointments view.
 * Tiny month grids over the cert quarter: green = visit, cream = within cert,
 * gray = after cert; cert-start + today ringed. Day-click on a visit opens its
 * linked note/eval (Q-B: heatmap-only, no list); day-click on an EMPTY day opens
 * a small quick-add popover (time + duration) that schedules an appointment for
 * this client on that day. A "Docs due" line carries the progress-report
 * controls (reset counter + click-to-edit visits-since-last).
 */

interface CertHeatmapProps {
  clientId: number;
  appointments: Appointment[];
  compliance: ComplianceTracking | null;
  onOpenAppt: (appt: Appointment) => void;
  onComplianceChanged: () => void;
  /** Refresh callback fired after a quick-add appointment is created. */
  onAppointmentChanged: () => void;
  /** Escalate to the full appointment modal (recurring, eval/recert, contract, …), carrying over the popover's date/time/duration. */
  onMoreOptions: (date: string, time: string, duration: number) => void;
}

const parseDate = (s?: string | null) => {
  if (!s) return null;
  const d = new Date(s + 'T00:00:00');
  return isNaN(d.getTime()) ? null : d;
};
const sameDay = (a: Date, b: Date) =>
  a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
const keyOf = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

export default function CertHeatmap({ clientId, appointments, compliance, onOpenAppt, onComplianceChanged, onAppointmentChanged, onMoreOptions }: CertHeatmapProps) {
  const certStart = parseDate(compliance?.last_recert_date);
  const certEnd = parseDate(compliance?.next_recert_due);
  const today = new Date();

  const [monthOffset, setMonthOffset] = useState(0);
  const [editingCount, setEditingCount] = useState(false);
  const [countInput, setCountInput] = useState('');
  // Quick-add popover anchored to a clicked empty day. x/y are viewport coords.
  const [quickAdd, setQuickAdd] = useState<{ date: string; x: number; y: number } | null>(null);

  // non-cancelled appointment per day
  const apptByDate = new Map<string, Appointment>();
  for (const a of appointments) {
    if (a.status === 'cancelled') continue;
    if (!apptByDate.has(a.scheduled_date)) apptByDate.set(a.scheduled_date, a);
  }

  // distinct visit weekdays within cert → "N×/wk"
  const visitDows = new Set<number>();
  for (const a of appointments) {
    if (a.status === 'cancelled') continue;
    const d = parseDate(a.scheduled_date);
    if (!d) continue;
    if (certStart && certEnd && (d < certStart || d > certEnd)) continue;
    visitDows.add(d.getDay());
  }
  const perWeek = visitDows.size;

  const anchor = certStart || new Date(today.getFullYear(), today.getMonth(), 1);
  const months = [0, 1, 2].map((i) => {
    const m = new Date(anchor.getFullYear(), anchor.getMonth() + monthOffset + i, 1);
    return { y: m.getFullYear(), m: m.getMonth() };
  });

  const certDaysLeft = certEnd ? Math.ceil((certEnd.getTime() - today.getTime()) / 86_400_000) : null;
  const progressThreshold = compliance?.progress_visit_threshold ?? 0;
  const progressDone = compliance?.visits_since_last_progress ?? 0;
  const progressRemaining =
    compliance?.tracking_enabled && progressThreshold > 0 ? Math.max(0, progressThreshold - progressDone) : null;

  const commitCount = () => {
    setEditingCount(false);
    const n = parseInt(countInput, 10);
    if (isNaN(n) || n < 0 || n === progressDone) return;
    window.api.compliance.setVisitCount(clientId, n).then(onComplianceChanged).catch(console.error);
  };
  const resetProgress = () => {
    if (!window.confirm('Reset progress note visit counter to 0? Typically done after writing a progress report.')) return;
    window.api.compliance.resetProgressCounter(clientId).then(onComplianceChanged).catch(console.error);
  };

  const buildMonth = (y: number, m: number) => {
    const first = new Date(y, m, 1);
    const dim = new Date(y, m + 1, 0).getDate();
    const cells: React.ReactNode[] = [];
    for (let i = 0; i < first.getDay(); i++) cells.push(<div key={`b${i}`} className="w-[21px] h-[21px]" />);
    for (let d = 1; d <= dim; d++) {
      const date = new Date(y, m, d);
      const inCert = !!(certStart && certEnd && date >= certStart && date <= certEnd);
      const afterCert = !!(certEnd && date > certEnd);
      const appt = apptByDate.get(keyOf(date));
      const isVisit = !!appt;

      let bg = 'bg-slate-100';
      let txt = 'text-slate-400';
      let style: React.CSSProperties | undefined;
      if (isVisit) { bg = 'bg-emerald-300'; txt = 'text-emerald-900 font-semibold'; }
      else if (inCert) { bg = ''; txt = 'text-amber-800/70'; style = { background: '#fdf6e7' }; }
      else if (afterCert) { bg = 'bg-slate-300'; txt = 'text-slate-600'; }

      const ring = sameDay(date, today)
        ? 'ring-2 ring-emerald-500 '
        : certStart && sameDay(date, certStart) ? 'ring-2 ring-teal-500 ' : '';
      // A visit with a linked note/eval opens it; an empty day opens the quick-add
      // popover. A visit without a note/eval stays inert (avoids duplicate appts).
      const openableVisit = isVisit && (appt!.note_id || appt!.evaluation_id);
      const addable = !isVisit;

      const onCellClick = openableVisit
        ? () => onOpenAppt(appt!)
        : addable
          ? (e: React.MouseEvent<HTMLDivElement>) => {
              const r = e.currentTarget.getBoundingClientRect();
              setQuickAdd({ date: keyOf(date), x: r.left, y: r.bottom });
            }
          : undefined;

      const hover = openableVisit
        ? 'cursor-pointer hover:opacity-80'
        : addable
          ? 'cursor-pointer hover:ring-1 hover:ring-emerald-400 hover:ring-inset'
          : '';

      cells.push(
        <div
          key={d}
          className={`w-[21px] h-[21px] rounded-[3px] flex items-center justify-center text-[9px] transition ${bg} ${txt} ${ring}${hover}`}
          style={style}
          title={`${first.toLocaleDateString('en-US', { month: 'short' })} ${d}${isVisit ? ' · visit' : ''}${openableVisit ? ' · open note/eval' : addable ? ' · click to add appt' : ''}`}
          onClick={onCellClick}
        >
          {d}
        </div>,
      );
    }
    return (
      <div key={`${y}-${m}`}>
        <div className="text-[10px] font-semibold text-slate-500 mb-0.5">
          {first.toLocaleDateString('en-US', { month: 'long' })}
        </div>
        <div className="grid grid-cols-7 gap-[2px]">{cells}</div>
      </div>
    );
  };

  return (
    <div className="card overflow-hidden">
      <div className="px-3 py-2 flex items-center gap-2 border-b border-[var(--color-border)]">
        <span className="font-semibold text-sm">Appointments</span>
        {perWeek > 0 && (
          <span className="inline-flex items-center text-[11px] font-semibold px-1.5 py-0.5 rounded-md border border-emerald-200 bg-emerald-50 text-emerald-700">
            {perWeek}×/wk
          </span>
        )}
        <div className="ml-auto flex items-center gap-0.5 text-slate-400">
          <button className="p-1 rounded hover:bg-gray-100" onClick={() => setMonthOffset((o) => o - 3)} title="Earlier"><ChevronLeft size={14} /></button>
          <button className="p-1 rounded hover:bg-gray-100" onClick={() => setMonthOffset((o) => o + 3)} title="Later"><ChevronRight size={14} /></button>
        </div>
      </div>

      {certStart && certEnd && (
        <div className="px-3 py-1.5 bg-teal-50 border-b border-teal-100 text-[11px] text-teal-800 flex items-center gap-1">
          <Shield size={11} /> Cert {certStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – {certEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          {certDaysLeft !== null && <span className="ml-auto font-semibold">{certDaysLeft > 0 ? `~${certDaysLeft}d left` : 'recert due'}</span>}
        </div>
      )}

      <div className="p-3">
        <div className="grid grid-cols-7 gap-[2px] mb-1">
          {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((d, i) => (
            <div key={i} className="text-center text-[8px] text-slate-400">{d}</div>
          ))}
        </div>
        <div className="space-y-1.5">{months.map((mm) => buildMonth(mm.y, mm.m))}</div>

        <div className="flex flex-wrap gap-x-2.5 gap-y-1 mt-2 text-[10px] text-slate-500">
          <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-[3px] bg-emerald-300" />visit</span>
          <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-[3px]" style={{ background: '#fdf6e7', border: '1px solid #ece0c4' }} />in cert</span>
          <span className="inline-flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-[3px] bg-slate-300" />after cert</span>
        </div>

        {progressRemaining !== null && (
          <div className="mt-2 pt-2 border-t border-[var(--color-border)] text-[11px] text-[var(--color-text-secondary)] flex items-center gap-1.5">
            <span>📄</span>
            <span>
              <b>Docs due:</b> Progress report in{' '}
              {editingCount ? (
                <input
                  autoFocus
                  type="number"
                  min={0}
                  className="inline-block w-10 px-1 text-[11px] border border-[var(--color-border)] rounded text-center"
                  value={countInput}
                  onChange={(e) => setCountInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') commitCount(); if (e.key === 'Escape') setEditingCount(false); }}
                  onBlur={commitCount}
                />
              ) : (
                <b
                  className="cursor-pointer hover:underline hover:text-blue-600"
                  title="Click to adjust visits since last progress report"
                  onClick={() => { setCountInput(String(progressDone)); setEditingCount(true); }}
                >
                  {progressRemaining}
                </b>
              )}{' '}
              visit{progressRemaining === 1 ? '' : 's'}
            </span>
            <button className="ml-auto p-0.5 hover:text-[var(--color-text)]" title="Reset progress counter (after writing a progress report)" onClick={resetProgress}>
              <RotateCcw size={11} />
            </button>
          </div>
        )}
      </div>

      {quickAdd && (
        <QuickAddPopover
          clientId={clientId}
          date={quickAdd.date}
          anchor={{ x: quickAdd.x, y: quickAdd.y }}
          onClose={() => setQuickAdd(null)}
          onChanged={onAppointmentChanged}
          onMoreOptions={(time, duration) => { const d = quickAdd.date; setQuickAdd(null); onMoreOptions(d, time, duration); }}
        />
      )}
    </div>
  );
}

const QUICK_DURATIONS = [15, 30, 45, 50, 60, 75, 90, 120];
const durationLabel = (d: number) => (d < 60 ? `${d} min` : d % 60 === 0 ? `${d / 60}h` : `${Math.floor(d / 60)}h ${d % 60}m`);
const POPOVER_W = 230;
const POPOVER_H = 230;

/**
 * QuickAddPopover — lightweight "schedule on this day" popup for the heatmap.
 * The client is already known (we're inside their chart), so this only asks for
 * time + duration and creates a single scheduled visit. "More options" hands off
 * to the full AppointmentModal for recurring / eval / contract cases.
 */
function QuickAddPopover({
  clientId,
  date,
  anchor,
  onClose,
  onChanged,
  onMoreOptions,
}: {
  clientId: number;
  date: string;
  anchor: { x: number; y: number };
  onClose: () => void;
  onChanged: () => void;
  onMoreOptions: (time: string, duration: number) => void;
}) {
  const [time, setTime] = useState('09:00');
  const [duration, setDuration] = useState(45);
  const [saving, setSaving] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Seed duration from the practice's default session length (same source the full modal uses).
  useEffect(() => {
    window.api.settings
      .get('default_session_length')
      .then((v) => { if (v) setDuration(parseInt(v, 10)); })
      .catch(() => {});
  }, []);

  // Close on outside click. The setTimeout keeps the opening click from closing it immediately.
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const tid = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => { clearTimeout(tid); document.removeEventListener('mousedown', handler); };
  }, [onClose]);

  const save = async () => {
    if (saving) return;
    setSaving(true);
    try {
      await window.api.appointments.create({
        client_id: clientId,
        scheduled_date: date,
        scheduled_time: time,
        duration_minutes: duration,
        status: 'scheduled',
        session_type: 'visit',
        visit_type: 'O' as any,
      });
      onChanged();
      onClose();
    } catch (err) {
      console.error('Quick-add appointment failed:', err);
      setSaving(false);
    }
  };

  // Anchor below-right of the cell; flip left/up near viewport edges (the heatmap
  // lives in the right column, so flipLeft is the common case).
  const flipLeft = anchor.x + POPOVER_W + 16 > window.innerWidth;
  const flipUp = anchor.y + POPOVER_H + 16 > window.innerHeight;
  const left = flipLeft ? Math.max(8, anchor.x - POPOVER_W + 21) : anchor.x;
  const top = flipUp ? Math.max(8, anchor.y - POPOVER_H - 25) : anchor.y + 4;

  const prettyDate = new Date(date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  return createPortal(
    <div
      ref={ref}
      className="fixed z-50 bg-white rounded-lg shadow-xl border border-[var(--color-border)] p-3 animate-in fade-in zoom-in-95 duration-100"
      style={{ left, top, width: POPOVER_W }}
      onKeyDown={(e) => { if (e.key === 'Escape') onClose(); }}
    >
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-semibold text-[var(--color-text)]">Add appointment</span>
        <button className="p-0.5 rounded hover:bg-gray-100 text-[var(--color-text-secondary)]" onClick={onClose} title="Close (Esc)"><X size={13} /></button>
      </div>
      <div className="text-[11px] text-[var(--color-text-secondary)] mb-2">{prettyDate}</div>

      <label className="block text-[11px] text-[var(--color-text-secondary)] mb-0.5">Time</label>
      <input
        type="time"
        step={900}
        autoFocus
        value={time}
        onChange={(e) => setTime(e.target.value)}
        onKeyDown={(e) => { if (e.key === 'Enter') save(); }}
        className="w-full mb-2 text-sm border border-[var(--color-border)] rounded-md px-2 py-1 focus:outline-none focus:border-teal-400"
      />

      <label className="block text-[11px] text-[var(--color-text-secondary)] mb-0.5">Duration</label>
      <select
        value={duration}
        onChange={(e) => setDuration(parseInt(e.target.value, 10))}
        className="w-full mb-3 text-sm border border-[var(--color-border)] rounded-md px-2 py-1 focus:outline-none focus:border-teal-400"
      >
        {QUICK_DURATIONS.map((d) => (
          <option key={d} value={d}>{durationLabel(d)}</option>
        ))}
      </select>

      <div className="flex items-center gap-2">
        <button
          className="flex-1 px-3 py-1.5 bg-teal-500 text-white text-sm font-medium rounded-md hover:bg-teal-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          disabled={saving}
          onClick={save}
        >
          {saving ? 'Saving…' : 'Add'}
        </button>
        <button
          className="px-2 py-1.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text)] flex items-center gap-1"
          onClick={() => onMoreOptions(time, duration)}
          title="Open the full appointment form (recurring, eval, contract…)"
        >
          More <ChevronDown size={12} />
        </button>
      </div>
    </div>,
    document.body,
  );
}
