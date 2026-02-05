import React from 'react';
import type { Appointment, AppointmentStatus } from '../../../shared/types';

export type PaymentIndicator = 'paid' | 'unpaid' | 'none';

interface AppointmentBlockProps {
  appointment: Appointment;
  slotHeight: number;
  startHour: number;
  onClick: (appt: Appointment) => void;
  compact?: boolean;
  paymentStatus?: PaymentIndicator;
}

const STATUS_CLASSES: Record<AppointmentStatus, string> = {
  scheduled: 'border-l-4 border-l-blue-500 bg-blue-50',
  completed: 'border-l-4 border-l-emerald-500 bg-emerald-50',
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
  compact = false,
  paymentStatus = 'none',
}: AppointmentBlockProps) {
  const [hStr, mStr] = appointment.scheduled_time.split(':');
  const hour = parseInt(hStr, 10);
  const minutes = parseInt(mStr, 10);

  const topPx = ((hour - startHour) * 2 + minutes / 30) * slotHeight;
  const heightPx = Math.max((appointment.duration_minutes / 30) * slotHeight, 24);

  const clientName = `${appointment.first_name || 'Unknown'} ${
    appointment.last_name ? appointment.last_name.charAt(0) + '.' : ''
  }`;

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.setData('text/plain', appointment.id.toString());
    e.dataTransfer.effectAllowed = 'move';
  };

  const dollarBadge = paymentStatus === 'paid'
    ? <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-500 text-white text-[9px] font-bold flex-shrink-0" title="Paid">$</span>
    : paymentStatus === 'unpaid'
    ? <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-400 text-white text-[9px] font-bold flex-shrink-0" title="Unpaid">$</span>
    : null;

  // Compact mode: inline rendering for month view
  if (compact) {
    return (
      <div
        className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-xs truncate cursor-grab active:cursor-grabbing ${STATUS_CLASSES[appointment.status]}`}
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
        {dollarBadge}
      </div>
    );
  }

  // Full mode: absolutely positioned for day/week time grid
  return (
    <div
      className={`absolute left-0.5 right-0.5 rounded-md px-2 py-1 overflow-hidden cursor-grab active:cursor-grabbing transition-shadow hover:shadow-md z-10 ${STATUS_CLASSES[appointment.status]}`}
      style={{ top: topPx, height: heightPx }}
      draggable={true}
      onDragStart={handleDragStart}
      onClick={(e) => {
        e.stopPropagation();
        onClick(appointment);
      }}
      title={`${clientName} - ${formatTime12(appointment.scheduled_time)} (${appointment.duration_minutes}m)`}
    >
      <div className="flex items-center justify-between">
        <div className="text-xs text-[var(--color-text-secondary)] leading-tight">
          {formatTime12(appointment.scheduled_time)}
        </div>
        {dollarBadge}
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
