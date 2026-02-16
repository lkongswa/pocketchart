import { PDFDocument, StandardFonts, rgb, PDFFont, PDFPage, PDFForm } from 'pdf-lib';
import { replaceVariables, FIELD_PATTERNS } from '../shared/intakeFormUtils';
import type { PracticeInfo, ClientInfo } from '../shared/intakeFormUtils';

interface IntakeSection {
  id: string;
  title: string;
  content: string;
  enabled: boolean;
  sort_order: number;
}

interface IntakeTemplate {
  id: number;
  name: string;
  slug: string;
  sections: IntakeSection[];
}

export interface GenerateIntakePdfOptions {
  templates: IntakeTemplate[];
  practiceInfo: PracticeInfo;
  clientInfo?: Partial<ClientInfo>;
  fillable?: boolean;
  logoBase64?: string | null;
}

const PAGE_MARGIN = 50;
const PAGE_WIDTH = 612; // Letter
const PAGE_HEIGHT = 792;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const LINE_HEIGHT = 14;
const SECTION_GAP = 20;

function addPageNumber(page: PDFPage, pageNum: number, totalPages: number, font: PDFFont) {
  page.drawText(`Page ${pageNum} of ${totalPages}`, {
    x: PAGE_WIDTH - PAGE_MARGIN - 80,
    y: 25,
    size: 8,
    font,
    color: rgb(0.5, 0.5, 0.5),
  });
}

function drawWrappedText(
  page: PDFPage,
  text: string,
  x: number,
  startY: number,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
): number {
  let y = startY;
  const lines = text.split('\n');

  for (const line of lines) {
    if (line.trim() === '') {
      y -= LINE_HEIGHT * 0.7;
      continue;
    }

    // Word wrap
    const words = line.split(' ');
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const width = font.widthOfTextAtSize(testLine, fontSize);

      if (width > maxWidth && currentLine) {
        page.drawText(currentLine, { x, y, size: fontSize, font, color: rgb(0.1, 0.1, 0.1) });
        y -= LINE_HEIGHT;
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      page.drawText(currentLine, { x, y, size: fontSize, font, color: rgb(0.1, 0.1, 0.1) });
      y -= LINE_HEIGHT;
    }
  }

  return y;
}

/**
 * Draw content with inline fillable form fields.
 * Detects underscore patterns (text fields) and [ ] patterns (checkboxes)
 * and places pdf-lib form widgets at the correct positions.
 */
