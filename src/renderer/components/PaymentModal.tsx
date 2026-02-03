import React, { useState, useEffect } from 'react';
import { X, DollarSign, CreditCard, Banknote, FileCheck, HelpCircle } from 'lucide-react';
import type { Client, Invoice, PaymentMethod } from '../../shared/types';

interface PaymentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  clients: Client[];
  invoices: Invoice[];
  preselectedClientId?: number;
  preselectedInvoiceId?: number;
}

const PAYMENT_METHODS: Array<{ value: PaymentMethod; label: string; icon: React.ReactNode }> = [
  { value: 'card', label: 'Card', icon: <CreditCard className="w-5 h-5" /> },
  { value: 'cash', label: 'Cash', icon: <Banknote className="w-5 h-5" /> },
  { value: 'check', label: 'Check', icon: <FileCheck className="w-5 h-5" /> },
  { value: 'insurance', label: 'Insurance', icon: <DollarSign className="w-5 h-5" /> },
  { value: 'other', label: 'Other', icon: <HelpCircle className="w-5 h-5" /> },
];

export default function PaymentModal({
  isOpen,
  onClose,
  onSave,
  clients,
  invoices,
  preselectedClientId,
  preselectedInvoiceId,
}: PaymentModalProps) {
  const [clientId, setClientId] = useState<number | ''>(preselectedClientId || '');
  const [invoiceId, setInvoiceId] = useState<number | ''>(preselectedInvoiceId || '');
  const [paymentDate, setPaymentDate] = useState(new Date().toISOString().slice(0, 10));
  const [amount, setAmount] = useState<number | ''>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('card');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen) {
      setClientId(preselectedClientId || '');
      setInvoiceId(preselectedInvoiceId || '');
      setPaymentDate(new Date().toISOString().slice(0, 10));
      setAmount('');
      setPaymentMethod('card');
      setReferenceNumber('');
      setNotes('');
    }
  }, [isOpen, preselectedClientId, preselectedInvoiceId]);

  // When invoice is selected, auto-fill the amount if empty
  useEffect(() => {
    if (invoiceId && !amount) {
      const invoice = invoices.find((i) => i.id === invoiceId);
      if (invoice) {
        setAmount(invoice.total_amount);
        setClientId(invoice.client_id);
      }
    }
  }, [invoiceId, invoices, amount]);

  // Filter invoices for selected client
  const clientInvoices = clientId
    ? invoices.filter(
        (i) => i.client_id === clientId && i.status !== 'paid' && i.status !== 'void'
      )
    : [];

  const handleSave = async () => {
    if (!clientId || !amount) return;

    setSaving(true);
    try {
      await window.api.payments.create({
        client_id: clientId as number,
        invoice_id: invoiceId || null,
        payment_date: paymentDate,
        amount: amount as number,
        payment_method: paymentMethod,
        reference_number: referenceNumber,
        notes,
      });

      // If payment was applied to an invoice and covers the full amount, mark invoice as paid
      if (invoiceId) {
        const invoice = invoices.find((i) => i.id === invoiceId);
        if (invoice && (amount as number) >= invoice.total_amount) {
          await window.api.invoices.update(invoiceId as number, { status: 'paid' });
        } else if (invoice && (amount as number) > 0) {
          await window.api.invoices.update(invoiceId as number, { status: 'partial' });
        }
      }

      onSave();
      onClose();
    } catch (err) {
      console.error('Failed to record payment:', err);
    } finally {
      setSaving(false);
    }
  };

  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
    }).format(val);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Record Payment</h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-[var(--color-text-secondary)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* Client */}
          <div>
            <label className="label">Client</label>
            <select
              className="select"
              value={clientId}
              onChange={(e) => {
                setClientId(e.target.value ? Number(e.target.value) : '');
                setInvoiceId('');
              }}
            >
              <option value="">Select client...</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.first_name} {c.last_name}
                </option>
              ))}
            </select>
          </div>

          {/* Invoice (optional) */}
          <div>
            <label className="label">Apply to Invoice (optional)</label>
            <select
              className="select"
              value={invoiceId}
              onChange={(e) => setInvoiceId(e.target.value ? Number(e.target.value) : '')}
              disabled={!clientId}
            >
              <option value="">No specific invoice</option>
              {clientInvoices.map((inv) => (
                <option key={inv.id} value={inv.id}>
                  {inv.invoice_number} - {formatCurrency(inv.total_amount)} ({inv.status})
                </option>
              ))}
            </select>
          </div>

          {/* Amount & Date */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Amount</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]">
                  $
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="input pl-7"
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value ? Number(e.target.value) : '')}
                />
              </div>
            </div>
            <div>
              <label className="label">Date</label>
              <input
                type="date"
                className="input"
                value={paymentDate}
                onChange={(e) => setPaymentDate(e.target.value)}
              />
            </div>
          </div>

          {/* Payment Method */}
          <div>
            <label className="label">Payment Method</label>
            <div className="grid grid-cols-5 gap-2">
              {PAYMENT_METHODS.map((method) => (
                <button
                  key={method.value}
                  type="button"
                  onClick={() => setPaymentMethod(method.value)}
                  className={`flex flex-col items-center gap-1 p-3 rounded-lg border-2 transition-colors cursor-pointer ${
                    paymentMethod === method.value
                      ? 'border-[var(--color-primary)] bg-[var(--color-primary)]/5 text-[var(--color-primary)]'
                      : 'border-[var(--color-border)] hover:border-gray-300 text-[var(--color-text-secondary)]'
                  }`}
                >
                  {method.icon}
                  <span className="text-xs font-medium">{method.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Reference Number */}
          <div>
            <label className="label">Reference Number (optional)</label>
            <input
              type="text"
              className="input"
              placeholder={
                paymentMethod === 'check'
                  ? 'Check number'
                  : paymentMethod === 'card'
                  ? 'Last 4 digits or transaction ID'
                  : 'Reference'
              }
              value={referenceNumber}
              onChange={(e) => setReferenceNumber(e.target.value)}
            />
          </div>

          {/* Notes */}
          <div>
            <label className="label">Notes (optional)</label>
            <textarea
              className="input"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any additional notes..."
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--color-border)] bg-gray-50">
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary gap-2"
            onClick={handleSave}
            disabled={!clientId || !amount || saving}
          >
            <DollarSign className="w-4 h-4" />
            {saving ? 'Recording...' : 'Record Payment'}
          </button>
        </div>
      </div>
    </div>
  );
}
