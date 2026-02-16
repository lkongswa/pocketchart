import React, { useState, useEffect, useRef } from 'react';
import { X, Search, Plus, Trash2, ChevronDown, ChevronRight } from 'lucide-react';
import type {
  Client,
  Discipline,
  ClientStatus,
  Gender,
  SubscriberRelationship,
  YesNo,
  OnsetQualifier,
  SignatureSource,
  ReferringQualifier,
} from '../../shared/types';
import {
  ONSET_QUALIFIER_LABELS,
  SIGNATURE_SOURCE_LABELS,
  REFERRING_QUALIFIER_LABELS,
} from '../../shared/types';
import { searchICD10, lookupICD10, type ICD10Entry } from '../../shared/icd10Data';
import CptCombobox from './CptCombobox';
import PhysicianCombobox from './PhysicianCombobox';
import PhysicianDirectoryModal from './PhysicianDirectoryModal';
import type { Physician } from '../../shared/types';

// Auto-capitalize names: "john doe" → "John Doe", handles hyphens/apostrophes
const titleCase = (str: string): string =>
  str.replace(/\b\w/g, (c) => c.toUpperCase());

// Fields that should be auto-capitalized on blur
const AUTO_CAP_FIELDS = new Set([
  'first_name', 'last_name', 'city',
  'subscriber_first_name', 'subscriber_last_name',
  'referring_physician', 'service_facility_name',
]);

// US States for dropdown
const US_STATES = [
  { value: '', label: 'Select State...' },
  { value: 'AL', label: 'Alabama' }, { value: 'AK', label: 'Alaska' }, { value: 'AZ', label: 'Arizona' },
  { value: 'AR', label: 'Arkansas' }, { value: 'CA', label: 'California' }, { value: 'CO', label: 'Colorado' },
  { value: 'CT', label: 'Connecticut' }, { value: 'DE', label: 'Delaware' }, { value: 'FL', label: 'Florida' },
  { value: 'GA', label: 'Georgia' }, { value: 'HI', label: 'Hawaii' }, { value: 'ID', label: 'Idaho' },
  { value: 'IL', label: 'Illinois' }, { value: 'IN', label: 'Indiana' }, { value: 'IA', label: 'Iowa' },
  { value: 'KS', label: 'Kansas' }, { value: 'KY', label: 'Kentucky' }, { value: 'LA', label: 'Louisiana' },
  { value: 'ME', label: 'Maine' }, { value: 'MD', label: 'Maryland' }, { value: 'MA', label: 'Massachusetts' },
  { value: 'MI', label: 'Michigan' }, { value: 'MN', label: 'Minnesota' }, { value: 'MS', label: 'Mississippi' },
  { value: 'MO', label: 'Missouri' }, { value: 'MT', label: 'Montana' }, { value: 'NE', label: 'Nebraska' },
  { value: 'NV', label: 'Nevada' }, { value: 'NH', label: 'New Hampshire' }, { value: 'NJ', label: 'New Jersey' },
  { value: 'NM', label: 'New Mexico' }, { value: 'NY', label: 'New York' }, { value: 'NC', label: 'North Carolina' },
  { value: 'ND', label: 'North Dakota' }, { value: 'OH', label: 'Ohio' }, { value: 'OK', label: 'Oklahoma' },
  { value: 'OR', label: 'Oregon' }, { value: 'PA', label: 'Pennsylvania' }, { value: 'RI', label: 'Rhode Island' },
  { value: 'SC', label: 'South Carolina' }, { value: 'SD', label: 'South Dakota' }, { value: 'TN', label: 'Tennessee' },
  { value: 'TX', label: 'Texas' }, { value: 'UT', label: 'Utah' }, { value: 'VT', label: 'Vermont' },
  { value: 'VA', label: 'Virginia' }, { value: 'WA', label: 'Washington' }, { value: 'WV', label: 'West Virginia' },
  { value: 'WI', label: 'Wisconsin' }, { value: 'WY', label: 'Wyoming' }, { value: 'DC', label: 'Washington DC' },
];

const GENDER_OPTIONS = [
  { value: '', label: 'Select...' },
  { value: 'M', label: 'Male' },
  { value: 'F', label: 'Female' },
  { value: 'U', label: 'Unknown' },
];

const SUBSCRIBER_RELATIONSHIP_OPTIONS = [
  { value: '18', label: 'Self' },
  { value: '01', label: 'Spouse' },
  { value: '19', label: 'Child' },
  { value: '20', label: 'Employee' },
  { value: 'G8', label: 'Other' },
];

const REFERRAL_SOURCE_OPTIONS = [
  { value: '', label: 'Select...' },
  { value: 'physician', label: 'Physician Referral' },
  { value: 'self', label: 'Self-Referral' },
  { value: 'insurance', label: 'Insurance' },
  { value: 'family', label: 'Family/Friend' },
  { value: 'online', label: 'Online Search' },
  { value: 'other', label: 'Other' },
];

interface ClientFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  client?: Client | null;
  onSave: (client: Client) => void;
  onDischarge?: () => void;
  /** Sections to highlight when opened from 'Complete Chart' button */
  highlightSections?: string[];
}

