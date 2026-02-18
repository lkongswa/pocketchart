import { useState, useEffect, useCallback } from 'react';
import type { FaxLogEntry } from '../../shared/types';

export function useFax() {
  const [inbox, setInbox] = useState<FaxLogEntry[]>([]);
  const [outbox, setOutbox] = useState<FaxLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshInbox = useCallback(async (poll = false) => {
    try {
      // If poll=true, hit fax provider API to check for new incoming faxes before re-reading
      if (poll) {
        try { await window.api.fax.pollInbox(); } catch (e) { console.error('Poll inbox failed:', e); }
      }
      const data = await window.api.fax.listInbox();
      setInbox(data);
    } catch (err) {
      console.error('Failed to load fax inbox:', err);
    }
  }, []);

  const refreshOutbox = useCallback(async (poll = false) => {
    try {
      // If poll=true, hit fax provider API to update statuses before re-reading
      if (poll) {
        try { await window.api.fax.pollStatuses(); } catch (e) { console.error('Poll statuses failed:', e); }
      }
      const data = await window.api.fax.listOutbox();
      setOutbox(data);
    } catch (err) {
      console.error('Failed to load fax outbox:', err);
    }
  }, []);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      await Promise.all([refreshInbox(), refreshOutbox()]);
    } finally {
      setLoading(false);
    }
  }, [refreshInbox, refreshOutbox]);

  const sendFax = useCallback(async (data: { documentId?: number; docType?: 'eval' | 'note' | 'document'; physicianId?: number; faxNumber: string; clientId?: number; requestSignature?: boolean }) => {
    const result = await window.api.fax.send(data);
    await refreshOutbox();
    return result;
  }, [refreshOutbox]);

  const matchToClient = useCallback(async (faxLogId: number, clientId: number) => {
    const result = await window.api.fax.matchToClient(faxLogId, clientId);
    await refreshInbox();
    return result;
  }, [refreshInbox]);

  const saveToChart = useCallback(async (data: { faxLogId: number; clientId: number; category: string; linkToOutboundFaxId?: number }) => {
    const result = await window.api.fax.saveToChart(data);
    await refreshInbox();
    return result;
  }, [refreshInbox]);

  useEffect(() => { refresh(); }, [refresh]);

  return { inbox, outbox, loading, refresh, refreshInbox, refreshOutbox, sendFax, matchToClient, saveToChart };
}
