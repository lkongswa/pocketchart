import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Plus, Settings, Star, X } from 'lucide-react';
import { useTier } from '../hooks/useTier';
import type { Discipline, SOAPSection, NoteBankEntry } from '../../shared/types';

interface QuickChipsProps {
  discipline: Discipline;
  section: SOAPSection;
  onInsert: (phrase: string) => void;
  maxChips?: number;
  onOpenFullBank?: () => void;
  priorityCategories?: string[];
}

/**
 * QuickChips - Displays favorite/frequent phrases as clickable chips
 * for one-click insertion into SOAP note sections.
 * Pro-only feature: Basic users see nothing (component returns null).
 */

export default function QuickChips({
  discipline,
  section,
  onInsert,
  maxChips = 8,
  onOpenFullBank,
  priorityCategories = [],
}: QuickChipsProps) {
  const { isPro } = useTier();
  const [chips, setChips] = useState<NoteBankEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [showManage, setShowManage] = useState(false);
  const [allPhrases, setAllPhrases] = useState<NoteBankEntry[]>([]);
  const [showAddInput, setShowAddInput] = useState(false);
  const [newPhraseText, setNewPhraseText] = useState('');
  const [adding, setAdding] = useState(false);
  const addInputRef = useRef<HTMLInputElement>(null);

  const loadChips = useCallback(async () => {
    try {
      setLoading(true);
      // Load phrases for this discipline and section
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

      setAllPhrases(unique);

      // Filter to favorites only for chips display
      // Sort: favorites matching priority categories first, then remaining alphabetically
      const favorites = unique.filter(p => p.is_favorite);
      const sorted = favorites.sort((a, b) => {
        const aMatch = priorityCategories.some(cat => a.category?.toLowerCase() === cat.toLowerCase());
        const bMatch = priorityCategories.some(cat => b.category?.toLowerCase() === cat.toLowerCase());
        if (aMatch && !bMatch) return -1;
        if (!aMatch && bMatch) return 1;
        return a.phrase.localeCompare(b.phrase);
      });
      setChips(sorted.slice(0, maxChips));
    } catch (err) {
      console.error('Failed to load quick chips:', err);
    } finally {
      setLoading(false);
    }
  }, [discipline, section, maxChips, priorityCategories]);

  useEffect(() => {
    loadChips();
  }, [loadChips]);

  const handleToggleFavorite = async (id: number) => {
    try {
      const updated = await window.api.noteBank.toggleFavorite(id);
      // Update allPhrases
      setAllPhrases(prev => prev.map(p => p.id === updated.id ? updated : p));
      // Reload chips to reflect change
      loadChips();
    } catch (err) {
      console.error('Failed to toggle favorite:', err);
    }
  };

  const handleChipClick = (phrase: string) => {
    onInsert(phrase);
  };

  const handleAddNewPhrase = async () => {
    const text = newPhraseText.trim();
    if (!text || adding) return;
    try {
      setAdding(true);
      const created = await window.api.noteBank.create({
        discipline,
        section,
        category: 'custom',
        phrase: text,
        is_default: false,
        is_favorite: true, // auto-favorite so it shows as a chip
      });
      setNewPhraseText('');
      setShowAddInput(false);
      // Refresh chips
      loadChips();
      // Also insert into the note immediately
      onInsert(text);
    } catch (err) {
      console.error('Failed to add phrase:', err);
    } finally {
      setAdding(false);
    }
  };

  // Truncate phrase for chip display
  const truncatePhrase = (phrase: string, maxLen: number = 50): string => {
    if (phrase.length <= maxLen) return phrase;
    return phrase.slice(0, maxLen).trim() + '...';
  };

  // Non-Pro: render nothing — Quick Chips is a Pro-only feature
  if (!isPro) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-1">
        <span className="text-xs text-[var(--color-text-tertiary)]">Loading chips...</span>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Chips Row */}
      <div className="flex items-center gap-1.5 flex-wrap">
        {chips.length === 0 ? (
          <span className="text-xs text-[var(--color-text-tertiary)] italic">
            No quick chips set - star phrases to add them here
          </span>
        ) : (
          chips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium
                bg-[var(--color-primary)]/10 text-[var(--color-primary)]
                hover:bg-[var(--color-primary)]/20
                active:bg-[var(--color-primary)]/30
                transition-colors cursor-pointer border border-[var(--color-primary)]/20"
              onClick={() => handleChipClick(chip.phrase)}
              title={chip.phrase}
            >
              {truncatePhrase(chip.phrase, 40)}
            </button>
          ))
        )}

        {/* Manage Chips Button */}
        <button
          type="button"
          className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium
            text-[var(--color-text-secondary)] hover:text-[var(--color-text)]
            hover:bg-gray-100 transition-colors"
          onClick={() => setShowManage(!showManage)}
          title="Manage quick chips"
        >
          <Settings className="w-3 h-3" />
        </button>

        {/* Quick Add Inline */}
        {showAddInput ? (
          <div className="inline-flex items-center gap-1">
            <input
              ref={addInputRef}
              type="text"
              className="px-2 py-0.5 text-xs rounded-full border border-[var(--color-primary)]/30 bg-white focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] w-48"
              placeholder="Type phrase & press Enter"
              value={newPhraseText}
              onChange={(e) => setNewPhraseText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  handleAddNewPhrase();
                } else if (e.key === 'Escape') {
                  setShowAddInput(false);
                  setNewPhraseText('');
                }
              }}
              disabled={adding}
            />
            <button
              type="button"
              className="p-0.5 rounded hover:bg-gray-200"
              onClick={() => { setShowAddInput(false); setNewPhraseText(''); }}
            >
              <X className="w-3 h-3 text-[var(--color-text-secondary)]" />
            </button>
          </div>
        ) : (
          <button
            type="button"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium
              text-[var(--color-text-secondary)] hover:text-[var(--color-text)]
              hover:bg-gray-100 transition-colors"
            onClick={() => {
              setShowAddInput(true);
              setTimeout(() => addInputRef.current?.focus(), 50);
            }}
            title="Add a new quick phrase"
          >
            <Plus className="w-3 h-3" />
          </button>
        )}

        {/* Open Full Bank */}
        {onOpenFullBank && (
          <button
            type="button"
            className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium
              text-[var(--color-text-secondary)] hover:text-[var(--color-text)]
              hover:bg-gray-100 transition-colors"
            onClick={onOpenFullBank}
            title="Browse all phrases"
          >
            More
          </button>
        )}
      </div>

      {/* Manage Chips Dropdown */}
      {showManage && (
        <div className="absolute z-40 top-full left-0 mt-2 w-80 bg-white rounded-lg border border-[var(--color-border)] shadow-xl max-h-64 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b border-[var(--color-border)] bg-gray-50">
            <span className="text-xs font-semibold text-[var(--color-text)]">
              Quick Chips - Click star to add/remove
            </span>
            <button
              type="button"
              className="p-0.5 rounded hover:bg-gray-200"
              onClick={() => setShowManage(false)}
            >
              <X className="w-3.5 h-3.5 text-[var(--color-text-secondary)]" />
            </button>
          </div>
          <div className="overflow-y-auto max-h-52 p-2 space-y-0.5">
            {allPhrases.length === 0 ? (
              <p className="text-xs text-[var(--color-text-secondary)] text-center py-4">
                No phrases available. Add phrases in the Note Bank.
              </p>
            ) : (
              allPhrases.map((phrase) => (
                <div
                  key={phrase.id}
                  className="flex items-start gap-2 p-2 rounded-md hover:bg-gray-50 group"
                >
                  <button
                    type="button"
                    className="flex-shrink-0 p-0.5 rounded hover:bg-gray-200"
                    onClick={() => handleToggleFavorite(phrase.id)}
                    title={phrase.is_favorite ? 'Remove from quick chips' : 'Add to quick chips'}
                  >
                    <Star
                      className={`w-4 h-4 ${
                        phrase.is_favorite
                          ? 'fill-amber-400 text-amber-400'
                          : 'text-gray-300 group-hover:text-gray-400'
                      }`}
                    />
                  </button>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-[var(--color-text)] leading-snug line-clamp-2">
                      {phrase.phrase}
                    </p>
                    {phrase.category && (
                      <span className="text-[10px] text-[var(--color-text-tertiary)]">
                        {phrase.category}
                      </span>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
