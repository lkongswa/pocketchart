import React, { useEffect, useState } from 'react';
import { X, Mail, Paperclip, Loader2 } from 'lucide-react';

/**
 * EmailComposeModal — a small reusable compose dialog for emailing a single PDF
 * (a note, eval, or invoice) to the client. The parent supplies sensible defaults
 * and an `onSend` that performs the actual generate-PDF + send.
 */
interface EmailComposeModalProps {
  isOpen: boolean;
  onClose: () => void;
  heading: string;
  attachmentLabel?: string;
  defaultTo: string;
  defaultSubject: string;
  defaultBody: string;
  onSend: (to: string, subject: string, body: string) => Promise<void>;
  /** deep-link to Settings → Email when the provider isn't configured */
  onConfigureEmail?: () => void;
}

export default function EmailComposeModal({
  isOpen,
  onClose,
  heading,
  attachmentLabel,
  defaultTo,
  defaultSubject,
  defaultBody,
  onSend,
  onConfigureEmail,
}: EmailComposeModalProps) {
  const [to, setTo] = useState(defaultTo);
  const [subject, setSubject] = useState(defaultSubject);
  const [body, setBody] = useState(defaultBody);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setTo(defaultTo);
      setSubject(defaultSubject);
      setBody(defaultBody);
      setError(null);
      setSending(false);
    }
  }, [isOpen, defaultTo, defaultSubject, defaultBody]);

  if (!isOpen) return null;

  const notConfigured = !!error && /not configured|provider|email is not|set up email/i.test(error);

  const handleSend = async () => {
    if (!to.trim()) {
      setError('Please enter a recipient email address.');
      return;
    }
    setSending(true);
    setError(null);
    try {
      await onSend(to.trim(), subject, body);
      onClose();
    } catch (e: any) {
      setError(e?.message || 'Failed to send email.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="card w-full max-w-lg p-5 space-y-4" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h3 className="section-title flex items-center gap-2">
            <Mail size={16} className="text-[var(--color-primary)]" /> {heading}
          </h3>
          <button className="btn-ghost btn-sm" onClick={onClose}><X size={16} /></button>
        </div>

        {attachmentLabel && (
          <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)] bg-gray-50 border border-[var(--color-border)] rounded-md px-3 py-2">
            <Paperclip size={13} /> {attachmentLabel}
          </div>
        )}

        <div>
          <label className="label">To</label>
          <input className="input w-full" type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="client@example.com" />
        </div>
        <div>
          <label className="label">Subject</label>
          <input className="input w-full" value={subject} onChange={(e) => setSubject(e.target.value)} />
        </div>
        <div>
          <label className="label">Message</label>
          <textarea className="textarea w-full" rows={6} value={body} onChange={(e) => setBody(e.target.value)} />
        </div>

        {error && (
          <div className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
            {error}
            {notConfigured && onConfigureEmail && (
              <button className="ml-2 underline font-medium" onClick={onConfigureEmail}>Set up email</button>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button className="btn-secondary btn-sm" onClick={onClose} disabled={sending}>Cancel</button>
          <button className="btn-primary btn-sm gap-1.5" onClick={handleSend} disabled={sending || !to.trim()}>
            {sending ? <Loader2 size={14} className="animate-spin" /> : <Mail size={14} />} Send
          </button>
        </div>
      </div>
    </div>
  );
}
