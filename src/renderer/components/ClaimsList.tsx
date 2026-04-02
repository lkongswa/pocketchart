import React, { useState, useEffect, useCallback } from 'react';
import {
  Search,
  Plus,
  Filter,
  FileText,
  Loader2,
  AlertCircle,
  ChevronRight,
  RefreshCw,
} from 'lucide-react';
import type { Claim, ClaimStatus, Client, Note } from '../../shared/types';

// Status badge config
const STATUS_BADGE: Record<ClaimStatus, { bg: string; text: string; label: string }> = {
  draft: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Draft' },
  ready: { bg: 'bg-blue-50', text: 'text-blue-600', label: 'Ready' },
  validated: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Validated' },
  submitted: { bg: 'bg-indigo-100', text: 'text-indigo-700', label: 'Submitted' },
  accepted: { bg: 'bg-cyan-100', text: 'text-cyan-700', label: 'Accepted' },
  acknowledged: { bg: 'bg-teal-100', text: 'text-teal-700', label: 'Acknowledged' },
  pending: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Pending' },
  paid: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Paid' },
  denied: { bg: 'bg-red-100', text: 'text-red-700', label: 'Denied' },
  appeal_in_progress: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Appeal In Progress' },
  appealed: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Appealed' },
  rejected: { bg: 'bg-rose-100', text: 'text-rose-700', label: 'Rejected' },
  void: { bg: 'bg-gray-100', text: 'text-gray-500', label: 'Void' },
};

interface ClaimsListProps {
  claims: Claim[];
  loading: boolean;
  error: string | null;
  onSelectClaim: (claimId: number) => void;
  onCreateClaim: (clientId: number, noteIds: number[]) => Promise<Claim | null>;
  onRefresh: (filters?: any) => void;
  onToast: (msg: string) => void;
}

