import React from 'react';
import { FileText, Eye } from 'lucide-react';
import type { IntakeFormTemplate, IntakeFormSection } from '../../shared/types';
import { replaceVariablesForPreview, FIELD_PATTERNS } from '../../shared/intakeFormUtils';
import type { PracticeInfo } from '../../shared/intakeFormUtils';

interface IntakeFormPreviewProps {
  /** Single template for focused editing preview */
  template?: IntakeFormTemplate | null;
  /** All active templates for full packet preview (used when no single template selected) */
  allTemplates?: IntakeFormTemplate[];
  /** Working copy sections (overrides template.sections when editing a single template) */
  sections?: IntakeFormSection[];
  practiceInfo?: Partial<PracticeInfo>;
  /** Base64 data URI of practice logo */
  logoBase64?: string | null;
}

/**
 * Render a single line of content with field pattern highlighting.
 * Underscores become dotted blue lines, [ ] become checkbox elements.
 */
function renderContentLine(line: string, lineIdx: number, keyPrefix = ''): React.ReactNode {
  // Checkbox pattern: [ ] text
  if (/\[ \]/.test(line)) {
    const parts = line.split(/\[ \]/);
    const elements: React.ReactNode[] = [];
    for (let i = 0; i < parts.length; i++) {
      if (i > 0) {
        elements.push(
          <span key={`${keyPrefix}cb-${lineIdx}-${i}`} className="inline-flex items-center mx-1">
            <span className="inline-block w-3.5 h-3.5 border border-blue-400 rounded-sm bg-blue-50" />
          </span>
        );
      }
      if (parts[i]) {
        elements.push(<span key={`${keyPrefix}txt-${lineIdx}-${i}`} dangerouslySetInnerHTML={{ __html: parts[i] }} />);
      }
    }
    return <div key={`${keyPrefix}${lineIdx}`} className="leading-[14px] mb-[1px]">{elements}</div>;
  }

  // Underscore field pattern: Label: ____
  if (FIELD_PATTERNS.hasUnderscores.test(line)) {
    const html = line.replace(
      /_{3,}/g,
      '<span class="inline-block min-w-[120px] border-b-2 border-dotted border-blue-300 mx-1">&nbsp;</span>'
    );
    return <div key={`${keyPrefix}${lineIdx}`} className="leading-[14px] mb-[1px]" dangerouslySetInnerHTML={{ __html: html }} />;
  }

  // Plain text or empty line
  if (!line.trim()) {
    return <div key={`${keyPrefix}${lineIdx}`} className="h-[10px]" />;
  }

  return <div key={`${keyPrefix}${lineIdx}`} className="leading-[14px] mb-[1px]" dangerouslySetInnerHTML={{ __html: line }} />;
}

/** Practice header with logo + name + address + phone */
function PracticeHeader({
  practiceInfo,
  logoBase64,
  large,
}: {
  practiceInfo?: Partial<PracticeInfo>;
  logoBase64?: string | null;
  large?: boolean;
}) {
  if (!practiceInfo?.name && !logoBase64) return null;

  const nameSize = large ? '20px' : '10px';
  const detailSize = large ? '10px' : '8px';
  const nameColor = large ? '#0d0d0d' : '#4b5563';
  const detailColor = large ? '#4b5563' : '#6b7280';
  const logoH = large ? 48 : 36;

  return (
    <div className="mb-2 flex items-start gap-2">
      {logoBase64 && (
        <img
          src={logoBase64}
          alt="Practice logo"
          style={{ height: logoH, width: 'auto', objectFit: 'contain', flexShrink: 0 }}
        />
      )}
      <div>
        {practiceInfo?.name && (
          <div style={{ fontSize: nameSize, fontWeight: 700, color: nameColor }}>
            {practiceInfo.name}
          </div>
        )}
        {practiceInfo?.address && (
          <div style={{ fontSize: detailSize, color: detailColor }}>
            {practiceInfo.address}{practiceInfo.city ? `, ${practiceInfo.city}` : ''}
            {practiceInfo.state ? ` ${practiceInfo.state}` : ''}
            {practiceInfo.zip ? ` ${practiceInfo.zip}` : ''}
          </div>
        )}
        {practiceInfo?.phone && (
          <div style={{ fontSize: detailSize, color: detailColor }}>Phone: {practiceInfo.phone}</div>
        )}
      </div>
    </div>
  );
}

