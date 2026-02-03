import React, { useState, useEffect, useCallback } from 'react';
import {
  DollarSign,
  CreditCard,
  FileText,
  Receipt,
  Settings,
  Plus,
  Search,
  Filter,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  ChevronRight,
  Download,
  Eye,
  EyeOff,
  Trash2,
  Edit2,
  RefreshCw,
  ExternalLink,
  Zap,
  Send,
} from 'lucide-react';
import type {
  Invoice,
  InvoiceItem,
  Payment,
  FeeScheduleEntry,
  Client,
  InvoiceStatus,
  PaymentMethod,
} from '../../shared/types';
import InvoiceModal from '../components/InvoiceModal';
import PaymentModal from '../components/PaymentModal';
import FeeScheduleModal from '../components/FeeScheduleModal';

type BillingTab = 'dashboard' | 'invoices' | 'payments' | 'fee-schedule' | 'settings';

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
  const [activeTab, setActiveTab] = useState<BillingTab>('dashboard');
  const [toast, setToast] = useState<string | null>(null);

  // Dashboard stats
  const [stats, setStats] = useState({
    totalOutstanding: 0,
    totalPaidThisMonth: 0,
    invoicesDraft: 0,
    invoicesOverdue: 0,
  });

  // Data
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [feeSchedule, setFeeSchedule] = useState<FeeScheduleEntry[]>([]);
  const [clients, setClients] = useState<Client[]>([]);

  // Stripe settings
  const [stripeKeyMasked, setStripeKeyMasked] = useState<string | null>(null);
  const [stripeKeyInput, setStripeKeyInput] = useState('');
  const [showStripeSetup, setShowStripeSetup] = useState(false);
  const [secureStorageAvailable, setSecureStorageAvailable] = useState(false);

  // Loading states
  const [loading, setLoading] = useState(true);

  // Filters
  const [invoiceFilter, setInvoiceFilter] = useState<InvoiceStatus | 'all'>('all');
  const [searchTerm, setSearchTerm] = useState('');

  // Modals
  const [showInvoiceModal, setShowInvoiceModal] = useState(false);
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [showFeeModal, setShowFeeModal] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<(Invoice & { items: InvoiceItem[] }) | null>(null);
  const [editingFee, setEditingFee] = useState<FeeScheduleEntry | null>(null);

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
        secureAvailable,
        stripeMasked,
      ] = await Promise.all([
        window.api.invoices.list(),
        window.api.payments.list(),
        window.api.feeSchedule.list(),
        window.api.clients.list(),
        window.api.secureStorage.isAvailable(),
        window.api.secureStorage.getMasked('stripe_secret_key'),
      ]);

      setInvoices(invoicesData);
      setPayments(paymentsData);
      setFeeSchedule(feeData);
      setClients(clientsData);
      setSecureStorageAvailable(secureAvailable);
      setStripeKeyMasked(stripeMasked);

      // Calculate stats
      const now = new Date();
      const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

      const outstanding = invoicesData
        .filter((i) => i.status !== 'paid' && i.status !== 'void')
        .reduce((sum, i) => sum + i.total_amount, 0);

      const paidThisMonth = paymentsData
        .filter((p) => p.payment_date >= startOfMonth)
        .reduce((sum, p) => sum + p.amount, 0);

      const drafts = invoicesData.filter((i) => i.status === 'draft').length;
      const overdue = invoicesData.filter((i) => i.status === 'overdue').length;

      setStats({
        totalOutstanding: outstanding,
        totalPaidThisMonth: paidThisMonth,
        invoicesDraft: drafts,
        invoicesOverdue: overdue,
      });
    } catch (err) {
      console.error('Failed to load billing data:', err);
      setToast('Failed to load billing data');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleSaveStripeKey = async () => {
    if (!stripeKeyInput.trim()) {
      setToast('Please enter a Stripe API key');
      return;
    }
    // Accept both restricted keys (rk_) and standard secret keys (sk_)
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

  const handleDeleteFee = async (id: number) => {
    if (!confirm('Are you sure you want to delete this fee?')) return;
    try {
      await window.api.feeSchedule.delete(id);
      setFeeSchedule(feeSchedule.filter((f) => f.id !== id));
      setToast('Fee deleted');
    } catch (err) {
      console.error('Failed to delete fee:', err);
      setToast('Failed to delete fee');
    }
  };

  const handleEditFee = (fee: FeeScheduleEntry) => {
    setEditingFee(fee);
    setShowFeeModal(true);
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

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(amount);
  };

  const filteredInvoices = invoices.filter((inv) => {
    if (invoiceFilter !== 'all' && inv.status !== invoiceFilter) return false;
    if (searchTerm) {
      const clientName = getClientName(inv.client_id).toLowerCase();
      return (
        clientName.includes(searchTerm.toLowerCase()) ||
        inv.invoice_number.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    return true;
  });

  // Tab navigation items
  const tabs: Array<{ id: BillingTab; label: string; icon: React.ReactNode }> = [
    { id: 'dashboard', label: 'Dashboard', icon: <TrendingUp className="w-4 h-4" /> },
    { id: 'invoices', label: 'Invoices', icon: <FileText className="w-4 h-4" /> },
    { id: 'payments', label: 'Payments', icon: <DollarSign className="w-4 h-4" /> },
    { id: 'fee-schedule', label: 'Fee Schedule', icon: <Receipt className="w-4 h-4" /> },
    { id: 'settings', label: 'Settings', icon: <Settings className="w-4 h-4" /> },
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
          <DollarSign className="w-7 h-7 text-[var(--color-primary)]" />
          <div>
            <h1 className="page-title">Billing</h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Manage invoices, payments, and fee schedules
            </p>
          </div>
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
          </button>
        ))}
      </div>

      {/* Dashboard Tab */}
      {activeTab === 'dashboard' && (
        <div className="space-y-6">
          {/* Stats Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-[var(--color-text-secondary)]">Outstanding</span>
                <AlertCircle className="w-5 h-5 text-amber-500" />
              </div>
              <p className="text-2xl font-bold text-[var(--color-text)]">
                {formatCurrency(stats.totalOutstanding)}
              </p>
              <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                Unpaid invoices
              </p>
            </div>

            <div className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-[var(--color-text-secondary)]">Paid This Month</span>
                <TrendingUp className="w-5 h-5 text-emerald-500" />
              </div>
              <p className="text-2xl font-bold text-[var(--color-text)]">
                {formatCurrency(stats.totalPaidThisMonth)}
              </p>
              <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                {payments.filter((p) => {
                  const now = new Date();
                  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
                    .toISOString()
                    .slice(0, 10);
                  return p.payment_date >= startOfMonth;
                }).length}{' '}
                payments
              </p>
            </div>

            <div className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-[var(--color-text-secondary)]">Draft Invoices</span>
                <FileText className="w-5 h-5 text-gray-400" />
              </div>
              <p className="text-2xl font-bold text-[var(--color-text)]">{stats.invoicesDraft}</p>
              <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                Ready to send
              </p>
            </div>

            <div className="card p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-sm text-[var(--color-text-secondary)]">Overdue</span>
                <Clock className="w-5 h-5 text-red-500" />
              </div>
              <p className="text-2xl font-bold text-red-600">{stats.invoicesOverdue}</p>
              <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                Need attention
              </p>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Recent Invoices */}
            <div className="card">
              <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
                <h3 className="font-semibold text-[var(--color-text)]">Recent Invoices</h3>
                <button
                  onClick={() => setActiveTab('invoices')}
                  className="text-sm text-[var(--color-primary)] hover:underline flex items-center gap-1"
                >
                  View all <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="divide-y divide-[var(--color-border)]">
                {invoices.slice(0, 5).map((invoice) => (
                  <div
                    key={invoice.id}
                    className="flex items-center justify-between p-4 hover:bg-gray-50"
                  >
                    <div>
                      <p className="font-medium text-[var(--color-text)]">
                        {invoice.invoice_number}
                      </p>
                      <p className="text-sm text-[var(--color-text-secondary)]">
                        {getClientName(invoice.client_id)}
                      </p>
                    </div>
                    <div className="text-right">
                      <p className="font-medium text-[var(--color-text)]">
                        {formatCurrency(invoice.total_amount)}
                      </p>
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          STATUS_COLORS[invoice.status].bg
                        } ${STATUS_COLORS[invoice.status].text}`}
                      >
                        {invoice.status}
                      </span>
                    </div>
                  </div>
                ))}
                {invoices.length === 0 && (
                  <div className="p-8 text-center text-[var(--color-text-secondary)]">
                    No invoices yet
                  </div>
                )}
              </div>
            </div>

            {/* Recent Payments */}
            <div className="card">
              <div className="flex items-center justify-between p-4 border-b border-[var(--color-border)]">
                <h3 className="font-semibold text-[var(--color-text)]">Recent Payments</h3>
                <button
                  onClick={() => setActiveTab('payments')}
                  className="text-sm text-[var(--color-primary)] hover:underline flex items-center gap-1"
                >
                  View all <ChevronRight className="w-4 h-4" />
                </button>
              </div>
              <div className="divide-y divide-[var(--color-border)]">
                {payments.slice(0, 5).map((payment) => (
                  <div
                    key={payment.id}
                    className="flex items-center justify-between p-4 hover:bg-gray-50"
                  >
                    <div>
                      <p className="font-medium text-[var(--color-text)]">
                        {getClientName(payment.client_id)}
                      </p>
                      <p className="text-sm text-[var(--color-text-secondary)]">
                        {payment.payment_date} &middot;{' '}
                        {PAYMENT_METHOD_LABELS[payment.payment_method]}
                      </p>
                    </div>
                    <p className="font-medium text-emerald-600">
                      +{formatCurrency(payment.amount)}
                    </p>
                  </div>
                ))}
                {payments.length === 0 && (
                  <div className="p-8 text-center text-[var(--color-text-secondary)]">
                    No payments yet
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Invoices Tab */}
      {activeTab === 'invoices' && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 flex-1">
              <div className="relative flex-1 max-w-md">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-secondary)]" />
                <input
                  type="text"
                  placeholder="Search invoices..."
                  className="input pl-10"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
              </div>
              <select
                className="select"
                value={invoiceFilter}
                onChange={(e) => setInvoiceFilter(e.target.value as InvoiceStatus | 'all')}
              >
                <option value="all">All Status</option>
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
                setEditingInvoice(null);
                setShowInvoiceModal(true);
              }}
            >
              <Plus className="w-4 h-4" />
              New Invoice
            </button>
          </div>

          {/* Invoice List */}
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-gray-50">
                  <th className="text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider px-4 py-3">
                    Invoice
                  </th>
                  <th className="text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider px-4 py-3">
                    Client
                  </th>
                  <th className="text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider px-4 py-3">
                    Date
                  </th>
                  <th className="text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider px-4 py-3">
                    Amount
                  </th>
                  <th className="text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider px-4 py-3">
                    Status
                  </th>
                  <th className="text-right text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider px-4 py-3">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {filteredInvoices.map((invoice) => (
                  <tr key={invoice.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="font-medium text-[var(--color-text)]">
                        {invoice.invoice_number}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text)]">
                      {getClientName(invoice.client_id)}
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                      {invoice.invoice_date}
                    </td>
                    <td className="px-4 py-3 font-medium text-[var(--color-text)]">
                      {formatCurrency(invoice.total_amount)}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${
                          STATUS_COLORS[invoice.status].bg
                        } ${STATUS_COLORS[invoice.status].text}`}
                      >
                        {invoice.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          className="p-1.5 rounded hover:bg-gray-100 text-[var(--color-text-secondary)]"
                          title="View/Edit"
                          onClick={() => handleViewInvoice(invoice.id)}
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          className="p-1.5 rounded hover:bg-gray-100 text-[var(--color-text-secondary)]"
                          title="Download PDF"
                          onClick={() => handleDownloadInvoicePdf(invoice.id)}
                        >
                          <Download className="w-4 h-4" />
                        </button>
                        {invoice.status === 'draft' && (
                          <button
                            className="p-1.5 rounded hover:bg-blue-50 text-blue-500"
                            title="Mark as Sent"
                            onClick={() => handleMarkAsSent(invoice.id)}
                          >
                            <Send className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          className="p-1.5 rounded hover:bg-red-50 text-red-500"
                          title="Delete"
                          onClick={() => handleDeleteInvoice(invoice.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filteredInvoices.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-[var(--color-text-secondary)]">
                      No invoices found
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
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-secondary)]" />
              <input
                type="text"
                placeholder="Search payments..."
                className="input pl-10"
              />
            </div>
            <button className="btn-primary gap-2" onClick={() => setShowPaymentModal(true)}>
              <Plus className="w-4 h-4" />
              Record Payment
            </button>
          </div>

          {/* Payments List */}
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-gray-50">
                  <th className="text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider px-4 py-3">
                    Date
                  </th>
                  <th className="text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider px-4 py-3">
                    Client
                  </th>
                  <th className="text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider px-4 py-3">
                    Method
                  </th>
                  <th className="text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider px-4 py-3">
                    Reference
                  </th>
                  <th className="text-right text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider px-4 py-3">
                    Amount
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {payments.map((payment) => (
                  <tr key={payment.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-[var(--color-text)]">{payment.payment_date}</td>
                    <td className="px-4 py-3 text-[var(--color-text)]">
                      {getClientName(payment.client_id)}
                    </td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-[var(--color-text-secondary)]">
                        {payment.payment_method === 'card' && <CreditCard className="w-4 h-4" />}
                        {PAYMENT_METHOD_LABELS[payment.payment_method]}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                      {payment.reference_number || '-'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-emerald-600">
                      {formatCurrency(payment.amount)}
                    </td>
                  </tr>
                ))}
                {payments.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-[var(--color-text-secondary)]">
                      No payments recorded yet
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Fee Schedule Tab */}
      {activeTab === 'fee-schedule' && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex items-center justify-between gap-4">
            <p className="text-sm text-[var(--color-text-secondary)]">
              Configure your standard fees for CPT codes. These will be used when generating invoices.
            </p>
            <button
              className="btn-primary gap-2"
              onClick={() => {
                setEditingFee(null);
                setShowFeeModal(true);
              }}
            >
              <Plus className="w-4 h-4" />
              Add Fee
            </button>
          </div>

          {/* Fee Schedule List */}
          <div className="card overflow-hidden">
            <table className="w-full">
              <thead>
                <tr className="border-b border-[var(--color-border)] bg-gray-50">
                  <th className="text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider px-4 py-3">
                    CPT Code
                  </th>
                  <th className="text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider px-4 py-3">
                    Description
                  </th>
                  <th className="text-center text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider px-4 py-3">
                    Default Units
                  </th>
                  <th className="text-right text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider px-4 py-3">
                    Amount
                  </th>
                  <th className="text-right text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider px-4 py-3">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border)]">
                {feeSchedule.map((fee) => (
                  <tr key={fee.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3">
                      <span className="font-mono font-medium text-[var(--color-text)]">
                        {fee.cpt_code}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-[var(--color-text)]">{fee.description}</td>
                    <td className="px-4 py-3 text-center text-[var(--color-text-secondary)]">
                      {fee.default_units}
                    </td>
                    <td className="px-4 py-3 text-right font-medium text-[var(--color-text)]">
                      {formatCurrency(fee.amount)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          className="p-1.5 rounded hover:bg-gray-100 text-[var(--color-text-secondary)]"
                          title="Edit"
                          onClick={() => handleEditFee(fee)}
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          className="p-1.5 rounded hover:bg-red-50 text-red-500"
                          title="Delete"
                          onClick={() => handleDeleteFee(fee.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
                {feeSchedule.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-[var(--color-text-secondary)]">
                      No fee schedule entries. Add your first CPT code fee.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Settings Tab */}
      {activeTab === 'settings' && (
        <div className="space-y-6 max-w-2xl">
          {/* Stripe Integration */}
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
                    <p className="text-sm font-mono text-[var(--color-text-secondary)]">
                      {stripeKeyMasked}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                      <CheckCircle className="w-3 h-3" />
                      Connected
                    </span>
                    <button
                      onClick={handleRemoveStripeKey}
                      className="p-2 rounded hover:bg-red-50 text-red-500"
                      title="Remove API Key"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                <div className="p-3 bg-blue-50 rounded-lg">
                  <p className="text-sm text-blue-700">
                    Your Stripe API key is stored securely using OS-level encryption
                    {secureStorageAvailable
                      ? ' (Windows Credential Manager / macOS Keychain)'
                      : ' (fallback mode)'}
                    .
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {showStripeSetup ? (
                  <div className="space-y-5">
                    {/* Step-by-step guide for Restricted Key (Best Practice) */}
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
                          <span>Go to your <button onClick={() => window.api.shell.openExternal('https://dashboard.stripe.com/apikeys')} className="font-medium underline text-emerald-700 hover:text-emerald-900 cursor-pointer">Stripe Dashboard → API Keys</button></span>
                        </li>
                        <li className="flex gap-2">
                          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-200 text-emerald-800 flex items-center justify-center text-xs font-bold">2</span>
                          <span>Click <strong>"Create restricted key"</strong> button</span>
                        </li>
                        <li className="flex gap-2">
                          <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-200 text-emerald-800 flex items-center justify-center text-xs font-bold">3</span>
                          <span>Name it something like <code className="bg-emerald-100 px-1 rounded">PocketChart</code></span>
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

                    {/* Warning about key types */}
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
                        <p className="text-xs text-red-600 mt-1.5">
                          ❌ This is a Publishable key. You need a Restricted key (rk_) or Secret key (sk_) instead.
                        </p>
                      )}
                      {stripeKeyInput && !stripeKeyInput.startsWith('rk_') && !stripeKeyInput.startsWith('sk_') && !stripeKeyInput.startsWith('pk_') && stripeKeyInput.length > 3 && (
                        <p className="text-xs text-red-600 mt-1.5">
                          ⚠️ This doesn't look like a valid Stripe key. It should start with "rk_" (restricted) or "sk_" (secret).
                        </p>
                      )}
                      {stripeKeyInput && stripeKeyInput.startsWith('rk_test_') && (
                        <p className="text-xs text-amber-600 mt-1.5">
                          ℹ️ Restricted test key - great for testing! Use rk_live_ for real payments.
                        </p>
                      )}
                      {stripeKeyInput && stripeKeyInput.startsWith('rk_live_') && (
                        <p className="text-xs text-emerald-600 mt-1.5">
                          ✓ Live restricted key - secure and ready for real payments!
                        </p>
                      )}
                      {stripeKeyInput && stripeKeyInput.startsWith('sk_test_') && (
                        <p className="text-xs text-amber-600 mt-1.5">
                          ℹ️ Secret test key detected. Consider using a restricted key (rk_) for better security.
                        </p>
                      )}
                      {stripeKeyInput && stripeKeyInput.startsWith('sk_live_') && (
                        <p className="text-xs text-amber-600 mt-1.5">
                          ⚠️ Live secret key detected. For better security, consider creating a restricted key (rk_) instead.
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      <button
                        className="btn-primary"
                        onClick={handleSaveStripeKey}
                        disabled={!stripeKeyInput.startsWith('rk_') && !stripeKeyInput.startsWith('sk_')}
                      >
                        Save API Key
                      </button>
                      <button className="btn-ghost" onClick={() => setShowStripeSetup(false)}>
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <p className="text-sm text-[var(--color-text-secondary)]">
                      Connect your Stripe account to accept credit card payments directly from
                      invoices. You'll need a Stripe account (free to create).
                    </p>
                    <div className="flex gap-2">
                      <button
                        className="btn-primary gap-2"
                        onClick={() => setShowStripeSetup(true)}
                      >
                        <CreditCard className="w-4 h-4" />
                        Connect Stripe
                      </button>
                      <button
                        onClick={() => window.api.shell.openExternal('https://dashboard.stripe.com/register')}
                        className="btn-ghost gap-2"
                      >
                        <ExternalLink className="w-4 h-4" />
                        Create Stripe Account
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Invoice Settings */}
          <div className="card p-6">
            <h3 className="font-semibold text-[var(--color-text)] mb-4">Invoice Settings</h3>
            <div className="space-y-4">
              <div>
                <label className="label">Default Payment Terms</label>
                <select className="select">
                  <option value="0">Due on Receipt</option>
                  <option value="15">Net 15</option>
                  <option value="30">Net 30</option>
                  <option value="45">Net 45</option>
                  <option value="60">Net 60</option>
                </select>
              </div>
              <div>
                <label className="label">Invoice Notes (appears on all invoices)</label>
                <textarea
                  className="input"
                  rows={3}
                  placeholder="e.g., Thank you for your business!"
                />
              </div>
            </div>
          </div>
        </div>
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

      <FeeScheduleModal
        isOpen={showFeeModal}
        onClose={() => {
          setShowFeeModal(false);
          setEditingFee(null);
        }}
        onSave={() => {
          loadData();
        }}
        fee={editingFee || undefined}
      />
    </div>
  );
}
