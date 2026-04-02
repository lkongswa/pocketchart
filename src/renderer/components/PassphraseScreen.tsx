import React, { useState, useRef, useEffect } from 'react';
import { ClipboardList, Eye, EyeOff, KeyRound, AlertTriangle, Loader2, ArrowLeft } from 'lucide-react';

interface PassphraseScreenProps {
  onUnlock: () => void;
  /** If true, show the "set new passphrase" flow (after recovery key unlock) */
  showSetNewPassphrase?: boolean;
}

type Mode = 'passphrase' | 'recovery' | 'set-new-passphrase';

export default function PassphraseScreen({ onUnlock, showSetNewPassphrase }: PassphraseScreenProps) {
  const [mode, setMode] = useState<Mode>(showSetNewPassphrase ? 'set-new-passphrase' : 'passphrase');
  const [passphrase, setPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [shaking, setShaking] = useState(false);

  // Recovery key state
  const [recoveryKey, setRecoveryKey] = useState('');
  const [recoveryError, setRecoveryError] = useState('');

  // New passphrase state (after recovery)
  const [newPassphrase, setNewPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [newPassError, setNewPassError] = useState('');
  const [showNewPass, setShowNewPass] = useState(false);

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, [mode]);

  const handleUnlock = async () => {
    if (!passphrase.trim()) {
      setError('Please enter your passphrase');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await window.api.encryption.unlock(passphrase);
      if (result.success) {
        onUnlock();
      } else {
        setShaking(true);
        setTimeout(() => setShaking(false), 500);
        setError(result.error || 'Incorrect passphrase');
        setPassphrase('');
      }
    } catch {
      setError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleRecoveryUnlock = async () => {
    const cleaned = recoveryKey.replace(/[\s-]/g, '').toUpperCase();
    if (cleaned.length < 20) {
      setRecoveryError('Please enter your complete recovery key');
      return;
    }
    setLoading(true);
    setRecoveryError('');
    try {
      const result = await window.api.encryption.unlockWithRecovery(recoveryKey);
      if (result.success) {
        // V2: DB has been decrypted to plaintext — no need to set new passphrase
        onUnlock();
        return;
      } else {
        setShaking(true);
        setTimeout(() => setShaking(false), 500);
        setRecoveryError(result.error || 'Incorrect recovery key');
      }
    } catch {
      setRecoveryError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSetNewPassphrase = async () => {
    setNewPassError('');
    if (newPassphrase.length < 8) {
      setNewPassError('Passphrase must be at least 8 characters');
      return;
    }
    if (newPassphrase !== confirmPassphrase) {
      setNewPassError('Passphrases do not match');
      return;
    }
    setLoading(true);
    try {
      // The DB is already unlocked via recovery key — just change the passphrase wrapping
      const result = await window.api.encryption.changePassphrase('', newPassphrase);
      if (result.success) {
        onUnlock();
      } else {
        setNewPassError(result.error || 'Failed to set new passphrase');
      }
    } catch {
      setNewPassError('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      if (mode === 'passphrase') handleUnlock();
      else if (mode === 'recovery') handleRecoveryUnlock();
      else if (mode === 'set-new-passphrase') handleSetNewPassphrase();
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
      <div className={`w-full max-w-md mx-4 ${shaking ? 'animate-shake' : ''}`}>
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center justify-center w-16 h-16 rounded-2xl bg-[var(--color-primary)] text-white mb-4">
            <ClipboardList className="w-8 h-8" />
          </div>
          <h1 className="text-xl font-bold text-[var(--color-text)]">PocketChart</h1>
        </div>

        {/* ── Passphrase Entry ── */}
        {mode === 'passphrase' && (
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <div className="flex items-center gap-2 mb-1">
              <KeyRound className="w-5 h-5 text-[var(--color-primary)]" />
              <h2 className="text-lg font-semibold text-[var(--color-text)]">One-Time Data Migration</h2>
            </div>
            <p className="text-sm text-[var(--color-text-secondary)] mb-6">
              Your database was previously encrypted. Enter your passphrase one last time to migrate
              your data. You won't need to enter it again after this.
            </p>

            <div className="relative mb-4">
              <input
                ref={inputRef}
                type={showPassphrase ? 'text' : 'password'}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Enter passphrase"
                className="w-full px-4 py-3 pr-12 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)]"
                disabled={loading}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowPassphrase(!showPassphrase)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
              >
                {showPassphrase ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            {error && (
              <div className="flex items-center gap-2 mb-4 text-sm text-red-600">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {error}
              </div>
            )}

            <button
              onClick={handleUnlock}
              disabled={loading || !passphrase.trim()}
              className="w-full btn-primary py-3 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Decrypting...
                </>
              ) : (
                'Unlock'
              )}
            </button>

            <button
              onClick={() => { setMode('recovery'); setError(''); }}
              className="w-full mt-3 text-sm text-[var(--color-primary)] hover:underline"
            >
              I forgot my passphrase
            </button>
          </div>
        )}

        {/* ── Recovery Key Entry ── */}
        {mode === 'recovery' && (
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <button
              onClick={() => { setMode('passphrase'); setRecoveryError(''); }}
              className="flex items-center gap-1 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] mb-4"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to passphrase
            </button>

            <div className="flex items-center gap-2 mb-1">
              <KeyRound className="w-5 h-5 text-amber-500" />
              <h2 className="text-lg font-semibold text-[var(--color-text)]">Recovery Key</h2>
            </div>
            <p className="text-sm text-[var(--color-text-secondary)] mb-6">
              Enter your recovery key to unlock your data. This is the key you saved
              or printed when you first set up PocketChart.
            </p>

            <textarea
              value={recoveryKey}
              onChange={(e) => setRecoveryKey(e.target.value.toUpperCase())}
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleRecoveryUnlock(); } }}
              placeholder="A7K2-M9P4-X3B8-Q5R1-T6W2-J8C4-N7F3-V9H1"
              className="w-full px-4 py-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] font-mono text-sm focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)] resize-none"
              rows={2}
              disabled={loading}
              autoFocus
            />

            {recoveryError && (
              <div className="flex items-center gap-2 mt-3 text-sm text-red-600">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {recoveryError}
              </div>
            )}

            <button
              onClick={handleRecoveryUnlock}
              disabled={loading || recoveryKey.replace(/[\s-]/g, '').length < 20}
              className="w-full btn-primary py-3 mt-4 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Decrypting...
                </>
              ) : (
                'Recover Access'
              )}
            </button>
          </div>
        )}

        {/* ── Set New Passphrase (after recovery) ── */}
        {mode === 'set-new-passphrase' && (
          <div className="bg-white rounded-2xl shadow-lg p-8">
            <div className="flex items-center gap-2 mb-1">
              <KeyRound className="w-5 h-5 text-emerald-500" />
              <h2 className="text-lg font-semibold text-[var(--color-text)]">Set New Passphrase</h2>
            </div>
            <p className="text-sm text-[var(--color-text-secondary)] mb-6">
              Your data has been recovered. Please set a new encryption passphrase.
            </p>

            <div className="relative mb-3">
              <input
                ref={inputRef}
                type={showNewPass ? 'text' : 'password'}
                value={newPassphrase}
                onChange={(e) => setNewPassphrase(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="New passphrase (8+ characters)"
                className="w-full px-4 py-3 pr-12 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)]"
                disabled={loading}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowNewPass(!showNewPass)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
              >
                {showNewPass ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            </div>

            {/* Strength indicator */}
            <div className="mb-3">
              <div className="flex gap-1">
                {[1, 2, 3, 4].map((i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded-full transition-colors ${
                      newPassphrase.length >= i * 4
                        ? newPassphrase.length >= 12
                          ? 'bg-emerald-500'
                          : newPassphrase.length >= 8
                          ? 'bg-amber-500'
                          : 'bg-red-400'
                        : 'bg-gray-200'
                    }`}
                  />
                ))}
              </div>
              <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                {newPassphrase.length < 8
                  ? `${8 - newPassphrase.length} more characters needed`
                  : newPassphrase.length >= 12
                  ? 'Strong passphrase'
                  : 'Good — 12+ characters recommended'}
              </p>
            </div>

            <input
              type={showNewPass ? 'text' : 'password'}
              value={confirmPassphrase}
              onChange={(e) => setConfirmPassphrase(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Confirm passphrase"
              className="w-full px-4 py-3 mb-4 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)]"
              disabled={loading}
            />

            {newPassError && (
              <div className="flex items-center gap-2 mb-4 text-sm text-red-600">
                <AlertTriangle className="w-4 h-4 flex-shrink-0" />
                {newPassError}
              </div>
            )}

            <button
              onClick={handleSetNewPassphrase}
              disabled={loading || newPassphrase.length < 8 || newPassphrase !== confirmPassphrase}
              className="w-full btn-primary py-3 flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Set New Passphrase'
              )}
            </button>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-[var(--color-text-secondary)] mt-6">
          Your data is encrypted with AES-256 and never leaves your device.
        </p>
      </div>
    </div>
  );
}
