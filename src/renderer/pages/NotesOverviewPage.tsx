import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText,
  ArrowLeft,
  CheckCircle,
  PenLine,
  Clock,
  Filter,
} from 'lucide-react';
import type { Client, Note } from '../../shared/types';

interface NoteWithClient {
  note: Note;
  clientName: string;
  clientId: number;
}

type TabFilter = 'all' | 'unsigned' | 'signed';

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

export default function NotesOverviewPage() {
  const navigate = useNavigate();
  const [allNotes, setAllNotes] = useState<NoteWithClient[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadNotes();
  }, []);

  const loadNotes = async () => {
    try {
      setLoading(true);
      const clients: Client[] = await window.api.clients.list();
      const notes: NoteWithClient[] = [];

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

      // Sort by date descending, then by created_at descending
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

  // Date boundaries for this week
  const now = new Date();
  const dayOfWeek = now.getDay();
  const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() + mondayOffset);
  weekStart.setHours(0, 0, 0, 0);
  const weekStartStr = weekStart.toISOString().split('T')[0];
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const weekEndStr = weekEnd.toISOString().split('T')[0];

  // Filtered notes
  const filteredNotes = allNotes.filter((item) => {
    // Tab filter
    if (tab === 'unsigned' && item.note.signed_at) return false;
    if (tab === 'signed' && !item.note.signed_at) return false;

    // Search filter
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matches =
        item.clientName.toLowerCase().includes(q) ||
        (item.note.subjective || '').toLowerCase().includes(q) ||
        (item.note.assessment || '').toLowerCase().includes(q) ||
        item.note.date_of_service.includes(q);
      if (!matches) return false;
    }

    return true;
  });

  // Stats
  const thisWeekNotes = allNotes.filter(
    (n) => n.note.date_of_service >= weekStartStr && n.note.date_of_service <= weekEndStr
  );
  const unsignedCount = allNotes.filter((n) => !n.note.signed_at).length;
  const thisWeekUnsigned = thisWeekNotes.filter((n) => !n.note.signed_at).length;

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
              <FileText className="w-6 h-6 text-[var(--color-primary)]" />
              Notes Overview
            </h1>
            <p className="text-[var(--color-text-secondary)] mt-1">
              Review, track, and manage all clinical notes
            </p>
          </div>
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-blue-50">
              <FileText size={20} className="text-blue-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-[var(--color-text)]">{thisWeekNotes.length}</p>
              <p className="text-xs text-[var(--color-text-secondary)]">Notes This Week</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-amber-50">
              <PenLine size={20} className="text-amber-600" />
            </div>
            <div>
              <p className="text-xl font-bold text-[var(--color-text)]">{unsignedCount}</p>
              <p className="text-xs text-[var(--color-text-secondary)]">Total Unsigned</p>
            </div>
          </div>
        </div>
        <div className="card p-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center justify-center w-10 h-10 rounded-lg bg-red-50">
              <Clock size={20} className="text-red-500" />
            </div>
            <div>
              <p className="text-xl font-bold text-[var(--color-text)]">{thisWeekUnsigned}</p>
              <p className="text-xs text-[var(--color-text-secondary)]">Unsigned This Week</p>
            </div>
          </div>
        </div>
      </div>

      {/* Tabs & Search */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
          {([
            { key: 'all' as TabFilter, label: 'All Notes', count: allNotes.length },
            { key: 'unsigned' as TabFilter, label: 'Needs Signature', count: unsignedCount },
            { key: 'signed' as TabFilter, label: 'Signed', count: allNotes.length - unsignedCount },
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

      {/* Notes List */}
      <div className="card overflow-hidden">
        {/* Table Header */}
        <div className="grid grid-cols-[1fr_140px_100px_100px_80px] gap-4 px-5 py-3 bg-gray-50 border-b border-[var(--color-border)] text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
          <span>Client</span>
          <span>Date of Service</span>
          <span>Time</span>
          <span>CPT</span>
          <span>Status</span>
        </div>

        {/* Notes Rows */}
        <div className="divide-y divide-[var(--color-border)]">
          {filteredNotes.length === 0 ? (
            <div className="px-5 py-12 text-center text-[var(--color-text-secondary)] text-sm">
              {tab === 'unsigned'
                ? 'No unsigned notes found. All caught up!'
                : 'No notes found matching your criteria.'}
            </div>
          ) : (
            filteredNotes.map((item) => (
              <div
                key={item.note.id}
                className="grid grid-cols-[1fr_140px_100px_100px_80px] gap-4 px-5 py-3 hover:bg-gray-50 cursor-pointer transition-colors items-center"
                onClick={() =>
                  navigate(`/clients/${item.clientId}/note/${item.note.id}`)
                }
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-[var(--color-text)] truncate">
                    {item.clientName}
                  </p>
                  <p className="text-xs text-[var(--color-text-secondary)] truncate mt-0.5">
                    {item.note.subjective
                      ? item.note.subjective.length > 60
                        ? item.note.subjective.substring(0, 60) + '...'
                        : item.note.subjective
                      : 'No subjective note'}
                  </p>
                </div>
                <div className="text-sm text-[var(--color-text)]">
                  {formatDate(item.note.date_of_service)}
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
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-100 text-amber-700 text-xs font-medium">
                      <PenLine size={12} />
                      Draft
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
