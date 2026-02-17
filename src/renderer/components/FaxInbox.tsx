import React, { useState } from 'react';
import { RefreshCw, Eye, UserPlus, Check, Download, Loader2, ChevronDown } from 'lucide-react';
import type { FaxLogEntry, Client, FaxTrackingEntry, ClientDocumentCategory } from '../../shared/types';
import { CLIENT_DOCUMENT_CATEGORY_LABELS } from '../../shared/types';

interface FaxInboxProps {
  inbox: FaxLogEntry[];
  onRefresh: () => Promise<void> | void;
  onMatchToClient: (faxLogId: number, clientId: number) => void;
  onSaveToChart: (faxLogId: number, clientId: number, category: string, linkToOutboundFaxId?: number) => Promise<void>;
  loading: boolean;
}

const STATUS_BADGES: Record<string, { bg: string; text: string; label: string }> = {
  received: { bg: 'bg-green-100', text: 'text-green-700', label: 'Received' },
  matched: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Matched' },
  unmatched: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Unmatched' },
  ambiguous: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Multiple Clients' },
};

const SAVE_CATEGORIES: ClientDocumentCategory[] = [
  'signed_poc', 'recertification', 'physician_order', 'prior_authorization',
  'correspondence', 'intake_form', 'discharge_summary', 'other',
];

