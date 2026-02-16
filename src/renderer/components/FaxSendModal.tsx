import React, { useState, useEffect } from 'react';
import { X, Send } from 'lucide-react';
import PhysicianCombobox from './PhysicianCombobox';
import type { Physician, ClientDocument } from '../../shared/types';

interface FaxSendModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSend: (data: { documentId?: number; physicianId?: number; faxNumber: string; clientId?: number }) => Promise<any>;
  clientId?: number;
  documentId?: number;
}

export default function FaxSendModal({ isOpen, onClose, onSend, clientId, documentId }: FaxSendModalProps) {
  const [selectedPhysician, setSelectedPhysician] = useState<Physician | null>(null);
  const [manualFax, setManualFax] = useState('');
  const [documents, setDocuments] = useState<ClientDocument[]>([]);
  const [selectedDocId, setSelectedDocId] = useState<number | undefined>(documentId);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setSelectedPhysician(null);
      setManualFax('');
      setSelectedDocId(documentId);
      setSending(false);
      setSent(false);
    }
  }, [isOpen, documentId]);

  // Load client documents if we have a client
  useEffect(() => {
    if (!isOpen || !clientId) return;
    window.api.documents.list({ clientId }).then((docs: ClientDocument[]) => {
      setDocuments(docs.filter(d => !d.deleted_at));
    });
  }, [isOpen, clientId]);

  const faxNumber = selectedPhysician?.fax_number || manualFax;

  const handleSend = async () => {
    if (!faxNumber) return;
    setSending(true);
    try {
      await onSend({
        documentId: selectedDocId,
        physicianId: selectedPhysician?.id,
        faxNumber,
        clientId,
      });
      setSent(true);
    } catch (err) {
      console.error('Failed to send fax:', err);
    } finally {
      setSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">Send Fax</h2>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4">
          {sent ? (
            <div className="text-center py-4">
              <div className="text-green-600 font-medium">Fax queued successfully!</div>
              <p className="text-sm text-[var(--color-text-secondary)] mt-1">
                Track status in the Outbox tab.
              </p>
              <button type="button" className="btn-primary mt-4" onClick={onClose}>Done</button>
            </div>
          ) : (
            <>
              {/* Recipient */}
              <div>
                <label className="label">Recipient</label>
                <PhysicianCombobox
                  value={selectedPhysician?.name || ''}
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

              {/* Document selection */}
              {clientId && documents.length > 0 && (
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
