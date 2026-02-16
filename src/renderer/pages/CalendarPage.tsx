import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useLocalPreference } from '../hooks/useLocalPreference';
import {
  format,
  startOfWeek,
  endOfWeek,
  addDays,
  addWeeks,
  addMonths,
  startOfMonth,
  endOfMonth,
} from 'date-fns';
import { useNavigate, useLocation } from 'react-router-dom';
import { Copy, Clipboard, Edit3, Trash2, X, Ban, AlertTriangle, ListTodo, ChevronRight, GripVertical, CheckCircle2, Undo2, Plus, FileText, Link2, Check, UserPlus, Lock } from 'lucide-react';
import type { Appointment, Invoice, InvoiceItem, DashboardTodo, CalendarBlock, QuickLink } from '../../shared/types';
import { useTier } from '../hooks/useTier';
import WaitlistPanel from '../components/WaitlistPanel';
import type { PaymentIndicator } from '../components/calendar/AppointmentBlock';
import AppointmentModal from '../components/AppointmentModal';
import TrialExpiredModal from '../components/TrialExpiredModal';
import { useTrialGuard } from '../hooks/useTrialGuard';
import CalendarToolbar from '../components/calendar/CalendarToolbar';
import DayView from '../components/calendar/DayView';
import WeekView from '../components/calendar/WeekView';
import MonthView from '../components/calendar/MonthView';

type CalendarView = 'day' | 'week' | 'month';

// Clipboard data for copy/paste
interface ClipboardAppointment {
  client_id: number;
  entity_id?: number | null;
  entity_rate?: number | null;
  duration_minutes: number;
  status: string;
  clientName: string;
}

// Context menu state
interface ContextMenu {
  x: number;
  y: number;
  appointment: Appointment;
}

// Block context menu state
interface BlockContextMenu {
  x: number;
  y: number;
  block: CalendarBlock;
}

