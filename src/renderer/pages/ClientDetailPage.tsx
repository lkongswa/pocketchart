import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useLocalPreference } from '../hooks/useLocalPreference';
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
  Lock,
  List,
  LayoutGrid,
  Printer,
  Check,
  Inbox,
  CalendarCheck,
  GripVertical,
  Link2,
} from 'lucide-react';
import type {
  Client,
  ClientStatus,
  ClientDocument,
  ClientDocumentCategory,
  ClientDiscount,
  ContractedEntity,
  Discipline,
  FeeScheduleEntry,
  Note,
  Evaluation,
  Goal,
  GoalStatus,
  GoalProgressEntry,
  Invoice,
  InvoiceStatus,
  Payment,
  PaymentMethod,
  Practice,
  Appointment,
  AppointmentStatus,
  FaxTrackingEntry,
} from '../../shared/types';
import { CLIENT_DOCUMENT_CATEGORY_LABELS, SESSION_TYPE_LABELS, VISIT_TYPE_LABELS } from '../../shared/types';
import ClientFormModal from '../components/ClientFormModal';
import GoalFormModal from '../components/GoalFormModal';
import GoalBuilderModal from '../components/GoalBuilderModal';
import ClientDiscountModal from '../components/ClientDiscountModal';
import ClientDiscountBadge from '../components/ClientDiscountBadge';
import CollapsedGoalCard from '../components/CollapsedGoalCard';
import ExpandedGoalCard from '../components/ExpandedGoalCard';
import { goalToCardData, generateGoalFingerprint } from '../../shared/goal-card-data';
import type { PatternOverride } from '../../shared/types';
import ComplianceSection from '../components/ComplianceSection';
import CommunicationLogSection from '../components/CommunicationLogSection';
import SectionCard from '../components/SectionCard';
import ProFeatureGate from '../components/ProFeatureGate';
import ChartCompleteness from '../components/ChartCompleteness';
import ClaimReadinessDialog from '../components/ClaimReadinessDialog';
import CSVPaymentImportModal from '../components/CSVPaymentImportModal';
import InvoiceModal from '../components/InvoiceModal';
import GoodFaithEstimateModal from '../components/GoodFaithEstimateModal';
import TrialExpiredModal from '../components/TrialExpiredModal';
import FaxSendModal from '../components/FaxSendModal';
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
  stripe: 'Stripe',
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
  good_faith_estimate: 'bg-amber-100 text-amber-700',
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
    return new Date(dateStr + 'T00:00:00').toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
};

