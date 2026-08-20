// SentMessagesCard — a Dashboard card giving the practitioner a receipt for outbound
// messaging: appointment reminders (SMS/email), client confirm/cancel text replies, and
// invoice / intake-form emails. The latest sends are passed in by the Dashboard (which
// fetches them so it can decide the side-by-side layout); "View all" lazily loads more via
// window.api.messages.listSent. Renders nothing when there's nothing to show.
import React, { useState, useCallback } from 'react';
import { Send, Mail, MessageSquare, X, ArrowDownLeft, ChevronRight } from 'lucide-react';
import type { SentMessage, SentMessageStatus, SentMessageChannel, SentMessageKind } from '../../shared/types';

// Groups for the dashboard preview list — messages are bucketed by type (Reminders, Invoices, …)
// with the date on the left and the recipient on the right. Order here is the display order.
const KIND_GROUPS: { label: string; kinds: SentMessageKind[] }[] = [
  { label: 'Appt Reminders', kinds: ['reminder', 'reply'] },
  { label: 'Invoices', kinds: ['invoice'] },
  { label: 'Intake Forms', kinds: ['intake'] },
  { label: 'Documents', kinds: ['documents'] },
  { label: 'Emails', kinds: ['email'] },
];

// Groups open by default; anything listed here starts collapsed.
const DEFAULT_COLLAPSED = new Set<string>(['Invoices']);

function shortDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const MODAL_LIMIT = 200;

type KindFilter = 'all' | 'reminders' | 'invoices' | 'intake' | 'documents';

