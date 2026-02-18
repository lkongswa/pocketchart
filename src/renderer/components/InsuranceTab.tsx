import React, { useState, useEffect, useCallback } from 'react';
import { AlertCircle, ExternalLink } from 'lucide-react';
import { useClaims } from '../hooks/useClaims';
import ClaimsList from './ClaimsList';
import ClaimDetail from './ClaimDetail';

interface InsuranceTabProps {
  onToast: (msg: string) => void;
}

type InsuranceView = 'list' | 'detail';

export default function InsuranceTab({ onToast }: InsuranceTabProps) {
  const [view, setView] = useState<InsuranceView>('list');
  const [selectedClaimId, setSelectedClaimId] = useState<number | null>(null);
  const [clearinghouseConnected, setClearinghouseConnected] = useState<boolean | null>(null);

  const {
    claims,
    loading,
    error,
    refresh,
    createFromNotes,
    clearError,
  } = useClaims();

  // Check clearinghouse connection on mount
  useEffect(() => {
    window.api.clearinghouse.getProviderStatus()
      .then((status) => setClearinghouseConnected(status.configured))
      .catch(() => setClearinghouseConnected(false));
  }, []);

  const handleSelectClaim = useCallback((claimId: number) => {
    setSelectedClaimId(claimId);
    setView('detail');
  }, []);

  const handleBack = useCallback(() => {
    setView('list');
    setSelectedClaimId(null);
  }, []);

  const handleRefreshList = useCallback(() => {
    refresh();
  }, [refresh]);

  return (
    <div className="space-y-4">
      {/* Clearinghouse Connection Banner */}
      {clearinghouseConnected === false && (
        <div className="flex items-center gap-3 p-3 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertCircle className="w-5 h-5 text-amber-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-amber-800">Clearinghouse not connected</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Configure your clearinghouse credentials in Settings to submit claims electronically.
            </p>
          </div>
        </div>
      )}

      {/* View Switch */}
      {view === 'list' && (
        <ClaimsList
          claims={claims}
          loading={loading}
          error={error}
          onSelectClaim={handleSelectClaim}
          onCreateClaim={createFromNotes}
          onRefresh={refresh}
          onToast={onToast}
        />
      )}

      {view === 'detail' && selectedClaimId && (
        <ClaimDetail
          claimId={selectedClaimId}
          onBack={handleBack}
          onToast={onToast}
          onRefreshList={handleRefreshList}
        />
      )}
    </div>
  );
}
