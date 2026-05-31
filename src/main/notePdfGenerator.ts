/**
 * Clinical Note + Evaluation PDF Generator
 *
 * Generates downloadable PDFs for:
 *  - Client SOAP notes (with CPT/units)
 *  - Contractor SOAP notes (with med history / interventions, no CPT)
 *  - Client evaluations (rich, discipline-aware)
 *  - Bulk packets (multiple signed notes for one patient, one page break per note)
 *
 * Mirrors the layout conventions used by buildInvoicePdf / buildSuperbillPdf in main.ts
 * (jsPDF, letter format, 40pt margins, Helvetica, practice header with optional logo).
 */

import { jsPDF } from 'jspdf';

// ── Colors (kept local; mirrors PDF_COLORS in main.ts) ──
const COLORS = {
  heading:      [35, 55, 75] as [number, number, number],
  body:         [51, 51, 51] as [number, number, number],
  label:        [100, 110, 120] as [number, number, number],
  light:        [140, 150, 160] as [number, number, number],
  accent:       [44, 82, 130] as [number, number, number],
  divider:      [210, 216, 224] as [number, number, number],
  signedGreen:  [21, 128, 61] as [number, number, number],
  draftAmber:   [180, 83, 9] as [number, number, number],
  footer:       [100, 110, 120] as [number, number, number],
  confidential: [180, 50, 50] as [number, number, number],
  // SOAP section left-border colors (match in-app UI)
  soapS:        [59, 130, 246] as [number, number, number],
  soapO:        [16, 185, 129] as [number, number, number],
  soapA:        [245, 158, 11] as [number, number, number],
  soapP:        [139, 92, 246] as [number, number, number],
};

// ── Shared types (kept loose; we pass DB rows through) ──
export interface NoteRow {
  id: number;
  date_of_service: string;
  time_in?: string;
  time_out?: string;
  units?: number;
  cpt_code?: string;
  cpt_codes?: string; // JSON array on client notes
  cpt_modifiers?: string; // JSON array on client notes
  place_of_service?: string;
  subjective?: string;
  objective?: string;
  assessment?: string;
  plan?: string;
  goals_addressed?: string; // JSON array of goal IDs
  signed_at?: string | null;
  signature_typed?: string;
  // Contractor-only extras
  medical_history?: string;
  interventions_provided?: string;
  long_term_goals?: string;
  short_term_goals?: string;
  contractor_patient_name?: string;
  patient_name?: string;
  entity_name?: string;
  note_type?: string;
}

export interface EvalRow {
  id: number;
  client_id?: number | null;
  eval_date: string;
  discipline?: string;
  content?: string; // JSON
  signed_at?: string | null;
  signature_typed?: string;
  eval_type?: string;
}

export interface PatientInfo {
  first_name?: string;
  last_name?: string;
  dob?: string;
  mrn?: string;
}

export interface PracticeInfo {
  name?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  phone?: string;
  npi?: string;
  tax_id?: string;
  license_number?: string;
  /** PT | OT | ST | MFT — drives the discipline-name subtitle on contractor PDFs. */
  discipline?: string;
}

export interface EntityInfo {
  name?: string;
}

export interface GoalInfo {
  id: number;
  text?: string;
  category?: string;
}

// ── Helpers ──

