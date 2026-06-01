// SendDocumentsModal — bulk "email documents to this client" hub launched from the client
// chart. Lets the practitioner check off any mix of: a freshly generated intake packet, a
// superbill for a date range, the client's invoices/statements, and any saved documents
// (Good Faith Estimates + uploaded files). All selected items go out as ONE email with
// multiple attachments, sent via the user's own BYO email provider (clientDocuments.emailBundle),
// which audit-logs the send so it appears in the Dashboard's Recent Messages feed.
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, Mail, Send, FileText, Receipt, ClipboardList, FileCheck } from 'lucide-react';
import type { ClientDocument, Invoice, IntakeFormTemplate, ClientDocumentEmailSpec } from '../../shared/types';

interface SendDocumentsModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: number;
  clientFirstName: string;
  clientEmail: string;
  documents: ClientDocument[];
  invoices: Invoice[];
  onSent?: (summary: { count: number; to: string; skipped: Array<{ label: string; reason: string }> }) => void;
}

const CATEGORY_LABELS: Record<string, string> = {
  good_faith_estimate: 'Good Faith Estimate',
  signed_poc: 'Signed Plan of Care',
  intake_form: 'Intake Form',
  referral: 'Referral',
  insurance_card: 'Insurance Card',
  authorization: 'Authorization',
  other: 'Document',
};

function prettyCategory(cat: string): string {
  return CATEGORY_LABELS[cat] || cat.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function fmtMoney(n: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n || 0);
}

