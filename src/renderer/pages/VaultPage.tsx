import React, { useState, useEffect, useCallback } from 'react';
import {
  Shield, Upload, Eye, Trash2, AlertTriangle, FileText,
  Calendar, Download, Search, Filter,
} from 'lucide-react';
import type { VaultDocument, VaultDocumentType } from '@shared/types';
import ProFeatureGate from '../components/ProFeatureGate';

const DOCUMENT_TYPE_LABELS: Record<VaultDocumentType, string> = {
  state_license: 'State License',
  malpractice_insurance: 'Malpractice Insurance',
  asha_certification: 'ASHA Certification',
  npi_confirmation: 'NPI Confirmation',
  tb_test: 'TB Test',
  flu_shot: 'Flu Shot',
  cpr_certification: 'CPR Certification',
  drivers_license: "Driver's License",
  auto_insurance: 'Auto Insurance',
  resume_cv: 'Resume / CV',
  w9: 'W-9',
  business_license: 'Business License',
  dei_training: 'DEI Training',
  hipaa_training: 'HIPAA Training',
  background_check: 'Background Check',
  cloud_baa: 'Cloud Storage BAA',
  other: 'Other',
};

const DOCUMENT_TYPE_OPTIONS = Object.entries(DOCUMENT_TYPE_LABELS).map(([value, label]) => ({
  value: value as VaultDocumentType,
  label,
}));

