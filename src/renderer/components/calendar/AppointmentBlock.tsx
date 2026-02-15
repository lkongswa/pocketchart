import React from 'react';
import type { Appointment, AppointmentStatus, VisitType, SessionType } from '../../../shared/types';
import { VISIT_TYPE_LABELS, SESSION_TYPE_LABELS } from '../../../shared/types';

export type PaymentIndicator = 'paid' | 'unpaid' | 'none';

interface AppointmentBlockProps {
  appointment: Appointment;
  slotHeight: number;
  startHour: number;
  onClick: (appt: Appointment) => void;
  onContextMenu?: (appt: Appointment, x: number, y: number) => void;
  onTodoDrop?: (todoId: number, date: string, time: string) => void;
  compact?: boolean;
  paymentStatus?: PaymentIndicator;
}

const STATUS_CLASSES: Record<AppointmentStatus, string> = {
  scheduled: 'border-l-4 border-l-blue-500 bg-blue-50',
  completed: 'border-l-4 border-l-emerald-500 bg-emerald-50',
  cancelled: 'border-l-4 border-l-gray-400 bg-gray-50 opacity-60',
  'no-show': 'border-l-4 border-l-red-500 bg-red-50',
};

// Session type color overrides (eval=violet, recert=amber)
const EVAL_STATUS_CLASSES: Record<AppointmentStatus, string> = {
  scheduled: 'border-l-4 border-l-violet-500 bg-violet-50',
  completed: 'border-l-4 border-l-violet-600 bg-violet-50',
  cancelled: 'border-l-4 border-l-gray-400 bg-gray-50 opacity-60',
  'no-show': 'border-l-4 border-l-red-500 bg-red-50',
};

const RECERT_STATUS_CLASSES: Record<AppointmentStatus, string> = {
  scheduled: 'border-l-4 border-l-amber-500 bg-amber-50',
  completed: 'border-l-4 border-l-amber-600 bg-amber-50',
  cancelled: 'border-l-4 border-l-gray-400 bg-gray-50 opacity-60',
  'no-show': 'border-l-4 border-l-red-500 bg-red-50',
};

// Override colors for contractor appointments
const CONTRACTOR_STATUS_CLASSES: Record<AppointmentStatus, string> = {
  scheduled: 'border-l-4 border-l-purple-500 bg-purple-50',
  completed: 'border-l-4 border-l-purple-600 bg-purple-50',
  cancelled: 'border-l-4 border-l-gray-400 bg-gray-50 opacity-60',
  'no-show': 'border-l-4 border-l-red-500 bg-red-50',
};

const DISCIPLINE_BADGE: Record<string, string> = {
  PT: 'badge-pt',
  OT: 'badge-ot',
  ST: 'badge-st',
};

function formatTime12(time24: string): string {
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
  onContextMenu,
  onTodoDrop,
  compact = false,
  paymentStatus = 'none',
}: AppointmentBlockProps) {
  const [hStr, mStr] = appointment.scheduled_time.split(':');
  const hour = parseInt(hStr, 10);
  const minutes = parseInt(mStr, 10);

  const topPx = ((hour - startHour) * 2 + minutes / 30) * slotHeight;
  const heightPx = Math.max((appointment.duration_minutes / 30) * slotHeight, 24);

  const isContractorAppt = Boolean(appointment.entity_id);
  const baseName = isContractorAppt && appointment.entity_name
    ? appointment.entity_name
    : `${appointment.first_name || 'Unknown'} ${appointment.last_name ? appointment.last_name.charAt(0) + '.' : ''}`;
  const clientName = isContractorAppt && appointment.patient_name
    ? `${baseName} — ${appointment.patient_name}`
    : baseName;

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
        title={`${formatTime12(appointment.scheduled_time)} - ${clientName}`}
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
  return (
    <div
      className={`absolute left-0.5 right-0.5 rounded-md px-2 py-1 overflow-hidden cursor-pointer transition-shadow hover:shadow-md z-10 pointer-events-auto ${statusClasses[appointment.status]}`}
      style={{ top: topPx, height: heightPx }}
      draggable={true}
      onDragStart={handleDragStart}
      onDragOver={handleDragOver}
      onDrop={handleDrop}
      onClick={(e) => {
        e.stopPropagation();
        onClick(appointment);
      }}
      onContextMenu={handleContextMenu}
      title={`${clientName} - ${formatTime12(appointment.scheduled_time)} (${appointment.duration_minutes}m)\nRight-click for options`}
    >
      <div className="flex items-center justify-between gap-1">
        <div className="text-xs text-[var(--color-text-secondary)] leading-tight">
          {formatTime12(appointment.scheduled_time)}
        </div>
        <div className="flex items-center gap-0.5">
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
    </div>
  );
}
