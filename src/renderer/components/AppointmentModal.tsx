import React, { useState, useEffect, useCallback } from 'react';
import { X, Calendar, Clock, User } from 'lucide-react';
import type { Appointment, AppointmentStatus, Client, ContractedEntity, EntityFeeSchedule } from '../../shared/types';

interface AppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<Appointment>) => Promise<void>;
  appointment?: Appointment | null;
  defaultDate?: string;
  defaultTime?: string;
}

const DURATION_OPTIONS = [
  { value: 30, label: '30 minutes' },
  { value: 45, label: '45 minutes' },
  { value: 50, label: '50 minutes' },
  { value: 60, label: '60 minutes' },
];

const STATUS_OPTIONS: Array<{ value: AppointmentStatus; label: string }> = [
  { value: 'scheduled', label: 'Scheduled' },
  { value: 'completed', label: 'Completed' },
  { value: 'cancelled', label: 'Cancelled' },
  { value: 'no-show', label: 'No Show' },
];

export default function AppointmentModal({
  isOpen,
  onClose,
  onSave,
  appointment,
  defaultDate,
  defaultTime,
}: AppointmentModalProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientSearch, setClientSearch] = useState('');
  const [showClientDropdown, setShowClientDropdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadingClients, setLoadingClients] = useState(false);

  // Contracted entity state
  const [entities, setEntities] = useState<ContractedEntity[]>([]);
  const [selectedEntityId, setSelectedEntityId] = useState<number | null>(null);
  const [entityRate, setEntityRate] = useState<number | null>(null);
  const [rateOverrideReason, setRateOverrideReason] = useState('');

  const [formData, setFormData] = useState({
    client_id: 0,
    scheduled_date: '',
    scheduled_time: '09:00',
    duration_minutes: 45,
    status: 'scheduled' as AppointmentStatus,
  });

  const [selectedClientName, setSelectedClientName] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    async function initModal() {
      loadClients();
      // Load contracted entities
      try {
        const ents = await window.api.contractedEntities.list();
        setEntities(ents);
      } catch {
        setEntities([]);
      }

      if (appointment) {
        setFormData({
          client_id: appointment.client_id,
          scheduled_date: appointment.scheduled_date,
          scheduled_time: appointment.scheduled_time,
          duration_minutes: appointment.duration_minutes,
          status: appointment.status,
        });
        if (appointment.first_name && appointment.last_name) {
          setSelectedClientName(`${appointment.first_name} ${appointment.last_name}`);
          setClientSearch(`${appointment.first_name} ${appointment.last_name}`);
        }
        // Restore entity fields
        setSelectedEntityId(appointment.entity_id ?? null);
        setEntityRate(appointment.entity_rate ?? null);
        setRateOverrideReason(appointment.rate_override_reason || '');
      } else {
        // Load default session length from settings
        let duration = 45;
        try {
          const saved = await window.api.settings.get('default_session_length');
          if (saved) duration = parseInt(saved, 10);
        } catch { /* use fallback */ }

        setFormData({
          client_id: 0,
          scheduled_date: defaultDate || new Date().toISOString().split('T')[0],
          scheduled_time: defaultTime || '09:00',
          duration_minutes: duration,
          status: 'scheduled',
        });
        setSelectedClientName('');
        setClientSearch('');
        setSelectedEntityId(null);
        setEntityRate(null);
        setRateOverrideReason('');
      }
    }

    initModal();
  }, [isOpen, appointment, defaultDate, defaultTime]);

  const loadClients = useCallback(async () => {
    try {
      setLoadingClients(true);
      const result = await window.api.clients.list({ status: 'active' });
      setClients(result);
    } catch (err) {
      console.error('Failed to load clients:', err);
    } finally {
      setLoadingClients(false);
    }
  }, []);

  const filteredClients = clients.filter((c) => {
    const fullName = `${c.first_name} ${c.last_name}`.toLowerCase();
    return fullName.includes(clientSearch.toLowerCase());
  });

  const handleSelectClient = (client: Client) => {
    setFormData((prev) => ({ ...prev, client_id: client.id }));
    setSelectedClientName(`${client.first_name} ${client.last_name}`);
    setClientSearch(`${client.first_name} ${client.last_name}`);
    setShowClientDropdown(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.client_id === 0) return;

    try {
      setSaving(true);
      await onSave({
        ...formData,
        entity_id: selectedEntityId ?? undefined,
        entity_rate: entityRate ?? undefined,
        rate_override_reason: rateOverrideReason || undefined,
      });
      onClose();
    } catch (err) {
      console.error('Failed to save appointment:', err);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Modal */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">
            {appointment ? 'Edit Appointment' : 'Add Appointment'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 transition-colors text-[var(--color-text-secondary)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto">
          {/* Client Selection */}
          <div className="relative">
            <label className="label">
              <User className="w-3.5 h-3.5 inline mr-1" />
              Client
            </label>
            <input
              type="text"
              className="input"
              placeholder={loadingClients ? 'Loading clients...' : 'Search for a client...'}
              value={clientSearch}
              onChange={(e) => {
                setClientSearch(e.target.value);
                setShowClientDropdown(true);
                if (e.target.value !== selectedClientName) {
                  setFormData((prev) => ({ ...prev, client_id: 0 }));
                  setSelectedClientName('');
                }
              }}
              onFocus={() => setShowClientDropdown(true)}
            />
            {showClientDropdown && clientSearch.length > 0 && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-[var(--color-border)] rounded-lg shadow-lg max-h-48 overflow-y-auto">
                {filteredClients.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">
                    No clients found
                  </div>
                ) : (
                  filteredClients.map((client) => (
                    <button
                      key={client.id}
                      type="button"
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-gray-50 transition-colors flex items-center justify-between"
                      onClick={() => handleSelectClient(client)}
                    >
                      <span className="font-medium">
                        {client.first_name} {client.last_name}
                      </span>
                      <span
                        className={`badge-${client.discipline.toLowerCase()}`}
                      >
                        {client.discipline}
                      </span>
                    </button>
                  ))
                )}
              </div>
            )}
            {formData.client_id === 0 && clientSearch.length > 0 && !showClientDropdown && (
              <p className="text-xs text-[var(--color-danger)] mt-1">Please select a client from the list</p>
            )}
          </div>

          {/* Date */}
          <div>
            <label className="label">
              <Calendar className="w-3.5 h-3.5 inline mr-1" />
              Date
            </label>
            <input
              type="date"
              className="input"
              value={formData.scheduled_date}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, scheduled_date: e.target.value }))
              }
              required
            />
          </div>

          {/* Time */}
          <div>
            <label className="label">
              <Clock className="w-3.5 h-3.5 inline mr-1" />
              Time
            </label>
            <input
              type="time"
              className="input"
              value={formData.scheduled_time}
              onChange={(e) =>
                setFormData((prev) => ({ ...prev, scheduled_time: e.target.value }))
              }
              required
            />
          </div>

          {/* Duration */}
          <div>
            <label className="label">Duration</label>
            <select
              className="select"
              value={formData.duration_minutes}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  duration_minutes: parseInt(e.target.value, 10),
                }))
              }
            >
              {DURATION_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Status */}
          <div>
            <label className="label">Status</label>
            <select
              className="select"
              value={formData.status}
              onChange={(e) =>
                setFormData((prev) => ({
                  ...prev,
                  status: e.target.value as AppointmentStatus,
                }))
              }
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          {/* Contracted Entity (optional) */}
          {entities.length > 0 && (
            <div>
              <label className="label">Contracted Entity (optional)</label>
              <select
                className="select"
                value={selectedEntityId ?? ''}
                onChange={async (e) => {
                  const eid = parseInt(e.target.value, 10) || null;
                  setSelectedEntityId(eid);
                  if (eid) {
                    try {
                      const fees = await window.api.contractedEntities.listFeeSchedule(eid);
                      // Use the first treatment rate as default
                      const treatmentFee = fees.find((f: EntityFeeSchedule) => f.service_type === 'treatment') || fees[0];
                      if (treatmentFee) setEntityRate(treatmentFee.default_rate);
                    } catch {}
                  } else {
                    setEntityRate(null);
                    setRateOverrideReason('');
                  }
                }}
              >
                <option value="">None</option>
                {entities.map((ent) => (
                  <option key={ent.id} value={ent.id}>{ent.name}</option>
                ))}
              </select>
              {selectedEntityId && entityRate !== null && (
                <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                  Rate: ${entityRate.toFixed(2)}
                </p>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--color-border)]">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn-primary"
              disabled={saving || formData.client_id === 0}
            >
              {saving ? 'Saving...' : appointment ? 'Update Appointment' : 'Create Appointment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
