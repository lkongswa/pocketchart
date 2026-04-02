import React, { useState } from 'react';
import { X, ShieldAlert, ExternalLink, AlertTriangle, CheckCircle } from 'lucide-react';

interface BAAComplianceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAccept: () => void;           // User acknowledges and wants to proceed
  onChooseDifferent: () => void;  // User wants to pick a different folder
  providerDisplayName: string;    // e.g. "Google Drive"
  baaUrl: string | null;          // Link to provider's BAA info
  baaAvailable: boolean;          // false for iCloud
}

/**
 * BAA Compliance Modal
 *
 * Warns users about HIPAA Business Associate Agreement requirements when
 * they select a cloud-synced folder for data storage.
 */
export default function BAAComplianceModal({
  isOpen,
  onClose,
  onAccept,
  onChooseDifferent,
  providerDisplayName,
  baaUrl,
  baaAvailable,
}: BAAComplianceModalProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  if (!isOpen) return null;

  const handleOpenBaaLink = () => {
    if (baaUrl) {
      window.api.shell.openExternal(baaUrl);
    }
  };

  const handleAccept = () => {
    setAcknowledged(false); // Reset for next time
    onAccept();
  };

  const handleChooseDifferent = () => {
    setAcknowledged(false); // Reset for next time
    onChooseDifferent();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40\" onClick={onClose} />

      {/* Modal Panel */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center gap-3 px-6 py-4 bg-amber-50 border-b border-amber-200">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-amber-100">
            <ShieldAlert className="w-5 h-5 text-amber-600" />
          </div>
          <div>
            <h2 className="text-lg font-semibold text-amber-900">
              Cloud Storage Detected
            </h2>
            <p className="text-sm text-amber-700">{providerDisplayName}</p>
          </div>
          <button
            onClick={onClose}
            className="ml-auto p-1 rounded-lg hover:bg-amber-100 text-amber-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-5">
          {baaAvailable ? (
            // Provider offers BAA (Google Drive, Dropbox, OneDrive)
            <>
              <p className="text-sm text-[var(--color-text)] mb-4">
                You have selected a folder synced by{' '}
                <strong>{providerDisplayName}</strong>. If you store PocketChart data here,
                your clinical records will be transmitted to {providerDisplayName}'s servers.
              </p>

              <p className="text-sm text-[var(--color-text)] mb-4">
                Before proceeding, you must:
              </p>

              <ul className="text-sm text-[var(--color-text)] mb-4 space-y-2 ml-4">
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                  <span>
                    Use a <strong>business-tier</strong> {providerDisplayName} account
                    (free accounts cannot be HIPAA-compliant)
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                  <span>
                    Sign a <strong>Business Associate Agreement (BAA)</strong> with{' '}
                    {providerDisplayName} via their admin console
                  </span>
                </li>
                <li className="flex items-start gap-2">
                  <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                  <span>
                    Enable <strong>two-factor authentication</strong> on your{' '}
                    {providerDisplayName} account
                  </span>
                </li>
              </ul>

              <div className="p-3 bg-amber-50 rounded-lg border border-amber-200 mb-4">
                <p className="text-xs text-amber-700">
                  PocketChart cannot verify whether these steps have been completed. You are
                  solely responsible for your HIPAA compliance.
                </p>
              </div>

              {baaUrl && (
                <button
                  onClick={handleOpenBaaLink}
                  className="flex items-center gap-2 text-sm font-medium text-[var(--color-primary)] hover:underline mb-4"
                >
                  <ExternalLink className="w-4 h-4" />
                  {providerDisplayName} BAA Documentation
                </button>
              )}

              {/* Acknowledgment Checkbox */}
              <label className="flex items-start gap-3 p-3 rounded-lg border border-[var(--color-border)] hover:bg-gray-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={acknowledged}
                  onChange={(e) => setAcknowledged(e.target.checked)}
                  className="mt-0.5 w-4 h-4 rounded border-gray-300 text-[var(--color-primary)] accent-[var(--color-primary)]"
                />
                <span className="text-sm text-[var(--color-text)]">
                  I understand that HIPAA compliance with {providerDisplayName} is my
                  sole responsibility
                </span>
              </label>
            </>
          ) : (
            // Provider does NOT offer BAA (iCloud)
            <>
              <div className="flex items-start gap-3 p-4 bg-red-50 rounded-lg border border-red-200 mb-4">
                <AlertTriangle className="w-5 h-5 text-red-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-red-800 mb-2">
                    iCloud Cannot Be Used for PHI
                  </p>
                  <p className="text-sm text-red-700">
                    You have selected a folder synced by Apple iCloud. Apple does{' '}
                    <strong>not</strong> offer Business Associate Agreements (BAAs) for
                    iCloud, which means iCloud <strong>cannot</strong> be used to store
                    Protected Health Information (PHI) under HIPAA.
                  </p>
                </div>
              </div>

              <p className="text-sm text-[var(--color-text)]">
                Please choose a different storage location to continue.
              </p>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 bg-gray-50 border-t border-[var(--color-border)]">
          {baaAvailable ? (
            <>
              <button
                onClick={handleChooseDifferent}
                className="btn-secondary"
              >
                Choose Different Location
              </button>
              <button
                onClick={handleAccept}
                className="btn-primary"
                disabled={!acknowledged}
              >
                Continue Anyway
              </button>
            </>
          ) : (
            <button
              onClick={handleChooseDifferent}
              className="btn-primary"
            >
              Choose Different Location
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
