import React, { useState, useEffect } from 'react';
import { X, BookOpen, Check } from 'lucide-react';
import type { Goal, GoalType, GoalStatus, Discipline, GoalsBankEntry } from '../../shared/types';

interface GoalFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  clientId: number;
  goal?: Goal | null;
  onSave: (goal: Goal) => void;
  discipline: Discipline;
}

interface FormData {
  goal_text: string;
  goal_type: GoalType;
  category: string;
  target_date: string;
  status: GoalStatus;
}

const CATEGORY_OPTIONS: Record<Discipline, string[]> = {
  PT: [
    'Mobility',
    'Strength',
    'Balance',
    'ROM',
    'Pain Management',
    'Gait',
    'Functional Activity',
    'Endurance',
    'Transfers',
    'Posture',
  ],
  OT: [
    'ADLs',
    'Fine Motor',
    'Visual Motor',
    'Sensory Processing',
    'Handwriting',
    'Self-Care',
    'Feeding',
    'Upper Extremity',
    'Cognitive',
    'Play Skills',
  ],
  ST: [
    'Articulation',
    'Language Comprehension',
    'Language Expression',
    'Fluency',
    'Voice',
    'Pragmatics',
    'Phonological Awareness',
    'Feeding/Swallowing',
    'AAC',
    'Cognitive-Communication',
  ],
};

const emptyForm: FormData = {
  goal_text: '',
  goal_type: 'STG',
  category: '',
  target_date: '',
  status: 'active',
};

