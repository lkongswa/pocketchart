import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import type { Client, Discipline, ClientStatus, Gender, SubscriberRelationship } from '../../shared/types';

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
  secondary_dx_code: string;
  secondary_dx_description: string;
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
  referral_source: string;
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
  secondary_dx_code: '',
  secondary_dx_description: '',
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
  referral_source: '',
  status: 'active',
};

function parseSecondaryDx(raw: string): { code: string; description: string } {
  try {
    const parsed = JSON.parse(raw || '[]');
    if (Array.isArray(parsed) && parsed.length > 0) {
      return { code: parsed[0].code || '', description: parsed[0].description || '' };
    }
  } catch {}
  return { code: '', description: '' };
}

const ClientFormModal: React.FC<ClientFormModalProps> = ({
  isOpen,
  onClose,
  client,
  onSave,
}) => {
  const [form, setForm] = useState<FormData>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [saving, setSaving] = useState(false);

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
        secondary_dx_code: secDx.code,
        secondary_dx_description: secDx.description,
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
        referral_source: client.referral_source || '',
        status: client.status,
      });
    } else {
      setForm(emptyForm);
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
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormData]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      const secondaryDxArr = form.secondary_dx_code.trim()
        ? [{ code: form.secondary_dx_code, description: form.secondary_dx_description }]
        : [];
      const submitData = {
        ...form,
        secondary_dx: JSON.stringify(secondaryDxArr),
      };
      let saved: Client;
      if (client) {
        saved = await window.api.clients.update(client.id, submitData);
      } else {
        saved = await window.api.clients.create(submitData);
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
          {/* Basic Info */}
          <div>
            <h3 className="section-title">Basic Information</h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="label" htmlFor="first_name">First Name *</label>
                <input
                  id="first_name"
                  name="first_name"
                  className={`input ${errors.first_name ? 'ring-2 ring-red-400' : ''}`}
                  value={form.first_name}
                  onChange={handleChange}
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
          <div>
            <h3 className="section-title">Address</h3>
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
          <div>
            <h3 className="section-title">Clinical Information</h3>
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
                <label className="label" htmlFor="default_cpt_code">Default CPT Code</label>
                <input
                  id="default_cpt_code"
                  name="default_cpt_code"
                  className="input"
                  value={form.default_cpt_code}
                  onChange={handleChange}
                  placeholder="e.g. 97110"
                />
              </div>
              <div>
                <label className="label" htmlFor="primary_dx_code">Primary Dx Code</label>
                <input
                  id="primary_dx_code"
                  name="primary_dx_code"
                  className="input"
                  value={form.primary_dx_code}
                  onChange={handleChange}
                  placeholder="e.g. M54.5"
                />
              </div>
              <div>
                <label className="label" htmlFor="primary_dx_description">Dx Description</label>
                <input
                  id="primary_dx_description"
                  name="primary_dx_description"
                  className="input"
                  value={form.primary_dx_description}
                  onChange={handleChange}
                  placeholder="e.g. Low back pain"
                />
              </div>
              <div>
                <label className="label" htmlFor="secondary_dx_code">Secondary Dx Code</label>
                <input
                  id="secondary_dx_code"
                  name="secondary_dx_code"
                  className="input"
                  value={form.secondary_dx_code}
                  onChange={handleChange}
                  placeholder="e.g. G89.29"
                />
              </div>
              <div>
                <label className="label" htmlFor="secondary_dx_description">Secondary Dx Description</label>
                <input
                  id="secondary_dx_description"
                  name="secondary_dx_description"
                  className="input"
                  value={form.secondary_dx_description}
                  onChange={handleChange}
                  placeholder="e.g. Chronic pain"
                />
              </div>
            </div>
          </div>

          {/* Insurance */}
          <div>
            <h3 className="section-title">Insurance</h3>
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
          <div>
            <h3 className="section-title">Referral Information</h3>
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
                <label className="label" htmlFor="referring_physician">Referring Physician</label>
                <input
                  id="referring_physician"
                  name="referring_physician"
                  className="input"
                  value={form.referring_physician}
                  onChange={handleChange}
                  placeholder="Dr. Smith"
                />
              </div>
              <div>
                <label className="label" htmlFor="referring_npi">Referring NPI</label>
                <input
                  id="referring_npi"
                  name="referring_npi"
                  className="input"
                  value={form.referring_npi}
                  onChange={handleChange}
                  placeholder="NPI number"
                />
              </div>
            </div>
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
    </div>
  );
};

export default ClientFormModal;
