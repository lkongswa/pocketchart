import React, { useEffect, useState } from 'react';
import { X, Save, User } from 'lucide-react';
import type { ContractorPatient } from '@shared/types';

interface Props {
  /** Patient to edit. Pass null/undefined to close. */
  patient: ContractorPatient | null;
  onClose: () => void;
  /** Called after a successful save with the updated patient row. */
  onSaved?: (updated: ContractorPatient) => void;
}

/**
 * Lightweight modal for editing the fields PocketChart didn't surface anywhere
 * else (DOB, address, phone, notes) plus name/MRN which were previously only
 * editable inline in the appointment modal.
 *
 * Mounts only when `patient` is non-null. Saves via `contractorPatients.update`
 * — which the backend already supports for all these fields.
 */
const ContractorPatientEditModal: React.FC<Props> = ({ patient, onClose, onSaved }) => {
  const [name, setName] = useState('');
  const [dob, setDob] = useState('');
  const [mrn, setMrn] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  // Re-prime form whenever a different patient is opened.
  useEffect(() => {
    if (!patient) return;
    setName(patient.name || '');
    setDob(patient.dob || '');
    setMrn(patient.mrn || '');
    setPhone(patient.phone || '');
    setAddress(patient.address || '');
    setNotes(patient.notes || '');
    setErr(null);
  }, [patient]);

  if (!patient) return null;

  const handleSave = async () => {
    if (!name.trim()) {
      setErr('Name is required.');
      return;
    }
    setSaving(true);
    setErr(null);
    try {
      const updated = await window.api.contractorPatients.update(patient.id, {
        name: name.trim(),
        dob: dob || '',
        mrn: mrn.trim(),
        phone: phone.trim(),
        address: address.trim(),
        notes: notes.trim(),
      });
      onSaved?.(updated as ContractorPatient);
      onClose();
    } catch (e: any) {
      console.error('Failed to save contractor patient:', e);
      setErr(e?.message || 'Save failed.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-[var(--color-surface)] rounded-xl shadow-xl w-full max-w-md mx-4">
        <div className="flex items-center justify-between px-5 py-4 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2">
            <User size={18} className="text-purple-600" />
            <h3 className="text-base font-semibold text-[var(--color-text)]">Edit Patient</h3>
          </div>
          <button className="btn-ghost btn-sm p-1" onClick={onClose} title="Close">
            <X size={16} />
          </button>
        </div>

        <div className="px-5 py-4 space-y-3">
          <div>
            <label className="label">Name <span className="text-red-500">*</span></label>
            <input
              className="input w-full"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Date of Birth</label>
              <input
                type="date"
                className="input w-full"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
              />
            </div>
            <div>
              <label className="label">MRN</label>
              <input
                className="input w-full font-mono"
                value={mrn}
                onChange={(e) => setMrn(e.target.value)}
                placeholder="External record #"
              />
            </div>
          </div>

          <div>
            <label className="label">Phone</label>
            <input
              className="input w-full"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="(555) 555-5555"
            />
          </div>

          <div>
            <label className="label">Address</label>
            <input
              className="input w-full"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
            />
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea
              className="input w-full min-h-[70px] resize-y"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Internal notes (not shown on PDFs)…"
            />
          </div>

          {err && (
            <p className="text-xs text-red-600">{err}</p>
          )}
        </div>

        <div className="px-5 py-3 border-t border-[var(--color-border)] flex justify-end gap-2">
          <button className="btn-secondary" onClick={onClose} disabled={saving}>Cancel</button>
          <button className="btn-primary gap-1.5" onClick={handleSave} disabled={saving || !name.trim()}>
            <Save size={14} />
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default ContractorPatientEditModal;
