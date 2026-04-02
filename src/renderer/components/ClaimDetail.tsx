import React, { useState, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  FileText,
  Send,
  RefreshCw,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  ChevronDown,
  ChevronRight,
  Code,
  AlertTriangle,
  Zap,
} from 'lucide-react';
import type { Claim, ClaimLine, ClaimStatus, DenialCode } from '../../shared/types';

// Status badge config (same as ClaimsList)
const STATUS_BADGE: Record<ClaimStatus, { bg: string; text: string; label: string }> = {
  draft: { bg: 'bg-gray-100', text: 'text-gray-700', label: 'Draft' },
  ready: { bg: 'bg-blue-50', text: 'text-blue-600', label: 'Ready' },
  validated: { bg: 'bg-blue-100', text: 'text-blue-700', label: 'Validated' },
  submitted: { bg: 'bg-indigo-100', text: 'text-indigo-700', label: 'Submitted' },
  accepted: { bg: 'bg-cyan-100', text: 'text-cyan-700', label: 'Accepted' },
  acknowledged: { bg: 'bg-teal-100', text: 'text-teal-700', label: 'Acknowledged' },
  pending: { bg: 'bg-amber-100', text: 'text-amber-700', label: 'Pending' },
  paid: { bg: 'bg-emerald-100', text: 'text-emerald-700', label: 'Paid' },
  denied: { bg: 'bg-red-100', text: 'text-red-700', label: 'Denied' },
  appeal_in_progress: { bg: 'bg-orange-100', text: 'text-orange-700', label: 'Appeal In Progress' },
  appealed: { bg: 'bg-purple-100', text: 'text-purple-700', label: 'Appealed' },
  rejected: { bg: 'bg-rose-100', text: 'text-rose-700', label: 'Rejected' },
  void: { bg: 'bg-gray-100', text: 'text-gray-500', label: 'Void' },
};

// Timeline step config
const TIMELINE_STEPS: Array<{ status: ClaimStatus; label: string; dateField: keyof Claim }> = [
  { status: 'draft', label: 'Created', dateField: 'created_at' },
  { status: 'validated', label: 'Validated', dateField: 'validated_at' },
  { status: 'submitted', label: 'Submitted', dateField: 'submitted_at' },
  { status: 'accepted', label: 'Accepted', dateField: 'accepted_at' },
  { status: 'paid', label: 'Paid', dateField: 'paid_at' },
];

interface ClaimDetailProps {
  claimId: number;
  onBack: () => void;
  onToast: (msg: string) => void;
  onRefreshList: () => void;
}

