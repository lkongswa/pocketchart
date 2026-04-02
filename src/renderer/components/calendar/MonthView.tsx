import React, { useMemo, useState, useCallback } from 'react';
import {
  format,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isSameMonth,
  isSameDay,
} from 'date-fns';
import type { Appointment, AppointmentStatus, CalendarBlock } from '../../../shared/types';
import type { PaymentIndicator } from './AppointmentBlock';

interface MonthViewProps {
  currentDate: Date;
  appointments: Appointment[];
  calendarBlocks?: CalendarBlock[];
  onDayClick: (date: Date) => void;
  onAppointmentClick: (appt: Appointment) => void;
  onAppointmentDrop: (apptId: number, newDate: string) => void;
  onTodoDrop?: (todoId: number, date: string) => void;
  onBlockContextMenu?: (block: CalendarBlock, x: number, y: number) => void;
  onBlockToggleDone?: (block: CalendarBlock) => void;
  onBlockRemove?: (block: CalendarBlock) => void;
  paymentStatusMap?: Record<number, PaymentIndicator>;
}

const STATUS_BORDER: Record<AppointmentStatus, string> = {
  scheduled: 'border-l-2 border-l-blue-500 bg-blue-50',
  completed: 'border-l-2 border-l-emerald-500 bg-emerald-50',
  cancelled: 'border-l-2 border-l-gray-400 bg-gray-50 opacity-60',
  'no-show': 'border-l-2 border-l-red-500 bg-red-50',
};

const WEEKDAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const MAX_VISIBLE_APPOINTMENTS = 3;

