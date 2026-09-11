import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Star, Search, ChevronLeft, Trash2, ArrowRight, Phone, Mail, Clock, Building2, MessageSquare, PhoneOff, CalendarPlus, Video } from 'lucide-react';
import type { WaitlistEntry, WaitlistStatus, ContractedEntity, WaitlistContactLogEntry } from '../../shared/types';
import EmailComposeModal from './EmailComposeModal';

/** "2026-09-03" + "10:00" → "Wednesday, September 3 at 10:00 AM" for the invite email. */
function formatConsultWhen(date: string, time: string): string {
  const d = new Date(`${date}T${time || '09:00'}`);
  if (isNaN(d.getTime())) return `${date} ${time}`;
  const day = d.toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  const t = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
  return `${day} at ${t}`;
}

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

  // Contracted entities for the entity dropdown
  const [entities, setEntities] = useState<ContractedEntity[]>([]);

  // Quick capture form
  const [captureName, setCaptureName] = useState('');
  const [capturePhone, setCapturePhone] = useState('');
  const [captureEntityId, setCaptureEntityId] = useState<number | ''>('');
  const [captureNotes, setCaptureNotes] = useState('');

  // Detail edit form
  const [editForm, setEditForm] = useState<Partial<WaitlistEntry>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Per-entry contact log (call/voicemail history)
  const [contactLog, setContactLog] = useState<WaitlistContactLogEntry[]>([]);

  // Consult booking + invite email
  const [consultDate, setConsultDate] = useState('');
  const [consultTime, setConsultTime] = useState('10:00');
  const [bookingConsult, setBookingConsult] = useState(false);
  const [consultBooked, setConsultBooked] = useState<{ date: string; time: string } | null>(null);
  const [videoLink, setVideoLink] = useState('');
  const [consultEmailOpen, setConsultEmailOpen] = useState(false);
  const [practiceName, setPracticeName] = useState('');

  const nameRef = useRef<HTMLInputElement>(null);

  // Video link + practice name for the consult invite (persisted app-wide)
  useEffect(() => {
    (async () => {
      try {
        const v = await window.api.settings.get('consult_video_link');
        if (v) setVideoLink(v);
      } catch { /* ignore */ }
      try {
        const p = await window.api.practice.get();
        if (p?.name) setPracticeName(p.name);
      } catch { /* ignore */ }
    })();
  }, []);

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

  useEffect(() => {
    (async () => {
      try {
        const list = await window.api.contractedEntities.list();
        setEntities(list || []);
      } catch (err) {
        // Pro-only IPC may reject on free tier — silently fall back to empty.
        setEntities([]);
      }
    })();
  }, []);

  const entityName = (id: number | null | undefined): string | null => {
    if (id == null) return null;
    return entities.find((e) => e.id === id)?.name ?? null;
  };

  const loadContactLog = useCallback(async (waitlistId: number) => {
    try {
      const log = await window.api.waitlist.contactLog.list(waitlistId);
      setContactLog(log || []);
    } catch {
      setContactLog([]);
    }
  }, []);

  useEffect(() => {
    if (selectedId != null) loadContactLog(selectedId);
    else setContactLog([]);
  }, [selectedId, loadContactLog]);

  const handleLogContact = async (note: string) => {
    if (selectedId == null) return;
    await window.api.waitlist.contactLog.create({ waitlist_id: selectedId, note });
    await loadContactLog(selectedId);
    await loadEntries();
  };

  const handleLogPatchLocal = (id: number, patch: Partial<WaitlistContactLogEntry>) => {
    setContactLog((cur) => cur.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  };

  const handleLogSave = async (id: number, patch: { contacted_at?: string; note?: string }) => {
    await window.api.waitlist.contactLog.update(id, patch);
    if (selectedId != null) await loadContactLog(selectedId);
  };

  const handleLogDelete = async (id: number) => {
    await window.api.waitlist.contactLog.delete(id);
    if (selectedId != null) await loadContactLog(selectedId);
  };

  const toLocalInput = (iso: string): string => {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return '';
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  };

  const fromLocalInput = (s: string): string => {
    if (!s) return new Date().toISOString();
    const d = new Date(s);
    return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
  };

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
      entity_id: captureEntityId === '' ? null : captureEntityId,
      notes: captureNotes.trim(),
    });

    setCaptureName('');
    setCapturePhone('');
    setCaptureEntityId('');
    setCaptureNotes('');
    await loadEntries();
    nameRef.current?.focus();
  };

  const handleBookConsult = async () => {
    if (selectedId == null || !consultDate) return;
    const fullName = `${editForm.first_name || ''} ${editForm.last_name || ''}`.trim();
    if (!fullName) return;
    setBookingConsult(true);
    try {
      await window.api.appointments.create({
        // no client_id — a consult has no chart; patient_name carries the identity
        patient_name: fullName,
        scheduled_date: consultDate,
        scheduled_time: consultTime,
        duration_minutes: 30,
        status: 'scheduled',
        visit_type: 'T',
        session_type: 'consult',
      });
      await window.api.waitlist.update(selectedId, { status: 'scheduled_intake' });
      await window.api.waitlist.contactLog.create({
        waitlist_id: selectedId,
        note: `Booked consult — ${formatConsultWhen(consultDate, consultTime)}`,
      });
      setEditForm((f) => ({ ...f, status: 'scheduled_intake' }));
      setConsultBooked({ date: consultDate, time: consultTime });
      await loadContactLog(selectedId);
      await loadEntries();
    } catch (err) {
      console.error('Failed to book consult:', err);
    } finally {
      setBookingConsult(false);
    }
  };

  const handleSaveVideoLink = async (value: string) => {
    setVideoLink(value);
    try {
      await window.api.settings.set('consult_video_link', value.trim());
    } catch { /* ignore */ }
  };

  const consultInviteBody = (): string => {
    const first = (editForm.first_name || '').trim() || 'there';
    const whenLine = consultBooked
      ? `Our consultation is scheduled for ${formatConsultWhen(consultBooked.date, consultBooked.time)} (about 30 minutes).\n\n`
      : '';
    const linkLine = `Join by video: ${videoLink.trim() || '[paste your video link]'}\n\n`;
    const signoff = practiceName ? `Warmly,\n${practiceName}` : 'Warmly';
    return (
      `Hi ${first},\n\n` +
      `Thank you for reaching out! I'd love to invite you to a free consultation call so we can talk about your goals and how therapy can help.\n\n` +
      whenLine +
      linkLine +
      `Family members are welcome to join. If you have any questions before then — or if the time doesn't work — just reply to this email and we'll find one that does.\n\n` +
      `Looking forward to meeting you!\n${signoff}\n`
    );
  };

  const handleSendConsultInvite = async (to: string, subject: string, body: string, cc?: string) => {
    await window.api.email.send({ to, cc, subject, bodyText: body });
    if (selectedId != null) {
      await window.api.waitlist.contactLog.create({
        waitlist_id: selectedId,
        note: `Emailed consult invite${cc ? ` (cc: ${cc})` : ''}`,
      });
      // Persist any email typed in the compose dialog back onto the entry.
      const patch: Partial<WaitlistEntry> = { last_contacted: new Date().toISOString() };
      if (to && to !== (editForm.email || '')) patch.email = to;
      if ((editForm.status || 'waiting') === 'waiting') patch.status = 'contacted';
      await window.api.waitlist.update(selectedId, patch);
      setEditForm((f) => ({ ...f, ...patch }));
      await loadContactLog(selectedId);
      await loadEntries();
    }
  };

  const selectEntry = (entry: WaitlistEntry) => {
    setSelectedId(entry.id);
    setConsultDate('');
    setConsultTime('10:00');
    setConsultBooked(null);
    setConsultEmailOpen(false);
    setEditForm({
      first_name: entry.first_name,
      last_name: entry.last_name,
      phone: entry.phone,
      email: entry.email,
      discipline: entry.discipline,
      referral_source: entry.referral_source,
      entity_id: entry.entity_id,
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

    // Contracted-entity referrals do NOT create a full chart. They create a
    // lightweight contractor_patient under the assigned entity instead.
    if (entry.entity_id != null) {
      const fullName = `${entry.first_name} ${entry.last_name}`.trim() || entry.first_name || 'Unnamed';
      try {
        await window.api.contractorPatients.create({
          entity_id: entry.entity_id,
          name: fullName,
          phone: entry.phone || '',
          notes: entry.notes || '',
        });
      } catch (err) {
        console.error('Failed to create contractor patient:', err);
        return;
      }
      await window.api.waitlist.convertToClient(selectedId);
      setSelectedId(null);
      await loadEntries();
      return;
    }

    // Direct-pay / private-pay referral: full client chart flow.
    await window.api.waitlist.convertToClient(selectedId);

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
        entity_id: entry.entity_id,
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

          {/* Contracted entity */}
          {entities.length > 0 && (
            <div>
              <label className="text-[10px] text-[var(--color-text-secondary)] uppercase tracking-wide">Contracted Entity</label>
              <select
                className="w-full text-xs border border-[var(--color-border)] rounded px-2 py-1.5 focus:outline-none focus:border-teal-400 bg-white"
                value={editForm.entity_id ?? ''}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    entity_id: e.target.value === '' ? null : Number(e.target.value),
                  })
                }
              >
                <option value="">— None —</option>
                {entities.map((ent) => (
                  <option key={ent.id} value={ent.id}>{ent.name}</option>
                ))}
              </select>
            </div>
          )}

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

          {/* Contact Log */}
          <div className="border-t border-[var(--color-border)] pt-2">
            <label className="text-[10px] text-[var(--color-text-secondary)] uppercase tracking-wide block mb-1">Contact Log</label>
            <div className="flex gap-1 mb-1.5">
              <button
                className="flex-1 text-[10px] text-blue-600 hover:bg-blue-50 border border-blue-200 rounded px-1 py-1 flex items-center justify-center gap-1 font-medium"
                onClick={() => handleLogContact('Left voicemail')}
                title="Log a voicemail attempt now (editable after)"
              >
                <Phone size={10} /> Voicemail
              </button>
              <button
                className="flex-1 text-[10px] text-blue-600 hover:bg-blue-50 border border-blue-200 rounded px-1 py-1 flex items-center justify-center gap-1 font-medium"
                onClick={() => handleLogContact('Texted')}
                title="Log an outgoing text now"
              >
                <MessageSquare size={10} /> Texted
              </button>
              <button
                className="flex-1 text-[10px] text-blue-600 hover:bg-blue-50 border border-blue-200 rounded px-1 py-1 flex items-center justify-center gap-1 font-medium"
                onClick={() => handleLogContact('No answer')}
                title="Log a no-answer attempt now"
              >
                <PhoneOff size={10} /> No answer
              </button>
            </div>
            {contactLog.length === 0 ? (
              <div className="text-[10px] text-[var(--color-text-secondary)] italic px-1 py-1">
                No call attempts logged yet.
              </div>
            ) : (
              <div className="space-y-1">
                {contactLog.map((log) => (
                  <div
                    key={log.id}
                    className="border border-[var(--color-border)] rounded px-1.5 py-1 space-y-0.5"
                  >
                    <div className="flex items-center gap-1">
                      <input
                        type="datetime-local"
                        className="flex-1 text-[10px] text-[var(--color-text-secondary)] border-0 px-0 py-0 focus:outline-none focus:bg-blue-50 bg-transparent"
                        value={toLocalInput(log.contacted_at)}
                        onChange={(e) => handleLogPatchLocal(log.id, { contacted_at: fromLocalInput(e.target.value) })}
                        onBlur={(e) => handleLogSave(log.id, { contacted_at: fromLocalInput(e.target.value) })}
                      />
                      <button
                        className="text-[var(--color-text-secondary)] hover:text-red-500 flex-shrink-0 p-0.5"
                        onClick={() => handleLogDelete(log.id)}
                        title="Delete entry"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                    <input
                      className="w-full text-[11px] text-[var(--color-text)] border-0 px-0 py-0 focus:outline-none focus:bg-blue-50 bg-transparent"
                      value={log.note}
                      onChange={(e) => handleLogPatchLocal(log.id, { note: e.target.value })}
                      onBlur={(e) => handleLogSave(log.id, { note: e.target.value })}
                      placeholder="Left voicemail"
                    />
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Mark as contacted */}
          <button
            className="w-full text-xs text-blue-600 hover:bg-blue-50 rounded py-1.5 transition-colors flex items-center justify-center gap-1"
            onClick={handleMarkContacted}
          >
            <Phone size={11} /> Mark as contacted
          </button>

          {/* ── Consult ── */}
          <div className="border-t border-[var(--color-border)] pt-2 space-y-1.5">
            <label className="text-[10px] text-[var(--color-text-secondary)] uppercase tracking-wide block">Consult</label>
            <div className="flex gap-1">
              <input
                type="date"
                className="flex-1 min-w-0 text-xs border border-[var(--color-border)] rounded px-1.5 py-1.5 focus:outline-none focus:border-sky-400"
                value={consultDate}
                onChange={(e) => setConsultDate(e.target.value)}
              />
              <input
                type="time"
                step={900}
                className="w-20 text-xs border border-[var(--color-border)] rounded px-1.5 py-1.5 focus:outline-none focus:border-sky-400"
                value={consultTime}
                onChange={(e) => setConsultTime(e.target.value)}
              />
            </div>
            <button
              className="w-full text-xs bg-sky-50 text-sky-700 border border-sky-200 rounded py-1.5 hover:bg-sky-100 transition-colors font-medium flex items-center justify-center gap-1 disabled:opacity-40"
              onClick={handleBookConsult}
              disabled={!consultDate || bookingConsult}
              title="Books a 30-min consult on the calendar (no chart created) and marks this entry Scheduled"
            >
              <CalendarPlus size={12} /> {bookingConsult ? 'Booking…' : consultBooked ? 'Consult booked ✓ — book another' : 'Book consult on calendar'}
            </button>
            <div className="flex items-center gap-1">
              <Video size={11} className="text-[var(--color-text-secondary)] flex-shrink-0" />
              <input
                className="flex-1 min-w-0 text-[11px] border border-[var(--color-border)] rounded px-1.5 py-1 focus:outline-none focus:border-sky-400"
                placeholder="Your video link (saved for all invites)"
                value={videoLink}
                onChange={(e) => setVideoLink(e.target.value)}
                onBlur={(e) => handleSaveVideoLink(e.target.value)}
                title="Zoom/Meet link included in consult invite emails — remembered across entries"
              />
            </div>
            <button
              className="w-full text-xs bg-sky-500 text-white rounded py-1.5 hover:bg-sky-600 transition-colors font-medium flex items-center justify-center gap-1"
              onClick={() => setConsultEmailOpen(true)}
            >
              <Mail size={12} /> Email consult invite
            </button>
          </div>

          {/* Save changes */}
          <button
            className="w-full text-xs bg-teal-500 text-white rounded py-1.5 hover:bg-teal-600 transition-colors font-medium"
            onClick={handleEditSave}
          >
            Save Changes
          </button>

          {/* Convert: routes to contractor_patient if entity is assigned, else full client chart */}
          <button
            className="w-full text-xs bg-teal-50 text-teal-700 border border-teal-200 rounded py-1.5 hover:bg-teal-100 transition-colors font-medium flex items-center justify-center gap-1"
            onClick={handleConvert}
            title={
              editForm.entity_id
                ? `Adds to ${entityName(editForm.entity_id) ?? 'the assigned entity'}'s patient list — no separate chart`
                : 'Creates a full client chart'
            }
          >
            {editForm.entity_id
              ? `Add to ${entityName(editForm.entity_id) ?? 'Entity'}`
              : 'Add as Client'} <ArrowRight size={12} />
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

        {/* Consult invite email */}
        <EmailComposeModal
          isOpen={consultEmailOpen}
          onClose={() => setConsultEmailOpen(false)}
          heading="Consult Invite"
          defaultTo={editForm.email || ''}
          defaultSubject={`Consultation invitation${practiceName ? ` — ${practiceName}` : ''}`}
          defaultBody={consultInviteBody()}
          onSend={handleSendConsultInvite}
        />
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
        {entities.length > 0 && (
          <select
            className="w-full text-xs border border-[var(--color-border)] rounded px-2 py-1.5 focus:outline-none focus:border-teal-400 bg-white"
            value={captureEntityId}
            onChange={(e) => setCaptureEntityId(e.target.value === '' ? '' : Number(e.target.value))}
            title="Contracted entity (optional)"
          >
            <option value="">No contracted entity</option>
            {entities.map((ent) => (
              <option key={ent.id} value={ent.id}>{ent.name}</option>
            ))}
          </select>
        )}
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
              <div className="ml-5 mt-0.5 flex items-center gap-1 flex-wrap">
                <span className={`inline-block text-[9px] px-1.5 py-0.5 rounded-full font-medium ${STATUS_COLORS[entry.status]}`}>
                  {STATUS_LABELS[entry.status]}
                </span>
                {entityName(entry.entity_id) && (
                  <span className="inline-flex items-center gap-0.5 text-[9px] px-1.5 py-0.5 rounded-full font-medium bg-indigo-50 text-indigo-700">
                    <Building2 size={9} />
                    {entityName(entry.entity_id)}
                  </span>
                )}
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
