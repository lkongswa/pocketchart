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
  Activity,
  ShieldAlert,
  X,
} from 'lucide-react';
import type { Client, Note, Appointment } from '../../shared/types';

interface DashboardStats {
  activeClients: number;
  notesThisWeek: number;
  upcomingAppointments: number;
  unsignedNotes: number;
}

interface RecentNote {
  note: Note;
  clientName: string;
}

const BACKUP_REMINDER_DAYS = 7;

const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [stats, setStats] = useState<DashboardStats>({
    activeClients: 0,
    notesThisWeek: 0,
    upcomingAppointments: 0,
    unsignedNotes: 0,
  });
  const [recentNotes, setRecentNotes] = useState<RecentNote[]>([]);
  const [upcomingAppointments, setUpcomingAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [showBackupReminder, setShowBackupReminder] = useState(false);
  const [daysSinceBackup, setDaysSinceBackup] = useState<number | null>(null);

  useEffect(() => {
    loadDashboardData();
    checkBackupReminder();
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
    } catch (err) {
      // Silently fail — don't break the dashboard over a reminder
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

      // Get all active clients
      const clients: Client[] = await window.api.clients.list({ status: 'active' });
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

      // Load notes for all clients to count this week's notes and get recent ones
      const allNotes: RecentNote[] = [];
      let notesThisWeek = 0;

      for (const client of allClients) {
        const clientNotes: Note[] = await window.api.notes.listByClient(client.id);
        for (const note of clientNotes) {
          allNotes.push({
            note,
            clientName: `${client.first_name} ${client.last_name}`,
          });
          if (note.date_of_service >= weekStartStr && note.date_of_service <= weekEndStr) {
            notesThisWeek++;
          }
        }
      }

      // Sort all notes by date descending and take the 5 most recent
      allNotes.sort((a, b) =>
        b.note.date_of_service.localeCompare(a.note.date_of_service) ||
        b.note.created_at.localeCompare(a.note.created_at)
      );
      setRecentNotes(allNotes.slice(0, 5));

      // Load upcoming appointments (today and forward)
      const appointments: Appointment[] = await window.api.appointments.list({
        startDate: today,
      });
      const upcoming = appointments
        .filter((appt) => appt.status === 'scheduled')
        .slice(0, 5);
      setUpcomingAppointments(upcoming);

      // Count unsigned notes
      const unsignedNotes = allNotes.filter((item) => !item.note.signed_at).length;

      setStats({
        activeClients: clients.length,
        notesThisWeek,
        upcomingAppointments: appointments.filter((a) => a.status === 'scheduled').length,
        unsignedNotes,
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
      label: 'Total Active Clients',
      count: stats.activeClients,
      icon: <Users size={24} className="text-[var(--color-primary)]" />,
      bgClass: 'bg-teal-50',
      onClick: () => navigate('/clients'),
    },
    {
      label: 'Notes This Week',
      count: stats.notesThisWeek,
      icon: <FileText size={24} className="text-blue-600" />,
      bgClass: 'bg-blue-50',
      onClick: () => navigate('/clients'),
    },
    {
      label: 'Upcoming Appointments',
      count: stats.upcomingAppointments,
      icon: <Calendar size={24} className="text-purple-600" />,
      bgClass: 'bg-purple-50',
      onClick: () => navigate('/calendar'),
    },
    {
      label: 'Unsigned Notes',
      count: stats.unsignedNotes,
      icon: <PenLine size={24} className="text-amber-600" />,
      bgClass: 'bg-amber-50',
      onClick: () => navigate('/clients'),
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
          <button className="btn-secondary" onClick={() => navigate('/calendar')}>
            <CalendarDays size={16} className="mr-2" />
            View Calendar
          </button>
        </div>
      </div>

      {/* Backup Reminder Banner */}
      {showBackupReminder && (
        <div className="mb-6 flex items-start gap-3 p-4 rounded-lg border border-amber-300 bg-amber-50 text-sm">
          <ShieldAlert size={20} className="text-amber-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="font-medium text-amber-800">
              {daysSinceBackup === null
                ? "You haven't created a backup yet."
                : `It's been ${daysSinceBackup} days since your last backup.`}
            </p>
            <p className="text-amber-700 mt-1">
              Protect your clinical records — go to{' '}
              <button
                className="underline font-medium hover:text-amber-900"
                onClick={() => navigate('/settings')}
              >
                Settings &gt; Backup & Export
              </button>{' '}
              to export a backup.
            </p>
          </div>
          <button
            onClick={dismissBackupReminder}
            className="text-amber-500 hover:text-amber-700 flex-shrink-0"
            title="Dismiss for today"
          >
            <X size={16} />
          </button>
        </div>
      )}

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {statCards.map((card) => (
          <div
            key={card.label}
            className="card p-5 cursor-pointer hover:shadow-md hover:border-[var(--color-primary)]/30 transition-all group"
            onClick={card.onClick}
          >
            <div className="flex items-center gap-4">
              <div
                className={`flex items-center justify-center w-12 h-12 rounded-lg ${card.bgClass} group-hover:scale-105 transition-transform`}
              >
                {card.icon}
              </div>
              <div>
                <p className="text-2xl font-bold text-[var(--color-text)]">{card.count}</p>
                <p className="text-sm text-[var(--color-text-secondary)]">{card.label}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Two Column Layout: Recent Activity + Upcoming Appointments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Activity */}
        <div className="card">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-[var(--color-border)]">
            <Activity size={18} className="text-[var(--color-primary)]" />
            <h2 className="section-title mb-0">Recent Activity</h2>
          </div>
          <div className="divide-y divide-[var(--color-border)]">
            {recentNotes.length === 0 ? (
              <div className="px-5 py-8 text-center text-[var(--color-text-secondary)] text-sm">
                No recent notes found.
              </div>
            ) : (
              recentNotes.map((item) => (
                <div
                  key={item.note.id}
                  className="px-5 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() =>
                    navigate(
                      `/clients/${item.note.client_id}/note/${item.note.id}`
                    )
                  }
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text)]">
                        {item.clientName}
                      </p>
                      <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                        {item.note.subjective
                          ? item.note.subjective.length > 80
                            ? item.note.subjective.substring(0, 80) + '...'
                            : item.note.subjective
                          : 'No subjective note'}
                      </p>
                    </div>
                    <div className="text-xs text-[var(--color-text-secondary)] whitespace-nowrap ml-4">
                      {formatDate(item.note.date_of_service)}
                    </div>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Upcoming Appointments */}
        <div className="card">
          <div className="flex items-center gap-2 px-5 py-4 border-b border-[var(--color-border)]">
            <Clock size={18} className="text-purple-600" />
            <h2 className="section-title mb-0">Upcoming Appointments</h2>
          </div>
          <div className="divide-y divide-[var(--color-border)]">
            {upcomingAppointments.length === 0 ? (
              <div className="px-5 py-8 text-center text-[var(--color-text-secondary)] text-sm">
                No upcoming appointments.
              </div>
            ) : (
              upcomingAppointments.map((appt) => (
                <div
                  key={appt.id}
                  className="px-5 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/clients/${appt.client_id}`)}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text)]">
                        {appt.first_name} {appt.last_name}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {appt.client_discipline && (
                          <span
                            className={`badge-${appt.client_discipline.toLowerCase()}`}
                          >
                            {appt.client_discipline}
                          </span>
                        )}
                        <span className="text-xs text-[var(--color-text-secondary)]">
                          {appt.duration_minutes} min
                        </span>
                      </div>
                    </div>
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
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default DashboardPage;
