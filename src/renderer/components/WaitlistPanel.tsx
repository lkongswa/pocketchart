import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Star, Search, ChevronLeft, Trash2, ArrowRight, Phone, Mail, Clock } from 'lucide-react';
import type { WaitlistEntry, WaitlistStatus } from '../../shared/types';

const STATUS_LABELS: Record<WaitlistStatus, string> = {
  waiting: 'Waiting',
  contacted: 'Contacted',
  scheduled_intake: 'Scheduled',
  converted: 'Converted',
  declined: 'Declined',
};

const STATUS_COLORS: Record<WaitlistStatus, string> = {
  waiting: 'bg-amber-100 text-amber-700',
  contacted: 'bg-blue-100 text-blue-700',
  scheduled_intake: 'bg-emerald-100 text-emerald-700',
  converted: 'bg-gray-100 text-gray-500',
  declined: 'bg-red-100 text-red-500',
};

interface WaitlistPanelProps {
  compact?: boolean;
}

export default function WaitlistPanel({ compact = false }: WaitlistPanelProps) {
  const [entries, setEntries] = useState<WaitlistEntry[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedId, setSelectedId] = useState<number | null>(null);

  // Quick capture form
  const [captureName, setCaptureName] = useState('');
  const [capturePhone, setCapturePhone] = useState('');
  const [captureNotes, setCaptureNotes] = useState('');

  // Detail edit form
  const [editForm, setEditForm] = useState<Partial<WaitlistEntry>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  const nameRef = useRef<HTMLInputElement>(null);

  const loadEntries = useCallback(async () => {
    try {
      const results = searchQuery
        ? await window.api.waitlist.search(searchQuery)
        : await window.api.waitlist.list();
      // Filter out converted/declined from default view
      const filtered = results.filter(
        (e: WaitlistEntry) => e.status !== 'converted' && e.status !== 'declined'
      );
      setEntries(filtered);
    } catch (err) {
      console.error('Failed to load waitlist:', err);
    }
  }, [searchQuery]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const handleQuickSave = async () => {
    const name = captureName.trim();
    if (!name) return;

    const spaceIdx = name.indexOf(' ');
    const first_name = spaceIdx > 0 ? name.slice(0, spaceIdx) : name;
    const last_name = spaceIdx > 0 ? name.slice(spaceIdx + 1) : '';

    await window.api.waitlist.create({
      first_name,
      last_name,
      phone: capturePhone.trim(),
      notes: captureNotes.trim(),
    });

    setCaptureName('');
    setCapturePhone('');
    setCaptureNotes('');
    await loadEntries();
    nameRef.current?.focus();
  };

  const selectEntry = (entry: WaitlistEntry) => {
    setSelectedId(entry.id);
    setEditForm({
      first_name: entry.first_name,
      last_name: entry.last_name,
      phone: entry.phone,
      email: entry.email,
      discipline: entry.discipline,
      referral_source: entry.referral_source,
      notes: entry.notes,
      status: entry.status,
      priority: entry.priority,
    });
    setConfirmDelete(false);
  };

  const handleEditSave = async () => {
    if (selectedId == null) return;
    await window.api.waitlist.update(selectedId, editForm);
    setSelectedId(null);
    await loadEntries();
  };

  const handleTogglePriority = async (entry: WaitlistEntry, e: React.MouseEvent) => {
    e.stopPropagation();
    await window.api.waitlist.update(entry.id, { priority: entry.priority ? 0 : 1 });
    await loadEntries();
  };

  const handleMarkContacted = async () => {
    if (selectedId == null) return;
    await window.api.waitlist.update(selectedId, {
      last_contacted: new Date().toISOString(),
      status: 'contacted',
    });
    setSelectedId(null);
    await loadEntries();
  };

  const handleDelete = async () => {
    if (selectedId == null) return;
    await window.api.waitlist.delete(selectedId);
    setSelectedId(null);
    await loadEntries();
  };

  const handleConvert = async () => {
    if (selectedId == null) return;
    const entry = entries.find((e) => e.id === selectedId);
    if (!entry) return;

    await window.api.waitlist.convertToClient(selectedId);

    // Store conversion data in sessionStorage for ClientFormModal to pick up
    sessionStorage.setItem(
      'waitlist_prefill',
      JSON.stringify({
        waitlistId: entry.id,
        first_name: entry.first_name,
        last_name: entry.last_name,
        phone: entry.phone,
        email: entry.email,
        discipline: entry.discipline,
        referral_source: entry.referral_source,
        notes: entry.notes,
      })
    );

    window.location.hash = '#/clients?fromWaitlist=1';
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return `${d.getMonth() + 1}/${d.getDate()}`;
  };

  // ── Detail/Edit View ──
  if (selectedId != null) {
    const entry = entries.find((e) => e.id === selectedId);
    return (
      <div className="flex flex-col h-full">
        {/* Back header */}
        <div className="flex items-center gap-1 px-3 py-2 border-b border-[var(--color-border)]">
          <button
            className="p-1 rounded hover:bg-gray-100 transition-colors"
            onClick={() => setSelectedId(null)}
          >
            <ChevronLeft size={14} className="text-[var(--color-text-secondary)]" />
          </button>
          <span className="text-xs font-medium text-[var(--color-text)]">
            {editForm.first_name} {editForm.last_name}
          </span>
        </div>

        <div className="flex-1 overflow-y-auto px-3 py-2 space-y-2">
          {/* Name fields */}
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <label className="text-[10px] text-[var(--color-text-secondary)] uppercase tracking-wide">First</label>
              <input
                className="w-full text-xs border border-[var(--color-border)] rounded px-2 py-1.5 focus:outline-none focus:border-teal-400"
                value={editForm.first_name || ''}
                onChange={(e) => setEditForm({ ...editForm, first_name: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[10px] text-[var(--color-text-secondary)] uppercase tracking-wide">Last</label>
              <input
                className="w-full text-xs border border-[var(--color-border)] rounded px-2 py-1.5 focus:outline-none focus:border-teal-400"
                value={editForm.last_name || ''}
                onChange={(e) => setEditForm({ ...editForm, last_name: e.target.value })}
              />
            </div>
          </div>

          {/* Phone / Email */}
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <label className="text-[10px] text-[var(--color-text-secondary)] uppercase tracking-wide">Phone</label>
              <input
                className="w-full text-xs border border-[var(--color-border)] rounded px-2 py-1.5 focus:outline-none focus:border-teal-400"
                value={editForm.phone || ''}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              />
            </div>
            <div>
              <label className="text-[10px] text-[var(--color-text-secondary)] uppercase tracking-wide">Email</label>
              <input
                className="w-full text-xs border border-[var(--color-border)] rounded px-2 py-1.5 focus:outline-none focus:border-teal-400"
                value={editForm.email || ''}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              />
            </div>
          </div>

          {/* Discipline / Status */}
          <div className="grid grid-cols-2 gap-1.5">
            <div>
              <label className="text-[10px] text-[var(--color-text-secondary)] uppercase tracking-wide">Discipline</label>
              <select
                className="w-full text-xs border border-[var(--color-border)] rounded px-2 py-1.5 focus:outline-none focus:border-teal-400 bg-white"
                value={editForm.discipline || ''}
                onChange={(e) => setEditForm({ ...editForm, discipline: e.target.value })}
              >
                <option value="">—</option>
                <option value="PT">PT</option>
                <option value="OT">OT</option>
                <option value="ST">SLP</option>
                <option value="MFT">MFT</option>
              </select>
            </div>
            <div>
              <label className="text-[10px] text-[var(--color-text-secondary)] uppercase tracking-wide">Status</label>
              <select
                className="w-full text-xs border border-[var(--color-border)] rounded px-2 py-1.5 focus:outline-none focus:border-teal-400 bg-white"
                value={editForm.status || 'waiting'}
                onChange={(e) => setEditForm({ ...editForm, status: e.target.value as WaitlistStatus })}
              >
                <option value="waiting">Waiting</option>
                <option value="contacted">Contacted</option>
                <option value="scheduled_intake">Scheduled Intake</option>
                <option value="declined">Declined</option>
              </select>
            </div>
          </div>

          {/* Referral source */}
          <div>
            <label className="text-[10px] text-[var(--color-text-secondary)] uppercase tracking-wide">Referral Source</label>
            <input
              className="w-full text-xs border border-[var(--color-border)] rounded px-2 py-1.5 focus:outline-none focus:border-teal-400"
              value={editForm.referral_source || ''}
              onChange={(e) => setEditForm({ ...editForm, referral_source: e.target.value })}
              placeholder="e.g., Dr. Smith, website, word of mouth"
            />
          </div>

          {/* Priority toggle */}
          <button
            className={`flex items-center gap-1.5 text-xs px-2 py-1 rounded transition-colors ${
              editForm.priority ? 'bg-amber-50 text-amber-600' : 'text-[var(--color-text-secondary)] hover:bg-gray-50'
            }`}
            onClick={() => setEditForm({ ...editForm, priority: editForm.priority ? 0 : 1 })}
          >
            <Star size={12} fill={editForm.priority ? 'currentColor' : 'none'} />
            {editForm.priority ? 'High priority' : 'Mark as priority'}
          </button>

          {/* Notes */}
          <div>
            <label className="text-[10px] text-[var(--color-text-secondary)] uppercase tracking-wide">Notes</label>
            <textarea
              className="w-full text-xs border border-[var(--color-border)] rounded px-2 py-1.5 focus:outline-none focus:border-teal-400 resize-none"
              rows={3}
              value={editForm.notes || ''}
              onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
              placeholder="Referral info, insurance, availability, concerns..."
            />
          </div>

          {/* Last contacted */}
          {entry?.last_contacted && (
            <div className="text-[10px] text-[var(--color-text-secondary)] flex items-center gap-1">
              <Clock size={10} />
              Last contacted: {new Date(entry.last_contacted).toLocaleDateString()}
            </div>
          )}

          {/* Mark as contacted */}
          <button
            className="w-full text-xs text-blue-600 hover:bg-blue-50 rounded py-1.5 transition-colors flex items-center justify-center gap-1"
            onClick={handleMarkContacted}
          >
            <Phone size={11} /> Mark as contacted
          </button>

          {/* Save changes */}
          <button
            className="w-full text-xs bg-teal-500 text-white rounded py-1.5 hover:bg-teal-600 transition-colors font-medium"
            onClick={handleEditSave}
          >
            Save Changes
          </button>

          {/* Convert to client */}
          <button
            className="w-full text-xs bg-teal-50 text-teal-700 border border-teal-200 rounded py-1.5 hover:bg-teal-100 transition-colors font-medium flex items-center justify-center gap-1"
            onClick={handleConvert}
          >
            Add as Client <ArrowRight size={12} />
          </button>

          {/* Delete */}
          <div className="pt-1 border-t border-[var(--color-border)]">
            {!confirmDelete ? (
              <button
                className="text-xs text-red-400 hover:text-red-500 transition-colors"
                onClick={() => setConfirmDelete(true)}
              >
                Delete entry
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <span className="text-xs text-red-500">Sure?</span>
                <button
                  className="text-xs text-red-600 font-medium hover:underline"
                  onClick={handleDelete}
                >
                  Yes, delete
                </button>
                <button
                  className="text-xs text-[var(--color-text-secondary)] hover:underline"
                  onClick={() => setConfirmDelete(false)}
                >
                  Cancel
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── List View ──
  return (
    <div className="flex flex-col h-full">
      {/* Quick capture form */}
      <div className="px-3 py-2 border-b border-[var(--color-border)] space-y-1">
        <div className="flex gap-1">
          <input
            ref={nameRef}
            type="text"
            className="flex-1 text-xs border border-[var(--color-border)] rounded px-2 py-1.5 focus:outline-none focus:border-teal-400"
            placeholder="Name"
            value={captureName}
            onChange={(e) => setCaptureName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleQuickSave()}
          />
          <input
            type="text"
            className="w-24 text-xs border border-[var(--color-border)] rounded px-2 py-1.5 focus:outline-none focus:border-teal-400"
            placeholder="Phone"
            value={capturePhone}
            onChange={(e) => setCapturePhone(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleQuickSave()}
          />
        </div>
        <div className="flex gap-1">
          <textarea
            className="flex-1 text-xs border border-[var(--color-border)] rounded px-2 py-1.5 focus:outline-none focus:border-teal-400 resize-none"
            rows={2}
            placeholder="Quick notes..."
            value={captureNotes}
            onChange={(e) => setCaptureNotes(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) handleQuickSave();
            }}
          />
          <button
            className="self-end px-2 py-1.5 bg-teal-500 text-white rounded text-xs hover:bg-teal-600 transition-colors disabled:opacity-40"
            onClick={handleQuickSave}
            disabled={!captureName.trim()}
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {/* Search */}
      <div className="px-3 py-1.5 border-b border-[var(--color-border)]">
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]" />
          <input
            type="text"
            className="w-full text-xs border border-[var(--color-border)] rounded pl-7 pr-2 py-1 focus:outline-none focus:border-teal-400"
            placeholder="Filter..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Entry list */}
      <div className="flex-1 overflow-y-auto px-2 py-1 space-y-0.5">
        {entries.length === 0 ? (
          <div className="text-center text-[var(--color-text-secondary)] text-xs py-8">
            {searchQuery ? 'No matches found.' : 'No one on the waitlist yet.'}
          </div>
        ) : (
          entries.map((entry) => (
            <button
              key={entry.id}
              className="w-full text-left px-2 py-1.5 rounded hover:bg-gray-50 transition-colors group"
              onClick={() => selectEntry(entry)}
            >
              <div className="flex items-center gap-1.5">
                <button
                  className={`flex-shrink-0 transition-colors ${
                    entry.priority ? 'text-amber-400' : 'text-gray-300 opacity-0 group-hover:opacity-100'
                  }`}
                  onClick={(e) => handleTogglePriority(entry, e)}
                  title={entry.priority ? 'Remove priority' : 'Set priority'}
                >
                  <Star size={11} fill={entry.priority ? 'currentColor' : 'none'} />
                </button>
                <span className="flex-1 text-xs font-medium text-[var(--color-text)] truncate">
                  {entry.first_name} {entry.last_name}
                </span>
                <span className="text-[10px] text-[var(--color-text-secondary)]">
                  {formatDate(entry.created_at)}
                </span>
              </div>
              {(entry.notes || entry.referral_source) && (
                <div className="text-[10px] text-[var(--color-text-secondary)] truncate ml-5 mt-0.5">
                  {entry.referral_source ? `${entry.referral_source} · ` : ''}
                  {entry.notes}
                </div>
              )}
              <div className="ml-5 mt-0.5">
                <span className={`inline-block text-[9px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[entry.status]}`}>
                  {STATUS_LABELS[entry.status]}
                </span>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
