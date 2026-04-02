import React, { useState, useEffect, useCallback } from 'react';
import { X, Search, Star, Trash2, ArrowLeft, Plus } from 'lucide-react';
import type { Physician } from '../../shared/types';

interface PhysicianDirectoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialPhysicianName?: string;
  onSelect?: (physician: Physician) => void;
}

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH',
  'NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT',
  'VT','VA','WA','WV','WI','WY',
];

const emptyForm = {
  name: '', npi: '', fax_number: '', phone: '', specialty: '',
  clinic_name: '', address: '', city: '', state: '', zip: '', notes: '',
  is_favorite: false,
};

export default function PhysicianDirectoryModal({
  isOpen,
  onClose,
  initialPhysicianName,
  onSelect,
}: PhysicianDirectoryModalProps) {
  const [physicians, setPhysicians] = useState<Physician[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [view, setView] = useState<'list' | 'form'>('list');
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<number | null>(null);

  const loadPhysicians = useCallback(async () => {
    setLoading(true);
    try {
      const data = await window.api.physicians.list(
        searchQuery ? { search: searchQuery } : undefined
      );
      setPhysicians(data);
    } finally {
      setLoading(false);
    }
  }, [searchQuery]);

  useEffect(() => {
    if (!isOpen) return;
    loadPhysicians();
  }, [isOpen, loadPhysicians]);

  // If opened with an initial name, go straight to create form
  useEffect(() => {
    if (isOpen && initialPhysicianName) {
      setView('form');
      setEditingId(null);
      setForm({ ...emptyForm, name: initialPhysicianName });
    } else if (isOpen) {
      setView('list');
      setForm(emptyForm);
      setEditingId(null);
    }
  }, [isOpen, initialPhysicianName]);

  const handleSave = async () => {
    if (!form.name.trim()) return;
    setSaving(true);
    try {
      if (editingId) {
        await window.api.physicians.update(editingId, form);
      } else {
        const created = await window.api.physicians.create(form);
        if (onSelect) onSelect(created);
      }
      window.dispatchEvent(new Event('physicians-updated'));
      await loadPhysicians();
      setView('list');
      setForm(emptyForm);
      setEditingId(null);
    } finally {
      setSaving(false);
    }
  };

  const handleEdit = (physician: Physician) => {
    setEditingId(physician.id);
    setForm({
      name: physician.name,
      npi: physician.npi,
      fax_number: physician.fax_number,
      phone: physician.phone,
      specialty: physician.specialty,
      clinic_name: physician.clinic_name,
      address: physician.address,
      city: physician.city,
      state: physician.state,
      zip: physician.zip,
      notes: physician.notes,
      is_favorite: physician.is_favorite,
    });
    setView('form');
  };

  const handleDelete = async (id: number) => {
    await window.api.physicians.delete(id);
    window.dispatchEvent(new Event('physicians-updated'));
    await loadPhysicians();
    setDeleteConfirm(null);
  };

  const toggleFavorite = async (physician: Physician) => {
    await window.api.physicians.update(physician.id, { is_favorite: !physician.is_favorite });
    window.dispatchEvent(new Event('physicians-updated'));
    await loadPhysicians();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <div className="flex items-center gap-3">
            {view === 'form' && (
              <button
                type="button"
                onClick={() => { setView('list'); setForm(emptyForm); setEditingId(null); }}
                className="p-1 rounded hover:bg-gray-100"
              >
                <ArrowLeft size={18} />
              </button>
            )}
            <h2 className="text-lg font-semibold text-[var(--color-text)]">
              {view === 'list' ? 'Physician Directory' : editingId ? 'Edit Physician' : 'Add Physician'}
            </h2>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg">
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {view === 'list' ? (
            <>
              {/* Search + Add */}
              <div className="flex items-center gap-3 mb-4">
                <div className="relative flex-1">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    className="input w-full pl-9"
                    placeholder="Search physicians..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                  />
                </div>
                <button
                  type="button"
                  className="btn-primary flex items-center gap-2"
                  onClick={() => { setView('form'); setForm(emptyForm); setEditingId(null); }}
                >
                  <Plus size={16} />
                  Add
                </button>
              </div>

              {/* Table */}
              {loading ? (
                <div className="text-center py-8 text-[var(--color-text-secondary)]">Loading...</div>
              ) : physicians.length === 0 ? (
                <div className="text-center py-8 text-[var(--color-text-secondary)]">
                  {searchQuery ? 'No physicians match your search.' : 'No physicians in directory yet.'}
                </div>
              ) : (
                <div className="space-y-1">
                  {physicians.map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 group cursor-pointer"
                      onClick={() => {
                        if (onSelect) {
                          onSelect(p);
                          onClose();
                        } else {
                          handleEdit(p);
                        }
                      }}
                    >
                      <button
                        type="button"
                        className="shrink-0"
                        onClick={(e) => { e.stopPropagation(); toggleFavorite(p); }}
                      >
                        <Star
                          size={16}
                          className={p.is_favorite ? 'fill-amber-400 text-amber-400' : 'text-gray-300'}
                        />
                      </button>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{p.name}</span>
                          {p.specialty && (
                            <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-600 font-medium">
                              {p.specialty}
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-[var(--color-text-secondary)]">
                          {p.clinic_name && <span>{p.clinic_name}</span>}
                          {p.fax_number && <span>Fax: {p.fax_number}</span>}
                          {p.phone && <span>Ph: {p.phone}</span>}
                          {p.npi && <span>NPI: {p.npi}</span>}
                        </div>
                      </div>
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <button
                          type="button"
                          className="p-1.5 rounded hover:bg-gray-200"
                          onClick={(e) => { e.stopPropagation(); handleEdit(p); }}
                          title="Edit"
                        >
                          <span className="text-xs">Edit</span>
                        </button>
                        {deleteConfirm === p.id ? (
                          <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                            <button
                              type="button"
                              className="text-xs text-red-600 px-2 py-1 rounded hover:bg-red-50"
                              onClick={() => handleDelete(p.id)}
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              className="text-xs px-2 py-1 rounded hover:bg-gray-200"
                              onClick={() => setDeleteConfirm(null)}
                            >
                              Cancel
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            className="p-1.5 rounded hover:bg-red-50 text-gray-400 hover:text-red-500"
                            onClick={(e) => { e.stopPropagation(); setDeleteConfirm(p.id); }}
                            title="Delete"
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : (
            /* Form view */
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className="label">Name *</label>
                  <input
                    type="text"
                    className="input w-full"
                    value={form.name}
                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                    autoFocus
                  />
                </div>
                <div>
                  <label className="label">NPI</label>
                  <input
                    type="text"
                    className="input w-full"
                    value={form.npi}
                    onChange={(e) => setForm({ ...form, npi: e.target.value })}
                    maxLength={10}
                  />
                </div>
                <div>
                  <label className="label">Specialty</label>
                  <input
                    type="text"
                    className="input w-full"
                    value={form.specialty}
                    onChange={(e) => setForm({ ...form, specialty: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">Fax Number</label>
                  <input
                    type="tel"
                    className="input w-full"
                    value={form.fax_number}
                    onChange={(e) => setForm({ ...form, fax_number: e.target.value })}
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div>
                  <label className="label">Phone</label>
                  <input
                    type="tel"
                    className="input w-full"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    placeholder="(555) 123-4567"
                  />
                </div>
                <div className="col-span-2">
                  <label className="label">Clinic / Practice Name</label>
                  <input
                    type="text"
                    className="input w-full"
                    value={form.clinic_name}
                    onChange={(e) => setForm({ ...form, clinic_name: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
                  <label className="label">Address</label>
                  <input
                    type="text"
                    className="input w-full"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label">City</label>
                  <input
                    type="text"
                    className="input w-full"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">State</label>
                    <select
                      className="select w-full"
                      value={form.state}
                      onChange={(e) => setForm({ ...form, state: e.target.value })}
                    >
                      <option value="">--</option>
                      {US_STATES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label">ZIP</label>
                    <input
                      type="text"
                      className="input w-full"
                      value={form.zip}
                      onChange={(e) => setForm({ ...form, zip: e.target.value })}
                      maxLength={10}
                    />
                  </div>
                </div>
                <div className="col-span-2">
                  <label className="label">Notes</label>
                  <textarea
                    className="textarea w-full"
                    rows={2}
                    value={form.notes}
                    onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  />
                </div>
                <div className="col-span-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.is_favorite}
                      onChange={(e) => setForm({ ...form, is_favorite: e.target.checked })}
                      className="rounded border-gray-300"
                    />
                    <Star size={14} className={form.is_favorite ? 'fill-amber-400 text-amber-400' : 'text-gray-400'} />
                    <span className="text-sm">Mark as favorite</span>
                  </label>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        {view === 'form' && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => { setView('list'); setForm(emptyForm); setEditingId(null); }}
            >
              Cancel
            </button>
            <button
              type="button"
              className="btn-primary"
              onClick={handleSave}
              disabled={!form.name.trim() || saving}
            >
              {saving ? 'Saving...' : editingId ? 'Update' : 'Add Physician'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
