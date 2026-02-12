import React, { useState, useEffect } from 'react';
import { ClipboardList, Lock, Shield, ArrowRight, ScrollText, Stethoscope, KeyRound, Eye, EyeOff, Loader2, HardDrive } from 'lucide-react';
import type { Discipline } from '@shared/types';
import RecoveryKeyCeremony from './RecoveryKeyCeremony';
import RestoreScreen from './RestoreScreen';

const US_STATES = [
  'AL','AK','AZ','AR','CA','CO','CT','DE','DC','FL','GA','HI','ID','IL','IN',
  'IA','KS','KY','LA','ME','MD','MA','MI','MN','MS','MO','MT','NE','NV','NH',
  'NJ','NM','NY','NC','ND','OH','OK','OR','PA','RI','SC','SD','TN','TX','UT',
  'VT','VA','WA','WV','WI','WY',
];

const TAXONOMY_CODES: Record<Discipline, { code: string; label: string }> = {
  ST: { code: '235Z00000X', label: 'Speech-Language Pathologist' },
  OT: { code: '225X00000X', label: 'Occupational Therapist' },
  PT: { code: '225100000X', label: 'Physical Therapist' },
  MFT: { code: '101YM0800X', label: 'Marriage & Family Therapist' },
};

interface OnboardingScreenProps {
  onComplete: () => void;
}

