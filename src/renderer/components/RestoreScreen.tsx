import React, { useState } from 'react';
import {
  FolderOpen,
  Lock,
  Eye,
  EyeOff,
  Loader2,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  AlertTriangle,
  Users,
  FileText,
  ClipboardList,
  Target,
  Calendar,
  Receipt,
  Building2,
  HardDrive,
} from 'lucide-react';
import RecoveryKeyCeremony from './RecoveryKeyCeremony';
import type { BackupSummary } from '@shared/types';

interface RestoreScreenProps {
  onComplete: () => void;
  onBack: () => void;
}

type RestoreStep = 'pick-file' | 'enter-passphrase' | 'summary' | 'executing' | 'recovery' | 'complete';

export default function RestoreScreen({ onComplete, onBack }: RestoreScreenProps) {
  const [step, setStep] = useState<RestoreStep>('pick-file');
  const [filePath, setFilePath] = useState('');
  const [fileName, setFileName] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [showPassphrase, setShowPassphrase] = useState(false);
  const [summary, setSummary] = useState<BackupSummary | null>(null);
  const [recoveryKey, setRecoveryKey] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handlePickFile = async () => {
    const selected = await window.api.restore.pickFile();
    if (selected) {
      setFilePath(selected);
      setFileName(selected.split(/[/\\]/).pop() || selected);
      setError('');
      setStep('enter-passphrase');
    }
  };

  const handleValidate = async () => {
    if (!passphrase.trim()) {
      setError('Please enter your passphrase.');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await window.api.restore.validateAndSummarize(filePath, passphrase);
      if (result.error) {
        setError(result.error);
      } else if (result.summary) {
        setSummary(result.summary);
        setStep('summary');
      }
    } catch (err: any) {
      setError(err.message || 'Validation failed');
    } finally {
      setLoading(false);
    }
  };

  const handleRestore = async () => {
    setStep('executing');
    setError('');
    try {
      const result = await window.api.restore.execute(filePath, passphrase);
      if (result.success && result.recoveryKey) {
        setRecoveryKey(result.recoveryKey);
        setStep('recovery');
      } else {
        setError(result.error || 'Restore failed');
        setStep('summary'); // Go back to summary so user can retry
      }
    } catch (err: any) {
      setError(err.message || 'Restore failed');
      setStep('summary');
    }
  };

  const handleRecoveryComplete = () => {
    setStep('complete');
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  // ── Step 1: Pick File ──
  if (step === 'pick-file') {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[var(--color-bg)]">
        <div className="flex flex-col items-center gap-8 max-w-md text-center px-8">
          <div className="w-20 h-20 rounded-2xl bg-blue-500 flex items-center justify-center">
            <HardDrive className="w-10 h-10 text-white" />
          </div>

          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text)] mb-2">
              Restore from Backup
            </h1>
            <p className="text-[var(--color-text-secondary)]">
              Select your PocketChart backup file to restore your practice data.
            </p>
          </div>

          <div className="w-full space-y-3 text-left">
            <div className="flex items-start gap-3 p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]">
              <FolderOpen className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-[var(--color-text)]">Supported Formats</p>
                <p className="text-xs text-[var(--color-text-secondary)]">
                  .pcbackup files (recommended) or legacy .db files
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-3 rounded-lg bg-[var(--color-surface)] border border-[var(--color-border)]">
              <Lock className="w-5 h-5 text-blue-500 mt-0.5 shrink-0" />
              <div>
                <p className="text-sm font-medium text-[var(--color-text)]">Passphrase Required</p>
                <p className="text-xs text-[var(--color-text-secondary)]">
                  You'll need the passphrase that was active when the backup was created.
                </p>
              </div>
            </div>
          </div>

          <button
            className="btn-primary w-full justify-center gap-2 py-3"
            onClick={handlePickFile}
          >
            <FolderOpen className="w-4 h-4" />
            Select Backup File
          </button>

          <button
            className="text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors cursor-pointer"
            onClick={onBack}
          >
            <ArrowLeft className="w-3 h-3 inline mr-1" />
            Back
          </button>
        </div>
      </div>
    );
  }

  // ── Step 2: Enter Passphrase ──
  if (step === 'enter-passphrase') {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[var(--color-bg)]">
        <div className="flex flex-col items-center gap-6 max-w-md text-center px-8">
          <div className="w-16 h-16 rounded-2xl bg-blue-500 flex items-center justify-center">
            <Lock className="w-8 h-8 text-white" />
          </div>

          <div>
            <h2 className="text-2xl font-bold text-[var(--color-text)] mb-2">
              Enter Backup Passphrase
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Enter the passphrase that was active when <strong>{fileName}</strong> was created.
            </p>
          </div>

          {error && (
            <div className="w-full bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          <div className="w-full text-left">
            <label className="block text-sm font-medium text-[var(--color-text)] mb-1.5">
              Passphrase
            </label>
            <div className="relative">
              <input
                type={showPassphrase ? 'text' : 'password'}
                value={passphrase}
                onChange={e => setPassphrase(e.target.value)}
                onKeyDown={e => e.key === 'Enter' && handleValidate()}
                className="w-full px-4 py-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] text-[var(--color-text)] pr-12 focus:ring-2 focus:ring-blue-500/30 focus:border-blue-500 outline-none"
                placeholder="Enter your passphrase"
                autoFocus
                disabled={loading}
              />
              <button
                type="button"
                onClick={() => setShowPassphrase(!showPassphrase)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
              >
                {showPassphrase ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </div>

          <div className="w-full flex gap-3">
            <button
              className="flex-1 py-3 rounded-lg border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-bg-secondary)] transition-colors"
              onClick={() => {
                setStep('pick-file');
                setPassphrase('');
                setError('');
              }}
            >
              Back
            </button>
            <button
              className="flex-1 btn-primary justify-center gap-2 py-3"
              onClick={handleValidate}
              disabled={loading || !passphrase.trim()}
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Validating...
                </>
              ) : (
                <>
                  Validate Backup
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 3: Summary ──
  if (step === 'summary' && summary) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[var(--color-bg)] overflow-y-auto">
        <div className="flex flex-col items-center gap-6 max-w-lg text-center px-8 py-8">
          <div className="w-16 h-16 rounded-2xl bg-green-500 flex items-center justify-center">
            <CheckCircle2 className="w-8 h-8 text-white" />
          </div>

          <div>
            <h2 className="text-2xl font-bold text-[var(--color-text)] mb-2">
              Backup Validated
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Review the contents below, then click Restore to continue.
            </p>
          </div>

          {error && (
            <div className="w-full bg-red-50 border border-red-200 rounded-lg p-3 text-sm text-red-700 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              {error}
            </div>
          )}

          {/* Summary Grid */}
          <div className="w-full grid grid-cols-2 gap-3 text-left">
            {summary.practiceInfo?.name && (
              <div className="col-span-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3">
                <p className="text-xs text-[var(--color-text-secondary)]">Practice</p>
                <p className="text-sm font-semibold text-[var(--color-text)]">{summary.practiceInfo.name}</p>
                {summary.practiceInfo.discipline && (
                  <p className="text-xs text-[var(--color-text-secondary)]">{summary.practiceInfo.discipline}</p>
                )}
              </div>
            )}

            <StatCard icon={<Users size={16} />} label="Clients" value={summary.clientCount} sub={`${summary.activeClients} active`} />
            <StatCard icon={<FileText size={16} />} label="Notes" value={summary.noteCount} sub={`${summary.signedNotes} signed`} />
            <StatCard icon={<ClipboardList size={16} />} label="Evaluations" value={summary.evalCount} />
            <StatCard icon={<Target size={16} />} label="Goals" value={summary.goalCount} />
            <StatCard icon={<Calendar size={16} />} label="Appointments" value={summary.appointmentCount} />
            <StatCard icon={<Receipt size={16} />} label="Invoices" value={summary.invoiceCount} />
            {summary.entityCount > 0 && (
              <StatCard icon={<Building2 size={16} />} label="Entities" value={summary.entityCount} />
            )}
            <StatCard icon={<HardDrive size={16} />} label="File Size" value={formatFileSize(summary.fileSize)} />

            {(summary.earliestDate || summary.latestDate) && (
              <div className="col-span-2 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3">
                <p className="text-xs text-[var(--color-text-secondary)]">Date Range</p>
                <p className="text-sm font-medium text-[var(--color-text)]">
                  {summary.earliestDate || '?'} — {summary.latestDate || '?'}
                </p>
              </div>
            )}
          </div>

          <div className="w-full flex gap-3">
            <button
              className="flex-1 py-3 rounded-lg border border-[var(--color-border)] text-[var(--color-text)] hover:bg-[var(--color-bg-secondary)] transition-colors"
              onClick={() => {
                setStep('enter-passphrase');
                setError('');
              }}
            >
              Back
            </button>
            <button
              className="flex-1 btn-primary justify-center gap-2 py-3"
              onClick={handleRestore}
            >
              Restore This Backup
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 4: Executing ──
  if (step === 'executing') {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[var(--color-bg)]">
        <div className="flex flex-col items-center gap-6 max-w-md text-center px-8">
          <Loader2 className="w-16 h-16 text-blue-500 animate-spin" />
          <div>
            <h2 className="text-2xl font-bold text-[var(--color-text)] mb-2">
              Restoring Your Data
            </h2>
            <p className="text-sm text-[var(--color-text-secondary)]">
              Please wait while your practice data is being restored. This may take a moment.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Step 5: Recovery Key Ceremony ──
  if (step === 'recovery' && recoveryKey) {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[var(--color-bg)] overflow-y-auto">
        <div className="max-w-lg w-full px-8 py-8">
          <RecoveryKeyCeremony
            recoveryKey={recoveryKey}
            onComplete={handleRecoveryComplete}
          />
        </div>
      </div>
    );
  }

  // ── Step 6: Complete ──
  if (step === 'complete') {
    return (
      <div className="fixed inset-0 z-[200] flex items-center justify-center bg-[var(--color-bg)]">
        <div className="flex flex-col items-center gap-8 max-w-md text-center px-8">
          <div className="w-20 h-20 rounded-2xl bg-green-500 flex items-center justify-center">
            <CheckCircle2 className="w-10 h-10 text-white" />
          </div>

          <div>
            <h1 className="text-3xl font-bold text-[var(--color-text)] mb-2">
              Restore Complete!
            </h1>
            <p className="text-[var(--color-text-secondary)]">
              Your practice data has been successfully restored. Everything is ready to go.
            </p>
          </div>

          <button
            className="btn-primary w-full justify-center gap-2 py-3"
            onClick={onComplete}
          >
            Open PocketChart
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    );
  }

  return null;
}

// ── Helper Component ──
function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: number | string; sub?: string }) {
  return (
    <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg p-3">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[var(--color-text-secondary)]">{icon}</span>
        <p className="text-xs text-[var(--color-text-secondary)]">{label}</p>
      </div>
      <p className="text-lg font-bold text-[var(--color-text)]">{value}</p>
      {sub && <p className="text-xs text-[var(--color-text-secondary)]">{sub}</p>}
    </div>
  );
}
