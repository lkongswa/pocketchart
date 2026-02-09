import React, { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Search,
  Plus,
  Star,
  Trash2,
  X,
  ChevronDown,
  Pencil,
} from 'lucide-react';
import { useTier } from '../hooks/useTier';
import type { NoteBankEntry, Discipline, SOAPSection } from '../../shared/types';

/**
 * Formats a category string for display: replaces underscores with spaces
 * and capitalizes each word (e.g. "special_tests" → "Special Tests").
 */
function formatCategory(category: string): string {
  return category
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

const DISCIPLINE_TABS: Array<{ value: Discipline | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All' },
  { value: 'PT', label: 'PT' },
  { value: 'OT', label: 'OT' },
  { value: 'ST', label: 'ST' },
];

const SECTION_TABS: Array<{ value: SOAPSection | 'ALL'; label: string }> = [
  { value: 'ALL', label: 'All Sections' },
  { value: 'S', label: 'Subjective' },
  { value: 'O', label: 'Objective' },
  { value: 'A', label: 'Assessment' },
  { value: 'P', label: 'Plan' },
];

const DISCIPLINE_BADGE: Record<string, string> = {
  PT: 'badge-pt',
  OT: 'badge-ot',
  ST: 'badge-st',
  ALL: 'bg-gray-100 text-gray-600',
};

const SECTION_BADGE_COLORS: Record<string, string> = {
  S: 'bg-sky-100 text-sky-700',
  O: 'bg-amber-100 text-amber-700',
  A: 'bg-violet-100 text-violet-700',
  P: 'bg-rose-100 text-rose-700',
};

interface NoteBankPageProps {
  embedded?: boolean;
}

export default function NoteBankPage({ embedded }: NoteBankPageProps = {}) {
  const { isPro } = useTier();
  const [entries, setEntries] = useState<NoteBankEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [disciplineFilter, setDisciplineFilter] = useState<Discipline | 'ALL'>('ALL');
  const [sectionFilter, setSectionFilter] = useState<SOAPSection | 'ALL'>('ALL');
  const [categoryFilter, setCategoryFilter] = useState('ALL');
  const [showAddForm, setShowAddForm] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editForm, setEditForm] = useState({ discipline: 'PT' as Discipline | 'ALL', category: '', section: 'S' as SOAPSection, phrase: '' });

  // New phrase form state
  const [newPhrase, setNewPhrase] = useState({
    discipline: 'PT' as Discipline | 'ALL',
    category: '',
    section: 'S' as SOAPSection,
    phrase: '',
  });

  const loadEntries = useCallback(async () => {
    try {
      setLoading(true);
      const filters: { discipline?: string; section?: string; category?: string } = {};
      if (disciplineFilter !== 'ALL') filters.discipline = disciplineFilter;
      if (sectionFilter !== 'ALL') filters.section = sectionFilter;
      if (categoryFilter !== 'ALL') filters.category = categoryFilter;
      const result = await window.api.noteBank.list(filters);
      setEntries(result);
    } catch (err) {
      console.error('Failed to load note bank entries:', err);
    } finally {
      setLoading(false);
    }
  }, [disciplineFilter, sectionFilter, categoryFilter]);

  useEffect(() => {
    loadEntries();
  }, [loadEntries]);

  const categories = Array.from(new Set(entries.map((e) => e.category))).sort();

  const filteredEntries = entries.filter((entry) => {
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        entry.phrase.toLowerCase().includes(q) ||
        entry.category.toLowerCase().includes(q)
      );
    }
    return true;
  });

  // Group by category
  const groupedEntries = filteredEntries.reduce<Record<string, NoteBankEntry[]>>(
    (acc, entry) => {
      const cat = entry.category || 'Uncategorized';
      if (!acc[cat]) acc[cat] = [];
      acc[cat].push(entry);
      return acc;
    },
    {}
  );

  const sortedCategories = Object.keys(groupedEntries).sort();

  const handleToggleFavorite = async (id: number) => {
    try {
      const updated = await window.api.noteBank.toggleFavorite(id);
      setEntries((prev) =>
        prev.map((e) => (e.id === updated.id ? updated : e))
      );
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  };

  const handleDelete = async (id: number) => {
    try {
      await window.api.noteBank.delete(id);
      setEntries((prev) => prev.filter((e) => e.id !== id));
      setDeleteConfirmId(null);
    } catch (err) {
      console.error('Failed to delete phrase:', err);
    }
  };

  const startEdit = (entry: NoteBankEntry) => {
    setEditingId(entry.id);
    setEditForm({ discipline: entry.discipline, category: entry.category, section: entry.section, phrase: entry.phrase });
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editForm.phrase.trim() || !editForm.category.trim()) return;
    try {
      const updated = await window.api.noteBank.update(editingId, {
        discipline: editForm.discipline,
        category: editForm.category.trim(),
        section: editForm.section,
        phrase: editForm.phrase.trim(),
      });
      setEntries((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));
      setEditingId(null);
    } catch (err) {
      console.error('Failed to update phrase:', err);
    }
  };

  const handleAddPhrase = async () => {
    if (!newPhrase.phrase.trim() || !newPhrase.category.trim()) return;

    try {
      const created = await window.api.noteBank.create({
        discipline: newPhrase.discipline,
        category: newPhrase.category.trim(),
        section: newPhrase.section,
        phrase: newPhrase.phrase.trim(),
        is_default: false,
        is_favorite: false,
      });
      setEntries((prev) => [...prev, created]);
      setNewPhrase({ discipline: 'PT', category: '', section: 'S', phrase: '' });
      setShowAddForm(false);
    } catch (err) {
      console.error('Failed to add phrase:', err);
    }
  };

  return (
    <div className={embedded ? '' : 'p-6'}>
      {/* Page Header */}
      <div className={embedded ? 'flex items-center justify-between mb-4' : 'page-header'}>
        <div className="flex items-center gap-3">
          {!embedded && <FileText className="w-7 h-7 text-[var(--color-primary)]" />}
          <h1 className={embedded ? 'text-sm font-semibold text-[var(--color-text)]' : 'page-title'}>
            {embedded ? 'Note Phrases' : 'Note Bank'}
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
              Add Phrase
            </>
          )}
        </button>
      </div>

      {/* Add Phrase Form */}
      {showAddForm && (
        <div className="card p-5 mb-6">
          <h3 className="section-title">New Phrase</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label className="label">Discipline</label>
              <select
                className="select"
                value={newPhrase.discipline}
                onChange={(e) =>
                  setNewPhrase((prev) => ({
                    ...prev,
                    discipline: e.target.value as Discipline | 'ALL',
                  }))
                }
              >
                <option value="ALL">All Disciplines</option>
                <option value="PT">PT</option>
                <option value="OT">OT</option>
                <option value="ST">ST</option>
              </select>
            </div>
            <div>
              <label className="label">Section</label>
              <select
                className="select"
                value={newPhrase.section}
                onChange={(e) =>
                  setNewPhrase((prev) => ({
                    ...prev,
                    section: e.target.value as SOAPSection,
                  }))
                }
              >
                <option value="S">Subjective (S)</option>
                <option value="O">Objective (O)</option>
                <option value="A">Assessment (A)</option>
                <option value="P">Plan (P)</option>
              </select>
            </div>
            <div>
              <label className="label">Category</label>
              <input
                type="text"
                className="input"
                placeholder="e.g. Pain, ROM, Functional"
                value={newPhrase.category}
                onChange={(e) =>
                  setNewPhrase((prev) => ({ ...prev, category: e.target.value }))
                }
              />
            </div>
          </div>
          <div className="mb-4">
            <label className="label">Phrase Text</label>
            <textarea
              className="textarea"
              placeholder="Enter the phrase text..."
              value={newPhrase.phrase}
              onChange={(e) =>
                setNewPhrase((prev) => ({ ...prev, phrase: e.target.value }))
              }
              rows={2}
            />
          </div>
          <div className="flex justify-end">
            <button
              className="btn-primary"
              onClick={handleAddPhrase}
              disabled={!newPhrase.phrase.trim() || !newPhrase.category.trim()}
            >
              Save Phrase
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
            placeholder="Search phrases..."
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

          {/* Section Tabs */}
          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            {SECTION_TABS.map((tab) => (
              <button
                key={tab.value}
                onClick={() => setSectionFilter(tab.value)}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  sectionFilter === tab.value
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

      {/* Phrase List */}
      {loading ? (
        <div className="flex items-center justify-center h-48">
          <div className="text-[var(--color-text-secondary)]">Loading note bank...</div>
        </div>
      ) : sortedCategories.length === 0 ? (
        <div className="card p-12 text-center">
          <FileText className="w-12 h-12 text-[var(--color-text-secondary)] mx-auto mb-3 opacity-40" />
          <p className="text-[var(--color-text-secondary)] text-sm">
            {searchQuery
              ? 'No phrases match your search.'
              : 'No phrases found. Add your first phrase to get started.'}
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {sortedCategories.map((category) => (
            <div key={category}>
              <h3 className="section-title flex items-center gap-2">
                <ChevronDown className="w-4 h-4 text-[var(--color-text-secondary)]" />
                {formatCategory(category)}
                <span className="text-xs font-normal text-[var(--color-text-secondary)]">
                  ({groupedEntries[category].length})
                </span>
              </h3>
              <div className="card divide-y divide-[var(--color-border)]">
                {groupedEntries[category].map((entry) => (
                  <div
                    key={entry.id}
                    className="flex items-start gap-3 p-4 hover:bg-gray-50/50 transition-colors"
                  >
                    {editingId === entry.id ? (
                      /* Inline Edit Form */
                      <div className="flex-1 space-y-3">
                        <div className="grid grid-cols-3 gap-3">
                          <select className="select text-sm" value={editForm.discipline} onChange={(e) => setEditForm((p) => ({ ...p, discipline: e.target.value as Discipline | 'ALL' }))}>
                            <option value="ALL">All</option>
                            <option value="PT">PT</option>
                            <option value="OT">OT</option>
                            <option value="ST">ST</option>
                          </select>
                          <select className="select text-sm" value={editForm.section} onChange={(e) => setEditForm((p) => ({ ...p, section: e.target.value as SOAPSection }))}>
                            <option value="S">Subjective</option>
                            <option value="O">Objective</option>
                            <option value="A">Assessment</option>
                            <option value="P">Plan</option>
                          </select>
                          <input type="text" className="input text-sm" placeholder="Category" value={editForm.category} onChange={(e) => setEditForm((p) => ({ ...p, category: e.target.value }))} />
                        </div>
                        <textarea className="textarea text-sm" rows={2} value={editForm.phrase} onChange={(e) => setEditForm((p) => ({ ...p, phrase: e.target.value }))} />
                        <div className="flex items-center gap-2">
                          <button className="btn-primary btn-sm text-xs" onClick={handleSaveEdit}>Save</button>
                          <button className="btn-ghost btn-sm text-xs" onClick={() => setEditingId(null)}>Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        {/* Favorite Star — Pro only */}
                        {isPro && (
                          <button
                            onClick={() => handleToggleFavorite(entry.id)}
                            className="mt-0.5 flex-shrink-0 transition-colors"
                            title={entry.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                          >
                            <Star
                              className={`w-4 h-4 ${
                                entry.is_favorite
                                  ? 'fill-amber-400 text-amber-400'
                                  : 'text-gray-300 hover:text-amber-300'
                              }`}
                            />
                          </button>
                        )}

                        {/* Phrase Content */}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm text-[var(--color-text)] leading-relaxed">
                            {entry.phrase}
                          </p>
                          <div className="flex items-center gap-2 mt-2">
                            <span
                              className={`badge text-[10px] ${
                                DISCIPLINE_BADGE[entry.discipline] || DISCIPLINE_BADGE.ALL
                              }`}
                            >
                              {entry.discipline}
                            </span>
                            <span
                              className={`badge text-[10px] ${
                                SECTION_BADGE_COLORS[entry.section] || ''
                              }`}
                            >
                              {entry.section}
                            </span>
                            {entry.is_default && (
                              <span className="badge text-[10px] bg-gray-100 text-gray-500">
                                Default
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Edit & Delete */}
                        <div className="flex-shrink-0 flex items-center gap-1">
                          <button
                            onClick={() => startEdit(entry)}
                            className="p-1.5 rounded-lg text-gray-300 hover:text-[var(--color-primary)] hover:bg-blue-50 transition-colors"
                            title="Edit phrase"
                          >
                            <Pencil className="w-4 h-4" />
                          </button>
                          {!entry.is_default && (
                            <>
                              {deleteConfirmId === entry.id ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    className="btn-danger btn-sm text-xs"
                                    onClick={() => handleDelete(entry.id)}
                                  >
                                    Confirm
                                  </button>
                                  <button
                                    className="btn-ghost btn-sm text-xs"
                                    onClick={() => setDeleteConfirmId(null)}
                                  >
                                    Cancel
                                  </button>
                                </div>
                              ) : (
                                <button
                                  onClick={() => setDeleteConfirmId(entry.id)}
                                  className="p-1.5 rounded-lg text-gray-300 hover:text-[var(--color-danger)] hover:bg-red-50 transition-colors"
                                  title="Delete phrase"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
