import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { X, FileText, Download, Printer, User, Mail, Send } from 'lucide-react';
import type { IntakeFormTemplate, Client } from '../../shared/types';

interface IntakePacketBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  templates: IntakeFormTemplate[];
}

export default function IntakePacketBuilder({ isOpen, onClose, templates }: IntakePacketBuilderProps) {
  const navigate = useNavigate();
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<number | undefined>(undefined);
  const [fillable, setFillable] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [previewPdf, setPreviewPdf] = useState<string | null>(null);
  const [clientSearch, setClientSearch] = useState('');

  // Email-packet dialog state (mirrors the invoice email dialog)
  const [emailing, setEmailing] = useState(false);
  const [emailPrep, setEmailPrep] = useState<{ emailConfigured: boolean; fromAddress: string; formNames: string[] } | null>(null);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSending, setEmailSending] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSentTo, setEmailSentTo] = useState<string | null>(null);

  // Initialize with all active templates selected
  useEffect(() => {
    if (isOpen) {
      setSelectedIds(templates.filter(t => t.is_active).map(t => t.id));
      setPreviewPdf(null);
      setSelectedClientId(undefined);
      setClientSearch('');
      setEmailing(false);
      setEmailSentTo(null);
    }
  }, [isOpen, templates]);

  // Load clients for pre-fill
  useEffect(() => {
    if (!isOpen) return;
    window.api.clients.list().then((data: Client[]) => {
      setClients(data.filter(c => !c.deleted_at));
    });
  }, [isOpen]);

  const toggleTemplate = (id: number) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const handleGenerate = async () => {
    if (selectedIds.length === 0) return;
    setGenerating(true);
    try {
      const result = await window.api.intakeForms.generatePdf({
        templateIds: selectedIds,
        clientId: selectedClientId,
        fillable,
      });
      setPreviewPdf(result.base64Pdf);
    } catch (err) {
      console.error('Failed to generate PDF:', err);
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!previewPdf) return;
    const clientName = selectedClientId
      ? clients.find(c => c.id === selectedClientId)
      : null;
    const filename = `intake_packet_${clientName ? `${clientName.first_name}_${clientName.last_name}` : 'blank'}_${new Date().toISOString().slice(0, 10)}.pdf`;
    await window.api.intakeForms.savePdf({ base64Pdf: previewPdf, filename });
  };

  // Open the email dialog: ask the backend to merge the saved template with this client's
  // name + practice and prefill the recipient (client email), subject, and body.
  const openEmail = async () => {
    if (selectedIds.length === 0) return;
    setEmailing(true);
    setEmailPrep(null);
    setEmailTo('');
    setEmailSubject('');
    setEmailBody('');
    setEmailError(null);
    setEmailSentTo(null);
    setEmailLoading(true);
    try {
      const prep = await window.api.intakeForms.prepareEmail({
        templateIds: selectedIds,
        clientId: selectedClientId,
        fillable,
      });
      setEmailPrep({ emailConfigured: prep.emailConfigured, fromAddress: prep.fromAddress, formNames: prep.formNames });
      setEmailTo(prep.to || '');
      setEmailSubject(prep.subject || '');
      setEmailBody(prep.bodyText || '');
    } catch (err: any) {
      setEmailError(err?.message || 'Failed to prepare email');
    } finally {
      setEmailLoading(false);
    }
  };

  const handleSendEmail = async () => {
    const to = emailTo.trim();
    if (!to) { setEmailError('Enter a recipient email address'); return; }
    setEmailSending(true);
    setEmailError(null);
    try {
      const res = await window.api.intakeForms.email({
        templateIds: selectedIds,
        clientId: selectedClientId,
        fillable,
        to,
        subject: emailSubject,
        bodyText: emailBody,
      });
      if (res.success) {
        setEmailSentTo(to);
        setEmailing(false);
      } else {
        setEmailError(res.error || 'Failed to send email');
      }
    } catch (err: any) {
      setEmailError(err?.message || 'Failed to send email');
    } finally {
      setEmailSending(false);
    }
  };

  const filteredClients = clientSearch
    ? clients.filter(c =>
        `${c.first_name} ${c.last_name}`.toLowerCase().includes(clientSearch.toLowerCase())
      ).slice(0, 10)
    : [];

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-xl mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Generate Intake Packet</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-5">
          {/* Step 1: Select templates */}
          <div>
            <h3 className="text-sm font-medium text-[var(--color-text)] mb-2">1. Select Forms</h3>
            <div className="space-y-1">
              {templates.map(tmpl => (
                <label
                  key={tmpl.id}
                  className={`flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer ${
                    selectedIds.includes(tmpl.id) ? 'bg-teal-50 border border-teal-200' : 'hover:bg-gray-50 border border-transparent'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={selectedIds.includes(tmpl.id)}
                    onChange={() => toggleTemplate(tmpl.id)}
                    className="rounded border-gray-300 text-teal-600"
                  />
                  <FileText size={14} className="text-teal-600 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium">{tmpl.name}</div>
                    <div className="text-xs text-[var(--color-text-secondary)]">{tmpl.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Step 2: Select client (optional) */}
          <div>
            <h3 className="text-sm font-medium text-[var(--color-text)] mb-2">2. Pre-fill for Client (optional)</h3>
            {selectedClientId ? (
              <div className="flex items-center gap-2 px-3 py-2 bg-blue-50 rounded-lg border border-blue-200">
                <User size={14} className="text-blue-600" />
                <span className="text-sm flex-1">
                  {clients.find(c => c.id === selectedClientId)?.first_name}{' '}
                  {clients.find(c => c.id === selectedClientId)?.last_name}
                </span>
                <button
                  type="button"
                  className="text-xs text-blue-600 hover:underline"
                  onClick={() => { setSelectedClientId(undefined); setClientSearch(''); }}
                >
                  Change
                </button>
              </div>
            ) : (
              <div className="relative">
                <input
                  type="text"
                  className="input w-full"
                  placeholder="Search client name..."
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                />
                {clientSearch && filteredClients.length > 0 && (
                  <div className="absolute z-10 mt-1 w-full bg-white border rounded-lg shadow-lg max-h-40 overflow-y-auto">
                    {filteredClients.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        className="w-full text-left px-3 py-2 text-sm hover:bg-blue-50"
                        onClick={() => { setSelectedClientId(c.id); setClientSearch(''); }}
                      >
                        {c.first_name} {c.last_name}
                        {c.dob && <span className="text-xs text-gray-400 ml-2">DOB: {c.dob}</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Step 3: Options */}
          <div>
            <h3 className="text-sm font-medium text-[var(--color-text)] mb-2">3. Options</h3>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={fillable}
                onChange={(e) => setFillable(e.target.checked)}
                className="rounded border-gray-300 text-teal-600"
              />
              <span className="text-sm">Generate fillable PDF (with form fields)</span>
            </label>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t">
          <div className="text-sm">
            {emailSentTo ? (
              <span className="flex items-center gap-1.5 text-teal-700 font-medium">
                <Mail size={14} /> Emailed to {emailSentTo}
              </span>
            ) : (
              <span className="text-[var(--color-text-secondary)]">
                {selectedIds.length} form{selectedIds.length !== 1 ? 's' : ''} selected
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="btn-secondary flex items-center gap-2"
              onClick={openEmail}
              disabled={selectedIds.length === 0}
              title="Email these forms to a client"
            >
              <Mail size={14} />
              Email to client
            </button>
            {previewPdf && (
              <button
                type="button"
                className="btn-secondary flex items-center gap-2"
                onClick={handleSave}
              >
                <Download size={14} />
                Save PDF
              </button>
            )}
            <button
              type="button"
              className="btn-primary flex items-center gap-2"
              onClick={handleGenerate}
              disabled={selectedIds.length === 0 || generating}
            >
              <Printer size={14} />
              {generating ? 'Generating...' : previewPdf ? 'Regenerate' : 'Generate PDF'}
            </button>
          </div>
        </div>
      </div>

      {/* Email dialog */}
      {emailing && (
        <div className="absolute inset-0 z-10 flex items-center justify-center" onClick={() => !emailSending && setEmailing(false)}>
          <div className="absolute inset-0 bg-black/40" />
          <div className="relative z-10 bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-6 py-4 border-b">
              <Mail size={18} className="text-teal-600" />
              <h3 className="text-base font-semibold text-[var(--color-text)]">Email Intake Packet</h3>
            </div>

            {emailLoading || !emailPrep ? (
              <div className="px-6 py-10 text-center text-sm text-[var(--color-text-secondary)]">
                {emailError || 'Preparing email…'}
              </div>
            ) : !emailPrep.emailConfigured ? (
              <div className="px-6 py-8 text-center">
                <Mail size={32} className="mx-auto text-gray-400 mb-3 opacity-60" />
                <p className="text-sm text-[var(--color-text)] font-medium mb-1">Email isn't set up yet</p>
                <p className="text-sm text-[var(--color-text-secondary)] mb-5">
                  Connect your email account in <strong>Settings → Email</strong> to send forms from your own address.
                </p>
                <div className="flex justify-center gap-2">
                  <button className="btn-secondary" onClick={() => setEmailing(false)}>Close</button>
                  <button className="btn-primary" onClick={() => { setEmailing(false); onClose(); navigate('/settings?section=email'); }}>Go to Settings</button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                  <div>
                    <label className="label">To</label>
                    <input
                      type="email"
                      className="input w-full"
                      value={emailTo}
                      onChange={(e) => setEmailTo(e.target.value)}
                      placeholder="client@example.com"
                    />
                    {!emailTo.trim() && (
                      <p className="text-xs text-amber-600 mt-1">No email on file for this client — enter one above.</p>
                    )}
                    {emailPrep.fromAddress && (
                      <p className="text-xs text-[var(--color-text-secondary)] mt-1">Sending from {emailPrep.fromAddress}</p>
                    )}
                  </div>

                  <div>
                    <label className="label">Subject</label>
                    <input className="input w-full" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />
                  </div>

                  <div>
                    <label className="label">Message</label>
                    <textarea
                      className="input w-full text-sm"
                      rows={6}
                      value={emailBody}
                      onChange={(e) => setEmailBody(e.target.value)}
                    />
                  </div>

                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-sm">
                    <FileText size={15} className="text-teal-600 flex-shrink-0" />
                    <span className="text-[var(--color-text)] truncate">
                      {emailPrep.formNames.length} form{emailPrep.formNames.length !== 1 ? 's' : ''}{fillable ? ' (fillable)' : ''}
                    </span>
                    <span className="ml-auto text-xs text-[var(--color-text-secondary)] whitespace-nowrap">PDF attached</span>
                  </div>

                  {fillable && (
                    <p className="text-xs text-[var(--color-text-secondary)]">
                      Your client can fill this out on their computer in any PDF reader — no printing or scanning needed.
                    </p>
                  )}

                  {emailError && (
                    <p className="text-sm text-red-600">{emailError}</p>
                  )}
                </div>

                <div className="flex items-center justify-end gap-2 px-6 py-4 border-t">
                  <button className="btn-secondary" onClick={() => setEmailing(false)} disabled={emailSending}>Cancel</button>
                  <button
                    className="btn-primary flex items-center gap-1.5"
                    onClick={handleSendEmail}
                    disabled={emailSending || !/^\S+@\S+\.\S+$/.test(emailTo.trim())}
                  >
                    <Send size={14} />
                    {emailSending ? 'Sending…' : 'Send'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
