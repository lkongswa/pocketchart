import React, { useState, useEffect, useCallback } from 'react';
import { ClipboardList, Delete, KeyRound, ArrowLeft } from 'lucide-react';

interface PinLockScreenProps {
  onUnlock: () => void;
}

const MAX_ATTEMPTS = 3;
const LOCKOUT_SECONDS = 30;

type RecoveryStep = 'none' | 'instructions' | 'enter-code';

export default function PinLockScreen({ onUnlock }: PinLockScreenProps) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [lockedUntil, setLockedUntil] = useState<number | null>(null);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);
  const [shaking, setShaking] = useState(false);

  // Recovery state
  const [recoveryStep, setRecoveryStep] = useState<RecoveryStep>('none');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryError, setRecoveryError] = useState('');
  const [recoveryFilePath, setRecoveryFilePath] = useState('');
  const [recoveryLoading, setRecoveryLoading] = useState(false);

  const isLockedOut = lockedUntil !== null && Date.now() < lockedUntil;

  // Countdown timer for lockout
  useEffect(() => {
    if (!lockedUntil) return;
    const interval = setInterval(() => {
      const remaining = Math.max(0, Math.ceil((lockedUntil - Date.now()) / 1000));
      setLockoutRemaining(remaining);
      if (remaining <= 0) {
        setLockedUntil(null);
        setError('');
        setAttempts(0);
      }
    }, 1000);
    return () => clearInterval(interval);
  }, [lockedUntil]);

  const handleVerify = useCallback(async (fullPin: string) => {
    const valid = await window.api.security.verifyPin(fullPin);
    if (valid) {
      setPin('');
      setError('');
      setAttempts(0);
      onUnlock();
    } else {
      const newAttempts = attempts + 1;
      setAttempts(newAttempts);
      setPin('');
      setShaking(true);
      setTimeout(() => setShaking(false), 500);

      if (newAttempts >= MAX_ATTEMPTS) {
        const until = Date.now() + LOCKOUT_SECONDS * 1000;
        setLockedUntil(until);
        setLockoutRemaining(LOCKOUT_SECONDS);
        setError(`Too many attempts. Try again in ${LOCKOUT_SECONDS} seconds.`);
      } else {
        setError(`Incorrect PIN. ${MAX_ATTEMPTS - newAttempts} attempt${MAX_ATTEMPTS - newAttempts === 1 ? '' : 's'} remaining.`);
      }
    }
  }, [attempts, onUnlock]);

  const addDigit = useCallback((digit: string) => {
    if (isLockedOut) return;
    setError('');
    setPin(prev => {
      const next = prev + digit;
      if (next.length === 4) {
        handleVerify(next);
      }
      return next.length <= 4 ? next : prev;
    });
  }, [isLockedOut, handleVerify]);

  const removeDigit = useCallback(() => {
    if (isLockedOut) return;
    setPin(prev => prev.slice(0, -1));
  }, [isLockedOut]);

  // Keyboard support (only when not in recovery mode)
  useEffect(() => {
    if (recoveryStep !== 'none') return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isLockedOut) return;
      if (e.key >= '0' && e.key <= '9') {
        addDigit(e.key);
      } else if (e.key === 'Backspace') {
        removeDigit();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [addDigit, removeDigit, isLockedOut, recoveryStep]);

  // --- Recovery Handlers ---

  const handleForgotPin = async () => {
    setRecoveryLoading(true);
    setRecoveryError('');
    try {
      const result = await window.api.security.requestPinReset();
      if (result.success && result.filePath) {
        setRecoveryFilePath(result.filePath);
        setRecoveryStep('instructions');
      } else {
        setRecoveryError('Failed to create recovery file. Please try again.');
      }
    } catch (err: any) {
      setRecoveryError(err?.message || 'An error occurred.');
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleVerifyRecovery = async () => {
    if (!recoveryCode.trim()) {
      setRecoveryError('Please enter the recovery code.');
      return;
    }
    setRecoveryLoading(true);
    setRecoveryError('');
    try {
      const result = await window.api.security.verifyRecoveryToken(recoveryCode.trim());
      if (result.success) {
        // PIN has been removed — unlock
        onUnlock();
      } else {
        setRecoveryError(result.error || 'Invalid recovery code.');
      }
    } catch (err: any) {
      setRecoveryError(err?.message || 'An error occurred.');
    } finally {
      setRecoveryLoading(false);
    }
  };

  const handleBackToPin = () => {
    setRecoveryStep('none');
    setRecoveryCode('');
    setRecoveryError('');
    setRecoveryFilePath('');
  };

  const numpadButtons = [
    ['1', '2', '3'],
    ['4', '5', '6'],
    ['7', '8', '9'],
    ['', '0', 'del'],
  ];

  // --- Recovery: Instructions Screen ---
  if (recoveryStep === 'instructions') {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--color-bg)]">
        <div className="flex flex-col items-center gap-6 max-w-md px-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center">
            <KeyRound className="w-8 h-8 text-amber-600" />
          </div>
          <h2 className="text-xl font-bold text-[var(--color-text)]">PIN Recovery</h2>
          <div className="text-sm text-[var(--color-text-secondary)] space-y-3 text-left">
            <p>
              A recovery file has been created in your PocketChart data folder. A file explorer window should have opened showing its location.
            </p>
            <p className="font-medium text-[var(--color-text)]">
              Steps to reset your PIN:
            </p>
            <ol className="list-decimal list-inside space-y-2 ml-1">
              <li>Find and open the file <span className="font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">PIN_RECOVERY.txt</span></li>
              <li>Copy the 8-character recovery code from the file</li>
              <li>Come back here and enter the code</li>
            </ol>
            <p className="text-xs text-[var(--color-text-secondary)] mt-2">
              This code expires in 15 minutes for security.
            </p>
          </div>

          {recoveryError && (
            <p className="text-sm text-red-500 font-medium">{recoveryError}</p>
          )}

          <div className="flex gap-3 w-full">
            <button
              onClick={handleBackToPin}
              className="btn-secondary flex-1"
            >
              <ArrowLeft size={16} className="mr-1" />
              Back
            </button>
            <button
              onClick={() => setRecoveryStep('enter-code')}
              className="btn-primary flex-1"
            >
              I have the code
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Recovery: Enter Code Screen ---
  if (recoveryStep === 'enter-code') {
    return (
      <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--color-bg)]">
        <div className="flex flex-col items-center gap-6 max-w-md px-6 text-center">
          <div className="w-16 h-16 rounded-2xl bg-amber-100 flex items-center justify-center">
            <KeyRound className="w-8 h-8 text-amber-600" />
          </div>
          <h2 className="text-xl font-bold text-[var(--color-text)]">Enter Recovery Code</h2>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Type or paste the 8-character code from the PIN_RECOVERY.txt file.
          </p>

          <input
            type="text"
            value={recoveryCode}
            onChange={(e) => {
              setRecoveryCode(e.target.value.toUpperCase());
              setRecoveryError('');
            }}
            placeholder="e.g. A1B2C3D4"
            maxLength={8}
            autoFocus
            className="w-48 text-center text-2xl font-mono tracking-[0.3em] py-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-[var(--color-text)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)]"
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleVerifyRecovery();
            }}
          />

          {recoveryError && (
            <p className="text-sm text-red-500 font-medium">{recoveryError}</p>
          )}

          <div className="flex gap-3 w-full">
            <button
              onClick={() => setRecoveryStep('instructions')}
              className="btn-secondary flex-1"
            >
              <ArrowLeft size={16} className="mr-1" />
              Back
            </button>
            <button
              onClick={handleVerifyRecovery}
              disabled={recoveryLoading || recoveryCode.length < 8}
              className="btn-primary flex-1 disabled:opacity-50"
            >
              {recoveryLoading ? 'Verifying...' : 'Reset PIN'}
            </button>
          </div>

          <p className="text-xs text-[var(--color-text-secondary)]">
            After reset, your PIN will be removed and you can set a new one in Settings.
          </p>
        </div>
      </div>
    );
  }

  // --- Normal PIN Entry Screen ---
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-[var(--color-bg)]">
      <div className="flex flex-col items-center gap-8">
        {/* App Branding */}
        <div className="flex flex-col items-center gap-3">
          <div className="w-16 h-16 rounded-2xl bg-[var(--color-primary)] flex items-center justify-center">
            <ClipboardList className="w-8 h-8 text-white" />
          </div>
          <h1 className="text-2xl font-bold text-[var(--color-text)]">PocketChart</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">Enter your 4-digit PIN</p>
        </div>

        {/* PIN Dots */}
        <div className={`flex items-center gap-4 ${shaking ? 'animate-shake' : ''}`}>
          {[0, 1, 2, 3].map(i => (
            <div
              key={i}
              className={`w-4 h-4 rounded-full border-2 transition-all duration-150 ${
                i < pin.length
                  ? 'bg-[var(--color-primary)] border-[var(--color-primary)] scale-110'
                  : 'border-gray-300 bg-transparent'
              }`}
            />
          ))}
        </div>

        {/* Error Message */}
        {error && (
          <p className="text-sm text-red-500 font-medium text-center max-w-xs">
            {isLockedOut ? `Too many attempts. Try again in ${lockoutRemaining}s.` : error}
          </p>
        )}

        {/* Numeric Keypad */}
        <div className="grid grid-cols-3 gap-3">
          {numpadButtons.flat().map((btn, idx) => {
            if (btn === '') {
              return <div key={idx} />;
            }
            if (btn === 'del') {
              return (
                <button
                  key={idx}
                  onClick={removeDigit}
                  disabled={isLockedOut || pin.length === 0}
                  className="w-16 h-16 rounded-full flex items-center justify-center text-[var(--color-text-secondary)] hover:bg-gray-100 transition-colors disabled:opacity-30 cursor-pointer disabled:cursor-default"
                >
                  <Delete className="w-5 h-5" />
                </button>
              );
            }
            return (
              <button
                key={idx}
                onClick={() => addDigit(btn)}
                disabled={isLockedOut || pin.length >= 4}
                className="w-16 h-16 rounded-full flex items-center justify-center text-xl font-semibold text-[var(--color-text)] bg-white border border-[var(--color-border)] hover:bg-gray-50 active:bg-gray-100 transition-colors shadow-sm disabled:opacity-30 cursor-pointer disabled:cursor-default"
              >
                {btn}
              </button>
            );
          })}
        </div>

        {/* Forgot PIN link */}
        <button
          onClick={handleForgotPin}
          disabled={recoveryLoading}
          className="text-sm text-[var(--color-primary)] hover:underline cursor-pointer disabled:opacity-50"
        >
          {recoveryLoading ? 'Generating recovery file...' : 'Forgot PIN?'}
        </button>
      </div>
    </div>
  );
}
