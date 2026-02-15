import React, { useEffect, useRef, useState, useCallback } from 'react';
import { format, isSameDay } from 'date-fns';
import type { Appointment, CalendarBlock } from '../../../shared/types';
import AppointmentBlock from './AppointmentBlock';
import type { PaymentIndicator } from './AppointmentBlock';

export interface TimeGridColumn {
  date: Date;
  dateStr: string; // YYYY-MM-DD
  label: string;
}

interface TimeGridProps {
  startHour: number;
  endHour: number;
  columns: TimeGridColumn[];
  appointments: Appointment[];
  calendarBlocks?: CalendarBlock[];
  onSlotClick: (date: string, time: string) => void;
  onAppointmentClick: (appt: Appointment) => void;
  onNoteClick?: (appt: Appointment) => void;
  onAppointmentDrop: (apptId: number, newDate: string, newTime: string) => void;
  onBlockDrop?: (blockId: number, newDate: string, newTime: string) => void;
  onTodoDrop?: (todoId: number, date: string, time: string) => void;
  onAppointmentContextMenu?: (appt: Appointment, x: number, y: number) => void;
  onBlockContextMenu?: (block: CalendarBlock, x: number, y: number) => void;
  onBlockToggleDone?: (block: CalendarBlock) => void;
  onBlockRemove?: (block: CalendarBlock) => void;
  paymentStatusMap?: Record<number, PaymentIndicator>;
}

const SLOT_HEIGHT = 48; // pixels per 30-min slot

/**
 * Format hour/half-hour index into a time label like "7:00 AM"
 */
