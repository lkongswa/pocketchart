import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useSectionColor } from '../hooks/useSectionColor';
import { useTier } from '../hooks/useTier';
import { useTrialGuard } from '../hooks/useTrialGuard';
import ProFeatureGate from '../components/ProFeatureGate';
import TrialExpiredModal from '../components/TrialExpiredModal';
import {
  DollarSign,
  CreditCard,
  FileText,
  Plus,
  Search,
  Filter,
  TrendingUp,
  CheckCircle,
  AlertCircle,
  Download,
  Eye,
  Trash2,
  Send,
  Undo2,
  Link,
  Unlink,
  Building2,
  Zap,
  ExternalLink,
  BarChart3,
  Users,
  Activity,
  CalendarRange,
  GripVertical,
  Upload,
  ClipboardList,
  ChevronDown,
  ChevronRight,
  CheckSquare,
  Square,
  Loader2,
  Printer,
  FolderOpen,
} from 'lucide-react';
import type {
  Invoice,
  InvoiceItem,
  Payment,
  FeeScheduleEntry,
  Client,
  ContractedEntity,
  InvoiceStatus,
  PaymentMethod,
  AnalyticsData,
  Practice,
  CMS1500UnbilledClient,
  CMS1500Readiness,
} from '../../shared/types';
import { computeClaimReadiness } from '../hooks/useClaimReadiness';
import InvoiceModal from '../components/InvoiceModal';
import PaymentModal from '../components/PaymentModal';
import CSVPaymentImportModal from '../components/CSVPaymentImportModal';

type BillingTab = 'invoices' | 'payments' | 'cms1500' | 'analytics' | 'stripe';

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

