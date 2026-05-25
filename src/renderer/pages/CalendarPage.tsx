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
import { Copy, Clipboard, Edit3, Trash2, X, Ban, AlertTriangle, ListTodo, ChevronLeft, ChevronRight, GripVertical, CheckCircle2, Undo2, Plus, FileText, Link2, Check, UserPlus, Lock, PanelRightOpen } from 'lucide-react';
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
import QuickCreatePopover from '../components/calendar/QuickCreatePopover';
import ContextMenu, { type ContextMenuItem } from '../components/ContextMenu';

type CalendarView = 'day' | 'week' | 'month';

// Clipboard data for copy/paste
interface ClipboardAppointment {
  client_id: number;
  entity_id?: number | null;
  entity_rate?: number | null;
  duration_minutes: number;
  status: string;
  clientName: string;
  patient_name?: string | null;
  visit_type?: string | null;
  session_type?: string | null;
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
  const routeState = (location.state as {
    date?: string;
    view?: CalendarView;
    prefillAppt?: { entity_id: number; contractor_patient_id: number; contractor_patient_name: string };
  }) || {};
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
  const [prefillEntityPatient, setPrefillEntityPatient] = useState<
    { entity_id: number; contractor_patient_id: number; contractor_patient_name: string } | null
  >(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentStatusMap, setPaymentStatusMap] = useState<Record<number, PaymentIndicator>>({});

  // Copy/paste state
  const [clipboardAppt, setClipboardAppt] = useState<ClipboardAppointment | null>(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null);

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

  // Empty-slot context menu state (right-click on a time slot)
  const [slotContextMenu, setSlotContextMenu] = useState<{ x: number; y: number; date: string; time: string } | null>(null);

  // Keyboard shortcut help overlay
  const [showShortcutsHelp, setShowShortcutsHelp] = useState(false);

  // Quick-create popover anchored at a slot (drag-to-create or click-to-create)
  const [quickCreate, setQuickCreate] = useState<{
    date: string;
    time: string;
    duration: number;
    anchorX: number;
    anchorY: number;
  } | null>(null);

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

  // If we navigated here with a prefill payload (e.g., from EntityDetailPage's
  // "Schedule" button on an unscheduled contractor patient), auto-open the
  // AppointmentModal with the entity + patient pre-selected.
  useEffect(() => {
    if (routeState.prefillAppt) {
      setPrefillEntityPatient(routeState.prefillAppt);
      setSelectedDate(undefined);
      setSelectedTime(undefined);
      setEditingAppointment(null);
      setModalOpen(true);
      // Clear the route state so a back-nav doesn't re-trigger the modal.
      window.history.replaceState({}, '');
    }
  }, [routeState.prefillAppt]);

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

