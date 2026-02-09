import React, { useState, useEffect } from 'react';
import { ClipboardList, Lock, Shield, ArrowRight, ScrollText, Stethoscope } from 'lucide-react';
import type { Discipline } from '@shared/types';

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
  const [step, setStep] = useState<'terms' | 'welcome' | 'practice' | 'pin'>('terms');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [saving, setSaving] = useState(false);

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

  const handleAcceptTerms = async () => {
    await window.api.settings.set('terms_accepted', new Date().toISOString());
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
    // Validate NPI if provided
    if (npi && !validateNpi(npi)) {
      setNpiError('Invalid NPI. Must be 10 digits with valid check digit.');
      return;
    }
    setNpiError('');
    setSaving(true);

    try {
      // Save practice info
      await window.api.practice.save({
        discipline: discipline || undefined,
        state: practiceState || undefined,
        npi: npi || undefined,
        taxonomy_code: taxonomyCode || undefined,
        license_number: licenseNumber || undefined,
      } as any);

      // Also store in settings for quick access
      if (discipline) await window.api.settings.set('provider_discipline', discipline);
      if (practiceState) await window.api.settings.set('provider_state', practiceState);

      // Auto-set note format based on discipline (DAP for MFT, SOAP for others)
      const defaultFormat = discipline === 'MFT' ? 'DAP' : 'SOAP';
      await window.api.settings.set('note_format', defaultFormat);

      // Reset fee schedule to match the chosen discipline
      if (discipline) {
        try { await window.api.feeSchedule.reset(discipline); } catch { /* ignore */ }
      }

      setStep('pin');
    } catch (err) {
      console.error('Failed to save practice info:', err);
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
    // Validate NPI if provided
    if (npi && !validateNpi(npi)) {
      setNpiError('Invalid NPI. Must be 10 digits with valid check digit.');
      return;
    }
    setNpiError('');
    setSaving(true);

    try {
      const hasAnyData = discipline || practiceState || npi || taxonomyCode || licenseNumber;

      if (hasAnyData) {
        await window.api.practice.save({
          discipline: discipline || undefined,
          state: practiceState || undefined,
          npi: npi || undefined,
          taxonomy_code: taxonomyCode || undefined,
          license_number: licenseNumber || undefined,
        } as any);

        if (discipline) await window.api.settings.set('provider_discipline', discipline);
        if (practiceState) await window.api.settings.set('provider_state', practiceState);

        if (discipline) {
          const defaultFormat = discipline === 'MFT' ? 'DAP' : 'SOAP';
          await window.api.settings.set('note_format', defaultFormat);
          try { await window.api.feeSchedule.reset(discipline); } catch { /* ignore */ }
        }
      }

      await window.api.settings.set('onboarding_complete', 'true');
      onComplete();
    } catch (err) {
      console.error('Failed to save partial practice info:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    await window.api.settings.set('onboarding_complete', 'true');
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
              PocketChart stores all clinical data exclusively on your local device (or in a folder
              location you designate). PocketChart does not transmit, host, or store your data on
              any external server. You are the sole custodian of your data.
            </p>

            <p className="font-medium text-[var(--color-text)]">2. Your Responsibilities</p>
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

            <p className="font-medium text-[var(--color-text)]">3. No Warranty of Data Preservation</p>
            <p>
              PocketChart provides tools to help you protect and back up your data (PIN lock,
              auto-lock timeout, database export, soft deletes). However, PocketChart is provided
              "as-is" and makes no guarantee against data loss caused by hardware failure, accidental
              deletion, operating system issues, or any other event outside the application's control.
            </p>

            <p className="font-medium text-[var(--color-text)]">4. Limitation of Liability</p>
            <p>
              To the maximum extent permitted by applicable law, PocketChart and its developers shall
              not be liable for any indirect, incidental, special, consequential, or punitive damages,
              including but not limited to loss of data, loss of revenue, or claims by third parties
              (including patients, clients, insurers, or payors), arising from your use of or
              inability to use the software.
            </p>

            <p className="font-medium text-[var(--color-text)]">5. Clinical Responsibility</p>
            <p>
              PocketChart is a documentation tool, not a medical device. All clinical decisions,
              treatment plans, and documentation accuracy are your professional responsibility.
              PocketChart does not provide clinical advice.
            </p>

            <p className="font-medium text-[var(--color-text)]">6. Record Retention & Preservation</p>
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

            <p className="font-medium text-[var(--color-text)]">7. Regulatory Compliance & Direct Access</p>
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

            <p className="font-medium text-[var(--color-text)]">8. Updates & Changes</p>
            <p>
              These terms may be updated with new versions of PocketChart. Continued use after an
              update constitutes acceptance of the revised terms.
            </p>

            <p className="font-medium text-[var(--color-text)]">9. Data Integrity & Audit Trail</p>
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

  // --- Step 2: Welcome ---
  if (step === 'welcome') {
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

          <button
            className="btn-primary w-full justify-center gap-2 py-3"
            onClick={() => setStep('practice')}
          >
            Set Up Practice Info
            <ArrowRight className="w-4 h-4" />
          </button>

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
            disabled={saving || !discipline || !practiceState || !npi}
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
            onClick={() => setStep('pin')}
          >
            Skip for now
          </button>
        </div>
      </div>
    );
  }

  // --- Step 4: PIN Setup ---
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