export default function BillingPage() {
  const sectionColor = useSectionColor();
  const location = useLocation();
  const { isPro } = useTier();
  const { guardAction, showExpiredModal, dismissExpiredModal } = useTrialGuard();
  const [activeTab, setActiveTab] = useState<BillingTab>('invoices');
  const [toast, setToast] = useState<string | null>(null);

  // Data
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [feeSchedule, setFeeSchedule] = useState<FeeScheduleEntry[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [entities, setEntities] = useState<ContractedEntity[]>([]);

  // Stripe settings
  const [stripeKeyMasked, setStripeKeyMasked] = useState<string | null>(null);
  const [stripeKeyInput, setStripeKeyInput] = useState('');
  const [showStripeSetup, setShowStripeSetup] = useState(false);
  const [secureStorageAvailable, setSecureStorageAvailable] = useState(false);

  // Analytics
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  const [analyticsTimeframe, setAnalyticsTimeframe] = useState<string>('6m');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');

  // Loading states
  const [loading, setLoading] = useState(true);

  // Filters
  const [invoiceFilter, setInvoiceFilter] = useState<InvoiceStatus | 'all' | 'unpaid'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [clientFilter, setClientFilter] = useState<number | 'all'>('all');

  // Modals
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showCsvImport, setShowCsvImport] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<(Invoice & { items: InvoiceItem[] }) | null>(null);

  // CMS-1500 tab state
  const [practice, setPractice] = useState<Practice | null>(null);
  const [unbilledClients, setUnbilledClients] = useState<(CMS1500UnbilledClient & { _fullClient?: any })[]>([]);
  const [cms1500Loading, setCms1500Loading] = useState(false);
  const [selectedClients, setSelectedClients] = useState<Set<number>>(new Set());
  const [expandedClients, setExpandedClients] = useState<Set<number>>(new Set());
  const [selectedNotes, setSelectedNotes] = useState<Map<number, Set<number>>>(new Map());
  const [outputMode, setOutputMode] = useState<'combined' | 'separate'>('combined');
  const [cms1500PrintMode, setCms1500PrintMode] = useState<'full' | 'data-only'>('full');
  const [cms1500Generating, setCms1500Generating] = useState(false);
  const [cms1500PendingNoteIds, setCms1500PendingNoteIds] = useState<number[]>([]);
  const [cms1500Preview, setCms1500Preview] = useState<{ pdfs: Array<{ base64Pdf: string; filename: string; clientId: number }>; notesMarked: number[] } | null>(null);
  const [cms1500Saving, setCms1500Saving] = useState(false);

  // Read URL params to pre-set filters (e.g. from dashboard stat card)
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const filter = params.get('filter');
    const tab = params.get('tab');
    if (filter === 'unpaid') {
      setActiveTab('invoices');
      setInvoiceFilter('unpaid');
    }
    if (tab === 'cms1500') {
      setActiveTab('cms1500');
    }
  }, [location.search]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [
        invoicesData,
        paymentsData,
        feeData,
        clientsData,
        entitiesData,
        secureAvailable,
        stripeMasked,
        practiceData,
      ] = await Promise.all([
        window.api.invoices.list(),
        window.api.payments.list(),
        window.api.feeSchedule.list(),
        window.api.clients.list(),
        window.api.contractedEntities.list().catch(() => [] as ContractedEntity[]),
        window.api.secureStorage.isAvailable(),
        window.api.secureStorage.getMasked('stripe_secret_key'),
        window.api.practice.get(),
      ]);

      setInvoices(invoicesData);
      setPayments(paymentsData);
      setFeeSchedule(feeData);
      setClients(clientsData);
      setEntities(entitiesData);
      setSecureStorageAvailable(secureAvailable);
      setStripeKeyMasked(stripeMasked);
      setPractice(practiceData);
    } catch (err) {
      console.error('Failed to load billing data:', err);
      setToast('Failed to load billing data');
    } finally {
      setLoading(false);
    }
  }, []);

  const getTimeframeFilters = useCallback(() => {
    if (analyticsTimeframe === 'custom' && customStartDate && customEndDate) {
      return { startDate: customStartDate, endDate: customEndDate };
    }
    const presetMap: Record<string, number> = {
      '3m': 3, '6m': 6, '12m': 12, 'ytd': 0, '24m': 24,
    };
    if (analyticsTimeframe === 'ytd') {
      const now = new Date();
      const jan1 = `${now.getFullYear()}-01-01`;
      return { startDate: jan1, endDate: now.toISOString().slice(0, 10) };
    }
    return { monthsBack: presetMap[analyticsTimeframe] || 6 };
  }, [analyticsTimeframe, customStartDate, customEndDate]);

  const loadAnalytics = useCallback(async () => {
    if (!isPro) return;
    setAnalyticsLoading(true);
    try {
      const filters = getTimeframeFilters();
      const data = await window.api.dashboard.getAnalytics(filters);
      setAnalytics(data);
    } catch (err) {
      console.error('Failed to load analytics:', err);
    } finally {
      setAnalyticsLoading(false);
    }
  }, [isPro, getTimeframeFilters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (activeTab === 'analytics' && isPro) {
      loadAnalytics();
    }
  }, [activeTab, isPro, loadAnalytics]);

  const handleSaveStripeKey = async () => {
    if (!stripeKeyInput.trim()) {
      setToast('Please enter a Stripe API key');
      return;
    }
    if (!stripeKeyInput.startsWith('rk_') && !stripeKeyInput.startsWith('sk_')) {
      setToast('Invalid Stripe key format. Key should start with rk_ (restricted) or sk_ (secret)');
      return;
    }
    try {
      await window.api.secureStorage.set('stripe_secret_key', stripeKeyInput.trim());
      const masked = await window.api.secureStorage.getMasked('stripe_secret_key');
      setStripeKeyMasked(masked);
      setStripeKeyInput('');
      setShowStripeSetup(false);
      setToast('Stripe API key saved securely');
    } catch (err) {
      console.error('Failed to save Stripe key:', err);
      setToast('Failed to save Stripe key');
    }
  };

  const handleRemoveStripeKey = async () => {
    try {
      await window.api.secureStorage.delete('stripe_secret_key');
      setStripeKeyMasked(null);
      setToast('Stripe API key removed');
    } catch (err) {
      console.error('Failed to remove Stripe key:', err);
      setToast('Failed to remove Stripe key');
    }
  };

  const handleDeleteInvoice = async (id: number) => {
    if (!confirm('Are you sure you want to delete this invoice?')) return;
    try {
      await window.api.invoices.delete(id);
      setInvoices(invoices.filter((i) => i.id !== id));
      setToast('Invoice deleted');
    } catch (err) {
      console.error('Failed to delete invoice:', err);
      setToast('Failed to delete invoice');
    }
  };

  const handleViewInvoice = async (id: number) => {
    try {
      const full = await window.api.invoices.get(id);
      setEditingInvoice(full);
      setShowInvoiceModal(true);
    } catch (err) {
      console.error('Failed to load invoice:', err);
    }
  };

  const handleMarkAsSent = async (id: number) => {
    try {
      await window.api.invoices.update(id, { status: 'sent' });
      setInvoices(invoices.map((i) => (i.id === id ? { ...i, status: 'sent' as InvoiceStatus } : i)));
      setToast('Invoice marked as sent');
    } catch (err) {
      console.error('Failed to update invoice:', err);
    }
  };

  const handleRefundPayment = async (paymentId: number) => {
    if (!confirm('Are you sure you want to refund this payment? A negative refund entry will be created.')) return;
    try {
      await window.api.payments.refund(paymentId);
      loadData();
      setToast('Payment refunded successfully');
    } catch (err) {
      console.error('Failed to refund payment:', err);
      setToast('Failed to refund payment');
    }
  };

  const handleDeletePayment = async (paymentId: number) => {
    if (!confirm('Are you sure you want to delete this payment? This cannot be undone.')) return;
    try {
      // If payment is matched to an invoice, recalculate invoice status
      const payment = payments.find(p => p.id === paymentId);
      if (payment?.invoice_id) {
        const invoiceId = payment.invoice_id;
        const remainingTotal = payments
          .filter(p => p.invoice_id === invoiceId && p.id !== paymentId)
          .reduce((sum, p) => sum + p.amount, 0);
        const invoice = invoices.find(i => i.id === invoiceId);
        if (invoice) {
          const newStatus = remainingTotal >= invoice.total_amount ? 'paid' : remainingTotal > 0 ? 'partial' : 'sent';
          if (newStatus !== invoice.status) {
            await window.api.invoices.update(invoiceId, { status: newStatus });
          }
        }
      }
      await window.api.payments.delete(paymentId);
      loadData();
      setToast('Payment deleted');
    } catch (err) {
      console.error('Failed to delete payment:', err);
      setToast('Failed to delete payment');
    }
  };

  const handleMatchPaymentToInvoice = async (paymentId: number, invoiceId: number) => {
    try {
      const payment = payments.find(p => p.id === paymentId);
      if (!payment) return;
      await window.api.payments.update(paymentId, { invoice_id: invoiceId, notes: payment.notes });
      const invoicePayments = payments.filter(p => p.invoice_id === invoiceId).reduce((sum, p) => sum + p.amount, 0) + payment.amount;
      const invoice = invoices.find(i => i.id === invoiceId);
      if (invoice) {
        const newStatus = invoicePayments >= invoice.total_amount ? 'paid' : invoicePayments > 0 ? 'partial' : invoice.status;
        if (newStatus !== invoice.status) {
          await window.api.invoices.update(invoiceId, { status: newStatus });
        }
      }
      loadData();
      setToast('Payment matched to invoice');
    } catch (err) {
      console.error('Failed to match payment:', err);
      setToast('Failed to match payment to invoice');
    }
  };

  const handleUnmatchPayment = async (paymentId: number) => {
    try {
      const payment = payments.find(p => p.id === paymentId);
      if (!payment || !payment.invoice_id) return;
      const invoiceId = payment.invoice_id;
      await window.api.payments.update(paymentId, { invoice_id: null, notes: payment.notes });
      // Recalculate invoice status after removing this payment
      const remainingTotal = payments
        .filter(p => p.invoice_id === invoiceId && p.id !== paymentId)
        .reduce((sum, p) => sum + p.amount, 0);
      const invoice = invoices.find(i => i.id === invoiceId);
      if (invoice) {
        const newStatus = remainingTotal >= invoice.total_amount ? 'paid' : remainingTotal > 0 ? 'partial' : 'sent';
        if (newStatus !== invoice.status) {
          await window.api.invoices.update(invoiceId, { status: newStatus });
        }
      }
      loadData();
      setToast('Payment unmatched from invoice');
    } catch (err) {
      console.error('Failed to unmatch payment:', err);
      setToast('Failed to unmatch payment');
    }
  };

  const [draggedPaymentId, setDraggedPaymentId] = useState<number | null>(null);

  const handleDownloadInvoicePdf = async (id: number) => {
    try {
      const { base64Pdf, filename } = await window.api.invoices.generatePdf(id);
      const savedPath = await window.api.invoices.savePdf({ base64Pdf, filename });
      if (savedPath) {
        setToast('Invoice PDF saved');
      }
    } catch (err) {
      console.error('Failed to generate invoice PDF:', err);
      setToast('Failed to generate PDF');
    }
  };

  const getClientName = (clientId: number) => {
    const client = clients.find((c) => c.id === clientId);
    return client ? `${client.first_name} ${client.last_name}` : 'Unknown';
  };

  const getInvoiceName = (inv: Invoice) => {
    if (inv.entity_id) {
      const entity = entities.find((e) => e.id === inv.entity_id);
      return entity ? entity.name : 'Unknown Agency';
    }
    return getClientName(inv.client_id);
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const formatMonthLabel = (m: string) => {
    const [y, mo] = m.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return `${months[parseInt(mo, 10) - 1]} ${y.slice(2)}`;
  };

  const timeframeLabel = (() => {
    const labels: Record<string, string> = {
      '3m': 'Last 3 Months', '6m': 'Last 6 Months', '12m': 'Last 12 Months',
      'ytd': 'Year to Date', '24m': 'Last 2 Years',
    };
    if (analyticsTimeframe === 'custom' && customStartDate && customEndDate) {
      const fmt = (d: string) => {
        const [y, mo] = d.split('-');
        const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        return `${months[parseInt(mo,10)-1]} ${y}`;
      };
      return `${fmt(customStartDate)} — ${fmt(customEndDate)}`;
    }
    return labels[analyticsTimeframe] || 'Last 6 Months';
  })();

  const filteredInvoices = invoices.filter((inv) => {
    if (clientFilter !== 'all') {
      const filterVal = clientFilter as number;
      if (filterVal > 0 && inv.client_id !== filterVal) return false;
      if (filterVal < 0 && inv.entity_id !== Math.abs(filterVal)) return false;
    }
    if (invoiceFilter === 'unpaid' && (inv.status === 'paid' || inv.status === 'void')) return false;
    if (invoiceFilter !== 'all' && invoiceFilter !== 'unpaid' && inv.status !== invoiceFilter) return false;
    if (searchTerm) {
      const name = getInvoiceName(inv).toLowerCase();
      return (
        name.includes(searchTerm.toLowerCase()) ||
        inv.invoice_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (inv.cpt_summary || '').toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    return true;
  });

  const filteredPayments = payments.filter((p) => {
    if (clientFilter !== 'all' && p.client_id !== clientFilter) return false;
    if (searchTerm) {
      const name = getClientName(p.client_id).toLowerCase();
      const linkedInv = p.invoice_id ? invoices.find(i => i.id === p.invoice_id) : null;
      return (
        name.includes(searchTerm.toLowerCase()) ||
        (linkedInv?.invoice_number || '').toLowerCase().includes(searchTerm.toLowerCase()) ||
        (p.payment_method || '').toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    return true;
  });

  // Tab navigation items
  // ── CMS-1500 Tab Logic ──

  const loadUnbilledClients = useCallback(async () => {
    setCms1500Loading(true);
    try {
      const data = await window.api.cms1500.getUnbilledClients();
      setUnbilledClients(data);
      // Start with nothing selected — user opts in
      setSelectedClients(new Set());
      setSelectedNotes(new Map());
    } catch (err) {
      console.error('Failed to load unbilled clients:', err);
      setToast('Failed to load claim data');
    } finally {
      setCms1500Loading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'cms1500') {
      // Load default print mode from settings
      window.api.settings.get('cms1500_print_mode').then((val) => {
        if (val === 'data-only' || val === 'full') setCms1500PrintMode(val);
      }).catch(console.error);
      if (!cms1500Loading && unbilledClients.length === 0) {
        loadUnbilledClients();
      }
    }
  }, [activeTab]);

  // Compute readiness per client
  const clientReadiness = React.useMemo(() => {
    const map = new Map<number, CMS1500Readiness>();
    for (const uc of unbilledClients) {
      const readiness = computeClaimReadiness(uc._fullClient || uc as any, practice);
      map.set(uc.id, readiness);
    }
    return map;
  }, [unbilledClients, practice]);

  const toggleClientSelection = (clientId: number) => {
    setSelectedClients(prev => {
      const next = new Set(prev);
      if (next.has(clientId)) {
        next.delete(clientId);
      } else {
        next.add(clientId);
      }
      return next;
    });
    // Also toggle all notes for this client
    setSelectedNotes(prev => {
      const next = new Map(prev);
      const uc = unbilledClients.find(c => c.id === clientId);
      if (uc && selectedClients.has(clientId)) {
        // Deselecting — clear all notes
        next.delete(clientId);
      } else if (uc) {
        // Selecting — select all notes
        next.set(clientId, new Set(uc.unbilledNotes.map(n => n.id)));
      }
      return next;
    });
  };

  const toggleNoteSelection = (clientId: number, noteId: number) => {
    setSelectedNotes(prev => {
      const next = new Map(prev);
      const current = new Set(next.get(clientId) || []);
      if (current.has(noteId)) {
        current.delete(noteId);
      } else {
        current.add(noteId);
      }
      next.set(clientId, current);
      // Update client selection based on note selection
      if (current.size === 0) {
        setSelectedClients(p => { const s = new Set(p); s.delete(clientId); return s; });
      } else {
        setSelectedClients(p => { const s = new Set(p); s.add(clientId); return s; });
      }
      return next;
    });
  };

  const toggleExpandClient = (clientId: number) => {
    setExpandedClients(prev => {
      const next = new Set(prev);
      if (next.has(clientId)) next.delete(clientId);
      else next.add(clientId);
      return next;
    });
  };

  const toggleAllClients = () => {
    if (selectedClients.size === unbilledClients.length) {
      // Deselect all
      setSelectedClients(new Set());
      setSelectedNotes(new Map());
    } else {
      // Select all
      const clientSet = new Set<number>();
      const noteMap = new Map<number, Set<number>>();
      for (const c of unbilledClients) {
        clientSet.add(c.id);
        noteMap.set(c.id, new Set(c.unbilledNotes.map(n => n.id)));
      }
      setSelectedClients(clientSet);
      setSelectedNotes(noteMap);
    }
  };

  const totalSelectedNotes = Array.from(selectedNotes.values()).reduce((sum, set) => sum + set.size, 0);

  const handleBulkGenerate = async () => {
    setCms1500Generating(true);
    try {
      const entries = Array.from(selectedClients).map(clientId => ({
        clientId,
        noteIds: Array.from(selectedNotes.get(clientId) || []),
      })).filter(e => e.noteIds.length > 0);

      if (entries.length === 0) {
        setToast('No notes selected');
        return;
      }

      const result = await window.api.cms1500.generateBulk({ entries, outputMode, printMode: cms1500PrintMode });

      if (result.pdfs.length === 0) {
        setToast('No claim forms generated — check client data');
        return;
      }

      // Show preview modal instead of saving directly
      setCms1500Preview(result);
    } catch (err: any) {
      console.error('Claim form generation failed:', err);
      setToast(err.message || 'Failed to generate claim forms');
    } finally {
      setCms1500Generating(false);
    }
  };

  const handlePreviewOpen = async () => {
    if (!cms1500Preview || cms1500Preview.pdfs.length === 0) return;
    try {
      // Open the first (or combined) PDF in system viewer
      await window.api.cms1500.openPreview(cms1500Preview.pdfs[0]);
    } catch (err: any) {
      setToast(err.message || 'Failed to open preview');
    }
  };

  const handlePreviewSave = async () => {
    if (!cms1500Preview) return;
    setCms1500Saving(true);
    try {
      if (outputMode === 'combined') {
        const savedPath = await window.api.cms1500.save(cms1500Preview.pdfs[0]);
        if (savedPath) {
          await window.api.cms1500.markBilled(cms1500Preview.notesMarked);
          setToast('Claim form saved successfully');
          setCms1500Preview(null);
          loadUnbilledClients();
        }
      } else {
        const folder = await window.api.cms1500.saveBulk({ pdfs: cms1500Preview.pdfs });
        if (folder) {
          await window.api.cms1500.markBilled(cms1500Preview.notesMarked);
          setToast(`${cms1500Preview.pdfs.length} claim form(s) saved to folder`);
          setCms1500Preview(null);
          loadUnbilledClients();
        }
      }
    } catch (err: any) {
      setToast(err.message || 'Failed to save claim forms');
    } finally {
      setCms1500Saving(false);
    }
  };

  const tabs: Array<{ id: BillingTab; label: string; icon: React.ReactNode; pro?: boolean }> = [
    { id: 'invoices', label: 'Invoices', icon: <FileText className="w-4 h-4" /> },
    { id: 'payments', label: 'Payments', icon: <DollarSign className="w-4 h-4" /> },
    { id: 'cms1500', label: 'Claim Preview', icon: <ClipboardList className="w-4 h-4" /> },
    { id: 'analytics', label: 'Analytics', icon: <BarChart3 className="w-4 h-4" />, pro: true },
    { id: 'stripe', label: 'Stripe Payments', icon: <Zap className="w-4 h-4" />, pro: true },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-[var(--color-text-secondary)]">Loading billing data...</div>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-emerald-600 text-white px-4 py-3 rounded-lg shadow-lg animate-fade-in">
          <CheckCircle className="w-4 h-4" />
          <span className="text-sm font-medium">{toast}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="page-header mb-6">
        <div className="flex items-center gap-3">
          <DollarSign className="w-7 h-7" style={{ color: sectionColor.color }} />
          <div>
            <h1 className="page-title">Billing</h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Manage invoices, payments, and billing analytics
            </p>
          </div>
        </div>
      </div>

      {/* Client Filter & Search */}
      <div className="flex items-center gap-3 mb-4">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-secondary)]" />
          <input
            type="text"
            placeholder="Search by client or invoice number..."
            className="input pl-10 w-full"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="relative">
          <Filter className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-secondary)]" />
          <select
            className="select pl-9"
            value={clientFilter}
            onChange={(e) => setClientFilter(e.target.value === 'all' ? 'all' : parseInt(e.target.value, 10))}
          >
            <option value="all">All Clients & Agencies</option>
            <optgroup label="Clients">
              {clients.map((c) => (
                <option key={`c-${c.id}`} value={c.id}>{c.first_name} {c.last_name}</option>
              ))}
            </optgroup>
            {entities.length > 0 && (
              <optgroup label="Agencies">
                {entities.map((e) => (
                  <option key={`e-${e.id}`} value={-e.id}>{e.name}</option>
                ))}
              </optgroup>
            )}
          </select>
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 mb-6">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors cursor-pointer ${
              activeTab === tab.id
                ? 'bg-white text-[var(--color-primary)] shadow-sm'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.pro && !isPro && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-600 font-semibold">PRO</span>
            )}
          </button>
        ))}
      </div>

      {/* Invoices Tab */}
      {activeTab === 'invoices' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1">
              <select
                className="select"
                value={invoiceFilter}
                onChange={(e) => setInvoiceFilter(e.target.value as InvoiceStatus | 'all' | 'unpaid')}
              >
                <option value="all">All Status</option>
                <option value="unpaid">Unpaid</option>
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="paid">Paid</option>
                <option value="partial">Partial</option>
                <option value="overdue">Overdue</option>
                <option value="void">Void</option>
              </select>
            </div>
            <button
              className="btn-primary gap-2"
              onClick={() => {
                if (!guardAction()) return;
                setEditingInvoice(null);
                setShowInvoiceModal(true);
              }}
            >
              <Plus className="w-4 h-4" />
              New Invoice
            </button>
          </div>

          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-gray-50">
                  <th className="text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider px-4 py-3">Invoice</th>
                  <th className="text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider px-4 py-3">Client / Agency</th>
                  <th className="text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider px-4 py-3">CPTs</th>
                  <th className="text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider px-4 py-3">Date</th>
                  <th className="text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider px-4 py-3">Amount</th>
                  <th className="text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider px-4 py-3">Status</th>
                  <th className="text-right text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {filteredInvoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => handleViewInvoice(invoice.id)}>
                    <td className="px-4 py-3">
                      <span className="font-medium text-[var(--color-text)]">{invoice.invoice_number}</span>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text)]">
                      <div className="flex items-center gap-1.5">
                        {getInvoiceName(invoice)}
                        {invoice.entity_id && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-600">
                            <Building2 className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-xs text-[var(--color-text-secondary)] font-mono">{invoice.cpt_summary || ''}</td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)]">{invoice.invoice_date}</td>
                    <td className="px-4 py-3 font-medium text-[var(--color-text)]">{formatCurrency(invoice.total_amount)}</td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[invoice.status].bg} ${STATUS_COLORS[invoice.status].text}`}>
                        {invoice.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <button className="p-1.5 rounded hover:bg-gray-100 text-[var(--color-text-secondary)]" title="View/Edit" onClick={() => handleViewInvoice(invoice.id)}>
                          <Eye className="w-4 h-4" />
                        </button>
                        <button className="p-1.5 rounded hover:bg-gray-100 text-[var(--color-text-secondary)]" title="Download PDF" onClick={() => handleDownloadInvoicePdf(invoice.id)}>
                          <Download className="w-4 h-4" />
                        </button>
                        {invoice.status === 'draft' && (
                          <button className="p-1.5 rounded hover:bg-blue-50 text-blue-500" title="Mark as Sent" onClick={() => handleMarkAsSent(invoice.id)}>
                            <Send className="w-4 h-4" />
                          </button>
                        )}
                        <button className="p-1.5 rounded hover:bg-red-50 text-red-500" title="Delete" onClick={() => handleDeleteInvoice(invoice.id)}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredInvoices.length === 0 && (
                  <tr>
                    <td colSpan={7} className="px-4 py-12 text-center text-[var(--color-text-secondary)]">
                      {searchTerm ? `No invoices matching "${searchTerm}"` : 'No invoices found'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Payments Tab */}
      {activeTab === 'payments' && (
        <div className="space-y-4">
          <div className="flex items-center justify-end gap-4">
            <button className="btn-ghost gap-2 text-sm" onClick={() => setShowCsvImport(true)}>
              <Upload className="w-4 h-4" />
              Import CSV
            </button>
            <button className="btn-primary gap-2" onClick={() => setShowPaymentModal(true)}>
              <Plus className="w-4 h-4" />
              Record Payment
            </button>
          </div>

          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-gray-50">
                  <th className="text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider px-4 py-3">Date</th>
                  <th className="text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider px-4 py-3">Client</th>
                  <th className="text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider px-4 py-3">Method</th>
                  <th className="text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider px-4 py-3">Invoice</th>
                  <th className="text-right text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider px-4 py-3">Amount</th>
                  <th className="text-right text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {filteredPayments.map((payment) => {
                  const linkedInvoice = payment.invoice_id ? invoices.find(i => i.id === payment.invoice_id) : null;
                  const isRefund = payment.amount < 0;
                  return (
                    <tr
                      key={payment.id}
                      className={`hover:bg-gray-50 ${!payment.invoice_id && payment.amount > 0 ? 'cursor-grab active:cursor-grabbing' : ''} ${draggedPaymentId === payment.id ? 'opacity-50 bg-blue-50' : ''}`}
                      draggable={!payment.invoice_id && payment.amount > 0}
                      onDragStart={(e) => {
                        if (!payment.invoice_id && payment.amount > 0) {
                          e.dataTransfer.setData('text/plain', payment.id.toString());
                          setDraggedPaymentId(payment.id);
                        }
                      }}
                      onDragEnd={() => setDraggedPaymentId(null)}
                    >
                      <td className="px-4 py-3 text-[var(--color-text)]">
                        <div className="flex items-center gap-1.5">
                          {!payment.invoice_id && payment.amount > 0 && (
                            <GripVertical className="w-3.5 h-3.5 text-gray-300 flex-shrink-0" />
                          )}
                          {payment.payment_date}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-[var(--color-text)]">{getClientName(payment.client_id)}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex items-center gap-1.5 text-[var(--color-text-secondary)]">
                          {payment.payment_method === 'card' && <CreditCard className="w-4 h-4" />}
                          {PAYMENT_METHOD_LABELS[payment.payment_method]}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {linkedInvoice ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className="text-[var(--color-primary)] hover:underline cursor-pointer text-sm" onClick={() => handleViewInvoice(linkedInvoice.id)}>
                              {linkedInvoice.invoice_number}
                            </span>
                            <button
                              className="p-0.5 rounded hover:bg-amber-50 text-gray-300 hover:text-amber-600 transition-colors"
                              title="Unmatch payment from invoice"
                              onClick={(e) => { e.stopPropagation(); handleUnmatchPayment(payment.id); }}
                            >
                              <Unlink className="w-3.5 h-3.5" />
                            </button>
                          </span>
                        ) : isRefund ? (
                          <span className="text-xs text-red-500 italic">Refund</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-600 font-medium">
                            <AlertCircle className="w-3 h-3" />
                            Unmatched
                          </span>
                        )}
                      </td>
                      <td className={`px-4 py-3 text-right font-medium ${isRefund ? 'text-red-600' : 'text-emerald-600'}`}>
                        {isRefund ? '' : '+'}{formatCurrency(payment.amount)}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          {payment.amount > 0 && !isRefund && (
                            <button
                              className="p-1.5 rounded hover:bg-red-50 text-[var(--color-text-secondary)] hover:text-red-500"
                              title="Refund payment"
                              onClick={(e) => { e.stopPropagation(); handleRefundPayment(payment.id); }}
                            >
                              <Undo2 className="w-4 h-4" />
                            </button>
                          )}
                          <button
                            className="p-1.5 rounded hover:bg-red-50 text-[var(--color-text-secondary)] hover:text-red-500"
                            title="Delete payment"
                            onClick={(e) => { e.stopPropagation(); handleDeletePayment(payment.id); }}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {filteredPayments.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-[var(--color-text-secondary)]">
                      {searchTerm ? `No payments matching "${searchTerm}"` : clientFilter !== 'all' ? 'No payments for this client' : 'No payments recorded yet'}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Outstanding Invoices - Drop Targets for Payment Matching */}
          {(() => {
            const hasUnmatched = filteredPayments.some(p => !p.invoice_id && p.amount > 0);
            const outstandingInvoices = invoices.filter(inv => inv.status !== 'paid' && inv.status !== 'void');
            if (!hasUnmatched || outstandingInvoices.length === 0) return null;
            return (
              <div className="mt-4">
                <div className="flex items-center gap-2 mb-3">
                  <Link className="w-4 h-4 text-[var(--color-primary)]" />
                  <h4 className="text-sm font-semibold text-[var(--color-text)]">
                    Outstanding Invoices
                  </h4>
                  <span className="text-xs text-[var(--color-text-secondary)]">
                    {draggedPaymentId ? '— drop payment here to match' : '— drag an unmatched payment here'}
                  </span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {outstandingInvoices.map(invoice => (
                    <div
                      key={invoice.id}
                      className={`card p-4 border-2 transition-all ${
                        draggedPaymentId
                          ? 'border-dashed border-[var(--color-primary)] bg-[var(--color-primary)]/5 shadow-md scale-[1.01]'
                          : 'border-solid border-gray-200 hover:border-gray-300'
                      }`}
                      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'link'; }}
                      onDrop={(e) => {
                        e.preventDefault();
                        const paymentId = parseInt(e.dataTransfer.getData('text/plain'), 10);
                        if (!isNaN(paymentId)) {
                          handleMatchPaymentToInvoice(paymentId, invoice.id);
                        }
                        setDraggedPaymentId(null);
                      }}
                    >
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-[var(--color-text)]">{invoice.invoice_number}</p>
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[invoice.status].bg} ${STATUS_COLORS[invoice.status].text}`}>
                          {invoice.status}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--color-text-secondary)] mt-1">{getInvoiceName(invoice)}</p>
                      <p className="text-sm font-bold text-[var(--color-text)] mt-1">{formatCurrency(invoice.total_amount)}</p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })()}
        </div>
      )}

      {/* Claim Preview Tab (CMS-1500 format) */}
      {activeTab === 'cms1500' && (
        <div className="space-y-4">
          {/* Header controls */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <button
                className="btn-ghost btn-sm gap-1.5"
                onClick={toggleAllClients}
              >
                {selectedClients.size === unbilledClients.length && unbilledClients.length > 0 ? (
                  <CheckSquare size={14} className="text-emerald-500" />
                ) : (
                  <Square size={14} />
                )}
                {selectedClients.size === unbilledClients.length && unbilledClients.length > 0 ? 'Deselect All' : 'Select All'}
              </button>
              <span className="text-sm text-[var(--color-text-secondary)]">
                {totalSelectedNotes} note{totalSelectedNotes !== 1 ? 's' : ''} across {selectedClients.size} client{selectedClients.size !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="flex items-center gap-3">
              {/* Print mode toggle */}
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5" title="CMS-1500 format">
                <button
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    cms1500PrintMode === 'full'
                      ? 'bg-white text-[var(--color-primary)] shadow-sm'
                      : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
                  }`}
                  onClick={() => setCms1500PrintMode('full')}
                  title="Full form with red chrome — prints the complete CMS-1500"
                >
                  Full Form
                </button>
                <button
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    cms1500PrintMode === 'data-only'
                      ? 'bg-white text-[var(--color-primary)] shadow-sm'
                      : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
                  }`}
                  onClick={() => setCms1500PrintMode('data-only')}
                  title="Data only — for printing on pre-printed CMS-1500 paper"
                >
                  Data Only
                </button>
              </div>
              {/* Output mode toggle */}
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                <button
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    outputMode === 'combined'
                      ? 'bg-white text-[var(--color-primary)] shadow-sm'
                      : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
                  }`}
                  onClick={() => setOutputMode('combined')}
                >
                  <Printer size={12} className="inline mr-1" /> Combined PDF
                </button>
                <button
                  className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                    outputMode === 'separate'
                      ? 'bg-white text-[var(--color-primary)] shadow-sm'
                      : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
                  }`}
                  onClick={() => setOutputMode('separate')}
                >
                  <FolderOpen size={12} className="inline mr-1" /> Separate PDFs
                </button>
              </div>
              <button
                className="btn-primary btn-sm gap-1.5"
                disabled={cms1500Generating || totalSelectedNotes === 0}
                onClick={handleBulkGenerate}
              >
                {cms1500Generating ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <ClipboardList size={14} />
                )}
                Preview{totalSelectedNotes > 0 ? ` (${totalSelectedNotes})` : ''}
              </button>
            </div>
          </div>

          {/* Client list */}
          {cms1500Loading ? (
            <div className="flex items-center justify-center h-48">
              <div className="text-[var(--color-text-secondary)]">Loading unbilled notes...</div>
            </div>
          ) : unbilledClients.length === 0 ? (
            <div className="card p-12 text-center">
              <ClipboardList size={48} className="mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-semibold text-[var(--color-text)] mb-2">No Unbilled Notes</h3>
              <p className="text-[var(--color-text-secondary)] text-sm max-w-md mx-auto">
                All signed notes have been included in claim forms. New signed notes will appear here automatically.
              </p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[40px_1fr_200px_100px_80px_80px_40px] gap-2 px-4 py-2 bg-gray-50 border-b text-xs font-medium text-[var(--color-text-secondary)] uppercase tracking-wide">
                <div></div>
                <div>Client</div>
                <div>Insurance</div>
                <div>Diagnosis</div>
                <div className="text-center">Notes</div>
                <div className="text-center">Ready</div>
                <div></div>
              </div>

              {unbilledClients.map((uc) => {
                const isSelected = selectedClients.has(uc.id);
                const isExpanded = expandedClients.has(uc.id);
                const readiness = clientReadiness.get(uc.id);
                const clientNoteIds = selectedNotes.get(uc.id);
                const selectedCount = clientNoteIds?.size || 0;

                return (
                  <div key={uc.id} className="border-b last:border-b-0">
                    {/* Client row */}
                    <div
                      className={`grid grid-cols-[40px_1fr_200px_100px_80px_80px_40px] gap-2 px-4 py-3 items-center hover:bg-gray-50 transition-colors cursor-pointer ${
                        isSelected ? 'bg-emerald-50/40' : ''
                      }`}
                      onClick={() => toggleExpandClient(uc.id)}
                    >
                      <div onClick={(e) => { e.stopPropagation(); toggleClientSelection(uc.id); }}>
                        {isSelected ? (
                          <CheckSquare size={18} className="text-emerald-500 cursor-pointer" />
                        ) : (
                          <Square size={18} className="text-gray-400 cursor-pointer" />
                        )}
                      </div>
                      <div className="font-medium text-[var(--color-text)]">
                        {uc.last_name}, {uc.first_name}
                      </div>
                      <div className="text-sm text-[var(--color-text-secondary)] truncate">
                        {uc.insurance_payer || <span className="text-red-400 italic">No payer</span>}
                      </div>
                      <div className="text-xs font-mono text-[var(--color-text-secondary)]">
                        {uc.primary_dx_code || <span className="text-red-400">—</span>}
                      </div>
                      <div className="text-center">
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          selectedCount === uc.unbilledNoteCount && selectedCount > 0
                            ? 'bg-emerald-100 text-emerald-700'
                            : selectedCount > 0
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-gray-100 text-gray-600'
                        }`}>
                          {selectedCount}/{uc.unbilledNoteCount}
                        </span>
                      </div>
                      <div className="text-center">
                        {readiness?.ready ? (
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                            <span className="w-2 h-2 rounded-full bg-emerald-400" /> Ready
                          </span>
                        ) : readiness && readiness.failCount > 0 ? (
                          <span className="inline-flex items-center gap-1 text-xs text-red-500">
                            <span className="w-2 h-2 rounded-full bg-red-400" /> {readiness.failCount} req
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-amber-500">
                            <span className="w-2 h-2 rounded-full bg-amber-400" /> Warn
                          </span>
                        )}
                      </div>
                      <div className="text-center">
                        {isExpanded ? (
                          <ChevronDown size={16} className="text-gray-400" />
                        ) : (
                          <ChevronRight size={16} className="text-gray-400" />
                        )}
                      </div>
                    </div>

                    {/* Expanded notes */}
                    {isExpanded && (
                      <div className="bg-gray-50/50 border-t px-4 py-2">
                        {/* Readiness warnings */}
                        {readiness && !readiness.ready && (
                          <div className="mb-2 p-2 rounded bg-red-50 border border-red-200 text-xs text-red-600">
                            <span className="font-medium">Missing required fields:</span>{' '}
                            {readiness.checks
                              .filter(c => c.status === 'fail')
                              .map(c => c.label)
                              .join(', ')}
                          </div>
                        )}
                        {/* Note rows */}
                        <div className="space-y-1">
                          {uc.unbilledNotes.map((note: any) => {
                            const noteSelected = clientNoteIds?.has(note.id) || false;
                            // Parse CPT display
                            let cptDisplay = note.cpt_code || '';
                            try {
                              const arr = JSON.parse(note.cpt_codes || '[]');
                              if (arr.length > 0) cptDisplay = arr.map((c: any) => c.code || c).join(', ');
                            } catch {}

                            return (
                              <div
                                key={note.id}
                                className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm transition-colors cursor-pointer ${
                                  noteSelected ? 'bg-white shadow-sm' : 'hover:bg-white/60'
                                }`}
                                onClick={() => toggleNoteSelection(uc.id, note.id)}
                              >
                                {noteSelected ? (
                                  <CheckSquare size={14} className="text-emerald-500 shrink-0" />
                                ) : (
                                  <Square size={14} className="text-gray-400 shrink-0" />
                                )}
                                <span className="text-[var(--color-text-secondary)] w-24 shrink-0">
                                  {note.date_of_service}
                                </span>
                                <span className="font-mono text-xs text-[var(--color-text-secondary)] w-24 shrink-0">
                                  {cptDisplay || '—'}
                                </span>
                                <span className="text-[var(--color-text)]">
                                  {note.charge_amount != null ? `$${Number(note.charge_amount).toFixed(2)}` : '—'}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Analytics Tab (Pro) */}
      {activeTab === 'analytics' && (
        <ProFeatureGate feature="caseload_dashboard" lockedMessage="Upgrade to Pro to unlock revenue analytics, client growth tracking, and practice insights.">
          <div className="space-y-6">
            {/* Timeframe Selector */}
            <div className="flex items-center gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 text-[var(--color-text-secondary)]">
                <CalendarRange className="w-4 h-4" />
                <span className="text-xs font-medium">Timeframe:</span>
              </div>
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-0.5">
                {[
                  { value: '3m', label: '3M' },
                  { value: '6m', label: '6M' },
                  { value: '12m', label: '1Y' },
                  { value: 'ytd', label: 'YTD' },
                  { value: '24m', label: '2Y' },
                  { value: 'custom', label: 'Custom' },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setAnalyticsTimeframe(opt.value)}
                    className={`px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                      analyticsTimeframe === opt.value
                        ? 'bg-white text-[var(--color-primary)] shadow-sm'
                        : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
                    }`}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
              {analyticsTimeframe === 'custom' && (
                <div className="flex items-center gap-2">
                  <input
                    type="date"
                    className="input text-xs py-1.5 px-2 w-36"
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                  />
                  <span className="text-xs text-[var(--color-text-secondary)]">to</span>
                  <input
                    type="date"
                    className="input text-xs py-1.5 px-2 w-36"
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                  />
                </div>
              )}
            </div>

            {analyticsLoading ? (
              <div className="flex items-center justify-center h-48">
                <div className="text-[var(--color-text-secondary)]">Loading analytics...</div>
              </div>
            ) : analytics ? (
              <>
                {/* Stat Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="card p-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-[var(--color-text-secondary)]">Outstanding</span>
                      <AlertCircle className="w-5 h-5 text-blue-600" />
                    </div>
                    <p className="text-2xl font-bold text-[var(--color-text)]">{formatCurrency(analytics.stats.outstanding)}</p>
                    <p className="text-xs text-[var(--color-text-secondary)] mt-1">Unpaid invoices</p>
                  </div>
                  <div className="card p-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-[var(--color-text-secondary)]">Paid This Month</span>
                      <TrendingUp className="w-5 h-5 text-emerald-600" />
                    </div>
                    <p className="text-2xl font-bold text-emerald-600">{formatCurrency(analytics.stats.paidThisMonth)}</p>
                    <p className="text-xs text-[var(--color-text-secondary)] mt-1">Collections this month</p>
                  </div>
                  <div className="card p-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-[var(--color-text-secondary)]">Collection Rate</span>
                      <Activity className="w-5 h-5 text-teal-600" />
                    </div>
                    <p className="text-2xl font-bold text-[var(--color-text)]">{analytics.collectionRate}%</p>
                    <p className="text-xs text-[var(--color-text-secondary)] mt-1">{timeframeLabel}</p>
                  </div>
                  <div className="card p-5">
                    <div className="flex items-center justify-between mb-3">
                      <span className="text-sm text-[var(--color-text-secondary)]">Avg Revenue / Session</span>
                      <DollarSign className="w-5 h-5 text-violet-600" />
                    </div>
                    <p className="text-2xl font-bold text-[var(--color-text)]">{formatCurrency(analytics.avgRevenuePerSession)}</p>
                    <p className="text-xs text-[var(--color-text-secondary)] mt-1">Per signed note · {timeframeLabel}</p>
                  </div>
                </div>

                {/* Revenue Chart */}
                <div className="card p-6">
                  <h3 className="font-semibold text-[var(--color-text)] mb-4 flex items-center gap-2">
                    <TrendingUp className="w-5 h-5 text-teal-500" />
                    Revenue — {timeframeLabel}
                  </h3>
                  <div className="space-y-3">
                    {analytics.revenueByMonth.map((m) => {
                      const maxVal = Math.max(...analytics.revenueByMonth.map(r => Math.max(r.invoiced, r.collected)), 1);
                      return (
                        <div key={m.month} className="flex items-center gap-3">
                          <span className="text-xs text-[var(--color-text-secondary)] w-16 text-right">{formatMonthLabel(m.month)}</span>
                          <div className="flex-1 space-y-1">
                            <div className="flex items-center gap-2">
                              <div className="h-4 rounded bg-blue-200" style={{ width: `${(m.invoiced / maxVal) * 100}%`, minWidth: m.invoiced > 0 ? '2px' : '0' }} />
                              <span className="text-xs text-[var(--color-text-secondary)]">{formatCurrency(m.invoiced)}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="h-4 rounded bg-emerald-400" style={{ width: `${(m.collected / maxVal) * 100}%`, minWidth: m.collected > 0 ? '2px' : '0' }} />
                              <span className="text-xs text-[var(--color-text-secondary)]">{formatCurrency(m.collected)}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                    <div className="flex items-center gap-4 mt-2 ml-20">
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded bg-blue-200" />
                        <span className="text-xs text-[var(--color-text-secondary)]">Invoiced</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <div className="w-3 h-3 rounded bg-emerald-400" />
                        <span className="text-xs text-[var(--color-text-secondary)]">Collected</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Growth Charts */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                  {/* Client Growth */}
                  <div className="card p-6">
                    <h3 className="font-semibold text-[var(--color-text)] mb-4 flex items-center gap-2">
                      <Users className="w-5 h-5 text-blue-500" />
                      New Clients — {timeframeLabel}
                    </h3>
                    <div className="space-y-2">
                      {analytics.clientGrowth.map((m) => {
                        const maxVal = Math.max(...analytics.clientGrowth.map(r => r.newClients), 1);
                        return (
                          <div key={m.month} className="flex items-center gap-3">
                            <span className="text-xs text-[var(--color-text-secondary)] w-16 text-right">{formatMonthLabel(m.month)}</span>
                            <div className="flex-1 flex items-center gap-2">
                              <div className="h-5 rounded bg-blue-300" style={{ width: `${(m.newClients / maxVal) * 100}%`, minWidth: m.newClients > 0 ? '2px' : '0' }} />
                              <span className="text-xs font-medium text-[var(--color-text)]">{m.newClients}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  {/* Sessions Volume */}
                  <div className="card p-6">
                    <h3 className="font-semibold text-[var(--color-text)] mb-4 flex items-center gap-2">
                      <Activity className="w-5 h-5 text-teal-500" />
                      Sessions — {timeframeLabel}
                    </h3>
                    <div className="space-y-2">
                      {analytics.sessionsVolume.map((m) => {
                        const maxVal = Math.max(...analytics.sessionsVolume.map(r => r.sessions), 1);
                        return (
                          <div key={m.month} className="flex items-center gap-3">
                            <span className="text-xs text-[var(--color-text-secondary)] w-16 text-right">{formatMonthLabel(m.month)}</span>
                            <div className="flex-1 flex items-center gap-2">
                              <div className="h-5 rounded bg-teal-300" style={{ width: `${(m.sessions / maxVal) * 100}%`, minWidth: m.sessions > 0 ? '2px' : '0' }} />
                              <span className="text-xs font-medium text-[var(--color-text)]">{m.sessions}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-48">
                <div className="text-[var(--color-text-secondary)]">No analytics data available</div>
              </div>
            )}
          </div>
        </ProFeatureGate>
      )}

      {/* Stripe Payments Tab (Pro) */}
      {activeTab === 'stripe' && (
        <ProFeatureGate feature="stripe_billing" lockedMessage="Upgrade to Pro to accept credit card payments through Stripe.">
          <div className="space-y-6 max-w-2xl">
            {/* Stripe Integration Setup */}
            <div className="card p-6">
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-lg bg-purple-100 flex items-center justify-center">
                  <Zap className="w-5 h-5 text-purple-600" />
                </div>
                <div>
                  <h3 className="font-semibold text-[var(--color-text)]">Stripe Integration</h3>
                  <p className="text-sm text-[var(--color-text-secondary)]">
                    Accept credit card payments from clients
                  </p>
                </div>
              </div>

              {!secureStorageAvailable && (
                <div className="p-3 bg-amber-50 rounded-lg mb-4">
                  <p className="text-sm text-amber-700">
                    <AlertCircle className="w-4 h-4 inline mr-1" />
                    Secure storage is not available on this system. API keys will be stored with basic
                    obfuscation only.
                  </p>
                </div>
              )}

              {stripeKeyMasked ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text)]">API Key</p>
                      <p className="text-sm font-mono text-[var(--color-text-secondary)]">{stripeKeyMasked}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                        <CheckCircle className="w-3 h-3" />
                        Connected
                      </span>
                      <button onClick={handleRemoveStripeKey} className="p-2 rounded hover:bg-red-50 text-red-500" title="Remove API Key">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <div className="p-3 bg-blue-50 rounded-lg">
                    <p className="text-sm text-blue-700">
                      Your Stripe API key is stored securely using OS-level encryption
                      {secureStorageAvailable ? ' (Windows Credential Manager / macOS Keychain)' : ' (fallback mode)'}.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="space-y-4">
                  {showStripeSetup ? (
                    <div className="space-y-5">
                      <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-4">
                        <h4 className="font-medium text-emerald-800 mb-3">
                          <span className="inline-flex items-center gap-1.5">
                            <CheckCircle className="w-4 h-4" />
                            Recommended: Create a Restricted Key
                          </span>
                        </h4>
                        <p className="text-sm text-emerald-700 mb-3">
                          Stripe recommends using restricted keys for third-party apps. This limits what PocketChart can access.
                        </p>
                        <ol className="space-y-2 text-sm text-emerald-700">
                          <li className="flex gap-2">
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-200 text-emerald-800 flex items-center justify-center text-xs font-bold">1</span>
                            <span>Go to your <a
                              href="https://dashboard.stripe.com/apikeys"
                              onClick={(e) => { e.preventDefault(); window.api.shell.openExternal('https://dashboard.stripe.com/apikeys'); }}
                              className="font-medium underline text-emerald-700 hover:text-emerald-900 cursor-pointer"
                            >Stripe Dashboard &rarr; API Keys</a></span>
                          </li>
                          <li className="flex gap-2">
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-200 text-emerald-800 flex items-center justify-center text-xs font-bold">2</span>
                            <span>Click <strong>"Create restricted key"</strong></span>
                          </li>
                          <li className="flex gap-2">
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-200 text-emerald-800 flex items-center justify-center text-xs font-bold">3</span>
                            <span>Name it <code className="bg-emerald-100 px-1 rounded">PocketChart</code></span>
                          </li>
                          <li className="flex gap-2">
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-200 text-emerald-800 flex items-center justify-center text-xs font-bold">4</span>
                            <div>
                              <span>Enable these permissions (Write access):</span>
                              <ul className="ml-4 mt-1 space-y-0.5 text-xs">
                                <li>• <strong>Charges</strong> - to process payments</li>
                                <li>• <strong>Customers</strong> - to save customer info</li>
                                <li>• <strong>Payment Intents</strong> - for payment flows</li>
                              </ul>
                            </div>
                          </li>
                          <li className="flex gap-2">
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-200 text-emerald-800 flex items-center justify-center text-xs font-bold">5</span>
                            <span>For the URL field, enter your business website or <code className="bg-emerald-100 px-1 rounded">https://pocketchart.app</code></span>
                          </li>
                          <li className="flex gap-2">
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-200 text-emerald-800 flex items-center justify-center text-xs font-bold">6</span>
                            <span>Click "Create key" and copy the key (starts with <code className="bg-emerald-100 px-1 rounded">rk_live_</code> or <code className="bg-emerald-100 px-1 rounded">rk_test_</code>)</span>
                          </li>
                          <li className="flex gap-2">
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-200 text-emerald-800 flex items-center justify-center text-xs font-bold">7</span>
                            <span>Paste it below</span>
                          </li>
                        </ol>
                      </div>

                      <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                        <p className="text-sm text-amber-700">
                          <strong>Note:</strong> Use a <strong>Restricted key</strong> (starts with <code className="bg-amber-100 px-1 rounded">rk_</code>) for best security,
                          or a Secret key (<code className="bg-amber-100 px-1 rounded">sk_</code>) if needed.
                          Never use the Publishable key (<code className="bg-amber-100 px-1 rounded">pk_</code>).
                        </p>
                      </div>

                      <div>
                        <label className="label">Stripe API Key</label>
                        <input
                          type="password"
                          className="input font-mono"
                          placeholder="rk_live_... or rk_test_... (restricted key)"
                          value={stripeKeyInput}
                          onChange={(e) => setStripeKeyInput(e.target.value)}
                        />
                        {stripeKeyInput && stripeKeyInput.startsWith('pk_') && (
                          <p className="text-xs text-red-600 mt-1.5">This is a Publishable key. You need a Restricted key (rk_) or Secret key (sk_) instead.</p>
                        )}
                        {stripeKeyInput && !stripeKeyInput.startsWith('rk_') && !stripeKeyInput.startsWith('sk_') && !stripeKeyInput.startsWith('pk_') && stripeKeyInput.length > 3 && (
                          <p className="text-xs text-red-600 mt-1.5">This doesn't look like a valid Stripe key. It should start with "rk_" (restricted) or "sk_" (secret).</p>
                        )}
                        {stripeKeyInput && stripeKeyInput.startsWith('rk_test_') && (
                          <p className="text-xs text-amber-600 mt-1.5">Restricted test key - great for testing! Use rk_live_ for real payments.</p>
                        )}
                        {stripeKeyInput && stripeKeyInput.startsWith('rk_live_') && (
                          <p className="text-xs text-emerald-600 mt-1.5">Live restricted key - secure and ready for real payments!</p>
                        )}
                        {stripeKeyInput && stripeKeyInput.startsWith('sk_test_') && (
                          <p className="text-xs text-amber-600 mt-1.5">Secret test key detected. Consider using a restricted key (rk_) for better security.</p>
                        )}
                        {stripeKeyInput && stripeKeyInput.startsWith('sk_live_') && (
                          <p className="text-xs text-amber-600 mt-1.5">Live secret key detected. For better security, consider creating a restricted key (rk_) instead.</p>
                        )}
                      </div>
                      <div className="flex gap-2">
                        <button className="btn-primary" onClick={handleSaveStripeKey} disabled={!stripeKeyInput.startsWith('rk_') && !stripeKeyInput.startsWith('sk_')}>
                          Save API Key
                        </button>
                        <button className="btn-ghost" onClick={() => setShowStripeSetup(false)}>Cancel</button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      <p className="text-sm text-[var(--color-text-secondary)]">
                        Connect your Stripe account to accept credit card payments directly from invoices. You'll need a Stripe account (free to create).
                      </p>
                      <div className="flex gap-2">
                        <button className="btn-primary gap-2" onClick={() => setShowStripeSetup(true)}>
                          <CreditCard className="w-4 h-4" />
                          Connect Stripe
                        </button>
                        <button onClick={() => window.api.shell.openExternal('https://dashboard.stripe.com/register')} className="btn-ghost gap-2">
                          <ExternalLink className="w-4 h-4" />
                          Create Stripe Account
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Recent Stripe Payments */}
            {stripeKeyMasked && (
              <div className="card">
                <div className="flex items-center gap-2 p-4 border-b border-[var(--color-border)]">
                  <CreditCard className="w-5 h-5 text-purple-500" />
                  <h3 className="font-semibold text-[var(--color-text)]">Recent Card Payments</h3>
                </div>
                <div className="divide-y divide-[var(--color-border)]">
                  {payments
                    .filter(p => p.payment_method === 'card')
                    .slice(0, 10)
                    .map((payment) => (
                      <div key={payment.id} className="flex items-center justify-between p-4 hover:bg-gray-50">
                        <div>
                          <p className="font-medium text-[var(--color-text)]">{getClientName(payment.client_id)}</p>
                          <p className="text-sm text-[var(--color-text-secondary)]">{payment.payment_date}</p>
                        </div>
                        <p className="font-medium text-emerald-600">+{formatCurrency(payment.amount)}</p>
                      </div>
                    ))}
                  {payments.filter(p => p.payment_method === 'card').length === 0 && (
                    <div className="p-8 text-center text-[var(--color-text-secondary)]">
                      No card payments recorded yet
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </ProFeatureGate>
      )}

      {/* Modals */}
      <InvoiceModal
        isOpen={showInvoiceModal}
        onClose={() => {
          setShowInvoiceModal(false);
          setEditingInvoice(null);
        }}
        onSave={() => {
          loadData();
        }}
        clients={clients}
        entities={entities}
        feeSchedule={feeSchedule}
        invoice={editingInvoice || undefined}
      />

      <PaymentModal
        isOpen={showPaymentModal}
        onClose={() => setShowPaymentModal(false)}
        onSave={() => {
          loadData();
        }}
        clients={clients}
        invoices={invoices}
      />

      <CSVPaymentImportModal
        isOpen={showCsvImport}
        onClose={() => setShowCsvImport(false)}
        onComplete={() => loadData()}
        clients={clients}
        invoices={invoices}
      />

      {/* CMS-1500 Preview Modal */}
      {cms1500Preview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setCms1500Preview(null)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
              <h3 className="text-lg font-semibold text-[var(--color-text)] flex items-center gap-2">
                <CheckCircle size={20} className="text-emerald-500" />
                Claim Forms Generated
              </h3>
              <button onClick={() => setCms1500Preview(null)} className="p-1 rounded-lg hover:bg-gray-100">
                <span className="text-[var(--color-text-secondary)] text-lg">&times;</span>
              </button>
            </div>

            {/* Summary */}
            <div className="px-6 py-4 space-y-3">
              <div className="flex items-center gap-3 text-sm text-[var(--color-text)]">
                <FileText size={16} className="text-indigo-500" />
                <span>
                  {cms1500Preview.pdfs.length === 1
                    ? `1 claim form ready`
                    : `${cms1500Preview.pdfs.length} claim forms ready`}
                  {' '}({cms1500Preview.notesMarked.length} note{cms1500Preview.notesMarked.length !== 1 ? 's' : ''})
                </span>
              </div>
              <div className="bg-gray-50 rounded-lg p-3 space-y-1.5">
                {cms1500Preview.pdfs.map((pdf, i) => (
                  <div key={i} className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                    <ClipboardList size={12} />
                    <span className="font-mono">{pdf.filename}</span>
                  </div>
                ))}
              </div>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Open in your PDF viewer to review, then save when ready. Notes will be marked as billed after saving.
              </p>
            </div>

            {/* Actions */}
            <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--color-border)]">
              <button
                className="btn-ghost text-sm"
                onClick={() => setCms1500Preview(null)}
              >
                Cancel
              </button>
              <button
                className="btn-secondary gap-1.5"
                onClick={handlePreviewOpen}
              >
                <Eye size={14} />
                Open in Viewer
              </button>
              <button
                className="btn-primary gap-1.5"
                onClick={handlePreviewSave}
                disabled={cms1500Saving}
              >
                {cms1500Saving ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Download size={14} />
                )}
                {cms1500Saving ? 'Saving...' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Trial Expired Modal */}
      {showExpiredModal && <TrialExpiredModal onClose={dismissExpiredModal} />}
    </div>
  );
}
