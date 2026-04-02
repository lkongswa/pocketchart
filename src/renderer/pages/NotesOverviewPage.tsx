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

type TabFilter = 'due' | 'all' | 'progress_reports';

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
        // Show drafts (unsigned notes) — displayed in right column
        return drafts.filter(matchesSearch);
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

      {/* Summary Stat Pills */}
      <div className="flex flex-wrap gap-2 mb-6">
        <button
          className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all text-sm cursor-pointer ${tab === 'due' ? 'border-teal-400 bg-teal-50 shadow-sm' : 'border-[var(--color-border)] bg-white hover:shadow-md hover:border-teal-300'}`}
          onClick={() => setTab('due')}
        >
          <CalendarCheck size={14} className="text-teal-500" />
          <span className="font-bold text-[var(--color-text)]">{notesDue + drafts.length}</span>
          <span className="text-[var(--color-text-secondary)]">Notes Due</span>
          {overdue.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700">{overdue.length} late</span>
          )}
        </button>
        <button
          className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all text-sm cursor-pointer ${tab === 'progress_reports' ? 'border-teal-400 bg-teal-50 shadow-sm' : 'border-[var(--color-border)] bg-white hover:shadow-md hover:border-teal-300'}`}
          onClick={() => setTab('progress_reports')}
        >
          <FileText size={14} className="text-teal-500" />
          <span className="font-bold text-[var(--color-text)]">{progressReports.length}</span>
          <span className="text-[var(--color-text-secondary)]">Progress Reports</span>
        </button>
        <button
          className={`flex items-center gap-2 px-4 py-2 rounded-full border transition-all text-sm cursor-pointer ${tab === 'all' ? 'border-teal-400 bg-teal-50 shadow-sm' : 'border-[var(--color-border)] bg-white hover:shadow-md hover:border-teal-300'}`}
          onClick={() => setTab('all')}
        >
          <span className="font-bold text-[var(--color-text)]">{allNotes.length}</span>
          <span className="text-[var(--color-text-secondary)]">All Notes</span>
        </button>
      </div>

      {/* Tabs & Search */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {([
            { key: 'due' as TabFilter, label: 'Notes Due', count: notesDue + drafts.length },
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

      {/* ══════════ NOTES DUE: Two-Column Layout ══════════ */}
      {tab === 'due' && (
        <div className="grid grid-cols-2 gap-4 mb-4">
          {/* LEFT: Appointments Missing Notes */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <CalendarCheck size={14} className="text-amber-600" />
              <h3 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">Missing Notes</h3>
              {missingNotes.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700">{missingNotes.length}</span>
              )}
            </div>
            {missingNotes.length === 0 ? (
              <div className="card p-6 text-center text-xs text-[var(--color-text-secondary)]">
                All appointments have notes. Nice!
              </div>
            ) : (
              <div className="card overflow-hidden divide-y divide-[var(--color-border)]">
                {missingNotes.map((item) => (
                  <div
                    key={item.appointment.id}
                    className="flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors"
                    onClick={() => navigate(`/clients/${item.clientId}/note/new`, {
                      state: {
                        appointmentDate: item.appointment.scheduled_date,
                        appointmentTime: item.appointment.scheduled_time,
                        appointmentDuration: item.appointment.duration_minutes,
                      }
                    })}
                  >
                    <div className="w-1 h-5 rounded-full bg-amber-400 shrink-0" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-[var(--color-text)] truncate">{item.clientName}</p>
                      <p className="text-[10px] text-[var(--color-text-secondary)]">
                        {formatDate(item.appointment.scheduled_date)}{item.appointment.scheduled_time ? ` at ${formatTime12(item.appointment.scheduled_time)}` : ''}
                      </p>
                    </div>
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 font-medium shrink-0">
                      {daysSince(item.appointment.scheduled_date)}d ago
                    </span>
                    <span className="text-[10px] text-[var(--color-primary)] font-medium shrink-0">+ Create</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* RIGHT: Incomplete / Draft Notes */}
          <div>
            <div className="flex items-center gap-2 mb-2">
              <PenLine size={14} className="text-blue-600" />
              <h3 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">Drafts / Incomplete</h3>
              {drafts.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-100 text-blue-700">{drafts.length}</span>
              )}
              {overdue.length > 0 && (
                <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700">{overdue.length} late</span>
              )}
            </div>
            {drafts.length === 0 ? (
              <div className="card p-6 text-center text-xs text-[var(--color-text-secondary)]">
                No unsigned notes. All caught up!
              </div>
            ) : (
              <div className="card overflow-hidden divide-y divide-[var(--color-border)]">
                {drafts.filter(matchesSearch).map((item) => {
                  const daysOld = daysSince(item.note.date_of_service);
                  const isLate = daysOld > 2;
                  return (
                    <div
                      key={item.note.id}
                      className={`flex items-center gap-2 px-3 py-2 cursor-pointer hover:bg-gray-50 transition-colors ${isLate ? 'border-l-4 border-l-red-400 bg-red-50/30' : 'border-l-4 border-l-blue-300'}`}
                      onClick={() => navigate(`/clients/${item.clientId}/note/${item.note.id}`)}
                    >
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-medium text-[var(--color-text)] truncate flex items-center gap-1">
                          {item.clientName}
                          {item.note.note_type === 'progress_report' && (
                            <span className="px-1 py-0.5 rounded text-[9px] font-semibold bg-teal-100 text-teal-700">PR</span>
                          )}
                        </p>
                        <p className="text-[10px] text-[var(--color-text-secondary)]">
                          {formatDate(item.note.date_of_service)}
                          {item.note.cpt_code && ` · ${item.note.cpt_code}`}
                        </p>
                      </div>
                      <span className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[10px] font-medium shrink-0 ${
                        isLate ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'
                      }`}>
                        <PenLine size={9} />
                        {isLate ? `Late (${daysOld}d)` : 'Draft'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Notes Table (shown for all tabs, drafts for 'due' tab are in the two-column above) */}
      {tab !== 'due' && (
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
              {tab === 'progress_reports'
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
      )}
    </div>
  );
}