/** Renders a single template "page" */
function TemplatePage({
  template,
  sections: overrideSections,
  practiceInfo,
  logoBase64,
  pageNumber,
  totalPages,
}: {
  template: IntakeFormTemplate;
  sections?: IntakeFormSection[];
  practiceInfo?: Partial<PracticeInfo>;
  logoBase64?: string | null;
  pageNumber?: number;
  totalPages?: number;
}) {
  const activeSections = (overrideSections || template.sections)
    .filter(s => s.enabled)
    .sort((a, b) => a.sort_order - b.sort_order);

  return (
    <div
      className="bg-white shadow-md rounded-lg mx-auto"
      style={{
        maxWidth: 612,
        minHeight: 400,
        padding: 50,
        fontFamily: 'Helvetica, Arial, sans-serif',
        fontSize: '10px',
        color: '#1a1a1a',
      }}
    >
      {/* Practice header with logo */}
      <PracticeHeader practiceInfo={practiceInfo} logoBase64={logoBase64} />

      {/* Template title */}
      <div className="mb-1" style={{ fontSize: '14px', fontWeight: 700, color: '#0d0d0d' }}>
        {template.name}
      </div>
      <div className="border-b border-gray-300 mb-4" />

      {/* Sections */}
      {activeSections.length === 0 ? (
        <div className="text-center py-8 text-gray-400 text-xs">
          No enabled sections
        </div>
      ) : (
        activeSections.map((section) => {
          const processedContent = replaceVariablesForPreview(
            section.content,
            practiceInfo || {},
          );
          const lines = processedContent.split('\n');

          return (
            <div key={section.id} className="mb-5">
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#262626', marginBottom: '6px' }}>
                {section.title}
              </div>
              <div style={{ fontSize: '10px', lineHeight: '14px', color: '#1a1a1a' }}>
                {lines.map((line, i) => renderContentLine(line, i, `${template.id}-${section.id}-`))}
              </div>
            </div>
          );
        })
      )}

      {/* Page footer */}
      <div className="mt-8 pt-2 border-t border-gray-200 text-right" style={{ fontSize: '8px', color: '#9ca3af' }}>
        {pageNumber != null && totalPages != null
          ? `Page ${pageNumber} of ${totalPages}`
          : 'Page 1 of 1'}
      </div>
    </div>
  );
}

/** Cover page for multi-template packet preview */
function CoverPage({
  templates,
  practiceInfo,
  logoBase64,
  totalPages,
}: {
  templates: IntakeFormTemplate[];
  practiceInfo?: Partial<PracticeInfo>;
  logoBase64?: string | null;
  totalPages: number;
}) {
  return (
    <div
      className="bg-white shadow-md rounded-lg mx-auto"
      style={{
        maxWidth: 612,
        minHeight: 400,
        padding: 50,
        fontFamily: 'Helvetica, Arial, sans-serif',
        color: '#1a1a1a',
      }}
    >
      {/* Practice header with logo */}
      <PracticeHeader practiceInfo={practiceInfo} logoBase64={logoBase64} large />

      <div style={{ marginTop: 30, fontSize: '16px', fontWeight: 700, color: '#1a1a1a' }}>
        New Patient Intake Packet
      </div>

      <div style={{ marginTop: 8, fontSize: '10px', color: '#4b5563' }}>
        Date: {new Date().toLocaleDateString('en-US')}
      </div>

      <div style={{ marginTop: 24, fontSize: '12px', fontWeight: 700, color: '#1a1a1a' }}>
        Included Forms:
      </div>
      <div style={{ marginTop: 8 }}>
        {templates.map((t, i) => (
          <div key={t.id} style={{ fontSize: '11px', color: '#374151', marginBottom: 4, paddingLeft: 10 }}>
            {i + 1}. {t.name}
          </div>
        ))}
      </div>

      {/* Page footer */}
      <div className="mt-8 pt-2 border-t border-gray-200 text-right" style={{ fontSize: '8px', color: '#9ca3af' }}>
        Page 1 of {totalPages}
      </div>
    </div>
  );
}

export default function IntakeFormPreview({
  template,
  allTemplates,
  sections: overrideSections,
  practiceInfo,
  logoBase64,
}: IntakeFormPreviewProps) {
  // ── Single template editing mode ──
  if (template) {
    return (
      <div className="space-y-4">
        <div className="text-center mb-2">
          <span className="inline-block text-[10px] text-teal-600 bg-teal-50 px-2 py-0.5 rounded-full font-medium">
            Editing: {template.name}
          </span>
        </div>
        <TemplatePage
          template={template}
          sections={overrideSections}
          practiceInfo={practiceInfo}
          logoBase64={logoBase64}
        />
      </div>
    );
  }

  // ── Full packet preview mode ──
  const activeTemplates = (allTemplates || []).filter(t => t.is_active);

  if (activeTemplates.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-[var(--color-text-tertiary)]">
        <Eye size={40} className="mb-3 opacity-40" />
        <p className="text-sm font-medium">No active templates</p>
        <p className="text-xs mt-1">Enable templates on the left to preview the packet</p>
      </div>
    );
  }

  // Total pages: cover (if >1 template) + one page per template
  const hasCover = activeTemplates.length > 1;
  const totalPages = (hasCover ? 1 : 0) + activeTemplates.length;

  return (
    <div className="space-y-6">
      <div className="text-center mb-2">
        <span className="inline-block text-[10px] text-gray-500 bg-gray-200 px-2 py-0.5 rounded-full font-medium">
          Full Packet Preview — {activeTemplates.length} form{activeTemplates.length !== 1 ? 's' : ''}
        </span>
        <p className="text-[10px] text-[var(--color-text-tertiary)] mt-1">
          Click a template card to edit a specific form
        </p>
      </div>

      {/* Cover page (only if multiple templates) */}
      {hasCover && (
        <CoverPage
          templates={activeTemplates}
          practiceInfo={practiceInfo}
          logoBase64={logoBase64}
          totalPages={totalPages}
        />
      )}

      {/* Each template as a "page" */}
      {activeTemplates.map((tmpl, i) => (
        <TemplatePage
          key={tmpl.id}
          template={tmpl}
          practiceInfo={practiceInfo}
          logoBase64={logoBase64}
          pageNumber={(hasCover ? 2 : 1) + i}
          totalPages={totalPages}
        />
      ))}
    </div>
  );
}
