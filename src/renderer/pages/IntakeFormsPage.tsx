import React, { useState, useEffect, useCallback, useRef } from 'react';
import { FileText, Printer, GripVertical, ToggleLeft, ToggleRight, ChevronDown, ChevronRight } from 'lucide-react';
import { useIntakeForms } from '../hooks/useIntakeForms';
import IntakeTemplateEditor from '../components/IntakeTemplateEditor';
import IntakeFormPreview from '../components/IntakeFormPreview';
import IntakePacketBuilder from '../components/IntakePacketBuilder';
import type { IntakeFormTemplate, IntakeFormSection } from '../../shared/types';
import type { PracticeInfo } from '../../shared/intakeFormUtils';

export default function IntakeFormsPage() {
  const { templates, loading, updateTemplate, resetTemplate, reorderTemplates } = useIntakeForms();
  const [showPacketBuilder, setShowPacketBuilder] = useState(false);
  const [editingTemplateId, setEditingTemplateId] = useState<number | null>(null);
  const [editingSections, setEditingSections] = useState<IntakeFormSection[] | undefined>(undefined);
  const [practiceInfo, setPracticeInfo] = useState<Partial<PracticeInfo>>({});
  const [logoBase64, setLogoBase64] = useState<string | null>(null);

  // DnD state
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const dragNodeRef = useRef<HTMLDivElement | null>(null);

  // Sorted templates by sort_order
  const sortedTemplates = [...templates].sort((a, b) => a.sort_order - b.sort_order);

  // Load practice info + logo for preview
  useEffect(() => {
    window.api.settings.get('practice_name').then((name: string | null) => {
      if (!name) return;
      Promise.all([
        window.api.settings.get('practice_phone'),
        window.api.settings.get('practice_address'),
        window.api.settings.get('practice_city'),
        window.api.settings.get('practice_state'),
        window.api.settings.get('practice_zip'),
        window.api.settings.get('practice_npi'),
        window.api.settings.get('practice_tax_id'),
      ]).then(([phone, address, city, state, zip, npi, tax_id]) => {
        setPracticeInfo({
          name: name || '',
          phone: phone || '',
          address: address || '',
          city: city || '',
          state: state || '',
          zip: zip || '',
          npi: npi || '',
          tax_id: tax_id || '',
        });
      });
    });
    // Load practice logo
    window.api.logo.getBase64().then((data: string | null) => {
      setLogoBase64(data);
    });
  }, []);

  const editingTemplate = editingTemplateId
    ? sortedTemplates.find(t => t.id === editingTemplateId) || null
    : null;

  const handleToggleActive = async (template: IntakeFormTemplate, e: React.MouseEvent) => {
    e.stopPropagation();
    await updateTemplate(template.id, { is_active: !template.is_active });
  };

  const handleSaveTemplate = async (updated: IntakeFormTemplate) => {
    await updateTemplate(updated.id, { sections: updated.sections });
    setEditingSections(undefined);
  };

  const handleResetTemplate = async (slug: string) => {
    await resetTemplate(slug);
    setEditingSections(undefined);
  };

  const handleCardClick = (template: IntakeFormTemplate) => {
    if (editingTemplateId === template.id) {
      setEditingTemplateId(null);
      setEditingSections(undefined);
    } else {
      setEditingTemplateId(template.id);
      setEditingSections(undefined);
    }
  };

  const handleEditorChange = useCallback((sections: IntakeFormSection[]) => {
    setEditingSections(sections);
  }, []);

  // ── DnD handlers ──
  const handleDragStart = (idx: number, e: React.DragEvent) => {
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
    if (dragNodeRef.current) {
      e.dataTransfer.setDragImage(dragNodeRef.current, 10, 10);
    }
  };

  const handleDragOver = (idx: number, e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (dragIdx !== null && idx !== dragIdx) {
      setDragOverIdx(idx);
    }
  };

  const handleDragEnd = async () => {
    if (dragIdx !== null && dragOverIdx !== null && dragIdx !== dragOverIdx) {
      const newOrder = sortedTemplates.map(t => t.id);
      const [moved] = newOrder.splice(dragIdx, 1);
      newOrder.splice(dragOverIdx, 0, moved);
      await reorderTemplates(newOrder);
    }
    setDragIdx(null);
    setDragOverIdx(null);
  };

  return (
    <div className="page-container flex flex-col" style={{ height: 'calc(100vh - 64px)' }}>
      {/* Header */}
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div>
          <h1 className="page-title">Intake Forms</h1>
          <p className="text-sm text-[var(--color-text-secondary)]">
            Manage templates and generate patient intake packets
          </p>
        </div>
        <button
          type="button"
          className="btn-primary flex items-center gap-2"
          onClick={() => setShowPacketBuilder(true)}
        >
          <Printer size={16} />
          Generate Packet
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-[var(--color-text-secondary)]">Loading templates...</div>
      ) : (
        /* Two-column layout */
        <div className="flex gap-6 flex-1 min-h-0">
          {/* LEFT: Template cards */}
          <div className="w-[400px] shrink-0 overflow-y-auto space-y-2 pr-2">
            {sortedTemplates.map((tmpl, idx) => {
              const isEditing = editingTemplateId === tmpl.id;
              const isDragTarget = dragOverIdx === idx && dragIdx !== idx;

              return (
                <div key={tmpl.id}>
                  {/* Card */}
                  <div
                    draggable
                    onDragStart={(e) => handleDragStart(idx, e)}
                    onDragOver={(e) => handleDragOver(idx, e)}
                    onDragEnd={handleDragEnd}
                    onDragLeave={() => setDragOverIdx(null)}
                    className={`card cursor-pointer transition-all ${
                      isEditing ? 'ring-2 ring-teal-400 shadow-md' : 'hover:shadow-md'
                    } ${
                      !tmpl.is_active ? 'opacity-50' : ''
                    } ${
                      dragIdx === idx ? 'opacity-40' : ''
                    } ${
                      isDragTarget ? 'border-t-2 border-teal-400' : ''
                    }`}
                    onClick={() => handleCardClick(tmpl)}
                  >
                    <div className="flex items-center gap-3 p-3">
                      {/* Drag handle */}
                      <div
                        className="text-gray-300 hover:text-gray-500 cursor-grab active:cursor-grabbing shrink-0"
                        onMouseDown={(e) => e.stopPropagation()}
                      >
                        <GripVertical size={16} />
                      </div>

                      <div className="p-1.5 rounded-lg bg-teal-50 shrink-0">
                        <FileText size={16} className="text-teal-600" />
                      </div>

                      <div className="flex-1 min-w-0">
                        <h3 className="text-sm font-semibold text-[var(--color-text)] truncate">{tmpl.name}</h3>
                        <p className="text-[10px] text-[var(--color-text-secondary)] truncate">{tmpl.description}</p>
                        <div className="text-[10px] text-[var(--color-text-tertiary)] mt-0.5">
                          {tmpl.sections.filter(s => s.enabled).length} / {tmpl.sections.length} sections
                        </div>
                      </div>

                      {/* Expand indicator */}
                      <div className="text-[var(--color-text-tertiary)] shrink-0">
                        {isEditing ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      </div>

                      {/* Active toggle */}
                      <button
                        type="button"
                        className="flex items-center gap-1 text-[10px] shrink-0"
                        onClick={(e) => handleToggleActive(tmpl, e)}
                      >
                        {tmpl.is_active ? (
                          <ToggleRight size={18} className="text-teal-500" />
                        ) : (
                          <ToggleLeft size={18} className="text-gray-400" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Inline editor */}
                  {isEditing && editingTemplate && (
                    <div className="mt-2 mb-3 pl-2">
                      <IntakeTemplateEditor
                        template={editingTemplate}
                        onSave={handleSaveTemplate}
                        onReset={handleResetTemplate}
                        onChange={handleEditorChange}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* RIGHT: Live preview */}
          <div className="flex-1 overflow-y-auto bg-gray-100 rounded-xl p-6">
            <IntakeFormPreview
              template={editingTemplate}
              allTemplates={sortedTemplates}
              sections={editingSections}
              practiceInfo={practiceInfo}
              logoBase64={logoBase64}
            />
          </div>
        </div>
      )}

      {/* Packet builder modal */}
      <IntakePacketBuilder
        isOpen={showPacketBuilder}
        onClose={() => setShowPacketBuilder(false)}
        templates={sortedTemplates.filter(t => t.is_active)}
      />

      {/* Hidden drag ghost */}
      <div ref={dragNodeRef} className="fixed -left-[9999px] text-xs">Moving...</div>
    </div>
  );
}
