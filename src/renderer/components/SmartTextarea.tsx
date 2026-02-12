import React, { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { Sparkles } from 'lucide-react';
import type { Discipline, SOAPSection, NoteBankEntry } from '../../shared/types';

interface SmartTextareaProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  rows?: number;
  className?: string;
  discipline: Discipline;
  section: SOAPSection;
  disabled?: boolean;
}

interface Suggestion {
  id: number;
  phrase: string;
  category: string;
  score: number;
}

const SmartTextarea = forwardRef<HTMLTextAreaElement, SmartTextareaProps>(
  ({ value, onChange, placeholder, rows = 4, className = 'textarea', discipline, section, disabled }, ref) => {
    const internalRef = useRef<HTMLTextAreaElement>(null);
    useImperativeHandle(ref, () => internalRef.current!);

    const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
    const [showSuggestions, setShowSuggestions] = useState(false);
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [allPhrases, setAllPhrases] = useState<NoteBankEntry[]>([]);
    const [phrasesLoaded, setPhrasesLoaded] = useState(false);
    const suggestionsRef = useRef<HTMLDivElement>(null);
    const debounceRef = useRef<ReturnType<typeof setTimeout>>(null);

    // Load all phrases for this discipline/section once
    useEffect(() => {
      let cancelled = false;
      async function loadPhrases() {
        try {
          const phrases = await window.api.noteBank.list({ discipline, section });
          if (!cancelled) {
            setAllPhrases(phrases);
            setPhrasesLoaded(true);
          }
        } catch (err) {
          console.error('Failed to load note bank phrases:', err);
        }
      }
      loadPhrases();
      return () => { cancelled = true; };
    }, [discipline, section]);

    // Score and rank suggestions based on what the user is currently typing
    const computeSuggestions = useCallback((text: string) => {
      if (!phrasesLoaded || !text.trim()) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      // Get the current line/sentence being typed (from last period, newline, or start)
      const textarea = internalRef.current;
      if (!textarea) return;

      const cursorPos = textarea.selectionStart;
      const textUpToCursor = text.slice(0, cursorPos);

      // Find the start of the current sentence/phrase
      const lastBreak = Math.max(
        textUpToCursor.lastIndexOf('.'),
        textUpToCursor.lastIndexOf('\n'),
        textUpToCursor.lastIndexOf(';')
      );
      const currentFragment = textUpToCursor.slice(lastBreak + 1).trim().toLowerCase();

      if (currentFragment.length < 2) {
        setSuggestions([]);
        setShowSuggestions(false);
        return;
      }

      // Split fragment into individual words for matching
      const words = currentFragment.split(/\s+/).filter(w => w.length > 1);

      const scored: Suggestion[] = allPhrases
        .map(entry => {
          const phraseLower = entry.phrase.toLowerCase();

          // Skip if the phrase is already in the text
          if (text.toLowerCase().includes(phraseLower)) {
            return { id: entry.id, phrase: entry.phrase, category: entry.category, score: -1 };
          }

          let score = 0;

          // Exact fragment match (highest priority)
          if (phraseLower.includes(currentFragment)) {
            score += 50;
          }

          // Starts with the fragment
          if (phraseLower.startsWith(currentFragment)) {
            score += 30;
          }

          // Word-level matching
          for (const word of words) {
            if (phraseLower.includes(word)) {
              score += 10;
              // Bonus for word at start of phrase
              if (phraseLower.startsWith(word)) {
                score += 5;
              }
            }
          }

          // Bonus for favorites
          if (entry.is_favorite) {
            score += 8;
          }

          // Small penalty for very long phrases (prefer concise)
          if (entry.phrase.length > 120) {
            score -= 2;
          }

          return { id: entry.id, phrase: entry.phrase, category: entry.category, score };
        })
        .filter(s => s.score > 5)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5);

      setSuggestions(scored);
      setShowSuggestions(scored.length > 0);
      setSelectedIndex(0);
    }, [allPhrases, phrasesLoaded]);

    // Debounced suggestion computation on text change
    // NOTE: only depend on `value` — computeSuggestions is stable via ref closure
    const computeSuggestionsRef = useRef(computeSuggestions);
    computeSuggestionsRef.current = computeSuggestions;
    useEffect(() => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        computeSuggestionsRef.current(value);
      }, 200);
      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
      };
    }, [value]);

    const acceptSuggestion = useCallback((phrase: string) => {
      const textarea = internalRef.current;
      if (!textarea) {
        onChange(value ? value + ' ' + phrase : phrase);
        setShowSuggestions(false);
        return;
      }

      const cursorPos = textarea.selectionStart;
      const textUpToCursor = value.slice(0, cursorPos);
      const textAfterCursor = value.slice(cursorPos);

      // Find start of current sentence/fragment
      const lastBreak = Math.max(
        textUpToCursor.lastIndexOf('.'),
        textUpToCursor.lastIndexOf('\n'),
        textUpToCursor.lastIndexOf(';')
      );
      const beforeFragment = value.slice(0, lastBreak + 1);
      const needsSpace = beforeFragment.length > 0 && !beforeFragment.endsWith(' ') && !beforeFragment.endsWith('\n');

      const newValue = beforeFragment + (needsSpace ? ' ' : '') + phrase + textAfterCursor;
      onChange(newValue);

      setShowSuggestions(false);

      // Set cursor after inserted phrase
      setTimeout(() => {
        const newPos = beforeFragment.length + (needsSpace ? 1 : 0) + phrase.length;
        textarea.focus();
        textarea.setSelectionRange(newPos, newPos);
      }, 0);
    }, [value, onChange]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (!showSuggestions || suggestions.length === 0) return;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, suggestions.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Tab' || e.key === 'Enter') {
        // Only intercept Tab, let Enter work normally for newlines unless suggestions are visible
        if (e.key === 'Tab') {
          e.preventDefault();
          acceptSuggestion(suggestions[selectedIndex].phrase);
        } else if (e.key === 'Enter' && suggestions.length > 0) {
          // Only accept on Enter if user has explicitly navigated with arrows
          if (selectedIndex > 0) {
            e.preventDefault();
            acceptSuggestion(suggestions[selectedIndex].phrase);
          }
        }
      } else if (e.key === 'Escape') {
        setShowSuggestions(false);
      }
    }, [showSuggestions, suggestions, selectedIndex, acceptSuggestion]);

    // Close suggestions when clicking outside
    useEffect(() => {
      function handleClickOutside(e: MouseEvent) {
        if (
          suggestionsRef.current &&
          !suggestionsRef.current.contains(e.target as Node) &&
          internalRef.current !== e.target
        ) {
          setShowSuggestions(false);
        }
      }
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
      <div className="relative">
        <textarea
          ref={internalRef}
          className={className}
          rows={rows}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={handleKeyDown}
          disabled={disabled}
          onBlur={() => {
            // Delay hiding to allow click on suggestion
            setTimeout(() => setShowSuggestions(false), 150);
          }}
          onFocus={() => {
            if (value.trim().length >= 2) {
              computeSuggestions(value);
            }
          }}
        />

        {/* Suggestion dropdown */}
        {showSuggestions && suggestions.length > 0 && (
          <div
            ref={suggestionsRef}
            className="absolute left-0 right-0 z-40 mt-1 bg-white border border-[var(--color-border)] rounded-lg shadow-lg overflow-hidden"
          >
            <div className="px-3 py-1.5 bg-gray-50 border-b border-[var(--color-border)] flex items-center gap-1.5">
              <Sparkles className="w-3 h-3 text-[var(--color-accent)]" />
              <span className="text-[10px] font-medium text-[var(--color-text-secondary)] uppercase tracking-wider">
                Suggestions
              </span>
              <span className="text-[10px] text-[var(--color-text-secondary)] ml-auto">
                Tab to accept
              </span>
            </div>
            {suggestions.map((suggestion, index) => (
              <button
                key={suggestion.id}
                className={`w-full text-left px-3 py-2 text-sm transition-colors border-b border-gray-50 last:border-0 ${
                  index === selectedIndex
                    ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                    : 'text-[var(--color-text)] hover:bg-gray-50'
                }`}
                onMouseDown={(e) => {
                  e.preventDefault(); // Prevent blur
                  acceptSuggestion(suggestion.phrase);
                }}
                onMouseEnter={() => setSelectedIndex(index)}
              >
                <div className="flex items-start gap-2">
                  <span className="flex-1 leading-snug">{suggestion.phrase}</span>
                  <span className="text-[10px] text-[var(--color-text-secondary)] bg-gray-100 px-1.5 py-0.5 rounded flex-shrink-0 mt-0.5">
                    {suggestion.category}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }
);

SmartTextarea.displayName = 'SmartTextarea';

export default SmartTextarea;
