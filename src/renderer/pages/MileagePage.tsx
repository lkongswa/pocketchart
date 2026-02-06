import React, { useState, useEffect, useCallback } from 'react';
import {
  Car, Plus, Trash2, Download, Calendar, ChevronLeft, ChevronRight, MapPin,
} from 'lucide-react';
import type { MileageEntry, Client, ContractedEntity } from '@shared/types';
import ProFeatureGate from '../components/ProFeatureGate';

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function getDaysInMonth(year: number, month: number): Date[] {
  const days: Date[] = [];
  const date = new Date(year, month, 1);
  while (date.getMonth() === month) {
    days.push(new Date(date));
    date.setDate(date.getDate() + 1);
  }
  return days;
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function startOfMonth(year: number, month: number): string {
  return `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

function endOfMonth(year: number, month: number): string {
  const last = new Date(year, month + 1, 0);
  return formatDate(last);
}

export default function MileagePage() {
  const now = new Date();
  const [viewYear, setViewYear] = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());
  const [entries, setEntries] = useState<MileageEntry[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [entities, setEntities] = useState<ContractedEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [summary, setSummary] = useState<{ totalMiles: number; reimbursable: number; deductible: number } | null>(null);

  // Quick-add form
  const [showForm, setShowForm] = useState(false);
  const [showMoreFields, setShowMoreFields] = useState(false);
  const [formDate, setFormDate] = useState(() => formatDate(new Date()));
  const [formDest, setFormDest] = useState('');
  const [formPurpose, setFormPurpose] = useState('');
  const [formMiles, setFormMiles] = useState('');
  const [formClientId, setFormClientId] = useState<number | ''>('');
  const [formEntityId, setFormEntityId] = useState<number | ''>('');
  const [formReimbursable, setFormReimbursable] = useState(true);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const sd = startOfMonth(viewYear, viewMonth);
      const ed = endOfMonth(viewYear, viewMonth);
      const [mileage, clientList, entityList, summaryData] = await Promise.all([
        window.api.mileage.list({ startDate: sd, endDate: ed }),
        window.api.clients.list({ status: 'active' }).catch(() => [] as Client[]),
        window.api.contractedEntities.list().catch(() => [] as ContractedEntity[]),
        window.api.mileage.getSummary(sd, ed),
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
  }, [viewYear, viewMonth]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const prevMonth = () => {
    if (viewMonth === 0) { setViewMonth(11); setViewYear(viewYear - 1); }
    else setViewMonth(viewMonth - 1);
  };

  const nextMonth = () => {
    if (viewMonth === 11) { setViewMonth(0); setViewYear(viewYear + 1); }
    else setViewMonth(viewMonth + 1);
  };

  const openFormForDate = (dateStr: string) => {
    setFormDate(dateStr);
    setFormDest('');
    setFormPurpose('');
    setFormMiles('');
    setFormClientId('');
    setFormEntityId('');
    setFormReimbursable(true);
    setShowForm(true);
  };

  const handleAdd = async () => {
    if (!formMiles || !formDest.trim()) return;
    try {
      await window.api.mileage.create({
        date: formDate,
        client_id: formClientId || null,
        entity_id: formEntityId || null,
        origin_address: formPurpose.trim() || 'Business trip',
        destination_address: formDest.trim(),
        miles: parseFloat(formMiles),
        is_reimbursable: formReimbursable,
        notes: formPurpose.trim(),
      });
      setShowForm(false);
      loadData();
    } catch (err) {
      console.error('Failed to add mileage:', err);
    }
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
      const sd = startOfMonth(viewYear, viewMonth);
      const ed = endOfMonth(viewYear, viewMonth);
      await window.api.mileage.exportCsv(sd, ed);
    } catch (err) {
      console.error('Failed to export mileage:', err);
    }
  };

  // Build a map of date -> entries for the calendar
  const entryMap = new Map<string, MileageEntry[]>();
  entries.forEach((e) => {
    const key = e.date;
    if (!entryMap.has(key)) entryMap.set(key, []);
    entryMap.get(key)!.push(e);
  });

  const days = getDaysInMonth(viewYear, viewMonth);
  const firstDayOfWeek = days[0].getDay(); // 0=Sun

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
            IRS-compliant trip log — date, destination, purpose & miles.
          </p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary btn-sm gap-1.5" onClick={handleExport}>
            <Download size={14} /> Export CSV
          </button>
          <button className="btn-primary btn-sm gap-1.5" onClick={() => openFormForDate(formatDate(new Date()))}>
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

      {/* Quick Add Form */}
      {showForm && (
        <div className="card p-5 mb-6 space-y-3 border-l-4 border-l-[var(--color-primary)]">
          <h3 className="section-title flex items-center gap-2">
            <MapPin size={16} className="text-[var(--color-primary)]" />
            Log Trip — {new Date(formDate + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </h3>
          {/* Quick fields: Place + Miles on one row */}
          <div className="grid grid-cols-1 md:grid-cols-[1fr_120px] gap-3">
            <div>
              <label className="label">Place *</label>
              <input
                className="input w-full"
                placeholder="e.g. Lincoln Elementary"
                value={formDest}
                onChange={(e) => setFormDest(e.target.value)}
                autoFocus
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
          {/* More fields toggle */}
          <button
            type="button"
            className="text-xs text-[var(--color-primary)] hover:underline"
            onClick={() => setShowMoreFields(!showMoreFields)}
          >
            {showMoreFields ? '− Less fields' : '+ More fields (purpose, client, contract, reimbursable)'}
          </button>
          {showMoreFields && (
            <div className="space-y-3 pt-1">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="label">Business Purpose</label>
                  <input
                    className="input w-full"
                    placeholder="e.g. Client session"
                    value={formPurpose}
                    onChange={(e) => setFormPurpose(e.target.value)}
                  />
                </div>
                <div>
                  <label className="label">Client</label>
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
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <label className="label">Contract</label>
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
            </div>
          )}
          <div className="flex justify-end gap-2">
            <button className="btn-secondary btn-sm" onClick={() => setShowForm(false)}>Cancel</button>
            <button
              className="btn-primary btn-sm"
              onClick={handleAdd}
              disabled={!formMiles || !formDest.trim()}
            >
              <Plus size={14} className="mr-1" /> Save Trip
            </button>
          </div>
        </div>
      )}

      {/* Month Navigator */}
      <div className="flex items-center justify-between mb-4">
        <button className="btn-ghost btn-sm" onClick={prevMonth}>
          <ChevronLeft size={18} />
        </button>
        <h2 className="text-lg font-semibold text-[var(--color-text)]">
          {MONTHS[viewMonth]} {viewYear}
        </h2>
        <button className="btn-ghost btn-sm" onClick={nextMonth}>
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Calendar Grid */}
      {loading ? (
        <div className="card p-12 text-center text-[var(--color-text-secondary)]">Loading...</div>
      ) : (
        <div className="card overflow-hidden">
          {/* Day Headers */}
          <div className="grid grid-cols-7 border-b border-[var(--color-border)]">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="py-2 text-center text-xs font-semibold text-[var(--color-text-secondary)] bg-[var(--color-bg)]">
                {d}
              </div>
            ))}
          </div>
          {/* Calendar Cells */}
          <div className="grid grid-cols-7">
            {/* Empty cells for offset */}
            {Array.from({ length: firstDayOfWeek }).map((_, i) => (
              <div key={`empty-${i}`} className="min-h-[80px] border-b border-r border-[var(--color-border)] bg-[var(--color-bg)] opacity-30" />
            ))}
            {days.map((day) => {
              const dateStr = formatDate(day);
              const dayEntries = entryMap.get(dateStr) || [];
              const isToday = dateStr === formatDate(new Date());
              const totalMiles = dayEntries.reduce((sum, e) => sum + e.miles, 0);

              return (
                <div
                  key={dateStr}
                  className={`min-h-[80px] border-b border-r border-[var(--color-border)] p-1.5 cursor-pointer transition-colors hover:bg-[var(--color-primary)]/5 ${
                    isToday ? 'bg-[var(--color-primary)]/5' : ''
                  }`}
                  onClick={() => openFormForDate(dateStr)}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className={`text-xs font-medium ${isToday ? 'bg-[var(--color-primary)] text-white rounded-full w-5 h-5 flex items-center justify-center' : 'text-[var(--color-text-secondary)]'}`}>
                      {day.getDate()}
                    </span>
                    {totalMiles > 0 && (
                      <span className="text-[10px] font-bold text-[var(--color-primary)]">
                        {totalMiles.toFixed(1)} mi
                      </span>
                    )}
                  </div>
                  {dayEntries.slice(0, 2).map((entry) => (
                    <div
                      key={entry.id}
                      className={`text-[10px] px-1 py-0.5 rounded mb-0.5 truncate ${
                        entry.is_reimbursable
                          ? 'bg-green-100 text-green-700'
                          : 'bg-blue-100 text-blue-700'
                      }`}
                      onClick={(e) => { e.stopPropagation(); }}
                    >
                      {entry.destination_address}
                    </div>
                  ))}
                  {dayEntries.length > 2 && (
                    <p className="text-[10px] text-[var(--color-text-secondary)]">+{dayEntries.length - 2} more</p>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Trip List below calendar */}
      {entries.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">
            Trips in {MONTHS[viewMonth]} ({entries.length})
          </h3>
          <div className="space-y-2">
            {entries.map((entry) => (
              <div key={entry.id} className="card p-3 flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="text-center flex-shrink-0 w-10">
                    <p className="text-lg font-bold text-[var(--color-text)] leading-none">
                      {new Date(entry.date + 'T00:00:00').getDate()}
                    </p>
                    <p className="text-[10px] text-[var(--color-text-secondary)] uppercase">
                      {MONTHS[new Date(entry.date + 'T00:00:00').getMonth()]}
                    </p>
                  </div>
                  <div className="min-w-0">
                    <p className="text-sm font-medium text-[var(--color-text)] truncate">
                      {entry.destination_address}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                      <span className="font-semibold">{entry.miles.toFixed(1)} mi</span>
                      {entry.client_name && <><span>&middot;</span><span>{entry.client_name}</span></>}
                      {entry.entity_name && <><span>&middot;</span><span>{entry.entity_name}</span></>}
                      {entry.notes && <><span>&middot;</span><span className="truncate">{entry.notes}</span></>}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <span className={`badge text-xs ${entry.is_reimbursable ? 'bg-green-100 text-green-700' : 'bg-blue-100 text-blue-700'}`}>
                    {entry.is_reimbursable ? 'Reimb.' : 'Deduct.'}
                  </span>
                  <button className="btn-ghost btn-sm text-red-500" onClick={() => handleDelete(entry.id)}>
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
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
