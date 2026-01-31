import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  FileText,
  ClipboardList,
  Edit,
  Archive,
  Phone,
  Mail,
  Calendar,
  MapPin,
  Plus,
  CheckCircle,
  Clock,
  Target,
  XCircle,
  RefreshCw,
  Eye,
  Download,
  Upload,
  Trash2,
  FolderOpen,
  File,
  FileImage,
  FileType,
} from 'lucide-react';
import type {
  Client,
  ClientStatus,
  ClientDocument,
  Discipline,
  Note,
  Evaluation,
  Goal,
  GoalStatus,
} from '../../shared/types';
import ClientFormModal from '../components/ClientFormModal';
import GoalFormModal from '../components/GoalFormModal';

// --- Badge helpers ---

const statusBadgeClass: Record<ClientStatus, string> = {
  active: 'badge-active',
  discharged: 'badge-discharged',
  hold: 'badge-hold',
};

const statusLabel: Record<ClientStatus, string> = {
  active: 'Active',
  discharged: 'Discharged',
  hold: 'On Hold',
};

const disciplineBadgeClass: Record<Discipline, string> = {
  PT: 'badge-pt',
  OT: 'badge-ot',
  ST: 'badge-st',
};

const goalStatusConfig: Record<GoalStatus, { className: string; icon: React.ElementType; label: string }> = {
  active: { className: 'bg-emerald-100 text-emerald-700', icon: Target, label: 'Active' },
  met: { className: 'bg-green-100 text-green-700', icon: CheckCircle, label: 'Met' },
  discontinued: { className: 'bg-gray-100 text-gray-600', icon: XCircle, label: 'Discontinued' },
  modified: { className: 'bg-amber-100 text-amber-700', icon: RefreshCw, label: 'Modified' },
};

type Tab = 'overview' | 'notes' | 'evaluations' | 'goals' | 'documents';

const DOCUMENT_CATEGORIES = [
  { value: 'all', label: 'All' },
  { value: 'general', label: 'General' },
  { value: 'intake', label: 'Intake' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'referral', label: 'Referral' },
  { value: 'medical_records', label: 'Medical Records' },
  { value: 'other', label: 'Other' },
];

const categoryBadgeColors: Record<string, string> = {
  general: 'bg-gray-100 text-gray-700',
  intake: 'bg-blue-100 text-blue-700',
  insurance: 'bg-purple-100 text-purple-700',
  referral: 'bg-emerald-100 text-emerald-700',
  medical_records: 'bg-amber-100 text-amber-700',
  other: 'bg-slate-100 text-slate-700',
};

const formatFileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const getFileIcon = (fileType: string) => {
  if (['png', 'jpg', 'jpeg', 'gif'].includes(fileType)) return FileImage;
  if (fileType === 'pdf') return FileType;
  return File;
};

// --- Helpers ---

