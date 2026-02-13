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

// ── Coordinate Constants ──
// All coordinates in points (72pt = 1 inch) on letter paper (612 x 792)

const FONT_SIZE = 8;
const SMALL_FONT = 6;
const PAGE_W = 612;
const PAGE_H = 792;

// Margins for the form
const LEFT = 36;   // 0.5 inch
const RIGHT = 576;  // 8 inch
const TOP = 50;

/**
 * Generate a CMS-1500 PDF
 */
export function generateCMS1500(data: CMS1500Data): string {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'pt',
    format: 'letter',
  });

  // Calculate pages needed (6 service lines per page)
  const pages = Math.max(1, Math.ceil(data.serviceLines.length / 6));

  for (let page = 0; page < pages; page++) {
    if (page > 0) doc.addPage();

    // Draw form chrome (boxes and labels)
    drawFormChrome(doc);

    // Place data
    placePatientData(doc, data);
    placeInsuranceData(doc, data);
    placeClaimData(doc, data);
    placeDiagnoses(doc, data);
    placeServiceLines(doc, data, page);
    placeTotals(doc, data);
    placeProviderData(doc, data);
  }

  return doc.output('datauristring').split(',')[1]; // base64
}

/**
 * Render a single CMS-1500 form onto an existing jsPDF document.
 * Used by bulk generation to compose multi-client combined PDFs.
 */
export function renderCMS1500Pages(doc: jsPDF, data: CMS1500Data): void {
  const pages = Math.max(1, Math.ceil(data.serviceLines.length / 6));

  for (let page = 0; page < pages; page++) {
    drawFormChrome(doc);
    placePatientData(doc, data);
    placeInsuranceData(doc, data);
    placeClaimData(doc, data);
    placeDiagnoses(doc, data);
    placeServiceLines(doc, data, page);
    placeTotals(doc, data);
    placeProviderData(doc, data);

    // Add page break between multi-page service lines for this client
    if (page < pages - 1) {
      doc.addPage();
    }
  }
}

// ── Form Chrome Drawing ──

