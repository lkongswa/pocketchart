import React from 'react';
import { Clock, Key, ExternalLink, X } from 'lucide-react';

interface TrialExpiredModalProps {
  onClose: () => void;
}

/**
 * Modal shown when a trial-expired user tries to create a new record.
 * Offers two paths: enter a license key or buy PocketChart.
 */
export default function TrialExpiredModal({ onClose }: TrialExpiredModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-[var(--color-surface)] rounded-2xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="px-6 pt-6 pb-4 text-center relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 text-[var(--color-text-secondary)] hover:text-[var(--color-text)] p-1"
          >
            <X className="w-4 h-4" />
          </button>
          <div className="w-14 h-14 rounded-full bg-amber-100 flex items-center justify-center mx-auto mb-3">
            <Clock className="w-7 h-7 text-amber-600" />
          </div>
          <h2 className="text-lg font-bold text-[var(--color-text)]">
            Your Free Trial Has Ended
          </h2>
          <p className="text-sm text-[var(--color-text-secondary)] mt-2">
            Your 30-day trial is over, but your data is safe and always yours.
            Activate a license to keep creating clients, notes, and appointments.
          </p>
        </div>

        {/* What you can still do */}
        <div className="px-6 py-3">
          <div className="bg-[var(--color-bg)] rounded-lg p-3 text-xs text-[var(--color-text-secondary)] space-y-1">
            <p className="font-medium text-[var(--color-text)]">You can still:</p>
            <ul className="list-disc list-inside space-y-0.5">
              <li>View all your existing data</li>
              <li>Export client charts as PDFs</li>
              <li>Back up your database</li>
            </ul>
          </div>
        </div>

        {/* Actions */}
        <div className="px-6 pb-6 pt-2 space-y-2">
          <button
            className="btn-primary w-full gap-2"
            onClick={() => {
              onClose();
              window.location.hash = '#/settings';
            }}
          >
            <Key className="w-4 h-4" />
            Enter License Key
          </button>
          <button
            className="btn-secondary w-full gap-2"
            onClick={() => {
              window.api.shell.openExternal('https://pocketchart.app');
            }}
          >
            <ExternalLink className="w-4 h-4" />
            Buy PocketChart
          </button>
        </div>
      </div>
    </div>
  );
}
