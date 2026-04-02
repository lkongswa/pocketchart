import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  Circle,
  ChevronRight,
  ChevronDown,
  ChevronUp,
  X,
  Sparkles,
  Building2,
  Lock,
  UserPlus,
  FileText,
  PenLine,
  HardDrive,
} from 'lucide-react';

interface OnboardingStatus {
  practiceSetUp: boolean;
  pinSet: boolean;
  hasClient: boolean;
  hasNote: boolean;
  hasSignedNote: boolean;
  hasBackup: boolean;
}

interface ChecklistItem {
  key: keyof OnboardingStatus;
  label: string;
  description: string;
  actionLabel: string;
  icon: React.ReactNode;
  navigate: () => void;
}

export default function OnboardingChecklist() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<OnboardingStatus | null>(null);
  const [dismissed, setDismissed] = useState<boolean | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [allDone, setAllDone] = useState(false);
  const [allDoneAcked, setAllDoneAcked] = useState(false);

  useEffect(() => {
    loadState();
  }, []);

  const loadState = async () => {
    try {
      const [dismissedVal, collapsedVal, statusResult] = await Promise.all([
        window.api.settings.get('onboarding_checklist_dismissed'),
        window.api.settings.get('onboarding_checklist_collapsed'),
        window.api.onboarding.getStatus(),
      ]);

      if (dismissedVal === 'true') {
        setDismissed(true);
        return;
      }
      setDismissed(false);
      setCollapsed(collapsedVal === 'true');
      setStatus(statusResult);

      // Check if all done
      const allComplete =
        statusResult.practiceSetUp &&
        statusResult.pinSet &&
        statusResult.hasClient &&
        statusResult.hasNote &&
        statusResult.hasSignedNote &&
        statusResult.hasBackup;

      if (allComplete) {
        // Check if user already saw the "all done" state previously
        const seenAllDone = await window.api.settings.get('onboarding_checklist_all_done_seen');
        if (seenAllDone === 'true') {
          // Auto-dismiss on second visit with all complete
          setDismissed(true);
          await window.api.settings.set('onboarding_checklist_dismissed', 'true');
          return;
        }
        setAllDone(true);
        await window.api.settings.set('onboarding_checklist_all_done_seen', 'true');
      }
    } catch {
      // Silently fail
      setDismissed(true);
    }
  };

  const handleDismiss = async () => {
    setDismissed(true);
    await window.api.settings.set('onboarding_checklist_dismissed', 'true').catch(() => {});
  };

  const handleToggleCollapse = async () => {
    const next = !collapsed;
    setCollapsed(next);
    await window.api.settings.set('onboarding_checklist_collapsed', next ? 'true' : 'false').catch(() => {});
  };

  // Don't render if dismissed, still loading, or no status
  if (dismissed === null || dismissed || !status) return null;

  const items: ChecklistItem[] = [
    {
      key: 'practiceSetUp',
      label: 'Set up your practice info',
      description: 'Add your practice name and NPI number',
      actionLabel: 'Go to Settings',
      icon: <Building2 size={16} />,
      navigate: () => navigate('/settings?section=practice-info'),
    },
    {
      key: 'pinSet',
      label: 'Set your PIN',
      description: 'Secure your clinical records with a 4-digit PIN',
      actionLabel: 'Set PIN',
      icon: <Lock size={16} />,
      navigate: () => navigate('/settings?section=practice-pin'),
    },
    {
      key: 'hasClient',
      label: 'Add your first client',
      description: 'Create a client record to get started',
      actionLabel: 'Add Client',
      icon: <UserPlus size={16} />,
      navigate: () => navigate('/clients', { state: { openNewClient: true } }),
    },
    {
      key: 'hasNote',
      label: 'Write your first note',
      description: 'Document a treatment session',
      actionLabel: 'Write a Note',
      icon: <FileText size={16} />,
      navigate: () => navigate('/clients'),
    },
    {
      key: 'hasSignedNote',
      label: 'Sign a note',
      description: 'Lock a note into the permanent clinical record',
      actionLabel: 'View Notes',
      icon: <PenLine size={16} />,
      navigate: () => navigate('/notes'),
    },
    {
      key: 'hasBackup',
      label: 'Export your first backup',
      description: 'Protect your data with a backup export',
      actionLabel: 'Export Backup',
      icon: <HardDrive size={16} />,
      navigate: () => navigate('/settings?section=backup'),
    },
  ];

  const completedCount = items.filter((item) => status[item.key]).length;
  const totalCount = items.length;
  const progressPercent = (completedCount / totalCount) * 100;

  // All done state
  if (allDone && !allDoneAcked) {
    return (
      <div className="mb-6 card border-l-4 border-l-emerald-500 overflow-hidden">
        <div className="px-5 py-4 flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 rounded-full bg-emerald-50">
            <Sparkles size={20} className="text-emerald-500" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-semibold text-[var(--color-text)]">
              You're all set!
            </h3>
            <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
              You've completed the PocketChart setup. Happy documenting!
            </p>
          </div>
          <button
            onClick={() => {
              setAllDoneAcked(true);
              handleDismiss();
            }}
            className="btn-secondary text-xs px-3 py-1.5"
          >
            Dismiss
          </button>
        </div>
      </div>
    );
  }

  if (allDone) return null;

  return (
    <div className="mb-6 card border-l-4 border-l-teal-500 overflow-hidden">
      {/* Header */}
      <div className="px-5 py-4 flex items-center gap-3">
        <div className="flex items-center justify-center w-10 h-10 rounded-full bg-teal-50">
          <Sparkles size={20} className="text-teal-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-[var(--color-text)]">
              Getting Started with PocketChart
            </h3>
            <span className="text-xs font-medium text-[var(--color-text-secondary)] bg-gray-100 px-2 py-0.5 rounded-full">
              {completedCount} / {totalCount}
            </span>
          </div>
          {/* Progress bar */}
          <div className="mt-2 h-1.5 bg-gray-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-teal-500 rounded-full transition-all duration-500"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleToggleCollapse}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-[var(--color-text-secondary)] transition-colors"
            title={collapsed ? 'Expand' : 'Collapse'}
          >
            {collapsed ? <ChevronDown size={16} /> : <ChevronUp size={16} />}
          </button>
          <button
            onClick={handleDismiss}
            className="p-1.5 rounded-lg hover:bg-gray-100 text-[var(--color-text-secondary)] transition-colors"
            title="Dismiss checklist"
          >
            <X size={16} />
          </button>
        </div>
      </div>

      {/* Checklist items */}
      {!collapsed && (
        <div className="border-t border-[var(--color-border)]">
          {items.map((item) => {
            const done = status[item.key];
            return (
              <div
                key={item.key}
                className={`flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-gray-50 transition-colors ${
                  done ? 'opacity-60' : ''
                }`}
                onClick={() => !done && item.navigate()}
              >
                {done ? (
                  <CheckCircle2 size={20} className="text-teal-500 flex-shrink-0" />
                ) : (
                  <Circle size={20} className="text-gray-300 flex-shrink-0" />
                )}
                <div className="flex items-center gap-2 text-[var(--color-text-secondary)] flex-shrink-0">
                  {item.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm ${done ? 'text-[var(--color-text-secondary)] line-through' : 'font-medium text-[var(--color-text)]'}`}>
                    {item.label}
                  </p>
                  {!done && (
                    <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                      {item.description}
                    </p>
                  )}
                </div>
                {!done && (
                  <button
                    className="flex items-center gap-1 text-xs font-medium text-[var(--color-primary)] hover:underline flex-shrink-0"
                    onClick={(e) => {
                      e.stopPropagation();
                      item.navigate();
                    }}
                  >
                    {item.actionLabel}
                    <ChevronRight size={14} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
