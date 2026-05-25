import React, { useEffect, useRef, useState, useCallback } from 'react';
import { format, isSameDay } from 'date-fns';
import { MousePointerClick } from 'lucide-react';
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
  onSlotContextMenu?: (date: string, time: string, x: number, y: number) => void;
  onAppointmentResize?: (apptId: number, durationMinutes: number) => void;
  onBlockResize?: (blockId: number, durationMinutes: number) => void;
  onBlockToggleDone?: (block: CalendarBlock) => void;
  onBlockRemove?: (block: CalendarBlock) => void;
  paymentStatusMap?: Record<number, PaymentIndicator>;
}

// Calendar grid resolution. SLOT_MINUTES is the source of truth — change it and
// everything else (click granularity, drop snap, resize snap) follows.
// 15 min per slot × 24 px = 96 px per hour (same total height as the old 30-min × 48 px layout).
const SLOT_MINUTES = 15;
const SLOTS_PER_HOUR = 60 / SLOT_MINUTES; // 4
const SLOT_HEIGHT = 24; // pixels per SLOT_MINUTES-min slot
const PX_PER_MINUTE = SLOT_HEIGHT / SLOT_MINUTES; // 1.6

// Working-hours range. Slots outside this window get a subtle grey backdrop so
// the eye locks onto the workday immediately. Weekend columns get the same tint.
const WORK_START_HOUR = 8;
const WORK_END_HOUR = 18; // 6pm

/**
 * Format an hour:minute pair into a compact gutter label.
 * Only the top of the hour (":00") and the half-hour (":30") get labels —
 * showing all four 15-min ticks would crowd the 60px gutter.
 */
