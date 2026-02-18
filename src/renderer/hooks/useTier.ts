import { useState, useEffect, useCallback } from 'react';
import type { AppTier, LicenseStatus } from '@shared/types';

const PRO_FEATURES = new Set([
  'contractor_module',
  'professional_vault',
  'stripe_billing',
  'mileage_tracking',
  'communication_log',
  'caseload_dashboard',
  'batch_invoicing',
  'tax_summary',
  'quick_chips',
  'waitlist',
  'fax',
  'insurance_billing',
]);

export function useTier() {
  const [tier, setTier] = useState<AppTier>('unlicensed');
  const [licenseStatus, setLicenseStatus] = useState<LicenseStatus | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const status = await window.api.license.getStatus();
      setTier(status.tier);
      setLicenseStatus(status);
    } catch (err) {
      console.error('Failed to load license status:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Listen for tier changes (e.g., after activation/deactivation)
  useEffect(() => {
    const handler = () => refresh();
    window.addEventListener('pocketchart:tier-changed', handler);
    return () => window.removeEventListener('pocketchart:tier-changed', handler);
  }, [refresh]);

  // Listen for startup/background validation tier changes from main process
  useEffect(() => {
    const cleanup = window.api.license.onTierChanged(() => refresh());
    return cleanup;
  }, [refresh]);

  const hasFeature = useCallback((feature: string): boolean => {
    if (tier === 'unlicensed') return false;
    if (PRO_FEATURES.has(feature)) return tier === 'pro';
    // Basic features are available to basic and pro
    return tier === 'basic' || tier === 'pro';
  }, [tier]);

  const isBasicOrHigher = tier === 'basic' || tier === 'pro';
  const isPro = tier === 'pro';
  const isUnlicensed = tier === 'unlicensed';

  // Trial state — derived from licenseStatus
  const trialActive = licenseStatus?.trialActive ?? false;
  const trialExpired = licenseStatus?.trialExpired ?? false;
  const trialDaysRemaining = licenseStatus?.trialDaysRemaining ?? 0;

  return {
    tier,
    licenseStatus,
    loading,
    hasFeature,
    isBasicOrHigher,
    isPro,
    isUnlicensed,
    trialActive,
    trialExpired,
    trialDaysRemaining,
    refresh,
  };
}
