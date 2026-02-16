import React, { useState, useEffect, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { Settings, Building2, User, Stethoscope, Info, Save, CheckCircle, Database, Download, FileSpreadsheet, HardDrive, FolderOpen, RotateCcw, Upload, Trash2, Image, Clock, AlertTriangle, Shield, Lock, PenLine, BookOpen, ChevronDown, ShieldCheck, Key, Monitor, Loader2, DollarSign, Plus, Eye, EyeOff, KeyRound, Printer, Sun, Moon, Palette, Type, Contrast } from 'lucide-react';
import type { Practice, Discipline, NoteFormat, CloudDetectionResult, AppTier, FeeScheduleEntry, DiscountTemplate, DiscountType } from '../../shared/types';
import FeeScheduleModal from '../components/FeeScheduleModal';
import { NOTE_FORMAT_LABELS, DISCIPLINE_DEFAULT_FORMAT } from '../../shared/types';
import SignaturePad from '../components/SignaturePad';
import GoalPatternSettingsPage from './GoalPatternSettingsPage';
import NoteBankPage from './NoteBankPage';
import BAAComplianceModal from '../components/BAAComplianceModal';
import RecoveryKeyCeremony from '../components/RecoveryKeyCeremony';
import RestoreConfirmationModal from '../components/RestoreConfirmationModal';
import ImportClientSelector from '../components/ImportClientSelector';
import { useSectionColor } from '../hooks/useSectionColor';
import { useTier } from '../hooks/useTier';
import { useAccessibilityPrefs } from '../hooks/useAccessibilityPrefs';
import type { FontSize, ThemeMode } from '../hooks/useAccessibilityPrefs';

// ── Collapsible Section Component ──
interface CollapsibleSectionProps {
  icon: React.ReactNode;
  title: string;
  description?: string;
  defaultOpen?: boolean;
  /** Controlled mode: externally managed open state */
  isOpen?: boolean;
  onToggle?: () => void;
  /** HTML id for scroll-to deep linking */
  sectionId?: string;
  children: React.ReactNode;
}

function CollapsibleSection({ icon, title, description, defaultOpen = false, isOpen: controlledOpen, onToggle, sectionId, children }: CollapsibleSectionProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const open = controlledOpen !== undefined ? controlledOpen : internalOpen;
  const handleToggle = onToggle || (() => setInternalOpen((v) => !v));

  return (
    <div className="card mb-4 overflow-hidden" id={sectionId}>
      <button
        type="button"
        className="w-full flex items-center gap-3 px-6 py-4 text-left hover:bg-gray-50/50 transition-colors cursor-pointer"
        onClick={handleToggle}
      >
        <div className="text-[var(--color-primary)]">{icon}</div>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold text-[var(--color-text)]">{title}</h2>
          {description && !open && (
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5 truncate">{description}</p>
          )}
        </div>
        <ChevronDown
          className={`w-4 h-4 text-[var(--color-text-secondary)] transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open && (
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
  { value: 'MFT', label: 'Marriage & Family Therapy (MFT)' },
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
  { value: '101YM0800X', label: 'Marriage & Family Therapist (101YM0800X)' },
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
  const sectionColor = useSectionColor();
  const { fontSize, setFontSize, themeMode, setThemeMode, highContrast, setHighContrast, reduceMotion, setReduceMotion } = useAccessibilityPrefs();
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
  const [noteFormat, setNoteFormat] = useState<NoteFormat>('SOAP');

  // Billing & Fees state
  const [feeSchedule, setFeeSchedule] = useState<FeeScheduleEntry[]>([]);
  const [showFeeModal, setShowFeeModal] = useState(false);
  const [editingFee, setEditingFee] = useState<FeeScheduleEntry | null>(null);
  const [lateCancelFee, setLateCancelFee] = useState('');
  const [noShowFee, setNoShowFee] = useState('');
  const [promptPayDiscount, setPromptPayDiscount] = useState('');
  const [feeSaving, setFeeSaving] = useState(false);

  // Discount templates state
  const [discountTemplates, setDiscountTemplates] = useState<DiscountTemplate[]>([]);
  const [showTemplateForm, setShowTemplateForm] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateType, setTemplateType] = useState<DiscountType>('package');
  const [templatePaid, setTemplatePaid] = useState(10);
  const [templateFree, setTemplateFree] = useState(2);
  const [templateRate, setTemplateRate] = useState(0);
  const [templateFlatRate, setTemplateFlatRate] = useState(0);
  const [templateFlatSessions, setTemplateFlatSessions] = useState(10);
  const [templatePercent, setTemplatePercent] = useState(10);
  const [templateFixed, setTemplateFixed] = useState(0);

  // CMS-1500 Paper Claims state
  const [cms1500PrintMode, setCms1500PrintMode] = useState<'full' | 'data-only'>('full');
  const [cms1500OffsetX, setCms1500OffsetX] = useState('0');
  const [cms1500OffsetY, setCms1500OffsetY] = useState('0');
  const [cms1500Saving, setCms1500Saving] = useState(false);
  const [cms1500TestPrinting, setCms1500TestPrinting] = useState(false);

  // SRFax state
  const [srfaxAccessId, setSrfaxAccessId] = useState('');
  const [srfaxAccessPwd, setSrfaxAccessPwd] = useState('');
  const [srfaxCallerId, setSrfaxCallerId] = useState('');
  const [srfaxMaskedId, setSrfaxMaskedId] = useState<string | null>(null);
  const [srfaxSaving, setSrfaxSaving] = useState(false);
  const [srfaxTesting, setSrfaxTesting] = useState(false);
  const [srfaxConfigured, setSrfaxConfigured] = useState(false);

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

  // Encryption state
  const [showChangePassphrase, setShowChangePassphrase] = useState(false);
  const [encCurrentPass, setEncCurrentPass] = useState('');
  const [encNewPass, setEncNewPass] = useState('');
  const [encConfirmPass, setEncConfirmPass] = useState('');
  const [encShowPass, setEncShowPass] = useState(false);
  const [encError, setEncError] = useState('');
  const [encLoading, setEncLoading] = useState(false);
  const [showRegenRecovery, setShowRegenRecovery] = useState(false);
  const [regenPassphrase, setRegenPassphrase] = useState('');
  const [regenShowPass, setRegenShowPass] = useState(false);
  const [regenError, setRegenError] = useState('');
  const [regenLoading, setRegenLoading] = useState(false);
  const [regenRecoveryKey, setRegenRecoveryKey] = useState('');
  const [showRecoveryCeremony, setShowRecoveryCeremony] = useState(false);

  // Restore state
  const [restoreFilePath, setRestoreFilePath] = useState('');
  const [restorePassphrase, setRestorePassphrase] = useState('');
  const [restoreShowPass, setRestoreShowPass] = useState(false);
  const [restoreSummary, setRestoreSummary] = useState<any>(null);
  const [restoreError, setRestoreError] = useState('');
  const [restoreLoading, setRestoreLoading] = useState(false);
  const [showRestoreConfirm, setShowRestoreConfirm] = useState(false);
  const [restoreExecuting, setRestoreExecuting] = useState(false);
  const [restoreStep, setRestoreStep] = useState<'idle' | 'passphrase' | 'confirm'>('idle');

  // Import state
  const [showImportSelector, setShowImportSelector] = useState(false);

  // Accordion state — only one section open at a time
  const settingsLocation = useLocation();
  const [openSectionId, setOpenSectionId] = useState<string | null>(() => {
    const params = new URLSearchParams(settingsLocation.search);
    return params.get('section') || null;
  });
  const toggleSection = useCallback((id: string) => {
    setOpenSectionId((prev) => (prev === id ? null : id));
  }, []);

  // Deep link: scroll to section on URL param
  useEffect(() => {
    if (openSectionId) {
      setTimeout(() => {
        document.getElementById(`settings-${openSectionId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    }
  }, []);

  // Documentation Bank tab state
  const [bankTab, setBankTab] = useState<'goals' | 'notes'>('goals');

  // App version
  const [appVersion, setAppVersion] = useState('');

  // BAA Compliance Modal state
  const [baaModalOpen, setBaaModalOpen] = useState(false);
  const [pendingDataPath, setPendingDataPath] = useState<string | null>(null);
  const [baaModalProps, setBaaModalProps] = useState<{
    providerDisplayName: string;
    baaUrl: string | null;
    baaAvailable: boolean;
  } | null>(null);

  // Cloud backup warning for export
  const [cloudExportWarning, setCloudExportWarning] = useState<string | null>(null);

  // License & Activation state
  const { tier, licenseStatus, trialActive, trialExpired, trialDaysRemaining, refresh: refreshTier } = useTier();
  const [activationUsage, setActivationUsage] = useState<number | null>(null);
  const [activationLimit, setActivationLimit] = useState<number>(2);
  const [activationLoading, setActivationLoading] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [confirmDeactivate, setConfirmDeactivate] = useState(false);
  const [licenseKeyInput, setLicenseKeyInput] = useState('');
  const [licenseActivating, setLicenseActivating] = useState(false);
  const [licenseError, setLicenseError] = useState('');
  const [licenseSuccess, setLicenseSuccess] = useState('');

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
    window.api.settings.get('note_format').then((val) => {
      if (val) setNoteFormat(val as NoteFormat);
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
    // Load billing & fees
    window.api.feeSchedule.list().then(setFeeSchedule).catch(console.error);
    window.api.settings.get('late_cancel_fee').then((val) => { if (val) setLateCancelFee(val); }).catch(console.error);
    window.api.settings.get('no_show_fee').then((val) => { if (val) setNoShowFee(val); }).catch(console.error);
    window.api.settings.get('prompt_pay_discount').then((val) => { if (val) setPromptPayDiscount(val); }).catch(console.error);
    window.api.discountTemplates.list().then(setDiscountTemplates).catch(console.error);
    // Load CMS-1500 settings
    window.api.settings.get('cms1500_print_mode').then((val) => { if (val === 'full' || val === 'data-only') setCms1500PrintMode(val); }).catch(console.error);
    window.api.settings.get('cms1500_offset_x').then((val) => { if (val) setCms1500OffsetX(val); }).catch(console.error);
    window.api.settings.get('cms1500_offset_y').then((val) => { if (val) setCms1500OffsetY(val); }).catch(console.error);
    // Load activation info
    loadActivationInfo();
  }, [loadLogoPreview]);

  const loadActivationInfo = async () => {
    setActivationLoading(true);
    try {
      const info = await window.api.license.getActivationInfo();
      setActivationUsage(info.activationUsage);
      setActivationLimit(info.activationLimit);
    } catch {
      setActivationUsage(null);
    } finally {
      setActivationLoading(false);
    }
  };

  const handleLicenseActivate = async () => {
    const key = licenseKeyInput.trim();
    if (!key) { setLicenseError('Please enter a license key.'); return; }
    setLicenseActivating(true);
    setLicenseError('');
    setLicenseSuccess('');
    try {
      const result = await window.api.license.activate(key);
      if (result.success) {
        setLicenseSuccess('License activated successfully!');
        setLicenseKeyInput('');
        refreshTier();
        loadActivationInfo();
        window.dispatchEvent(new CustomEvent('pocketchart:tier-changed'));
      } else {
        setLicenseError(result.error || 'Activation failed.');
      }
    } catch (err: any) {
      setLicenseError(err?.message || 'Activation failed.');
    } finally {
      setLicenseActivating(false);
    }
  };

  const handleDeactivateDevice = async () => {
    setDeactivating(true);
    try {
      await window.api.license.deactivate();
      setConfirmDeactivate(false);
      setLicenseSuccess('');
      setLicenseError('');
      refreshTier();
      loadActivationInfo();
      window.dispatchEvent(new CustomEvent('pocketchart:tier-changed'));
      setToast('License deactivated from this device.');
    } catch (err: any) {
      setLicenseError(err?.message || 'Deactivation failed.');
    } finally {
      setDeactivating(false);
    }
  };

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  // Load SRFax config status
  useEffect(() => {
    window.api.secureStorage.exists('srfax_access_id').then((exists: boolean) => {
      setSrfaxConfigured(exists);
      if (exists) {
        window.api.secureStorage.getMasked('srfax_access_id').then((masked: string | null) => setSrfaxMaskedId(masked));
      }
    });
  }, []);

  const loadPractice = useCallback(async () => {
    try {
      setLoading(true);
      const practice = await window.api.practice.get();
      if (practice) {
        const { id, ...rest } = practice;
        // If discipline is empty, fall back to the settings value
        if (!rest.discipline) {
          const savedDiscipline = await window.api.settings.get('provider_discipline');
          if (savedDiscipline) rest.discipline = savedDiscipline as typeof rest.discipline;
        }
        setFormData(rest);
      } else {
        // No practice record yet — check if discipline was set during onboarding
        const savedDiscipline = await window.api.settings.get('provider_discipline');
        if (savedDiscipline) {
          setFormData(prev => ({ ...prev, discipline: savedDiscipline as typeof prev.discipline }));
        }
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
    // Validate required fields
    if (!formData.license_number?.trim()) {
      setToast('License number is required. Please fill it in under Provider Information.');
      return;
    }
    try {
      setSaving(true);
      await window.api.practice.save(formData);
      // Also persist signature settings on explicit save to ensure nothing is lost
      await Promise.all([
        window.api.settings.set('signature_name', signatureName),
        window.api.settings.set('signature_credentials', signatureCredentials),
        window.api.settings.set('signature_image', signatureImage),
      ]);
      setToast('Practice settings saved successfully');
    } catch (err) {
      console.error('Failed to save practice settings:', err);
      setToast('Failed to save settings. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleNoteFormatChange = async (format: NoteFormat) => {
    setNoteFormat(format);
    try {
      await window.api.settings.set('note_format', format);
      await window.api.settings.set('note_format_explicit', 'true');
      setToast('Note format updated');
    } catch (err) {
      console.error('Failed to save note format:', err);
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

  // Encryption handlers
  const resetEncForms = () => {
    setShowChangePassphrase(false);
    setEncCurrentPass('');
    setEncNewPass('');
    setEncConfirmPass('');
    setEncShowPass(false);
    setEncError('');
    setEncLoading(false);
    setShowRegenRecovery(false);
    setRegenPassphrase('');
    setRegenShowPass(false);
    setRegenError('');
    setRegenLoading(false);
  };

  const handleChangePassphrase = async () => {
    setEncError('');
    if (encNewPass.length < 8) {
      setEncError('New passphrase must be at least 8 characters');
      return;
    }
    if (encNewPass !== encConfirmPass) {
      setEncError('New passphrases do not match');
      return;
    }
    setEncLoading(true);
    try {
      const result = await window.api.encryption.changePassphrase(encCurrentPass, encNewPass);
      if (result.success) {
        resetEncForms();
        setToast('Encryption passphrase changed successfully');
      } else {
        setEncError(result.error || 'Failed to change passphrase');
      }
    } catch {
      setEncError('An error occurred while changing the passphrase');
    } finally {
      setEncLoading(false);
    }
  };

  const handleRegenerateRecoveryKey = async () => {
    setRegenError('');
    if (!regenPassphrase) {
      setRegenError('Please enter your current passphrase');
      return;
    }
    setRegenLoading(true);
    try {
      const result = await window.api.encryption.regenerateRecoveryKey(regenPassphrase);
      if (result.success && result.recoveryKey) {
        setRegenRecoveryKey(result.recoveryKey);
        setShowRecoveryCeremony(true);
        setShowRegenRecovery(false);
        setRegenPassphrase('');
      } else {
        setRegenError(result.error || 'Failed to generate new recovery key');
      }
    } catch {
      setRegenError('An error occurred');
    } finally {
      setRegenLoading(false);
    }
  };

  // ── Restore from Settings ──
  const handleRestoreFromSettings = async () => {
    const filePath = await window.api.restore.pickFile();
    if (!filePath) return;
    setRestoreFilePath(filePath);
    setRestorePassphrase('');
    setRestoreError('');
    setRestoreStep('passphrase');
  };

  const handleRestoreValidate = async () => {
    if (!restorePassphrase.trim()) {
      setRestoreError('Please enter the backup passphrase.');
      return;
    }
    setRestoreLoading(true);
    setRestoreError('');
    try {
      const result = await window.api.restore.validateAndSummarize(restoreFilePath, restorePassphrase);
      if (result.error) {
        setRestoreError(result.error);
      } else if (result.summary) {
        setRestoreSummary(result.summary);
        setRestoreStep('confirm');
        setShowRestoreConfirm(true);
      }
    } catch (err: any) {
      setRestoreError(err.message || 'Validation failed');
    } finally {
      setRestoreLoading(false);
    }
  };

  const handleRestoreExecute = async () => {
    setRestoreExecuting(true);
    try {
      const result = await window.api.restore.executeFromSettings(restoreFilePath, restorePassphrase);
      if (!result.success) {
        setRestoreError(result.error || 'Restore failed');
        setRestoreExecuting(false);
      }
      // If success, the app will restart automatically
    } catch (err: any) {
      setRestoreError(err.message || 'Restore failed');
      setRestoreExecuting(false);
    }
  };

  const handleRestoreCancel = () => {
    setRestoreStep('idle');
    setRestoreFilePath('');
    setRestorePassphrase('');
    setRestoreSummary(null);
    setRestoreError('');
    setShowRestoreConfirm(false);
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
      setCloudExportWarning(null);
      const savedPath = await window.api.backup.exportManual();
      if (savedPath) {
        // Check if the saved path is in a cloud-synced folder
        const cloudCheck = await window.api.storage.detectCloud(savedPath);
        if (cloudCheck.isCloudSynced) {
          setCloudExportWarning(
            `Your backup was saved to a ${cloudCheck.providerDisplayName}-synced folder. Make sure you have a BAA in place with ${cloudCheck.providerDisplayName} for HIPAA compliance.`
          );
        }
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
        setToast(`Exported ${result.documentCount} documents for ${result.clientCount} clients`);
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
      const result = await window.api.storage.setDataPath();
      if (!result) return;

      if (result.cloud.isCloudSynced) {
        // Cloud storage detected - show BAA compliance modal
        setPendingDataPath(result.newPath);
        setBaaModalProps({
          providerDisplayName: result.cloud.providerDisplayName!,
          baaUrl: result.cloud.baaUrl,
          baaAvailable: result.cloud.baaAvailable,
        });
        setBaaModalOpen(true);
      } else {
        // Regular local folder - proceed normally
        setDataPath(result.newPath);
        setToast('Data location changed. Please restart the app for changes to take effect.');
      }
    } catch (err) {
      console.error('Failed to change data path:', err);
      setToast('Failed to change data location. Please try again.');
    }
  };

  const handleBaaAccept = () => {
    // User acknowledged BAA requirements - complete the path change
    if (pendingDataPath) {
      setDataPath(pendingDataPath);
      setToast('Data location changed. Please restart the app for changes to take effect.');
    }
    setBaaModalOpen(false);
    setPendingDataPath(null);
    setBaaModalProps(null);
  };

  const handleBaaChooseDifferent = () => {
    // User wants to choose a different folder - close modal and re-trigger folder picker
    setBaaModalOpen(false);
    setPendingDataPath(null);
    setBaaModalProps(null);
    // Re-open folder picker
    handleChangeDataPath();
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
          <Settings className="w-7 h-7" style={{ color: sectionColor.color }} />
          <h1 className="page-title">Practice Settings</h1>
        </div>
        <button className="btn-primary" onClick={handleSave} disabled={saving}>
          <Save className="w-4 h-4 mr-2" />
          {saving ? 'Saving...' : 'Save Settings'}
        </button>
      </div>

      {/* ═══ PRACTICE & PROVIDER ═══ */}
      <div className="flex items-center gap-2 mt-2 mb-3">
        <Building2 className="w-4 h-4 text-[var(--color-text-tertiary)]" />
        <h2 className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">Practice & Provider</h2>
        <div className="flex-1 border-t border-[var(--color-border)]" />
      </div>

      <CollapsibleSection
        icon={<Building2 className="w-5 h-5" />}
        title="Practice Information"
        description={formData.name || 'Not configured'}
        sectionId="settings-practice-pin"
        isOpen={openSectionId === 'practice-pin'}
        onToggle={() => toggleSection('practice-pin')}
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
        sectionId="settings-practice-info"
        isOpen={openSectionId === 'practice-info'}
        onToggle={() => toggleSection('practice-info')}
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
        sectionId="settings-provider"
        isOpen={openSectionId === 'provider'}
        onToggle={() => toggleSection('provider')}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="label">NPI Number</label>
            <input type="text" className={`input ${formData.npi && !/^\d{10}$/.test(formData.npi) ? 'border-red-300' : ''}`} placeholder="10-digit NPI" maxLength={10} value={formData.npi} onChange={(e) => handleChange('npi', e.target.value.replace(/\D/g, '').slice(0, 10))} />
            {formData.npi && !/^\d{10}$/.test(formData.npi) && <p className="text-xs text-red-500 mt-1">NPI must be exactly 10 digits</p>}
          </div>
          <div>
            <label className="label">Tax ID</label>
            <input type="text" className="input" placeholder="XX-XXXXXXX" value={formData.tax_id} onChange={(e) => handleChange('tax_id', e.target.value)} />
          </div>
          <div>
            <label className="label">License Number <span className="text-red-500">*</span></label>
            <input type="text" className={`input ${!formData.license_number?.trim() ? 'border-red-300' : ''}`} placeholder="License number (required)" value={formData.license_number} onChange={(e) => handleChange('license_number', e.target.value)} />
            {!formData.license_number?.trim() && (
              <p className="text-xs text-red-500 mt-1">License number is required</p>
            )}
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
        sectionId="settings-discipline"
        isOpen={openSectionId === 'discipline'}
        onToggle={() => toggleSection('discipline')}
      >
        <div className="space-y-3">
          {DISCIPLINES.map((d) => (
            <label key={d.value} className="flex items-center gap-3 cursor-pointer p-2 rounded-lg hover:bg-gray-50 transition-colors">
              <input type="radio" name="discipline" value={d.value} checked={formData.discipline === d.value} onChange={async () => {
                const oldDiscipline = formData.discipline;
                handleChange('discipline', d.value);
                // Auto-set note format if not explicitly set
                const hasExplicit = await window.api.settings.get('note_format_explicit');
                if (!hasExplicit && d.value !== 'MULTI') {
                  const defaultFormat = DISCIPLINE_DEFAULT_FORMAT[d.value as Discipline];
                  setNoteFormat(defaultFormat);
                  await window.api.settings.set('note_format', defaultFormat);
                }
                // Reset fee schedule if discipline changed
                if (oldDiscipline !== d.value && d.value !== 'MULTI') {
                  const resetFees = window.confirm(
                    `Discipline changed to ${d.label}.\n\nWould you like to reset your fee schedule to the default CPT codes for ${d.value}?\n\n(This replaces all current fee schedule entries.)`
                  );
                  if (resetFees) {
                    try {
                      await window.api.feeSchedule.reset(d.value);
                      setToast(`Fee schedule reset to ${d.value} codes`);
                    } catch (err) {
                      console.error('Failed to reset fee schedule:', err);
                      setToast('Failed to reset fee schedule.');
                    }
                  }
                }
              }} className="w-4 h-4 text-[var(--color-primary)] accent-[var(--color-primary)]" />
              <span className="text-sm font-medium">{d.label}</span>
            </label>
          ))}
        </div>
      </CollapsibleSection>

      {/* Signature */}
      <CollapsibleSection
        icon={<PenLine className="w-5 h-5" />}
        title="Signature"
        description={signatureName ? `${signatureName}${signatureCredentials ? `, ${signatureCredentials}` : ''}` : 'Not configured'}
        sectionId="settings-signature"
        isOpen={openSectionId === 'signature'}
        onToggle={() => toggleSection('signature')}
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
          {signatureImage ? (
            <div>
              <p className="text-xs text-[var(--color-text-secondary)] mb-2">
                Your saved signature:
              </p>
              <div className="border-2 border-gray-200 rounded-lg overflow-hidden bg-white p-2">
                <img
                  src={signatureImage}
                  alt="Saved signature"
                  className="w-full max-h-[150px] object-contain"
                />
              </div>
              <div className="flex justify-end mt-1">
                <button
                  type="button"
                  className="btn-ghost btn-sm text-xs gap-1"
                  onClick={() => handleSignatureImageChange('')}
                >
                  <PenLine className="w-3 h-3" />
                  Redo Signature
                </button>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-xs text-[var(--color-text-secondary)] mb-2">
                Draw your signature below. It will be pre-filled when signing notes and evaluations.
              </p>
              <SignaturePad value={signatureImage} onChange={handleSignatureImageChange} />
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* ═══ CLINICAL ═══ */}
      <div className="flex items-center gap-2 mt-6 mb-3">
        <Stethoscope className="w-4 h-4 text-[var(--color-text-tertiary)]" />
        <h2 className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">Clinical</h2>
        <div className="flex-1 border-t border-[var(--color-border)]" />
      </div>

      {/* Note Format */}
      <CollapsibleSection
        icon={<FileSpreadsheet className="w-5 h-5" />}
        title="Note Format"
        description={NOTE_FORMAT_LABELS[noteFormat]}
        sectionId="settings-note-format"
        isOpen={openSectionId === 'note-format'}
        onToggle={() => toggleSection('note-format')}
      >
        <p className="text-xs text-[var(--color-text-secondary)] mb-4">
          Choose how progress notes are structured. All formats store data the same way —
          only the section labels change. Existing notes are not affected.
        </p>
        <div className="space-y-3">
          {(['SOAP', 'DAP', 'BIRP'] as NoteFormat[]).map((format) => (
            <label key={format} className="flex items-start gap-3 cursor-pointer p-3 rounded-lg hover:bg-gray-50 transition-colors">
              <input
                type="radio"
                name="noteFormat"
                value={format}
                checked={noteFormat === format}
                onChange={() => handleNoteFormatChange(format)}
                className="w-4 h-4 mt-0.5 text-[var(--color-primary)] accent-[var(--color-primary)]"
              />
              <div>
                <span className="text-sm font-medium">{format}</span>
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                  {format === 'SOAP' && 'Subjective, Objective, Assessment, Plan — standard for PT/OT/ST'}
                  {format === 'DAP' && 'Data, Assessment, Plan — common for mental health clinicians'}
                  {format === 'BIRP' && 'Behavior, Intervention, Response, Plan — behavioral health focus'}
                </p>
              </div>
            </label>
          ))}
        </div>
      </CollapsibleSection>

      {/* Session Defaults */}
      <CollapsibleSection
        icon={<Clock className="w-5 h-5" />}
        title="Session Defaults"
        description={`${defaultSessionLength} min sessions`}
        sectionId="settings-session-defaults"
        isOpen={openSectionId === 'session-defaults'}
        onToggle={() => toggleSection('session-defaults')}
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

      {/* Documentation Bank */}
      <CollapsibleSection
        icon={<BookOpen className="w-5 h-5" />}
        title="Documentation Bank"
        description="Goal templates and note phrases"
        sectionId="settings-doc-bank"
        isOpen={openSectionId === 'doc-bank'}
        onToggle={() => toggleSection('doc-bank')}
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
            Goal Patterns
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
            <GoalPatternSettingsPage embedded />
          ) : (
            <NoteBankPage embedded />
          )}
        </div>
      </CollapsibleSection>

      {/* ═══ BILLING ═══ */}
      <div className="flex items-center gap-2 mt-6 mb-3">
        <DollarSign className="w-4 h-4 text-[var(--color-text-tertiary)]" />
        <h2 className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">Billing</h2>
        <div className="flex-1 border-t border-[var(--color-border)]" />
      </div>

      {/* Billing & Fees */}
      <CollapsibleSection
        icon={<DollarSign className="w-5 h-5" />}
        title="Billing & Fees"
        description={`${feeSchedule.length} CPT codes configured`}
        sectionId="settings-billing-fees"
        isOpen={openSectionId === 'billing-fees'}
        onToggle={() => toggleSection('billing-fees')}
      >
        <div className="space-y-6">
          {/* Fee Schedule */}
          <div>
            <div className="flex items-center justify-between mb-3">
              <div>
                <h3 className="text-sm font-semibold text-[var(--color-text)]">Fee Schedule</h3>
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                  Standard fees for CPT codes — used when generating invoices.
                </p>
              </div>
              <button className="btn-primary btn-sm gap-1.5" onClick={() => { setEditingFee(null); setShowFeeModal(true); }}>
                <Plus className="w-3.5 h-3.5" /> Add Fee
              </button>
            </div>
            <div className="border border-[var(--color-border)] rounded-lg overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--color-border)] bg-gray-50">
                    <th className="text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider px-4 py-2.5">CPT Code</th>
                    <th className="text-left text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider px-4 py-2.5">Description</th>
                    <th className="text-center text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider px-4 py-2.5">Units</th>
                    <th className="text-right text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider px-4 py-2.5">Amount</th>
                    <th className="text-right text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider px-4 py-2.5 w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border)]">
                  {feeSchedule.map((fee) => (
                    <tr key={fee.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => { setEditingFee(fee); setShowFeeModal(true); }}>
                      <td className="px-4 py-2.5"><span className="font-mono font-medium text-sm text-[var(--color-text)]">{fee.cpt_code}</span></td>
                      <td className="px-4 py-2.5 text-sm text-[var(--color-text)]">{fee.description}</td>
                      <td className="px-4 py-2.5 text-center text-sm text-[var(--color-text-secondary)]">{fee.default_units}</td>
                      <td className="px-4 py-2.5 text-right text-sm font-medium text-[var(--color-text)]">${fee.amount.toFixed(2)}</td>
                      <td className="px-4 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        <button
                          className="p-1 rounded hover:bg-red-50 text-red-500"
                          onClick={async () => {
                            await window.api.feeSchedule.delete(fee.id);
                            setFeeSchedule(feeSchedule.filter(f => f.id !== fee.id));
                          }}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {feeSchedule.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-4 py-8 text-center text-sm text-[var(--color-text-secondary)]">
                        No fee schedule entries. Add your first CPT code fee.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Late Cancel, No-Show, Discount */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="label">Late Cancellation Fee ($)</label>
              <input
                type="number" min="0" step="0.01" className="input" placeholder="0.00"
                value={lateCancelFee}
                onChange={(e) => setLateCancelFee(e.target.value)}
              />
            </div>
            <div>
              <label className="label">No-Show Fee ($)</label>
              <input
                type="number" min="0" step="0.01" className="input" placeholder="0.00"
                value={noShowFee}
                onChange={(e) => setNoShowFee(e.target.value)}
              />
            </div>
            <div>
              <label className="label">Prompt-Pay Discount (%)</label>
              <input
                type="number" min="0" max="100" step="0.5" className="input" placeholder="0"
                value={promptPayDiscount}
                onChange={(e) => setPromptPayDiscount(e.target.value)}
              />
              <p className="text-xs text-[var(--color-text-secondary)] mt-1">Auto-fills on new invoices</p>
            </div>
          </div>
          <button
            className="btn-primary btn-sm"
            disabled={feeSaving}
            onClick={async () => {
              setFeeSaving(true);
              try {
                await window.api.settings.set('late_cancel_fee', lateCancelFee || '0');
                await window.api.settings.set('no_show_fee', noShowFee || '0');
                await window.api.settings.set('prompt_pay_discount', promptPayDiscount || '0');
                setToast('Fee settings saved');
              } catch { setToast('Failed to save fee settings'); }
              finally { setFeeSaving(false); }
            }}
          >
            {feeSaving ? 'Saving...' : 'Save Fee Settings'}
          </button>
        </div>
      </CollapsibleSection>

      {/* Discount Templates */}
      <CollapsibleSection
        icon={<DollarSign className="w-5 h-5" />}
        title="Discount Templates"
        description={`${discountTemplates.length} template${discountTemplates.length !== 1 ? 's' : ''}`}
        sectionId="settings-discount-templates"
        isOpen={openSectionId === 'discount-templates'}
        onToggle={() => toggleSection('discount-templates')}
      >
        <p className="text-xs text-[var(--color-text-secondary)] mb-4">
          Create reusable discount templates for quick assignment to clients.
        </p>

        {discountTemplates.length > 0 && (
          <div className="rounded-lg border border-[var(--color-border)] divide-y divide-[var(--color-border)] mb-4">
            {discountTemplates.map(t => (
              <div key={t.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-medium text-[var(--color-text)]">{t.name}</p>
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    {t.discount_type === 'package' && `${t.paid_sessions}+${(t.total_sessions || 0) - (t.paid_sessions || 0)} package at $${t.session_rate}/session`}
                    {t.discount_type === 'flat_rate' && `$${t.flat_rate}/session for ${t.flat_rate_sessions} sessions`}
                    {t.discount_type === 'persistent' && (t.discount_percent ? `${t.discount_percent}% off` : `$${t.discount_fixed} off`)}
                  </p>
                </div>
                <button
                  className="btn-ghost btn-sm text-red-500 hover:text-red-700"
                  onClick={async () => {
                    await window.api.discountTemplates.delete(t.id);
                    setDiscountTemplates(prev => prev.filter(d => d.id !== t.id));
                    setToast('Template deleted');
                  }}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}

        {showTemplateForm ? (
          <div className="space-y-3 p-4 bg-gray-50 rounded-lg">
            <div>
              <label className="label">Template Name</label>
              <input type="text" className="input" placeholder="e.g. 10+2 Package" value={templateName} onChange={e => setTemplateName(e.target.value)} />
            </div>
            <div>
              <label className="label">Type</label>
              <select className="select" value={templateType} onChange={e => setTemplateType(e.target.value as DiscountType)}>
                <option value="package">Session Package</option>
                <option value="flat_rate">Flat Rate</option>
                <option value="persistent">Ongoing Discount</option>
              </select>
            </div>
            {templateType === 'package' && (
              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className="label text-xs">Paid</label>
                  <input type="number" className="input" min={1} value={templatePaid} onChange={e => setTemplatePaid(parseInt(e.target.value) || 1)} />
                </div>
                <div>
                  <label className="label text-xs">Free</label>
                  <input type="number" className="input" min={0} value={templateFree} onChange={e => setTemplateFree(parseInt(e.target.value) || 0)} />
                </div>
                <div>
                  <label className="label text-xs">Rate</label>
                  <input type="number" className="input" min={0} step={0.01} value={templateRate} onChange={e => setTemplateRate(parseFloat(e.target.value) || 0)} />
                </div>
              </div>
            )}
            {templateType === 'flat_rate' && (
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="label text-xs">Rate/Session</label>
                  <input type="number" className="input" min={0} step={0.01} value={templateFlatRate} onChange={e => setTemplateFlatRate(parseFloat(e.target.value) || 0)} />
                </div>
                <div>
                  <label className="label text-xs">Sessions</label>
                  <input type="number" className="input" min={1} value={templateFlatSessions} onChange={e => setTemplateFlatSessions(parseInt(e.target.value) || 1)} />
                </div>
              </div>
            )}
            {templateType === 'persistent' && (
              <div>
                <label className="label text-xs">Discount %</label>
                <input type="number" className="input w-24" min={0} max={100} step={0.5} value={templatePercent} onChange={e => setTemplatePercent(parseFloat(e.target.value) || 0)} />
              </div>
            )}
            <div className="flex gap-2">
              <button
                className="btn-primary btn-sm"
                disabled={!templateName.trim()}
                onClick={async () => {
                  const data: Partial<DiscountTemplate> = {
                    name: templateName,
                    discount_type: templateType,
                  };
                  if (templateType === 'package') {
                    data.total_sessions = templatePaid + templateFree;
                    data.paid_sessions = templatePaid;
                    data.session_rate = templateRate;
                  } else if (templateType === 'flat_rate') {
                    data.flat_rate = templateFlatRate;
                    data.flat_rate_sessions = templateFlatSessions;
                  } else {
                    data.discount_percent = templatePercent;
                  }
                  const result = await window.api.discountTemplates.create(data);
                  setDiscountTemplates(prev => [...prev, result]);
                  setShowTemplateForm(false);
                  setTemplateName('');
                  setToast('Template created');
                }}
              >
                Save Template
              </button>
              <button className="btn-ghost btn-sm" onClick={() => setShowTemplateForm(false)}>Cancel</button>
            </div>
          </div>
        ) : (
          <button className="btn-secondary btn-sm gap-1" onClick={() => setShowTemplateForm(true)}>
            <Plus className="w-3.5 h-3.5" /> New Template
          </button>
        )}
      </CollapsibleSection>

      {/* CMS-1500 Paper Claims */}
      <CollapsibleSection
        icon={<Printer className="w-5 h-5" />}
        title="CMS-1500 Paper Claims"
        description={cms1500PrintMode === 'data-only' ? 'Data-only mode' : 'Full form mode'}
        sectionId="settings-cms1500"
        isOpen={openSectionId === 'cms1500'}
        onToggle={() => toggleSection('cms1500')}
      >
        <div className="space-y-6">
          {/* Default Print Format */}
          <div>
            <label className="label">Default Print Format</label>
            <p className="text-xs text-[var(--color-text-secondary)] mb-3">
              Choose the default format when generating CMS-1500 claim forms. You can override this per-batch on the Claim Preview tab.
            </p>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="cms1500PrintMode"
                  value="full"
                  checked={cms1500PrintMode === 'full'}
                  onChange={() => setCms1500PrintMode('full')}
                  className="accent-[var(--color-primary)]"
                />
                <span className="text-sm text-[var(--color-text)]">Full Form</span>
                <span className="text-xs text-[var(--color-text-secondary)]">— prints the complete red-ink CMS-1500</span>
              </label>
            </div>
            <div className="flex items-center gap-4 mt-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="radio"
                  name="cms1500PrintMode"
                  value="data-only"
                  checked={cms1500PrintMode === 'data-only'}
                  onChange={() => setCms1500PrintMode('data-only')}
                  className="accent-[var(--color-primary)]"
                />
                <span className="text-sm text-[var(--color-text)]">Data Only</span>
                <span className="text-xs text-[var(--color-text-secondary)]">— just the data, for pre-printed red CMS-1500 paper</span>
              </label>
            </div>
          </div>

          {/* Printer Alignment Offsets */}
          <div>
            <label className="label">Printer Alignment Offsets</label>
            <p className="text-xs text-[var(--color-text-secondary)] mb-3">
              Fine-tune data placement for data-only mode. Positive values shift right/down, negative shift left/up. Units are PDF points (72 = 1 inch).
            </p>
            <div className="grid grid-cols-2 gap-4 max-w-xs">
              <div>
                <label className="text-xs font-medium text-[var(--color-text-secondary)]">Horizontal (pts)</label>
                <input
                  type="number"
                  className="input mt-1"
                  min={-72}
                  max={72}
                  step={1}
                  value={cms1500OffsetX}
                  onChange={(e) => setCms1500OffsetX(e.target.value)}
                />
              </div>
              <div>
                <label className="text-xs font-medium text-[var(--color-text-secondary)]">Vertical (pts)</label>
                <input
                  type="number"
                  className="input mt-1"
                  min={-72}
                  max={72}
                  step={1}
                  value={cms1500OffsetY}
                  onChange={(e) => setCms1500OffsetY(e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            <button
              className="btn-primary btn-sm"
              disabled={cms1500Saving}
              onClick={async () => {
                setCms1500Saving(true);
                try {
                  await window.api.settings.set('cms1500_print_mode', cms1500PrintMode);
                  await window.api.settings.set('cms1500_offset_x', cms1500OffsetX || '0');
                  await window.api.settings.set('cms1500_offset_y', cms1500OffsetY || '0');
                  setToast('CMS-1500 settings saved');
                } catch { setToast('Failed to save CMS-1500 settings'); }
                finally { setCms1500Saving(false); }
              }}
            >
              {cms1500Saving ? 'Saving...' : 'Save Settings'}
            </button>
            <button
              className="btn-secondary btn-sm gap-1.5"
              disabled={cms1500TestPrinting}
              onClick={async () => {
                setCms1500TestPrinting(true);
                try {
                  // Save current offsets first
                  await window.api.settings.set('cms1500_offset_x', cms1500OffsetX || '0');
                  await window.api.settings.set('cms1500_offset_y', cms1500OffsetY || '0');
                  const result = await window.api.cms1500.generateAlignmentTest();
                  await window.api.cms1500.save(result);
                  setToast('Alignment test page saved');
                } catch (err: any) {
                  setToast(err.message || 'Failed to generate alignment test');
                } finally {
                  setCms1500TestPrinting(false);
                }
              }}
            >
              <Printer className="w-3.5 h-3.5" />
              {cms1500TestPrinting ? 'Generating...' : 'Print Alignment Test Page'}
            </button>
          </div>
        </div>
      </CollapsibleSection>

      {/* ═══ SECURITY & DATA ═══ */}
      <div className="flex items-center gap-2 mt-6 mb-3">
        <Shield className="w-4 h-4 text-[var(--color-text-tertiary)]" />
        <h2 className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">Security & Data</h2>
        <div className="flex-1 border-t border-[var(--color-border)]" />
      </div>

      {/* Security */}
      <CollapsibleSection
        icon={<Shield className="w-5 h-5" />}
        title="Security"
        description={pinEnabled ? 'PIN enabled' : 'No PIN set — recommended'}
        sectionId="settings-security"
        isOpen={openSectionId === 'security'}
        onToggle={() => toggleSection('security')}
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

          {/* ── Encryption Controls — Hidden for V2 launch ── */}
          {/* Encryption UI will be re-enabled in a future release */}
        </div>
      </CollapsibleSection>

      {/* Data Storage */}
      <CollapsibleSection
        icon={<HardDrive className="w-5 h-5" />}
        title="Data Storage"
        description="Storage location and privacy settings"
        sectionId="settings-data-storage"
        isOpen={openSectionId === 'data-storage'}
        onToggle={() => toggleSection('data-storage')}
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
            <div className="flex items-start gap-2 mb-1">
              <ShieldCheck className="w-4 h-4 text-blue-600 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-blue-700 font-medium">Data Storage</p>
            </div>
            <p className="text-xs text-blue-600">
              PocketChart stores all data locally on your computer. If you choose to place your
              data folder inside a cloud-synced location (such as Google Drive, OneDrive, or
              Dropbox), your clinical data will be transmitted to that provider's servers. You
              are solely responsible for ensuring HIPAA compliance with any cloud provider,
              including having a signed Business Associate Agreement (BAA) and using a
              business-tier account. PocketChart can detect cloud-synced folders and will
              provide guidance, but cannot verify your compliance status.
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

      {/* Backup & Export */}
      <CollapsibleSection
        icon={<Database className="w-5 h-5" />}
        title="Backup & Export"
        description="Database backups, CSV and PDF exports"
        sectionId="settings-backup-export"
        isOpen={openSectionId === 'backup-export'}
        onToggle={() => toggleSection('backup-export')}
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
              {exporting ? 'Exporting...' : 'Export All Charts (PDFs)'}
            </button>
          </div>

          {/* Cloud Export Warning */}
          {cloudExportWarning && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
              <ShieldCheck className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-xs text-amber-700">{cloudExportWarning}</p>
                <button
                  className="text-xs text-amber-800 underline mt-1 hover:text-amber-900"
                  onClick={() => setCloudExportWarning(null)}
                >
                  Dismiss
                </button>
              </div>
            </div>
          )}

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
            </ul>
          </div>

          {/* ── Restore Section ── */}
          <div className="border-t border-[var(--color-border)] pt-4 mt-4">
            <h4 className="text-sm font-semibold text-[var(--color-text)] mb-3">Restore & Import</h4>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                className="btn-secondary gap-2"
                onClick={handleRestoreFromSettings}
                disabled={restoreLoading || restoreExecuting}
              >
                <RotateCcw className="w-4 h-4" />
                Restore Database from Backup
              </button>
              <button
                className="btn-secondary gap-2"
                onClick={() => setShowImportSelector(true)}
              >
                <Upload className="w-4 h-4" />
                Import Clients from Backup
              </button>
            </div>
            <p className="text-xs text-[var(--color-text-secondary)] mt-2">
              <strong>Restore</strong> replaces your entire database. <strong>Import</strong> adds specific clients from a backup into your current database.
            </p>

            {/* Restore passphrase input (inline) */}
            {restoreStep === 'passphrase' && (
              <div className="mt-3 p-4 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg">
                <p className="text-sm font-medium text-[var(--color-text)] mb-2">
                  Enter the passphrase for: <span className="font-mono text-xs">{restoreFilePath.split(/[/\\]/).pop()}</span>
                </p>
                {restoreError && (
                  <div className="flex items-center gap-2 p-2 bg-red-50 rounded-lg mb-3">
                    <AlertTriangle className="w-4 h-4 text-red-500 shrink-0" />
                    <p className="text-xs text-red-700">{restoreError}</p>
                  </div>
                )}
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <input
                      type={restoreShowPass ? 'text' : 'password'}
                      value={restorePassphrase}
                      onChange={e => setRestorePassphrase(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleRestoreValidate()}
                      className="w-full px-3 py-2 rounded-lg border border-[var(--color-border)] bg-white text-sm pr-10"
                      placeholder="Backup passphrase"
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={() => setRestoreShowPass(!restoreShowPass)}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]"
                    >
                      {restoreShowPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                  <button
                    className="btn-primary gap-1 py-2 text-sm"
                    onClick={handleRestoreValidate}
                    disabled={restoreLoading || !restorePassphrase.trim()}
                  >
                    {restoreLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                    Validate
                  </button>
                  <button
                    className="btn-secondary py-2 text-sm"
                    onClick={handleRestoreCancel}
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </CollapsibleSection>

      {/* Restore Confirmation Modal */}
      {showRestoreConfirm && restoreSummary && (
        <RestoreConfirmationModal
          backupSummary={restoreSummary}
          onConfirm={handleRestoreExecute}
          onCancel={handleRestoreCancel}
          executing={restoreExecuting}
        />
      )}

      {/* Import Client Selector Modal */}
      {showImportSelector && (
        <ImportClientSelector
          onClose={() => setShowImportSelector(false)}
          onImportComplete={(result) => {
            if (result.success) {
              setToast(`Successfully imported ${result.clients} client${result.clients !== 1 ? 's' : ''} with ${result.notes} notes`);
            }
          }}
        />
      )}

      {/* ═══ ACCOUNT ═══ */}
      <div className="flex items-center gap-2 mt-6 mb-3">
        <Key className="w-4 h-4 text-[var(--color-text-tertiary)]" />
        <h2 className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">Account</h2>
        <div className="flex-1 border-t border-[var(--color-border)]" />
      </div>

      {/* License & Activation */}
      <CollapsibleSection
        icon={<Key className="w-5 h-5" />}
        title="License & Activation"
        description={
          trialActive ? `Free trial — ${trialDaysRemaining} day${trialDaysRemaining === 1 ? '' : 's'} remaining`
          : trialExpired ? 'Trial expired'
          : tier === 'unlicensed' ? 'No active license'
          : `${tier.charAt(0).toUpperCase() + tier.slice(1)} plan active`
        }
        sectionId="settings-license"
        isOpen={openSectionId === 'license'}
        onToggle={() => toggleSection('license')}
      >
        <div className="space-y-4">
          {/* Licensed state — has a real license key */}
          {tier !== 'unlicensed' && !trialActive ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-4 h-4 text-green-500" />
                <span className="text-sm font-medium text-[var(--color-text)]">
                  PocketChart {tier === 'pro' ? 'Pro' : 'Basic'} — Active
                </span>
              </div>

              {licenseStatus?.licenseKey && (
                <p className="text-xs text-[var(--color-text-secondary)]">
                  License: {licenseStatus.licenseKey.slice(0, 8)}...{licenseStatus.licenseKey.slice(-4)}
                </p>
              )}

              {/* Activation count */}
              <div className="flex items-center gap-2 text-xs text-[var(--color-text-secondary)]">
                <Monitor className="w-3.5 h-3.5" />
                {activationLoading ? (
                  <span>Checking device count...</span>
                ) : activationUsage !== null ? (
                  <span>Activated on {activationUsage} of {activationLimit} devices</span>
                ) : (
                  <span className="text-amber-600">Activation info unavailable — check internet connection</span>
                )}
              </div>

              {licenseStatus?.subscriptionStatus && (
                <p className="text-xs text-[var(--color-text-secondary)]">
                  Subscription: {licenseStatus.subscriptionStatus === 'active' ? (
                    <span className="text-green-600 font-medium">Active</span>
                  ) : licenseStatus.subscriptionStatus === 'expired' ? (
                    <span className="text-amber-600 font-medium">Expired</span>
                  ) : (
                    <span className="text-red-600 font-medium">Cancelled</span>
                  )}
                  {licenseStatus.subscriptionExpiresAt && (
                    <> — Renews {new Date(licenseStatus.subscriptionExpiresAt).toLocaleDateString()}</>
                  )}
                </p>
              )}

              {/* Deactivate this device */}
              {!confirmDeactivate ? (
                <button
                  className="text-xs text-red-600 hover:text-red-700 hover:underline mt-2"
                  onClick={() => setConfirmDeactivate(true)}
                >
                  Deactivate This Device
                </button>
              ) : (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg space-y-3 mt-2">
                  <p className="text-sm font-medium text-red-800">Deactivate this device?</p>
                  <p className="text-xs text-red-700">
                    This will remove your PocketChart license from this computer and free up
                    an activation slot. Your data will remain on this device, but you'll need
                    to re-enter your license key to unlock features again.
                  </p>
                  <div className="flex items-center gap-2">
                    <button
                      className="btn-sm text-xs px-3 py-1.5 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg hover:bg-gray-100"
                      onClick={() => setConfirmDeactivate(false)}
                      disabled={deactivating}
                    >
                      Cancel
                    </button>
                    <button
                      className="btn-sm text-xs px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 flex items-center gap-1.5"
                      onClick={handleDeactivateDevice}
                      disabled={deactivating}
                    >
                      {deactivating && <Loader2 className="w-3 h-3 animate-spin" />}
                      {deactivating ? 'Deactivating...' : 'Deactivate'}
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : trialActive ? (
            /* Active trial — show trial info + activation form */
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 bg-sky-50 border border-sky-200 rounded-lg">
                <Clock className="w-5 h-5 text-sky-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-sky-800">
                    Free Trial — {trialDaysRemaining} day{trialDaysRemaining === 1 ? '' : 's'} remaining
                  </p>
                  <p className="text-xs text-sky-700 mt-1">
                    You have full Basic access during your trial. Enter a license key anytime to keep all your data and unlock permanent access.
                  </p>
                </div>
              </div>

              {/* Activation form */}
              <div className="space-y-3">
                <p className="text-sm text-[var(--color-text-secondary)]">
                  Have a license key? Activate now to secure your access.
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="input flex-1"
                    placeholder="Enter license key"
                    value={licenseKeyInput}
                    onChange={(e) => setLicenseKeyInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLicenseActivate()}
                    disabled={licenseActivating}
                  />
                  <button
                    className="btn-primary btn-sm flex items-center gap-1.5 px-4"
                    onClick={handleLicenseActivate}
                    disabled={licenseActivating}
                  >
                    {licenseActivating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                    {licenseActivating ? 'Activating...' : 'Activate'}
                  </button>
                </div>
              </div>

              <button
                className="btn-secondary btn-sm gap-1.5 w-full"
                onClick={() => window.api.shell.openExternal('https://pocketchart.app')}
              >
                Buy PocketChart
              </button>
            </div>
          ) : trialExpired ? (
            /* Trial expired — urge activation */
            <div className="space-y-4">
              <div className="flex items-start gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-800">
                    Your 30-day trial has ended
                  </p>
                  <p className="text-xs text-red-700 mt-1">
                    Your data is safe and always yours. Activate a license to continue creating clients, notes, and appointments. You can still view and export everything.
                  </p>
                </div>
              </div>

              {/* Activation form */}
              <div className="space-y-3">
                <div className="flex gap-2">
                  <input
                    type="text"
                    className="input flex-1"
                    placeholder="Enter license key"
                    value={licenseKeyInput}
                    onChange={(e) => setLicenseKeyInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleLicenseActivate()}
                    disabled={licenseActivating}
                  />
                  <button
                    className="btn-primary btn-sm flex items-center gap-1.5 px-4"
                    onClick={handleLicenseActivate}
                    disabled={licenseActivating}
                  >
                    {licenseActivating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                    {licenseActivating ? 'Activating...' : 'Activate'}
                  </button>
                </div>
              </div>

              <button
                className="btn-secondary btn-sm gap-1.5 w-full"
                onClick={() => window.api.shell.openExternal('https://pocketchart.app')}
              >
                Buy PocketChart
              </button>
            </div>
          ) : (
            /* Unlicensed (no trial) — show activation form */
            <div className="space-y-3">
              <p className="text-sm text-[var(--color-text-secondary)]">
                Enter your license key to activate PocketChart.
              </p>
              <div className="flex gap-2">
                <input
                  type="text"
                  className="input flex-1"
                  placeholder="Enter license key"
                  value={licenseKeyInput}
                  onChange={(e) => setLicenseKeyInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleLicenseActivate()}
                  disabled={licenseActivating}
                />
                <button
                  className="btn-primary btn-sm flex items-center gap-1.5 px-4"
                  onClick={handleLicenseActivate}
                  disabled={licenseActivating}
                >
                  {licenseActivating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Key className="w-3.5 h-3.5" />}
                  {licenseActivating ? 'Activating...' : 'Activate'}
                </button>
              </div>
            </div>
          )}

          {/* Feedback messages */}
          {licenseError && (
            <div className={`p-3 rounded-lg text-xs ${
              licenseError.includes('already active on') ? 'bg-amber-50 border border-amber-200 text-amber-800' : 'bg-red-50 border border-red-200 text-red-700'
            }`}>
              {licenseError}
              {licenseError.includes('already active on') && (
                <p className="mt-2 text-amber-700">
                  To use PocketChart on this computer, deactivate one of your other devices first
                  (Settings → License → Deactivate This Device), then enter your license key here again.
                </p>
              )}
            </div>
          )}
          {licenseSuccess && (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg text-xs text-green-700">
              {licenseSuccess}
            </div>
          )}
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        icon={<Printer className="w-5 h-5" />}
        title="Fax (SRFax)"
        description={srfaxConfigured ? `Account: ${srfaxMaskedId || 'Configured'}` : 'Not configured'}
        sectionId="settings-srfax"
        isOpen={openSectionId === 'srfax'}
        onToggle={() => toggleSection('srfax')}
      >
        <div className="space-y-4">
          {srfaxConfigured ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-green-600">
                <CheckCircle className="w-4 h-4" />
                SRFax credentials configured
              </div>
              {srfaxMaskedId && <p className="text-xs text-[var(--color-text-secondary)]">Account ID: {srfaxMaskedId}</p>}
              <button
                type="button"
                className="btn-danger text-sm"
                onClick={async () => {
                  await window.api.secureStorage.delete('srfax_access_id');
                  await window.api.secureStorage.delete('srfax_access_pwd');
                  await window.api.secureStorage.delete('srfax_caller_id');
                  setSrfaxConfigured(false);
                  setSrfaxMaskedId(null);
                  setToast('SRFax credentials removed');
                }}
              >
                Remove Credentials
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              <p className="text-sm text-[var(--color-text-secondary)]">
                Connect your SRFax account to send and receive faxes. Visit{' '}
                <span className="font-medium">srfax.com</span> to create an account.
              </p>
              <div className="grid grid-cols-1 gap-3">
                <div>
                  <label className="label">Account Number (Access ID)</label>
                  <input
                    type="text"
                    className="input w-full"
                    value={srfaxAccessId}
                    onChange={(e) => setSrfaxAccessId(e.target.value)}
                    placeholder="Your SRFax account number"
                  />
                </div>
                <div>
                  <label className="label">Password</label>
                  <input
                    type="password"
                    className="input w-full"
                    value={srfaxAccessPwd}
                    onChange={(e) => setSrfaxAccessPwd(e.target.value)}
                    placeholder="Your SRFax password"
                  />
                </div>
                <div>
                  <label className="label">Fax Number (Caller ID)</label>
                  <input
                    type="tel"
                    className="input w-full"
                    value={srfaxCallerId}
                    onChange={(e) => setSrfaxCallerId(e.target.value)}
                    placeholder="Your assigned fax number"
                  />
                </div>
              </div>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  className="btn-primary text-sm"
                  disabled={!srfaxAccessId || !srfaxAccessPwd || srfaxSaving}
                  onClick={async () => {
                    setSrfaxSaving(true);
                    try {
                      await window.api.secureStorage.set('srfax_access_id', srfaxAccessId);
                      await window.api.secureStorage.set('srfax_access_pwd', srfaxAccessPwd);
                      if (srfaxCallerId) {
                        await window.api.secureStorage.set('srfax_caller_id', srfaxCallerId);
                      }
                      setSrfaxConfigured(true);
                      const masked = await window.api.secureStorage.getMasked('srfax_access_id');
                      setSrfaxMaskedId(masked);
                      setSrfaxAccessId('');
                      setSrfaxAccessPwd('');
                      setSrfaxCallerId('');
                      setToast('SRFax credentials saved');
                    } catch (err) {
                      console.error('Failed to save SRFax credentials:', err);
                      setToast('Failed to save credentials');
                    } finally {
                      setSrfaxSaving(false);
                    }
                  }}
                >
                  {srfaxSaving ? 'Saving...' : 'Save Credentials'}
                </button>
              </div>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* ═══ APPEARANCE & ACCESSIBILITY ═══ */}
      <div className="flex items-center gap-2 mt-6 mb-3">
        <Palette className="w-4 h-4 text-[var(--color-text-tertiary)]" />
        <h2 className="text-xs font-semibold text-[var(--color-text-tertiary)] uppercase tracking-wider">Appearance & Accessibility</h2>
        <div className="flex-1 border-t border-[var(--color-border)]" />
      </div>

      <CollapsibleSection
        icon={<Palette className="w-5 h-5" />}
        title="Appearance & Accessibility"
        description={`${themeMode === 'dark' ? 'Dark' : themeMode === 'system' ? 'System' : 'Light'} theme · ${fontSize === 'default' ? 'Default' : fontSize} font`}
        sectionId="settings-appearance"
        isOpen={openSectionId === 'appearance'}
        onToggle={() => toggleSection('appearance')}
      >
        <div className="space-y-6">
          {/* Theme */}
          <div>
            <label className="label flex items-center gap-1.5">
              <Sun size={14} /> Theme
            </label>
            <p className="text-xs text-[var(--color-text-secondary)] mb-3">
              Choose how PocketChart looks. System will match your operating system setting.
            </p>
            <div className="flex items-center gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 w-fit">
              {([
                { value: 'light' as ThemeMode, label: 'Light', icon: <Sun size={14} /> },
                { value: 'dark' as ThemeMode, label: 'Dark', icon: <Moon size={14} /> },
                { value: 'system' as ThemeMode, label: 'System', icon: <Monitor size={14} /> },
              ]).map(opt => (
                <button
                  key={opt.value}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    themeMode === opt.value
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)]'
                  }`}
                  onClick={() => setThemeMode(opt.value)}
                >
                  {opt.icon}
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Font Size */}
          <div>
            <label className="label flex items-center gap-1.5">
              <Type size={14} /> Font Size
            </label>
            <p className="text-xs text-[var(--color-text-secondary)] mb-3">
              Adjust the base font size for the entire application.
            </p>
            <div className="flex items-center gap-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-1 w-fit">
              {([
                { value: 'small' as FontSize, label: 'Small', desc: '14px' },
                { value: 'default' as FontSize, label: 'Default', desc: '16px' },
                { value: 'large' as FontSize, label: 'Large', desc: '18px' },
                { value: 'xl' as FontSize, label: 'XL', desc: '20px' },
              ]).map(opt => (
                <button
                  key={opt.value}
                  className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    fontSize === opt.value
                      ? 'bg-[var(--color-primary)] text-white'
                      : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-hover)]'
                  }`}
                  onClick={() => setFontSize(opt.value)}
                >
                  {opt.label}
                  <span className={`text-xs ${fontSize === opt.value ? 'text-white/70' : 'text-[var(--color-text-secondary)]'}`}>
                    ({opt.desc})
                  </span>
                </button>
              ))}
            </div>
            <p className="text-xs text-[var(--color-text-secondary)] mt-2 italic">
              Preview: This text will resize when you change the font size above.
            </p>
          </div>

          {/* High Contrast */}
          <div className="flex items-center justify-between">
            <div>
              <label className="label flex items-center gap-1.5 mb-0">
                <Contrast size={14} /> High Contrast
              </label>
              <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                Increases border and text contrast for better readability.
              </p>
            </div>
            <button
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                highContrast ? 'bg-[var(--color-primary)]' : 'bg-gray-300'
              }`}
              onClick={() => setHighContrast(!highContrast)}
              role="switch"
              aria-checked={highContrast}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  highContrast ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Reduce Motion */}
          <div className="flex items-center justify-between">
            <div>
              <label className="label flex items-center gap-1.5 mb-0">
                <Clock size={14} /> Reduce Motion
              </label>
              <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                Disables animations and transitions throughout the app.
              </p>
            </div>
            <button
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                reduceMotion ? 'bg-[var(--color-primary)]' : 'bg-gray-300'
              }`}
              onClick={() => setReduceMotion(!reduceMotion)}
              role="switch"
              aria-checked={reduceMotion}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  reduceMotion ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      </CollapsibleSection>

      <CollapsibleSection
        icon={<Info className="w-5 h-5" />}
        title="About PocketChart"
        description={appVersion ? `v${appVersion}` : ''}
        sectionId="settings-about"
        isOpen={openSectionId === 'about'}
        onToggle={() => toggleSection('about')}
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

      {/* BAA Compliance Modal */}
      {baaModalProps && (
        <BAAComplianceModal
          isOpen={baaModalOpen}
          onClose={() => {
            setBaaModalOpen(false);
            setPendingDataPath(null);
            setBaaModalProps(null);
          }}
          onAccept={handleBaaAccept}
          onChooseDifferent={handleBaaChooseDifferent}
          providerDisplayName={baaModalProps.providerDisplayName}
          baaUrl={baaModalProps.baaUrl}
          baaAvailable={baaModalProps.baaAvailable}
        />
      )}

      {/* Fee Schedule Modal */}
      <FeeScheduleModal
        isOpen={showFeeModal}
        onClose={() => { setShowFeeModal(false); setEditingFee(null); }}
        onSave={async () => {
          const updated = await window.api.feeSchedule.list();
          setFeeSchedule(updated);
        }}
        fee={editingFee || undefined}
      />
    </div>
  );
}