function drawFormChrome(doc: jsPDF) {
  doc.setDrawColor(0);
  doc.setLineWidth(0.5);
  doc.setFont('Courier', 'normal');

  // Title
  doc.setFontSize(10);
  doc.setFont('Courier', 'bold');
  doc.text('HEALTH INSURANCE CLAIM FORM', PAGE_W / 2, TOP - 10, { align: 'center' });
  doc.setFontSize(6);
  doc.setFont('Courier', 'normal');
  doc.text('APPROVED BY NATIONAL UNIFORM CLAIM COMMITTEE (NUCC) 02/12', PAGE_W / 2, TOP - 2, { align: 'center' });

  // Draw main border
  doc.rect(LEFT, TOP, RIGHT - LEFT, 700);

  // ── Section dividers (horizontal lines) ──
  const hLines = [
    TOP + 28,    // Below Box 1-1a row
    TOP + 56,    // Below Box 2-3 row
    TOP + 84,    // Below Box 5 address row
    TOP + 112,   // Below Box 5 city/state row
    TOP + 140,   // Below Box 9 row
    TOP + 168,   // Below Box 10 row
    TOP + 196,   // Below Box 11 row
    TOP + 224,   // Below Box 11d row
    TOP + 252,   // Below Box 12-13 row
    TOP + 280,   // Below Box 14-16 row
    TOP + 308,   // Below Box 17 row
    TOP + 336,   // Below Box 19 row
    TOP + 380,   // Below Box 21 diagnoses
    TOP + 400,   // Service line header
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

  // Vertical center line
  const midX = (LEFT + RIGHT) / 2;
  doc.line(midX, TOP, midX, TOP + 252);

  // ── Box Labels (small font) ──
  doc.setFontSize(SMALL_FONT);
  doc.setFont('Courier', 'normal');

  // Row 1: Insurance type + Insured ID
  doc.text('1. MEDICARE  MEDICAID  TRICARE  CHAMPVA  GROUP  FECA  OTHER', LEFT + 4, TOP + 9);
  doc.text("1a. INSURED'S I.D. NUMBER", midX + 4, TOP + 9);

  // Row 2: Patient name + DOB
  doc.text("2. PATIENT'S NAME (Last Name, First Name, Middle Initial)", LEFT + 4, TOP + 37);
  doc.text("3. PATIENT'S BIRTH DATE           SEX", midX + 4, TOP + 37);

  // Row 3: Insured name + Patient relationship
  doc.text("4. INSURED'S NAME (Last Name, First Name, Middle Initial)", LEFT + 4, TOP + 65);
  doc.text("6. PATIENT RELATIONSHIP TO INSURED", midX + 4, TOP + 65);

  // Row 4: Patient address
  doc.text("5. PATIENT'S ADDRESS (No., Street)", LEFT + 4, TOP + 93);
  doc.text("7. INSURED'S ADDRESS (No., Street)", midX + 4, TOP + 93);

  // Patient City/State/Zip
  doc.text("CITY                    STATE    ZIP", LEFT + 4, TOP + 121);
  doc.text("CITY                    STATE    ZIP", midX + 4, TOP + 121);

  // Row 6: Other insured
  doc.text("9. OTHER INSURED'S NAME", LEFT + 4, TOP + 149);
  doc.text("11. INSURED'S POLICY GROUP OR FECA NUMBER", midX + 4, TOP + 149);

  // Row 7: Condition Related to
  doc.text("10. IS PATIENT'S CONDITION RELATED TO:", LEFT + 4, TOP + 177);
  doc.text("a. EMPLOYMENT?  b. AUTO ACCIDENT?  c. OTHER?", LEFT + 14, TOP + 188);

  // Row 8
  doc.text("11d. IS THERE ANOTHER HEALTH BENEFIT PLAN?", midX + 4, TOP + 205);

  // Row 9: Signatures
  doc.text("12. PATIENT'S OR AUTHORIZED PERSON'S SIGNATURE", LEFT + 4, TOP + 233);
  doc.text("13. INSURED'S OR AUTHORIZED PERSON'S SIGNATURE", midX + 4, TOP + 233);

  // Row 10: Dates
  doc.text("14. DATE OF CURRENT ILLNESS, INJURY, or PREGNANCY", LEFT + 4, TOP + 261);
  doc.text("15. OTHER DATE           16. DATES UNABLE TO WORK", midX + 4, TOP + 261);

  // Row 11: Referring
  doc.text("17. NAME OF REFERRING PROVIDER OR OTHER SOURCE", LEFT + 4, TOP + 289);
  doc.text("17a.                     17b. NPI", midX + 4, TOP + 289);

  // Row 12: Additional
  doc.text("19. ADDITIONAL CLAIM INFORMATION", LEFT + 4, TOP + 317);
  doc.text("20. OUTSIDE LAB?  $ CHARGES", midX + 4, TOP + 317);

  // Box 21: Diagnoses
  doc.text("21. DIAGNOSIS OR NATURE OF ILLNESS OR INJURY  Relate A-L to service line below (24E)", LEFT + 4, TOP + 345);

  // Box 22-23
  doc.text("22. RESUBMISSION CODE    ORIGINAL REF. NO.", LEFT + 4, TOP + 365);
  doc.text("23. PRIOR AUTHORIZATION NUMBER", midX + 4, TOP + 365);

  // Service line header (Box 24)
  doc.setFontSize(5);
  const slHeaderY = TOP + 393;
  doc.text("24. A.        B.     C.    D. PROCEDURES, SERVICES, OR SUPPLIES    E.      F.         G.    H.   I.    J.", LEFT + 4, slHeaderY);
  doc.text("    DATE(S)   PLACE  EMG   CPT/HCPCS    MODIFIER  DIAGNOSIS  $ CHARGES  DAYS  EPSDT  RENDERING", LEFT + 4, slHeaderY + 8);
  doc.text("    FROM  TO  OF SVC                                POINTER              OR    FAMILY PROVIDER ID.", LEFT + 4, slHeaderY + 14);
  doc.setFontSize(SMALL_FONT);

  // Below service lines
  doc.text("25. FEDERAL TAX I.D. NUMBER    SSN  EIN", LEFT + 4, TOP + 562);
  doc.text("26. PATIENT'S ACCOUNT NO.", LEFT + 200, TOP + 562);
  doc.text("27. ACCEPT ASSIGNMENT?", LEFT + 340, TOP + 562);
  doc.text("28. TOTAL CHARGE", RIGHT - 120, TOP + 562);

  doc.text("29. AMOUNT PAID", LEFT + 4, TOP + 590);
  doc.text("30. Rsvd for NUCC Use", LEFT + 200, TOP + 590);

  doc.text("31. SIGNATURE OF PHYSICIAN OR SUPPLIER", LEFT + 4, TOP + 620);
  doc.text("32. SERVICE FACILITY LOCATION INFORMATION", LEFT + 200, TOP + 620);
  doc.text("33. BILLING PROVIDER INFO & PH #", RIGHT - 180, TOP + 620);
}

// ── Data Placement Functions ──

function placePatientData(doc: jsPDF, data: CMS1500Data) {
  doc.setFont('Courier', 'bold');
  doc.setFontSize(FONT_SIZE);

  const midX = (LEFT + RIGHT) / 2;

  // Box 1a: Insured ID
  doc.text(data.insuredId, midX + 8, TOP + 22);

  // Box 2: Patient name
  doc.text(data.patientName, LEFT + 8, TOP + 50);

  // Box 3: DOB
  doc.text(data.patientDob, midX + 8, TOP + 50);
  // Sex checkbox
  if (data.patientSex === 'M') doc.text('X', midX + 170, TOP + 50);
  if (data.patientSex === 'F') doc.text('X', midX + 200, TOP + 50);

  // Box 4: Insured name
  doc.text(data.insuredName, LEFT + 8, TOP + 78);

  // Box 5: Patient address
  doc.text(data.patientAddress, LEFT + 8, TOP + 106);
  doc.text(data.patientCity, LEFT + 8, TOP + 134);
  doc.text(data.patientState, LEFT + 140, TOP + 134);
  doc.text(data.patientZip, LEFT + 180, TOP + 134);
  doc.text(data.patientPhone, LEFT + 8, TOP + 145);

  // Box 6: Relationship
  const relX = midX + 8;
  if (data.patientRelationship === 'self') doc.text('X', relX, TOP + 78);
  if (data.patientRelationship === 'spouse') doc.text('X', relX + 40, TOP + 78);
  if (data.patientRelationship === 'child') doc.text('X', relX + 80, TOP + 78);
  if (data.patientRelationship === 'other') doc.text('X', relX + 120, TOP + 78);

  // Box 7: Insured address
  doc.text(data.insuredAddress, midX + 8, TOP + 106);
  doc.text(data.insuredCity, midX + 8, TOP + 134);
  doc.text(data.insuredState, midX + 140, TOP + 134);
  doc.text(data.insuredZip, midX + 180, TOP + 134);
}

function placeInsuranceData(doc: jsPDF, data: CMS1500Data) {
  doc.setFont('Courier', 'bold');
  doc.setFontSize(FONT_SIZE);

  const midX = (LEFT + RIGHT) / 2;

  // Box 9: Other insured name
  doc.text(data.otherInsuredName, LEFT + 8, TOP + 162);

  // Box 10: Condition related
  if (data.employmentRelated) doc.text('X', LEFT + 80, TOP + 188);
  else doc.text('X', LEFT + 100, TOP + 188);
  if (data.autoAccident) {
    doc.text('X', LEFT + 170, TOP + 188);
    if (data.autoAccidentState) doc.text(data.autoAccidentState, LEFT + 220, TOP + 188);
  } else {
    doc.text('X', LEFT + 190, TOP + 188);
  }
  if (data.otherAccident) doc.text('X', LEFT + 270, TOP + 188);
  else doc.text('X', LEFT + 290, TOP + 188);

  // Box 11: Insured group
  doc.text(data.insuredGroupNumber, midX + 8, TOP + 162);

  // Box 11a: Insured DOB/Sex
  if (data.insuredDob) doc.text(data.insuredDob, midX + 8, TOP + 176);

  // Box 11c: Plan name
  doc.text(data.insurancePlanName, midX + 8, TOP + 190);

  // Box 12: Patient signature
  doc.text(data.patientSignature, LEFT + 8, TOP + 246);
  if (data.patientSignatureDate) doc.text(data.patientSignatureDate, LEFT + 200, TOP + 246);

  // Box 13: Insured signature
  doc.text(data.insuredSignature, midX + 8, TOP + 246);
}

function placeClaimData(doc: jsPDF, data: CMS1500Data) {
  doc.setFont('Courier', 'bold');
  doc.setFontSize(FONT_SIZE);

  const midX = (LEFT + RIGHT) / 2;

  // Box 14: Date of illness
  doc.text(data.dateOfIllness, LEFT + 8, TOP + 274);
  if (data.dateOfIllnessQualifier) {
    doc.setFontSize(SMALL_FONT);
    doc.text(`Qual: ${data.dateOfIllnessQualifier}`, LEFT + 120, TOP + 274);
    doc.setFontSize(FONT_SIZE);
  }

  // Box 17: Referring provider
  doc.text(data.referringProvider, LEFT + 8, TOP + 302);
  // Box 17a: Qualifier
  if (data.referringProviderQualifier) {
    doc.text(data.referringProviderQualifier, midX + 8, TOP + 302);
  }
  // Box 17b: NPI
  if (data.referringProviderNpi) {
    doc.text(data.referringProviderNpi, midX + 80, TOP + 302);
  }

  // Box 19: Additional claim info
  if (data.additionalClaimInfo) {
    doc.setFontSize(6);
    doc.text(data.additionalClaimInfo.slice(0, 80), LEFT + 8, TOP + 330);
    doc.setFontSize(FONT_SIZE);
  }

  // Box 22: Resubmission code
  if (data.resubmissionCode) doc.text(data.resubmissionCode, LEFT + 8, TOP + 374);
  if (data.originalRefNumber) doc.text(data.originalRefNumber, LEFT + 100, TOP + 374);

  // Box 23: Prior auth
  doc.text(data.priorAuthNumber, midX + 8, TOP + 374);
}

function placeDiagnoses(doc: jsPDF, data: CMS1500Data) {
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
    doc.text(`${letter}.`, x, y);
    doc.setFontSize(FONT_SIZE);
    doc.text(data.diagnoses[i] || '', x + 12, y);
  }
}

