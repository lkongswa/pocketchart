import React, { useState, useEffect } from 'react';
import { X, FileText, Download, Printer, User } from 'lucide-react';
import type { IntakeFormTemplate, Client } from '../../shared/types';

interface IntakePacketBuilderProps {
  isOpen: boolean;
  onClose: () => void;
  templates: IntakeFormTemplate[];
}

export default function IntakePacketBuilder({ isOpen, onClose, templates }: IntakePacketBuilderProps) {
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [selectedClientId, setSelectedClientId] = useState<number | undefined>(undefined);
  const [fillable, setFillable] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [previewPdf, setPreviewPdf] = useState<string | null>(null);
  const [clientSearch, setClientSearch] = useState('');

  // Initialize with all active templates selected
  useEffect(() => {
    if (isOpen) {
      setSelectedIds(templates.filter(t => t.is_active).map(t => t.id));
      setPreviewPdf(null);
      setSelectedClientId(undefined);
      setClientSearch('');
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
          <div className="text-sm text-[var(--color-text-secondary)]">
            {selectedIds.length} form{selectedIds.length !== 1 ? 's' : ''} selected
          </div>
          <div className="flex items-center gap-3">
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
    </div>
  );
}
