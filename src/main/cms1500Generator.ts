/**
 * CMS-1500 Claim Form PDF Generator
 *
 * Generates a CMS-1500 (02/12 revision) claim form using jsPDF with
 * coordinate-based text placement. The form is drawn as chrome (boxes, labels)
 * with patient/claim data overlaid at the correct positions.
 *
 * Page dimensions: 8.5" x 11" (letter) = 612 x 792 pt
 * CMS-1500 uses a standardized layout with 33 numbered boxes.
 */

import { jsPDF } from 'jspdf';

// ── Types ──

interface CMS1500Data {
  // Box 1: Insurance type
  insuranceType: 'medicare' | 'medicaid' | 'tricare' | 'champva' | 'group' | 'feca' | 'other';
  // Box 1a: Insured's ID
  insuredId: string;
  // Box 2: Patient name (Last, First, MI)
  patientName: string;
  // Box 3: Patient DOB + Sex
  patientDob: string; // MM/DD/YYYY
  patientSex: 'M' | 'F' | '';
  // Box 4: Insured's name
  insuredName: string;
  // Box 5: Patient address
  patientAddress: string;
  patientCity: string;
  patientState: string;
  patientZip: string;
  patientPhone: string;
  // Box 6: Patient relationship to insured
  patientRelationship: 'self' | 'spouse' | 'child' | 'other';
  // Box 7: Insured's address (when different)
  insuredAddress: string;
  insuredCity: string;
  insuredState: string;
  insuredZip: string;
  insuredPhone: string;
  // Box 9: Other insured's name
  otherInsuredName: string;
  // Box 9a: Other insured's policy/group
  otherInsuredPolicy: string;
  // Box 10: Condition related to
  employmentRelated: boolean;
  autoAccident: boolean;
  autoAccidentState: string;
  otherAccident: boolean;
  // Box 11: Insured's group number
  insuredGroupNumber: string;
  // Box 11a: Insured DOB + Sex
  insuredDob: string;
  insuredSex: 'M' | 'F' | '';
  // Box 11c: Insurance plan/program name
  insurancePlanName: string;
  // Box 11d: Other insurance?
  otherInsurance: boolean;
  // Box 12: Patient signature
  patientSignature: string; // "Signature On File" or date
  patientSignatureDate: string;
  // Box 13: Insured signature
  insuredSignature: string;
  // Box 14: Date of current illness
  dateOfIllness: string;
  dateOfIllnessQualifier: string;
  // Box 17: Referring provider
  referringProvider: string;
  referringProviderQualifier: string;
  // Box 17a: ID number
  referringProviderId: string;
  // Box 17b: NPI
  referringProviderNpi: string;
  // Box 19: Additional claim info
  additionalClaimInfo: string;
  // Box 21: Diagnoses (A-L)
  diagnoses: string[]; // Up to 12 ICD-10 codes
  // Box 22: Resubmission code / original ref
  resubmissionCode: string;
  originalRefNumber: string;
  // Box 23: Prior authorization
  priorAuthNumber: string;
  // Box 24: Service lines (up to 6 per page)
  serviceLines: CMS1500ServiceLine[];
  // Box 25: Federal Tax ID
  federalTaxId: string;
  federalTaxIdType: 'SSN' | 'EIN';
  // Box 26: Patient account number
  patientAccountNumber: string;
  // Box 27: Accept assignment
  acceptAssignment: boolean;
  // Box 28: Total charge
  totalCharge: string;
  // Box 29: Amount paid
  amountPaid: string;
  // Box 31: Signature of physician
  physicianSignature: string;
  physicianSignatureDate: string;
  // Box 32: Service facility
  serviceFacilityName: string;
  serviceFacilityAddress: string;
  serviceFacilityCity: string;
  serviceFacilityState: string;
  serviceFacilityZip: string;
  serviceFacilityNpi: string;
  // Box 33: Billing provider
  billingProviderName: string;
  billingProviderAddress: string;
  billingProviderCity: string;
  billingProviderState: string;
  billingProviderZip: string;
  billingProviderPhone: string;
  billingProviderNpi: string;
}

interface CMS1500ServiceLine {
  // Columns A-J
  dateFrom: string;       // MM/DD/YY
  dateTo: string;         // MM/DD/YY
  placeOfService: string; // 2-digit POS code
  emg: string;            // Emergency indicator
  cptCode: string;
  modifier1: string;
  modifier2: string;
  modifier3: string;
  modifier4: string;
  diagnosisPointers: string; // e.g. "A", "AB", "ABCD"
  charges: string;          // e.g. "150.00"
  units: string;            // e.g. "4"
  renderingNpi: string;
}

// ── Types ── Print Mode & Alignment

export type CMS1500PrintMode = 'full' | 'data-only';

export interface CMS1500Options {
  printMode: CMS1500PrintMode;
  offsetX: number;  // Horizontal offset in points — positive = shift right
  offsetY: number;  // Vertical offset in points — positive = shift down
}

const DEFAULT_OPTIONS: CMS1500Options = {
  printMode: 'full',
  offsetX: 0,
  offsetY: 0,
};

// ── Coordinate Constants ──
// All coordinates in points (72pt = 1 inch) on letter paper (612 x 792)

const FONT_SIZE = 8;
const SMALL_FONT = 6;
const LABEL_FONT = 5;
const PAGE_W = 612;
const PAGE_H = 792;

// Margins for the form
const LEFT = 36;   // 0.5 inch
const RIGHT = 576;  // 8 inch
const TOP = 50;

// ── Offset-aware coordinate helpers (for data-only alignment) ──
function ox(x: number, opts: CMS1500Options): number {
  return x + opts.offsetX;
}
function oy(y: number, opts: CMS1500Options): number {
  return y + opts.offsetY;
}

// ── Color Constants ──
// Pantone 185 Red — official CMS-1500 form chrome color
const RED = { r: 218, g: 41, b: 28 };
const LIGHT_PINK = { r: 252, g: 235, b: 234 };
const BLACK = { r: 0, g: 0, b: 0 };

function setRedChrome(doc: jsPDF) {
  doc.setDrawColor(RED.r, RED.g, RED.b);
  doc.setTextColor(RED.r, RED.g, RED.b);
}

function setBlackData(doc: jsPDF) {
  doc.setDrawColor(BLACK.r, BLACK.g, BLACK.b);
  doc.setTextColor(BLACK.r, BLACK.g, BLACK.b);
}

// ── Data-Only (OCR) Formatting ──
// Medicare OCR requires: Courier regular (not bold), 10pt, ALL CAPS, black only
function setDataOnlyFont(doc: jsPDF): void {
  doc.setFont('Courier', 'normal');
  doc.setFontSize(10);
  doc.setTextColor(0, 0, 0);
}

function uc(val: string | undefined | null): string {
  return (val || '').toUpperCase();
}

