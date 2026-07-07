import React, { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Plus, Building2, Search, Pencil, FileUp, CheckCircle,
  LayoutGrid, CalendarDays, ChevronDown, Send, Mail, RefreshCw,
  CheckSquare, Square, FileCheck, X,
} from 'lucide-react';
import type { ContractedEntity, Appointment, Invoice, InvoiceStatus } from '@shared/types';
import EntityFormModal from '../components/EntityFormModal';
import ProFeatureGate from '../components/ProFeatureGate';
import BulkInvoiceSendModal, { BulkSendResult } from '../components/BulkInvoiceSendModal';

interface EntityStats {
  scheduled: number;
  scheduledValue: number;
  completed: number;
  completedValue: number;
  unbilledCount: number;
  unbilledValue: number;
}

// Per-entity, per-month rollup that powers the month matrix.
type CellStatus = 'none' | 'planned' | 'unbilled' | 'draft' | 'sent' | 'partial' | 'paid' | 'overdue' | 'void';

interface MonthCell {
  earned: number;         // sum of completed-visit value
  planned: number;        // sum of scheduled-visit value
  unbilledValue: number;  // completed value not yet on an invoice
  unbilledCount: number;
  completedCount: number;
  scheduledCount: number;
  invoiced: number;       // sum of invoice totals attributed to this month
  invoices: Invoice[];    // invoices attributed to this month
  status: CellStatus;
}

const MONTHS_BACK = 6;

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

