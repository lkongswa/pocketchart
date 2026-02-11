import { useState, useEffect, useRef, useCallback, useMemo } from 'react';

// ── Types ──

export type SectionStatus = 'complete' | 'optional-empty' | 'required-empty';

export interface EvalSectionDef {
  id: string;
  title: string;
  required: boolean;
  visible: boolean;
  status: SectionStatus;
}

interface EvalSectionInput {
  content: {
    referral_source: string;
    medical_history: string;
    prior_level_of_function: string;
    current_complaints: string;
    objective_assessment: Record<string, string>;
    clinical_impression: string;
    rehabilitation_potential: string;
    precautions: string;
    treatment_plan: string;
    frequency_duration: string;
    goals: string;
    session_note?: {
      date_of_service?: string;
      time_in?: string;
      time_out?: string;
      cpt_codes?: Array<{ code: string; units: number }>;
      place_of_service?: string;
      subjective?: string;
      objective?: string;
      assessment?: string;
      plan?: string;
    };
  } | null;
  evalDate: string;
  goalEntries: Array<{ goal_text: string; goal_type?: string }>;
  completedGoals: any[];
  signatureImage: string;
  signatureTyped: string;
  evalType: 'initial' | 'reassessment' | 'discharge';
  sessionNote?: {
    date_of_service: string;
    time_in: string;
    time_out: string;
    cpt_codes: Array<{ code: string; units: number }>;
    place_of_service: string;
    subjective: string;
    objective: string;
    assessment: string;
    plan: string;
  };
}

interface UseEvalSectionsReturn {
  sections: EvalSectionDef[];
  expandedSections: Record<string, boolean>;
  toggleSection: (id: string) => void;
  expandAll: () => void;
  collapseAll: () => void;
  allExpanded: boolean;
  activeSectionId: string | null;
  sectionRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
  scrollToSection: (id: string) => void;
  scrollContainerRef: React.RefObject<HTMLDivElement | null>;
}

// ── Section definitions ──

const SECTION_DEFS: Array<{
  id: string;
  title: string;
  titleReassessment?: string;
  required: boolean;
  conditional?: boolean;
}> = [
  { id: 'evalDate', title: 'Evaluation Date', required: true },
  { id: 'referralSource', title: 'Referral Source', required: false },
  { id: 'medicalHistory', title: 'Medical History', required: false },
  { id: 'priorLevelOfFunction', title: 'Prior Level of Function', titleReassessment: 'Current Level of Function', required: true },
  { id: 'currentComplaints', title: 'Current Complaints', required: false },
  { id: 'objectiveAssessment', title: 'Objective Assessment', required: false },
  { id: 'clinicalImpression', title: 'Clinical Impression', required: true },
  { id: 'rehabPotential', title: 'Rehab Potential / Medical Necessity', required: true },
  { id: 'precautions', title: 'Precautions / Contraindications', required: false },
  { id: 'goals', title: 'Goals', required: true },
  { id: 'goalsMet', title: 'Goals Met / Completed', required: false, conditional: true },
  { id: 'treatmentPlan', title: 'Treatment Plan', required: true },
  { id: 'frequencyDuration', title: 'Frequency & Duration', required: true },
  { id: 'sessionNote', title: 'Session Note & Billing', required: false },
  { id: 'signature', title: 'Signature', required: false },
];

function hasAnyObjectiveContent(obj: Record<string, string>): boolean {
  return Object.values(obj).some((v) => v && v.trim() !== '');
}

// ── Hook ──

