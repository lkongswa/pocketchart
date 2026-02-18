import { useState, useCallback } from 'react';
import type { Claim, ClaimLine, ClaimStatus } from '../../shared/types';

export interface ClaimsFilters {
  clientId?: number;
  status?: ClaimStatus;
  startDate?: string;
  endDate?: string;
  search?: string;
}

export function useClaims() {
  const [claims, setClaims] = useState<Claim[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async (filters?: ClaimsFilters) => {
    setLoading(true);
    setError(null);
    try {
      const { search, ...apiFilters } = filters || {};
      let result = await window.api.claims.list(apiFilters);
      // Client-side search filter
      if (search) {
        const q = search.toLowerCase();
        result = result.filter(
          (c) =>
            c.claim_number?.toLowerCase().includes(q) ||
            c.client_name?.toLowerCase().includes(q) ||
            c.payer_name?.toLowerCase().includes(q)
        );
      }
      setClaims(result);
    } catch (err: any) {
      console.error('Failed to load claims:', err);
      setError(err.message || 'Failed to load claims');
    } finally {
      setLoading(false);
    }
  }, []);

  const getClaim = useCallback(async (id: number): Promise<(Claim & { lines: ClaimLine[] }) | null> => {
    try {
      return await window.api.claims.get(id);
    } catch (err: any) {
      console.error('Failed to get claim:', err);
      setError(err.message || 'Failed to get claim');
      return null;
    }
  }, []);

  const createFromNotes = useCallback(async (clientId: number, noteIds: number[]): Promise<Claim | null> => {
    try {
      const claim = await window.api.claims.createFromNotes(clientId, noteIds);
      return claim;
    } catch (err: any) {
      console.error('Failed to create claim:', err);
      setError(err.message || 'Failed to create claim');
      return null;
    }
  }, []);

  const generate837P = useCallback(async (claimId: number): Promise<{ ediContent: string; claimNumber: string } | null> => {
    try {
      return await window.api.claims.generate837P(claimId);
    } catch (err: any) {
      console.error('Failed to generate 837P:', err);
      setError(err.message || 'Failed to generate 837P');
      return null;
    }
  }, []);

  const submitClaim = useCallback(async (claimId: number): Promise<{ success: boolean; message: string } | null> => {
    try {
      const result = await window.api.clearinghouse.submitClaim(claimId);
      return result;
    } catch (err: any) {
      console.error('Failed to submit claim:', err);
      setError(err.message || 'Failed to submit claim');
      return null;
    }
  }, []);

  const checkStatus = useCallback(async (claimId: number): Promise<{ status: string; message: string } | null> => {
    try {
      return await window.api.clearinghouse.checkClaimStatus(claimId);
    } catch (err: any) {
      console.error('Failed to check claim status:', err);
      setError(err.message || 'Failed to check claim status');
      return null;
    }
  }, []);

  const deleteClaim = useCallback(async (id: number): Promise<boolean> => {
    try {
      await window.api.claims.delete(id);
      return true;
    } catch (err: any) {
      console.error('Failed to delete claim:', err);
      setError(err.message || 'Failed to delete claim');
      return false;
    }
  }, []);

  const updateClaim = useCallback(async (id: number, data: Partial<Claim>): Promise<boolean> => {
    try {
      await window.api.claims.update(id, data);
      return true;
    } catch (err: any) {
      console.error('Failed to update claim:', err);
      setError(err.message || 'Failed to update claim');
      return false;
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    claims,
    loading,
    error,
    refresh,
    getClaim,
    createFromNotes,
    generate837P,
    submitClaim,
    checkStatus,
    deleteClaim,
    updateClaim,
    clearError,
  };
}