// ── NUCC Typewriter Grid Coordinates ──
// CMS-1500 (02/12 revision) designed for 10 CPI (7.2pt/char) × 6 LPI (12pt/line)
// Calibrated from physical CMS-1500 (02/12) measurements — fine-tune per printer using Settings offsets
// All Y values: inches from top of letter paper × 72 pt/inch
// All X values: inches from left edge × 72 pt/inch
const NUCC = {
  // Box 1 — Insurance type checkboxes (top row, ~1.05" from top = 76pt)
  box1_medicare:  { x: 50,  y: 76 },
  box1_medicaid:  { x: 109, y: 76 },
  box1_tricare:   { x: 158, y: 76 },
  box1_champva:   { x: 204, y: 76 },
  box1_group:     { x: 246, y: 76 },
  box1_feca:      { x: 296, y: 76 },
  box1_other:     { x: 345, y: 76 },

  // Box 1a — Insured's ID Number (~1.2" = 86pt)
  box1a: { x: 310, y: 86 },

  // Box 2 — Patient Name (~1.7" = 122pt)
  box2: { x: 18, y: 122 },

  // Box 3 — Patient DOB and Sex (~1.5" = 108pt)
  box3_dob: { x: 310, y: 108 },
  box3_sex_m: { x: 430, y: 108 },
  box3_sex_f: { x: 468, y: 108 },

  // Box 4 — Insured's Name (~1.95" = 140pt)
  box4: { x: 310, y: 140 },

  // Box 5 — Patient's Address (~2.25" street = 162pt, ~2.6" CSZ = 187pt, ~2.85" phone = 205pt)
  box5_street: { x: 18, y: 162 },
  box5_city:   { x: 18, y: 187 },
  box5_state:  { x: 155, y: 187 },
  box5_zip:    { x: 200, y: 187 },
  box5_phone:  { x: 18, y: 205 },

  // Box 6 — Patient Relationship (checkboxes, same row as Box 4, ~1.95" = 140pt)
  box6_self:   { x: 350, y: 140 },
  box6_spouse: { x: 392, y: 140 },
  box6_child:  { x: 432, y: 140 },
  box6_other:  { x: 472, y: 140 },

  // Box 7 — Insured's Address (same rows as Box 5)
  box7_street: { x: 310, y: 162 },
  box7_city:   { x: 310, y: 187 },
  box7_state:  { x: 460, y: 187 },
  box7_zip:    { x: 505, y: 187 },

  // Box 8 — Reserved
  // Box 9 — Other Insured's Name (~3.1" = 223pt)
  box9: { x: 18, y: 223 },
  // Box 9a — Other Insured's Policy or Group Number
  box9a: { x: 18, y: 236 },

  // Box 10 — Condition Related To (~3.55" = 256pt, rows ~14pt apart)
  box10a_yes: { x: 207, y: 256 },
  box10a_no:  { x: 237, y: 256 },
  box10b_yes: { x: 207, y: 270 },
  box10b_no:  { x: 237, y: 270 },
  box10b_state: { x: 256, y: 270 },
  box10c_yes: { x: 207, y: 284 },
  box10c_no:  { x: 237, y: 284 },

  // Box 11 — Insured's Policy Group or FECA Number (~3.1" = 223pt)
  box11: { x: 310, y: 223 },
  // Box 11a — Insured's DOB and Sex (~3.35" = 241pt)
  box11a_dob: { x: 340, y: 241 },
  box11a_sex_m: { x: 476, y: 241 },
  box11a_sex_f: { x: 514, y: 241 },
  // Box 11b — Other Claim ID (~3.55" = 256pt)
  box11b: { x: 310, y: 256 },
  // Box 11c — Insurance Plan Name (~3.75" = 270pt)
  box11c: { x: 310, y: 270 },
  // Box 11d — Is There Another Health Benefit Plan? (~3.95" = 284pt)
  box11d_yes: { x: 376, y: 284 },
  box11d_no:  { x: 416, y: 284 },

  // Box 12 — Patient's or Authorized Person's Signature (~4.55" = 328pt)
  box12:      { x: 18,  y: 328 },
  box12_date: { x: 200, y: 328 },
  // Box 13 — Insured's or Authorized Person's Signature
  box13: { x: 310, y: 328 },

  // Box 14 — Date of Current Illness (~5.3" = 382pt)
  box14:           { x: 18,  y: 382 },
  box14_qualifier: { x: 200, y: 382 },

  // Box 15 — Other Date (qual) (~5.3" = 382pt)
  box15: { x: 310, y: 382 },
  // Box 16 — Dates Patient Unable to Work
  box16_from: { x: 426, y: 382 },
  box16_to:   { x: 506, y: 382 },

  // Box 17 — Name of Referring Provider (~5.6" = 403pt)
  box17: { x: 18, y: 403 },
  // Box 17a — ID Number of Referring Provider (qualifier)
  box17a_qual: { x: 310, y: 403 },
  // Box 17b — NPI (~5.75" = 414pt)
  box17b: { x: 386, y: 414 },

  // Box 18 — Hospitalization Dates
  box18_from: { x: 310, y: 414 },
  box18_to:   { x: 426, y: 414 },

  // Box 19 — Additional Claim Information (~5.95" = 428pt)
  box19: { x: 18, y: 428 },

  // Box 20 — Outside Lab
  box20_yes:    { x: 376, y: 428 },
  box20_no:     { x: 416, y: 428 },
  box20_charges: { x: 476, y: 428 },

  // Box 21 — Diagnosis Codes (ICD indicator + up to 12 codes, ~6.25" = 450pt)
  box21_icd: { x: 18, y: 450 },
  // Diagnosis positions: 4 columns, 3 rows
  // Col 0: x=18, Col 1: x=155, Col 2: x=310, Col 3: x=446
  // Row 0: y=461, Row 1: y=472, Row 2: y=482
  dx_colX: [18, 155, 310, 446] as readonly number[],
  dx_rowY: [461, 472, 482] as readonly number[],

  // Box 22 — Resubmission Code / Original Ref Number (~6.85" = 493pt)
  box22_code: { x: 18,  y: 493 },
  box22_ref:  { x: 100, y: 493 },
  // Box 23 — Prior Authorization Number
  box23: { x: 310, y: 493 },

  // Box 24 — Service Lines (up to 6 per page)
  // Row Y positions: ~7.1" to ~8.35", each row ~18pt apart
  svc_rowY: [511, 529, 547, 565, 583, 601] as readonly number[],
  // Column X positions (per NUCC reference)
  svc_dateFrom:  30,   // A. Date From  (~0.42")
  svc_dateTo:    84,   // A. Date To    (~1.17")
  svc_pos:       150,  // B. POS        (~2.08")
  svc_emg:       170,  // C. EMG        (~2.36")
  svc_cpt:       180,  // D. CPT/HCPCS  (~2.50")
  svc_mod1:      230,  // D. Modifier 1 (~3.19")
  svc_mod2:      250,  // D. Modifier 2 (~3.47")
  svc_mod3:      270,  // D. Modifier 3 (~3.75")
  svc_mod4:      290,  // D. Modifier 4 (~4.03")
  svc_dxPtr:     310,  // E. Dx Pointer (~4.31")
  svc_charges:   330,  // F. Charges    (~4.58")
  svc_units:     400,  // G. Days/Units (~5.56")
  svc_epsdt:     430,  // H. EPSDT      (~5.97")
  svc_idQual:    450,  // I. ID Qual    (~6.25")
  svc_npi:       470,  // J. NPI        (~6.53")

  // Box 25 — Federal Tax ID Number (~8.9" = 641pt)
  box25:     { x: 18,  y: 641 },
  box25_ssn: { x: 155, y: 641 },
  box25_ein: { x: 175, y: 641 },

  // Box 26 — Patient's Account Number (~8.9" = 641pt)
  box26: { x: 200, y: 641 },

  // Box 27 — Accept Assignment (~8.9" = 641pt)
  box27_yes: { x: 386, y: 641 },
  box27_no:  { x: 426, y: 641 },

  // Box 28 — Total Charge (~8.9" = 641pt)
  box28: { x: 476, y: 641 },

  // Box 29 — Amount Paid (~9.05" = 652pt)
  box29: { x: 18, y: 652 },

  // Box 30 — Reserved
  // Box 31 — Signature of Physician (~9.4" = 677pt, date ~9.55" = 688pt)
  box31_sig:  { x: 18,  y: 677 },
  box31_date: { x: 18,  y: 688 },

  // Box 32 — Service Facility (name ~9.4" = 677pt, addr = 688, CSZ = 698, NPI = 709)
  box32_name:    { x: 200, y: 677 },
  box32_addr:    { x: 200, y: 688 },
  box32_csz:     { x: 200, y: 698 },
  box32a_npi:    { x: 200, y: 709 },

  // Box 33 — Billing Provider (phone ~9.25" = 666pt, name = 677, addr = 688, CSZ = 698, NPI = 709)
  box33_phone:   { x: 400, y: 666 },
  box33_name:    { x: 400, y: 677 },
  box33_addr:    { x: 400, y: 688 },
  box33_csz:     { x: 400, y: 698 },
  box33a_npi:    { x: 400, y: 709 },
};

function drawCheckbox(doc: jsPDF, x: number, y: number, size: number = 6) {
  setRedChrome(doc);
  doc.rect(x, y - size + 1, size, size);
}

/**
 * Generate a CMS-1500 PDF
 */
export function generateCMS1500(data: CMS1500Data, options: Partial<CMS1500Options> = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter',
  });

  // Calculate pages needed (6 service lines per page)
  const pages = Math.max(1, Math.ceil(data.serviceLines.length / 6));

  for (let page = 0; page < pages; page++) {
    if (page > 0) doc.addPage();

    // Only draw chrome in full mode
    if (opts.printMode === 'full') {
      drawFormChrome(doc);
    }

    // Place data (with alignment offsets applied)
    placePatientData(doc, data, opts);
    placeInsuranceData(doc, data, opts);
    placeClaimData(doc, data, opts);
    placeDiagnoses(doc, data, opts);
    placeServiceLines(doc, data, page, opts);
    placeTotals(doc, data, opts);
    placeProviderData(doc, data, opts);
  }

  return doc.output('datauristring').split(',')[1]; // base64
}

/**
 * Render a single CMS-1500 form onto an existing jsPDF document.
 * Used by bulk generation to compose multi-client combined PDFs.
 */
export function renderCMS1500Pages(doc: jsPDF, data: CMS1500Data, options: Partial<CMS1500Options> = {}): void {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const pages = Math.max(1, Math.ceil(data.serviceLines.length / 6));

  for (let page = 0; page < pages; page++) {
    if (opts.printMode === 'full') {
      drawFormChrome(doc);
    }
    placePatientData(doc, data, opts);
    placeInsuranceData(doc, data, opts);
    placeClaimData(doc, data, opts);
    placeDiagnoses(doc, data, opts);
    placeServiceLines(doc, data, page, opts);
    placeTotals(doc, data, opts);
    placeProviderData(doc, data, opts);

    // Add page break between multi-page service lines for this client
    if (page < pages - 1) {
      doc.addPage();
    }
  }
}

// ── Form Chrome Drawing ──