function formatTimeLabel(hour: number, minute: number): string {
  const suffix = hour >= 12 ? 'p' : 'a';
  const h12 = hour === 0 ? 12 : hour > 12 ? hour - 12 : hour;
  if (minute === 0) return `${h12}${suffix}`;
  if (minute === 30) return `${h12}:30${suffix}`;
  return ''; // :15 and :45 are tick-only
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
  onSlotContextMenu,
  onAppointmentResize,
  onBlockResize,
  onBlockToggleDone,
  onBlockRemove,
  paymentStatusMap = {},
}: TimeGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [dragOverSlot, setDragOverSlot] = useState<string | null>(null);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [draggingBlockId, setDraggingBlockId] = useState<number | null>(null);
  // Drag-to-resize state for calendar blocks. Mirrors AppointmentBlock's pattern:
  // we keep a live previewDuration during the drag so the block height updates
  // smoothly, and commit on mouseup via onBlockResize.
  const [resizingBlock, setResizingBlock] = useState<{
    id: number;
    startY: number;
    startDuration: number;
    previewDuration: number;
  } | null>(null);

  // Document-level listeners while a block resize is active.
  useEffect(() => {
    if (!resizingBlock) return;
    const onMove = (e: MouseEvent) => {
      setResizingBlock((cur) => {
        if (!cur) return cur;
        const delta = e.clientY - cur.startY;
        const minutesAdded = delta / PX_PER_MINUTE;
        const raw = cur.startDuration + minutesAdded;
        const snapped = Math.round(raw / SLOT_MINUTES) * SLOT_MINUTES;
        const next = Math.max(SLOT_MINUTES, snapped);
        return { ...cur, previewDuration: next };
      });
    };
    const onUp = () => {
      setResizingBlock((cur) => {
        if (cur && cur.previewDuration !== cur.startDuration && onBlockResize) {
          onBlockResize(cur.id, cur.previewDuration);
        }
        return null;
      });
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
  }, [resizingBlock, onBlockResize]);

  // Auto-scroll to ~8 AM on mount
  useEffect(() => {
    if (scrollRef.current) {
      const scrollTo8AM = (8 - startHour) * SLOTS_PER_HOUR * SLOT_HEIGHT;
      scrollRef.current.scrollTop = scrollTo8AM;
    }
  }, [startHour]);

  // Update current time indicator every minute
  useEffect(() => {
    const interval = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(interval);
  }, []);

  // Build time slots — SLOTS_PER_HOUR rows per hour at SLOT_MINUTES granularity.
  const slots: Array<{ hour: number; minute: number }> = [];
  for (let h = startHour; h < endHour; h++) {
    for (let m = 0; m < 60; m += SLOT_MINUTES) {
      slots.push({ hour: h, minute: m });
    }
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
      setDraggingBlockId(null);
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
        // Compute precise drop time: account for where the user grabbed the block,
        // then snap to SLOT_MINUTES increments.
        const grabOffsetY = parseFloat(e.dataTransfer.getData('application/grab-offset-y') || '0');
        const slotRect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
        const dropYInSlot = e.clientY - slotRect.top;
        const apptTopInSlot = dropYInSlot - grabOffsetY;
        const [slotH, slotM] = timeStr.split(':').map(Number);
        const slotBaseMinutes = slotH * 60 + slotM;
        const offsetMinutes = apptTopInSlot / PX_PER_MINUTE;
        const snapped = Math.round((slotBaseMinutes + offsetMinutes) / SLOT_MINUTES) * SLOT_MINUTES;
        const clamped = Math.max(startHour * 60, Math.min((endHour - 1) * 60 + (60 - SLOT_MINUTES), snapped));
        const preciseTimeStr = toTimeString(Math.floor(clamped / 60), clamped % 60);
        onAppointmentDrop(apptId, dateStr, preciseTimeStr);
      }
    },
    [onAppointmentDrop, onBlockDrop, onTodoDrop, startHour, endHour]
  );

  const handleSlotClick = useCallback(
    (dateStr: string, timeStr: string) => () => {
      onSlotClick(dateStr, timeStr);
    },
    [onSlotClick]
  );

  const handleSlotContextMenu = useCallback(
    (dateStr: string, timeStr: string) => (e: React.MouseEvent<HTMLDivElement>) => {
      if (!onSlotContextMenu) return;
      e.preventDefault();
      onSlotContextMenu(dateStr, timeStr, e.clientX, e.clientY);
    },
    [onSlotContextMenu]
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
    ? ((nowHour - startHour) * 60 + nowMinute) * PX_PER_MINUTE
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
        {/* Time Gutter — labels only on the :00 and :30 rows; :15/:45 stay blank to keep the gutter clean */}
        <div className="relative" style={{ height: totalHeight }}>
          {slots.map((slot, idx) => {
            const label = formatTimeLabel(slot.hour, slot.minute);
            if (!label) return null;
            return (
              <div
                key={`gutter-${idx}`}
                className="absolute right-0 pr-2 text-xs text-[var(--color-text-secondary)] text-right leading-none whitespace-nowrap"
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
          const dayOfWeek = col.date.getDay(); // 0 = Sun, 6 = Sat
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

          return (
            <div
              key={col.dateStr}
              className="relative"
              style={{ height: totalHeight }}
            >
              {/* Slot backgrounds and click/drop targets — 4 per hour at 15-min granularity.
                  Border style hints at the slot's position in the hour:
                    :00 solid, :30 dashed, :15/:45 invisible (just click targets).
                  Off-hours (before 8a / after 6p) and weekend columns get a subtle grey backdrop. */}
              {slots.map((slot, slotIdx) => {
                const timeStr = toTimeString(slot.hour, slot.minute);
                const slotKey = `${col.dateStr}-${timeStr}`;
                const isDragTarget = dragOverSlot === slotKey;
                const isOffHour = slot.hour < WORK_START_HOUR || slot.hour >= WORK_END_HOUR;
                const isOffPeriod = isWeekend || isOffHour;
                const borderClass =
                  slot.minute === 0 ? 'border-t border-[var(--color-border)]'
                  : slot.minute === 30 ? 'border-t border-dashed border-gray-200'
                  : ''; // :15 and :45 — no gridline, keeps the visual quiet
                const bgClass = isDragTarget
                  ? 'bg-blue-100/40'
                  : isOffPeriod
                    ? 'bg-gray-50/60'
                    : '';

                return (
                  <div
                    key={slotKey}
                    className={`absolute left-0 right-0 ${borderClass} ${bgClass}`}
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
                    onContextMenu={handleSlotContextMenu(col.dateStr, timeStr)}
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
                      onResize={onAppointmentResize}
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
                const isResizingThis = resizingBlock?.id === block.id;
                const effectiveDuration = isResizingThis ? resizingBlock!.previewDuration : block.duration_minutes;
                const topPx = ((blockHour - startHour) * 60 + blockMin) * PX_PER_MINUTE;
                const heightPx = Math.max(effectiveDuration * PX_PER_MINUTE, 24);
                const h12 = blockHour === 0 ? 12 : blockHour > 12 ? blockHour - 12 : blockHour;
                const suffix = blockHour >= 12 ? 'p' : 'a';
                const minutesPart = parseInt(mStr || '0', 10);
                const startLabel = minutesPart === 0 ? `${h12}${suffix}` : `${h12}:${mStr.padStart(2, '0')}${suffix}`;
                // Compute end label for the ghost preview during resize.
                let timeLabel = startLabel;
                if (isResizingThis) {
                  const endTotal = blockHour * 60 + blockMin + effectiveDuration;
                  const endH = Math.floor(endTotal / 60) % 24;
                  const endM = endTotal % 60;
                  const endH12 = endH === 0 ? 12 : endH > 12 ? endH - 12 : endH;
                  const endSuffix = endH >= 12 ? 'p' : 'a';
                  const endLabel = endM === 0 ? `${endH12}${endSuffix}` : `${endH12}:${endM.toString().padStart(2, '0')}${endSuffix}`;
                  timeLabel = `${startLabel} → ${endLabel}`;
                }
                const isDone = block.completed === 1;

                return (
                  <div
                    key={`block-${block.id}`}
                    className={`group/block absolute left-1 right-1 z-10 rounded px-2 py-1 overflow-visible ${isResizingThis ? 'cursor-ns-resize ring-2 ring-slate-400' : 'cursor-grab'} ${
                      isDone
                        ? 'bg-slate-50 border-l-2 border-l-emerald-400 text-slate-400'
                        : 'bg-slate-100 border-l-2 border-l-slate-400 text-slate-600 hover:bg-slate-200/70'
                    }`}
                    style={{
                      top: topPx,
                      height: heightPx,
                      // Disable pointer events on ALL blocks while dragging a block,
                      // so the drop falls through to the underlying slot div
                      pointerEvents: draggingBlockId !== null ? 'none' : undefined,
                    }}
                    title={`Admin: ${block.title}${isDone ? ' (Done)' : ''}`}
                    draggable={!isResizingThis}
                    onDragStart={(e) => {
                      e.dataTransfer.setData('application/block-id', block.id.toString());
                      e.dataTransfer.effectAllowed = 'move';
                      // Use setTimeout so the drag ghost is captured before pointer-events: none kicks in
                      setTimeout(() => setDraggingBlockId(block.id), 0);
                    }}
                    onDragEnd={() => setDraggingBlockId(null)}
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
                    <div className={`text-[10px] font-medium truncate pr-10 ${isDone ? 'line-through opacity-60' : ''} ${isResizingThis ? 'text-slate-700' : ''}`}>{timeLabel}</div>
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
                    {/* Resize handle — drag the bottom edge to lengthen/shorten the block */}
                    {onBlockResize && (
                      <div
                        className="absolute left-0 right-0 bottom-0 h-2 cursor-ns-resize hover:bg-slate-400/30 transition-colors"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setResizingBlock({
                            id: block.id,
                            startY: e.clientY,
                            startDuration: block.duration_minutes,
                            previewDuration: block.duration_minutes,
                          });
                        }}
                        onClick={(e) => e.stopPropagation()}
                        title="Drag to resize"
                      />
                    )}
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

        {/* Empty-state coaching: only when nothing is on the calendar across all visible columns.
            Positioned just below the auto-scroll-to-8am landing so it's visible immediately on mount. */}
        {appointments.length === 0 && calendarBlocks.length === 0 && (
          <div
            className="absolute pointer-events-none flex justify-center"
            style={{
              left: 60,
              right: 0,
              top: (WORK_START_HOUR - startHour) * SLOTS_PER_HOUR * SLOT_HEIGHT + 32,
            }}
          >
            <div className="flex items-center gap-2 bg-white/90 backdrop-blur px-4 py-2 rounded-full border border-dashed border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] shadow-sm">
              <MousePointerClick size={15} className="text-[var(--color-primary)]/70" />
              <span>Click any time slot to schedule</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