function daysUntilExpiration(expirationDate: string | null): number | null {
  if (!expirationDate) return null;
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const exp = new Date(expirationDate + 'T00:00:00');
  return Math.ceil((exp.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

function expirationBadge(expirationDate: string | null): React.ReactNode {
  const days = daysUntilExpiration(expirationDate);
  if (days === null) return null;
  if (days < 0)
    return <span className="badge bg-red-100 text-red-700 text-xs">Expired</span>;
  if (days <= 30)
    return <span className="badge bg-amber-100 text-amber-700 text-xs">Expires in {days}d</span>;
  if (days <= 90)
    return <span className="badge bg-yellow-100 text-yellow-700 text-xs">Expires in {days}d</span>;
  return <span className="badge bg-green-100 text-green-700 text-xs">Valid</span>;
}

export default function VaultPage() {
  const [documents, setDocuments] = useState<VaultDocument[]>([]);
  const [expiring, setExpiring] = useState<VaultDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<VaultDocumentType | ''>('');
  const [showUpload, setShowUpload] = useState(false);

  // Upload form state
  const [uploadType, setUploadType] = useState<VaultDocumentType>('state_license');
  const [uploadLabel, setUploadLabel] = useState('');
  const [uploadIssueDate, setUploadIssueDate] = useState('');
  const [uploadExpirationDate, setUploadExpirationDate] = useState('');
  const [uploadReminderDays, setUploadReminderDays] = useState(30);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [docs, exp] = await Promise.all([
        window.api.vault.list(),
        window.api.vault.getExpiringDocuments(),
      ]);
      setDocuments(docs);
      setExpiring(exp);
    } catch (err) {
      console.error('Failed to load vault:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleUpload = async () => {
    try {
      await window.api.vault.upload({
        documentType: uploadType,
        customLabel: uploadLabel.trim() || undefined,
        issueDate: uploadIssueDate || undefined,
        expirationDate: uploadExpirationDate || undefined,
        reminderDaysBefore: uploadReminderDays,
      });
      setShowUpload(false);
      setUploadLabel('');
      setUploadIssueDate('');
      setUploadExpirationDate('');
      setUploadReminderDays(30);
      loadData();
    } catch (err) {
      console.error('Failed to upload document:', err);
    }
  };

  const handleOpen = async (id: number) => {
    try {
      await window.api.vault.open(id);
    } catch (err) {
      console.error('Failed to open document:', err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!window.confirm('Are you sure you want to delete this document?')) return;
    try {
      await window.api.vault.delete(id);
      loadData();
    } catch (err) {
      console.error('Failed to delete document:', err);
    }
  };

  const handleExportPacket = async () => {
    const selectedIds = documents.map((d) => d.id);
    if (selectedIds.length === 0) return;
    try {
      await window.api.vault.exportCredentialingPacket(selectedIds);
    } catch (err) {
      console.error('Failed to export credentialing packet:', err);
    }
  };

  const filtered = documents.filter((doc) => {
    const matchesSearch =
      !search ||
      (doc.original_name || doc.filename || '').toLowerCase().includes(search.toLowerCase()) ||
      (doc.custom_label || '').toLowerCase().includes(search.toLowerCase()) ||
      DOCUMENT_TYPE_LABELS[doc.document_type].toLowerCase().includes(search.toLowerCase());
    const matchesType = !filterType || doc.document_type === filterType;
    return matchesSearch && matchesType;
  });

  const content = (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="page-title flex items-center gap-2">
            <Shield className="w-6 h-6 text-[var(--color-primary)]" />
            My Vault
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Store and track your professional documents, licenses, and certifications.
          </p>
        </div>
        <div className="flex gap-2">
          {documents.length > 0 && (
            <button className="btn-secondary btn-sm gap-1.5" onClick={handleExportPacket}>
              <Download size={14} /> Export Packet
            </button>
          )}
          <button className="btn-primary btn-sm gap-1.5" onClick={() => setShowUpload(true)}>
            <Upload size={14} /> Upload Document
          </button>
        </div>
      </div>

      {/* Expiring Documents Alert */}
      {expiring.length > 0 && (
        <div className="card p-4 mb-6 border-l-4 border-l-amber-400 bg-amber-50/50">
          <div className="flex items-center gap-2 mb-2">
            <AlertTriangle size={16} className="text-amber-600" />
            <h3 className="text-sm font-semibold text-amber-800">
              {expiring.length} document{expiring.length > 1 ? 's' : ''} expiring soon
            </h3>
          </div>
          <div className="space-y-1">
            {expiring.map((doc) => (
              <p key={doc.id} className="text-xs text-amber-700">
                {doc.custom_label || DOCUMENT_TYPE_LABELS[doc.document_type]}
                {doc.expiration_date && ` — expires ${new Date(doc.expiration_date + 'T00:00:00').toLocaleDateString()}`}
              </p>
            ))}
          </div>
        </div>
      )}

      {/* Upload Form */}
      {showUpload && (
        <div className="card p-5 mb-6 space-y-4">
          <h3 className="section-title">Upload New Document</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="label">Document Type *</label>
              <select
                className="select w-full"
                value={uploadType}
                onChange={(e) => setUploadType(e.target.value as VaultDocumentType)}
              >
                {DOCUMENT_TYPE_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Custom Label</label>
              <input
                className="input w-full"
                placeholder="e.g. 2025 State License"
                value={uploadLabel}
                onChange={(e) => setUploadLabel(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Issue Date</label>
              <input
                type="date"
                className="input w-full"
                value={uploadIssueDate}
                onChange={(e) => setUploadIssueDate(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Expiration Date</label>
              <input
                type="date"
                className="input w-full"
                value={uploadExpirationDate}
                onChange={(e) => setUploadExpirationDate(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Reminder (days before expiration)</label>
              <input
                type="number"
                className="input w-full"
                min={1}
                max={365}
                value={uploadReminderDays}
                onChange={(e) => setUploadReminderDays(parseInt(e.target.value, 10) || 30)}
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button className="btn-secondary btn-sm" onClick={() => setShowUpload(false)}>Cancel</button>
            <button className="btn-primary btn-sm" onClick={handleUpload}>
              <Upload size={14} className="mr-1" /> Choose File & Upload
            </button>
          </div>
        </div>
      )}

      {/* Search & Filter */}
      <div className="flex gap-3 mb-4">
        <div className="relative flex-1">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]" />
          <input
            className="input pl-9 w-full"
            placeholder="Search documents..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <div className="relative">
          <Filter size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]" />
          <select
            className="select pl-9"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as VaultDocumentType | '')}
          >
            <option value="">All Types</option>
            {DOCUMENT_TYPE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Document List */}
      {loading ? (
        <div className="card p-12 text-center text-[var(--color-text-secondary)]">Loading...</div>
      ) : filtered.length === 0 ? (
        <div className="card p-8 text-center">
          <Shield size={32} className="mx-auto text-[var(--color-text-secondary)] mb-3 opacity-40" />
          <p className="text-sm text-[var(--color-text-secondary)]">
            {documents.length === 0
              ? 'No documents yet. Upload your licenses, certifications, and other professional documents.'
              : 'No documents match your search.'}
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((doc) => (
            <div key={doc.id} className="card p-4 flex items-center justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <FileText size={20} className="text-[var(--color-text-secondary)] flex-shrink-0" />
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-medium text-[var(--color-text)] truncate">
                      {doc.custom_label || doc.original_name || doc.filename}
                    </p>
                    {expirationBadge(doc.expiration_date)}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                    <span className="capitalize">
                      {DOCUMENT_TYPE_LABELS[doc.document_type]}
                    </span>
                    {doc.issue_date && (
                      <>
                        <span>&middot;</span>
                        <span className="flex items-center gap-1">
                          <Calendar size={10} />
                          Issued {new Date(doc.issue_date + 'T00:00:00').toLocaleDateString()}
                        </span>
                      </>
                    )}
                    {doc.expiration_date && (
                      <>
                        <span>&middot;</span>
                        <span>
                          Expires {new Date(doc.expiration_date + 'T00:00:00').toLocaleDateString()}
                        </span>
                      </>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex gap-1 flex-shrink-0">
                <button className="btn-ghost btn-sm" onClick={() => handleOpen(doc.id)} title="View">
                  <Eye size={14} />
                </button>
                <button className="btn-ghost btn-sm text-red-500" onClick={() => handleDelete(doc.id)} title="Delete">
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <ProFeatureGate feature="professional_vault">
      {content}
    </ProFeatureGate>
  );
}