export default function FaxInbox({ inbox, onRefresh, onMatchToClient, onSaveToChart, loading }: FaxInboxProps) {
  const [polling, setPolling] = useState(false);
  const [matchingId, setMatchingId] = useState<number | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  // Save to Chart state
  const [savingFaxId, setSavingFaxId] = useState<number | null>(null);
  const [saveCategory, setSaveCategory] = useState<ClientDocumentCategory>('signed_poc');
  const [outboundFaxes, setOutboundFaxes] = useState<FaxTrackingEntry[]>([]);
  const [selectedOutboundId, setSelectedOutboundId] = useState<number | undefined>(undefined);
  const [savingInProgress, setSavingInProgress] = useState(false);
  // Preview state
  const [previewFaxId, setPreviewFaxId] = useState<number | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const isLoading = loading || polling;

  const handleRefresh = async () => {
    setPolling(true);
    try {
      await onRefresh();
    } finally {
      setPolling(false);
    }
  };

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

  const openSavePanel = async (fax: FaxLogEntry) => {
    setSavingFaxId(fax.id);
    setSaveCategory('signed_poc');
    setSelectedOutboundId(undefined);
    // Load outbound faxes for this client to enable linking
    if (fax.client_id) {
      try {
        const tracking = await window.api.fax.getOutboundByClient(fax.client_id);
        setOutboundFaxes(tracking);
      } catch { setOutboundFaxes([]); }
    } else {
      setOutboundFaxes([]);
    }
  };

  const handleSave = async (fax: FaxLogEntry) => {
    if (!fax.client_id) return;
    setSavingInProgress(true);
    try {
      await onSaveToChart(fax.id, fax.client_id, saveCategory, selectedOutboundId);
      setSavingFaxId(null);
    } catch (err) {
      console.error('Failed to save fax to chart:', err);
    } finally {
      setSavingInProgress(false);
    }
  };

  const handlePreview = async (fax: FaxLogEntry) => {
    if (previewFaxId === fax.id) {
      // Toggle off
      setPreviewFaxId(null);
      if (previewUrl) { URL.revokeObjectURL(previewUrl); setPreviewUrl(null); }
      return;
    }
    setPreviewFaxId(fax.id);
    setPreviewLoading(true);
    try {
      const result = await window.api.fax.retrieveFax(fax.srfax_id);
      const byteArray = Uint8Array.from(atob(result.base64Pdf), c => c.charCodeAt(0));
      const blob = new Blob([byteArray], { type: 'application/pdf' });
      if (previewUrl) URL.revokeObjectURL(previewUrl);
      setPreviewUrl(URL.createObjectURL(blob));
    } catch (err) {
      console.error('Failed to retrieve fax for preview:', err);
      setPreviewFaxId(null);
    } finally {
      setPreviewLoading(false);
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
          onClick={handleRefresh}
          disabled={isLoading}
        >
          <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
          {polling ? 'Checking SRFax...' : 'Refresh'}
        </button>
      </div>

      {inbox.length === 0 ? (
        <div className="text-center py-8 text-[var(--color-text-secondary)] text-sm">
          No received faxes yet. Faxes will appear here once SRFax is configured and receiving.
        </div>
      ) : (
        <div className="space-y-1">
          {inbox.map((fax) => {
            const badge = STATUS_BADGES[fax.status] || STATUS_BADGES[fax.matched_confidence === 'ambiguous' ? 'ambiguous' : 'received'];
            const isSaved = fax.document_id != null;
            const showMatchButton = fax.status === 'unmatched' || fax.matched_confidence === 'ambiguous';
            const showSaveButton = fax.client_id != null && !isSaved;

            return (
              <div key={fax.id}>
                <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium">From: {fax.fax_number || 'Unknown'}</span>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${badge.bg} ${badge.text}`}>
                        {badge.label}
                      </span>
                      {isSaved && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full font-medium bg-purple-100 text-purple-700">
                          Saved to Chart
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-xs text-[var(--color-text-secondary)] mt-0.5">
                      {fax.received_at && <span>{new Date(fax.received_at).toLocaleDateString()}</span>}
                      <span>{fax.pages} page{fax.pages !== 1 ? 's' : ''}</span>
                      {fax.client_name && <span className="text-blue-600">Matched: {fax.client_name}</span>}
                      {fax.matched_confidence === 'ambiguous' && (
                        <span className="text-orange-600 italic">This physician has multiple clients</span>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-1">
                    {/* Preview button */}
                    {fax.srfax_id && (
                      <button
                        type="button"
                        className={`p-1.5 rounded hover:bg-gray-100 ${previewFaxId === fax.id ? 'text-violet-600 bg-violet-50' : 'text-[var(--color-text-secondary)]'}`}
                        onClick={() => handlePreview(fax)}
                        title="Preview fax"
                        disabled={previewLoading && previewFaxId === fax.id}
                      >
                        {previewLoading && previewFaxId === fax.id ? <Loader2 size={14} className="animate-spin" /> : <Eye size={14} />}
                      </button>
                    )}

                    {/* Save to Chart button */}
                    {showSaveButton && (
                      <button
                        type="button"
                        className="p-1.5 rounded hover:bg-purple-50 text-purple-600"
                        onClick={() => openSavePanel(fax)}
                        title="Save to client chart"
                      >
                        <Download size={14} />
                      </button>
                    )}

                    {/* Match to client button */}
                    {showMatchButton && (
                      <div className="relative">
                        <button
                          type="button"
                          className="p-1.5 rounded hover:bg-blue-50 text-blue-600"
                          onClick={() => openClientPicker(fax.id)}
                          title={fax.matched_confidence === 'ambiguous' ? 'Select the correct client' : 'Match to client'}
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

                {/* Preview panel */}
                {previewFaxId === fax.id && previewUrl && (
                  <div className="mx-3 mb-2 border rounded-lg overflow-hidden" style={{ height: 500 }}>
                    <iframe src={previewUrl} className="w-full h-full" title="Fax Preview" />
                  </div>
                )}

                {/* Save to Chart panel */}
                {savingFaxId === fax.id && (
                  <div className="mx-3 mb-2 p-3 bg-purple-50 border border-purple-200 rounded-lg">
                    <h4 className="text-sm font-medium text-purple-800 mb-2">Save to Client Chart</h4>

                    <div className="space-y-2">
                      {/* Category selector */}
                      <div>
                        <label className="text-xs text-purple-700 font-medium">Document Category</label>
                        <select
                          className="input w-full text-sm mt-0.5"
                          value={saveCategory}
                          onChange={(e) => setSaveCategory(e.target.value as ClientDocumentCategory)}
                        >
                          {SAVE_CATEGORIES.map(cat => (
                            <option key={cat} value={cat}>
                              {CLIENT_DOCUMENT_CATEGORY_LABELS[cat]}
                            </option>
                          ))}
                        </select>
                      </div>

                      {/* Link to outbound fax (optional) */}
                      {outboundFaxes.length > 0 && (
                        <div>
                          <label className="text-xs text-purple-700 font-medium">Link to Sent Fax (optional)</label>
                          <select
                            className="input w-full text-sm mt-0.5"
                            value={selectedOutboundId || ''}
                            onChange={(e) => setSelectedOutboundId(e.target.value ? Number(e.target.value) : undefined)}
                          >
                            <option value="">-- None --</option>
                            {outboundFaxes.map(ob => (
                              <option key={ob.id} value={ob.id}>
                                {ob.eval_id ? 'Eval' : 'Note'} — sent {ob.sent_at ? new Date(ob.sent_at).toLocaleDateString() : 'unknown'}
                              </option>
                            ))}
                          </select>
                          <p className="text-[10px] text-purple-600 mt-0.5">
                            Linking marks the original eval/note as "signed copy received"
                          </p>
                        </div>
                      )}

                      <div className="flex items-center gap-2 mt-1">
                        <button
                          type="button"
                          className="btn btn-sm bg-purple-600 text-white hover:bg-purple-700 flex items-center gap-1"
                          onClick={() => handleSave(fax)}
                          disabled={savingInProgress}
                        >
                          {savingInProgress ? (
                            <><Loader2 size={12} className="animate-spin" /> Saving...</>
                          ) : (
                            <><Download size={12} /> Save to Chart</>
                          )}
                        </button>
                        <button
                          type="button"
                          className="btn btn-sm btn-ghost text-xs"
                          onClick={() => setSavingFaxId(null)}
                          disabled={savingInProgress}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
