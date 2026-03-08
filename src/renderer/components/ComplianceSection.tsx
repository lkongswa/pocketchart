import React, { useState, useEffect, useCallback } from 'react';
import { Shield, AlertTriangle, CheckCircle, RotateCcw, Settings } from 'lucide-react';
import type { ComplianceTracking, CompliancePreset, RecertSignatureStatus } from '@shared/types';
import RecertStepper from './RecertStepper';

interface ComplianceSectionProps {
  clientId: number;
  /** Show only a specific card: 'progress', 'recert', or undefined for both + settings bar */
  card?: 'progress' | 'recert';
}

const PRESET_LABELS: Record<CompliancePreset, string> = {
  medicare: 'Medicare (10 visits / 30 days, 90-day recert)',
  custom: 'Custom',
  none: 'Disabled',
};

export default function ComplianceSection({ clientId, card }: ComplianceSectionProps) {
  const [compliance, setCompliance] = useState<ComplianceTracking | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [hasEval, setHasEval] = useState(false);

  // Edit form state
  const [preset, setPreset] = useState<CompliancePreset>('none');
  const [progressVisits, setProgressVisits] = useState(10);
  const [progressDays, setProgressDays] = useState(30);
  const [recertDays, setRecertDays] = useState(90);
  const [physicianOrderRequired, setPhysicianOrderRequired] = useState(false);

  const loadCompliance = useCallback(async () => {
    try {
      setLoading(true);
      const [data, evals] = await Promise.all([
        window.api.compliance.getByClient(clientId),
        window.api.evaluations.listByClient(clientId),
      ]);
      setCompliance(data);
      setHasEval(Array.isArray(evals) && evals.length > 0);
      if (data) {
        setPreset(data.compliance_preset);
        setProgressVisits(data.progress_visit_threshold);
        setProgressDays(data.progress_day_threshold);
        setRecertDays(data.recert_day_threshold);
        setPhysicianOrderRequired(data.physician_order_required);
      }
    } catch (err) {
      console.error('Failed to load compliance:', err);
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  useEffect(() => {
    loadCompliance();
  }, [loadCompliance]);

  const handlePresetChange = (newPreset: CompliancePreset) => {
    setPreset(newPreset);
    if (newPreset === 'medicare') {
      setProgressVisits(10);
      setProgressDays(30);
      setRecertDays(90);
      setPhysicianOrderRequired(true);
    } else if (newPreset === 'none') {
      setProgressVisits(0);
      setProgressDays(0);
      setRecertDays(0);
      setPhysicianOrderRequired(false);
    }
  };

  const handleSave = async () => {
    try {
      await window.api.compliance.updateSettings(clientId, {
        tracking_enabled: preset !== 'none',
        compliance_preset: preset,
        progress_visit_threshold: progressVisits,
        progress_day_threshold: progressDays,
        recert_day_threshold: recertDays,
        physician_order_required: physicianOrderRequired,
      });
      setEditing(false);
      loadCompliance();
    } catch (err) {
      console.error('Failed to save compliance settings:', err);
    }
  };

  const handleResetProgressCounter = async () => {
    if (!window.confirm('Reset progress note visit counter to 0? This is typically done after writing a progress report.')) return;
    try {
      await window.api.compliance.resetProgressCounter(clientId);
      loadCompliance();
    } catch (err) {
      console.error('Failed to reset counter:', err);
    }
  };

  const handleResetRecertCounter = async () => {
    if (!window.confirm('Reset recertification date to today? This is typically done after receiving a new physician order.')) return;
    try {
      await window.api.compliance.resetRecertCounter(clientId);
      loadCompliance();
    } catch (err) {
      console.error('Failed to reset recert:', err);
    }
  };

  const handleUpdateSignatureStatus = async (newStatus: RecertSignatureStatus) => {
    try {
      await window.api.compliance.updateSignatureStatus(clientId, newStatus);
      loadCompliance();
    } catch (err) {
      console.error('Failed to update signature status:', err);
    }
  };

  const handleClearEvalGate = async () => {
    try {
      await window.api.compliance.clearEvalGate(clientId, true);
      loadCompliance();
    } catch (err) {
      console.error('Failed to clear eval gate:', err);
    }
  };

  if (loading) {
    return <div className="text-sm text-[var(--color-text-secondary)]">Loading compliance data...</div>;
  }

  // Settings form
  if (editing) {
    return (
      <div className="card p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="section-title flex items-center gap-2">
            <Settings size={16} className="text-[var(--color-primary)]" />
            Compliance Settings
          </h3>
        </div>

        <div>
          <label className="label">Compliance Preset</label>
          <select
            className="select w-full"
            value={preset}
            onChange={(e) => handlePresetChange(e.target.value as CompliancePreset)}
          >
            <option value="none">Disabled</option>
            <option value="medicare">Medicare (10 visits / 30 days, 90-day recert)</option>
            <option value="custom">Custom</option>
          </select>
        </div>

        {preset !== 'none' && (
          <>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="label">Progress Report: Visit Threshold</label>
                <input
                  type="number"
                  className="input w-full"
                  min={0}
                  value={progressVisits}
                  onChange={(e) => setProgressVisits(parseInt(e.target.value, 10) || 0)}
                  disabled={preset === 'medicare'}
                />
              </div>
              <div>
                <label className="label">Progress Report: Day Threshold</label>
                <input
                  type="number"
                  className="input w-full"
                  min={0}
                  value={progressDays}
                  onChange={(e) => setProgressDays(parseInt(e.target.value, 10) || 0)}
                  disabled={preset === 'medicare'}
                />
              </div>
              <div>
                <label className="label">Recertification: Day Threshold</label>
                <input
                  type="number"
                  className="input w-full"
                  min={0}
                  value={recertDays}
                  onChange={(e) => setRecertDays(parseInt(e.target.value, 10) || 0)}
                  disabled={preset === 'medicare'}
                />
              </div>
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={physicianOrderRequired}
                onChange={(e) => setPhysicianOrderRequired(e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 accent-[var(--color-primary)]"
              />
              <span className="text-sm text-[var(--color-text)]">Physician order / referral required</span>
            </label>
          </>
        )}

        <div className="flex justify-end gap-2">
          <button className="btn-secondary btn-sm" onClick={() => setEditing(false)}>Cancel</button>
          <button className="btn-primary btn-sm" onClick={handleSave}>Save Settings</button>
        </div>
      </div>
    );
  }

  // No compliance data or not enabled
  if (!compliance || !compliance.tracking_enabled) {
    // When rendering a single card in split mode, show nothing if disabled
    if (card) return null;
    return (
      <div className="card p-6 text-center">
        <Shield size={32} className="mx-auto text-[var(--color-text-secondary)] mb-3 opacity-40" />
        <p className="text-sm text-[var(--color-text-secondary)] mb-3">
          Compliance tracking is not enabled for this client.
        </p>
        <button className="btn-primary btn-sm" onClick={() => setEditing(true)}>
          Enable Compliance Tracking
        </button>
      </div>
    );
  }

  // Progress status
  const progressDue = compliance.next_progress_due ? new Date(compliance.next_progress_due) : null;
  const recertDue = compliance.next_recert_due ? new Date(compliance.next_recert_due) : null;
  const now = new Date();
  const progressOverdue = progressDue && progressDue < now;
  const recertOverdue = recertDue && recertDue < now;

  // ── Single-card mode: render just one card inline ──
  if (card === 'progress') {
    return (
      <div className={`card p-3 border-l-4 ${progressOverdue ? 'border-l-red-400 bg-red-50/50' : 'border-l-green-400 bg-green-50/50'}`}>
        <div className="flex items-center justify-between mb-1">
          <h4 className="text-xs font-semibold text-[var(--color-text)] flex items-center gap-1.5">
            {progressOverdue ? <AlertTriangle size={12} className="text-red-500" /> : <CheckCircle size={12} className="text-green-500" />}
            Progress Report
          </h4>
          <button className="btn-ghost p-1" onClick={handleResetProgressCounter} title="Reset counter">
            <RotateCcw size={11} />
          </button>
        </div>
        <div className="space-y-0.5 text-xs">
          <p className="text-[var(--color-text)]">
            Visits since last: <strong>{compliance.visits_since_last_progress}</strong> / {compliance.progress_visit_threshold}
          </p>
          {progressDue && (
            <p className={progressOverdue ? 'text-red-600 font-medium' : 'text-[var(--color-text-secondary)]'}>
              {progressOverdue ? 'OVERDUE' : 'Due'}: {progressDue.toLocaleDateString()}
            </p>
          )}
        </div>
      </div>
    );
  }

  if (card === 'recert') {
    return (
      <RecertStepper
        compliance={compliance}
        hasEval={hasEval}
        compact
        onAdvanceStatus={handleUpdateSignatureStatus}
        onClearEvalGate={handleClearEvalGate}
        onResetRecert={handleResetRecertCounter}
        onEditSettings={() => setEditing(true)}
      />
    );
  }

  // ── Default: both cards in a grid with settings bar ──
  return (
    <div className="space-y-4">
      {/* Status Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Progress Report Status */}
        <div className={`card p-4 border-l-4 ${progressOverdue ? 'border-l-red-400 bg-red-50/50' : 'border-l-green-400 bg-green-50/50'}`}>
          <div className="flex items-center justify-between mb-2">
            <h4 className="text-sm font-semibold text-[var(--color-text)] flex items-center gap-1.5">
              {progressOverdue ? <AlertTriangle size={14} className="text-red-500" /> : <CheckCircle size={14} className="text-green-500" />}
              Progress Report
            </h4>
            <button className="btn-ghost btn-sm" onClick={handleResetProgressCounter} title="Reset counter">
              <RotateCcw size={12} />
            </button>
          </div>
          <div className="space-y-1 text-xs">
            <p className="text-[var(--color-text)]">
              Visits since last: <strong>{compliance.visits_since_last_progress}</strong> / {compliance.progress_visit_threshold}
            </p>
            {compliance.last_progress_date && (
              <p className="text-[var(--color-text-secondary)]">
                Last progress: {new Date(compliance.last_progress_date).toLocaleDateString()}
              </p>
            )}
            {progressDue && (
              <p className={progressOverdue ? 'text-red-600 font-medium' : 'text-[var(--color-text-secondary)]'}>
                {progressOverdue ? 'OVERDUE' : 'Due'}: {progressDue.toLocaleDateString()}
              </p>
            )}
          </div>
        </div>

        {/* Recertification Status */}
        <RecertStepper
          compliance={compliance}
          hasEval={hasEval}
          onAdvanceStatus={handleUpdateSignatureStatus}
          onClearEvalGate={handleClearEvalGate}
          onResetRecert={handleResetRecertCounter}
          onEditSettings={() => setEditing(true)}
        />
      </div>

      {/* Info bar */}
      <div className="flex items-center justify-between">
        <p className="text-xs text-[var(--color-text-secondary)]">
          Preset: {PRESET_LABELS[compliance.compliance_preset]}
          {compliance.physician_order_required && ' · Physician order required'}
        </p>
        <button className="btn-ghost btn-sm text-xs" onClick={() => setEditing(true)}>
          <Settings size={12} className="mr-1" /> Edit Settings
        </button>
      </div>
    </div>
  );
}