function drawFormChrome(doc: jsPDF) {
  setRedChrome(doc);
  doc.setLineWidth(0.5);

  const midX = (LEFT + RIGHT) / 2;

  // ── Title ──
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(10);
  doc.text('HEALTH INSURANCE CLAIM FORM', PAGE_W / 2, TOP - 10, { align: 'center' });
  doc.setFontSize(LABEL_FONT);
  doc.setFont('Helvetica', 'normal');
  doc.text('APPROVED BY NATIONAL UNIFORM CLAIM COMMITTEE (NUCC) 02/12', PAGE_W / 2, TOP - 2, { align: 'center' });

  // ── Shaded section bands (drawn first so lines & text render on top) ──
  doc.setFillColor(LIGHT_PINK.r, LIGHT_PINK.g, LIGHT_PINK.b);
  // Band above Box 9/11 section
  doc.rect(LEFT, TOP + 140, RIGHT - LEFT, 10, 'F');
  // Band above Box 12/13 signatures
  doc.rect(LEFT, TOP + 224, RIGHT - LEFT, 10, 'F');
  // Service line header band
  doc.rect(LEFT, TOP + 380, RIGHT - LEFT, 20, 'F');
  // Alternating shaded sub-rows within service lines (supplemental info rows)
  for (let i = 0; i < 6; i++) {
    const subRowY = TOP + 411 + i * 22;
    doc.rect(LEFT, subRowY, RIGHT - LEFT, 11, 'F');
  }
  // Bottom totals band
  doc.rect(LEFT, TOP + 554, RIGHT - LEFT, 10, 'F');

  // ── Main border & horizontal dividers ──
  setRedChrome(doc);
  doc.setLineWidth(1.0);
  doc.rect(LEFT, TOP, RIGHT - LEFT, 700);
  doc.setLineWidth(0.5);

  const hLines = [
    TOP + 28,    // Below Box 1-1a row
    TOP + 56,    // Below Box 2-3 row
    TOP + 84,    // Below Box 5 address row
    TOP + 112,   // Below Box 5 city/state row
    TOP + 140,   // Below Box 9/11 header band
    TOP + 168,   // Below Box 10 row
    TOP + 196,   // Below Box 11 row
    TOP + 224,   // Below Box 11d row / signature band
    TOP + 252,   // Below Box 12-13 row
    TOP + 280,   // Below Box 14-16 row
    TOP + 308,   // Below Box 17 row
    TOP + 336,   // Below Box 19 row
    TOP + 380,   // Below Box 21 diagnoses / service header band
    TOP + 400,   // Below service line header
    // 6 service line rows, each 22pt
    TOP + 422,
    TOP + 444,
    TOP + 466,
    TOP + 488,
    TOP + 510,
    TOP + 532,
    TOP + 554,   // Below last service line
    TOP + 582,   // Below Box 25-28
    TOP + 610,   // Below Box 29-30
    TOP + 660,   // Below Box 31-33
    TOP + 700,   // Bottom
  ];

  for (const y of hLines) {
    doc.line(LEFT, y, RIGHT, y);
  }

  // ── Vertical dividers ──
  // Center line for patient/insurance top section
  doc.line(midX, TOP, midX, TOP + 252);
  // Center divider for middle section rows
  doc.line(midX, TOP + 252, midX, TOP + 336);
  // Vertical dividers in diagnosis row area
  doc.line(midX, TOP + 336, midX, TOP + 380);
  // Vertical dividers in totals area
  doc.line(LEFT + 192, TOP + 554, LEFT + 192, TOP + 582);  // Between Box 25 and 26
  doc.line(LEFT + 330, TOP + 554, LEFT + 330, TOP + 582);  // Between Box 26 and 27
  doc.line(RIGHT - 130, TOP + 554, RIGHT - 130, TOP + 610); // Between Box 27/29 and 28/30
  doc.line(LEFT + 192, TOP + 582, LEFT + 192, TOP + 610);  // Between Box 29 and 30
  // Vertical dividers in provider section
  doc.line(LEFT + 192, TOP + 610, LEFT + 192, TOP + 700);  // Between Box 31 and 32
  doc.line(RIGHT - 180, TOP + 610, RIGHT - 180, TOP + 700); // Between Box 32 and 33

  // ── Box Numbers & Labels ──
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(LABEL_FONT);

  // Helper to draw box number + label on same line
  const boxLabel = (num: string, label: string, x: number, y: number) => {
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(LABEL_FONT);
    doc.text(num, x, y);
    doc.setFont('Helvetica', 'normal');
    doc.text(label, x + doc.getTextWidth(num) + 2, y);
  };

  // Row 1: Box 1 (Insurance type) + Box 1a (Insured ID)
  boxLabel('1.', 'MEDICARE   MEDICAID   TRICARE   CHAMPVA   GROUP   FECA   OTHER', LEFT + 4, TOP + 9);
  // Checkbox outlines for insurance types
  const insTypeX = [LEFT + 50, LEFT + 90, LEFT + 130, LEFT + 170, LEFT + 206, LEFT + 236, LEFT + 260];
  for (const cx of insTypeX) {
    drawCheckbox(doc, cx, TOP + 20, 6);
  }
  setRedChrome(doc);
  boxLabel('1a.', "INSURED'S I.D. NUMBER (For Program in Item 1)", midX + 4, TOP + 9);

  // Row 2: Box 2 (Patient name) + Box 3 (DOB/Sex)
  boxLabel('2.', "PATIENT'S NAME (Last Name, First Name, Middle Initial)", LEFT + 4, TOP + 37);
  boxLabel('3.', "PATIENT'S BIRTH DATE", midX + 4, TOP + 37);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(LABEL_FONT);
  doc.text('MM  DD  YY', midX + 60, TOP + 47);
  doc.text('SEX', midX + 165, TOP + 37);
  doc.text('M', midX + 162, TOP + 45);
  doc.text('F', midX + 190, TOP + 45);
  drawCheckbox(doc, midX + 160, TOP + 54, 6);
  drawCheckbox(doc, midX + 188, TOP + 54, 6);
  setRedChrome(doc);

  // Row 3: Box 4 (Insured name) + Box 6 (Relationship)
  boxLabel('4.', "INSURED'S NAME (Last Name, First Name, Middle Initial)", LEFT + 4, TOP + 65);
  boxLabel('6.', 'PATIENT RELATIONSHIP TO INSURED', midX + 4, TOP + 65);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(LABEL_FONT);
  // Labels above checkboxes
  doc.text('Self', midX + 10, TOP + 73);
  doc.text('Spouse', midX + 48, TOP + 73);
  doc.text('Child', midX + 88, TOP + 73);
  doc.text('Other', midX + 128, TOP + 73);
  // Checkboxes below labels — box interior spans TOP+75 to TOP+81
  drawCheckbox(doc, midX + 10, TOP + 82, 6);
  drawCheckbox(doc, midX + 52, TOP + 82, 6);
  drawCheckbox(doc, midX + 92, TOP + 82, 6);
  drawCheckbox(doc, midX + 132, TOP + 82, 6);
  setRedChrome(doc);

  // Row 4: Box 5 (Patient address) + Box 7 (Insured address)
  boxLabel('5.', "PATIENT'S ADDRESS (No., Street)", LEFT + 4, TOP + 93);
  boxLabel('7.', "INSURED'S ADDRESS (No., Street)", midX + 4, TOP + 93);

  // Row 5: City/State/Zip sub-row labels
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(LABEL_FONT);
  doc.text('CITY', LEFT + 4, TOP + 115);
  doc.text('STATE', LEFT + 140, TOP + 115);
  doc.text('ZIP CODE', LEFT + 180, TOP + 115);
  doc.text('TELEPHONE (Include Area Code)', LEFT + 4, TOP + 135);
  doc.text('CITY', midX + 4, TOP + 115);
  doc.text('STATE', midX + 140, TOP + 115);
  doc.text('ZIP CODE', midX + 180, TOP + 115);

  // Row 6: Box 9 (Other insured) + Box 11 (Insured policy)
  boxLabel('9.', "OTHER INSURED'S NAME (Last Name, First Name, Middle Initial)", LEFT + 4, TOP + 149);
  boxLabel('11.', "INSURED'S POLICY GROUP OR FECA NUMBER", midX + 4, TOP + 149);

  // Row 7: Box 10 (Condition) + sub-labels
  boxLabel('10.', "IS PATIENT'S CONDITION RELATED TO:", LEFT + 4, TOP + 175);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(LABEL_FONT);
  // Employment row — label left, YES/NO labels above checkboxes
  doc.text('a. EMPLOYMENT? (Current or Previous)', LEFT + 14, TOP + 183);
  doc.text('YES', LEFT + 172, TOP + 183);
  doc.text('NO', LEFT + 202, TOP + 183);
  drawCheckbox(doc, LEFT + 170, TOP + 192, 6);
  drawCheckbox(doc, LEFT + 200, TOP + 192, 6);
  setRedChrome(doc);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(LABEL_FONT);
  // Auto accident row
  doc.text('b. AUTO ACCIDENT?', LEFT + 14, TOP + 191);
  doc.text('PLACE (State)', LEFT + 100, TOP + 191);
  doc.text('YES', LEFT + 172, TOP + 191);
  doc.text('NO', LEFT + 202, TOP + 191);
  drawCheckbox(doc, LEFT + 170, TOP + 200, 6);
  drawCheckbox(doc, LEFT + 200, TOP + 200, 6);
  setRedChrome(doc);

  // Box 11a/11b/11c labels — spaced to fit data between label rows
  boxLabel('11a.', "INSURED'S DATE OF BIRTH    SEX", midX + 4, TOP + 172);
  boxLabel('11b.', "OTHER CLAIM ID (Designated by NUCC)", midX + 4, TOP + 185);
  boxLabel('11c.', "INSURANCE PLAN NAME OR PROGRAM NAME", midX + 4, TOP + 198);

  // Row 8: Box 11d
  boxLabel('11d.', 'IS THERE ANOTHER HEALTH BENEFIT PLAN?', midX + 4, TOP + 210);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(LABEL_FONT);
  doc.text('YES', midX + 172, TOP + 213);
  doc.text('NO', midX + 202, TOP + 213);
  drawCheckbox(doc, midX + 170, TOP + 222, 6);
  drawCheckbox(doc, midX + 200, TOP + 222, 6);
  setRedChrome(doc);

  // Row 9: Box 12 + Box 13 (Signatures)
  boxLabel('12.', "PATIENT'S OR AUTHORIZED PERSON'S SIGNATURE", LEFT + 4, TOP + 229);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(LABEL_FONT - 1);
  doc.text('I authorize the release of any medical or other information necessary', LEFT + 14, TOP + 235);
  doc.text('to process this claim. I also request payment of government benefits', LEFT + 14, TOP + 240);
  doc.setFontSize(LABEL_FONT);
  boxLabel('13.', "INSURED'S OR AUTHORIZED PERSON'S SIGNATURE", midX + 4, TOP + 229);

  // ── Middle Section (Boxes 14–23) ──

  // Row 10: Box 14 + Box 15/16
  boxLabel('14.', 'DATE OF CURRENT ILLNESS, INJURY, or PREGNANCY (LMP)', LEFT + 4, TOP + 261);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(LABEL_FONT);
  doc.text('QUAL.', LEFT + 200, TOP + 271);
  boxLabel('15.', 'OTHER DATE', midX + 4, TOP + 261);
  boxLabel('16.', 'DATES PATIENT UNABLE TO WORK IN CURRENT OCCUPATION', midX + 120, TOP + 261);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(LABEL_FONT);
  doc.text('FROM                      TO', midX + 120, TOP + 274);

  // Row 11: Box 17 + 17a/17b
  boxLabel('17.', 'NAME OF REFERRING PROVIDER OR OTHER SOURCE', LEFT + 4, TOP + 289);
  boxLabel('17a.', '', midX + 4, TOP + 289);
  boxLabel('17b.', 'NPI', midX + 80, TOP + 289);

  // Row 12: Box 18 (left top) + 19 (left bottom) + 20 (right)
  boxLabel('18.', 'HOSPITALIZATION DATES RELATED TO CURRENT SERVICES', LEFT + 4, TOP + 312);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(LABEL_FONT);
  doc.text('FROM                      TO', LEFT + 14, TOP + 320);

  boxLabel('19.', 'ADDITIONAL CLAIM INFORMATION (Designated by NUCC)', LEFT + 4, TOP + 328);
  boxLabel('20.', 'OUTSIDE LAB?    $ CHARGES', midX + 4, TOP + 312);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(LABEL_FONT);
  doc.text('YES', midX + 72, TOP + 322);
  doc.text('NO', midX + 102, TOP + 322);
  drawCheckbox(doc, midX + 70, TOP + 331, 6);
  drawCheckbox(doc, midX + 100, TOP + 331, 6);
  setRedChrome(doc);

  // Box 21: Diagnoses
  boxLabel('21.', 'DIAGNOSIS OR NATURE OF ILLNESS OR INJURY', LEFT + 4, TOP + 345);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(LABEL_FONT);
  doc.text('Relate A-L to service line below (24E)', LEFT + 170, TOP + 345);
  doc.text('ICD Ind.', RIGHT - 60, TOP + 345);

  // Diagnosis slot labels (A-L in 4 columns x 3 rows)
  const dxLabelStartX = LEFT + 8;
  const dxLabelStartY = TOP + 358;
  const dxColWidth = 130;
  const dxRowHeight = 10;
  for (let i = 0; i < 12; i++) {
    const col = Math.floor(i / 3);
    const row = i % 3;
    const letter = String.fromCharCode(65 + i);
    const x = dxLabelStartX + col * dxColWidth;
    const y = dxLabelStartY + row * dxRowHeight;
    doc.setFont('Helvetica', 'bold');
    doc.setFontSize(LABEL_FONT);
    doc.text(`${letter}.`, x, y);
  }

  // Box 22-23
  boxLabel('22.', 'RESUBMISSION CODE', LEFT + 4, TOP + 365);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(LABEL_FONT);
  doc.text('ORIGINAL REF. NO.', LEFT + 100, TOP + 365);
  boxLabel('23.', 'PRIOR AUTHORIZATION NUMBER', midX + 4, TOP + 365);

  // ── Service Line Header (Box 24) ──
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(LABEL_FONT);
  const slHeaderY = TOP + 388;
  doc.text('24.', LEFT + 4, slHeaderY);

  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(LABEL_FONT - 1);
  // Column headers across the shaded band
  doc.text('A. DATE(S) OF SERVICE', LEFT + 18, slHeaderY);
  doc.text('FROM        TO', LEFT + 18, slHeaderY + 7);
  doc.text('B.', LEFT + 110, slHeaderY);
  doc.text('PLACE OF', LEFT + 104, slHeaderY + 4);
  doc.text('SERVICE', LEFT + 106, slHeaderY + 8);
  doc.text('C.', LEFT + 132, slHeaderY);
  doc.text('EMG', LEFT + 128, slHeaderY + 6);
  doc.text('D. PROCEDURES, SERVICES, OR SUPPLIES', LEFT + 148, slHeaderY);
  doc.text('CPT/HCPCS          MODIFIER', LEFT + 152, slHeaderY + 7);
  doc.text('E.', LEFT + 290, slHeaderY);
  doc.text('DIAGNOSIS', LEFT + 282, slHeaderY + 4);
  doc.text('POINTER', LEFT + 284, slHeaderY + 8);
  doc.text('F.', LEFT + 320, slHeaderY);
  doc.text('$ CHARGES', LEFT + 314, slHeaderY + 6);
  doc.text('G.', LEFT + 378, slHeaderY);
  doc.text('DAYS OR', LEFT + 372, slHeaderY + 4);
  doc.text('UNITS', LEFT + 376, slHeaderY + 8);
  doc.text('H.', LEFT + 408, slHeaderY);
  doc.text('EPSDT', LEFT + 404, slHeaderY + 6);
  doc.text('J.', LEFT + 432, slHeaderY);
  doc.text('RENDERING', LEFT + 424, slHeaderY + 4);
  doc.text('PROVIDER ID. #', LEFT + 422, slHeaderY + 8);

  // Service line row numbers (1-6)
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(LABEL_FONT);
  for (let i = 0; i < 6; i++) {
    const rowY = TOP + 408 + i * 22;
    doc.text(String(i + 1), LEFT + 2, rowY);
  }

  // ── Bottom Section (Boxes 25–33) ──
  doc.setFont('Helvetica', 'bold');
  doc.setFontSize(LABEL_FONT);

  boxLabel('25.', 'FEDERAL TAX I.D. NUMBER', LEFT + 4, TOP + 562);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(LABEL_FONT);
  doc.text('SSN', LEFT + 132, TOP + 571);
  doc.text('EIN', LEFT + 155, TOP + 571);
  drawCheckbox(doc, LEFT + 130, TOP + 580, 6);
  drawCheckbox(doc, LEFT + 153, TOP + 580, 6);
  setRedChrome(doc);

  boxLabel('26.', "PATIENT'S ACCOUNT NO.", LEFT + 200, TOP + 562);
  boxLabel('27.', 'ACCEPT ASSIGNMENT?', LEFT + 338, TOP + 562);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(LABEL_FONT);
  // Labels above, checkboxes below
  doc.text('YES', LEFT + 350, TOP + 571);
  doc.text('NO', LEFT + 382, TOP + 571);
  drawCheckbox(doc, LEFT + 348, TOP + 580, 6);
  drawCheckbox(doc, LEFT + 380, TOP + 580, 6);
  setRedChrome(doc);

  boxLabel('28.', 'TOTAL CHARGE', RIGHT - 120, TOP + 562);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(LABEL_FONT);
  doc.text('$', RIGHT - 120, TOP + 574);

  boxLabel('29.', 'AMOUNT PAID', LEFT + 4, TOP + 590);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(LABEL_FONT);
  doc.text('$', LEFT + 4, TOP + 604);

  boxLabel('30.', 'Rsvd for NUCC Use', LEFT + 200, TOP + 590);

  // Provider section
  boxLabel('31.', 'SIGNATURE OF PHYSICIAN OR SUPPLIER', LEFT + 4, TOP + 620);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(LABEL_FONT - 1);
  doc.text('INCLUDING DEGREES OR CREDENTIALS', LEFT + 14, TOP + 628);
  doc.text('(I certify that the statements on the reverse', LEFT + 14, TOP + 634);
  doc.text('apply to this bill and are made a part thereof.)', LEFT + 14, TOP + 640);

  boxLabel('32.', 'SERVICE FACILITY LOCATION INFORMATION', LEFT + 200, TOP + 620);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(LABEL_FONT);
  doc.text('a. NPI', LEFT + 200, TOP + 664);
  doc.text('b.', LEFT + 270, TOP + 664);

  boxLabel('33.', 'BILLING PROVIDER INFO & PH #', RIGHT - 172, TOP + 620);
  doc.setFont('Helvetica', 'normal');
  doc.setFontSize(LABEL_FONT);
  doc.text('a. NPI', RIGHT - 172, TOP + 674);
  doc.text('b.', RIGHT - 110, TOP + 674);
}