export default function SendDocumentsModal(props: SendDocumentsModalProps) {
  const { isOpen, onClose, clientId, clientFirstName, clientEmail, documents, invoices, onSent } = props;
  const navigate = useNavigate();

  const [loading, setLoading] = useState(true);
  const [emailConfigured, setEmailConfigured] = useState(false);
  const [fromAddress, setFromAddress] = useState('');
  const [activeTemplateIds, setActiveTemplateIds] = useState<number[]>([]);
  const [practiceName, setPracticeName] = useState('your practice');

  // Selections
  const [includeIntake, setIncludeIntake] = useState(false);
  const [includeSuperbill, setIncludeSuperbill] = useState(false);
  const [sbStart, setSbStart] = useState('');
  const [sbEnd, setSbEnd] = useState('');
  const [selectedInvoices, setSelectedInvoices] = useState<Set<number>>(new Set());
  const [selectedDocs, setSelectedDocs] = useState<Set<number>>(new Set());

  // Compose
  const [to, setTo] = useState('');
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');

  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    // Reset selections + compose
    setIncludeIntake(false);
    setIncludeSuperbill(false);
    setSelectedInvoices(new Set());
    setSelectedDocs(new Set());
    setTo(clientEmail || '');
    setError(null);
    const today = new Date();
    const ninetyAgo = new Date(Date.now() - 90 * 24 * 3600 * 1000);
    setSbEnd(today.toISOString().slice(0, 10));
    setSbStart(ninetyAgo.toISOString().slice(0, 10));

    setLoading(true);
    Promise.all([
      window.api.email.getProviderStatus().catch(() => ({ configured: false, fromAddress: '' } as any)),
      window.api.intakeForms.listTemplates().catch(() => [] as IntakeFormTemplate[]),
      window.api.practice.get().catch(() => null as any),
    ]).then(([status, templates, practice]) => {
      setEmailConfigured(!!status?.configured);
      setFromAddress(status?.fromAddress || '');
      setActiveTemplateIds((templates || []).filter((t: IntakeFormTemplate) => t.is_active).map((t: IntakeFormTemplate) => t.id));
      const pname = (practice?.name || 'your practice').toString();
      setPracticeName(pname);
      // Prefill compose now that we know the practice name
      const first = (clientFirstName || '').trim() || 'there';
      setSubject(`Documents from ${pname}`);
      setBody(`Hi ${first},\n\nPlease find the attached document(s). Let me know if you have any questions.\n\nThank you,\n${pname}`);
    }).finally(() => setLoading(false));
  }, [isOpen, clientEmail, clientFirstName]);

  const toggleInvoice = (id: number) => setSelectedInvoices((prev) => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });
  const toggleDoc = (id: number) => setSelectedDocs((prev) => {
    const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next;
  });

  const selectedCount =
    (includeIntake ? 1 : 0) +
    (includeSuperbill ? 1 : 0) +
    selectedInvoices.size +
    selectedDocs.size;

  const buildSpecs = (): ClientDocumentEmailSpec[] => {
    const specs: ClientDocumentEmailSpec[] = [];
    if (includeIntake && activeTemplateIds.length) specs.push({ kind: 'intake', templateIds: activeTemplateIds, fillable: true });
    if (includeSuperbill) specs.push({ kind: 'superbill', startDate: sbStart, endDate: sbEnd });
    selectedInvoices.forEach((invoiceId) => specs.push({ kind: 'invoice', invoiceId }));
    selectedDocs.forEach((documentId) => specs.push({ kind: 'document', documentId }));
    return specs;
  };

  const handleSend = async () => {
    const recipient = to.trim();
    if (!recipient) { setError('Enter a recipient email address'); return; }
    const specs = buildSpecs();
    if (specs.length === 0) { setError('Select at least one document'); return; }
    setSending(true);
    setError(null);
    try {
      const res = await window.api.clientDocuments.emailBundle({ clientId, to: recipient, subject, bodyText: body, specs });
      if (res.success) {
        onSent?.({ count: res.count, to: recipient, skipped: res.skipped || [] });
        onClose();
      } else {
        setError(res.error || 'Failed to send');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to send');
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  const nothingAvailable = activeTemplateIds.length === 0 && invoices.length === 0 && documents.length === 0;
  const emailValid = /^\S+@\S+\.\S+$/.test(to.trim());

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={() => !sending && onClose()} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-xl mx-4 max-h-[88vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-2">
            <Mail size={18} className="text-teal-600" />
            <h2 className="text-lg font-semibold text-[var(--color-text)]">
              Send Documents{clientFirstName ? ` to ${clientFirstName}` : ''}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg"><X size={18} /></button>
        </div>

        {loading ? (
          <div className="px-6 py-12 text-center text-sm text-[var(--color-text-secondary)]">Loading…</div>
        ) : !emailConfigured ? (
          <div className="px-6 py-10 text-center">
            <Mail size={32} className="mx-auto text-gray-400 mb-3 opacity-60" />
            <p className="text-sm text-[var(--color-text)] font-medium mb-1">Email isn't set up yet</p>
            <p className="text-sm text-[var(--color-text-secondary)] mb-5">
              Connect your email account in <strong>Settings → Email</strong> to send documents from your own address.
            </p>
            <div className="flex justify-center gap-2">
              <button className="btn-secondary" onClick={onClose}>Close</button>
              <button className="btn-primary" onClick={() => { onClose(); navigate('/settings?section=email'); }}>Go to Settings</button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-6 space-y-5">
              {nothingAvailable ? (
                <div className="text-sm text-[var(--color-text-secondary)] text-center py-6">
                  Nothing to send yet. Generate a Good Faith Estimate, upload a document, or create an invoice first.
                </div>
              ) : (
                <>
                  {/* Generate fresh */}
                  <div>
                    <h3 className="text-sm font-medium text-[var(--color-text)] mb-2">Generate &amp; attach</h3>
                    <div className="space-y-1.5">
                      {activeTemplateIds.length > 0 && (
                        <label className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-50 border border-transparent">
                          <input type="checkbox" className="rounded border-gray-300 text-teal-600" checked={includeIntake} onChange={(e) => setIncludeIntake(e.target.checked)} />
                          <ClipboardList size={15} className="text-teal-600 shrink-0" />
                          <span className="text-sm flex-1">Intake packet <span className="text-xs text-[var(--color-text-secondary)]">({activeTemplateIds.length} form{activeTemplateIds.length !== 1 ? 's' : ''}, fillable)</span></span>
                        </label>
                      )}
                      <label className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-50 border border-transparent">
                        <input type="checkbox" className="rounded border-gray-300 text-teal-600" checked={includeSuperbill} onChange={(e) => setIncludeSuperbill(e.target.checked)} />
                        <Receipt size={15} className="text-teal-600 shrink-0" />
                        <span className="text-sm flex-1">Superbill <span className="text-xs text-[var(--color-text-secondary)]">(date range)</span></span>
                      </label>
                      {includeSuperbill && (
                        <div className="flex items-center gap-2 pl-10 pb-1">
                          <input type="date" className="input text-sm" value={sbStart} onChange={(e) => setSbStart(e.target.value)} />
                          <span className="text-xs text-[var(--color-text-secondary)]">to</span>
                          <input type="date" className="input text-sm" value={sbEnd} onChange={(e) => setSbEnd(e.target.value)} />
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Invoices / statements */}
                  {invoices.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-[var(--color-text)] mb-2">Invoices &amp; statements</h3>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {invoices.map((inv) => (
                          <label key={inv.id} className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-50 border border-transparent">
                            <input type="checkbox" className="rounded border-gray-300 text-teal-600" checked={selectedInvoices.has(inv.id)} onChange={() => toggleInvoice(inv.id)} />
                            <Receipt size={15} className="text-blue-500 shrink-0" />
                            <span className="text-sm flex-1 truncate">
                              {inv.invoice_number || `Invoice #${inv.id}`}
                              <span className="text-xs text-[var(--color-text-secondary)] ml-2">{fmtMoney((inv as any).total_amount)}</span>
                            </span>
                            <span className="text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)]">{inv.status}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Saved documents (incl. GFEs + uploads) */}
                  {documents.length > 0 && (
                    <div>
                      <h3 className="text-sm font-medium text-[var(--color-text)] mb-2">Saved documents</h3>
                      <div className="space-y-1 max-h-48 overflow-y-auto">
                        {documents.map((doc) => {
                          const isGfe = doc.category === 'good_faith_estimate';
                          return (
                            <label key={doc.id} className="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer hover:bg-gray-50 border border-transparent">
                              <input type="checkbox" className="rounded border-gray-300 text-teal-600" checked={selectedDocs.has(doc.id)} onChange={() => toggleDoc(doc.id)} />
                              {isGfe ? <FileCheck size={15} className="text-emerald-600 shrink-0" /> : <FileText size={15} className="text-teal-600 shrink-0" />}
                              <span className="text-sm flex-1 truncate">{doc.original_name || doc.filename}</span>
                              <span className="text-[10px] text-[var(--color-text-secondary)] whitespace-nowrap">{prettyCategory(doc.category)}</span>
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Compose */}
              <div className="pt-1 border-t border-[var(--color-border)] space-y-3">
                <div>
                  <label className="label">To</label>
                  <input type="email" className="input w-full" value={to} onChange={(e) => setTo(e.target.value)} placeholder="client@example.com" />
                  <div className="flex items-center justify-between mt-1">
                    {!to.trim()
                      ? <span className="text-xs text-amber-600">No email on file — enter one above.</span>
                      : <span />}
                    {fromAddress && <span className="text-xs text-[var(--color-text-secondary)]">Sending from {fromAddress}</span>}
                  </div>
                </div>
                <div>
                  <label className="label">Subject</label>
                  <input className="input w-full" value={subject} onChange={(e) => setSubject(e.target.value)} />
                </div>
                <div>
                  <label className="label">Message</label>
                  <textarea className="input w-full text-sm" rows={4} value={body} onChange={(e) => setBody(e.target.value)} />
                </div>
              </div>

              {error && <p className="text-sm text-red-600">{error}</p>}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between px-6 py-4 border-t">
              <div className="text-sm text-[var(--color-text-secondary)]">
                {selectedCount} document{selectedCount !== 1 ? 's' : ''} selected
              </div>
              <div className="flex items-center gap-2">
                <button className="btn-secondary" onClick={onClose} disabled={sending}>Cancel</button>
                <button
                  className="btn-primary flex items-center gap-1.5"
                  onClick={handleSend}
                  disabled={sending || selectedCount === 0 || !emailValid}
                >
                  <Send size={14} />
                  {sending ? 'Sending…' : `Send${selectedCount ? ` (${selectedCount})` : ''}`}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
