import React from 'react';
import { AlertTriangle, ShieldAlert, Download, X } from 'lucide-react';

interface IntegrityWarningDialogProps {
  quickCheckPassed: boolean;
  quickCheckResult: string;
  fullCheckPassed?: boolean;
  fullCheckResult?: string;
  fullCheckRan: boolean;
  onDismiss: () => void;
}

const IntegrityWarningDialog: React.FC<IntegrityWarningDialogProps> = ({
  quickCheckPassed,
  quickCheckResult,
  fullCheckPassed,
  fullCheckResult,
  fullCheckRan,
  onDismiss,
}) => {
  const isCritical = !quickCheckPassed;
  const accentColor = isCritical ? '#dc2626' : '#d97706'; // red or amber

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl max-w-lg w-full mx-4 overflow-hidden">
        {/* Header */}
        <div
          className="px-6 py-5 flex items-center gap-3"
          style={{ backgroundColor: isCritical ? '#fef2f2' : '#fffbeb' }}
        >
          <div
            className="w-12 h-12 rounded-full flex items-center justify-center"
            style={{ backgroundColor: isCritical ? '#fee2e2' : '#fef3c7' }}
          >
            {isCritical ? (
              <ShieldAlert size={24} style={{ color: accentColor }} />
            ) : (
              <AlertTriangle size={24} style={{ color: accentColor }} />
            )}
          </div>
          <div>
            <h2 className="text-lg font-bold text-gray-900">
              {isCritical ? 'Database Integrity Issue Detected' : 'Database Check Warning'}
            </h2>
            <p className="text-sm text-gray-600 mt-0.5">
              {isCritical
                ? 'A problem was found during the startup integrity check.'
                : 'The weekly integrity check found a potential issue.'}
            </p>
          </div>
        </div>

        {/* Content */}
        <div className="px-6 py-5 space-y-4">
          {/* Quick Check Result */}
          {!quickCheckPassed && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-red-800 mb-1">Quick Check Failed</p>
              <p className="text-sm text-red-700 font-mono break-all">{quickCheckResult}</p>
            </div>
          )}

          {/* Full Check Result */}
          {fullCheckRan && fullCheckPassed === false && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
              <p className="text-sm font-semibold text-amber-800 mb-1">Integrity Check Failed</p>
              <p className="text-sm text-amber-700 font-mono break-all">{fullCheckResult}</p>
            </div>
          )}

          {/* Recommendation */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <p className="text-sm font-semibold text-blue-800 mb-2">Recommended Actions</p>
            <ul className="text-sm text-blue-700 space-y-1.5">
              <li className="flex items-start gap-2">
                <Download size={14} className="mt-0.5 flex-shrink-0" />
                <span>
                  Export a backup immediately from <strong>Settings &gt; Backup &amp; Export</strong>
                </span>
              </li>
              <li className="flex items-start gap-2">
                <ShieldAlert size={14} className="mt-0.5 flex-shrink-0" />
                <span>
                  If data appears corrupted or missing, restore from your most recent backup
                </span>
              </li>
            </ul>
          </div>

          <p className="text-xs text-gray-500">
            This event has been recorded in the audit log. If the issue persists, consider restoring from a known-good backup.
          </p>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-gray-50 border-t border-gray-200 flex justify-end">
          <button
            onClick={onDismiss}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={{
              backgroundColor: isCritical ? '#dc2626' : '#d97706',
              color: 'white',
            }}
          >
            <X size={16} />
            Continue Anyway
          </button>
        </div>
      </div>
    </div>
  );
};

export default IntegrityWarningDialog;
