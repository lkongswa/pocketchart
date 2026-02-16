import React, { useState } from 'react';
import { CreditCard, Banknote, Clock, CheckCircle, Loader2, X } from 'lucide-react';

interface CollectionPopoverProps {
  invoiceId: number;
  invoiceNumber: string;
  clientName: string;
  amount: number;
  hasStripe: boolean;
  existingPaymentLinkUrl?: string | null;
  onPayNow: () => Promise<void>;
  onRecordPayment: () => void;
  onDismiss: () => void;
  isNewInvoice?: boolean;
}

export default function CollectionPopover({
  invoiceNumber,
  hasStripe, existingPaymentLinkUrl,
  onPayNow, onRecordPayment, onDismiss,
  isNewInvoice = false,
}: CollectionPopoverProps) {
  const [paying, setPaying] = useState(false);

  const handlePayNow = async () => {
    setPaying(true);
    try {
      await onPayNow();
    } finally {
      setPaying(false);
    }
  };

  return (
    <div className="absolute z-50 mt-1 left-0 right-0 bg-white rounded-lg shadow-xl border border-gray-200 p-2 animate-in fade-in slide-in-from-top-2">
      <button
        className="absolute top-1 right-1 p-0.5 rounded-full hover:bg-gray-100 cursor-pointer"
        onClick={onDismiss}
      >
        <X size={12} className="text-gray-400" />
      </button>

      {isNewInvoice && (
        <div className="flex items-center gap-1.5 mb-2 pb-2 border-b border-gray-100 pr-5">
          <CheckCircle size={14} className="text-green-500 shrink-0" />
          <p className="text-xs font-medium text-[var(--color-text)] truncate">{invoiceNumber} created</p>
        </div>
      )}

      <div className="space-y-1">
        <button
          className={`w-full flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors text-left ${
            hasStripe ? 'hover:bg-purple-50 cursor-pointer' : 'opacity-40 cursor-not-allowed'
          }`}
          onClick={hasStripe ? handlePayNow : undefined}
          disabled={!hasStripe || paying}
          title={hasStripe
            ? (existingPaymentLinkUrl ? 'Open Stripe payment page' : 'Create & open Stripe payment page')
            : 'Connect Stripe in Settings first'}
        >
          {paying ? (
            <Loader2 size={14} className="text-purple-500 shrink-0 animate-spin" />
          ) : (
            <CreditCard size={14} className="text-purple-500 shrink-0" />
          )}
          <span className="text-xs font-medium text-[var(--color-text)] truncate">Pay Now</span>
        </button>

        <button
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-green-50 transition-colors text-left cursor-pointer"
          onClick={onRecordPayment}
          title="Record cash, check, IvyPay, or other payment"
        >
          <Banknote size={14} className="text-green-500 shrink-0" />
          <span className="text-xs font-medium text-[var(--color-text)] truncate">Record Payment</span>
        </button>

        <button
          className="w-full flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-gray-50 transition-colors text-left cursor-pointer"
          onClick={onDismiss}
          title="Dismiss — collect payment later"
        >
          <Clock size={14} className="text-gray-400 shrink-0" />
          <span className="text-xs font-medium text-[var(--color-text-secondary)] truncate">Later</span>
        </button>
      </div>
    </div>
  );
}
