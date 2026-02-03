import React, { useState, useEffect } from 'react';
import { X, Plus, Trash2, Calculator } from 'lucide-react';
import type { Client, Invoice, InvoiceItem, FeeScheduleEntry, Note } from '../../shared/types';

interface InvoiceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (invoice: Invoice) => void;
  clients: Client[];
  feeSchedule: FeeScheduleEntry[];
  invoice?: Invoice & { items: InvoiceItem[] };
}

export default function InvoiceModal({
  isOpen,
  onClose,
  onSave,
  clients,
  feeSchedule,
  invoice,
}: InvoiceModalProps) {
  const [clientId, setClientId] = useState<number | ''>(invoice?.client_id || '');
  const [invoiceDate, setInvoiceDate] = useState(
    invoice?.invoice_date || new Date().toISOString().slice(0, 10)
  );
  const [dueDate, setDueDate] = useState(invoice?.due_date || '');
  const [notes, setNotes] = useState(invoice?.notes || '');
  const [status, setStatus] = useState(invoice?.status || 'draft');
  const [items, setItems] = useState<Partial<InvoiceItem>[]>(
    invoice?.items || [{ description: '', cpt_code: '', units: 1, unit_price: 0, amount: 0 }]
  );
  const [unbilledNotes, setUnbilledNotes] = useState<Note[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [saving, setSaving] = useState(false);

  // Load unbilled notes when client changes
  useEffect(() => {
    if (!clientId) {
      setUnbilledNotes([]);
      return;
    }
    const loadNotes = async () => {
      setLoadingNotes(true);
      try {
        const notes = await window.api.notes.listByClient(clientId as number);
        // Filter to signed notes (could add more filters for unbilled)
        const signed = notes.filter((n) => n.signed_at);
        setUnbilledNotes(signed);
      } catch (err) {
        console.error('Failed to load notes:', err);
      } finally {
        setLoadingNotes(false);
      }
    };
    loadNotes();
  }, [clientId]);

  const calculateTotal = () => {
    return items.reduce((sum, item) => sum + (item.amount || 0), 0);
  };

  const handleItemChange = (index: number, field: keyof InvoiceItem, value: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };

    // Auto-calculate amount when units or unit_price change
    if (field === 'units' || field === 'unit_price') {
      const units = field === 'units' ? value : updated[index].units || 1;
      const unitPrice = field === 'unit_price' ? value : updated[index].unit_price || 0;
      updated[index].amount = units * unitPrice;
    }

    setItems(updated);
  };

  const handleCptSelect = (index: number, cptCode: string) => {
    const fee = feeSchedule.find((f) => f.cpt_code === cptCode);
    if (fee) {
      const updated = [...items];
      updated[index] = {
        ...updated[index],
        cpt_code: cptCode,
        description: fee.description,
        units: fee.default_units,
        unit_price: fee.amount,
        amount: fee.default_units * fee.amount,
      };
      setItems(updated);
    }
  };

  const addItem = () => {
    setItems([...items, { description: '', cpt_code: '', units: 1, unit_price: 0, amount: 0 }]);
  };

  const removeItem = (index: number) => {
    if (items.length > 1) {
      setItems(items.filter((_, i) => i !== index));
    }
  };

  const handleGenerateFromNotes = async () => {
    if (!clientId || unbilledNotes.length === 0) return;

    try {
      setSaving(true);
      const noteIds = unbilledNotes.map((n) => n.id);
      const generated = await window.api.invoices.generateFromNotes(clientId as number, noteIds);
      // Get the full invoice with items
      const full = await window.api.invoices.get(generated.id);
      onSave(full);
      onClose();
    } catch (err) {
      console.error('Failed to generate invoice:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleSave = async () => {
    if (!clientId) return;

    setSaving(true);
    try {
      const subtotal = calculateTotal();
      const data = {
        client_id: clientId as number,
        invoice_date: invoiceDate,
        due_date: dueDate || undefined,
        subtotal,
        total_amount: subtotal,
        status,
        notes,
      };

      if (invoice) {
        // Update existing
        const updated = await window.api.invoices.update(invoice.id, data);
        onSave(updated);
      } else {
        // Create new
        const created = await window.api.invoices.create(data, items as InvoiceItem[]);
        onSave(created);
      }
      onClose();
    } catch (err) {
      console.error('Failed to save invoice:', err);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">
            {invoice ? 'Edit Invoice' : 'New Invoice'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-[var(--color-text-secondary)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Client & Dates */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label">Client</label>
              <select
                className="select"
                value={clientId}
                onChange={(e) => setClientId(e.target.value ? Number(e.target.value) : '')}
                disabled={!!invoice}
              >
                <option value="">Select client...</option>
                {clients.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.first_name} {c.last_name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="label">Invoice Date</label>
              <input
                type="date"
                className="input"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Due Date</label>
              <input
                type="date"
                className="input"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          {/* Quick Generate */}
          {!invoice && clientId && unbilledNotes.length > 0 && (
            <div className="p-4 bg-blue-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-blue-800">Quick Generate</p>
                  <p className="text-sm text-blue-600">
                    {unbilledNotes.length} signed note{unbilledNotes.length !== 1 ? 's' : ''}{' '}
                    available for this client
                  </p>
                </div>
                <button
                  onClick={handleGenerateFromNotes}
                  disabled={saving}
                  className="btn-primary gap-2"
                >
                  <Calculator className="w-4 h-4" />
                  Generate from Notes
                </button>
              </div>
            </div>
          )}

          {/* Line Items */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <label className="label mb-0">Line Items</label>
              <button
                onClick={addItem}
                className="text-sm text-[var(--color-primary)] hover:underline flex items-center gap-1"
              >
                <Plus className="w-4 h-4" /> Add Item
              </button>
            </div>

            <div className="space-y-3">
              {items.map((item, index) => (
                <div
                  key={index}
                  className="grid grid-cols-12 gap-2 items-start p-3 bg-gray-50 rounded-lg"
                >
                  {/* CPT Code */}
                  <div className="col-span-2">
                    <label className="text-xs text-[var(--color-text-secondary)]">CPT</label>
                    <select
                      className="select text-sm"
                      value={item.cpt_code || ''}
                      onChange={(e) => handleCptSelect(index, e.target.value)}
                    >
                      <option value="">-</option>
                      {feeSchedule.map((fee) => (
                        <option key={fee.id} value={fee.cpt_code}>
                          {fee.cpt_code}
                        </option>
                      ))}
                    </select>
                  </div>

                  {/* Description */}
                  <div className="col-span-4">
                    <label className="text-xs text-[var(--color-text-secondary)]">Description</label>
                    <input
                      type="text"
                      className="input text-sm"
                      value={item.description || ''}
                      onChange={(e) => handleItemChange(index, 'description', e.target.value)}
                      placeholder="Service description"
                    />
                  </div>

                  {/* Units */}
                  <div className="col-span-1">
                    <label className="text-xs text-[var(--color-text-secondary)]">Units</label>
                    <input
                      type="number"
                      min="1"
                      className="input text-sm text-center"
                      value={item.units || 1}
                      onChange={(e) => handleItemChange(index, 'units', Number(e.target.value))}
                    />
                  </div>

                  {/* Unit Price */}
                  <div className="col-span-2">
                    <label className="text-xs text-[var(--color-text-secondary)]">Unit Price</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      className="input text-sm text-right"
                      value={item.unit_price || 0}
                      onChange={(e) => handleItemChange(index, 'unit_price', Number(e.target.value))}
                    />
                  </div>

                  {/* Amount */}
                  <div className="col-span-2">
                    <label className="text-xs text-[var(--color-text-secondary)]">Amount</label>
                    <div className="input text-sm text-right bg-gray-100 font-medium">
                      ${(item.amount || 0).toFixed(2)}
                    </div>
                  </div>

                  {/* Remove */}
                  <div className="col-span-1 flex items-end justify-center pb-2">
                    <button
                      onClick={() => removeItem(index)}
                      disabled={items.length === 1}
                      className="p-1.5 rounded hover:bg-red-50 text-red-500 disabled:opacity-30"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="label">Notes</label>
            <textarea
              className="input"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional notes for this invoice..."
            />
          </div>

          {/* Status (for editing) */}
          {invoice && (
            <div>
              <label className="label">Status</label>
              <select
                className="select"
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
              >
                <option value="draft">Draft</option>
                <option value="sent">Sent</option>
                <option value="paid">Paid</option>
                <option value="partial">Partial</option>
                <option value="overdue">Overdue</option>
                <option value="void">Void</option>
              </select>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--color-border)] bg-gray-50">
          <div className="text-lg font-semibold text-[var(--color-text)]">
            Total: ${calculateTotal().toFixed(2)}
          </div>
          <div className="flex gap-3">
            <button className="btn-ghost" onClick={onClose}>
              Cancel
            </button>
            <button
              className="btn-primary"
              onClick={handleSave}
              disabled={!clientId || saving}
            >
              {saving ? 'Saving...' : invoice ? 'Update Invoice' : 'Create Invoice'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
