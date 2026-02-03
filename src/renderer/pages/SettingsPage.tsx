import React, { useState, useEffect, useCallback } from 'react';
import { Settings, Building2, User, Stethoscope, Info, Save, CheckCircle, Database, Download, FileSpreadsheet, HardDrive, FolderOpen, RotateCcw, Upload, Trash2, Image, Clock, AlertTriangle, Shield, Lock, PenLine, BookOpen, ChevronDown } from 'lucide-react';
import type { Practice, Discipline } from '../../shared/types';
import SignaturePad from '../components/SignaturePad';
import GoalsBankPage from './GoalsBankPage';
import NoteBankPage from './NoteBankPage';

// ── Collapsible Section Component ──
interface CollapsibleSectionProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function CollapsibleSection({ icon, title, description, defaultOpen = false, children }: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className="card mb-4 overflow-hidden">
      <button
        type="button"
        className="w-full flex items-center gap-3 px-6 py-4 text-left hover:bg-gray-50/50 transition-colors cursor-pointer"
        onClick={() => setIsOpen(!isOpen)}
      >
        <div className="text-[var(--color-primary)]">{icon}</div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">{title}</h2>
          {description && !isOpen && (
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5 truncate">{description}</p>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-[var(--color-text-secondary)] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen && (
        <div className="px-6 pb-6 border-t border-[var(--color-border)]">
          <div className="pt-4">{children}</div>
        </div>
      )}
    </div>
  );
}

const DISCIPLINES: Array<{ value: Discipline | 'MULTI'; label: string }> = [
  { value: 'PT', label: 'Physical Therapy (PT)' },
  { value: 'OT', label: 'Occupational Therapy (OT)' },
  { value: 'ST', label: 'Speech Therapy (ST)' },
  { value: 'MULTI', label: 'Multi-Discipline (MULTI)' },
];

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

// Taxonomy code presets for therapy disciplines
const TAXONOMY_OPTIONS = [
  { value: '', label: 'Select or enter manually...' },
  { value: '235Z00000X', label: 'Speech-Language Pathologist (235Z00000X)' },
  { value: '225X00000X', label: 'Occupational Therapist (225X00000X)' },
  { value: '225100000X', label: 'Physical Therapist (225100000X)' },
];

const emptyPractice: Omit<Practice, 'id'> = {
  name: '',
  address: '',
  city: '',
  state: '',
  zip: '',
  phone: '',
  npi: '',
  tax_id: '',
  license_number: '',
  license_state: '',
  discipline: 'PT',
  taxonomy_code: '',
};

