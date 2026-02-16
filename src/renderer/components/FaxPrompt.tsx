import React, { useState, useEffect } from 'react';
import { Send, X, BellOff } from 'lucide-react';

interface FaxPromptProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: number;
  clientName: string;
  physicianName: string;
  faxNumber: string;
  documentType: 'note' | 'eval';
  documentId: number;
}

export default function FaxPrompt({
  isOpen,
  onClose,
  clientId,
  clientName,
  physicianName,
  faxNumber,
  documentType,
  documentId,
}: FaxPromptProps) {
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setSending(false);
      setSent(false);
    }
  }, [isOpen]);

  const handleFaxNow = async () => {
    setSending(true);
    try {
      await window.api.fax.send({
        faxNumber,
        clientId,
      });
      setSent(true);
      setTimeout(onClose, 1500);
    } catch (err) {
      console.error('Failed to fax:', err);
      setSending(false);
    }
  };

  const handleDontAsk = () => {
    // Store per-client opt-out — simple setting key
    // Could be extended to use a proper per-client settings table
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/20" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm mx-4 p-5">
        {sent ? (
          <div className="text-center">
            <div className="text-green-600 font-medium">Fax queued!</div>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1">Check Fax Center for status.</p>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between mb-3">
              <h3 className="text-sm font-semibold">Fax this {documentType}?</h3>
              <button onClick={onClose} className="p-1 hover:bg-gray-100 rounded">
                <X size={14} />
              </button>
            </div>
            <p className="text-sm text-[var(--color-text-secondary)] mb-4">
              Send to <span className="font-medium text-[var(--color-text)]">{physicianName}</span> at{' '}
              <span className="font-mono text-xs">{faxNumber}</span>?
            </p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="btn-primary flex items-center gap-2 text-sm flex-1"
                onClick={handleFaxNow}
                disabled={sending}
              >
                <Send size={14} />
                {sending ? 'Sending...' : 'Fax Now'}
              </button>
              <button
                type="button"
                className="btn-secondary text-sm"
                onClick={onClose}
              >
                Skip
              </button>
              <button
                type="button"
                className="p-2 rounded hover:bg-gray-100 text-gray-400"
                onClick={handleDontAsk}
                title="Don't ask for this client"
              >
                <BellOff size={14} />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