export default function CalendarPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { guardAction, showExpiredModal, dismissExpiredModal } = useTrialGuard();
  const routeState = (location.state as { date?: string; view?: CalendarView }) || {};
  const [currentView, setCurrentView] = useState<CalendarView>(routeState.view || 'week');
  const [currentDate, setCurrentDate] = useState(() => {
    if (routeState.date) return new Date(routeState.date + 'T00:00:00');
    return new Date();
  });
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingAppointment, setEditingAppointment] = useState<Appointment | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | undefined>(undefined);
  const [selectedTime, setSelectedTime] = useState<string | undefined>(undefined);
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentStatusMap, setPaymentStatusMap] = useState<Record<number, PaymentIndicator>>({});

  // Copy/paste state
  const [clipboardAppt, setClipboardAppt] = useState<ClipboardAppointment | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);
  const contextMenuRef = useRef<HTMLDivElement>(null);

  // Todo sidebar state — persisted
  const [todoSidebarOpen, setTodoSidebarOpen] = useLocalPreference('calendar-sidebar-open', false);
  const [incompleteTodos, setIncompleteTodos] = useState<DashboardTodo[]>([]);

  // Payment badge toggle — OFF by default
  const [showBilling, setShowBilling] = useLocalPreference('calendar-show-billing', false);

  // Sidebar tab state
  type SidebarTab = 'tasks' | 'scratchpad' | 'links' | 'waitlist';
  const [sidebarTab, setSidebarTab] = useState<SidebarTab>('tasks');
  const { hasFeature } = useTier();
  const canAccessWaitlist = hasFeature('waitlist');
  const [newTodoText, setNewTodoText] = useState('');

  // Scratchpad state
  const [scratchpadContent, setScratchpadContent] = useState('');
  const [scratchpadSaving, setScratchpadSaving] = useState(false);
  const scratchpadTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Links state
  const [quickLinks, setQuickLinks] = useState<QuickLink[]>([]);
  const [newLinkTitle, setNewLinkTitle] = useState('');
  const [newLinkUrl, setNewLinkUrl] = useState('');

  // Calendar blocks (admin time blocks — separate from appointments)
  const [calendarBlocks, setCalendarBlocks] = useState<CalendarBlock[]>([]);

  // Block context menu state
  const [blockContextMenu, setBlockContextMenu] = useState<BlockContextMenu | null>(null);

  // Compute date range based on current view
  const getDateRange = useCallback((): { startDate: string; endDate: string } => {
    switch (currentView) {
      case 'day': {
        const dayStr = format(currentDate, 'yyyy-MM-dd');
        return { startDate: dayStr, endDate: dayStr };
      }
      case 'week': {
        const ws = startOfWeek(currentDate, { weekStartsOn: 1 });
        const we = endOfWeek(currentDate, { weekStartsOn: 1 });
        return { startDate: format(ws, 'yyyy-MM-dd'), endDate: format(we, 'yyyy-MM-dd') };
      }
      case 'month': {
        const ms = startOfWeek(startOfMonth(currentDate), { weekStartsOn: 1 });
        const me = endOfWeek(endOfMonth(currentDate), { weekStartsOn: 1 });
        return { startDate: format(ms, 'yyyy-MM-dd'), endDate: format(me, 'yyyy-MM-dd') };
      }
    }
  }, [currentView, currentDate]);

  const loadAppointments = useCallback(async () => {
    try {
      setLoading(true);
      const { startDate, endDate } = getDateRange();
      const result = await window.api.appointments.list({ startDate, endDate });
      setAppointments(result);

      // Build payment status map for completed appointments
      const statusMap: Record<number, PaymentIndicator> = {};
      const completedWithNotes = result.filter(a => a.note_id && a.status === 'completed');
      if (completedWithNotes.length > 0) {
        try {
          const invoices = await window.api.invoices.list({ startDate, endDate });
          // Build a set of note_ids that have paid invoices vs unpaid
          const notePaymentStatus = new Map<number, 'paid' | 'unpaid'>();
          for (const inv of invoices) {
            try {
              const full = await window.api.invoices.get(inv.id);
              for (const item of full.items) {
                if (item.note_id) {
                  if (inv.status === 'paid') {
                    notePaymentStatus.set(item.note_id, 'paid');
                  } else if (!notePaymentStatus.has(item.note_id)) {
                    notePaymentStatus.set(item.note_id, 'unpaid');
                  }
                }
              }
            } catch {}
          }
          for (const appt of completedWithNotes) {
            if (appt.note_id && notePaymentStatus.has(appt.note_id)) {
              statusMap[appt.id] = notePaymentStatus.get(appt.note_id)!;
            } else if (appt.note_id) {
              // Has a note but no invoice yet — mark as unpaid
              statusMap[appt.id] = 'unpaid';
            }
          }
        } catch {
          // Invoice lookup failed — don't show indicators
        }
      }
      setPaymentStatusMap(statusMap);
    } catch (err) {
      console.error('Failed to load appointments:', err);
    } finally {
      setLoading(false);
    }
  }, [getDateRange]);

  // Load calendar blocks (admin time blocks)
  const loadCalendarBlocks = useCallback(async () => {
    try {
      const { startDate, endDate } = getDateRange();
      const blocks = await window.api.calendarBlocks.list({ startDate, endDate });
      setCalendarBlocks(blocks);
    } catch (err) {
      console.error('Failed to load calendar blocks:', err);
    }
  }, [getDateRange]);

  useEffect(() => {
    loadAppointments();
    loadCalendarBlocks();
  }, [loadAppointments, loadCalendarBlocks]);

  // Navigation
  const handleNavigate = (direction: 'prev' | 'next' | 'today') => {
    if (direction === 'today') {
      setCurrentDate(new Date());
      return;
    }
    const delta = direction === 'prev' ? -1 : 1;
    switch (currentView) {
      case 'day':
        setCurrentDate((d) => addDays(d, delta));
        break;
      case 'week':
        setCurrentDate((d) => addWeeks(d, delta));
        break;
      case 'month':
        setCurrentDate((d) => addMonths(d, delta));
        break;
    }
  };

  // Date label
  const getDateLabel = (): string => {
    switch (currentView) {
      case 'day':
        return format(currentDate, 'EEEE, MMMM d, yyyy');
      case 'week': {
        const ws = startOfWeek(currentDate, { weekStartsOn: 1 });
        const we = endOfWeek(currentDate, { weekStartsOn: 1 });
        return `${format(ws, 'MMM d')} - ${format(we, 'MMM d, yyyy')}`;
      }
      case 'month':
        return format(currentDate, 'MMMM yyyy');
    }
  };

  // Search filter
  const filteredAppointments = searchQuery.trim()
    ? appointments.filter((appt) => {
        const fullName = `${appt.first_name || ''} ${appt.last_name || ''}`.toLowerCase();
        return fullName.includes(searchQuery.toLowerCase());
      })
    : appointments;

  // Left-click appointment — open edit modal
  const handleAppointmentClick = (appt: Appointment) => {
    if (!guardAction()) return;
    setEditingAppointment(appt);
    setSelectedDate(undefined);
    setSelectedTime(undefined);
    setModalOpen(true);
  };

  // Note icon click — route by session type (preserves all original navigation logic)
  const handleNoteClick = (appt: Appointment) => {
    const sessionType = appt.session_type || 'visit';

    // If eval is already linked, go directly to it
    if (appt.evaluation_id) {
      navigate(`/clients/${appt.client_id}/eval/${appt.evaluation_id}`);
      return;
    }

    if (appt.status === 'completed' && appt.note_id) {
      navigate(`/clients/${appt.client_id}/note/${appt.note_id}`);
    } else if (sessionType === 'eval' && appt.client_id) {
      navigate(`/clients/${appt.client_id}/eval/new?type=initial`, {
        state: {
          appointmentId: appt.id,
          appointmentDate: appt.scheduled_date,
        },
      });
    } else if (sessionType === 'recert' && appt.client_id) {
      navigate(`/clients/${appt.client_id}/eval/new?type=reassessment`, {
        state: {
          appointmentId: appt.id,
          appointmentDate: appt.scheduled_date,
        },
      });
    } else if (appt.status === 'completed' || appt.status === 'scheduled') {
      navigate(`/clients/${appt.client_id}/note/new`, {
        state: {
          appointmentId: appt.id,
          appointmentDate: appt.scheduled_date,
          appointmentTime: appt.scheduled_time,
          appointmentDuration: appt.duration_minutes,
        },
      });
    }
  };

  // Add appointment (from button)
  const handleAddAppointment = () => {
    if (!guardAction()) return;
    setEditingAppointment(null);
    setSelectedDate(undefined);
    setSelectedTime(undefined);
    setModalOpen(true);
  };

  // Slot click on time grid
  const handleSlotClick = (date: string, time: string) => {
    if (!guardAction()) return;
    setEditingAppointment(null);
    setSelectedDate(date);
    setSelectedTime(time);
    setModalOpen(true);
  };

  // Save appointment
  const handleSaveAppointment = async (data: Partial<Appointment>) => {
    if (editingAppointment) {
      await window.api.appointments.update(editingAppointment.id, data);
    } else {
      await window.api.appointments.create(data);
    }
    await loadAppointments();
  };

  // Load incomplete todos for sidebar
  const loadIncompleteTodos = useCallback(async () => {
    const todos = await window.api.dashboardTodos.listIncomplete();
    setIncompleteTodos(todos);
  }, []);

  useEffect(() => {
    if (todoSidebarOpen) loadIncompleteTodos();
  }, [todoSidebarOpen, loadIncompleteTodos]);

  // ── Sidebar: Task CRUD ──
  const handleAddTodo = async () => {
    const text = newTodoText.trim();
    if (!text) return;
    await window.api.dashboardTodos.create(text);
    setNewTodoText('');
    await loadIncompleteTodos();
  };

  const handleToggleTodo = async (todo: DashboardTodo) => {
    await window.api.dashboardTodos.update(todo.id, { completed: todo.completed ? 0 : 1 });
    await loadIncompleteTodos();
  };

  const handleDeleteTodo = async (id: number) => {
    await window.api.dashboardTodos.delete(id);
    await loadIncompleteTodos();
  };

  // ── Sidebar: Scratchpad ──
  const loadScratchpad = async () => {
    const note = await window.api.scratchpad.get();
    setScratchpadContent(note?.content || '');
  };

  const handleScratchpadChange = (val: string) => {
    setScratchpadContent(val);
    setScratchpadSaving(true);
    if (scratchpadTimerRef.current) clearTimeout(scratchpadTimerRef.current);
    scratchpadTimerRef.current = setTimeout(async () => {
      await window.api.scratchpad.save(val);
      setScratchpadSaving(false);
    }, 500);
  };

  // ── Sidebar: Quick Links ──
  const loadQuickLinks = async () => {
    const result = await window.api.quickLinks.list();
    setQuickLinks(result);
  };

  const handleAddLink = async () => {
    let url = newLinkUrl.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    const title = newLinkTitle.trim();
    await window.api.quickLinks.create({ title: title || url, url });
    setNewLinkTitle('');
    setNewLinkUrl('');
    await loadQuickLinks();
  };

  const handleDeleteLink = async (id: number) => {
    await window.api.quickLinks.delete(id);
    await loadQuickLinks();
  };

  // Load sidebar data when sidebar opens or tab changes
  useEffect(() => {
    if (!todoSidebarOpen) return;
    if (sidebarTab === 'tasks') loadIncompleteTodos();
    if (sidebarTab === 'scratchpad') loadScratchpad();
    if (sidebarTab === 'links') loadQuickLinks();
  }, [todoSidebarOpen, sidebarTab]);

  // Cleanup scratchpad timer on unmount
  useEffect(() => {
    return () => {
      if (scratchpadTimerRef.current) clearTimeout(scratchpadTimerRef.current);
    };
  }, []);

  // Handle todo dropped onto calendar — create admin block (NOT an appointment)
  const handleTodoDrop = async (todoId: number, date: string, time?: string) => {
    const todo = incompleteTodos.find((t) => t.id === todoId);
    if (!todo) return;
    // Create calendar block in separate non-clinical table
    await window.api.calendarBlocks.create({
      title: todo.text,
      scheduled_date: date,
      scheduled_time: time || '09:00',
      duration_minutes: 30,
      source_todo_id: todo.id,
    });
    // Mark todo as completed
    await window.api.dashboardTodos.update(todoId, { completed: 1 });
    await loadCalendarBlocks();
    await loadIncompleteTodos();
  };

  // Drag calendar block to new time/date
  const handleBlockDrop = async (blockId: number, newDate: string, newTime: string) => {
    await window.api.calendarBlocks.update(blockId, {
      scheduled_date: newDate,
      scheduled_time: newTime,
    });
    await loadCalendarBlocks();
  };

  // Drag and drop
  const handleAppointmentDrop = async (apptId: number, newDate: string, newTime?: string) => {
    const appt = appointments.find((a) => a.id === apptId);
    if (!appt) return;

    const updateData: Partial<Appointment> = {
      client_id: appt.client_id,
      scheduled_date: newDate,
      scheduled_time: newTime || appt.scheduled_time,
      duration_minutes: appt.duration_minutes,
      status: appt.status,
    };

    await window.api.appointments.update(apptId, updateData);
    await loadAppointments();
  };

  // Batch save for recurring appointments
  const handleSaveBatch = async (items: Partial<Appointment>[]) => {
    await window.api.appointments.createBatch(items);
    await loadAppointments();
  };

  // Context menu for appointments
  const handleAppointmentContextMenu = useCallback((appt: Appointment, x: number, y: number) => {
    setContextMenu({ x, y, appointment: appt });
  }, []);

  // Block context menu handler
  const handleBlockContextMenu = useCallback((block: CalendarBlock, x: number, y: number) => {
    setBlockContextMenu({ x, y, block });
    setContextMenu(null); // Close appointment menu if open
  }, []);

  // Block actions
  const handleToggleBlockDone = async (block: CalendarBlock) => {
    setBlockContextMenu(null);
    await window.api.calendarBlocks.update(block.id, { completed: block.completed ? 0 : 1 });
    await loadCalendarBlocks();
  };

  const handleDeleteAndRestoreBlock = async (block: CalendarBlock) => {
    setBlockContextMenu(null);
    await window.api.calendarBlocks.deleteAndRestore(block.id);
    await loadCalendarBlocks();
    await loadIncompleteTodos();
  };

  const handleDeleteBlock = async (block: CalendarBlock) => {
    setBlockContextMenu(null);
    await window.api.calendarBlocks.delete(block.id);
    await loadCalendarBlocks();
  };

  // Inline block remove (X button): if linked to a todo, restore it; otherwise just delete
  const handleBlockRemoveInline = async (block: CalendarBlock) => {
    if (block.source_todo_id) {
      await window.api.calendarBlocks.deleteAndRestore(block.id);
      await loadCalendarBlocks();
      await loadIncompleteTodos();
    } else {
      await window.api.calendarBlocks.delete(block.id);
      await loadCalendarBlocks();
    }
  };

  // Close context menu on click outside
  useEffect(() => {
    const handleClick = () => {
      setContextMenu(null);
      setBlockContextMenu(null);
    };
    if (contextMenu || blockContextMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [contextMenu, blockContextMenu]);

  // Copy appointment to clipboard
  const handleCopyAppointment = (appt: Appointment) => {
    const clientName = appt.entity_name
      ? appt.entity_name
      : `${appt.first_name || 'Unknown'} ${appt.last_name || ''}`.trim();
    setClipboardAppt({
      client_id: appt.client_id,
      entity_id: appt.entity_id,
      entity_rate: appt.entity_rate,
      duration_minutes: appt.duration_minutes,
      status: 'scheduled',
      clientName,
    });
    setContextMenu(null);
  };

  // Edit appointment from context menu
  const handleEditAppointment = (appt: Appointment) => {
    setEditingAppointment(appt);
    setSelectedDate(undefined);
    setSelectedTime(undefined);
    setModalOpen(true);
    setContextMenu(null);
  };

  // Delete appointment from context menu
  const handleDeleteAppointment = async (appt: Appointment) => {
    setContextMenu(null);
    if (window.confirm(`Delete appointment for ${appt.first_name || appt.entity_name || 'this client'}?`)) {
      await window.api.appointments.delete(appt.id);
      await loadAppointments();
    }
  };

  // Cancel appointment with optional late cancel fee
  const handleCancelAppointment = async (appt: Appointment) => {
    setContextMenu(null);
    const name = appt.first_name || appt.entity_name || 'this client';
    if (!window.confirm(`Mark appointment for ${name} as cancelled?`)) return;

    await window.api.appointments.update(appt.id, {
      ...appt,
      status: 'cancelled',
      cancelled_at: new Date().toISOString(),
      late_cancel: true,
    });

    // Check for late cancel fee setting
    try {
      const feeStr = await window.api.settings.get('late_cancel_fee');
      const fee = parseFloat(feeStr || '0');
      if (fee > 0) {
        const charge = window.confirm(`Charge late cancellation fee of $${fee.toFixed(2)}?`);
        if (charge) {
          await window.api.invoices.createFeeInvoice({
            client_id: appt.client_id || undefined,
            entity_id: appt.entity_id || undefined,
            description: 'Late Cancellation Fee',
            amount: fee,
            service_date: appt.scheduled_date,
          });
        }
      }
    } catch {}
    await loadAppointments();
  };

  // No-show with optional fee
  const handleNoShow = async (appt: Appointment) => {
    setContextMenu(null);
    const name = appt.first_name || appt.entity_name || 'this client';
    if (!window.confirm(`Mark appointment for ${name} as no-show?`)) return;

    await window.api.appointments.update(appt.id, {
      ...appt,
      status: 'no-show',
    });

    // Check for no-show fee setting
    try {
      const feeStr = await window.api.settings.get('no_show_fee');
      const fee = parseFloat(feeStr || '0');
      if (fee > 0) {
        const charge = window.confirm(`Charge no-show fee of $${fee.toFixed(2)}?`);
        if (charge) {
          await window.api.invoices.createFeeInvoice({
            client_id: appt.client_id || undefined,
            entity_id: appt.entity_id || undefined,
            description: 'No-Show Fee',
            amount: fee,
            service_date: appt.scheduled_date,
          });
        }
      }
    } catch {}
    await loadAppointments();
  };

  // Paste appointment on slot click (override normal slot click when clipboard has data)
  const handleSlotClickWithPaste = (date: string, time: string) => {
    if (clipboardAppt) {
      // Paste the copied appointment at this slot
      const pasteData: Partial<Appointment> = {
        client_id: clipboardAppt.client_id,
        entity_id: clipboardAppt.entity_id,
        entity_rate: clipboardAppt.entity_rate,
        duration_minutes: clipboardAppt.duration_minutes,
        scheduled_date: date,
        scheduled_time: time,
        status: 'scheduled',
      };
      window.api.appointments.create(pasteData).then(() => loadAppointments());
      return;
    }
    // Normal slot click behavior
    handleSlotClick(date, time);
  };

  // Day click in month view
  const handleDayClick = (day: Date) => {
    setCurrentDate(day);
    setCurrentView('day');
  };

  const weekStart = startOfWeek(currentDate, { weekStartsOn: 1 });

  return (
    <div className="p-6 h-screen flex flex-col">
      <CalendarToolbar
        currentView={currentView}
        onViewChange={setCurrentView}
        currentDate={currentDate}
        onNavigate={handleNavigate}
        dateLabel={getDateLabel()}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onAddAppointment={handleAddAppointment}
        showBilling={showBilling}
        onToggleBilling={setShowBilling}
      />

      {/* Clipboard indicator */}
      {clipboardAppt && (
        <div className="flex items-center gap-2 mt-2 px-3 py-1.5 bg-blue-50 border border-blue-200 rounded-lg text-xs text-blue-700">
          <Clipboard size={12} />
          <span className="font-medium">Copied:</span> {clipboardAppt.clientName} ({clipboardAppt.duration_minutes}min)
          <span className="text-blue-500">— Click any time slot to paste</span>
          <button
            className="ml-auto p-0.5 rounded hover:bg-blue-100 transition-colors"
            onClick={() => setClipboardAppt(null)}
            title="Clear clipboard"
          >
            <X size={12} />
          </button>
        </div>
      )}

      <div className="flex-1 overflow-hidden mt-4 flex gap-0">
        {/* Main calendar area */}
        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-64">
              <div className="text-[var(--color-text-secondary)]">Loading appointments...</div>
            </div>
          ) : currentView === 'day' ? (
            <DayView
              date={currentDate}
              appointments={filteredAppointments}
              calendarBlocks={calendarBlocks}
              onSlotClick={handleSlotClickWithPaste}
              onAppointmentClick={handleAppointmentClick}
              onNoteClick={handleNoteClick}
              onAppointmentDrop={handleAppointmentDrop}
              onBlockDrop={handleBlockDrop}
              onTodoDrop={handleTodoDrop}
              onAppointmentContextMenu={handleAppointmentContextMenu}
              onBlockContextMenu={handleBlockContextMenu}
              onBlockToggleDone={handleToggleBlockDone}
              onBlockRemove={handleBlockRemoveInline}
              paymentStatusMap={showBilling ? paymentStatusMap : {}}
            />
          ) : currentView === 'week' ? (
            <WeekView
              weekStart={weekStart}
              appointments={filteredAppointments}
              calendarBlocks={calendarBlocks}
              onSlotClick={handleSlotClickWithPaste}
              onAppointmentClick={handleAppointmentClick}
              onNoteClick={handleNoteClick}
              onAppointmentDrop={handleAppointmentDrop}
              onBlockDrop={handleBlockDrop}
              onTodoDrop={handleTodoDrop}
              onAppointmentContextMenu={handleAppointmentContextMenu}
              onBlockContextMenu={handleBlockContextMenu}
              onBlockToggleDone={handleToggleBlockDone}
              onBlockRemove={handleBlockRemoveInline}
              paymentStatusMap={showBilling ? paymentStatusMap : {}}
            />
          ) : (
            <MonthView
              currentDate={currentDate}
              appointments={filteredAppointments}
              calendarBlocks={calendarBlocks}
              onDayClick={handleDayClick}
              onAppointmentClick={handleAppointmentClick}
              onAppointmentDrop={(apptId, newDate) => handleAppointmentDrop(apptId, newDate)}
              onTodoDrop={(todoId, date) => handleTodoDrop(todoId, date)}
              onBlockContextMenu={handleBlockContextMenu}
              onBlockToggleDone={handleToggleBlockDone}
              onBlockRemove={handleBlockRemoveInline}
              paymentStatusMap={showBilling ? paymentStatusMap : {}}
            />
          )}
        </div>

        {/* Todo sidebar edge tab */}
        {!todoSidebarOpen && (
          <div className="shrink-0 relative flex items-center">
            <button
              type="button"
              className={`flex flex-col items-center gap-1 px-1.5 py-3 rounded-l-lg shadow-md transition-colors ${
                incompleteTodos.length > 0
                  ? 'bg-teal-500 hover:bg-teal-600 text-white'
                  : 'bg-gray-200 hover:bg-gray-300 text-gray-500'
              }`}
              onClick={() => setTodoSidebarOpen(true)}
              title="Quick Tools"
            >
              <ListTodo size={14} />
              {incompleteTodos.length > 0 && (
                <span className="text-[10px] font-bold bg-white text-teal-600 rounded-full w-4 h-4 flex items-center justify-center">
                  {incompleteTodos.length}
                </span>
              )}
            </button>
          </div>
        )}

        {/* Todo sidebar — full tabbed panel */}
        {todoSidebarOpen && (() => {
          const blockedTodoIds = new Set(
            calendarBlocks.filter(b => b.source_todo_id).map(b => b.source_todo_id)
          );
          const sidebarTodos = incompleteTodos.filter(t => !blockedTodoIds.has(t.id));

          return (
          <div className="shrink-0 w-64 border-l border-[var(--color-border)] bg-white flex flex-col overflow-hidden">
            {/* Tab bar */}
            <div className="flex items-center gap-1 px-2 py-2 border-b border-[var(--color-border)] bg-gray-50/80">
              {([
                { key: 'tasks' as SidebarTab, label: 'Tasks', icon: <ListTodo size={13} /> },
                { key: 'scratchpad' as SidebarTab, label: 'Pad', icon: <FileText size={13} /> },
                { key: 'links' as SidebarTab, label: 'Links', icon: <Link2 size={13} /> },
                { key: 'waitlist' as SidebarTab, label: 'Wait', icon: canAccessWaitlist ? <UserPlus size={13} /> : <><UserPlus size={13} /><Lock size={8} className="ml-0.5 opacity-60" /></> },
              ]).map((tab) => (
                <button
                  key={tab.key}
                  className={`flex items-center gap-1 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    sidebarTab === tab.key
                      ? 'bg-teal-500 text-white'
                      : 'text-[var(--color-text-secondary)] hover:bg-gray-100'
                  }`}
                  onClick={() => setSidebarTab(tab.key)}
                >
                  {tab.icon}
                  {tab.label}
                </button>
              ))}
              <div className="flex-1" />
              <button
                type="button"
                className="p-0.5 rounded hover:bg-gray-100 transition-colors"
                onClick={() => setTodoSidebarOpen(false)}
                title="Hide panel"
              >
                <ChevronRight size={14} className="text-[var(--color-text-secondary)]" />
              </button>
            </div>

            {/* ── Tasks Tab ── */}
            {sidebarTab === 'tasks' && (
              <>
                {/* Add task input */}
                <div className="px-2 py-2 border-b border-[var(--color-border)]">
                  <div className="flex items-center gap-1">
                    <input
                      type="text"
                      className="flex-1 text-xs border border-[var(--color-border)] rounded px-2 py-1.5 focus:outline-none focus:border-teal-400"
                      placeholder="Add a task..."
                      value={newTodoText}
                      onChange={(e) => setNewTodoText(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddTodo()}
                    />
                    <button
                      className="px-2 py-1.5 bg-teal-500 text-white rounded text-xs hover:bg-teal-600 transition-colors disabled:opacity-40"
                      onClick={handleAddTodo}
                      disabled={!newTodoText.trim()}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>

                {/* Task list with drag handles */}
                <div className="flex-1 overflow-y-auto px-2 py-2 space-y-0.5">
                  {sidebarTodos.length === 0 ? (
                    <div className="text-center text-[var(--color-text-secondary)] text-xs py-6">
                      No pending tasks.
                    </div>
                  ) : (
                    sidebarTodos.map((todo) => (
                      <div
                        key={todo.id}
                        className="group flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-gray-50 cursor-grab transition-colors"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('application/todo-id', todo.id.toString());
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                      >
                        {/* Drag handle */}
                        <GripVertical size={10} className="shrink-0 text-[var(--color-text-secondary)] opacity-40 group-hover:opacity-80" />

                        {/* Checkbox */}
                        <button
                          className={`w-4 h-4 rounded border flex items-center justify-center flex-shrink-0 transition-colors ${
                            todo.completed
                              ? 'bg-teal-500 border-teal-500 text-white'
                              : 'border-gray-300 hover:border-teal-400'
                          }`}
                          onClick={(e) => {
                            e.stopPropagation();
                            handleToggleTodo(todo);
                          }}
                        >
                          {todo.completed ? <Check size={10} /> : null}
                        </button>

                        {/* Task text */}
                        <span className="text-xs text-[var(--color-text)] leading-tight flex-1 truncate">
                          {todo.text}
                        </span>

                        {/* Delete */}
                        <button
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-50 text-red-400 hover:text-red-500 transition-all"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDeleteTodo(todo.id);
                          }}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))
                  )}
                </div>

                {/* Drag hint footer */}
                <div className="px-3 py-2 border-t border-[var(--color-border)] text-[10px] text-[var(--color-text-secondary)]">
                  Drag a task onto the calendar to block admin time
                </div>
              </>
            )}

            {/* ── Scratchpad Tab ── */}
            {sidebarTab === 'scratchpad' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                <div className="flex items-center justify-end px-3 py-1 text-[10px] text-[var(--color-text-secondary)]">
                  {scratchpadSaving ? 'Saving...' : 'Saved'}
                </div>
                <textarea
                  className="flex-1 w-full px-3 pb-3 text-xs text-[var(--color-text)] resize-none focus:outline-none leading-relaxed"
                  placeholder="Quick notes, reminders, anything..."
                  value={scratchpadContent}
                  onChange={(e) => handleScratchpadChange(e.target.value)}
                />
              </div>
            )}

            {/* ── Links Tab ── */}
            {sidebarTab === 'links' && (
              <div className="flex-1 flex flex-col overflow-hidden">
                {/* Add link form */}
                <div className="px-2 py-2 border-b border-[var(--color-border)] space-y-1">
                  <input
                    type="text"
                    className="w-full text-xs border border-[var(--color-border)] rounded px-2 py-1.5 focus:outline-none focus:border-teal-400"
                    placeholder="Title (optional)"
                    value={newLinkTitle}
                    onChange={(e) => setNewLinkTitle(e.target.value)}
                  />
                  <div className="flex gap-1">
                    <input
                      type="text"
                      className="flex-1 text-xs border border-[var(--color-border)] rounded px-2 py-1.5 focus:outline-none focus:border-teal-400"
                      placeholder="https://..."
                      value={newLinkUrl}
                      onChange={(e) => setNewLinkUrl(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleAddLink()}
                    />
                    <button
                      className="px-2 py-1.5 bg-teal-500 text-white rounded text-xs hover:bg-teal-600 transition-colors"
                      onClick={handleAddLink}
                    >
                      <Plus size={14} />
                    </button>
                  </div>
                </div>

                {/* Links list */}
                <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
                  {quickLinks.length === 0 ? (
                    <div className="text-center text-[var(--color-text-secondary)] text-xs py-6">
                      No saved links.
                    </div>
                  ) : (
                    quickLinks.map((link) => (
                      <div
                        key={link.id}
                        className="group flex items-center gap-1.5 px-2 py-1.5 rounded hover:bg-gray-50 transition-colors"
                      >
                        <button
                          className="flex-1 text-left text-xs text-teal-600 hover:text-teal-700 truncate"
                          onClick={() => window.api.shell.openExternal(link.url)}
                          title={link.url}
                        >
                          {link.title || link.url}
                        </button>
                        <button
                          className="opacity-0 group-hover:opacity-100 p-0.5 rounded hover:bg-red-50 text-red-400 hover:text-red-500 transition-all"
                          onClick={() => handleDeleteLink(link.id)}
                        >
                          <Trash2 size={12} />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {sidebarTab === 'waitlist' && (
              canAccessWaitlist ? (
                <WaitlistPanel />
              ) : (
                <div className="flex flex-col items-center justify-center h-full px-6 text-center">
                  <Lock size={24} className="text-gray-300 mb-2" />
                  <p className="text-sm font-medium text-[var(--color-text)] mb-1">Waitlist is a Pro feature</p>
                  <p className="text-xs text-[var(--color-text-secondary)] mb-3">
                    Track prospective clients and convert them to charts with one click.
                  </p>
                  <button
                    className="text-xs text-teal-600 hover:text-teal-700 font-medium"
                    onClick={() => window.location.hash = '#/settings'}
                  >
                    Upgrade to Pro
                  </button>
                </div>
              )
            )}
          </div>
          );
        })()}
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <div
          ref={contextMenuRef}
          className="fixed z-50 bg-white rounded-lg shadow-xl border border-[var(--color-border)] py-1 min-w-[160px]"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 transition-colors"
            onClick={() => handleCopyAppointment(contextMenu.appointment)}
          >
            <Copy size={14} /> Copy Appointment
          </button>
          <button
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 transition-colors"
            onClick={() => handleEditAppointment(contextMenu.appointment)}
          >
            <Edit3 size={14} /> Edit
          </button>
          <div className="border-t border-[var(--color-border)] my-1" />
          {contextMenu.appointment.status === 'scheduled' && (
            <>
              <button
                className="w-full text-left px-3 py-2 text-sm hover:bg-emerald-50 text-emerald-700 flex items-center gap-2 transition-colors"
                onClick={async () => {
                  const appt = contextMenu.appointment;
                  setContextMenu(null);
                  await window.api.appointments.update(appt.id, { ...appt, status: 'completed' });
                  await loadAppointments();
                }}
              >
                <CheckCircle2 size={14} /> Mark Attended
              </button>
              <button
                className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 text-amber-700 flex items-center gap-2 transition-colors"
                onClick={() => handleCancelAppointment(contextMenu.appointment)}
              >
                <Ban size={14} /> Late Cancel
              </button>
              <button
                className="w-full text-left px-3 py-2 text-sm hover:bg-orange-50 text-orange-700 flex items-center gap-2 transition-colors"
                onClick={() => handleNoShow(contextMenu.appointment)}
              >
                <AlertTriangle size={14} /> No-Show
              </button>
            </>
          )}
          <button
            className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 text-red-600 flex items-center gap-2 transition-colors"
            onClick={() => handleDeleteAppointment(contextMenu.appointment)}
          >
            <Trash2 size={14} /> Delete
          </button>
        </div>
      )}

      {/* Block Context Menu */}
      {blockContextMenu && (
        <div
          className="fixed z-50 bg-white rounded-lg shadow-xl border border-[var(--color-border)] py-1 min-w-[180px]"
          style={{ top: blockContextMenu.y, left: blockContextMenu.x }}
        >
          <button
            className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 transition-colors"
            onClick={() => handleToggleBlockDone(blockContextMenu.block)}
          >
            <CheckCircle2 size={14} className={blockContextMenu.block.completed ? 'text-amber-500' : 'text-emerald-500'} />
            {blockContextMenu.block.completed ? 'Mark Undone' : 'Mark Done'}
          </button>
          <div className="border-t border-[var(--color-border)] my-1" />
          {blockContextMenu.block.source_todo_id && (
            <button
              className="w-full text-left px-3 py-2 text-sm hover:bg-amber-50 text-amber-700 flex items-center gap-2 transition-colors"
              onClick={() => handleDeleteAndRestoreBlock(blockContextMenu.block)}
            >
              <Undo2 size={14} /> Remove & Restore Task
            </button>
          )}
          <button
            className="w-full text-left px-3 py-2 text-sm hover:bg-red-50 text-red-600 flex items-center gap-2 transition-colors"
            onClick={() => handleDeleteBlock(blockContextMenu.block)}
          >
            <Trash2 size={14} /> Delete Block
          </button>
        </div>
      )}

      <AppointmentModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingAppointment(null);
        }}
        onSave={handleSaveAppointment}
        onSaveBatch={handleSaveBatch}
        appointment={editingAppointment}
        defaultDate={selectedDate}
        defaultTime={selectedTime}
      />

      {/* Trial Expired Modal */}
      {showExpiredModal && <TrialExpiredModal onClose={dismissExpiredModal} />}
    </div>
  );
}
