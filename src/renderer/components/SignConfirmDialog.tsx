import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface SignConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  /** Optional list of validation warnings (non-blocking) */
  warnings?: string[];
  /** Optional list of validation errors (blocking — hides confirm button) */
  errors?: string[];
}

export default function SignConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  warnings = [],
  errors = [],
}: SignConfirmDialogProps) {
  if (!isOpen) return null;

  const hasErrors = errors.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-[var(--color-surface)] rounded-xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-2">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">
            {hasErrors ? 'Cannot Sign Document' : 'Sign & Finalize This Document?'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded hover:bg-gray-100 text-[var(--color-text-secondary)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-6 py-4 space-y-4">
          {hasErrors ? (
            <>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Please fix the following issues before signing:
              </p>
              <div className="space-y-2">
                {errors.map((err, i) => (
                  <div key={i} className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
                    <p className="text-sm text-red-700">{err}</p>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              <p className="text-sm text-[var(--color-text-secondary)]">
                Once signed, this document becomes part of the official medical record
                and cannot be edited. You can add amendments later if needed.
              </p>
              {warnings.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-amber-700">Heads up:</p>
                  {warnings.map((warn, i) => (
                    <div key={i} className="flex items-start gap-2 p-2 bg-amber-50 border border-amber-200 rounded-lg">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-500 flex-shrink-0 mt-0.5" />
                      <p className="text-xs text-amber-700">{warn}</p>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* Actions */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--color-border)]">
          <button
            onClick={onClose}
            className="btn-secondary"
          >
            Go Back
          </button>
          {!hasErrors && (
            <button
              onClick={onConfirm}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border-2 border-amber-500 text-amber-700 bg-white hover:bg-amber-50 transition-colors"
            >
              Sign & Finalize
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
