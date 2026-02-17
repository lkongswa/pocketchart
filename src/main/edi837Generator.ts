/**
 * 837P (Professional) EDI File Generator
 *
 * Generates ANSI X12 837P v5010 format from PocketChart data.
 * Maps the same data sources as cms1500Generator.ts but outputs
 * X12 EDI segments instead of PDF coordinates.
 *
 * References:
 * - ASC X12N 837 005010X222A1 (Professional)
 * - CMS-1500 (02/12) field mapping
 */

// ── Types ──

export interface EDI837PInput {
  practice: {
    name: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    phone: string;
    npi: string;
    tax_id: string;
    taxonomy_code: string;
  };
  client: {
    id: number;
    first_name: string;
    last_name: string;
    dob: string; // YYYY-MM-DD
    gender: string; // M/F/U
    address: string;
    city: string;
    state: string;
    zip: string;
    phone: string;
    insurance_payer: string;
    insurance_payer_id: string;
    insurance_member_id: string;
    insurance_group: string;
    subscriber_relationship: string; // 18=Self, 01=Spouse, etc.
    subscriber_first_name: string;
    subscriber_last_name: string;
    subscriber_dob: string;
    primary_dx_code: string;
    secondary_dx: string; // JSON array
    onset_date: string;
    onset_qualifier: string;
    referring_physician: string;
    referring_npi: string;
    referring_physician_qualifier: string;
    prior_auth_number: string;
    claim_accept_assignment: string;
    employment_related: string;
    auto_accident: string;
    auto_accident_state: string;
    other_accident: string;
  };
  claim: {
    id: number;
    claim_number: string;
    total_charge: number;
  };
  serviceLines: Array<{
    line_number: number;
    service_date: string; // YYYY-MM-DD
    cpt_code: string;
    modifiers: string[]; // e.g., ['GN', '59']
    units: number;
    charge_amount: number;
    diagnosis_pointers: number[]; // e.g., [1, 2]
    place_of_service: string;
    rendering_npi?: string;
  }>;
  clearinghouseConfig: {
    submitterId: string;
    receiverId: string;
  };
}

// ── Helpers ──

/** Format YYYY-MM-DD to YYYYMMDD */
function formatDate8(dateStr: string): string {
  if (!dateStr) return '';
  return dateStr.replace(/-/g, '');
}

/** Format current time as HHMM */
function formatTime4(): string {
  const now = new Date();
  return `${String(now.getHours()).padStart(2, '0')}${String(now.getMinutes()).padStart(2, '0')}`;
}