interface SecondaryDxEntry {
  code: string;
  description: string;
}

interface FormData {
  first_name: string;
  last_name: string;
  dob: string;
  phone: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  gender: Gender;
  discipline: Discipline;
  primary_dx_code: string;
  primary_dx_description: string;
  secondary_dx_entries: SecondaryDxEntry[];
  default_cpt_code: string;
  insurance_payer: string;
  insurance_member_id: string;
  insurance_group: string;
  insurance_payer_id: string;
  subscriber_relationship: SubscriberRelationship;
  subscriber_first_name: string;
  subscriber_last_name: string;
  subscriber_dob: string;
  referring_physician: string;
  referring_npi: string;
  referring_physician_qualifier: ReferringQualifier;
  referring_fax: string;
  referring_physician_id: number | null;
  referral_source: string;
  // CMS-1500 claim fields
  onset_date: string;
  onset_qualifier: OnsetQualifier;
  employment_related: YesNo;
  auto_accident: YesNo;
  auto_accident_state: string;
  other_accident: YesNo;
  claim_accept_assignment: YesNo;
  patient_signature_source: SignatureSource;
  insured_signature_source: SignatureSource;
  prior_auth_number: string;
  additional_claim_info: string;
  service_facility_name: string;
  service_facility_npi: string;
  status: ClientStatus;
}

const emptyForm: FormData = {
  first_name: '',
  last_name: '',
  dob: '',
  phone: '',
  email: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  gender: '',
  discipline: 'PT',
  primary_dx_code: '',
  primary_dx_description: '',
  secondary_dx_entries: [],
  default_cpt_code: '',
  insurance_payer: '',
  insurance_member_id: '',
  insurance_group: '',
  insurance_payer_id: '',
  subscriber_relationship: '18',
  subscriber_first_name: '',
  subscriber_last_name: '',
  subscriber_dob: '',
  referring_physician: '',
  referring_npi: '',
  referring_physician_qualifier: 'DN',
  referring_fax: '',
  referring_physician_id: null,
  referral_source: '',
  onset_date: '',
  onset_qualifier: '431',
  employment_related: 'N',
  auto_accident: 'N',
  auto_accident_state: '',
  other_accident: 'N',
  claim_accept_assignment: 'Y',
  patient_signature_source: 'SOF',
  insured_signature_source: 'SOF',
  prior_auth_number: '',
  additional_claim_info: '',
  service_facility_name: '',
  service_facility_npi: '',
  status: 'active',
};

function parseSecondaryDx(raw: string): SecondaryDxEntry[] {
  try {
    const parsed = JSON.parse(raw || '[]');
    if (Array.isArray(parsed)) {
      return parsed.map((p: any) => ({ code: p.code || '', description: p.description || '' })).filter((e: SecondaryDxEntry) => e.code);
    }
  } catch {}
  return [];
}

