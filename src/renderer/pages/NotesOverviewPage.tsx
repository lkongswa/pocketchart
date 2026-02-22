import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useSectionColor } from '../hooks/useSectionColor';
import {
  FileText,
  ArrowLeft,
  CheckCircle,
  PenLine,
  Clock,
  Filter,
  AlertTriangle,
  CalendarCheck,
  Receipt,
  DollarSign,
  List,
  LayoutGrid,
} from 'lucide-react';
import type { Client, Note, Appointment } from '../../shared/types';

interface NoteWithClient {
  note: Note;
  clientName: string;
  clientId: number;
}

interface MissingNote {
  appointment: Appointment;
  clientName: string;
  clientId: number;
}

type TabFilter = 'due' | 'drafts' | 'overdue' | 'all' | 'progress_reports';

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatTime12(time24: string): string {
  if (!time24) return '';
  const [hStr, mStr] = time24.split(':');
  const h = parseInt(hStr, 10);
  const suffix = h >= 12 ? 'PM' : 'AM';
  const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
  return `${h12}:${mStr} ${suffix}`;
}

function daysSince(dateStr: string): number {
  const d = new Date(dateStr + 'T00:00:00');
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return Math.floor((now.getTime() - d.getTime()) / (1000 * 60 * 60 * 24));
}

