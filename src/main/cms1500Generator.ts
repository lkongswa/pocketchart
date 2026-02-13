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
// CMS-1500 designed for 10 CPI (7.2pt/char) × 6 LPI (12pt/line)
// Coordinates from the NUCC field position reference
// These are ballpark approximations — fine-tune after printing on real forms
const NUCC = {
  // Box 1 — Insurance type checkboxes (top row)
  box1_medicare:  { x: 50,  y: 72 },
  box1_medicaid:  { x: 109, y: 72 },
  box1_tricare:   { x: 158, y: 72 },
  box1_champva:   { x: 204, y: 72 },
  box1_group:     { x: 246, y: 72 },
  box1_feca:      { x: 296, y: 72 },
  box1_other:     { x: 345, y: 72 },

  // Box 1a — Insured's ID Number
  box1a: { x: 274, y: 86 },

  // Box 2 — Patient Name
  box2: { x: 7, y: 122 },

  // Box 3 — Patient DOB and Sex
  box3_dob: { x: 274, y: 108 },
  box3_sex_m: { x: 394, y: 108 },
  box3_sex_f: { x: 432, y: 108 },

  // Box 4 — Insured's Name
  box4: { x: 274, y: 144 },

  // Box 5 — Patient's Address
  box5_street: { x: 7, y: 166 },
  box5_city:   { x: 7, y: 187 },
  box5_state:  { x: 155, y: 187 },
  box5_zip:    { x: 200, y: 187 },
  box5_phone:  { x: 7, y: 209 },

  // Box 6 — Patient Relationship (checkboxes)
  box6_self:   { x: 317, y: 144 },
  box6_spouse: { x: 359, y: 144 },
  box6_child:  { x: 399, y: 144 },
  box6_other:  { x: 439, y: 144 },

  // Box 7 — Insured's Address
  box7_street: { x: 274, y: 166 },
  box7_city:   { x: 274, y: 187 },
  box7_state:  { x: 425, y: 187 },
  box7_zip:    { x: 470, y: 187 },

  // Box 8 — Reserved
  // Box 9 — Other Insured's Name
  box9: { x: 7, y: 223 },
  // Box 9a — Other Insured's Policy or Group Number
  box9a: { x: 7, y: 245 },

  // Box 10 — Condition Related To
  box10a_yes: { x: 207, y: 288 },
  box10a_no:  { x: 237, y: 288 },
  box10b_yes: { x: 207, y: 302 },
  box10b_no:  { x: 237, y: 302 },
  box10b_state: { x: 256, y: 302 },
  box10c_yes: { x: 207, y: 317 },
  box10c_no:  { x: 237, y: 317 },

  // Box 11 — Insured's Policy Group or FECA Number
  box11: { x: 274, y: 223 },
  // Box 11a — Insured's DOB and Sex
  box11a_dob: { x: 304, y: 245 },
  box11a_sex_m: { x: 440, y: 245 },
  box11a_sex_f: { x: 478, y: 245 },
  // Box 11b — Other Claim ID
  box11b: { x: 274, y: 259 },
  // Box 11c — Insurance Plan Name
  box11c: { x: 274, y: 274 },
  // Box 11d — Is There Another Health Benefit Plan?
  box11d_yes: { x: 340, y: 288 },
  box11d_no:  { x: 380, y: 288 },

  // Box 12 — Patient's or Authorized Person's Signature
  box12:      { x: 7,   y: 338 },
  box12_date: { x: 200, y: 338 },
  // Box 13 — Insured's or Authorized Person's Signature
  box13: { x: 274, y: 338 },

  // Box 14 — Date of Current Illness
  box14:           { x: 7,   y: 360 },
  box14_qualifier: { x: 200, y: 360 },

  // Box 15 — Other Date (qual)
  box15: { x: 274, y: 360 },
  // Box 16 — Dates Patient Unable to Work
  box16_from: { x: 390, y: 360 },
  box16_to:   { x: 470, y: 360 },

  // Box 17 — Name of Referring Provider
  box17: { x: 7, y: 382 },
  // Box 17a — ID Number of Referring Provider (qualifier)
  box17a_qual: { x: 274, y: 382 },
  // Box 17b — NPI
  box17b: { x: 350, y: 396 },

  // Box 18 — Hospitalization Dates
  box18_from: { x: 274, y: 396 },
  box18_to:   { x: 390, y: 396 },

  // Box 19 — Additional Claim Information
  box19: { x: 7, y: 418 },

  // Box 20 — Outside Lab
  box20_yes:    { x: 340, y: 418 },
  box20_no:     { x: 380, y: 418 },
  box20_charges: { x: 440, y: 418 },

  // Box 21 — Diagnosis Codes (ICD indicator + up to 12 codes)
  box21_icd: { x: 7, y: 432 },
  // Diagnosis positions: 4 columns, 3 rows
  // Col 0: x=7, Col 1: x=140, Col 2: x=274, Col 3: x=410
  // Row 0: y=439, Row 1: y=450, Row 2: y=461
  dx_colX: [7, 140, 274, 410] as readonly number[],
  dx_rowY: [439, 450, 461] as readonly number[],

  // Box 22 — Resubmission Code / Original Ref Number
  box22_code: { x: 7,   y: 468 },
  box22_ref:  { x: 100, y: 468 },
  // Box 23 — Prior Authorization Number
  box23: { x: 274, y: 468 },

  // Box 24 — Service Lines (up to 6 per page)
  // Row Y positions: start at 497, ~18pt apart
  svc_rowY: [497, 515, 533, 551, 569, 587] as readonly number[],
  // Column X positions
  svc_dateFrom:  7,
  svc_dateTo:    72,
  svc_pos:       130,
  svc_emg:       144,
  svc_cpt:       151,
  svc_mod1:      202,
  svc_mod2:      216,
  svc_mod3:      230,
  svc_mod4:      245,
  svc_dxPtr:     259,
  svc_charges:   288,
  svc_units:     353,
  svc_epsdt:     374,
  svc_idQual:    389,
  svc_npi:       403,

  // Box 25 — Federal Tax ID Number
  box25:     { x: 7,   y: 605 },
  box25_ssn: { x: 155, y: 605 },
  box25_ein: { x: 175, y: 605 },

  // Box 26 — Patient's Account Number
  box26: { x: 200, y: 605 },

  // Box 27 — Accept Assignment
  box27_yes: { x: 350, y: 605 },
  box27_no:  { x: 390, y: 605 },

  // Box 28 — Total Charge
  box28: { x: 440, y: 605 },

  // Box 29 — Amount Paid
  box29: { x: 7, y: 626 },

  // Box 30 — Reserved
  // Box 31 — Signature of Physician
  box31_sig:  { x: 7,   y: 655 },
  box31_date: { x: 7,   y: 667 },

  // Box 32 — Service Facility
  box32_name:    { x: 200, y: 655 },
  box32_addr:    { x: 200, y: 667 },
  box32_csz:     { x: 200, y: 679 },
  box32a_npi:    { x: 200, y: 720 },

  // Box 33 — Billing Provider
  box33_phone:   { x: 400, y: 641 },
  box33_name:    { x: 400, y: 655 },
  box33_addr:    { x: 400, y: 667 },
  box33_csz:     { x: 400, y: 679 },
  box33a_npi:    { x: 400, y: 720 },
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

  // ── Full-chrome mode (existing code) ──
  setBlackData(doc);
  doc.setFont('Courier', 'bold');
  doc.setFontSize(FONT_SIZE);

  const midX = (LEFT + RIGHT) / 2;

  // Box 1a: Insured ID
  doc.text(data.insuredId, ox(midX + 8, opts), oy(TOP + 22, opts));

  // Box 2: Patient name
  doc.text(data.patientName, ox(LEFT + 8, opts), oy(TOP + 50, opts));

  // Box 3: DOB
  doc.text(data.patientDob, ox(midX + 8, opts), oy(TOP + 50, opts));
  // Sex checkbox
  if (data.patientSex === 'M') doc.text('X', ox(midX + 161, opts), oy(TOP + 53, opts));
  if (data.patientSex === 'F') doc.text('X', ox(midX + 189, opts), oy(TOP + 53, opts));

  // Box 4: Insured name
  doc.text(data.insuredName, ox(LEFT + 8, opts), oy(TOP + 78, opts));

  // Box 5: Patient address
  doc.text(data.patientAddress, ox(LEFT + 8, opts), oy(TOP + 106, opts));
  doc.text(data.patientCity, ox(LEFT + 8, opts), oy(TOP + 124, opts));
  doc.text(data.patientState, ox(LEFT + 140, opts), oy(TOP + 124, opts));
  doc.text(data.patientZip, ox(LEFT + 180, opts), oy(TOP + 124, opts));
  doc.text(data.patientPhone, ox(LEFT + 80, opts), oy(TOP + 137, opts));

  // Box 6: Relationship
  if (data.patientRelationship === 'self') doc.text('X', ox(midX + 11, opts), oy(TOP + 81, opts));
  if (data.patientRelationship === 'spouse') doc.text('X', ox(midX + 53, opts), oy(TOP + 81, opts));
  if (data.patientRelationship === 'child') doc.text('X', ox(midX + 93, opts), oy(TOP + 81, opts));
  if (data.patientRelationship === 'other') doc.text('X', ox(midX + 133, opts), oy(TOP + 81, opts));

  // Box 7: Insured address
  doc.text(data.insuredAddress, ox(midX + 8, opts), oy(TOP + 106, opts));
  doc.text(data.insuredCity, ox(midX + 8, opts), oy(TOP + 124, opts));
  doc.text(data.insuredState, ox(midX + 140, opts), oy(TOP + 124, opts));
  doc.text(data.insuredZip, ox(midX + 180, opts), oy(TOP + 124, opts));
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

  // ── Full-chrome mode (existing code) ──
  setBlackData(doc);
  doc.setFont('Courier', 'bold');
  doc.setFontSize(FONT_SIZE);

  const midX = (LEFT + RIGHT) / 2;

  // Box 9: Other insured name
  doc.text(data.otherInsuredName, ox(LEFT + 8, opts), oy(TOP + 162, opts));

  // Box 10: Condition related
  if (data.employmentRelated) doc.text('X', ox(LEFT + 171, opts), oy(TOP + 191, opts));
  else doc.text('X', ox(LEFT + 201, opts), oy(TOP + 191, opts));
  if (data.autoAccident) {
    doc.text('X', ox(LEFT + 171, opts), oy(TOP + 199, opts));
    if (data.autoAccidentState) doc.text(data.autoAccidentState, ox(LEFT + 220, opts), oy(TOP + 199, opts));
  } else {
    doc.text('X', ox(LEFT + 201, opts), oy(TOP + 199, opts));
  }

  // Box 11: Insured group
  doc.text(data.insuredGroupNumber, ox(midX + 8, opts), oy(TOP + 162, opts));

  // Box 11a: Insured DOB/Sex
  if (data.insuredDob) doc.text(data.insuredDob, ox(midX + 30, opts), oy(TOP + 181, opts));

  // Box 11c: Plan name
  doc.text(data.insurancePlanName, ox(midX + 30, opts), oy(TOP + 208, opts));

  // Box 12: Patient signature
  doc.setFontSize(7);
  doc.text(data.patientSignature, ox(LEFT + 60, opts), oy(TOP + 248, opts));
  if (data.patientSignatureDate) doc.text(data.patientSignatureDate, ox(LEFT + 200, opts), oy(TOP + 248, opts));
  doc.setFontSize(FONT_SIZE);

  // Box 13: Insured signature
  doc.setFontSize(7);
  doc.text(data.insuredSignature, ox(midX + 60, opts), oy(TOP + 248, opts));
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

  // ── Full-chrome mode (existing code) ──
  setBlackData(doc);
  doc.setFont('Courier', 'bold');
  doc.setFontSize(FONT_SIZE);

  const midX = (LEFT + RIGHT) / 2;

  // Box 14: Date of illness
  doc.text(data.dateOfIllness, ox(LEFT + 8, opts), oy(TOP + 274, opts));
  if (data.dateOfIllnessQualifier) {
    doc.setFontSize(SMALL_FONT);
    doc.text(data.dateOfIllnessQualifier, ox(LEFT + 200, opts), oy(TOP + 278, opts));
    doc.setFontSize(FONT_SIZE);
  }

  // Box 17: Referring provider
  doc.text(data.referringProvider, ox(LEFT + 8, opts), oy(TOP + 302, opts));
  if (data.referringProviderQualifier) {
    doc.text(data.referringProviderQualifier, ox(midX + 8, opts), oy(TOP + 302, opts));
  }
  if (data.referringProviderNpi) {
    doc.text(data.referringProviderNpi, ox(midX + 80, opts), oy(TOP + 302, opts));
  }

  // Box 19: Additional claim info
  if (data.additionalClaimInfo) {
    doc.setFontSize(6);
    doc.text(data.additionalClaimInfo.slice(0, 80), ox(LEFT + 8, opts), oy(TOP + 330, opts));
    doc.setFontSize(FONT_SIZE);
  }

  // Box 22: Resubmission code
  if (data.resubmissionCode) doc.text(data.resubmissionCode, ox(LEFT + 8, opts), oy(TOP + 374, opts));
  if (data.originalRefNumber) doc.text(data.originalRefNumber, ox(LEFT + 100, opts), oy(TOP + 374, opts));

  // Box 23: Prior auth
  doc.text(data.priorAuthNumber, ox(midX + 8, opts), oy(TOP + 374, opts));
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

  // ── Full-chrome mode (existing code) ──
  setBlackData(doc);
  doc.setFont('Courier', 'bold');
  doc.setFontSize(FONT_SIZE);

  // Box 21: Up to 12 diagnoses in 4 columns x 3 rows
  const dxStartX = LEFT + 8;
  const dxStartY = TOP + 358;
  const colWidth = 130;
  const rowHeight = 10;

  for (let i = 0; i < Math.min(12, data.diagnoses.length); i++) {
    const col = Math.floor(i / 3);
    const row = i % 3;
    const letter = String.fromCharCode(65 + i); // A-L
    const x = dxStartX + col * colWidth;
    const y = dxStartY + row * rowHeight;

    doc.setFontSize(SMALL_FONT);
    doc.text(`${letter}.`, ox(x, opts), oy(y, opts));
    doc.setFontSize(FONT_SIZE);
    doc.text(data.diagnoses[i] || '', ox(x + 12, opts), oy(y, opts));
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

  // ── Full-chrome mode (existing code) ──
  setBlackData(doc);
  doc.setFont('Courier', 'bold');
  doc.setFontSize(7);

  const startIdx = page * 6;
  const endIdx = Math.min(startIdx + 6, data.serviceLines.length);
  const lineStartY = TOP + 415;
  const lineHeight = 22;

  for (let i = startIdx; i < endIdx; i++) {
    const line = data.serviceLines[i];
    const row = i - startIdx;
    const y = lineStartY + row * lineHeight;

    doc.text(line.dateFrom, ox(LEFT + 4, opts), oy(y, opts));
    doc.text(line.dateTo, ox(LEFT + 58, opts), oy(y, opts));
    doc.text(line.placeOfService, ox(LEFT + 110, opts), oy(y, opts));
    doc.text(line.emg, ox(LEFT + 130, opts), oy(y, opts));
    doc.text(line.cptCode, ox(LEFT + 148, opts), oy(y, opts));
    doc.text(line.modifier1, ox(LEFT + 200, opts), oy(y, opts));
    doc.text(line.modifier2, ox(LEFT + 222, opts), oy(y, opts));
    doc.text(line.modifier3, ox(LEFT + 244, opts), oy(y, opts));
    doc.text(line.modifier4, ox(LEFT + 266, opts), oy(y, opts));
    doc.text(line.diagnosisPointers, ox(LEFT + 290, opts), oy(y, opts));
    doc.text(line.charges, ox(LEFT + 320, opts), oy(y, opts));
    doc.text(line.units, ox(LEFT + 388, opts), oy(y, opts));
    doc.text(line.renderingNpi, ox(LEFT + 430, opts), oy(y, opts));
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

  // ── Full-chrome mode (existing code) ──
  setBlackData(doc);
  doc.setFont('Courier', 'bold');
  doc.setFontSize(FONT_SIZE);

  // Box 25: Federal Tax ID
  doc.text(data.federalTaxId, ox(LEFT + 8, opts), oy(TOP + 574, opts));
  if (data.federalTaxIdType === 'SSN') doc.text('X', ox(LEFT + 131, opts), oy(TOP + 579, opts));
  if (data.federalTaxIdType === 'EIN') doc.text('X', ox(LEFT + 154, opts), oy(TOP + 579, opts));

  // Box 26: Patient account number
  doc.text(data.patientAccountNumber, ox(LEFT + 208, opts), oy(TOP + 574, opts));

  // Box 27: Accept assignment
  if (data.acceptAssignment) doc.text('X', ox(LEFT + 349, opts), oy(TOP + 579, opts));
  else doc.text('X', ox(LEFT + 381, opts), oy(TOP + 579, opts));

  // Box 28: Total charge
  doc.text(data.totalCharge, ox(RIGHT - 100, opts), oy(TOP + 574, opts));

  // Box 29: Amount paid
  doc.text(data.amountPaid, ox(LEFT + 8, opts), oy(TOP + 604, opts));
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

  // ── Full-chrome mode (existing code) ──
  setBlackData(doc);
  doc.setFont('Courier', 'bold');
  doc.setFontSize(7);

  // Box 31: Physician signature
  doc.text(data.physicianSignature, ox(LEFT + 8, opts), oy(TOP + 650, opts));
  doc.text(data.physicianSignatureDate, ox(LEFT + 8, opts), oy(TOP + 658, opts));

  // Box 32: Service facility
  doc.text(data.serviceFacilityName, ox(LEFT + 208, opts), oy(TOP + 634, opts));
  doc.text(data.serviceFacilityAddress, ox(LEFT + 208, opts), oy(TOP + 644, opts));
  doc.text(
    `${data.serviceFacilityCity}${data.serviceFacilityState ? ', ' + data.serviceFacilityState : ''} ${data.serviceFacilityZip}`,
    ox(LEFT + 208, opts), oy(TOP + 654, opts)
  );
  doc.text(data.serviceFacilityNpi, ox(LEFT + 230, opts), oy(TOP + 664, opts));

  // Box 33: Billing provider
  doc.text(data.billingProviderName, ox(RIGHT - 172, opts), oy(TOP + 634, opts));
  doc.text(data.billingProviderAddress, ox(RIGHT - 172, opts), oy(TOP + 644, opts));
  doc.text(
    `${data.billingProviderCity}${data.billingProviderState ? ', ' + data.billingProviderState : ''} ${data.billingProviderZip}`,
    ox(RIGHT - 172, opts), oy(TOP + 654, opts)
  );
  doc.text(data.billingProviderPhone, ox(RIGHT - 172, opts), oy(TOP + 664, opts));
  doc.text(data.billingProviderNpi, ox(RIGHT - 148, opts), oy(TOP + 674, opts));
}

// ── Alignment Test Page ──

export function generateAlignmentTestPage(): string {
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

  // Crosshairs at key landmark positions on the CMS-1500
  const landmarks = [
    { x: LEFT + 8,   y: TOP + 20,  label: 'Box 1a (top-left data area)' },
    { x: RIGHT - 8,  y: TOP + 20,  label: 'Box 1a (top-right)' },
    { x: LEFT + 8,   y: TOP + 50,  label: 'Box 2 (patient name)' },
    { x: LEFT + 8,   y: TOP + 415, label: 'Service Line 1 (first line)' },
    { x: LEFT + 8,   y: TOP + 574, label: 'Box 25 (tax ID)' },
    { x: LEFT + 8,   y: TOP + 650, label: 'Box 31 (signature)' },
    { x: RIGHT - 50, y: TOP + 650, label: 'Box 33 (billing provider)' },
  ];

  for (const lm of landmarks) {
    const size = 8;
    doc.line(lm.x - size, lm.y, lm.x + size, lm.y);
    doc.line(lm.x, lm.y - size, lm.x, lm.y + size);
    doc.circle(lm.x, lm.y, 2);
    doc.setFontSize(5);
    doc.text(lm.label, lm.x + 12, lm.y + 2);
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

  // Build service lines from notes
  const serviceLines: CMS1500ServiceLine[] = notes.map((note) => {
    // Parse CPT codes
    let cptLines: Array<{ code: string; units: number }> = [];
    try {
      cptLines = JSON.parse(note.cpt_codes || '[]');
    } catch {}
    if (cptLines.length === 0 && note.cpt_code) {
      cptLines = [{ code: note.cpt_code, units: note.units || 1 }];
    }

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

    // Use first CPT line
    const mainCpt = cptLines[0] || { code: '', units: 1 };
    const chargeAmount = note.charge_amount || 0;

    return {
      dateFrom: formatDateShort(note.date_of_service),
      dateTo: formatDateShort(note.date_of_service),
      placeOfService: note.place_of_service || '11',
      emg: '',
      cptCode: mainCpt.code,
      modifier1: modifiers[0] || '',
      modifier2: modifiers[1] || '',
      modifier3: modifiers[2] || '',
      modifier4: modifiers[3] || '',
      diagnosisPointers: pointerStr || 'A',
      charges: chargeAmount.toFixed(2),
      units: String(mainCpt.units || 1),
      renderingNpi: note.rendering_provider_npi || practice?.npi || '',
    };
  });

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
    insuranceType: 'group',
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
    autoAccidentState: client.auto_accident_state || '',
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