/** Format current date as YYMMDD (ISA format) */
function formatDateISA(): string {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yy}${mm}${dd}`;
}

/** Format current date as CCYYMMDD */
function formatDateFull(): string {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const dd = String(now.getDate()).padStart(2, '0');
  return `${yyyy}${mm}${dd}`;
}

/** Pad string to width with trailing spaces */
function padRight(str: string, width: number): string {
  return (str || '').padEnd(width, ' ').slice(0, width);
}

/** Pad number to width with leading zeros */
function padLeft(numOrStr: string | number, width: number): string {
  return String(numOrStr).padStart(width, '0');
}

/** Clean string for EDI (no special chars) */
function ediClean(str: string): string {
  return (str || '').replace(/[~*:^\\]/g, '').trim();
}

/** Map diagnosis pointer numbers to letters (1→A, 2→B, etc.) */
function pointerToLetters(pointers: number[]): string {
  return pointers.map(p => String.fromCharCode(64 + p)).join(':');
}

// ── Generator ──

/**
 * Generate an 837P X12 EDI file from PocketChart data.
 *
 * @returns Complete 837P file content as a string
 */
export function generate837P(input: EDI837PInput, controlNumber: number): string {
  const segments: string[] = [];
  const seg = (content: string) => segments.push(content);

  const { practice, client, claim, serviceLines, clearinghouseConfig } = input;
  const ctrlNum = padLeft(controlNumber, 9);
  const date8 = formatDateFull();
  const dateISA = formatDateISA();
  const time4 = formatTime4();

  // Parse diagnoses
  let secondaryDx: Array<{ code: string }> = [];
  try { secondaryDx = JSON.parse(client.secondary_dx || '[]'); } catch {}
  const allDx = [client.primary_dx_code, ...secondaryDx.map(d => d.code)].filter(Boolean);

  const isSelf = client.subscriber_relationship === '18' || !client.subscriber_relationship;
  const genderCode = client.gender === 'M' ? 'M' : client.gender === 'F' ? 'F' : 'U';

  let segCount = 0;
  const countSeg = (content: string) => { seg(content); segCount++; };

  // ── ISA: Interchange Control Header ──
  seg(
    `ISA*00*${padRight('', 10)}*00*${padRight('', 10)}*ZZ*${padRight(clearinghouseConfig.submitterId, 15)}*ZZ*${padRight(clearinghouseConfig.receiverId, 15)}*${dateISA}*${time4}*^*00501*${ctrlNum}*0*P*:~`
  );

  // ── GS: Functional Group Header ──
  seg(
    `GS*HC*${ediClean(clearinghouseConfig.submitterId)}*${ediClean(clearinghouseConfig.receiverId)}*${date8}*${time4}*${controlNumber}*X*005010X222A1~`
  );

  // ── ST: Transaction Set Header ──
  countSeg(`ST*837*${padLeft(1, 4)}*005010X222A1~`);

  // ── BHT: Beginning of Hierarchical Transaction ──
  countSeg(`BHT*0019*00*${ediClean(claim.claim_number)}*${date8}*${time4}*CH~`);

  // ── Loop 1000A: Submitter ──
  countSeg(`NM1*41*1*${ediClean(practice.name)}*****46*${ediClean(practice.npi)}~`);
  countSeg(`PER*IC*${ediClean(practice.name)}*TE*${ediClean(practice.phone)}~`);

  // ── Loop 1000B: Receiver ──
  countSeg(`NM1*40*2*${ediClean(clearinghouseConfig.receiverId)}*****46*${ediClean(clearinghouseConfig.receiverId)}~`);

  // ── Loop 2000A: Billing Provider Hierarchical Level ──
  let hlCounter = 1;
  const billingHL = hlCounter;
  countSeg(`HL*${billingHL}**20*1~`);

  // Billing provider taxonomy
  if (practice.taxonomy_code) {
    countSeg(`PRV*BI*PXC*${ediClean(practice.taxonomy_code)}~`);
  }

  // ── Loop 2010AA: Billing Provider Name ──
  // For solo practice, use entity type "1" (person) if name looks like a person, "2" (non-person) otherwise
  countSeg(`NM1*85*2*${ediClean(practice.name)}*****XX*${ediClean(practice.npi)}~`);
  countSeg(`N3*${ediClean(practice.address)}~`);
  countSeg(`N4*${ediClean(practice.city)}*${ediClean(practice.state)}*${ediClean(practice.zip)}~`);
  countSeg(`REF*EI*${ediClean(practice.tax_id)}~`);

  // ── Loop 2000B: Subscriber Hierarchical Level ──
  hlCounter++;
  const subscriberHL = hlCounter;
  // If patient = subscriber, HL patient level indicator = 0 (no child HL)
  // If patient ≠ subscriber, = 1 (patient HL follows)
  const hasPatientLevel = !isSelf;
  countSeg(`HL*${subscriberHL}*${billingHL}*22*${hasPatientLevel ? '1' : '0'}~`);

  // SBR: Subscriber Information
  const sbrRelCode = isSelf ? '18' : client.subscriber_relationship || '18';
  countSeg(`SBR*P*${sbrRelCode}*${ediClean(client.insurance_group)}******CI~`);

  // ── Loop 2010BA: Subscriber Name ──
  if (isSelf) {
    countSeg(`NM1*IL*1*${ediClean(client.last_name)}*${ediClean(client.first_name)}****MI*${ediClean(client.insurance_member_id)}~`);
    countSeg(`N3*${ediClean(client.address)}~`);
    countSeg(`N4*${ediClean(client.city)}*${ediClean(client.state)}*${ediClean(client.zip)}~`);
    countSeg(`DMG*D8*${formatDate8(client.dob)}*${genderCode}~`);
  } else {
    countSeg(`NM1*IL*1*${ediClean(client.subscriber_last_name)}*${ediClean(client.subscriber_first_name)}****MI*${ediClean(client.insurance_member_id)}~`);
    // Subscriber demographics
    if (client.subscriber_dob) {
      countSeg(`DMG*D8*${formatDate8(client.subscriber_dob)}~`);
    }
  }

  // ── Loop 2010BB: Payer Name ──
  countSeg(`NM1*PR*2*${ediClean(client.insurance_payer)}****PI*${ediClean(client.insurance_payer_id)}~`);

  // ── Loop 2000C: Patient Hierarchical Level (only if patient ≠ subscriber) ──
  if (!isSelf) {
    hlCounter++;
    countSeg(`HL*${hlCounter}*${subscriberHL}*23*0~`);
    countSeg(`PAT*${sbrRelCode}~`);

    // Loop 2010CA: Patient Name
    countSeg(`NM1*QC*1*${ediClean(client.last_name)}*${ediClean(client.first_name)}~`);
    countSeg(`N3*${ediClean(client.address)}~`);
    countSeg(`N4*${ediClean(client.city)}*${ediClean(client.state)}*${ediClean(client.zip)}~`);
    countSeg(`DMG*D8*${formatDate8(client.dob)}*${genderCode}~`);
  }

  // ── Loop 2300: Claim Information ──
  const posCode = serviceLines[0]?.place_of_service || '11';
  const acceptAssign = client.claim_accept_assignment !== 'N' ? 'Y' : 'N';
  countSeg(`CLM*${ediClean(String(client.id))}*${claim.total_charge.toFixed(2)}***${posCode}:B:1*${acceptAssign}*A*${acceptAssign}*Y~`);

  // Onset date
  if (client.onset_date) {
    const qualifier = client.onset_qualifier || '431';
    countSeg(`DTP*${qualifier}*D8*${formatDate8(client.onset_date)}~`);
  }

  // Diagnosis codes (HI segment)
  if (allDx.length > 0) {
    // First diagnosis uses ABK qualifier
    const hiParts = allDx.map((dx, i) => {
      const qual = i === 0 ? 'ABK' : 'ABF';
      return `${qual}:${ediClean(dx)}`;
    });
    countSeg(`HI*${hiParts.join('*')}~`);
  }

  // Prior authorization
  if (client.prior_auth_number) {
    countSeg(`REF*G1*${ediClean(client.prior_auth_number)}~`);
  }

  // ── Loop 2310A: Referring Provider ──
  if (client.referring_physician && client.referring_npi) {
    const refParts = client.referring_physician.split(/[,\s]+/).filter(Boolean);
    const refLast = refParts[0] || '';
    const refFirst = refParts.slice(1).join(' ') || '';
    const refQual = client.referring_physician_qualifier || 'DN';
    countSeg(`NM1*${refQual}*1*${ediClean(refLast)}*${ediClean(refFirst)}****XX*${ediClean(client.referring_npi)}~`);
  }

  // ── Loop 2400: Service Lines ──
  serviceLines.forEach((line, idx) => {
    // LX: Line number
    countSeg(`LX*${idx + 1}~`);

    // SV1: Professional service
    const modStr = line.modifiers.filter(Boolean).join(':');
    const cptWithMods = modStr
      ? `HC:${ediClean(line.cpt_code)}:${modStr}`
      : `HC:${ediClean(line.cpt_code)}`;

    // Diagnosis pointer mapping (1→1, 2→2, etc.)
    const pointers = line.diagnosis_pointers.join(':');

    countSeg(`SV1*${cptWithMods}*${line.charge_amount.toFixed(2)}*UN*${line.units}***${pointers}~`);

    // DTP: Service date
    countSeg(`DTP*472*D8*${formatDate8(line.service_date)}~`);

    // REF: Line control number
    countSeg(`REF*6R*${ediClean(claim.claim_number)}-${idx + 1}~`);

    // Rendering provider (if different from billing)
    if (line.rendering_npi && line.rendering_npi !== practice.npi) {
      countSeg(`NM1*82*1*${ediClean(practice.name)}*****XX*${ediClean(line.rendering_npi)}~`);
    }
  });

  // ── SE: Transaction Set Trailer ──
  segCount++; // Count the SE segment itself
  seg(`SE*${segCount}*${padLeft(1, 4)}~`);

  // ── GE: Functional Group Trailer ──
  seg(`GE*1*${controlNumber}~`);

  // ── IEA: Interchange Control Trailer ──
  seg(`IEA*1*${ctrlNum}~`);

  return segments.join('\n');
}

/**
 * Assemble 837P input from PocketChart database records.
 * Mirrors cms1500Generator.assembleCMS1500Data in data sourcing.
 */
export function assemble837PInput(params: {
  client: any;
  practice: any;
  notes: any[];
  claimNumber: string;
  claimId: number;
  submitterId: string;
  receiverId: string;
}): EDI837PInput {
  const { client, practice, notes, claimNumber, claimId, submitterId, receiverId } = params;

  // Build service lines from notes
  const serviceLines = notes.map((note: any, idx: number) => {
    let cptLines: Array<{ code: string; units: number }> = [];
    try { cptLines = JSON.parse(note.cpt_codes || '[]'); } catch {}
    if (cptLines.length === 0 && note.cpt_code) {
      cptLines = [{ code: note.cpt_code, units: note.units || 1 }];
    }

    let modifiers: string[] = [];
    try { modifiers = JSON.parse(note.cpt_modifiers || '[]'); } catch {}

    let diagPointers: number[] = [];
    try { diagPointers = JSON.parse(note.diagnosis_pointers || '[1]'); } catch {}

    const mainCpt = cptLines[0] || { code: '', units: 1 };

    return {
      line_number: idx + 1,
      service_date: note.date_of_service || '',
      cpt_code: mainCpt.code,
      modifiers,
      units: mainCpt.units || 1,
      charge_amount: note.charge_amount || 0,
      diagnosis_pointers: diagPointers,
      place_of_service: note.place_of_service || '11',
      rendering_npi: note.rendering_provider_npi || undefined,
    };
  });

  const totalCharge = serviceLines.reduce((sum: number, l: any) => sum + l.charge_amount, 0);

  return {
    practice: {
      name: practice.name || '',
      address: practice.address || '',
      city: practice.city || '',
      state: practice.state || '',
      zip: practice.zip || '',
      phone: practice.phone || '',
      npi: practice.npi || '',
      tax_id: practice.tax_id || '',
      taxonomy_code: practice.taxonomy_code || '',
    },
    client: {
      id: client.id,
      first_name: client.first_name || '',
      last_name: client.last_name || '',
      dob: client.dob || '',
      gender: client.gender || '',
      address: client.address || '',
      city: client.city || '',
      state: client.state || '',
      zip: client.zip || '',
      phone: client.phone || '',
      insurance_payer: client.insurance_payer || '',
      insurance_payer_id: client.insurance_payer_id || '',
      insurance_member_id: client.insurance_member_id || '',
      insurance_group: client.insurance_group || '',
      subscriber_relationship: client.subscriber_relationship || '18',
      subscriber_first_name: client.subscriber_first_name || '',
      subscriber_last_name: client.subscriber_last_name || '',
      subscriber_dob: client.subscriber_dob || '',
      primary_dx_code: client.primary_dx_code || '',
      secondary_dx: client.secondary_dx || '[]',
      onset_date: client.onset_date || '',
      onset_qualifier: client.onset_qualifier || '',
      referring_physician: client.referring_physician || '',
      referring_npi: client.referring_npi || '',
      referring_physician_qualifier: client.referring_physician_qualifier || '',
      prior_auth_number: client.prior_auth_number || '',
      claim_accept_assignment: client.claim_accept_assignment || 'Y',
      employment_related: client.employment_related || 'N',
      auto_accident: client.auto_accident || 'N',
      auto_accident_state: client.auto_accident_state || '',
      other_accident: client.other_accident || 'N',
    },
    claim: {
      id: claimId,
      claim_number: claimNumber,
      total_charge: totalCharge,
    },
    serviceLines,
    clearinghouseConfig: {
      submitterId,
      receiverId,
    },
  };
}
