import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { ContractedEntity } from '@shared/types';

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
    }
    setError('');
  }, [entity, isOpen]);

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
