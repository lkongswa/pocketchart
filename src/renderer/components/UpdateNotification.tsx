import React, { useState, useEffect } from 'react';
import { Download, RefreshCw, CheckCircle, X, ShieldCheck, ShieldAlert } from 'lucide-react';

type UpdateState = 'idle' | 'available' | 'backing-up' | 'downloading' | 'ready' | 'backup-failed';

export default function UpdateNotification() {
  const [state, setState] = useState<UpdateState>('idle');
  const [version, setVersion] = useState('');
  const [progress, setProgress] = useState(0);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    // Listen for update events from the main process
    window.api.update.onAvailable((info) => {
      setVersion(info.version);
      setState('available');
      setDismissed(false);
    });

    window.api.update.onProgress((prog) => {
      setState('downloading');
      setProgress(prog.percent);
    });

    window.api.update.onDownloaded((info) => {
      setVersion(info.version);
      setState('ready');
    });

    window.api.update.onNotAvailable(() => {
      setState('idle');
    });
  }, []);

  const handleDownload = async () => {
    setState('backing-up');
    setProgress(0);
    try {
      // Backend will backup first, then download. If backup fails, it throws.
      await window.api.update.download();
    } catch (err) {
      console.error('Update blocked:', err);
      setState('backup-failed');
    }
  };

  const handleManualBackup = async () => {
    try {
      const result = await window.api.backup.exportManual();
      if (result) {
        // Manual backup succeeded — retry the download
        handleDownload();
      }
    } catch (err) {
      console.error('Manual backup failed:', err);
    }
  };

  const handleInstall = () => {
    window.api.update.install();
  };

  // Don't show anything if no update or user dismissed
  if (state === 'idle' || dismissed) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 max-w-sm animate-in slide-in-from-bottom-4">
      <div className="card p-4 shadow-lg border border-[var(--color-primary)]/20 bg-[var(--color-bg)]">
        <div className="flex items-start gap-3">
          {/* Icon */}
          <div className="flex-shrink-0 mt-0.5">
            {state === 'available' && (
              <Download className="w-5 h-5 text-[var(--color-primary)]" />
            )}
            {state === 'backing-up' && (
              <ShieldCheck className="w-5 h-5 text-amber-500 animate-pulse" />
            )}
            {state === 'backup-failed' && (
              <ShieldAlert className="w-5 h-5 text-red-500" />
            )}
            {state === 'downloading' && (
              <RefreshCw className="w-5 h-5 text-[var(--color-primary)] animate-spin" />
            )}
            {state === 'ready' && (
              <CheckCircle className="w-5 h-5 text-[var(--color-success)]" />
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            {state === 'available' && (
              <>
                <p className="text-sm font-medium text-[var(--color-text)]">
                  Update Available
                </p>
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                  PocketChart v{version} is ready to download.
                </p>
                <button
                  onClick={handleDownload}
                  className="btn-primary text-xs mt-2 py-1.5 px-3"
                >
                  <Download size={12} className="mr-1" />
                  Download Update
                </button>
              </>
            )}

            {state === 'backing-up' && (
              <>
                <p className="text-sm font-medium text-[var(--color-text)]">
                  Backing up your data...
                </p>
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                  A backup is required before updating.
                </p>
              </>
            )}

            {state === 'backup-failed' && (
              <>
                <p className="text-sm font-medium text-red-600">
                  Backup Failed
                </p>
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                  A backup is required before updating. The automatic backup failed.
                </p>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handleDownload}
                    className="btn-primary text-xs py-1.5 px-3"
                  >
                    <RefreshCw size={12} className="mr-1" />
                    Retry
                  </button>
                  <button
                    onClick={handleManualBackup}
                    className="btn-secondary text-xs py-1.5 px-3"
                  >
                    <ShieldCheck size={12} className="mr-1" />
                    Backup Manually
                  </button>
                </div>
              </>
            )}

            {state === 'downloading' && (
              <>
                <p className="text-sm font-medium text-[var(--color-text)]">
                  Downloading v{version}...
                </p>
                <p className="text-[11px] text-emerald-600 flex items-center gap-1 mt-0.5">
                  <ShieldCheck className="w-3 h-3" /> Data backed up
                </p>
                <div className="mt-2 w-full bg-gray-200 rounded-full h-1.5">
                  <div
                    className="bg-[var(--color-primary)] h-1.5 rounded-full transition-all duration-300"
                    style={{ width: `${progress}%` }}
                  />
                </div>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1">
                  {progress}% complete
                </p>
              </>
            )}

            {state === 'ready' && (
              <>
                <p className="text-sm font-medium text-[var(--color-text)]">
                  Update Ready
                </p>
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                  v{version} has been downloaded. Restart to apply.
                </p>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={handleInstall}
                    className="btn-primary text-xs py-1.5 px-3"
                  >
                    <RefreshCw size={12} className="mr-1" />
                    Restart Now
                  </button>
                  <button
                    onClick={() => setDismissed(true)}
                    className="btn-secondary text-xs py-1.5 px-3"
                  >
                    Later
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Close button (only for available and backup-failed states) */}
          {(state === 'available' || state === 'backup-failed') && (
            <button
              onClick={() => setDismissed(true)}
              className="text-[var(--color-text-secondary)] hover:text-[var(--color-text)] flex-shrink-0"
            >
              <X size={14} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
