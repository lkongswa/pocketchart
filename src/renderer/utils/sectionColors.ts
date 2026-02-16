/**
 * Shared section color definitions used throughout the app
 * for visual differentiation of chart sections.
 */

export type SectionColor = 'blue' | 'violet' | 'emerald' | 'amber' | 'slate' | 'teal';

export interface SectionColorValues {
  border: string;    // border-l-4 color
  bg: string;        // header background tint
  icon: string;      // icon text color
  dot: string;       // small dot color (legacy)
  headerBorder: string; // bottom border of header
}

export const sectionColorMap: Record<SectionColor, SectionColorValues> = {
  blue: {
    border: 'border-l-blue-400',
    bg: 'bg-blue-50/50',
    icon: 'text-blue-500',
    dot: 'bg-blue-400',
    headerBorder: 'border-blue-200',
  },
  violet: {
    border: 'border-l-violet-400',
    bg: 'bg-violet-50/50',
    icon: 'text-violet-500',
    dot: 'bg-violet-400',
    headerBorder: 'border-violet-200',
  },
  emerald: {
    border: 'border-l-emerald-400',
    bg: 'bg-emerald-50/50',
    icon: 'text-emerald-500',
    dot: 'bg-emerald-400',
    headerBorder: 'border-emerald-200',
  },
  amber: {
    border: 'border-l-amber-400',
    bg: 'bg-amber-50/50',
    icon: 'text-amber-500',
    dot: 'bg-amber-400',
    headerBorder: 'border-amber-200',
  },
  slate: {
    border: 'border-l-slate-400',
    bg: 'bg-slate-50/50',
    icon: 'text-slate-500',
    dot: 'bg-slate-400',
    headerBorder: 'border-slate-200',
  },
  teal: {
    border: 'border-l-teal-400',
    bg: 'bg-teal-50/50',
    icon: 'text-teal-500',
    dot: 'bg-teal-400',
    headerBorder: 'border-teal-200',
  },
};
