import React, { useState, useEffect, useCallback } from 'react';
import { MessageSquare, Plus, Trash2, Phone, Mail, Users, FileText } from 'lucide-react';
import type { CommunicationLogEntry, CommunicationType, CommunicationDirection } from '@shared/types';

interface CommunicationLogSectionProps {
  clientId: number;
}

const TYPE_ICONS: Record<CommunicationType, React.ElementType> = {
  phone: Phone,
  email: Mail,
  fax: FileText,
  in_person: Users,
  other: MessageSquare,
};

const TYPE_LABELS: Record<CommunicationType, string> = {
  phone: 'Phone',
  email: 'Email',
  fax: 'Fax',
  in_person: 'In Person',
  other: 'Other',
};

const DIRECTION_LABELS: Record<CommunicationDirection, string> = {
  outgoing: 'Outgoing',
  incoming: 'Incoming',
};

export default function CommunicationLogSection({ clientId }: CommunicationLogSectionProps) {
  const [entries, setEntries] = useState<CommunicationLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Form state
  const [commDate, setCommDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [commType, setCommType] = useState<CommunicationType>('phone');
  const [direction, setDirection] = useState<CommunicationDirection>('outgoing');
  const [contactName, setContactName] = useState('');
  const [summary, setSummary] = useState('');

  const loadEntries = useCallback(async () => {
    try {
      setLoading(true);
      const data = await window.api.communicationLog.list(clientId);
      setEntries(data);
    } catch (err) {
      console.error('Failed to load communication log:', err);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const handleAdd = async () => {
    if (!summary.trim()) return;
    try {
      await window.api.communicationLog.create({
        client_id: clientId,
        communication_date: commDate,
        type: commType,
        direction,
        contact_name: contactName.trim(),
        summary: summary.trim(),
      });
      setShowForm(false);
      setContactName('');
      setSummary('');
      setCommDate(new Date().toISOString().slice(0, 10));
      loadEntries();
    } catch (err) {
      console.error('Failed to add communication:', err);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await window.api.communicationLog.delete(id);
      loadEntries();
    } catch (err) {
      console.error('Failed to delete communication:', err);
    }
  };

  if (loading) {
    return <div className="text-sm text-[var(--color-text-secondary)]">Loading communication log...</div>;
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="section-title flex items-center gap-2">
          <MessageSquare size={16} className="text-[var(--color-primary)]" />
          Communication Log
        </h3>
        <button className="btn-primary btn-sm gap-1.5" onClick={() => setShowForm(true)}>
          <Plus size={14} /> Add Entry
        </button>
      </div>

      {/* Add form */}
      {showForm && (
        <div className="card p-4 mb-4 space-y-3">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <div>
              <label className="label">Date</label>
              <input
                type="date"
                className="input w-full"
                value={commDate}
                onChange={(e) => setCommDate(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Type</label>
              <select
                className="select w-full"
                value={commType}
                onChange={(e) => setCommType(e.target.value as CommunicationType)}
              >
                {Object.entries(TYPE_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Direction</label>
              <select
                className="select w-full"
                value={direction}
                onChange={(e) => setDirection(e.target.value as CommunicationDirection)}
              >
                {Object.entries(DIRECTION_LABELS).map(([val, label]) => (
                  <option key={val} value={val}>{label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Contact Name</label>
              <input
                className="input w-full"
                placeholder="Dr. Smith"
                value={contactName}
                onChange={(e) => setContactName(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label className="label">Summary *</label>
            <textarea
              className="textarea w-full"
              rows={2}
              placeholder="Describe the communication..."
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
            <button className="btn-primary btn-sm" onClick={handleAdd} disabled={!summary.trim()}>Add</button>
          </div>
        </div>
      )}

      {/* Entries */}
      {entries.length === 0 ? (
        <div className="card p-6 text-center">
          <MessageSquare size={28} className="mx-auto text-[var(--color-text-secondary)] mb-2 opacity-40" />
          <p className="text-sm text-[var(--color-text-secondary)]">
            No communication logged yet. Record calls, emails, and meetings.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {entries.map((entry) => {
            const Icon = TYPE_ICONS[entry.type] || MessageSquare;
            return (
              <div key={entry.id} className="card p-3 flex items-start gap-3">
                <div className="w-8 h-8 rounded-lg bg-[var(--color-primary)]/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                  <Icon size={14} className="text-[var(--color-primary)]" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-0.5">
                    <span className="text-xs font-medium text-[var(--color-text)]">
                      {TYPE_LABELS[entry.type]}
                    </span>
                    <span className={`badge text-[10px] ${entry.direction === 'incoming' ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                      {DIRECTION_LABELS[entry.direction]}
                    </span>
                    {entry.contact_name && (
                      <span className="text-xs text-[var(--color-text-secondary)]">
                        with {entry.contact_name}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-[var(--color-text)]">{entry.summary}</p>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                    {new Date(entry.communication_date + 'T00:00:00').toLocaleDateString()}
                  </p>
                </div>
                <button
                  className="btn-ghost btn-sm text-red-500 flex-shrink-0"
                  onClick={() => handleDelete(entry.id)}
                >
                  <Trash2 size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
