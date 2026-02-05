import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
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
  DollarSign,
  CreditCard,
  Receipt,
  ExternalLink,
  AlertCircle,
  Loader2,
  TrendingUp,
  ChevronDown,
  ChevronRight,
  Shield,
  Stethoscope,
  User,
  Activity,
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
  Invoice,
  InvoiceStatus,
  Payment,
  PaymentMethod,
} from '../../shared/types';
import ClientFormModal from '../components/ClientFormModal';
import GoalFormModal from '../components/GoalFormModal';
import ComplianceSection from '../components/ComplianceSection';
import CommunicationLogSection from '../components/CommunicationLogSection';
import ProFeatureGate from '../components/ProFeatureGate';

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

const STATUS_COLORS: Record<InvoiceStatus, { bg: string; text: string }> = {
  draft: { bg: 'bg-gray-100', text: 'text-gray-700' },
  sent: { bg: 'bg-blue-100', text: 'text-blue-700' },
  paid: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  partial: { bg: 'bg-amber-100', text: 'text-amber-700' },
  void: { bg: 'bg-red-100', text: 'text-red-700' },
  overdue: { bg: 'bg-red-100', text: 'text-red-700' },
};

const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  card: 'Card',
  cash: 'Cash',
  check: 'Check',
  insurance: 'Insurance',
  other: 'Other',
};

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

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

const formatCategory = (category: string): string =>
  category.replace(/_/g, ' ').replace(/\b\w/g, (char) => char.toUpperCase());

// --- Simple bar chart for billing ---

interface MonthlyData {
  month: string;
  invoiced: number;
  paid: number;
}

function BillingChart({ invoices, payments }: { invoices: Invoice[]; payments: Payment[] }) {
  // Build last 6 months of data
  const monthlyData = useMemo(() => {
    const months: MonthlyData[] = [];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      const label = d.toLocaleDateString('en-US', { month: 'short' });
      const invoiced = invoices
        .filter((inv) => inv.status !== 'void' && inv.invoice_date?.startsWith(key))
        .reduce((sum, inv) => sum + (inv.total_amount || 0), 0);
      const paid = payments
        .filter((p) => p.payment_date?.startsWith(key))
        .reduce((sum, p) => sum + (p.amount || 0), 0);
      months.push({ month: label, invoiced, paid });
    }
    return months;
  }, [invoices, payments]);

  const maxVal = Math.max(...monthlyData.map((m) => Math.max(m.invoiced, m.paid)), 1);

  return (
    <div className="flex items-end gap-3 h-36 px-2">
      {monthlyData.map((m, i) => (
        <div key={i} className="flex-1 flex flex-col items-center gap-1">
          <div className="flex items-end gap-0.5 w-full h-28">
            {/* Invoiced bar */}
            <div
              className="flex-1 bg-blue-200 rounded-t-sm transition-all"
              style={{ height: `${Math.max((m.invoiced / maxVal) * 100, m.invoiced > 0 ? 4 : 0)}%` }}
              title={`Invoiced: ${formatCurrency(m.invoiced)}`}
            />
            {/* Paid bar */}
            <div
              className="flex-1 bg-emerald-400 rounded-t-sm transition-all"
              style={{ height: `${Math.max((m.paid / maxVal) * 100, m.paid > 0 ? 4 : 0)}%` }}
              title={`Paid: ${formatCurrency(m.paid)}`}
            />
          </div>
          <span className="text-[10px] text-[var(--color-text-secondary)]">{m.month}</span>
        </div>
      ))}
    </div>
  );
}

// --- Main Component ---

type BottomTab = 'documents' | 'compliance';

const ClientDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const clientId = Number(id);

  const [client, setClient] = useState<Client | null>(null);
  const [notes, setNotes] = useState<Note[]>([]);
  const [evaluations, setEvaluations] = useState<Evaluation[]>([]);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [loading, setLoading] = useState(true);
  const [docCategoryFilter, setDocCategoryFilter] = useState<string>('all');
  const [deletingDocId, setDeletingDocId] = useState<number | null>(null);
  const [deletingNoteId, setDeletingNoteId] = useState<number | null>(null);
  const [deletingEvalId, setDeletingEvalId] = useState<number | null>(null);

  // Collapsible sections
  const [showAllNotes, setShowAllNotes] = useState(false);
  const [showAllGoals, setShowAllGoals] = useState(false);
  const [bottomTab, setBottomTab] = useState<BottomTab>('documents');

  // Billing state
  const [generatingPaymentLink, setGeneratingPaymentLink] = useState<number | null>(null);
  const [checkingPaymentStatus, setCheckingPaymentStatus] = useState<number | null>(null);
  const [billingToast, setBillingToast] = useState<string | null>(null);

  // Modals
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  // Route state (e.g., navigate from invoice creation)
  const routeState = (location.state as { tab?: string; invoiceId?: number }) || {};

  const loadData = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const [clientData, notesData, evalsData, goalsData, docsData, invoicesData, paymentsData] = await Promise.all([
        window.api.clients.get(clientId),
        window.api.notes.listByClient(clientId),
        window.api.evaluations.listByClient(clientId),
        window.api.goals.listByClient(clientId),
        window.api.documents.list({ clientId }),
        window.api.invoices.list({ clientId }),
        window.api.payments.list({ clientId }),
      ]);
      setClient(clientData);
      setNotes(notesData || []);
      setEvaluations(evalsData || []);
      setGoals(goalsData || []);
      setDocuments(docsData || []);
      const safeInvoices = (invoicesData || []).map((inv: any) => ({
        ...inv,
        stripe_payment_link_id: inv.stripe_payment_link_id || '',
        stripe_payment_link_url: inv.stripe_payment_link_url || '',
        status: inv.status || 'draft',
        total_amount: typeof inv.total_amount === 'number' ? inv.total_amount : 0,
      }));
      setInvoices(safeInvoices);
      const safePayments = (paymentsData || []).map((pay: any) => ({
        ...pay,
        payment_method: pay.payment_method || 'other',
        amount: typeof pay.amount === 'number' ? pay.amount : 0,
      }));
      setPayments(safePayments);
    } catch (err) {
      console.error('Failed to load client data:', err);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (billingToast) {
      const timer = setTimeout(() => setBillingToast(null), 4000);
      return () => clearTimeout(timer);
    }
  }, [billingToast]);

  // --- Handlers ---

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

  const handleClientSaved = (updated: Client) => setClient(updated);

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
      setDeletingDocId(documentId);
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

  // --- Billing Handlers ---

  const handleGeneratePaymentLink = async (invoiceId: number) => {
    setGeneratingPaymentLink(invoiceId);
    try {
      const result = await window.api.stripe.createPaymentLink(invoiceId);
      if (result.url) {
        await window.api.shell.openExternal(result.url);
        setBillingToast(result.existing ? 'Payment link opened in browser' : 'Payment link created and opened in browser');
        const invoicesData = await window.api.invoices.list({ clientId });
        setInvoices(invoicesData);
      }
    } catch (err: any) {
      console.error('Failed to create payment link:', err);
      setBillingToast(err.message || 'Failed to create payment link');
    } finally {
      setGeneratingPaymentLink(null);
    }
  };

  const handleCheckPaymentStatus = async (invoiceId: number) => {
    setCheckingPaymentStatus(invoiceId);
    try {
      const result = await window.api.stripe.checkPaymentStatus(invoiceId);
      if (result.status === 'paid') {
        setBillingToast('Payment received! Invoice marked as paid.');
        const [invoicesData, paymentsData] = await Promise.all([
          window.api.invoices.list({ clientId }),
          window.api.payments.list({ clientId }),
        ]);
        setInvoices(invoicesData);
        setPayments(paymentsData);
      } else if (result.status === 'pending') {
        setBillingToast('Payment not yet received. Client may still be completing payment.');
      } else if (result.status === 'no_payment_link') {
        setBillingToast('No payment link exists for this invoice.');
      }
    } catch (err: any) {
      console.error('Failed to check payment status:', err);
      setBillingToast(err.message || 'Failed to check payment status');
    } finally {
      setCheckingPaymentStatus(null);
    }
  };

  const handleCopyPaymentLink = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
      setBillingToast('Payment link copied to clipboard');
    } catch (err) {
      console.error('Failed to copy link:', err);
    }
  };

  // --- Loading / Not Found ---

  if (loading) {
    return (
      <div className="p-6">
        <div className="card p-12 text-center text-[var(--color-text-secondary)]">Loading client...</div>
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

  // --- Computed values ---

  const balanceDue = invoices
    .filter((i) => i.status !== 'paid' && i.status !== 'void')
    .reduce((sum, i) => sum + i.total_amount, 0);
  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const totalInvoiced = invoices.filter((i) => i.status !== 'void').reduce((sum, i) => sum + i.total_amount, 0);
  const activeGoals = goals.filter((g) => g.status === 'active');
  const signedNotes = notes.filter((n) => n.signed_at);
  const unsignedNotes = notes.filter((n) => !n.signed_at);
  const displayNotes = showAllNotes ? notes : notes.slice(0, 5);
  const displayGoals = showAllGoals ? goals : goals.slice(0, 4);

  // --- Render ---

  return (
    <div className="p-6 space-y-6">
      {/* Billing Toast */}
      {billingToast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-emerald-600 text-white px-4 py-3 rounded-lg shadow-lg">
          <CheckCircle className="w-4 h-4" />
          <span className="text-sm font-medium">{billingToast}</span>
        </div>
      )}

      {/* Back Button */}
      <button className="btn-ghost gap-2 -ml-2" onClick={() => navigate('/clients')}>
        <ArrowLeft size={16} />
        Back to Clients
      </button>

      {/* ══════════ HEADER ══════════ */}
      <div className="card p-5">
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-4">
            {/* Avatar circle */}
            <div className="w-14 h-14 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center text-white text-xl font-bold shrink-0">
              {client.first_name[0]}{client.last_name[0]}
            </div>
            <div>
              <div className="flex items-center gap-2.5 mb-1">
                <h1 className="text-2xl font-bold text-[var(--color-text)]">
                  {client.first_name} {client.last_name}
                </h1>
                <span className={statusBadgeClass[client.status]}>{statusLabel[client.status]}</span>
                <span className={disciplineBadgeClass[client.discipline]}>{client.discipline}</span>
              </div>
              <div className="flex items-center gap-4 text-sm text-[var(--color-text-secondary)]">
                {client.dob && (
                  <span className="flex items-center gap-1"><Calendar size={13} /> {formatDate(client.dob)}</span>
                )}
                {client.phone && (
                  <span className="flex items-center gap-1"><Phone size={13} /> {client.phone}</span>
                )}
                {client.email && (
                  <span className="flex items-center gap-1"><Mail size={13} /> {client.email}</span>
                )}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="btn-primary btn-sm gap-1.5" onClick={() => navigate(`/clients/${clientId}/note/new`)}>
              <FileText size={14} /> New Note
            </button>
            <button className="btn-secondary btn-sm gap-1.5" onClick={() => setEditModalOpen(true)}>
              <Edit size={14} /> Edit
            </button>
            <button className="btn-ghost btn-sm gap-1.5" onClick={handleExportPdf} disabled={exportingPdf}>
              <Download size={14} /> {exportingPdf ? 'Exporting...' : 'Export PDF'}
            </button>
            <button className="btn-ghost btn-sm gap-1.5" onClick={handleArchiveToggle}>
              <Archive size={14} /> {client.status === 'active' ? 'Discharge' : 'Reactivate'}
            </button>
          </div>
        </div>
      </div>

      {/* ══════════ TWO COLUMN: CLIENT INFO + CLINICAL ══════════ */}
      <div className="grid grid-cols-12 gap-6">
        {/* LEFT COLUMN: Client Information (4 cols) */}
        <div className="col-span-4 space-y-4">
          {/* Demographics */}
          <div
            className="card p-4 cursor-pointer hover:shadow-md hover:border-[var(--color-primary)]/30 transition-all group"
            onClick={() => setEditModalOpen(true)}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-[var(--color-text)] flex items-center gap-1.5">
                <User size={14} className="text-[var(--color-primary)]" /> Demographics
              </h3>
              <Edit size={12} className="text-gray-300 group-hover:text-[var(--color-primary)] transition-colors" />
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-secondary)]">DOB</dt>
                <dd className="font-medium">{formatDate(client.dob)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-secondary)]">Phone</dt>
                <dd className="font-medium">{client.phone || '--'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-secondary)]">Email</dt>
                <dd className="font-medium truncate ml-4">{client.email || '--'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-secondary)]">Address</dt>
                <dd className="font-medium text-right ml-4">{client.address || '--'}</dd>
              </div>
            </dl>
          </div>

          {/* Insurance */}
          <div
            className="card p-4 cursor-pointer hover:shadow-md hover:border-[var(--color-primary)]/30 transition-all group"
            onClick={() => setEditModalOpen(true)}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-[var(--color-text)] flex items-center gap-1.5">
                <Shield size={14} className="text-purple-500" /> Insurance
              </h3>
              <Edit size={12} className="text-gray-300 group-hover:text-[var(--color-primary)] transition-colors" />
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-secondary)]">Payer</dt>
                <dd className="font-medium">{client.insurance_payer || '--'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-secondary)]">Member ID</dt>
                <dd className="font-medium">{client.insurance_member_id || '--'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-secondary)]">Group</dt>
                <dd className="font-medium">{client.insurance_group || '--'}</dd>
              </div>
            </dl>
          </div>

          {/* Diagnosis */}
          <div
            className="card p-4 cursor-pointer hover:shadow-md hover:border-[var(--color-primary)]/30 transition-all group"
            onClick={() => setEditModalOpen(true)}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-[var(--color-text)] flex items-center gap-1.5">
                <Stethoscope size={14} className="text-rose-500" /> Diagnosis
              </h3>
              <Edit size={12} className="text-gray-300 group-hover:text-[var(--color-primary)] transition-colors" />
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-secondary)]">Primary Dx</dt>
                <dd className="font-medium">{client.primary_dx_code || '--'}</dd>
              </div>
              {client.primary_dx_description && (
                <p className="text-xs text-[var(--color-text-secondary)] italic">{client.primary_dx_description}</p>
              )}
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-secondary)]">Default CPT</dt>
                <dd className="font-medium">{client.default_cpt_code || '--'}</dd>
              </div>
              {(() => {
                try {
                  const secDx = JSON.parse(client.secondary_dx || '[]');
                  if (Array.isArray(secDx) && secDx.length > 0 && secDx[0].code) {
                    return (
                      <div className="flex justify-between">
                        <dt className="text-[var(--color-text-secondary)]">Secondary Dx</dt>
                        <dd className="font-medium">{secDx[0].code}</dd>
                      </div>
                    );
                  }
                } catch {}
                return null;
              })()}
            </dl>
          </div>

          {/* Referring Provider */}
          <div
            className="card p-4 cursor-pointer hover:shadow-md hover:border-[var(--color-primary)]/30 transition-all group"
            onClick={() => setEditModalOpen(true)}
          >
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-sm font-semibold text-[var(--color-text)] flex items-center gap-1.5">
                <Activity size={14} className="text-blue-500" /> Referring Provider
              </h3>
              <Edit size={12} className="text-gray-300 group-hover:text-[var(--color-primary)] transition-colors" />
            </div>
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-secondary)]">Physician</dt>
                <dd className="font-medium">{client.referring_physician || '--'}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-[var(--color-text-secondary)]">NPI</dt>
                <dd className="font-medium">{client.referring_npi || '--'}</dd>
              </div>
            </dl>
          </div>
        </div>

        {/* RIGHT COLUMN: Clinical (8 cols) */}
        <div className="col-span-8 space-y-6">
          {/* Quick Stats Row */}
          <div className="grid grid-cols-4 gap-3">
            <div className="card p-3 text-center">
              <p className="text-xl font-bold text-blue-600">{notes.length}</p>
              <p className="text-xs text-[var(--color-text-secondary)]">Notes</p>
            </div>
            <div className="card p-3 text-center">
              <p className="text-xl font-bold text-violet-600">{evaluations.length}</p>
              <p className="text-xs text-[var(--color-text-secondary)]">Evaluations</p>
            </div>
            <div className="card p-3 text-center">
              <p className="text-xl font-bold text-amber-600">{activeGoals.length}</p>
              <p className="text-xs text-[var(--color-text-secondary)]">Active Goals</p>
            </div>
            <div className="card p-3 text-center">
              <p className="text-xl font-bold text-red-500">{unsignedNotes.length}</p>
              <p className="text-xs text-[var(--color-text-secondary)]">Unsigned</p>
            </div>
          </div>

          {/* Notes Section */}
          <div className="card">
            <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
              <h3 className="font-semibold text-[var(--color-text)] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                SOAP Notes
                <span className="text-xs font-normal text-[var(--color-text-secondary)]">({notes.length})</span>
              </h3>
              <div className="flex items-center gap-2">
                <button
                  className="btn-primary btn-sm gap-1.5"
                  onClick={() => navigate(`/clients/${clientId}/note/new`)}
                >
                  <Plus size={14} /> New Note
                </button>
              </div>
            </div>
            {notes.length === 0 ? (
              <div className="p-6 text-center text-sm text-[var(--color-text-secondary)]">
                No SOAP notes yet. Create one to get started.
              </div>
            ) : (
              <div className="divide-y divide-[var(--color-border)]">
                {displayNotes.map((note) => {
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
                      className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
                      onClick={() => navigate(`/clients/${clientId}/note/${note.id}`)}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-sm font-medium text-[var(--color-text)] w-28 shrink-0">
                          {formatDate(note.date_of_service)}
                        </span>
                        {cptBadges.slice(0, 2).map((line, i) => (
                          <span key={i} className="badge bg-gray-100 text-gray-600 text-xs">
                            {line.code} ({line.units}u)
                          </span>
                        ))}
                        <span className="text-xs text-[var(--color-text-secondary)] truncate">
                          {truncate(note.subjective || '', 50)}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {note.signed_at ? (
                          <span className="flex items-center gap-1 text-xs text-emerald-600">
                            <CheckCircle size={12} /> Signed
                          </span>
                        ) : (
                          <span className="flex items-center gap-1 text-xs text-amber-600">
                            <Clock size={12} /> Draft
                          </span>
                        )}
                        {!note.signed_at && (
                          <button
                            className={`btn-sm text-xs px-1.5 py-0.5 ${
                              deletingNoteId === note.id ? 'bg-red-600 text-white' : 'btn-ghost text-red-500'
                            }`}
                            onClick={(e) => { e.stopPropagation(); handleDeleteNote(note.id); }}
                          >
                            <Trash2 size={12} />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {notes.length > 5 && (
              <button
                className="w-full py-2 text-xs text-[var(--color-primary)] font-medium hover:bg-gray-50 flex items-center justify-center gap-1"
                onClick={() => setShowAllNotes(!showAllNotes)}
              >
                {showAllNotes ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                {showAllNotes ? 'Show less' : `Show all ${notes.length} notes`}
              </button>
            )}
          </div>

          {/* Evaluations Row */}
          <div className="card">
            <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
              <h3 className="font-semibold text-[var(--color-text)] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-violet-400" />
                Evaluations
                <span className="text-xs font-normal text-[var(--color-text-secondary)]">({evaluations.length})</span>
              </h3>
              <button
                className="btn-accent btn-sm gap-1.5"
                onClick={() => navigate(`/clients/${clientId}/eval/new`)}
              >
                <Plus size={14} /> New Evaluation
              </button>
            </div>
            {evaluations.length === 0 ? (
              <div className="p-6 text-center text-sm text-[var(--color-text-secondary)]">
                No evaluations yet.
              </div>
            ) : (
              <div className="divide-y divide-[var(--color-border)]">
                {evaluations.map((evalItem) => (
                  <div
                    key={evalItem.id}
                    className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/clients/${clientId}/eval/${evalItem.id}`)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-sm font-medium text-[var(--color-text)] w-28 shrink-0">
                        {formatDate(evalItem.eval_date)}
                      </span>
                      <span className={disciplineBadgeClass[evalItem.discipline]}>{evalItem.discipline}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {evalItem.signed_at ? (
                        <span className="flex items-center gap-1 text-xs text-emerald-600">
                          <CheckCircle size={12} /> Signed
                        </span>
                      ) : (
                        <span className="flex items-center gap-1 text-xs text-amber-600">
                          <Clock size={12} /> Draft
                        </span>
                      )}
                      {!evalItem.signed_at && (
                        <button
                          className={`btn-sm text-xs px-1.5 py-0.5 ${
                            deletingEvalId === evalItem.id ? 'bg-red-600 text-white' : 'btn-ghost text-red-500'
                          }`}
                          onClick={(e) => { e.stopPropagation(); handleDeleteEval(evalItem.id); }}
                        >
                          <Trash2 size={12} />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Goals Section */}
          <div className="card">
            <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
              <h3 className="font-semibold text-[var(--color-text)] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                Goals
                <span className="text-xs font-normal text-[var(--color-text-secondary)]">
                  ({activeGoals.length} active / {goals.length} total)
                </span>
              </h3>
              <button className="btn-primary btn-sm gap-1.5" onClick={openAddGoal}>
                <Plus size={14} /> Add Goal
              </button>
            </div>
            {goals.length === 0 ? (
              <div className="p-6 text-center text-sm text-[var(--color-text-secondary)]">
                No goals set yet. Add one to track progress.
              </div>
            ) : (
              <div className="divide-y divide-[var(--color-border)]">
                {displayGoals.map((goal) => {
                  const config = goalStatusConfig[goal.status];
                  const StatusIcon = config.icon;
                  return (
                    <div key={goal.id} className="px-4 py-3 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5 mb-1">
                            <span className="badge bg-gray-100 text-gray-700 text-xs font-semibold">{goal.goal_type}</span>
                            {goal.category && (
                              <span className="badge bg-blue-50 text-blue-600 text-xs">{formatCategory(goal.category)}</span>
                            )}
                            <span className={`badge text-xs ${config.className}`}>
                              <StatusIcon size={10} className="mr-0.5" /> {config.label}
                            </span>
                          </div>
                          <p className="text-sm text-[var(--color-text)]">{goal.goal_text}</p>
                          {goal.target_date && (
                            <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                              Target: {formatDate(goal.target_date)}
                              {goal.met_date && <span className="ml-2">Met: {formatDate(goal.met_date)}</span>}
                            </p>
                          )}
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <select
                            className="text-xs border border-[var(--color-border)] rounded px-1.5 py-0.5 bg-white cursor-pointer"
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
                          <button className="btn-ghost p-1" onClick={() => openEditGoal(goal)}>
                            <Edit size={12} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {goals.length > 4 && (
              <button
                className="w-full py-2 text-xs text-[var(--color-primary)] font-medium hover:bg-gray-50 flex items-center justify-center gap-1"
                onClick={() => setShowAllGoals(!showAllGoals)}
              >
                {showAllGoals ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                {showAllGoals ? 'Show less' : `Show all ${goals.length} goals`}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ══════════ FULL-WIDTH: BILLING SECTION ══════════ */}
      <div className="card">
        <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)]">
          <h2 className="text-lg font-semibold text-[var(--color-text)] flex items-center gap-2">
            <DollarSign size={20} className="text-emerald-500" />
            Billing & Payments
          </h2>
          <div className="flex items-center gap-2">
            <button
              className="btn-primary btn-sm gap-1.5"
              onClick={() => navigate(`/billing?newInvoice=${clientId}`)}
            >
              <Plus size={14} /> New Invoice
            </button>
            <button
              className="btn-secondary btn-sm gap-1.5"
              onClick={() => navigate(`/billing?newPayment=${clientId}`)}
            >
              <CreditCard size={14} /> Record Payment
            </button>
            <button
              className="btn-secondary btn-sm gap-1.5"
              onClick={() => navigate(`/clients/${clientId}/superbill`)}
            >
              <FileText size={14} /> Superbill
            </button>
          </div>
        </div>

        <div className="p-5">
          {/* Summary Cards + Chart Row */}
          <div className="grid grid-cols-12 gap-5 mb-6">
            {/* Summary Cards */}
            <div className="col-span-5 grid grid-cols-1 gap-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-amber-50 border border-amber-200">
                <div>
                  <p className="text-xs text-amber-600 font-medium">Balance Due</p>
                  <p className={`text-lg font-bold ${balanceDue > 0 ? 'text-amber-700' : 'text-gray-500'}`}>
                    {formatCurrency(balanceDue)}
                  </p>
                </div>
                <AlertCircle className={`w-5 h-5 ${balanceDue > 0 ? 'text-amber-500' : 'text-gray-300'}`} />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-emerald-50 border border-emerald-200">
                <div>
                  <p className="text-xs text-emerald-600 font-medium">Total Collected</p>
                  <p className="text-lg font-bold text-emerald-700">{formatCurrency(totalPaid)}</p>
                </div>
                <DollarSign className="w-5 h-5 text-emerald-500" />
              </div>
              <div className="flex items-center justify-between p-3 rounded-lg bg-blue-50 border border-blue-200">
                <div>
                  <p className="text-xs text-blue-600 font-medium">Total Invoiced</p>
                  <p className="text-lg font-bold text-blue-700">{formatCurrency(totalInvoiced)}</p>
                </div>
                <Receipt className="w-5 h-5 text-blue-500" />
              </div>
            </div>

            {/* Chart */}
            <div className="col-span-7 rounded-lg border border-[var(--color-border)] p-4">
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-semibold text-[var(--color-text)] flex items-center gap-1.5">
                  <TrendingUp size={14} className="text-[var(--color-primary)]" />
                  Last 6 Months
                </h4>
                <div className="flex items-center gap-3 text-xs text-[var(--color-text-secondary)]">
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-blue-200" /> Invoiced</span>
                  <span className="flex items-center gap-1"><span className="w-2.5 h-2.5 rounded-sm bg-emerald-400" /> Collected</span>
                </div>
              </div>
              <BillingChart invoices={invoices} payments={payments} />
            </div>
          </div>

          {/* Invoices Table */}
          <div className="mb-6">
            <h4 className="text-sm font-semibold text-[var(--color-text)] mb-3">Invoices</h4>
            {invoices.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-text-secondary)]">
                No invoices yet. Create one to start billing.
              </div>
            ) : (
              <div className="rounded-lg border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
                {invoices.map((invoice) => (
                  <div key={invoice.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-sm font-medium text-[var(--color-text)]">{invoice.invoice_number}</p>
                        <p className="text-xs text-[var(--color-text-secondary)]">
                          {formatDate(invoice.invoice_date)}
                          {invoice.due_date && ` · Due ${formatDate(invoice.due_date)}`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-medium text-[var(--color-text)]">{formatCurrency(invoice.total_amount)}</p>
                        <span
                          className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                            (STATUS_COLORS[invoice.status] || STATUS_COLORS.draft).bg
                          } ${(STATUS_COLORS[invoice.status] || STATUS_COLORS.draft).text}`}
                        >
                          {invoice.status || 'draft'}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        {invoice.status !== 'paid' && invoice.status !== 'void' && (
                          <>
                            <button
                              className="btn-primary btn-sm gap-1"
                              onClick={() => handleGeneratePaymentLink(invoice.id)}
                              disabled={generatingPaymentLink === invoice.id}
                            >
                              {generatingPaymentLink === invoice.id ? (
                                <Loader2 size={12} className="animate-spin" />
                              ) : (
                                <ExternalLink size={12} />
                              )}
                              Pay
                            </button>
                            {invoice.stripe_payment_link_url && (
                              <>
                                <button
                                  className="btn-secondary btn-sm gap-1"
                                  onClick={() => handleCheckPaymentStatus(invoice.id)}
                                  disabled={checkingPaymentStatus === invoice.id}
                                  title="Check payment status"
                                >
                                  {checkingPaymentStatus === invoice.id ? (
                                    <Loader2 size={12} className="animate-spin" />
                                  ) : (
                                    <RefreshCw size={12} />
                                  )}
                                </button>
                                <button
                                  className="btn-ghost btn-sm text-xs"
                                  onClick={() => handleCopyPaymentLink(invoice.stripe_payment_link_url)}
                                  title="Copy payment link"
                                >
                                  Copy
                                </button>
                              </>
                            )}
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Payments History */}
          <div>
            <h4 className="text-sm font-semibold text-[var(--color-text)] mb-3">Payment History</h4>
            {payments.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-text-secondary)]">
                No payments recorded yet.
              </div>
            ) : (
              <div className="rounded-lg border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
                {payments.map((payment) => (
                  <div key={payment.id} className="flex items-center justify-between px-4 py-3 hover:bg-gray-50">
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text)]">{formatDate(payment.payment_date)}</p>
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        {PAYMENT_METHOD_LABELS[payment.payment_method] || payment.payment_method || 'Other'}
                        {payment.reference_number && ` · Ref: ${payment.reference_number}`}
                      </p>
                      {payment.notes && (
                        <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{payment.notes}</p>
                      )}
                    </div>
                    <p className="font-medium text-emerald-600">+{formatCurrency(payment.amount)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══════════ DOCUMENTS & COMPLIANCE ══════════ */}
      <div className="card">
        <div className="flex items-center border-b border-[var(--color-border)]">
          {(['documents', 'compliance'] as BottomTab[]).map((tab) => (
            <button
              key={tab}
              className={`px-5 py-3 text-sm font-medium border-b-2 transition-colors ${
                bottomTab === tab
                  ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                  : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
              }`}
              onClick={() => setBottomTab(tab)}
            >
              {tab === 'documents' ? (
                <span className="flex items-center gap-1.5"><FolderOpen size={14} /> Documents ({documents.length})</span>
              ) : (
                <span className="flex items-center gap-1.5"><Shield size={14} /> Compliance</span>
              )}
            </button>
          ))}
        </div>

        <div className="p-5">
          {bottomTab === 'documents' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <select
                  className="input py-1.5 text-sm w-44"
                  value={docCategoryFilter}
                  onChange={(e) => setDocCategoryFilter(e.target.value)}
                >
                  {DOCUMENT_CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
                <button className="btn-primary btn-sm gap-1.5" onClick={() => handleUploadDocument()}>
                  <Upload size={14} /> Upload Document
                </button>
              </div>

              {(() => {
                const filteredDocs = docCategoryFilter === 'all'
                  ? documents
                  : documents.filter((d) => d.category === docCategoryFilter);

                return filteredDocs.length === 0 ? (
                  <div className="py-8 text-center text-sm text-[var(--color-text-secondary)]">
                    No documents found.
                  </div>
                ) : (
                  <div className="space-y-2">
                    {filteredDocs.map((doc) => {
                      const DocIcon = getFileIcon(doc.file_type);
                      const badgeColor = categoryBadgeColors[doc.category] || categoryBadgeColors.other;
                      return (
                        <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                          <div className="flex items-center gap-3 min-w-0">
                            <DocIcon size={18} className="text-[var(--color-text-secondary)] shrink-0" />
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-[var(--color-text)] truncate">{doc.original_name}</p>
                              <div className="flex items-center gap-2 mt-0.5">
                                <span className={`badge text-xs ${badgeColor}`}>
                                  {DOCUMENT_CATEGORIES.find((c) => c.value === doc.category)?.label || doc.category}
                                </span>
                                <span className="text-xs text-[var(--color-text-secondary)]">{formatFileSize(doc.file_size)}</span>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2 shrink-0">
                            <button className="btn-ghost btn-sm" onClick={() => handleOpenDocument(doc.id)}>
                              <Eye size={14} />
                            </button>
                            <button
                              className={`btn-sm ${
                                deletingDocId === doc.id ? 'bg-red-600 text-white' : 'btn-ghost text-red-500'
                              }`}
                              onClick={() => handleDeleteDocument(doc.id)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                );
              })()}
            </div>
          )}

          {bottomTab === 'compliance' && (
            <ProFeatureGate feature="compliance_engine">
              <div className="space-y-6">
                <ComplianceSection clientId={client.id} />
                <CommunicationLogSection clientId={client.id} />
              </div>
            </ProFeatureGate>
          )}
        </div>
      </div>

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
