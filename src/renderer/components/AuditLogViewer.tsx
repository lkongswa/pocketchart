import React, { useEffect, useState, useCallback } from 'react';
import { RefreshCw, ChevronDown, AlertTriangle } from 'lucide-react';

const ACTION_TYPE_LABELS: Record<string, string> = {
  client_created: 'Client Created',
  client_modified: 'Client Modified',
  client_archived: 'Client Archived',
  client_removed: 'Client Removed',
  diagnosis_changed: 'Diagnosis Changed',
  note_created: 'Note Created',
  note_signed: 'Note Signed',
  note_deleted: 'Note Deleted',
  note_draft_saved: 'Note Draft Saved',
  eval_created: 'Evaluation Created',
  eval_signed: 'Evaluation Signed',
  eval_draft_saved: 'Eval Draft Saved',
  evaluation_deleted: 'Evaluation Deleted',
  goal_created: 'Goal Created',
  goal_met: 'Goal Met',
  goal_discontinued: 'Goal Discontinued',
  compliance_override: 'Compliance Override',
  cloud_storage_warning_dismissed: 'Cloud Warning Dismissed',
  signed_document_delete_attempted: 'Signed Delete Blocked',
  integrity_violation_detected: 'Integrity Violation',
  integrity_warning_acknowledged: 'Integrity Warning Acknowledged',
  eula_accepted: 'EULA Accepted',
  eula_updated_accepted: 'EULA Update Accepted',
  payer_deleted: 'Payer Deleted',
  appointment_deleted: 'Appointment Deleted',
  invoice_deleted: 'Invoice Deleted',
  document_deleted: 'Document Deleted',
  late_documentation: 'Late Documentation',
  authorization_exceeded: 'Authorization Exceeded',
  bulk_export_performed: 'Bulk Export',
  chart_exported: 'Chart Exported',
  claim_created_from_notes: 'Claim Created',
  claim_837p_generated: '837P Generated',
  claim_submitted: 'Claim Submitted',
  fax_provider_set: 'Fax Provider Set',
  fax_provider_removed: 'Fax Provider Removed',
  clearinghouse_provider_set: 'Clearinghouse Set',
  clearinghouse_provider_removed: 'Clearinghouse Removed',
  discount_created: 'Discount Created',
};

const WARNING_ACTION_TYPES = new Set([
  'compliance_override',
  'integrity_violation_detected',
  'integrity_warning_acknowledged',
  'cloud_storage_warning_dismissed',
  'signed_document_delete_attempted',
  'late_documentation',
  'authorization_exceeded',
]);

const ENTITY_TYPE_OPTIONS = [
  { value: '', label: 'All Types' },
  { value: 'client', label: 'Client' },
  { value: 'note', label: 'Note' },
  { value: 'evaluation', label: 'Evaluation' },
  { value: 'appointment', label: 'Appointment' },
  { value: 'invoice', label: 'Invoice' },
  { value: 'payment', label: 'Payment' },
  { value: 'goal', label: 'Goal' },
  { value: 'document', label: 'Document' },
  { value: 'payer', label: 'Payer' },
  { value: 'system', label: 'System' },
];

function formatActionType(actionType: string): string {
  if (ACTION_TYPE_LABELS[actionType]) return ACTION_TYPE_LABELS[actionType];
  // Fallback: title-case with underscores replaced
  return actionType
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function formatTimestamp(ts: string): string {
  if (!ts) return '';
  try {
    const d = new Date(ts.includes('T') ? ts : ts + 'Z');
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    });
  } catch {
    return ts;
  }
}

function formatEntity(entityType: string, entityId: number | null): string {
  if (!entityType) return '';
  const typeName = entityType.charAt(0).toUpperCase() + entityType.slice(1);
  if (entityId) return `${typeName} #${entityId}`;
  return typeName;
}

function formatDetail(detail: string | null, actionType: string): string {
  if (!detail) return '';
  try {
    const parsed = JSON.parse(detail);

    if (actionType === 'client_modified' && parsed.changes) {
      const fields = Object.keys(parsed.changes);
      return `Changed: ${fields.join(', ')}`;
    }
    if (actionType === 'compliance_override') {
      return parsed.reason || parsed.override_reason || JSON.stringify(parsed);
    }
    if (actionType === 'cloud_storage_warning_dismissed') {
      const provider = parsed.cloud_provider_detected || 'Unknown';
      return `${provider} — ${parsed.path_selected || ''}`;
    }
    if (actionType === 'signed_document_delete_attempted') {
      return `${parsed.document_type || 'document'} signed ${parsed.signed_at || ''}`;
    }
    if (actionType === 'eula_accepted' || actionType === 'eula_updated_accepted') {
      return `v${parsed.eula_version || parsed.new_version || '1.0'}`;
    }
    if (actionType === 'diagnosis_changed') {
      return `${parsed.old_code || '?'} → ${parsed.new_code || '?'}`;
    }
    if (actionType === 'late_documentation') {
      return `${parsed.days_late || '?'} days late`;
    }

    // Generic: show first few key-value pairs
    const entries = Object.entries(parsed).slice(0, 3);
    return entries.map(([k, v]) => `${k}: ${v}`).join(', ');
  } catch {
    return detail.length > 80 ? detail.slice(0, 77) + '...' : detail;
  }
}

function getDefaultDateRange(): { start: string; end: string } {
  const end = new Date();
  const start = new Date();
  start.setDate(start.getDate() - 7);
  return {
    start: start.toISOString().split('T')[0],
    end: end.toISOString().split('T')[0],
  };
}