// ── Data Placement Functions ──

function placePatientData(doc: jsPDF, data: CMS1500Data, opts: CMS1500Options) {
  if (opts.printMode === 'data-only') {
    setDataOnlyFont(doc);
    // Box 1: Insurance type
    const insType = (data.insuranceType || '').toLowerCase();
    if (insType === 'medicare')  doc.text('X', ox(NUCC.box1_medicare.x, opts), oy(NUCC.box1_medicare.y, opts));
    if (insType === 'medicaid')  doc.text('X', ox(NUCC.box1_medicaid.x, opts), oy(NUCC.box1_medicaid.y, opts));
    if (insType === 'tricare')   doc.text('X', ox(NUCC.box1_tricare.x, opts), oy(NUCC.box1_tricare.y, opts));
    if (insType === 'champva')   doc.text('X', ox(NUCC.box1_champva.x, opts), oy(NUCC.box1_champva.y, opts));
    if (insType === 'group')     doc.text('X', ox(NUCC.box1_group.x, opts), oy(NUCC.box1_group.y, opts));
    if (insType === 'feca')      doc.text('X', ox(NUCC.box1_feca.x, opts), oy(NUCC.box1_feca.y, opts));
    if (insType === 'other')     doc.text('X', ox(NUCC.box1_other.x, opts), oy(NUCC.box1_other.y, opts));
    // Box 1a: Insured ID
    if (data.insuredId) doc.text(uc(data.insuredId), ox(NUCC.box1a.x, opts), oy(NUCC.box1a.y, opts));
    // Box 2: Patient name
    if (data.patientName) doc.text(uc(data.patientName), ox(NUCC.box2.x, opts), oy(NUCC.box2.y, opts));
    // Box 3: DOB + Sex
    if (data.patientDob) doc.text(uc(data.patientDob), ox(NUCC.box3_dob.x, opts), oy(NUCC.box3_dob.y, opts));
    if (data.patientSex === 'M') doc.text('X', ox(NUCC.box3_sex_m.x, opts), oy(NUCC.box3_sex_m.y, opts));
    if (data.patientSex === 'F') doc.text('X', ox(NUCC.box3_sex_f.x, opts), oy(NUCC.box3_sex_f.y, opts));
    // Box 4: Insured name
    if (data.insuredName) doc.text(uc(data.insuredName), ox(NUCC.box4.x, opts), oy(NUCC.box4.y, opts));
    // Box 5: Patient address
    if (data.patientAddress) doc.text(uc(data.patientAddress), ox(NUCC.box5_street.x, opts), oy(NUCC.box5_street.y, opts));
    if (data.patientCity) doc.text(uc(data.patientCity), ox(NUCC.box5_city.x, opts), oy(NUCC.box5_city.y, opts));
    if (data.patientState) doc.text(uc(data.patientState), ox(NUCC.box5_state.x, opts), oy(NUCC.box5_state.y, opts));
    if (data.patientZip) doc.text(uc(data.patientZip), ox(NUCC.box5_zip.x, opts), oy(NUCC.box5_zip.y, opts));
    if (data.patientPhone) doc.text(uc(data.patientPhone), ox(NUCC.box5_phone.x, opts), oy(NUCC.box5_phone.y, opts));
    // Box 6: Relationship
    if (data.patientRelationship === 'self')   doc.text('X', ox(NUCC.box6_self.x, opts), oy(NUCC.box6_self.y, opts));
    if (data.patientRelationship === 'spouse') doc.text('X', ox(NUCC.box6_spouse.x, opts), oy(NUCC.box6_spouse.y, opts));
    if (data.patientRelationship === 'child')  doc.text('X', ox(NUCC.box6_child.x, opts), oy(NUCC.box6_child.y, opts));
    if (data.patientRelationship === 'other')  doc.text('X', ox(NUCC.box6_other.x, opts), oy(NUCC.box6_other.y, opts));
    // Box 7: Insured address
    if (data.insuredAddress) doc.text(uc(data.insuredAddress), ox(NUCC.box7_street.x, opts), oy(NUCC.box7_street.y, opts));
    if (data.insuredCity) doc.text(uc(data.insuredCity), ox(NUCC.box7_city.x, opts), oy(NUCC.box7_city.y, opts));
    if (data.insuredState) doc.text(uc(data.insuredState), ox(NUCC.box7_state.x, opts), oy(NUCC.box7_state.y, opts));
    if (data.insuredZip) doc.text(uc(data.insuredZip), ox(NUCC.box7_zip.x, opts), oy(NUCC.box7_zip.y, opts));
    return;
  }

  // ── Full-chrome mode — data positions derived from NUCC coordinates ──
  setBlackData(doc);
  doc.setFont('Courier', 'bold');
  doc.setFontSize(FONT_SIZE);

  // Box 1a: Insured ID
  doc.text(data.insuredId, ox(NUCC.box1a.x, opts), oy(NUCC.box1a.y, opts));

  // Box 2: Patient name
  doc.text(data.patientName, ox(NUCC.box2.x, opts), oy(NUCC.box2.y, opts));

  // Box 3: DOB + Sex
  doc.text(data.patientDob, ox(NUCC.box3_dob.x, opts), oy(NUCC.box3_dob.y, opts));
  if (data.patientSex === 'M') doc.text('X', ox(NUCC.box3_sex_m.x, opts), oy(NUCC.box3_sex_m.y, opts));
  if (data.patientSex === 'F') doc.text('X', ox(NUCC.box3_sex_f.x, opts), oy(NUCC.box3_sex_f.y, opts));

  // Box 4: Insured name
  doc.text(data.insuredName, ox(NUCC.box4.x, opts), oy(NUCC.box4.y, opts));

  // Box 5: Patient address
  doc.text(data.patientAddress, ox(NUCC.box5_street.x, opts), oy(NUCC.box5_street.y, opts));
  doc.text(data.patientCity, ox(NUCC.box5_city.x, opts), oy(NUCC.box5_city.y, opts));
  doc.text(data.patientState, ox(NUCC.box5_state.x, opts), oy(NUCC.box5_state.y, opts));
  doc.text(data.patientZip, ox(NUCC.box5_zip.x, opts), oy(NUCC.box5_zip.y, opts));
  doc.text(data.patientPhone, ox(NUCC.box5_phone.x, opts), oy(NUCC.box5_phone.y, opts));

  // Box 6: Relationship
  if (data.patientRelationship === 'self') doc.text('X', ox(NUCC.box6_self.x, opts), oy(NUCC.box6_self.y, opts));
  if (data.patientRelationship === 'spouse') doc.text('X', ox(NUCC.box6_spouse.x, opts), oy(NUCC.box6_spouse.y, opts));
  if (data.patientRelationship === 'child') doc.text('X', ox(NUCC.box6_child.x, opts), oy(NUCC.box6_child.y, opts));
  if (data.patientRelationship === 'other') doc.text('X', ox(NUCC.box6_other.x, opts), oy(NUCC.box6_other.y, opts));

  // Box 7: Insured address
  doc.text(data.insuredAddress, ox(NUCC.box7_street.x, opts), oy(NUCC.box7_street.y, opts));
  doc.text(data.insuredCity, ox(NUCC.box7_city.x, opts), oy(NUCC.box7_city.y, opts));
  doc.text(data.insuredState, ox(NUCC.box7_state.x, opts), oy(NUCC.box7_state.y, opts));
  doc.text(data.insuredZip, ox(NUCC.box7_zip.x, opts), oy(NUCC.box7_zip.y, opts));
}

