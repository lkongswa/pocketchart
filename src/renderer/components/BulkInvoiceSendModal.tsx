import React, { useState, useEffect, useCallback } from 'react';
import { Mail, Send, FileText, RefreshCw, SkipForward, ChevronLeft, Check } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { Invoice, InvoiceStatus } from '@shared/types';

export interface BulkSendResult {
  id: number;
  status: InvoiceStatus;
  emailedAt: string | null;
  emailedTo: string | null;
}

interface Props {
  /** Ordered queue of invoices to review and send, one at a time. */
  invoices: Invoice[];
  onClose: () => void;
  /** Called (with every successfully-sent invoice) when the reviewer is dismissed. */
  onSent: (results: BulkSendResult[]) => void;
}

type Outcome = 'pending' | 'sent' | 'skipped';

/**
 * Steps through a queue of invoices, showing the same pre-filled email form used
 * on the entity detail page for each one. The user reviews recipient/subject/body,
 * then Sends or Skips before advancing. Reuses `invoices.prepareEmail` / `invoices.email`.
 */
const BulkInvoiceSendModal: React.FC<Props> = ({ invoices, onClose, onSent }) => {
  const navigate = useNavigate();
  const [index, setIndex] = useState(0);
  const [outcomes, setOutcomes] = useState<Outcome[]>(() => invoices.map(() => 'pending'));
  const results = React.useRef<BulkSendResult[]>([]);

  // Per-invoice email form, loaded lazily as the user reaches each one.
  const [loading, setLoading] = useState(false);
  const [prep, setPrep] = useState<{
    emailConfigured: boolean;
    fromAddress: string;
    filename: string;
    alreadyEmailedAt: string | null;
    alreadyEmailedTo: string | null;
  } | null>(null);
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = invoices[index];
  const total = invoices.length;
  const sentCount = outcomes.filter((o) => o === 'sent').length;

  const loadPrep = useCallback(async (inv: Invoice) => {
    setLoading(true);
    setError(null);
    setPrep(null);
    setTo('');
    setSubject('');
    setBody('');
    try {
      const p = await window.api.invoices.prepareEmail(inv.id);
      setPrep({
        emailConfigured: p.emailConfigured,
        fromAddress: p.fromAddress,
        filename: p.filename,
        alreadyEmailedAt: p.alreadyEmailedAt,
        alreadyEmailedTo: p.alreadyEmailedTo,
      });
      setTo(p.to || '');
      setSubject(p.subject || '');
      setBody(p.bodyText || '');
    } catch (err: any) {
      setError(err?.message || 'Failed to prepare this invoice email.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (current) loadPrep(current);
  }, [current, loadPrep]);

  const finish = () => {
    onSent(results.current);
    onClose();
  };

  const advance = () => {
    if (index < total - 1) setIndex(index + 1);
    else finish();
  };

  const markOutcome = (o: Outcome) => {
    setOutcomes((prev) => {
      const next = [...prev];
      next[index] = o;
      return next;
    });
  };

  const handleSkip = () => {
    markOutcome('skipped');
    advance();
  };

  const handleSend = async () => {
    if (!current) return;
    const recipient = to.trim();
    if (!recipient) { setError('Enter a recipient email address.'); return; }
    setSending(true);
    setError(null);
    try {
      const res = await window.api.invoices.email({
        invoiceId: current.id,
        to: recipient,
        subject,
        bodyText: body,
      });
      if (res.success) {
        results.current.push({ id: current.id, status: res.status, emailedAt: res.emailedAt, emailedTo: res.emailedTo });
        markOutcome('sent');
        advance();
      } else {
        setError(res.error || 'Failed to send this invoice.');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to send this invoice.');
    } finally {
      setSending(false);
    }
  };

  if (!current) return null;

  const formatMoney = (n: number) =>
    new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => !sending && finish()}>
      <div className="absolute inset-0 bg-black/40 pointer-events-none" />
      <div
        className="relative z-10 bg-[var(--color-surface)] rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with progress */}
        <div className="px-6 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <Mail size={18} className="text-[var(--color-primary)]" />
            <h3 className="text-base font-semibold text-[var(--color-text)]">
              Send invoices — {index + 1} of {total}
            </h3>
          </div>
          {/* Step dots */}
          <div className="flex items-center gap-1 mt-3">
            {invoices.map((inv, i) => (
              <div
                key={inv.id}
                title={`${inv.invoice_number}${outcomes[i] !== 'pending' ? ` (${outcomes[i]})` : ''}`}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  i === index
                    ? 'bg-[var(--color-primary)]'
                    : outcomes[i] === 'sent'
                    ? 'bg-emerald-400'
                    : outcomes[i] === 'skipped'
                    ? 'bg-amber-300'
                    : 'bg-[var(--color-border)]'
                }`}
              />
            ))}
          </div>
          <p className="text-xs text-[var(--color-text-secondary)] mt-2">
            {current.entity_name ? `${current.entity_name} · ` : ''}
            Invoice {current.invoice_number} · {formatMoney(current.total_amount)}
          </p>
        </div>

        {loading || !prep ? (
          <div className="px-6 py-10 text-center text-sm text-[var(--color-text-secondary)]">Preparing email…</div>
        ) : !prep.emailConfigured ? (
          <div className="px-6 py-8 text-center">
            <Mail size={32} className="mx-auto text-[var(--color-text-secondary)] mb-3 opacity-40" />
            <p className="text-sm text-[var(--color-text)] font-medium mb-1">Email isn't set up yet</p>
            <p className="text-sm text-[var(--color-text-secondary)] mb-5">
              Connect your email account in <strong>Settings → Email</strong> to send invoices from your own address.
            </p>
            <div className="flex justify-center gap-2">
              <button className="btn-secondary" onClick={finish}>Close</button>
              <button className="btn-primary" onClick={() => navigate('/settings?section=email')}>Go to Settings</button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
              {prep.alreadyEmailedAt && (
                <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                  <RefreshCw size={14} className="mt-0.5 flex-shrink-0" />
                  <span>
                    Already emailed on {new Date(prep.alreadyEmailedAt).toLocaleDateString()}
                    {prep.alreadyEmailedTo ? ` to ${prep.alreadyEmailedTo}` : ''}. Sending again will resend it.
                  </span>
                </div>
              )}

              {error && (
                <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs">{error}</div>
              )}

              <div>
                <label className="label">To</label>
                <input
                  type="email"
                  className="input w-full"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                  placeholder="billing@agency.com"
                />
                {!to.trim() && (
                  <p className="text-xs text-amber-600 mt-1">No billing email on file for this agency — enter one above.</p>
                )}
                {prep.fromAddress && (
                  <p className="text-xs text-[var(--color-text-secondary)] mt-1">Sending from {prep.fromAddress}</p>
                )}
              </div>

              <div>
                <label className="label">Subject</label>
                <input className="input w-full" value={subject} onChange={(e) => setSubject(e.target.value)} />
              </div>

              <div>
                <label className="label">Message</label>
                <textarea
                  className="input w-full text-sm"
                  rows={6}
                  value={body}
                  onChange={(e) => setBody(e.target.value)}
                />
              </div>

              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-sm">
                <FileText size={15} className="text-[var(--color-primary)] flex-shrink-0" />
                <span className="text-[var(--color-text)] truncate">{prep.filename}</span>
                <span className="ml-auto text-xs text-[var(--color-text-secondary)] whitespace-nowrap">PDF attached</span>
              </div>
            </div>

            {/* Footer nav */}
            <div className="flex items-center justify-between gap-2 px-6 py-4 border-t border-[var(--color-border)]">
              <button
                className="btn-ghost gap-1.5 disabled:opacity-40"
                onClick={() => setIndex(index - 1)}
                disabled={sending || index === 0}
              >
                <ChevronLeft size={14} />
                Back
              </button>
              <div className="flex items-center gap-2">
                <button className="btn-secondary gap-1.5" onClick={handleSkip} disabled={sending}>
                  <SkipForward size={14} />
                  Skip
                </button>
                <button
                  className="btn-primary gap-1.5"
                  onClick={handleSend}
                  disabled={sending || !/^\S+@\S+\.\S+$/.test(to.trim())}
                >
                  <Send size={14} />
                  {sending ? 'Sending…' : index === total - 1 ? 'Send & finish' : 'Send & next'}
                </button>
              </div>
            </div>
          </>
        )}

        {sentCount > 0 && (
          <div className="px-6 py-2 border-t border-[var(--color-border)] flex items-center gap-1.5 text-xs text-emerald-600">
            <Check size={13} />
            {sentCount} sent so far
          </div>
        )}
      </div>
    </div>
  );
};

export default BulkInvoiceSendModal;
