import { useState, useEffect, useCallback } from 'react';
import type { Physician } from '../../shared/types';

export function usePhysicians() {
  const [physicians, setPhysicians] = useState<Physician[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async (filters?: { search?: string; favoritesOnly?: boolean }) => {
    setLoading(true);
    try {
      const data = await window.api.physicians.list(filters);
      setPhysicians(data);
    } finally {
      setLoading(false);
    }
  }, []);

  const create = useCallback(async (data: Partial<Physician>) => {
    const created = await window.api.physicians.create(data);
    await refresh();
    return created;
  }, [refresh]);

  const update = useCallback(async (id: number, data: Partial<Physician>) => {
    const updated = await window.api.physicians.update(id, data);
    await refresh();
    return updated;
  }, [refresh]);

  const remove = useCallback(async (id: number) => {
    await window.api.physicians.delete(id);
    await refresh();
  }, [refresh]);

  const search = useCallback(async (query: string) => {
    return window.api.physicians.search(query);
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return { physicians, loading, refresh, create, update, remove, search };
}