function placeInsuranceData(doc: jsPDF, data: CMS1500Data, opts: CMS1500Options) {
  if (opts.printMode === 'data-only') {
    setDataOnlyFont(doc);
    // Box 9: Other insured name
    if (data.otherInsuredName) doc.text(uc(data.otherInsuredName), ox(NUCC.box9.x, opts), oy(NUCC.box9.y, opts));
    // Box 9a: Other insured policy
    if ((data as any).otherInsuredPolicy) doc.text(uc((data as any).otherInsuredPolicy), ox(NUCC.box9a.x, opts), oy(NUCC.box9a.y, opts));
    // Box 10a: Employment related
    if (data.employmentRelated) doc.text('X', ox(NUCC.box10a_yes.x, opts), oy(NUCC.box10a_yes.y, opts));
    else doc.text('X', ox(NUCC.box10a_no.x, opts), oy(NUCC.box10a_no.y, opts));
    // Box 10b: Auto accident
    if (data.autoAccident) {
      doc.text('X', ox(NUCC.box10b_yes.x, opts), oy(NUCC.box10b_yes.y, opts));
      if (data.autoAccidentState) doc.text(uc(data.autoAccidentState), ox(NUCC.box10b_state.x, opts), oy(NUCC.box10b_state.y, opts));
    } else {
      doc.text('X', ox(NUCC.box10b_no.x, opts), oy(NUCC.box10b_no.y, opts));
    }
    // Box 10c: Other accident
    if ((data as any).otherAccident) doc.text('X', ox(NUCC.box10c_yes.x, opts), oy(NUCC.box10c_yes.y, opts));
    else doc.text('X', ox(NUCC.box10c_no.x, opts), oy(NUCC.box10c_no.y, opts));
    // Box 11: Insured group number
    if (data.insuredGroupNumber) doc.text(uc(data.insuredGroupNumber), ox(NUCC.box11.x, opts), oy(NUCC.box11.y, opts));
    // Box 11a: Insured DOB + Sex
    if (data.insuredDob) doc.text(uc(data.insuredDob), ox(NUCC.box11a_dob.x, opts), oy(NUCC.box11a_dob.y, opts));
    if ((data as any).insuredSex === 'M') doc.text('X', ox(NUCC.box11a_sex_m.x, opts), oy(NUCC.box11a_sex_m.y, opts));
    if ((data as any).insuredSex === 'F') doc.text('X', ox(NUCC.box11a_sex_f.x, opts), oy(NUCC.box11a_sex_f.y, opts));
    // Box 11b: Other claim ID
    if ((data as any).otherClaimId) doc.text(uc((data as any).otherClaimId), ox(NUCC.box11b.x, opts), oy(NUCC.box11b.y, opts));
    // Box 11c: Plan name
    if (data.insurancePlanName) doc.text(uc(data.insurancePlanName), ox(NUCC.box11c.x, opts), oy(NUCC.box11c.y, opts));
    // Box 11d: Is there another health benefit plan?
    if ((data as any).otherHealthPlan === true) doc.text('X', ox(NUCC.box11d_yes.x, opts), oy(NUCC.box11d_yes.y, opts));
    else if ((data as any).otherHealthPlan === false) doc.text('X', ox(NUCC.box11d_no.x, opts), oy(NUCC.box11d_no.y, opts));
    // Box 12: Patient signature
    if (data.patientSignature) doc.text(uc(data.patientSignature), ox(NUCC.box12.x, opts), oy(NUCC.box12.y, opts));
    if (data.patientSignatureDate) doc.text(uc(data.patientSignatureDate), ox(NUCC.box12_date.x, opts), oy(NUCC.box12_date.y, opts));
    // Box 13: Insured signature
    if (data.insuredSignature) doc.text(uc(data.insuredSignature), ox(NUCC.box13.x, opts), oy(NUCC.box13.y, opts));
    return;
  }

  // ── Full-chrome mode — data positions derived from NUCC coordinates ──
  setBlackData(doc);
  doc.setFont('Courier', 'bold');
  doc.setFontSize(FONT_SIZE);

  // Box 9: Other insured name
  doc.text(data.otherInsuredName, ox(NUCC.box9.x, opts), oy(NUCC.box9.y, opts));

  // Box 10: Condition related
  if (data.employmentRelated) doc.text('X', ox(NUCC.box10a_yes.x, opts), oy(NUCC.box10a_yes.y, opts));
  else doc.text('X', ox(NUCC.box10a_no.x, opts), oy(NUCC.box10a_no.y, opts));
  if (data.autoAccident) {
    doc.text('X', ox(NUCC.box10b_yes.x, opts), oy(NUCC.box10b_yes.y, opts));
    if (data.autoAccidentState) doc.text(data.autoAccidentState, ox(NUCC.box10b_state.x, opts), oy(NUCC.box10b_state.y, opts));
  } else {
    doc.text('X', ox(NUCC.box10b_no.x, opts), oy(NUCC.box10b_no.y, opts));
  }

  // Box 11: Insured group
  doc.text(data.insuredGroupNumber, ox(NUCC.box11.x, opts), oy(NUCC.box11.y, opts));

  // Box 11a: Insured DOB/Sex
  if (data.insuredDob) doc.text(data.insuredDob, ox(NUCC.box11a_dob.x, opts), oy(NUCC.box11a_dob.y, opts));

  // Box 11c: Plan name
  doc.text(data.insurancePlanName, ox(NUCC.box11c.x, opts), oy(NUCC.box11c.y, opts));

  // Box 12: Patient signature
  doc.setFontSize(7);
  doc.text(data.patientSignature, ox(NUCC.box12.x + 50, opts), oy(NUCC.box12.y, opts));
  if (data.patientSignatureDate) doc.text(data.patientSignatureDate, ox(NUCC.box12_date.x, opts), oy(NUCC.box12_date.y, opts));
  doc.setFontSize(FONT_SIZE);

  // Box 13: Insured signature
  doc.setFontSize(7);
  doc.text(data.insuredSignature, ox(NUCC.box13.x + 50, opts), oy(NUCC.box13.y, opts));
  doc.setFontSize(FONT_SIZE);
}

