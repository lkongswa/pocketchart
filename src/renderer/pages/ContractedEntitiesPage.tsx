import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Building2, Search, Phone, Mail, Pencil, FileUp, CheckCircle } from 'lucide-react';
import type { ContractedEntity, Appointment } from '@shared/types';
import EntityFormModal from '../components/EntityFormModal';
import ProFeatureGate from '../components/ProFeatureGate';

interface EntityStats {
  scheduled: number;
  scheduledValue: number;
  completed: number;
  completedValue: number;
  unbilledCount: number;
  unbilledValue: number;
}

const formatCurrency = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

const ContractedEntitiesPage: React.FC = () => {
  const navigate = useNavigate();
  const [entities, setEntities] = useState<ContractedEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editEntity, setEditEntity] = useState<ContractedEntity | null>(null);
  const [statsMap, setStatsMap] = useState<Record<number, EntityStats>>({});
  const [dropTargetId, setDropTargetId] = useState<number | null>(null);
  const [dropToast, setDropToast] = useState<string | null>(null);
  const dragCountersRef = useRef<Record<number, number>>({});
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const currentMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'

  const loadEntities = useCallback(async () => {
    setLoading(true);
    try {
      const data = await window.api.contractedEntities.list();
      setEntities(data);
      // Load this-month stats for all entities in parallel
      const pairs = await Promise.all(
        data.map(async (entity) => {
          try {
            const appts: Appointment[] = await window.api.contractedEntities.listAppointments(entity.id);
            const month = appts.filter((a) => a.scheduled_date.startsWith(currentMonth));
            const scheduledAppts = month.filter((a) => a.status === 'scheduled');
            const completed = month.filter((a) => a.status === 'completed');
            const unbilled  = completed.filter((a) => !a.contract_invoice_id);
            return [entity.id, {
              scheduled:      scheduledAppts.length,
              scheduledValue: scheduledAppts.reduce((s, a) => s + (a.entity_rate || 0), 0),
              completed:      completed.length,
              completedValue: completed.reduce((s, a) => s + (a.entity_rate || 0), 0),
              unbilledCount:  unbilled.length,
              unbilledValue:  unbilled.reduce((s, a) => s + (a.entity_rate || 0), 0),
            }] as [number, EntityStats];
          } catch {
            return [entity.id, { scheduled: 0, scheduledValue: 0, completed: 0, completedValue: 0, unbilledCount: 0, unbilledValue: 0 }] as [number, EntityStats];
          }
        })
      );
      setStatsMap(Object.fromEntries(pairs));
    } catch (err: any) {
      if (!err?.message?.includes('requires PocketChart')) {
        console.error('Failed to load entities:', err);
      }
    } finally {
      setLoading(false);
    }
  }, [currentMonth]);

  useEffect(() => {
    loadEntities();
  }, [loadEntities]);

  const filtered = search.trim()
    ? entities.filter((e) =>
        e.name.toLowerCase().includes(search.toLowerCase()) ||
        e.contact_name.toLowerCase().includes(search.toLowerCase())
      )
    : entities;

  const handleEdit = (entity: ContractedEntity) => {
    setEditEntity(entity);
    setModalOpen(true);
  };

  const handleAdd = () => {
    setEditEntity(null);
    setModalOpen(true);
  };

  const showToast = (msg: string) => {
    setDropToast(msg);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setDropToast(null), 3000);
  };

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
        await window.api.entityDocuments.uploadFromPath({
          entityId: entity.id,
          filePath,
          category: 'other',
        });
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
      <div className="p-6">
        {/* Header */}
        <div className="page-header">
          <h1 className="page-title">Contracted Entities</h1>
          <button className="btn-primary gap-2" onClick={handleAdd}>
            <Plus size={18} />
            Add Entity
          </button>
        </div>

        {/* Search */}
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
          const monthLabel = new Date().toLocaleDateString('en-US', { month: 'long' });
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
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{totalCompletedVisits} in {monthLabel}</p>
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

        {/* Entity List */}
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
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((entity) => {
              const s = statsMap[entity.id];
              const totalVisits = s ? s.scheduled + s.completed : 0;
              const isDropTarget = dropTargetId === entity.id;
              return (
                <div
                  key={entity.id}
                  className={`card overflow-hidden cursor-pointer transition-all relative ${
                    isDropTarget
                      ? 'ring-2 ring-teal-400 border-teal-400 shadow-lg'
                      : 'hover:border-[var(--color-primary)]/30'
                  }`}
                  onClick={() => navigate(`/entities/${entity.id}`)}
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
                  <div className="flex items-center justify-between px-4 py-3 bg-purple-50 border-b border-purple-100">
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
                  <div className="flex divide-x divide-[var(--color-border)]">
                    {/* Left — revenue */}
                    <div className="flex-1 px-4 py-3 space-y-2">
                      <p className="text-[10px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide mb-1">
                        {new Date().toLocaleDateString('en-US', { month: 'short' })} Revenue
                      </p>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--color-text-secondary)]">Planned</span>
                        <span className="text-xs font-semibold text-blue-600">
                          {s ? formatCurrency(s.scheduledValue) : '—'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--color-text-secondary)]">Earned</span>
                        <span className="text-xs font-semibold text-emerald-600">
                          {s ? formatCurrency(s.completedValue) : '—'}
                        </span>
                      </div>
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-[var(--color-text-secondary)]">Unbilled</span>
                        <span className={`text-xs font-semibold ${s && s.unbilledValue > 0 ? 'text-amber-500' : 'text-[var(--color-text-secondary)]'}`}>
                          {s && s.unbilledValue > 0 ? formatCurrency(s.unbilledValue) : '—'}
                        </span>
                      </div>
                    </div>

                    {/* Right — visit counts */}
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

        {dropToast && (
          <div className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-4 py-3 rounded-lg shadow-lg flex items-center gap-2 text-sm font-medium animate-in fade-in slide-in-from-bottom-2">
            <CheckCircle size={16} />
            {dropToast}
          </div>
        )}
      </div>
    </ProFeatureGate>
  );
};

export default ContractedEntitiesPage;
