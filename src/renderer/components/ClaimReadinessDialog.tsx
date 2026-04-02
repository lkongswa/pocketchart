import React from 'react';
import { X, CheckCircle, XCircle, AlertTriangle, FileText } from 'lucide-react';
import type { CMS1500Readiness } from '../../shared/types';

interface ClaimReadinessDialogProps {
  isOpen: boolean;
  onClose: () => void;
  readiness: CMS1500Readiness;
  onGenerate: () => void;
  generating?: boolean;
}

export default function ClaimReadinessDialog({
  isOpen,
  onClose,
  readiness,
  onGenerate,
  generating = false,
}: ClaimReadinessDialogProps) {
  if (!isOpen) return null;

  const statusIcon = (status: 'pass' | 'fail' | 'warn') => {
    switch (status) {
      case 'pass':
        return <CheckCircle className="w-4 h-4 text-emerald-500 shrink-0" />;
      case 'fail':
        return <XCircle className="w-4 h-4 text-red-500 shrink-0" />;
      case 'warn':
        return <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />;
    }
  };

  const statusBg = (status: 'pass' | 'fail' | 'warn') => {
    switch (status) {
      case 'pass':
        return 'bg-emerald-50';
      case 'fail':
        return 'bg-red-50';
      case 'warn':
        return 'bg-amber-50';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <h3 className="text-lg font-semibold text-[var(--color-text)] flex items-center gap-2">
            <FileText size={20} className="text-indigo-500" />
            Claim Pre-Flight Check
          </h3>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-gray-100">
            <X size={20} className="text-[var(--color-text-secondary)]" />
          </button>
        </div>

        {/* Summary */}
        <div className="px-6 py-3 border-b border-[var(--color-border)] bg-gray-50">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              <CheckCircle className="w-4 h-4 text-emerald-500" />
              <span className="text-sm font-medium text-emerald-700">{readiness.passCount} pass</span>
            </div>
            {readiness.failCount > 0 && (
              <div className="flex items-center gap-1.5">
                <XCircle className="w-4 h-4 text-red-500" />
                <span className="text-sm font-medium text-red-700">{readiness.failCount} required</span>
              </div>
            )}
            {readiness.warnCount > 0 && (
              <div className="flex items-center gap-1.5">
                <AlertTriangle className="w-4 h-4 text-amber-500" />
                <span className="text-sm font-medium text-amber-700">{readiness.warnCount} recommended</span>
              </div>
            )}
            <div className="ml-auto">
              {readiness.ready ? (
                <span className="badge bg-emerald-100 text-emerald-700 text-xs font-semibold">
                  Ready to Generate
                </span>
              ) : (
                <span className="badge bg-red-100 text-red-700 text-xs font-semibold">
                  Missing Required Fields
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Checks */}
        <div className="px-6 py-4 overflow-y-auto max-h-[50vh] space-y-1.5">
          {/* Failures first */}
          {readiness.checks.filter(c => c.status === 'fail').map((check) => (
            <div key={check.field} className={`flex items-start gap-2.5 p-2.5 rounded-lg ${statusBg(check.status)}`}>
              {statusIcon(check.status)}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--color-text)]">{check.label}</p>
                {check.message && (
                  <p className="text-xs text-red-600 mt-0.5">{check.message}</p>
                )}
              </div>
            </div>
          ))}

          {/* Warnings */}
          {readiness.checks.filter(c => c.status === 'warn').map((check) => (
            <div key={check.field} className={`flex items-start gap-2.5 p-2.5 rounded-lg ${statusBg(check.status)}`}>
              {statusIcon(check.status)}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-[var(--color-text)]">{check.label}</p>
                {check.message && (
                  <p className="text-xs text-amber-600 mt-0.5">{check.message}</p>
                )}
              </div>
            </div>
          ))}

          {/* Passes */}
          {readiness.checks.filter(c => c.status === 'pass').map((check) => (
            <div key={check.field} className={`flex items-start gap-2.5 p-2 rounded-lg ${statusBg(check.status)}`}>
              {statusIcon(check.status)}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[var(--color-text)]">{check.label}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--color-border)]">
          <button className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary gap-1.5"
            onClick={onGenerate}
            disabled={!readiness.ready || generating}
          >
            <FileText size={14} />
            {generating ? 'Generating...' : 'Preview Claim'}
          </button>
        </div>
      </div>
    </div>
  );
}