function placeClaimData(doc: jsPDF, data: CMS1500Data, opts: CMS1500Options) {
  if (opts.printMode === 'data-only') {
    setDataOnlyFont(doc);
    // Box 14: Date of illness
    if (data.dateOfIllness) doc.text(uc(data.dateOfIllness), ox(NUCC.box14.x, opts), oy(NUCC.box14.y, opts));
    if (data.dateOfIllnessQualifier) doc.text(uc(data.dateOfIllnessQualifier), ox(NUCC.box14_qualifier.x, opts), oy(NUCC.box14_qualifier.y, opts));
    // Box 17: Referring provider
    if (data.referringProvider) doc.text(uc(data.referringProvider), ox(NUCC.box17.x, opts), oy(NUCC.box17.y, opts));
    if (data.referringProviderQualifier) doc.text(uc(data.referringProviderQualifier), ox(NUCC.box17a_qual.x, opts), oy(NUCC.box17a_qual.y, opts));
    if (data.referringProviderNpi) doc.text(uc(data.referringProviderNpi), ox(NUCC.box17b.x, opts), oy(NUCC.box17b.y, opts));
    // Box 19: Additional claim info
    if (data.additionalClaimInfo) doc.text(uc(data.additionalClaimInfo).slice(0, 80), ox(NUCC.box19.x, opts), oy(NUCC.box19.y, opts));
    // Box 22: Resubmission
    if (data.resubmissionCode) doc.text(uc(data.resubmissionCode), ox(NUCC.box22_code.x, opts), oy(NUCC.box22_code.y, opts));
    if (data.originalRefNumber) doc.text(uc(data.originalRefNumber), ox(NUCC.box22_ref.x, opts), oy(NUCC.box22_ref.y, opts));
    // Box 23: Prior auth
    if (data.priorAuthNumber) doc.text(uc(data.priorAuthNumber), ox(NUCC.box23.x, opts), oy(NUCC.box23.y, opts));
    return;
  }

  // ── Full-chrome mode — data positions derived from NUCC coordinates ──
  setBlackData(doc);
  doc.setFont('Courier', 'bold');
  doc.setFontSize(FONT_SIZE);

  // Box 14: Date of illness
  if (data.dateOfIllness) {
    doc.text(data.dateOfIllness, ox(NUCC.box14.x, opts), oy(NUCC.box14.y, opts));
  }
  if (data.dateOfIllnessQualifier) {
    doc.setFontSize(SMALL_FONT);
    doc.text(data.dateOfIllnessQualifier, ox(NUCC.box14_qualifier.x, opts), oy(NUCC.box14_qualifier.y, opts));
    doc.setFontSize(FONT_SIZE);
  }

  // Box 17: Referring provider
  if (data.referringProvider) {
    doc.text(data.referringProvider, ox(NUCC.box17.x, opts), oy(NUCC.box17.y, opts));
  }
  if (data.referringProviderQualifier) {
    doc.text(data.referringProviderQualifier, ox(NUCC.box17a_qual.x, opts), oy(NUCC.box17a_qual.y, opts));
  }
  if (data.referringProviderNpi) {
    doc.text(data.referringProviderNpi, ox(NUCC.box17b.x, opts), oy(NUCC.box17b.y, opts));
  }

  // Box 19: Additional claim info
  if (data.additionalClaimInfo) {
    doc.setFontSize(6);
    doc.text(data.additionalClaimInfo.slice(0, 80), ox(NUCC.box19.x, opts), oy(NUCC.box19.y, opts));
    doc.setFontSize(FONT_SIZE);
  }

  // Box 22: Resubmission code
  if (data.resubmissionCode) doc.text(data.resubmissionCode, ox(NUCC.box22_code.x, opts), oy(NUCC.box22_code.y, opts));
  if (data.originalRefNumber) doc.text(data.originalRefNumber, ox(NUCC.box22_ref.x, opts), oy(NUCC.box22_ref.y, opts));

  // Box 23: Prior auth
  doc.text(data.priorAuthNumber, ox(NUCC.box23.x, opts), oy(NUCC.box23.y, opts));
}

function placeDiagnoses(doc: jsPDF, data: CMS1500Data, opts: CMS1500Options) {
  if (opts.printMode === 'data-only') {
    setDataOnlyFont(doc);
    // Box 21: ICD indicator
    doc.text('0', ox(NUCC.box21_icd.x, opts), oy(NUCC.box21_icd.y, opts)); // 0 = ICD-10
    // Up to 12 diagnoses in 4 columns × 3 rows
    for (let i = 0; i < Math.min(12, data.diagnoses.length); i++) {
      const col = Math.floor(i / 3);
      const row = i % 3;
      const letter = String.fromCharCode(65 + i);
      const x = NUCC.dx_colX[col];
      const y = NUCC.dx_rowY[row];
      doc.text(`${letter}. ${uc(data.diagnoses[i] || '')}`, ox(x, opts), oy(y, opts));
    }
    return;
  }

  // ── Full-chrome mode — data positions derived from NUCC coordinates ──
  setBlackData(doc);
  doc.setFont('Courier', 'bold');
  doc.setFontSize(FONT_SIZE);

  // Box 21: Up to 12 diagnoses in 4 columns × 3 rows — using NUCC grid
  // Small offset (+12pt) past the chrome "A." label prefix
  for (let i = 0; i < Math.min(12, data.diagnoses.length); i++) {
    if (!data.diagnoses[i]) continue;
    const col = Math.floor(i / 3);
    const row = i % 3;
    const x = NUCC.dx_colX[col] + 12; // offset past "A." label
    const y = NUCC.dx_rowY[row];
    doc.text(data.diagnoses[i], ox(x, opts), oy(y, opts));
  }
}

function placeServiceLines(doc: jsPDF, data: CMS1500Data, page: number, opts: CMS1500Options) {
  if (opts.printMode === 'data-only') {
    setDataOnlyFont(doc);
    const startIdx = page * 6;
    const endIdx = Math.min(startIdx + 6, data.serviceLines.length);

    for (let i = startIdx; i < endIdx; i++) {
      const line = data.serviceLines[i];
      const row = i - startIdx;
      const y = NUCC.svc_rowY[row];

      doc.text(uc(line.dateFrom), ox(NUCC.svc_dateFrom, opts), oy(y, opts));
      doc.text(uc(line.dateTo), ox(NUCC.svc_dateTo, opts), oy(y, opts));
      doc.text(uc(line.placeOfService), ox(NUCC.svc_pos, opts), oy(y, opts));
      doc.text(uc(line.emg), ox(NUCC.svc_emg, opts), oy(y, opts));
      doc.text(uc(line.cptCode), ox(NUCC.svc_cpt, opts), oy(y, opts));
      doc.text(uc(line.modifier1), ox(NUCC.svc_mod1, opts), oy(y, opts));
      doc.text(uc(line.modifier2), ox(NUCC.svc_mod2, opts), oy(y, opts));
      doc.text(uc(line.modifier3), ox(NUCC.svc_mod3, opts), oy(y, opts));
      doc.text(uc(line.modifier4), ox(NUCC.svc_mod4, opts), oy(y, opts));
      doc.text(uc(line.diagnosisPointers), ox(NUCC.svc_dxPtr, opts), oy(y, opts));
      doc.text(uc(line.charges), ox(NUCC.svc_charges, opts), oy(y, opts));
      doc.text(uc(line.units), ox(NUCC.svc_units, opts), oy(y, opts));
      doc.text(uc(line.renderingNpi), ox(NUCC.svc_npi, opts), oy(y, opts));
    }
    return;
  }

  // ── Full-chrome mode — data positions derived from NUCC coordinates ──
  setBlackData(doc);
  doc.setFont('Courier', 'bold');
  doc.setFontSize(7);

  const startIdx = page * 6;
  const endIdx = Math.min(startIdx + 6, data.serviceLines.length);

  for (let i = startIdx; i < endIdx; i++) {
    const line = data.serviceLines[i];
    const row = i - startIdx;
    const y = NUCC.svc_rowY[row];

    doc.text(line.dateFrom, ox(NUCC.svc_dateFrom, opts), oy(y, opts));           // A. FROM
    doc.text(line.dateTo, ox(NUCC.svc_dateTo, opts), oy(y, opts));               // A. TO
    doc.text(line.placeOfService, ox(NUCC.svc_pos, opts), oy(y, opts));           // B. POS
    if (line.emg) doc.text(line.emg, ox(NUCC.svc_emg, opts), oy(y, opts));       // C. EMG
    doc.text(line.cptCode, ox(NUCC.svc_cpt, opts), oy(y, opts));                 // D. CPT/HCPCS
    if (line.modifier1) doc.text(line.modifier1, ox(NUCC.svc_mod1, opts), oy(y, opts));
    if (line.modifier2) doc.text(line.modifier2, ox(NUCC.svc_mod2, opts), oy(y, opts));
    if (line.modifier3) doc.text(line.modifier3, ox(NUCC.svc_mod3, opts), oy(y, opts));
    if (line.modifier4) doc.text(line.modifier4, ox(NUCC.svc_mod4, opts), oy(y, opts));
    doc.text(line.diagnosisPointers, ox(NUCC.svc_dxPtr, opts), oy(y, opts));      // E. Dx Pointer
    doc.text(line.charges, ox(NUCC.svc_charges, opts), oy(y, opts));              // F. Charges
    doc.text(line.units, ox(NUCC.svc_units, opts), oy(y, opts));                  // G. Units
    doc.text(line.renderingNpi, ox(NUCC.svc_npi, opts), oy(y, opts));             // J. Rendering NPI
  }
}

