import React, { useState } from 'react';
import { ClipboardList, Lock, Shield, ArrowRight, ScrollText, CheckSquare } from 'lucide-react';

interface OnboardingScreenProps {
  onComplete: () => void;
}

export default function OnboardingScreen({ onComplete }: OnboardingScreenProps) {
  const [step, setStep] = useState<'terms' | 'welcome' | 'pin'>('terms');
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [newPin, setNewPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [pinError, setPinError] = useState('');
  const [saving, setSaving] = useState(false);

  const handleAcceptTerms = async () => {
    await window.api.settings.set('terms_accepted', new Date().toISOString());
    setStep('welcome');
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
              (d) safeguarding your PIN and recovery credentials.
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

            <p className="font-medium text-[var(--color-text)]">6. Record Retention</p>
            <p>
              PocketChart uses soft-delete technology so that deleted records are hidden but not
              permanently erased, in support of HIPAA record-retention guidelines. However, it is
              your responsibility to maintain records for the duration required by applicable law
              and to ensure backup copies exist in case of hardware failure.
            </p>

            <p className="font-medium text-[var(--color-text)]">7. Updates & Changes</p>
            <p>
              These terms may be updated with new versions of PocketChart. Continued use after an
              update constitutes acceptance of the revised terms.
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
            onClick={() => setStep('pin')}
          >
            Set Up PIN
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

  // --- Step 3: PIN Setup ---
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
