import React from 'react';
import { Lock } from 'lucide-react';
import { useTier } from '../hooks/useTier';

interface ProFeatureGateProps {
  feature: string;
  children: React.ReactNode;
  /** Optional: show a custom locked message */
  lockedMessage?: string;
}

/**
 * Wraps content that requires a specific tier.
 * If the user doesn't have access, shows a locked overlay with upgrade prompt.
 * Pro features are visible but locked for Basic users (progressive disclosure).
 */
export default function ProFeatureGate({ feature, children, lockedMessage }: ProFeatureGateProps) {
  const { hasFeature, tier } = useTier();

  if (hasFeature(feature)) {
    return <>{children}</>;
  }

  return (
    <div className="relative">
      {/* Show the content dimmed behind the gate */}
      <div className="opacity-30 pointer-events-none select-none" aria-hidden="true">
        {children}
      </div>
      {/* Overlay */}
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="bg-[var(--color-surface)] border border-[var(--color-border)] rounded-xl p-6 shadow-lg text-center max-w-sm">
          <div className="w-12 h-12 rounded-full bg-[var(--color-primary)]/10 flex items-center justify-center mx-auto mb-3">
            <Lock className="w-6 h-6 text-[var(--color-primary)]" />
          </div>
          <h3 className="text-sm font-semibold text-[var(--color-text)] mb-1">
            Pro Feature
          </h3>
          <p className="text-xs text-[var(--color-text-secondary)] mb-4">
            {lockedMessage || 'Upgrade to PocketChart Pro to unlock this feature.'}
          </p>
          <button
            className="btn-primary btn-sm"
            onClick={() => {
              // Navigate to settings/license page
              window.location.hash = '#/settings';
            }}
          >
            Upgrade to Pro
          </button>
        </div>
      </div>
    </div>
  );
}