export default function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const [step, setStep] = useState<'terms' | 'welcome' | 'practice' | 'passphrase' | 'recovery' | 'pin'>('terms');
  const [showRestore, setShowRestore] = useState(false);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [saving, setSaving] = useState(false);

  // Encryption passphrase state
  const [encPassphrase, setEncPassphrase] = useState('');
  const [encConfirmPassphrase, setEncConfirmPassphrase] = useState('');
  const [encPassError, setEncPassError] = useState('');
  const [showEncPass, setShowEncPass] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState('');

  // Practice setup fields
  const [discipline, setDiscipline] = useState<Discipline | ''>('');
  const [practiceState, setPracticeState] = useState('');
  const [npi, setNpi] = useState('');
  const [taxonomyCode, setTaxonomyCode] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [npiError, setNpiError] = useState('');

  // Auto-populate taxonomy code when discipline changes
  useEffect(() => {
    if (discipline && discipline in TAXONOMY_CODES) {
      setTaxonomyCode(TAXONOMY_CODES[discipline as Discipline].code);
    } else {
      setTaxonomyCode('');
    }
  }, [discipline]);

  const handleAcceptTerms = () => {
    // Don't save to DB yet — DB doesn't exist until after passphrase setup.
    // We'll save terms_accepted after the DB is created.
    setStep('welcome');
  };

  const validateNpi = (value: string): boolean => {
    if (!value) return true; // Optional during onboarding
    if (!/^\d{10}$/.test(value)) return false;
    // Luhn check for NPI (prefix with 80840)
    const prefixed = '80840' + value;
    let sum = 0;
    for (let i = prefixed.length - 1; i >= 0; i--) {
      let digit = parseInt(prefixed[i], 10);
      if ((prefixed.length - i) % 2 === 0) {
        digit *= 2;
        if (digit > 9) digit -= 9;
      }
      sum += digit;
    }
    return sum % 10 === 0;
  };

  const handleSavePractice = async () => {
    // Validate NPI only if a complete 10-digit NPI was entered
    if (npi && npi.length === 10 && !validateNpi(npi)) {
      setNpiError('Invalid NPI checksum. Please double-check your NPI number.');
      return;
    }
    setNpiError('');

    // V2: Create plaintext DB now (no encryption), then save deferred data, then go to PIN
    setSaving(true);
    try {
      await window.api.encryption.setupPlaintext();
      await saveDeferredData();
      setStep('pin');
    } catch (err) {
      console.error('Failed to create database:', err);
      setNpiError('Failed to set up database. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  /**
   * After the DB is created (via encryption:setup), save all the deferred data:
   * terms acceptance, practice info, note format, fee schedule.
   */
  const saveDeferredData = async () => {
    try {
      await window.api.settings.set('terms_accepted', new Date().toISOString());

      if (discipline || practiceState || npi || taxonomyCode || licenseNumber) {
        await window.api.practice.save({
          discipline: discipline || undefined,
          state: practiceState || undefined,
          npi: npi || undefined,
          taxonomy_code: taxonomyCode || undefined,
          license_number: licenseNumber || undefined,
        } as any);
      }

      if (discipline) await window.api.settings.set('provider_discipline', discipline);
      if (practiceState) await window.api.settings.set('provider_state', practiceState);

      const defaultFormat = discipline === 'MFT' ? 'DAP' : 'SOAP';
      await window.api.settings.set('note_format', defaultFormat);

      if (discipline) {
        try { await window.api.feeSchedule.reset(discipline); } catch { /* ignore */ }
      }
    } catch (err) {
      console.error('Failed to save deferred onboarding data:', err);
    }
  };

  /**
   * Handle encryption passphrase setup.
   * Creates the encrypted DB, saves deferred data, then advances to recovery ceremony.
   */
  const handleSetupEncryption = async () => {
    setEncPassError('');
    if (encPassphrase.length < 8) {
      setEncPassError('Passphrase must be at least 8 characters');
      return;
    }
    if (encPassphrase !== encConfirmPassphrase) {
      setEncPassError('Passphrases do not match');
      return;
    }

    setSaving(true);
    try {
      const result = await window.api.encryption.setup(encPassphrase);
      if (result.success && result.recoveryKey) {
        // DB is now created and open — save all deferred onboarding data
        await saveDeferredData();
        setRecoveryKey(result.recoveryKey);
        setStep('recovery');
      } else {
        setEncPassError('Failed to set up encryption. Please try again.');
      }
    } catch {
      setEncPassError('An error occurred. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSetPin = async () => {
    setPinError('');

    if (!/^\d{4}$/.test(newPin)) {
      setPinError('PIN must be exactly 4 digits');
      return;
    }
    if (newPin !== confirmPin) {
      setPinError('PINs do not match');
      return;
    }

    setSaving(true);
    try {
      const result = await window.api.security.setPin(newPin);
      if (result.success) {
        await window.api.settings.set('onboarding_complete', 'true');
        window.dispatchEvent(new CustomEvent('pocketchart:security-changed'));
        onComplete();
      } else {
        setPinError(result.error || 'Failed to set PIN');
      }
    } catch {
      setPinError('An error occurred. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSavePartial = async () => {
    // Skip NPI validation for partial saves — user can fix it later in Settings
    setNpiError('');

    // V2: Create plaintext DB now (no encryption), then save deferred data, then go to PIN
    setSaving(true);
    try {
      await window.api.encryption.setupPlaintext();
      await saveDeferredData();
      setStep('pin');
    } catch (err) {
      console.error('Failed to create database:', err);
      setNpiError('Failed to set up database. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    // V2: Create plaintext DB if it doesn't exist yet (user skipping from welcome)
    try {
      await window.api.encryption.setupPlaintext();
    } catch (err) {
      console.error('setupPlaintext failed (may already be open):', err);
    }
    try {
      await window.api.settings.set('onboarding_complete', 'true');
    } catch (err) {
      console.error('Failed to set onboarding_complete:', err);
    }
    onComplete();
  };

  // --- Step 1: Terms & Conditions ---
  if (step === 'terms') {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[var(--color-bg)]">
        <div className="flex flex-col items-center gap-6 max-w-lg text-center px-8">
          <div className="w-20 h-20 rounded-2xl bg-[var(--color-primary)] flex items-center justify-center">
            <ScrollText className="w-10 h-10 text-white" />
          </div>

          <div>
            <h1 className="text-2xl font-bold text-[var(--color-text)] mb-2">
              Terms of Use
            </h1>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Please review and accept before getting started.
            </p>
          </div>

          <div className="w-full max-h-64 overflow-y-auto text-left text-xs text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded-lg p-4 space-y-3 bg-[var(--color-surface)]">
            <p className="font-semibold text-[var(--color-text)] text-sm">
              PocketChart End User License Agreement
            </p>

            <p className="font-medium text-[var(--color-text)]">1. Local Data Storage</p>
            <p>
              PocketChart stores all data locally on the device where the software is installed.
              The User is solely responsible for the physical security of their device, the
              security of their operating system and user account, and any decisions regarding
              the storage location of PocketChart data files, including but not limited to the
              use of cloud-synced folders, external drives, or network storage. PocketChart, LLC
              does not control, access, or monitor the User's data storage environment.
            </p>

            <p className="font-medium text-[var(--color-text)]">2. Cloud Storage Disclaimer</p>
            <p>
              If the User chooses to store PocketChart data files in a location that is
              synchronized with a cloud storage service (including but not limited to Google
              Drive, Microsoft OneDrive, Dropbox, or Apple iCloud), the User acknowledges that
              their data, which may include Protected Health Information (PHI), will be
              transmitted to and stored on the servers of that cloud service provider. The User
              is solely responsible for ensuring compliance with all applicable regulations,
              including but not limited to the Health Insurance Portability and Accountability
              Act (HIPAA), with respect to any cloud storage provider they choose to use.
              PocketChart, LLC is not a party to any agreement between the User and their cloud
              storage provider.
            </p>

            <p className="font-medium text-[var(--color-text)]">3. Your Responsibilities</p>
            <p>
              You are solely responsible for: (a) maintaining regular backups of your data;
              (b) securing your device with a strong operating system password, full-disk encryption,
              and physical security; (c) ensuring your use of PocketChart complies with HIPAA, state
              regulations, and the policies of your organization or professional licensing board;
              (d) safeguarding your PIN and recovery credentials;
              (e) ensuring continuity of access to your clinical records, including
              maintaining current backups in a secure location known to a designated
              trusted person (spouse, attorney, or practice successor) in case you
              become unable to access your practice;
              (f) maintaining the integrity of your clinical records and audit trail, including
              refraining from directly modifying the PocketChart database outside of the
              application interface.
            </p>

            <p className="font-medium text-[var(--color-text)]">4. No Warranty of Data Preservation</p>
            <p>
              PocketChart provides tools to help you protect and back up your data (PIN lock,
              auto-lock timeout, database export, soft deletes). However, PocketChart is provided
              "as-is" and makes no guarantee against data loss caused by hardware failure, accidental
              deletion, operating system issues, or any other event outside the application's control.
            </p>

            <p className="font-medium text-[var(--color-text)]">5. Limitation of Liability</p>
            <p>
              To the maximum extent permitted by applicable law, PocketChart and its developers shall
              not be liable for any indirect, incidental, special, consequential, or punitive damages,
              including but not limited to loss of data, loss of revenue, or claims by third parties
              (including patients, clients, insurers, or payors), arising from your use of or
              inability to use the software.
            </p>

            <p className="font-medium text-[var(--color-text)]">6. Clinical Responsibility</p>
            <p>
              PocketChart is a documentation tool, not a medical device. All clinical decisions,
              treatment plans, and documentation accuracy are your professional responsibility.
              PocketChart does not provide clinical advice.
            </p>

            <p className="font-medium text-[var(--color-text)]">7. Record Retention & Preservation</p>
            <p>
              PocketChart uses soft-delete technology so that deleted records are hidden but not
              permanently erased, in support of HIPAA record-retention guidelines. However, it is
              your responsibility to maintain records for the duration required by applicable law
              and to ensure backup copies exist in case of hardware failure.
            </p>
            <p>
              You acknowledge that intentional destruction of clinical records, audit trails,
              or database files may violate federal and state record retention laws, including
              HIPAA (45 CFR §164.530(j)) and Medicare Conditions of Participation. PocketChart
              is not responsible for any legal consequences arising from the intentional
              destruction of records by the user.
            </p>

            <p className="font-medium text-[var(--color-text)]">8. Regulatory Compliance & Direct Access</p>
            <p>
              PocketChart includes features that prompt for physician referrals and track compliance
              based on state direct-access rules. These prompts are provided as informational guidance
              only. <strong>PocketChart does not provide legal advice.</strong> State practice acts,
              payer requirements, and direct-access regulations change frequently and vary by state,
              discipline, and clinical setting. You are solely responsible for verifying that your
              practice complies with all applicable state laws, licensure requirements, payer
              contracts, and professional board regulations. PocketChart makes no warranty that its
              built-in rules are current, complete, or applicable to your specific practice situation.
            </p>

            <p className="font-medium text-[var(--color-text)]">9. No Business Associate Relationship</p>
            <p>
              PocketChart, LLC does not access, receive, maintain, or transmit Protected Health
              Information (PHI) through its servers or services. The User retains exclusive
              custody of all clinical data. Accordingly, PocketChart, LLC does not meet the
              definition of a Business Associate under 45 CFR 160.103, and no Business Associate
              Agreement is required or offered.
            </p>

            <p className="font-medium text-[var(--color-text)]">10. Encryption and Key Management</p>
            <p>
              PocketChart offers database encryption protected by a user-chosen passphrase and
              a one-time recovery key. PocketChart, LLC does not store, transmit, or have access
              to the User's encryption passphrase or recovery key. If the User loses both their
              passphrase and their recovery key, PocketChart, LLC cannot recover the User's data.
              The User is solely responsible for the secure storage of their recovery key.
            </p>

            <p className="font-medium text-[var(--color-text)]">11. Updates & Changes</p>
            <p>
              These terms may be updated with new versions of PocketChart. Continued use after an
              update constitutes acceptance of the revised terms.
            </p>

            <p className="font-medium text-[var(--color-text)]">12. Data Integrity & Audit Trail</p>
            <p>
              PocketChart maintains an audit trail that records clinical document creation, signing,
              modification, and deletion events. This audit trail is a critical component of
              regulatory compliance and medical record integrity.
            </p>
            <p>
              You agree not to: (a) directly modify, delete, or tamper with the PocketChart database
              file or its contents outside of the PocketChart application interface;
              (b) delete, alter, or attempt to circumvent audit trail records;
              (c) modify the content of signed clinical documents by any means other than
              PocketChart's built-in amendment process;
              (d) use external tools, scripts, or database editors to alter clinical records,
              billing data, or compliance tracking information; or
              (e) destroy, relocate, or render inaccessible the PocketChart database or audit trail
              during any period in which you are required by law to retain clinical records.
            </p>
            <p>
              PocketChart's signed document protections (including content hashing and immutability
              controls) are designed to preserve the integrity of your medical records. Circumventing
              these protections may violate HIPAA, Medicare conditions of participation, state
              practice act regulations, and applicable fraud statutes.
            </p>
            <p>
              <strong>PocketChart is not responsible for data integrity failures resulting from
              direct database modification, use of external tools to alter records, or any action
              that bypasses the application's built-in safeguards.</strong>
            </p>
          </div>

          <label className="flex items-center gap-3 w-full text-left cursor-pointer group">
            <input
              type="checkbox"
              checked={termsAccepted}
              onChange={(e) => setTermsAccepted(e.target.checked)}
              className="w-5 h-5 rounded border-[var(--color-border)] text-[var(--color-primary)] focus:ring-[var(--color-primary)]/30 cursor-pointer"
            />
            <span className="text-sm text-[var(--color-text)] group-hover:text-[var(--color-primary)] transition-colors">
              I have read and agree to the Terms of Use
            </span>
          </label>

          <button
            className="btn-primary w-full justify-center gap-2 py-3 disabled:opacity-40"
            onClick={handleAcceptTerms}
            disabled={!termsAccepted}
          >
            Continue
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  // --- Step 2: Welcome (or Restore) ---
  if (step === 'welcome') {
    // If user chose to restore, render RestoreScreen
    if (showRestore) {
      return (
        <RestoreScreen
          onComplete={onComplete}
          onBack={() => setShowRestore(false)}
        />
      );
    }

    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[var(--color-bg)]">
        <div className="flex flex-col items-center gap-8 max-w-md text-center px-8">
          <div className="w-20 h-20 rounded-2xl bg-[var(--color-primary)] flex items-center justify-center">
            <ClipboardList className="w-10 h-10 text-white" />
          </div>

          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text)] mb-2">
              Welcome to PocketChart
            </h1>
            <p className="text-[var(--color-text-secondary)]">
              Clinical documentation made simple. Let's get your practice set up.
            </p>
          </div>

          <div className="w-full space-y-3 text-left">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]">
              <Shield className="w-5 h-5 text-[var(--color-primary)] mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-[var(--color-text)]">HIPAA-Conscious Security</p>
                <p className="text-xs text-[var(--color-text-secondary)]">
                  We recommend setting a PIN to protect clinical data. Your data never leaves your computer.
                </p>
              </div>
            </div>
          </div>

          <div className="w-full space-y-3">
            <button
              className="btn-primary w-full justify-center gap-2 py-3"
              onClick={() => setStep('practice')}
            >
              Start Fresh
              <ArrowRight className="w-4 h-4" />
            </button>

            <button
              className="w-full flex items-center justify-center gap-2 py-3 rounded-lg border-2 border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100 hover:border-blue-300 transition-colors font-medium"
              onClick={() => setShowRestore(true)}
            >
              <HardDrive className="w-4 h-4" />
              Restore from Backup
            </button>
          </div>

          <button
            className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors cursor-pointer"
            onClick={handleSkip}
          >
            Skip for now
          </button>
        </div>
      </div>
    );
  }

  // --- Step 3: Practice Setup ---
  if (step === 'practice') {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[var(--color-bg)] overflow-y-auto">
        <div className="flex flex-col items-center gap-6 max-w-md text-center px-8 py-8">
          <div className="w-16 h-16 rounded-2xl bg-[var(--color-primary)] flex items-center justify-center">
            <Stethoscope className="w-8 h-8 text-white" />
          </div>

          <div>
            <h2 className="text-2xl font-bold text-[var(--color-text)] mb-2">
              Practice Information
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)]">
              This info auto-populates on every note and evaluation. You can update it later in Settings.
            </p>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1">
              * Required for full setup. You can save partial info and complete later in Settings.
            </p>
          </div>

          <div className="w-full space-y-4 text-left">
            {/* Discipline */}
            <div>
              <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1 block">
                Discipline *
              </label>
              <select
                className="select w-full"
                value={discipline}
                onChange={(e) => setDiscipline(e.target.value as Discipline)}
              >
                <option value="">Select discipline...</option>
                <option value="PT">Physical Therapy (PT)</option>
                <option value="OT">Occupational Therapy (OT)</option>
                <option value="ST">Speech-Language Pathology (ST)</option>
                <option value="MFT">Marriage & Family Therapy (MFT)</option>
              </select>
            </div>

            {/* Practice State */}
            <div>
              <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1 block">
                Practice State *
              </label>
              <select
                className="select w-full"
                value={practiceState}
                onChange={(e) => setPracticeState(e.target.value)}
              >
                <option value="">Select state...</option>
                {US_STATES.map((s) => (
                  <option key={s} value={s}>{s}</option>
                ))}
              </select>
            </div>

            {/* NPI */}
            <div>
              <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1 block">
                NPI Number *
              </label>
              <input
                type="text"
                className="input w-full"
                placeholder="10-digit NPI"
                maxLength={10}
                value={npi}
                onChange={(e) => {
                  setNpi(e.target.value.replace(/\D/g, '').slice(0, 10));
                  setNpiError('');
                }}
              />
              {npiError && <p className="text-xs text-red-500 mt-1">{npiError}</p>}
            </div>

            {/* Taxonomy Code */}
            <div>
              <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1 block">
                Taxonomy Code
              </label>
              <input
                type="text"
                className="input w-full"
                placeholder="Auto-populated from discipline"
                value={taxonomyCode}
                onChange={(e) => setTaxonomyCode(e.target.value)}
              />
              {discipline && discipline in TAXONOMY_CODES && (
                <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                  {TAXONOMY_CODES[discipline as Discipline].label}
                </p>
              )}
            </div>

            {/* License Number */}
            <div>
              <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1 block">
                State License Number
              </label>
              <input
                type="text"
                className="input w-full"
                placeholder={discipline === 'MFT' ? 'e.g., LMFT12345' : 'e.g., SLP12345'}
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
              />
            </div>
          </div>

          <button
            className="btn-primary w-full justify-center gap-2 py-3"
            onClick={handleSavePractice}
            disabled={saving || !discipline || !practiceState}
          >
            {saving ? 'Saving...' : 'Continue to PIN Setup'}
            <ArrowRight className="w-4 h-4" />
          </button>

          <button
            className="btn-secondary w-full justify-center gap-2 py-3"
            onClick={handleSavePartial}
            disabled={saving || (!discipline && !practiceState && !npi && !licenseNumber)}
          >
            {saving ? 'Saving...' : 'Save & Continue Later'}
          </button>

          <button
            className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors cursor-pointer"
            onClick={async () => {
              // V2: Create plaintext DB before skipping to PIN
              setSaving(true);
              try {
                await window.api.encryption.setupPlaintext();
                await saveDeferredData();
              } catch { /* DB may already exist */ }
              setSaving(false);
              setStep('pin');
            }}
          >
            Skip for now
          </button>
        </div>
      </div>
    );
  }

  // --- Step 4: Encryption Passphrase Setup ---
  if (step === 'passphrase') {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[var(--color-bg)] overflow-y-auto">
        <div className="flex flex-col items-center gap-6 max-w-md text-center px-8 py-8">
          <div className="w-16 h-16 rounded-2xl bg-emerald-600 flex items-center justify-center">
            <Shield className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">
            Protect Your Data
          </h1>
          <p className="text-sm text-[var(--color-text-secondary)] max-w-sm">
            PocketChart encrypts your clinical records with AES-256 encryption.
            Choose a strong passphrase that you'll remember — you'll enter it each
            time you open the app.
          </p>

          <div className="w-full text-left space-y-3">
            <div className="relative">
              <input
                type={showEncPass ? 'text' : 'password'}
                value={encPassphrase}
                onChange={(e) => setEncPassphrase(e.target.value)}
                placeholder="Encryption passphrase (8+ characters)"
                className="w-full px-4 py-3 pr-12 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)]"
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowEncPass(!showEncPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
              >
                {showEncPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Strength indicator */}
            <div>
              <div className="flex gap-1">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      encPassphrase.length >= i * 4
                        ? encPassphrase.length >= 12
                          ? 'bg-emerald-500'
                          : encPassphrase.length >= 8
                          ? 'bg-amber-500'
                          : 'bg-red-400'
                        : 'bg-gray-200'
                    }`}
                  />
                ))}
              </div>
              <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                {encPassphrase.length < 8
                  ? `${8 - encPassphrase.length} more characters needed`
                  : encPassphrase.length >= 12
                  ? 'Strong passphrase'
                  : 'Good — 12+ characters recommended'}
              </p>
            </div>

            <input
              type={showEncPass ? 'text' : 'password'}
              value={encConfirmPassphrase}
              onChange={(e) => setEncConfirmPassphrase(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleSetupEncryption(); }}
              placeholder="Confirm passphrase"
              className="w-full px-4 py-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)]"
            />

            {encPassError && (
              <p className="text-sm text-red-600">{encPassError}</p>
            )}
          </div>

          <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 text-left w-full">
            <p className="text-xs text-amber-800">
              <strong>Important:</strong> This passphrase is separate from your PIN.
              The passphrase encrypts your data on disk. PocketChart does not store
              your passphrase and cannot recover it if forgotten. You'll receive a
              recovery key in the next step.
            </p>
          </div>

          <button
            onClick={handleSetupEncryption}
            disabled={saving || encPassphrase.length < 8 || encPassphrase !== encConfirmPassphrase}
            className="w-full btn-primary py-3 flex items-center justify-center gap-2"
          >
            {saving ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Encrypting Database...
              </>
            ) : (
              <>
                Encrypt & Continue
                <ArrowRight className="w-4 h-4" />
              </>
            )}
          </button>
        </div>
      </div>
    );
  }

  // --- Step 5: Recovery Key Ceremony ---
  if (step === 'recovery') {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[var(--color-bg)] overflow-y-auto">
        <div className="py-8 px-4">
          <RecoveryKeyCeremony
            recoveryKey={recoveryKey}
            onComplete={() => setStep('pin')}
          />
        </div>
      </div>
    );
  }

  // --- Step 6: PIN Setup ---
  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[var(--color-bg)]">
      <div className="flex flex-col items-center gap-8 max-w-sm text-center px-8">
        <div className="w-16 h-16 rounded-2xl bg-[var(--color-primary)] flex items-center justify-center">
          <Lock className="w-8 h-8 text-white" />
        </div>

        <div>
          <h2 className="text-2xl font-bold text-[var(--color-text)] mb-2">
            Create Your PIN
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Choose a 4-digit PIN to protect access to your clinical data.
          </p>
        </div>

        <div className="w-full space-y-4">
          <div className="text-left">
            <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1 block">
              New PIN
            </label>
            <input
              type="password"
              className="w-full px-4 py-3 text-center text-lg tracking-[0.5em] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)]"
              maxLength={4}
              placeholder="----"
              value={newPin}
              onChange={(e) => setNewPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
              autoFocus
            />
          </div>

          <div className="text-left">
            <label className="text-xs font-medium text-[var(--color-text-secondary)] mb-1 block">
              Confirm PIN
            </label>
            <input
              type="password"
              className="w-full px-4 py-3 text-center text-lg tracking-[0.5em] border border-[var(--color-border)] rounded-lg focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)]"
              maxLength={4}
              placeholder="----"
              value={confirmPin}
              onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, '').slice(0, 4))}
            />
          </div>

          {pinError && (
            <p className="text-sm text-red-500 font-medium">{pinError}</p>
          )}

          <button
            className="btn-primary w-full justify-center py-3"
            onClick={handleSetPin}
            disabled={saving || newPin.length !== 4 || confirmPin.length !== 4}
          >
            {saving ? 'Saving...' : 'Set PIN & Get Started'}
          </button>

          <button
            className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors cursor-pointer"
            onClick={handleSkip}
          >
            Skip for now
          </button>
        </div>
      </div>
    </div>
  );
}