function placeTotals(doc: jsPDF, data: CMS1500Data, opts: CMS1500Options) {
  if (opts.printMode === 'data-only') {
    setDataOnlyFont(doc);
    // Box 25: Federal Tax ID
    if (data.federalTaxId) doc.text(uc(data.federalTaxId), ox(NUCC.box25.x, opts), oy(NUCC.box25.y, opts));
    if (data.federalTaxIdType === 'SSN') doc.text('X', ox(NUCC.box25_ssn.x, opts), oy(NUCC.box25_ssn.y, opts));
    if (data.federalTaxIdType === 'EIN') doc.text('X', ox(NUCC.box25_ein.x, opts), oy(NUCC.box25_ein.y, opts));
    // Box 26: Patient account number
    if (data.patientAccountNumber) doc.text(uc(data.patientAccountNumber), ox(NUCC.box26.x, opts), oy(NUCC.box26.y, opts));
    // Box 27: Accept assignment
    if (data.acceptAssignment) doc.text('X', ox(NUCC.box27_yes.x, opts), oy(NUCC.box27_yes.y, opts));
    else doc.text('X', ox(NUCC.box27_no.x, opts), oy(NUCC.box27_no.y, opts));
    // Box 28: Total charge
    if (data.totalCharge) doc.text(uc(data.totalCharge), ox(NUCC.box28.x, opts), oy(NUCC.box28.y, opts));
    // Box 29: Amount paid
    if (data.amountPaid) doc.text(uc(data.amountPaid), ox(NUCC.box29.x, opts), oy(NUCC.box29.y, opts));
    return;
  }

  // ── Full-chrome mode — data positions derived from NUCC coordinates ──
  setBlackData(doc);
  doc.setFont('Courier', 'bold');
  doc.setFontSize(FONT_SIZE);

  // Box 25: Federal Tax ID
  doc.text(data.federalTaxId, ox(NUCC.box25.x, opts), oy(NUCC.box25.y, opts));
  if (data.federalTaxIdType === 'SSN') doc.text('X', ox(NUCC.box25_ssn.x, opts), oy(NUCC.box25_ssn.y, opts));
  if (data.federalTaxIdType === 'EIN') doc.text('X', ox(NUCC.box25_ein.x, opts), oy(NUCC.box25_ein.y, opts));

  // Box 26: Patient account number
  doc.text(data.patientAccountNumber, ox(NUCC.box26.x, opts), oy(NUCC.box26.y, opts));

  // Box 27: Accept assignment
  if (data.acceptAssignment) doc.text('X', ox(NUCC.box27_yes.x, opts), oy(NUCC.box27_yes.y, opts));
  else doc.text('X', ox(NUCC.box27_no.x, opts), oy(NUCC.box27_no.y, opts));

  // Box 28: Total charge
  if (data.totalCharge) doc.text('$ ' + data.totalCharge, ox(NUCC.box28.x, opts), oy(NUCC.box28.y, opts));

  // Box 29: Amount paid
  doc.text(data.amountPaid, ox(NUCC.box29.x, opts), oy(NUCC.box29.y, opts));
}

function placeProviderData(doc: jsPDF, data: CMS1500Data, opts: CMS1500Options) {
  if (opts.printMode === 'data-only') {
    setDataOnlyFont(doc);
    // Box 31: Physician signature
    if (data.physicianSignature) doc.text(uc(data.physicianSignature), ox(NUCC.box31_sig.x, opts), oy(NUCC.box31_sig.y, opts));
    if (data.physicianSignatureDate) doc.text(uc(data.physicianSignatureDate), ox(NUCC.box31_date.x, opts), oy(NUCC.box31_date.y, opts));
    // Box 32: Service facility
    if (data.serviceFacilityName) doc.text(uc(data.serviceFacilityName), ox(NUCC.box32_name.x, opts), oy(NUCC.box32_name.y, opts));
    if (data.serviceFacilityAddress) doc.text(uc(data.serviceFacilityAddress), ox(NUCC.box32_addr.x, opts), oy(NUCC.box32_addr.y, opts));
    const fac_csz = `${data.serviceFacilityCity}${data.serviceFacilityState ? ', ' + data.serviceFacilityState : ''} ${data.serviceFacilityZip}`.trim();
    if (fac_csz) doc.text(uc(fac_csz), ox(NUCC.box32_csz.x, opts), oy(NUCC.box32_csz.y, opts));
    if (data.serviceFacilityNpi) doc.text(uc(data.serviceFacilityNpi), ox(NUCC.box32a_npi.x, opts), oy(NUCC.box32a_npi.y, opts));
    // Box 33: Billing provider
    if (data.billingProviderPhone) doc.text(uc(data.billingProviderPhone), ox(NUCC.box33_phone.x, opts), oy(NUCC.box33_phone.y, opts));
    if (data.billingProviderName) doc.text(uc(data.billingProviderName), ox(NUCC.box33_name.x, opts), oy(NUCC.box33_name.y, opts));
    if (data.billingProviderAddress) doc.text(uc(data.billingProviderAddress), ox(NUCC.box33_addr.x, opts), oy(NUCC.box33_addr.y, opts));
    const bill_csz = `${data.billingProviderCity}${data.billingProviderState ? ', ' + data.billingProviderState : ''} ${data.billingProviderZip}`.trim();
    if (bill_csz) doc.text(uc(bill_csz), ox(NUCC.box33_csz.x, opts), oy(NUCC.box33_csz.y, opts));
    if (data.billingProviderNpi) doc.text(uc(data.billingProviderNpi), ox(NUCC.box33a_npi.x, opts), oy(NUCC.box33a_npi.y, opts));
    return;
  }

  // ── Full-chrome mode — data positions derived from NUCC coordinates ──
  setBlackData(doc);
  doc.setFont('Courier', 'bold');
  doc.setFontSize(7);

  // Box 31: Physician signature
  doc.text(data.physicianSignature, ox(NUCC.box31_sig.x, opts), oy(NUCC.box31_sig.y, opts));
  doc.text(data.physicianSignatureDate, ox(NUCC.box31_date.x, opts), oy(NUCC.box31_date.y, opts));

  // Box 32: Service facility
  doc.text(data.serviceFacilityName, ox(NUCC.box32_name.x, opts), oy(NUCC.box32_name.y, opts));
  doc.text(data.serviceFacilityAddress, ox(NUCC.box32_addr.x, opts), oy(NUCC.box32_addr.y, opts));
  doc.text(
    `${data.serviceFacilityCity}${data.serviceFacilityState ? ', ' + data.serviceFacilityState : ''} ${data.serviceFacilityZip}`,
    ox(NUCC.box32_csz.x, opts), oy(NUCC.box32_csz.y, opts)
  );
  doc.text(data.serviceFacilityNpi, ox(NUCC.box32a_npi.x + 30, opts), oy(NUCC.box32a_npi.y, opts));

  // Box 33: Billing provider
  doc.text(data.billingProviderPhone, ox(NUCC.box33_phone.x + 60, opts), oy(NUCC.box33_phone.y, opts));
  doc.text(data.billingProviderName, ox(NUCC.box33_name.x, opts), oy(NUCC.box33_name.y, opts));
  doc.text(data.billingProviderAddress, ox(NUCC.box33_addr.x, opts), oy(NUCC.box33_addr.y, opts));
  doc.text(
    `${data.billingProviderCity}${data.billingProviderState ? ', ' + data.billingProviderState : ''} ${data.billingProviderZip}`,
    ox(NUCC.box33_csz.x, opts), oy(NUCC.box33_csz.y, opts)
  );
  doc.text(data.billingProviderNpi, ox(NUCC.box33a_npi.x + 24, opts), oy(NUCC.box33a_npi.y, opts));
}

// ── Alignment Test Page ──