function StatusBadge({ status }: { status: ClaimStatus }) {
  const cfg = STATUS_BADGE[status] || STATUS_BADGE.draft;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export default function ClaimsList({
  claims,
  loading,
  error,
  onSelectClaim,
  onCreateClaim,
  onRefresh,
  onToast,
}: ClaimsListProps) {
  // Filters
  const [statusFilter, setStatusFilter] = useState<ClaimStatus | ''>('');
  const [searchQuery, setSearchQuery] = useState('');

  // Create claim flow
  const [showCreatePanel, setShowCreatePanel] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<number | null>(null);
  const [clientNotes, setClientNotes] = useState<Note[]>([]);
  const [selectedNoteIds, setSelectedNoteIds] = useState<Set<number>>(new Set());
  const [creating, setCreating] = useState(false);
  const [loadingNotes, setLoadingNotes] = useState(false);

  // Load on mount and when filters change
  useEffect(() => {
    onRefresh({
      status: statusFilter || undefined,
      search: searchQuery || undefined,
    });
  }, [statusFilter, searchQuery, onRefresh]);

  // Load clients for the create flow
  const loadClients = useCallback(async () => {
    try {
      const result = await window.api.clients.list({ status: 'active' });
      setClients(result);
    } catch (err) {
      console.error('Failed to load clients:', err);
    }
  }, []);

  useEffect(() => {
    if (showCreatePanel && clients.length === 0) {
      loadClients();
    }
  }, [showCreatePanel, clients.length, loadClients]);

  // Load signed notes for selected client
  useEffect(() => {
    if (!selectedClientId) {
      setClientNotes([]);
      setSelectedNoteIds(new Set());
      return;
    }
    setLoadingNotes(true);
    window.api.notes.listByClient(selectedClientId).then((notes) => {
      // Only show signed, unbilled notes
      const signed = notes.filter((n) => n.signed_at && !n.cms1500_generated_at);
      setClientNotes(signed);
      setSelectedNoteIds(new Set());
    }).catch(console.error).finally(() => setLoadingNotes(false));
  }, [selectedClientId]);

  const handleCreateClaim = async () => {
    if (!selectedClientId || selectedNoteIds.size === 0) return;
    setCreating(true);
    try {
      const claim = await onCreateClaim(selectedClientId, Array.from(selectedNoteIds));
      if (claim) {
        onToast(`Claim ${claim.claim_number} created`);
        setShowCreatePanel(false);
        setSelectedClientId(null);
        setSelectedNoteIds(new Set());
        onRefresh({
          status: statusFilter || undefined,
          search: searchQuery || undefined,
        });
      }
    } catch (err) {
      onToast('Failed to create claim');
    } finally {
      setCreating(false);
    }
  };

  const toggleNoteSelection = (noteId: number) => {
    setSelectedNoteIds((prev) => {
      const next = new Set(prev);
      if (next.has(noteId)) {
        next.delete(noteId);
      } else {
        next.add(noteId);
      }
      return next;
    });
  };

  // Stats
  const totalClaims = claims.length;
  const draftCount = claims.filter((c) => c.status === 'draft').length;
  const submittedCount = claims.filter((c) => ['submitted', 'accepted', 'acknowledged', 'pending'].includes(c.status)).length;
  const paidCount = claims.filter((c) => c.status === 'paid').length;
  const deniedCount = claims.filter((c) => ['denied', 'rejected'].includes(c.status)).length;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Insurance Claims</h2>
          <div className="flex items-center gap-3 mt-1 text-xs text-[var(--color-text-secondary)]">
            <span>{totalClaims} total</span>
            {draftCount > 0 && <span>· {draftCount} draft</span>}
            {submittedCount > 0 && <span>· {submittedCount} in progress</span>}
            {paidCount > 0 && <span className="text-emerald-600">· {paidCount} paid</span>}
            {deniedCount > 0 && <span className="text-red-600">· {deniedCount} denied</span>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="btn-ghost text-sm gap-1.5"
            onClick={() => onRefresh({ status: statusFilter || undefined, search: searchQuery || undefined })}
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <button
            className="btn-primary text-sm gap-1.5"
            onClick={() => setShowCreatePanel(!showCreatePanel)}
          >
            <Plus className="w-4 h-4" />
            New Claim
          </button>
        </div>
      </div>

      {/* Create Claim Panel */}
      {showCreatePanel && (
        <div className="card p-4 border-2 border-[var(--color-primary)]/20 space-y-3">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Create Claim from Signed Notes</h3>

          {/* Client Selection */}
          <div>
            <label className="label">Select Client</label>
            <select
              className="select w-full"
              value={selectedClientId || ''}
              onChange={(e) => setSelectedClientId(e.target.value ? Number(e.target.value) : null)}
            >
              <option value="">Choose a client...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.last_name}, {c.first_name} {c.insurance_payer ? `(${c.insurance_payer})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Notes Selection */}
          {selectedClientId && (
            <div>
              <label className="label">Select Signed Notes</label>
              {loadingNotes ? (
                <div className="flex items-center gap-2 text-sm text-[var(--color-text-secondary)] py-2">
                  <Loader2 className="w-4 h-4 animate-spin" /> Loading notes...
                </div>
              ) : clientNotes.length === 0 ? (
                <p className="text-sm text-[var(--color-text-secondary)] py-2">
                  No signed, unbilled notes found for this client.
                </p>
              ) : (
                <div className="max-h-48 overflow-y-auto border border-[var(--color-border)] rounded-lg divide-y divide-[var(--color-border)]">
                  {clientNotes.map((note) => (
                    <label
                      key={note.id}
                      className="flex items-center gap-3 px-3 py-2 hover:bg-[var(--color-hover)] cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedNoteIds.has(note.id)}
                        onChange={() => toggleNoteSelection(note.id)}
                        className="rounded"
                      />
                      <div className="flex-1 min-w-0">
                        <span className="text-sm text-[var(--color-text)]">
                          {formatDate(note.date_of_service)}
                        </span>
                        <span className="text-xs text-[var(--color-text-secondary)] ml-2">
                          {note.cpt_code} · {formatCurrency(note.charge_amount || 0)}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-1">
            <button
              className="btn-primary text-sm gap-1.5"
              disabled={!selectedClientId || selectedNoteIds.size === 0 || creating}
              onClick={handleCreateClaim}
            >
              {creating ? (
                <><Loader2 className="w-4 h-4 animate-spin" /> Creating...</>
              ) : (
                <><Plus className="w-4 h-4" /> Create Claim ({selectedNoteIds.size} note{selectedNoteIds.size !== 1 ? 's' : ''})</>
              )}
            </button>
            <button
              className="btn-ghost text-sm"
              onClick={() => {
                setShowCreatePanel(false);
                setSelectedClientId(null);
                setSelectedNoteIds(new Set());
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Filter Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]" />
          <input
            type="text"
            className="input w-full pl-9"
            placeholder="Search by claim #, client, or payer..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-1.5">
          <Filter className="w-4 h-4 text-[var(--color-text-secondary)]" />
          <select
            className="select text-sm"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as ClaimStatus | '')}
          >
            <option value="">All Statuses</option>
            <option value="draft">Draft</option>
            <option value="validated">Validated</option>
            <option value="submitted">Submitted</option>
            <option value="accepted">Accepted</option>
            <option value="pending">Pending</option>
            <option value="paid">Paid</option>
            <option value="denied">Denied</option>
            <option value="rejected">Rejected</option>
            <option value="appealed">Appealed</option>
            <option value="void">Void</option>
          </select>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-sm text-red-700">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          {error}
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary)]" />
        </div>
      )}

      {/* Empty State */}
      {!loading && claims.length === 0 && (
        <div className="text-center py-16">
          <FileText className="w-12 h-12 mx-auto text-[var(--color-text-tertiary)] mb-3" />
          <h3 className="text-sm font-medium text-[var(--color-text)]">No claims yet</h3>
          <p className="text-xs text-[var(--color-text-secondary)] mt-1 max-w-sm mx-auto">
            Create your first insurance claim by selecting signed notes for a client.
          </p>
          <button
            className="btn-primary text-sm gap-1.5 mt-4"
            onClick={() => setShowCreatePanel(true)}
          >
            <Plus className="w-4 h-4" />
            Create First Claim
          </button>
        </div>
      )}

      {/* Claims Table */}
      {!loading && claims.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                <th className="text-left text-xs font-medium text-[var(--color-text-secondary)] px-4 py-3">Claim #</th>
                <th className="text-left text-xs font-medium text-[var(--color-text-secondary)] px-4 py-3">Client</th>
                <th className="text-left text-xs font-medium text-[var(--color-text-secondary)] px-4 py-3">Payer</th>
                <th className="text-left text-xs font-medium text-[var(--color-text-secondary)] px-4 py-3">Service Dates</th>
                <th className="text-right text-xs font-medium text-[var(--color-text-secondary)] px-4 py-3">Total</th>
                <th className="text-left text-xs font-medium text-[var(--color-text-secondary)] px-4 py-3">Status</th>
                <th className="w-8" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {claims.map((claim) => (
                <tr
                  key={claim.id}
                  className="hover:bg-[var(--color-hover)] cursor-pointer transition-colors"
                  onClick={() => onSelectClaim(claim.id)}
                >
                  <td className="px-4 py-3">
                    <span className="text-sm font-medium text-[var(--color-primary)]">
                      {claim.claim_number || `#${claim.id}`}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-sm text-[var(--color-text)]">
                    {claim.client_name || `Client #${claim.client_id}`}
                  </td>
                  <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">
                    {claim.payer_name || '—'}
                  </td>
                  <td className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">
                    {formatDate(claim.service_date_start)}
                    {claim.service_date_end && claim.service_date_end !== claim.service_date_start
                      ? ` – ${formatDate(claim.service_date_end)}`
                      : ''}
                  </td>
                  <td className="px-4 py-3 text-sm text-right font-medium text-[var(--color-text)]">
                    {formatCurrency(claim.total_charge || 0)}
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={claim.status} />
                  </td>
                  <td className="px-2 py-3">
                    <ChevronRight className="w-4 h-4 text-[var(--color-text-tertiary)]" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