function StatusBadge({ status }: { status: ClaimStatus }) {
  const cfg = STATUS_BADGE[status] || STATUS_BADGE.draft;
  return (
    <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${cfg.bg} ${cfg.text}`}>
      {cfg.label}
    </span>
  );
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTime(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}

export default function ClaimDetail({ claimId, onBack, onToast, onRefreshList }: ClaimDetailProps) {
  const [claim, setClaim] = useState<(Claim & { lines: ClaimLine[] }) | null>(null);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [showEdiPreview, setShowEdiPreview] = useState(false);
  const [denialCodes, setDenialCodes] = useState<DenialCode[]>([]);
  const [showDenialInfo, setShowDenialInfo] = useState(false);

  const loadClaim = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.api.claims.get(claimId);
      setClaim(result);

      // If denied, load denial code info
      if (result.rejection_codes && result.status === 'denied') {
        try {
          const codes: string[] = JSON.parse(result.rejection_codes || '[]');
          const codeDetails: DenialCode[] = [];
          for (const code of codes) {
            const detail = await window.api.denialCodes.lookup(code);
            if (detail) codeDetails.push(detail);
          }
          setDenialCodes(codeDetails);
        } catch {
          // ignore parse errors
        }
      }
    } catch (err) {
      console.error('Failed to load claim:', err);
      onToast('Failed to load claim details');
    } finally {
      setLoading(false);
    }
  }, [claimId, onToast]);

  useEffect(() => {
    loadClaim();
  }, [loadClaim]);

  const handleGenerate837P = async () => {
    setActionLoading('generate');
    try {
      const result = await window.api.claims.generate837P(claimId);
      if (result) {
        onToast('837P generated successfully');
        loadClaim();
      }
    } catch (err: any) {
      onToast(err.message || 'Failed to generate 837P');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSubmitClaim = async () => {
    setActionLoading('submit');
    try {
      const result = await window.api.clearinghouse.submitClaim(claimId);
      if (result.success) {
        onToast('Claim submitted to clearinghouse');
        loadClaim();
        onRefreshList();
      } else {
        onToast(result.message || 'Submission failed');
      }
    } catch (err: any) {
      onToast(err.message || 'Failed to submit claim');
    } finally {
      setActionLoading(null);
    }
  };

  const handleCheckStatus = async () => {
    setActionLoading('status');
    try {
      const result = await window.api.clearinghouse.checkClaimStatus(claimId);
      onToast(`Status: ${result.status} — ${result.message}`);
      loadClaim();
    } catch (err: any) {
      onToast(err.message || 'Failed to check status');
    } finally {
      setActionLoading(null);
    }
  };

  const handleDeleteClaim = async () => {
    if (!confirm('Delete this claim? This cannot be undone.')) return;
    setActionLoading('delete');
    try {
      await window.api.claims.delete(claimId);
      onToast('Claim deleted');
      onRefreshList();
      onBack();
    } catch (err: any) {
      onToast(err.message || 'Failed to delete claim');
    } finally {
      setActionLoading(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="w-6 h-6 animate-spin text-[var(--color-primary)]" />
      </div>
    );
  }

  if (!claim) {
    return (
      <div className="text-center py-16">
        <AlertCircle className="w-12 h-12 mx-auto text-[var(--color-text-tertiary)] mb-3" />
        <p className="text-sm text-[var(--color-text-secondary)]">Claim not found</p>
        <button className="btn-ghost text-sm mt-4" onClick={onBack}>Go Back</button>
      </div>
    );
  }

  // Determine which timeline step is active/current
  const statusOrder: ClaimStatus[] = ['draft', 'validated', 'submitted', 'accepted', 'paid'];
  const isDenied = claim.status === 'denied' || claim.status === 'rejected';
  const currentStepIdx = isDenied ? 2 : statusOrder.indexOf(claim.status);

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button className="btn-ghost p-1.5" onClick={onBack} title="Back to claims list">
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-[var(--color-text)]">
              {claim.claim_number || `Claim #${claim.id}`}
            </h2>
            <StatusBadge status={claim.status} />
          </div>
          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
            {claim.client_name} · {claim.payer_name || 'No payer'} · Created {formatDate(claim.created_at)}
          </p>
        </div>
      </div>

      {/* Summary Card */}
      <div className="card p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-[var(--color-text-secondary)]">Service Dates</p>
            <p className="text-sm font-medium text-[var(--color-text)]">
              {formatDate(claim.service_date_start)}
              {claim.service_date_end && claim.service_date_end !== claim.service_date_start
                ? ` – ${formatDate(claim.service_date_end)}`
                : ''}
            </p>
          </div>
          <div>
            <p className="text-xs text-[var(--color-text-secondary)]">Total Charge</p>
            <p className="text-sm font-bold text-[var(--color-text)]">{formatCurrency(claim.total_charge || 0)}</p>
          </div>
          {claim.paid_amount > 0 && (
            <div>
              <p className="text-xs text-[var(--color-text-secondary)]">Paid</p>
              <p className="text-sm font-bold text-emerald-600">{formatCurrency(claim.paid_amount)}</p>
            </div>
          )}
          {claim.adjustment_amount > 0 && (
            <div>
              <p className="text-xs text-[var(--color-text-secondary)]">Adjustment</p>
              <p className="text-sm font-medium text-amber-600">{formatCurrency(claim.adjustment_amount)}</p>
            </div>
          )}
          {claim.patient_responsibility > 0 && (
            <div>
              <p className="text-xs text-[var(--color-text-secondary)]">Patient Responsibility</p>
              <p className="text-sm font-medium text-[var(--color-text)]">{formatCurrency(claim.patient_responsibility)}</p>
            </div>
          )}
        </div>
      </div>

      {/* Action Bar */}
      <div className="flex items-center gap-2 flex-wrap">
        {claim.status === 'draft' && (
          <button
            className="btn-primary text-sm gap-1.5"
            onClick={handleGenerate837P}
            disabled={actionLoading === 'generate'}
          >
            {actionLoading === 'generate' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Zap className="w-4 h-4" />
            )}
            Generate 837P
          </button>
        )}
        {claim.status === 'validated' && (
          <button
            className="btn-primary text-sm gap-1.5"
            onClick={handleSubmitClaim}
            disabled={actionLoading === 'submit'}
          >
            {actionLoading === 'submit' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
            Submit to Clearinghouse
          </button>
        )}
        {['submitted', 'accepted', 'acknowledged', 'pending'].includes(claim.status) && (
          <button
            className="btn-ghost text-sm gap-1.5"
            onClick={handleCheckStatus}
            disabled={actionLoading === 'status'}
          >
            {actionLoading === 'status' ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <RefreshCw className="w-4 h-4" />
            )}
            Check Status
          </button>
        )}
        {isDenied && denialCodes.length > 0 && (
          <button
            className="btn-ghost text-sm gap-1.5 text-red-600"
            onClick={() => setShowDenialInfo(!showDenialInfo)}
          >
            <AlertTriangle className="w-4 h-4" />
            {showDenialInfo ? 'Hide' : 'View'} Denial Codes
          </button>
        )}
        {claim.edi_837_content && (
          <button
            className="btn-ghost text-sm gap-1.5"
            onClick={() => setShowEdiPreview(!showEdiPreview)}
          >
            <Code className="w-4 h-4" />
            {showEdiPreview ? 'Hide' : 'Show'} EDI Preview
          </button>
        )}
        <div className="flex-1" />
        {claim.status === 'draft' && (
          <button
            className="btn-ghost text-sm gap-1.5 text-red-500 hover:text-red-600"
            onClick={handleDeleteClaim}
            disabled={actionLoading === 'delete'}
          >
            <Trash2 className="w-4 h-4" />
            Delete
          </button>
        )}
      </div>

      {/* Denial Info */}
      {showDenialInfo && denialCodes.length > 0 && (
        <div className="card p-4 border-l-4 border-red-400 space-y-3">
          <h3 className="text-sm font-semibold text-red-700 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Denial Information
          </h3>
          {denialCodes.map((dc) => (
            <div key={dc.code} className="bg-red-50 rounded-lg p-3 space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs font-mono font-bold text-red-700 bg-red-100 px-1.5 py-0.5 rounded">
                  {dc.group_code}-{dc.code}
                </span>
                <span className="text-sm font-medium text-red-800">{dc.description}</span>
              </div>
              {dc.plain_english && (
                <p className="text-sm text-red-700">
                  <span className="font-medium">What this means:</span> {dc.plain_english}
                </p>
              )}
              {dc.what_to_do && (
                <p className="text-sm text-red-600">
                  <span className="font-medium">What to do:</span> {dc.what_to_do}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Claim Timeline */}
      <div className="card p-4">
        <h3 className="text-sm font-semibold text-[var(--color-text)] mb-3">Claim Timeline</h3>
        <div className="flex items-center gap-0">
          {TIMELINE_STEPS.map((step, idx) => {
            const dateValue = claim[step.dateField] as string | null;
            const isComplete = idx <= currentStepIdx && !isDenied;
            const isCurrent = idx === currentStepIdx && !isDenied;
            const isCompleteBeforeDenied = isDenied && idx < 3; // created, validated, submitted might be done

            let stepIcon = <Clock className="w-4 h-4" />;
            let stepColor = 'text-[var(--color-text-tertiary)] bg-gray-100';

            if (isDenied && idx === 2 && claim.submitted_at) {
              // Submitted step completed before denial
              stepIcon = <CheckCircle className="w-4 h-4" />;
              stepColor = 'text-white bg-emerald-500';
            } else if (isDenied && step.status === 'paid') {
              stepIcon = <XCircle className="w-4 h-4" />;
              stepColor = 'text-white bg-red-500';
            } else if (isComplete && dateValue) {
              stepIcon = <CheckCircle className="w-4 h-4" />;
              stepColor = 'text-white bg-emerald-500';
            } else if (isCurrent) {
              stepIcon = <Loader2 className="w-4 h-4" />;
              stepColor = 'text-white bg-[var(--color-primary)]';
            } else if (isCompleteBeforeDenied && dateValue) {
              stepIcon = <CheckCircle className="w-4 h-4" />;
              stepColor = 'text-white bg-emerald-500';
            }

            return (
              <React.Fragment key={step.status}>
                <div className="flex flex-col items-center gap-1 min-w-[80px]">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center ${stepColor}`}>
                    {stepIcon}
                  </div>
                  <span className="text-xs font-medium text-[var(--color-text)]">{step.label}</span>
                  {dateValue && (
                    <span className="text-[10px] text-[var(--color-text-secondary)]">
                      {formatDate(dateValue)}
                    </span>
                  )}
                </div>
                {idx < TIMELINE_STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mt-[-20px] ${
                    (isComplete && idx < currentStepIdx) || (isCompleteBeforeDenied && dateValue)
                      ? 'bg-emerald-300'
                      : 'bg-gray-200'
                  }`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
        {isDenied && (
          <div className="mt-3 flex items-center gap-2 text-sm text-red-600 bg-red-50 rounded-lg px-3 py-2">
            <XCircle className="w-4 h-4 flex-shrink-0" />
            Claim was {claim.status === 'rejected' ? 'rejected' : 'denied'}
            {claim.denied_at ? ` on ${formatDate(claim.denied_at)}` : ''}
          </div>
        )}
      </div>

      {/* Line Items */}
      {claim.lines && claim.lines.length > 0 && (
        <div className="card overflow-hidden">
          <div className="px-4 py-3 border-b border-[var(--color-border)]">
            <h3 className="text-sm font-semibold text-[var(--color-text)]">Line Items</h3>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--color-border)] bg-[var(--color-surface)]">
                <th className="text-left text-xs font-medium text-[var(--color-text-secondary)] px-4 py-2">Line</th>
                <th className="text-left text-xs font-medium text-[var(--color-text-secondary)] px-4 py-2">Date</th>
                <th className="text-left text-xs font-medium text-[var(--color-text-secondary)] px-4 py-2">CPT</th>
                <th className="text-left text-xs font-medium text-[var(--color-text-secondary)] px-4 py-2">Modifiers</th>
                <th className="text-right text-xs font-medium text-[var(--color-text-secondary)] px-4 py-2">Units</th>
                <th className="text-right text-xs font-medium text-[var(--color-text-secondary)] px-4 py-2">Charge</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--color-border)]">
              {claim.lines.map((line) => {
                let modifiers: string[] = [];
                try { modifiers = JSON.parse(line.modifiers || '[]'); } catch { /* ignore */ }
                return (
                  <tr key={line.id}>
                    <td className="px-4 py-2 text-sm text-[var(--color-text-secondary)]">{line.line_number}</td>
                    <td className="px-4 py-2 text-sm text-[var(--color-text)]">{formatDate(line.service_date)}</td>
                    <td className="px-4 py-2 text-sm font-medium text-[var(--color-text)]">{line.cpt_code}</td>
                    <td className="px-4 py-2 text-sm text-[var(--color-text-secondary)]">
                      {modifiers.length > 0 ? modifiers.join(', ') : '—'}
                    </td>
                    <td className="px-4 py-2 text-sm text-right text-[var(--color-text)]">{line.units}</td>
                    <td className="px-4 py-2 text-sm text-right font-medium text-[var(--color-text)]">
                      {formatCurrency(line.charge_amount || 0)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-[var(--color-border)] bg-[var(--color-surface)]">
                <td colSpan={5} className="px-4 py-2 text-sm font-semibold text-[var(--color-text)] text-right">Total</td>
                <td className="px-4 py-2 text-sm font-bold text-[var(--color-text)] text-right">
                  {formatCurrency(claim.total_charge || 0)}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* EDI Preview */}
      {showEdiPreview && claim.edi_837_content && (
        <div className="card p-4">
          <h3 className="text-sm font-semibold text-[var(--color-text)] mb-2 flex items-center gap-2">
            <Code className="w-4 h-4" />
            EDI 837P Content
          </h3>
          <pre className="bg-gray-900 text-green-400 text-xs p-4 rounded-lg overflow-x-auto max-h-96 font-mono whitespace-pre-wrap">
            {claim.edi_837_content}
          </pre>
        </div>
      )}

      {/* Additional Info */}
      {(claim.appeal_notes || claim.correction_notes || claim.clearinghouse_claim_id || claim.payer_claim_number) && (
        <div className="card p-4 space-y-3">
          <h3 className="text-sm font-semibold text-[var(--color-text)]">Additional Information</h3>
          {claim.clearinghouse_claim_id && (
            <div>
              <p className="text-xs text-[var(--color-text-secondary)]">Clearinghouse Claim ID</p>
              <p className="text-sm font-mono text-[var(--color-text)]">{claim.clearinghouse_claim_id}</p>
            </div>
          )}
          {claim.payer_claim_number && (
            <div>
              <p className="text-xs text-[var(--color-text-secondary)]">Payer Claim Number</p>
              <p className="text-sm font-mono text-[var(--color-text)]">{claim.payer_claim_number}</p>
            </div>
          )}
          {claim.appeal_notes && (
            <div>
              <p className="text-xs text-[var(--color-text-secondary)]">Appeal Notes</p>
              <p className="text-sm text-[var(--color-text)]">{claim.appeal_notes}</p>
            </div>
          )}
          {claim.correction_notes && (
            <div>
              <p className="text-xs text-[var(--color-text-secondary)]">Correction Notes</p>
              <p className="text-sm text-[var(--color-text)]">{claim.correction_notes}</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