function drawContentWithFields(
  page: PDFPage,
  text: string,
  x: number,
  startY: number,
  font: PDFFont,
  fontSize: number,
  maxWidth: number,
  form: PDFForm,
  fieldPrefix: string,
  fieldIdxRef: { value: number },
  pdfDoc: PDFDocument,
  pageCallback: () => { page: PDFPage; y: number },
): { page: PDFPage; y: number } {
  let y = startY;
  let currentPage = page;
  const lines = text.split('\n');

  for (const line of lines) {
    if (line.trim() === '') {
      y -= LINE_HEIGHT * 0.7;
      continue;
    }

    // Check if we need a new page
    if (y < PAGE_MARGIN + 40) {
      const result = pageCallback();
      currentPage = result.page;
      y = result.y;
    }

    // ── Check for checkbox patterns: [ ] Option text ──
    const checkboxLineMatch = line.match(/^\s*\[ \]\s+(.*)$/);
    if (checkboxLineMatch) {
      const label = checkboxLineMatch[1].trim();
      const fieldName = `${fieldPrefix}_cb_${fieldIdxRef.value++}`;

      // Draw checkbox
      const cb = form.createCheckBox(fieldName);
      cb.addToPage(currentPage, {
        x,
        y: y - 2,
        width: 10,
        height: 10,
      });

      // Draw label text next to checkbox
      currentPage.drawText(label, {
        x: x + 16,
        y,
        size: fontSize,
        font,
        color: rgb(0.1, 0.1, 0.1),
      });

      y -= LINE_HEIGHT + 2;
      continue;
    }

    // Check for multiple checkboxes on one line: [ ] Option A   [ ] Option B
    const multiCheckMatch = line.match(/\[ \]/g);
    if (multiCheckMatch && multiCheckMatch.length > 1) {
      // Split on [ ] and handle each checkbox inline
      const parts = line.split(/\[ \]\s*/);
      let lineX = x;

      // First part before any checkbox (if any prefix text)
      if (parts[0].trim()) {
        const prefixText = parts[0].trim();
        currentPage.drawText(prefixText, {
          x: lineX, y, size: fontSize, font, color: rgb(0.1, 0.1, 0.1),
        });
        lineX += font.widthOfTextAtSize(prefixText + '  ', fontSize);
      }

      for (let i = 1; i < parts.length; i++) {
        const optionText = parts[i].trim();
        const fieldName = `${fieldPrefix}_cb_${fieldIdxRef.value++}`;

        const cb = form.createCheckBox(fieldName);
        cb.addToPage(currentPage, {
          x: lineX,
          y: y - 2,
          width: 10,
          height: 10,
        });
        lineX += 14;

        if (optionText) {
          currentPage.drawText(optionText, {
            x: lineX, y, size: fontSize, font, color: rgb(0.1, 0.1, 0.1),
          });
          lineX += font.widthOfTextAtSize(optionText + '   ', fontSize);
        }
      }

      y -= LINE_HEIGHT + 2;
      continue;
    }

    // ── Check for labeled field: "Label: ___+" or "Label ___+" ──
    const labeledMatch = line.match(FIELD_PATTERNS.labeledField);
    if (labeledMatch) {
      const labelText = labeledMatch[1].trim();
      const underscores = labeledMatch[2];
      const suffix = labeledMatch[3]?.trim() || '';

      // Determine field characteristics
      const isSig = FIELD_PATTERNS.isSignatureLabel.test(labelText);
      const isDate = FIELD_PATTERNS.isDateLabel.test(labelText);

      // Draw the label
      let labelWidth = 0;
      if (labelText) {
        currentPage.drawText(labelText, {
          x, y, size: fontSize, font, color: rgb(0.1, 0.1, 0.1),
        });
        labelWidth = font.widthOfTextAtSize(labelText + ' ', fontSize);
      }

      // Calculate field width based on underscore count, capped to available space
      const underscoreWidth = Math.min(
        Math.max(underscores.length * 5, isSig ? 200 : isDate ? 100 : 120),
        maxWidth - labelWidth - (suffix ? font.widthOfTextAtSize(suffix + ' ', fontSize) : 0)
      );
      const fieldHeight = isSig ? 22 : 16;
      const fieldName = `${fieldPrefix}_${isSig ? 'sig' : isDate ? 'date' : 'tf'}_${fieldIdxRef.value++}`;

      // Create text field
      const tf = form.createTextField(fieldName);
      tf.addToPage(currentPage, {
        x: x + labelWidth,
        y: y - 4,
        width: underscoreWidth,
        height: fieldHeight,
        borderWidth: 0,
      });

      // Draw a bottom border line for the field
      currentPage.drawLine({
        start: { x: x + labelWidth, y: y - 4 },
        end: { x: x + labelWidth + underscoreWidth, y: y - 4 },
        thickness: 0.5,
        color: rgb(0.6, 0.6, 0.6),
      });

      // Draw suffix if any
      if (suffix) {
        currentPage.drawText(suffix, {
          x: x + labelWidth + underscoreWidth + 4,
          y,
          size: fontSize,
          font,
          color: rgb(0.1, 0.1, 0.1),
        });
      }

      y -= (isSig ? LINE_HEIGHT + 10 : LINE_HEIGHT + 4);
      continue;
    }

    // ── Check for standalone underscore line ──
    if (FIELD_PATTERNS.standaloneField.test(line)) {
      const fieldName = `${fieldPrefix}_tf_${fieldIdxRef.value++}`;
      const tf = form.createTextField(fieldName);
      tf.addToPage(currentPage, {
        x,
        y: y - 4,
        width: maxWidth,
        height: 16,
        borderWidth: 0,
      });
      currentPage.drawLine({
        start: { x, y: y - 4 },
        end: { x: x + maxWidth, y: y - 4 },
        thickness: 0.5,
        color: rgb(0.6, 0.6, 0.6),
      });
      y -= LINE_HEIGHT + 4;
      continue;
    }

    // ── Regular text line (word-wrapped) ──
    const words = line.split(' ');
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const width = font.widthOfTextAtSize(testLine, fontSize);

      if (width > maxWidth && currentLine) {
        currentPage.drawText(currentLine, { x, y, size: fontSize, font, color: rgb(0.1, 0.1, 0.1) });
        y -= LINE_HEIGHT;

        if (y < PAGE_MARGIN + 40) {
          const result = pageCallback();
          currentPage = result.page;
          y = result.y;
        }

        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      currentPage.drawText(currentLine, { x, y, size: fontSize, font, color: rgb(0.1, 0.1, 0.1) });
      y -= LINE_HEIGHT;
    }
  }

  return { page: currentPage, y };
}

