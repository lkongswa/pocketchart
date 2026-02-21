import React, { useState, useEffect, useCallback } from 'react';
import { X, Plus, Trash2, FileText, Download, AlertTriangle } from 'lucide-react';
import type { Client, FeeScheduleEntry, GFELineItem, GoodFaithEstimate, Practice } from '../../shared/types';

interface GoodFaithEstimateModalProps {
  isOpen: boolean;
  onClose: () => void;
  client: Client;
  feeSchedule: FeeScheduleEntry[];
  onGenerated?: () => void;
}

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

export default function GoodFaithEstimateModal({
  isOpen,
  onClose,
  client,
  feeSchedule,
  onGenerated,
}: GoodFaithEstimateModalProps) {
  // Service period
  const today = new Date().toISOString().split('T')[0];
  const oneYearLater = (() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().split('T')[0];
  })();

  const [servicePeriodStart, setServicePeriodStart] = useState(today);
  const [servicePeriodEnd, setServicePeriodEnd] = useState(oneYearLater);
  const [lineItems, setLineItems] = useState<GFELineItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [result, setResult] = useState<{ base64Pdf: string; filename: string; estimatedTotal: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  // GFE history
  const [gfeHistory, setGfeHistory] = useState<GoodFaithEstimate[]>([]);

  // Pre-populate line items from fee schedule and client discipline
  useEffect(() => {
    if (!isOpen) return;

    const items: GFELineItem[] = [];

    // Find eval CPT for discipline
    const evalCptMap: Record<string, string[]> = {
      PT: ['97161', '97162', '97163'],
      OT: ['97165', '97166', '97167', '97168'],
      ST: ['92521', '92522', '92523', '92524'],
      MFT: ['90791'],
    };
    const evalCodes = evalCptMap[client.discipline] || ['97161'];
    const evalEntry = feeSchedule.find(f => evalCodes.includes(f.cpt_code));
    if (evalEntry) {
      items.push({
        description: evalEntry.description || 'Initial Evaluation',
        cpt_code: evalEntry.cpt_code,
        quantity: 1,
        rate: evalEntry.amount,
        total: evalEntry.amount,
      });
    }

    // Default treatment sessions using client's default CPT code
    const treatmentCpt = client.default_cpt_code || '97530';
    const treatmentEntry = feeSchedule.find(f => f.cpt_code === treatmentCpt);
    if (treatmentEntry) {
      const qty = 24; // Default: ~2x/week for 12 months → ~24 sessions as starting point
      items.push({
        description: treatmentEntry.description || 'Treatment Session',
        cpt_code: treatmentEntry.cpt_code,
        quantity: qty,
        rate: treatmentEntry.amount,
        total: qty * treatmentEntry.amount,
      });
    }

    // If nothing was auto-populated, add an empty row
    if (items.length === 0) {
      items.push({ description: '', cpt_code: '', quantity: 1, rate: 0, total: 0 });
    }

    setLineItems(items);
    setResult(null);
    setError(null);
    setServicePeriodStart(today);
    setServicePeriodEnd(oneYearLater);

    // Load GFE history
    window.api.gfe.list(client.id).then(setGfeHistory).catch(() => setGfeHistory([]));
  }, [isOpen, client.id]);

  const handleItemChange = useCallback((index: number, field: keyof GFELineItem, value: string | number) => {
    setLineItems(prev => {
      const updated = [...prev];
      updated[index] = { ...updated[index], [field]: value };
      if (field === 'quantity' || field === 'rate') {
        const qty = field === 'quantity' ? Number(value) : updated[index].quantity;
        const rate = field === 'rate' ? Number(value) : updated[index].rate;
        updated[index].total = qty * rate;
      }
      return updated;
    });
  }, []);

  const handleCptSelect = useCallback((index: number, cptCode: string) => {
    const entry = feeSchedule.find(f => f.cpt_code === cptCode);
    if (!entry) return;
    setLineItems(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        cpt_code: cptCode,
        description: entry.description || updated[index].description,
        rate: entry.amount,
        total: updated[index].quantity * entry.amount,
      };
      return updated;
    });
  }, [feeSchedule]);

  const addItem = () => {
    setLineItems(prev => [...prev, { description: '', cpt_code: '', quantity: 1, rate: 0, total: 0 }]);
  };

  const removeItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(prev => prev.filter((_, i) => i !== index));
    }
  };

  const estimatedTotal = lineItems.reduce((sum, li) => sum + (li.total || 0), 0);

  // Build diagnosis codes array
  const diagnosisCodes: string[] = [];
  if (client.primary_dx_code) diagnosisCodes.push(client.primary_dx_code);
  try {
    const secondary = typeof client.secondary_dx === 'string' ? JSON.parse(client.secondary_dx) : client.secondary_dx;
    if (Array.isArray(secondary)) {
      for (const dx of secondary) {
        const code = typeof dx === 'object' ? dx.code : String(dx);
        if (code) diagnosisCodes.push(code);
      }
    }
  } catch { /* ignore */ }

  const handleGenerate = async () => {
    if (lineItems.length === 0 || lineItems.every(li => !li.description && !li.cpt_code)) {
      setError('Please add at least one service line item.');
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const res = await window.api.gfe.generate({
        clientId: client.id,
        servicePeriodStart,
        servicePeriodEnd,
        lineItems,
        diagnosisCodes,
      });
      setResult(res);
      onGenerated?.();
      // Refresh history
      window.api.gfe.list(client.id).then(setGfeHistory).catch(() => {});
    } catch (err: any) {
      setError(err.message || 'Failed to generate Good Faith Estimate');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!result) return;
    await window.api.gfe.save({ base64Pdf: result.base64Pdf, filename: result.filename });
  };

  if (!isOpen) return null;

  const hasActiveGfe = gfeHistory.some(g => g.status === 'active');

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="bg-[var(--color-bg)] border border-[var(--color-border)] rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <div>
            <h2 className="text-lg font-semibold text-[var(--color-text)]">Good Faith Estimate</h2>
            <p className="text-xs text-[var(--color-text-secondary)]">
              No Surprises Act — {client.first_name} {client.last_name}
            </p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-[var(--color-bg-secondary)] transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Self-pay nudge */}
          {!client.insurance_payer && (
            <div className="flex items-start gap-2.5 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>Self-pay client — the No Surprises Act requires a Good Faith Estimate before providing services.</span>
            </div>
          )}

          {/* Service Period */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Service Period Start</label>
              <input
                type="date"
                className="input-field w-full"
                value={servicePeriodStart}
                onChange={e => setServicePeriodStart(e.target.value)}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Service Period End</label>
              <input
                type="date"
                className="input-field w-full"
                value={servicePeriodEnd}
                onChange={e => setServicePeriodEnd(e.target.value)}
              />
            </div>
          </div>

          {/* Diagnosis Summary */}
          <div>
            <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-1">Diagnosis</label>
            <div className="text-sm text-[var(--color-text)]">
              {client.primary_dx_code ? (
                <span>{client.primary_dx_code} — {client.primary_dx_description || 'No description'}</span>
              ) : (
                <span className="italic text-[var(--color-text-secondary)]">To be determined following initial evaluation</span>
              )}
            </div>
          </div>

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-medium text-[var(--color-text-secondary)]">Expected Services</label>
              <button onClick={addItem} className="btn-ghost btn-sm gap-1">
                <Plus size={14} /> Add Service
              </button>
            </div>

            <div className="border border-[var(--color-border)] rounded-lg overflow-hidden">
              {/* Table header */}
              <div className="grid grid-cols-[1fr_100px_70px_100px_100px_36px] gap-2 px-3 py-2 bg-[var(--color-bg-secondary)] text-xs font-medium text-[var(--color-text-secondary)]">
                <span>Service</span>
                <span>CPT Code</span>
                <span>Qty</span>
                <span>Rate</span>
                <span>Total</span>
                <span></span>
              </div>

              {/* Table rows */}
              {lineItems.map((item, index) => (
                <div key={index} className="grid grid-cols-[1fr_100px_70px_100px_100px_36px] gap-2 px-3 py-2 border-t border-[var(--color-border)]">
                  <input
                    type="text"
                    className="input-field text-sm"
                    value={item.description}
                    onChange={e => handleItemChange(index, 'description', e.target.value)}
                    placeholder="Service description"
                  />
                  <select
                    className="input-field text-sm"
                    value={item.cpt_code}
                    onChange={e => handleCptSelect(index, e.target.value)}
                  >
                    <option value="">--</option>
                    {feeSchedule.map(f => (
                      <option key={f.id} value={f.cpt_code}>{f.cpt_code}</option>
                    ))}
                  </select>
                  <input
                    type="number"
                    className="input-field text-sm text-center"
                    value={item.quantity}
                    min={1}
                    onChange={e => handleItemChange(index, 'quantity', parseInt(e.target.value) || 1)}
                  />
                  <input
                    type="number"
                    className="input-field text-sm text-right"
                    value={item.rate}
                    min={0}
                    step={0.01}
                    onChange={e => handleItemChange(index, 'rate', parseFloat(e.target.value) || 0)}
                  />
                  <div className="flex items-center text-sm font-medium text-[var(--color-text)]">
                    {formatCurrency(item.total || 0)}
                  </div>
                  <button
                    onClick={() => removeItem(index)}
                    disabled={lineItems.length <= 1}
                    className="p-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
            </div>

            {/* Estimated Total */}
            <div className="flex justify-end mt-3">
              <div className="text-right">
                <span className="text-xs text-[var(--color-text-secondary)] mr-3">Estimated Total</span>
                <span className="text-xl font-bold text-[var(--color-text)]">{formatCurrency(estimatedTotal)}</span>
              </div>
            </div>
          </div>

          {/* Error */}
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Success / Result */}
          {result && (
            <div className="p-4 rounded-lg bg-emerald-50 border border-emerald-200">
              <div className="flex items-center gap-2 text-emerald-700 font-medium text-sm mb-2">
                <FileText size={16} />
                Good Faith Estimate Generated
              </div>
              <p className="text-xs text-emerald-600 mb-3">
                Saved to client documents. Estimated total: {formatCurrency(result.estimatedTotal)}
              </p>
              <button onClick={handleSave} className="btn-secondary btn-sm gap-1.5">
                <Download size={14} /> Save PDF to Computer
              </button>
            </div>
          )}

          {/* Existing GFE History */}
          {gfeHistory.length > 0 && !result && (
            <div>
              <label className="block text-xs font-medium text-[var(--color-text-secondary)] mb-2">Previous Estimates</label>
              <div className="space-y-2">
                {gfeHistory.map(gfe => (
                  <div key={gfe.id} className="flex items-center justify-between p-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-secondary)]">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[var(--color-text)]">
                          {formatCurrency(gfe.estimated_total)}
                        </span>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          gfe.status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                          gfe.status === 'superseded' ? 'bg-gray-100 text-gray-600' :
                          'bg-amber-100 text-amber-700'
                        }`}>
                          {gfe.status}
                        </span>
                      </div>
                      <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                        {gfe.service_period_start} to {gfe.service_period_end}
                      </p>
                    </div>
                    {gfe.document_id && (
                      <button
                        onClick={() => window.api.documents.open({ documentId: gfe.document_id! })}
                        className="btn-ghost btn-sm gap-1"
                      >
                        <FileText size={14} /> View
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Supersede warning */}
          {hasActiveGfe && !result && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-blue-50 border border-blue-200 text-blue-700 text-xs">
              <AlertTriangle size={14} className="shrink-0 mt-0.5" />
              <span>This client has an active GFE. Generating a new one will mark the current estimate as superseded.</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--color-border)]">
          <button onClick={onClose} className="btn-secondary">
            {result ? 'Close' : 'Cancel'}
          </button>
          {!result && (
            <button
              onClick={handleGenerate}
              disabled={generating || lineItems.every(li => !li.description && !li.cpt_code)}
              className="btn-primary gap-1.5"
            >
              {generating ? 'Generating...' : 'Generate Estimate'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
