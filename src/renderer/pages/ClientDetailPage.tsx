import React, { useState, useEffect, useCallback } from 'react';
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
  ChevronDown,
  ChevronRight,
  Shield,
  Stethoscope,
  User,
  Activity,
  Flag,
  LogOut,
} from 'lucide-react';
import type {
  Client,
  ClientStatus,
  ClientDocument,
  ClientDocumentCategory,
  ClientDiscount,
  Discipline,
  Note,
  Evaluation,
  Goal,
  GoalStatus,
  Invoice,
  InvoiceStatus,
  Payment,
  PaymentMethod,
  Practice,
} from '../../shared/types';
import { CLIENT_DOCUMENT_CATEGORY_LABELS } from '../../shared/types';
import ClientFormModal from '../components/ClientFormModal';
import GoalFormModal from '../components/GoalFormModal';
import GoalBuilderModal from '../components/GoalBuilderModal';
import ClientDiscountModal from '../components/ClientDiscountModal';
import ClientDiscountBadge from '../components/ClientDiscountBadge';
import ComplianceSection from '../components/ComplianceSection';
import CommunicationLogSection from '../components/CommunicationLogSection';
import ProFeatureGate from '../components/ProFeatureGate';
import ChartCompleteness from '../components/ChartCompleteness';
import ClaimReadinessDialog from '../components/ClaimReadinessDialog';
import TrialExpiredModal from '../components/TrialExpiredModal';
import { useTrialGuard } from '../hooks/useTrialGuard';
import { useChartCompleteness } from '../hooks/useChartCompleteness';
import { useClaimReadiness } from '../hooks/useClaimReadiness';

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
  MFT: 'badge-mft',
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
  ...Object.entries(CLIENT_DOCUMENT_CATEGORY_LABELS).map(([value, label]) => ({ value, label })),
];

