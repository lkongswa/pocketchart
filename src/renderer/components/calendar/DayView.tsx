import React, { useMemo } from 'react';
import { format, isSameDay } from 'date-fns';
import type { Appointment, CalendarBlock } from '../../../shared/types';
import TimeGrid from './TimeGrid';
import type { TimeGridColumn } from './TimeGrid';
import type { PaymentIndicator } from './AppointmentBlock';

interface DayViewProps {
  date: Date;
  appointments: Appointment[];
  calendarBlocks?: CalendarBlock[];
  onSlotClick: (date: string, time: string) => void;
  onAppointmentClick: (appt: Appointment) => void;
  onNoteClick?: (appt: Appointment) => void;
  onAppointmentDrop: (apptId: number, newDate: string, newTime: string) => void;
  onTodoDrop?: (todoId: number, date: string, time: string) => void;
  onAppointmentContextMenu?: (appt: Appointment, x: number, y: number) => void;
  onBlockContextMenu?: (block: CalendarBlock, x: number, y: number) => void;
  onBlockToggleDone?: (block: CalendarBlock) => void;
  onBlockRemove?: (block: CalendarBlock) => void;
  paymentStatusMap?: Record<number, PaymentIndicator>;
}

export default function DayView({
  date,
  appointments,
  calendarBlocks = [],
  onSlotClick,
  onAppointmentClick,
  onNoteClick,
  onAppointmentDrop,
  onTodoDrop,
  onAppointmentContextMenu,
  onBlockContextMenu,
  onBlockToggleDone,
  onBlockRemove,
  paymentStatusMap = {},
}: DayViewProps) {
  const isToday = isSameDay(date, new Date());
  const dateStr = format(date, 'yyyy-MM-dd');
  const headerLabel = format(date, 'EEEE, MMMM d, yyyy');

  const columns: TimeGridColumn[] = useMemo(
    () => [
      {
        date,
        dateStr,
        label: headerLabel,
      },
    ],
    [dateStr]
  );

  return (
    <div>
      {/* Day Header */}
      <div className="mb-3">
        <div
          className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold ${
            isToday
              ? 'bg-[var(--color-primary)] text-white'
              : 'bg-gray-50 text-[var(--color-text)] border border-[var(--color-border)]'
          }`}
        >
          {headerLabel}
        </div>
      </div>

      {/* Time Grid */}
      <TimeGrid
        startHour={7}
        endHour={19}
        columns={columns}
        appointments={appointments}
        calendarBlocks={calendarBlocks}
        onSlotClick={onSlotClick}
        onAppointmentClick={onAppointmentClick}
        onNoteClick={onNoteClick}
        onAppointmentDrop={onAppointmentDrop}
        onTodoDrop={onTodoDrop}
        onAppointmentContextMenu={onAppointmentContextMenu}
        onBlockContextMenu={onBlockContextMenu}
        onBlockToggleDone={onBlockToggleDone}
        onBlockRemove={onBlockRemove}
        paymentStatusMap={paymentStatusMap}
      />
    </div>
  );
}
