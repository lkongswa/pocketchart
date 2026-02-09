import React, { useState, useEffect, useRef, useCallback } from 'react';
import { ChevronDown, Plus } from 'lucide-react';

type CategorySource = 'note_bank' | 'goals_bank';

interface CategoryComboboxProps {
  value: string;
  onChange: (value: string) => void;
  discipline: string;
  source: CategorySource;
  placeholder?: string;
  className?: string;
}

export default function CategoryCombobox({
  value,
  onChange,
  discipline,
  source,
  placeholder = 'Select or type a category...',
  className = '',
}: CategoryComboboxProps) {
  const [inputValue, setInputValue] = useState(value);
  const [categories, setCategories] = useState<string[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [highlightIndex, setHighlightIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Sync external value changes
  useEffect(() => {
    setInputValue(value);
  }, [value]);

  // Fetch categories when discipline changes
  const loadCategories = useCallback(async () => {
    try {
      const fetcher = source === 'note_bank'
        ? window.api.noteBank.getCategories
        : window.api.goalsBank.getCategories;
      const cats = await fetcher(discipline);
      setCategories(cats);
    } catch (err) {
      console.error('Failed to load categories:', err);
      setCategories([]);
    }
  }, [discipline, source]);

  useEffect(() => {
    loadCategories();
  }, [loadCategories]);

  // Filter categories based on input
  const filtered = categories.filter((cat) =>
    cat.toLowerCase().includes(inputValue.toLowerCase())
  );

  const exactMatch = categories.some(
    (cat) => cat.toLowerCase() === inputValue.trim().toLowerCase()
  );

  const showCreateOption = inputValue.trim() && !exactMatch;

  // Combined list for keyboard nav: filtered items + optional create option
  const totalOptions = filtered.length + (showCreateOption ? 1 : 0);

  const handleFocus = () => {
    setIsOpen(true);
    setHighlightIndex(-1);
  };

  const handleBlur = () => {
    // Delay to allow click on dropdown items
    setTimeout(() => {
      if (
        containerRef.current &&
        !containerRef.current.contains(document.activeElement)
      ) {
        // Normalize to existing casing if match exists
        const match = categories.find(
          (cat) => cat.toLowerCase() === inputValue.trim().toLowerCase()
        );
        if (match) {
          setInputValue(match);
          onChange(match);
        } else if (inputValue.trim()) {
          onChange(inputValue.trim());
        }
        setIsOpen(false);
      }
    }, 150);
  };

  const selectCategory = (cat: string) => {
    setInputValue(cat);
    onChange(cat);
    setIsOpen(false);
    setHighlightIndex(-1);
  };

  const createNew = () => {
    const trimmed = inputValue.trim();
    if (trimmed) {
      onChange(trimmed);
      setIsOpen(false);
      setHighlightIndex(-1);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!isOpen) {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        setIsOpen(true);
        setHighlightIndex(0);
        e.preventDefault();
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setHighlightIndex((prev) => Math.min(prev + 1, totalOptions - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setHighlightIndex((prev) => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (highlightIndex >= 0 && highlightIndex < filtered.length) {
          selectCategory(filtered[highlightIndex]);
        } else if (highlightIndex === filtered.length && showCreateOption) {
          createNew();
        } else if (showCreateOption) {
          createNew();
        } else if (filtered.length === 1) {
          selectCategory(filtered[0]);
        }
        break;
      case 'Escape':
        e.preventDefault();
        setInputValue(value); // revert
        setIsOpen(false);
        setHighlightIndex(-1);
        break;
      case 'Tab':
        // Accept current selection
        if (highlightIndex >= 0 && highlightIndex < filtered.length) {
          selectCategory(filtered[highlightIndex]);
        } else {
          const match = categories.find(
            (cat) => cat.toLowerCase() === inputValue.trim().toLowerCase()
          );
          if (match) {
            selectCategory(match);
          } else if (inputValue.trim()) {
            onChange(inputValue.trim());
          }
        }
        setIsOpen(false);
        break;
    }
  };

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightIndex >= 0 && dropdownRef.current) {
      const item = dropdownRef.current.children[highlightIndex] as HTMLElement;
      if (item) {
        item.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [highlightIndex]);

  return (
    <div ref={containerRef} className={`relative ${className}`}>
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          className="input pr-8"
          placeholder={placeholder}
          value={inputValue}
          onChange={(e) => {
            setInputValue(e.target.value);
            setIsOpen(true);
            setHighlightIndex(-1);
          }}
          onFocus={handleFocus}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className="absolute right-2 top-1/2 -translate-y-1/2 p-0.5 text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
          tabIndex={-1}
          onClick={() => {
            setIsOpen(!isOpen);
            inputRef.current?.focus();
          }}
        >
          <ChevronDown className={`w-4 h-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
        </button>
      </div>

      {isOpen && (filtered.length > 0 || showCreateOption) && (
        <div
          ref={dropdownRef}
          className="absolute z-50 left-0 right-0 mt-1 bg-white border border-[var(--color-border)] rounded-lg shadow-lg max-h-[200px] overflow-y-auto"
        >
          {filtered.map((cat, idx) => (
            <button
              key={cat}
              type="button"
              className={`w-full text-left px-3 py-2 text-sm transition-colors ${
                idx === highlightIndex
                  ? 'bg-[var(--color-primary)]/10 text-[var(--color-primary)]'
                  : 'text-[var(--color-text)] hover:bg-gray-50'
              }`}
              onMouseEnter={() => setHighlightIndex(idx)}
              onMouseDown={(e) => {
                e.preventDefault(); // prevent blur
                selectCategory(cat);
              }}
            >
              {cat}
            </button>
          ))}

          {showCreateOption && (
            <button
              type="button"
              className={`w-full text-left px-3 py-2 text-sm border-t border-[var(--color-border)] transition-colors flex items-center gap-1.5 ${
                highlightIndex === filtered.length
                  ? 'bg-[var(--color-primary)]/10'
                  : 'bg-gray-50 hover:bg-gray-100'
              }`}
              onMouseEnter={() => setHighlightIndex(filtered.length)}
              onMouseDown={(e) => {
                e.preventDefault();
                createNew();
              }}
            >
              <Plus className="w-3.5 h-3.5 text-[var(--color-primary)]" />
              <span className="text-[var(--color-text-secondary)]">Create</span>{' '}
              <span className="font-medium text-[var(--color-text)]">"{inputValue.trim()}"</span>
            </button>
          )}
        </div>
      )}
    </div>
  );
}