const categoryBadgeColors: Record<string, string> = {
  signed_poc: 'bg-emerald-100 text-emerald-700',
  recertification: 'bg-teal-100 text-teal-700',
  physician_order: 'bg-blue-100 text-blue-700',
  prior_authorization: 'bg-purple-100 text-purple-700',
  intake_form: 'bg-sky-100 text-sky-700',
  correspondence: 'bg-slate-100 text-slate-700',
  discharge_summary: 'bg-gray-100 text-gray-700',
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

// --- Collapsible Info Section ---

type SectionColor = 'blue' | 'violet' | 'emerald' | 'amber' | 'slate' | 'teal';

const sectionColorMap: Record<SectionColor, { border: string; bg: string; icon: string; dot: string }> = {
  blue:    { border: 'border-blue-300',    bg: 'bg-blue-50/40',    icon: 'text-blue-500',    dot: 'bg-blue-400' },
  violet:  { border: 'border-violet-300',  bg: 'bg-violet-50/40',  icon: 'text-violet-500',  dot: 'bg-violet-400' },
  emerald: { border: 'border-emerald-300', bg: 'bg-emerald-50/40', icon: 'text-emerald-500', dot: 'bg-emerald-400' },
  amber:   { border: 'border-amber-300',   bg: 'bg-amber-50/40',   icon: 'text-amber-500',   dot: 'bg-amber-400' },
  slate:   { border: 'border-slate-300',   bg: 'bg-slate-50/40',   icon: 'text-slate-500',   dot: 'bg-slate-400' },
  teal:    { border: 'border-teal-300',    bg: 'bg-teal-50/40',    icon: 'text-teal-500',    dot: 'bg-teal-400' },
};

interface CollapsibleInfoProps {
  icon: React.ReactNode;
  title: string;
  isComplete: boolean;
  children: React.ReactNode;
  onEdit?: () => void;
  color?: SectionColor;
}

function CollapsibleInfo({ icon, title, isComplete, children, onEdit, color = 'blue' }: CollapsibleInfoProps) {
  const [isOpen, setIsOpen] = useState(false);
  const scheme = sectionColorMap[color];

  return (
    <div
      className={`rounded-lg border transition-all cursor-pointer select-none ${scheme.border} ${scheme.bg}`}
      onClick={() => setIsOpen(!isOpen)}
    >
      <div className="w-full flex items-center gap-2 px-3 py-2">
        <span className={`shrink-0 ${scheme.icon}`}>{icon}</span>
        <span className="text-xs font-medium text-[var(--color-text)] flex-1 truncate">{title}</span>
        <span className={`w-2 h-2 shrink-0 rounded-full ${isComplete ? 'bg-emerald-400' : 'bg-amber-400'}`} title={isComplete ? 'Complete' : 'Incomplete'} />
        <ChevronDown className={`w-3.5 h-3.5 shrink-0 text-[var(--color-text-secondary)] transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </div>
      {isOpen && (
        <div className="px-3 pb-3 border-t border-[var(--color-border)]/30" onClick={(e) => e.stopPropagation()}>
          <div className="pt-2 text-sm space-y-1.5">
            {children}
          </div>
          {onEdit && (
            <button
              className="mt-3 w-full py-1.5 text-xs font-medium text-[var(--color-primary)] bg-[var(--color-primary)]/5 hover:bg-[var(--color-primary)]/10 rounded-md flex items-center justify-center gap-1.5 transition-colors"
              onClick={() => onEdit()}
            >
              <Edit size={12} /> Edit
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// --- Main Component ---

const ClientDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { guardAction, showExpiredModal, dismissExpiredModal } = useTrialGuard();
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
  const [showInactiveGoals, setShowInactiveGoals] = useState(false);
  const [goalStatusMenuId, setGoalStatusMenuId] = useState<number | null>(null);
  const [showDocuments, setShowDocuments] = useState(false);
  const [showCompliance, setShowCompliance] = useState(false);

  // Billing state
  const [generatingPaymentLink, setGeneratingPaymentLink] = useState<number | null>(null);
  const [checkingPaymentStatus, setCheckingPaymentStatus] = useState<number | null>(null);
  const [billingToast, setBillingToast] = useState<string | null>(null);

  // Discount state
  const [clientDiscounts, setClientDiscounts] = useState<ClientDiscount[]>([]);
  const [activeDiscounts, setActiveDiscounts] = useState<ClientDiscount[]>([]);
  const [showDiscountModal, setShowDiscountModal] = useState(false);

  // Practice + CMS-1500 state
  const [practice, setPractice] = useState<Practice | null>(null);
  const [showReadinessDialog, setShowReadinessDialog] = useState(false);
  const [generatingCMS1500, setGeneratingCMS1500] = useState(false);
  const [cms1500Preview, setCms1500Preview] = useState<{ base64Pdf: string; filename: string } | null>(null);

  // Document upload form state
  const [uploadCategory, setUploadCategory] = useState<ClientDocumentCategory>('other');
  const [uploadCertStart, setUploadCertStart] = useState('');
  const [uploadCertEnd, setUploadCertEnd] = useState('');
  const [uploadReceivedDate, setUploadReceivedDate] = useState('');
  const [uploadSentDate, setUploadSentDate] = useState('');
  const [uploadPhysicianName, setUploadPhysicianName] = useState('');

  // Modals
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [highlightSections, setHighlightSections] = useState<string[]>([]);
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [goalBuilderOpen, setGoalBuilderOpen] = useState(false);
  const [editingGoal, setEditingGoal] = useState<Goal | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  // Chart completeness — must be called before any early returns
  const chartCompleteness = useChartCompleteness(client);

  // CMS-1500 readiness
  const signedNotes = notes.filter(n => n.signed_at);
  const claimReadiness = useClaimReadiness(client, practice, signedNotes);

  const handleCompleteChart = () => {
    const sections = [...new Set(chartCompleteness.missing.map(m => m.section))];
    setHighlightSections(sections);
    setEditModalOpen(true);
  };

  const routeState = (location.state as { tab?: string; invoiceId?: number }) || {};

  const loadData = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const [clientData, notesData, evalsData, goalsData, docsData, invoicesData, paymentsData, discountsData, activeDiscountsData, practiceData] = await Promise.all([
        window.api.clients.get(clientId),
        window.api.notes.listByClient(clientId),
        window.api.evaluations.listByClient(clientId),
        window.api.goals.listByClient(clientId),
        window.api.documents.list({ clientId }),
        window.api.invoices.list({ clientId }),
        window.api.payments.list({ clientId }),
        window.api.clientDiscounts.listByClient(clientId).catch(() => []),
        window.api.clientDiscounts.getActive(clientId).catch(() => []),
        window.api.practice.get().catch(() => null),
      ]);
      setClient(clientData);
      setPractice(practiceData);
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
      setClientDiscounts(discountsData || []);
      setActiveDiscounts(activeDiscountsData || []);
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

  // Close goal status menu on outside click
  useEffect(() => {
    if (!goalStatusMenuId) return;
    const handleClick = () => setGoalStatusMenuId(null);
    document.addEventListener('click', handleClick);
    return () => document.removeEventListener('click', handleClick);
  }, [goalStatusMenuId]);

  // --- Handlers ---

  const handleReactivate = async () => {
    if (!client) return;
    try {
      const updated = await window.api.clients.update(client.id, { ...client, status: 'active' as ClientStatus });
      setClient(updated);
    } catch (err) {
      console.error('Failed to reactivate client:', err);
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
    setGoalBuilderOpen(true);
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

  const handleUploadDocument = async (uploadOpts?: {
    category?: string;
    certification_period_start?: string;
    certification_period_end?: string;
    received_date?: string;
    sent_date?: string;
    physician_name?: string;
  }) => {
    try {
      const result = await window.api.documents.upload({
        clientId,
        category: uploadOpts?.category,
        certification_period_start: uploadOpts?.certification_period_start,
        certification_period_end: uploadOpts?.certification_period_end,
        received_date: uploadOpts?.received_date,
        sent_date: uploadOpts?.sent_date,
        physician_name: uploadOpts?.physician_name,
      });
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

  // --- CMS-1500 Handlers ---

  const handleGenerateCMS1500 = async () => {
    if (!client || signedNotes.length === 0) return;
    setGeneratingCMS1500(true);
    setShowReadinessDialog(false);
    try {
      const noteIds = signedNotes.map(n => n.id);
      const result = await window.api.cms1500.generate({ clientId: client.id, noteIds });
      setCms1500Preview(result);
    } catch (err: any) {
      console.error('Failed to generate CMS-1500:', err);
      setBillingToast(err.message || 'Failed to generate CMS-1500');
    } finally {
      setGeneratingCMS1500(false);
    }
  };

  const handleSaveCMS1500 = async () => {
    if (!cms1500Preview) return;
    try {
      const savedPath = await window.api.cms1500.save(cms1500Preview);
      if (savedPath) {
        setBillingToast('CMS-1500 saved successfully');
      }
    } catch (err: any) {
      console.error('Failed to save CMS-1500:', err);
      setBillingToast(err.message || 'Failed to save CMS-1500');
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
  const unsignedNotes = notes.filter((n) => !n.signed_at);
  const displayNotes = showAllNotes ? notes : notes.slice(0, 5);
  const sortedActiveGoals = goals.filter((g) => g.status === 'active');
  const inactiveGoals = goals.filter((g) => g.status !== 'active');
  const displayActiveGoals = showAllGoals ? sortedActiveGoals : sortedActiveGoals.slice(0, 4);

  // Completeness checks — used by collapsible section badges
  const demographicsComplete = Boolean(client.dob && client.phone && client.gender && client.address);
  const insuranceComplete = Boolean(client.insurance_payer && client.insurance_member_id);
  const diagnosisComplete = Boolean(client.primary_dx_code);
  const referringComplete = Boolean(client.referring_physician);
  const claimInfoComplete = Boolean(client.onset_date && client.patient_signature_source);

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

      {/* Discharged Client Banner */}
      {client.status === 'discharged' && (
        <div className="card p-3 bg-amber-50/50 border-l-4 border-l-amber-400">
          <div className="flex items-center gap-2 text-sm text-amber-700">
            <Archive size={16} />
            <span className="font-medium">This client was discharged.</span>
          </div>
        </div>
      )}

      {/* Chart Completeness Indicator */}
      <ChartCompleteness result={chartCompleteness} onCompleteChart={handleCompleteChart} />

      {/* ══════════ HEADER CARD WITH COLLAPSIBLE SECTIONS ══════════ */}
      <div className="card p-5">
        {/* Main Header Row */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-4">
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
            <button className="btn-secondary btn-sm gap-1.5" onClick={() => setEditModalOpen(true)}>
              <Edit size={14} /> Edit
            </button>
            <button className="btn-ghost btn-sm gap-1.5" onClick={handleExportPdf} disabled={exportingPdf}>
              <Download size={14} /> {exportingPdf ? 'Exporting...' : 'Export Chart'}
            </button>
            {client.status !== 'discharged' && (
              <button
                className="btn-ghost btn-sm gap-1.5 text-amber-600 hover:bg-amber-50"
                onClick={() => navigate(`/clients/${client.id}/note/new`, {
                  state: { noteMode: 'discharge', standalone: true }
                })}
              >
                <LogOut size={14} /> Discharge Client
              </button>
            )}
            {client.status === 'discharged' && (
              <button className="btn-ghost btn-sm gap-1.5 text-green-600 hover:bg-green-50" onClick={handleReactivate}>
                <Archive size={14} /> Reactivate
              </button>
            )}
          </div>
        </div>

        {/* Collapsible Info Sections — Clinical Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <CollapsibleInfo
            icon={<User size={14} />}
            title="Demographics"
            isComplete={demographicsComplete}
            onEdit={() => setEditModalOpen(true)}
            color="blue"
          >
            <div className="flex justify-between"><span className="text-[var(--color-text-secondary)]">DOB</span><span>{formatDate(client.dob)}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-text-secondary)]">Sex</span><span>{client.gender ? client.gender.charAt(0).toUpperCase() + client.gender.slice(1) : '--'}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-text-secondary)]">Phone</span><span>{client.phone || '--'}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-text-secondary)]">Email</span><span className="truncate ml-2">{client.email || '--'}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-text-secondary)]">Address</span><span className="truncate ml-2">{client.address || '--'}</span></div>
          </CollapsibleInfo>

          <CollapsibleInfo
            icon={<Stethoscope size={14} />}
            title="Diagnosis"
            isComplete={diagnosisComplete}
            onEdit={() => setEditModalOpen(true)}
            color="violet"
          >
            <div className="flex justify-between"><span className="text-[var(--color-text-secondary)]">Primary Dx</span><span>{client.primary_dx_code || '--'}</span></div>
            {client.primary_dx_description && <p className="text-xs text-[var(--color-text-secondary)] italic">{client.primary_dx_description}</p>}
            {(() => {
              try {
                const secDx = JSON.parse(client.secondary_dx || '[]');
                if (Array.isArray(secDx) && secDx.length > 0) {
                  return secDx.map((dx: any, i: number) => (
                    <div key={i} className="flex justify-between">
                      <span className="text-[var(--color-text-secondary)]">Dx {String.fromCharCode(66 + i)}</span>
                      <span>{dx.code}</span>
                    </div>
                  ));
                }
              } catch {}
              return null;
            })()}
            <div className="flex justify-between"><span className="text-[var(--color-text-secondary)]">Default CPT</span><span>{client.default_cpt_code || '--'}</span></div>
          </CollapsibleInfo>

          <CollapsibleInfo
            icon={<Activity size={14} />}
            title="Referral"
            isComplete={referringComplete}
            onEdit={() => setEditModalOpen(true)}
            color="amber"
          >
            <div className="flex justify-between"><span className="text-[var(--color-text-secondary)]">Physician</span><span>{client.referring_physician || '--'}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-text-secondary)]">NPI</span><span>{client.referring_npi || '--'}</span></div>
          </CollapsibleInfo>

          <CollapsibleInfo
            icon={<Shield size={14} />}
            title="Compliance"
            isComplete={true}
            color="teal"
          >
            <p className="text-xs text-[var(--color-text-secondary)]">Medicare tracking and progress report alerts</p>
            <button className="mt-2 text-xs text-[var(--color-primary)] hover:underline" onClick={() => setShowCompliance(true)}>
              View Details
            </button>
          </CollapsibleInfo>
        </div>

        {/* Collapsible Info Sections — Business Row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <CollapsibleInfo
            icon={<Shield size={14} />}
            title="Insurance"
            isComplete={insuranceComplete}
            onEdit={() => setEditModalOpen(true)}
            color="emerald"
          >
            <div className="flex justify-between"><span className="text-[var(--color-text-secondary)]">Payer</span><span>{client.insurance_payer || '--'}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-text-secondary)]">Member ID</span><span>{client.insurance_member_id || '--'}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-text-secondary)]">Group</span><span>{client.insurance_group || '--'}</span></div>
          </CollapsibleInfo>

          <CollapsibleInfo
            icon={<FolderOpen size={14} />}
            title={`Documents (${documents.length})`}
            isComplete={documents.length > 0}
            color="slate"
          >
            <div className="space-y-1.5">
              {documents.slice(0, 3).map((doc) => (
                <div key={doc.id} className="flex items-center justify-between text-xs">
                  <span className="truncate">{doc.original_name}</span>
                  <button className="text-[var(--color-primary)] hover:underline" onClick={() => handleOpenDocument(doc.id)}>View</button>
                </div>
              ))}
              {documents.length > 3 && <p className="text-xs text-[var(--color-text-secondary)]">+{documents.length - 3} more</p>}
              {documents.length === 0 && <p className="text-xs text-[var(--color-text-secondary)]">No documents</p>}
            </div>
            <button className="mt-2 text-xs text-[var(--color-primary)] hover:underline flex items-center gap-1" onClick={() => setShowDocuments(true)}>
              <Upload size={10} /> Upload
            </button>
          </CollapsibleInfo>

          <CollapsibleInfo
            icon={<FileText size={14} />}
            title="Claim Info"
            isComplete={claimInfoComplete}
            onEdit={() => setEditModalOpen(true)}
            color="violet"
          >
            <div className="flex justify-between"><span className="text-[var(--color-text-secondary)]">Onset</span><span>{client.onset_date ? formatDate(client.onset_date) : '--'}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-text-secondary)]">Assignment</span><span>{client.claim_accept_assignment === 'Y' ? 'Yes' : client.claim_accept_assignment === 'N' ? 'No' : '--'}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-text-secondary)]">Prior Auth</span><span>{client.prior_auth_number || '--'}</span></div>
            <div className="flex justify-between"><span className="text-[var(--color-text-secondary)]">Patient Sig</span><span>{client.patient_signature_source || '--'}</span></div>
          </CollapsibleInfo>
        </div>
      </div>

      {/* ══════════ TWO COLUMN: CLINICAL DATA ══════════ */}
      <div className="grid grid-cols-12 gap-6">
        {/* LEFT COLUMN: Evaluations + Goals (5 cols) */}
        <div className="col-span-5 space-y-6">
          {/* Evaluations */}
          <div className="card">
            <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
              <h3 className="font-semibold text-[var(--color-text)] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-violet-400" />
                Evaluations
                <span className="text-xs font-normal text-[var(--color-text-secondary)]">({evaluations.length})</span>
              </h3>
              <div className="flex items-center gap-2">
                {evaluations.some(e => e.signed_at) && (
                  <button
                    className="btn-secondary btn-sm gap-1.5"
                    onClick={() => { if (guardAction()) navigate(`/clients/${clientId}/eval/new`, { state: { reassessment: true } }); }}
                  >
                    <RefreshCw size={14} /> Reassessment
                  </button>
                )}
                <button
                  className="btn-accent btn-sm gap-1.5"
                  onClick={() => { if (guardAction()) navigate(`/clients/${clientId}/eval/new`); }}
                >
                  <Plus size={14} /> New Eval
                </button>
              </div>
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
                      <span className="text-sm font-medium text-[var(--color-text)]">
                        {formatDate(evalItem.eval_date)}
                      </span>
                      <span className={disciplineBadgeClass[evalItem.discipline]}>{evalItem.discipline}</span>
                      {(evalItem as any).eval_type === 'reassessment' && (
                        <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-blue-100 text-blue-700">
                          UPDATE
                        </span>
                      )}
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

          {/* Goals */}
          <div className="card">
            <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
              <h3 className="font-semibold text-[var(--color-text)] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-400" />
                Goals
                <span className="text-xs font-normal text-[var(--color-text-secondary)]">
                  ({activeGoals.length} active / {goals.length} total)
                </span>
              </h3>
              <button className="btn-primary btn-sm gap-1.5" onClick={() => { if (guardAction()) openAddGoal(); }}>
                <Plus size={14} /> Add Goal
              </button>
            </div>
            {goals.length === 0 ? (
              <div className="p-6 text-center text-sm text-[var(--color-text-secondary)]">
                No goals set yet. Add one to track progress.
              </div>
            ) : (
              <>
                {/* Active Goals */}
                <div className="divide-y divide-[var(--color-border)]">
                  {displayActiveGoals.map((goal) => {
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
                              <div className="relative inline-block">
                                <button
                                  className={`badge text-xs cursor-pointer hover:opacity-80 transition-opacity ${config.className}`}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setGoalStatusMenuId(goalStatusMenuId === goal.id ? null : goal.id);
                                  }}
                                >
                                  <StatusIcon size={10} className="mr-0.5" /> {config.label}
                                  <ChevronDown size={10} className="ml-0.5 opacity-60" />
                                </button>
                                {goalStatusMenuId === goal.id && (
                                  <div className="absolute left-0 top-full mt-1 z-50 bg-white rounded-lg shadow-lg border border-[var(--color-border)] py-1 min-w-[140px]">
                                    {(Object.entries(goalStatusConfig) as [GoalStatus, typeof config][]).map(([status, cfg]) => {
                                      const Icon = cfg.icon;
                                      return (
                                        <button
                                          key={status}
                                          className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-gray-50 transition-colors ${goal.status === status ? 'font-semibold bg-gray-50' : ''}`}
                                          onClick={async (e) => {
                                            e.stopPropagation();
                                            setGoalStatusMenuId(null);
                                            if (status === goal.status) return;
                                            try {
                                              await window.api.goals.update(goal.id, {
                                                ...goal,
                                                status,
                                                met_date: status === 'met' ? new Date().toISOString().slice(0, 10) : goal.met_date,
                                              });
                                              const updatedGoals = await window.api.goals.listByClient(clientId);
                                              setGoals(updatedGoals);
                                            } catch (err) {
                                              console.error('Failed to update goal status:', err);
                                            }
                                          }}
                                        >
                                          <Icon size={12} /> {cfg.label}
                                        </button>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            </div>
                            <p className="text-sm text-[var(--color-text)]">{goal.goal_text}</p>
                            {goal.target_date && (
                              <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                                Target: {formatDate(goal.target_date)}
                              </p>
                            )}
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button className="btn-ghost p-1" onClick={() => openEditGoal(goal)}>
                              <Edit size={12} />
                            </button>
                            <button
                              className="btn-ghost p-1 text-amber-500 hover:text-amber-600 hover:bg-amber-50"
                              title="Flag for Checkpoint"
                              onClick={async (e) => {
                                e.stopPropagation();
                                try {
                                  await window.api.stagedGoals.create({
                                    client_id: clientId,
                                    goal_text: goal.goal_text,
                                    goal_type: goal.goal_type,
                                    category: goal.category || '',
                                    rationale: '',
                                    flagged_from_note_id: undefined,
                                  });
                                  (e.target as HTMLElement).closest('button')!.classList.add('text-emerald-500');
                                  setTimeout(() => {
                                    (e.target as HTMLElement).closest('button')?.classList.remove('text-emerald-500');
                                  }, 1500);
                                } catch (err) {
                                  console.error('Failed to flag goal for checkpoint:', err);
                                }
                              }}
                            >
                              <Flag size={12} />
                            </button>
                            <button
                              className="btn-ghost p-1 text-red-400 hover:text-red-600 hover:bg-red-50"
                              title="Delete Goal"
                              onClick={async (e) => {
                                e.stopPropagation();
                                if (!window.confirm('Delete this goal? This action cannot be undone.')) return;
                                try {
                                  await window.api.goals.delete(goal.id);
                                  const updatedGoals = await window.api.goals.listByClient(clientId);
                                  setGoals(updatedGoals);
                                } catch (err) {
                                  console.error('Failed to delete goal:', err);
                                }
                              }}
                            >
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
                {sortedActiveGoals.length > 4 && (
                  <button
                    className="w-full py-2 text-xs text-[var(--color-primary)] font-medium hover:bg-gray-50 flex items-center justify-center gap-1 border-b border-[var(--color-border)]"
                    onClick={() => setShowAllGoals(!showAllGoals)}
                  >
                    {showAllGoals ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    {showAllGoals ? 'Show less' : `Show all ${sortedActiveGoals.length} active goals`}
                  </button>
                )}

                {/* Inactive Goals — collapsed section */}
                {inactiveGoals.length > 0 && (
                  <div>
                    <button
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-gray-50 transition-colors"
                      onClick={() => setShowInactiveGoals(!showInactiveGoals)}
                    >
                      {showInactiveGoals ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      <CheckCircle size={12} className="text-green-500" />
                      Goals Met / Completed ({inactiveGoals.filter(g => g.status === 'met').length} met, {inactiveGoals.filter(g => g.status !== 'met').length} other)
                    </button>
                    {showInactiveGoals && (
                      <div className="divide-y divide-[var(--color-border)] bg-gray-50/50">
                        {inactiveGoals.map((goal) => {
                          const config = goalStatusConfig[goal.status];
                          const StatusIcon = config.icon;
                          return (
                            <div key={goal.id} className="px-4 py-2.5 opacity-75">
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 mb-0.5">
                                    <span className="badge bg-gray-100 text-gray-600 text-[10px] font-semibold">{goal.goal_type}</span>
                                    {goal.category && (
                                      <span className="badge bg-blue-50/60 text-blue-500 text-[10px]">{formatCategory(goal.category)}</span>
                                    )}
                                    <div className="relative inline-block">
                                      <button
                                        className={`badge text-[10px] cursor-pointer hover:opacity-80 transition-opacity ${config.className}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setGoalStatusMenuId(goalStatusMenuId === goal.id ? null : goal.id);
                                        }}
                                      >
                                        <StatusIcon size={9} className="mr-0.5" /> {config.label}
                                        <ChevronDown size={9} className="ml-0.5 opacity-60" />
                                      </button>
                                      {goalStatusMenuId === goal.id && (
                                        <div className="absolute left-0 top-full mt-1 z-50 bg-white rounded-lg shadow-lg border border-[var(--color-border)] py-1 min-w-[140px]">
                                          {(Object.entries(goalStatusConfig) as [GoalStatus, typeof config][]).map(([status, cfg]) => {
                                            const Icon = cfg.icon;
                                            return (
                                              <button
                                                key={status}
                                                className={`w-full text-left px-3 py-1.5 text-xs flex items-center gap-2 hover:bg-gray-50 transition-colors ${goal.status === status ? 'font-semibold bg-gray-50' : ''}`}
                                                onClick={async (e) => {
                                                  e.stopPropagation();
                                                  setGoalStatusMenuId(null);
                                                  if (status === goal.status) return;
                                                  try {
                                                    await window.api.goals.update(goal.id, {
                                                      ...goal,
                                                      status,
                                                      met_date: status === 'met' ? new Date().toISOString().slice(0, 10) : goal.met_date,
                                                    });
                                                    const updatedGoals = await window.api.goals.listByClient(clientId);
                                                    setGoals(updatedGoals);
                                                  } catch (err) {
                                                    console.error('Failed to update goal status:', err);
                                                  }
                                                }}
                                              >
                                                <Icon size={12} /> {cfg.label}
                                              </button>
                                            );
                                          })}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <p className="text-xs text-[var(--color-text-secondary)]">{goal.goal_text}</p>
                                  {(goal.target_date || goal.met_date) && (
                                    <p className="text-[10px] text-[var(--color-text-tertiary)] mt-0.5">
                                      {goal.target_date && `Target: ${formatDate(goal.target_date)}`}
                                      {goal.met_date && <span className="ml-2 text-green-600 font-medium">Met: {formatDate(goal.met_date)}</span>}
                                    </p>
                                  )}
                                </div>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <button className="btn-ghost p-1" onClick={() => openEditGoal(goal)}>
                                    <Edit size={11} />
                                  </button>
                                  <button
                                    className="btn-ghost p-1 text-red-400 hover:text-red-600 hover:bg-red-50"
                                    title="Delete Goal"
                                    onClick={async (e) => {
                                      e.stopPropagation();
                                      if (!window.confirm('Delete this goal? This action cannot be undone.')) return;
                                      try {
                                        await window.api.goals.delete(goal.id);
                                        const updatedGoals = await window.api.goals.listByClient(clientId);
                                        setGoals(updatedGoals);
                                      } catch (err) {
                                        console.error('Failed to delete goal:', err);
                                      }
                                    }}
                                  >
                                    <Trash2 size={11} />
                                  </button>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: SOAP Notes (7 cols) */}
        <div className="col-span-7">
          <div className="card">
            <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
              <h3 className="font-semibold text-[var(--color-text)] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-blue-400" />
                SOAP Notes
                <span className="text-xs font-normal text-[var(--color-text-secondary)]">({notes.length})</span>
                {unsignedNotes.length > 0 && (
                  <span className="badge bg-red-100 text-red-600 text-xs">{unsignedNotes.length} unsigned</span>
                )}
              </h3>
              <button
                className="btn-primary btn-sm gap-1.5"
                onClick={() => { if (guardAction()) navigate(`/clients/${clientId}/note/new`); }}
              >
                <Plus size={14} /> New Note
              </button>
            </div>
            {notes.length === 0 ? (
              <div className="p-8 text-center text-sm text-[var(--color-text-secondary)]">
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
                        <span className="text-sm font-medium text-[var(--color-text)] w-24 shrink-0">
                          {formatDate(note.date_of_service)}
                        </span>
                        {cptBadges.slice(0, 2).map((line, i) => (
                          <span key={i} className="badge bg-gray-100 text-gray-600 text-xs">
                            {line.code} ({line.units}u)
                          </span>
                        ))}
                        <span className="text-xs text-[var(--color-text-secondary)] truncate">
                          {truncate(note.subjective || '', 40)}
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
        </div>
      </div>

      {/* ══════════ ORDERS & CERTIFICATIONS ══════════ */}
      <div className="card">
        <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)]">
          <h2 className="text-lg font-semibold text-[var(--color-text)] flex items-center gap-2">
            <ClipboardList size={20} className="text-[var(--color-primary)]" />
            Orders & Certifications
          </h2>
          <div className="flex items-center gap-2">
            <button
              className="btn-primary btn-sm gap-1.5"
              onClick={() => {
                setUploadCategory('signed_poc');
                setUploadPhysicianName(client.referring_physician || '');
                setUploadReceivedDate(new Date().toISOString().split('T')[0]);
                setShowDocuments(true);
              }}
            >
              <Upload size={14} /> Upload Documents
            </button>
          </div>
        </div>
        <div className="p-5">
          {/* Current POC Status Card */}
          {(() => {
            const today = new Date().toISOString().split('T')[0];
            const pocDocs = documents.filter(
              (d) => (d.category === 'signed_poc' || d.category === 'recertification') && !d.deleted_at
            ).sort((a, b) => (b.certification_period_end || '').localeCompare(a.certification_period_end || ''));
            const currentPoc = pocDocs[0];

            const daysBetween = (d1: string, d2: string) => {
              const a = new Date(d1 + 'T00:00:00');
              const b = new Date(d2 + 'T00:00:00');
              return Math.ceil((b.getTime() - a.getTime()) / (1000 * 60 * 60 * 24));
            };

            const pocStatus = !currentPoc ? 'missing'
              : currentPoc.certification_period_end && currentPoc.certification_period_end < today ? 'expired'
              : currentPoc.certification_period_end && daysBetween(today, currentPoc.certification_period_end) <= 30 ? 'expiring'
              : 'current';

            return (
              <div className="mb-5">
                <div className={`flex items-start gap-3 p-4 rounded-lg border ${
                  pocStatus === 'current' ? 'border-emerald-200 bg-emerald-50/50' :
                  pocStatus === 'expiring' ? 'border-orange-200 bg-orange-50/50' :
                  'border-red-200 bg-red-50/50'
                }`}>
                  <span className={`status-dot mt-1.5 ${
                    pocStatus === 'current' ? 'status-dot--good' :
                    pocStatus === 'expiring' ? 'status-dot--attention' :
                    'status-dot--urgent'
                  }`} />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-[var(--color-text)]">
                      {pocStatus === 'current' && 'Current POC on file'}
                      {pocStatus === 'expiring' && `POC expiring in ${currentPoc ? daysBetween(today, currentPoc.certification_period_end) : 0} days`}
                      {pocStatus === 'expired' && 'POC expired'}
                      {pocStatus === 'missing' && 'No POC on file'}
                    </p>
                    {currentPoc && (
                      <div className="text-xs text-[var(--color-text-secondary)] mt-1 space-y-0.5">
                        {currentPoc.certification_period_start && currentPoc.certification_period_end && (
                          <p>Certification Period: {formatDate(currentPoc.certification_period_start)} — {formatDate(currentPoc.certification_period_end)}</p>
                        )}
                        {currentPoc.physician_name && <p>Physician: {currentPoc.physician_name}</p>}
                        {currentPoc.received_date && <p>Received: {formatDate(currentPoc.received_date)}</p>}
                      </div>
                    )}
                    {pocStatus === 'missing' && (
                      <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                        Upload a signed Plan of Care to begin tracking certifications.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })()}

          {/* Certification History */}
          {(() => {
            const certDocs = documents.filter(
              (d) => (d.category === 'signed_poc' || d.category === 'recertification') && !d.deleted_at
            ).sort((a, b) => (b.certification_period_end || '').localeCompare(a.certification_period_end || ''));

            if (certDocs.length === 0) {
              return (
                <div className="py-6 text-center text-sm text-[var(--color-text-secondary)]">
                  No certification documents uploaded yet.
                </div>
              );
            }

            return (
              <div className="space-y-2">
                <h3 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">Certification History</h3>
                {certDocs.map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors">
                    <div className="flex items-center gap-3 min-w-0">
                      <FileText size={16} className="text-[var(--color-text-secondary)] shrink-0" />
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-[var(--color-text)]">
                          {doc.category === 'signed_poc' ? 'Signed POC' : 'Recertification'}
                          {doc.physician_name && ` — ${doc.physician_name}`}
                        </p>
                        <div className="flex items-center gap-3 mt-0.5 text-xs text-[var(--color-text-secondary)]">
                          {doc.certification_period_start && doc.certification_period_end && (
                            <span>{formatDate(doc.certification_period_start)} to {formatDate(doc.certification_period_end)}</span>
                          )}
                          {doc.sent_date && <span>Sent: {formatDate(doc.sent_date)}</span>}
                          {doc.received_date && <span>Received: {formatDate(doc.received_date)}</span>}
                        </div>
                      </div>
                    </div>
                    <button className="btn-ghost btn-sm" onClick={() => handleOpenDocument(doc.id)}>
                      <Eye size={14} />
                    </button>
                  </div>
                ))}
              </div>
            );
          })()}
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
              onClick={() => { if (guardAction()) navigate(`/billing?newInvoice=${clientId}`); }}
            >
              <Plus size={14} /> New Invoice
            </button>
            <button
              className="btn-secondary btn-sm gap-1.5"
              onClick={() => { if (guardAction()) navigate(`/billing?newPayment=${clientId}`); }}
            >
              <CreditCard size={14} /> Record Payment
            </button>
            <button
              className="btn-secondary btn-sm gap-1.5"
              onClick={() => navigate(`/clients/${clientId}/superbill`)}
            >
              <FileText size={14} /> Superbill
            </button>
            <button
              className="btn-secondary btn-sm gap-1.5"
              onClick={() => setShowReadinessDialog(true)}
              disabled={generatingCMS1500}
            >
              {generatingCMS1500 ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <ClipboardList size={14} />
              )}
              CMS-1500
              {claimReadiness.ready && signedNotes.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
              )}
              {!claimReadiness.ready && (
                <span className="w-2 h-2 rounded-full bg-red-400" />
              )}
            </button>
          </div>
        </div>

        <div className="p-5">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-6">
            <div
              className="flex items-center justify-between p-3 rounded-lg bg-amber-50 border border-amber-200 cursor-pointer hover:shadow-md transition-all"
              onClick={() => navigate('/billing?tab=invoices')}
            >
              <div>
                <p className="text-xs text-amber-600 font-medium">Balance Due</p>
                <p className={`text-lg font-bold ${balanceDue > 0 ? 'text-amber-700' : 'text-gray-500'}`}>
                  {formatCurrency(balanceDue)}
                </p>
              </div>
              <AlertCircle className={`w-5 h-5 ${balanceDue > 0 ? 'text-amber-500' : 'text-gray-300'}`} />
            </div>
            <div
              className="flex items-center justify-between p-3 rounded-lg bg-emerald-50 border border-emerald-200 cursor-pointer hover:shadow-md transition-all"
              onClick={() => navigate('/billing?tab=payments')}
            >
              <div>
                <p className="text-xs text-emerald-600 font-medium">Total Collected</p>
                <p className="text-lg font-bold text-emerald-700">{formatCurrency(totalPaid)}</p>
              </div>
              <DollarSign className="w-5 h-5 text-emerald-500" />
            </div>
            <div
              className="flex items-center justify-between p-3 rounded-lg bg-blue-50 border border-blue-200 cursor-pointer hover:shadow-md transition-all"
              onClick={() => navigate('/billing?tab=invoices')}
            >
              <div>
                <p className="text-xs text-blue-600 font-medium">Total Invoiced</p>
                <p className="text-lg font-bold text-blue-700">{formatCurrency(totalInvoiced)}</p>
              </div>
              <Receipt className="w-5 h-5 text-blue-500" />
            </div>
          </div>

          {/* Recent Invoices - Clickable */}
          <div className="mb-6">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-[var(--color-text)]">Recent Invoices</h4>
              <button className="text-xs text-[var(--color-primary)] hover:underline" onClick={() => navigate('/billing?tab=invoices')}>
                View All
              </button>
            </div>
            {invoices.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-text-secondary)]">
                No invoices yet. Create one to start billing.
              </div>
            ) : (
              <div className="rounded-lg border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
                {invoices.slice(0, 5).map((invoice) => (
                  <div
                    key={invoice.id}
                    className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/billing?tab=invoices&invoiceId=${invoice.id}`)}
                  >
                    <div className="flex items-center gap-4">
                      <div>
                        <p className="text-sm font-medium text-[var(--color-text)]">{invoice.invoice_number}</p>
                        <p className="text-xs text-[var(--color-text-secondary)]">
                          {formatDate(invoice.invoice_date)}
                          {invoice.due_date && ` - Due ${formatDate(invoice.due_date)}`}
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
                      <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
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

          {/* Recent Payments - Clickable */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-[var(--color-text)]">Recent Payments</h4>
              <button className="text-xs text-[var(--color-primary)] hover:underline" onClick={() => navigate('/billing?tab=payments')}>
                View All
              </button>
            </div>
            {payments.length === 0 ? (
              <div className="rounded-lg border border-dashed border-[var(--color-border)] p-6 text-center text-sm text-[var(--color-text-secondary)]">
                No payments recorded yet.
              </div>
            ) : (
              <div className="rounded-lg border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
                {payments.slice(0, 5).map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between px-4 py-3 hover:bg-gray-50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/billing?tab=payments&paymentId=${payment.id}`)}
                  >
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text)]">{formatDate(payment.payment_date)}</p>
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        {PAYMENT_METHOD_LABELS[payment.payment_method] || payment.payment_method || 'Other'}
                        {payment.reference_number && ` - Ref: ${payment.reference_number}`}
                      </p>
                    </div>
                    <p className="font-medium text-emerald-600">+{formatCurrency(payment.amount)}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Discounts & Packages */}
          <div className="mt-6">
            <div className="flex items-center justify-between mb-3">
              <h4 className="text-sm font-semibold text-[var(--color-text)]">Discounts & Packages</h4>
              <button
                className="btn-ghost btn-sm text-xs gap-1"
                onClick={() => setShowDiscountModal(true)}
              >
                <Plus size={12} /> Add Discount
              </button>
            </div>

            {activeDiscounts.map((disc) => (
              <div key={disc.id} className="mb-3 p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <ClientDiscountBadge discount={disc} />
                    {disc.notes && (
                      <span className="text-xs text-[var(--color-text-secondary)]">{disc.notes}</span>
                    )}
                  </div>
                  <button
                    className="text-xs text-red-500 hover:text-red-700"
                    onClick={async () => {
                      await window.api.clientDiscounts.update(disc.id, { status: 'cancelled' });
                      loadData();
                    }}
                  >
                    Cancel
                  </button>
                </div>
                {(disc.discount_type === 'package' || disc.discount_type === 'flat_rate') && (
                  <div className="mt-2">
                    {(() => {
                      const total = disc.discount_type === 'package'
                        ? disc.total_sessions || 0
                        : disc.flat_rate_sessions || 0;
                      const used = disc.discount_type === 'package'
                        ? disc.sessions_used || 0
                        : disc.flat_rate_sessions_used || 0;
                      const pct = total > 0 ? (used / total) * 100 : 0;
                      return (
                        <div>
                          <div className="flex justify-between text-xs text-[var(--color-text-secondary)] mb-1">
                            <span>{used} of {total} sessions used</span>
                            <span>{total - used} remaining</span>
                          </div>
                          <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${pct >= 80 ? 'bg-amber-500' : 'bg-emerald-500'}`}
                              style={{ width: `${Math.min(100, pct)}%` }}
                            />
                          </div>
                        </div>
                      );
                    })()}
                  </div>
                )}
              </div>
            ))}

            {clientDiscounts.filter(d => d.status !== 'active').length > 0 && (
              <div className="rounded-lg border border-[var(--color-border)] divide-y divide-[var(--color-border)]">
                {clientDiscounts.filter(d => d.status !== 'active').slice(0, 3).map(d => (
                  <div key={d.id} className="flex items-center justify-between px-4 py-2">
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-[var(--color-text-secondary)]">{d.label || d.discount_type}</span>
                      <span className={`badge text-xs ${
                        d.status === 'exhausted' ? 'bg-gray-100 text-gray-600' :
                        d.status === 'expired' ? 'bg-amber-100 text-amber-700' :
                        'bg-red-100 text-red-600'
                      }`}>
                        {d.status}
                      </span>
                    </div>
                    <span className="text-xs text-[var(--color-text-secondary)]">
                      {d.created_at ? new Date(d.created_at).toLocaleDateString() : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {clientDiscounts.length === 0 && activeDiscounts.length === 0 && (
              <div className="rounded-lg border border-dashed border-[var(--color-border)] p-4 text-center text-sm text-[var(--color-text-secondary)]">
                No discounts or packages. Add one to offer special pricing.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ══════════ CMS-1500 PREVIEW ══════════ */}
      {cms1500Preview && (
        <div className="card">
          <div className="flex items-center justify-between p-5 border-b border-[var(--color-border)]">
            <h2 className="text-lg font-semibold text-[var(--color-text)] flex items-center gap-2">
              <FileText size={20} className="text-indigo-500" />
              CMS-1500 Preview
            </h2>
            <div className="flex items-center gap-2">
              <button
                className="btn-primary btn-sm gap-1.5"
                onClick={handleSaveCMS1500}
              >
                <Download size={14} /> Save PDF
              </button>
              <button
                className="btn-secondary btn-sm gap-1.5"
                onClick={() => setCms1500Preview(null)}
              >
                <XCircle size={14} /> Close
              </button>
            </div>
          </div>
          <div className="p-5 flex justify-center bg-gray-100">
            <iframe
              src={`data:application/pdf;base64,${cms1500Preview.base64Pdf}`}
              className="w-full max-w-[850px] h-[1100px] border border-[var(--color-border)] rounded-lg shadow-inner bg-white"
              title="CMS-1500 Preview"
            />
          </div>
        </div>
      )}

      {/* ══════════ DISCOUNT MODAL ══════════ */}
      {showDiscountModal && (
        <ClientDiscountModal
          isOpen={showDiscountModal}
          onClose={() => setShowDiscountModal(false)}
          onSave={() => loadData()}
          clientId={clientId}
          clientHasInsurance={Boolean(client?.insurance_payer)}
          existingDiscounts={activeDiscounts}
        />
      )}

      {/* ══════════ DOCUMENTS MODAL ══════════ */}
      {showDocuments && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowDocuments(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
              <h3 className="text-lg font-semibold text-[var(--color-text)] flex items-center gap-2">
                <FolderOpen size={20} className="text-[var(--color-primary)]" />
                Documents
              </h3>
              <button onClick={() => setShowDocuments(false)} className="btn-ghost p-1">
                <XCircle size={20} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              {/* Upload Form */}
              <div className="mb-4 p-4 rounded-lg border border-[var(--color-border)] bg-gray-50/50">
                <div className="flex items-center gap-3 mb-3">
                  <select
                    className="input py-1.5 text-sm flex-1"
                    value={uploadCategory}
                    onChange={(e) => setUploadCategory(e.target.value as ClientDocumentCategory)}
                  >
                    {Object.entries(CLIENT_DOCUMENT_CATEGORY_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>{label}</option>
                    ))}
                  </select>
                  <button className="btn-primary btn-sm gap-1.5 whitespace-nowrap" onClick={() => {
                    handleUploadDocument({
                      category: uploadCategory,
                      certification_period_start: uploadCertStart,
                      certification_period_end: uploadCertEnd,
                      received_date: uploadReceivedDate,
                      sent_date: uploadSentDate,
                      physician_name: uploadPhysicianName,
                    });
                  }}>
                    <Upload size={14} /> Upload Document
                  </button>
                </div>
                {(uploadCategory === 'signed_poc' || uploadCategory === 'recertification') && (
                  <div className="grid grid-cols-2 gap-3 mt-3 pt-3 border-t border-[var(--color-border)]/50">
                    <div>
                      <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1 block">Cert Period Start</label>
                      <input type="date" className="input py-1.5 text-sm" value={uploadCertStart} onChange={(e) => setUploadCertStart(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1 block">Cert Period End</label>
                      <input type="date" className="input py-1.5 text-sm" value={uploadCertEnd} onChange={(e) => setUploadCertEnd(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1 block">Physician Name</label>
                      <input type="text" className="input py-1.5 text-sm" placeholder={client?.referring_physician || 'Dr. ...'} value={uploadPhysicianName} onChange={(e) => setUploadPhysicianName(e.target.value)} />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1 block">Received Date</label>
                      <input type="date" className="input py-1.5 text-sm" value={uploadReceivedDate} onChange={(e) => setUploadReceivedDate(e.target.value)} />
                    </div>
                  </div>
                )}
              </div>

              {/* Filter */}
              <div className="flex items-center justify-between mb-4">
                <select
                  className="input py-1.5 text-sm w-44"
                  value={docCategoryFilter}
                  onChange={(e) => setDocCategoryFilter(e.target.value)}
                >
                  {DOCUMENT_CATEGORIES.map((cat) => (
                    <option key={cat.value} value={cat.value}>{cat.label}</option>
                  ))}
                </select>
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
                                  {CLIENT_DOCUMENT_CATEGORY_LABELS[doc.category as ClientDocumentCategory] || doc.category}
                                </span>
                                <span className="text-xs text-[var(--color-text-secondary)]">{formatFileSize(doc.file_size)}</span>
                                {doc.physician_name && (
                                  <span className="text-xs text-[var(--color-text-secondary)]">{doc.physician_name}</span>
                                )}
                              </div>
                              {doc.certification_period_start && doc.certification_period_end && (
                                <p className="text-[10px] text-[var(--color-text-secondary)] mt-0.5">
                                  Cert: {formatDate(doc.certification_period_start)} — {formatDate(doc.certification_period_end)}
                                </p>
                              )}
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
          </div>
        </div>
      )}

      {/* ══════════ COMPLIANCE MODAL ══════════ */}
      {showCompliance && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowCompliance(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-3xl mx-4 max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
              <h3 className="text-lg font-semibold text-[var(--color-text)] flex items-center gap-2">
                <Shield size={20} className="text-[var(--color-primary)]" />
                Compliance Tracking
              </h3>
              <button onClick={() => setShowCompliance(false)} className="btn-ghost p-1">
                <XCircle size={20} />
              </button>
            </div>
            <div className="p-6 overflow-y-auto max-h-[60vh]">
              <div className="space-y-6">
                <ComplianceSection clientId={client.id} />
                <ProFeatureGate feature="communication_log">
                  <CommunicationLogSection clientId={client.id} />
                </ProFeatureGate>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Edit Client Modal */}
      <ClientFormModal
        isOpen={editModalOpen}
        onClose={() => { setEditModalOpen(false); setHighlightSections([]); }}
        client={client}
        onSave={handleClientSaved}
        onDischarge={() => navigate(`/clients/${client.id}/note/new`, {
          state: { noteMode: 'discharge', standalone: true }
        })}
        highlightSections={highlightSections}
      />

      {/* Goal Modal (for editing single goals) */}
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

      {/* Goal Builder Modal (for adding multiple goals with CLOF/target) */}
      <GoalBuilderModal
        isOpen={goalBuilderOpen}
        onClose={() => setGoalBuilderOpen(false)}
        clientId={clientId}
        discipline={client.discipline}
        onGoalsSaved={() => {
          window.api.goals.listByClient(clientId).then(setGoals).catch(console.error);
        }}
      />

      {/* CMS-1500 Readiness Dialog */}
      <ClaimReadinessDialog
        isOpen={showReadinessDialog}
        onClose={() => setShowReadinessDialog(false)}
        readiness={claimReadiness}
        onGenerate={handleGenerateCMS1500}
        generating={generatingCMS1500}
      />

      {/* Trial Expired Modal */}
      {showExpiredModal && <TrialExpiredModal onClose={dismissExpiredModal} />}
    </div>
  );
};

export default ClientDetailPage;
