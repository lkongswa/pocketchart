import { useState, useEffect, useCallback } from 'react';
import type { IntakeFormTemplate } from '../../shared/types';

export function useIntakeForms() {
  const [templates, setTemplates] = useState<IntakeFormTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const data = await window.api.intakeForms.listTemplates();
      setTemplates(data);
    } finally {
      setLoading(false);
    }
  }, []);

  const updateTemplate = useCallback(async (id: number, data: Partial<IntakeFormTemplate>) => {
    const updated = await window.api.intakeForms.updateTemplate(id, data);
    await refresh();
    return updated;
  }, [refresh]);

  const resetTemplate = useCallback(async (slug: string) => {
    const reset = await window.api.intakeForms.resetTemplate(slug);
    await refresh();
    return reset;
  }, [refresh]);

  const generatePdf = useCallback(async (templateIds: number[], clientId?: number, fillable?: boolean) => {
    return window.api.intakeForms.generatePdf({ templateIds, clientId, fillable });
  }, []);

  const reorderTemplates = useCallback(async (ids: number[]) => {
    await window.api.intakeForms.reorderTemplates(ids);
    await refresh();
  }, [refresh]);

  useEffect(() => { refresh(); }, [refresh]);

  return { templates, loading, refresh, updateTemplate, resetTemplate, generatePdf, reorderTemplates };
}
