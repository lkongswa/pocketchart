import React, { useState, useEffect, useCallback } from 'react';
import { Send, Search, FileText, ClipboardList, StickyNote, CheckCircle, AlertCircle, User } from 'lucide-react';
import PhysicianCombobox from './PhysicianCombobox';
import type { Client, Physician, ClientDocument, Evaluation, Note } from '../../shared/types';
import type { FaxDocType } from './FaxSendModal';

interface FaxablItem {
  id: number;
  type: FaxDocType;
  label: string;
  detail: string;
  signed: boolean;
}

interface FaxComposePanelProps {
  onSent?: () => void;
}

export default function FaxComposePanel({ onSent }: FaxComposePanelProps) {
  // Step tracking
  const [step, setStep] = useState<'client' | 'document' | 'recipient' | 'confirm'>('client');

  // Client selection
  const [clients, setClients] = useState<Client[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClient, setSelectedClient] = useState<Client | null>(null);

  // Document selection
  const [faxableItems, setFaxableItems] = useState<FaxablItem[]>([]);
  const [selectedItem, setSelectedItem] = useState<FaxablItem | null>(null);
  const [docLoading, setDocLoading] = useState(false);

  // Recipient
  const [selectedPhysician, setSelectedPhysician] = useState<Physician | null>(null);
  const [manualFax, setManualFax] = useState('');

  // Send state
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load client list on mount
  useEffect(() => {
    window.api.clients.list().then((data: Client[]) => {
      setClients(data.filter(c => !c.deleted_at && c.status !== 'discharged'));
    });
  }, []);

  // Load faxable items when a client is selected
  const loadFaxableItems = useCallback(async (client: Client) => {
    setDocLoading(true);
    const items: FaxablItem[] = [];

    try {
      // Load signed evaluations
      const evals: Evaluation[] = await window.api.evaluations.listByClient(client.id);
      for (const ev of evals) {
        if (ev.signed_at && !ev.deleted_at) {
          items.push({
            id: ev.id,
            type: 'eval',
            label: `Evaluation — ${ev.discipline || 'General'}`,
            detail: new Date(ev.eval_date).toLocaleDateString(),
            signed: true,
          });
        }
      }

      // Load signed notes
      const notes: Note[] = await window.api.notes.listByClient(client.id);
      for (const n of notes) {
        if (n.signed_at && !n.deleted_at) {
          items.push({
            id: n.id,
            type: 'note',
            label: `Note — ${n.cpt_code || 'Session'}`,
            detail: new Date(n.date_of_service).toLocaleDateString(),
            signed: true,
          });
        }
      }

      // Load documents (PDFs, images, etc.)
      const docs: ClientDocument[] = await window.api.documents.list({ clientId: client.id });
      for (const d of docs) {
        if (!d.deleted_at) {
          items.push({
            id: d.id,
            type: 'document',
            label: d.original_name,
            detail: d.category?.replace(/_/g, ' ') || 'Document',
            signed: true, // documents are always faxable
          });
        }
      }
    } catch (err) {
      console.error('Failed to load faxable items:', err);
    }

    setFaxableItems(items);
    setDocLoading(false);
  }, []);

  const handleSelectClient = (client: Client) => {
    setSelectedClient(client);
    setSelectedItem(null);
    setStep('document');
    loadFaxableItems(client);

    // Pre-populate physician from client's referring info
    if (client.referring_physician_id) {
      window.api.physicians.list().then((physicians: Physician[]) => {
        const match = physicians.find(p => p.id === client.referring_physician_id);
        if (match) setSelectedPhysician(match);
      });
    }
  };

  const handleSelectItem = (item: FaxablItem) => {
    setSelectedItem(item);
    setStep('recipient');
  };

  const faxNumber = selectedPhysician?.fax_number || manualFax;

  const handleSend = async () => {
    if (!faxNumber || !selectedItem || !selectedClient) return;
    setSending(true);
    setError(null);
    try {
      await window.api.fax.send({
        documentId: selectedItem.id,
        docType: selectedItem.type,
        physicianId: selectedPhysician?.id,
        faxNumber,
        clientId: selectedClient.id,
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

  const handleStartOver = () => {
    setStep('client');
    setSelectedClient(null);
    setSelectedItem(null);
    setSelectedPhysician(null);
    setManualFax('');
    setSent(false);
    setError(null);
  };

  const filteredClients = clientSearch.trim()
    ? clients.filter(c =>
        `${c.first_name} ${c.last_name}`.toLowerCase().includes(clientSearch.toLowerCase())
      ).slice(0, 10)
    : clients.slice(0, 10);

  // Icon for document type
  const docIcon = (type: FaxDocType) => {
    if (type === 'eval') return <ClipboardList size={14} className="text-violet-500" />;
    if (type === 'note') return <StickyNote size={14} className="text-blue-500" />;
    return <FileText size={14} className="text-slate-500" />;
  };

  // --- SUCCESS STATE ---
  if (sent) {
    return (
      <div className="text-center py-8">
        <CheckCircle className="mx-auto mb-3 text-green-500" size={36} />
        <div className="text-green-600 font-medium text-base">Fax queued successfully!</div>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1 mb-4">
          Track the status in the Outbox tab.
        </p>
        <button type="button" className="btn-ghost text-sm" onClick={handleStartOver}>
          Send Another Fax
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Progress breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
        <button
          type="button"
          onClick={() => { if (step !== 'client') { setStep('client'); setSelectedItem(null); } }}
          className={`flex items-center gap-1 ${step === 'client' ? 'text-[var(--color-primary)] font-semibold' : selectedClient ? 'text-[var(--color-text)] hover:underline cursor-pointer' : ''}`}
        >
          <User size={12} />
          {selectedClient ? `${selectedClient.first_name} ${selectedClient.last_name}` : 'Select Client'}
        </button>
        <span className="text-gray-300">/</span>
        <button
          type="button"
          onClick={() => { if (selectedClient && step !== 'document') { setStep('document'); } }}
          className={`flex items-center gap-1 ${step === 'document' ? 'text-[var(--color-primary)] font-semibold' : selectedItem ? 'text-[var(--color-text)] hover:underline cursor-pointer' : ''}`}
          disabled={!selectedClient}
        >
          <FileText size={12} />
          {selectedItem ? selectedItem.label : 'Select Document'}
        </button>
        <span className="text-gray-300">/</span>
        <span className={`flex items-center gap-1 ${step === 'recipient' || step === 'confirm' ? 'text-[var(--color-primary)] font-semibold' : ''}`}>
          <Send size={12} />
          Recipient & Send
        </span>
      </div>

      {/* STEP 1: Select Client */}
      {step === 'client' && (
        <div>
          <label className="label mb-2">Select a Client</label>
          <div className="relative mb-3">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              className="input w-full pl-9"
              placeholder="Search by name..."
              value={clientSearch}
              onChange={(e) => setClientSearch(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-0.5 max-h-64 overflow-y-auto">
            {filteredClients.map((c) => (
              <button
                key={c.id}
                type="button"
                className="w-full text-left px-3 py-2 rounded-lg hover:bg-blue-50 flex items-center justify-between group"
                onClick={() => handleSelectClient(c)}
              >
                <span className="text-sm font-medium text-[var(--color-text)]">
                  {c.first_name} {c.last_name}
                </span>
                <span className="text-xs text-[var(--color-text-secondary)] group-hover:text-blue-600">
                  {c.discipline || ''} · {c.status || 'active'}
                </span>
              </button>
            ))}
            {filteredClients.length === 0 && (
              <div className="text-sm text-[var(--color-text-secondary)] text-center py-4">
                No clients found
              </div>
            )}
          </div>
        </div>
      )}

      {/* STEP 2: Select Document */}
      {step === 'document' && (
        <div>
          <label className="label mb-2">Select a Document to Fax</label>
          {docLoading ? (
            <div className="text-sm text-[var(--color-text-secondary)] text-center py-6">Loading documents...</div>
          ) : faxableItems.length === 0 ? (
            <div className="text-sm text-[var(--color-text-secondary)] text-center py-6">
              No signed evaluations, notes, or documents found for this client.
            </div>
          ) : (
            <div className="space-y-0.5 max-h-72 overflow-y-auto">
              {faxableItems.map((item) => (
                <button
                  key={`${item.type}-${item.id}`}
                  type="button"
                  className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-blue-50 flex items-center gap-3 group"
                  onClick={() => handleSelectItem(item)}
                >
                  {docIcon(item.type)}
                  <div className="flex-1 min-w-0">
                    <span className="text-sm font-medium text-[var(--color-text)] block truncate">
                      {item.label}
                    </span>
                    <span className="text-xs text-[var(--color-text-secondary)]">
                      {item.detail}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* STEP 3: Recipient & Send */}
      {(step === 'recipient' || step === 'confirm') && (
        <div className="space-y-4">
          {/* Summary of what's being sent */}
          <div className="text-sm bg-gray-50 px-3 py-2 rounded border border-[var(--color-border)] flex items-center gap-2">
            {selectedItem && docIcon(selectedItem.type)}
            <span className="text-[var(--color-text-secondary)]">Sending:</span>
            <span className="font-medium text-[var(--color-text)]">{selectedItem?.label}</span>
            <span className="text-[var(--color-text-secondary)]">({selectedItem?.detail})</span>
          </div>

          {/* Recipient picker */}
          <div>
            <label className="label">Recipient</label>
            <PhysicianCombobox
              value={selectedPhysician?.name || ''}
              physicianId={selectedPhysician?.id}
              onChange={(physician) => {
                setSelectedPhysician(physician);
                if (physician?.fax_number) setManualFax('');
              }}
              placeholder="Search physician or enter name..."
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

          {/* Error */}
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm text-red-700">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {/* Send */}
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
        </div>
      )}
    </div>
  );
}
