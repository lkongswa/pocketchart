import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Building2, Plus, Trash2, DollarSign, FileText, FolderOpen,
  Upload, Eye, Edit, Phone, Mail, MapPin,
} from 'lucide-react';
import type { ContractedEntity, EntityFeeSchedule, EntityDocument, EntityDocumentCategory } from '@shared/types';
import EntityFormModal from '../components/EntityFormModal';
import { useSectionColor } from '../hooks/useSectionColor';

type Tab = 'overview' | 'fee_schedule' | 'documents';

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const EntityDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const sectionColor = useSectionColor();
  const entityId = Number(id);

  const [entity, setEntity] = useState<ContractedEntity | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [editModalOpen, setEditModalOpen] = useState(false);

  // Fee schedule state
  const [feeSchedule, setFeeSchedule] = useState<EntityFeeSchedule[]>([]);
  const [showFeeForm, setShowFeeForm] = useState(false);
  const [feeServiceType, setFeeServiceType] = useState('');
  const [feeCptCode, setFeeCptCode] = useState('');
  const [feeDescription, setFeeDescription] = useState('');
  const [feeRate, setFeeRate] = useState('');
  const [feeUnit, setFeeUnit] = useState('per_visit');

  // Documents state
  const [documents, setDocuments] = useState<EntityDocument[]>([]);

  const loadEntity = useCallback(async () => {
    setLoading(true);
    try {
      const data = await window.api.contractedEntities.get(entityId);
      setEntity(data);
    } catch (err) {
      console.error('Failed to load entity:', err);
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  const loadFeeSchedule = useCallback(async () => {
    try {
      const data = await window.api.contractedEntities.listFeeSchedule(entityId);
      setFeeSchedule(data);
    } catch (err) {
      console.error('Failed to load fee schedule:', err);
    }
  }, [entityId]);

  const loadDocuments = useCallback(async () => {
    try {
      const data = await window.api.entityDocuments.list(entityId);
      setDocuments(data);
    } catch (err) {
      console.error('Failed to load documents:', err);
    }
  }, [entityId]);

  useEffect(() => {
    loadEntity();
    loadFeeSchedule();
    loadDocuments();
  }, [loadEntity, loadFeeSchedule, loadDocuments]);

  const handleAddFeeEntry = async () => {
    if (!feeServiceType.trim() || !feeRate) return;
    try {
      await window.api.contractedEntities.createFeeScheduleEntry({
        entity_id: entityId,
        service_type: feeServiceType.trim(),
        cpt_code: feeCptCode.trim(),
        description: feeDescription.trim(),
        default_rate: parseFloat(feeRate),
        unit: feeUnit,
      } as any);
      setFeeServiceType('');
      setFeeCptCode('');
      setFeeDescription('');
      setFeeRate('');
      setFeeUnit('per_visit');
      setShowFeeForm(false);
      loadFeeSchedule();
    } catch (err) {
      console.error('Failed to add fee entry:', err);
    }
  };

  const handleDeleteFeeEntry = async (feeId: number) => {
    try {
      await window.api.contractedEntities.deleteFeeScheduleEntry(feeId);
      loadFeeSchedule();
    } catch (err) {
      console.error('Failed to delete fee entry:', err);
    }
  };

  const handleUploadDocument = async (category?: EntityDocumentCategory) => {
    try {
      await window.api.entityDocuments.upload({ entityId, category });
      loadDocuments();
    } catch (err) {
      console.error('Failed to upload document:', err);
    }
  };

  const handleOpenDocument = async (docId: number) => {
    try {
      await window.api.entityDocuments.open(docId);
    } catch (err) {
      console.error('Failed to open document:', err);
    }
  };

  const handleDeleteDocument = async (docId: number) => {
    try {
      await window.api.entityDocuments.delete(docId);
      loadDocuments();
    } catch (err) {
      console.error('Failed to delete document:', err);
    }
  };

  const handleDeleteEntity = async () => {
    if (!entity) return;
    const confirmed = window.confirm(`Are you sure you want to delete "${entity.name}"? This will archive the entity.`);
    if (!confirmed) return;
    try {
      await window.api.contractedEntities.delete(entityId);
      navigate('/entities');
    } catch (err) {
      console.error('Failed to delete entity:', err);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="card p-12 text-center text-[var(--color-text-secondary)]">Loading entity...</div>
      </div>
    );
  }

  if (!entity) {
    return (
      <div className="p-6">
        <div className="card p-12 text-center">
          <h3 className="text-lg font-semibold text-[var(--color-text)] mb-2">Entity not found</h3>
          <button className="btn-primary" onClick={() => navigate('/entities')}>Back to Entities</button>
        </div>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'overview', label: 'Overview', icon: Building2 },
    { key: 'fee_schedule', label: 'Fee Schedule', icon: DollarSign },
    { key: 'documents', label: 'Documents', icon: FolderOpen },
  ];

  return (
    <div className="p-6">
      {/* Back button + Header */}
      <button
        className="btn-ghost btn-sm gap-1.5 mb-4"
        onClick={() => navigate('/entities')}
      >
        <ArrowLeft size={16} />
        Back to Entities
      </button>

      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-[var(--color-primary)]/10 flex items-center justify-center">
            <Building2 size={28} style={{ color: sectionColor.color }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-text)]">{entity.name}</h1>
            {entity.contact_name && (
              <p className="text-sm text-[var(--color-text-secondary)]">{entity.contact_name}</p>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary btn-sm" onClick={() => setEditModalOpen(true)}>
            <Edit size={14} className="mr-1.5" /> Edit
          </button>
          <button className="btn-danger btn-sm" onClick={handleDeleteEntity}>
            <Trash2 size={14} className="mr-1.5" /> Archive
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-[var(--color-border)]">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                  : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
              }`}
              onClick={() => setTab(t.key)}
            >
              <Icon size={16} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Tab Content */}
      {tab === 'overview' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="card p-5 space-y-4">
            <h3 className="section-title">Contact Information</h3>
            {entity.contact_phone && (
              <div className="flex items-center gap-2 text-sm">
                <Phone size={14} className="text-[var(--color-text-secondary)]" />
                {entity.contact_phone}
              </div>
            )}
            {entity.contact_email && (
              <div className="flex items-center gap-2 text-sm">
                <Mail size={14} className="text-[var(--color-text-secondary)]" />
                {entity.contact_email}
              </div>
            )}
            {(entity.billing_address_street || entity.billing_address_city) && (
              <div className="flex items-start gap-2 text-sm">
                <MapPin size={14} className="text-[var(--color-text-secondary)] mt-0.5" />
                <div>
                  {entity.billing_address_street && <p>{entity.billing_address_street}</p>}
                  <p>
                    {[entity.billing_address_city, entity.billing_address_state, entity.billing_address_zip]
                      .filter(Boolean).join(', ')}
                  </p>
                </div>
              </div>
            )}
            {entity.notes && (
              <div className="border-t border-[var(--color-border)] pt-3 mt-3">
                <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-1">Notes</p>
                <p className="text-sm text-[var(--color-text)]">{entity.notes}</p>
              </div>
            )}
          </div>

          <div className="card p-5 space-y-4">
            <h3 className="section-title">Quick Stats</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 rounded-lg bg-[var(--color-bg)]">
                <p className="text-xs text-[var(--color-text-secondary)]">Fee Schedule Entries</p>
                <p className="text-xl font-bold text-[var(--color-text)]">{feeSchedule.length}</p>
              </div>
              <div className="p-3 rounded-lg bg-[var(--color-bg)]">
                <p className="text-xs text-[var(--color-text-secondary)]">Documents</p>
                <p className="text-xl font-bold text-[var(--color-text)]">{documents.length}</p>
              </div>
            </div>
          </div>
        </div>
      )}

      {tab === 'fee_schedule' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-title">Fee Schedule</h3>
            <button className="btn-primary btn-sm gap-1.5" onClick={() => setShowFeeForm(true)}>
              <Plus size={14} /> Add Rate
            </button>
          </div>

          {showFeeForm && (
            <div className="card p-4 mb-4 space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">Service Type *</label>
                  <select className="select w-full" value={feeServiceType} onChange={(e) => setFeeServiceType(e.target.value)}>
                    <option value="">Select...</option>
                    <option value="eval">Evaluation</option>
                    <option value="treatment">Treatment</option>
                    <option value="reassessment">Reassessment</option>
                    <option value="discharge">Discharge</option>
                  </select>
                </div>
                <div>
                  <label className="label">CPT Code</label>
                  <input className="input w-full" value={feeCptCode}
                    onChange={(e) => setFeeCptCode(e.target.value)} placeholder="e.g. 97110" />
                </div>
                <div>
                  <label className="label">Rate *</label>
                  <input className="input w-full" type="number" step="0.01" placeholder="130.00"
                    value={feeRate} onChange={(e) => setFeeRate(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Description</label>
                  <input className="input w-full" value={feeDescription}
                    onChange={(e) => setFeeDescription(e.target.value)} placeholder="Initial Evaluation" />
                </div>
                <div>
                  <label className="label">Unit</label>
                  <select className="select w-full" value={feeUnit} onChange={(e) => setFeeUnit(e.target.value)}>
                    <option value="per_visit">Per Visit</option>
                    <option value="per_hour">Per Hour</option>
                    <option value="per_unit">Per Unit</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <button className="btn-secondary btn-sm" onClick={() => setShowFeeForm(false)}>Cancel</button>
                <button className="btn-primary btn-sm" onClick={handleAddFeeEntry}
                  disabled={!feeServiceType || !feeRate}>Add</button>
              </div>
            </div>
          )}

          {feeSchedule.length === 0 ? (
            <div className="card p-8 text-center">
              <DollarSign size={32} className="mx-auto text-[var(--color-text-secondary)] mb-3 opacity-40" />
              <p className="text-sm text-[var(--color-text-secondary)]">
                No fee schedule entries yet. Add rates for different service types.
              </p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    <th className="table-header">Service Type</th>
                    <th className="table-header">CPT</th>
                    <th className="table-header">Description</th>
                    <th className="table-header">Rate</th>
                    <th className="table-header">Unit</th>
                    <th className="table-header">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {feeSchedule.map((fee) => (
                    <tr key={fee.id} className="border-b border-[var(--color-border)] last:border-b-0">
                      <td className="table-cell font-medium capitalize">{fee.service_type}</td>
                      <td className="table-cell font-mono text-sm text-[var(--color-text-secondary)]">{fee.cpt_code || ''}</td>
                      <td className="table-cell text-[var(--color-text-secondary)]">{fee.description || ''}</td>
                      <td className="table-cell font-medium">{formatCurrency(fee.default_rate)}</td>
                      <td className="table-cell text-[var(--color-text-secondary)] capitalize">
                        {fee.unit.replace('_', ' ')}
                      </td>
                      <td className="table-cell">
                        <button className="btn-ghost btn-sm text-red-500" onClick={() => handleDeleteFeeEntry(fee.id)}>
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
      )}

      {tab === 'documents' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-title">Entity Documents</h3>
            <div className="flex gap-2">
              <button className="btn-secondary btn-sm gap-1.5" onClick={() => handleUploadDocument('contract')}>
                <Upload size={14} /> Contract
              </button>
              <button className="btn-secondary btn-sm gap-1.5" onClick={() => handleUploadDocument('w9')}>
                <Upload size={14} /> W-9
              </button>
              <button className="btn-primary btn-sm gap-1.5" onClick={() => handleUploadDocument()}>
                <Upload size={14} /> Upload
              </button>
            </div>
          </div>

          {documents.length === 0 ? (
            <div className="card p-8 text-center">
              <FolderOpen size={32} className="mx-auto text-[var(--color-text-secondary)] mb-3 opacity-40" />
              <p className="text-sm text-[var(--color-text-secondary)]">
                No documents yet. Upload contracts, W-9s, or credentialing docs.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {documents.map((doc) => (
                <div key={doc.id} className="card p-3 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <FileText size={18} className="text-[var(--color-text-secondary)]" />
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text)]">{doc.original_name || doc.filename}</p>
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        {doc.category} &middot; {new Date(doc.uploaded_at).toLocaleDateString()}
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button className="btn-ghost btn-sm" onClick={() => handleOpenDocument(doc.id)}>
                      <Eye size={14} />
                    </button>
                    <button className="btn-ghost btn-sm text-red-500" onClick={() => handleDeleteDocument(doc.id)}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <EntityFormModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onSave={() => { loadEntity(); }}
        entity={entity}
      />
    </div>
  );
};

export default EntityDetailPage;