function formatTime12(time24: string): string {
  const [hStr, mStr] = time24.split(':');
  const h = parseInt(hStr, 10);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mStr} ${suffix}`;
}

export default function MonthView({
  currentDate,
  appointments,
  calendarBlocks = [],
  onDayClick,
  onAppointmentClick,
  onAppointmentDrop,
  onTodoDrop,
  onBlockContextMenu,
  onBlockToggleDone,
  onBlockRemove,
  paymentStatusMap = {},
}: MonthViewProps) {
  const today = new Date();
  const [dragOverDate, setDragOverDate] = useState<string | null>(null);

  // Compute the calendar grid days
  const calendarDays = useMemo(() => {
    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(currentDate);
    const calStart = startOfWeek(monthStart, { weekStartsOn: 1 });
    const calEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
    return eachDayOfInterval({ start: calStart, end: calEnd });
  }, [currentDate.getFullYear(), currentDate.getMonth()]);

  // Group appointments by date string
  const appointmentsByDate = useMemo(() => {
    const map = new Map<string, Appointment[]>();
    for (const appt of appointments) {
      const existing = map.get(appt.scheduled_date) || [];
      existing.push(appt);
      map.set(appt.scheduled_date, existing);
    }
    // Sort each day's appointments by time
    for (const [key, appts] of map) {
      appts.sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time));
    }
    return map;
  }, [appointments]);

  // Group calendar blocks by date string
  const blocksByDate = useMemo(() => {
    const map = new Map<string, CalendarBlock[]>();
    for (const block of calendarBlocks) {
      const existing = map.get(block.scheduled_date) || [];
      existing.push(block);
      map.set(block.scheduled_date, existing);
    }
    return map;
  }, [calendarBlocks]);

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDragEnter = useCallback(
    (dateStr: string) => (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOverDate(dateStr);
    },
    []
  );

  const handleDragLeave = useCallback(
    (dateStr: string) => (e: React.DragEvent<HTMLDivElement>) => {
      if (dragOverDate === dateStr) {
        setDragOverDate(null);
      }
    },
    [dragOverDate]
  );

  const handleDrop = useCallback(
    (dateStr: string) => (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOverDate(null);
      // Check for todo drop first
      const todoId = e.dataTransfer.getData('application/todo-id');
      if (todoId && onTodoDrop) {
        onTodoDrop(parseInt(todoId, 10), dateStr);
        return;
      }
      const apptId = parseInt(e.dataTransfer.getData('text/plain'), 10);
      if (!isNaN(apptId)) {
        onAppointmentDrop(apptId, dateStr);
      }
    },
    [onAppointmentDrop, onTodoDrop]
  );

  const handleApptDragStart = useCallback(
    (apptId: number) => (e: React.DragEvent<HTMLDivElement>) => {
      e.dataTransfer.setData('text/plain', apptId.toString());
      e.dataTransfer.effectAllowed = 'move';
    },
    []
  );

  // Compute number of weeks (rows)
  const weekCount = Math.ceil(calendarDays.length / 7);

  return (
    <div className="border border-[var(--color-border)] rounded-lg bg-white overflow-hidden">
      {/* Weekday Header */}
      <div className="grid grid-cols-7 border-b border-[var(--color-border)]">
        {WEEKDAY_LABELS.map((label) => (
          <div
            key={label}
            className="py-2 text-center text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider"
          >
            {label}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      <div
        className="grid grid-cols-7"
        style={{
          gridTemplateRows: `repeat(${weekCount}, minmax(120px, 1fr))`,
        }}
      >
        {calendarDays.map((day) => {
          const dateStr = format(day, 'yyyy-MM-dd');
          const isCurrentMonth = isSameMonth(day, currentDate);
          const isToday = isSameDay(day, today);
          const dayAppts = appointmentsByDate.get(dateStr) || [];
          const visibleAppts = dayAppts.slice(0, MAX_VISIBLE_APPOINTMENTS);
          const moreCount = dayAppts.length - MAX_VISIBLE_APPOINTMENTS;
          const isDragTarget = dragOverDate === dateStr;

          return (
            <div
              key={dateStr}
              className={`border-b border-r border-[var(--color-border)] p-1.5 cursor-pointer transition-colors hover:bg-gray-50/50 ${
                !isCurrentMonth ? 'opacity-40' : ''
              } ${isToday ? 'ring-2 ring-[var(--color-primary)] ring-inset' : ''} ${
                isDragTarget ? 'bg-blue-50/60' : ''
              }`}
              onClick={() => onDayClick(day)}
              onDragOver={handleDragOver}
              onDragEnter={handleDragEnter(dateStr)}
              onDragLeave={handleDragLeave(dateStr)}
              onDrop={handleDrop(dateStr)}
            >
              {/* Day Number */}
              <div
                className={`text-sm font-medium mb-1 ${
                  isToday
                    ? 'text-[var(--color-primary)] font-bold'
                    : 'text-[var(--color-text)]'
                }`}
              >
                {format(day, 'd')}
              </div>

              {/* Appointment Entries */}
              <div className="space-y-0.5">
                {visibleAppts.map((appt) => {
                  const clientName = `${appt.first_name || 'Unknown'} ${
                    appt.last_name ? appt.last_name.charAt(0) + '.' : ''
                  }`;

                  return (
                    <div
                      key={appt.id}
                      className={`flex items-center gap-1 px-1 py-0.5 rounded text-xs truncate cursor-pointer ${STATUS_BORDER[appt.status]}`}
                      draggable={true}
                      onDragStart={handleApptDragStart(appt.id)}
                      onClick={(e) => {
                        e.stopPropagation();
                        onAppointmentClick(appt);
                      }}
                      title={`${formatTime12(appt.scheduled_time)} - ${clientName}`}
                    >
                      <span className="font-medium whitespace-nowrap">
                        {formatTime12(appt.scheduled_time)}
                      </span>
                      <span className="truncate">{clientName}</span>
                      {paymentStatusMap[appt.id] === 'paid' && (
                        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-emerald-500 text-white text-[8px] font-bold flex-shrink-0" title="Paid">$</span>
                      )}
                      {paymentStatusMap[appt.id] === 'unpaid' && (
                        <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-amber-400 text-white text-[8px] font-bold flex-shrink-0" title="Unpaid">$</span>
                      )}
                    </div>
                  );
                })}

                {/* Calendar blocks (admin time) */}
                {(blocksByDate.get(dateStr) || []).map((block) => {
                  const isDone = block.completed === 1;
                  return (
                    <div
                      key={`block-${block.id}`}
                      className={`group/mblock relative flex items-center gap-1 px-1 py-0.5 rounded text-xs truncate ${
                        isDone
                          ? 'bg-slate-50 border-l-2 border-l-emerald-400 text-slate-400'
                          : 'bg-slate-50 border-l-2 border-l-slate-400 text-slate-600'
                      }`}
                      title={`Admin: ${block.title}${isDone ? ' (Done)' : ''}`}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        if (onBlockContextMenu) onBlockContextMenu(block, e.clientX, e.clientY);
                      }}
                    >
                      <span className={`font-medium whitespace-nowrap ${isDone ? 'line-through opacity-60' : ''}`}>
                        {formatTime12(block.scheduled_time)}
                      </span>
                      <span className={`truncate ${isDone ? 'line-through opacity-60' : ''}`}>{block.title}</span>
                      {/* Hover action buttons */}
                      <div className="absolute right-0 top-0 bottom-0 flex items-center gap-0.5 pr-0.5 opacity-0 group-hover/mblock:opacity-100 transition-opacity bg-gradient-to-l from-slate-50 via-slate-50 to-transparent pl-3">
                        <button
                          className={`w-4 h-4 rounded flex items-center justify-center ${
                            isDone
                              ? 'text-amber-500 hover:bg-amber-100'
                              : 'text-emerald-500 hover:bg-emerald-100'
                          }`}
                          title={isDone ? 'Mark undone' : 'Mark done'}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onBlockToggleDone) onBlockToggleDone(block);
                          }}
                        >
                          <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="1.5,5.5 4,8 8.5,2" />
                          </svg>
                        </button>
                        <button
                          className="w-4 h-4 rounded text-red-400 hover:bg-red-100 flex items-center justify-center"
                          title={block.source_todo_id ? 'Remove & restore task' : 'Delete'}
                          onClick={(e) => {
                            e.stopPropagation();
                            if (onBlockRemove) onBlockRemove(block);
                          }}
                        >
                          <svg width="8" height="8" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                            <line x1="2" y1="2" x2="8" y2="8" />
                            <line x1="8" y1="2" x2="2" y2="8" />
                          </svg>
                        </button>
                      </div>
                    </div>
                  );
                })}

                {moreCount > 0 && (
                  <div className="text-xs text-[var(--color-text-secondary)] font-medium pl-1">
                    +{moreCount} more
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
