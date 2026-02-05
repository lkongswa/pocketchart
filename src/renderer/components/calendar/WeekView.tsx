import React, { useMemo } from 'react';
import { format, addDays, isSameDay } from 'date-fns';
import type { Appointment } from '../../../shared/types';
import TimeGrid from './TimeGrid';
import type { TimeGridColumn } from './TimeGrid';
import type { PaymentIndicator } from './AppointmentBlock';

interface WeekViewProps {
  weekStart: Date;
  appointments: Appointment[];
  onSlotClick: (date: string, time: string) => void;
  onAppointmentClick: (appt: Appointment) => void;
  onAppointmentDrop: (apptId: number, newDate: string, newTime: string) => void;
  paymentStatusMap?: Record<number, PaymentIndicator>;
}

export default function WeekView({
  weekStart,
  appointments,
  onSlotClick,
  onAppointmentClick,
  onAppointmentDrop,
  paymentStatusMap = {},
}: WeekViewProps) {
  const today = new Date();

  const columns: TimeGridColumn[] = useMemo(() => {
    return Array.from({ length: 7 }, (_, i) => {
      const day = addDays(weekStart, i);
      return {
        date: day,
        dateStr: format(day, 'yyyy-MM-dd'),
        label: format(day, 'EEE d'),
      };
    });
  }, [weekStart.toISOString()]);

  return (
    <div>
      {/* Day Headers */}
      <div
        className="grid mb-1"
        style={{
          gridTemplateColumns: `60px repeat(7, 1fr)`,
        }}
      >
        {/* Empty cell for time gutter */}
        <div />

        {columns.map((col) => {
          const isToday = isSameDay(col.date, today);
          return (
            <div
              key={col.dateStr}
              className={`text-center py-2 text-sm font-medium ${
                isToday
                  ? 'bg-[var(--color-primary)] text-white rounded-lg'
                  : 'text-[var(--color-text)]'
              }`}
            >
              <div className="text-xs uppercase">
                {format(col.date, 'EEE')}
              </div>
              <div className="text-lg font-bold">
                {format(col.date, 'd')}
              </div>
            </div>
          );
        })}
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