function formatDate(raw?: string): string {
  if (!raw) return '';
  try {
    return new Date(raw + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return raw;
  }
}

function formatDateTime(raw?: string): string {
  if (!raw) return '';
  try {
    const d = new Date(raw);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
  } catch {
    return raw;
  }
}

function formatTime12(raw?: string): string {
  if (!raw) return '';
  const [hStr, mStr] = raw.split(':');
  const h = parseInt(hStr, 10);
  if (isNaN(h)) return raw;
  const ampm = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${mStr || '00'} ${ampm}`;
}

function patientFullName(p: PatientInfo | null | undefined, fallback?: string): string {
  if (p && (p.first_name || p.last_name)) {
    return `${p.first_name || ''} ${p.last_name || ''}`.trim();
  }
  return (fallback || '').trim() || 'Unknown patient';
}

function sanitizeFilename(s: string): string {
  return (s || '').replace(/[^a-zA-Z0-9]/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '');
}

/** Map the practice's stored discipline code to its full clinical name. */
function disciplineLabel(code: string | undefined): string {
  switch ((code || '').toUpperCase()) {
    case 'PT':  return 'Physical Therapy';
    case 'OT':  return 'Occupational Therapy';
    case 'ST':  return 'Speech-Language Pathology';
    case 'MFT': return 'Marriage & Family Therapy';
    default:    return code || '';
  }
}

/** What kind of note/eval this is, in human-readable form (e.g., "Evaluation", "Treatment Note"). */
function noteKindLabel(noteType: string | undefined): string {
  switch ((noteType || '').toLowerCase()) {
    case 'evaluation':      return 'Evaluation';
    case 'progress_report': return 'Progress Report';
    case 'discharge':       return 'Discharge Summary';
    default:                return 'Treatment Note';
  }
}

// ── Layout primitives ──

interface Layout {
  doc: jsPDF;
  pageWidth: number;
  pageHeight: number;
  marginLeft: number;
  marginRight: number;
  maxWidth: number;
  y: number;
}

function createLayout(): Layout {
  const doc = new jsPDF({ unit: 'pt', format: 'letter' });
  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const marginLeft = 40;
  const marginRight = 40;
  return {
    doc,
    pageWidth,
    pageHeight,
    marginLeft,
    marginRight,
    maxWidth: pageWidth - marginLeft - marginRight,
    y: 40,
  };
}

function checkPageBreak(L: Layout, needed: number): void {
  if (L.y + needed > L.pageHeight - 50) {
    L.doc.addPage();
    L.y = 40;
  }
}

/** Header options. When `entityName` is set, we switch to "contractor mode": the entity name
 *  goes on top with a discipline+kind subtitle, and the practice attribution is rendered
 *  smaller at the bottom of the doc (above the signature block). This matches what contracting
 *  agencies expect — their own letterhead, not the provider's. */
interface HeaderOptions {
  practice: PracticeInfo | null;
  logoBase64: string | null;
  /** Top-right tag for non-contractor docs (e.g., "EVALUATION", "SESSION NOTE"). Ignored in contractor mode. */
  title: string;
  /** When set, switches to contractor layout. */
  entityName?: string;
  /** When set, used as the subtitle under the entity name (e.g., "Speech-Language Pathology Evaluation"). */
  subtitle?: string;
}

function drawPracticeHeader(L: Layout, opts: HeaderOptions): void {
  const { doc, marginLeft, marginRight, pageWidth } = L;
  const { practice, logoBase64, title, entityName, subtitle } = opts;
  const contractorMode = Boolean(entityName);

  if (contractorMode) {
    // ── Contractor layout: entity name dominates the top, practice attribution moves to footer. ──
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.heading);
    doc.text(entityName!, marginLeft, L.y + 4);
    L.y += 22;

    if (subtitle) {
      doc.setFontSize(11);
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(...COLORS.accent);
      doc.text(subtitle, marginLeft, L.y);
      L.y += 14;
    }

    doc.setTextColor(...COLORS.body);
    L.y += 8;
  } else {
    // ── Default (client) layout: practice info top with optional logo, doc-type tag top-right. ──
    let textStartX = marginLeft;
    if (logoBase64) {
      try {
        const fmt = logoBase64.includes('image/png') ? 'PNG' : 'JPEG';
        doc.addImage(logoBase64, fmt, marginLeft, L.y - 6, 48, 48);
        textStartX = marginLeft + 56;
      } catch { /* skip logo */ }
    }

    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.heading);
    doc.text(practice?.name || 'Practice', textStartX, L.y);
    L.y += 14;

    doc.setFontSize(8.5);
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(...COLORS.label);
    if (practice?.address) { doc.text(practice.address, textStartX, L.y); L.y += 11; }
    const csz = [practice?.city, practice?.state, practice?.zip].filter(Boolean).join(', ');
    if (csz) { doc.text(csz, textStartX, L.y); L.y += 11; }
    if (practice?.phone) { doc.text(`Phone: ${practice.phone}`, textStartX, L.y); L.y += 11; }
    const npiTax: string[] = [];
    if (practice?.npi) npiTax.push(`NPI: ${practice.npi}`);
    if (practice?.tax_id) npiTax.push(`Tax ID: ${practice.tax_id}`);
    if (npiTax.length) { doc.text(npiTax.join('  |  '), textStartX, L.y); L.y += 11; }

    // Right-aligned doc-type tag
    doc.setFontSize(18);
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(...COLORS.accent);
    doc.text(title, pageWidth - marginRight, 56, { align: 'right' });

    doc.setTextColor(...COLORS.body);

    if (logoBase64) L.y = Math.max(L.y, 96);
    L.y = Math.max(L.y, 110);
  }

  // Divider (both modes)
  doc.setLineWidth(1.5);
  doc.setDrawColor(...COLORS.accent);
  doc.line(marginLeft, L.y, pageWidth - marginRight, L.y);
  doc.setDrawColor(0, 0, 0);
  L.y += 20;
}

/** Two-column patient info block.
 *  When `entityInHeader` is true, we skip the "Entity:" row since it's already shown above. */
function drawPatientBlock(
  L: Layout,
  patient: PatientInfo | null,
  patientNameFallback: string,
  entity: EntityInfo | null | undefined,
  dateOfService: string,
  extras: Array<{ label: string; value: string }> = [],
  entityInHeader: boolean = false,
): void {
  const { doc, marginLeft, pageWidth, marginRight } = L;
  const colRightX = pageWidth / 2 + 10;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.heading);
  doc.text('PATIENT', marginLeft, L.y);
  doc.text('VISIT', colRightX, L.y);
  L.y += 14;

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.body);

  // Left column items
  const leftStartY = L.y;
  let leftY = L.y;
  const drawLeftRow = (label: string, value: string) => {
    if (!value) return;
    doc.setFont('helvetica', 'bold');
    doc.text(label, marginLeft, leftY);
    doc.setFont('helvetica', 'normal');
    doc.text(value, marginLeft + 70, leftY);
    leftY += 13;
  };

  drawLeftRow('Name:', patientFullName(patient, patientNameFallback));
  if (patient?.dob) drawLeftRow('DOB:', formatDate(patient.dob));
  if (patient?.mrn) drawLeftRow('MRN:', patient.mrn);
  if (entity?.name && !entityInHeader) drawLeftRow('Entity:', entity.name);

  // Right column items
  let rightY = leftStartY;
  const drawRightRow = (label: string, value: string) => {
    if (!value) return;
    doc.setFont('helvetica', 'bold');
    doc.text(label, colRightX, rightY);
    doc.setFont('helvetica', 'normal');
    doc.text(value, colRightX + 80, rightY);
    rightY += 13;
  };

  drawRightRow('Date of Service:', formatDate(dateOfService));
  for (const e of extras) drawRightRow(e.label, e.value);

  L.y = Math.max(leftY, rightY) + 10;
  doc.setDrawColor(...COLORS.divider);
  doc.line(marginLeft, L.y, pageWidth - marginRight, L.y);
  doc.setDrawColor(0, 0, 0);
  L.y += 16;
}

/** Render one named section with optional left accent bar. */
function drawSection(L: Layout, title: string, body: string, accent?: [number, number, number]): void {
  if (!body || !body.trim()) return;
  const { doc, marginLeft, maxWidth } = L;
  const lines = doc.splitTextToSize(body, maxWidth - 12);
  const blockHeight = 18 + lines.length * 12 + 4;
  checkPageBreak(L, blockHeight);

  // Optional accent bar
  if (accent) {
    doc.setFillColor(accent[0], accent[1], accent[2]);
    doc.rect(marginLeft, L.y - 10, 3, blockHeight - 4, 'F');
  }

  doc.setFontSize(10.5);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.heading);
  doc.text(title, marginLeft + (accent ? 10 : 0), L.y);
  L.y += 14;

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(...COLORS.body);
  doc.text(lines, marginLeft + (accent ? 10 : 0), L.y);
  L.y += lines.length * 12 + 8;
}

/** Signature block — shows signed name + timestamp + clinician credentials (NPI, license),
 *  or an unsigned-draft notice. We keep this tight: no practice address/phone/tax-id, since
 *  for contractor work the entity already knows who you are, and for insurance work the
 *  practice info lives in the top header. */
function drawSignatureBlock(
  L: Layout,
  signedAt: string | null | undefined,
  signatureTyped: string | undefined,
  practice: PracticeInfo | null,
): void {
  const { doc, marginLeft, pageWidth, marginRight } = L;
  checkPageBreak(L, 70);

  L.y += 6;
  doc.setDrawColor(...COLORS.divider);
  doc.line(marginLeft, L.y, pageWidth - marginRight, L.y);
  doc.setDrawColor(0, 0, 0);
  L.y += 18;

  doc.setFontSize(10);
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(...COLORS.heading);
  doc.text('ELECTRONIC SIGNATURE', marginLeft, L.y);
  L.y += 14;

  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'normal');
  if (signedAt) {
    doc.setTextColor(...COLORS.signedGreen);
    doc.text(`Signed by: ${signatureTyped || '—'}`, marginLeft, L.y);
    L.y += 12;
    doc.setTextColor(...COLORS.body);
    doc.text(`Signed at: ${formatDateTime(signedAt)}`, marginLeft, L.y);
    L.y += 12;

    // Clinician credentials — combined onto one line, NPI first then License.
    const creds: string[] = [];
    if (practice?.npi)            creds.push(`NPI: ${practice.npi}`);
    if (practice?.license_number) creds.push(`License #: ${practice.license_number}`);
    if (creds.length) {
      doc.setTextColor(...COLORS.label);
      doc.text(creds.join('   ·   '), marginLeft, L.y);
      L.y += 12;
    }
  } else {
    doc.setTextColor(...COLORS.draftAmber);
    doc.text('UNSIGNED DRAFT — not a finalized clinical record', marginLeft, L.y);
    L.y += 12;
  }
  doc.setTextColor(...COLORS.body);
}