function placeServiceLines(doc: jsPDF, data: CMS1500Data, page: number) {
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

    // Date From (Col A)
    doc.text(line.dateFrom, LEFT + 4, y);
    // Date To (Col A cont)
    doc.text(line.dateTo, LEFT + 58, y);
    // Place of Service (Col B)
    doc.text(line.placeOfService, LEFT + 110, y);
    // EMG (Col C)
    doc.text(line.emg, LEFT + 130, y);
    // CPT/HCPCS (Col D)
    doc.text(line.cptCode, LEFT + 148, y);
    // Modifiers
    doc.text(line.modifier1, LEFT + 200, y);
    doc.text(line.modifier2, LEFT + 222, y);
    doc.text(line.modifier3, LEFT + 244, y);
    doc.text(line.modifier4, LEFT + 266, y);
    // Diagnosis pointer (Col E)
    doc.text(line.diagnosisPointers, LEFT + 290, y);
    // Charges (Col F)
    doc.text(line.charges, LEFT + 320, y);
    // Units (Col G)
    doc.text(line.units, LEFT + 388, y);
    // Rendering NPI (Col J)
    doc.text(line.renderingNpi, LEFT + 430, y);
  }
}

function placeTotals(doc: jsPDF, data: CMS1500Data) {
  doc.setFont('Courier', 'bold');
  doc.setFontSize(FONT_SIZE);

  // Box 25: Federal Tax ID
  doc.text(data.federalTaxId, LEFT + 8, TOP + 574);
  if (data.federalTaxIdType === 'SSN') doc.text('X', LEFT + 130, TOP + 574);
  if (data.federalTaxIdType === 'EIN') doc.text('X', LEFT + 150, TOP + 574);

  // Box 26: Patient account number
  doc.text(data.patientAccountNumber, LEFT + 208, TOP + 574);

  // Box 27: Accept assignment
  if (data.acceptAssignment) doc.text('X', LEFT + 348, TOP + 574);
  else doc.text('X', LEFT + 380, TOP + 574);

  // Box 28: Total charge
  doc.text(data.totalCharge, RIGHT - 100, TOP + 574);

  // Box 29: Amount paid
  doc.text(data.amountPaid, LEFT + 8, TOP + 604);
}

