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
  brandAccentColor?: string | null;
}

// ── Layout constants ──
const PAGE_MARGIN = 50;
const PAGE_WIDTH = 612; // Letter
const PAGE_HEIGHT = 792;
const CONTENT_WIDTH = PAGE_WIDTH - PAGE_MARGIN * 2;
const LINE_HEIGHT = 14;
const SECTION_GAP = 20;

// ── Brand colors ──
const DEFAULT_BRAND_TEAL = rgb(0.18, 0.55, 0.53);   // #2E8D87 — default accent
const TEXT_PRIMARY = rgb(0.1, 0.1, 0.1);             // Body text
const TEXT_SECONDARY = rgb(0.35, 0.35, 0.35);        // Headers, labels
const TEXT_MUTED = rgb(0.5, 0.5, 0.5);               // Captions, page numbers
const BORDER_LIGHT = rgb(0.85, 0.85, 0.85);          // Subtle dividers
const FIELD_BORDER = rgb(0.65, 0.65, 0.65);          // Form field underlines

/** Parse a hex color string (#RRGGBB) into pdf-lib rgb() values */
function hexToRgb(hex: string) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  return rgb(r, g, b);
}

/** Create a very light tint of a color (for section header backgrounds) */
function hexToLightTint(hex: string) {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16) / 255;
  const g = parseInt(clean.substring(2, 4), 16) / 255;
  const b = parseInt(clean.substring(4, 6), 16) / 255;
  // Mix 8% of the color with 92% white
  return rgb(1 - 0.08 * (1 - r), 1 - 0.08 * (1 - g), 1 - 0.08 * (1 - b));
}

// ── Accent bar drawn at top of every page ──
function drawAccentBar(page: PDFPage, accentColor: ReturnType<typeof rgb>) {
  page.drawRectangle({
    x: 0,
    y: PAGE_HEIGHT - 6,
    width: PAGE_WIDTH,
    height: 6,
    color: accentColor,
  });
}