const PAGE_SIZE = 50;

export default function AuditLogViewer() {
  const defaultRange = getDefaultDateRange();
  const [entityTypeFilter, setEntityTypeFilter] = useState('');
  const [startDate, setStartDate] = useState(defaultRange.start);
  const [endDate, setEndDate] = useState(defaultRange.end);
  const [entries, setEntries] = useState<any[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [offset, setOffset] = useState(0);

  const loadEntries = useCallback(async (reset = false) => {
    setLoading(true);
    try {
      const currentOffset = reset ? 0 : offset;
      if (reset) setOffset(0);

      const result = await window.api.auditLog.list({
        entityType: entityTypeFilter || undefined,
        startDate: startDate ? startDate + ' 00:00:00' : undefined,
        endDate: endDate ? endDate + ' 23:59:59' : undefined,
        limit: PAGE_SIZE,
        offset: currentOffset,
      });

      if (reset) {
        setEntries(result.rows || result);
      } else {
        setEntries((prev) => [...prev, ...(result.rows || result)]);
      }
      setTotal(result.total ?? (result.rows || result).length);
    } catch (err) {
      console.error('Failed to load audit log:', err);
    } finally {
      setLoading(false);
    }
  }, [entityTypeFilter, startDate, endDate, offset]);

  useEffect(() => {
    loadEntries(true);
  }, [entityTypeFilter, startDate, endDate]);

  const handleLoadMore = () => {
    const nextOffset = offset + PAGE_SIZE;
    setOffset(nextOffset);
    // Load with new offset
    setLoading(true);
    window.api.auditLog.list({
      entityType: entityTypeFilter || undefined,
      startDate: startDate ? startDate + ' 00:00:00' : undefined,
      endDate: endDate ? endDate + ' 23:59:59' : undefined,
      limit: PAGE_SIZE,
      offset: nextOffset,
    }).then((result: any) => {
      setEntries((prev) => [...prev, ...(result.rows || result)]);
      setTotal(result.total ?? entries.length);
    }).catch(console.error).finally(() => setLoading(false));
  };

  const hasMore = entries.length < total;

  return (
    <div className="space-y-4">
      <p className="text-xs text-[var(--color-text-secondary)]">
        Record of all clinical document actions, data changes, and system events.
      </p>

      {/* Filter bar */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
            Entity Type
          </label>
          <div className="relative">
            <select
              value={entityTypeFilter}
              onChange={(e) => setEntityTypeFilter(e.target.value)}
              className="input pr-8 text-sm min-w-[140px]"
            >
              {ENTITY_TYPE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
            <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-[var(--color-text-secondary)]" />
          </div>
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
            Start Date
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="input text-sm"
          />
        </div>

        <div>
          <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">
            End Date
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="input text-sm"
          />
        </div>

        <button
          onClick={() => loadEntries(true)}
          className="btn-secondary text-sm gap-1.5"
          disabled={loading}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Count display */}
      <p className="text-xs text-[var(--color-text-secondary)]">
        Showing {entries.length} of {total} entries
      </p>

      {/* Table */}
      <div className="overflow-x-auto border border-[var(--color-border)] rounded-lg">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-[var(--color-border)]">
              <th className="text-left px-3 py-2 font-medium text-[var(--color-text-secondary)] text-xs">Timestamp</th>
              <th className="text-left px-3 py-2 font-medium text-[var(--color-text-secondary)] text-xs">Action</th>
              <th className="text-left px-3 py-2 font-medium text-[var(--color-text-secondary)] text-xs">Entity</th>
              <th className="text-left px-3 py-2 font-medium text-[var(--color-text-secondary)] text-xs">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border)]">
            {entries.length === 0 && !loading && (
              <tr>
                <td colSpan={4} className="px-3 py-8 text-center text-[var(--color-text-secondary)] text-sm">
                  No audit log entries found for this period.
                </td>
              </tr>
            )}
            {entries.map((entry) => {
              const isWarning = WARNING_ACTION_TYPES.has(entry.action_type);
              return (
                <tr
                  key={entry.id}
                  className={isWarning ? 'bg-amber-50/50' : 'hover:bg-gray-50'}
                >
                  <td className="px-3 py-2 text-xs text-[var(--color-text-secondary)] whitespace-nowrap">
                    {formatTimestamp(entry.timestamp || entry.created_at)}
                  </td>
                  <td className="px-3 py-2 text-xs whitespace-nowrap">
                    <span className={`inline-flex items-center gap-1 ${isWarning ? 'text-amber-700 font-medium' : 'text-[var(--color-text)]'}`}>
                      {isWarning && <AlertTriangle size={12} className="text-amber-500" />}
                      {formatActionType(entry.action_type)}
                    </span>
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--color-text-secondary)] whitespace-nowrap">
                    {formatEntity(entry.entity_type, entry.entity_id)}
                  </td>
                  <td className="px-3 py-2 text-xs text-[var(--color-text-secondary)] max-w-[300px] truncate">
                    {formatDetail(entry.detail, entry.action_type)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Load more */}
      {hasMore && (
        <div className="text-center">
          <button
            onClick={handleLoadMore}
            className="btn-secondary text-sm"
            disabled={loading}
          >
            {loading ? 'Loading...' : 'Load More'}
          </button>
        </div>
      )}
    </div>
  );
}