// Trailing MONTHS_BACK months (oldest → current) as 'YYYY-MM' keys.
function buildMonthKeys(): string[] {
  const now = new Date();
  const keys: string[] = [];
  for (let i = MONTHS_BACK - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return keys;
}

function monthLabel(key: string): { m: string; y: string } {
  const [y, m] = key.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  return { m: d.toLocaleDateString('en-US', { month: 'short' }), y: String(y) };
}

// Invoices that still make sense to send (draft/sent/partial/overdue). Paid & void are excluded.
const isSendable = (inv: Invoice) => inv.status !== 'paid' && inv.status !== 'void';

function deriveCellStatus(cell: MonthCell): CellStatus {
  if (cell.invoices.length) {
    const st = cell.invoices.map((i) => i.status);
    if (st.every((s) => s === 'paid')) return 'paid';
    if (st.some((s) => s === 'draft')) return 'draft';
    if (st.some((s) => s === 'overdue')) return 'overdue';
    if (st.some((s) => s === 'partial')) return 'partial';
    if (st.some((s) => s === 'sent')) return 'sent';
    if (st.some((s) => s === 'void')) return 'void';
    return 'sent';
  }
  if (cell.unbilledCount > 0) return 'unbilled';
  if (cell.scheduledCount > 0) return 'planned';
  return 'none';
}

function computeMonths(appts: Appointment[], invoices: Invoice[], keys: string[]): Record<string, MonthCell> {
  const invById = new Map(invoices.map((i) => [i.id, i]));
  const referenced = new Set<number>();
  const out: Record<string, MonthCell> = {};
  const cellInvoiceIds: Record<string, Set<number>> = {};
  for (const key of keys) {
    out[key] = { earned: 0, planned: 0, unbilledValue: 0, unbilledCount: 0, completedCount: 0, scheduledCount: 0, invoiced: 0, invoices: [], status: 'none' };
    cellInvoiceIds[key] = new Set();
  }

  for (const a of appts) {
    const key = (a.scheduled_date || '').slice(0, 7);
    const cell = out[key];
    if (!cell) continue;
    const rate = a.entity_rate || 0;
    if (a.status === 'scheduled') {
      cell.scheduledCount++;
      cell.planned += rate;
    } else if (a.status === 'completed') {
      cell.completedCount++;
      cell.earned += rate;
      if (a.contract_invoice_id && invById.has(a.contract_invoice_id)) {
        cellInvoiceIds[key].add(a.contract_invoice_id);
        referenced.add(a.contract_invoice_id);
      } else {
        cell.unbilledCount++;
        cell.unbilledValue += rate;
      }
    }
  }

  // Invoices with no appointment link (fee/note invoices) — bucket by invoice_date month.
  for (const inv of invoices) {
    if (referenced.has(inv.id)) continue;
    const key = (inv.invoice_date || '').slice(0, 7);
    if (cellInvoiceIds[key]) cellInvoiceIds[key].add(inv.id);
  }

  for (const key of keys) {
    const cell = out[key];
    cell.invoices = [...cellInvoiceIds[key]].map((id) => invById.get(id)!).filter(Boolean);
    cell.invoiced = cell.invoices.reduce((s, i) => s + (i.total_amount || 0), 0);
    cell.status = deriveCellStatus(cell);
  }
  return out;
}

const CELL_STYLES: Record<CellStatus, { label: string; cls: string }> = {
  none:     { label: '—',             cls: 'text-[var(--color-text-secondary)]' },
  planned:  { label: 'Planned',       cls: 'bg-blue-50 text-blue-600 border border-blue-200' },
  unbilled: { label: 'Not invoiced',  cls: 'bg-amber-50 text-amber-700 border border-amber-300' },
  draft:    { label: 'Draft',         cls: 'bg-gray-100 text-gray-700 border border-gray-300' },
  sent:     { label: 'Sent',          cls: 'bg-blue-100 text-blue-700 border border-blue-300' },
  partial:  { label: 'Partial',       cls: 'bg-amber-100 text-amber-800 border border-amber-400' },
  paid:     { label: 'Paid',          cls: 'bg-emerald-100 text-emerald-700 border border-emerald-300' },
  overdue:  { label: 'Overdue',       cls: 'bg-red-100 text-red-700 border border-red-300' },
  void:     { label: 'Void',          cls: 'bg-red-50 text-red-500 border border-red-200' },
};

const STATUS_PILL: Record<InvoiceStatus, string> = {
  draft:   'bg-gray-100 text-gray-700',
  sent:    'bg-blue-100 text-blue-700',
  paid:    'bg-emerald-100 text-emerald-700',
  partial: 'bg-amber-100 text-amber-700',
  void:    'bg-red-100 text-red-700',
  overdue: 'bg-red-100 text-red-700',
};

const INVOICE_STATUSES: InvoiceStatus[] = ['draft', 'sent', 'partial', 'paid', 'overdue', 'void'];

// A colored status pill that is also a dropdown — pick a new status to update the invoice.
const StatusSelect: React.FC<{ status: InvoiceStatus; onChange: (s: InvoiceStatus) => void; size?: 'sm' | 'md' }> = ({ status, onChange, size = 'sm' }) => (
  <select
    className={`font-medium rounded-full border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/40 ${STATUS_PILL[status]} ${size === 'md' ? 'text-xs px-2 py-1' : 'text-[10px] px-1.5 py-0.5'}`}
    value={status}
    onClick={(e) => e.stopPropagation()}
    onChange={(e) => { e.stopPropagation(); onChange(e.target.value as InvoiceStatus); }}
  >
    {INVOICE_STATUSES.map((s) => (
      <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
    ))}
  </select>
);

const ContractedEntitiesPage: React.FC = () => {
  const navigate = useNavigate();
  const [entities, setEntities] = useState<ContractedEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editEntity, setEditEntity] = useState<ContractedEntity | null>(null);
  const [viewMode, setViewMode] = useState<'cards' | 'months'>('cards');

  // Raw per-entity data; month rollups are derived from these via useMemo.
  const [apptsMap, setApptsMap] = useState<Record<number, Appointment[]>>({});
  const [invoicesMap, setInvoicesMap] = useState<Record<number, Invoice[]>>({});

  const [expandedId, setExpandedId] = useState<number | null>(null);       // card with open invoice dropdown
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<number>>(new Set());
  const [sendQueue, setSendQueue] = useState<Invoice[] | null>(null);
  const [statusPopover, setStatusPopover] = useState<{ invoices: Invoice[]; entityId: number; x: number; y: number } | null>(null);

  const [dropTargetId, setDropTargetId] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const dragCountersRef = useRef<Record<number, number>>({});
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const monthKeys = useMemo(() => buildMonthKeys(), []);
  const currentMonthKey = monthKeys[monthKeys.length - 1];

  const loadEntities = useCallback(async () => {
    setLoading(true);
    try {
      const data = await window.api.contractedEntities.list();
      setEntities(data);
      const appEntries: [number, Appointment[]][] = [];
      const invEntries: [number, Invoice[]][] = [];
      await Promise.all(
        data.map(async (entity) => {
          try {
            const [appts, invs] = await Promise.all([
              window.api.contractedEntities.listAppointments(entity.id),
              window.api.invoices.list({ entityId: entity.id }),
            ]);
            appEntries.push([entity.id, appts]);
            invEntries.push([entity.id, invs]);
          } catch {
            appEntries.push([entity.id, []]);
            invEntries.push([entity.id, []]);
          }
        })
      );
      setApptsMap(Object.fromEntries(appEntries));
      setInvoicesMap(Object.fromEntries(invEntries));
    } catch (err: any) {
      if (!err?.message?.includes('requires PocketChart')) {
        console.error('Failed to load entities:', err);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEntities();
  }, [loadEntities]);

  // Per-entity month rollups.
  const monthDataMap = useMemo(() => {
    const out: Record<number, Record<string, MonthCell>> = {};
    for (const entity of entities) {
      out[entity.id] = computeMonths(apptsMap[entity.id] || [], invoicesMap[entity.id] || [], monthKeys);
    }
    return out;
  }, [entities, apptsMap, invoicesMap, monthKeys]);

  // Current-month stats for the cards + summary strip, derived from the same rollup.
  const statsMap = useMemo(() => {
    const out: Record<number, EntityStats> = {};
    for (const entity of entities) {
      const c = monthDataMap[entity.id]?.[currentMonthKey];
      out[entity.id] = c
        ? { scheduled: c.scheduledCount, scheduledValue: c.planned, completed: c.completedCount, completedValue: c.earned, unbilledCount: c.unbilledCount, unbilledValue: c.unbilledValue }
        : { scheduled: 0, scheduledValue: 0, completed: 0, completedValue: 0, unbilledCount: 0, unbilledValue: 0 };
    }
    return out;
  }, [entities, monthDataMap, currentMonthKey]);

  const filtered = search.trim()
    ? entities.filter((e) =>
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        e.contact_name.toLowerCase().includes(search.toLowerCase())
      )
    : entities;

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 3000);
  }, []);

  const handleEdit = (entity: ContractedEntity) => {
    setEditEntity(entity);
    setModalOpen(true);
  };

  const handleAdd = () => {
    setEditEntity(null);
    setModalOpen(true);
  };

  // ── Selection + send queue ──────────────────────────────────────────
  const invoiceById = useMemo(() => {
    const m = new Map<number, Invoice>();
    for (const list of Object.values(invoicesMap)) for (const inv of list) m.set(inv.id, inv);
    return m;
  }, [invoicesMap]);

  const toggleCellSelection = (ids: number[]) => {
    if (!ids.length) return;
    setSelectedInvoiceIds((prev) => {
      const next = new Set(prev);
      const allSelected = ids.every((id) => next.has(id));
      for (const id of ids) allSelected ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const buildQueue = (ids: number[]): Invoice[] => {
    // Order by entity, then invoice date, for a predictable review sequence.
    const invoices = ids.map((id) => invoiceById.get(id)).filter(Boolean) as Invoice[];
    return invoices.sort((a, b) =>
      (a.entity_id || 0) - (b.entity_id || 0) || (a.invoice_date || '').localeCompare(b.invoice_date || '')
    );
  };

  const openSelectedQueue = () => {
    const queue = buildQueue([...selectedInvoiceIds]);
    if (queue.length) setSendQueue(queue);
  };

  const handleSent = (results: BulkSendResult[]) => {
    if (results.length) {
      setInvoicesMap((prev) => {
        const next: Record<number, Invoice[]> = {};
        for (const [eid, list] of Object.entries(prev)) {
          next[+eid] = list.map((i) => {
            const r = results.find((x) => x.id === i.id);
            return r ? { ...i, status: r.status, emailed_at: r.emailedAt, emailed_to: r.emailedTo } : i;
          });
        }
        return next;
      });
      showToast(`${results.length} invoice${results.length > 1 ? 's' : ''} sent`);
    }
    setSelectedInvoiceIds(new Set());
    setSendQueue(null);
  };

  const applyStatusLocally = (inv: Invoice, newStatus: InvoiceStatus) => {
    setInvoicesMap((prev) => {
      const next = { ...prev };
      const eid = inv.entity_id || 0;
      if (next[eid]) next[eid] = next[eid].map((i) => (i.id === inv.id ? { ...i, status: newStatus } : i));
      return next;
    });
    // Keep an open popover in sync so its dropdown reflects the new value immediately.
    setStatusPopover((p) => p
      ? { ...p, invoices: p.invoices.map((i) => (i.id === inv.id ? { ...i, status: newStatus } : i)) }
      : p);
  };

  const handleStatusChange = async (inv: Invoice, newStatus: InvoiceStatus) => {
    if (newStatus === inv.status) return;
    try {
      await window.api.invoices.update(inv.id, { status: newStatus });
      applyStatusLocally(inv, newStatus);
      showToast(`${inv.invoice_number} → ${newStatus}`);
    } catch (err: any) {
      showToast(err?.message || 'Failed to update status');
    }
  };

  const handleFinalize = async (inv: Invoice) => {
    try {
      await window.api.invoices.update(inv.id, { status: 'sent' });
      applyStatusLocally(inv, 'sent');
      showToast(`Invoice ${inv.invoice_number} finalized`);
    } catch (err: any) {
      showToast(err?.message || 'Failed to finalize invoice');
    }
  };

  // ── Drag & drop file upload (unchanged behavior) ────────────────────
  const handleCardDragEnter = (e: React.DragEvent, entityId: number) => {
    if (!e.dataTransfer.types?.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    dragCountersRef.current[entityId] = (dragCountersRef.current[entityId] || 0) + 1;
    if (dragCountersRef.current[entityId] === 1) setDropTargetId(entityId);
  };

  const handleCardDragLeave = (e: React.DragEvent, entityId: number) => {
    if (!e.dataTransfer.types?.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    dragCountersRef.current[entityId] = Math.max(0, (dragCountersRef.current[entityId] || 0) - 1);
    if (dragCountersRef.current[entityId] === 0 && dropTargetId === entityId) setDropTargetId(null);
  };

  const handleCardDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types?.includes('Files')) return;
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  };

  const handleCardDrop = async (e: React.DragEvent, entity: ContractedEntity) => {
    e.preventDefault();
    e.stopPropagation();
    dragCountersRef.current[entity.id] = 0;
    setDropTargetId(null);

    const files = e.dataTransfer.files;
    if (!files || files.length === 0) return;

    let uploaded = 0;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const filePath = (file as any).path;
      if (!filePath) continue;
      try {
        await window.api.entityDocuments.uploadFromPath({ entityId: entity.id, filePath, category: 'other' });
        uploaded += 1;
      } catch (err) {
        console.error('Failed to upload dropped file to entity:', err);
      }
    }

    if (uploaded > 0) {
      const label = uploaded === 1 ? files[0].name : `${uploaded} files`;
      showToast(`Added ${label} to ${entity.name}`);
    } else if (files.length > 0) {
      showToast('Could not read the dropped file path');
    }
  };

  return (
    <ProFeatureGate feature="contractor_module">
      <div className="p-6 pb-24">
        {/* Header */}
        <div className="page-header">
          <h1 className="page-title">Contracted Entities</h1>
          <button className="btn-primary gap-2" onClick={handleAdd}>
            <Plus size={18} />
            Add Entity
          </button>
        </div>

        {/* Search + view toggle */}
        <div className="flex items-center gap-4 mb-6">
          <div className="relative flex-1 max-w-md">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]" />
            <input
              type="text"
              className="input pl-9"
              placeholder="Search entities..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="inline-flex items-center rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] p-0.5">
            <button
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'cards' ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm' : 'text-[var(--color-text-secondary)]'}`}
              onClick={() => setViewMode('cards')}
            >
              <LayoutGrid size={15} />
              Cards
            </button>
            <button
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${viewMode === 'months' ? 'bg-[var(--color-surface)] text-[var(--color-text)] shadow-sm' : 'text-[var(--color-text-secondary)]'}`}
              onClick={() => setViewMode('months')}
            >
              <CalendarDays size={15} />
              Months
            </button>
          </div>
        </div>

        {/* Month summary strip */}
        {!loading && entities.length > 0 && (() => {
          const all = Object.values(statsMap);
          const totalScheduledVisits = all.reduce((s, x) => s + x.scheduled, 0);
          const totalCompletedVisits = all.reduce((s, x) => s + x.completed, 0);
          const totalScheduledValue  = all.reduce((s, x) => s + x.scheduledValue, 0);
          const totalCompleted  = all.reduce((s, x) => s + x.completedValue, 0);
          const totalUnbilled   = all.reduce((s, x) => s + x.unbilledValue, 0);
          const totalProjected  = totalScheduledValue + totalCompleted;
          const monthLabelStr = new Date().toLocaleDateString('en-US', { month: 'long' });
          return (
            <div className="grid grid-cols-4 gap-4 mb-6">
              <div className="card p-4 border-t-4 border-t-blue-400">
                <p className="text-xs text-[var(--color-text-secondary)] font-medium uppercase tracking-wide mb-1">Upcoming</p>
                <p className="text-xl font-bold text-blue-600">{formatCurrency(totalScheduledValue)}</p>
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{totalScheduledVisits} upcoming visit{totalScheduledVisits === 1 ? '' : 's'}</p>
              </div>
              <div className="card p-4 border-t-4 border-t-emerald-400">
                <p className="text-xs text-[var(--color-text-secondary)] font-medium uppercase tracking-wide mb-1">Completed Visits</p>
                <p className="text-xl font-bold text-emerald-700">{formatCurrency(totalCompleted)}</p>
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{totalCompletedVisits} in {monthLabelStr}</p>
              </div>
              <div className="card p-4 border-t-4 border-t-amber-400">
                <p className="text-xs text-[var(--color-text-secondary)] font-medium uppercase tracking-wide mb-1">Uninvoiced</p>
                <p className={`text-xl font-bold ${totalUnbilled > 0 ? 'text-amber-600' : 'text-[var(--color-text-secondary)]'}`}>{formatCurrency(totalUnbilled)}</p>
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{totalUnbilled > 0 ? 'pending invoice' : 'all invoiced!'}</p>
              </div>
              <div className="card p-4 border-t-4 border-t-purple-400">
                <p className="text-xs text-[var(--color-text-secondary)] font-medium uppercase tracking-wide mb-1">Total Projected</p>
                <p className="text-xl font-bold text-purple-700">{formatCurrency(totalProjected)}</p>
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">scheduled + earned</p>
              </div>
            </div>
          );
        })()}

        {/* Content */}
        {loading ? (
          <div className="card p-12 text-center text-[var(--color-text-secondary)]">Loading entities...</div>
        ) : filtered.length === 0 ? (
          <div className="card p-12 text-center">
            <Building2 size={48} className="mx-auto text-[var(--color-text-secondary)] mb-4 opacity-40" />
            <h3 className="text-lg font-semibold text-[var(--color-text)] mb-2">
              {search ? 'No matching entities' : 'No contracted entities yet'}
            </h3>
            <p className="text-sm text-[var(--color-text-secondary)] mb-6">
              {search
                ? 'Try adjusting your search.'
                : 'Add your first contracted entity to start tracking agency visits, rates, and invoicing.'}
            </p>
            {!search && (
              <button className="btn-primary gap-2" onClick={handleAdd}>
                <Plus size={18} />
                Add Entity
              </button>
            )}
          </div>
        ) : viewMode === 'months' ? (
          /* ── MONTH MATRIX ─────────────────────────────────────────── */
          <div>
            {/* Legend */}
            <div className="flex flex-wrap items-center gap-3 mb-3 text-[11px] text-[var(--color-text-secondary)]">
              {(['unbilled', 'draft', 'sent', 'partial', 'paid', 'overdue'] as CellStatus[]).map((s) => (
                <span key={s} className="inline-flex items-center gap-1.5">
                  <span className={`inline-block w-3 h-3 rounded-sm ${CELL_STYLES[s].cls}`} />
                  {CELL_STYLES[s].label}
                </span>
              ))}
              <span className="ml-auto text-[11px]">Tip: tap a cell to open the agency · check sendable invoices to send in bulk</span>
            </div>

            <div className="card overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    <th className="sticky left-0 z-10 bg-[var(--color-surface)] text-left px-4 py-3 font-semibold text-[var(--color-text)] min-w-[180px]">
                      Agency
                    </th>
                    {monthKeys.map((key, i) => {
                      const { m, y } = monthLabel(key);
                      const showYear = i === 0 || key.endsWith('-01');
                      const isCurrent = key === currentMonthKey;
                      return (
                        <th key={key} className={`text-center px-3 py-3 font-semibold min-w-[110px] ${isCurrent ? 'text-[var(--color-primary)]' : 'text-[var(--color-text-secondary)]'}`}>
                          {m}
                          {showYear && <span className="text-[10px] font-normal text-[var(--color-text-secondary)] ml-1">{y}</span>}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((entity) => {
                    const months = monthDataMap[entity.id] || {};
                    return (
                      <tr key={entity.id} className="border-b border-[var(--color-border)] hover:bg-[var(--color-bg)]/40">
                        <td
                          className="sticky left-0 z-10 bg-[var(--color-surface)] px-4 py-2.5 cursor-pointer"
                          onClick={() => navigate(`/entities/${entity.id}`)}
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            <Building2 size={14} className="text-purple-500 flex-shrink-0" />
                            <span className="font-medium text-[var(--color-text)] truncate">{entity.name}</span>
                          </div>
                        </td>
                        {monthKeys.map((key) => {
                          const cell = months[key];
                          if (!cell || cell.status === 'none') {
                            return <td key={key} className="text-center px-3 py-2.5 text-[var(--color-text-secondary)]">·</td>;
                          }
                          const style = CELL_STYLES[cell.status];
                          const amount =
                            cell.invoices.length ? cell.invoiced
                            : cell.status === 'unbilled' ? cell.unbilledValue
                            : cell.status === 'planned' ? cell.planned
                            : cell.earned;
                          const sendableIds = cell.invoices.filter(isSendable).map((i) => i.id);
                          const allSelected = sendableIds.length > 0 && sendableIds.every((id) => selectedInvoiceIds.has(id));
                          return (
                            <td key={key} className="px-2 py-2 align-top">
                              <div
                                className={`relative rounded-md px-2 py-1.5 text-center cursor-pointer transition-shadow hover:shadow-sm ${style.cls}`}
                                onClick={(e) => {
                                  if (cell.invoices.length) {
                                    setStatusPopover({ invoices: cell.invoices, entityId: entity.id, x: e.clientX, y: e.clientY });
                                  } else {
                                    navigate(`/entities/${entity.id}`);
                                  }
                                }}
                                title={cell.invoices.length ? 'Click to change status' : `${cell.unbilledCount} completed visit${cell.unbilledCount === 1 ? '' : 's'} not yet invoiced`}
                              >
                                {sendableIds.length > 0 && (
                                  <button
                                    className="absolute -top-1.5 -left-1.5 bg-[var(--color-surface)] rounded"
                                    onClick={(e) => { e.stopPropagation(); toggleCellSelection(sendableIds); }}
                                    title={allSelected ? 'Deselect' : 'Select for bulk send'}
                                  >
                                    {allSelected
                                      ? <CheckSquare size={15} className="text-[var(--color-primary)]" />
                                      : <Square size={15} className="text-[var(--color-text-secondary)]" />}
                                  </button>
                                )}
                                <div className="text-[11px] font-semibold leading-tight">{style.label}</div>
                                <div className="text-xs font-bold leading-tight mt-0.5">{formatCurrency(amount)}</div>
                              </div>
                            </td>
                          );
                        })}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          /* ── CARD GRID (with per-card invoice dropdown) ───────────── */
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((entity) => {
              const s = statsMap[entity.id];
              const totalVisits = s ? s.scheduled + s.completed : 0;
              const isDropTarget = dropTargetId === entity.id;
              const entityInvoices = (invoicesMap[entity.id] || [])
                .slice()
                .sort((a, b) => (b.invoice_date || '').localeCompare(a.invoice_date || ''));
              const isExpanded = expandedId === entity.id;
              const unpaidCount = entityInvoices.filter((i) => isSendable(i)).length;
              return (
                <div
                  key={entity.id}
                  className={`card overflow-hidden transition-all relative ${
                    isDropTarget ? 'ring-2 ring-teal-400 border-teal-400 shadow-lg' : 'hover:border-[var(--color-primary)]/30'
                  }`}
                  onDragEnter={(e) => handleCardDragEnter(e, entity.id)}
                  onDragLeave={(e) => handleCardDragLeave(e, entity.id)}
                  onDragOver={handleCardDragOver}
                  onDrop={(e) => handleCardDrop(e, entity)}
                >
                  {isDropTarget && (
                    <div className="absolute inset-0 z-10 bg-teal-50/90 border-2 border-dashed border-teal-400 rounded-lg flex flex-col items-center justify-center pointer-events-none">
                      <FileUp size={28} className="text-teal-600 mb-2" />
                      <p className="text-sm font-semibold text-teal-700">Drop to add to {entity.name}</p>
                    </div>
                  )}
                  {/* Shaded name bar */}
                  <div
                    className="flex items-center justify-between px-4 py-3 bg-purple-50 border-b border-purple-100 cursor-pointer"
                    onClick={() => navigate(`/entities/${entity.id}`)}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <Building2 size={16} className="text-purple-500 flex-shrink-0" />
                      <div className="min-w-0">
                        <h3 className="text-sm font-semibold text-[var(--color-text)] truncate">{entity.name}</h3>
                        {(entity.contact_name || entity.billing_address_city) && (
                          <p className="text-[11px] text-[var(--color-text-secondary)] truncate">
                            {entity.contact_name || `${entity.billing_address_city}, ${entity.billing_address_state}`}
                          </p>
                        )}
                      </div>
                    </div>
                    <button
                      className="btn-ghost btn-sm flex-shrink-0 ml-2"
                      onClick={(e) => { e.stopPropagation(); handleEdit(entity); }}
                    >
                      <Pencil size={13} />
                    </button>
                  </div>

                  {/* Body: money left | visits right */}
                  <div
                    className="flex divide-x divide-[var(--color-border)] cursor-pointer"
                    onClick={() => navigate(`/entities/${entity.id}`)}
                  >
                    <div className="flex-1 px-4 py-3 space-y-2">
                      <p className="text-[10px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide mb-1">
                        {new Date().toLocaleDateString('en-US', { month: 'short' })} Revenue
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--color-text-secondary)]">Planned</span>
                        <span className="text-xs font-semibold text-blue-600">{s ? formatCurrency(s.scheduledValue) : '—'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--color-text-secondary)]">Earned</span>
                        <span className="text-xs font-semibold text-emerald-600">{s ? formatCurrency(s.completedValue) : '—'}</span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--color-text-secondary)]">Unbilled</span>
                        <span className={`text-xs font-semibold ${s && s.unbilledValue > 0 ? 'text-amber-500' : 'text-[var(--color-text-secondary)]'}`}>
                          {s && s.unbilledValue > 0 ? formatCurrency(s.unbilledValue) : '—'}
                        </span>
                      </div>
                    </div>

                    <div className="w-24 flex-shrink-0 flex flex-col items-center justify-center px-3 py-3 bg-[var(--color-bg)]/60">
                      <p className="text-2xl font-bold text-[var(--color-text)] leading-none">{totalVisits}</p>
                      <p className="text-[10px] text-[var(--color-text-secondary)] mt-0.5 mb-2">visits</p>
                      {s && (
                        <div className="w-full space-y-1 text-center">
                          <div className="flex items-center justify-between gap-1">
                            <span className="w-2 h-2 rounded-full bg-blue-400 flex-shrink-0" />
                            <span className="text-[10px] text-[var(--color-text-secondary)] flex-1 text-left">sched</span>
                            <span className="text-[10px] font-semibold text-[var(--color-text)]">{s.scheduled}</span>
                          </div>
                          <div className="flex items-center justify-between gap-1">
                            <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                            <span className="text-[10px] text-[var(--color-text-secondary)] flex-1 text-left">done</span>
                            <span className="text-[10px] font-semibold text-[var(--color-text)]">{s.completed}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Invoice dropdown toggle */}
                  <button
                    className="w-full flex items-center justify-between px-4 py-2 border-t border-[var(--color-border)] text-xs text-[var(--color-text-secondary)] hover:bg-[var(--color-bg)]/60 transition-colors"
                    onClick={() => setExpandedId(isExpanded ? null : entity.id)}
                  >
                    <span className="flex items-center gap-1.5">
                      <Mail size={12} />
                      Invoices ({entityInvoices.length})
                      {unpaidCount > 0 && (
                        <span className="ml-1 px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700 text-[10px] font-semibold">{unpaidCount} open</span>
                      )}
                    </span>
                    <ChevronDown size={14} className={`transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                  </button>

                  {isExpanded && (
                    <div className="border-t border-[var(--color-border)] max-h-64 overflow-y-auto">
                      {entityInvoices.length === 0 ? (
                        <p className="px-4 py-3 text-xs text-[var(--color-text-secondary)] text-center">No invoices yet for this agency.</p>
                      ) : (
                        entityInvoices.map((inv) => (
                          <div key={inv.id} className="flex items-center gap-2 px-4 py-2 border-b border-[var(--color-border)] last:border-b-0">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-1.5">
                                <span className="text-xs font-medium text-[var(--color-text)] truncate">{inv.invoice_number}</span>
                                <StatusSelect status={inv.status} onChange={(s) => handleStatusChange(inv, s)} />
                              </div>
                              <p className="text-[10px] text-[var(--color-text-secondary)]">
                                {inv.invoice_date}
                                {inv.emailed_at
                                  ? ` · emailed ${new Date(inv.emailed_at).toLocaleDateString()}`
                                  : ' · not emailed'}
                              </p>
                            </div>
                            <span className="text-xs font-semibold text-[var(--color-text)] whitespace-nowrap">{formatCurrency(inv.total_amount)}</span>
                            {inv.status === 'draft' && (
                              <button
                                className="btn-ghost btn-sm text-[11px] gap-1"
                                onClick={() => handleFinalize(inv)}
                                title="Mark as sent (finalize) — does not email"
                              >
                                <FileCheck size={12} />
                                Finalize
                              </button>
                            )}
                            {isSendable(inv) && (
                              <button
                                className="btn-secondary btn-sm text-[11px] gap-1"
                                onClick={() => setSendQueue([inv])}
                                title={inv.emailed_at ? 'Resend by email' : 'Email this invoice'}
                              >
                                {inv.emailed_at ? <RefreshCw size={12} /> : <Send size={12} />}
                                {inv.emailed_at ? 'Resend' : 'Email'}
                              </button>
                            )}
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        <EntityFormModal
          isOpen={modalOpen}
          onClose={() => { setModalOpen(false); setEditEntity(null); }}
          onSave={loadEntities}
          entity={editEntity}
        />

        {/* Bulk-send review stepper */}
        {sendQueue && sendQueue.length > 0 && (
          <BulkInvoiceSendModal
            invoices={sendQueue}
            onClose={() => setSendQueue(null)}
            onSent={handleSent}
          />
        )}

        {/* Selection action bar */}
        {selectedInvoiceIds.size > 0 && (
          <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 bg-[var(--color-text)] text-[var(--color-surface)] px-4 py-3 rounded-xl shadow-xl">
            <span className="text-sm font-medium">{selectedInvoiceIds.size} invoice{selectedInvoiceIds.size > 1 ? 's' : ''} selected</span>
            <button className="btn-primary btn-sm gap-1.5" onClick={openSelectedQueue}>
              <Send size={14} />
              Review &amp; send
            </button>
            <button
              className="text-[var(--color-surface)]/70 hover:text-[var(--color-surface)]"
              onClick={() => setSelectedInvoiceIds(new Set())}
              title="Clear selection"
            >
              <X size={16} />
            </button>
          </div>
        )}

        {/* Month-matrix status popover */}
        {statusPopover && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setStatusPopover(null)} />
            <div
              className="fixed z-50 w-64 bg-[var(--color-surface)] rounded-xl shadow-xl border border-[var(--color-border)] p-3"
              style={{
                left: Math.min(statusPopover.x, window.innerWidth - 272),
                top: Math.min(statusPopover.y + 8, window.innerHeight - 40 - statusPopover.invoices.length * 64),
              }}
              onClick={(e) => e.stopPropagation()}
            >
              <p className="text-[11px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide mb-2">
                Invoice status
              </p>
              <div className="space-y-2 max-h-72 overflow-y-auto">
                {statusPopover.invoices.map((inv) => (
                  <div key={inv.id} className="flex items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-medium text-[var(--color-text)] truncate">{inv.invoice_number}</p>
                      <p className="text-[10px] text-[var(--color-text-secondary)]">
                        {formatCurrency(inv.total_amount)}
                        {inv.emailed_at ? ` · emailed ${new Date(inv.emailed_at).toLocaleDateString()}` : ' · not emailed'}
                      </p>
                    </div>
                    <StatusSelect status={inv.status} size="md" onChange={(s) => handleStatusChange(inv, s)} />
                  </div>
                ))}
              </div>
              <button
                className="w-full mt-3 pt-2 border-t border-[var(--color-border)] text-[11px] text-[var(--color-primary)] hover:underline text-left"
                onClick={() => { const id = statusPopover.entityId; setStatusPopover(null); navigate(`/entities/${id}`); }}
              >
                Open agency →
              </button>
            </div>
          </>
        )}

        {toast && (
          <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 text-sm font-medium animate-in fade-in slide-in-from-bottom-2">
            <CheckCircle size={16} />
            {toast}
          </div>
        )}
      </div>
    </ProFeatureGate>
  );
};

export default ContractedEntitiesPage;
