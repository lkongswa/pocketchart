import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  FileText, DollarSign, CheckCircle, ArrowRight,
  AlertCircle, CreditCard, Eye, Loader2, ChevronRight, List, LayoutGrid,
} from 'lucide-react';
import type { PipelineData, Invoice, Client, FeeScheduleEntry } from '../../shared/types';
import CollectionPopover from './CollectionPopover';
import PaymentModal from './PaymentModal';
import { useLocalPreference } from '../hooks/useLocalPreference';

// ── Helpers ──

const formatShortDate = (dateStr: string): string => {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const getStalenessClass = (days: number): string => {
  if (days >= 14) return 'border-l-4 border-l-red-400 bg-red-50/50';
  if (days >= 8) return 'border-l-4 border-l-amber-400 bg-amber-50/50';
  if (days >= 4) return 'border-l-4 border-l-amber-300';
  return '';
};

const formatCptDisplay = (item: { cpt_code?: string; cpt_codes?: string }): string => {
  if (item.cpt_codes) {
    try {
      const parsed = JSON.parse(item.cpt_codes);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.map((l: any) => l.code).filter(Boolean).join(', ');
      }
    } catch { /* ignore */ }
  }
  return item.cpt_code || '';
};

// ── Shared Card Wrapper ──

function PipelineCard({ children, daysOld, onClick }: { children: React.ReactNode; daysOld?: number; onClick?: () => void }) {
  const staleness = daysOld !== undefined ? getStalenessClass(daysOld) : '';
  return (
    <div
      className={`bg-white rounded-lg border border-gray-200 px-2.5 py-2 hover:shadow-sm transition-shadow ${onClick ? 'cursor-pointer' : ''} ${staleness}`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

// ── Compact Row (one-line per pipeline item) ──

function CompactRow({ name, date, amount, entityName, isExpanded, onClick, children }: {
  name: string;
  date: string;
  amount?: string | null;
  entityName?: string | null;
  isExpanded: boolean;
  onClick: () => void;
  children?: React.ReactNode;
}) {
  return (
    <div>
      <div
        className="flex items-center gap-2 px-2 py-1.5 text-xs cursor-pointer hover:bg-white/80 rounded transition-colors"
        onClick={onClick}
      >
        <span className="font-medium text-[var(--color-text)] truncate flex-1 min-w-0">{name}</span>
        <span className="text-[var(--color-text-secondary)] shrink-0">{date}</span>
        {entityName && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 truncate max-w-[80px] shrink-0">{entityName}</span>
        )}
        {amount && <span className="font-semibold text-[var(--color-text)] shrink-0">{amount}</span>}
        <ChevronRight size={12} className={`text-gray-300 shrink-0 transition-transform duration-150 ${isExpanded ? 'rotate-90' : ''}`} />
      </div>
      {isExpanded && (
        <div className="px-1 pb-1">{children}</div>
      )}
    </div>
  );
}

// ── Column Component ──

interface PipelineColumnProps {
  icon: string;
  label: string;
  subtitle: string;
  count: number;
  totalAmount: number | null;
  accentColor: 'gray' | 'blue' | 'amber' | 'purple' | 'green';
  children: React.ReactNode;
  draftCount?: number;
}

const colorMap = {
  gray:   { bg: 'bg-gray-50',   border: 'border-gray-200',   badge: 'bg-gray-200 text-gray-700',   headerText: 'text-gray-700' },
  blue:   { bg: 'bg-blue-50',   border: 'border-blue-200',   badge: 'bg-blue-200 text-blue-700',   headerText: 'text-blue-700' },
  amber:  { bg: 'bg-amber-50',  border: 'border-amber-200',  badge: 'bg-amber-200 text-amber-700',  headerText: 'text-amber-700' },
  purple: { bg: 'bg-purple-50', border: 'border-purple-200', badge: 'bg-purple-200 text-purple-700', headerText: 'text-purple-700' },
  green:  { bg: 'bg-green-50',  border: 'border-green-200',  badge: 'bg-green-200 text-green-700',  headerText: 'text-green-700' },
};

function PipelineColumn({ icon, label, subtitle, count, totalAmount, accentColor, children, draftCount }: PipelineColumnProps) {
  const colors = colorMap[accentColor];
  const isEmpty = count === 0;

  return (
    <div className={`flex flex-col min-w-0 flex-1 rounded-xl border ${colors.border} ${colors.bg} ${isEmpty ? 'opacity-60' : ''}`}>
      <div className="px-2.5 py-2 border-b border-inherit">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-sm">{icon}</span>
          <h3 className={`text-xs font-semibold ${colors.headerText} truncate`}>{label}</h3>
          <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${colors.badge}`}>{count}</span>
        </div>
        {isEmpty && totalAmount !== null ? (
          <div className="flex items-center gap-1 text-xs text-green-600">
            <CheckCircle size={11} /> <span>All clear</span>
          </div>
        ) : totalAmount !== null && totalAmount > 0 ? (
          <p className={`text-xs font-bold ${colors.headerText}`}>
            ${totalAmount.toLocaleString('en-US', { minimumFractionDigits: 2 })}
          </p>
        ) : null}
      </div>

      <div className="flex-1 p-1.5 space-y-1.5 overflow-y-auto max-h-[500px]">
        {draftCount !== undefined && draftCount > 0 && (
          <div className="px-3 py-2 rounded-lg bg-white border border-dashed border-amber-300 text-xs text-amber-700">
            <strong>{draftCount} draft invoice{draftCount > 1 ? 's' : ''}</strong> not sent yet
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

// ── Summary Bar ──

function FlowBar() {
  const steps = ['Notes', 'Signatures', 'Invoices', 'Collect Payments', 'Paid'];
  return (
    <div className="flex items-center gap-1.5 px-4 py-2.5 rounded-lg bg-white border border-gray-200 text-sm">
      <span className="font-semibold text-[var(--color-text)] mr-1">Revenue Pipeline</span>
      <span className="text-gray-300 mx-1">|</span>
      {steps.map((step, i) => (
        <React.Fragment key={step}>
          <span className="text-[var(--color-text-secondary)] text-xs">{step}</span>
          {i < steps.length - 1 && <ArrowRight size={11} className="text-gray-300 shrink-0" />}
        </React.Fragment>
      ))}
    </div>
  );
}

// ── Card Components ──

function NeedsNoteCard({ item, onAction, onBillNow, onUndoBill, billingInProgress, feeSchedule }: {
  item: PipelineData['needsNote'][0];
  onAction: () => void;
  onBillNow?: (cptCode?: string) => void;
  onUndoBill?: (invoiceId: number) => void;
  billingInProgress?: boolean;
  feeSchedule: FeeScheduleEntry[];
}) {
  const isBilled = item.already_billed === 1;
  const [showCptPicker, setShowCptPicker] = useState(false);
  const [cptSearch, setCptSearch] = useState('');

  const filteredCpts = cptSearch.length > 0
    ? feeSchedule.filter(f =>
        f.cpt_code.toLowerCase().includes(cptSearch.toLowerCase()) ||
        (f.description || '').toLowerCase().includes(cptSearch.toLowerCase())
      ).slice(0, 8)
    : feeSchedule.slice(0, 8);

  const handleBillClick = () => {
    if (item.default_cpt_code) {
      onBillNow?.();
    } else {
      setShowCptPicker(true);
    }
  };

  const handleCptSelect = (cptCode: string) => {
    setShowCptPicker(false);
    setCptSearch('');
    onBillNow?.(cptCode);
  };

  return (
    <PipelineCard daysOld={item.days_old} onClick={onAction}>
      <div className="flex justify-between items-start mb-1">
        <span className="text-sm font-medium text-[var(--color-text)] flex items-center gap-1">
          {item.first_name} {item.last_name}
          {isBilled && (
            <button
              className="cursor-pointer hover:opacity-70 transition-opacity"
              title="Invoiced — click to undo"
              onClick={(e) => {
                e.stopPropagation();
                if (item.billed_invoice_id && onUndoBill) onUndoBill(item.billed_invoice_id);
              }}
            >🧾</button>
          )}
        </span>
        <span className="text-xs text-[var(--color-text-tertiary)]">
          {formatShortDate(item.scheduled_date)}
        </span>
      </div>
      {item.entity_name && (
        <p className="text-xs text-[var(--color-text-secondary)]">{item.entity_name}</p>
      )}
      {item.days_old >= 4 && (
        <p className="text-xs text-amber-600 mt-1">{item.days_old} days ago</p>
      )}

      {showCptPicker && (
        <div className="mt-2 relative" onClick={(e) => e.stopPropagation()}>
          <input
            type="text"
            placeholder="Search CPT code..."
            className="input input-sm w-full text-xs"
            value={cptSearch}
            onChange={(e) => setCptSearch(e.target.value)}
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Escape') { setShowCptPicker(false); setCptSearch(''); }
            }}
          />
          <div className="absolute z-50 mt-1 w-full bg-white rounded-lg shadow-lg border border-gray-200 max-h-40 overflow-y-auto">
            {filteredCpts.map((f) => (
              <button
                key={f.id}
                className="w-full text-left px-2.5 py-1.5 text-xs hover:bg-gray-50 flex justify-between items-center cursor-pointer"
                onClick={() => handleCptSelect(f.cpt_code)}
              >
                <span>
                  <span className="font-medium">{f.cpt_code}</span>
                  {f.description && <span className="text-[var(--color-text-tertiary)] ml-1">{f.description}</span>}
                </span>
                <span className="text-[var(--color-text-secondary)] font-medium">${f.amount.toFixed(2)}</span>
              </button>
            ))}
            {filteredCpts.length === 0 && (
              <div className="px-2.5 py-2 text-xs text-[var(--color-text-tertiary)]">No CPT codes found</div>
            )}
          </div>
        </div>
      )}

      <div className="flex gap-1.5 mt-2">
        <button
          className="btn-primary btn-sm flex-1 gap-1 cursor-pointer"
          onClick={(e) => { e.stopPropagation(); onAction(); }}
        >
          <FileText size={12} /> Write Note
        </button>
        {!isBilled && onBillNow && (
          <button
            className="btn-ghost btn-sm px-2 gap-1 text-amber-700 border border-amber-300 hover:bg-amber-50 cursor-pointer"
            onClick={(e) => { e.stopPropagation(); handleBillClick(); }}
            title={item.default_cpt_code ? `Bill now (${item.default_cpt_code})` : 'Bill now — choose CPT code'}
            disabled={billingInProgress}
          >
            {billingInProgress ? <Loader2 size={12} className="animate-spin" /> : <DollarSign size={12} />}
          </button>
        )}
      </div>
    </PipelineCard>
  );
}

function NeedsSignatureCard({ item, onAction }: {
  item: PipelineData['needsSignature'][0];
  onAction: () => void;
}) {
  const cptDisplay = formatCptDisplay(item);
  return (
    <PipelineCard daysOld={item.days_old} onClick={onAction}>
      <div className="flex justify-between items-start mb-1">
        <span className="text-sm font-medium text-[var(--color-text)]">
          {item.first_name} {item.last_name}
        </span>
        <span className="text-xs text-[var(--color-text-tertiary)]">
          {formatShortDate(item.date_of_service)}
        </span>
      </div>
      <p className="text-xs text-[var(--color-text-secondary)]">
        {cptDisplay && `${cptDisplay} \u00b7 `}
        {item.units ? `${item.units} unit${item.units !== 1 ? 's' : ''}` : ''}
        {item.entity_name ? ` \u00b7 ${item.entity_name}` : ''}
      </p>
      {(item.charge_amount || 0) > 0 && (
        <p className="text-sm font-bold text-blue-700 mt-1">
          ${(item.charge_amount || 0).toFixed(2)}
        </p>
      )}
      {item.days_old >= 4 && (
        <p className="text-xs text-amber-600 mt-1">{item.days_old} days ago</p>
      )}
      <button
        className="btn-primary btn-sm w-full mt-2 gap-1 cursor-pointer"
        onClick={(e) => { e.stopPropagation(); onAction(); }}
      >
        <FileText size={12} /> Open {item.note_type === 'evaluation' ? 'Eval' : 'Note'}
      </button>
    </PipelineCard>
  );
}

function ReadyToBillCard({ item, onBillNow, onReviewFirst }: {
  item: PipelineData['readyToBill'][0];
  onBillNow: () => void;
  onReviewFirst: () => void;
}) {
  const cptDisplay = formatCptDisplay(item);
  return (
    <PipelineCard daysOld={item.days_uninvoiced}>
      <div className="flex justify-between items-start mb-1">
        <span className="text-sm font-medium text-[var(--color-text)]">
          {item.first_name} {item.last_name}
        </span>
        <span className="text-xs text-[var(--color-text-tertiary)]">
          {formatShortDate(item.date_of_service)}
        </span>
      </div>
      <p className="text-xs text-[var(--color-text-secondary)]">
        {cptDisplay && `${cptDisplay} \u00b7 `}
        {item.units} unit{item.units !== 1 ? 's' : ''}
        {item.entity_name ? ` \u00b7 ${item.entity_name}` : ''}
      </p>
      <p className="text-sm font-bold text-amber-700 mt-1">
        ${(item.charge_amount || 0).toFixed(2)}
      </p>
      {item.days_uninvoiced >= 4 && (
        <p className="text-xs text-amber-600 mt-1">{item.days_uninvoiced} days uninvoiced</p>
      )}

      <div className="flex gap-2 mt-2">
        <button
          className="btn-primary btn-sm flex-1 gap-1 cursor-pointer"
          onClick={(e) => { e.stopPropagation(); onBillNow(); }}
        >
          <DollarSign size={12} /> Bill Now
        </button>
        <button
          className="btn-ghost btn-sm px-2 cursor-pointer"
          onClick={(e) => { e.stopPropagation(); onReviewFirst(); }}
          title="Review invoice before creating"
        >
          <Eye size={12} />
        </button>
      </div>
    </PipelineCard>
  );
}

function AwaitingPaymentCard({ item, onCollect }: {
  item: PipelineData['awaitingPayment'][0];
  onCollect: () => void;
}) {
  return (
    <PipelineCard daysOld={item.days_since_sent}>
      <div className="mb-1">
        <span className="text-sm font-medium text-[var(--color-text)]">
          {item.first_name} {item.last_name}
        </span>
        <p className="text-[10px] text-[var(--color-text-tertiary)] leading-tight">{item.invoice_number}</p>
      </div>
      <p className="text-xs text-[var(--color-text-secondary)]">
        Sent {formatShortDate(item.invoice_date)}
        {item.entity_name ? ` \u00b7 ${item.entity_name}` : ''}
      </p>
      <p className="text-sm font-bold text-purple-700 mt-1">
        ${item.total_amount.toFixed(2)}
      </p>
      {item.days_since_sent >= 7 && (
        <p className="text-xs text-amber-600 mt-1">{item.days_since_sent} days outstanding</p>
      )}
      {item.stripe_payment_link_url && (
        <p className="text-xs text-purple-500 mt-1 flex items-center gap-1">
          <CreditCard size={10} /> Payment link sent
        </p>
      )}

      <button
        className="btn-secondary btn-sm w-full mt-2 gap-1 cursor-pointer"
        onClick={(e) => { e.stopPropagation(); onCollect(); }}
      >
        Collect Payment
      </button>
    </PipelineCard>
  );
}

function PaidCard({ item, onClick }: {
  item: PipelineData['paid'][0];
  onClick: () => void;
}) {
  return (
    <PipelineCard onClick={onClick}>
      <div className="mb-1">
        <span className="text-sm font-medium text-[var(--color-text)]">
          {item.first_name} {item.last_name}
        </span>
        <p className="text-[10px] text-[var(--color-text-tertiary)] leading-tight">{item.invoice_number}</p>
      </div>
      <div className="flex justify-between items-center mt-1">
        <p className="text-sm font-bold text-green-700">
          ${item.total_amount.toFixed(2)}
        </p>
        <div className="flex items-center gap-1 text-xs text-green-600">
          <CheckCircle size={10} />
          {formatShortDate(item.payment_date)}
        </div>
      </div>
      {item.payment_method && (
        <p className="text-xs text-[var(--color-text-tertiary)] mt-1 capitalize">
          {item.payment_method}{item.entity_name ? ` \u00b7 ${item.entity_name}` : ''}
        </p>
      )}
    </PipelineCard>
  );
}

// ── Empty State ──

function PipelineEmptyState() {
  return (
    <div className="flex items-center justify-center py-16">
      <div className="max-w-lg text-center space-y-4">
        <div className="text-4xl">🎉</div>
        <h2 className="text-xl font-semibold text-[var(--color-text)]">Your Revenue Pipeline</h2>
        <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed">
          This is where you'll track every visit from appointment to payment. Once you start seeing
          clients and writing notes, cards will appear here showing you exactly what needs to happen
          next to get paid.
        </p>
        <p className="text-sm text-[var(--color-text-tertiary)]">
          The flow: See client → Write note → Sign → Create invoice → Send payment link → Get paid!
        </p>
      </div>
    </div>
  );
}

// ── Main Component ──

interface RevenuePipelineProps {
  onOpenInvoiceModal: (opts: { clientId: number; noteIds: number[]; entityId?: number }) => void;
  onToast: (msg: string) => void;
  searchTerm?: string;
  clientFilter?: number | 'all';
}

export default function RevenuePipeline({ onOpenInvoiceModal, onToast, searchTerm = '', clientFilter = 'all' }: RevenuePipelineProps) {
  const navigate = useNavigate();
  const [data, setData] = useState<PipelineData | null>(null);
  const [loading, setLoading] = useState(true);
  const [hasStripe, setHasStripe] = useState(false);
  const [billingNow, setBillingNow] = useState<number | null>(null);
  const [billingAppt, setBillingAppt] = useState<number | null>(null);
  const [paymentClients, setPaymentClients] = useState<Client[]>([]);
  const [paymentInvoices, setPaymentInvoices] = useState<Invoice[]>([]);
  const [feeSchedule, setFeeSchedule] = useState<FeeScheduleEntry[]>([]);
  const [showOlderPaid, setShowOlderPaid] = useState(false);

  // Density toggle — compact is default
  const [density, setDensity] = useLocalPreference<'compact' | 'detailed'>('pipeline-density', 'compact');
  const [expandedCard, setExpandedCard] = useState<string | null>(null);
  const isCompact = density === 'compact';
  const toggleExpand = (key: string) => setExpandedCard((prev) => (prev === key ? null : key));

  // Popover state
  const [activePopover, setActivePopover] = useState<{
    type: 'new_invoice' | 'collect';
    invoiceId: number;
    invoiceNumber: string;
    clientName: string;
    amount: number;
    paymentLinkUrl?: string | null;
    cardKey: string;
  } | null>(null);

  // Payment modal state
  const [paymentModalInvoice, setPaymentModalInvoice] = useState<{
    invoiceId: number;
    clientId: number;
    amount: number;
  } | null>(null);

  const loadData = useCallback(async () => {
    try {
      const result = await window.api.billing.getPipelineData();
      setData(result);
    } catch (err) {
      console.error('Failed to load pipeline data:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 2 * 60 * 1000);
    return () => clearInterval(interval);
  }, [loadData]);

  useEffect(() => {
    window.api.secureStorage.getMasked('stripe_secret_key').then(v => setHasStripe(!!v));
    window.api.feeSchedule.list().then(fs => setFeeSchedule(fs)).catch(() => {});
  }, []);

  // Bill Now handler
  const handleBillNow = async (item: PipelineData['readyToBill'][0]) => {
    setBillingNow(item.note_id);
    try {
      const invoice = await window.api.billing.quickInvoice({
        clientId: item.client_id,
        noteIds: [item.note_id],
        entityId: item.entity_id || undefined,
      });

      setActivePopover({
        type: 'new_invoice',
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        clientName: `${item.first_name} ${item.last_name}`,
        amount: invoice.total_amount,
        cardKey: `rtb-${item.note_id}`,
      });

      loadData();
    } catch (err: any) {
      console.error('Quick invoice failed, falling back to modal:', err);
      onOpenInvoiceModal({
        clientId: item.client_id,
        noteIds: [item.note_id],
        entityId: item.entity_id || undefined,
      });
    } finally {
      setBillingNow(null);
    }
  };

  // Undo billing — soft-delete the invoice created from an appointment
  const handleUndoBill = async (invoiceId: number) => {
    try {
      await window.api.invoices.delete(invoiceId);
      onToast('Invoice deleted');
      loadData();
    } catch (err: any) {
      console.error('Failed to undo billing:', err);
      onToast(err.message || 'Failed to undo billing');
    }
  };

  // Bill from appointment (without a note)
  const handleBillFromAppointment = async (item: PipelineData['needsNote'][0], cptCode?: string) => {
    setBillingAppt(item.appointment_id);
    try {
      const invoice = await window.api.billing.quickInvoiceFromAppointment({
        appointmentId: item.appointment_id,
        clientId: item.client_id,
        entityId: item.entity_id || undefined,
        cptCode,
      });

      setActivePopover({
        type: 'new_invoice',
        invoiceId: invoice.id,
        invoiceNumber: invoice.invoice_number,
        clientName: `${item.first_name} ${item.last_name}`,
        amount: invoice.total_amount,
        cardKey: `nn-${item.appointment_id}`,
      });

      loadData();
    } catch (err: any) {
      console.error('Quick invoice from appointment failed:', err);
      onToast(err.message || 'Failed to create invoice');
    } finally {
      setBillingAppt(null);
    }
  };

  // Collect handler (for Awaiting Payment cards) — toggle on re-click
  const handleCollect = (item: PipelineData['awaitingPayment'][0]) => {
    const key = `ap-${item.invoice_id}`;
    if (activePopover?.cardKey === key) {
      setActivePopover(null);
      return;
    }
    setActivePopover({
      type: 'collect',
      invoiceId: item.invoice_id,
      invoiceNumber: item.invoice_number,
      clientName: `${item.first_name} ${item.last_name}`,
      amount: item.total_amount,
      paymentLinkUrl: item.stripe_payment_link_url,
      cardKey: key,
    });
  };

  // Pay Now — create Stripe link (if needed) and open in browser
  const handlePayNow = async (invoiceId: number) => {
    try {
      const result = await window.api.stripe.createPaymentLink(invoiceId);
      if (result?.url) {
        await window.api.shell.openExternal(result.url);
        onToast(result.existing ? 'Payment page opened in browser' : 'Payment page created & opened in browser');
      }
      setActivePopover(null);
      loadData();
    } catch (err: any) {
      console.error('Failed to open payment page:', err);
      onToast('Failed to open payment page');
    }
  };

  const handleRecordPayment = async (invoiceId: number, clientId: number, amount: number) => {
    setActivePopover(null);
    // Load clients and invoices for PaymentModal
    try {
      const [clients, invoices] = await Promise.all([
        window.api.clients.list(),
        window.api.invoices.list(),
      ]);
      setPaymentClients(clients);
      setPaymentInvoices(invoices);
    } catch { /* modal can still open with empty arrays */ }
    setPaymentModalInvoice({ invoiceId, clientId, amount });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--color-text-secondary)]" />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64 text-[var(--color-text-secondary)]">
        Failed to load pipeline data. Try refreshing.
      </div>
    );
  }

  // Check if completely empty
  const isEmpty = data.needsNote.length === 0 &&
    data.needsSignature.length === 0 &&
    data.readyToBill.length === 0 &&
    data.awaitingPayment.length === 0 &&
    data.paid.length === 0;

  if (isEmpty) return <PipelineEmptyState />;

  // ── Filter pipeline data by search term and client/entity filter ──
  const term = searchTerm.toLowerCase().trim();
  const matchesFilter = (item: { first_name: string; last_name: string; client_id: number; entity_id?: number | null; entity_name?: string | null; invoice_number?: string }) => {
    // Client / entity filter
    if (clientFilter !== 'all') {
      if (typeof clientFilter === 'number' && clientFilter < 0) {
        // Negative = entity filter (convention from BillingPage)
        if ((item.entity_id ?? 0) !== -clientFilter) return false;
      } else {
        if (item.client_id !== clientFilter) return false;
      }
    }
    // Search term
    if (term) {
      const fullName = `${item.first_name} ${item.last_name}`.toLowerCase();
      const entityName = (item.entity_name || '').toLowerCase();
      const invNum = (item.invoice_number || '').toLowerCase();
      if (!fullName.includes(term) && !entityName.includes(term) && !invNum.includes(term)) return false;
    }
    return true;
  };

  const filteredNeedsNote = data.needsNote.filter(i => matchesFilter(i));
  const filteredNeedsSignature = data.needsSignature.filter(i => matchesFilter(i));
  const filteredReadyToBill = data.readyToBill.filter(i => matchesFilter(i));
  const filteredAwaiting = data.awaitingPayment.filter(i => matchesFilter(i));
  const filteredPaid = data.paid.filter(i => matchesFilter(i));

  // Calculate totals (from filtered data)
  const unbilledTotal =
    filteredNeedsSignature.reduce((s, n) => s + (n.charge_amount || 0), 0) +
    filteredReadyToBill.reduce((s, n) => s + (n.charge_amount || 0), 0);
  const awaitingTotal = filteredAwaiting.reduce((s, i) => s + i.total_amount, 0);
  const paidTotal = filteredPaid.reduce((s, i) => s + i.total_amount, 0);

  // Paid column: 7-day default, expandable to 30
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const sevenDayStr = sevenDaysAgo.toISOString().slice(0, 10);
  const recentPaid = filteredPaid.filter(p => p.payment_date >= sevenDayStr);
  const olderPaid = filteredPaid.filter(p => p.payment_date < sevenDayStr);
  const visiblePaid = showOlderPaid ? filteredPaid : recentPaid;
  const visiblePaidTotal = visiblePaid.reduce((s, i) => s + i.total_amount, 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <FlowBar />
        {unbilledTotal > 0 && (
          <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-amber-50 text-amber-700 border border-amber-200" title={`$${unbilledTotal.toLocaleString('en-US', { minimumFractionDigits: 2 })} in completed work hasn't been billed yet`}>
            <AlertCircle size={12} className="text-amber-500" />
            ${unbilledTotal.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} unbilled
          </span>
        )}
        <div className="inline-flex shrink-0 border border-gray-200 rounded-lg overflow-hidden">
          <button
            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${
              isCompact ? 'bg-[var(--color-primary)] text-white' : 'bg-white text-[var(--color-text-secondary)] hover:bg-gray-50'
            }`}
            onClick={() => setDensity('compact')}
            title="Compact view"
          >
            <List size={13} />
          </button>
          <button
            className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium transition-colors ${
              !isCompact ? 'bg-[var(--color-primary)] text-white' : 'bg-white text-[var(--color-text-secondary)] hover:bg-gray-50'
            }`}
            onClick={() => setDensity('detailed')}
            title="Detailed view"
          >
            <LayoutGrid size={13} />
          </button>
        </div>
      </div>

      {/* Unbilled total — subtle inline pill (visible near the pipeline header) */}

      <div className="flex gap-2 pb-4">
        {/* Column 1: Needs a Note */}
        <PipelineColumn
          icon="📋"
          label="Needs a Note"
          subtitle="Completed visits without documentation"
          count={filteredNeedsNote.length}
          totalAmount={null}
          accentColor="gray"
        >
          {filteredNeedsNote.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-[var(--color-text-tertiary)]">{term || clientFilter !== 'all' ? 'No matches' : 'All caught up!'}</div>
          ) : isCompact ? (
            filteredNeedsNote.map((item) => {
              const key = `nn-${item.appointment_id}`;
              return (
                <CompactRow
                  key={key}
                  name={`${item.first_name} ${item.last_name}`}
                  date={formatShortDate(item.scheduled_date)}
                  entityName={item.entity_name}
                  isExpanded={expandedCard === key}
                  onClick={() => toggleExpand(key)}
                >
                  <NeedsNoteCard
                    item={item}
                    onAction={() => navigate(`/clients/${item.client_id}/note/new?date=${item.scheduled_date}&appointmentId=${item.appointment_id}`)}
                    onBillNow={(cptCode) => handleBillFromAppointment(item, cptCode)}
                    onUndoBill={handleUndoBill}
                    billingInProgress={billingAppt === item.appointment_id}
                    feeSchedule={feeSchedule}
                  />
                </CompactRow>
              );
            })
          ) : (
            filteredNeedsNote.map((item) => (
              <div key={item.appointment_id} className="relative">
                <NeedsNoteCard
                  item={item}
                  onAction={() => navigate(`/clients/${item.client_id}/note/new?date=${item.scheduled_date}&appointmentId=${item.appointment_id}`)}
                  onBillNow={(cptCode) => handleBillFromAppointment(item, cptCode)}
                  onUndoBill={handleUndoBill}
                  billingInProgress={billingAppt === item.appointment_id}
                  feeSchedule={feeSchedule}
                />
                {activePopover?.cardKey === `nn-${item.appointment_id}` && (
                  <CollectionPopover
                    invoiceId={activePopover.invoiceId}
                    invoiceNumber={activePopover.invoiceNumber}
                    clientName={activePopover.clientName}
                    amount={activePopover.amount}
                    hasStripe={hasStripe}
                    isNewInvoice={true}
                    onPayNow={() => handlePayNow(activePopover.invoiceId)}
                    onRecordPayment={() => handleRecordPayment(activePopover.invoiceId, item.client_id, activePopover.amount)}
                    onDismiss={() => setActivePopover(null)}
                  />
                )}
              </div>
            ))
          )}
        </PipelineColumn>

        {/* Column 2: Needs Signature */}
        <PipelineColumn
          icon="✍️"
          label="Needs Signature"
          subtitle="Draft notes ready to finalize"
          count={filteredNeedsSignature.length}
          totalAmount={filteredNeedsSignature.reduce((s, n) => s + (n.charge_amount || 0), 0)}
          accentColor="blue"
        >
          {filteredNeedsSignature.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-[var(--color-text-tertiary)]">{term || clientFilter !== 'all' ? 'No matches' : 'All caught up!'}</div>
          ) : isCompact ? (
            filteredNeedsSignature.map((item) => {
              const key = `ns-${item.note_id || `eval-${item.eval_id}`}`;
              return (
                <CompactRow
                  key={key}
                  name={`${item.first_name} ${item.last_name}`}
                  date={formatShortDate(item.date_of_service)}
                  amount={item.charge_amount ? `$${item.charge_amount.toFixed(2)}` : null}
                  entityName={item.entity_name}
                  isExpanded={expandedCard === key}
                  onClick={() => toggleExpand(key)}
                >
                  <NeedsSignatureCard
                    item={item}
                    onAction={() => {
                      if (item.note_type === 'evaluation' && item.eval_id) {
                        navigate(`/clients/${item.client_id}/eval/${item.eval_id}`);
                      } else if (item.note_id) {
                        navigate(`/clients/${item.client_id}/note/${item.note_id}`);
                      }
                    }}
                  />
                </CompactRow>
              );
            })
          ) : (
            filteredNeedsSignature.map((item) => (
              <NeedsSignatureCard
                key={item.note_id || `eval-${item.eval_id}`}
                item={item}
                onAction={() => {
                  if (item.note_type === 'evaluation' && item.eval_id) {
                    navigate(`/clients/${item.client_id}/eval/${item.eval_id}`);
                  } else if (item.note_id) {
                    navigate(`/clients/${item.client_id}/note/${item.note_id}`);
                  }
                }}
              />
            ))
          )}
        </PipelineColumn>

        {/* Column 3: Ready to Bill */}
        <PipelineColumn
          icon="💰"
          label="Ready to Bill"
          subtitle="Signed notes without an invoice"
          count={filteredReadyToBill.length}
          totalAmount={filteredReadyToBill.reduce((s, n) => s + (n.charge_amount || 0), 0)}
          accentColor="amber"
          draftCount={data.draftInvoices.length}
        >
          {filteredReadyToBill.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-[var(--color-text-tertiary)]">{term || clientFilter !== 'all' ? 'No matches' : 'All caught up!'}</div>
          ) : isCompact ? (
            filteredReadyToBill.map((item) => {
              const key = `rtb-${item.note_id}`;
              return (
                <CompactRow
                  key={key}
                  name={`${item.first_name} ${item.last_name}`}
                  date={formatShortDate(item.date_of_service)}
                  amount={item.charge_amount ? `$${item.charge_amount.toFixed(2)}` : null}
                  entityName={item.entity_name}
                  isExpanded={expandedCard === key}
                  onClick={() => toggleExpand(key)}
                >
                  <div className="relative">
                    <ReadyToBillCard
                      item={item}
                      onBillNow={() => handleBillNow(item)}
                      onReviewFirst={() => onOpenInvoiceModal({
                        clientId: item.client_id,
                        noteIds: [item.note_id],
                        entityId: item.entity_id || undefined,
                      })}
                    />
                  </div>
                </CompactRow>
              );
            })
          ) : (
            filteredReadyToBill.map((item) => (
              <div key={item.note_id} className="relative">
                <ReadyToBillCard
                  item={item}
                  onBillNow={() => handleBillNow(item)}
                  onReviewFirst={() => onOpenInvoiceModal({
                    clientId: item.client_id,
                    noteIds: [item.note_id],
                    entityId: item.entity_id || undefined,
                  })}
                />
                {billingNow === item.note_id && (
                  <div className="absolute inset-0 bg-white/70 rounded-lg flex items-center justify-center">
                    <Loader2 size={20} className="animate-spin text-amber-600" />
                  </div>
                )}
                {activePopover?.cardKey === `rtb-${item.note_id}` && (
                  <CollectionPopover
                    invoiceId={activePopover.invoiceId}
                    invoiceNumber={activePopover.invoiceNumber}
                    clientName={activePopover.clientName}
                    amount={activePopover.amount}
                    hasStripe={hasStripe}
                    isNewInvoice={activePopover.type === 'new_invoice'}
                    onPayNow={() => handlePayNow(activePopover.invoiceId)}
                    onRecordPayment={() => handleRecordPayment(activePopover.invoiceId, item.client_id, activePopover.amount)}
                    onDismiss={() => setActivePopover(null)}
                  />
                )}
              </div>
            ))
          )}
        </PipelineColumn>

        {/* Column 4: Awaiting Payment */}
        <PipelineColumn
          icon="⏳"
          label="Awaiting Payment"
          subtitle="Invoices sent to clients"
          count={filteredAwaiting.length}
          totalAmount={awaitingTotal}
          accentColor="purple"
        >
          {filteredAwaiting.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-[var(--color-text-tertiary)]">{term || clientFilter !== 'all' ? 'No matches' : 'All caught up!'}</div>
          ) : isCompact ? (
            filteredAwaiting.map((item) => {
              const key = `ap-${item.invoice_id}`;
              return (
                <CompactRow
                  key={key}
                  name={`${item.first_name} ${item.last_name}`}
                  date={formatShortDate(item.invoice_date)}
                  amount={`$${item.total_amount.toFixed(2)}`}
                  entityName={item.entity_name}
                  isExpanded={expandedCard === key}
                  onClick={() => toggleExpand(key)}
                >
                  <div className="relative">
                    <AwaitingPaymentCard item={item} onCollect={() => handleCollect(item)} />
                  </div>
                </CompactRow>
              );
            })
          ) : (
            filteredAwaiting.map((item) => (
              <div key={item.invoice_id} className="relative">
                <AwaitingPaymentCard
                  item={item}
                  onCollect={() => handleCollect(item)}
                />
                {activePopover?.cardKey === `ap-${item.invoice_id}` && (
                  <CollectionPopover
                    invoiceId={activePopover.invoiceId}
                    invoiceNumber={activePopover.invoiceNumber}
                    clientName={activePopover.clientName}
                    amount={activePopover.amount}
                    hasStripe={hasStripe}
                    existingPaymentLinkUrl={activePopover.paymentLinkUrl}
                    isNewInvoice={false}
                    onPayNow={() => handlePayNow(activePopover.invoiceId)}
                    onRecordPayment={() => handleRecordPayment(activePopover.invoiceId, item.client_id, activePopover.amount)}
                    onDismiss={() => setActivePopover(null)}
                  />
                )}
              </div>
            ))
          )}
        </PipelineColumn>

        {/* Column 5: Paid */}
        <PipelineColumn
          icon="✅"
          label="Paid"
          subtitle={showOlderPaid ? 'Last 30 days' : 'Last 7 days'}
          count={visiblePaid.length}
          totalAmount={visiblePaidTotal}
          accentColor="green"
        >
          {visiblePaid.length === 0 ? (
            <div className="px-3 py-6 text-center text-xs text-[var(--color-text-tertiary)]">{term || clientFilter !== 'all' ? 'No matches' : 'No recent payments'}</div>
          ) : isCompact ? (
            visiblePaid.map((item) => {
              const key = `paid-${item.invoice_id}`;
              return (
                <CompactRow
                  key={key}
                  name={`${item.first_name} ${item.last_name}`}
                  date={formatShortDate(item.payment_date)}
                  amount={`$${item.total_amount.toFixed(2)}`}
                  entityName={item.entity_name}
                  isExpanded={expandedCard === key}
                  onClick={() => toggleExpand(key)}
                >
                  <PaidCard item={item} onClick={() => navigate(`/billing?tab=invoices&invoiceId=${item.invoice_id}`)} />
                </CompactRow>
              );
            })
          ) : (
            visiblePaid.map((item) => (
              <PaidCard
                key={item.invoice_id}
                item={item}
                onClick={() => navigate(`/billing?tab=invoices&invoiceId=${item.invoice_id}`)}
              />
            ))
          )}
          {!showOlderPaid && olderPaid.length > 0 && (
            <button
              className="w-full text-center text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] py-2 cursor-pointer"
              onClick={() => setShowOlderPaid(true)}
            >
              See older ({olderPaid.length} more)
            </button>
          )}
          {showOlderPaid && olderPaid.length > 0 && (
            <button
              className="w-full text-center text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-primary)] py-2 cursor-pointer"
              onClick={() => setShowOlderPaid(false)}
            >
              Show less
            </button>
          )}
        </PipelineColumn>
      </div>

      {/* Payment Modal */}
      <PaymentModal
        isOpen={!!paymentModalInvoice}
        clients={paymentClients}
        invoices={paymentInvoices}
        preselectedClientId={paymentModalInvoice?.clientId}
        preselectedInvoiceId={paymentModalInvoice?.invoiceId}
        onSave={() => {
          setPaymentModalInvoice(null);
          onToast('Payment recorded');
          loadData();
        }}
        onClose={() => setPaymentModalInvoice(null)}
      />
    </div>
  );
}
