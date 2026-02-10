import React, { useState, useEffect, useCallback } from 'react';
import CategoryCombobox from '../components/CategoryCombobox';
import {
  Target,
  Search,
  Plus,
  X,
  ChevronDown,
  Pencil,
  Trash2,
} from 'lucide-react';
import type { GoalsBankEntry, Discipline, MeasurementType } from '../../shared/types';
import { MEASUREMENT_TYPE_LABELS } from '../../shared/types';
import { CATEGORY_DEFAULT_MEASUREMENT, DISCIPLINE_MEASUREMENT_OPTIONS } from '../../shared/goal-metrics';

const DISCIPLINE_TABS: Array<{ value: Discipline | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'PT', label: 'PT' },
  { value: 'OT', label: 'OT' },
  { value: 'ST', label: 'ST' },
  { value: 'MFT', label: 'MFT' },
];

const DISCIPLINE_BADGE: Record<string, string> = {
  PT: 'badge-pt',
  OT: 'badge-ot',
  ST: 'badge-st',
  MFT: 'badge-mft',
};

/**
 * Formats a category string for display: replaces underscores with spaces
 * and capitalizes each word (e.g. "hand_function" → "Hand Function").
 */
function formatCategory(category: string): string {
  return category
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

/**
 * Renders goal template text with blank placeholders (___) highlighted.
 */
function renderTemplateText(text: string): React.ReactNode {
  const parts = text.split(/(___+)/g);
  return parts.map((part, i) => {
    if (/^___+$/.test(part)) {
      return (
        <span
          key={i}
          className="inline-block bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded text-xs font-mono mx-0.5"
        >
          {part}
        </span>
      );
    }
    return <span key={i}>{part}</span>;
  });
}

interface GoalsBankPageProps {
  embedded?: boolean;
}

export default function GoalsBankPage({ embedded }: GoalsBankPageProps = {}) {
  const [entries, setEntries] = useState<GoalsBankEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [disciplineFilter, setDisciplineFilter] = useState<Discipline | 'ALL'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [showAddForm, setShowAddForm] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ discipline: 'PT' as Discipline, category: '', goal_template: '', measurement_type: 'percentage' as MeasurementType });
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

  // New goal template form state
  const [newGoal, setNewGoal] = useState({
    discipline: 'PT' as Discipline,
    category: '',
    goal_template: '',
    measurement_type: 'percentage' as MeasurementType,
  });

  const loadEntries = useCallback(async () => {
    try {
      setLoading(true);
      const filters: { discipline?: string; category?: string } = {};
      if (disciplineFilter !== 'ALL') filters.discipline = disciplineFilter;
      if (categoryFilter !== 'ALL') filters.category = categoryFilter;
      const result = await window.api.goalsBank.list(filters);
      setEntries(result);
    } catch (err) {
      console.error('Failed to load goals bank entries:', err);
    } finally {
      setLoading(false);
    }
  }, [disciplineFilter, categoryFilter]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const categories = Array.from(new Set(entries.map((e) => e.category))).sort();

  const filteredEntries = entries.filter((entry) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        entry.goal_template.toLowerCase().includes(q) ||
        entry.category.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Group by category
  const groupedEntries = filteredEntries.reduce<Record<string, GoalsBankEntry[]>>(
    (acc, entry) => {
      const cat = entry.category || 'Uncategorized';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(entry);
      return acc;
    },
    {}
  );

  const sortedCategories = Object.keys(groupedEntries).sort();

  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  const startEdit = (entry: GoalsBankEntry) => {
    setEditingId(entry.id);
    setEditForm({ discipline: entry.discipline, category: entry.category, goal_template: entry.goal_template, measurement_type: entry.measurement_type || 'percentage' });
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editForm.goal_template.trim() || !editForm.category.trim()) return;
    try {
      const updated = await window.api.goalsBank.update(editingId, {
        discipline: editForm.discipline,
        category: editForm.category.trim(),
        goal_template: editForm.goal_template.trim(),
        measurement_type: editForm.measurement_type,
      });
      setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      setEditingId(null);
    } catch (err) {
      console.error('Failed to update goal template:', err);
    }
  };

  const handleDelete = async (id: number) => {
    if (deleteConfirmId === id) {
      try {
        await window.api.goalsBank.delete(id);
        setEntries((prev) => prev.filter((e) => e.id !== id));
        setDeleteConfirmId(null);
      } catch (err) {
        console.error('Failed to delete goal template:', err);
      }
    } else {
      setDeleteConfirmId(id);
      setTimeout(() => setDeleteConfirmId((prev) => (prev === id ? null : prev)), 3000);
    }
  };

  const handleAddGoal = async () => {
    if (!newGoal.goal_template.trim() || !newGoal.category.trim()) return;

    try {
      const created = await window.api.goalsBank.create({
        discipline: newGoal.discipline,
        category: newGoal.category.trim(),
        goal_template: newGoal.goal_template.trim(),
        measurement_type: newGoal.measurement_type,
        is_default: false,
      });
      setEntries((prev) => [...prev, created]);
      setNewGoal({ discipline: 'PT', category: '', goal_template: '', measurement_type: 'percentage' });
      setShowAddForm(false);
    } catch (err) {
      console.error('Failed to add goal template:', err);
    }
  };

  return (
    <div className={embedded ? '' : 'p-6'}>
      {/* Page Header */}
      <div className={embedded ? 'flex items-center justify-between mb-4' : 'page-header'}>
        <div className="flex items-center gap-3">
          {!embedded && <Target className="w-7 h-7 text-[var(--color-primary)]" />}
          <h1 className={embedded ? 'text-sm font-semibold text-[var(--color-text)]' : 'page-title'}>
            {embedded ? 'Goal Templates' : 'Goals Bank'}
          </h1>
        </div>
        <button className="btn-primary" onClick={() => setShowAddForm(!showAddForm)}>
          {showAddForm ? (
            <>
              <X className="w-4 h-4 mr-2" />
              Cancel
            </>
          ) : (
            <>
              <Plus className="w-4 h-4 mr-2" />
              Add Goal Template
            </>
          )}
        </button>
      </div>

      {/* Add Goal Form */}
      {showAddForm && (
        <div className="card p-5 mb-6">
          <h3 className="section-title">New Goal Template</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label className="label">Discipline</label>
              <select
                className="select"
                value={newGoal.discipline}
                onChange={(e) =>
                  setNewGoal((prev) => ({
                    ...prev,
                    discipline: e.target.value as Discipline,
                  }))
                }
              >
                <option value="PT">PT</option>
                <option value="OT">OT</option>
                <option value="ST">ST</option>
                <option value="MFT">MFT</option>
              </select>
            </div>
            <div>
              <label className="label">Category</label>
              <CategoryCombobox
                value={newGoal.category}
                onChange={(val) => setNewGoal((prev) => ({
                  ...prev,
                  category: val,
                  measurement_type: CATEGORY_DEFAULT_MEASUREMENT[val] || prev.measurement_type,
                }))}
                discipline={newGoal.discipline}
                source="goals_bank"
                placeholder="e.g. Mobility, ADLs, Articulation"
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="label">How is this goal measured?</label>
            <select
              className="select text-sm"
              value={newGoal.measurement_type}
              onChange={(e) => setNewGoal((prev) => ({ ...prev, measurement_type: e.target.value as MeasurementType }))}
            >
              {(DISCIPLINE_MEASUREMENT_OPTIONS[newGoal.discipline] || []).map(mt => (
                <option key={mt} value={mt}>{MEASUREMENT_TYPE_LABELS[mt]?.split(' (')[0] || mt}</option>
              ))}
            </select>
          </div>
          <div className="mb-4">
            <label className="label">Goal Template</label>
            <textarea
              className="textarea"
              placeholder="Patient will ___ with ___ level of assistance in ___ out of ___ trials."
              value={newGoal.goal_template}
              onChange={(e) =>
                setNewGoal((prev) => ({ ...prev, goal_template: e.target.value }))
              }
              rows={3}
            />
            <p className="text-xs text-[var(--color-text-secondary)] mt-1">
              Use three or more underscores (___) to indicate blank fields that can be filled in later.
            </p>
          </div>
          <div className="flex justify-end">
            <button
              className="btn-primary"
              onClick={handleAddGoal}
              disabled={!newGoal.goal_template.trim() || !newGoal.category.trim()}
            >
              Save Goal Template
            </button>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="space-y-3 mb-6">
        {/* Search Bar */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-secondary)]" />
          <input
            type="text"
            className="input pl-10"
            placeholder="Search goal templates..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          {/* Discipline Tabs */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {DISCIPLINE_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setDisciplineFilter(tab.value)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  disciplineFilter === tab.value
                    ? 'bg-white text-[var(--color-primary)] shadow-sm'
                    : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Category Dropdown */}
          <div className="relative">
            <select
              className="select pr-8 text-sm"
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
            >
              <option value="ALL">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {formatCategory(cat)}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Goals List */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="text-[var(--color-text-secondary)]">Loading goals bank...</div>
        </div>
      ) : sortedCategories.length === 0 ? (
        <div className="card p-12 text-center">
          <Target className="w-12 h-12 text-[var(--color-text-secondary)] mx-auto mb-3 opacity-40" />
          <p className="text-[var(--color-text-secondary)] text-sm">
            {searchQuery
              ? 'No goal templates match your search.'
              : 'No goal templates found. Add your first goal template to get started.'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedCategories.map((category) => {
            const isExpanded = expandedCategories.has(category);
            return (
            <div key={category}>
              <button
                className="section-title flex items-center gap-2 w-full text-left cursor-pointer hover:text-[var(--color-primary)] transition-colors"
                onClick={() => toggleCategory(category)}
              >
                <ChevronDown className={`w-4 h-4 text-[var(--color-text-secondary)] transition-transform ${isExpanded ? '' : '-rotate-90'}`} />
                {formatCategory(category)}
                <span className="text-xs font-normal text-[var(--color-text-secondary)]">
                  ({groupedEntries[category].length})
                </span>
              </button>
              {isExpanded && (
              <div className="card divide-y divide-[var(--color-border)]">
                {groupedEntries[category].map((entry) => (
                  <div
                    key={entry.id}
                    className="p-4 hover:bg-gray-50/50 transition-colors"
                  >
                    {editingId === entry.id ? (
                      /* Inline Edit Form */
                      <div className="space-y-3">
                        <div className="grid grid-cols-2 gap-3">
                          <select className="select text-sm" value={editForm.discipline} onChange={(e) => setEditForm((p) => ({ ...p, discipline: e.target.value as Discipline }))}>
                            <option value="PT">PT</option>
                            <option value="OT">OT</option>
                            <option value="ST">ST</option>
                            <option value="MFT">MFT</option>
                          </select>
                          <CategoryCombobox value={editForm.category} onChange={(val) => setEditForm((p) => ({ ...p, category: val }))} discipline={editForm.discipline} source="goals_bank" placeholder="Category" className="text-sm" />
                        </div>
                        <div className="mb-2">
                          <label className="text-xs text-[var(--color-text-secondary)] mb-0.5 block">Measurement</label>
                          <select className="select text-xs py-1" value={editForm.measurement_type} onChange={(e) => setEditForm((p) => ({ ...p, measurement_type: e.target.value as MeasurementType }))}>
                            {(DISCIPLINE_MEASUREMENT_OPTIONS[editForm.discipline] || []).map(mt => (
                              <option key={mt} value={mt}>{MEASUREMENT_TYPE_LABELS[mt]?.split(' (')[0] || mt}</option>
                            ))}
                          </select>
                        </div>
                        <textarea className="textarea text-sm" rows={3} value={editForm.goal_template} onChange={(e) => setEditForm((p) => ({ ...p, goal_template: e.target.value }))} />
                        <div className="flex items-center gap-2">
                          <button className="btn-primary btn-sm text-xs" onClick={handleSaveEdit}>Save</button>
                          <button className="btn-ghost btn-sm text-xs" onClick={() => setEditingId(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1 min-w-0">
                          {/* Goal Template Text */}
                          <p className="text-sm text-[var(--color-text)] leading-relaxed mb-2">
                            {renderTemplateText(entry.goal_template)}
                          </p>

                          {/* Badges */}
                          <div className="flex items-center gap-2">
                            <span
                              className={`badge text-[10px] ${
                                DISCIPLINE_BADGE[entry.discipline] || ''
                              }`}
                            >
                              {entry.discipline}
                            </span>
                            <span className="badge text-[10px] bg-indigo-100 text-indigo-700">
                              {formatCategory(entry.category)}
                            </span>
                            <span className="badge text-[10px] bg-teal-100 text-teal-700">
                              {MEASUREMENT_TYPE_LABELS[entry.measurement_type || 'percentage']?.split(' (')[0] || entry.measurement_type || 'Percentage'}
                            </span>
                            {entry.is_default && (
                              <span className="badge text-[10px] bg-gray-100 text-gray-500">
                                Default
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            onClick={() => startEdit(entry)}
                            className="p-1.5 rounded-lg text-gray-300 hover:text-[var(--color-primary)] hover:bg-blue-50 transition-colors"
                            title="Edit template"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDelete(entry.id)}
                            className={`p-1.5 rounded-lg transition-colors ${
                              deleteConfirmId === entry.id
                                ? 'bg-red-600 text-white'
                                : 'text-gray-300 hover:text-[var(--color-danger)] hover:bg-red-50'
                            }`}
                            title={deleteConfirmId === entry.id ? 'Click to confirm' : 'Delete template'}
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
              )}
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
