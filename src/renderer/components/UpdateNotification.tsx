import React, { useState, useEffect } from 'react';
import { Download, RefreshCw, CheckCircle, X } from 'lucide-react';

type UpdateState = 'idle' | 'available' | 'downloading' | 'ready';

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
    setState('downloading');
    setProgress(0);
    try {
      await window.api.update.download();
    } catch (err) {
      console.error('Download failed:', err);
      setState('available'); // Allow retry
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

            {state === 'downloading' && (
              <>
                <p className="text-sm font-medium text-[var(--color-text)]">
                  Downloading v{version}...
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

          {/* Close button (only for available state) */}
          {state === 'available' && (
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