export function generateAlignmentTestPage(options: Partial<CMS1500Options> = {}): string {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter',
  });

  doc.setFont('Courier', 'normal');
  doc.setFontSize(10);
  doc.setDrawColor(0);

  // Title
  doc.text('CMS-1500 Printer Alignment Test Page', PAGE_W / 2, 40, { align: 'center' });
  doc.setFontSize(8);
  doc.text('Print this page on a pre-printed CMS-1500 form.', PAGE_W / 2, 55, { align: 'center' });
  doc.text('The crosshairs should land in the center of each target box.', PAGE_W / 2, 67, { align: 'center' });
  if (opts.offsetX !== 0 || opts.offsetY !== 0) {
    doc.text(`Current offsets: X=${opts.offsetX}pt, Y=${opts.offsetY}pt`, PAGE_W / 2, 79, { align: 'center' });
  }

  // Crosshairs derived directly from the NUCC coordinate object — never duplicate positions
  const landmarks = [
    { x: NUCC.box1a.x,          y: NUCC.box1a.y,          label: 'Box 1a (insured ID)' },
    { x: NUCC.box2.x,           y: NUCC.box2.y,           label: 'Box 2 (patient name)' },
    { x: NUCC.box5_street.x,    y: NUCC.box5_street.y,    label: 'Box 5 (patient address)' },
    { x: NUCC.box21_icd.x,      y: NUCC.box21_icd.y,      label: 'Box 21 (diagnosis)' },
    { x: NUCC.svc_dateFrom,     y: NUCC.svc_rowY[0],      label: 'Box 24 Line 1 (first service line)' },
    { x: NUCC.svc_dateFrom,     y: NUCC.svc_rowY[5],      label: 'Box 24 Line 6 (last service line)' },
    { x: NUCC.box25.x,          y: NUCC.box25.y,          label: 'Box 25 (tax ID)' },
    { x: NUCC.box31_sig.x,      y: NUCC.box31_sig.y,      label: 'Box 31 (signature)' },
    { x: NUCC.box33_name.x,     y: NUCC.box33_name.y,     label: 'Box 33 (billing provider)' },
  ];

  for (const lm of landmarks) {
    const lx = ox(lm.x, opts);
    const ly = oy(lm.y, opts);
    const size = 8;
    doc.line(lx - size, ly, lx + size, ly);
    doc.line(lx, ly - size, lx, ly + size);
    doc.circle(lx, ly, 2);
    doc.setFontSize(5);
    doc.text(lm.label, lx + 12, ly + 2);
    doc.setFontSize(8);
  }

  // Instructions at bottom
  const instrY = PAGE_H - 100;
  doc.setFontSize(8);
  doc.text('INSTRUCTIONS:', LEFT, instrY);
  doc.setFontSize(7);
  doc.text('1. Load a pre-printed CMS-1500 form in your printer.', LEFT + 8, instrY + 14);
  doc.text('2. Print this test page onto the form.', LEFT + 8, instrY + 26);
  doc.text('3. Check if the crosshairs land inside the correct boxes.', LEFT + 8, instrY + 38);
  doc.text('4. If off, measure the error and enter the offset in Settings > CMS-1500 Paper Claims.', LEFT + 8, instrY + 50);
  doc.text('5. Positive X shifts right, positive Y shifts down. Typical adjustments: +/-5 to +/-15 points.', LEFT + 8, instrY + 62);
  doc.text('   (72 points = 1 inch, so 7 points = ~0.1 inch)', LEFT + 8, instrY + 74);

  return doc.output('datauristring').split(',')[1];
}

// ── Data Assembly Helper ──

interface AssembleParams {
  client: any;
  practice: any;
  notes: any[];
}

/**
 * Assemble CMS1500Data from client, practice, and notes.
 */
export function assembleCMS1500Data({ client, practice, notes }: AssembleParams): CMS1500Data {
  // Parse secondary diagnoses
  let secondaryDx: Array<{ code: string; description: string }> = [];
  try {
    secondaryDx = JSON.parse(client.secondary_dx || '[]');
  } catch {}

  // All diagnoses: primary + secondary
  const allDx = [client.primary_dx_code, ...secondaryDx.map((d: any) => d.code)].filter(Boolean);

  // Format date as MM/DD/YYYY
  const formatDate = (d: string) => {
    if (!d) return '';
    const parts = d.split('-');
    if (parts.length === 3) return `${parts[1]}/${parts[2]}/${parts[0]}`;
    return d;
  };

  // Format date as MM/DD/YY (for service lines)
  const formatDateShort = (d: string) => {
    if (!d) return '';
    const parts = d.split('-');
    if (parts.length === 3) return `${parts[1]}/${parts[2]}/${parts[0].slice(2)}`;
    return d;
  };

  // Build service lines from notes — one line per CPT code, skip notes without CPT
  const serviceLines: CMS1500ServiceLine[] = [];
  for (const note of notes) {
    // Parse CPT codes
    let cptLines: Array<{ code: string; units: number }> = [];
    try {
      cptLines = JSON.parse(note.cpt_codes || '[]');
    } catch {}
    if (cptLines.length === 0 && note.cpt_code) {
      cptLines = [{ code: note.cpt_code, units: note.units || 1 }];
    }
    // Skip notes with no CPT codes
    if (cptLines.length === 0 || !cptLines[0].code) continue;

    // Parse modifiers
    let modifiers: string[] = [];
    try {
      modifiers = JSON.parse(note.cpt_modifiers || '[]');
    } catch {}

    // Parse diagnosis pointers
    let diagPointers: number[] = [];
    try {
      diagPointers = JSON.parse(note.diagnosis_pointers || '[1]');
    } catch {}
    const pointerStr = diagPointers.map((p: number) => String.fromCharCode(64 + p)).join('');

    // Create a service line for each CPT code on this note
    for (const cpt of cptLines) {
      if (!cpt.code) continue;
      const chargeAmount = note.charge_amount || 0;
      serviceLines.push({
        dateFrom: formatDateShort(note.date_of_service),
        dateTo: formatDateShort(note.date_of_service),
        placeOfService: note.place_of_service || '11',
        emg: '',
        cptCode: cpt.code,
        modifier1: modifiers[0] || '',
        modifier2: modifiers[1] || '',
        modifier3: modifiers[2] || '',
        modifier4: modifiers[3] || '',
        diagnosisPointers: pointerStr || 'A',
        charges: chargeAmount.toFixed(2),
        units: String(cpt.units || 1),
        renderingNpi: note.rendering_provider_npi || practice?.npi || '',
      });
    }
  }

  // Total charge
  const totalCharge = serviceLines.reduce((sum, l) => sum + (parseFloat(l.charges) || 0), 0);

  // Subscriber relationship mapping
  const relMap: Record<string, 'self' | 'spouse' | 'child' | 'other'> = {
    '18': 'self',
    '01': 'spouse',
    '19': 'child',
    '20': 'other',
    '21': 'other',
    'G8': 'other',
  };

  const isSelf = client.subscriber_relationship === '18' || !client.subscriber_relationship;
  const insuredName = isSelf
    ? `${client.last_name}, ${client.first_name}`
    : `${client.subscriber_last_name || ''}, ${client.subscriber_first_name || ''}`;

  return {
    insuranceType: (client.insurance_type || 'other').toLowerCase() as CMS1500Data['insuranceType'],
    insuredId: client.insurance_member_id || '',
    patientName: `${client.last_name}, ${client.first_name}`,
    patientDob: formatDate(client.dob),
    patientSex: client.gender || '',
    insuredName,
    patientAddress: client.address || '',
    patientCity: client.city || '',
    patientState: client.state || '',
    patientZip: client.zip || '',
    patientPhone: client.phone || '',
    patientRelationship: relMap[client.subscriber_relationship] || 'self',
    insuredAddress: isSelf ? client.address || '' : '',
    insuredCity: isSelf ? client.city || '' : '',
    insuredState: isSelf ? client.state || '' : '',
    insuredZip: isSelf ? client.zip || '' : '',
    insuredPhone: isSelf ? client.phone || '' : '',
    otherInsuredName: '',
    otherInsuredPolicy: '',
    employmentRelated: client.employment_related === 'Y',
    autoAccident: client.auto_accident === 'Y',
    autoAccidentState: client.auto_accident === 'Y' ? (client.auto_accident_state || '') : '',
    otherAccident: client.other_accident === 'Y',
    insuredGroupNumber: client.insurance_group || '',
    insuredDob: isSelf ? formatDate(client.dob) : formatDate(client.subscriber_dob),
    insuredSex: isSelf ? client.gender || '' : '',
    insurancePlanName: client.insurance_payer || '',
    otherInsurance: false,
    patientSignature: client.patient_signature_source === 'SOF' ? 'SIGNATURE ON FILE' : '',
    patientSignatureDate: new Date().toLocaleDateString('en-US'),
    insuredSignature: client.insured_signature_source === 'SOF' ? 'SIGNATURE ON FILE' : '',
    dateOfIllness: formatDate(client.onset_date),
    dateOfIllnessQualifier: client.onset_qualifier || '431',
    referringProvider: client.referring_physician || '',
    referringProviderQualifier: client.referring_physician_qualifier || 'DN',
    referringProviderId: '',
    referringProviderNpi: client.referring_npi || '',
    additionalClaimInfo: client.additional_claim_info || '',
    diagnoses: allDx,
    resubmissionCode: '',
    originalRefNumber: '',
    priorAuthNumber: client.prior_auth_number || '',
    serviceLines,
    federalTaxId: practice?.tax_id || '',
    federalTaxIdType: 'EIN',
    patientAccountNumber: String(client.id),
    acceptAssignment: client.claim_accept_assignment !== 'N',
    totalCharge: totalCharge.toFixed(2),
    amountPaid: '0.00',
    physicianSignature: practice?.name || '',
    physicianSignatureDate: new Date().toLocaleDateString('en-US'),
    serviceFacilityName: client.service_facility_name || practice?.name || '',
    serviceFacilityAddress: client.service_facility_name ? '' : practice?.address || '',
    serviceFacilityCity: client.service_facility_name ? '' : practice?.city || '',
    serviceFacilityState: client.service_facility_name ? '' : practice?.state || '',
    serviceFacilityZip: client.service_facility_name ? '' : practice?.zip || '',
    serviceFacilityNpi: client.service_facility_npi || practice?.npi || '',
    billingProviderName: practice?.name || '',
    billingProviderAddress: practice?.address || '',
    billingProviderCity: practice?.city || '',
    billingProviderState: practice?.state || '',
    billingProviderZip: practice?.zip || '',
    billingProviderPhone: practice?.phone || '',
    billingProviderNpi: practice?.npi || '',
  };
}
