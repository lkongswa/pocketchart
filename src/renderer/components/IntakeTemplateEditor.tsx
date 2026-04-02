import React, { useState, useEffect } from 'react';
import { ChevronDown, ChevronRight, RotateCcw, Info, Plus, Trash2 } from 'lucide-react';
import type { IntakeFormTemplate, IntakeFormSection } from '../../shared/types';

interface IntakeTemplateEditorProps {
  template: IntakeFormTemplate;
  onSave: (updated: IntakeFormTemplate) => void;
  onReset: (slug: string) => void;
  onChange?: (sections: IntakeFormSection[]) => void; // live preview updates
}

const AVAILABLE_VARIABLES = [
  { var: '{{practice_name}}', desc: 'Practice name' },
  { var: '{{practice_phone}}', desc: 'Practice phone' },
  { var: '{{practice_address}}', desc: 'Practice address' },
  { var: '{{practice_city}}', desc: 'Practice city' },
  { var: '{{practice_state}}', desc: 'Practice state' },
  { var: '{{practice_zip}}', desc: 'Practice ZIP' },
  { var: '{{client_name}}', desc: 'Full name' },
  { var: '{{client_first_name}}', desc: 'First name' },
  { var: '{{client_last_name}}', desc: 'Last name' },
  { var: '{{client_dob}}', desc: 'Date of birth' },
  { var: '{{client_phone}}', desc: 'Phone' },
  { var: '{{client_email}}', desc: 'Email' },
  { var: '{{client_insurance_payer}}', desc: 'Insurance' },
  { var: '{{client_insurance_member_id}}', desc: 'Member ID' },
  { var: '{{date}}', desc: 'Current date' },
  { var: '{{year}}', desc: 'Current year' },
];

export default function IntakeTemplateEditor({ template, onSave, onReset, onChange }: IntakeTemplateEditorProps) {
  const [sections, setSections] = useState<IntakeFormSection[]>(template.sections);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const [showVariables, setShowVariables] = useState(false);
  const [confirmReset, setConfirmReset] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  // Reset state when template changes
  useEffect(() => {
    setSections(template.sections);
    setHasChanges(false);
    setConfirmReset(false);
  }, [template.id]);

  // Notify parent of changes for live preview
  const updateSections = (newSections: IntakeFormSection[]) => {
    setSections(newSections);
    setHasChanges(true);
    onChange?.(newSections);
  };

  const toggleSection = (sectionId: string) => {
    updateSections(
      sections.map(s => s.id === sectionId ? { ...s, enabled: !s.enabled } : s)
    );
  };

  const updateSectionContent = (sectionId: string, content: string) => {
    updateSections(
      sections.map(s => s.id === sectionId ? { ...s, content } : s)
    );
  };

  const updateSectionTitle = (sectionId: string, title: string) => {
    updateSections(
      sections.map(s => s.id === sectionId ? { ...s, title } : s)
    );
  };

  const addCustomSection = () => {
    const id = `custom_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const newSection: IntakeFormSection = {
      id,
      title: 'New Section',
      content: '',
      enabled: true,
      sort_order: sections.length + 1,
    };
    const newSections = [...sections, newSection];
    updateSections(newSections);
    setExpandedSection(id);
  };

  const removeSection = (sectionId: string) => {
    updateSections(sections.filter(s => s.id !== sectionId));
  };

  const handleSave = () => {
    onSave({ ...template, sections });
    setHasChanges(false);
  };

  const isCustomSection = (id: string) => id.startsWith('custom_');

  return (
    <div className="space-y-2">
      {/* Section list */}
      {sections.map((section) => (
        <div key={section.id} className="border rounded-lg bg-white">
          {/* Section header */}
          <div className="flex items-center gap-3 px-4 py-2.5">
            <button
              type="button"
              onClick={() => setExpandedSection(expandedSection === section.id ? null : section.id)}
              className="text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
            >
              {expandedSection === section.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
            </button>

            {isCustomSection(section.id) ? (
              <input
                className="flex-1 text-sm font-medium bg-transparent border-b border-transparent focus:border-teal-400 outline-none py-0.5"
                value={section.title}
                onChange={(e) => updateSectionTitle(section.id, e.target.value)}
                placeholder="Section title..."
              />
            ) : (
              <span className="flex-1 text-sm font-medium text-[var(--color-text)]">{section.title}</span>
            )}

            {isCustomSection(section.id) && (
              <button
                type="button"
                onClick={() => removeSection(section.id)}
                className="p-1 text-red-300 hover:text-red-500 transition-colors"
                title="Remove section"
              >
                <Trash2 size={13} />
              </button>
            )}

            <label className="relative inline-flex items-center cursor-pointer shrink-0">
              <input
                type="checkbox"
                checked={section.enabled}
                onChange={() => toggleSection(section.id)}
                className="sr-only peer"
              />
              <div className="w-8 h-4 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:bg-teal-500"></div>
            </label>
          </div>

          {/* Section content editor */}
          {expandedSection === section.id && (
            <div className="px-4 pb-3 border-t">
              <textarea
                className="textarea w-full mt-2 font-mono text-xs"
                rows={10}
                value={section.content}
                onChange={(e) => updateSectionContent(section.id, e.target.value)}
                disabled={!section.enabled}
                placeholder={isCustomSection(section.id) ? 'Enter section content...\n\nUse _____ for fillable blank lines\nUse [ ] for checkboxes\nUse {{variables}} for auto-fill data' : ''}
              />
            </div>
          )}
        </div>
      ))}

      {/* Add custom section */}
      <button
        type="button"
        className="w-full border-2 border-dashed border-gray-300 rounded-lg py-2.5 text-sm text-gray-400 hover:border-teal-400 hover:text-teal-600 transition-colors flex items-center justify-center gap-2"
        onClick={addCustomSection}
      >
        <Plus size={14} />
        Add Custom Section
      </button>

      {/* Variable reference */}
      <div className="border rounded-lg bg-white">
        <button
          type="button"
          className="flex items-center gap-2 px-4 py-2.5 w-full text-left text-xs text-[var(--color-text-secondary)]"
          onClick={() => setShowVariables(!showVariables)}
        >
          <Info size={12} />
          <span>Available Template Variables</span>
          {showVariables ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        </button>
        {showVariables && (
          <div className="px-4 pb-3 border-t">
            <div className="grid grid-cols-2 gap-1 mt-2">
              {AVAILABLE_VARIABLES.map((v) => (
                <div key={v.var} className="flex items-center gap-2 text-[10px] py-0.5">
                  <code className="bg-gray-100 px-1.5 py-0.5 rounded font-mono text-teal-700">{v.var}</code>
                  <span className="text-[var(--color-text-secondary)]">{v.desc}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center justify-between pt-2">
        <div>
          {confirmReset ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-600">Reset to defaults?</span>
              <button
                type="button"
                className="text-xs text-red-600 px-2 py-1 rounded hover:bg-red-50 font-medium"
                onClick={() => { onReset(template.slug); setConfirmReset(false); }}
              >
                Yes, reset
              </button>
              <button
                type="button"
                className="text-xs px-2 py-1 rounded hover:bg-gray-100"
                onClick={() => setConfirmReset(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text)]"
              onClick={() => setConfirmReset(true)}
            >
              <RotateCcw size={12} />
              Reset to Default
            </button>
          )}
        </div>
        <button
          type="button"
          className={`btn-primary text-sm px-4 py-1.5 ${!hasChanges ? 'opacity-50 cursor-not-allowed' : ''}`}
          onClick={handleSave}
          disabled={!hasChanges}
        >
          Save Changes
        </button>
      </div>
    </div>
  );
}
