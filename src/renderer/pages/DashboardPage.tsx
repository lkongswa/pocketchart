import React, { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  PenLine,
  UserPlus,
  Clock,
  ShieldAlert,
  X,
  ClipboardList,
  DollarSign,
  CheckCircle,
  Save,
  Send,
  AlertCircle,
  AlertTriangle,
  ListTodo,
  ChevronRight,
  FileClock,
  CheckSquare,
  Square,
  ExternalLink,
} from 'lucide-react';
import type { Client, Note, Appointment, SentMessage, OutstandingBreakdown } from '../../shared/types';
import { WorkItem, loadUnsignedNoteItems, loadIncompleteEvalItems, loadMissingNoteItems } from '../utils/todoWork';

const TODO_LOADERS: Record<string, () => Promise<WorkItem[]>> = {
  evals: loadIncompleteEvalItems,
  unsigned: loadUnsignedNoteItems,
  due: loadMissingNoteItems,
};
import BasicAlertsPanel from '../components/BasicAlertsPanel';
import DashboardWorkspace from '../components/DashboardWorkspace';
import ReviewPromptCard from '../components/ReviewPromptCard';
import OnboardingChecklist from '../components/OnboardingChecklist';
import SentMessagesCard from '../components/SentMessagesCard';

interface DashboardStats {
  incompleteEvals: number;
  notesThisWeek: number;
  upcomingAppointments: number;
  unsignedNotes: number;
  outstandingBalance: number;
  unpaidInvoiceCount: number;
}

const BACKUP_REMINDER_DAYS = 7;

