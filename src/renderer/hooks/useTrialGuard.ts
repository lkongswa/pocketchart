import { useState, useCallback } from 'react';
import { useTier } from './useTier';

/**
 * Hook that guards creation actions when the trial has expired.
 *
 * Usage:
 *   const { guardAction, showExpiredModal, dismissExpiredModal } = useTrialGuard();
 *
 *   // Before creating a record:
 *   const handleNewClient = () => {
 *     if (!guardAction()) return;  // Blocked — modal will show
 *     // ... proceed with creation
 *   };
 *
 *   // In JSX:
 *   {showExpiredModal && <TrialExpiredModal onClose={dismissExpiredModal} />}
 */
export function useTrialGuard() {
  const { trialExpired } = useTier();
  const [showExpiredModal, setShowExpiredModal] = useState(false);

  /**
   * Returns true if the action is allowed, false if blocked.
   * When blocked, automatically shows the trial-expired modal.
   */
  const guardAction = useCallback((): boolean => {
    if (trialExpired) {
      setShowExpiredModal(true);
      return false;
    }
    return true;
  }, [trialExpired]);

  const dismissExpiredModal = useCallback(() => {
    setShowExpiredModal(false);
  }, []);

  return {
    guardAction,
    showExpiredModal,
    dismissExpiredModal,
    trialExpired,
  };
}