const formatDate = (dateStr: string): string => {
  if (!dateStr) return '--';
  try {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
};

const truncate = (str: string, max: number): string => {
  if (!str) return '';
  return str.length > max ? str.slice(0, max) + '...' : str;
};

const formatCategory = (category: string): string => {
  return category
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
};

// --- Component ---

const ClientDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const clientId = Number(id);

  const [client, setClient] = useState<Client | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const [docCategoryFilter, setDocCategoryFilter] = useState<string>('all');
  const [deletingDocId, setDeletingDocId] = useState<number | null>(null);
  const [deletingNoteId, setDeletingNoteId] = useState<number | null>(null);
  const [deletingEvalId, setDeletingEvalId] = useState<number | null>(null);

  // Modals
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  const loadData = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const [clientData, notesData, evalsData, goalsData, docsData] = await Promise.all([
        window.api.clients.get(clientId),
        window.api.notes.listByClient(clientId),
        window.api.evaluations.listByClient(clientId),
        window.api.goals.listByClient(clientId),
        window.api.documents.list({ clientId }),
      ]);
      setClient(clientData);
      setNotes(notesData);
      setEvaluations(evalsData);
      setGoals(goalsData);
      setDocuments(docsData);
    } catch (err) {
      console.error('Failed to load client data:', err);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleArchiveToggle = async () => {
    if (!client) return;
    const newStatus: ClientStatus = client.status === 'active' ? 'discharged' : 'active';
    try {
      const updated = await window.api.clients.update(client.id, { ...client, status: newStatus });
      setClient(updated);
    } catch (err) {
      console.error('Failed to update status:', err);
    }
  };

  const handleClientSaved = (updated: Client) => {
    setClient(updated);
  };

  const handleGoalSaved = () => {
    window.api.goals.listByClient(clientId).then(setGoals).catch(console.error);
  };

  const openEditGoal = (goal: Goal) => {
    setEditingGoal(goal);
    setGoalModalOpen(true);
  };

  const openAddGoal = () => {
    setEditingGoal(null);
    setGoalModalOpen(true);
  };

  const handleExportPdf = async () => {
    if (!client) return;
    try {
      setExportingPdf(true);
      const base64Pdf = await window.api.backup.exportClientPdf({ clientId });
      const defaultFilename = `${client.last_name}_${client.first_name}_chart.pdf`;
      await window.api.backup.savePdf({ base64Pdf, defaultFilename });
    } catch (err) {
      console.error('Failed to export chart PDF:', err);
    } finally {
      setExportingPdf(false);
    }
  };

  const handleUploadDocument = async (category?: string) => {
    try {
      const result = await window.api.documents.upload({ clientId, category });
      if (result) {
        const docsData = await window.api.documents.list({ clientId });
        setDocuments(docsData);
      }
    } catch (err) {
      console.error('Failed to upload document:', err);
    }
  };

  const handleOpenDocument = async (documentId: number) => {
    try {
      await window.api.documents.open({ documentId });
    } catch (err) {
      console.error('Failed to open document:', err);
    }
  };

  const handleDeleteDocument = async (documentId: number) => {
    if (deletingDocId === documentId) {
      // Confirmed - actually delete
      try {
        await window.api.documents.delete({ documentId });
        const docsData = await window.api.documents.list({ clientId });
        setDocuments(docsData);
      } catch (err) {
        console.error('Failed to delete document:', err);
      } finally {
        setDeletingDocId(null);
      }
    } else {
      // First click - ask for confirmation
      setDeletingDocId(documentId);
      // Auto-reset after 3 seconds if not confirmed
      setTimeout(() => setDeletingDocId((prev) => (prev === documentId ? null : prev)), 3000);
    }
  };

  const handleDeleteNote = async (noteId: number) => {
    if (deletingNoteId === noteId) {
      try {
        await window.api.notes.delete(noteId);
        setNotes((prev) => prev.filter((n) => n.id !== noteId));
      } catch (err) {
        console.error('Failed to delete note:', err);
      } finally {
        setDeletingNoteId(null);
      }
    } else {
      setDeletingNoteId(noteId);
      setTimeout(() => setDeletingNoteId((prev) => (prev === noteId ? null : prev)), 3000);
    }
  };

  const handleDeleteEval = async (evalId: number) => {
    if (deletingEvalId === evalId) {
      try {
        await window.api.evaluations.delete(evalId);
        setEvaluations((prev) => prev.filter((e) => e.id !== evalId));
      } catch (err) {
        console.error('Failed to delete evaluation:', err);
      } finally {
        setDeletingEvalId(null);
      }
    } else {
      setDeletingEvalId(evalId);
      setTimeout(() => setDeletingEvalId((prev) => (prev === evalId ? null : prev)), 3000);
    }
  };

  // --- Loading / Not Found ---

  if (loading) {
    return (
      <div className="p-6">
        <div className="card p-12 text-center text-[var(--color-text-secondary)]">
          Loading client...
        </div>
      </div>
    );
  }

  if (!client) {
    return (
      <div className="p-6">
        <div className="card p-12 text-center">
          <h3 className="text-lg font-semibold text-[var(--color-text)] mb-2">Client not found</h3>
          <button className="btn-secondary gap-2 mt-4" onClick={() => navigate('/clients')}>
            <ArrowLeft size={16} />
            Back to Clients
          </button>
        </div>
      </div>
    );
  }

  // --- Tab Content Renderers ---

  const renderOverview = () => (
    <div className="grid grid-cols-2 gap-6">
      {/* Demographics */}
      <div
        className="card p-5 cursor-pointer hover:shadow-md hover:border-[var(--color-primary)]/30 transition-all group"
        onClick={() => setEditModalOpen(true)}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="section-title mb-0">Demographics</h3>
          <Edit size={14} className="text-gray-300 group-hover:text-[var(--color-primary)] transition-colors" />
        </div>
        <dl className="space-y-3">
          <div className="flex items-start gap-2">
            <Calendar size={15} className="text-[var(--color-text-secondary)] mt-0.5 shrink-0" />
            <div>
              <dt className="text-xs text-[var(--color-text-secondary)]">Date of Birth</dt>
              <dd className="text-sm font-medium">{formatDate(client.dob)}</dd>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Phone size={15} className="text-[var(--color-text-secondary)] mt-0.5 shrink-0" />
            <div>
              <dt className="text-xs text-[var(--color-text-secondary)]">Phone</dt>
              <dd className="text-sm font-medium">{client.phone || '--'}</dd>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <Mail size={15} className="text-[var(--color-text-secondary)] mt-0.5 shrink-0" />
            <div>
              <dt className="text-xs text-[var(--color-text-secondary)]">Email</dt>
              <dd className="text-sm font-medium">{client.email || '--'}</dd>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <MapPin size={15} className="text-[var(--color-text-secondary)] mt-0.5 shrink-0" />
            <div>
              <dt className="text-xs text-[var(--color-text-secondary)]">Address</dt>
              <dd className="text-sm font-medium">{client.address || '--'}</dd>
            </div>
          </div>
        </dl>
      </div>

      {/* Insurance */}
      <div
        className="card p-5 cursor-pointer hover:shadow-md hover:border-[var(--color-primary)]/30 transition-all group"
        onClick={() => setEditModalOpen(true)}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="section-title mb-0">Insurance</h3>
          <Edit size={14} className="text-gray-300 group-hover:text-[var(--color-primary)] transition-colors" />
        </div>
        <dl className="space-y-3">
          <div>
            <dt className="text-xs text-[var(--color-text-secondary)]">Payer</dt>
            <dd className="text-sm font-medium">{client.insurance_payer || '--'}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-text-secondary)]">Member ID</dt>
            <dd className="text-sm font-medium">{client.insurance_member_id || '--'}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-text-secondary)]">Group Number</dt>
            <dd className="text-sm font-medium">{client.insurance_group || '--'}</dd>
          </div>
        </dl>
      </div>

      {/* Diagnosis */}
      <div
        className="card p-5 cursor-pointer hover:shadow-md hover:border-[var(--color-primary)]/30 transition-all group"
        onClick={() => setEditModalOpen(true)}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="section-title mb-0">Diagnosis</h3>
          <Edit size={14} className="text-gray-300 group-hover:text-[var(--color-primary)] transition-colors" />
        </div>
        <dl className="space-y-3">
          <div>
            <dt className="text-xs text-[var(--color-text-secondary)]">Primary Dx Code</dt>
            <dd className="text-sm font-medium">{client.primary_dx_code || '--'}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-text-secondary)]">Description</dt>
            <dd className="text-sm font-medium">{client.primary_dx_description || '--'}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-text-secondary)]">Default CPT</dt>
            <dd className="text-sm font-medium">{client.default_cpt_code || '--'}</dd>
          </div>
          {(() => {
            try {
              const secDx = JSON.parse(client.secondary_dx || '[]');
              if (Array.isArray(secDx) && secDx.length > 0 && secDx[0].code) {
                return (
                  <>
                    <div>
                      <dt className="text-xs text-[var(--color-text-secondary)]">Secondary Dx Code</dt>
                      <dd className="text-sm font-medium">{secDx[0].code}</dd>
                    </div>
                    {secDx[0].description && (
                      <div>
                        <dt className="text-xs text-[var(--color-text-secondary)]">Secondary Dx Description</dt>
                        <dd className="text-sm font-medium">{secDx[0].description}</dd>
                      </div>
                    )}
                  </>
                );
              }
            } catch {}
            return null;
          })()}
        </dl>
      </div>

      {/* Referring Provider */}
      <div
        className="card p-5 cursor-pointer hover:shadow-md hover:border-[var(--color-primary)]/30 transition-all group"
        onClick={() => setEditModalOpen(true)}
      >
        <div className="flex items-center justify-between mb-2">
          <h3 className="section-title mb-0">Referring Provider</h3>
          <Edit size={14} className="text-gray-300 group-hover:text-[var(--color-primary)] transition-colors" />
        </div>
        <dl className="space-y-3">
          <div>
            <dt className="text-xs text-[var(--color-text-secondary)]">Physician</dt>
            <dd className="text-sm font-medium">{client.referring_physician || '--'}</dd>
          </div>
          <div>
            <dt className="text-xs text-[var(--color-text-secondary)]">NPI</dt>
            <dd className="text-sm font-medium">{client.referring_npi || '--'}</dd>
          </div>
        </dl>
      </div>
    </div>
  );

  const renderNotes = () => (
    <div className="space-y-3">
      {notes.length === 0 ? (
        <div className="card p-8 text-center">
          <FileText size={40} className="mx-auto text-[var(--color-text-secondary)] mb-3 opacity-40" />
          <p className="text-sm text-[var(--color-text-secondary)]">No SOAP notes yet.</p>
          <button
            className="btn-primary gap-2 mt-4"
            onClick={() => navigate(`/clients/${clientId}/note/new`)}
          >
            <Plus size={16} />
            Create First Note
          </button>
        </div>
      ) : (
        notes.map((note) => {
          let cptBadges: Array<{ code: string; units: number }> = [];
          try {
            const parsed = JSON.parse(note.cpt_codes || '[]');
            if (Array.isArray(parsed) && parsed.length > 0) cptBadges = parsed;
          } catch {}
          if (cptBadges.length === 0 && note.cpt_code) {
            cptBadges = [{ code: note.cpt_code, units: note.units || 1 }];
          }
          return (
            <div
              key={note.id}
              className="card p-4 hover:shadow-md transition-shadow cursor-pointer bg-blue-50/60 border-l-4 border-l-blue-400"
              onClick={() => navigate(`/clients/${clientId}/note/${note.id}`)}
            >
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-sm font-semibold text-[var(--color-text)]">
                    {formatDate(note.date_of_service)}
                  </span>
                  {cptBadges.map((line, i) => (
                    <span key={i} className="badge bg-gray-100 text-gray-600">
                      {line.code} ({line.units}u)
                    </span>
                  ))}
                  {note.signed_at ? (
                    <span className="badge bg-emerald-100 text-emerald-700">
                      <CheckCircle size={12} className="mr-1" />
                      Signed
                    </span>
                  ) : (
                    <span className="badge bg-amber-100 text-amber-700">
                      <Clock size={12} className="mr-1" />
                      Unsigned
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  {!note.signed_at && (
                    <button
                      className={`btn-sm gap-1.5 ${
                        deletingNoteId === note.id
                          ? 'bg-red-600 text-white hover:bg-red-700'
                          : 'btn-ghost text-red-600 hover:bg-red-50'
                      }`}
                      onClick={(e) => { e.stopPropagation(); handleDeleteNote(note.id); }}
                    >
                      <Trash2 size={14} />
                      {deletingNoteId === note.id ? 'Confirm?' : 'Delete'}
                    </button>
                  )}
                  <button className="btn-ghost btn-sm gap-1.5">
                    <Eye size={14} />
                    View
                  </button>
                </div>
              </div>
              {note.subjective && (
                <p className="text-sm text-[var(--color-text-secondary)]">
                  <span className="font-medium text-[var(--color-text)]">S: </span>
                  {truncate(note.subjective, 150)}
                </p>
              )}
            </div>
          );
        })
      )}
    </div>
  );

  const renderEvaluations = () => (
    <div className="space-y-3">
      {evaluations.length === 0 ? (
        <div className="card p-8 text-center">
          <ClipboardList size={40} className="mx-auto text-[var(--color-text-secondary)] mb-3 opacity-40" />
          <p className="text-sm text-[var(--color-text-secondary)]">No evaluations yet.</p>
          <button
            className="btn-primary gap-2 mt-4"
            onClick={() => navigate(`/clients/${clientId}/eval/new`)}
          >
            <Plus size={16} />
            Create First Evaluation
          </button>
        </div>
      ) : (
        evaluations.map((evalItem) => (
          <div
            key={evalItem.id}
            className="card p-4 hover:shadow-md transition-shadow cursor-pointer bg-violet-50/60 border-l-4 border-l-violet-400"
            onClick={() => navigate(`/clients/${clientId}/eval/${evalItem.id}`)}
          >
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <span className="text-sm font-semibold text-[var(--color-text)]">
                  {formatDate(evalItem.eval_date)}
                </span>
                <span className={disciplineBadgeClass[evalItem.discipline]}>
                  {evalItem.discipline}
                </span>
                {evalItem.signed_at ? (
                  <span className="badge bg-emerald-100 text-emerald-700">
                    <CheckCircle size={12} className="mr-1" />
                    Signed
                  </span>
                ) : (
                  <span className="badge bg-amber-100 text-amber-700">
                    <Clock size={12} className="mr-1" />
                    Unsigned
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {!evalItem.signed_at && (
                  <button
                    className={`btn-sm gap-1.5 ${
                      deletingEvalId === evalItem.id
                        ? 'bg-red-600 text-white hover:bg-red-700'
                        : 'btn-ghost text-red-600 hover:bg-red-50'
                    }`}
                    onClick={(e) => { e.stopPropagation(); handleDeleteEval(evalItem.id); }}
                  >
                    <Trash2 size={14} />
                    {deletingEvalId === evalItem.id ? 'Confirm?' : 'Delete'}
                  </button>
                )}
                <button className="btn-ghost btn-sm gap-1.5">
                  <Eye size={14} />
                  View
                </button>
              </div>
            </div>
          </div>
        ))
      )}
    </div>
  );

  const renderGoals = () => (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="section-title mb-0">Goals</h3>
        <button className="btn-primary btn-sm gap-1.5" onClick={openAddGoal}>
          <Plus size={14} />
          Add Goal
        </button>
      </div>

      {goals.length === 0 ? (
        <div className="card p-8 text-center">
          <Target size={40} className="mx-auto text-[var(--color-text-secondary)] mb-3 opacity-40" />
          <p className="text-sm text-[var(--color-text-secondary)]">No goals set yet.</p>
          <button className="btn-primary gap-2 mt-4" onClick={openAddGoal}>
            <Plus size={16} />
            Add First Goal
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {goals.map((goal) => {
            const config = goalStatusConfig[goal.status];
            const StatusIcon = config.icon;
            return (
              <div
                key={goal.id}
                className="card p-4 hover:shadow-md transition-shadow bg-amber-50/60 border-l-4 border-l-amber-400"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1.5">
                      <span className="badge bg-gray-100 text-gray-700 font-semibold">
                        {goal.goal_type}
                      </span>
                      {goal.category && (
                        <span className="badge bg-blue-50 text-blue-600">
                          {formatCategory(goal.category)}
                        </span>
                      )}
                      <span className={`badge ${config.className}`}>
                        <StatusIcon size={12} className="mr-1" />
                        {config.label}
                      </span>
                    </div>
                    <p className="text-sm text-[var(--color-text)]">{goal.goal_text}</p>
                    {goal.target_date && (
                      <p className="text-xs text-[var(--color-text-secondary)] mt-1.5">
                        Target: {formatDate(goal.target_date)}
                        {goal.met_date && (
                          <span className="ml-3">
                            Met: {formatDate(goal.met_date)}
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <select
                      className="text-xs border border-[var(--color-border)] rounded px-2 py-1 bg-white cursor-pointer"
                      value={goal.status}
                      onClick={(e) => e.stopPropagation()}
                      onChange={async (e) => {
                        const newStatus = e.target.value as GoalStatus;
                        try {
                          await window.api.goals.update(goal.id, {
                            ...goal,
                            status: newStatus,
                            met_date: newStatus === 'met' ? new Date().toISOString().slice(0, 10) : goal.met_date,
                          });
                          const updatedGoals = await window.api.goals.listByClient(clientId);
                          setGoals(updatedGoals);
                        } catch (err) {
                          console.error('Failed to update goal status:', err);
                        }
                      }}
                    >
                      <option value="active">Active</option>
                      <option value="met">Met</option>
                      <option value="discontinued">Discontinued</option>
                      <option value="modified">Modified</option>
                    </select>
                    <button
                      className="btn-ghost btn-sm gap-1.5"
                      onClick={() => openEditGoal(goal)}
                    >
                      <Edit size={14} />
                      Edit
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  const renderDocuments = () => {
    const filteredDocs = docCategoryFilter === 'all'
      ? documents
      : documents.filter((d) => d.category === docCategoryFilter);

    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="section-title mb-0">Documents</h3>
            <select
              className="input py-1.5 text-sm w-44"
              value={docCategoryFilter}
              onChange={(e) => setDocCategoryFilter(e.target.value)}
            >
              {DOCUMENT_CATEGORIES.map((cat) => (
                <option key={cat.value} value={cat.value}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>
          <button className="btn-primary btn-sm gap-1.5" onClick={() => handleUploadDocument()}>
            <Upload size={14} />
            Upload Document
          </button>
        </div>

        {filteredDocs.length === 0 ? (
          <div className="card p-8 text-center">
            <FolderOpen size={40} className="mx-auto text-[var(--color-text-secondary)] mb-3 opacity-40" />
            <p className="text-sm text-[var(--color-text-secondary)]">
              {docCategoryFilter === 'all'
                ? 'No documents uploaded yet.'
                : `No documents in the "${DOCUMENT_CATEGORIES.find((c) => c.value === docCategoryFilter)?.label}" category.`}
            </p>
            <button className="btn-primary gap-2 mt-4" onClick={() => handleUploadDocument()}>
              <Upload size={16} />
              Upload First Document
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {filteredDocs.map((doc) => {
              const DocIcon = getFileIcon(doc.file_type);
              const badgeColor = categoryBadgeColors[doc.category] || categoryBadgeColors.other;
              return (
                <div key={doc.id} className="card p-4 hover:shadow-md transition-shadow bg-slate-50 border-l-4 border-l-slate-300">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center shrink-0">
                        <DocIcon size={20} className="text-[var(--color-text-secondary)]" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium text-[var(--color-text)] truncate">
                          {doc.original_name}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className={`badge text-xs ${badgeColor}`}>
                            {DOCUMENT_CATEGORIES.find((c) => c.value === doc.category)?.label || doc.category}
                          </span>
                          <span className="text-xs text-[var(--color-text-secondary)]">
                            {formatFileSize(doc.file_size)}
                          </span>
                          <span className="text-xs text-[var(--color-text-secondary)]">
                            {formatDate(doc.created_at)}
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        className="btn-secondary btn-sm gap-1.5"
                        onClick={() => handleOpenDocument(doc.id)}
                      >
                        <FolderOpen size={14} />
                        Open
                      </button>
                      <button
                        className={`btn-sm gap-1.5 ${
                          deletingDocId === doc.id
                            ? 'bg-red-600 text-white hover:bg-red-700'
                            : 'btn-ghost text-red-600 hover:bg-red-50'
                        }`}
                        onClick={() => handleDeleteDocument(doc.id)}
                      >
                        <Trash2 size={14} />
                        {deletingDocId === doc.id ? 'Confirm?' : 'Delete'}
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  };

  // --- Tab config ---

  const tabDotColor: Record<Tab, string> = {
    overview: '',
    notes: 'bg-blue-400',
    evaluations: 'bg-violet-400',
    goals: 'bg-amber-400',
    documents: 'bg-slate-400',
  };

  const tabs: { key: Tab; label: string }[] = [
    { key: 'overview', label: 'Overview' },
    { key: 'notes', label: `Notes (${notes.length})` },
    { key: 'evaluations', label: `Evaluations (${evaluations.length})` },
    { key: 'goals', label: `Goals (${goals.length})` },
    { key: 'documents', label: `Documents (${documents.length})` },
  ];

  const tabContent: Record<Tab, () => React.ReactElement> = {
    overview: renderOverview,
    notes: renderNotes,
    evaluations: renderEvaluations,
    goals: renderGoals,
    documents: renderDocuments,
  };

  // --- Main Render ---

  return (
    <div className="p-6">
      {/* Back Button */}
      <button
        className="btn-ghost gap-2 mb-4 -ml-2"
        onClick={() => navigate('/clients')}
      >
        <ArrowLeft size={16} />
        Back to Clients
      </button>

      {/* Client Header */}
      <div className="card p-6 mb-6">
        <div className="flex items-start justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-[var(--color-text)]">
                {client.first_name} {client.last_name}
              </h1>
              <span className="text-xs font-mono px-2 py-0.5 rounded bg-gray-100 text-gray-500 border border-gray-200">
                ID: {client.id}
              </span>
              <span className={statusBadgeClass[client.status]}>
                {statusLabel[client.status]}
              </span>
              <span className={disciplineBadgeClass[client.discipline]}>
                {client.discipline}
              </span>
            </div>
            <div className="flex items-center gap-5 text-sm text-[var(--color-text-secondary)]">
              {client.dob && (
                <span className="flex items-center gap-1.5">
                  <Calendar size={14} />
                  DOB: {formatDate(client.dob)}
                </span>
              )}
              {client.phone && (
                <span className="flex items-center gap-1.5">
                  <Phone size={14} />
                  {client.phone}
                </span>
              )}
              {client.email && (
                <span className="flex items-center gap-1.5">
                  <Mail size={14} />
                  {client.email}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-3 mt-5 pt-5 border-t border-[var(--color-border)]">
          <button
            className="btn-primary gap-2 min-w-[160px] justify-center"
            onClick={() => navigate(`/clients/${clientId}/note/new`)}
          >
            <FileText size={16} />
            New SOAP Note
          </button>
          <button
            className="btn-accent gap-2 min-w-[160px] justify-center"
            onClick={() => navigate(`/clients/${clientId}/eval/new`)}
          >
            <ClipboardList size={16} />
            New Evaluation
          </button>
          <button
            className="btn-secondary gap-2 min-w-[160px] justify-center"
            onClick={() => navigate(`/clients/${clientId}/superbill`)}
          >
            <FileText size={16} />
            Generate Superbill
          </button>
          <button
            className="btn-secondary gap-2"
            onClick={() => setEditModalOpen(true)}
          >
            <Edit size={16} />
            Edit Client
          </button>
          <button
            className="btn-secondary gap-2"
            onClick={handleExportPdf}
            disabled={exportingPdf}
          >
            <Download size={16} />
            {exportingPdf ? 'Exporting...' : 'Export Chart (PDF)'}
          </button>
          <button
            className="btn-ghost gap-2"
            onClick={handleArchiveToggle}
          >
            <Archive size={16} />
            {client.status === 'active' ? 'Discharge' : 'Reactivate'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="border-b border-[var(--color-border)] mb-6">
        <div className="flex gap-1">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors flex items-center gap-1.5 ${
                activeTab === tab.key
                  ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                  : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)] hover:border-gray-300'
              }`}
              onClick={() => setActiveTab(tab.key)}
            >
              {tabDotColor[tab.key] && (
                <span className={`w-2 h-2 rounded-full ${tabDotColor[tab.key]}`} />
              )}
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Tab Content */}
      {tabContent[activeTab]()}

      {/* Edit Client Modal */}
      <ClientFormModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        client={client}
        onSave={handleClientSaved}
      />

      {/* Goal Modal */}
      <GoalFormModal
        isOpen={goalModalOpen}
        onClose={() => {
          setGoalModalOpen(false);
          setEditingGoal(null);
        }}
        clientId={clientId}
        goal={editingGoal}
        onSave={handleGoalSaved}
        discipline={client.discipline}
      />
    </div>
  );
};

export default ClientDetailPage;