// Per-appointment reminder control in the Upcoming Appointments list. For client appointments
// it's a clickable airplane — click to send, click again to resend — colored by reminder status
// (faint = none yet, slate = sent, green = confirmed, amber = failed). Mirrors the calendar block.
// Contractor appointments (no client to remind) fall back to a passive/empty fixed-width slot.
function ReminderIndicator({ appt, onSend }: { appt: Appointment; onSend?: (a: Appointment) => void }) {
  const status = appt.reminder_status;

  if (onSend && appt.client_id) {
    const color =
      status === 'confirmed' ? 'text-emerald-500'
      : status === 'failed' ? 'text-amber-500'
      : status === 'sent' ? 'text-slate-400'
      : 'text-slate-300';
    const title =
      !status || status === 'none' ? 'Send appointment reminder'
      : status === 'confirmed' ? 'Confirmed by client — click to resend'
      : status === 'failed' ? 'Reminder failed — click to resend'
      : 'Reminder sent — click to resend';
    return (
      <button
        type="button"
        className={`w-6 h-6 flex items-center justify-center rounded hover:bg-teal-50 transition-colors flex-shrink-0 ${color} hover:text-teal-600`}
        title={title}
        onClick={(e) => { e.stopPropagation(); onSend(appt); }}
      >
        <Send size={14} />
      </button>
    );
  }

  // Passive fallback (contractor appts) — keeps the column aligned.
  let icon: React.ReactNode = null;
  let title = '';
  if (status === 'confirmed') {
    icon = <CheckCircle size={15} className="text-emerald-500" />;
    title = 'Reminder confirmed by client';
  } else if (status === 'sent') {
    icon = <Send size={13} className="text-slate-400" />;
    title = 'Reminder sent';
  } else if (status === 'failed') {
    icon = <AlertCircle size={15} className="text-amber-500" />;
    title = 'Reminder failed to send';
  }
  return (
    <span className="w-6 flex items-center justify-center flex-shrink-0" title={title}>
      {icon}
    </span>
  );
}

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({
    incompleteEvals: 0,
    notesThisWeek: 0,
    upcomingAppointments: 0,
    unsignedNotes: 0,
    outstandingBalance: 0,
    unpaidInvoiceCount: 0,
  });
  const [upcomingAppointments, setUpcomingAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBackupReminder, setShowBackupReminder] = useState(false);
  const [daysSinceBackup, setDaysSinceBackup] = useState<number | null>(null);
  const [backupFolder, setBackupFolder] = useState<string | null>(null);
  const [quickBackupLoading, setQuickBackupLoading] = useState(false);
  const [quickBackupSuccess, setQuickBackupSuccess] = useState(false);
  const [integrityIssues, setIntegrityIssues] = useState<{ tamperedNotes: number[]; tamperedEvals: number[] } | null>(null);
  const [reviewEligible, setReviewEligible] = useState(false);
  const [reviewMilestone, setReviewMilestone] = useState<string | null>(null);
  const [sentMessages, setSentMessages] = useState<SentMessage[]>([]);
  // null = alerts not yet loaded; number = count reported by BasicAlertsPanel (drives the rail empty state)
  const [alertCount, setAlertCount] = useState<number | null>(null);
  const [balanceBreakdown, setBalanceBreakdown] = useState<OutstandingBreakdown | null>(null);
  const [balanceExpanded, setBalanceExpanded] = useState(false);
  // Transient toast for manual reminder sends from the appointments list.
  const [toast, setToast] = useState<{ msg: string; kind: 'success' | 'error' } | null>(null);
  // Per-day expand overrides for Upcoming Appointments; unset days default to open only for today.
  const [dayOverrides, setDayOverrides] = useState<Record<string, boolean>>({});

  // To-Do dropdowns: which row is expanded, its lazily-loaded items, and checkbox state.
  const [todoExpanded, setTodoExpanded] = useState<string | null>(null);
  const [todoLists, setTodoLists] = useState<Record<string, WorkItem[] | null>>({});
  const [todoChecked, setTodoChecked] = useState<Record<string, Set<string>>>({});
  const [notesDueCount, setNotesDueCount] = useState(0);
  const todoExpandedRef = useRef<string | null>(null);
  useEffect(() => { todoExpandedRef.current = todoExpanded; }, [todoExpanded]);

  // When a pop-out note window closes, refresh the dashboard: the user likely just
  // finished a note there, so counts and the open To-Do list are stale.
  useEffect(() => {
    const off = window.api.appWindows?.onClosed?.(async () => {
      loadDashboardData();
      setTodoLists({});
      setTodoChecked({});
      const openId = todoExpandedRef.current;
      if (openId && TODO_LOADERS[openId]) {
        setTodoLists((p) => ({ ...p, [openId]: null }));
        const items = await TODO_LOADERS[openId]().catch(() => [] as WorkItem[]);
        setTodoLists((p) => ({ ...p, [openId]: items }));
      }
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadDashboardData();
    checkBackupReminder();
    runIntegrityCheck();
  }, []);

  // Review prompt: wait 30 seconds before checking eligibility (don't ambush on launch)
  useEffect(() => {
    const timer = setTimeout(async () => {
      try {
        const result = await window.api.reviewPrompts.checkEligible();
        if (result.eligible) {
          setReviewEligible(true);
          setReviewMilestone(result.milestone);
        }
      } catch {
        // Silently fail — never break dashboard over a review prompt
      }
    }, 30000);
    return () => clearTimeout(timer);
  }, []);

  const checkBackupReminder = async () => {
    try {
      const lastBackup = await window.api.settings.get('last_backup_date');
      const dismissed = await window.api.settings.get('backup_reminder_dismissed');

      // If user dismissed today, don't show again until tomorrow
      if (dismissed) {
        const dismissedDate = new Date(dismissed);
        const now = new Date();
        if (dismissedDate.toDateString() === now.toDateString()) return;
      }

      if (!lastBackup) {
        // Never backed up — check if they have any clients first
        const clients: Client[] = await window.api.clients.list();
        if (clients.length > 0) {
          setDaysSinceBackup(null);
          setShowBackupReminder(true);
        }
      } else {
        const lastDate = new Date(lastBackup);
        const now = new Date();
        const diffDays = Math.floor((now.getTime() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays >= BACKUP_REMINDER_DAYS) {
          setDaysSinceBackup(diffDays);
          setShowBackupReminder(true);
        }
      }
      // Also load backup folder for one-click backup
      const folder = await window.api.settings.get('backup_folder');
      setBackupFolder(folder || null);
    } catch (err) {
      // Silently fail — don't break the dashboard over a reminder
    }
  };

  const handleQuickBackupFromDashboard = async () => {
    try {
      setQuickBackupLoading(true);
      let succeeded = true;
      if (backupFolder) {
        // quickBackup has no cancel path — saves to the designated folder.
        await window.api.backup.quickBackup();
      } else {
        // exportManual returns null when the user cancels the save dialog. Don't claim success in that case.
        const savedPath = await window.api.backup.exportManual();
        succeeded = Boolean(savedPath);
      }
      if (succeeded) {
        setShowBackupReminder(false);
        setQuickBackupSuccess(true);
        setTimeout(() => setQuickBackupSuccess(false), 5000);
      }
    } catch (err: any) {
      console.error('Quick backup failed:', err);
      if (err?.message?.includes('BACKUP_FOLDER_NOT_FOUND') || err?.message?.includes('BACKUP_FOLDER_NOT_WRITABLE')) {
        navigate('/settings');
      }
    } finally {
      setQuickBackupLoading(false);
    }
  };

  const runIntegrityCheck = async () => {
    try {
      const results = await (window as any).api.integrity.runCheck();
      if (results.tamperedNotes.length > 0 || results.tamperedEvals.length > 0) {
        setIntegrityIssues({ tamperedNotes: results.tamperedNotes, tamperedEvals: results.tamperedEvals });
      }
    } catch (err) {
      // Silently fail — don't break the dashboard over an integrity check
    }
  };

  const dismissBackupReminder = async () => {
    setShowBackupReminder(false);
    try {
      await window.api.settings.set('backup_reminder_dismissed', new Date().toISOString());
    } catch (err) {
      // Silently fail
    }
  };

  const loadDashboardData = async () => {
    try {
      setLoading(true);

      // Get incomplete evals count and all clients
      const incompleteEvals: number = await window.api.evaluations.countIncomplete().catch(() => 0);
      const allClients: Client[] = await window.api.clients.list();

      // Calculate date boundaries
      const now = new Date();
      const today = now.toISOString().split('T')[0];

      // Start of this week (Monday)
      const dayOfWeek = now.getDay();
      const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
      const weekStart = new Date(now);
      weekStart.setDate(now.getDate() + mondayOffset);
      weekStart.setHours(0, 0, 0, 0);
      const weekStartStr = weekStart.toISOString().split('T')[0];

      // End of week (Sunday)
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekStart.getDate() + 6);
      const weekEndStr = weekEnd.toISOString().split('T')[0];

      // Count notes via the unified IPC so contractor notes are included in the stats.
      // Previously this iterated clients + notes.listByClient, which silently skipped
      // every contractor note (they have NULL client_id) — meaning the user wrote a
      // contractor note and the dashboard counters stayed at zero.
      let notesThisWeek = 0;
      let unsignedNotes = 0;
      try {
        const allNotes = await window.api.notes.listAll();
        for (const n of allNotes) {
          if (n.date_of_service >= weekStartStr && n.date_of_service <= weekEndStr) {
            notesThisWeek++;
          }
          if (!n.signed_at) unsignedNotes++;
        }
      } catch (err) {
        // If the new IPC handler isn't available yet (older asar / partial install),
        // fall back to the legacy per-client loop so we still get a count.
        console.error('notes.listAll failed; falling back to per-client iteration:', err);
        for (const client of allClients) {
          const clientNotes: Note[] = await window.api.notes.listByClient(client.id);
          for (const note of clientNotes) {
            if (note.date_of_service >= weekStartStr && note.date_of_service <= weekEndStr) {
              notesThisWeek++;
            }
            if (!note.signed_at) unsignedNotes++;
          }
        }
      }

      // Load upcoming appointments (today and forward)
      const appointments: Appointment[] = await window.api.appointments.list({
        startDate: today,
      });
      const upcoming = appointments
        .filter((appt) => appt.status === 'scheduled')
        .slice(0, 10);
      setUpcomingAppointments(upcoming);

      // Notes due = past appointments with no note started (last 30 days).
      try {
        setNotesDueCount((await loadMissingNoteItems()).length);
      } catch {
        setNotesDueCount(0);
      }

      // Recent sent messages (reminders + invoice/intake emails) for the side-by-side card.
      // Fetched here so the 2-column layout decision is made before first paint.
      try {
        const sent = await window.api.messages.listSent({ limit: 8 });
        setSentMessages(sent);
      } catch {
        setSentMessages([]);
      }

      // Outstanding balance
      const balanceData = await window.api.dashboard.getOutstandingBalance().catch(() => ({ outstanding: 0, unpaidCount: 0 }));

      // Breakdown for the collapsible balance panel (best-effort — older asar may lack the handler)
      try {
        const breakdown = await window.api.dashboard.getOutstandingBreakdown();
        setBalanceBreakdown(breakdown);
      } catch {
        setBalanceBreakdown(null);
      }

      setStats({
        incompleteEvals,
        notesThisWeek,
        upcomingAppointments: appointments.filter((a) => a.status === 'scheduled').length,
        unsignedNotes,
        outstandingBalance: balanceData.outstanding,
        unpaidInvoiceCount: balanceData.unpaidCount,
      });
    } catch (error) {
      console.error('Failed to load dashboard data:', error);
    } finally {
      setLoading(false);
    }
  };

  // Auto-dismiss the reminder toast.
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 4000);
    return () => clearTimeout(t);
  }, [toast]);

  // Manual (re)send of an appointment reminder from the dashboard airplane icon.
  const handleSendReminder = async (appt: Appointment) => {
    const name = appt.first_name || 'client';
    try {
      const res = await window.api.reminders.sendForAppointment(appt.id);
      if (res.success) {
        const via = res.channel === 'sms' ? ' via text' : res.channel === 'email' ? ' via email' : '';
        setToast({ msg: `Reminder sent to ${name}${via}.`, kind: 'success' });
      } else {
        setToast({ msg: res.error || 'Could not send reminder.', kind: 'error' });
      }
      await loadDashboardData();
    } catch (err: any) {
      setToast({ msg: err?.message || 'Could not send reminder.', kind: 'error' });
    }
  };

  const formatTime = (timeStr: string): string => {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHour = h % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  // Section header for a day's appointments — "Today · Mon, Jul 14", "Tomorrow · …", else the weekday+date.
  const formatDateHeader = (dateStr: string): string => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const label = date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
    if (date.getTime() === today.getTime()) return `Today · ${label}`;
    if (date.getTime() === tomorrow.getTime()) return `Tomorrow · ${label}`;
    return label;
  };

  // Group the (already date-sorted) upcoming appointments into day buckets, preserving order.
  const appointmentGroups: { date: string; appts: Appointment[] }[] = [];
  for (const appt of upcomingAppointments) {
    let group = appointmentGroups.find((g) => g.date === appt.scheduled_date);
    if (!group) {
      group = { date: appt.scheduled_date, appts: [] };
      appointmentGroups.push(group);
    }
    group.appts.push(appt);
  }

  // Today's local date (YYYY-MM-DD) — matches how appt.scheduled_date is stored.
  const todayStr = new Date().toLocaleDateString('en-CA');
  const isDayOpen = (date: string) => (date in dayOverrides ? dayOverrides[date] : date === todayStr);
  const toggleDay = (date: string) =>
    setDayOverrides((prev) => ({ ...prev, [date]: !isDayOpen(date) }));

  // Total items in the right-hand "Needs Attention" rail (alerts + the backup nudge).
  const backupAttentionCount = showBackupReminder ? 1 : 0;
  const totalAttention = (alertCount ?? 0) + backupAttentionCount;
  const attentionResolved = alertCount !== null; // alerts have reported back at least once
  const railEmpty = attentionResolved && totalAttention === 0;

  // Actionable work items for the "To-Do" container under the header.
  // Rows expand into a checklist; checked items open together in pop-out windows.
  const todoItems = [
    {
      id: 'evals',
      label: 'Incomplete Evals',
      count: stats.incompleteEvals,
      icon: <ClipboardList size={18} />,
      page: '/evals',
      loader: loadIncompleteEvalItems,
    },
    {
      id: 'unsigned',
      label: 'Unsigned Notes',
      count: stats.unsignedNotes,
      icon: <PenLine size={18} />,
      page: '/notes',
      loader: loadUnsignedNoteItems,
    },
    {
      id: 'due',
      label: 'Notes Due · not started',
      count: notesDueCount,
      icon: <FileClock size={18} />,
      page: '/notes',
      loader: loadMissingNoteItems,
    },
  ];

  const toggleTodoRow = async (item: (typeof todoItems)[number]) => {
    const next = todoExpanded === item.id ? null : item.id;
    setTodoExpanded(next);
    if (next && todoLists[item.id] === undefined) {
      setTodoLists((p) => ({ ...p, [item.id]: null })); // null = loading
      const items = await item.loader().catch(() => [] as WorkItem[]);
      setTodoLists((p) => ({ ...p, [item.id]: items }));
      setTodoChecked((p) => ({ ...p, [item.id]: new Set() }));
    }
  };

  const toggleTodoCheck = (rowId: string, key: string) => {
    setTodoChecked((p) => {
      const set = new Set(p[rowId] || []);
      set.has(key) ? set.delete(key) : set.add(key);
      return { ...p, [rowId]: set };
    });
  };

  const toggleTodoCheckAll = (rowId: string) => {
    const items = todoLists[rowId] || [];
    setTodoChecked((p) => {
      const all = (p[rowId]?.size || 0) === items.length && items.length > 0;
      return { ...p, [rowId]: all ? new Set() : new Set(items.map((i) => i.key)) };
    });
  };

  const openCheckedInWindows = async (rowId: string) => {
    const items = (todoLists[rowId] || []).filter((i) => todoChecked[rowId]?.has(i.key));
    for (const item of items) {
      try { await window.api.appWindows.open(item.route); } catch (err) { console.error('Failed to open window:', err); }
    }
  };

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-[var(--color-text-secondary)]">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Integrity Warning Banner (critical security alert — stays full-width up top) */}
      {integrityIssues && (
        <div className="mb-6 flex items-start gap-3 p-4 rounded-lg border border-red-300 bg-red-50 text-sm">
          <ShieldAlert size={20} className="text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-red-800">
              {integrityIssues.tamperedNotes.length + integrityIssues.tamperedEvals.length} signed document(s) have been modified outside of PocketChart.
            </p>
            <p className="text-red-700 mt-1">
              This may indicate database tampering. Signed documents should only be changed through PocketChart's amendment process. Contact support if you did not make these changes.
            </p>
          </div>
        </div>
      )}

      {/* Quick backup success */}
      {quickBackupSuccess && (
        <div className="mb-6 flex items-center gap-3 p-4 rounded-lg border border-emerald-300 bg-emerald-50 text-sm">
          <CheckCircle size={20} className="text-emerald-600 flex-shrink-0" />
          <p className="text-emerald-800 font-medium">Backup completed successfully.</p>
        </div>
      )}

      {/* Onboarding Checklist */}
      <OnboardingChecklist />

      {/* Top region: hero (title + actions + stats) on the left, Needs Attention rail on the right */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6 items-start">
        {/* Left: title, primary actions, stat pills */}
        <div className="lg:col-span-2">
          <h1 className="page-title">Dashboard</h1>
          <div className="flex items-center gap-3 mt-3">
            <button
              className="btn-primary"
              onClick={() => navigate('/clients', { state: { openNewClient: true } })}
            >
              <UserPlus size={16} className="mr-2" />
              New Client
            </button>
            <button
              className="btn-secondary"
              onClick={handleQuickBackupFromDashboard}
              disabled={quickBackupLoading}
              title={backupFolder ? `Quick backup to ${backupFolder}` : 'Choose a location to back up your data'}
            >
              <Save size={16} className="mr-2" />
              {quickBackupLoading ? 'Backing up…' : 'Backup'}
            </button>
          </div>

          {/* To-Do container — actionable work items */}
          <div className="mt-6 max-w-md rounded-xl border border-[var(--color-border)] bg-white overflow-hidden">
            <div className="flex items-center gap-2 px-4 py-2.5 border-b border-[var(--color-border)] bg-gray-50/70">
              <ListTodo size={16} className="text-teal-500" />
              <h3 className="text-sm font-semibold text-[var(--color-text)]">To-Do</h3>
            </div>
            <div className="divide-y divide-[var(--color-border)]">
              {todoItems.map((item) => {
                const done = item.count === 0;
                const expanded = todoExpanded === item.id;
                const list = todoLists[item.id];
                const checked = todoChecked[item.id] || new Set<string>();
                const allChecked = list ? list.length > 0 && checked.size === list.length : false;
                return (
                  <div key={item.id}>
                    <button
                      className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors group"
                      onClick={() => toggleTodoRow(item)}
                    >
                      <span
                        className={`flex items-center justify-center w-8 h-8 rounded-lg flex-shrink-0 ${
                          done ? 'bg-gray-100 text-gray-400' : 'bg-amber-100 text-amber-600'
                        }`}
                      >
                        {item.icon}
                      </span>
                      <span className={`text-lg font-bold w-6 text-right ${done ? 'text-gray-400' : 'text-[var(--color-text)]'}`}>
                        {item.count}
                      </span>
                      <span className="flex-1 text-sm text-[var(--color-text)]">{item.label}</span>
                      <ChevronRight
                        size={16}
                        className={`text-gray-300 group-hover:text-gray-400 flex-shrink-0 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
                      />
                    </button>

                    {expanded && (
                      <div className="border-t border-[var(--color-border)] bg-gray-50/50">
                        {list === null || list === undefined ? (
                          <p className="px-4 py-3 text-xs text-[var(--color-text-secondary)]">Loading…</p>
                        ) : list.length === 0 ? (
                          <p className="px-4 py-3 text-xs text-[var(--color-text-secondary)]">All caught up! 🎉</p>
                        ) : (
                          <>
                            <button
                              className="w-full flex items-center gap-2 px-4 py-1.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-gray-100 transition-colors"
                              onClick={() => toggleTodoCheckAll(item.id)}
                            >
                              {allChecked
                                ? <CheckSquare size={14} className="text-teal-600" />
                                : <Square size={14} />}
                              Select all ({list.length})
                            </button>
                            <div className="max-h-56 overflow-y-auto divide-y divide-[var(--color-border)]/60">
                              {list.map((w) => (
                                <button
                                  key={w.key}
                                  className="w-full flex items-center gap-2 px-4 py-1.5 text-left hover:bg-gray-100 transition-colors"
                                  onClick={() => toggleTodoCheck(item.id, w.key)}
                                >
                                  {checked.has(w.key)
                                    ? <CheckSquare size={14} className="text-teal-600 flex-shrink-0" />
                                    : <Square size={14} className="text-gray-400 flex-shrink-0" />}
                                  <span className="text-xs text-[var(--color-text)] truncate">{w.label}</span>
                                  {w.sub && <span className="text-[10px] text-[var(--color-text-secondary)] truncate">{w.sub}</span>}
                                  {w.late && (
                                    <span className="ml-auto px-1.5 py-0.5 rounded-full text-[9px] font-medium bg-red-100 text-red-700 flex-shrink-0">late</span>
                                  )}
                                </button>
                              ))}
                            </div>
                            <div className="flex items-center gap-2 px-4 py-2 border-t border-[var(--color-border)]/60">
                              <button
                                className="btn-primary btn-sm gap-1.5 text-xs"
                                disabled={checked.size === 0}
                                onClick={() => openCheckedInWindows(item.id)}
                                title="Open each selected item in its own window"
                              >
                                <ExternalLink size={12} />
                                Open selected ({checked.size})
                              </button>
                              <button
                                className="ml-auto text-[11px] text-[var(--color-primary)] hover:underline"
                                onClick={() => navigate(item.page)}
                              >
                                View all →
                              </button>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Outstanding balance — collapsible container; expands to show where the money sits */}
          <div className="mt-3 max-w-md rounded-xl border border-[var(--color-border)] bg-white overflow-hidden">
            <button
              className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-gray-50 transition-colors"
              onClick={() => setBalanceExpanded((v) => !v)}
            >
              <span className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-100 text-blue-600 flex-shrink-0">
                <DollarSign size={18} />
              </span>
              <span className="text-lg font-bold text-[var(--color-text)]">
                ${stats.outstandingBalance.toLocaleString('en-US', { maximumFractionDigits: 0 })}
              </span>
              <span className="flex-1 text-sm text-[var(--color-text-secondary)]">
                Outstanding Balance{stats.unpaidInvoiceCount > 0 ? ` · ${stats.unpaidInvoiceCount} unpaid` : ''}
              </span>
              <ChevronRight
                size={16}
                className={`text-gray-400 transition-transform duration-150 flex-shrink-0 ${balanceExpanded ? 'rotate-90' : ''}`}
              />
            </button>

            {balanceExpanded && (
              <div className="border-t border-[var(--color-border)] px-4 py-3 text-sm space-y-1.5">
                {balanceBreakdown ? (
                  <>
                    {balanceBreakdown.total === 0 && balanceBreakdown.unbilled.count === 0 ? (
                      <p className="text-[var(--color-text-secondary)]">Nothing outstanding — all invoices paid.</p>
                    ) : (
                      <>
                        {/* Where the unpaid invoices sit */}
                        <button
                          className="w-full flex items-center justify-between gap-2 py-1 text-left hover:text-blue-600 transition-colors"
                          onClick={() => navigate('/entities')}
                        >
                          <span className="text-[var(--color-text)]">
                            Contracts / agencies
                            <span className="text-xs text-[var(--color-text-secondary)]"> · {balanceBreakdown.contract.count} invoice{balanceBreakdown.contract.count !== 1 ? 's' : ''}</span>
                          </span>
                          <span className="font-semibold text-[var(--color-text)] whitespace-nowrap">
                            ${balanceBreakdown.contract.amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                          </span>
                        </button>
                        <button
                          className="w-full flex items-center justify-between gap-2 py-1 text-left hover:text-blue-600 transition-colors"
                          onClick={() => navigate('/billing?filter=unpaid')}
                        >
                          <span className="text-[var(--color-text)]">
                            Individual clients
                            <span className="text-xs text-[var(--color-text-secondary)]"> · {balanceBreakdown.individual.count} invoice{balanceBreakdown.individual.count !== 1 ? 's' : ''}</span>
                          </span>
                          <span className="font-semibold text-[var(--color-text)] whitespace-nowrap">
                            ${balanceBreakdown.individual.amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                          </span>
                        </button>
                        {balanceBreakdown.overdue.amount > 0 && (
                          <div className="flex items-center justify-between gap-2 py-1 text-red-600">
                            <span className="flex items-center gap-1.5">
                              <AlertCircle size={13} /> Overdue
                              <span className="text-xs opacity-80">· {balanceBreakdown.overdue.count}</span>
                            </span>
                            <span className="font-semibold whitespace-nowrap">
                              ${balanceBreakdown.overdue.amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                            </span>
                          </div>
                        )}

                        {/* Earned but not yet invoiced — separate from the outstanding total above */}
                        {balanceBreakdown.unbilled.count > 0 && (
                          <button
                            className="w-full flex items-center justify-between gap-2 pt-2 mt-1 border-t border-dashed border-[var(--color-border)] text-left hover:text-teal-700 transition-colors"
                            onClick={() => navigate('/billing')}
                          >
                            <span>
                              <span className="block text-[var(--color-text)]">Not yet invoiced</span>
                              <span className="text-xs text-[var(--color-text-secondary)]">
                                {balanceBreakdown.unbilled.count} signed session{balanceBreakdown.unbilled.count !== 1 ? 's' : ''} not on an invoice
                              </span>
                            </span>
                            {balanceBreakdown.unbilled.amount > 0 && (
                              <span className="font-semibold text-[var(--color-text)] whitespace-nowrap">
                                ${balanceBreakdown.unbilled.amount.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                              </span>
                            )}
                          </button>
                        )}
                      </>
                    )}
                  </>
                ) : (
                  <p className="text-[var(--color-text-secondary)]">Breakdown unavailable.</p>
                )}
              </div>
            )}
          </div>
        </div>

        {/* Right: Needs Attention rail — backup nudge + chart/compliance alerts */}
        <aside className="lg:col-span-1">
          <div className="flex items-center gap-2 mb-3">
            <AlertTriangle size={16} className="text-amber-500" />
            <h2 className="text-sm font-semibold text-[var(--color-text)]">
              Needs Attention{totalAttention > 0 ? ` (${totalAttention})` : ''}
            </h2>
          </div>

          <div className="rounded-xl border border-[var(--color-border)] bg-white p-3 space-y-2">
          {/* Backup nudge (compact) */}
          {showBackupReminder && (
            <div className="rounded-lg border border-orange-200 bg-orange-50 p-3">
              <div className="flex items-start gap-2">
                <ShieldAlert size={16} className="text-orange-600 flex-shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-orange-800">
                    {daysSinceBackup === null
                      ? "You haven't created a backup yet."
                      : `It's been ${daysSinceBackup} days since your last backup.`}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5">
                    <button
                      className="px-2.5 py-1 text-xs font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-md transition-colors disabled:opacity-50"
                      onClick={handleQuickBackupFromDashboard}
                      disabled={quickBackupLoading}
                    >
                      {quickBackupLoading ? 'Backing up…' : 'Back Up Now'}
                    </button>
                    {!backupFolder && (
                      <button
                        className="text-xs text-orange-700 underline hover:text-orange-900"
                        onClick={() => navigate('/settings')}
                      >
                        Set up backup folder
                      </button>
                    )}
                  </div>
                </div>
                <button
                  onClick={dismissBackupReminder}
                  className="text-orange-500 hover:text-orange-700 flex-shrink-0"
                  title="Dismiss for today"
                >
                  <X size={16} />
                </button>
              </div>
            </div>
          )}

          {/* Chart / compliance / auth alerts (header supplied above) */}
          <BasicAlertsPanel hideHeader onLoaded={setAlertCount} />

          {/* Empty state — nothing needs attention */}
          {railEmpty && (
            <div className="flex items-center gap-2 px-1 py-1 text-sm text-[var(--color-text-secondary)]">
              <CheckCircle size={16} className="text-emerald-500 flex-shrink-0" />
              You're all caught up.
            </div>
          )}
          </div>
        </aside>
      </div>

      {/* Upcoming Appointments + Recent Messages — side by side once messages exist */}
      <div className={sentMessages.length > 0 ? 'grid grid-cols-1 lg:grid-cols-2 gap-6 items-start' : ''}>
      {/* Upcoming Appointments — grouped by day, time-first rows */}
      <div className="card">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-[var(--color-border)]">
          <Clock size={18} className="text-teal-500" />
          <h2 className="section-title mb-0">Upcoming Appointments</h2>
        </div>
        {upcomingAppointments.length === 0 ? (
          <div className="px-5 py-8 text-center text-[var(--color-text-secondary)] text-sm">
            No upcoming appointments.
          </div>
        ) : (
          appointmentGroups.map((group) => {
            const open = isDayOpen(group.date);
            return (
            <div key={group.date}>
              {/* Day header — colored band, collapsible (today open by default) */}
              <button
                className="w-full flex items-center gap-2 px-5 py-2 text-xs font-bold uppercase tracking-wider text-teal-700 bg-teal-50 border-y border-teal-100 hover:bg-teal-100/70 transition-colors"
                onClick={() => toggleDay(group.date)}
              >
                <ChevronRight size={13} className={`transition-transform duration-150 ${open ? 'rotate-90' : ''}`} />
                <span className="text-left">{formatDateHeader(group.date)}</span>
                <span className="font-semibold normal-case tracking-normal text-teal-600/80">
                  ({group.appts.length})
                </span>
                <span className="flex-1" />
              </button>
              {open && (
              <div className="divide-y divide-[var(--color-border)]">
                {group.appts.map((appt) => {
                  const isContractor = appt.entity_id != null;
                  const patientName = isContractor
                    ? (appt.contractor_patient_name?.trim() || appt.patient_name?.trim() || 'Unnamed patient')
                    : `${appt.first_name || ''} ${appt.last_name || ''}`.trim() || 'Unnamed';
                  const entityRequiresNotes = appt.entity_requires_notes !== 0;
                  const showNoteButton = isContractor ? entityRequiresNotes : true;
                  return (
                    <div
                      key={appt.id}
                      className="group flex items-center gap-3 pl-9 pr-5 py-2.5 hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => navigate('/calendar', { state: { date: appt.scheduled_date, view: 'week' } })}
                    >
                      {/* Time (left) */}
                      <div className="w-16 flex-shrink-0">
                        <p className="text-sm font-semibold text-[var(--color-text)] whitespace-nowrap">
                          {formatTime(appt.scheduled_time)}
                        </p>
                      </div>
                      {/* Client + meta */}
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-[var(--color-text)] truncate">
                          {patientName}
                        </p>
                        <div className="flex items-center gap-2 mt-0.5">
                          {isContractor ? (
                            appt.entity_name && (
                              <span className="text-xs text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded">
                                {appt.entity_name}
                              </span>
                            )
                          ) : (
                            appt.client_discipline && (
                              <span className={`badge-${appt.client_discipline.toLowerCase()}`}>
                                {appt.client_discipline}
                              </span>
                            )
                          )}
                          <span className="text-xs text-[var(--color-text-secondary)]">
                            {appt.duration_minutes} min
                          </span>
                        </div>
                      </div>
                      {/* Actions */}
                      <div className="flex items-center gap-2 flex-shrink-0">
                        <ReminderIndicator appt={appt} onSend={handleSendReminder} />
                        {showNoteButton && (
                          <button
                            className="btn-ghost p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Write Note"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isContractor) {
                                if (appt.note_id) {
                                  navigate(`/contractor-note/${appt.note_id}?appointmentId=${appt.id}`);
                                } else {
                                  navigate(`/contractor-note/new?appointmentId=${appt.id}`);
                                }
                                return;
                              }
                              navigate(`/clients/${appt.client_id}/note/new`, {
                                state: {
                                  appointmentId: appt.id,
                                  appointmentDate: appt.scheduled_date,
                                  appointmentTime: appt.scheduled_time,
                                  appointmentDuration: appt.duration_minutes,
                                },
                              });
                            }}
                          >
                            <PenLine size={14} className="text-teal-600" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
              )}
            </div>
            );
          })
        )}
      </div>

        {/* Sent Messages — receipt for reminders + invoice/intake emails (hides when empty) */}
        <SentMessagesCard messages={sentMessages} />
      </div>

      {/* Workspace: Scratchpad + Tasks */}
      <DashboardWorkspace />

      {/* Milestone review prompt — floating popup (bottom-right), unobtrusive */}
      {reviewEligible && reviewMilestone && (
        <ReviewPromptCard
          milestone={reviewMilestone}
          onComplete={() => setReviewEligible(false)}
        />
      )}

      {/* Reminder send toast */}
      {toast && (
        <div
          className={`fixed bottom-4 right-4 z-[9999] flex items-center gap-2 px-4 py-3 rounded-lg shadow-lg text-sm font-medium text-white animate-fade-in ${
            toast.kind === 'success' ? 'bg-emerald-600' : 'bg-red-600'
          }`}
        >
          {toast.kind === 'success' ? <CheckCircle className="w-4 h-4" /> : <AlertCircle className="w-4 h-4" />}
          <span>{toast.msg}</span>
        </div>
      )}
    </div>
  );
};

export default DashboardPage;
