import { useState, useEffect, useCallback } from 'react';
import type { Discipline } from '../../shared/types';

export type RehabChipCategory = 'rehab_potential' | 'medical_necessity';

export interface RehabChip {
  id: number;
  phrase: string;
  category: RehabChipCategory;
  is_default: boolean;
  discipline: Discipline | 'ALL';
}

export function useRehabChips(discipline: Discipline) {
  const [chips, setChips] = useState<RehabChip[]>([]);

  const loadChips = useCallback(async () => {
    try {
      const results = await window.api.noteBank.list({
        discipline,
        section: 'rehab_potential',
      });
      setChips(results.map((r: any) => ({
        id: r.id,
        phrase: r.phrase,
        category: r.category as RehabChipCategory,
        is_default: !!r.is_default,
        discipline: r.discipline,
      })));
    } catch (err) {
      console.error('Failed to load rehab chips:', err);
    }
  }, [discipline]);

  useEffect(() => { loadChips(); }, [loadChips]);

  const addChip = useCallback(async (phrase: string, category: RehabChipCategory) => {
    await window.api.noteBank.create({
      discipline,
      section: 'rehab_potential',
      category,
      phrase,
      is_default: false,
      is_favorite: true,
    });
    await loadChips();
  }, [discipline, loadChips]);

  const updateChip = useCallback(async (id: number, phrase: string, category?: RehabChipCategory) => {
    const updates: any = { phrase };
    if (category) updates.category = category;
    await window.api.noteBank.update(id, updates);
    await loadChips();
  }, [loadChips]);

  const deleteChip = useCallback(async (id: number) => {
    await window.api.noteBank.delete(id);
    await loadChips();
  }, [loadChips]);

  return { chips, addChip, updateChip, deleteChip, reloadChips: loadChips };
}
