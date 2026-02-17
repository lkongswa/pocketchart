import React, { useState, useEffect } from 'react';
import { X, Send, CheckCircle, AlertCircle } from 'lucide-react';
import PhysicianCombobox from './PhysicianCombobox';
import type { Physician, ClientDocument } from '../../shared/types';

export type FaxDocType = 'eval' | 'note' | 'document';

interface FaxSendModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId?: number;
  /** The ID of the eval, note, or client_document to fax */
  documentId?: number;
  /** What kind of document the ID refers to */
  docType?: FaxDocType;
  /** Pre-populate with this physician (from client.referring_physician_id) */
  referringPhysicianId?: number | null;
  /** Fallback: free-text physician name (from client.referring_physician) */
  referringPhysicianName?: string;
  /** Fallback: free-text referring fax (from client.referring_fax) */
  referringFax?: string;
  /** Called after a fax is successfully queued (e.g., to refresh outbox) */
  onSent?: () => void;
}

export default function FaxSendModal({ isOpen, onClose, clientId, documentId, docType, referringPhysicianId, referringPhysicianName, referringFax, onSent }: FaxSendModalProps) {
  const [selectedPhysician, setSelectedPhysician] = useState<Physician | null>(null);
  const [manualFax, setManualFax] = useState('');
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<number | undefined>(documentId);
  const [selectedDocType, setSelectedDocType] = useState<FaxDocType | undefined>(docType);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Reset state when modal opens/closes
  useEffect(() => {
    if (isOpen) {
      setSelectedDocId(documentId);
      setSelectedDocType(docType);
      setSending(false);
      setSent(false);
      setError(null);
    } else {
      setSelectedPhysician(null);
      setManualFax('');
      setError(null);
    }
  }, [isOpen, documentId, docType]);

  // Pre-populate referring physician when modal opens
  useEffect(() => {
    if (!isOpen) return;
    if (!referringPhysicianId && !referringPhysicianName && !referringFax) return;

    window.api.physicians.list().then((physicians: Physician[]) => {
      // Try exact ID match first
      if (referringPhysicianId) {
        const match = physicians.find(p => p.id === referringPhysicianId);
        if (match) { setSelectedPhysician(match); return; }
      }
      // Fallback: match by name
      if (referringPhysicianName) {
        const nameMatch = physicians.find(p =>
          p.name.toLowerCase() === referringPhysicianName.toLowerCase()
        );
        if (nameMatch) { setSelectedPhysician(nameMatch); return; }
      }
      // Fallback: just pre-fill the manual fax number from the client record
      if (referringFax) {
        setManualFax(referringFax);
      }
    });
  }, [isOpen, referringPhysicianId, referringPhysicianName, referringFax]);

  // Load client documents only when docType is 'document' or not set (fallback picker)
  useEffect(() => {
    if (!isOpen || !clientId) return;
    if (docType === 'eval' || docType === 'note') return; // no need to list documents
    window.api.documents.list({ clientId }).then((docs: ClientDocument[]) => {
      setDocuments(docs.filter(d => !d.deleted_at));
    });
  }, [isOpen, clientId, docType]);

  const faxNumber = selectedPhysician?.fax_number || manualFax;

  const handleSend = async () => {
    if (!faxNumber) return;
    setSending(true);
    setError(null);
    try {
      await window.api.fax.send({
        documentId: selectedDocId,
        docType: selectedDocType || 'document',
        physicianId: selectedPhysician?.id,
        faxNumber,
        clientId,
      });
      setSent(true);
      onSent?.();
    } catch (err: any) {
      console.error('Failed to send fax:', err);
      setError(err?.message || 'Failed to send fax. Check your SRFax credentials in Settings.');
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  const docLabel = docType === 'eval' ? 'Evaluation' : docType === 'note' ? 'Note' : 'Document';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">
            Send Fax
          </h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {sent ? (
            <div className="text-center py-4">
              <CheckCircle className="mx-auto mb-2 text-green-500" size={32} />
              <div className="text-green-600 font-medium">Fax queued successfully!</div>
              <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                Track status in the Fax Center outbox.
              </p>
              <button type="button" className="btn-primary mt-4" onClick={onClose}>Done</button>
            </div>
          ) : (
            <>
              {/* Document info */}
              {documentId && (
                <div className="text-sm bg-gray-50 px-3 py-2 rounded border border-[var(--color-border)]">
                  <span className="text-[var(--color-text-secondary)]">Sending:</span>{' '}
                  <span className="font-medium text-[var(--color-text)]">{docLabel}</span>
                </div>
              )}

              {/* Recipient */}
              <div>
                <label className="label">Recipient</label>
                <PhysicianCombobox
                  value={selectedPhysician?.name || ''}
                  physicianId={selectedPhysician?.id}
                  onChange={(physician) => {
                    setSelectedPhysician(physician);
                    if (physician?.fax_number) setManualFax('');
                  }}
                  placeholder="Search physician or enter fax number..."
                />
              </div>

              {!selectedPhysician?.fax_number && (
                <div>
                  <label className="label">Fax Number</label>
                  <input
                    type="tel"
                    className="input w-full"
                    value={manualFax}
                    onChange={(e) => setManualFax(e.target.value)}
                    placeholder="(555) 123-4567"
                  />
                </div>
              )}

              {selectedPhysician?.fax_number && (
                <div className="text-sm text-[var(--color-text-secondary)] bg-gray-50 px-3 py-2 rounded">
                  Fax: {selectedPhysician.fax_number}
                </div>
              )}

              {/* Document selection — only for generic document faxing */}
              {!docType && clientId && documents.length > 0 && (
                <div>
                  <label className="label">Document</label>
                  <select
                    className="select w-full"
                    value={selectedDocId || ''}
                    onChange={(e) => setSelectedDocId(e.target.value ? Number(e.target.value) : undefined)}
                  >
                    <option value="">Select a document...</option>
                    {documents.map(doc => (
                      <option key={doc.id} value={doc.id}>{doc.original_name}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Error message */}
              {error && (
                <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
                  <AlertCircle size={16} className="shrink-0 mt-0.5" />
                  <span>{error}</span>
                </div>
              )}

              {/* Send button */}
              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  className="btn-primary flex items-center gap-2"
                  onClick={handleSend}
                  disabled={!faxNumber || sending}
                >
                  <Send size={14} />
                  {sending ? 'Sending...' : 'Send Fax'}
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