/** Footer on every page (confidentiality + page numbers). */
function addFooters(L: Layout): void {
  const { doc, pageWidth, pageHeight } = L;
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    doc.setFontSize(7);
    doc.setFont('helvetica', 'italic');
    doc.setTextColor(...COLORS.confidential);
    doc.text(
      'This document contains confidential health information. Unauthorized disclosure is prohibited.',
      pageWidth / 2, pageHeight - 20, { align: 'center' }
    );
    if (totalPages > 1) {
      doc.setTextColor(...COLORS.footer);
      doc.text(`Page ${p} of ${totalPages}`, pageWidth / 2, pageHeight - 10, { align: 'center' });
    }
  }
  doc.setTextColor(0, 0, 0);
}

// ── SOAP body renderer (shared by client + contractor notes) ──

/** Parse a goal list column from the notes table. Mirrors parseGoalList() in ContractorNotePage.
 *  Handles three formats: empty, JSON array of {text, timeframe}, or legacy plaintext. */
function parseStoredGoals(raw: string | null | undefined): Array<{ text: string; timeframe: string }> {
  if (!raw || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((g: any) => ({ text: String(g?.text ?? ''), timeframe: String(g?.timeframe ?? '') }))
        .filter(g => g.text.trim() || g.timeframe.trim());
    }
  } catch {
    // legacy plaintext
  }
  return [{ text: raw, timeframe: '' }];
}