function formatTimeLabel(hour: number, isHalf: boolean): string {
  const h = hour;
  const m = isHalf ? '30' : '00';
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${m} ${suffix}`;
}

/**
 * Convert hour:minute into a time string "HH:MM"
 */
function toTimeString(hour: number, minute: number): string {
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
}

/**
 * Determine overlap groups for appointments in a single column.
 * Returns a map of appointment id to { index, total } for width division.
 */
function computeOverlapLayout(
  appts: Appointment[]
): Map<number, { index: number; total: number }> {
  const result = new Map<number, { index: number; total: number }>();
  if (appts.length === 0) return result;

  // Sort by start time, then by duration descending
  const sorted = [...appts].sort((a, b) => {
    const cmp = a.scheduled_time.localeCompare(b.scheduled_time);
    if (cmp !== 0) return cmp;
    return b.duration_minutes - a.duration_minutes;
  });

  // Convert to numeric ranges
  const ranges = sorted.map((appt) => {
    const [hStr, mStr] = appt.scheduled_time.split(':');
    const startMin = parseInt(hStr, 10) * 60 + parseInt(mStr, 10);
    return {
      id: appt.id,
      start: startMin,
      end: startMin + appt.duration_minutes,
    };
  });

  // Greedy column assignment
  const columns: Array<{ id: number; end: number }[]> = [];

  for (const range of ranges) {
    let placed = false;
    for (let col = 0; col < columns.length; col++) {
      const lastInCol = columns[col][columns[col].length - 1];
      if (lastInCol.end <= range.start) {
        columns[col].push(range);
        placed = true;
        break;
      }
    }
    if (!placed) {
      columns.push([range]);
    }
  }

  // Map each appointment to its column index
  const colMap = new Map<number, number>();
  columns.forEach((col, colIdx) => {
    col.forEach((r) => colMap.set(r.id, colIdx));
  });

  // For each appointment, find the max overlap group size
  // by checking how many columns overlap with it
  for (const range of ranges) {
    let maxCols = 0;
    for (const otherRange of ranges) {
      if (
        otherRange.start < range.end &&
        otherRange.end > range.start
      ) {
        maxCols++;
      }
    }
    result.set(range.id, {
      index: colMap.get(range.id) || 0,
      total: Math.max(maxCols, 1),
    });
  }

  return result;
}

export default function TimeGrid({
  startHour,
  endHour,
  columns,
  appointments,
  calendarBlocks = [],
  onSlotClick,
  onAppointmentClick,
  onNoteClick,
  onAppointmentDrop,
  onBlockDrop,
  onTodoDrop,
  onAppointmentContextMenu,
  onBlockContextMenu,
  onBlockToggleDone,
  onBlockRemove,
  paymentStatusMap = {},
}: TimeGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());

  // Auto-scroll to ~8 AM on mount
  useEffect(() => {
    if (scrollRef.current) {
      const scrollTo8AM = (8 - startHour) * 2 * SLOT_HEIGHT;
      scrollRef.current.scrollTop = scrollTo8AM;
    }
  }, [startHour]);

  // Update current time indicator every minute
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Build time slots
  const slots: Array<{ hour: number; isHalf: boolean }> = [];
  for (let h = startHour; h < endHour; h++) {
    slots.push({ hour: h, isHalf: false });
    slots.push({ hour: h, isHalf: true });
  }

  const totalSlots = slots.length;
  const totalHeight = totalSlots * SLOT_HEIGHT;
  const colCount = columns.length;

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }, []);

  const handleDragEnter = useCallback(
    (slotKey: string) => (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOverSlot(slotKey);
    },
    []
  );

  const handleDragLeave = useCallback(
    (slotKey: string) => (e: React.DragEvent<HTMLDivElement>) => {
      if (dragOverSlot === slotKey) {
        setDragOverSlot(null);
      }
    },
    [dragOverSlot]
  );

  const handleDrop = useCallback(
    (dateStr: string, timeStr: string) => (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setDragOverSlot(null);
      // Check for todo drop first
      const todoId = e.dataTransfer.getData('application/todo-id');
      if (todoId && onTodoDrop) {
        onTodoDrop(parseInt(todoId, 10), dateStr, timeStr);
        return;
      }
      // Check for calendar block drag
      const blockId = e.dataTransfer.getData('application/block-id');
      if (blockId && onBlockDrop) {
        onBlockDrop(parseInt(blockId, 10), dateStr, timeStr);
        return;
      }
      const apptId = parseInt(e.dataTransfer.getData('text/plain'), 10);
      if (!isNaN(apptId)) {
        onAppointmentDrop(apptId, dateStr, timeStr);
      }
    },
    [onAppointmentDrop, onBlockDrop, onTodoDrop]
  );

  const handleSlotClick = useCallback(
    (dateStr: string, timeStr: string) => () => {
      onSlotClick(dateStr, timeStr);
    },
    [onSlotClick]
  );

  // Get appointments for a specific column date
  const getColumnAppointments = (dateStr: string): Appointment[] => {
    return appointments
      .filter((a) => a.scheduled_date === dateStr)
      .sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time));
  };

  // Get calendar blocks for a specific column date
  const getColumnBlocks = (dateStr: string): CalendarBlock[] => {
    return calendarBlocks
      .filter((b) => b.scheduled_date === dateStr)
      .sort((a, b) => a.scheduled_time.localeCompare(b.scheduled_time));
  };

  // Current time indicator position
  const now = currentTime;
  const nowHour = now.getHours();
  const nowMinute = now.getMinutes();
  const nowInRange = nowHour >= startHour && nowHour < endHour;
  const nowTop = nowInRange
    ? ((nowHour - startHour) * 2 + nowMinute / 30) * SLOT_HEIGHT
    : -1;

  // Find if today is in any column
  const todayColIndex = columns.findIndex((col) => isSameDay(col.date, now));

  return (
    <div
      ref={scrollRef}
      className="overflow-y-auto border border-[var(--color-border)] rounded-lg bg-white"
      style={{ maxHeight: 'calc(100vh - 240px)' }}
    >
      <div
        className="grid relative"
        style={{
          gridTemplateColumns: `60px repeat(${colCount}, 1fr)`,
          height: totalHeight,
        }}
      >
        {/* Time Gutter */}
        <div className="relative" style={{ height: totalHeight }}>
          {slots.map((slot, idx) => {
            const label = formatTimeLabel(slot.hour, slot.isHalf);
            return (
              <div
                key={`gutter-${idx}`}
                className="absolute right-0 pr-2 text-xs text-[var(--color-text-secondary)] text-right leading-none"
                style={{
                  top: idx * SLOT_HEIGHT,
                  height: SLOT_HEIGHT,
                  width: 60,
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'flex-end',
                  paddingTop: 2,
                }}
              >
                {label}
              </div>
            );
          })}
        </div>

        {/* Day Columns */}
        {columns.map((col, colIdx) => {
          const colAppts = getColumnAppointments(col.dateStr);
          const overlapLayout = computeOverlapLayout(colAppts);

          return (
            <div
              key={col.dateStr}
              className="relative"
              style={{ height: totalHeight }}
            >
              {/* Slot backgrounds and click/drop targets */}
              {slots.map((slot, slotIdx) => {
                const timeStr = toTimeString(
                  slot.hour,
                  slot.isHalf ? 30 : 0
                );
                const slotKey = `${col.dateStr}-${timeStr}`;
                const isDragTarget = dragOverSlot === slotKey;

                return (
                  <div
                    key={slotKey}
                    className={`absolute left-0 right-0 ${
                      slot.isHalf
                        ? 'border-t border-dashed border-gray-200'
                        : 'border-t border-[var(--color-border)]'
                    } ${isDragTarget ? 'bg-blue-100/40' : ''}`}
                    style={{
                      top: slotIdx * SLOT_HEIGHT,
                      height: SLOT_HEIGHT,
                    }}
                    data-date={col.dateStr}
                    data-time={timeStr}
                    onDragOver={handleDragOver}
                    onDragEnter={handleDragEnter(slotKey)}
                    onDragLeave={handleDragLeave(slotKey)}
                    onDrop={handleDrop(col.dateStr, timeStr)}
                    onClick={handleSlotClick(col.dateStr, timeStr)}
                  />
                );
              })}

              {/* Appointment blocks */}
              {colAppts.map((appt) => {
                const layout = overlapLayout.get(appt.id) || {
                  index: 0,
                  total: 1,
                };
                const widthPercent = 100 / layout.total;
                const leftPercent = layout.index * widthPercent;

                return (
                  <div
                    key={appt.id}
                    className="absolute pointer-events-none"
                    style={{
                      top: 0,
                      left: `${leftPercent}%`,
                      width: `${widthPercent}%`,
                      height: totalHeight,
                    }}
                  >
                    <AppointmentBlock
                      appointment={appt}
                      slotHeight={SLOT_HEIGHT}
                      startHour={startHour}
                      onClick={onAppointmentClick}
                      onNoteClick={onNoteClick}
                      onContextMenu={onAppointmentContextMenu}
                      onTodoDrop={onTodoDrop}
                      paymentStatus={paymentStatusMap[appt.id] || 'none'}
                    />
                  </div>
                );
              })}

              {/* Calendar blocks (admin time blocks — rendered in slate/gray) */}
              {getColumnBlocks(col.dateStr).map((block) => {
                const [hStr, mStr] = block.scheduled_time.split(':');
                const blockHour = parseInt(hStr, 10);
                const blockMin = parseInt(mStr, 10);
                const topPx = ((blockHour - startHour) * 2 + blockMin / 30) * SLOT_HEIGHT;
                const heightPx = Math.max((block.duration_minutes / 30) * SLOT_HEIGHT, 24);
                const h12 = blockHour === 0 ? 12 : blockHour > 12 ? blockHour - 12 : blockHour;
                const suffix = blockHour >= 12 ? 'PM' : 'AM';
                const timeLabel = `${h12}:${(mStr || '00').padStart(2, '0')} ${suffix}`;
                const isDone = block.completed === 1;

                return (
                  <div
                    key={`block-${block.id}`}
                    className={`group/block absolute left-1 right-1 z-10 rounded px-2 py-1 overflow-visible cursor-grab ${
                      isDone
                        ? 'bg-slate-50 border-l-2 border-l-emerald-400 text-slate-400'
                        : 'bg-slate-100 border-l-2 border-l-slate-400 text-slate-600 hover:bg-slate-200/70'
                    }`}
                    style={{ top: topPx, height: heightPx }}
                    title={`Admin: ${block.title}${isDone ? ' (Done)' : ''}`}
                    draggable
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/block-id', block.id.toString());
                      e.dataTransfer.effectAllowed = 'move';
                    }}
                    onDragOver={(e) => {
                      if (e.dataTransfer.types.includes('application/todo-id') || e.dataTransfer.types.includes('application/block-id')) {
                        e.preventDefault();
                        e.dataTransfer.dropEffect = 'move';
                      }
                    }}
                    onDrop={(e) => {
                      const todoId = e.dataTransfer.getData('application/todo-id');
                      if (todoId && onTodoDrop) {
                        e.preventDefault();
                        e.stopPropagation();
                        onTodoDrop(parseInt(todoId, 10), col.dateStr, block.scheduled_time);
                        return;
                      }
                      const blockDragId = e.dataTransfer.getData('application/block-id');
                      if (blockDragId && onBlockDrop) {
                        e.preventDefault();
                        e.stopPropagation();
                        onBlockDrop(parseInt(blockDragId, 10), col.dateStr, block.scheduled_time);
                      }
                    }}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (onBlockContextMenu) onBlockContextMenu(block, e.clientX, e.clientY);
                    }}
                  >
                    <div className={`text-[10px] font-medium truncate pr-10 ${isDone ? 'line-through opacity-60' : ''}`}>{timeLabel}</div>
                    {heightPx >= 36 && (
                      <div className={`text-[11px] truncate pr-10 ${isDone ? 'line-through opacity-60' : ''}`}>{block.title}</div>
                    )}
                    {/* Hover action buttons */}
                    <div className="absolute top-0.5 right-0.5 flex items-center gap-0.5 opacity-0 group-hover/block:opacity-100 transition-opacity">
                      <button
                        className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
                          isDone
                            ? 'bg-amber-100 text-amber-600 hover:bg-amber-200'
                            : 'bg-emerald-100 text-emerald-600 hover:bg-emerald-200'
                        }`}
                        title={isDone ? 'Mark undone' : 'Mark done'}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onBlockToggleDone) onBlockToggleDone(block);
                        }}
                      >
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="1.5,5.5 4,8 8.5,2" />
                        </svg>
                      </button>
                      <button
                        className="w-5 h-5 rounded bg-red-100 text-red-500 hover:bg-red-200 flex items-center justify-center transition-colors"
                        title={block.source_todo_id ? 'Remove & restore task' : 'Delete block'}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (onBlockRemove) onBlockRemove(block);
                        }}
                      >
                        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                          <line x1="2" y1="2" x2="8" y2="8" />
                          <line x1="8" y1="2" x2="2" y2="8" />
                        </svg>
                      </button>
                    </div>
                  </div>
                );
              })}

              {/* Current time indicator */}
              {todayColIndex === colIdx && nowInRange && (
                <div
                  className="absolute left-0 right-0 z-20 pointer-events-none"
                  style={{ top: nowTop }}
                >
                  <div className="flex items-center">
                    <div className="w-2.5 h-2.5 rounded-full bg-red-500 -ml-1" />
                    <div className="flex-1 h-0.5 bg-red-500" />
                  </div>
                </div>
              )}

              {/* Right border between columns */}
              {colIdx < colCount - 1 && (
                <div className="absolute top-0 right-0 bottom-0 w-px bg-[var(--color-border)]" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