  // Date label — kept tight to fit a single line in the toolbar. Drops redundant
  // year/month info when the range stays within the same period.
  const getDateLabel = (): string => {
    switch (currentView) {
      case 'day':
        return format(currentDate, 'EEEE, MMM d, yyyy');
      case 'week': {
        const ws = startOfWeek(currentDate, { weekStartsOn: 1 });
        const we = endOfWeek(currentDate, { weekStartsOn: 1 });
        const sameMonth = ws.getMonth() === we.getMonth() && ws.getFullYear() === we.getFullYear();
        const sameYear = ws.getFullYear() === we.getFullYear();
        if (sameMonth) return `${format(ws, 'MMM d')} – ${format(we, 'd, yyyy')}`;
        if (sameYear) return `${format(ws, 'MMM d')} – ${format(we, 'MMM d, yyyy')}`;
        return `${format(ws, 'MMM d, yyyy')} – ${format(we, 'MMM d, yyyy')}`;
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
    // Contractor appointments → ContractorNotePage
    if (appt.entity_id) {
      if (appt.note_id) {
        navigate(`/contractor-note/${appt.note_id}?appointmentId=${appt.id}`);
      } else {
        navigate(`/contractor-note/new?appointmentId=${appt.id}`);
      }
      return;
    }

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

  // Slot click on time grid — opens the FULL appointment modal. Now mostly called
  // from the right-click "New appointment here" context menu; the primary
  // single-click/drag flow goes through handleCreateAtSlot → quick-create popover.
  const handleSlotClick = (date: string, time: string) => {
    if (!guardAction()) return;
    setEditingAppointment(null);
    setSelectedDate(date);
    setSelectedTime(time);
    setModalOpen(true);
  };

  // Drag-to-create or single-click on an empty slot → open quick-create popover.
  const handleCreateAtSlot = (date: string, time: string, duration: number, anchorX: number, anchorY: number) => {
    if (!guardAction()) return;
    setQuickCreate({ date, time, duration, anchorX, anchorY });
  };

  // Save from the popover — minimum-fields appointment create.
  const handleQuickCreateSave = async ({ clientId, duration }: { clientId: number; duration: number; clientName: string }) => {
    if (!quickCreate) return;
    await window.api.appointments.create({
      client_id: clientId,
      scheduled_date: quickCreate.date,
      scheduled_time: quickCreate.time,
      duration_minutes: duration,
      status: 'scheduled',
      session_type: 'visit',
      visit_type: 'O' as any,
    });
    await loadAppointments();
    setQuickCreate(null);
  };

  // "More options" in the popover → escalate to the full modal with the popover's state.
  const handleQuickCreateMoreOptions = ({ clientId, duration }: { clientId: number | null; duration: number; clientName: string }) => {
    if (!quickCreate) return;
    setEditingAppointment(
      clientId
        ? ({ client_id: clientId, scheduled_date: quickCreate.date, scheduled_time: quickCreate.time, duration_minutes: duration, status: 'scheduled', session_type: 'visit' } as any)
        : null
    );
    setSelectedDate(quickCreate.date);
    setSelectedTime(quickCreate.time);
    setModalOpen(true);
    setQuickCreate(null);
  };

  // Save appointment.
  // NOTE: we gate on `editingAppointment?.id`, NOT just truthiness — the quick-create
  // popover's "More options" path hands the modal a partial pre-fill object (no id)
  // as editingAppointment so the form starts populated. Treating that as "edit existing"
  // would call appointments.update(undefined, data) which is a real bug.
  const handleSaveAppointment = async (data: Partial<Appointment>) => {
    if (editingAppointment?.id) {
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

  // ── Keyboard shortcuts ──
  // T = today, D/W/M = view switch, N = new appt, ← → or J/K = prev/next period, ? = help.
  // Skipped while typing in an input/textarea or when any modal/menu is open.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't interfere with browser shortcuts or any in-progress text entry.
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || target?.isContentEditable) return;
      // Bail if any modal / context menu is open — those have their own key handlers.
      if (modalOpen || contextMenu || blockContextMenu || slotContextMenu) return;

      switch (e.key) {
        case 't':
        case 'T':
          handleNavigate('today');
          e.preventDefault();
          break;
        case 'd':
        case 'D':
          setCurrentView('day');
          e.preventDefault();
          break;
        case 'w':
        case 'W':
          setCurrentView('week');
          e.preventDefault();
          break;
        case 'm':
        case 'M':
          setCurrentView('month');
          e.preventDefault();
          break;
        case 'n':
        case 'N':
          handleAddAppointment();
          e.preventDefault();
          break;
        case 'ArrowLeft':
        case 'j':
        case 'J':
          handleNavigate('prev');
          e.preventDefault();
          break;
        case 'ArrowRight':
        case 'k':
        case 'K':
          handleNavigate('next');
          e.preventDefault();
          break;
        case '?':
          setShowShortcutsHelp((s) => !s);
          e.preventDefault();
          break;
        case 'Escape':
          if (showShortcutsHelp) {
            setShowShortcutsHelp(false);
            e.preventDefault();
          }
          break;
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [modalOpen, contextMenu, blockContextMenu, slotContextMenu, showShortcutsHelp]);

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

  // Drag-resize the bottom edge of a calendar block — same UX as appointments.
  const handleBlockResize = async (blockId: number, durationMinutes: number) => {
    await window.api.calendarBlocks.update(blockId, { duration_minutes: durationMinutes });
    await loadCalendarBlocks();
  };

  // Drag and drop
  const handleAppointmentDrop = async (apptId: number, newDate: string, newTime?: string) => {
    const appt = appointments.find((a) => a.id === apptId);
    if (!appt) return;

    const updateData: Partial<Appointment> = {
      ...appt,
      scheduled_date: newDate,
      scheduled_time: newTime || appt.scheduled_time,
    };

    await window.api.appointments.update(apptId, updateData);
    await loadAppointments();
  };

  // Drag-resize from the bottom edge of an appointment block.
  const handleAppointmentResize = async (apptId: number, durationMinutes: number) => {
    const appt = appointments.find((a) => a.id === apptId);
    if (!appt) return;
    await window.api.appointments.update(apptId, { ...appt, duration_minutes: durationMinutes });
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
    setBlockContextMenu(null);
    setSlotContextMenu(null);
  }, []);

  // Block context menu handler
  const handleBlockContextMenu = useCallback((block: CalendarBlock, x: number, y: number) => {
    setBlockContextMenu({ x, y, block });
    setContextMenu(null);
    setSlotContextMenu(null);
  }, []);

  // Empty-slot right-click handler — opens a small menu with "New appointment" + "Paste" (when clipboard has data)
  const handleSlotContextMenu = useCallback((date: string, time: string, x: number, y: number) => {
    setSlotContextMenu({ x, y, date, time });
    setContextMenu(null);
    setBlockContextMenu(null);
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
      patient_name: (appt as any).patient_name ?? null,
      visit_type: (appt as any).visit_type ?? null,
      session_type: (appt as any).session_type ?? null,
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

  // Paste the copied appointment at the given slot. Triggered from the slot context menu (not from a stray left-click).
  const handlePasteAppointment = async (date: string, time: string) => {
    if (!clipboardAppt) return;
    setSlotContextMenu(null);
    const pasteData: Partial<Appointment> = {
      client_id: clipboardAppt.client_id,
      entity_id: clipboardAppt.entity_id,
      entity_rate: clipboardAppt.entity_rate,
      duration_minutes: clipboardAppt.duration_minutes,
      scheduled_date: date,
      scheduled_time: time,
      status: 'scheduled',
      patient_name: clipboardAppt.patient_name ?? '',
      visit_type: (clipboardAppt.visit_type ?? 'O') as any,
      session_type: (clipboardAppt.session_type ?? 'visit') as any,
    };
    await window.api.appointments.create(pasteData);
    await loadAppointments();
    setClipboardAppt(null);
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
          <span className="text-blue-500">— Right-click a time slot and choose Paste</span>
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
              onSlotClick={handleSlotClick}
              onAppointmentClick={handleAppointmentClick}
              onNoteClick={handleNoteClick}
              onAppointmentDrop={handleAppointmentDrop}
              onBlockDrop={handleBlockDrop}
              onTodoDrop={handleTodoDrop}
              onAppointmentContextMenu={handleAppointmentContextMenu}
              onBlockContextMenu={handleBlockContextMenu}
              onSlotContextMenu={handleSlotContextMenu}
              onAppointmentResize={handleAppointmentResize}
              onBlockResize={handleBlockResize}
              onBlockToggleDone={handleToggleBlockDone}
              onBlockRemove={handleBlockRemoveInline}
              onCreateAtSlot={handleCreateAtSlot}
              paymentStatusMap={showBilling ? paymentStatusMap : {}}
            />
          ) : currentView === 'week' ? (
            <WeekView
              weekStart={weekStart}
              appointments={filteredAppointments}
              calendarBlocks={calendarBlocks}
              onSlotClick={handleSlotClick}
              onAppointmentClick={handleAppointmentClick}
              onNoteClick={handleNoteClick}
              onAppointmentDrop={handleAppointmentDrop}
              onBlockDrop={handleBlockDrop}
              onTodoDrop={handleTodoDrop}
              onAppointmentContextMenu={handleAppointmentContextMenu}
              onBlockContextMenu={handleBlockContextMenu}
              onSlotContextMenu={handleSlotContextMenu}
              onAppointmentResize={handleAppointmentResize}
              onBlockResize={handleBlockResize}
              onBlockToggleDone={handleToggleBlockDone}
              onBlockRemove={handleBlockRemoveInline}
              onCreateAtSlot={handleCreateAtSlot}
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

        {/* ── Sidebar panel (collapsible) ── */}
        {(() => {
          const blockedTodoIds = new Set(
            calendarBlocks.filter(b => b.source_todo_id).map(b => b.source_todo_id)
          );
          const sidebarTodos = incompleteTodos.filter(t => !blockedTodoIds.has(t.id));

          const sidebarTabs: { key: SidebarTab; label: string; icon: React.ReactNode }[] = [
            { key: 'tasks', label: 'Tasks', icon: <ListTodo size={15} /> },
            { key: 'scratchpad', label: 'Pad', icon: <FileText size={15} /> },
            { key: 'links', label: 'Links', icon: <Link2 size={15} /> },
            { key: 'waitlist', label: 'Waitlist', icon: canAccessWaitlist ? <UserPlus size={15} /> : <><UserPlus size={15} /><Lock size={9} className="absolute -bottom-0.5 -right-0.5" /></> },
          ];

          return (
          <div
            className={`shrink-0 border-l border-[var(--color-border)] bg-white flex flex-col overflow-hidden transition-all duration-200 ease-in-out ${
              todoSidebarOpen ? 'w-72' : 'w-11'
            }`}
          >
            {/* ── Collapsed: icon rail ── */}
            {!todoSidebarOpen && (
              <div className="flex flex-col items-center py-2 gap-1">
                <button
                  type="button"
                  className="p-1.5 rounded-md hover:bg-gray-100 text-[var(--color-text-secondary)] hover:text-teal-600 transition-colors"
                  onClick={() => setTodoSidebarOpen(true)}
                  title="Open sidebar"
                >
                  <PanelRightOpen size={16} />
                </button>
                <div className="w-5 border-t border-[var(--color-border)] my-0.5" />
                {sidebarTabs.map((tab) => (
                  <button
                    key={tab.key}
                    className={`relative p-1.5 rounded-md transition-colors ${
                      sidebarTab === tab.key
                        ? 'bg-teal-50 text-teal-600'
                        : 'text-[var(--color-text-secondary)] hover:bg-gray-100 hover:text-[var(--color-text)]'
                    }`}
                    onClick={() => { setSidebarTab(tab.key); setTodoSidebarOpen(true); }}
                    title={tab.label}
                  >
                    {tab.icon}
                    {tab.key === 'tasks' && incompleteTodos.length > 0 && (
                      <span className="absolute -top-0.5 -right-0.5 text-[9px] font-bold bg-teal-500 text-white rounded-full w-3.5 h-3.5 flex items-center justify-center">
                        {incompleteTodos.length > 9 ? '9+' : incompleteTodos.length}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}

            {/* ── Expanded: full panel ── */}
            {todoSidebarOpen && (
              <>
                {/* Tab bar */}
                <div className="flex items-center gap-0.5 px-2 py-1.5 border-b border-[var(--color-border)] bg-gray-50/80">
                  {sidebarTabs.map((tab) => (
                    <button
                      key={tab.key}
                      className={`relative flex items-center gap-1.5 px-2.5 py-1.5 rounded-md text-xs font-medium transition-colors ${
                        sidebarTab === tab.key
                          ? 'bg-teal-500 text-white'
                          : 'text-[var(--color-text-secondary)] hover:bg-gray-100'
                      }`}
                      onClick={() => setSidebarTab(tab.key)}
                      title={tab.label}
                    >
                      {tab.icon}
                      <span className="hidden xl:inline">{tab.label}</span>
                    </button>
                  ))}
                  <div className="flex-1" />
                  <button
                    type="button"
                    className="p-1 rounded hover:bg-gray-100 transition-colors"
                    onClick={() => setTodoSidebarOpen(false)}
                    title="Collapse sidebar"
                  >
                    <ChevronRight size={14} className="text-[var(--color-text-secondary)]" />
                  </button>
                </div>

                {/* ── Tasks Tab ── */}
                {sidebarTab === 'tasks' && (
                  <>
                    {/* Add task input */}
                    <div className="px-2.5 py-2 border-b border-[var(--color-border)]">
                      <div className="flex items-center gap-1.5">
                        <input
                          type="text"
                          className="flex-1 text-xs border border-[var(--color-border)] rounded-md px-2.5 py-1.5 focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400/30"
                          placeholder="Add a task..."
                          value={newTodoText}
                          onChange={(e) => setNewTodoText(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddTodo()}
                        />
                        <button
                          className="p-1.5 bg-teal-500 text-white rounded-md text-xs hover:bg-teal-600 transition-colors disabled:opacity-40"
                          onClick={handleAddTodo}
                          disabled={!newTodoText.trim()}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>

                    {/* Task list with drag handles */}
                    <div className="flex-1 overflow-y-auto px-1.5 py-2 space-y-0.5">
                      {sidebarTodos.length === 0 ? (
                        <div className="text-center text-[var(--color-text-secondary)] text-xs py-8 px-4">
                          No pending tasks.
                        </div>
                      ) : (
                        sidebarTodos.map((todo) => (
                          <div
                            key={todo.id}
                            className="group flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-gray-50 cursor-grab transition-colors"
                            draggable
                            onDragStart={(e) => {
                              e.dataTransfer.setData('application/todo-id', todo.id.toString());
                              e.dataTransfer.effectAllowed = 'move';
                            }}
                          >
                            <GripVertical size={10} className="shrink-0 text-[var(--color-text-secondary)] opacity-40 group-hover:opacity-80" />
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
                            <span className="text-xs text-[var(--color-text)] leading-tight flex-1 truncate">
                              {todo.text}
                            </span>
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
                      Drag a task onto the calendar to block time
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
                    <div className="px-2.5 py-2 border-b border-[var(--color-border)] space-y-1">
                      <input
                        type="text"
                        className="w-full text-xs border border-[var(--color-border)] rounded-md px-2.5 py-1.5 focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400/30"
                        placeholder="Title (optional)"
                        value={newLinkTitle}
                        onChange={(e) => setNewLinkTitle(e.target.value)}
                      />
                      <div className="flex gap-1.5">
                        <input
                          type="text"
                          className="flex-1 text-xs border border-[var(--color-border)] rounded-md px-2.5 py-1.5 focus:outline-none focus:border-teal-400 focus:ring-1 focus:ring-teal-400/30"
                          placeholder="https://..."
                          value={newLinkUrl}
                          onChange={(e) => setNewLinkUrl(e.target.value)}
                          onKeyDown={(e) => e.key === 'Enter' && handleAddLink()}
                        />
                        <button
                          className="p-1.5 bg-teal-500 text-white rounded-md text-xs hover:bg-teal-600 transition-colors"
                          onClick={handleAddLink}
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>
                    <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
                      {quickLinks.length === 0 ? (
                        <div className="text-center text-[var(--color-text-secondary)] text-xs py-8 px-4">
                          No saved links.
                        </div>
                      ) : (
                        quickLinks.map((link) => (
                          <div
                            key={link.id}
                            className="group flex items-center gap-1.5 px-2 py-1.5 rounded-md hover:bg-gray-50 transition-colors"
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

                {/* ── Waitlist Tab ── */}
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
              </>
            )}
          </div>
          );
        })()}
      </div>

      {/* Appointment Context Menu */}
      {contextMenu && (() => {
        const appt = contextMenu.appointment;
        const items: ContextMenuItem[] = [
          { label: 'Copy Appointment', icon: <Copy size={14} />, onClick: () => handleCopyAppointment(appt) },
          { label: 'Edit', icon: <Edit3 size={14} />, onClick: () => handleEditAppointment(appt) },
          {
            label: 'Write Note',
            icon: <FileText size={14} />,
            className: 'hover:bg-blue-50 text-blue-700',
            onClick: () => { setContextMenu(null); handleNoteClick(appt); },
          },
        ];
        if (appt.status === 'scheduled') {
          items.push(
            {
              label: 'Mark Attended',
              icon: <CheckCircle2 size={14} />,
              className: 'hover:bg-emerald-50 text-emerald-700',
              dividerBefore: true,
              onClick: async () => {
                setContextMenu(null);
                await window.api.appointments.update(appt.id, { ...appt, status: 'completed' });
                await loadAppointments();
              },
            },
            {
              label: 'Late Cancel',
              icon: <Ban size={14} />,
              className: 'hover:bg-amber-50 text-amber-700',
              onClick: () => handleCancelAppointment(appt),
            },
            {
              label: 'No-Show',
              icon: <AlertTriangle size={14} />,
              className: 'hover:bg-orange-50 text-orange-700',
              onClick: () => handleNoShow(appt),
            },
          );
        }
        items.push({
          label: 'Delete',
          icon: <Trash2 size={14} />,
          className: 'hover:bg-red-50 text-red-600',
          dividerBefore: appt.status !== 'scheduled',
          onClick: () => handleDeleteAppointment(appt),
        });
        return (
          <ContextMenu
            x={contextMenu.x}
            y={contextMenu.y}
            items={items}
            onClose={() => setContextMenu(null)}
          />
        );
      })()}

      {/* Block Context Menu */}
      {blockContextMenu && (() => {
        const block = blockContextMenu.block;
        const items: ContextMenuItem[] = [
          {
            label: block.completed ? 'Mark Undone' : 'Mark Done',
            icon: <CheckCircle2 size={14} className={block.completed ? 'text-amber-500' : 'text-emerald-500'} />,
            onClick: () => handleToggleBlockDone(block),
          },
        ];
        if (block.source_todo_id) {
          items.push({
            label: 'Remove & Restore Task',
            icon: <Undo2 size={14} />,
            className: 'hover:bg-amber-50 text-amber-700',
            dividerBefore: true,
            onClick: () => handleDeleteAndRestoreBlock(block),
          });
        }
        items.push({
          label: 'Delete Block',
          icon: <Trash2 size={14} />,
          className: 'hover:bg-red-50 text-red-600',
          dividerBefore: !block.source_todo_id,
          onClick: () => handleDeleteBlock(block),
        });
        return (
          <ContextMenu
            x={blockContextMenu.x}
            y={blockContextMenu.y}
            items={items}
            onClose={() => setBlockContextMenu(null)}
          />
        );
      })()}

      {/* Slot Context Menu (right-click on an empty time slot) */}
      {slotContextMenu && (() => {
        const { date, time } = slotContextMenu;
        const items: ContextMenuItem[] = [
          {
            label: 'New appointment here',
            icon: <Plus size={14} />,
            onClick: () => { setSlotContextMenu(null); handleSlotClick(date, time); },
          },
        ];
        if (clipboardAppt) {
          items.push({
            label: `Paste "${clipboardAppt.clientName}" here`,
            icon: <Clipboard size={14} />,
            className: 'hover:bg-blue-50 text-blue-700',
            dividerBefore: true,
            onClick: () => handlePasteAppointment(date, time),
          });
        }
        return (
          <ContextMenu
            x={slotContextMenu.x}
            y={slotContextMenu.y}
            items={items}
            onClose={() => setSlotContextMenu(null)}
          />
        );
      })()}

      <AppointmentModal
        isOpen={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setEditingAppointment(null);
          setPrefillEntityPatient(null);
        }}
        onSave={handleSaveAppointment}
        onSaveBatch={handleSaveBatch}
        appointment={editingAppointment}
        defaultDate={selectedDate}
        defaultTime={selectedTime}
        prefillEntityPatient={prefillEntityPatient}
      />

      {/* Trial Expired Modal */}
      {showExpiredModal && <TrialExpiredModal onClose={dismissExpiredModal} />}

      {/* Quick-create popover (drag-to-create flow) */}
      {quickCreate && (
        <QuickCreatePopover
          anchor={{ x: quickCreate.anchorX, y: quickCreate.anchorY }}
          date={quickCreate.date}
          time={quickCreate.time}
          duration={quickCreate.duration}
          onSave={handleQuickCreateSave}
          onMoreOptions={handleQuickCreateMoreOptions}
          onClose={() => setQuickCreate(null)}
        />
      )}

      {/* Keyboard shortcut help (toggle with `?`) */}
      {showShortcutsHelp && (
        <div
          className="fixed inset-0 z-50 bg-black/30 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={() => setShowShortcutsHelp(false)}
        >
          <div
            className="bg-white rounded-lg shadow-xl max-w-md w-full p-6 border border-[var(--color-border)]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-base font-semibold text-[var(--color-text)]">Calendar shortcuts</h2>
              <button
                className="p-1 rounded hover:bg-gray-100 text-[var(--color-text-secondary)]"
                onClick={() => setShowShortcutsHelp(false)}
              >
                <X size={16} />
              </button>
            </div>
            <ul className="space-y-2 text-sm text-[var(--color-text)]">
              {[
                { keys: ['T'], label: 'Jump to today' },
                { keys: ['D'], label: 'Day view' },
                { keys: ['W'], label: 'Week view' },
                { keys: ['M'], label: 'Month view' },
                { keys: ['N'], label: 'New appointment' },
                { keys: ['←', 'J'], label: 'Previous period' },
                { keys: ['→', 'K'], label: 'Next period' },
                { keys: ['?'], label: 'Toggle this help' },
                { keys: ['Esc'], label: 'Close menu / modal' },
              ].map((row) => (
                <li key={row.label} className="flex items-center justify-between py-1.5 border-b border-[var(--color-border)] last:border-b-0">
                  <span className="text-[var(--color-text-secondary)]">{row.label}</span>
                  <span className="flex items-center gap-1">
                    {row.keys.map((k) => (
                      <kbd
                        key={k}
                        className="inline-flex items-center justify-center min-w-[24px] h-6 px-1.5 rounded border border-[var(--color-border)] bg-gray-50 text-[11px] font-mono font-semibold text-[var(--color-text)]"
                      >
                        {k}
                      </kbd>
                    ))}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-4 text-[11px] text-[var(--color-text-secondary)]">
              Shortcuts are paused while typing in any field or while a modal is open.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
