import React, { useMemo } from 'react';
import { format, isSameDay } from 'date-fns';
import type { Appointment } from '../../../shared/types';
import TimeGrid from './TimeGrid';
import type { TimeGridColumn } from './TimeGrid';
import type { PaymentIndicator } from './AppointmentBlock';

interface DayViewProps {
  date: Date;
  appointments: Appointment[];
  onSlotClick: (date: string, time: string) => void;
  onAppointmentClick: (appt: Appointment) => void;
  onAppointmentDrop: (apptId: number, newDate: string, newTime: string) => void;
  paymentStatusMap?: Record<number, PaymentIndicator>;
}

export default function DayView({
  date,
  appointments,
  onSlotClick,
  onAppointmentClick,
  onAppointmentDrop,
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
        onSlotClick={onSlotClick}
        onAppointmentClick={onAppointmentClick}
        onAppointmentDrop={onAppointmentDrop}
        paymentStatusMap={paymentStatusMap}
      />
    </div>
  );
}