export default function SettingsPage() {
  const [formData, setFormData] = useState<Omit<Practice, 'id'>>(emptyPractice);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [dbPath, setDbPath] = useState<string>('');
  const [exporting, setExporting] = useState(false);
  const [dataPath, setDataPath] = useState<string>('');
  const [defaultPath, setDefaultPath] = useState<string>('');
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [defaultSessionLength, setDefaultSessionLength] = useState<number>(45);

  // Signature state
  const [signatureName, setSignatureName] = useState('');
  const [signatureCredentials, setSignatureCredentials] = useState('');
  const [signatureImage, setSignatureImage] = useState('');

  // Security state
  const [pinEnabled, setPinEnabled] = useState(false);
  const [showPinSetup, setShowPinSetup] = useState(false);
  const [showPinChange, setShowPinChange] = useState(false);
  const [showPinRemove, setShowPinRemove] = useState(false);
  const [currentPinInput, setCurrentPinInput] = useState('');
  const [newPinInput, setNewPinInput] = useState('');
  const [confirmPinInput, setConfirmPinInput] = useState('');
  const [pinError, setPinError] = useState('');
  const [autoTimeoutMinutes, setAutoTimeoutMinutes] = useState(0);

  // Documentation Bank tab state
  const [bankTab, setBankTab] = useState<'goals' | 'notes'>('goals');

  // App version
  const [appVersion, setAppVersion] = useState('');

  const loadLogoPreview = useCallback(async () => {
    try {
      const base64 = await window.api.logo.getBase64();
      setLogoBase64(base64);
    } catch (err) {
      console.error('Failed to load logo:', err);
    }
  }, []);

  useEffect(() => {
    loadPractice();
    window.api.backup.getDbPath().then(setDbPath).catch(console.error);
    window.api.storage.getDataPath().then(setDataPath).catch(console.error);
    window.api.storage.getDefaultPath().then(setDefaultPath).catch(console.error);
    loadLogoPreview();
    window.api.settings.get('default_session_length').then((val) => {
      if (val) setDefaultSessionLength(parseInt(val, 10));
    }).catch(console.error);
    window.api.settings.get('signature_name').then((val) => {
      if (val) setSignatureName(val);
    }).catch(console.error);
    window.api.settings.get('signature_credentials').then((val) => {
      if (val) setSignatureCredentials(val);
    }).catch(console.error);
    window.api.settings.get('signature_image').then((val) => {
      if (val) setSignatureImage(val);
    }).catch(console.error);
    window.api.security.isPinEnabled().then(setPinEnabled).catch(console.error);
    window.api.security.getTimeoutMinutes().then(setAutoTimeoutMinutes).catch(console.error);
    window.api.app.getVersion().then(setAppVersion).catch(console.error);
  }, [loadLogoPreview]);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const loadPractice = useCallback(async () => {
    try {
      setLoading(true);
      const practice = await window.api.practice.get();
      if (practice) {
        const { id, ...rest } = practice;
        setFormData(rest);
      }
    } catch (err) {
      console.error('Failed to load practice settings:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  const handleChange = (field: keyof Omit<Practice, 'id'>, value: string) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleSave = async () => {
    try {
      setSaving(true);
      await window.api.practice.save(formData);
      setToast('Practice settings saved successfully');
    } catch (err) {
      console.error('Failed to save practice settings:', err);
      setToast('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSessionLengthChange = async (value: number) => {
    setDefaultSessionLength(value);
    try {
      await window.api.settings.set('default_session_length', value.toString());
      setToast('Default session length updated');
    } catch (err) {
      console.error('Failed to save session length:', err);
    }
  };

  const handleSignatureNameChange = async (value: string) => {
    setSignatureName(value);
    try {
      await window.api.settings.set('signature_name', value);
    } catch (err) {
      console.error('Failed to save signature name:', err);
    }
  };

  const handleSignatureImageChange = async (value: string) => {
    setSignatureImage(value);
    try {
      await window.api.settings.set('signature_image', value);
    } catch (err) {
      console.error('Failed to save signature image:', err);
    }
  };

  const handleSignatureCredentialsChange = async (value: string) => {
    setSignatureCredentials(value);
    try {
      await window.api.settings.set('signature_credentials', value);
    } catch (err) {
      console.error('Failed to save signature credentials:', err);
    }
  };

  const notifySecurityChanged = () => {
    window.dispatchEvent(new CustomEvent('pocketchart:security-changed'));
  };

  const resetPinForms = () => {
    setShowPinSetup(false);
    setShowPinChange(false);
    setShowPinRemove(false);
    setCurrentPinInput('');
    setNewPinInput('');
    setConfirmPinInput('');
    setPinError('');
  };

  const handleSetPin = async () => {
    setPinError('');
    if (!/^\d{4}$/.test(newPinInput)) {
      setPinError('PIN must be exactly 4 digits');
      return;
    }
    if (newPinInput !== confirmPinInput) {
      setPinError('PINs do not match');
      return;
    }
    const result = await window.api.security.setPin(newPinInput);
    if (result.success) {
      setPinEnabled(true);
      resetPinForms();
      setToast('PIN has been set successfully');
      notifySecurityChanged();
    } else {
      setPinError(result.error || 'Failed to set PIN');
    }
  };

  const handleChangePin = async () => {
    setPinError('');
    if (!/^\d{4}$/.test(newPinInput)) {
      setPinError('New PIN must be exactly 4 digits');
      return;
    }
    if (newPinInput !== confirmPinInput) {
      setPinError('New PINs do not match');
      return;
    }
    const result = await window.api.security.setPin(newPinInput, currentPinInput);
    if (result.success) {
      resetPinForms();
      setToast('PIN has been changed successfully');
      notifySecurityChanged();
    } else {
      setPinError(result.error || 'Failed to change PIN');
    }
  };

  const handleRemovePin = async () => {
    setPinError('');
    const result = await window.api.security.removePin(currentPinInput);
    if (result.success) {
      setPinEnabled(false);
      setAutoTimeoutMinutes(0);
      await window.api.security.setTimeoutMinutes(0);
      resetPinForms();
      setToast('PIN has been removed');
      notifySecurityChanged();
    } else {
      setPinError(result.error || 'Failed to remove PIN');
    }
  };

  const handleTimeoutChange = async (minutes: number) => {
    setAutoTimeoutMinutes(minutes);
    await window.api.security.setTimeoutMinutes(minutes);
    setToast(minutes > 0 ? `Auto-lock set to ${minutes} minutes` : 'Auto-lock disabled');
    notifySecurityChanged();
  };

  const handleExportDb = async () => {
    try {
      setExporting(true);
      const savedPath = await window.api.backup.exportManual();
      if (savedPath) {
        setToast(`Database exported to: ${savedPath}`);
      }
    } catch (err) {
      console.error('Failed to export database:', err);
      setToast('Failed to export database. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleExportCsv = async () => {
    try {
      setExporting(true);
      const savedPath = await window.api.backup.exportCsv();
      if (savedPath) {
        setToast(`Clients exported to: ${savedPath}`);
      }
    } catch (err) {
      console.error('Failed to export CSV:', err);
      setToast('Failed to export CSV. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleExportAllCharts = async () => {
    try {
      setExporting(true);
      const result = await window.api.backup.exportAllChartsPdf();
      if (result) {
        setToast(`Exported ${result.clientCount} client charts to ZIP`);
      }
    } catch (err: any) {
      console.error('Failed to export charts:', err);
      setToast(err?.message === 'No clients to export' ? 'No clients to export.' : 'Failed to export charts. Please try again.');
    } finally {
      setExporting(false);
    }
  };

  const handleChangeDataPath = async () => {
    try {
      const newPath = await window.api.storage.setDataPath();
      if (newPath) {
        setDataPath(newPath);
        setToast('Data location changed. Please restart the app for changes to take effect.');
      }
    } catch (err) {
      console.error('Failed to change data path:', err);
      setToast('Failed to change data location. Please try again.');
    }
  };

  const handleResetDataPath = async () => {
    try {
      const defPath = await window.api.storage.resetDataPath();
      setDataPath(defPath);
      setToast('Data location reset to default. Please restart the app for changes to take effect.');
    } catch (err) {
      console.error('Failed to reset data path:', err);
      setToast('Failed to reset data location. Please try again.');
    }
  };

  const handleUploadLogo = async () => {
    try {
      const result = await window.api.logo.upload();
      if (result) {
        await loadLogoPreview();
        setToast('Practice logo uploaded successfully');
      }
    } catch (err) {
      console.error('Failed to upload logo:', err);
      setToast('Failed to upload logo. Please try again.');
    }
  };

  const handleRemoveLogo = async () => {
    try {
      await window.api.logo.remove();
      setLogoBase64(null);
      setToast('Practice logo removed');
    } catch (err) {
      console.error('Failed to remove logo:', err);
      setToast('Failed to remove logo. Please try again.');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-[var(--color-text-secondary)]">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-emerald-600 text-white px-4 py-3 rounded-lg shadow-lg animate-fade-in">
          <CheckCircle className="w-4 h-4" />
          <span className="text-sm font-medium">{toast}</span>
        </div>
      )}

      {/* Page Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <Settings className="w-7 h-7 text-[var(--color-primary)]" />
          <h1 className="page-title">Practice Settings</h1>
        </div>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {/* Security — open by default so users notice PIN setup */}
      <CollapsibleSection
        icon={<Shield className="w-5 h-5" />}
        title="Security"
        description={pinEnabled ? 'PIN enabled' : 'No PIN set — recommended'}
        defaultOpen
      >
        <div className="space-y-4">
          <div>
            <label className="label">PIN Lock</label>
            <p className="text-xs text-[var(--color-text-secondary)] mb-3">
              Protect your clinical data with a 4-digit PIN. The app will require the PIN on launch
              and after inactivity timeout.
            </p>

            {pinEnabled ? (
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-100 text-emerald-700">
                  <Lock className="w-3 h-3" />
                  PIN Enabled
                </span>
                <button
                  className="btn-secondary text-sm px-3 py-1.5"
                  onClick={() => { resetPinForms(); setShowPinChange(true); }}
                >
                  Change PIN
                </button>
                <button
                  className="text-sm px-3 py-1.5 rounded-lg text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                  onClick={() => { resetPinForms(); setShowPinRemove(true); }}
                >
                  Remove PIN
                </button>
              </div>
            ) : (
              <button
                className="btn-primary text-sm px-3 py-1.5 inline-flex items-center gap-1.5"
                onClick={() => { resetPinForms(); setShowPinSetup(true); }}
              >
                <Lock className="w-3.5 h-3.5" />
                Set Up PIN
              </button>
            )}
          </div>

          {/* PIN Setup Form */}
          {showPinSetup && !pinEnabled && (
            <div className="p-4 bg-gray-50 rounded-lg space-y-3">
              <div>
                <label className="label">New PIN</label>
                <input type="password" className="input" style={{ maxWidth: 200 }} maxLength={4} placeholder="4 digits" value={newPinInput} onChange={(e) => setNewPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))} />
              </div>
              <div>
                <label className="label">Confirm PIN</label>
                <input type="password" className="input" style={{ maxWidth: 200 }} maxLength={4} placeholder="Confirm 4 digits" value={confirmPinInput} onChange={(e) => setConfirmPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))} />
              </div>
              {pinError && <p className="text-xs text-red-500">{pinError}</p>}
              <div className="flex gap-2">
                <button className="btn-primary text-sm px-3 py-1.5" onClick={handleSetPin}>Save PIN</button>
                <button className="btn-ghost text-sm px-3 py-1.5" onClick={resetPinForms}>Cancel</button>
              </div>
            </div>
          )}

          {/* PIN Change Form */}
          {showPinChange && pinEnabled && (
            <div className="p-4 bg-gray-50 rounded-lg space-y-3">
              <div>
                <label className="label">Current PIN</label>
                <input type="password" className="input" style={{ maxWidth: 200 }} maxLength={4} placeholder="Current PIN" value={currentPinInput} onChange={(e) => setCurrentPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))} />
              </div>
              <div>
                <label className="label">New PIN</label>
                <input type="password" className="input" style={{ maxWidth: 200 }} maxLength={4} placeholder="New 4 digits" value={newPinInput} onChange={(e) => setNewPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))} />
              </div>
              <div>
                <label className="label">Confirm New PIN</label>
                <input type="password" className="input" style={{ maxWidth: 200 }} maxLength={4} placeholder="Confirm new PIN" value={confirmPinInput} onChange={(e) => setConfirmPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))} />
              </div>
              {pinError && <p className="text-xs text-red-500">{pinError}</p>}
              <div className="flex gap-2">
                <button className="btn-primary text-sm px-3 py-1.5" onClick={handleChangePin}>Update PIN</button>
                <button className="btn-ghost text-sm px-3 py-1.5" onClick={resetPinForms}>Cancel</button>
              </div>
            </div>
          )}

          {/* PIN Remove Form */}
          {showPinRemove && pinEnabled && (
            <div className="p-4 bg-gray-50 rounded-lg space-y-3">
              <div>
                <label className="label">Enter Current PIN to Remove</label>
                <input type="password" className="input" style={{ maxWidth: 200 }} maxLength={4} placeholder="Current PIN" value={currentPinInput} onChange={(e) => setCurrentPinInput(e.target.value.replace(/\D/g, '').slice(0, 4))} />
              </div>
              {pinError && <p className="text-xs text-red-500">{pinError}</p>}
              <div className="flex gap-2">
                <button className="text-sm px-3 py-1.5 rounded-lg bg-red-500 text-white hover:bg-red-600 transition-colors cursor-pointer" onClick={handleRemovePin}>Remove PIN</button>
                <button className="btn-ghost text-sm px-3 py-1.5" onClick={resetPinForms}>Cancel</button>
              </div>
            </div>
          )}

          {/* Auto-Timeout */}
          <div className="pt-4 border-t border-[var(--color-border)]">
            <label className="label">Auto-Lock Timeout</label>
            <select
              className="select"
              style={{ maxWidth: 250 }}
              value={autoTimeoutMinutes}
              onChange={(e) => handleTimeoutChange(parseInt(e.target.value, 10))}
              disabled={!pinEnabled}
            >
              <option value={0}>Disabled</option>
              <option value={5}>5 minutes</option>
              <option value={10}>10 minutes</option>
              <option value={15}>15 minutes</option>
              <option value={30}>30 minutes</option>
            </select>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1.5">
              {pinEnabled
                ? 'Lock the app after this period of inactivity.'
                : 'Set up a PIN first to enable auto-lock.'}
            </p>
          </div>
        </div>
      </CollapsibleSection>

      {/* Practice Information */}
      <CollapsibleSection
        icon={<Building2 className="w-5 h-5" />}
        title="Practice Information"
        description={formData.name || 'Not configured'}
        defaultOpen
      >
        {/* Practice Logo */}
        <div className="mb-6 pb-6 border-b border-[var(--color-border)]">
          <div className="flex items-center gap-2 mb-3">
            <Image className="w-4 h-4 text-[var(--color-text-secondary)]" />
            <h3 className="text-sm font-semibold text-[var(--color-text)]">Practice Logo</h3>
          </div>

          <div className="flex items-start gap-4">
            {logoBase64 ? (
              <div className="w-32 h-32 border border-[var(--color-border)] rounded-lg overflow-hidden bg-white flex items-center justify-center">
                <img src={logoBase64} alt="Practice logo" className="max-w-full max-h-full object-contain" />
              </div>
            ) : (
              <div className="w-32 h-32 border-2 border-dashed border-[var(--color-border)] rounded-lg flex items-center justify-center bg-gray-50">
                <Image className="w-8 h-8 text-gray-300" />
              </div>
            )}

            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <button className="btn-secondary btn-sm gap-2" onClick={handleUploadLogo}>
                  <Upload className="w-3.5 h-3.5" />
                  Upload Logo
                </button>
                {logoBase64 && (
                  <button className="btn-ghost btn-sm gap-2 text-red-600 hover:bg-red-50" onClick={handleRemoveLogo}>
                    <Trash2 className="w-3.5 h-3.5" />
                    Remove
                  </button>
                )}
              </div>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Your logo will appear on superbills and exported documents.
              </p>
              <p className="text-xs text-[var(--color-text-secondary)]">
                Supported formats: PNG, JPG. Recommended size: 300x100px.
              </p>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <label className="label">Practice Name</label>
            <input type="text" className="input" placeholder="Enter practice name" value={formData.name} onChange={(e) => handleChange('name', e.target.value)} />
          </div>
          <div className="md:col-span-2">
            <label className="label">Street Address</label>
            <input type="text" className="input" placeholder="123 Main Street, Suite 100" value={formData.address} onChange={(e) => handleChange('address', e.target.value)} />
          </div>
          <div>
            <label className="label">City</label>
            <input type="text" className="input" placeholder="City" value={formData.city} onChange={(e) => handleChange('city', e.target.value)} />
          </div>
          <div>
            <label className="label">State</label>
            <select className="select" value={formData.state} onChange={(e) => handleChange('state', e.target.value)}>
              {US_STATES.map((st) => (
                <option key={st.value} value={st.value}>{st.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="label">ZIP Code</label>
            <input type="text" className="input" placeholder="12345" maxLength={10} value={formData.zip} onChange={(e) => handleChange('zip', e.target.value)} />
          </div>
          <div>
            <label className="label">Phone</label>
            <input type="tel" className="input" placeholder="(555) 555-5555" value={formData.phone} onChange={(e) => handleChange('phone', e.target.value)} />
          </div>
        </div>
      </CollapsibleSection>

      {/* Provider Information */}
      <CollapsibleSection
        icon={<User className="w-5 h-5" />}
        title="Provider Information"
        description={formData.npi ? `NPI: ${formData.npi}` : 'NPI, Tax ID, License'}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">NPI Number</label>
            <input type="text" className="input" placeholder="10-digit NPI" value={formData.npi} onChange={(e) => handleChange('npi', e.target.value)} />
          </div>
          <div>
            <label className="label">Tax ID</label>
            <input type="text" className="input" placeholder="XX-XXXXXXX" value={formData.tax_id} onChange={(e) => handleChange('tax_id', e.target.value)} />
          </div>
          <div>
            <label className="label">License Number</label>
            <input type="text" className="input" placeholder="License number" value={formData.license_number} onChange={(e) => handleChange('license_number', e.target.value)} />
          </div>
          <div>
            <label className="label">License State</label>
            <input type="text" className="input" placeholder="e.g. CA, NY, TX" maxLength={2} value={formData.license_state} onChange={(e) => handleChange('license_state', e.target.value.toUpperCase())} />
          </div>
          <div className="md:col-span-2">
            <label className="label">Taxonomy Code</label>
            <div className="flex gap-2">
              <select
                className="select flex-1"
                value={TAXONOMY_OPTIONS.some(t => t.value === formData.taxonomy_code) ? formData.taxonomy_code : ''}
                onChange={(e) => handleChange('taxonomy_code', e.target.value)}
              >
                {TAXONOMY_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
              <input
                type="text"
                className="input w-40"
                placeholder="Or enter code"
                value={formData.taxonomy_code}
                onChange={(e) => handleChange('taxonomy_code', e.target.value)}
              />
            </div>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1">
              Required for electronic claims (837P). Select from common codes or enter manually.
            </p>
          </div>
        </div>
      </CollapsibleSection>

      {/* Discipline */}
      <CollapsibleSection
        icon={<Stethoscope className="w-5 h-5" />}
        title="Discipline"
        description={DISCIPLINES.find(d => d.value === formData.discipline)?.label || formData.discipline}
      >
        <div className="space-y-3">
          {DISCIPLINES.map((d) => (
            <label key={d.value} className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-gray-50 transition-colors">
              <input type="radio" name="discipline" value={d.value} checked={formData.discipline === d.value} onChange={() => handleChange('discipline', d.value)} className="w-4 h-4 text-[var(--color-primary)] accent-[var(--color-primary)]" />
              <span className="text-sm font-medium">{d.label}</span>
            </label>
          ))}
        </div>
      </CollapsibleSection>

      {/* Session Defaults */}
      <CollapsibleSection
        icon={<Clock className="w-5 h-5" />}
        title="Session Defaults"
        description={`${defaultSessionLength} min sessions`}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Default Session Length</label>
            <select className="select" value={defaultSessionLength} onChange={(e) => handleSessionLengthChange(parseInt(e.target.value, 10))}>
              <option value={30}>30 minutes</option>
              <option value={45}>45 minutes</option>
              <option value={50}>50 minutes</option>
              <option value={60}>60 minutes</option>
            </select>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1.5">
              This will be the default duration when creating new appointments.
            </p>
          </div>
        </div>
      </CollapsibleSection>

      {/* Signature */}
      <CollapsibleSection
        icon={<PenLine className="w-5 h-5" />}
        title="Signature"
        description={signatureName ? `${signatureName}${signatureCredentials ? `, ${signatureCredentials}` : ''}` : 'Not configured'}
      >
        <p className="text-xs text-[var(--color-text-secondary)] mb-4">
          This information will be used when you sign notes and evaluations.
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">Name</label>
            <input type="text" className="input" placeholder="e.g. Jane Smith" value={signatureName} onChange={(e) => handleSignatureNameChange(e.target.value)} />
          </div>
          <div>
            <label className="label">Credentials</label>
            <input type="text" className="input" placeholder="e.g. PT, DPT" value={signatureCredentials} onChange={(e) => handleSignatureCredentialsChange(e.target.value)} />
          </div>
        </div>
        {signatureName && (
          <div className="mt-4 p-3 bg-gray-50 rounded-lg">
            <p className="text-xs text-[var(--color-text-secondary)] mb-1">Preview</p>
            <p className="text-sm font-medium text-[var(--color-text)]">
              {signatureName}{signatureCredentials ? `, ${signatureCredentials}` : ''}
            </p>
          </div>
        )}

        <div className="mt-6">
          <label className="label">Drawn Signature</label>
          <p className="text-xs text-[var(--color-text-secondary)] mb-2">
            Draw your signature below. It will be pre-filled when signing notes and evaluations.
          </p>
          <SignaturePad value={signatureImage} onChange={handleSignatureImageChange} />
        </div>
      </CollapsibleSection>

      {/* Data Storage */}
      <CollapsibleSection
        icon={<HardDrive className="w-5 h-5" />}
        title="Data Storage"
        description="Storage location and privacy settings"
      >
        <div className="space-y-4">
          <div>
            <label className="label">Current Data Folder</label>
            <input type="text" className="input font-mono text-sm" value={dataPath} readOnly />
          </div>

          <div className="flex items-center gap-3">
            <button className="btn-primary gap-2" onClick={handleChangeDataPath}>
              <FolderOpen className="w-4 h-4" />
              Change Location
            </button>
            {dataPath !== defaultPath && (
              <button className="btn-secondary gap-2" onClick={handleResetDataPath}>
                <RotateCcw className="w-4 h-4" />
                Reset to Default
              </button>
            )}
          </div>

          <div className="p-3 bg-blue-50 rounded-lg">
            <p className="text-xs text-blue-700 font-medium mb-1">Cloud Sync Tip</p>
            <p className="text-xs text-blue-600">
              Choose a folder synced with Google Drive, OneDrive, or Dropbox to automatically
              back up your data to the cloud.
            </p>
          </div>

          <div className="p-3 bg-amber-50 rounded-lg">
            <p className="text-xs text-amber-700 font-medium mb-1">Important</p>
            <p className="text-xs text-amber-600">
              Changing the data location requires restarting PocketChart for changes to take full effect.
              Your existing data will be copied to the new location.
            </p>
          </div>

          <div className="p-3 bg-purple-50 rounded-lg">
            <div className="flex items-center gap-1.5 mb-2">
              <AlertTriangle className="w-3.5 h-3.5 text-purple-700" />
              <p className="text-xs text-purple-700 font-medium">Data Privacy Notice</p>
            </div>
            <ul className="text-xs text-purple-600 space-y-1 list-disc list-inside">
              <li>PocketChart stores all data locally on your computer. Your data is never sent to external servers by PocketChart.</li>
              <li>If you choose a cloud-synced folder (Google Drive, OneDrive, Dropbox), your clinical data will be synced to that provider's servers. Ensure this complies with your data privacy obligations (e.g., HIPAA).</li>
              <li>PocketChart is not a certified EHR and does not provide encryption at rest. Enable full-disk encryption (BitLocker / FileVault) on your device.</li>
              <li>Do not store data in shared or publicly accessible folders.</li>
              <li>You are responsible for maintaining regular backups of your data. PocketChart is provided as-is and is not liable for data loss.</li>
              <li>By using PocketChart, you accept responsibility for compliance with HIPAA, state regulations, and your organization's policies. See the Terms of Use accepted during setup.</li>
            </ul>
          </div>
        </div>
      </CollapsibleSection>

      {/* Documentation Bank */}
      <CollapsibleSection
        icon={<BookOpen className="w-5 h-5" />}
        title="Documentation Bank"
        description="Goal templates and note phrases"
      >
        <p className="text-xs text-[var(--color-text-secondary)] mb-4">
          Manage reusable goal templates and note phrases for faster documentation.
        </p>

        {/* Tab Buttons */}
        <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1 mb-4">
          <button
            onClick={() => setBankTab('goals')}
            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              bankTab === 'goals'
                ? 'bg-white text-[var(--color-primary)] shadow-sm'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
            }`}
          >
            Goal Templates
          </button>
          <button
            onClick={() => setBankTab('notes')}
            className={`flex-1 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
              bankTab === 'notes'
                ? 'bg-white text-[var(--color-primary)] shadow-sm'
                : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
            }`}
          >
            Note Phrases
          </button>
        </div>

        {/* Embedded Bank Content */}
        <div className="border border-[var(--color-border)] rounded-lg overflow-hidden">
          {bankTab === 'goals' ? (
            <GoalsBankPage embedded />
          ) : (
            <NoteBankPage embedded />
          )}
        </div>
      </CollapsibleSection>

      {/* Backup & Export */}
      <CollapsibleSection
        icon={<Database className="w-5 h-5" />}
        title="Backup & Export"
        description="Database backups, CSV and PDF exports"
      >
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <button className="btn-primary gap-2" onClick={handleExportDb} disabled={exporting}>
              <Download className="w-4 h-4" />
              {exporting ? 'Exporting...' : 'Export Database'}
            </button>
            <button className="btn-secondary gap-2" onClick={handleExportCsv} disabled={exporting}>
              <FileSpreadsheet className="w-4 h-4" />
              {exporting ? 'Exporting...' : 'Export All Clients (CSV)'}
            </button>
            <button className="btn-secondary gap-2" onClick={handleExportAllCharts} disabled={exporting}>
              <Download className="w-4 h-4" />
              {exporting ? 'Exporting...' : 'Export All Charts (ZIP)'}
            </button>
          </div>

          <div className="flex items-start gap-2 p-3 bg-gray-50 rounded-lg">
            <HardDrive className="w-4 h-4 text-[var(--color-text-secondary)] mt-0.5 shrink-0" />
            <div>
              <p className="text-xs text-[var(--color-text-secondary)]">Database Location</p>
              <p className="text-sm font-mono text-[var(--color-text)] break-all">{dbPath}</p>
            </div>
          </div>

          <div className="p-3 bg-blue-50 rounded-lg">
            <p className="text-xs text-blue-700 font-medium mb-1">Backup Recommendations</p>
            <ul className="text-xs text-blue-600 space-y-1 list-disc list-inside">
              <li>Export your database regularly (weekly or after major changes).</li>
              <li>Store backups on an external drive or cloud storage for safety.</li>
              <li>The CSV export is useful for importing client data into other systems.</li>
              <li>You can also manually copy the database file from the location shown above.</li>
            </ul>
          </div>
        </div>
      </CollapsibleSection>

      {/* About PocketChart */}
      <CollapsibleSection
        icon={<Info className="w-5 h-5" />}
        title="About PocketChart"
        description={appVersion ? `v${appVersion}` : ''}
      >
        <div className="space-y-2 text-sm text-[var(--color-text-secondary)]">
          <p>
            <span className="font-medium text-[var(--color-text)]">PocketChart</span> - Clinical
            Documentation Made Simple
          </p>
          <p>{appVersion ? `Version ${appVersion}` : ''}</p>
          <p>
            A lightweight, offline-first electronic health record system designed for solo and small
            therapy practices. Manage clients, write SOAP notes, track goals, and keep your practice
            organized.
          </p>
          <div className="pt-2 border-t border-[var(--color-border)] mt-3">
            <p className="text-xs">Built with Electron, React, and SQLite</p>
          </div>
        </div>
      </CollapsibleSection>
    </div>
  );
}
