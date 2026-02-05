import React, { useState, useEffect, useCallback } from 'react';
import {
  Car, Plus, Trash2, Download, Search, Calendar,
} from 'lucide-react';
import type { MileageEntry, Client, ContractedEntity } from '@shared/types';
import ProFeatureGate from '../components/ProFeatureGate';

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

function startOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`;
}

function endOfMonth(): string {
  const d = new Date();
  const last = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return last.toISOString().slice(0, 10);
}

export default function MileagePage() {
  const [entries, setEntries] = useState<MileageEntry[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [entities, setEntities] = useState<ContractedEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  // Filters
  const [startDate, setStartDate] = useState(startOfMonth);
  const [endDate, setEndDate] = useState(endOfMonth);

  // Summary
  const [summary, setSummary] = useState<{ totalMiles: number; reimbursable: number; deductible: number } | null>(null);

  // Form state
  const [formDate, setFormDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [formClientId, setFormClientId] = useState<number | ''>('');
  const [formEntityId, setFormEntityId] = useState<number | ''>('');
  const [formOrigin, setFormOrigin] = useState('');
  const [formDest, setFormDest] = useState('');
  const [formMiles, setFormMiles] = useState('');
  const [formReimbursable, setFormReimbursable] = useState(true);
  const [formNotes, setFormNotes] = useState('');

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [mileage, clientList, entityList, summaryData] = await Promise.all([
        window.api.mileage.list({ startDate, endDate }),
        window.api.clients.list({ status: 'active' }).catch(() => [] as Client[]),
        window.api.contractedEntities.list().catch(() => [] as ContractedEntity[]),
        window.api.mileage.getSummary(startDate, endDate),
      ]);
      setEntries(mileage);
      setClients(clientList);
      setEntities(entityList);
      setSummary(summaryData);
    } catch (err) {
      console.error('Failed to load mileage data:', err);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleAdd = async () => {
    if (!formMiles || !formOrigin.trim() || !formDest.trim()) return;
    try {
      await window.api.mileage.create({
        date: formDate,
        client_id: formClientId || null,
        entity_id: formEntityId || null,
        origin_address: formOrigin.trim(),
        destination_address: formDest.trim(),
        miles: parseFloat(formMiles),
        is_reimbursable: formReimbursable,
        notes: formNotes.trim(),
      });
      setShowForm(false);
      resetForm();
      loadData();
    } catch (err) {
      console.error('Failed to add mileage:', err);
    }
  };

  const resetForm = () => {
    setFormDate(new Date().toISOString().slice(0, 10));
    setFormClientId('');
    setFormEntityId('');
    setFormOrigin('');
    setFormDest('');
    setFormMiles('');
    setFormReimbursable(true);
    setFormNotes('');
  };

  const handleDelete = async (id: number) => {
    try {
      await window.api.mileage.delete(id);
      loadData();
    } catch (err) {
      console.error('Failed to delete mileage:', err);
    }
  };

  const handleExport = async () => {
    try {
      await window.api.mileage.exportCsv(startDate, endDate);
    } catch (err) {
      console.error('Failed to export mileage:', err);
    }
  };

  const content = (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Car className="w-6 h-6 text-[var(--color-primary)]" />
            Mileage Tracking
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Track driving miles for reimbursement and tax deductions.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary btn-sm gap-1.5" onClick={handleExport}>
            <Download size={14} /> Export CSV
          </button>
          <button className="btn-primary btn-sm gap-1.5" onClick={() => setShowForm(true)}>
            <Plus size={14} /> Add Trip
          </button>
        </div>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          <div className="card p-4">
            <p className="text-xs text-[var(--color-text-secondary)]">Total Miles</p>
            <p className="text-2xl font-bold text-[var(--color-text)]">{summary.totalMiles.toFixed(1)}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-[var(--color-text-secondary)]">Reimbursable Amount</p>
            <p className="text-2xl font-bold text-green-600">{formatCurrency(summary.reimbursable)}</p>
          </div>
          <div className="card p-4">
            <p className="text-xs text-[var(--color-text-secondary)]">Tax Deductible Amount</p>
            <p className="text-2xl font-bold text-blue-600">{formatCurrency(summary.deductible)}</p>
          </div>
        </div>
      )}

      {/* Date Filter */}
      <div className="flex items-center gap-3 mb-4">
        <Calendar size={16} className="text-[var(--color-text-secondary)]" />
        <input
          type="date"
          className="input"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
        />
        <span className="text-sm text-[var(--color-text-secondary)]">to</span>
        <input
          type="date"
          className="input"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
        />
      </div>

      {/* Add Form */}
      {showForm && (
        <div className="card p-5 mb-4 space-y-3">
          <h3 className="section-title">New Trip</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="label">Date</label>
              <input
                type="date"
                className="input w-full"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Client (optional)</label>
              <select
                className="select w-full"
                value={formClientId}
                onChange={(e) => setFormClientId(parseInt(e.target.value, 10) || '')}
              >
                <option value="">None</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Entity (optional)</label>
              <select
                className="select w-full"
                value={formEntityId}
                onChange={(e) => setFormEntityId(parseInt(e.target.value, 10) || '')}
              >
                <option value="">None</option>
                {entities.map((ent) => (
                  <option key={ent.id} value={ent.id}>{ent.name}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div>
              <label className="label">Origin *</label>
              <input
                className="input w-full"
                placeholder="e.g. 123 Main St"
                value={formOrigin}
                onChange={(e) => setFormOrigin(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Destination *</label>
              <input
                className="input w-full"
                placeholder="e.g. 456 Oak Ave"
                value={formDest}
                onChange={(e) => setFormDest(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Miles *</label>
              <input
                type="number"
                className="input w-full"
                step={0.1}
                min={0}
                placeholder="12.5"
                value={formMiles}
                onChange={(e) => setFormMiles(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label className="label">Notes</label>
              <input
                className="input w-full"
                placeholder="Optional notes"
                value={formNotes}
                onChange={(e) => setFormNotes(e.target.value)}
              />
            </div>
            <div className="flex items-end">
              <label className="flex items-center gap-2 cursor-pointer pb-2">
                <input
                  type="checkbox"
                  checked={formReimbursable}
                  onChange={(e) => setFormReimbursable(e.target.checked)}
                  className="w-4 h-4 rounded border-gray-300 accent-[var(--color-primary)]"
                />
                <span className="text-sm text-[var(--color-text)]">Reimbursable</span>
              </label>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary btn-sm" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</button>
            <button
              className="btn-primary btn-sm"
              onClick={handleAdd}
              disabled={!formMiles || !formOrigin.trim() || !formDest.trim()}
            >
              Add Trip
            </button>
          </div>
        </div>
      )}

      {/* Entries List */}
      {loading ? (
        <div className="card p-12 text-center text-[var(--color-text-secondary)]">Loading...</div>
      ) : entries.length === 0 ? (
        <div className="card p-8 text-center">
          <Car size={32} className="mx-auto text-[var(--color-text-secondary)] mb-3 opacity-40" />
          <p className="text-sm text-[var(--color-text-secondary)]">
            No mileage entries for this period. Add your first trip above.
          </p>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="table-header">Date</th>
                <th className="table-header">Route</th>
                <th className="table-header">Miles</th>
                <th className="table-header">Client / Entity</th>
                <th className="table-header">Type</th>
                <th className="table-header">Actions</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((entry) => (
                <tr key={entry.id} className="border-b border-[var(--color-border)] last:border-b-0">
                  <td className="table-cell text-sm">
                    {new Date(entry.date + 'T00:00:00').toLocaleDateString()}
                  </td>
                  <td className="table-cell text-sm">
                    <span className="text-[var(--color-text)]">{entry.origin_address}</span>
                    <span className="text-[var(--color-text-secondary)]"> → </span>
                    <span className="text-[var(--color-text)]">{entry.destination_address}</span>
                  </td>
                  <td className="table-cell text-sm font-medium">{entry.miles.toFixed(1)}</td>
                  <td className="table-cell text-sm text-[var(--color-text-secondary)]">
                    {entry.client_name || entry.entity_name || '—'}
                  </td>
                  <td className="table-cell">
                    <span className={`badge text-xs ${entry.is_reimbursable ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
                      {entry.is_reimbursable ? 'Reimbursable' : 'Deductible'}
                    </span>
                  </td>
                  <td className="table-cell">
                    <button className="btn-ghost btn-sm text-red-500" onClick={() => handleDelete(entry.id)}>
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );

  return (
    <ProFeatureGate feature="mileage_tracking">
      {content}
    </ProFeatureGate>
  );
}
