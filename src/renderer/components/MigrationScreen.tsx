import React, { useState } from 'react';
import { Shield, Eye, EyeOff, Loader2, ArrowRight, AlertTriangle } from 'lucide-react';
import RecoveryKeyCeremony from './RecoveryKeyCeremony';

interface MigrationScreenProps {
  onComplete: () => void;
}

type MigrationStep = 'passphrase' | 'recovery';

/**
 * Shown when an existing unencrypted database needs to be migrated to encrypted.
 * Collects a passphrase, migrates the DB, then shows the recovery key ceremony.
 */
export default function MigrationScreen({ onComplete }: MigrationScreenProps) {
  const [step, setStep] = useState<MigrationStep>('passphrase');
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [recoveryKey, setRecoveryKey] = useState('');

  const handleMigrate = async () => {
    setError('');
    if (passphrase.length < 8) {
      setError('Passphrase must be at least 8 characters');
      return;
    }
    if (passphrase !== confirmPassphrase) {
      setError('Passphrases do not match');
      return;
    }

    setLoading(true);
    try {
      const result = await window.api.encryption.migrateAndSetup(passphrase);
      if (result.success && result.recoveryKey) {
        setRecoveryKey(result.recoveryKey);
        setStep('recovery');
      } else {
        setError(result.error || 'Migration failed. Please try again.');
      }
    } catch {
      setError('An error occurred during migration.');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'recovery') {
    return (
      <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 overflow-y-auto">
        <div className="py-8 px-4">
          <RecoveryKeyCeremony
            recoveryKey={recoveryKey}
            onComplete={onComplete}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className="w-full max-w-md mx-4">
        <div className="flex flex-col items-center mb-6">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-600 text-white mb-4">
            <Shield className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold text-[var(--color-text)]">Encrypt Your Data</h1>
          <p className="text-sm text-[var(--color-text-secondary)] text-center mt-2 max-w-sm">
            PocketChart now encrypts your clinical records with AES-256 encryption.
            Set a passphrase to protect your existing database.
          </p>
        </div>

        <div className="bg-white rounded-2xl shadow-lg p-8 space-y-4">
          <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
            <p className="text-xs text-blue-800">
              Your existing data will be encrypted in place. This is a one-time process
              that takes a few seconds. No data will be lost.
            </p>
          </div>

          <div className="relative">
            <input
              type={showPass ? 'text' : 'password'}
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
              placeholder="Encryption passphrase (8+ characters)"
              className="w-full px-4 py-3 pr-12 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)]"
              disabled={loading}
              autoFocus
            />
            <button
              type="button"
              onClick={() => setShowPass(!showPass)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
            >
              {showPass ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
          </div>

          {/* Strength indicator */}
          <div>
            <div className="flex gap-1">
              {[1, 2, 3, 4].map((i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded-full transition-colors ${
                    passphrase.length >= i * 4
                      ? passphrase.length >= 12
                        ? 'bg-emerald-500'
                        : passphrase.length >= 8
                        ? 'bg-amber-500'
                        : 'bg-red-400'
                      : 'bg-gray-200'
                  }`}
                />
              ))}
            </div>
            <p className="text-xs text-[var(--color-text-secondary)] mt-1">
              {passphrase.length < 8
                ? `${8 - passphrase.length} more characters needed`
                : passphrase.length >= 12
                ? 'Strong passphrase'
                : 'Good — 12+ characters recommended'}
            </p>
          </div>

          <input
            type={showPass ? 'text' : 'password'}
            value={confirmPassphrase}
            onChange={(e) => setConfirmPassphrase(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') handleMigrate(); }}
            placeholder="Confirm passphrase"
            className="w-full px-4 py-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)]"
            disabled={loading}
          />

          {error && (
            <div className="flex items-center gap-2 text-sm text-red-600">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              {error}
            </div>
          )}

          <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
            <p className="text-xs text-amber-800">
              <strong>Remember:</strong> PocketChart does not store your passphrase. If you
              forget it, you'll need your recovery key (provided in the next step) to access
              your data.
            </p>
          </div>

          <button
            onClick={handleMigrate}
            disabled={loading || passphrase.length < 8 || passphrase !== confirmPassphrase}
            className="w-full btn-primary py-3 flex items-center justify-center gap-2"
          >
            {loading ? (
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
    </div>
  );
}
