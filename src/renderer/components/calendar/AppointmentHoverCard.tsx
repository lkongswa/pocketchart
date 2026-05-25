import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, Clock, DollarSign, CheckCircle2, Ban, AlertTriangle, X } from 'lucide-react';
import type { Appointment, AppointmentStatus } from '../../../shared/types';

interface AppointmentHoverCardProps {
  appointment: Appointment;
  /** Bounding rect of the AppointmentBlock the user is hovering. */
  anchorRect: DOMRect;
  /** Mouse-enter / mouse-leave forwarded from the anchor so we can keep the card open
   *  while the user moves the cursor INTO it (e.g., toward a future action button). */
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  paymentStatus?: 'paid' | 'unpaid' | 'none';
}

const CARD_WIDTH = 256;
const CARD_MAX_HEIGHT = 240;
const GAP = 8;

const STATUS_META: Record<AppointmentStatus, { label: string; icon: React.ReactNode; chip: string }> = {
  scheduled:   { label: 'Scheduled', icon: <Clock size={11} />,           chip: 'bg-blue-100 text-blue-700' },
  completed:   { label: 'Completed', icon: <CheckCircle2 size={11} />,    chip: 'bg-emerald-100 text-emerald-700' },
  cancelled:   { label: 'Cancelled', icon: <Ban size={11} />,             chip: 'bg-gray-100 text-gray-500' },
  'no-show':   { label: 'No-Show',   icon: <AlertTriangle size={11} />,   chip: 'bg-red-100 text-red-700' },
};

function formatTime12Long(time24: string): string {
  const [hStr, mStr] = time24.split(':');
  const h = parseInt(hStr, 10);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mStr} ${suffix}`;
}

function endLabel(time24: string, durationMin: number): string {
  const [hStr, mStr] = time24.split(':');
  const total = parseInt(hStr, 10) * 60 + parseInt(mStr, 10) + durationMin;
  const eh = Math.floor(total / 60) % 24;
  const em = total % 60;
  return formatTime12Long(`${eh.toString().padStart(2, '0')}:${em.toString().padStart(2, '0')}`);
}

function formatDateLong(dateStr: string): string {
  // dateStr is "YYYY-MM-DD". Adding "T12:00:00" sidesteps timezone-shift on parse.
  const d = new Date(dateStr + 'T12:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
}

export default function AppointmentHoverCard({
  appointment,
  anchorRect,
  onMouseEnter,
  onMouseLeave,
  paymentStatus = 'none',
}: AppointmentHoverCardProps) {
  // Compute placement from the anchor. Default: to the RIGHT of the block.
  // Flip to LEFT if too close to right edge. Vertical = block top, clamped to viewport.
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useEffect(() => {
    const flipLeft = anchorRect.right + CARD_WIDTH + GAP > window.innerWidth;
    const left = flipLeft
      ? Math.max(8, anchorRect.left - CARD_WIDTH - GAP)
      : anchorRect.right + GAP;
    const rawTop = anchorRect.top;
    const top = Math.max(8, Math.min(rawTop, window.innerHeight - CARD_MAX_HEIGHT - 8));
    setPos({ left, top });
  }, [anchorRect.left, anchorRect.right, anchorRect.top]);

  if (!pos) return null;

  const isContractor = Boolean(appointment.entity_id);
  const clientName = isContractor
    ? (appointment.patient_name?.trim() || appointment.entity_name || 'Unknown patient')
    : `${appointment.first_name || ''} ${appointment.last_name || ''}`.trim() || 'Unknown';
  const secondaryLabel = isContractor && appointment.patient_name?.trim() && appointment.entity_name
    ? appointment.entity_name
    : null;
  const statusMeta = STATUS_META[appointment.status];
  const hasNote = Boolean((appointment as any).note_id);
  const hasEval = Boolean((appointment as any).evaluation_id);

  return createPortal(
    <div
      className="fixed z-[60] bg-white rounded-lg shadow-xl border border-[var(--color-border)] p-3 animate-in fade-in zoom-in-95 duration-100"
      style={{ left: pos.left, top: pos.top, width: CARD_WIDTH, maxHeight: CARD_MAX_HEIGHT }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* Client name + status chip */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-[var(--color-text)] truncate" title={clientName}>{clientName}</div>
          {secondaryLabel && (
            <div className="text-[11px] text-[var(--color-text-secondary)] truncate">{secondaryLabel}</div>
          )}
        </div>
        <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${statusMeta.chip}`}>
          {statusMeta.icon}
          {statusMeta.label}
        </span>
      </div>

      {/* Time + date row */}
      <div className="text-xs text-[var(--color-text-secondary)] mb-2 leading-relaxed">
        <div className="flex items-center gap-1.5">
          <Clock size={11} className="opacity-60" />
          <span>{formatTime12Long(appointment.scheduled_time)} → {endLabel(appointment.scheduled_time, appointment.duration_minutes)} <span className="opacity-60">({appointment.duration_minutes} min)</span></span>
        </div>
        <div className="text-[var(--color-text)] text-[11px] mt-0.5 ml-4">{formatDateLong(appointment.scheduled_date)}</div>
      </div>

      {/* Session type / visit type / discipline mini-row */}
      {(appointment.session_type || (appointment as any).visit_type || appointment.client_discipline) && (
        <div className="flex flex-wrap items-center gap-1 mb-2">
          {appointment.session_type && appointment.session_type !== 'visit' && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-violet-100 text-violet-700">
              {appointment.session_type === 'eval' ? 'Evaluation' : 'Recert'}
            </span>
          )}
          {(appointment as any).visit_type && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-gray-100 text-gray-700">
              Visit: {(appointment as any).visit_type}
            </span>
          )}
          {appointment.client_discipline && !isContractor && (
            <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-100 text-teal-700">
              {appointment.client_discipline}
            </span>
          )}
        </div>
      )}

      {/* Payment + note indicators */}
      <div className="flex items-center gap-3 text-[11px] text-[var(--color-text-secondary)] border-t border-[var(--color-border)] pt-2">
        {paymentStatus !== 'none' && (
          <span className={`inline-flex items-center gap-1 ${paymentStatus === 'paid' ? 'text-emerald-600' : 'text-amber-600'}`}>
            <DollarSign size={11} />
            {paymentStatus === 'paid' ? 'Paid' : 'Unpaid'}
          </span>
        )}
        <span className={`inline-flex items-center gap-1 ${hasNote || hasEval ? 'text-blue-600' : ''}`}>
          <FileText size={11} />
          {hasNote ? 'Note written' : hasEval ? 'Eval linked' : 'No note yet'}
        </span>
      </div>

      <p className="mt-2 text-[10px] text-[var(--color-text-secondary)] text-center">
        Click to edit · Right-click for actions
      </p>
    </div>,
    document.body
  );
}