function addPageNumber(page: PDFPage, pageNum: number, totalPages: number, font: PDFFont) {
  page.drawText(`Page ${pageNum} of ${totalPages}`, {
    x: PAGE_WIDTH - PAGE_MARGIN - 80,
    y: 25,
    size: 8,
    font,
    color: TEXT_MUTED,
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

    const words = line.split(' ');
    let currentLine = '';

    for (const word of words) {
      const testLine = currentLine ? `${currentLine} ${word}` : word;
      const width = font.widthOfTextAtSize(testLine, fontSize);

      if (width > maxWidth && currentLine) {
        page.drawText(currentLine, { x, y, size: fontSize, font, color: TEXT_PRIMARY });
        y -= LINE_HEIGHT;
        currentLine = word;
      } else {
        currentLine = testLine;
      }
    }

    if (currentLine) {
      page.drawText(currentLine, { x, y, size: fontSize, font, color: TEXT_PRIMARY });
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

      const cb = form.createCheckBox(fieldName);
      cb.addToPage(currentPage, {
        x,
        y: y - 2,
        width: 10,
        height: 10,
      });

      currentPage.drawText(label, {
        x: x + 16,
        y,
        size: fontSize,
        font,
        color: TEXT_PRIMARY,
      });

      y -= LINE_HEIGHT + 2;
      continue;
    }

    // Check for multiple checkboxes on one line: [ ] Option A   [ ] Option B
    const multiCheckMatch = line.match(/\[ \]/g);
    if (multiCheckMatch && multiCheckMatch.length > 1) {
      const parts = line.split(/\[ \]\s*/);
      let lineX = x;

      if (parts[0].trim()) {
        const prefixText = parts[0].trim();
        currentPage.drawText(prefixText, {
          x: lineX, y, size: fontSize, font, color: TEXT_PRIMARY,
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
            x: lineX, y, size: fontSize, font, color: TEXT_PRIMARY,
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

      const isSig = FIELD_PATTERNS.isSignatureLabel.test(labelText);
      const isDate = FIELD_PATTERNS.isDateLabel.test(labelText);

      let labelWidth = 0;
      if (labelText) {
        currentPage.drawText(labelText, {
          x, y, size: fontSize, font, color: TEXT_PRIMARY,
        });
        labelWidth = font.widthOfTextAtSize(labelText + ' ', fontSize);
      }

      const underscoreWidth = Math.min(
        Math.max(underscores.length * 5, isSig ? 200 : isDate ? 100 : 120),
        maxWidth - labelWidth - (suffix ? font.widthOfTextAtSize(suffix + ' ', fontSize) : 0)
      );
      const fieldHeight = isSig ? 22 : 16;
      const fieldName = `${fieldPrefix}_${isSig ? 'sig' : isDate ? 'date' : 'tf'}_${fieldIdxRef.value++}`;

      const tf = form.createTextField(fieldName);
      tf.addToPage(currentPage, {
        x: x + labelWidth,
        y: y - 4,
        width: underscoreWidth,
        height: fieldHeight,
        borderWidth: 0,
      });

      currentPage.drawLine({
        start: { x: x + labelWidth, y: y - 4 },
        end: { x: x + labelWidth + underscoreWidth, y: y - 4 },
        thickness: 0.5,
        color: FIELD_BORDER,
      });

      if (suffix) {
        currentPage.drawText(suffix, {
          x: x + labelWidth + underscoreWidth + 4,
          y,
          size: fontSize,
          font,
          color: TEXT_PRIMARY,
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
        color: FIELD_BORDER,
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
        currentPage.drawText(currentLine, { x, y, size: fontSize, font, color: TEXT_PRIMARY });
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
      currentPage.drawText(currentLine, { x, y, size: fontSize, font, color: TEXT_PRIMARY });
      y -= LINE_HEIGHT;
    }
  }

  return { page: currentPage, y };
}

// ── Section header with left accent bar + tinted background ──
function drawSectionHeader(
  page: PDFPage, title: string, y: number, font: PDFFont,
  accentColor: ReturnType<typeof rgb>, accentLightColor: ReturnType<typeof rgb>,
): number {
  // Light accent background
  page.drawRectangle({
    x: PAGE_MARGIN - 4,
    y: y - 5,
    width: CONTENT_WIDTH + 8,
    height: 19,
    color: accentLightColor,
  });
  // Accent left bar
  page.drawRectangle({
    x: PAGE_MARGIN - 4,
    y: y - 5,
    width: 3,
    height: 19,
    color: accentColor,
  });
  // Section title text
  page.drawText(title, {
    x: PAGE_MARGIN + 4,
    y,
    size: 11,
    font,
    color: rgb(0.12, 0.12, 0.12),
  });
  return y - 24; // Extra spacing after styled header
}

// ── Build a clean address string, guarding against empty parts ──
function buildAddressString(practice: Partial<PracticeInfo>): string {
  const parts: string[] = [];
  if (practice.address) parts.push(practice.address);
  const cityStateZip = [practice.city, practice.state].filter(Boolean).join(', ')
    + (practice.zip ? ` ${practice.zip}` : '');
  if (cityStateZip.trim()) {
    if (parts.length > 0) parts.push(cityStateZip.trim());
    else parts.push(cityStateZip.trim());
  }
  return parts.join(', ');
}

export async function generateIntakePdf(options: GenerateIntakePdfOptions): Promise<Uint8Array> {
  const { templates, practiceInfo, clientInfo, fillable, logoBase64, brandAccentColor } = options;
  const pdfDoc = await PDFDocument.create();

  // Derive brand colors from user setting or default teal
  const ACCENT = brandAccentColor ? hexToRgb(brandAccentColor) : DEFAULT_BRAND_TEAL;
  const ACCENT_LIGHT = brandAccentColor ? hexToLightTint(brandAccentColor) : hexToLightTint('#2E8D87');

  const helvetica = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const helveticaBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

  // Embed logo if provided
  let logoImage: Awaited<ReturnType<typeof pdfDoc.embedPng>> | null = null;
  let logoWidth = 0;
  let logoHeight = 0;
  const LOGO_MAX_HEIGHT = 48;

  if (logoBase64) {
    try {
      const base64Data = logoBase64.replace(/^data:image\/[a-z]+;base64,/, '');
      const logoBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));
      const isPng = logoBase64.includes('image/png');
      logoImage = isPng
        ? await pdfDoc.embedPng(logoBytes)
        : await pdfDoc.embedJpg(logoBytes);
      const dims = logoImage.scale(1);
      const scale = LOGO_MAX_HEIGHT / dims.height;
      logoWidth = dims.width * scale;
      logoHeight = LOGO_MAX_HEIGHT;
    } catch {
      logoImage = null;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // Cover page (only when multiple templates)
  // ═══════════════════════════════════════════════════════════════
  if (templates.length > 1) {
    const coverPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
    drawAccentBar(coverPage, ACCENT);
    let y = PAGE_HEIGHT - PAGE_MARGIN - 30;

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
      size: 22,
      font: helveticaBold,
      color: rgb(0.05, 0.05, 0.05),
    });
    y -= 26;

    // Practice address (guarded)
    const addressStr = buildAddressString(practiceInfo);
    if (addressStr) {
      coverPage.drawText(addressStr, {
        x: textStartX, y, size: 10, font: helvetica, color: TEXT_SECONDARY,
      });
      y -= 14;
    }
    if (practiceInfo.phone) {
      coverPage.drawText(`Phone: ${practiceInfo.phone}`, {
        x: textStartX, y, size: 10, font: helvetica, color: TEXT_SECONDARY,
      });
      y -= 14;
    }

    y -= 8;

    // Horizontal divider
    coverPage.drawLine({
      start: { x: PAGE_MARGIN, y },
      end: { x: PAGE_WIDTH - PAGE_MARGIN, y },
      thickness: 0.75,
      color: BORDER_LIGHT,
    });
    y -= 30;

    // Title — teal
    coverPage.drawText('New Patient Intake Packet', {
      x: PAGE_MARGIN, y, size: 18, font: helveticaBold, color: ACCENT,
    });
    y -= 32;

    // Client info in light background box
    if (clientInfo?.first_name) {
      const clientName = `Prepared for: ${clientInfo.first_name} ${clientInfo.last_name || ''}`.trim();
      const boxWidth = Math.min(helvetica.widthOfTextAtSize(clientName, 12) + 24, CONTENT_WIDTH);
      coverPage.drawRectangle({
        x: PAGE_MARGIN,
        y: y - 6,
        width: boxWidth,
        height: 24,
        color: rgb(0.96, 0.96, 0.96),
      });
      coverPage.drawText(clientName, {
        x: PAGE_MARGIN + 12, y, size: 12, font: helvetica, color: rgb(0.2, 0.2, 0.2),
      });
      y -= 28;
    }

    const dateStr = `Date: ${new Date().toLocaleDateString('en-US')}`;
    coverPage.drawText(dateStr, {
      x: PAGE_MARGIN, y, size: 10, font: helvetica, color: TEXT_SECONDARY,
    });
    y -= 36;

    // Included Forms — styled list with teal bullet markers
    coverPage.drawText('Included Forms:', {
      x: PAGE_MARGIN, y, size: 12, font: helveticaBold, color: TEXT_PRIMARY,
    });
    y -= 22;

    for (let i = 0; i < templates.length; i++) {
      // Teal bullet dot
      coverPage.drawRectangle({
        x: PAGE_MARGIN + 8,
        y: y + 3,
        width: 5,
        height: 5,
        color: ACCENT,
      });
      coverPage.drawText(templates[i].name, {
        x: PAGE_MARGIN + 20, y, size: 11, font: helvetica, color: rgb(0.2, 0.2, 0.2),
      });
      y -= 18;
    }

    // Cover page footer
    coverPage.drawText('Confidential — For Patient Use Only', {
      x: PAGE_MARGIN,
      y: 30,
      size: 8,
      font: helvetica,
      color: TEXT_MUTED,
    });
  }

  // ═══════════════════════════════════════════════════════════════
  // Generate each template
  // ═══════════════════════════════════════════════════════════════
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
    drawAccentBar(page, ACCENT);
    let y = PAGE_HEIGHT - PAGE_MARGIN - 8;

    // ── Practice header (with logo) ──
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
      x: headerTextX, y, size: 10, font: helveticaBold, color: TEXT_SECONDARY,
    });
    y -= 12;

    // Address + phone — single line, guarded
    const headerParts: string[] = [];
    const addr = buildAddressString(practiceInfo);
    if (addr) headerParts.push(addr);
    if (practiceInfo.phone) headerParts.push(`Phone: ${practiceInfo.phone}`);
    if (headerParts.length > 0) {
      page.drawText(headerParts.join('  |  '), {
        x: headerTextX, y, size: 7.5, font: helvetica, color: rgb(0.45, 0.45, 0.45),
      });
      y -= 10;
    }

    y -= 6;
    // Thin separator
    page.drawLine({
      start: { x: PAGE_MARGIN, y },
      end: { x: PAGE_WIDTH - PAGE_MARGIN, y },
      thickness: 0.5,
      color: BORDER_LIGHT,
    });
    y -= 16;

    // ── Template title — teal ──
    page.drawText(template.name, {
      x: PAGE_MARGIN, y, size: 15, font: helveticaBold, color: ACCENT,
    });
    y -= 6;

    // Teal divider under title
    page.drawLine({
      start: { x: PAGE_MARGIN, y },
      end: { x: PAGE_WIDTH - PAGE_MARGIN, y },
      thickness: 1.5,
      color: ACCENT,
    });
    y -= SECTION_GAP;

    // ── Helper: create a continuation page with header ──
    const createNewPage = (): { page: PDFPage; y: number } => {
      const newPage = pdfDoc.addPage([PAGE_WIDTH, PAGE_HEIGHT]);
      allPages.push(newPage);
      drawAccentBar(newPage, ACCENT);

      let ny = PAGE_HEIGHT - PAGE_MARGIN - 8;
      // Compact header on continuation pages
      newPage.drawText(practiceInfo.name || '', {
        x: PAGE_MARGIN, y: ny, size: 9, font: helveticaBold, color: TEXT_MUTED,
      });
      // Template name on the right
      const nameWidth = helvetica.widthOfTextAtSize(template.name, 9);
      newPage.drawText(template.name, {
        x: PAGE_WIDTH - PAGE_MARGIN - nameWidth, y: ny, size: 9, font: helvetica, color: TEXT_MUTED,
      });
      ny -= 10;
      newPage.drawLine({
        start: { x: PAGE_MARGIN, y: ny },
        end: { x: PAGE_WIDTH - PAGE_MARGIN, y: ny },
        thickness: 0.5,
        color: BORDER_LIGHT,
      });
      ny -= 16;
      return { page: newPage, y: ny };
    };

    // ── Render each section ──
    for (const section of enabledSections) {
      // Page break check
      if (y < PAGE_MARGIN + 80) {
        const result = createNewPage();
        page = result.page;
        y = result.y;
      }

      // Styled section header
      y = drawSectionHeader(page, section.title, y, helveticaBold, ACCENT, ACCENT_LIGHT);

      // Section content with variable replacement
      const content = replaceVariables(section.content, practiceInfo, clientInfo);

      if (fillable && form) {
        const fieldPrefix = `${template.slug}_${section.id}`;
        const result = drawContentWithFields(
          page, content, PAGE_MARGIN, y, helvetica, 10, CONTENT_WIDTH,
          form, fieldPrefix, fieldIdxRef, pdfDoc, createNewPage,
        );
        page = result.page;
        y = result.y;
      } else {
        y = drawWrappedText(page, content, PAGE_MARGIN, y, helvetica, 10, CONTENT_WIDTH);
      }

      y -= SECTION_GAP;

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
