import React, { useState, useRef, useEffect, useCallback } from 'react';
import { FileText } from 'lucide-react';
import type { Appointment, AppointmentStatus, VisitType, SessionType } from '../../../shared/types';
import { VISIT_TYPE_LABELS, SESSION_TYPE_LABELS } from '../../../shared/types';

export type PaymentIndicator = 'paid' | 'unpaid' | 'none';

interface AppointmentBlockProps {
  appointment: Appointment;
  slotHeight: number;
  startHour: number;
  onClick: (appt: Appointment) => void;
  onNoteClick?: (appt: Appointment) => void;
  onContextMenu?: (appt: Appointment, x: number, y: number) => void;
  onTodoDrop?: (todoId: number, date: string, time: string) => void;
  /** Called when the user finishes drag-resizing. Snapped to 15-min increments, min 15 min, no upper bound. */
  onResize?: (apptId: number, durationMinutes: number) => void;
  compact?: boolean;
  paymentStatus?: PaymentIndicator;
}

const RESIZE_SNAP_MIN = 15; // minutes
const MIN_DURATION = 15;

const STATUS_CLASSES: Record<AppointmentStatus, string> = {
  scheduled: 'border-l-4 border-l-blue-500 bg-blue-50',
  completed: 'border-l-4 border-l-emerald-500 bg-emerald-50',
  cancelled: 'border-l-4 border-l-gray-400 bg-gray-50 opacity-60',
  'no-show': 'border-l-4 border-l-red-500 bg-red-50',
};

// Session type color overrides (eval=violet, recert=amber)
// Completed/cancelled/no-show use universal colors across all types
const EVAL_STATUS_CLASSES: Record<AppointmentStatus, string> = {
  scheduled: 'border-l-4 border-l-violet-500 bg-violet-50',
  completed: 'border-l-4 border-l-emerald-500 bg-emerald-50',
  cancelled: 'border-l-4 border-l-gray-400 bg-gray-50 opacity-60',
  'no-show': 'border-l-4 border-l-red-500 bg-red-50',
};

const RECERT_STATUS_CLASSES: Record<AppointmentStatus, string> = {
  scheduled: 'border-l-4 border-l-amber-500 bg-amber-50',
  completed: 'border-l-4 border-l-emerald-500 bg-emerald-50',
  cancelled: 'border-l-4 border-l-gray-400 bg-gray-50 opacity-60',
  'no-show': 'border-l-4 border-l-red-500 bg-red-50',
};

// Override colors for contractor appointments
const CONTRACTOR_STATUS_CLASSES: Record<AppointmentStatus, string> = {
  scheduled: 'border-l-4 border-l-purple-500 bg-purple-50',
  completed: 'border-l-4 border-l-emerald-500 bg-emerald-50',
  cancelled: 'border-l-4 border-l-gray-400 bg-gray-50 opacity-60',
  'no-show': 'border-l-4 border-l-red-500 bg-red-50',
};

const DISCIPLINE_BADGE: Record<string, string> = {
  PT: 'badge-pt',
  OT: 'badge-ot',
  ST: 'badge-st',
};

// Compact inline format: "11a", "11:30a", "3p", "3:30p" — designed for tight calendar cells.
function formatTime12(time24: string): string {
  const [hStr, mStr] = time24.split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  const suffix = h >= 12 ? 'p' : 'a';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return m === 0 ? `${h12}${suffix}` : `${h12}:${mStr}${suffix}`;
}