export async function generateIntakePdf(options: GenerateIntakePdfOptions): Promise<Uint8Array> {
  const { templates, practiceInfo, clientInfo, fillable, logoBase64 } = options;
  const pdfDoc = await PDFDocument.create();

  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Embed logo if provided
  let logoImage: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null;
  let logoWidth = 0;
  let logoHeight = 0;
  const LOGO_MAX_HEIGHT = 48;

  if (logoBase64) {
    try {
      // Extract raw base64 data from data URI
      const base64Data = logoBase64.replace(/^data:image\/[a-z]+;base64,/, '');
      const logoBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      const isPng = logoBase64.includes('image/png');
      logoImage = isPng
        ? await pdfDoc.embedPng(logoBytes)
        : await pdfDoc.embedJpg(logoBytes);
      // Scale to max height while preserving aspect ratio
      const dims = logoImage.scale(1);
      const scale = LOGO_MAX_HEIGHT / dims.height;
      logoWidth = dims.width * scale;
      logoHeight = LOGO_MAX_HEIGHT;
    } catch {
      // Skip logo on error
      logoImage = null;
    }
  }

  // Cover page if multiple templates
  if (templates.length > 1) {
    const coverPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    let y = PAGE_HEIGHT - PAGE_MARGIN - 40;

    // Logo + practice name header
    let textStartX = PAGE_MARGIN;
    if (logoImage) {
      coverPage.drawImage(logoImage, {
        x: PAGE_MARGIN,
        y: y - LOGO_MAX_HEIGHT + 20,
        width: logoWidth,
        height: logoHeight,
      });
      textStartX = PAGE_MARGIN + logoWidth + 12;
    }

    coverPage.drawText(practiceInfo.name || 'Practice', {
      x: textStartX,
      y,
      size: 20,
      font: helveticaBold,
      color: rgb(0.05, 0.05, 0.05),
    });
    y -= 24;

    if (practiceInfo.address) {
      coverPage.drawText(
        `${practiceInfo.address}, ${practiceInfo.city || ''} ${practiceInfo.state || ''} ${practiceInfo.zip || ''}`,
        { x: textStartX, y, size: 10, font: helvetica, color: rgb(0.3, 0.3, 0.3) }
      );
      y -= 14;
    }
    if (practiceInfo.phone) {
      coverPage.drawText(`Phone: ${practiceInfo.phone}`, {
        x: textStartX, y, size: 10, font: helvetica, color: rgb(0.3, 0.3, 0.3),
      });
      y -= 14;
    }

    y -= 30;

    // Title
    coverPage.drawText('New Patient Intake Packet', {
      x: PAGE_MARGIN, y, size: 16, font: helveticaBold, color: rgb(0.1, 0.1, 0.1),
    });
    y -= 30;

    // Client info if available
    if (clientInfo?.first_name) {
      coverPage.drawText(`Prepared for: ${clientInfo.first_name} ${clientInfo.last_name || ''}`, {
        x: PAGE_MARGIN, y, size: 12, font: helvetica, color: rgb(0.2, 0.2, 0.2),
      });
      y -= 20;
    }

    coverPage.drawText(`Date: ${new Date().toLocaleDateString('en-US')}`, {
      x: PAGE_MARGIN, y, size: 10, font: helvetica, color: rgb(0.3, 0.3, 0.3),
    });
    y -= 30;

    // Table of contents
    coverPage.drawText('Included Forms:', {
      x: PAGE_MARGIN, y, size: 12, font: helveticaBold, color: rgb(0.1, 0.1, 0.1),
    });
    y -= 20;

    for (let i = 0; i < templates.length; i++) {
      coverPage.drawText(`${i + 1}. ${templates[i].name}`, {
        x: PAGE_MARGIN + 10, y, size: 11, font: helvetica, color: rgb(0.2, 0.2, 0.2),
      });
      y -= 16;
    }
  }

  // Generate each template
  const allPages: PDFPage[] = [];
  const form = fillable ? pdfDoc.getForm() : null;
  const fieldIdxRef = { value: 0 };

  for (const template of templates) {
    const enabledSections = template.sections
      .filter((s) => s.enabled)
      .sort((a, b) => a.sort_order - b.sort_order);

    if (enabledSections.length === 0) continue;

    let page = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    allPages.push(page);
    let y = PAGE_HEIGHT - PAGE_MARGIN;

    // Practice header with optional logo
    let headerTextX = PAGE_MARGIN;
    if (logoImage) {
      const headerLogoH = 36;
      const headerLogoW = logoWidth * (headerLogoH / logoHeight);
      page.drawImage(logoImage, {
        x: PAGE_MARGIN,
        y: y - headerLogoH + 10,
        width: headerLogoW,
        height: headerLogoH,
      });
      headerTextX = PAGE_MARGIN + headerLogoW + 8;
    }

    page.drawText(practiceInfo.name || '', {
      x: headerTextX, y, size: 10, font: helveticaBold, color: rgb(0.3, 0.3, 0.3),
    });
    y -= 12;
    if (practiceInfo.address) {
      const csz = `${practiceInfo.address}, ${practiceInfo.city || ''} ${practiceInfo.state || ''} ${practiceInfo.zip || ''}`.trim();
      page.drawText(csz, {
        x: headerTextX, y, size: 8, font: helvetica, color: rgb(0.4, 0.4, 0.4),
      });
      y -= 10;
    }
    if (practiceInfo.phone) {
      page.drawText(`Phone: ${practiceInfo.phone}`, {
        x: headerTextX, y, size: 8, font: helvetica, color: rgb(0.4, 0.4, 0.4),
      });
      y -= 16;
    }

    // Template title
    page.drawText(template.name, {
      x: PAGE_MARGIN, y, size: 14, font: helveticaBold, color: rgb(0.05, 0.05, 0.05),
    });
    y -= 8;

    // Divider line
    page.drawLine({
      start: { x: PAGE_MARGIN, y },
      end: { x: PAGE_WIDTH - PAGE_MARGIN, y },
      thickness: 1,
      color: rgb(0.8, 0.8, 0.8),
    });
    y -= SECTION_GAP;

    // Helper to create a new page and track it
    const createNewPage = (): { page: PDFPage; y: number } => {
      const newPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      allPages.push(newPage);
      return { page: newPage, y: PAGE_HEIGHT - PAGE_MARGIN };
    };

    for (const section of enabledSections) {
      // Check if we need a new page
      if (y < PAGE_MARGIN + 80) {
        const result = createNewPage();
        page = result.page;
        y = result.y;
      }

      // Section title
      page.drawText(section.title, {
        x: PAGE_MARGIN, y, size: 11, font: helveticaBold, color: rgb(0.15, 0.15, 0.15),
      });
      y -= LINE_HEIGHT + 4;

      // Section content with variable replacement
      const content = replaceVariables(section.content, practiceInfo, clientInfo);

      if (fillable && form) {
        // Use field-aware renderer for fillable PDFs
        const fieldPrefix = `${template.slug}_${section.id}`;
        const result = drawContentWithFields(
          page, content, PAGE_MARGIN, y, helvetica, 10, CONTENT_WIDTH,
          form, fieldPrefix, fieldIdxRef, pdfDoc, createNewPage,
        );
        page = result.page;
        y = result.y;
      } else {
        // Standard text-only rendering
        y = drawWrappedText(page, content, PAGE_MARGIN, y, helvetica, 10, CONTENT_WIDTH);
      }

      y -= SECTION_GAP;

      // If we went past the bottom, that's fine — next section will create a new page
      if (y < PAGE_MARGIN + 40) {
        const result = createNewPage();
        page = result.page;
        y = result.y;
      }
    }
  }

  // Add page numbers
  const pages = pdfDoc.getPages();
  const totalPages = pages.length;
  for (let i = 0; i < totalPages; i++) {
    addPageNumber(pages[i], i + 1, totalPages, helvetica);
  }

  return pdfDoc.save();
}
