import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Users,
  FileText,
  Calendar,
  PenLine,
  UserPlus,
  CalendarDays,
  Clock,
  ShieldAlert,
  X,
  ClipboardList,
  DollarSign,
  CheckCircle,
  Save,
} from 'lucide-react';
import type { Client, Note, Appointment } from '../../shared/types';
import BasicAlertsPanel from '../components/BasicAlertsPanel';
import DashboardWorkspace from '../components/DashboardWorkspace';
import ReviewPromptCard from '../components/ReviewPromptCard';
import OnboardingChecklist from '../components/OnboardingChecklist';

interface DashboardStats {
  incompleteEvals: number;
  notesThisWeek: number;
  upcomingAppointments: number;
  unsignedNotes: number;
  outstandingBalance: number;
  unpaidInvoiceCount: number;
}

const BACKUP_REMINDER_DAYS = 7;

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

      // Outstanding balance
      const balanceData = await window.api.dashboard.getOutstandingBalance().catch(() => ({ outstanding: 0, unpaidCount: 0 }));

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

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return '';
    const date = new Date(dateStr + 'T00:00:00');
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const formatTime = (timeStr: string): string => {
    if (!timeStr) return '';
    const [hours, minutes] = timeStr.split(':');
    const h = parseInt(hours, 10);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const displayHour = h % 12 || 12;
    return `${displayHour}:${minutes} ${ampm}`;
  };

  const statCards = [
    {
      label: 'Upcoming Appointments',
      count: stats.upcomingAppointments,
      icon: <Calendar size={24} className="text-teal-500" />,
      bgClass: 'bg-teal-50',
      onClick: () => navigate('/calendar'),
    },
    {
      label: 'Incomplete Evals',
      count: stats.incompleteEvals,
      icon: <ClipboardList size={24} className="text-amber-500" />,
      bgClass: 'bg-amber-50',
      onClick: () => navigate('/evals'),
    },
    {
      label: 'Unsigned Notes',
      count: stats.unsignedNotes,
      icon: <PenLine size={24} className="text-teal-500" />,
      bgClass: 'bg-teal-50',
      onClick: () => navigate('/notes'),
    },
    {
      label: 'Outstanding Balance',
      count: stats.outstandingBalance,
      subtitle: stats.unpaidInvoiceCount > 0
        ? `${stats.unpaidInvoiceCount} unpaid invoice${stats.unpaidInvoiceCount !== 1 ? 's' : ''}`
        : undefined,
      isCurrency: true,
      icon: <DollarSign size={24} className="text-blue-500" />,
      bgClass: 'bg-blue-50',
      hoverBorder: 'hover:border-blue-300',
      onClick: () => navigate('/billing?filter=unpaid'),
    },
    {
      label: 'Notes This Week',
      count: stats.notesThisWeek,
      icon: <FileText size={24} className="text-teal-500" />,
      bgClass: 'bg-teal-50',
      onClick: () => navigate('/notes'),
    },
  ];

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-[var(--color-text-secondary)]">Loading dashboard...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-title">PocketChart Dashboard</h1>
          <p className="text-[var(--color-text-secondary)] mt-1">
            Welcome back. Here is an overview of your practice.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            className="btn-primary"
            onClick={() => navigate('/clients', { state: { openNewClient: true } })}
          >
            <UserPlus size={16} className="mr-2" />
            New Client
          </button>
          <button className="btn-secondary" onClick={() => navigate('/clients')}>
            <PenLine size={16} className="mr-2" />
            Start Note
          </button>
          <button className="btn-secondary" onClick={() => navigate('/calendar')}>
            <CalendarDays size={16} className="mr-2" />
            View Calendar
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
      </div>

      {/* Integrity Warning Banner */}
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

      {/* Backup Reminder Banner */}
      {showBackupReminder && (
        <div className="mb-6 flex items-start gap-3 p-4 rounded-lg border border-orange-300 bg-orange-50 text-sm">
          <ShieldAlert size={20} className="text-orange-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-orange-800">
              {daysSinceBackup === null
                ? "You haven't created a backup yet."
                : `It's been ${daysSinceBackup} days since your last backup.`}
            </p>
            <div className="flex items-center gap-3 mt-2">
              <button
                className="px-3 py-1.5 text-xs font-medium text-white bg-orange-600 hover:bg-orange-700 rounded-md transition-colors disabled:opacity-50"
                onClick={handleQuickBackupFromDashboard}
                disabled={quickBackupLoading}
              >
                {quickBackupLoading ? 'Backing up\u2026' : 'Back Up Now'}
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
      )}

      {/* Quick backup success */}
      {quickBackupSuccess && (
        <div className="mb-6 flex items-center gap-3 p-4 rounded-lg border border-emerald-300 bg-emerald-50 text-sm">
          <CheckCircle size={20} className="text-emerald-600 flex-shrink-0" />
          <p className="text-emerald-800 font-medium">Backup completed successfully.</p>
        </div>
      )}

      {/* Alerts Panel */}
      <BasicAlertsPanel />

      {/* Onboarding Checklist */}
      <OnboardingChecklist />

      {/* Review Prompt Card */}
      {reviewEligible && reviewMilestone && (
        <ReviewPromptCard
          milestone={reviewMilestone}
          onComplete={() => setReviewEligible(false)}
        />
      )}

      {/* Compact Stat Bar — single row of clickable pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        {statCards.map((card) => (
          <button
            key={card.label}
            className={`flex items-center gap-2 px-4 py-2 rounded-full border border-[var(--color-border)] bg-white hover:shadow-md hover:border-teal-300 transition-all text-sm cursor-pointer`}
            onClick={card.onClick}
          >
            <span className="text-base font-bold text-[var(--color-text)]">
              {card.isCurrency
                ? `$${card.count.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`
                : card.count}
            </span>
            <span className="text-[var(--color-text-secondary)]">{card.label}</span>
          </button>
        ))}
      </div>

      {/* Upcoming Appointments — primary content block, full width */}
      <div className="card">
        <div className="flex items-center gap-2 px-5 py-4 border-b border-[var(--color-border)]">
          <Clock size={18} className="text-teal-500" />
          <h2 className="section-title mb-0">Upcoming Appointments</h2>
        </div>
        <div className="divide-y divide-[var(--color-border)]">
          {upcomingAppointments.length === 0 ? (
            <div className="px-5 py-8 text-center text-[var(--color-text-secondary)] text-sm">
              No upcoming appointments.
            </div>
          ) : (
            upcomingAppointments.map((appt) => {
              const isContractor = appt.entity_id != null;
              const patientName = isContractor
                ? (appt.contractor_patient_name?.trim() || appt.patient_name?.trim() || 'Unnamed patient')
                : `${appt.first_name || ''} ${appt.last_name || ''}`.trim() || 'Unnamed';
              const entityRequiresNotes = appt.entity_requires_notes !== 0;
              const showNoteButton = isContractor ? entityRequiresNotes : true;
              return (
              <div
                key={appt.id}
                className="group px-5 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
                onClick={() => navigate('/calendar', { state: { date: appt.scheduled_date, view: 'week' } })}
              >
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-[var(--color-text)]">
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
                  <div className="flex items-center gap-3">
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
                    <div className="text-right">
                      <p className="text-sm font-medium text-[var(--color-text)]">
                        {formatDate(appt.scheduled_date)}
                      </p>
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        {formatTime(appt.scheduled_time)}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
              );
            })
          )}
        </div>
      </div>

      {/* Workspace: Scratchpad + Tasks */}
      <DashboardWorkspace />
    </div>
  );
};

export default DashboardPage;