// Verbose format for tooltips where space isn't tight.
function formatTime12Long(time24: string): string {
  const [hStr, mStr] = time24.split(':');
  const h = parseInt(hStr, 10);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mStr} ${suffix}`;
}

export default function AppointmentBlock({
  appointment,
  slotHeight,
  startHour,
  onClick,
  onNoteClick,
  onContextMenu,
  onTodoDrop,
  onResize,
  compact = false,
  paymentStatus = 'none',
}: AppointmentBlockProps) {
  const [hStr, mStr] = appointment.scheduled_time.split(':');
  const hour = parseInt(hStr, 10);
  const minutes = parseInt(mStr, 10);

  // Live preview duration during drag-resize; null when not resizing.
  const [previewDuration, setPreviewDuration] = useState<number | null>(null);
  const resizeStateRef = useRef<{ startY: number; startDuration: number } | null>(null);

  const effectiveDuration = previewDuration ?? appointment.duration_minutes;
  const topPx = ((hour - startHour) * 2 + minutes / 30) * slotHeight;
  const heightPx = Math.max((effectiveDuration / 30) * slotHeight, 24);

  const isContractorAppt = Boolean(appointment.entity_id);
  // For contractor appts, the patient is the primary subject — show their name first; entity is the secondary tag.
  // For regular client appts, show the client's name as before.
  const clientName = isContractorAppt
    ? (appointment.patient_name && appointment.patient_name.trim()
        ? appointment.patient_name
        : (appointment.entity_name || 'Unknown patient'))
    : `${appointment.first_name || 'Unknown'} ${appointment.last_name ? appointment.last_name.charAt(0) + '.' : ''}`;
  // Secondary line under the primary name — only relevant for contractor appts that actually have both patient and entity.
  const secondaryLabel = isContractorAppt && appointment.patient_name && appointment.patient_name.trim() && appointment.entity_name
    ? appointment.entity_name
    : null;

  // Pick color set based on session type
  const sessionType = (appointment.session_type || 'visit') as SessionType;
  const statusClasses = isContractorAppt
    ? CONTRACTOR_STATUS_CLASSES
    : sessionType === 'eval'
    ? EVAL_STATUS_CLASSES
    : sessionType === 'recert'
    ? RECERT_STATUS_CLASSES
    : STATUS_CLASSES;

  // Session type badge
  const sessionBadge = sessionType !== 'visit' ? (
    <span
      className={`inline-flex items-center justify-center px-1.5 py-0 rounded text-[9px] font-bold flex-shrink-0 ${
        sessionType === 'eval' ? 'bg-violet-200 text-violet-700' : 'bg-amber-200 text-amber-700'
      }`}
      title={SESSION_TYPE_LABELS[sessionType]}
    >
      {sessionType === 'eval' ? 'E' : 'RC'}
    </span>
  ) : null;

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('text/plain', appointment.id.toString());
    const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
    e.dataTransfer.setData('application/grab-offset-y', (e.clientY - rect.top).toString());
    e.dataTransfer.effectAllowed = 'move';
  };

  // Allow todo items to be dropped onto time slots that already have appointments
  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    if (e.dataTransfer.types.includes('application/todo-id')) {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
    }
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    const todoId = e.dataTransfer.getData('application/todo-id');
    if (todoId && onTodoDrop) {
      e.preventDefault();
      e.stopPropagation();
      onTodoDrop(parseInt(todoId, 10), appointment.scheduled_date, appointment.scheduled_time);
    }
  };

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (onContextMenu) {
      onContextMenu(appointment, e.clientX, e.clientY);
    }
  };

  // ── Drag-to-resize from the bottom edge ──
  // Compute new duration from a Y-pixel delta off the original height. Snap to 15-min increments, clamp to MIN_DURATION (no upper bound).
  const computeResizedDuration = useCallback((deltaPx: number): number => {
    if (!resizeStateRef.current) return appointment.duration_minutes;
    const startDuration = resizeStateRef.current.startDuration;
    // pixelsPerMinute = slotHeight / 30; minutesAdded = deltaPx / pixelsPerMinute = deltaPx * 30 / slotHeight
    const minutesAdded = (deltaPx * 30) / slotHeight;
    const raw = startDuration + minutesAdded;
    const snapped = Math.round(raw / RESIZE_SNAP_MIN) * RESIZE_SNAP_MIN;
    return Math.max(MIN_DURATION, snapped);
  }, [slotHeight, appointment.duration_minutes]);

  const handleResizeMouseDown = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    resizeStateRef.current = { startY: e.clientY, startDuration: appointment.duration_minutes };
    setPreviewDuration(appointment.duration_minutes);
  }, [appointment.duration_minutes]);

  // Document-level mousemove/mouseup listeners during an active resize, so the drag works even when the cursor leaves the block.
  useEffect(() => {
    if (previewDuration === null) return;
    const onMove = (e: MouseEvent) => {
      if (!resizeStateRef.current) return;
      const delta = e.clientY - resizeStateRef.current.startY;
      setPreviewDuration(computeResizedDuration(delta));
    };
    const onUp = (e: MouseEvent) => {
      if (!resizeStateRef.current) return;
      const delta = e.clientY - resizeStateRef.current.startY;
      const finalDuration = computeResizedDuration(delta);
      resizeStateRef.current = null;
      setPreviewDuration(null);
      if (finalDuration !== appointment.duration_minutes && onResize) {
        onResize(appointment.id, finalDuration);
      }
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [previewDuration, computeResizedDuration, appointment.id, appointment.duration_minutes, onResize]);

  const dollarBadge = paymentStatus === 'paid'
    ? <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500 text-white text-[9px] font-bold flex-shrink-0" title="Paid">$</span>
    : paymentStatus === 'unpaid'
    ? <span className="inline-flex items-center justify-center w-4 h-4 rounded-full border border-gray-400 text-gray-400 bg-white text-[9px] font-bold flex-shrink-0" title="Unpaid">$</span>
    : null;

  const vt = (appointment as any).visit_type as VisitType | undefined;
  const VISIT_TYPE_BADGE_COLORS: Record<string, string> = {
    O: 'bg-blue-100 text-blue-600',
    T: 'bg-purple-100 text-purple-600',
    H: 'bg-amber-100 text-amber-600',
    C: 'bg-teal-100 text-teal-600',
  };
  const visitBadge = vt ? (
    <span
      className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[9px] font-bold flex-shrink-0 ${VISIT_TYPE_BADGE_COLORS[vt] || 'bg-gray-200 text-gray-600'}`}
      title={VISIT_TYPE_LABELS[vt] || vt}
    >
      {vt}
    </span>
  ) : null;

  // Compact mode: inline rendering for month view
  if (compact) {
    return (
      <div
        className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs truncate cursor-pointer ${statusClasses[appointment.status]}`}
        draggable={true}
        onDragStart={handleDragStart}
        onClick={(e) => {
          e.stopPropagation();
          onClick(appointment);
        }}
        title={`${formatTime12Long(appointment.scheduled_time)} - ${clientName}`}
      >
        <span className="font-medium whitespace-nowrap">
          {formatTime12(appointment.scheduled_time)}
        </span>
        <span className="truncate">{clientName}</span>
        {sessionBadge}
        {visitBadge}
        {dollarBadge}
      </div>
    );
  }

  // Full mode: absolutely positioned for day/week time grid
  const isResizing = previewDuration !== null;
  return (
    <div
      className={`absolute left-0.5 right-0.5 rounded-md px-1.5 py-1 overflow-hidden cursor-pointer transition-shadow hover:shadow-md z-10 pointer-events-auto ${statusClasses[appointment.status]} ${isResizing ? 'ring-2 ring-blue-400' : ''}`}
      style={{ top: topPx, height: heightPx }}
      draggable={!isResizing}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={(e) => {
        if (isResizing) return;
        e.stopPropagation();
        onClick(appointment);
      }}
      onContextMenu={handleContextMenu}
      title={`${clientName} - ${formatTime12Long(appointment.scheduled_time)} (${effectiveDuration}m)`}
    >
      <div className="flex items-center justify-between gap-1">
        <div className="text-xs text-[var(--color-text-secondary)] leading-tight whitespace-nowrap truncate min-w-0">
          {formatTime12(appointment.scheduled_time)}{isResizing ? ` · ${effectiveDuration}m` : ''}
        </div>
        <div className="flex items-center gap-0.5 flex-shrink-0">
          {sessionBadge}
          {visitBadge}
          {dollarBadge}
        </div>
      </div>
      <div
        className={`text-sm font-medium truncate leading-tight ${
          appointment.status === 'cancelled'
            ? 'line-through text-gray-400'
            : 'text-[var(--color-text)]'
        }`}
      >
        {clientName}
      </div>
      {secondaryLabel && heightPx >= 40 && (
        <div className="text-[10px] text-[var(--color-text-secondary)] truncate leading-tight">
          {secondaryLabel}
        </div>
      )}
      {heightPx >= 48 && appointment.client_discipline && (
        <div className="mt-0.5">
          <span
            className={`${
              DISCIPLINE_BADGE[appointment.client_discipline] || ''
            } text-[10px] px-1.5 py-0.5`}
          >
            {appointment.client_discipline}
          </span>
        </div>
      )}
      {/* Note shortcut icon — show for client appts; for contractor appts only when entity requires notes in PocketChart */}
      {onNoteClick && (appointment.client_id || (appointment.entity_id && appointment.entity_requires_notes)) && appointment.status !== 'cancelled' && heightPx >= 40 && (
        <button
          className={`absolute bottom-1 right-1 w-5 h-5 flex items-center justify-center rounded transition-all ${
            (appointment as any).note_id || (appointment as any).evaluation_id
              ? 'opacity-60 hover:opacity-100 hover:bg-white/60'
              : 'opacity-40 hover:opacity-100 hover:bg-white/60'
          }`}
          title={(appointment as any).note_id ? 'View note' : 'Write note'}
          onClick={(e) => {
            e.stopPropagation();
            e.preventDefault();
            onNoteClick(appointment);
          }}
        >
          <FileText size={14} className="text-current" />
        </button>
      )}
      {/* Resize handle — bottom edge, drag downward to lengthen the appt */}
      {onResize && appointment.status !== 'cancelled' && (
        <div
          className="absolute left-0 right-0 bottom-0 h-2 cursor-ns-resize hover:bg-blue-400/30 transition-colors"
          onMouseDown={handleResizeMouseDown}
          onClick={(e) => e.stopPropagation()}
          title="Drag to resize"
        />
      )}
    </div>
  );
}
