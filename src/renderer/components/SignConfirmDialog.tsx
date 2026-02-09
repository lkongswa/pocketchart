import React, { useState, useCallback, useMemo } from 'react';
import { AlertTriangle, CheckCircle, X, XCircle, AlertOctagon, ChevronDown, ChevronRight, Check } from 'lucide-react';
import type { ValidationIssue, ValidationFixes } from '../../shared/types/validation';
import { ISSUE_TO_FIELD_MAP, ISSUE_TO_CLIENT_FIELD_MAP } from '../../shared/types/validation';
import {
  TextareaEditor,
  SelectEditor,
  DateEditor,
  ComposedEditor,
  FreqDurationEditor,
  GoalStatusEditor,
  GoalPerfEditor,
  ICD10SearchEditor,
} from './fix-it-editors';

interface SignConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (fixes: ValidationFixes) => void;
  onSaveAndClose?: (fixes: ValidationFixes) => void;
  issues: ValidationIssue[];
  onClientUpdate?: (updates: Record<string, any>) => Promise<void>;
  clientName?: string;
}

export default function SignConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  onSaveAndClose,
  issues,
  onClientUpdate,
  clientName,
}: SignConfirmDialogProps) {
  const [fixes, setFixes] = useState<Record<string, any>>({});
  const [confirmedIds, setConfirmedIds] = useState<Set<string>>(new Set());
  // Start with all fixable issues expanded so editors are visible
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() =>
    new Set(issues.filter(i => i.fixable).map(i => i.id))
  );

  const updateFix = useCallback((issueId: string, value: any) => {
    setFixes(prev => ({ ...prev, [issueId]: value }));
  }, []);

  // Whether the fix has meaningful content entered (but not necessarily confirmed)
  const hasContent = useCallback((issue: ValidationIssue): boolean => {
    if (!issue.fixable) return false;
    const fix = fixes[issue.id];
    if (fix === undefined || fix === null) return false;
    if (typeof fix === 'string') return fix.trim().length > 0;
    if (typeof fix === 'object' && fix.composed !== undefined) return fix.composed.trim().length > 0;
    if (typeof fix === 'object' && fix.code !== undefined) return fix.code.trim().length > 0;
    if (typeof fix === 'object') {
      const vals = Object.values(fix);
      return vals.length > 0 && vals.every((v: any) => typeof v === 'string' ? v.trim().length > 0 : !!v);
    }
    return true;
  }, [fixes]);

  // Resolved = has content AND user clicked the confirm checkmark
  const isResolved = useCallback((issue: ValidationIssue): boolean => {
    return confirmedIds.has(issue.id) && hasContent(issue);
  }, [confirmedIds, hasContent]);

  const toggleConfirm = useCallback((issueId: string) => {
    setConfirmedIds(prev => {
      const next = new Set(prev);
      if (next.has(issueId)) {
        next.delete(issueId);
        // Re-expand so user can edit again
        setExpandedIds(p => { const n = new Set(p); n.add(issueId); return n; });
      } else {
        next.add(issueId);
        // Collapse on confirm
        setExpandedIds(p => { const n = new Set(p); n.delete(issueId); return n; });
      }
      return next;
    });
  }, []);

  const toggleExpanded = useCallback((issueId: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(issueId)) next.delete(issueId);
      else next.add(issueId);
      return next;
    });
  }, []);

  const errors = useMemo(() => issues.filter(i => i.severity === 'error'), [issues]);
  const warnings = useMemo(() => issues.filter(i => i.severity === 'warning'), [issues]);
  const fixableErrors = useMemo(() => errors.filter(i => i.fixable), [errors]);
  const unfixableErrors = useMemo(() => errors.filter(i => !i.fixable), [errors]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const unresolvedErrors = useMemo(() =>
    errors.filter(i => i.fixable ? !isResolved(i) : true),
    [errors, isResolved, fixes]
  );

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const resolvedFixableCount = useMemo(() =>
    fixableErrors.filter(i => isResolved(i)).length,
    [fixableErrors, isResolved, fixes]
  );

  const hasOnlyUnfixable = unfixableErrors.length > 0 && fixableErrors.length === 0;
  const allErrorsResolved = unresolvedErrors.length === 0;
  const isClean = issues.length === 0;
  // Blocked: all errors are unfixable, or there are unfixable errors among unresolved
  const isBlocked = hasOnlyUnfixable || (unfixableErrors.length > 0 && unresolvedErrors.some(i => !i.fixable));

  // Build the validation fixes object from current fix entries
  const buildValidationFixes = useCallback((): ValidationFixes => {
    const validationFixes: ValidationFixes = {
      documentFixes: {},
      clientFixes: {},
      goalFixes: {},
    };

    for (const issue of issues) {
      const fix = fixes[issue.id];
      if (fix === undefined) continue;

      switch (issue.target) {
        case 'document': {
          const fieldName = ISSUE_TO_FIELD_MAP[issue.id];
          if (fieldName) {
            if (issue.fieldType === 'composed') {
              validationFixes.documentFixes[fieldName] = fix.composed;
            } else if (issue.fieldType === 'goal_status') {
              for (const [goalId, status] of Object.entries(fix)) {
                validationFixes.goalFixes[Number(goalId)] = {
                  ...(validationFixes.goalFixes[Number(goalId)] || {}),
                  status_at_report: status,
                };
              }
            } else if (issue.fieldType === 'goal_perf') {
              for (const [goalId, perfText] of Object.entries(fix)) {
                validationFixes.goalFixes[Number(goalId)] = {
                  ...(validationFixes.goalFixes[Number(goalId)] || {}),
                  performance_data: perfText,
                };
              }
            } else {
              validationFixes.documentFixes[fieldName] = fix;
            }
          }
          break;
        }
        case 'client': {
          const clientField = ISSUE_TO_CLIENT_FIELD_MAP[issue.id];
          if (clientField) {
            if (issue.fieldType === 'icd10_search') {
              validationFixes.clientFixes['primary_dx_code'] = fix.code;
              validationFixes.clientFixes['primary_dx_description'] = fix.description;
            } else {
              validationFixes.clientFixes[clientField] = fix;
            }
          }
          break;
        }
      }
    }
    return validationFixes;
  }, [issues, fixes]);

  // Whether any fixes have been entered at all
  const hasAnyFixes = useMemo(() =>
    Object.keys(fixes).some(id => {
      const fix = fixes[id];
      if (fix === undefined || fix === null) return false;
      if (typeof fix === 'string') return fix.trim().length > 0;
      if (typeof fix === 'object' && fix.composed !== undefined) return fix.composed.trim().length > 0;
      if (typeof fix === 'object' && fix.code !== undefined) return fix.code.trim().length > 0;
      if (typeof fix === 'object') return Object.values(fix).some((v: any) => typeof v === 'string' ? v.trim().length > 0 : !!v);
      return true;
    }),
    [fixes]
  );

  const handleFixAndSign = async () => {
    const validationFixes = buildValidationFixes();

    // Apply client fixes via IPC
    if (Object.keys(validationFixes.clientFixes).length > 0 && onClientUpdate) {
      await onClientUpdate(validationFixes.clientFixes);
    }

    onConfirm(validationFixes);
  };

  const handleSaveAndClose = async () => {
    if (!onSaveAndClose) return;
    const validationFixes = buildValidationFixes();

    // Apply client fixes via IPC
    if (Object.keys(validationFixes.clientFixes).length > 0 && onClientUpdate) {
      await onClientUpdate(validationFixes.clientFixes);
    }

    onSaveAndClose(validationFixes);
  };

  if (!isOpen) return null;

  const renderEditor = (issue: ValidationIssue) => {
    switch (issue.fieldType) {
      case 'textarea':
        return (
          <TextareaEditor
            issueId={issue.id}
            currentValue={issue.currentValue || ''}
            placeholder={issue.hint}
            hint={issue.hint}
            onChange={updateFix}
          />
        );
      case 'select':
      case 'select_gender':
        return (
          <SelectEditor
            issueId={issue.id}
            currentValue={issue.currentValue || ''}
            options={issue.options || []}
            onChange={updateFix}
          />
        );
      case 'date':
        return (
          <DateEditor
            issueId={issue.id}
            currentValue={issue.currentValue || ''}
            hint={issue.hint}
            onChange={updateFix}
          />
        );
      case 'composed':
        return (
          <ComposedEditor
            issueId={issue.id}
            currentValue={issue.currentValue || ''}
            selectOptions={issue.composedSelectOptions || []}
            chipOptions={issue.chipOptions || []}
            hint={issue.hint}
            onChange={updateFix}
          />
        );
      case 'freq_duration':
        return (
          <FreqDurationEditor
            issueId={issue.id}
            currentValue={issue.currentValue || ''}
            onChange={updateFix}
          />
        );
      case 'icd10_search':
        return (
          <ICD10SearchEditor
            issueId={issue.id}
            onChange={updateFix}
          />
        );
      case 'goal_status':
        return (
          <GoalStatusEditor
            issueId={issue.id}
            goals={issue.goalContext || []}
            onChange={updateFix}
          />
        );
      case 'goal_perf':
        return (
          <GoalPerfEditor
            issueId={issue.id}
            goals={issue.goalContext || []}
            onChange={updateFix}
          />
        );
      default:
        return null;
    }
  };

  const renderIssueRow = (issue: ValidationIssue) => {
    const resolved = issue.fixable && isResolved(issue);
    const confirmed = confirmedIds.has(issue.id);
    const hasFix = issue.fixable && hasContent(issue);
    const isError = issue.severity === 'error';
    const isExpanded = expandedIds.has(issue.id);

    // Unfixable issues render simply
    if (!issue.fixable) {
      return (
        <div key={issue.id} className={`rounded-lg border transition-all ${
          isError ? 'border-red-200 bg-red-50/50' : 'border-amber-200 bg-amber-50/50'
        }`}>
          <div className="flex items-start gap-2 px-3 py-2.5">
            {isError ? (
              <XCircle className="w-4 h-4 text-red-500 shrink-0 mt-0.5" />
            ) : (
              <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
            )}
            <div className="flex-1 min-w-0">
              <p className={`text-sm font-medium ${isError ? 'text-red-700' : 'text-amber-700'}`}>
                {issue.message}
              </p>
              {issue.guidance && (
                <p className="text-xs text-[var(--color-text-secondary)] mt-1 italic">
                  {issue.guidance}
                </p>
              )}
            </div>
          </div>
        </div>
      );
    }

    // Fixable issues: collapsible with confirm checkmark
    return (
      <div key={issue.id} className={`rounded-lg border transition-all ${
        resolved
          ? 'border-green-200 bg-green-50/50'
          : isError
            ? 'border-red-200 bg-red-50/50'
            : 'border-amber-200 bg-amber-50/50'
      }`}>
        {/* Header row — clickable to expand/collapse */}
        <div
          className="flex items-center gap-2 px-3 py-2.5 cursor-pointer select-none"
          onClick={() => { if (!confirmed) toggleExpanded(issue.id); }}
        >
          {resolved ? (
            <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
          ) : isError ? (
            <XCircle className="w-4 h-4 text-red-500 shrink-0" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0" />
          )}
          <p className={`text-sm font-medium flex-1 ${
            resolved ? 'text-green-700 line-through' : isError ? 'text-red-700' : 'text-amber-700'
          }`}>
            {issue.message}
          </p>
          <div className="flex items-center gap-1.5 shrink-0">
            {/* Confirm / unconfirm button */}
            {hasFix && (
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); toggleConfirm(issue.id); }}
                className={`p-1 rounded-md transition-colors ${
                  confirmed
                    ? 'bg-green-100 text-green-600 hover:bg-green-200'
                    : 'bg-gray-100 text-gray-400 hover:bg-green-50 hover:text-green-500'
                }`}
                title={confirmed ? 'Unconfirm — reopen to edit' : 'Confirm this fix'}
              >
                <Check className="w-3.5 h-3.5" />
              </button>
            )}
            {/* Expand chevron (only when not confirmed) */}
            {!confirmed && (
              isExpanded
                ? <ChevronDown className="w-4 h-4 text-[var(--color-text-secondary)]" />
                : <ChevronRight className="w-4 h-4 text-[var(--color-text-secondary)]" />
            )}
          </div>
        </div>

        {/* Editor — shown when expanded and not confirmed */}
        {isExpanded && !confirmed && (
          <div className="px-3 pb-3">
            {renderEditor(issue)}
          </div>
        )}
      </div>
    );
  };

  // ─── State 1: Clean sign (no issues) ───
  if (isClean) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-[var(--color-surface)] rounded-xl shadow-xl max-w-md w-full mx-4 overflow-hidden">
          <div className="flex items-center justify-between px-6 pt-5 pb-2">
            <h2 className="text-lg font-semibold text-[var(--color-text)]">
              {clientName ? `Sign & Finalize for ${clientName}?` : 'Sign & Finalize This Document?'}
            </h2>
            <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-[var(--color-text-secondary)]">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="px-6 py-4">
            <p className="text-sm text-[var(--color-text-secondary)]">
              Once signed, this document becomes part of the official medical record
              and cannot be edited. You can add amendments later if needed.
            </p>
          </div>
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--color-border)]">
            <button onClick={onClose} className="btn-secondary">Go Back</button>
            <button
              onClick={() => onConfirm({ documentFixes: {}, clientFixes: {}, goalFixes: {} })}
              className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border-2 border-amber-500 text-amber-700 bg-white hover:bg-amber-50 transition-colors"
            >
              Sign & Finalize
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── State 4: Only unfixable errors (no sign possible) ───
  if (isBlocked) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
        <div className="bg-[var(--color-surface)] rounded-xl shadow-xl max-w-lg w-full mx-4 overflow-hidden max-h-[85vh] flex flex-col">
          <div className="flex items-center justify-between px-6 pt-5 pb-2 shrink-0">
            <h2 className="text-lg font-semibold text-red-700 flex items-center gap-2">
              <AlertOctagon className="w-5 h-5" /> {clientName ? `Cannot Sign Document for ${clientName}` : 'Cannot Sign Document'}
            </h2>
            <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-[var(--color-text-secondary)]">
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="px-6 py-4 space-y-2 overflow-y-auto flex-1">
            {unfixableErrors.map(issue => renderIssueRow(issue))}
            {/* Also show fixable issues if any — user can fix those here */}
            {fixableErrors.length > 0 && fixableErrors.map(issue => renderIssueRow(issue))}
          </div>
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--color-border)] shrink-0">
            <button onClick={onClose} className="btn-secondary">Go Back</button>
            {onSaveAndClose && hasAnyFixes && (
              <button
                onClick={handleSaveAndClose}
                className="px-4 py-2 text-sm font-medium rounded-lg border-2 border-blue-400 text-blue-700 bg-white hover:bg-blue-50 transition-colors"
              >
                Save & Go Back
              </button>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ─── State 2 & 3: Has fixable issues ───
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="bg-[var(--color-surface)] rounded-xl shadow-xl max-w-2xl w-full mx-4 overflow-hidden max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-5 pb-2 shrink-0">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">
            {allErrorsResolved
              ? (clientName ? `All Required Fields Complete for ${clientName}` : 'All Required Fields Complete')
              : (clientName ? `Almost Ready \u2014 Fix These to Sign for ${clientName}` : 'Almost Ready \u2014 Fix These to Sign')}
          </h2>
          <button onClick={onClose} className="p-1 rounded hover:bg-gray-100 text-[var(--color-text-secondary)]">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="px-6 py-4 space-y-3 overflow-y-auto flex-1">
          {/* Errors first */}
          {errors.map(issue => renderIssueRow(issue))}

          {/* Warnings second */}
          {warnings.length > 0 && (
            <>
              {errors.length > 0 && <div className="border-t border-[var(--color-border)]/50 my-1" />}
              {warnings.map(issue => renderIssueRow(issue))}
            </>
          )}
        </div>

        {/* Progress bar */}
        {fixableErrors.length > 0 && (
          <div className="px-6 py-2 shrink-0">
            <div className="flex items-center justify-between text-xs text-[var(--color-text-secondary)] mb-1">
              <span>{resolvedFixableCount}/{fixableErrors.length} required items resolved</span>
              {allErrorsResolved && <span className="text-green-600 font-medium">Ready to sign</span>}
            </div>
            <div className="h-1.5 bg-gray-200 rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all duration-300 ${
                  allErrorsResolved
                    ? 'bg-green-500'
                    : resolvedFixableCount >= fixableErrors.length / 2
                      ? 'bg-amber-500'
                      : 'bg-red-500'
                }`}
                style={{ width: `${fixableErrors.length > 0 ? (resolvedFixableCount / fixableErrors.length) * 100 : 100}%` }}
              />
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-[var(--color-border)] shrink-0">
          <p className="text-xs text-[var(--color-text-secondary)] max-w-sm">
            {allErrorsResolved
              ? 'Once signed, this document becomes part of the official medical record and cannot be edited.'
              : 'Fill in the required fields above to enable signing.'}
          </p>
          <div className="flex items-center gap-3">
            <button onClick={onClose} className="btn-secondary">Go Back</button>
            {onSaveAndClose && (
              <button
                onClick={handleSaveAndClose}
                disabled={!hasAnyFixes}
                className={`px-4 py-2 text-sm font-medium rounded-lg border-2 transition-colors ${
                  hasAnyFixes
                    ? 'border-blue-400 text-blue-700 bg-white hover:bg-blue-50'
                    : 'border-gray-300 text-gray-400 bg-gray-50 cursor-not-allowed'
                }`}
              >
                Save & Go Back
              </button>
            )}
            <button
              onClick={handleFixAndSign}
              disabled={!allErrorsResolved}
              className={`flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border-2 transition-colors ${
                allErrorsResolved
                  ? 'border-green-500 text-green-700 bg-white hover:bg-green-50'
                  : 'border-gray-300 text-gray-400 bg-gray-50 cursor-not-allowed'
              }`}
            >
              Fix & Sign
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