export function useEvalSections(input: EvalSectionInput): UseEvalSectionsReturn {
  const { content, evalDate, goalEntries, completedGoals, signatureImage, signatureTyped, evalType, sessionNote } = input;

  // Collapse state - all expanded by default
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>(() => {
    const init: Record<string, boolean> = {};
    for (const def of SECTION_DEFS) init[def.id] = true;
    return init;
  });

  // Active section for outline highlight
  const [activeSectionId, setActiveSectionId] = useState<string | null>(SECTION_DEFS[0].id);

  // Refs for each section div
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({});

  // Scroll container ref
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  // ── Compute section statuses ──

  const sections = useMemo((): EvalSectionDef[] => {
    if (!content) return SECTION_DEFS.map((d) => ({ id: d.id, title: d.title, required: d.required, visible: !d.conditional, status: 'optional-empty' as SectionStatus }));

    const getStatus = (id: string): { hasContent: boolean; visible: boolean } => {
      switch (id) {
        case 'evalDate':
          return { hasContent: !!evalDate, visible: true };
        case 'referralSource':
          return { hasContent: !!content.referral_source?.trim(), visible: true };
        case 'medicalHistory':
          return { hasContent: !!content.medical_history?.trim(), visible: true };
        case 'priorLevelOfFunction':
          return { hasContent: !!content.prior_level_of_function?.trim(), visible: true };
        case 'currentComplaints':
          return { hasContent: !!content.current_complaints?.trim(), visible: true };
        case 'objectiveAssessment':
          return { hasContent: hasAnyObjectiveContent(content.objective_assessment as any), visible: true };
        case 'clinicalImpression':
          return { hasContent: !!content.clinical_impression?.trim(), visible: true };
        case 'rehabPotential':
          return { hasContent: !!content.rehabilitation_potential?.trim(), visible: true };
        case 'precautions':
          return { hasContent: !!content.precautions?.trim(), visible: true };
        case 'goals': {
          const hasGoalText = goalEntries.length > 0 && goalEntries.some((g) => g.goal_text.trim());
          const hasLTG = goalEntries.some((g) => g.goal_type === 'LTG' && g.goal_text.trim());
          return { hasContent: hasGoalText && hasLTG, visible: true };
        }
        case 'goalsMet':
          return { hasContent: completedGoals.length > 0, visible: completedGoals.length > 0 };
        case 'treatmentPlan':
          return { hasContent: !!content.treatment_plan?.trim(), visible: true };
        case 'frequencyDuration':
          return { hasContent: !!content.frequency_duration?.trim(), visible: true };
        case 'sessionNote': {
          const sn = sessionNote;
          const hasSessionContent = !!(
            sn?.subjective?.trim() || sn?.objective?.trim() ||
            sn?.assessment?.trim() || sn?.plan?.trim() ||
            sn?.time_in || sn?.time_out ||
            (sn?.cpt_codes && sn.cpt_codes.some(c => c.code.trim()))
          );
          return { hasContent: hasSessionContent, visible: true };
        }
        case 'signature':
          return { hasContent: !!signatureTyped?.trim() || !!signatureImage, visible: true };
        default:
          return { hasContent: false, visible: true };
      }
    };

    return SECTION_DEFS.map((def) => {
      const { hasContent, visible } = getStatus(def.id);
      const title = evalType === 'reassessment' && def.titleReassessment ? def.titleReassessment : def.title;
      let status: SectionStatus;
      if (hasContent) {
        status = 'complete';
      } else if (def.required) {
        status = 'required-empty';
      } else {
        status = 'optional-empty';
      }
      return { id: def.id, title, required: def.required, visible, status };
    });
  }, [content, evalDate, goalEntries, completedGoals, signatureImage, signatureTyped, evalType, sessionNote]);

  // ── Collapse controls ──

  const toggleSection = useCallback((id: string) => {
    setExpandedSections((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const expandAll = useCallback(() => {
    setExpandedSections((prev) => {
      const next: Record<string, boolean> = {};
      for (const key of Object.keys(prev)) next[key] = true;
      return next;
    });
  }, []);

  const collapseAll = useCallback(() => {
    setExpandedSections((prev) => {
      const next: Record<string, boolean> = {};
      for (const key of Object.keys(prev)) next[key] = false;
      return next;
    });
  }, []);

  const allExpanded = useMemo(() => {
    return sections.filter((s) => s.visible).every((s) => expandedSections[s.id]);
  }, [sections, expandedSections]);

  // ── Scroll to section ──

  const scrollToSection = useCallback((id: string) => {
    // Immediately highlight clicked section
    setActiveSectionId(id);
    // Expand the section first
    setExpandedSections((prev) => ({ ...prev, [id]: true }));
    // Scroll after a tick so the DOM updates
    setTimeout(() => {
      const el = sectionRefs.current[id];
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }, 50);
  }, []);

  // ── Helper: find which section is closest to the top of the scroll container ──

  const computeActiveSection = useCallback(() => {
    const container = scrollContainerRef.current;
    if (!container) return;
    const containerTop = container.getBoundingClientRect().top;
    let bestId = '';
    let bestDist = Infinity;

    for (const [id, el] of Object.entries(sectionRefs.current)) {
      if (!el) continue;
      const rect = el.getBoundingClientRect();
      // Distance from this section's top to the container's top + a small offset
      const dist = rect.top - containerTop;
      // We want the section whose top is closest to (or just above) the container top
      // Sections above viewport have negative dist; prefer the one closest to 0
      if (dist < 80 && Math.abs(dist) < bestDist) {
        // Section is at or above the top zone
        bestDist = Math.abs(dist);
        bestId = id;
      } else if (bestId === '' && dist >= 0 && dist < bestDist) {
        // Fallback: first section below viewport top
        bestDist = dist;
        bestId = id;
      }
    }

    if (bestId) setActiveSectionId(bestId);
  }, []);

  // ── Scroll tracking + focus tracking ──

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // Scroll handler: throttled via rAF
    let rafId = 0;
    const handleScroll = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(computeActiveSection);
    };

    // Focus handler: when user clicks into a field, highlight that section
    const handleFocusIn = (e: FocusEvent) => {
      const target = e.target as HTMLElement;
      if (!target) return;
      let el: HTMLElement | null = target;
      while (el && el !== container) {
        const sectionId = el.getAttribute('data-section-id');
        if (sectionId) {
          setActiveSectionId(sectionId);
          return;
        }
        el = el.parentElement;
      }
    };

    container.addEventListener('scroll', handleScroll, { passive: true });
    container.addEventListener('focusin', handleFocusIn);

    // Run once to set initial active section
    computeActiveSection();

    return () => {
      cancelAnimationFrame(rafId);
      container.removeEventListener('scroll', handleScroll);
      container.removeEventListener('focusin', handleFocusIn);
    };
  }, [computeActiveSection, sections]); // Re-attach when sections change (visibility)

  return {
    sections,
    expandedSections,
    toggleSection,
    expandAll,
    collapseAll,
    allExpanded,
    activeSectionId,
    sectionRefs,
    scrollToSection,
    scrollContainerRef,
  };
}