export default function NotesOverviewPage() {
  const navigate = useNavigate();
  const sectionColor = useSectionColor();
  const [allNotes, setAllNotes] = useState<NoteWithClient[]>([]);
  const [missingNotes, setMissingNotes] = useState<MissingNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabFilter>('due');
  const [searchQuery, setSearchQuery] = useState('');
  const [noteInvoiceMap, setNoteInvoiceMap] = useState<Record<number, { invoice_id: number; invoice_number: string; status: string }>>({});
  const [missingNotesCompact, setMissingNotesCompact] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const clients: Client[] = await window.api.clients.list();
      const notes: NoteWithClient[] = [];
      const clientMap = new Map<number, Client>();
      clients.forEach(c => clientMap.set(c.id, c));

      // Load all notes
      for (const client of clients) {
        const clientNotes: Note[] = await window.api.notes.listByClient(client.id);
        for (const note of clientNotes) {
          notes.push({
            note,
            clientName: `${client.first_name} ${client.last_name}`,
            clientId: client.id,
          });
        }
      }

      // Load appointments to find missing notes (completed appts without notes)
      try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const today = new Date();
        const appts: Appointment[] = await window.api.appointments.list({
          startDate: thirtyDaysAgo.toISOString().slice(0, 10),
          endDate: today.toISOString().slice(0, 10),
        });

        // Completed or scheduled (past) appointments without a linked note
        const noteIds = new Set(notes.map(n => n.note.id));
        const apptNoteIds = new Set(appts.filter(a => a.note_id).map(a => a.note_id));
        const missing: MissingNote[] = [];

        for (const appt of appts) {
          if (appt.status === 'cancelled') continue;
          if (appt.note_id && noteIds.has(appt.note_id)) continue; // Has a note
          // Past appointment without a note
          const apptDate = new Date(appt.scheduled_date + 'T00:00:00');
          if (apptDate > today) continue; // Future appointment
          const client = clientMap.get(appt.client_id);
          if (!client) continue;
          missing.push({
            appointment: appt,
            clientName: `${client.first_name} ${client.last_name}`,
            clientId: client.id,
          });
        }
        setMissingNotes(missing);
      } catch {
        setMissingNotes([]);
      }

      // Load invoice statuses for notes
      try {
        const invoiceStatuses = await window.api.invoices.noteStatuses();
        setNoteInvoiceMap(invoiceStatuses);
      } catch {
        setNoteInvoiceMap({});
      }

      notes.sort((a, b) =>
        b.note.date_of_service.localeCompare(a.note.date_of_service) ||
        b.note.created_at.localeCompare(a.note.created_at)
      );

      setAllNotes(notes);
    } catch (err) {
      console.error('Failed to load notes:', err);
    } finally {
      setLoading(false);
    }
  };

  // Derived counts
  const drafts = allNotes.filter(n => !n.note.signed_at);
  const overdue = drafts.filter(n => daysSince(n.note.date_of_service) > 2);
  const progressReports = allNotes.filter(n => n.note.note_type === 'progress_report');
  const notesDue = missingNotes.length; // Appointments without notes

  // Build display list based on tab
  const getDisplayItems = () => {
    switch (tab) {
      case 'due':
        // Show drafts (unsigned notes) - this is the to-do queue
        return drafts.filter(matchesSearch);
      case 'drafts':
        return drafts.filter(matchesSearch);
      case 'overdue':
        return overdue.filter(matchesSearch);
      case 'progress_reports':
        return progressReports.filter(matchesSearch);
      case 'all':
        return allNotes.filter(matchesSearch);
    }
  };

  const matchesSearch = (item: NoteWithClient) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      item.clientName.toLowerCase().includes(q) ||
      (item.note.subjective || '').toLowerCase().includes(q) ||
      (item.note.assessment || '').toLowerCase().includes(q) ||
      item.note.date_of_service.includes(q)
    );
  };

  const displayItems = getDisplayItems();

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-[400px]">
        <div className="text-[var(--color-text-secondary)]">Loading notes...</div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <button
            className="btn-ghost p-2"
            onClick={() => navigate('/')}
            title="Back to dashboard"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div>
            <h1 className="page-title flex items-center gap-2">
              <FileText className="w-6 h-6" style={{ color: sectionColor.color }} />
              Documentation Queue
            </h1>
            <p className="text-[var(--color-text-secondary)] mt-1">
              Notes that need your attention
            </p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div
          className="card p-4 cursor-pointer hover:shadow-md transition-all hover:border-teal-300"
          onClick={() => setTab('due')}
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-teal-50">
              <CalendarCheck size={20} className="text-teal-500" />
            </div>
            <div>
              <p className="text-xl font-bold text-[var(--color-text)]">{notesDue + drafts.length}</p>
              <p className="text-xs text-[var(--color-text-secondary)]">Notes Due</p>
              <p className="text-[10px] text-[var(--color-text-secondary)]">{notesDue} appts missing notes · {drafts.length} drafts</p>
            </div>
          </div>
        </div>
        <div
          className="card p-4 cursor-pointer hover:shadow-md transition-all hover:border-teal-300"
          onClick={() => setTab('drafts')}
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-teal-50">
              <PenLine size={20} className="text-teal-500" />
            </div>
            <div>
              <p className="text-xl font-bold text-[var(--color-text)]">{drafts.length}</p>
              <p className="text-xs text-[var(--color-text-secondary)]">Drafts in Progress</p>
              <p className="text-[10px] text-[var(--color-text-secondary)]">Started but not signed</p>
            </div>
          </div>
        </div>
        <div
          className="card p-4 cursor-pointer hover:shadow-md transition-all hover:border-teal-300"
          onClick={() => setTab('overdue')}
        >
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-teal-50">
              <AlertTriangle size={20} className="text-teal-500" />
            </div>
            <div>
              <p className="text-xl font-bold text-[var(--color-text)]">{overdue.length}</p>
              <p className="text-xs text-[var(--color-text-secondary)]">Overdue</p>
              <p className="text-[10px] text-[var(--color-text-secondary)]">More than 48 hours since service</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs & Search */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {([
            { key: 'due' as TabFilter, label: 'Notes Due', count: drafts.length },
            { key: 'drafts' as TabFilter, label: 'Drafts', count: drafts.length },
            { key: 'overdue' as TabFilter, label: 'Overdue', count: overdue.length },
            { key: 'progress_reports' as TabFilter, label: 'Progress Reports', count: progressReports.length },
            { key: 'all' as TabFilter, label: 'All Notes', count: allNotes.length },
          ]).map((t) => (
            <button
              key={t.key}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                tab === t.key
                  ? 'bg-white text-[var(--color-text)] shadow-sm'
                  : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
              }`}
              onClick={() => setTab(t.key)}
            >
              {t.label}
              <span className="ml-1.5 text-xs opacity-60">({t.count})</span>
            </button>
          ))}
        </div>
        <div className="relative">
          <Filter size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]" />
          <input
            type="text"
            className="input pl-8 w-64"
            placeholder="Search by client, content, date..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Missing Notes — inside Notes Due tab only */}
      {tab === 'due' && missingNotes.length > 0 && (
        <div className="mb-4">
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-semibold text-[var(--color-text)] flex items-center gap-2">
              <CalendarCheck size={14} className="text-amber-600" />
              Appointments Missing Notes
              <span className="text-xs font-normal text-[var(--color-text-secondary)]">({missingNotes.length})</span>
            </h3>
            <div className="inline-flex shrink-0 border border-gray-200 rounded-lg overflow-hidden">
              <button
                className={`flex items-center gap-1 px-2 py-1 text-xs font-medium transition-colors ${
                  missingNotesCompact ? 'bg-[var(--color-primary)] text-white' : 'bg-white text-[var(--color-text-secondary)] hover:bg-gray-50'
                }`}
                onClick={() => setMissingNotesCompact(true)}
                title="Compact view"
              >
                <List size={12} />
              </button>
              <button
                className={`flex items-center gap-1 px-2 py-1 text-xs font-medium transition-colors ${
                  !missingNotesCompact ? 'bg-[var(--color-primary)] text-white' : 'bg-white text-[var(--color-text-secondary)] hover:bg-gray-50'
                }`}
                onClick={() => setMissingNotesCompact(false)}
                title="Card view"
              >
                <LayoutGrid size={12} />
              </button>
            </div>
          </div>

          {missingNotesCompact ? (
            <div className="card overflow-hidden divide-y divide-[var(--color-border)]">
              {missingNotes.map((item) => (
                <div
                  key={item.appointment.id}
                  className="flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors"
                  onClick={() => navigate(`/clients/${item.clientId}/note/new`, {
                    state: {
                      appointmentDate: item.appointment.scheduled_date,
                      appointmentTime: item.appointment.scheduled_time,
                      appointmentDuration: item.appointment.duration_minutes,
                    }
                  })}
                >
                  <div className="w-1 h-6 rounded-full bg-amber-400 shrink-0" />
                  <span className="text-sm font-medium text-[var(--color-text)] min-w-[140px]">{item.clientName}</span>
                  <span className="text-xs text-[var(--color-text-secondary)]">
                    {formatDate(item.appointment.scheduled_date)} at {formatTime12(item.appointment.scheduled_time)}
                  </span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium ml-auto shrink-0">
                    {daysSince(item.appointment.scheduled_date)}d ago
                  </span>
                  <span className="text-[10px] text-[var(--color-primary)] font-medium shrink-0">+ Create Note</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {missingNotes.map((item) => (
                <div
                  key={item.appointment.id}
                  className="card p-3 border-l-4 border-l-amber-400 cursor-pointer hover:shadow-md transition-all"
                  onClick={() => navigate(`/clients/${item.clientId}/note/new`, {
                    state: {
                      appointmentDate: item.appointment.scheduled_date,
                      appointmentTime: item.appointment.scheduled_time,
                      appointmentDuration: item.appointment.duration_minutes,
                    }
                  })}
                >
                  <p className="text-sm font-medium text-[var(--color-text)]">{item.clientName}</p>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    {formatDate(item.appointment.scheduled_date)} at {formatTime12(item.appointment.scheduled_time)}
                  </p>
                  <div className="flex items-center gap-2 mt-1.5">
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium">
                      {daysSince(item.appointment.scheduled_date)}d ago
                    </span>
                    <span className="text-[10px] text-[var(--color-primary)] font-medium">+ Create Note</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Notes List */}
      <div className="card overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-[1fr_140px_100px_100px_80px_80px_80px] gap-4 px-5 py-3 bg-gray-50 border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
          <span>Client</span>
          <span>Date of Service</span>
          <span>Time</span>
          <span>CPT</span>
          <span>Status</span>
          <span>Invoiced</span>
          <span>Paid</span>
        </div>

        {/* Notes Rows */}
        <div className="divide-y divide-[var(--color-border)]">
          {displayItems.length === 0 ? (
            <div className="px-5 py-12 text-center text-[var(--color-text-secondary)] text-sm">
              {tab === 'due' || tab === 'drafts'
                ? 'No unsigned notes. All caught up! 🎉'
                : tab === 'overdue'
                ? 'No overdue notes. Great job staying on top of documentation!'
                : tab === 'progress_reports'
                ? 'No progress reports found.'
                : 'No notes found matching your criteria.'}
            </div>
          ) : (
            displayItems.map((item) => {
              const daysOld = daysSince(item.note.date_of_service);
              const isOverdue = !item.note.signed_at && daysOld > 2;
              const invoiceInfo = noteInvoiceMap[item.note.id];
              const isInvoiced = Boolean(invoiceInfo);
              const isPaid = invoiceInfo?.status === 'paid';
              return (
                <div
                  key={item.note.id}
                  className={`grid grid-cols-[1fr_140px_100px_100px_80px_80px_80px] gap-4 px-5 py-3 hover:bg-gray-50 cursor-pointer transition-colors items-center ${isOverdue ? 'bg-red-50/30' : ''}`}
                  onClick={() =>
                    navigate(`/clients/${item.clientId}/note/${item.note.id}`)
                  }
                >
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--color-text)] truncate flex items-center gap-1.5">
                      {item.clientName}
                      {item.note.note_type === 'progress_report' && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-teal-100 text-teal-700 flex-shrink-0">PR</span>
                      )}
                      {item.note.note_type === 'discharge' && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-rose-100 text-rose-700 flex-shrink-0">DC</span>
                      )}
                    </p>
                    {(() => {
                      // Skip empty, default template text, or very short previews
                      const subj = (item.note.subjective || '').trim();
                      const skipTexts = ['pt was ready for therapy', 'patient was ready for therapy', 'client was ready for therapy'];
                      if (!subj || subj.length < 10 || skipTexts.includes(subj.toLowerCase().replace(/\.$/, ''))) return null;
                      return (
                        <p className="text-xs text-[var(--color-text-secondary)] truncate mt-0.5">
                          {subj.length > 60 ? subj.substring(0, 60) + '...' : subj}
                        </p>
                      );
                    })()}
                  </div>
                  <div className="text-sm text-[var(--color-text)]">
                    {formatDate(item.note.date_of_service)}
                    {isOverdue && (
                      <p className="text-[10px] text-red-500 font-medium">{daysOld}d overdue</p>
                    )}
                  </div>
                  <div className="text-xs text-[var(--color-text-secondary)]">
                    {item.note.time_in && item.note.time_out
                      ? `${formatTime12(item.note.time_in)} - ${formatTime12(item.note.time_out)}`
                      : item.note.time_in
                      ? formatTime12(item.note.time_in)
                      : '--'}
                  </div>
                  <div className="text-xs text-[var(--color-text-secondary)]">
                    {item.note.cpt_code || '--'}
                  </div>
                  <div>
                    {item.note.signed_at ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
                        <CheckCircle size={12} />
                        Signed
                      </span>
                    ) : (
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                        isOverdue ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        <PenLine size={12} />
                        {isOverdue ? 'Late' : 'Draft'}
                      </span>
                    )}
                  </div>
                  <div>
                    {isInvoiced ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700 text-xs font-medium">
                        <Receipt size={12} />
                        Yes
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--color-text-secondary)]">--</span>
                    )}
                  </div>
                  <div>
                    {isPaid ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-xs font-medium">
                        <DollarSign size={12} />
                        Paid
                      </span>
                    ) : isInvoiced ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
                        Unpaid
                      </span>
                    ) : (
                      <span className="text-xs text-[var(--color-text-secondary)]">--</span>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
