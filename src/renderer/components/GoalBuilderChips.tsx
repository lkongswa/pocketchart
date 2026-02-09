import React from 'react';
import type { Discipline } from '../../shared/types';

interface GoalBuilderChipsProps {
  discipline: Discipline;
  category: string;
  onInsert: (value: string) => void;
}

interface ChipGroup {
  label: string;
  chips: string[];
  applies: {
    discipline?: Discipline[];
    category?: string[];
  };
}

const GOAL_CHIP_GROUPS: ChipGroup[] = [
  {
    label: 'Assist Level',
    chips: ['I (independent)', 'SBA', 'CGA', 'Min A', 'Mod A', 'Max A', 'Dep'],
    applies: { discipline: ['PT', 'OT'] },
  },
  {
    label: 'Sound Position',
    chips: ['initial', 'medial', 'final', 'all positions'],
    applies: { discipline: ['ST'], category: ['Articulation'] },
  },
  {
    label: 'Complexity Level',
    chips: ['isolation', 'syllable', 'word', 'phrase', 'sentence', 'conversation'],
    applies: { discipline: ['ST'], category: ['Articulation', 'Language Expression', 'Phonological Awareness'] },
  },
  {
    label: 'Cue Level',
    chips: ['independent', 'min cues', 'mod cues', 'max cues', 'hand-over-hand'],
    applies: { discipline: ['PT', 'OT', 'ST'] },
  },
  {
    label: 'Context',
    chips: ['structured activity', 'conversation', 'reading', 'narrative', 'play'],
    applies: { discipline: ['ST'], category: ['Language Expression', 'Fluency', 'Pragmatics'] },
  },
  {
    label: 'Device',
    chips: ['no device', 'cane', 'FWW', 'RW', 'WBQC', '2-wheel walker'],
    applies: { discipline: ['PT'], category: ['Mobility', 'Gait'] },
  },
  {
    label: 'Diet Consistency',
    chips: ['thin liquids', 'nectar-thick', 'honey-thick', 'puree', 'mechanical soft', 'regular'],
    applies: { discipline: ['ST'], category: ['Feeding/Swallowing'] },
  },
  {
    label: 'Swallow Strategy',
    chips: ['chin tuck', 'head turn', 'effortful swallow', 'supraglottic swallow', 'multiple swallows'],
    applies: { discipline: ['ST'], category: ['Feeding/Swallowing'] },
  },
  {
    label: 'ADL Task',
    chips: ['dressing', 'grooming', 'bathing', 'feeding', 'toileting', 'meal prep'],
    applies: { discipline: ['OT'], category: ['ADLs', 'Self-Care'] },
  },
  {
    label: 'MFT Measure',
    chips: ['PHQ-9', 'GAD-7', 'PCL-5', 'ORS', 'SRS', 'BDI-II'],
    applies: { discipline: ['MFT'] },
  },
];

export default function GoalBuilderChips({ discipline, category, onInsert }: GoalBuilderChipsProps) {
  const matchingGroups = GOAL_CHIP_GROUPS.filter((group) => {
    const { applies } = group;
    const disciplineMatch = !applies.discipline || applies.discipline.includes(discipline);
    const categoryMatch = !applies.category || applies.category.includes(category);
    return disciplineMatch && categoryMatch;
  });

  if (matchingGroups.length === 0) return null;

  return (
    <div className="space-y-2 mt-2 mb-1">
      {matchingGroups.map((group) => (
        <div key={group.label}>
          <p className="text-[10px] uppercase tracking-wide text-[var(--color-text-secondary)] font-semibold mb-1">
            {group.label}
          </p>
          <div className="flex flex-wrap gap-1">
            {group.chips.map((chip) => (
              <button
                key={chip}
                type="button"
                className="px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--color-primary)]/10 text-[var(--color-primary)] hover:bg-[var(--color-primary)]/20 active:bg-[var(--color-primary)]/30 transition-colors cursor-pointer border border-[var(--color-primary)]/20"
                onClick={() => onInsert(chip)}
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