/** Render a list of goal entries as numbered lines with "[timeframe]" prefix when set. */
function formatStoredGoals(entries: Array<{ text: string; timeframe: string }>): string {
  return entries
    .map((g, i) => {
      const tf = g.timeframe.trim() ? ` [${g.timeframe.trim()}]` : '';
      const text = g.text.trim() || '(no description)';
      return `${i + 1}.${tf} ${text}`;
    })
    .join('\n\n');
}

function renderNoteBody(L: Layout, note: NoteRow, goals: GoalInfo[] | undefined): void {
  // Eval-only extras (when this note is a contractor eval)
  if (note.medical_history) {
    drawSection(L, 'Background / Medical History', note.medical_history);
  }
  if (note.interventions_provided) {
    drawSection(L, 'What Was Completed', note.interventions_provided);
  }
  const ltgList = parseStoredGoals(note.long_term_goals);
  if (ltgList.length > 0) {
    drawSection(L, 'Long-Term Goals', formatStoredGoals(ltgList));
  }
  const stgList = parseStoredGoals(note.short_term_goals);
  if (stgList.length > 0) {
    drawSection(L, 'Short-Term Goals', formatStoredGoals(stgList));
  }

  drawSection(L, 'Subjective', note.subjective || '', COLORS.soapS);
  drawSection(L, 'Objective',  note.objective  || '', COLORS.soapO);
  drawSection(L, 'Assessment', note.assessment || '', COLORS.soapA);
  drawSection(L, 'Plan',       note.plan       || '', COLORS.soapP);

  // Goals addressed (only if we resolved any)
  if (goals && goals.length > 0) {
    const goalsBody = goals.map((g, i) => `${i + 1}. ${g.text || `Goal #${g.id}`}`).join('\n');
    drawSection(L, 'Goals Addressed', goalsBody);
  }
}

/** Extract visit-extras (time, units, CPT) into label/value pairs for the patient block. */
function visitExtras(note: NoteRow): Array<{ label: string; value: string }> {
  const out: Array<{ label: string; value: string }> = [];
  const tIn = formatTime12(note.time_in);
  const tOut = formatTime12(note.time_out);
  if (tIn || tOut) {
    out.push({ label: 'Time:', value: [tIn, tOut].filter(Boolean).join(' – ') });
  }
  if (note.units) out.push({ label: 'Units:', value: String(note.units) });

  // CPT codes — may be JSON array (client notes) or single code (contractor)
  let cpts: Array<{ code: string; units?: number }> = [];
  if (note.cpt_codes) {
    try {
      const parsed = JSON.parse(note.cpt_codes);
      if (Array.isArray(parsed)) cpts = parsed.filter(c => c?.code);
    } catch { /* ignore */ }
  }
  if (cpts.length === 0 && note.cpt_code) cpts = [{ code: note.cpt_code }];
  if (cpts.length > 0) {
    const cptStr = cpts
      .map(c => c.units && c.units !== 1 ? `${c.code} (${c.units}u)` : c.code)
      .join(', ');
    out.push({ label: 'CPT:', value: cptStr });
  }

  return out;
}

// ── Public builders ──

export interface BuildNotePdfArgs {
  note: NoteRow;
  patient: PatientInfo | null;
  practice: PracticeInfo | null;
  entity?: EntityInfo | null;
  goals?: GoalInfo[];
  logoBase64?: string | null;
}

export function buildNotePdf(args: BuildNotePdfArgs): { base64Pdf: string; filename: string } {
  const { note, patient, practice, entity, goals, logoBase64 } = args;
  const L = createLayout();

  const isContractor = Boolean(entity?.name);
  const isEval = note.note_type === 'evaluation';
  // Top-right tag for client mode only (contractor mode shows the kind in the subtitle instead).
  const tag = isEval ? 'EVALUATION' : note.note_type === 'progress_report' ? 'PROGRESS REPORT' : 'SESSION NOTE';
  const subtitle = isContractor
    ? `${disciplineLabel(practice?.discipline)} ${noteKindLabel(note.note_type)}`.trim()
    : undefined;

  drawPracticeHeader(L, {
    practice,
    logoBase64: logoBase64 ?? null,
    title: tag,
    entityName: isContractor ? entity!.name : undefined,
    subtitle,
  });
  drawPatientBlock(
    L,
    patient,
    note.contractor_patient_name || note.patient_name || '',
    entity ?? null,
    note.date_of_service,
    visitExtras(note),
    isContractor,
  );
  renderNoteBody(L, note, goals);
  drawSignatureBlock(L, note.signed_at, note.signature_typed, practice);
  addFooters(L);

  const filename = buildNoteFilename(note, patient);
  const pdfOutput = L.doc.output('arraybuffer');
  const base64Pdf = Buffer.from(pdfOutput).toString('base64');
  return { base64Pdf, filename };
}

function buildNoteFilename(note: NoteRow, patient: PatientInfo | null): string {
  const last = sanitizeFilename(patient?.last_name || (note.contractor_patient_name || note.patient_name || '').split(' ').slice(-1)[0] || 'Patient');
  const first = sanitizeFilename(patient?.first_name || (note.contractor_patient_name || note.patient_name || '').split(' ')[0] || '');
  const date = note.date_of_service || new Date().toISOString().slice(0, 10);
  const kind = note.note_type === 'evaluation' ? 'Eval' : 'Note';
  return `${kind}_${last}${first ? '_' + first : ''}_${date}.pdf`;
}

// ── Evaluation builder ──

export interface BuildEvalPdfArgs {
  evaluation: EvalRow;
  patient: PatientInfo | null;
  practice: PracticeInfo | null;
  goals?: GoalInfo[];
  logoBase64?: string | null;
}

export function buildEvalPdf(args: BuildEvalPdfArgs): { base64Pdf: string; filename: string } {
  const { evaluation, patient, practice, goals, logoBase64 } = args;
  const L = createLayout();

  let content: any = {};
  try { content = JSON.parse(evaluation.content || '{}'); } catch { /* keep empty */ }

  // Title varies by eval_type
  const evalTypeLabel = (evaluation.eval_type || 'initial').toUpperCase();
  const title = evalTypeLabel === 'INITIAL' ? 'EVALUATION' : `${evalTypeLabel} EVALUATION`;

  drawPracticeHeader(L, {
    practice,
    logoBase64: logoBase64 ?? null,
    title,
  });

  // Eval-specific visit extras (discipline)
  const extras: Array<{ label: string; value: string }> = [];
  if (evaluation.discipline) extras.push({ label: 'Discipline:', value: evaluation.discipline });
  if (content.frequency_duration) extras.push({ label: 'Frequency:', value: content.frequency_duration });
  drawPatientBlock(L, patient, '', null, evaluation.eval_date, extras);

  // Referral section
  if (content.referral_source || content.referral_physician_npi) {
    const lines: string[] = [];
    if (content.referral_source) lines.push(`Source: ${content.referral_source}`);
    if (content.referral_physician_npi) lines.push(`Referring NPI: ${content.referral_physician_npi}`);
    drawSection(L, 'Referral', lines.join('\n'));
  }

  // Narrative sections
  drawSection(L, 'Medical History',          content.medical_history          || '');
  drawSection(L, 'Prior Level of Function',  content.prior_level_of_function  || '');
  drawSection(L, 'Current Complaints',       content.current_complaints       || '');

  // Objective Assessment — discipline-specific fields, only render ones with content
  const obj = content.objective_assessment || {};
  const enabled: string[] | undefined = content.enabled_objective_fields;
  const objLines: string[] = [];
  for (const [field, value] of Object.entries(obj) as Array<[string, string]>) {
    if (!value || typeof value !== 'string' || !value.trim()) continue;
    if (enabled && !enabled.includes(field)) continue;
    const label = field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
    objLines.push(`${label}:\n${value.trim()}`);
  }
  if (objLines.length > 0) {
    drawSection(L, 'Objective Assessment', objLines.join('\n\n'));
  }

  drawSection(L, 'Clinical Impression',     content.clinical_impression     || '');
  drawSection(L, 'Rehabilitation Potential', content.rehabilitation_potential || '');
  drawSection(L, 'Precautions',             content.precautions             || '');

  // Goals — prefer structured entries, fall back to legacy free-text
  if (Array.isArray(content.goal_entries) && content.goal_entries.length > 0) {
    const goalLines = content.goal_entries
      .map((g: any, i: number) => {
        const text = g.composed_text || g.text || `${g.category || 'Goal'}: ${g.target || ''}`.trim();
        const type = g.goal_type ? ` [${g.goal_type.toUpperCase()}]` : '';
        return `${i + 1}.${type} ${text}`;
      })
      .join('\n\n');
    drawSection(L, 'Goals', goalLines);
  } else if (content.goals && content.goals.trim()) {
    drawSection(L, 'Goals', content.goals);
  } else if (goals && goals.length > 0) {
    const goalsBody = goals.map((g, i) => `${i + 1}. ${g.text || `Goal #${g.id}`}`).join('\n');
    drawSection(L, 'Goals', goalsBody);
  }

  drawSection(L, 'Treatment Plan',  content.treatment_plan  || '');

  // Initial session note (if present in eval content)
  const sn = content.session_note;
  if (sn && (sn.subjective || sn.objective || sn.assessment || sn.plan)) {
    checkPageBreak(L, 40);
    L.y += 6;
    L.doc.setFontSize(11);
    L.doc.setFont('helvetica', 'bold');
    L.doc.setTextColor(...COLORS.heading);
    L.doc.text('INITIAL SESSION NOTE', L.marginLeft, L.y);
    L.y += 16;
    L.doc.setTextColor(...COLORS.body);
    drawSection(L, 'Subjective', sn.subjective || '', COLORS.soapS);
    drawSection(L, 'Objective',  sn.objective  || '', COLORS.soapO);
    drawSection(L, 'Assessment', sn.assessment || '', COLORS.soapA);
    drawSection(L, 'Plan',       sn.plan       || '', COLORS.soapP);
  }

  drawSignatureBlock(L, evaluation.signed_at, evaluation.signature_typed, practice);
  addFooters(L);

  const last = sanitizeFilename(patient?.last_name || 'Patient');
  const first = sanitizeFilename(patient?.first_name || '');
  const filename = `Eval_${last}${first ? '_' + first : ''}_${evaluation.eval_date}.pdf`;

  const pdfOutput = L.doc.output('arraybuffer');
  const base64Pdf = Buffer.from(pdfOutput).toString('base64');
  return { base64Pdf, filename };
}

// ── Bulk packet ──

export interface BuildBulkPdfArgs {
  notes: NoteRow[];
  patient: PatientInfo | null;
  practice: PracticeInfo | null;
  entity?: EntityInfo | null;
  /** Map of noteId -> resolved goals addressed in that note. */
  goalsByNoteId?: Record<number, GoalInfo[]>;
  logoBase64?: string | null;
}

export function buildBulkNotesPdf(args: BuildBulkPdfArgs): { base64Pdf: string; filename: string } {
  const { notes, patient, practice, entity, goalsByNoteId, logoBase64 } = args;
  if (notes.length === 0) {
    throw new Error('No notes provided for bulk PDF');
  }

  const sorted = [...notes].sort((a, b) => (a.date_of_service || '').localeCompare(b.date_of_service || ''));
  const isContractor = Boolean(entity?.name);
  const L = createLayout();

  // Packet cover page
  drawPracticeHeader(L, {
    practice,
    logoBase64: logoBase64 ?? null,
    title: 'NOTES PACKET',
    entityName: isContractor ? entity!.name : undefined,
    subtitle: isContractor ? `${disciplineLabel(practice?.discipline)} Notes Packet`.trim() : undefined,
  });

  const colRightX = L.pageWidth / 2 + 10;
  L.doc.setFontSize(10);
  L.doc.setFont('helvetica', 'bold');
  L.doc.setTextColor(...COLORS.heading);
  L.doc.text('PATIENT', L.marginLeft, L.y);
  L.doc.text('PACKET CONTENTS', colRightX, L.y);
  L.y += 14;

  L.doc.setFontSize(9.5);
  L.doc.setFont('helvetica', 'normal');
  L.doc.setTextColor(...COLORS.body);

  const leftStartY = L.y;
  let leftY = L.y;
  const drawLeftRow = (label: string, value: string) => {
    if (!value) return;
    L.doc.setFont('helvetica', 'bold');
    L.doc.text(label, L.marginLeft, leftY);
    L.doc.setFont('helvetica', 'normal');
    L.doc.text(value, L.marginLeft + 70, leftY);
    leftY += 13;
  };
  drawLeftRow('Name:', patientFullName(patient, sorted[0].contractor_patient_name || sorted[0].patient_name || ''));
  if (patient?.dob) drawLeftRow('DOB:', formatDate(patient.dob));
  if (patient?.mrn) drawLeftRow('MRN:', patient.mrn);
  if (entity?.name && !isContractor) drawLeftRow('Entity:', entity.name);

  let rightY = leftStartY;
  L.doc.setFont('helvetica', 'normal');
  L.doc.text(`${sorted.length} note${sorted.length !== 1 ? 's' : ''}`, colRightX, rightY);
  rightY += 13;
  const firstDate = formatDate(sorted[0].date_of_service);
  const lastDate = formatDate(sorted[sorted.length - 1].date_of_service);
  L.doc.text(firstDate === lastDate ? firstDate : `${firstDate} – ${lastDate}`, colRightX, rightY);
  rightY += 13;
  L.doc.setTextColor(...COLORS.label);
  L.doc.text(`Generated: ${new Date().toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`, colRightX, rightY);
  L.doc.setTextColor(...COLORS.body);

  L.y = Math.max(leftY, rightY) + 16;

  // Table of contents
  L.doc.setFontSize(10);
  L.doc.setFont('helvetica', 'bold');
  L.doc.setTextColor(...COLORS.heading);
  L.doc.text('Contents', L.marginLeft, L.y);
  L.y += 14;
  L.doc.setFontSize(9);
  L.doc.setFont('helvetica', 'normal');
  L.doc.setTextColor(...COLORS.body);
  sorted.forEach((n, i) => {
    checkPageBreak(L, 14);
    const kind = n.note_type === 'evaluation' ? 'Evaluation' : 'Session note';
    const status = n.signed_at ? '✓' : '(draft)';
    L.doc.text(`${i + 1}.  ${formatDate(n.date_of_service)}  —  ${kind}  ${status}`, L.marginLeft + 10, L.y);
    L.y += 12;
  });

  // One note per page
  for (const n of sorted) {
    L.doc.addPage();
    L.y = 40;
    const tag = n.note_type === 'evaluation' ? 'EVALUATION' : n.note_type === 'progress_report' ? 'PROGRESS REPORT' : 'SESSION NOTE';
    const subtitle = isContractor ? `${disciplineLabel(practice?.discipline)} ${noteKindLabel(n.note_type)}`.trim() : undefined;
    drawPracticeHeader(L, {
      practice,
      logoBase64: logoBase64 ?? null,
      title: tag,
      entityName: isContractor ? entity!.name : undefined,
      subtitle,
    });
    drawPatientBlock(
      L,
      patient,
      n.contractor_patient_name || n.patient_name || '',
      entity ?? null,
      n.date_of_service,
      visitExtras(n),
      isContractor,
    );
    renderNoteBody(L, n, goalsByNoteId?.[n.id]);
    drawSignatureBlock(L, n.signed_at, n.signature_typed, practice);
  }

  addFooters(L);

  const last = sanitizeFilename(patient?.last_name || sorted[0].contractor_patient_name?.split(' ').slice(-1)[0] || 'Patient');
  const first = sanitizeFilename(patient?.first_name || '');
  const dateRange = sorted[0].date_of_service === sorted[sorted.length - 1].date_of_service
    ? sorted[0].date_of_service
    : `${sorted[0].date_of_service}_to_${sorted[sorted.length - 1].date_of_service}`;
  const filename = `Notes_${last}${first ? '_' + first : ''}_${dateRange}.pdf`;

  const pdfOutput = L.doc.output('arraybuffer');
  const base64Pdf = Buffer.from(pdfOutput).toString('base64');
  return { base64Pdf, filename };
}