const ClientFormModal: React.FC<ClientFormModalProps> = ({
  isOpen,
  onClose,
  client,
  onSave,
  onDischarge,
  highlightSections = [],
}) => {
  const [form, setForm] = useState<FormData>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [saving, setSaving] = useState(false);
  const [waitlistPrefill, setWaitlistPrefill] = useState<{ waitlistId: number; notes?: string } | null>(null);

  // Helper for chart completeness highlighting
  const shouldHighlight = (section: string) => highlightSections.includes(section);

  // ICD-10 search state
  const [dxSuggestions, setDxSuggestions] = useState<ICD10Entry[]>([]);
  const [showDxSuggestions, setShowDxSuggestions] = useState(false);
  const [activeSecDxIndex, setActiveSecDxIndex] = useState<number | null>(null);
  const [secDxSuggestions, setSecDxSuggestions] = useState<ICD10Entry[]>([]);
  const [showSecDxSuggestions, setShowSecDxSuggestions] = useState(false);
  const [showClaimInfo, setShowClaimInfo] = useState(false);
  const [showPhysicianDir, setShowPhysicianDir] = useState(false);
  const [newPhysicianName, setNewPhysicianName] = useState('');
  const dxInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (client) {
      const secDx = parseSecondaryDx(client.secondary_dx);
      setForm({
        first_name: client.first_name,
        last_name: client.last_name,
        dob: client.dob,
        phone: client.phone,
        email: client.email,
        address: client.address,
        city: client.city || '',
        state: client.state || '',
        zip: client.zip || '',
        gender: client.gender || '',
        discipline: client.discipline,
        primary_dx_code: client.primary_dx_code,
        primary_dx_description: client.primary_dx_description,
        secondary_dx_entries: secDx,
        default_cpt_code: client.default_cpt_code,
        insurance_payer: client.insurance_payer,
        insurance_member_id: client.insurance_member_id,
        insurance_group: client.insurance_group,
        insurance_payer_id: client.insurance_payer_id || '',
        subscriber_relationship: client.subscriber_relationship || '18',
        subscriber_first_name: client.subscriber_first_name || '',
        subscriber_last_name: client.subscriber_last_name || '',
        subscriber_dob: client.subscriber_dob || '',
        referring_physician: client.referring_physician,
        referring_npi: client.referring_npi,
        referring_physician_qualifier: (client.referring_physician_qualifier as ReferringQualifier) || 'DN',
        referring_fax: client.referring_fax || '',
        referring_physician_id: client.referring_physician_id || null,
        referral_source: client.referral_source || '',
        onset_date: client.onset_date || '',
        onset_qualifier: (client.onset_qualifier as OnsetQualifier) || '431',
        employment_related: (client.employment_related as YesNo) || 'N',
        auto_accident: (client.auto_accident as YesNo) || 'N',
        auto_accident_state: client.auto_accident_state || '',
        other_accident: (client.other_accident as YesNo) || 'N',
        claim_accept_assignment: (client.claim_accept_assignment as YesNo) || 'Y',
        patient_signature_source: (client.patient_signature_source as SignatureSource) || 'SOF',
        insured_signature_source: (client.insured_signature_source as SignatureSource) || 'SOF',
        prior_auth_number: client.prior_auth_number || '',
        additional_claim_info: client.additional_claim_info || '',
        service_facility_name: client.service_facility_name || '',
        service_facility_npi: client.service_facility_npi || '',
        status: client.status,
      });
    } else {
      // New client: check for waitlist pre-fill data, then default discipline from practice
      const waitlistRaw = sessionStorage.getItem('waitlist_prefill');
      const waitlistData = waitlistRaw ? JSON.parse(waitlistRaw) : null;

      window.api.practice.get().then((practice: any) => {
        const practiceDiscipline = practice?.discipline || 'PT';
        if (waitlistData) {
          setForm({
            ...emptyForm,
            first_name: waitlistData.first_name || '',
            last_name: waitlistData.last_name || '',
            phone: waitlistData.phone || '',
            email: waitlistData.email || '',
            discipline: waitlistData.discipline || practiceDiscipline,
            referral_source: waitlistData.referral_source || '',
          });
          setWaitlistPrefill(waitlistData);
        } else {
          setForm({ ...emptyForm, discipline: practiceDiscipline });
          setWaitlistPrefill(null);
        }
      }).catch(() => {
        if (waitlistData) {
          setForm({
            ...emptyForm,
            first_name: waitlistData.first_name || '',
            last_name: waitlistData.last_name || '',
            phone: waitlistData.phone || '',
            email: waitlistData.email || '',
            referral_source: waitlistData.referral_source || '',
          });
          setWaitlistPrefill(waitlistData);
        } else {
          setForm(emptyForm);
          setWaitlistPrefill(null);
        }
      });
    }
    setErrors({});
  }, [client, isOpen]);

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};
    if (!form.first_name.trim()) newErrors.first_name = 'First name is required';
    if (!form.last_name.trim()) newErrors.last_name = 'Last name is required';
    if (!form.discipline) newErrors.discipline = 'Discipline is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;

    // Status change intercept: prompt for discharge summary
    if (name === 'status' && value === 'discharged' && form.status !== 'discharged' && onDischarge) {
      const createSummary = window.confirm(
        'Would you like to create a discharge summary?\n\n' +
        'A discharge summary documents final goal statuses, outcomes, and recommendations.\n\n' +
        'Click OK to create one, or Cancel to change status without a summary.'
      );
      if (createSummary) {
        onClose();
        onDischarge();
        return;
      }
    }

    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormData]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }

    // ICD-10 auto-populate: search suggestions as user types dx code
    if (name === 'primary_dx_code') {
      if (value.length >= 2) {
        const results = searchICD10(value, 8);
        setDxSuggestions(results);
        setShowDxSuggestions(results.length > 0);
      } else {
        setDxSuggestions([]);
        setShowDxSuggestions(false);
      }
      // Auto-fill description on exact match
      const match = lookupICD10(value);
      if (match) {
        setForm((prev) => ({ ...prev, primary_dx_description: match.description }));
      }
    }
  };

  // Auto-capitalize name/city fields on blur
  const handleBlurAutoCapitalize = (e: React.FocusEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    if (AUTO_CAP_FIELDS.has(name) && value.trim()) {
      setForm((prev) => ({ ...prev, [name]: titleCase(value) }));
    }
  };

  // --- Secondary Dx helpers ---
  const handleSecDxCodeChange = (index: number, value: string) => {
    setForm((prev) => {
      const entries = [...prev.secondary_dx_entries];
      entries[index] = { ...entries[index], code: value };
      // Auto-fill description on exact match
      const match = lookupICD10(value);
      if (match) {
        entries[index].description = match.description;
      }
      return { ...prev, secondary_dx_entries: entries };
    });
    // Show suggestions
    if (value.length >= 2) {
      const results = searchICD10(value, 8);
      setSecDxSuggestions(results);
      setShowSecDxSuggestions(results.length > 0);
      setActiveSecDxIndex(index);
    } else {
      setSecDxSuggestions([]);
      setShowSecDxSuggestions(false);
      setActiveSecDxIndex(null);
    }
  };

  const handleSecDxDescChange = (index: number, value: string) => {
    setForm((prev) => {
      const entries = [...prev.secondary_dx_entries];
      entries[index] = { ...entries[index], description: value };
      return { ...prev, secondary_dx_entries: entries };
    });
  };

  const addSecondaryDx = () => {
    if (form.secondary_dx_entries.length >= 11) return; // Max 11 secondary (12 total including primary)
    setForm((prev) => ({
      ...prev,
      secondary_dx_entries: [...prev.secondary_dx_entries, { code: '', description: '' }],
    }));
  };

  const removeSecondaryDx = (index: number) => {
    setForm((prev) => ({
      ...prev,
      secondary_dx_entries: prev.secondary_dx_entries.filter((_, i) => i !== index),
    }));
  };

  const selectSecDxCode = (entry: ICD10Entry, index: number) => {
    setForm((prev) => {
      const entries = [...prev.secondary_dx_entries];
      entries[index] = { code: entry.code, description: entry.description };
      return { ...prev, secondary_dx_entries: entries };
    });
    setShowSecDxSuggestions(false);
    setActiveSecDxIndex(null);
  };

  const selectDxCode = (entry: ICD10Entry) => {
    setForm((prev) => ({ ...prev, primary_dx_code: entry.code, primary_dx_description: entry.description }));
    setShowDxSuggestions(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const secondaryDxArr = form.secondary_dx_entries.filter(e => e.code.trim());
      const { secondary_dx_entries, ...rest } = form;
      const submitData = {
        ...rest,
        secondary_dx: JSON.stringify(secondaryDxArr),
      };
      let saved: Client;
      if (client) {
        saved = await window.api.clients.update(client.id, submitData);
      } else {
        saved = await window.api.clients.create(submitData);
        // Link waitlist entry to newly created client
        if (waitlistPrefill?.waitlistId) {
          try {
            await window.api.waitlist.linkClient(waitlistPrefill.waitlistId, saved.id);
          } catch (err) {
            console.error('Failed to link waitlist entry:', err);
          }
          sessionStorage.removeItem('waitlist_prefill');
          setWaitlistPrefill(null);
        }
      }
      onSave(saved);
      onClose();
    } catch (err) {
      console.error('Failed to save client:', err);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">
            {client ? 'Edit Client' : 'Add New Client'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 text-[var(--color-text-secondary)]"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Waitlist referral notes banner */}
          {waitlistPrefill?.notes && (
            <div className="rounded-lg border border-teal-200 bg-teal-50/50 p-3">
              <h4 className="text-xs font-semibold text-teal-700 mb-1">Referral Notes from Waitlist</h4>
              <p className="text-xs text-teal-800 whitespace-pre-wrap">{waitlistPrefill.notes}</p>
            </div>
          )}
          {/* Basic Info */}
          <div className={`rounded-lg border-l-4 p-4 ${shouldHighlight('demographics') ? 'border-amber-400 bg-amber-50/40 ring-2 ring-amber-300' : 'border-blue-400 bg-blue-50/30'}`}>
            <h3 className={`section-title ${shouldHighlight('demographics') ? 'text-amber-700' : 'text-blue-700'}`}>Basic Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="first_name">First Name *</label>
                <input
                  id="first_name"
                  name="first_name"
                  className={`input ${errors.first_name ? 'ring-2 ring-red-400' : ''}`}
                  value={form.first_name}
                  onChange={handleChange}
                  onBlur={handleBlurAutoCapitalize}
                  placeholder="First name"
                />
                {errors.first_name && (
                  <p className="text-xs text-red-500 mt-1">{errors.first_name}</p>
                )}
              </div>
              <div>
                <label className="label" htmlFor="last_name">Last Name *</label>
                <input
                  id="last_name"
                  name="last_name"
                  className={`input ${errors.last_name ? 'ring-2 ring-red-400' : ''}`}
                  value={form.last_name}
                  onChange={handleChange}
                  onBlur={handleBlurAutoCapitalize}
                  placeholder="Last name"
                />
                {errors.last_name && (
                  <p className="text-xs text-red-500 mt-1">{errors.last_name}</p>
                )}
              </div>
              <div>
                <label className="label" htmlFor="dob">Date of Birth</label>
                <input
                  id="dob"
                  name="dob"
                  type="date"
                  className="input"
                  value={form.dob}
                  onChange={handleChange}
                />
              </div>
              <div>
                <label className="label" htmlFor="gender">Gender</label>
                <select
                  id="gender"
                  name="gender"
                  className="select"
                  value={form.gender}
                  onChange={handleChange}
                >
                  {GENDER_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="phone">Phone</label>
                <input
                  id="phone"
                  name="phone"
                  type="tel"
                  className="input"
                  value={form.phone}
                  onChange={handleChange}
                  placeholder="(555) 123-4567"
                />
              </div>
              <div>
                <label className="label" htmlFor="email">Email</label>
                <input
                  id="email"
                  name="email"
                  type="email"
                  className="input"
                  value={form.email}
                  onChange={handleChange}
                  placeholder="email@example.com"
                />
              </div>
            </div>
          </div>

          {/* Address */}
          <div className={`rounded-lg border-l-4 p-4 ${shouldHighlight('demographics') ? 'border-amber-400 bg-amber-50/40 ring-2 ring-amber-300' : 'border-blue-400 bg-blue-50/30'}`}>
            <h3 className={`section-title ${shouldHighlight('demographics') ? 'text-amber-700' : 'text-blue-700'}`}>Address</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="label" htmlFor="address">Street Address</label>
                <input
                  id="address"
                  name="address"
                  className="input"
                  value={form.address}
                  onChange={handleChange}
                  placeholder="123 Main St"
                />
              </div>
              <div>
                <label className="label" htmlFor="city">City</label>
                <input
                  id="city"
                  name="city"
                  className="input"
                  value={form.city}
                  onChange={handleChange}
                  onBlur={handleBlurAutoCapitalize}
                  placeholder="City"
                />
              </div>
              <div>
                <label className="label" htmlFor="state">State</label>
                <select
                  id="state"
                  name="state"
                  className="select"
                  value={form.state}
                  onChange={handleChange}
                >
                  {US_STATES.map((st) => (
                    <option key={st.value} value={st.value}>{st.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label" htmlFor="zip">ZIP Code</label>
                <input
                  id="zip"
                  name="zip"
                  className="input"
                  value={form.zip}
                  onChange={handleChange}
                  placeholder="12345"
                  maxLength={10}
                />
              </div>
            </div>
          </div>

          {/* Clinical */}
          <div className={`rounded-lg border-l-4 p-4 ${shouldHighlight('diagnosis') ? 'border-amber-400 bg-amber-50/40 ring-2 ring-amber-300' : 'border-violet-400 bg-violet-50/30'}`}>
            <h3 className={`section-title ${shouldHighlight('diagnosis') ? 'text-amber-700' : 'text-violet-700'}`}>Clinical Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="discipline">Discipline *</label>
                <select
                  id="discipline"
                  name="discipline"
                  className={`select ${errors.discipline ? 'ring-2 ring-red-400' : ''}`}
                  value={form.discipline}
                  onChange={handleChange}
                >
                  <option value="PT">Physical Therapy (PT)</option>
                  <option value="OT">Occupational Therapy (OT)</option>
                  <option value="ST">Speech Therapy (ST)</option>
                </select>
                {errors.discipline && (
                  <p className="text-xs text-red-500 mt-1">{errors.discipline}</p>
                )}
              </div>
              <div>
                <label className="label">Default CPT Code</label>
                <CptCombobox
                  value={form.default_cpt_code}
                  onChange={(code) => setForm(prev => ({ ...prev, default_cpt_code: code }))}
                  placeholder="Search CPT code..."
                />
              </div>
              <div className="relative">
                <label className="label" htmlFor="primary_dx_code">Primary Dx Code</label>
                <div className="relative">
                  <input
                    ref={dxInputRef}
                    id="primary_dx_code"
                    name="primary_dx_code"
                    className="input pr-8"
                    value={form.primary_dx_code}
                    onChange={handleChange}
                    onFocus={() => { if (dxSuggestions.length > 0) setShowDxSuggestions(true); }}
                    onBlur={() => { setTimeout(() => setShowDxSuggestions(false), 200); }}
                    placeholder="e.g. M54.5"
                    autoComplete="off"
                  />
                  <Search size={14} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
                </div>
                {showDxSuggestions && dxSuggestions.length > 0 && (
                  <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-[var(--color-border)] rounded-lg shadow-lg max-h-48 overflow-y-auto">
                    {dxSuggestions.map((entry) => (
                      <button
                        key={entry.code}
                        type="button"
                        className="w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center gap-2 text-sm transition-colors"
                        onMouseDown={(e) => { e.preventDefault(); selectDxCode(entry); }}
                      >
                        <span className="font-mono font-semibold text-blue-600 shrink-0">{entry.code}</span>
                        <span className="text-[var(--color-text-secondary)] truncate">{entry.description}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div>
                <label className="label" htmlFor="primary_dx_description">Dx Description</label>
                <input
                  id="primary_dx_description"
                  name="primary_dx_description"
                  className="input"
                  value={form.primary_dx_description}
                  onChange={handleChange}
                  placeholder="Auto-fills from code"
                  readOnly={Boolean(form.primary_dx_code && lookupICD10(form.primary_dx_code))}
                />
              </div>
              {/* Secondary Diagnoses (multiple) */}
              <div className="col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="label mb-0">Secondary Diagnoses</label>
                  {form.secondary_dx_entries.length < 11 && (
                    <button
                      type="button"
                      className="text-xs text-[var(--color-primary)] hover:underline flex items-center gap-1"
                      onClick={addSecondaryDx}
                    >
                      <Plus size={12} /> Add Dx
                    </button>
                  )}
                </div>
                {form.secondary_dx_entries.length === 0 ? (
                  <button
                    type="button"
                    className="w-full p-2 rounded-lg border border-dashed border-[var(--color-border)] text-sm text-[var(--color-text-secondary)] hover:bg-gray-50 transition-colors flex items-center justify-center gap-1"
                    onClick={addSecondaryDx}
                  >
                    <Plus size={14} /> Add secondary diagnosis
                  </button>
                ) : (
                  <div className="space-y-2">
                    {form.secondary_dx_entries.map((entry, idx) => (
                      <div key={idx} className="flex items-start gap-2">
                        <span className="text-xs font-mono text-[var(--color-text-secondary)] mt-2.5 w-4 shrink-0">
                          {String.fromCharCode(66 + idx)}
                        </span>
                        <div className="flex-1 relative">
                          <div className="relative">
                            <input
                              type="text"
                              className="input pr-8 text-sm"
                              value={entry.code}
                              onChange={(e) => handleSecDxCodeChange(idx, e.target.value)}
                              onFocus={() => {
                                if (secDxSuggestions.length > 0 && activeSecDxIndex === idx) {
                                  setShowSecDxSuggestions(true);
                                }
                              }}
                              onBlur={() => setTimeout(() => setShowSecDxSuggestions(false), 200)}
                              placeholder={`Dx code ${idx + 2}`}
                              autoComplete="off"
                            />
                            <Search size={12} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[var(--color-text-tertiary)]" />
                          </div>
                          {showSecDxSuggestions && activeSecDxIndex === idx && secDxSuggestions.length > 0 && (
                            <div className="absolute z-20 left-0 right-0 mt-1 bg-white border border-[var(--color-border)] rounded-lg shadow-lg max-h-48 overflow-y-auto">
                              {secDxSuggestions.map((suggestion) => (
                                <button
                                  key={suggestion.code}
                                  type="button"
                                  className="w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center gap-2 text-sm transition-colors"
                                  onMouseDown={(e) => { e.preventDefault(); selectSecDxCode(suggestion, idx); }}
                                >
                                  <span className="font-mono font-semibold text-blue-600 shrink-0">{suggestion.code}</span>
                                  <span className="text-[var(--color-text-secondary)] truncate">{suggestion.description}</span>
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                        <input
                          type="text"
                          className="input text-sm flex-1"
                          value={entry.description}
                          onChange={(e) => handleSecDxDescChange(idx, e.target.value)}
                          placeholder="Description"
                          readOnly={Boolean(entry.code && lookupICD10(entry.code))}
                        />
                        <button
                          type="button"
                          className="p-1.5 mt-1 rounded hover:bg-red-50 text-red-400 hover:text-red-600 transition-colors"
                          onClick={() => removeSecondaryDx(idx)}
                          title="Remove diagnosis"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <p className="text-xs text-[var(--color-text-tertiary)] mt-1">
                  CMS-1500 supports up to 12 diagnoses (A-L). Primary = A.
                </p>
              </div>
            </div>
          </div>

          {/* Insurance */}
          <div className={`rounded-lg border-l-4 p-4 ${shouldHighlight('insurance') ? 'border-amber-400 bg-amber-50/40 ring-2 ring-amber-300' : 'border-emerald-400 bg-emerald-50/30'}`}>
            <h3 className={`section-title ${shouldHighlight('insurance') ? 'text-amber-700' : 'text-emerald-700'}`}>Insurance</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="insurance_payer">Insurance Payer</label>
                <input
                  id="insurance_payer"
                  name="insurance_payer"
                  className="input"
                  value={form.insurance_payer}
                  onChange={handleChange}
                  placeholder="e.g. Blue Cross"
                />
              </div>
              <div>
                <label className="label" htmlFor="insurance_payer_id">Payer ID</label>
                <input
                  id="insurance_payer_id"
                  name="insurance_payer_id"
                  className="input"
                  value={form.insurance_payer_id}
                  onChange={handleChange}
                  placeholder="EDI Payer ID"
                />
                <p className="text-xs text-[var(--color-text-tertiary)] mt-1">For electronic claims</p>
              </div>
              <div>
                <label className="label" htmlFor="insurance_member_id">Member ID</label>
                <input
                  id="insurance_member_id"
                  name="insurance_member_id"
                  className="input"
                  value={form.insurance_member_id}
                  onChange={handleChange}
                  placeholder="Member ID"
                />
              </div>
              <div>
                <label className="label" htmlFor="insurance_group">Group Number</label>
                <input
                  id="insurance_group"
                  name="insurance_group"
                  className="input"
                  value={form.insurance_group}
                  onChange={handleChange}
                  placeholder="Group number"
                />
              </div>
              <div className="col-span-2">
                <label className="label" htmlFor="subscriber_relationship">Subscriber Relationship</label>
                <select
                  id="subscriber_relationship"
                  name="subscriber_relationship"
                  className="select"
                  value={form.subscriber_relationship}
                  onChange={handleChange}
                >
                  {SUBSCRIBER_RELATIONSHIP_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              {form.subscriber_relationship !== '18' && (
                <>
                  <div>
                    <label className="label" htmlFor="subscriber_first_name">Subscriber First Name</label>
                    <input
                      id="subscriber_first_name"
                      name="subscriber_first_name"
                      className="input"
                      value={form.subscriber_first_name}
                      onChange={handleChange}
                      onBlur={handleBlurAutoCapitalize}
                      placeholder="Subscriber first name"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="subscriber_last_name">Subscriber Last Name</label>
                    <input
                      id="subscriber_last_name"
                      name="subscriber_last_name"
                      className="input"
                      value={form.subscriber_last_name}
                      onChange={handleChange}
                      onBlur={handleBlurAutoCapitalize}
                      placeholder="Subscriber last name"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="subscriber_dob">Subscriber Date of Birth</label>
                    <input
                      id="subscriber_dob"
                      name="subscriber_dob"
                      type="date"
                      className="input"
                      value={form.subscriber_dob}
                      onChange={handleChange}
                    />
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Referral */}
          <div className={`rounded-lg border-l-4 p-4 ${shouldHighlight('referral') ? 'border-amber-400 bg-amber-50/40 ring-2 ring-amber-300' : 'border-amber-400 bg-amber-50/30'}`}>
            <h3 className="section-title text-amber-700">Referral Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="referral_source">Referral Source</label>
                <select
                  id="referral_source"
                  name="referral_source"
                  className="select"
                  value={form.referral_source}
                  onChange={handleChange}
                >
                  {REFERRAL_SOURCE_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">Referring Physician</label>
                <PhysicianCombobox
                  value={form.referring_physician}
                  physicianId={form.referring_physician_id}
                  onChange={(physician, name) => {
                    if (physician) {
                      setForm(prev => ({
                        ...prev,
                        referring_physician: physician.name,
                        referring_npi: physician.npi || prev.referring_npi,
                        referring_fax: physician.fax_number || prev.referring_fax,
                        referring_physician_id: physician.id,
                      }));
                    } else {
                      setForm(prev => ({
                        ...prev,
                        referring_physician: name,
                        referring_physician_id: null,
                      }));
                    }
                  }}
                  onNewPhysician={(name) => {
                    setNewPhysicianName(name);
                    setShowPhysicianDir(true);
                  }}
                />
              </div>
              <div>
                <label className="label" htmlFor="referring_npi">Referring NPI</label>
                <input
                  id="referring_npi"
                  name="referring_npi"
                  className={`input ${form.referring_npi && !/^\d{10}$/.test(form.referring_npi) ? 'border-red-300' : ''}`}
                  value={form.referring_npi}
                  maxLength={10}
                  onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 10); setForm(prev => ({ ...prev, referring_npi: v })); }}
                  placeholder="10-digit NPI"
                />
                {form.referring_npi && !/^\d{10}$/.test(form.referring_npi) && <p className="text-xs text-red-500 mt-1">NPI must be exactly 10 digits</p>}
              </div>
              <div>
                <label className="label" htmlFor="referring_fax">Referring Fax</label>
                <input
                  id="referring_fax"
                  name="referring_fax"
                  className="input"
                  type="tel"
                  value={form.referring_fax}
                  onChange={handleChange}
                  placeholder="(555) 123-4567"
                />
              </div>
              <div>
                <label className="label" htmlFor="referring_physician_qualifier">Provider Qualifier</label>
                <select
                  id="referring_physician_qualifier"
                  name="referring_physician_qualifier"
                  className="select"
                  value={form.referring_physician_qualifier}
                  onChange={handleChange}
                >
                  {Object.entries(REFERRING_QUALIFIER_LABELS).map(([val, label]) => (
                    <option key={val} value={val}>{label}</option>
                  ))}
                </select>
                <p className="text-xs text-[var(--color-text-tertiary)] mt-1">CMS-1500 Box 17a</p>
              </div>
            </div>
          </div>

          {/* CMS-1500 Claim Information (collapsible) */}
          <div className="rounded-lg border-l-4 border-indigo-400 bg-indigo-50/30 p-4">
            <button
              type="button"
              className="flex items-center gap-2 w-full text-left"
              onClick={() => setShowClaimInfo(!showClaimInfo)}
            >
              {showClaimInfo ? (
                <ChevronDown className="w-4 h-4 text-indigo-600" />
              ) : (
                <ChevronRight className="w-4 h-4 text-indigo-600" />
              )}
              <h3 className="section-title text-indigo-700 mb-0">
                CMS-1500 Claim Information
              </h3>
              <span className="text-xs text-[var(--color-text-secondary)] ml-auto">
                {showClaimInfo ? 'Collapse' : 'Expand for insurance claim fields'}
              </span>
            </button>
            {showClaimInfo && (
              <div className="grid grid-cols-2 gap-4 mt-4">
                {/* Onset / Illness (Box 14) */}
                <div>
                  <label className="label" htmlFor="onset_date">Date of Onset (Box 14)</label>
                  <input
                    id="onset_date"
                    name="onset_date"
                    type="date"
                    className="input"
                    value={form.onset_date}
                    onChange={handleChange}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="onset_qualifier">Onset Qualifier</label>
                  <select
                    id="onset_qualifier"
                    name="onset_qualifier"
                    className="select"
                    value={form.onset_qualifier}
                    onChange={handleChange}
                  >
                    <option value="">Select...</option>
                    {Object.entries(ONSET_QUALIFIER_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>

                {/* Condition Related To (Box 10) */}
                <div>
                  <label className="label" htmlFor="employment_related">Employment Related? (Box 10a)</label>
                  <select id="employment_related" name="employment_related" className="select" value={form.employment_related} onChange={handleChange}>
                    <option value="N">No</option>
                    <option value="Y">Yes</option>
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="auto_accident">Auto Accident? (Box 10b)</label>
                  <select id="auto_accident" name="auto_accident" className="select" value={form.auto_accident} onChange={handleChange}>
                    <option value="N">No</option>
                    <option value="Y">Yes</option>
                  </select>
                </div>
                {form.auto_accident === 'Y' && (
                  <div>
                    <label className="label" htmlFor="auto_accident_state">Auto Accident State</label>
                    <select id="auto_accident_state" name="auto_accident_state" className="select" value={form.auto_accident_state} onChange={handleChange}>
                      {US_STATES.map((st) => (
                        <option key={st.value} value={st.value}>{st.label}</option>
                      ))}
                    </select>
                  </div>
                )}
                <div>
                  <label className="label" htmlFor="other_accident">Other Accident? (Box 10c)</label>
                  <select id="other_accident" name="other_accident" className="select" value={form.other_accident} onChange={handleChange}>
                    <option value="N">No</option>
                    <option value="Y">Yes</option>
                  </select>
                </div>

                {/* Signatures (Box 12, 13) */}
                <div>
                  <label className="label" htmlFor="patient_signature_source">Patient Signature (Box 12)</label>
                  <select id="patient_signature_source" name="patient_signature_source" className="select" value={form.patient_signature_source} onChange={handleChange}>
                    <option value="">Select...</option>
                    {Object.entries(SIGNATURE_SOURCE_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="label" htmlFor="insured_signature_source">Insured Signature (Box 13)</label>
                  <select id="insured_signature_source" name="insured_signature_source" className="select" value={form.insured_signature_source} onChange={handleChange}>
                    <option value="">Select...</option>
                    {Object.entries(SIGNATURE_SOURCE_LABELS).map(([val, label]) => (
                      <option key={val} value={val}>{label}</option>
                    ))}
                  </select>
                </div>

                {/* Prior Auth (Box 23) */}
                <div>
                  <label className="label" htmlFor="prior_auth_number">Prior Auth Number (Box 23)</label>
                  <input id="prior_auth_number" name="prior_auth_number" className="input" value={form.prior_auth_number} onChange={handleChange} placeholder="Authorization number" />
                </div>

                {/* Accept Assignment (Box 27) */}
                <div>
                  <label className="label" htmlFor="claim_accept_assignment">Accept Assignment? (Box 27)</label>
                  <select id="claim_accept_assignment" name="claim_accept_assignment" className="select" value={form.claim_accept_assignment} onChange={handleChange}>
                    <option value="Y">Yes</option>
                    <option value="N">No</option>
                  </select>
                </div>

                {/* Service Facility (Box 32) */}
                <div>
                  <label className="label" htmlFor="service_facility_name">Service Facility (Box 32)</label>
                  <input id="service_facility_name" name="service_facility_name" className="input" value={form.service_facility_name} onChange={handleChange} onBlur={handleBlurAutoCapitalize} placeholder="Leave blank to use practice" />
                  <p className="text-xs text-[var(--color-text-tertiary)] mt-1">If different from billing provider</p>
                </div>
                <div>
                  <label className="label" htmlFor="service_facility_npi">Facility NPI (Box 32a)</label>
                  <input id="service_facility_npi" name="service_facility_npi" className={`input ${form.service_facility_npi && !/^\d{10}$/.test(form.service_facility_npi) ? 'border-red-300' : ''}`} maxLength={10} value={form.service_facility_npi} onChange={(e) => { const v = e.target.value.replace(/\D/g, '').slice(0, 10); setForm(prev => ({ ...prev, service_facility_npi: v })); }} placeholder="10-digit NPI" />
                  {form.service_facility_npi && !/^\d{10}$/.test(form.service_facility_npi) && <p className="text-xs text-red-500 mt-1">NPI must be exactly 10 digits</p>}
                </div>

                {/* Additional Info (Box 19) */}
                <div className="col-span-2">
                  <label className="label" htmlFor="additional_claim_info">Additional Claim Info (Box 19)</label>
                  <textarea
                    id="additional_claim_info"
                    name="additional_claim_info"
                    className="textarea text-sm"
                    value={form.additional_claim_info}
                    onChange={handleChange}
                    placeholder="Optional notes for Box 19"
                    rows={2}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Status */}
          <div>
            <h3 className="section-title">Status</h3>
            <div className="w-1/2">
              <label className="label" htmlFor="status">Client Status</label>
              <select
                id="status"
                name="status"
                className="select"
                value={form.status}
                onChange={handleChange}
              >
                <option value="active">Active</option>
                <option value="discharged">Discharged</option>
                <option value="hold">On Hold</option>
              </select>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--color-border)]">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving...' : client ? 'Update Client' : 'Add Client'}
            </button>
          </div>
        </form>
      </div>

      <PhysicianDirectoryModal
        isOpen={showPhysicianDir}
        onClose={() => { setShowPhysicianDir(false); setNewPhysicianName(''); }}
        initialPhysicianName={newPhysicianName}
        onSelect={(physician) => {
          setForm(prev => ({
            ...prev,
            referring_physician: physician.name,
            referring_npi: physician.npi || prev.referring_npi,
            referring_fax: physician.fax_number || prev.referring_fax,
            referring_physician_id: physician.id,
          }));
        }}
      />
    </div>
  );
};

export default ClientFormModal;