/** DOB displayed as compact M/D/YYYY (e.g. 9/3/2019) */
const formatDob = (dateStr: string): string => {
  if (!dateStr) return '--';
  try {
    const d = new Date(dateStr + 'T00:00:00');
    return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`;
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
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [apptStatusFilter, setApptStatusFilter] = useState<'all' | AppointmentStatus>('all');
  const [showAllAppointments, setShowAllAppointments] = useState(false);
  const [appointmentsExpanded, setAppointmentsExpanded] = useState(false);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [goalHistories, setGoalHistories] = useState<Record<number, GoalProgressEntry[]>>({});
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
  const [showActiveGoals, setShowActiveGoals] = useState(false);
  const [headerExpanded, setHeaderExpanded] = useState(false);
  const [showInactiveGoals, setShowInactiveGoals] = useState(false);
  const [goalStatusMenuId, setGoalStatusMenuId] = useState<number | null>(null);
  const [expandedGoalIdx, setExpandedGoalIdx] = useState<number | null>(null); // all goals collapsed by default
  const [patternOverrides, setPatternOverrides] = useState<PatternOverride[]>([]);

  // Billing state
  const [generatingPaymentLink, setGeneratingPaymentLink] = useState<number | null>(null);
  const [checkingPaymentStatus, setCheckingPaymentStatus] = useState<number | null>(null);
  const [billingToast, setBillingToast] = useState<string | null>(null);
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<(Invoice & { items: any[] }) | null>(null);
  const [newlyCreatedInvoice, setNewlyCreatedInvoice] = useState<Invoice | null>(null);
  const [feeSchedule, setFeeSchedule] = useState<FeeScheduleEntry[]>([]);
  const [entities, setEntities] = useState<ContractedEntity[]>([]);
  const [selectedInvoiceIds, setSelectedInvoiceIds] = useState<Set<number>>(new Set());
  const [batchGenerating, setBatchGenerating] = useState(false);
  const [draggedPaymentId, setDraggedPaymentId] = useState<number | null>(null);
  const [draggedInvoiceId, setDraggedInvoiceId] = useState<number | null>(null);
  const [dropTargetInvoiceId, setDropTargetInvoiceId] = useState<number | null>(null);
  const [dropTargetPaymentId, setDropTargetPaymentId] = useState<number | null>(null);
  const [discountsExpanded, setDiscountsExpanded] = useState(false);

  // Discount state
  const [clientDiscounts, setClientDiscounts] = useState<ClientDiscount[]>([]);
  const [activeDiscounts, setActiveDiscounts] = useState<ClientDiscount[]>([]);
  const [showDiscountModal, setShowDiscountModal] = useState(false);

  // Practice + CMS-1500 state
  const [practice, setPractice] = useState<Practice | null>(null);
  const [showReadinessDialog, setShowReadinessDialog] = useState(false);
  const [generatingCMS1500, setGeneratingCMS1500] = useState(false);
  const [showCsvImportForClient, setShowCsvImportForClient] = useState(false);
  const [showGfeModal, setShowGfeModal] = useState(false);
  // Fax modal state
  const [showFaxModal, setShowFaxModal] = useState(false);
  const [faxDocumentId, setFaxDocumentId] = useState<number | undefined>(undefined);
  const [faxDocType, setFaxDocType] = useState<'eval' | 'note' | 'document' | undefined>(undefined);
  const [faxTracking, setFaxTracking] = useState<FaxTrackingEntry[]>([]);
  // CMS-1500 preview removed — now saves directly via dialog

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

  // Remove client (empty chart only)
  const [canRemoveClient, setCanRemoveClient] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [removing, setRemoving] = useState(false);

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

  const routeState = (location.state as { tab?: string; defaultTab?: 'clinical' | 'billing' | 'documents'; invoiceId?: number }) || {};

  // Tab state with context-aware selection
  type ClientTab = 'clinical' | 'billing' | 'documents';
  const [, setSavedTab] = useLocalPreference<ClientTab>('client-detail-tab', 'clinical');
  const [activeTab, setActiveTab] = useState<ClientTab>(
    routeState.defaultTab || 'clinical'
  );
  const handleTabChange = (tab: ClientTab) => {
    setActiveTab(tab);
    setSavedTab(tab);
  };

  // Compact notes mode
  const [notesCompact, setNotesCompact] = useLocalPreference('client-notes-compact', true);

  // Fax tracking: maps eval/note IDs to sent/received-back status
  const evalFaxMap = useMemo(() => {
    const map = new Map<number, { sent: boolean; receivedBack: boolean }>();
    for (const entry of faxTracking) {
      if (entry.eval_id) {
        const existing = map.get(entry.eval_id);
        map.set(entry.eval_id, {
          sent: true,
          receivedBack: (existing?.receivedBack || false) || entry.has_received_back > 0,
        });
      }
    }
    return map;
  }, [faxTracking]);

  const noteFaxMap = useMemo(() => {
    const map = new Map<number, { sent: boolean; receivedBack: boolean }>();
    for (const entry of faxTracking) {
      if (entry.note_id) {
        const existing = map.get(entry.note_id);
        map.set(entry.note_id, {
          sent: true,
          receivedBack: (existing?.receivedBack || false) || entry.has_received_back > 0,
        });
      }
    }
    return map;
  }, [faxTracking]);

  const loadData = useCallback(async () => {
    if (!clientId) return;
    setLoading(true);
    try {
      const [clientData, notesData, evalsData, goalsData, docsData, invoicesData, paymentsData, discountsData, activeDiscountsData, practiceData, feeScheduleData, entitiesData, appointmentsData, faxTrackingData] = await Promise.all([
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
        window.api.feeSchedule.list().catch(() => []),
        window.api.contractedEntities.list().catch(() => []),
        window.api.appointments.list({ clientId }).catch(() => []),
        window.api.fax.getOutboundByClient(clientId).catch(() => []),
      ]);
      setClient(clientData);
      setPractice(practiceData);
      setNotes(notesData || []);
      setEvaluations(evalsData || []);
      setAppointments(appointmentsData || []);
      setFaxTracking(faxTrackingData || []);
      setGoals(goalsData || []);
      // Load progress histories for all goals
      if (goalsData?.length) {
        try {
          const goalIds = goalsData.map((g: Goal) => g.id);
          const histories = await window.api.goals.getProgressHistoryBatch(goalIds);
          setGoalHistories(histories);
        } catch { /* not critical */ }
      }
      // Load pattern overrides for goal card display
      window.api.patternOverrides.list().then(setPatternOverrides).catch(() => {});
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
      setFeeSchedule(feeScheduleData || []);
      setEntities(entitiesData || []);
    } catch (err) {
      console.error('Failed to load client data:', err);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Check if this client can be removed (empty chart only)
  useEffect(() => {
    if (!clientId) return;
    window.api.clients.canRemove(clientId).then((result) => {
      setCanRemoveClient(result.canRemove);
    }).catch(() => setCanRemoveClient(false));
  }, [clientId, notes, evaluations, appointments, goals]);

  const handleRemoveClient = async () => {
    if (!clientId) return;
    setRemoving(true);
    try {
      await window.api.clients.remove(clientId);
      navigate('/clients');
    } catch (err) {
      console.error('Failed to remove client:', err);
    } finally {
      setRemoving(false);
      setConfirmRemove(false);
    }
  };

  // Listen for background payment status updates
  useEffect(() => {
    const handler = () => loadData();
    window.addEventListener('pocketchart:payments-received', handler);
    return () => window.removeEventListener('pocketchart:payments-received', handler);
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

  const handleMatchPaymentToInvoice = async (paymentId: number, invoiceId: number) => {
    try {
      const payment = payments.find(p => p.id === paymentId);
      if (!payment) return;
      await window.api.payments.update(paymentId, { invoice_id: invoiceId, notes: payment.notes });
      const invoicePayments = payments.filter(p => (p as any).invoice_id === invoiceId).reduce((sum, p) => sum + p.amount, 0) + payment.amount;
      const invoice = invoices.find(i => i.id === invoiceId);
      if (invoice) {
        const newStatus = invoicePayments >= invoice.total_amount ? 'paid' : invoicePayments > 0 ? 'partial' : invoice.status;
        if (newStatus !== invoice.status) {
          await window.api.invoices.update(invoiceId, { status: newStatus });
        }
      }
      loadData();
      setBillingToast('Payment matched to invoice');
    } catch (err) {
      console.error('Failed to match payment:', err);
      setBillingToast('Failed to match payment');
    }
  };

  const handleUnmatchPayment = async (paymentId: number) => {
    try {
      const payment = payments.find(p => p.id === paymentId);
      if (!payment || !(payment as any).invoice_id) return;
      const invId = (payment as any).invoice_id;
      await window.api.payments.update(paymentId, { invoice_id: null, notes: payment.notes });
      const remainingTotal = payments
        .filter(p => (p as any).invoice_id === invId && p.id !== paymentId)
        .reduce((sum, p) => sum + p.amount, 0);
      const invoice = invoices.find(i => i.id === invId);
      if (invoice) {
        const newStatus = remainingTotal >= invoice.total_amount ? 'paid' : remainingTotal > 0 ? 'partial' : 'sent';
        if (newStatus !== invoice.status) {
          await window.api.invoices.update(invId, { status: newStatus });
        }
      }
      loadData();
      setBillingToast('Payment unmatched');
    } catch (err) {
      console.error('Failed to unmatch payment:', err);
      setBillingToast('Failed to unmatch payment');
    }
  };

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

  const handleGenerateAndCopyPaymentLink = async (invoiceId: number) => {
    setGeneratingPaymentLink(invoiceId);
    try {
      const result = await window.api.stripe.createPaymentLink(invoiceId);
      if (result.url) {
        await navigator.clipboard.writeText(result.url);
        setBillingToast(result.existing
          ? 'Payment link copied to clipboard'
          : 'Payment link created and copied to clipboard');
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

  const handleBatchGeneratePaymentLinks = async () => {
    if (selectedInvoiceIds.size === 0) return;
    setBatchGenerating(true);
    let successCount = 0;
    let failCount = 0;
    const links: string[] = [];

    for (const invoiceId of selectedInvoiceIds) {
      try {
        const result = await window.api.stripe.createPaymentLink(invoiceId);
        if (result.url) {
          links.push(result.url);
          successCount++;
        }
      } catch {
        failCount++;
      }
    }

    if (links.length > 0) {
      await navigator.clipboard.writeText(links.join('\n'));
    }

    const invoicesData = await window.api.invoices.list({ clientId });
    setInvoices(invoicesData);
    setSelectedInvoiceIds(new Set());
    setBatchGenerating(false);

    if (failCount > 0) {
      setBillingToast(`Generated ${successCount} links, ${failCount} failed. Links copied.`);
    } else {
      setBillingToast(`${successCount} payment link${successCount > 1 ? 's' : ''} generated and copied to clipboard`);
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
      // Open in system PDF viewer for preview
      await window.api.cms1500.openPreview(result);
      setBillingToast('Claim form opened for preview');
    } catch (err: any) {
      console.error('Failed to generate claim form:', err);
      setBillingToast(err.message || 'Failed to generate claim form');
    } finally {
      setGeneratingCMS1500(false);
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

  // Appointments missing notes — past, non-cancelled, no linked note
  const today = new Date();
  const noteIdSet = new Set(notes.map(n => n.id));
  const missingNoteAppts = appointments.filter(appt => {
    if (appt.status === 'cancelled') return false;
    if (appt.note_id && noteIdSet.has(appt.note_id)) return false;
    const apptDate = new Date(appt.scheduled_date + 'T00:00:00');
    return apptDate <= today;
  });

  // Goal partitions: established (part of signed docs) vs pending (informal)
  const isEstablishedGoal = (g: Goal) => g.source_document_id != null;
  const establishedActive = goals.filter(g => g.status === 'active' && isEstablishedGoal(g));
  const pendingActive = goals.filter(g => g.status === 'active' && !isEstablishedGoal(g));
  const establishedInactive = goals.filter(g => g.status !== 'active' && isEstablishedGoal(g));
  const pendingInactive = goals.filter(g => g.status !== 'active' && !isEstablishedGoal(g));
  const inactiveGoals = [...establishedInactive, ...pendingInactive];

  // Build card data for active goals (established first, then pending)
  const allActiveGoals = [...establishedActive, ...pendingActive];
  const activeGoalCards = allActiveGoals.map((goal, idx) =>
    goalToCardData(goal, idx, goalHistories[goal.id] || [], patternOverrides)
  );

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

      {/* ══════════ HEADER CARD — COMPACT BY DEFAULT ══════════ */}
      <div className="card p-4">
        {/* Compact Header Row: Avatar + Name + Badges + Details Toggle + Actions */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-full bg-gradient-to-br from-teal-400 to-teal-600 flex items-center justify-center text-white text-sm font-bold shrink-0">
              {client.first_name[0]}{client.last_name[0]}
            </div>
            <h1 className="text-xl font-bold text-[var(--color-text)]">
              {client.first_name} {client.last_name}
            </h1>
            <span className={statusBadgeClass[client.status]}>{statusLabel[client.status]}</span>
            <span className={disciplineBadgeClass[client.discipline]}>{client.discipline}</span>
            <button
              className="btn-ghost btn-sm gap-1 text-[var(--color-text-secondary)]"
              onClick={() => setHeaderExpanded(!headerExpanded)}
            >
              {headerExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
              {headerExpanded ? 'Less' : 'Details'}
            </button>
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
            {canRemoveClient && (
              !confirmRemove ? (
                <button
                  className="btn-ghost btn-sm gap-1.5 text-red-500 hover:bg-red-50"
                  onClick={() => setConfirmRemove(true)}
                  title="Remove this client (no clinical records exist)"
                >
                  <Trash2 size={14} /> Remove
                </button>
              ) : (
                <span className="flex items-center gap-1.5 text-xs">
                  <span className="text-red-600 font-medium">Remove client?</span>
                  <button
                    className="btn-ghost btn-sm text-red-600 font-semibold hover:bg-red-50"
                    onClick={handleRemoveClient}
                    disabled={removing}
                  >
                    {removing ? 'Removing...' : 'Yes'}
                  </button>
                  <button
                    className="btn-ghost btn-sm text-[var(--color-text-secondary)]"
                    onClick={() => setConfirmRemove(false)}
                  >
                    No
                  </button>
                </span>
              )
            )}
          </div>
        </div>

        {/* Expanded Details: DOB, Phone, Email */}
        {headerExpanded && (
          <div className="flex items-center gap-4 text-sm text-[var(--color-text-secondary)] mt-3 ml-13 pl-0.5">
            {client.dob && (
              <span className="flex items-center gap-1"><Calendar size={13} /> {formatDob(client.dob)}</span>
            )}
            {client.phone && (
              <span className="flex items-center gap-1"><Phone size={13} /> {client.phone}</span>
            )}
            {client.email && (
              <span className="flex items-center gap-1"><Mail size={13} /> {client.email}</span>
            )}
            {client.address && (
              <span className="flex items-center gap-1"><MapPin size={13} /> {client.address}</span>
            )}
          </div>
        )}

        {/* Compact completeness strip (always visible) */}
        <div className="flex items-center gap-3 mt-3 flex-wrap">
          {[
            { label: 'Demographics', complete: demographicsComplete, color: 'blue' },
            { label: 'Diagnosis', complete: diagnosisComplete, color: 'violet' },
            { label: 'Referral', complete: referringComplete, color: 'amber' },
            { label: 'Compliance', complete: true, color: 'teal' },
            { label: 'Insurance', complete: insuranceComplete, color: 'emerald' },
            { label: 'Docs', complete: documents.length > 0, color: 'slate' },
            { label: 'Claims', complete: claimInfoComplete, color: 'violet' },
          ].map(({ label, complete, color }) => (
            <span key={label} className="flex items-center gap-1 text-xs text-[var(--color-text-secondary)]">
              <span className={`w-2 h-2 rounded-full ${complete ? `bg-${color}-500` : 'bg-gray-300'}`} />
              {label}
            </span>
          ))}
        </div>

        {/* Expanded: Full CollapsibleInfo sections */}
        {headerExpanded && (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
              <CollapsibleInfo
                icon={<User size={14} />}
                title="Demographics"
                isComplete={demographicsComplete}
                onEdit={() => setEditModalOpen(true)}
                color="blue"
              >
                <div className="flex justify-between"><span className="text-[var(--color-text-secondary)]">DOB</span><span>{formatDob(client.dob)}</span></div>
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
                <div className="flex justify-between"><span className="text-[var(--color-text-secondary)]">Fax</span><span>{client.referring_fax || '--'}</span></div>
              </CollapsibleInfo>

              <CollapsibleInfo
                icon={<Shield size={14} />}
                title="Doc Compliance"
                isComplete={true}
                color="teal"
              >
                <p className="text-xs text-[var(--color-text-secondary)]">Note frequency, recertification dates & progress report alerts</p>
                <button className="mt-2 text-xs text-[var(--color-primary)] hover:underline" onClick={() => handleTabChange('clinical')}>
                  View Details
                </button>
              </CollapsibleInfo>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-3">
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
                <button className="mt-2 text-xs text-[var(--color-primary)] hover:underline flex items-center gap-1" onClick={() => handleTabChange('documents')}>
                  <Upload size={10} /> Manage Documents
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
          </>
        )}
      </div>

      {/* ══════════ COMPLIANCE BANNER ══════════ */}
      {(() => {
        const bannerItems: { label: string; color: 'amber' | 'red'; onClick?: () => void }[] = [];
        if (unsignedNotes.length > 0) {
          bannerItems.push({ label: `${unsignedNotes.length} unsigned note${unsignedNotes.length > 1 ? 's' : ''}`, color: 'amber' });
        }
        if (bannerItems.length === 0) return null;
        return (
          <div className="flex items-center gap-2 px-4 py-2.5 rounded-lg bg-amber-50 border border-amber-200">
            <AlertCircle size={16} className="text-amber-500 shrink-0" />
            <span className="text-sm text-amber-700">
              {bannerItems.map(b => b.label).join(' | ')}
            </span>
          </div>
        );
      })()}

      {/* ══════════ TAB BAR ══════════ */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
        {([
          { key: 'clinical' as ClientTab, label: 'Clinical', icon: <FileText size={15} />, badge: unsignedNotes.length },
          { key: 'billing' as ClientTab, label: 'Billing', icon: <DollarSign size={15} />, badge: invoices.filter(i => i.status !== 'paid' && i.status !== 'void').length },
          { key: 'documents' as ClientTab, label: 'Documents', icon: <FolderOpen size={15} />, badge: documents.length },
        ]).map((tab) => (
          <button
            key={tab.key}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
              activeTab === tab.key
                ? 'bg-white text-[var(--color-primary)] shadow-sm'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
            }`}
            onClick={() => handleTabChange(tab.key)}
          >
            {tab.icon}
            {tab.label}
            {tab.badge > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                activeTab === tab.key ? 'bg-gray-100 text-gray-600' : 'bg-gray-200 text-gray-600'
              }`}>
                {tab.badge}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* ══════════ CLINICAL TAB ══════════ */}
      {activeTab === 'clinical' && <>

      {/* ══════════ TWO COLUMN: CLINICAL DATA ══════════ */}
      <div className="grid grid-cols-12 gap-6">
        {/* LEFT COLUMN: Recert + Evaluations + Goals (5 cols) */}
        <div className="col-span-5 space-y-6">
          {/* Recertification compliance card — anchored above evals */}
          <ComplianceSection clientId={clientId} card="recert" />

          {/* Evaluations */}
          <SectionCard
            color="violet"
            icon={<ClipboardList size={18} />}
            title="Evaluations"
            count={evaluations.length}
            actions={<div className="flex items-center gap-2">
                {evaluations.some(e => e.signed_at) && (
                  <button
                    className="btn-secondary btn-sm gap-1.5"
                    onClick={() => { if (guardAction()) navigate(`/clients/${clientId}/eval/new`, { state: { reassessment: true } }); }}
                  >
                    <RefreshCw size={14} /> Reassessment
                  </button>
                )}
                <button
                  className="btn-primary btn-sm gap-1.5"
                  onClick={() => { if (guardAction()) navigate(`/clients/${clientId}/eval/new`); }}
                >
                  <Plus size={14} /> New Eval
                </button>
              </div>}
          >
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
                        <>
                          <span className="flex items-center gap-1 text-xs text-emerald-600">
                            <CheckCircle size={12} /> Signed
                          </span>
                          <button
                            className="btn-ghost btn-sm text-xs px-1.5 py-0.5 text-[var(--color-text-secondary)] hover:text-violet-600"
                            title="Fax to Physician"
                            onClick={(e) => { e.stopPropagation(); setFaxDocumentId(evalItem.id); setFaxDocType('eval'); setShowFaxModal(true); }}
                          >
                            <Printer size={12} />
                          </button>
                          {evalFaxMap.get(evalItem.id)?.sent && (
                            <span className="flex items-center gap-0.5 text-[10px] text-green-600" title="Faxed">
                              <Check size={10} /> Sent
                            </span>
                          )}
                          {evalFaxMap.get(evalItem.id)?.receivedBack && (
                            <span className="flex items-center gap-0.5 text-[10px] text-blue-600" title="Signed copy received back">
                              <Inbox size={10} /> Received
                            </span>
                          )}
                        </>
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
          </SectionCard>

          {/* Goals */}
          <SectionCard
            color="amber"
            icon={<Target size={18} />}
            title="Goals"
            count={goals.length}
            badge={establishedActive.length > 0 ? <span className="text-xs text-[var(--color-text-secondary)]">{establishedActive.length} established{pendingActive.length > 0 ? `, ${pendingActive.length} pending` : ''}</span> : undefined}
            actions={<button className="btn-primary btn-sm gap-1.5" onClick={() => { if (guardAction()) openAddGoal(); }}>
                <Plus size={14} /> Add Goal
              </button>}
          >
            {goals.length === 0 ? (
              <div className="p-6 text-center text-sm text-[var(--color-text-secondary)]">
                No goals set yet. Add one to track progress.
              </div>
            ) : (
              <>
                {/* ── Active Goals Accordion ── */}
                {allActiveGoals.length > 0 && (
                  <div>
                    <button
                      className="w-full flex items-center gap-2 px-4 py-2.5 text-xs font-medium text-[var(--color-text-secondary)] hover:bg-gray-50 transition-colors"
                      onClick={() => setShowActiveGoals(!showActiveGoals)}
                    >
                      {showActiveGoals ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                      Active Goals ({allActiveGoals.length})
                    </button>
                    {showActiveGoals && (
                    <div className="p-3 pt-0 space-y-2">
                    {activeGoalCards.map((card, idx) => {
                      const goal = allActiveGoals[idx];
                      const isEstablished = isEstablishedGoal(goal);
                      return expandedGoalIdx === idx ? (
                        <ExpandedGoalCard
                          key={goal.id}
                          data={card}
                          discipline={client.discipline}
                          patternOverrides={patternOverrides}
                          disabled={isEstablished}
                          onCollapse={() => setExpandedGoalIdx(null)}
                          onFieldChange={() => {}}
                          onComponentChange={() => {}}
                          onDelete={!isEstablished ? async () => {
                            if (!window.confirm('Delete this goal? This action cannot be undone.')) return;
                            try {
                              await window.api.goals.delete(goal.id);
                              const updatedGoals = await window.api.goals.listByClient(clientId);
                              setGoals(updatedGoals);
                              setExpandedGoalIdx(null);
                            } catch (err) {
                              console.error('Failed to delete goal:', err);
                            }
                          } : undefined}
                          onStatusChange={async (status) => {
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
                          onFlagCheckpoint={async () => {
                            try {
                              await window.api.stagedGoals.create({
                                client_id: clientId,
                                goal_text: goal.goal_text,
                                goal_type: goal.goal_type,
                                category: goal.category || '',
                                rationale: '',
                                flagged_from_note_id: undefined,
                              });
                            } catch (err) {
                              console.error('Failed to flag goal for checkpoint:', err);
                            }
                          }}
                          onEditModal={!isEstablished ? () => openEditGoal(goal) : undefined}
                        />
                      ) : (
                        <CollapsedGoalCard
                          key={goal.id}
                          data={card}
                          fingerprint={generateGoalFingerprint(card.pattern_id, card.components, card.category)}
                          onClick={() => setExpandedGoalIdx(idx)}
                        />
                      );
                    })}
                  </div>
                    )}
                  </div>
                )}

                {/* ── Inactive Goals — collapsed section ── */}
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
                          const established = isEstablishedGoal(goal);
                          return (
                            <div key={goal.id} className={`px-4 py-2.5 opacity-75 ${established ? 'border-l-2 border-blue-200' : 'border-l-2 border-amber-200'}`}>
                              <div className="flex items-start justify-between gap-3">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5 mb-0.5">
                                    {established && <Lock size={9} className="text-blue-400" />}
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
                                {!established && (
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
                                )}
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
          </SectionCard>
        </div>

        {/* RIGHT COLUMN: Progress Report + SOAP Notes (7 cols) */}
        <div className="col-span-7 space-y-6">
          {/* Progress Report compliance card — anchored above notes */}
          <ComplianceSection clientId={clientId} card="progress" />

          {/* Appointments missing notes */}
          {missingNoteAppts.length > 0 && (
            <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 overflow-hidden">
              <div className="flex items-center gap-2 px-3 py-2">
                <CalendarCheck size={14} className="text-amber-600 shrink-0" />
                <span className="text-xs font-medium text-amber-800">
                  {missingNoteAppts.length} appointment{missingNoteAppts.length !== 1 ? 's' : ''} missing notes
                </span>
              </div>
              <div className="divide-y divide-amber-200">
                {missingNoteAppts.slice(0, 5).map((appt) => (
                  <div
                    key={appt.id}
                    className="flex items-center gap-3 px-3 py-1.5 hover:bg-amber-100/50 cursor-pointer transition-colors"
                    onClick={() => navigate(`/clients/${clientId}/note/new`, {
                      state: {
                        appointmentDate: appt.scheduled_date,
                        appointmentTime: appt.scheduled_time,
                        appointmentDuration: appt.duration_minutes,
                      }
                    })}
                  >
                    <div className="w-1 h-4 rounded-full bg-amber-400 shrink-0" />
                    <span className="text-xs text-amber-900">{formatDate(appt.scheduled_date)}</span>
                    {appt.scheduled_time && (
                      <span className="text-xs text-amber-700">
                        {new Date(`2000-01-01T${appt.scheduled_time}`).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                      </span>
                    )}
                    <span className="text-[10px] text-amber-600 ml-auto">+ Create Note</span>
                  </div>
                ))}
                {missingNoteAppts.length > 5 && (
                  <div className="px-3 py-1.5 text-[10px] text-amber-600">
                    +{missingNoteAppts.length - 5} more
                  </div>
                )}
              </div>
            </div>
          )}

          <SectionCard
            color="blue"
            icon={<FileText size={18} />}
            title="SOAP Notes"
            count={notes.length}
            badge={unsignedNotes.length > 0 ? <span className="badge bg-red-100 text-red-600 text-xs">{unsignedNotes.length} unsigned</span> : undefined}
            actions={
              <div className="flex items-center gap-2">
                <div className="flex items-center bg-gray-100 rounded-md p-0.5">
                  <button
                    className={`p-1 rounded ${notesCompact ? 'bg-white shadow-sm text-[var(--color-text)]' : 'text-[var(--color-text-secondary)]'}`}
                    onClick={() => setNotesCompact(true)}
                    title="Compact view"
                  >
                    <List size={14} />
                  </button>
                  <button
                    className={`p-1 rounded ${!notesCompact ? 'bg-white shadow-sm text-[var(--color-text)]' : 'text-[var(--color-text-secondary)]'}`}
                    onClick={() => setNotesCompact(false)}
                    title="Detailed view"
                  >
                    <LayoutGrid size={14} />
                  </button>
                </div>
                <button
                  className="btn-primary btn-sm gap-1.5"
                  onClick={() => { if (guardAction()) navigate(`/clients/${clientId}/note/new`); }}
                >
                  <Plus size={14} /> New Note
                </button>
              </div>
            }
          >
            {notes.length === 0 ? (
              <div className="p-8 text-center text-sm text-[var(--color-text-secondary)]">
                No SOAP notes yet. Create one to get started.
              </div>
            ) : notesCompact ? (
              <div className="divide-y divide-[var(--color-border)]">
                {displayNotes.map((note) => {
                  let cptCode = '';
                  try {
                    const parsed = JSON.parse(note.cpt_codes || '[]');
                    if (Array.isArray(parsed) && parsed.length > 0) cptCode = parsed[0].code;
                  } catch {}
                  if (!cptCode && note.cpt_code) cptCode = note.cpt_code;
                  return (
                    <div
                      key={note.id}
                      className="flex items-center gap-2 px-4 py-2 hover:bg-gray-50 cursor-pointer transition-colors text-xs"
                      onClick={() => navigate(`/clients/${clientId}/note/${note.id}`)}
                    >
                      <span className="text-[var(--color-text)] font-medium shrink-0">{formatDate(note.date_of_service)}</span>
                      <span className="text-[var(--color-text-secondary)]">&middot;</span>
                      <span className="text-[var(--color-text-secondary)]">SOAP</span>
                      {cptCode && <>
                        <span className="text-[var(--color-text-secondary)]">&middot;</span>
                        <span className="text-[var(--color-text-secondary)]">{cptCode}</span>
                      </>}
                      <span className="text-[var(--color-text-secondary)]">&middot;</span>
                      {note.signed_at ? (
                        <span className="text-emerald-600 flex items-center gap-0.5"><CheckCircle size={10} /> Signed</span>
                      ) : (
                        <span className="text-amber-600">Draft</span>
                      )}
                      <span className="flex-1" />
                      {note.signed_at && (
                        <>
                          <button
                            className="p-0.5 btn-ghost text-[var(--color-text-secondary)] hover:text-violet-600"
                            title="Fax to Physician"
                            onClick={(e) => { e.stopPropagation(); setFaxDocumentId(note.id); setFaxDocType('note'); setShowFaxModal(true); }}
                          >
                            <Printer size={11} />
                          </button>
                          {noteFaxMap.get(note.id)?.sent && (
                            <span className="text-green-600" title="Faxed"><Check size={10} /></span>
                          )}
                          {noteFaxMap.get(note.id)?.receivedBack && (
                            <span className="text-blue-600" title="Signed copy received"><Inbox size={10} /></span>
                          )}
                        </>
                      )}
                      {!note.signed_at && (
                        <button
                          className={`p-0.5 ${deletingNoteId === note.id ? 'bg-red-600 text-white rounded' : 'btn-ghost text-red-500'}`}
                          onClick={(e) => { e.stopPropagation(); handleDeleteNote(note.id); }}
                        >
                          <Trash2 size={11} />
                        </button>
                      )}
                    </div>
                  );
                })}
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
                          <>
                            <span className="flex items-center gap-1 text-xs text-emerald-600">
                              <CheckCircle size={12} /> Signed
                            </span>
                            <button
                              className="btn-ghost btn-sm text-xs px-1.5 py-0.5 text-[var(--color-text-secondary)] hover:text-violet-600"
                              title="Fax to Physician"
                              onClick={(e) => { e.stopPropagation(); setFaxDocumentId(note.id); setFaxDocType('note'); setShowFaxModal(true); }}
                            >
                              <Printer size={12} />
                            </button>
                            {noteFaxMap.get(note.id)?.sent && (
                              <span className="flex items-center gap-0.5 text-[10px] text-green-600" title="Faxed">
                                <Check size={10} /> Sent
                              </span>
                            )}
                            {noteFaxMap.get(note.id)?.receivedBack && (
                              <span className="flex items-center gap-0.5 text-[10px] text-blue-600" title="Signed copy received back">
                                <Inbox size={10} /> Received
                              </span>
                            )}
                          </>
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
          </SectionCard>
        </div>
      </div>

      {/* ══════════ APPOINTMENTS ══════════ */}
      {(() => {
        const filteredAppts = apptStatusFilter === 'all'
          ? appointments
          : appointments.filter(a => a.status === apptStatusFilter);
        const displayAppts = showAllAppointments ? filteredAppts : filteredAppts.slice(0, 10);
        const statusCounts = appointments.reduce((acc, a) => { acc[a.status] = (acc[a.status] || 0) + 1; return acc; }, {} as Record<string, number>);
        const fmt12 = (t: string) => { const [h, m] = t.split(':'); const hr = parseInt(h, 10); return `${hr === 0 ? 12 : hr > 12 ? hr - 12 : hr}:${m} ${hr >= 12 ? 'PM' : 'AM'}`; };
        const statusBadge = (s: AppointmentStatus) => {
          const map: Record<AppointmentStatus, { bg: string; text: string; label: string }> = {
            scheduled: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Scheduled' },
            completed: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Attended' },
            cancelled: { bg: 'bg-gray-100', text: 'text-gray-500', label: 'Cancelled' },
            'no-show': { bg: 'bg-red-100', text: 'text-red-600', label: 'No-Show' },
          };
          const c = map[s];
          return <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${c.bg} ${c.text}`}>{c.label}</span>;
        };
        const filterChips: Array<{ value: 'all' | AppointmentStatus; label: string }> = [
          { value: 'all', label: `All (${appointments.length})` },
          { value: 'scheduled', label: `Scheduled (${statusCounts.scheduled || 0})` },
          { value: 'completed', label: `Attended (${statusCounts.completed || 0})` },
          { value: 'cancelled', label: `Cancelled (${statusCounts.cancelled || 0})` },
          { value: 'no-show', label: `No-Show (${statusCounts['no-show'] || 0})` },
        ];
        return (
          <SectionCard
            color="teal"
            icon={<Calendar size={18} />}
            title="Appointments"
            count={appointments.length}
            collapsible
            expanded={appointmentsExpanded}
            onToggle={setAppointmentsExpanded}
          >
            {/* Filter chips */}
            <div className="flex items-center gap-1.5 px-4 py-2 border-b border-[var(--color-border)] bg-gray-50/50">
              {filterChips.map(chip => (
                <button
                  key={chip.value}
                  className={`text-xs px-2.5 py-1 rounded-full font-medium transition-colors ${
                    apptStatusFilter === chip.value
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'bg-white text-[var(--color-text-secondary)] border border-[var(--color-border)] hover:bg-gray-100'
                  }`}
                  onClick={() => setApptStatusFilter(chip.value)}
                >
                  {chip.label}
                </button>
              ))}
            </div>
            {filteredAppts.length === 0 ? (
              <div className="p-8 text-center text-sm text-[var(--color-text-secondary)]">
                {appointments.length === 0 ? 'No appointments yet.' : 'No appointments match this filter.'}
              </div>
            ) : (
              <div className="divide-y divide-[var(--color-border)]">
                {displayAppts.map(appt => {
                  const sessionType = (appt.session_type || 'visit') as keyof typeof SESSION_TYPE_LABELS;
                  const visitType = appt.visit_type as keyof typeof VISIT_TYPE_LABELS | undefined;
                  return (
                    <div
                      key={appt.id}
                      className={`flex items-center justify-between px-4 py-3 hover:bg-gray-50 transition-colors ${
                        appt.note_id || appt.evaluation_id ? 'cursor-pointer' : ''
                      }`}
                      onClick={() => {
                        if (appt.evaluation_id) navigate(`/clients/${clientId}/eval/${appt.evaluation_id}`);
                        else if (appt.note_id) navigate(`/clients/${clientId}/note/${appt.note_id}`);
                      }}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className="text-sm font-medium text-[var(--color-text)] w-24 shrink-0">
                          {formatDate(appt.scheduled_date)}
                        </span>
                        <span className="text-xs text-[var(--color-text-secondary)] w-16 shrink-0">
                          {appt.scheduled_time ? fmt12(appt.scheduled_time) : ''}
                        </span>
                        <span className="badge bg-gray-100 text-gray-600 text-xs">
                          {appt.duration_minutes}m
                        </span>
                        {sessionType !== 'visit' && (
                          <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${
                            sessionType === 'eval' ? 'bg-violet-200 text-violet-700' : 'bg-amber-200 text-amber-700'
                          }`}>
                            {sessionType === 'eval' ? 'Eval' : 'Recert'}
                          </span>
                        )}
                        {visitType && (
                          <span className="text-xs text-[var(--color-text-tertiary)]">
                            {VISIT_TYPE_LABELS[visitType] || visitType}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {statusBadge(appt.status)}
                        {appt.note_id && (
                          <span className="text-xs text-emerald-500" title="Note linked">
                            <FileText size={13} />
                          </span>
                        )}
                        {appt.evaluation_id && (
                          <span className="text-xs text-violet-500" title="Eval linked">
                            <ClipboardList size={13} />
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            {filteredAppts.length > 10 && (
              <button
                className="w-full py-2 text-xs text-[var(--color-primary)] font-medium hover:bg-gray-50 flex items-center justify-center gap-1"
                onClick={() => setShowAllAppointments(!showAllAppointments)}
              >
                {showAllAppointments ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                {showAllAppointments ? 'Show less' : `Show all ${filteredAppts.length} appointments`}
              </button>
            )}
          </SectionCard>
        );
      })()}

      {/* Communication Log */}
      <ProFeatureGate feature="communication_log">
        <CommunicationLogSection clientId={clientId} />
      </ProFeatureGate>

      </>}

      {/* ══════════ BILLING TAB ══════════ */}
      {activeTab === 'billing' && <>

      {/* ══════════ DISCOUNTS & PACKAGES (collapsible) ══════════ */}
      <div className="rounded-lg border border-[var(--color-border)] overflow-hidden">
        <button
          className="w-full flex items-center justify-between px-4 py-2.5 bg-gray-50 hover:bg-gray-100 transition-colors"
          onClick={() => setDiscountsExpanded(!discountsExpanded)}
        >
          <div className="flex items-center gap-2">
            {discountsExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            <DollarSign size={14} className="text-emerald-600" />
            <span className="text-xs font-semibold text-[var(--color-text)]">Discounts & Packages</span>
            {activeDiscounts.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700">
                {activeDiscounts.length} active
              </span>
            )}
          </div>
          <button
            className="btn-ghost btn-sm text-xs gap-1"
            onClick={(e) => { e.stopPropagation(); setShowDiscountModal(true); }}
          >
            <Plus size={12} /> Add
          </button>
        </button>
        {discountsExpanded && (
          <div className="p-4 border-t border-[var(--color-border)]">
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
        )}
      </div>

      {/* ══════════ FULL-WIDTH: BILLING SECTION ══════════ */}
      <SectionCard
        color="emerald"
        icon={<Receipt size={18} />}
        title="Billing & Payments"
        actions={
          <div className="flex items-center gap-2">
            <button
              className="btn-primary btn-sm gap-1.5"
              onClick={() => { if (guardAction()) setShowInvoiceModal(true); }}
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
              className="btn-ghost btn-sm gap-1.5"
              onClick={() => { if (guardAction()) setShowCsvImportForClient(true); }}
            >
              <Upload size={14} /> Import CSV
            </button>
            <button
              className="btn-secondary btn-sm gap-1.5"
              onClick={() => navigate(`/clients/${clientId}/superbill`)}
            >
              <FileText size={14} /> Superbill
            </button>
            <button
              className="btn-secondary btn-sm gap-1.5"
              onClick={() => { if (guardAction()) setShowGfeModal(true); }}
            >
              <Shield size={14} /> GFE
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
              Claim Preview
              {claimReadiness.ready && signedNotes.length > 0 && (
                <span className="w-2 h-2 rounded-full bg-emerald-400" />
              )}
              {!claimReadiness.ready && (
                <span className="w-2 h-2 rounded-full bg-red-400" />
              )}
            </button>
          </div>
        }
      >

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

          {/* Post-invoice payment link prompt banner */}
          {newlyCreatedInvoice && (
            <div className="mb-4 rounded-lg p-4 border border-green-200 bg-green-50 flex items-center justify-between">
              <div>
                <p className="text-sm font-medium text-green-800">
                  Invoice {newlyCreatedInvoice.invoice_number} created &mdash; ${newlyCreatedInvoice.total_amount.toFixed(2)}
                </p>
                <p className="text-xs text-green-600">Send a payment link to collect now?</p>
              </div>
              <div className="flex gap-2">
                <button
                  className="btn-primary btn-sm gap-1"
                  onClick={async () => {
                    await handleGenerateAndCopyPaymentLink(newlyCreatedInvoice.id);
                    setNewlyCreatedInvoice(null);
                  }}
                  disabled={generatingPaymentLink === newlyCreatedInvoice.id}
                >
                  {generatingPaymentLink === newlyCreatedInvoice.id ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <CreditCard size={14} />
                  )}
                  Generate & Copy Link
                </button>
                <button
                  className="btn-ghost btn-sm"
                  onClick={() => setNewlyCreatedInvoice(null)}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

          {/* Batch action bar for invoices */}
          {selectedInvoiceIds.size > 0 && (
            <div className="mb-4 rounded-lg p-3 flex items-center justify-between bg-blue-50 border border-blue-200">
              <span className="text-sm font-medium text-blue-800">
                {selectedInvoiceIds.size} invoice{selectedInvoiceIds.size > 1 ? 's' : ''} selected
              </span>
              <div className="flex gap-2">
                <button
                  className="btn-primary btn-sm gap-1"
                  onClick={handleBatchGeneratePaymentLinks}
                  disabled={batchGenerating}
                >
                  {batchGenerating ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <ExternalLink size={14} />
                  )}
                  Generate & Copy {selectedInvoiceIds.size > 1 ? 'Links' : 'Link'}
                </button>
                <button
                  className="btn-ghost btn-sm"
                  onClick={() => setSelectedInvoiceIds(new Set())}
                >
                  Clear
                </button>
              </div>
            </div>
          )}

          {/* ── Two-Column: Invoices | Payments (drag payment → invoice) ── */}
          {draggedPaymentId && (
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-xs text-blue-700 mb-2">
              <Link2 size={12} /> Drop on an unpaid invoice to match
            </div>
          )}
          <div className="grid grid-cols-2 gap-4">

            {/* LEFT: Invoices (drop targets for payments) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">Invoices</h4>
                <button className="text-xs text-[var(--color-primary)] hover:underline" onClick={() => navigate('/billing?tab=invoices')}>
                  View All
                </button>
              </div>
              {invoices.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--color-border)] p-4 text-center text-xs text-[var(--color-text-secondary)]">
                  No invoices yet.
                </div>
              ) : (
                <div className="rounded-lg border border-[var(--color-border)] divide-y divide-[var(--color-border)] overflow-hidden">
                  {invoices.slice(0, 6).map((invoice) => {
                    const isUnpaid = invoice.status !== 'paid' && invoice.status !== 'void';
                    const isOverdue = invoice.status === 'overdue';
                    const isDropTarget = draggedPaymentId && isUnpaid;
                    const isHovered = dropTargetInvoiceId === invoice.id;
                    const rowAccent = isHovered
                      ? 'border-l-4 border-l-blue-500 bg-blue-50 ring-2 ring-blue-300'
                      : isOverdue
                        ? 'border-l-4 border-l-red-400 bg-red-50/40'
                        : isUnpaid
                          ? 'border-l-4 border-l-amber-400 bg-amber-50/30'
                          : 'border-l-4 border-l-emerald-400';
                    return (
                      <div
                        key={invoice.id}
                        className={`flex items-center justify-between px-3 py-2.5 hover:bg-gray-50 ${rowAccent}`}
                        onDragOver={isDropTarget ? (e) => {
                          e.preventDefault();
                          setDropTargetInvoiceId(invoice.id);
                        } : undefined}
                        onDragLeave={isDropTarget ? () => setDropTargetInvoiceId(null) : undefined}
                        onDrop={isDropTarget ? (e) => {
                          e.preventDefault();
                          const paymentId = parseInt(e.dataTransfer.getData('text/plain'), 10);
                          if (paymentId) handleMatchPaymentToInvoice(paymentId, invoice.id);
                          setDropTargetInvoiceId(null);
                          setDraggedPaymentId(null);
                        } : undefined}
                      >
                        <div className="min-w-0">
                          <p className="text-xs font-medium text-[var(--color-text)] truncate">{invoice.invoice_number}</p>
                          <p className="text-[10px] text-[var(--color-text-secondary)]">{formatDate(invoice.invoice_date)}</p>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <p className="text-xs font-semibold text-[var(--color-text)]">{formatCurrency(invoice.total_amount)}</p>
                            <span className={`inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium ${(STATUS_COLORS[invoice.status] || STATUS_COLORS.draft).bg} ${(STATUS_COLORS[invoice.status] || STATUS_COLORS.draft).text}`}>
                              {invoice.status || 'draft'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-[var(--color-primary)] transition-colors"
                              title="Edit invoice"
                              onClick={async () => {
                                try {
                                  const full = await window.api.invoices.get(invoice.id);
                                  setEditingInvoice(full);
                                  setShowInvoiceModal(true);
                                } catch (err) {
                                  console.error('Failed to load invoice:', err);
                                }
                              }}
                            >
                              <Eye size={12} />
                            </button>
                            {isUnpaid && (
                              <button
                                className="p-1 rounded hover:bg-gray-200 text-gray-400 hover:text-emerald-600 transition-colors"
                                onClick={() => handleGeneratePaymentLink(invoice.id)}
                                disabled={generatingPaymentLink === invoice.id}
                                title="Generate payment link"
                              >
                                {generatingPaymentLink === invoice.id ? <Loader2 size={10} className="animate-spin" /> : <ExternalLink size={10} />}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* RIGHT: Payments (whole row draggable, like BillingPage) */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wide">Payments</h4>
                <button className="text-xs text-[var(--color-primary)] hover:underline" onClick={() => navigate('/billing?tab=payments')}>
                  View All
                </button>
              </div>
              {payments.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--color-border)] p-4 text-center text-xs text-[var(--color-text-secondary)]">
                  No payments recorded yet.
                </div>
              ) : (
                <div className="rounded-lg border border-[var(--color-border)] divide-y divide-[var(--color-border)] overflow-hidden">
                  {payments.slice(0, 6).map((payment) => {
                    const isMatched = !!(payment as any).invoice_id;
                    const canDrag = !isMatched && payment.amount > 0;
                    const isDragging = draggedPaymentId === payment.id;
                    const rowAccent = isMatched
                      ? 'border-l-4 border-l-emerald-400'
                      : 'border-l-4 border-l-amber-400 bg-amber-50/30';
                    return (
                      <div
                        key={payment.id}
                        className={`flex items-center justify-between px-3 py-2.5 ${rowAccent} ${isDragging ? 'opacity-50 bg-blue-50' : 'hover:bg-gray-50'} ${canDrag ? 'cursor-grab active:cursor-grabbing' : ''}`}
                        draggable={canDrag}
                        onDragStart={(e) => {
                          if (!canDrag) return;
                          e.dataTransfer.setData('text/plain', payment.id.toString());
                          setDraggedPaymentId(payment.id);
                        }}
                        onDragEnd={() => { setDraggedPaymentId(null); setDropTargetInvoiceId(null); }}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          {canDrag && <GripVertical size={12} className="text-gray-300 shrink-0" />}
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-[var(--color-text)]">{formatDate(payment.payment_date)}</p>
                            <p className="text-[10px] text-[var(--color-text-secondary)]">
                              {PAYMENT_METHOD_LABELS[payment.payment_method] || payment.payment_method || 'Other'}
                              {payment.reference_number && ` · ${payment.reference_number}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <div className="text-right">
                            <p className="text-xs font-semibold text-emerald-600">+{formatCurrency(payment.amount)}</p>
                            {!isMatched && (
                              <span className="inline-flex px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-amber-100 text-amber-700">unmatched</span>
                            )}
                          </div>
                          {isMatched && (
                            <button
                              className="p-1 rounded hover:bg-red-50 text-gray-400 hover:text-red-500 transition-colors"
                              onClick={() => handleUnmatchPayment(payment.id)}
                              title="Unmatch from invoice"
                            >
                              <XCircle size={12} />
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        </div>
      </SectionCard>

      {/* CMS-1500 now saves directly via dialog — no preview needed */}
      </>}

      {/* ══════════ DOCUMENTS TAB ══════════ */}
      {activeTab === 'documents' && <>

      {/* ══════════ ORDERS & CERTIFICATIONS ══════════ */}
      <SectionCard
        color="slate"
        icon={<ClipboardList size={18} />}
        title="Orders & Certifications"
        actions={
          <label className="btn-primary btn-sm gap-1.5 cursor-pointer">
            <Upload size={14} /> Upload POC
            <input
              type="file"
              className="hidden"
              accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.bmp,.tiff"
              onChange={async (e) => {
                e.target.value = '';
                setUploadCategory('signed_poc');
                setUploadPhysicianName(client.referring_physician || '');
                setUploadReceivedDate(new Date().toISOString().split('T')[0]);
                await handleUploadDocument({
                  category: 'signed_poc' as ClientDocumentCategory,
                  physician_name: client.referring_physician || undefined,
                  received_date: new Date().toISOString().split('T')[0],
                });
              }}
            />
          </label>
        }
      >
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
      </SectionCard>

        <SectionCard
          color="slate"
          icon={<FolderOpen size={18} />}
          title="Documents"
          count={documents.length}
          actions={
            <label className="btn-primary btn-sm gap-1.5 cursor-pointer">
              <Upload size={14} /> Upload
              <input
                type="file"
                className="hidden"
                accept=".pdf,.doc,.docx,.jpg,.jpeg,.png,.gif,.bmp,.tiff"
                onChange={async (e) => {
                  e.target.value = '';
                  await handleUploadDocument({
                    category: uploadCategory,
                    certification_period_start: uploadCertStart || undefined,
                    certification_period_end: uploadCertEnd || undefined,
                    received_date: uploadReceivedDate || undefined,
                    sent_date: uploadSentDate || undefined,
                    physician_name: uploadPhysicianName || undefined,
                  });
                }}
              />
            </label>
          }
        >

          {/* Category filter */}
          <div className="flex items-center gap-2 px-6 py-3 border-b border-[var(--color-border)] bg-gray-50/50">
            <span className="text-xs text-[var(--color-text-secondary)]">Filter:</span>
            {['all', 'physician_order', 'signed_poc', 'recertification', 'prior_authorization', 'intake_form', 'good_faith_estimate', 'correspondence', 'discharge_summary', 'other'].map((cat) => (
              <button
                key={cat}
                className={`text-xs px-2 py-1 rounded transition-colors ${
                  docCategoryFilter === cat
                    ? 'bg-[var(--color-primary)] text-white'
                    : 'bg-white border border-gray-200 text-[var(--color-text-secondary)] hover:bg-gray-100'
                }`}
                onClick={() => setDocCategoryFilter(cat)}
              >
                {cat === 'all' ? 'All' : (CLIENT_DOCUMENT_CATEGORY_LABELS as any)[cat] || cat}
              </button>
            ))}
          </div>

          {/* Document list */}
          <div className="divide-y divide-[var(--color-border)]">
            {documents
              .filter((d) => docCategoryFilter === 'all' || d.category === docCategoryFilter)
              .map((doc) => {
                const IconComp = getFileIcon(doc.file_type);
                return (
                  <div key={doc.id} className="flex items-center gap-3 px-6 py-3 hover:bg-gray-50 transition-colors">
                    <IconComp size={18} className="text-[var(--color-text-secondary)] shrink-0" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-[var(--color-text)] truncate">{doc.original_name}</p>
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        {(CLIENT_DOCUMENT_CATEGORY_LABELS as any)[doc.category] || doc.category}
                        {doc.physician_name ? ` · ${doc.physician_name}` : ''}
                        {doc.certification_period_start && doc.certification_period_end
                          ? ` · ${formatDate(doc.certification_period_start)} – ${formatDate(doc.certification_period_end)}`
                          : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        className="btn-ghost p-1.5"
                        title="Open"
                        onClick={() => handleOpenDocument(doc.id)}
                      >
                        <Eye size={14} />
                      </button>
                      <button
                        className={`btn-ghost p-1.5 ${deletingDocId === doc.id ? 'bg-red-600 text-white rounded' : 'text-red-500 hover:text-red-700'}`}
                        title="Delete"
                        onClick={() => handleDeleteDocument(doc.id)}
                      >
                        {deletingDocId === doc.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                      </button>
                    </div>
                  </div>
                );
              })}
            {documents.filter((d) => docCategoryFilter === 'all' || d.category === docCategoryFilter).length === 0 && (
              <div className="px-6 py-8 text-center text-[var(--color-text-secondary)] text-sm">
                No documents {docCategoryFilter !== 'all' ? 'in this category' : 'uploaded yet'}.
              </div>
            )}
          </div>
        </SectionCard>
      </>}

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

      {/* CSV Import for this client */}
      {client && (
        <CSVPaymentImportModal
          isOpen={showCsvImportForClient}
          onClose={() => setShowCsvImportForClient(false)}
          onComplete={() => loadData()}
          clients={[]}
          fixedClientId={client.id}
          fixedClientName={`${client.first_name} ${client.last_name}`}
        />
      )}

      {/* Invoice Modal */}
      {showInvoiceModal && client && (
        <InvoiceModal
          isOpen={showInvoiceModal}
          onClose={() => { setShowInvoiceModal(false); setEditingInvoice(null); }}
          onSave={async (invoice) => {
            setShowInvoiceModal(false);
            setEditingInvoice(null);
            const invoicesData = await window.api.invoices.list({ clientId });
            setInvoices(invoicesData);
            if (!editingInvoice) {
              setBillingToast('Invoice created');
              // Check if Stripe is connected to offer payment link
              try {
                const hasSk = await window.api.secureStorage.exists('stripe_secret_key');
                if (hasSk && invoice.status !== 'paid') {
                  setNewlyCreatedInvoice(invoice);
                }
              } catch { /* no stripe */ }
            } else {
              setBillingToast('Invoice updated');
            }
          }}
          clients={client ? [client] : []}
          entities={entities}
          feeSchedule={feeSchedule}
          invoice={editingInvoice || undefined}
          preSelectedClientId={client.id}
        />
      )}

      {/* Good Faith Estimate Modal */}
      {showGfeModal && client && (
        <GoodFaithEstimateModal
          isOpen={showGfeModal}
          onClose={() => setShowGfeModal(false)}
          client={client}
          feeSchedule={feeSchedule}
          onGenerated={() => {
            // Refresh documents list
            window.api.documents.list({ clientId }).then(setDocuments).catch(() => {});
          }}
        />
      )}

      {/* Fax Send Modal */}
      <FaxSendModal
        isOpen={showFaxModal}
        onClose={() => { setShowFaxModal(false); setFaxDocumentId(undefined); setFaxDocType(undefined); }}
        clientId={client?.id}
        documentId={faxDocumentId}
        docType={faxDocType}
        referringPhysicianId={client?.referring_physician_id}
        referringPhysicianName={client?.referring_physician}
        referringFax={client?.referring_fax}
        onSent={() => {
          if (clientId) {
            window.api.fax.getOutboundByClient(clientId).then(setFaxTracking).catch(() => {});
          }
        }}
      />

      {/* Trial Expired Modal */}
      {showExpiredModal && <TrialExpiredModal onClose={dismissExpiredModal} />}
    </div>
  );
};

export default ClientDetailPage;
