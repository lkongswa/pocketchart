import React, { useState, useEffect } from 'react';
import { X, Package, DollarSign, Percent, AlertTriangle } from 'lucide-react';
import type { ClientDiscount, DiscountType, DiscountTemplate, FeeScheduleEntry } from '../../shared/types';

interface ClientDiscountModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (discount: ClientDiscount) => void;
  clientId: number;
  clientHasInsurance?: boolean;
  existingDiscounts?: ClientDiscount[];
}

export default function ClientDiscountModal({
  isOpen,
  onClose,
  onSave,
  clientId,
  clientHasInsurance,
  existingDiscounts = [],
}: ClientDiscountModalProps) {
  const [discountType, setDiscountType] = useState<DiscountType>('package');
  const [showConfirm, setShowConfirm] = useState(false);
  const [label, setLabel] = useState('');
  const [notes, setNotes] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));
  const [endDate, setEndDate] = useState('');

  // Package fields
  const [paidSessions, setPaidSessions] = useState(10);
  const [freeSessions, setFreeSessions] = useState(2);
  const [sessionRate, setSessionRate] = useState(0);

  // Flat rate fields
  const [flatRate, setFlatRate] = useState(0);
  const [flatRateSessions, setFlatRateSessions] = useState(10);

  // Persistent fields
  const [persistentMode, setPersistentMode] = useState<'percent' | 'fixed'>('percent');
  const [discountPercent, setDiscountPercent] = useState(10);
  const [discountFixed, setDiscountFixed] = useState(0);

  // Templates
  const [templates, setTemplates] = useState<DiscountTemplate[]>([]);
  const [feeSchedule, setFeeSchedule] = useState<FeeScheduleEntry[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen) {
      window.api.discountTemplates.list().then(setTemplates).catch(() => {});
      window.api.feeSchedule.list().then((fees) => {
        setFeeSchedule(fees);
        // Default to the first fee's rate
        if (fees.length > 0 && sessionRate === 0) {
          setSessionRate(fees[0].amount);
          setFlatRate(fees[0].amount);
        }
      }).catch(() => {});
    }
  }, [isOpen]);

  const applyTemplate = (template: DiscountTemplate) => {
    setDiscountType(template.discount_type);
    if (template.discount_type === 'package') {
      setPaidSessions(template.paid_sessions || 10);
      setFreeSessions((template.total_sessions || 12) - (template.paid_sessions || 10));
      setSessionRate(template.session_rate || 0);
    } else if (template.discount_type === 'flat_rate') {
      setFlatRate(template.flat_rate || 0);
      setFlatRateSessions(template.flat_rate_sessions || 10);
    } else if (template.discount_type === 'persistent') {
      if (template.discount_percent) {
        setPersistentMode('percent');
        setDiscountPercent(template.discount_percent);
      } else {
        setPersistentMode('fixed');
        setDiscountFixed(template.discount_fixed || 0);
      }
    }
    setLabel(template.name);
  };

  const doSave = async () => {
    setSaving(true);
    try {
      const data: Partial<ClientDiscount> = {
        client_id: clientId,
        discount_type: discountType,
        label: label || getAutoLabel(),
        start_date: startDate || null,
        end_date: endDate || null,
        notes,
        status: 'active',
      };

      if (discountType === 'package') {
        data.total_sessions = paidSessions + freeSessions;
        data.paid_sessions = paidSessions;
        data.session_rate = sessionRate;
        data.sessions_used = 0;
      } else if (discountType === 'flat_rate') {
        data.flat_rate = flatRate;
        data.flat_rate_sessions = flatRateSessions;
        data.flat_rate_sessions_used = 0;
      } else if (discountType === 'persistent') {
        if (persistentMode === 'percent') {
          data.discount_percent = discountPercent;
        } else {
          data.discount_fixed = discountFixed;
        }
      }

      const result = await window.api.clientDiscounts.create(data);
      onSave(result);
      onClose();
    } catch (err) {
      console.error('Failed to create discount:', err);
    } finally {
      setSaving(false);
      setShowConfirm(false);
    }
  };

  const handleSave = () => {
    if (existingDiscounts.length > 0) {
      setShowConfirm(true);
    } else {
      doSave();
    }
  };

  const getAutoLabel = () => {
    if (discountType === 'package') {
      return `${paidSessions}+${freeSessions} Package`;
    } else if (discountType === 'flat_rate') {
      return `$${flatRate}/session for ${flatRateSessions} sessions`;
    } else {
      return persistentMode === 'percent'
        ? `${discountPercent}% discount`
        : `$${discountFixed} off per session`;
    }
  };

  const getEffectiveRate = () => {
    if (discountType === 'package') {
      const total = paidSessions + freeSessions;
      return total > 0 ? Math.round((paidSessions * sessionRate) / total * 100) / 100 : 0;
    }
    return 0;
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">
            Add Package / Discount
          </h2>
          <button onClick={onClose} className="btn-ghost btn-sm">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
          {/* Insurance warning */}
          {clientHasInsurance && (
            <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700">
                This client has insurance on file. Session packages and discounts are typically used for private pay clients.
              </p>
            </div>
          )}

          {/* Template selector */}
          {templates.length > 0 && (
            <div>
              <label className="label">Apply Template</label>
              <select
                className="select"
                onChange={(e) => {
                  const t = templates.find(t => t.id === parseInt(e.target.value));
                  if (t) applyTemplate(t);
                }}
                defaultValue=""
              >
                <option value="">Choose a template...</option>
                {templates.map(t => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Discount type tabs */}
          <div>
            <label className="label">Discount Type</label>
            <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
              {([
                { type: 'package' as const, icon: Package, label: 'Package' },
                { type: 'flat_rate' as const, icon: DollarSign, label: 'Flat Rate' },
                { type: 'persistent' as const, icon: Percent, label: 'Ongoing' },
              ]).map(({ type, icon: Icon, label: tabLabel }) => (
                <button
                  key={type}
                  onClick={() => setDiscountType(type)}
                  className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                    discountType === type
                      ? 'bg-white text-[var(--color-primary)] shadow-sm'
                      : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {tabLabel}
                </button>
              ))}
            </div>
          </div>

          {/* Package fields */}
          {discountType === 'package' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Paid Sessions</label>
                  <input
                    type="number"
                    className="input"
                    min={1}
                    value={paidSessions}
                    onChange={(e) => setPaidSessions(parseInt(e.target.value) || 1)}
                  />
                </div>
                <div>
                  <label className="label">Free Sessions</label>
                  <input
                    type="number"
                    className="input"
                    min={0}
                    value={freeSessions}
                    onChange={(e) => setFreeSessions(parseInt(e.target.value) || 0)}
                  />
                </div>
              </div>
              <div>
                <label className="label">Per-Session Rate</label>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                    <input
                      type="number"
                      className="input pl-7"
                      min={0}
                      step={0.01}
                      value={sessionRate}
                      onChange={(e) => setSessionRate(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                  {feeSchedule.length > 0 && (
                    <select
                      className="select text-sm"
                      value=""
                      onChange={(e) => {
                        const fee = feeSchedule.find(f => f.cpt_code === e.target.value);
                        if (fee) setSessionRate(fee.amount);
                      }}
                    >
                      <option value="">From fee schedule...</option>
                      {feeSchedule.map(f => (
                        <option key={f.id} value={f.cpt_code}>
                          {f.cpt_code} - ${f.amount}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
              {/* Summary */}
              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-lg">
                <p className="text-sm font-medium text-emerald-800">
                  {paidSessions + freeSessions} sessions for ${(paidSessions * sessionRate).toFixed(2)}
                </p>
                <p className="text-xs text-emerald-600 mt-1">
                  Effective rate: ${getEffectiveRate().toFixed(2)}/session
                  (saves ${(freeSessions * sessionRate).toFixed(2)} total)
                </p>
              </div>
            </div>
          )}

          {/* Flat rate fields */}
          {discountType === 'flat_rate' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label">Rate per Session</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                    <input
                      type="number"
                      className="input pl-7"
                      min={0}
                      step={0.01}
                      value={flatRate}
                      onChange={(e) => setFlatRate(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>
                <div>
                  <label className="label">Number of Sessions</label>
                  <input
                    type="number"
                    className="input"
                    min={1}
                    value={flatRateSessions}
                    onChange={(e) => setFlatRateSessions(parseInt(e.target.value) || 1)}
                  />
                </div>
              </div>
              <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-sm font-medium text-blue-800">
                  ${flatRate}/session for {flatRateSessions} sessions
                </p>
                <p className="text-xs text-blue-600 mt-1">
                  Total package: ${(flatRate * flatRateSessions).toFixed(2)}
                </p>
              </div>
            </div>
          )}

          {/* Persistent discount fields */}
          {discountType === 'persistent' && (
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={persistentMode === 'percent'}
                    onChange={() => setPersistentMode('percent')}
                    className="w-4 h-4 accent-[var(--color-primary)]"
                  />
                  <span className="text-sm">Percentage off</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="radio"
                    checked={persistentMode === 'fixed'}
                    onChange={() => setPersistentMode('fixed')}
                    className="w-4 h-4 accent-[var(--color-primary)]"
                  />
                  <span className="text-sm">Fixed amount off</span>
                </label>
              </div>
              {persistentMode === 'percent' ? (
                <div>
                  <label className="label">Discount Percentage</label>
                  <div className="relative w-32">
                    <input
                      type="number"
                      className="input pr-8"
                      min={0}
                      max={100}
                      step={0.5}
                      value={discountPercent}
                      onChange={(e) => setDiscountPercent(parseFloat(e.target.value) || 0)}
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">%</span>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="label">Discount Amount per Session</label>
                  <div className="relative w-32">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400">$</span>
                    <input
                      type="number"
                      className="input pl-7"
                      min={0}
                      step={1}
                      value={discountFixed}
                      onChange={(e) => setDiscountFixed(parseFloat(e.target.value) || 0)}
                    />
                  </div>
                </div>
              )}
              <div className="p-3 bg-violet-50 border border-violet-200 rounded-lg">
                <p className="text-sm font-medium text-violet-800">
                  {persistentMode === 'percent'
                    ? `${discountPercent}% off every session`
                    : `$${discountFixed} off every session`}
                </p>
                <p className="text-xs text-violet-600 mt-1">
                  Applies automatically to all future invoices
                </p>
              </div>
            </div>
          )}

          {/* Common fields */}
          <div>
            <label className="label">Label (optional)</label>
            <input
              type="text"
              className="input"
              placeholder={getAutoLabel()}
              value={label}
              onChange={(e) => setLabel(e.target.value)}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Start Date</label>
              <input
                type="date"
                className="input"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div>
              <label className="label">End Date (optional)</label>
              <input
                type="date"
                className="input"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
              />
            </div>
          </div>

          <div>
            <label className="label">Notes</label>
            <textarea
              className="input"
              rows={2}
              placeholder="Optional notes about this discount..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        {/* Confirmation prompt when existing discounts */}
        {showConfirm && (
          <div className="px-6 py-4 bg-amber-50 border-t border-amber-200">
            <div className="flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
              <div className="flex-1">
                <p className="text-sm font-medium text-amber-800">
                  This client already has {existingDiscounts.length} active discount{existingDiscounts.length > 1 ? 's' : ''}:
                </p>
                <ul className="mt-1 space-y-0.5">
                  {existingDiscounts.map(d => (
                    <li key={d.id} className="text-xs text-amber-700">
                      &bull; {d.label || d.discount_type}
                    </li>
                  ))}
                </ul>
                <p className="text-xs text-amber-700 mt-2">Do you want to add another discount?</p>
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={doSave}
                    className="btn-primary btn-sm text-xs"
                    disabled={saving}
                  >
                    {saving ? 'Saving...' : 'Yes, Add Discount'}
                  </button>
                  <button
                    onClick={() => setShowConfirm(false)}
                    className="btn-ghost btn-sm text-xs"
                  >
                    Go Back
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        {!showConfirm && (
          <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-[var(--color-border)]">
            <button onClick={onClose} className="btn-ghost">Cancel</button>
            <button onClick={handleSave} className="btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Create Discount'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
