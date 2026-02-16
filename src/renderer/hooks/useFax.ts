import { useState, useEffect, useCallback } from 'react';
import type { FaxLogEntry } from '../../shared/types';

export function useFax() {
  const [inbox, setInbox] = useState<FaxLogEntry[]>([]);
  const [outbox, setOutbox] = useState<FaxLogEntry[]>([]);
  const [loading, setLoading] = useState(true);

  const refreshInbox = useCallback(async () => {
    try {
      const data = await window.api.fax.listInbox();
      setInbox(data);
    } catch (err) {
      console.error('Failed to load fax inbox:', err);
    }
  }, []);

  const refreshOutbox = useCallback(async () => {
    try {
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

  const sendFax = useCallback(async (data: { documentId?: number; physicianId?: number; faxNumber: string; clientId?: number }) => {
    const result = await window.api.fax.send(data);
    await refreshOutbox();
    return result;
  }, [refreshOutbox]);

  const matchToClient = useCallback(async (faxLogId: number, clientId: number) => {
    const result = await window.api.fax.matchToClient(faxLogId, clientId);
    await refreshInbox();
    return result;
  }, [refreshInbox]);

  useEffect(() => { refresh(); }, [refresh]);

  return { inbox, outbox, loading, refresh, refreshInbox, refreshOutbox, sendFax, matchToClient };
}
