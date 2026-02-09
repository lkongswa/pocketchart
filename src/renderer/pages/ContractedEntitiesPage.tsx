import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, Building2, Search, Phone, Mail, Pencil } from 'lucide-react';
import type { ContractedEntity } from '@shared/types';
import EntityFormModal from '../components/EntityFormModal';
import ProFeatureGate from '../components/ProFeatureGate';

const ContractedEntitiesPage: React.FC = () => {
  const navigate = useNavigate();
  const [entities, setEntities] = useState<ContractedEntity[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editEntity, setEditEntity] = useState<ContractedEntity | null>(null);

  const loadEntities = useCallback(async () => {
    setLoading(true);
    try {
      const data = await window.api.contractedEntities.list();
      setEntities(data);
    } catch (err: any) {
      if (err?.message?.includes('requires PocketChart')) {
        // Not Pro — show gate
      } else {
        console.error('Failed to load entities:', err);
      }
    } finally {
      setLoading(false);
    }
  }, []);

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
            {filtered.map((entity) => (
              <div
                key={entity.id}
                className="card p-5 hover:border-[var(--color-primary)]/30 cursor-pointer transition-colors"
                onClick={() => navigate(`/entities/${entity.id}`)}
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[var(--color-primary)]/10 flex items-center justify-center">
                      <Building2 size={20} className="text-[var(--color-primary)]" />
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--color-text)]">{entity.name}</h3>
                      {entity.contact_name && (
                        <p className="text-xs text-[var(--color-text-secondary)]">{entity.contact_name}</p>
                      )}
                    </div>
                  </div>
                  <button
                    className="btn-ghost btn-sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(entity);
                    }}
                  >
                    <Pencil size={14} className="mr-1" />
                    Edit
                  </button>
                </div>

                <div className="space-y-1.5">
                  {entity.contact_phone && (
                    <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                      <Phone size={12} />
                      {entity.contact_phone}
                    </div>
                  )}
                  {entity.contact_email && (
                    <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                      <Mail size={12} />
                      {entity.contact_email}
                    </div>
                  )}
                  {entity.billing_address_city && entity.billing_address_state && (
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      {entity.billing_address_city}, {entity.billing_address_state}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <EntityFormModal
          isOpen={modalOpen}
          onClose={() => { setModalOpen(false); setEditEntity(null); }}
          onSave={loadEntities}
          entity={editEntity}
        />
      </div>
    </ProFeatureGate>
  );
};

export default ContractedEntitiesPage;
