import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { ContractedEntity, BillingCycle, InvoiceColumnKey } from '@shared/types';
import {
  INVOICE_COLUMNS,
  ENTITY_INVOICE_DEFAULT_COLUMNS,
  parseInvoiceColumns,
} from '@shared/types';

interface EntityFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  entity?: ContractedEntity | null;
}

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH',
  'NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT',
  'VT','VA','WA','WV','WI','WY',
];

export default function EntityFormModal({ isOpen, onClose, onSave, entity }: EntityFormModalProps) {
  const [name, setName] = useState('');
  const [contactName, setContactName] = useState('');
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [street, setStreet] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [zip, setZip] = useState('');
  const [defaultNoteType, setDefaultNoteType] = useState('soap');
  const [notes, setNotes] = useState('');
  const [requiresNotes, setRequiresNotes] = useState(false);
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');
  const [billingDay, setBillingDay] = useState(1);
  const [invoiceCols, setInvoiceCols] = useState<InvoiceColumnKey[]>(ENTITY_INVOICE_DEFAULT_COLUMNS);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (entity) {
      setName(entity.name || '');
      setContactName(entity.contact_name || '');
      setContactEmail(entity.contact_email || '');
      setContactPhone(entity.contact_phone || '');
      setStreet(entity.billing_address_street || '');
      setCity(entity.billing_address_city || '');
      setState(entity.billing_address_state || '');
      setZip(entity.billing_address_zip || '');
      setDefaultNoteType(entity.default_note_type || 'soap');
      setNotes(entity.notes || '');
      setRequiresNotes(Boolean(entity.requires_notes));
      setBillingCycle((entity.billing_cycle as BillingCycle) || 'monthly');
      setBillingDay(entity.billing_day || 1);
      setInvoiceCols(parseInvoiceColumns(entity.invoice_columns, ENTITY_INVOICE_DEFAULT_COLUMNS));
    } else {
      setName('');
      setContactName('');
      setContactEmail('');
      setContactPhone('');
      setStreet('');
      setCity('');
      setState('');
      setZip('');
      setDefaultNoteType('soap');
      setNotes('');
      setRequiresNotes(false);
      setBillingCycle('monthly');
      setBillingDay(1);
      setInvoiceCols(ENTITY_INVOICE_DEFAULT_COLUMNS);
    }
    setError('');
  }, [entity, isOpen]);

  const toggleCol = (key: InvoiceColumnKey) => {
    setInvoiceCols((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]
    );
  };

  if (!isOpen) return null;

  const handleSave = async () => {
    if (!name.trim()) {
      setError('Entity name is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const data = {
        name: name.trim(),
        contact_name: contactName.trim(),
        contact_email: contactEmail.trim(),
        contact_phone: contactPhone.trim(),
        billing_address_street: street.trim(),
        billing_address_city: city.trim(),
        billing_address_state: state,
        billing_address_zip: zip.trim(),
        default_note_type: defaultNoteType as ContractedEntity['default_note_type'],
        notes: notes.trim(),
        requires_notes: requiresNotes ? 1 : 0,
        billing_cycle: billingCycle,
        billing_day: billingDay,
        invoice_columns: JSON.stringify(invoiceCols),
      };

      if (entity) {
        await window.api.contractedEntities.update(entity.id, data);
      } else {
        await window.api.contractedEntities.create(data);
      }
      onSave();
      onClose();
    } catch (err: any) {
      setError(err?.message || 'Failed to save entity');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-[var(--color-surface)] rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">
            {entity ? 'Edit Entity' : 'Add Contracted Entity'}
          </h2>
          <button onClick={onClose} className="text-[var(--color-text-secondary)] hover:text-[var(--color-text)]">
            <X size={20} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {error && (
            <div className="text-sm text-red-600 bg-red-50 px-3 py-2 rounded-lg">{error}</div>
          )}

          <div>
            <label className="label">Entity Name *</label>
            <input className="input w-full" value={name} onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Lake Forest Hospice" autoFocus />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Contact Name</label>
              <input className="input w-full" value={contactName} onChange={(e) => setContactName(e.target.value)}
                placeholder="e.g., Sarah Johnson" />
            </div>
            <div>
              <label className="label">Contact Phone</label>
              <input className="input w-full" value={contactPhone} onChange={(e) => setContactPhone(e.target.value)}
                placeholder="(555) 123-4567" />
            </div>
          </div>

          <div>
            <label className="label">Contact Email</label>
            <input className="input w-full" type="email" value={contactEmail}
              onChange={(e) => setContactEmail(e.target.value)} placeholder="billing@example.com" />
          </div>

          <div className="border-t border-[var(--color-border)] pt-4">
            <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-3 uppercase tracking-wide">
              Billing Address
            </p>
            <div className="space-y-3">
              <div>
                <label className="label">Street</label>
                <input className="input w-full" value={street} onChange={(e) => setStreet(e.target.value)} />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">City</label>
                  <input className="input w-full" value={city} onChange={(e) => setCity(e.target.value)} />
                </div>
                <div>
                  <label className="label">State</label>
                  <select className="select w-full" value={state} onChange={(e) => setState(e.target.value)}>
                    <option value="">--</option>
                    {US_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">ZIP</label>
                  <input className="input w-full" value={zip} onChange={(e) => setZip(e.target.value)} maxLength={10} />
                </div>
              </div>
            </div>
          </div>

          <div>
            <label className="label">Default Note Type</label>
            <select className="select w-full" value={defaultNoteType} onChange={(e) => setDefaultNoteType(e.target.value)}>
              <option value="soap">SOAP Note</option>
              <option value="evaluation">Evaluation</option>
              <option value="progress_report">Progress Report</option>
            </select>
          </div>

          <div className="border-t border-[var(--color-border)] pt-4">
            <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-3 uppercase tracking-wide">
              Billing Settings
            </p>
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-[var(--color-text)]">Document in PocketChart</div>
                  <div className="text-xs text-[var(--color-text-secondary)]">Therapists write SOAP notes in this app for this agency</div>
                </div>
                <button
                  type="button"
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${requiresNotes ? 'bg-purple-500' : 'bg-gray-300'}`}
                  onClick={() => setRequiresNotes(!requiresNotes)}
                >
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${requiresNotes ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Invoice Cycle</label>
                  <select className="select w-full" value={billingCycle} onChange={(e) => setBillingCycle(e.target.value as BillingCycle)}>
                    <option value="weekly">Weekly</option>
                    <option value="biweekly">Bi-weekly</option>
                    <option value="monthly">Monthly</option>
                    <option value="custom">Custom</option>
                  </select>
                </div>
                {(billingCycle === 'monthly') && (
                  <div>
                    <label className="label">Invoice Day of Month</label>
                    <input className="input w-full" type="number" min={1} max={28} value={billingDay}
                      onChange={(e) => setBillingDay(parseInt(e.target.value, 10) || 1)} />
                  </div>
                )}
                {(billingCycle === 'weekly' || billingCycle === 'biweekly') && (
                  <div>
                    <label className="label">Invoice Day of Week</label>
                    <select className="select w-full" value={billingDay} onChange={(e) => setBillingDay(parseInt(e.target.value, 10))}>
                      {['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'].map((d, i) => (
                        <option key={i} value={i}>{d}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="border-t border-[var(--color-border)] pt-4">
            <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-1 uppercase tracking-wide">
              Invoice Template
            </p>
            <p className="text-xs text-[var(--color-text-secondary)] mb-3">
              Pick which columns show on this contract's invoices (editor + PDF). Amount is always shown.
            </p>
            <div className="grid grid-cols-2 gap-2">
              {(Object.keys(INVOICE_COLUMNS) as InvoiceColumnKey[]).map((key) => {
                const col = INVOICE_COLUMNS[key];
                const checked = invoiceCols.includes(key);
                return (
                  <label
                    key={key}
                    className={`flex items-start gap-2 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${
                      checked
                        ? 'bg-purple-50 border-purple-200'
                        : 'bg-[var(--color-surface)] border-[var(--color-border)] hover:bg-gray-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleCol(key)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-[var(--color-text)]">{col.label}</div>
                      {col.helpText && (
                        <div className="text-[11px] text-[var(--color-text-secondary)] leading-tight">
                          {col.helpText}
                        </div>
                      )}
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div>
            <label className="label">Internal Notes</label>
            <textarea className="textarea w-full" rows={3} value={notes}
              onChange={(e) => setNotes(e.target.value)} placeholder="Private notes about this entity..." />
          </div>
        </div>

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--color-border)]">
          <button className="btn-secondary" onClick={onClose}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving || !name.trim()}>
            {saving ? 'Saving...' : entity ? 'Save Changes' : 'Add Entity'}
          </button>
        </div>
      </div>
    </div>
  );
}