function placeProviderData(doc: jsPDF, data: CMS1500Data) {
  doc.setFont('Courier', 'bold');
  doc.setFontSize(7);

  // Box 31: Physician signature
  doc.text(data.physicianSignature, LEFT + 8, TOP + 640);
  doc.text(data.physicianSignatureDate, LEFT + 8, TOP + 650);

  // Box 32: Service facility
  doc.text(data.serviceFacilityName, LEFT + 208, TOP + 634);
  doc.text(data.serviceFacilityAddress, LEFT + 208, TOP + 644);
  doc.text(
    `${data.serviceFacilityCity}${data.serviceFacilityState ? ', ' + data.serviceFacilityState : ''} ${data.serviceFacilityZip}`,
    LEFT + 208, TOP + 654
  );
  // Box 32a: NPI
  doc.text(data.serviceFacilityNpi, LEFT + 208, TOP + 664);

  // Box 33: Billing provider
  doc.text(data.billingProviderName, RIGHT - 172, TOP + 634);
  doc.text(data.billingProviderAddress, RIGHT - 172, TOP + 644);
  doc.text(
    `${data.billingProviderCity}${data.billingProviderState ? ', ' + data.billingProviderState : ''} ${data.billingProviderZip}`,
    RIGHT - 172, TOP + 654
  );
  doc.text(data.billingProviderPhone, RIGHT - 172, TOP + 664);
  // Box 33a: NPI
  doc.setFontSize(SMALL_FONT);
  doc.text('NPI:', RIGHT - 172, TOP + 674);
  doc.setFontSize(7);
  doc.text(data.billingProviderNpi, RIGHT - 150, TOP + 674);
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
