import React, { useState } from 'react';
import { RefreshCw, Eye, UserPlus, Check } from 'lucide-react';
import type { FaxLogEntry, Client } from '../../shared/types';

interface FaxInboxProps {
  inbox: FaxLogEntry[];
  onRefresh: () => void;
  onMatchToClient: (faxLogId: number, clientId: number) => void;
  loading: boolean;
}

const STATUS_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  received: { bg: 'bg-green-100', text: 'text-green-700', label: 'Received' },
  matched: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Matched' },
  unmatched: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Unmatched' },
};

export default function FaxInbox({ inbox, onRefresh, onMatchToClient, loading }: FaxInboxProps) {
  const [matchingId, setMatchingId] = useState<number | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientSearch, setClientSearch] = useState('');

  const openClientPicker = async (faxLogId: number) => {
    setMatchingId(faxLogId);
    const data = await window.api.clients.list();
    setClients(data.filter((c: Client) => !c.deleted_at));
  };

  const handleMatch = (clientId: number) => {
    if (matchingId) {
      onMatchToClient(matchingId, clientId);
      setMatchingId(null);
      setClientSearch('');
    }
  };

  const filteredClients = clientSearch
    ? clients.filter(c =>
        `${c.first_name} ${c.last_name}`.toLowerCase().includes(clientSearch.toLowerCase())
      ).slice(0, 8)
    : [];

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-[var(--color-text)]">
          Received Faxes ({inbox.length})
        </h3>
        <button
          type="button"
          className="btn-ghost flex items-center gap-2 text-sm"
          onClick={onRefresh}
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {inbox.length === 0 ? (
        <div className="text-center py-8 text-[var(--color-text-secondary)] text-sm">
          No received faxes yet. Faxes will appear here once SRFax is configured and receiving.
        </div>
      ) : (
        <div className="space-y-1">
          {inbox.map((fax) => {
            const badge = STATUS_BADGES[fax.status] || STATUS_BADGES.received;
            return (
              <div key={fax.id} className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">From: {fax.fax_number || 'Unknown'}</span>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${badge.bg} ${badge.text}`}>
                      {badge.label}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 text-xs text-[var(--color-text-secondary)] mt-0.5">
                    {fax.received_at && <span>{new Date(fax.received_at).toLocaleDateString()}</span>}
                    <span>{fax.pages} page{fax.pages !== 1 ? 's' : ''}</span>
                    {fax.client_name && <span className="text-blue-600">Matched: {fax.client_name}</span>}
                  </div>
                </div>

                <div className="flex items-center gap-1">
                  {fax.status === 'unmatched' && (
                    <div className="relative">
                      <button
                        type="button"
                        className="p-1.5 rounded hover:bg-blue-50 text-blue-600"
                        onClick={() => openClientPicker(fax.id)}
                        title="Match to client"
                      >
                        <UserPlus size={14} />
                      </button>

                      {matchingId === fax.id && (
                        <div className="absolute right-0 top-full mt-1 w-64 bg-white border rounded-lg shadow-lg z-10 p-2">
                          <input
                            type="text"
                            className="input w-full text-sm mb-2"
                            placeholder="Search client..."
                            value={clientSearch}
                            onChange={(e) => setClientSearch(e.target.value)}
                            autoFocus
                          />
                          {filteredClients.map(c => (
                            <button
                              key={c.id}
                              type="button"
                              className="w-full text-left px-2 py-1.5 text-sm rounded hover:bg-blue-50 flex items-center gap-2"
                              onClick={() => handleMatch(c.id)}
                            >
                              <Check size={12} className="text-blue-500" />
                              {c.first_name} {c.last_name}
                            </button>
                          ))}
                          {clientSearch && filteredClients.length === 0 && (
                            <div className="text-xs text-gray-400 px-2 py-1">No clients found</div>
                          )}
                          <button
                            type="button"
                            className="w-full text-xs text-gray-400 mt-1 hover:underline"
                            onClick={() => { setMatchingId(null); setClientSearch(''); }}
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
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
