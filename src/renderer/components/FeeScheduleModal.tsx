import React, { useState, useEffect } from 'react';
import { X, DollarSign } from 'lucide-react';
import type { FeeScheduleEntry } from '../../shared/types';

interface FeeScheduleModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: () => void;
  fee?: FeeScheduleEntry;
}

// Common CPT codes for therapy with suggested descriptions
const CPT_PRESETS = [
  { code: '97110', description: 'Therapeutic exercises', defaultUnits: 1, suggestedAmount: 50 },
  { code: '97112', description: 'Neuromuscular reeducation', defaultUnits: 1, suggestedAmount: 50 },
  { code: '97116', description: 'Gait training', defaultUnits: 1, suggestedAmount: 50 },
  { code: '97140', description: 'Manual therapy', defaultUnits: 1, suggestedAmount: 55 },
  { code: '97530', description: 'Therapeutic activities', defaultUnits: 1, suggestedAmount: 50 },
  { code: '97535', description: 'Self-care/home management training', defaultUnits: 1, suggestedAmount: 50 },
  { code: '97542', description: 'Wheelchair management training', defaultUnits: 1, suggestedAmount: 45 },
  { code: '97750', description: 'Physical performance test', defaultUnits: 1, suggestedAmount: 60 },
  { code: '97760', description: 'Orthotic management and training', defaultUnits: 1, suggestedAmount: 55 },
  { code: '97161', description: 'PT evaluation - low complexity', defaultUnits: 1, suggestedAmount: 150 },
  { code: '97162', description: 'PT evaluation - moderate complexity', defaultUnits: 1, suggestedAmount: 175 },
  { code: '97163', description: 'PT evaluation - high complexity', defaultUnits: 1, suggestedAmount: 200 },
  { code: '97164', description: 'PT re-evaluation', defaultUnits: 1, suggestedAmount: 100 },
  { code: '97165', description: 'OT evaluation - low complexity', defaultUnits: 1, suggestedAmount: 150 },
  { code: '97166', description: 'OT evaluation - moderate complexity', defaultUnits: 1, suggestedAmount: 175 },
  { code: '97167', description: 'OT evaluation - high complexity', defaultUnits: 1, suggestedAmount: 200 },
  { code: '97168', description: 'OT re-evaluation', defaultUnits: 1, suggestedAmount: 100 },
  { code: '92521', description: 'Speech fluency evaluation', defaultUnits: 1, suggestedAmount: 175 },
  { code: '92522', description: 'Speech sound production evaluation', defaultUnits: 1, suggestedAmount: 175 },
  { code: '92523', description: 'Speech sound + language evaluation', defaultUnits: 1, suggestedAmount: 200 },
  { code: '92524', description: 'Voice & resonance analysis', defaultUnits: 1, suggestedAmount: 150 },
  { code: '92526', description: 'Oral function for speech treatment', defaultUnits: 1, suggestedAmount: 50 },
  { code: '92507', description: 'Speech/language treatment - individual', defaultUnits: 1, suggestedAmount: 50 },
  { code: '92508', description: 'Speech/language treatment - group', defaultUnits: 1, suggestedAmount: 30 },
];

export default function FeeScheduleModal({ isOpen, onClose, onSave, fee }: FeeScheduleModalProps) {
  const [cptCode, setCptCode] = useState(fee?.cpt_code || '');
  const [description, setDescription] = useState(fee?.description || '');
  const [defaultUnits, setDefaultUnits] = useState(fee?.default_units || 1);
  const [amount, setAmount] = useState(fee?.amount || 0);
  const [effectiveDate, setEffectiveDate] = useState(
    fee?.effective_date || new Date().toISOString().slice(0, 10)
  );
  const [saving, setSaving] = useState(false);

  // Reset form when modal opens
  useEffect(() => {
    if (isOpen && !fee) {
      setCptCode('');
      setDescription('');
      setDefaultUnits(1);
      setAmount(0);
      setEffectiveDate(new Date().toISOString().slice(0, 10));
    } else if (isOpen && fee) {
      setCptCode(fee.cpt_code);
      setDescription(fee.description);
      setDefaultUnits(fee.default_units);
      setAmount(fee.amount);
      setEffectiveDate(fee.effective_date || new Date().toISOString().slice(0, 10));
    }
  }, [isOpen, fee]);

  const handlePresetSelect = (preset: (typeof CPT_PRESETS)[0]) => {
    setCptCode(preset.code);
    setDescription(preset.description);
    setDefaultUnits(preset.defaultUnits);
    if (!amount) setAmount(preset.suggestedAmount);
  };

  const handleSave = async () => {
    if (!cptCode || !amount) return;

    setSaving(true);
    try {
      const data = {
        cpt_code: cptCode,
        description,
        default_units: defaultUnits,
        amount,
        effective_date: effectiveDate,
      };

      if (fee) {
        await window.api.feeSchedule.update(fee.id, data);
      } else {
        await window.api.feeSchedule.create(data);
      }
      onSave();
      onClose();
    } catch (err) {
      console.error('Failed to save fee:', err);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-2xl w-full max-w-lg overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">
            {fee ? 'Edit Fee' : 'Add Fee'}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 text-[var(--color-text-secondary)]"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4">
          {/* CPT Code with presets */}
          <div>
            <label className="label">CPT Code</label>
            <div className="flex gap-2">
              <select
                className="select flex-1"
                value={CPT_PRESETS.find((p) => p.code === cptCode)?.code || ''}
                onChange={(e) => {
                  const preset = CPT_PRESETS.find((p) => p.code === e.target.value);
                  if (preset) handlePresetSelect(preset);
                }}
              >
                <option value="">Select common code...</option>
                {CPT_PRESETS.map((preset) => (
                  <option key={preset.code} value={preset.code}>
                    {preset.code} - {preset.description}
                  </option>
                ))}
              </select>
              <input
                type="text"
                className="input w-28 font-mono"
                placeholder="Or enter"
                value={cptCode}
                onChange={(e) => setCptCode(e.target.value.toUpperCase())}
              />
            </div>
          </div>

          {/* Description */}
          <div>
            <label className="label">Description</label>
            <input
              type="text"
              className="input"
              placeholder="Service description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>

          {/* Units & Amount */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label">Default Units</label>
              <input
                type="number"
                min="1"
                className="input"
                value={defaultUnits}
                onChange={(e) => setDefaultUnits(Number(e.target.value))}
              />
            </div>
            <div>
              <label className="label">Amount per Unit</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]">
                  $
                </span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  className="input pl-7"
                  placeholder="0.00"
                  value={amount || ''}
                  onChange={(e) => setAmount(Number(e.target.value))}
                />
              </div>
            </div>
          </div>

          {/* Effective Date */}
          <div>
            <label className="label">Effective Date</label>
            <input
              type="date"
              className="input"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
            />
            <p className="text-xs text-[var(--color-text-secondary)] mt-1">
              When this rate becomes effective
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--color-border)] bg-gray-50">
          <button className="btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button
            className="btn-primary gap-2"
            onClick={handleSave}
            disabled={!cptCode || !amount || saving}
          >
            <DollarSign className="w-4 h-4" />
            {saving ? 'Saving...' : fee ? 'Update Fee' : 'Add Fee'}
          </button>
        </div>
      </div>
    </div>
  );
}
