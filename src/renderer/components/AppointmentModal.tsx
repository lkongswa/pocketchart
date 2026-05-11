import React, { useState, useEffect, useCallback } from 'react';
import { X, Calendar, Clock, User, Building2, Repeat } from 'lucide-react';
import { addDays, addWeeks, addMonths, format } from 'date-fns';
import type { Appointment, AppointmentStatus, Client, ContractedEntity, ContractorPatient, EntityFeeSchedule, VisitType, SessionType } from '../../shared/types';
import { VISIT_TYPE_LABELS, SESSION_TYPE_LABELS } from '../../shared/types';

// Unified search result item
type SearchItem =
  | { type: 'client'; id: number; name: string; discipline?: string; data: Client }
  | { type: 'contract'; id: number; name: string; data: ContractedEntity };

type RepeatFrequency = 'none' | 'weekly' | 'biweekly' | 'monthly';

interface AppointmentModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (data: Partial<Appointment>) => Promise<void>;
  onSaveBatch?: (items: Partial<Appointment>[]) => Promise<void>;
  appointment?: Appointment | null;
  defaultDate?: string;
  defaultTime?: string;
  prefillEntityPatient?: { entity_id: number; contractor_patient_id: number; contractor_patient_name: string } | null;
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
  onSaveBatch,
  appointment,
  defaultDate,
  defaultTime,
  prefillEntityPatient,
}: AppointmentModalProps) {
  const [clients, setClients] = useState<Client[]>([]);
  const [entities, setEntities] = useState<ContractedEntity[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [showDropdown, setShowDropdown] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(false);

  // Selected item
  const [selectedItem, setSelectedItem] = useState<SearchItem | null>(null);

  // Entity rate (for contract appointments)
  const [entityRate, setEntityRate] = useState<number | null>(null);

  // Repeat visit settings
  const [repeatFrequency, setRepeatFrequency] = useState<RepeatFrequency>('none');
  const [repeatEndDate, setRepeatEndDate] = useState('');
  const [showRepeat, setShowRepeat] = useState(false);
  const [repeatMode, setRepeatMode] = useState<'date' | 'count'>('count');
  const [repeatOccurrences, setRepeatOccurrences] = useState(4);

  const [formData, setFormData] = useState({
    client_id: 0,
    scheduled_date: '',
    scheduled_time: '09:00',
    duration_minutes: 45,
    status: 'scheduled' as AppointmentStatus,
    visit_type: 'O' as VisitType,
    session_type: 'visit' as SessionType,
  });

  // Contractor patient combobox
  const [contractorPatients, setContractorPatients] = useState<ContractorPatient[]>([]);
  const [selectedPatient, setSelectedPatient] = useState<ContractorPatient | null>(null);
  const [patientQuery, setPatientQuery] = useState('');
  const [showPatientDropdown, setShowPatientDropdown] = useState(false);
  const [creatingPatient, setCreatingPatient] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    async function initModal() {
      setLoading(true);
      try {
        const [clientsData, entitiesData] = await Promise.all([
          window.api.clients.list({ status: 'active' }),
          window.api.contractedEntities.list().catch(() => [] as ContractedEntity[]),
        ]);
        setClients(clientsData);
        setEntities(entitiesData);
      } catch (err) {
        console.error('Failed to load data:', err);
      }
      setLoading(false);

      if (appointment) {
        setFormData({
          client_id: appointment.client_id,
          scheduled_date: appointment.scheduled_date,
          scheduled_time: appointment.scheduled_time,
          duration_minutes: appointment.duration_minutes,
          status: appointment.status,
          visit_type: (appointment as any).visit_type || 'O',
          session_type: appointment.session_type || 'visit',
        });
        // Restore selection
        if (appointment.entity_id && appointment.entity_name) {
          setSearchQuery(appointment.entity_name);
          // We'll set selectedItem once entities load
        } else if (appointment.first_name && appointment.last_name) {
          setSearchQuery(`${appointment.first_name} ${appointment.last_name}`);
        }
        setEntityRate(appointment.entity_rate ?? null);
        setPatientQuery(appointment.contractor_patient_name || appointment.patient_name || '');
      } else {
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
          visit_type: 'O' as VisitType,
          session_type: 'visit' as SessionType,
        });
        // Don't clobber selection if we're being opened with a prefill payload —
        // the prefill effect below sets these and races with this async init.
        if (!prefillEntityPatient) {
          setSearchQuery('');
          setSelectedItem(null);
          setEntityRate(null);
          setSelectedPatient(null);
          setPatientQuery('');
          setContractorPatients([]);
        }
        setRepeatFrequency('none');
        setRepeatEndDate('');
        setShowRepeat(false);
        setRepeatMode('count');
        setRepeatOccurrences(4);
      }
    }

    initModal();
  }, [isOpen, appointment, defaultDate, defaultTime]);

  // Seed entity + contractor patient selection when navigated here with a prefill
  // payload (from EntityDetailPage's "Schedule" button). Only fires for new
  // appointments — editing an existing appointment goes through the next effect.
  useEffect(() => {
    if (!isOpen || appointment || !prefillEntityPatient) return;
    if (entities.length === 0) return;
    const ent = entities.find((e) => e.id === prefillEntityPatient.entity_id);
    if (!ent) return;
    setSelectedItem({ type: 'contract', id: ent.id, name: ent.name, data: ent });
    setSearchQuery(ent.name);
    setFormData((prev) => ({ ...prev, client_id: 0 }));
    Promise.all([
      window.api.contractedEntities.listFeeSchedule(ent.id),
      window.api.contractorPatients.list(ent.id).catch(() => [] as ContractorPatient[]),
    ]).then(([fees, patients]) => {
      setFeeScheduleCache(fees);
      setContractorPatients(patients);
      const target = (formData.session_type || 'visit') === 'eval' ? 'eval' : 'treatment';
      const match = fees.find((f: EntityFeeSchedule) => f.service_type === target) || fees[0];
      if (match) setEntityRate(match.default_rate);
      const p = patients.find((pp: ContractorPatient) => pp.id === prefillEntityPatient.contractor_patient_id);
      if (p) {
        setSelectedPatient(p);
        setPatientQuery(p.name);
      } else {
        setPatientQuery(prefillEntityPatient.contractor_patient_name);
      }
    }).catch(() => {});
  }, [isOpen, appointment, prefillEntityPatient, entities]);

  // Set selectedItem once data loads for editing; also seed fee schedule cache and contractor patients for contractor edits
  useEffect(() => {
    if (!appointment || !isOpen) return;
    if (appointment.entity_id && entities.length > 0) {
      const ent = entities.find(e => e.id === appointment.entity_id);
      if (ent) {
        setSelectedItem({ type: 'contract', id: ent.id, name: ent.name, data: ent });
        Promise.all([
          window.api.contractedEntities.listFeeSchedule(ent.id),
          window.api.contractorPatients.list(ent.id).catch(() => [] as ContractorPatient[]),
        ]).then(([fees, patients]) => {
          setFeeScheduleCache(fees);
          setContractorPatients(patients);
          if (appointment.contractor_patient_id) {
            const p = patients.find((p: ContractorPatient) => p.id === appointment.contractor_patient_id);
            if (p) { setSelectedPatient(p); setPatientQuery(p.name); }
          }
        }).catch(() => {});
      }
    } else if (appointment.client_id && clients.length > 0) {
      const client = clients.find(c => c.id === appointment.client_id);
      if (client) {
        setSelectedItem({ type: 'client', id: client.id, name: `${client.first_name} ${client.last_name}`, discipline: client.discipline, data: client });
      }
    }
  }, [appointment, clients, entities, isOpen]);

  // Build unified search results
  const searchResults: SearchItem[] = (() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return [];
    const clientResults: SearchItem[] = clients
      .filter(c => `${c.first_name} ${c.last_name}`.toLowerCase().includes(q))
      .map(c => ({ type: 'client' as const, id: c.id, name: `${c.first_name} ${c.last_name}`, discipline: c.discipline, data: c }));
    const entityResults: SearchItem[] = entities
      .filter(e => e.name.toLowerCase().includes(q))
      .map(e => ({ type: 'contract' as const, id: e.id, name: e.name, data: e }));
    return [...clientResults, ...entityResults];
  })();

  const [feeScheduleCache, setFeeScheduleCache] = useState<EntityFeeSchedule[]>([]);

  const handleSelectItem = async (item: SearchItem) => {
    setSelectedItem(item);
    setSearchQuery(item.name);
    setShowDropdown(false);

    if (item.type === 'client') {
      setFormData(prev => ({ ...prev, client_id: item.id }));
      setEntityRate(null);
      setFeeScheduleCache([]);
      setContractorPatients([]);
      setSelectedPatient(null);
      setPatientQuery('');
    } else {
      setFormData(prev => ({ ...prev, client_id: 0 }));
      try {
        const [fees, patients] = await Promise.all([
          window.api.contractedEntities.listFeeSchedule(item.id),
          window.api.contractorPatients.list(item.id).catch(() => [] as ContractorPatient[]),
        ]);
        setFeeScheduleCache(fees);
        setContractorPatients(patients);
        const sessionType = formData.session_type || 'visit';
        const target = sessionType === 'eval' ? 'eval' : 'treatment';
        const match = fees.find((f: EntityFeeSchedule) => f.service_type === target) || fees[0];
        if (match) setEntityRate(match.default_rate);
      } catch {}
    }
  };

  // When session type changes for a contract appt, auto-update the rate from the fee schedule
  const handleContractSessionTypeChange = (st: SessionType) => {
    setFormData(prev => ({ ...prev, session_type: st }));
    if (feeScheduleCache.length > 0) {
      const target = st === 'eval' ? 'eval' : 'treatment';
      const match = feeScheduleCache.find(f => f.service_type === target) || feeScheduleCache[0];
      if (match) setEntityRate(match.default_rate);
    }
  };

  // Generate recurring appointment dates
  const generateRecurringDates = (startDate: string, freq: RepeatFrequency, endDate: string): string[] => {
    if (freq === 'none' || !endDate) return [];
    const dates: string[] = [];
    let current = new Date(startDate + 'T00:00:00');
    const end = new Date(endDate + 'T00:00:00');
    // Skip the first date (the original appointment)
    while (true) {
      if (freq === 'weekly') current = addWeeks(current, 1);
      else if (freq === 'biweekly') current = addWeeks(current, 2);
      else if (freq === 'monthly') current = addMonths(current, 1);
      if (current > end) break;
      dates.push(format(current, 'yyyy-MM-dd'));
    }
    return dates;
  };

  // Derive the effective end date when in count mode
  const effectiveEndDate = (() => {
    if (repeatFrequency === 'none') return '';
    if (repeatMode === 'date') return repeatEndDate;
    if (!formData.scheduled_date || repeatOccurrences < 1) return '';
    let current = new Date(formData.scheduled_date + 'T00:00:00');
    for (let i = 0; i < repeatOccurrences - 1; i++) {
      if (repeatFrequency === 'weekly') current = addWeeks(current, 1);
      else if (repeatFrequency === 'biweekly') current = addWeeks(current, 2);
      else if (repeatFrequency === 'monthly') current = addMonths(current, 1);
    }
    return format(current, 'yyyy-MM-dd');
  })();

  const repeatCount = repeatFrequency !== 'none' && effectiveEndDate
    ? generateRecurringDates(formData.scheduled_date, repeatFrequency, effectiveEndDate).length
    : 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItem) return;

    try {
      setSaving(true);

      // For contract appts: ensure the typed patient name is linked to a
      // contractor_patient row, even if the user didn't explicitly pick from
      // the dropdown. Reuse existing patient on exact (case-insensitive) name
      // match; otherwise auto-create. This prevents orphan string-only entries
      // and stops apparent "new patient every time" behavior on the entity's
      // Unscheduled Patients list.
      let resolvedPatient: ContractorPatient | null = selectedPatient;
      if (selectedItem.type === 'contract' && !resolvedPatient && patientQuery.trim()) {
        const typed = patientQuery.trim();
        const existing = contractorPatients.find(
          (p) => p.name.toLowerCase() === typed.toLowerCase()
        );
        if (existing) {
          resolvedPatient = existing;
        } else {
          try {
            resolvedPatient = await window.api.contractorPatients.create({
              entity_id: selectedItem.id,
              name: typed,
            });
          } catch (err) {
            console.error('Failed to auto-create contractor patient:', err);
          }
        }
      }

      const baseData: Partial<Appointment> = {
        ...formData,
        client_id: selectedItem.type === 'client' ? selectedItem.id : 0,
        entity_id: selectedItem.type === 'contract' ? selectedItem.id : undefined,
        entity_rate: selectedItem.type === 'contract' ? entityRate ?? undefined : undefined,
        patient_name: selectedItem.type === 'contract' ? (resolvedPatient?.name || patientQuery) : '',
        contractor_patient_id: selectedItem.type === 'contract' ? (resolvedPatient?.id ?? null) : null,
      };

      if (repeatFrequency !== 'none' && effectiveEndDate && !appointment && onSaveBatch) {
        // Create batch of recurring appointments
        const recurringDates = generateRecurringDates(formData.scheduled_date, repeatFrequency, effectiveEndDate);
        const allItems: Partial<Appointment>[] = [
          baseData,
          ...recurringDates.map(d => ({ ...baseData, scheduled_date: d })),
        ];
        await onSaveBatch(allItems);
      } else {
        await onSave(baseData);
      }
      onClose();
    } catch (err) {
      console.error('Failed to save appointment:', err);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={onClose}>
      {/* Backdrop (visual only — click handled by outer div) */}
      <div className="absolute inset-0 bg-black/40 pointer-events-none" />

      {/* Modal */}
      <div
        className="relative z-10 bg-white rounded-xl shadow-xl w-full max-w-md mx-4 max-h-[90vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
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
        <form onSubmit={handleSubmit} className="p-6 space-y-4 overflow-y-auto flex-1 min-h-0">
          {/* Unified Search - Clients + Contracts */}
          <div className="relative">
            <label className="label">
              <User className="w-3.5 h-3.5 inline mr-1" />
              Client or Contract
            </label>
            <input
              type="text"
              className="input"
              placeholder={loading ? 'Loading...' : 'Search clients & contracts...'}
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setShowDropdown(true);
                if (selectedItem && e.target.value !== selectedItem.name) {
                  setSelectedItem(null);
                  setFormData(prev => ({ ...prev, client_id: 0 }));
                }
              }}
              onFocus={() => setShowDropdown(true)}
              onBlur={() => setTimeout(() => setShowDropdown(false), 150)}
            />
            {/* Selected badge */}
            {selectedItem && (
              <div className="mt-1.5 flex items-center gap-2">
                {selectedItem.type === 'client' ? (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                    <User className="w-3 h-3" /> Client
                    {selectedItem.discipline && ` · ${selectedItem.discipline}`}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                    <Building2 className="w-3 h-3" /> Contract
                  </span>
                )}
                {entityRate !== null && selectedItem.type === 'contract' && (
                  <span className="text-xs text-[var(--color-text-secondary)]">
                    Rate: ${entityRate.toFixed(2)}
                  </span>
                )}
              </div>
            )}
            {/* Dropdown results */}
            {showDropdown && searchQuery.length > 0 && !selectedItem && (
              <div className="absolute z-10 w-full mt-1 bg-white border border-[var(--color-border)] rounded-lg shadow-lg max-h-56 overflow-y-auto">
                {searchResults.length === 0 ? (
                  <div className="px-4 py-3 text-sm text-[var(--color-text-secondary)]">
                    No clients or contracts found
                  </div>
                ) : (
                  <>
                    {/* Client results */}
                    {searchResults.filter(r => r.type === 'client').length > 0 && (
                      <div>
                        <div className="px-3 py-1.5 text-[10px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider bg-gray-50">
                          Clients
                        </div>
                        {searchResults.filter(r => r.type === 'client').map((item) => (
                          <button
                            key={`client-${item.id}`}
                            type="button"
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-blue-50 transition-colors flex items-center justify-between"
                            onMouseDown={() => handleSelectItem(item)}
                          >
                            <span className="font-medium">{item.name}</span>
                            {item.type === 'client' && item.discipline && (
                              <span className={`badge-${item.discipline.toLowerCase()}`}>
                                {item.discipline}
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Contract results */}
                    {searchResults.filter(r => r.type === 'contract').length > 0 && (
                      <div>
                        <div className="px-3 py-1.5 text-[10px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider bg-gray-50">
                          Contracts
                        </div>
                        {searchResults.filter(r => r.type === 'contract').map((item) => (
                          <button
                            key={`contract-${item.id}`}
                            type="button"
                            className="w-full text-left px-4 py-2.5 text-sm hover:bg-purple-50 transition-colors flex items-center justify-between"
                            onMouseDown={() => handleSelectItem(item)}
                          >
                            <span className="font-medium">{item.name}</span>
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-purple-100 text-purple-600">
                              <Building2 className="w-3 h-3" /> Contract
                            </span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Patient combobox (for contract appointments) */}
          {selectedItem?.type === 'contract' && (
            <div className="relative">
              <label className="label">
                <User className="w-3.5 h-3.5 inline mr-1" />
                Patient
              </label>
              <input
                type="text"
                className="input"
                placeholder="Search or add patient name…"
                value={patientQuery}
                onChange={(e) => {
                  setPatientQuery(e.target.value);
                  setShowPatientDropdown(true);
                  if (selectedPatient && e.target.value !== selectedPatient.name) setSelectedPatient(null);
                }}
                onFocus={() => setShowPatientDropdown(true)}
                onBlur={() => setTimeout(() => setShowPatientDropdown(false), 150)}
              />
              {selectedPatient && (
                <p className="text-[11px] text-emerald-600 mt-0.5 font-medium">Existing patient — history will be linked</p>
              )}
              {showPatientDropdown && patientQuery.trim() && (
                <div className="absolute z-20 w-full mt-1 bg-white border border-[var(--color-border)] rounded-lg shadow-lg max-h-48 overflow-y-auto">
                  {/* Matching existing patients */}
                  {contractorPatients
                    .filter(p => p.name.toLowerCase().includes(patientQuery.toLowerCase()))
                    .map(p => (
                      <button key={p.id} type="button"
                        className="w-full text-left px-4 py-2 text-sm hover:bg-blue-50 transition-colors"
                        onMouseDown={() => { setSelectedPatient(p); setPatientQuery(p.name); setShowPatientDropdown(false); }}
                      >
                        <span className="font-medium">{p.name}</span>
                        {p.phone && <span className="ml-2 text-xs text-[var(--color-text-secondary)]">{p.phone}</span>}
                      </button>
                    ))}
                  {/* Create new option */}
                  {patientQuery.trim() && !contractorPatients.find(p => p.name.toLowerCase() === patientQuery.toLowerCase()) && (
                    <button type="button"
                      className="w-full text-left px-4 py-2 text-sm text-[var(--color-primary)] hover:bg-blue-50 transition-colors border-t border-[var(--color-border)] font-medium"
                      disabled={creatingPatient}
                      onMouseDown={async () => {
                        if (!selectedItem || selectedItem.type !== 'contract') return;
                        setCreatingPatient(true);
                        try {
                          const newP: ContractorPatient = await window.api.contractorPatients.create({
                            entity_id: selectedItem.id, name: patientQuery.trim(),
                          });
                          setContractorPatients(prev => [...prev, newP]);
                          setSelectedPatient(newP);
                          setShowPatientDropdown(false);
                        } catch { /* ignore */ } finally { setCreatingPatient(false); }
                      }}
                    >
                      {creatingPatient ? 'Adding…' : `+ Add "${patientQuery.trim()}" as new patient`}
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

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

          {/* Visit Type */}
          <div>
            <label className="label">Visit Type</label>
            <div className="flex gap-1">
              {(['O', 'T', 'H', 'C'] as VisitType[]).map((vt) => (
                <button
                  key={vt}
                  type="button"
                  onClick={() => setFormData((prev) => ({ ...prev, visit_type: vt }))}
                  className={`px-2.5 py-1.5 rounded text-xs font-medium transition-colors ${
                    formData.visit_type === vt
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {VISIT_TYPE_LABELS[vt]}
                </button>
              ))}
            </div>
          </div>

          {/* Session Type (only for client appointments) */}
          {selectedItem?.type === 'client' && (
            <div>
              <label className="label">Session Type</label>
              <div className="flex gap-1">
                {(['visit', 'eval', 'recert'] as SessionType[]).map((st) => {
                  const colors: Record<SessionType, string> = {
                    visit: formData.session_type === st ? 'bg-teal-500 text-white' : 'bg-teal-50 text-teal-700 hover:bg-teal-100',
                    eval: formData.session_type === st ? 'bg-violet-500 text-white' : 'bg-violet-50 text-violet-700 hover:bg-violet-100',
                    recert: formData.session_type === st ? 'bg-amber-500 text-white' : 'bg-amber-50 text-amber-700 hover:bg-amber-100',
                  };
                  return (
                    <button
                      key={st}
                      type="button"
                      onClick={() => setFormData((prev) => ({ ...prev, session_type: st }))}
                      className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${colors[st]}`}
                    >
                      {SESSION_TYPE_LABELS[st]}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Service Type for contractor appointments (Treatment vs Eval) */}
          {selectedItem?.type === 'contract' && (
            <div>
              <label className="label">Service Type</label>
              <div className="flex gap-1">
                {([['visit', 'Treatment'], ['eval', 'Eval']] as [SessionType, string][]).map(([st, label]) => (
                  <button
                    key={st}
                    type="button"
                    onClick={() => handleContractSessionTypeChange(st)}
                    className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                      formData.session_type === st
                        ? st === 'eval' ? 'bg-violet-500 text-white' : 'bg-teal-500 text-white'
                        : st === 'eval' ? 'bg-violet-50 text-violet-700 hover:bg-violet-100' : 'bg-teal-50 text-teal-700 hover:bg-teal-100'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              {entityRate !== null && (
                <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                  Rate: <span className="font-medium">${entityRate.toFixed(2)}</span>
                  {feeScheduleCache.length > 1 && ' (auto-updated from fee schedule)'}
                </p>
              )}
            </div>
          )}

          {/* Recurring Schedule (only for new appointments) */}
          {!appointment && (
            <div className={`rounded-lg border transition-colors ${showRepeat ? 'border-[var(--color-primary)]/30 bg-blue-50/40' : 'border-[var(--color-border)]'}`}>
              {/* Checkbox toggle row */}
              <div className="flex items-center gap-2.5 px-3 py-2.5">
                <input
                  id="repeat-toggle"
                  type="checkbox"
                  className="w-4 h-4 rounded accent-[var(--color-primary)] cursor-pointer"
                  checked={showRepeat}
                  onChange={(e) => {
                    setShowRepeat(e.target.checked);
                    if (e.target.checked && repeatFrequency === 'none') setRepeatFrequency('weekly');
                    if (!e.target.checked) setRepeatFrequency('none');
                  }}
                />
                <label htmlFor="repeat-toggle" className="flex items-center gap-2 cursor-pointer select-none flex-1">
                  <Repeat className="w-3.5 h-3.5 text-[var(--color-text-secondary)]" />
                  <span className="text-sm font-medium text-[var(--color-text)]">Recurring schedule</span>
                  {showRepeat && repeatCount > 0 && (
                    <span className="ml-auto text-xs font-medium text-[var(--color-primary)]">
                      {repeatCount + 1} appointments
                    </span>
                  )}
                </label>
              </div>

              {showRepeat && (
                <div className="px-3 pb-3 space-y-3 border-t border-[var(--color-border)]">
                  {/* Frequency */}
                  <div className="flex gap-1.5 pt-3">
                    {(['weekly', 'biweekly', 'monthly'] as RepeatFrequency[]).map((f) => (
                      <button
                        key={f}
                        type="button"
                        onClick={() => setRepeatFrequency(f)}
                        className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                          repeatFrequency === f
                            ? 'bg-[var(--color-primary)] text-white'
                            : 'bg-white border border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)]/40'
                        }`}
                      >
                        {f === 'weekly' ? 'Weekly' : f === 'biweekly' ? 'Every 2 wks' : 'Monthly'}
                      </button>
                    ))}
                  </div>

                  {/* Count vs date toggle */}
                  <div className="flex gap-3">
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" className="accent-[var(--color-primary)]" checked={repeatMode === 'count'}
                        onChange={() => setRepeatMode('count')} />
                      <span className="text-xs text-[var(--color-text)]">
                        For the next
                        <input
                          type="number"
                          min={1}
                          max={52}
                          value={repeatOccurrences}
                          onClick={(e) => { setRepeatMode('count'); e.stopPropagation(); }}
                          onChange={(e) => { setRepeatMode('count'); setRepeatOccurrences(Math.max(1, parseInt(e.target.value) || 1)); }}
                          className="mx-1.5 w-12 px-1.5 py-0.5 text-xs text-center border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-primary)]"
                        />
                        times
                      </span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer">
                      <input type="radio" className="accent-[var(--color-primary)]" checked={repeatMode === 'date'}
                        onChange={() => setRepeatMode('date')} />
                      <span className="text-xs text-[var(--color-text)]">Until</span>
                      <input
                        type="date"
                        className="text-xs px-1.5 py-0.5 border border-[var(--color-border)] rounded focus:outline-none focus:border-[var(--color-primary)]"
                        value={repeatEndDate}
                        min={formData.scheduled_date}
                        onClick={() => setRepeatMode('date')}
                        onChange={(e) => { setRepeatMode('date'); setRepeatEndDate(e.target.value); }}
                      />
                    </label>
                  </div>

                  {/* Preview */}
                  {repeatCount > 0 && effectiveEndDate && (
                    <p className="text-xs text-[var(--color-primary)] font-medium">
                      Creates {repeatCount + 1} appointments — last on {new Date(effectiveEndDate + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                    </p>
                  )}
                </div>
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
              disabled={saving || !selectedItem}
            >
              {saving
                ? 'Saving...'
                : appointment
                ? 'Update Appointment'
                : repeatCount > 0
                ? `Create ${repeatCount + 1} Appointments`
                : 'Create Appointment'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