const GoalFormModal: React.FC<GoalFormModalProps> = ({
  isOpen,
  onClose,
  clientId,
  goal,
  onSave,
  discipline,
}) => {
  const [form, setForm] = useState<FormData>(emptyForm);
  const [errors, setErrors] = useState<Partial<Record<keyof FormData, string>>>({});
  const [saving, setSaving] = useState(false);
  const [showBank, setShowBank] = useState(false);
  const [bankGoals, setBankGoals] = useState<GoalsBankEntry[]>([]);
  const [bankLoading, setBankLoading] = useState(false);
  const [bankCategory, setBankCategory] = useState<string>('');

  const categories = CATEGORY_OPTIONS[discipline] || [];

  useEffect(() => {
    if (goal) {
      setForm({
        goal_text: goal.goal_text,
        goal_type: goal.goal_type,
        category: goal.category,
        target_date: goal.target_date,
        status: goal.status,
      });
    } else {
      setForm({ ...emptyForm, category: categories[0] || '' });
    }
    setErrors({});
    setShowBank(false);
  }, [goal, isOpen]);

  const loadBankGoals = async (cat?: string) => {
    setBankLoading(true);
    try {
      const filters: { discipline?: string; category?: string } = { discipline };
      if (cat) filters.category = cat;
      const entries = await window.api.goalsBank.list(filters);
      setBankGoals(entries);
    } catch (err) {
      console.error('Failed to load goals bank:', err);
    } finally {
      setBankLoading(false);
    }
  };

  const handleToggleBank = () => {
    if (!showBank) {
      loadBankGoals(bankCategory || undefined);
    }
    setShowBank(!showBank);
  };

  const handleBankCategoryChange = (cat: string) => {
    setBankCategory(cat);
    loadBankGoals(cat || undefined);
  };

  const handleSelectBankGoal = (entry: GoalsBankEntry) => {
    setForm((prev) => ({
      ...prev,
      goal_text: entry.goal_template,
      category: entry.category || prev.category,
    }));
    setShowBank(false);
  };

  const validate = (): boolean => {
    const newErrors: Partial<Record<keyof FormData, string>> = {};
    if (!form.goal_text.trim()) newErrors.goal_text = 'Goal text is required';
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    if (errors[name as keyof FormData]) {
      setErrors((prev) => ({ ...prev, [name]: undefined }));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    setSaving(true);
    try {
      let saved: Goal;
      if (goal) {
        saved = await window.api.goals.update(goal.id, form);
      } else {
        saved = await window.api.goals.create({ ...form, client_id: clientId });
      }
      onSave(saved);
      onClose();
    } catch (err) {
      console.error('Failed to save goal:', err);
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Overlay */}
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />

      {/* Panel */}
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-lg font-semibold text-[var(--color-text)]">
            {goal ? 'Edit Goal' : 'Add New Goal'}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 text-[var(--color-text-secondary)]"
          >
            <X size={20} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-5">
          {/* Goal Type & Category */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="goal_type">Goal Type</label>
              <select
                id="goal_type"
                name="goal_type"
                className="select"
                value={form.goal_type}
                onChange={handleChange}
              >
                <option value="STG">Short-Term Goal (STG)</option>
                <option value="LTG">Long-Term Goal (LTG)</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="category">Category</label>
              <select
                id="category"
                name="category"
                className="select"
                value={form.category}
                onChange={handleChange}
              >
                <option value="">Select category</option>
                {categories.map((cat) => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Goal Text */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="label mb-0" htmlFor="goal_text">Goal Text *</label>
              <button
                type="button"
                className="btn-ghost btn-sm gap-1.5"
                onClick={handleToggleBank}
              >
                <BookOpen size={14} />
                {showBank ? 'Hide Goals Bank' : 'Browse Goals Bank'}
              </button>
            </div>
            <textarea
              id="goal_text"
              name="goal_text"
              className={`textarea ${errors.goal_text ? 'ring-2 ring-red-400' : ''}`}
              rows={4}
              value={form.goal_text}
              onChange={handleChange}
              placeholder="Enter goal text or select from the goals bank..."
            />
            {errors.goal_text && (
              <p className="text-xs text-red-500 mt-1">{errors.goal_text}</p>
            )}
          </div>

          {/* Goals Bank Browser */}
          {showBank && (
            <div className="card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-sm font-semibold text-[var(--color-text)]">
                  Goals Bank - {discipline}
                </h4>
                <select
                  className="select text-xs py-1 w-auto"
                  value={bankCategory}
                  onChange={(e) => handleBankCategoryChange(e.target.value)}
                >
                  <option value="">All Categories</option>
                  {categories.map((cat) => (
                    <option key={cat} value={cat}>{cat}</option>
                  ))}
                </select>
              </div>

              {bankLoading ? (
                <div className="text-sm text-[var(--color-text-secondary)] text-center py-4">
                  Loading goals bank...
                </div>
              ) : bankGoals.length === 0 ? (
                <div className="text-sm text-[var(--color-text-secondary)] text-center py-4">
                  No goals found in the bank for this discipline.
                </div>
              ) : (
                <div className="max-h-48 overflow-y-auto space-y-1">
                  {bankGoals.map((entry) => (
                    <button
                      key={entry.id}
                      type="button"
                      className="w-full text-left px-3 py-2 rounded-lg hover:bg-gray-50 text-sm text-[var(--color-text)] border border-transparent hover:border-[var(--color-border)] transition-colors flex items-start gap-2 group"
                      onClick={() => handleSelectBankGoal(entry)}
                    >
                      <Check
                        size={14}
                        className="mt-0.5 shrink-0 text-[var(--color-primary)] opacity-0 group-hover:opacity-100 transition-opacity"
                      />
                      <div>
                        <p>{entry.goal_template}</p>
                        {entry.category && (
                          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                            {entry.category}
                          </p>
                        )}
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Target Date & Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="label" htmlFor="target_date">Target Date</label>
              <input
                id="target_date"
                name="target_date"
                type="date"
                className="input"
                value={form.target_date}
                onChange={handleChange}
              />
              <div className="flex items-center gap-2 mt-2">
                {[30, 60, 90].map((days) => {
                  const d = new Date();
                  d.setDate(d.getDate() + days);
                  const iso = d.toISOString().slice(0, 10);
                  return (
                    <button
                      key={days}
                      type="button"
                      className={`px-3 py-1 text-xs rounded-full border transition-colors cursor-pointer ${
                        form.target_date === iso
                          ? 'bg-[var(--color-primary)] text-white border-[var(--color-primary)]'
                          : 'border-[var(--color-border)] text-[var(--color-text-secondary)] hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]'
                      }`}
                      onClick={() => setForm((prev) => ({ ...prev, target_date: iso }))}
                    >
                      {days} days
                    </button>
                  );
                })}
              </div>
            </div>
            {goal && (
              <div>
                <label className="label" htmlFor="status">Status</label>
                <select
                  id="status"
                  name="status"
                  className="select"
                  value={form.status}
                  onChange={handleChange}
                >
                  <option value="active">Active</option>
                  <option value="met">Met</option>
                  <option value="discontinued">Discontinued</option>
                  <option value="modified">Modified</option>
                </select>
              </div>
            )}
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-[var(--color-border)]">
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn-primary" disabled={saving}>
              {saving ? 'Saving...' : goal ? 'Update Goal' : 'Add Goal'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

export default GoalFormModal;
