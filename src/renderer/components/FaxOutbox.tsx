import React from 'react';
import { RefreshCw } from 'lucide-react';
import type { FaxLogEntry } from '../../shared/types';

interface FaxOutboxProps {
  outbox: FaxLogEntry[];
  onRefresh: () => void;
  loading: boolean;
}

const STATUS_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  queued: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Queued' },
  sending: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Sending' },
  sent: { bg: 'bg-green-100', text: 'text-green-700', label: 'Sent' },
  delivered: { bg: 'bg-green-100', text: 'text-green-700', label: 'Delivered' },
  failed: { bg: 'bg-red-100', text: 'text-red-700', label: 'Failed' },
};

export default function FaxOutbox({ outbox, onRefresh, loading }: FaxOutboxProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-[var(--color-text)]">
          Sent Faxes ({outbox.length})
        </h3>
        <button
          type="button"
          className="btn-ghost flex items-center gap-2 text-sm"
          onClick={onRefresh}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh Statuses
        </button>
      </div>

      {outbox.length === 0 ? (
        <div className="text-center py-8 text-[var(--color-text-secondary)] text-sm">
          No sent faxes yet. Send a fax from the Send tab or from a client document.
        </div>
      ) : (
        <div className="space-y-1">
          {outbox.map((fax) => {
            const badge = STATUS_BADGES[fax.status] || STATUS_BADGES.queued;
            return (
              <div key={fax.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">
                      To: {fax.physician_name || fax.fax_number || 'Unknown'}
                    </span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${badge.bg} ${badge.text}`}>
                      {badge.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[var(--color-text-secondary)] mt-0.5">
                    {fax.sent_at && <span>{new Date(fax.sent_at).toLocaleDateString()}</span>}
                    <span>{fax.fax_number}</span>
                    {fax.pages > 0 && <span>{fax.pages} page{fax.pages !== 1 ? 's' : ''}</span>}
                    {fax.document_name && <span>{fax.document_name}</span>}
                    {fax.client_name && <span>Client: {fax.client_name}</span>}
                  </div>
                  {fax.error_message && (
                    <div className="text-xs text-red-500 mt-0.5">{fax.error_message}</div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
