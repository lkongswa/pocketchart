import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Search, Star, Plus, ChevronDown, ChevronRight, Target } from 'lucide-react';
import { useTier } from '../hooks/useTier';
import type { Discipline, SOAPSection, NoteBankEntry } from '../../shared/types';

interface NoteBankPopoverProps {
  isOpen: boolean;
  onClose: () => void;
  onInsert: (phrase: string) => void;
  discipline: Discipline;
  section: SOAPSection;
  anchorRef?: React.RefObject<HTMLButtonElement | null>;
  priorityCategories?: string[];
}

const SECTION_LABELS: Record<SOAPSection, string> = {
  S: 'Subjective',
  O: 'Objective',
  A: 'Assessment',
  P: 'Plan',
};

export default function NoteBankPopover({
  isOpen,
  onClose,
  onInsert,
  discipline,
  section,
  anchorRef,
  priorityCategories = [],
}: NoteBankPopoverProps) {
  const [phrases, setPhrases] = useState<NoteBankEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(new Set());
  const [initialCollapseApplied, setInitialCollapseApplied] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newPhrase, setNewPhrase] = useState('');
  const [newCategory, setNewCategory] = useState('');
  const [saving, setSaving] = useState(false);
  const { isPro } = useTier();
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  const loadPhrases = useCallback(async () => {
    try {
      setLoading(true);
      const results = await window.api.noteBank.list({
        discipline,
        section,
      });
      // Also load phrases tagged as 'ALL' disciplines
      const allResults = await window.api.noteBank.list({
        discipline: 'ALL',
        section,
      });
      const combined = [...results, ...allResults];
      // Deduplicate by id
      const seen = new Set<number>();
      const unique = combined.filter((p) => {
        if (seen.has(p.id)) return false;
        seen.add(p.id);
        return true;
      });
      setPhrases(unique);
    } catch (err) {
      console.error('Failed to load note bank phrases:', err);
    } finally {
      setLoading(false);
    }
  }, [discipline, section]);

  useEffect(() => {
    if (isOpen) {
      loadPhrases();
      setSearchQuery('');
      setShowAddForm(false);
      setNewPhrase('');
      setNewCategory('');
      setInitialCollapseApplied(false);
      setTimeout(() => searchRef.current?.focus(), 100);
    }
  }, [isOpen, loadPhrases]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        anchorRef?.current &&
        !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [isOpen, onClose, anchorRef]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, onClose]);

  const handleToggleFavorite = async (id: number, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const updated = await window.api.noteBank.toggleFavorite(id);
      setPhrases((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  };

  const handleAddPhrase = async () => {
    if (!newPhrase.trim()) return;
    try {
      setSaving(true);
      const created = await window.api.noteBank.create({
        discipline,
        section,
        category: newCategory.trim() || 'custom',
        phrase: newPhrase.trim(),
        is_default: false,
        is_favorite: false,
      });
      setPhrases((prev) => [...prev, created]);
      setNewPhrase('');
      setNewCategory('');
      setShowAddForm(false);
    } catch (err) {
      console.error('Failed to add phrase:', err);
    } finally {
      setSaving(false);
    }
  };

  const toggleCategory = (category: string) => {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) {
        next.delete(category);
      } else {
        next.add(category);
      }
      return next;
    });
  };

  if (!isOpen) return null;

  // Filter phrases
  const filtered = phrases.filter((p) =>
    p.phrase.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Sort: favorites first, then alphabetically
  const sorted = [...filtered].sort((a, b) => {
    if (a.is_favorite && !b.is_favorite) return -1;
    if (!a.is_favorite && b.is_favorite) return 1;
    return a.phrase.localeCompare(b.phrase);
  });

  // Partition: priority category phrases (suggested) vs rest
  const priorityPhrases = priorityCategories.length > 0
    ? sorted.filter(p =>
        priorityCategories.some(cat => p.category?.toLowerCase() === cat.toLowerCase())
      )
    : [];
  const restPhrases = priorityCategories.length > 0
    ? sorted.filter(p =>
        !priorityCategories.some(cat => p.category?.toLowerCase() === cat.toLowerCase())
      )
    : sorted;

  // Group rest by category
  const grouped: Record<string, NoteBankEntry[]> = {};
  for (const phrase of restPhrases) {
    const cat = phrase.category || 'general';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(phrase);
  }

  const categoryKeys = Object.keys(grouped).sort();

  // Default collapse all categories on first load (but NOT priority section)
  if (!initialCollapseApplied && categoryKeys.length > 0 && !loading) {
    setCollapsedCategories(new Set(categoryKeys));
    setInitialCollapseApplied(true);
  }

  const priorityCategoryLabel = priorityCategories.length === 1
    ? priorityCategories[0]
    : priorityCategories.slice(0, 2).join(', ');

  return (
    <div
      ref={panelRef}
      className="absolute z-50 bg-white rounded-xl border border-[var(--color-border)] shadow-xl w-[400px] max-h-[480px] flex flex-col"
      style={{ right: 0, top: '100%', marginTop: 4 }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[var(--color-border)]">
        <h3 className="text-sm font-semibold text-[var(--color-text)]">
          Note Bank - {SECTION_LABELS[section]}
        </h3>
        <button
          onClick={onClose}
          className="p-1 rounded-md hover:bg-gray-100 transition-colors"
        >
          <X className="w-4 h-4 text-[var(--color-text-secondary)]" />
        </button>
      </div>

      {/* Search */}
      <div className="px-4 py-2 border-b border-[var(--color-border)]">
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-secondary)]" />
          <input
            ref={searchRef}
            type="text"
            className="input pl-8 py-1.5 text-sm"
            placeholder="Search phrases..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Phrase List */}
      <div className="flex-1 overflow-y-auto px-2 py-2">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-sm text-[var(--color-text-secondary)]">
            Loading phrases...
          </div>
        ) : categoryKeys.length === 0 && priorityPhrases.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-8 text-sm text-[var(--color-text-secondary)]">
            <p>No phrases found</p>
            {searchQuery && (
              <p className="text-xs mt-1">Try a different search term</p>
            )}
          </div>
        ) : (
          <>
          {/* Suggested phrases for addressed goal categories */}
          {priorityPhrases.length > 0 && (
            <div className="mb-2 pb-2 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-1.5 px-2 py-1.5 text-xs font-semibold text-[var(--color-primary)]">
                <Target className="w-3.5 h-3.5" />
                Suggested for {priorityCategoryLabel}
                <span className="ml-auto text-[10px] font-normal text-[var(--color-text-secondary)]">
                  {priorityPhrases.length}
                </span>
              </div>
              <div className="ml-1">
                {priorityPhrases.map((phrase) => (
                  <button
                    key={phrase.id}
                    className="flex items-start gap-2 w-full text-left px-2 py-2 text-sm text-[var(--color-text)] rounded-lg hover:bg-[var(--color-primary)]/5 transition-colors group"
                    onClick={() => {
                      onInsert(phrase.phrase);
                      onClose();
                    }}
                  >
                    <span className="flex-1 leading-snug">
                      {phrase.phrase}
                    </span>
                    {isPro && (
                      <button
                        onClick={(e) => handleToggleFavorite(phrase.id, e)}
                        className="flex-shrink-0 mt-0.5 p-0.5 rounded hover:bg-gray-100"
                        title={phrase.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                      >
                        <Star
                          className={`w-3.5 h-3.5 ${
                            phrase.is_favorite
                              ? 'fill-amber-400 text-amber-400'
                              : 'text-gray-300 group-hover:text-gray-400'
                          }`}
                        />
                      </button>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
          {categoryKeys.map((category) => {
            const isCollapsed = collapsedCategories.has(category);
            const items = grouped[category];
            return (
              <div key={category} className="mb-1">
                <button
                  className="flex items-center gap-1.5 w-full px-2 py-1.5 text-xs font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider hover:bg-gray-50 rounded-md"
                  onClick={() => toggleCategory(category)}
                >
                  {isCollapsed ? (
                    <ChevronRight className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )}
                  {category.replace(/_/g, ' ')}
                  <span className="ml-auto text-[10px] font-normal">
                    {items.length}
                  </span>
                </button>
                {!isCollapsed && (
                  <div className="ml-1">
                    {items.map((phrase) => (
                      <button
                        key={phrase.id}
                        className="flex items-start gap-2 w-full text-left px-2 py-2 text-sm text-[var(--color-text)] rounded-lg hover:bg-[var(--color-primary)]/5 transition-colors group"
                        onClick={() => {
                          onInsert(phrase.phrase);
                          onClose();
                        }}
                      >
                        <span className="flex-1 leading-snug">
                          {phrase.phrase}
                        </span>
                        {isPro && (
                          <button
                            onClick={(e) => handleToggleFavorite(phrase.id, e)}
                            className="flex-shrink-0 mt-0.5 p-0.5 rounded hover:bg-gray-100"
                            title={phrase.is_favorite ? 'Remove from favorites' : 'Add to favorites'}
                          >
                            <Star
                              className={`w-3.5 h-3.5 ${
                                phrase.is_favorite
                                  ? 'fill-amber-400 text-amber-400'
                                  : 'text-gray-300 group-hover:text-gray-400'
                              }`}
                            />
                          </button>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
          </>
        )}
      </div>

      {/* Add Custom Phrase */}
      <div className="border-t border-[var(--color-border)] px-4 py-2">
        {showAddForm ? (
          <div className="space-y-2">
            <input
              type="text"
              className="input text-sm py-1.5"
              placeholder="Category (e.g., pain, function)"
              value={newCategory}
              onChange={(e) => setNewCategory(e.target.value)}
            />
            <textarea
              className="textarea text-sm py-1.5 min-h-[60px]"
              placeholder="Enter your custom phrase..."
              value={newPhrase}
              onChange={(e) => setNewPhrase(e.target.value)}
            />
            <div className="flex items-center gap-2">
              <button
                className="btn-primary btn-sm flex-1"
                onClick={handleAddPhrase}
                disabled={saving || !newPhrase.trim()}
              >
                {saving ? 'Adding...' : 'Add Phrase'}
              </button>
              <button
                className="btn-ghost btn-sm"
                onClick={() => {
                  setShowAddForm(false);
                  setNewPhrase('');
                  setNewCategory('');
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        ) : (
          <button
            className="btn-ghost btn-sm w-full flex items-center justify-center gap-1.5"
            onClick={() => setShowAddForm(true)}
          >
            <Plus className="w-3.5 h-3.5" />
            Add Custom Phrase
          </button>
        )}
      </div>
    </div>
  );
}
