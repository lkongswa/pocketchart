import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Receipt, ChevronRight, RefreshCw, AlertCircle } from 'lucide-react';
import type { ContractedEntity, Appointment } from '../../shared/types';

interface EntitySummary {
  entity: ContractedEntity;
  unbilledCount: number;
  unbilledTotal: number;
  lastApptDate: string | null;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const BILLING_CYCLE_LABELS: Record<string, string> = {
  weekly: 'Weekly', biweekly: 'Bi-weekly', monthly: 'Monthly', custom: 'Custom',
};

function getNextInvoiceDate(entity: ContractedEntity): string {
  const today = new Date();
  const cycle = entity.billing_cycle || 'monthly';
  const day = entity.billing_day ?? 1;

  if (cycle === 'monthly') {
    // Next occurrence of billing_day in current or next month
    const candidate = new Date(today.getFullYear(), today.getMonth(), day);
    if (candidate <= today) candidate.setMonth(candidate.getMonth() + 1);
    return candidate.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  if (cycle === 'weekly' || cycle === 'biweekly') {
    // Next occurrence of billing_day (day of week 0=Sun)
    const diff = (day - today.getDay() + 7) % 7 || 7;
    const next = new Date(today);
    next.setDate(today.getDate() + diff);
    if (cycle === 'biweekly') next.setDate(next.getDate() + 7);
    return next.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }
  return '—';
}

export default function ContractInvoicingTab() {
  const navigate = useNavigate();
  const [summaries, setSummaries] = useState<EntitySummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState<number | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const entities: ContractedEntity[] = await window.api.contractedEntities.list().catch(() => []);
      const results = await Promise.all(
        entities.map(async (entity) => {
          const appts: Appointment[] = await window.api.contractedEntities
            .listAppointments(entity.id, { invoiced: false })
            .catch(() => []);
          const completedUnbilled = appts.filter((a) => a.status === 'completed');
          const unbilledTotal = completedUnbilled.reduce((s, a) => s + (a.entity_rate || 0), 0);
          const lastApptDate = completedUnbilled.length > 0
            ? completedUnbilled.sort((a, b) => b.scheduled_date.localeCompare(a.scheduled_date))[0].scheduled_date
            : null;
          return {
            entity,
            unbilledCount: completedUnbilled.length,
            unbilledTotal,
            lastApptDate,
          };
        })
      );
      setSummaries(results.sort((a, b) => (b.unbilledCount - a.unbilledCount)));
    } catch (err) {
      console.error('Failed to load contract invoicing data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const handleQuickInvoice = async (summary: EntitySummary) => {
    if (summary.unbilledCount === 0) return;
    setGenerating(summary.entity.id);
    try {
      const appts: Appointment[] = await window.api.contractedEntities
        .listAppointments(summary.entity.id, { invoiced: false });
      const completedIds = appts.filter((a) => a.status === 'completed').map((a) => a.id);
      if (!completedIds.length) { setToast('No completed unbilled appointments'); return; }
      const today = new Date().toISOString().slice(0, 10);
      await window.api.contractedEntities.createInvoiceFromAppointments(
        summary.entity.id, completedIds, today
      );
      setToast(`Invoice created for ${summary.entity.name} (${completedIds.length} visits)`);
      load();
    } catch (err: any) {
      setToast(err?.message || 'Failed to create invoice');
    } finally {
      setGenerating(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16 text-[var(--color-text-secondary)]">
        Loading contract data…
      </div>
    );
  }

  if (summaries.length === 0) {
    return (
      <div className="card p-12 text-center">
        <Building2 size={40} className="mx-auto text-[var(--color-text-secondary)] mb-3 opacity-40" />
        <h3 className="font-semibold text-[var(--color-text)] mb-1">No contracted entities</h3>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Add contracted entities in Settings → Contracted Entities to start invoicing.
        </p>
      </div>
    );
  }

  return (
    <div>
      {toast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-emerald-600 text-white px-4 py-3 rounded-lg shadow-lg">
          <Receipt size={16} />
          <span className="text-sm font-medium">{toast}</span>
        </div>
      )}

      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-base font-semibold text-[var(--color-text)]">Contract Invoicing</h3>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
            Generate invoices from completed contractor appointments. Patient names auto-populate as line items.
          </p>
        </div>
        <button className="btn-ghost btn-sm gap-1.5" onClick={load}>
          <RefreshCw size={13} /> Refresh
        </button>
      </div>

      <div className="space-y-3">
        {summaries.map(({ entity, unbilledCount, unbilledTotal, lastApptDate }) => (
          <div
            key={entity.id}
            className="card p-4 flex items-center gap-4"
          >
            {/* Entity icon + name */}
            <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center flex-shrink-0">
              <Building2 size={18} className="text-purple-600" />
            </div>

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-medium text-[var(--color-text)] truncate">{entity.name}</span>
                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-600">
                  {BILLING_CYCLE_LABELS[entity.billing_cycle] || 'Monthly'}
                </span>
              </div>
              <div className="flex items-center gap-3 mt-0.5 text-xs text-[var(--color-text-secondary)]">
                <span>Next invoice: <strong>{getNextInvoiceDate(entity)}</strong></span>
                {lastApptDate && <span>Last visit: {lastApptDate}</span>}
              </div>
            </div>

            {/* Unbilled summary */}
            <div className="text-right flex-shrink-0 mr-2">
              {unbilledCount > 0 ? (
                <>
                  <div className="flex items-center gap-1 justify-end">
                    <AlertCircle size={13} className="text-amber-500" />
                    <span className="text-sm font-semibold text-amber-700">{unbilledCount} unbilled</span>
                  </div>
                  <div className="text-xs text-[var(--color-text-secondary)]">{formatCurrency(unbilledTotal)}</div>
                </>
              ) : (
                <span className="text-xs text-emerald-600 font-medium">All invoiced</span>
              )}
            </div>

            {/* Actions */}
            <div className="flex items-center gap-2 flex-shrink-0">
              {unbilledCount > 0 && (
                <button
                  className="btn-primary btn-sm gap-1.5 whitespace-nowrap"
                  onClick={() => handleQuickInvoice({ entity, unbilledCount, unbilledTotal, lastApptDate })}
                  disabled={generating === entity.id}
                >
                  <Receipt size={13} />
                  {generating === entity.id ? 'Creating…' : 'Generate Invoice'}
                </button>
              )}
              <button
                className="btn-secondary btn-sm gap-1"
                onClick={() => navigate(`/entities/${entity.id}`)}
                title="View entity details"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