function relTime(iso: string): string {
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const STATUS_STYLES: Record<SentMessageStatus, { label: string; cls: string }> = {
  sent: { label: 'Sent', cls: 'bg-teal-50 text-teal-700' },
  failed: { label: 'Failed', cls: 'bg-red-50 text-red-700' },
  confirmed: { label: 'Confirmed', cls: 'bg-emerald-50 text-emerald-700' },
  cancelled: { label: 'Cancelled', cls: 'bg-amber-50 text-amber-700' },
};

function StatusChip({ status }: { status: SentMessageStatus }) {
  const s = STATUS_STYLES[status] || STATUS_STYLES.sent;
  return <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded flex-shrink-0 whitespace-nowrap ${s.cls}`}>{s.label}</span>;
}

function ChannelIcon({ channel, isReply }: { channel: SentMessageChannel | null; isReply: boolean }) {
  if (isReply) return <ArrowDownLeft size={14} className="text-emerald-600 flex-shrink-0" />;
  if (channel === 'sms') return <MessageSquare size={14} className="text-blue-500 flex-shrink-0" />;
  return <Mail size={14} className="text-teal-600 flex-shrink-0" />;
}

function MessageRow({ m }: { m: SentMessage }) {
  const isReply = m.kind === 'reply';
  const sub = [m.context, m.recipient, m.error].filter(Boolean).join(' · ');
  return (
    <div className="flex items-center gap-3 px-5 py-2.5">
      <ChannelIcon channel={m.channel} isReply={isReply} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-[var(--color-text)] truncate min-w-0">{m.who}</span>
          <StatusChip status={m.status} />
        </div>
        {sub && <div className="text-xs text-[var(--color-text-secondary)] truncate">{sub}</div>}
      </div>
      <span className="text-xs text-[var(--color-text-secondary)] whitespace-nowrap">{relTime(m.timestamp)}</span>
    </div>
  );
}

// Compact grouped row for the dashboard preview: date on the left, recipient on the right.
function GroupedMessageRow({ m }: { m: SentMessage }) {
  const isReply = m.kind === 'reply';
  // Second line: what was sent (subject / invoice # / appt) + the address it went to.
  // For note/eval emails the context is the subject, e.g. "Evaluation — Jane (2026-08-19)".
  const showRecipient = m.recipient && m.recipient !== m.who;
  const secondary = [m.context, showRecipient ? m.recipient : ''].filter(Boolean).join(' · ');
  return (
    <div className="flex items-center gap-3 pl-9 pr-5 py-2">
      <span className="w-12 flex-shrink-0 text-xs text-[var(--color-text-secondary)] whitespace-nowrap">
        {shortDate(m.timestamp)}
      </span>
      <ChannelIcon channel={m.channel} isReply={isReply} />
      <div className="flex-1 min-w-0 text-right">
        <div className="text-sm text-[var(--color-text)] truncate">{m.who}</div>
        {secondary && (
          <div className="text-[10px] text-[var(--color-text-secondary)] truncate" title={secondary}>
            {secondary}
          </div>
        )}
      </div>
      <StatusChip status={m.status} />
    </div>
  );
}

function matchesFilter(m: SentMessage, f: KindFilter): boolean {
  if (f === 'all') return true;
  if (f === 'reminders') return m.kind === 'reminder' || m.kind === 'reply';
  if (f === 'invoices') return m.kind === 'invoice';
  if (f === 'intake') return m.kind === 'intake';
  if (f === 'documents') return m.kind === 'documents';
  return true;
}

interface SentMessagesCardProps {
  /** Latest sends, fetched by the parent (Dashboard) so it can decide the side-by-side layout. */
  messages: SentMessage[];
}

export default function SentMessagesCard({ messages }: SentMessagesCardProps) {
  const [showAll, setShowAll] = useState(false);
  const [allMsgs, setAllMsgs] = useState<SentMessage[]>([]);
  const [allLoading, setAllLoading] = useState(false);
  const [filter, setFilter] = useState<KindFilter>('all');
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(() => new Set(DEFAULT_COLLAPSED));

  const toggleGroup = useCallback((label: string) => {
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      return next;
    });
  }, []);

  const openAll = useCallback(async () => {
    setShowAll(true);
    setFilter('all');
    setAllLoading(true);
    try {
      const data = await window.api.messages.listSent({ limit: MODAL_LIMIT });
      setAllMsgs(data);
    } catch {
      setAllMsgs([]);
    } finally {
      setAllLoading(false);
    }
  }, []);

  // Nothing sent yet — render nothing (the parent drops the 2-col layout to match).
  if (messages.length === 0) return null;

  const filtered = allMsgs.filter((m) => matchesFilter(m, filter));
  const FILTERS: { key: KindFilter; label: string }[] = [
    { key: 'all', label: 'All' },
    { key: 'reminders', label: 'Reminders' },
    { key: 'invoices', label: 'Invoices' },
    { key: 'intake', label: 'Intake' },
    { key: 'documents', label: 'Documents' },
  ];

  return (
    <div className="card">
      <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
        <div className="flex items-center gap-2">
          <Send size={18} className="text-teal-500" />
          <h2 className="section-title mb-0">Recent Messages</h2>
        </div>
        <button className="text-sm text-[var(--color-primary)] hover:underline" onClick={openAll}>
          View all →
        </button>
      </div>
      <div className="py-1">
        {KIND_GROUPS.map((g) => {
          const rows = messages.filter((m) => g.kinds.includes(m.kind));
          if (rows.length === 0) return null;
          const open = !collapsedGroups.has(g.label);
          return (
            <div key={g.label}>
              <button
                className="w-full flex items-center gap-2 px-5 py-2 text-xs font-bold uppercase tracking-wider text-teal-700 bg-teal-50 border-y border-teal-100 hover:bg-teal-100/70 transition-colors"
                onClick={() => toggleGroup(g.label)}
              >
                <ChevronRight size={13} className={`transition-transform duration-150 ${open ? 'rotate-90' : ''}`} />
                <span className="text-left">{g.label}</span>
                <span className="font-semibold normal-case tracking-normal text-teal-600/80">({rows.length})</span>
                <span className="flex-1" />
              </button>
              {open && (
                <div className="divide-y divide-[var(--color-border)]">
                  {rows.map((m) => <GroupedMessageRow key={m.id} m={m} />)}
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* View-all modal */}
      {showAll && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setShowAll(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="relative z-10 bg-[var(--color-surface)] rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-2">
                <Send size={18} className="text-teal-500" />
                <h3 className="text-base font-semibold text-[var(--color-text)]">Message Activity</h3>
              </div>
              <button className="p-2 hover:bg-gray-100 rounded-lg" onClick={() => setShowAll(false)}>
                <X size={18} />
              </button>
            </div>

            {/* Filter chips */}
            <div className="flex items-center gap-1.5 px-6 py-3 border-b border-[var(--color-border)]">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  className={`text-xs px-2.5 py-1 rounded-full border transition-colors ${
                    filter === f.key
                      ? 'bg-teal-50 border-teal-300 text-teal-700 font-medium'
                      : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:bg-gray-50'
                  }`}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto divide-y divide-[var(--color-border)]">
              {allLoading ? (
                <div className="px-6 py-10 text-center text-sm text-[var(--color-text-secondary)]">Loading…</div>
              ) : filtered.length === 0 ? (
                <div className="px-6 py-10 text-center text-sm text-[var(--color-text-secondary)]">
                  No messages in this category yet.
                </div>
              ) : (
                filtered.map((m) => <MessageRow key={m.id} m={m} />)
              )}
            </div>

            {!allLoading && allMsgs.length >= MODAL_LIMIT && (
              <div className="px-6 py-3 border-t border-[var(--color-border)] text-center text-xs text-[var(--color-text-secondary)]">
                Showing the {MODAL_LIMIT} most recent messages.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
