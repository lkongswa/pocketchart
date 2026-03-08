import type BetterSqlite3 from 'better-sqlite3';

export function seedDefaultData(db: BetterSqlite3.Database): void {
  const hasData = db.prepare('SELECT COUNT(*) as count FROM note_bank').get() as any;
  if (hasData.count > 0) return;

  const insertNoteBank = db.prepare(
    'INSERT INTO note_bank (discipline, category, section, phrase, is_default) VALUES (?, ?, ?, ?, 1)'
  );

  const seedTransaction = db.transaction(() => {
    // ── PT Note Bank ──
    // Subjective
    insertNoteBank.run('PT', 'pain', 'S', 'Pt reports pain at ___/10 at rest, ___/10 with activity.');
    insertNoteBank.run('PT', 'pain', 'S', 'Pt reports pain has decreased since last session.');
    insertNoteBank.run('PT', 'pain', 'S', 'Pt reports pain has increased since last session.');
    insertNoteBank.run('PT', 'pain', 'S', 'Pt reports stiffness in the morning lasting ___ minutes.');
    insertNoteBank.run('PT', 'function', 'S', 'Pt reports improved ability to perform daily activities.');
    insertNoteBank.run('PT', 'function', 'S', 'Pt reports difficulty with stairs, requiring use of railing.');
    insertNoteBank.run('PT', 'function', 'S', 'Pt reports completing HEP ___ times since last visit.');
    insertNoteBank.run('PT', 'function', 'S', 'Pt reports ability to walk ___ without increased symptoms.');
    insertNoteBank.run('PT', 'general', 'S', 'Pt reports no new complaints or concerns.');
    insertNoteBank.run('PT', 'general', 'S', 'Pt reports medication changes: ___.');

    // Objective
    insertNoteBank.run('PT', 'ROM', 'O', 'AROM ___ WNL. PROM ___ WNL.');
    insertNoteBank.run('PT', 'ROM', 'O', 'AROM ___ limited to ___ degrees. PROM ___ to ___ degrees.');
    insertNoteBank.run('PT', 'ROM', 'O', 'Cervical ROM: flexion ___°, extension ___°, rotation L/R ___°/___°.');
    insertNoteBank.run('PT', 'strength', 'O', 'MMT: ___ ___ graded ___/5.');
    insertNoteBank.run('PT', 'strength', 'O', 'Grip strength R/L: ___/___lbs.');
    insertNoteBank.run('PT', 'gait', 'O', 'Pt ambulated ___ ft with ___ device and ___ assist.');
    insertNoteBank.run('PT', 'gait', 'O', 'Gait pattern: ___ deviation noted in ___ phase.');
    insertNoteBank.run('PT', 'gait', 'O', 'Pt ambulated on level surfaces with normalized gait pattern.');
    insertNoteBank.run('PT', 'balance', 'O', 'Static standing balance: ___ for ___ seconds.');
    insertNoteBank.run('PT', 'balance', 'O', 'Dynamic balance assessed with tandem walk: ___.');
    insertNoteBank.run('PT', 'balance', 'O', 'Berg Balance Scale score: ___/56.');
    insertNoteBank.run('PT', 'mobility', 'O', 'Pt tolerated ___ min upright activity with ___ assist for balance.');
    insertNoteBank.run('PT', 'mobility', 'O', 'Transfers: sit-to-stand with ___ assist. Bed mobility with ___ assist.');
    insertNoteBank.run('PT', 'mobility', 'O', 'Pt performed ___ reps of ___ with ___ form.');
    insertNoteBank.run('PT', 'posture', 'O', 'Posture: forward head position, rounded shoulders noted.');
    insertNoteBank.run('PT', 'posture', 'O', 'Postural assessment reveals ___ deviation.');
    insertNoteBank.run('PT', 'palpation', 'O', 'Palpation reveals tenderness over ___, with ___ tone.');
    insertNoteBank.run('PT', 'special_tests', 'O', 'Special tests: ___ positive/negative.');

    // Assessment
    insertNoteBank.run('PT', 'progress', 'A', 'Pt making good progress toward established goals.');
    insertNoteBank.run('PT', 'progress', 'A', 'Pt demonstrates improved ___ compared to initial evaluation.');
    insertNoteBank.run('PT', 'progress', 'A', 'Pt continues to require skilled PT for ___.');
    insertNoteBank.run('PT', 'progress', 'A', 'Pt presents with functional limitations requiring continued skilled intervention.');
    insertNoteBank.run('PT', 'progress', 'A', 'Pt has met ___ of ___ short-term goals.');
    insertNoteBank.run('PT', 'response', 'A', 'Pt tolerated treatment well with no adverse reactions.');
    insertNoteBank.run('PT', 'response', 'A', 'Pt responded well to manual therapy techniques applied to ___.');

    // Plan
    insertNoteBank.run('PT', 'next_session', 'P', 'Continue current POC. Focus on ___ next session.');
    insertNoteBank.run('PT', 'next_session', 'P', 'Progress exercises as tolerated. Advance ___ next visit.');
    insertNoteBank.run('PT', 'HEP', 'P', 'Updated HEP: added ___, reviewed proper form.');
    insertNoteBank.run('PT', 'HEP', 'P', 'Pt educated on importance of home exercise compliance.');
    insertNoteBank.run('PT', 'discharge', 'P', 'Pt approaching discharge criteria. Plan to D/C in ___ visits.');
    insertNoteBank.run('PT', 'discharge', 'P', 'Continue PT ___ x/week for ___ weeks. Reassess at that time.');

    // ── OT Note Bank ──
    // Subjective
    insertNoteBank.run('OT', 'ADL', 'S', 'Pt reports difficulty with ___ (dressing/bathing/grooming/feeding).');
    insertNoteBank.run('OT', 'ADL', 'S', 'Pt reports improved independence with ___ since last session.');
    insertNoteBank.run('OT', 'ADL', 'S', 'Pt reports need for assistance with meal preparation.');
    insertNoteBank.run('OT', 'function', 'S', 'Pt reports difficulty grasping small objects.');
    insertNoteBank.run('OT', 'function', 'S', 'Pt reports completing HEP ___ times since last visit.');
    insertNoteBank.run('OT', 'cognition', 'S', 'Pt/caregiver reports difficulty with memory and sequencing daily tasks.');
    insertNoteBank.run('OT', 'general', 'S', 'Pt reports no new complaints or concerns.');
    insertNoteBank.run('OT', 'pain', 'S', 'Pt reports pain at ___/10 during functional activities.');

    // Objective
    insertNoteBank.run('OT', 'ADL', 'O', 'Pt completed upper body dressing with ___ assist.');
    insertNoteBank.run('OT', 'ADL', 'O', 'Pt completed grooming tasks with ___ assist, ___ setup.');
    insertNoteBank.run('OT', 'ADL', 'O', 'Pt demonstrated improved sequencing for ___-step ADL tasks.');
    insertNoteBank.run('OT', 'ADL', 'O', 'Bathing: Pt required ___ assist for ___, independent with ___.');
    insertNoteBank.run('OT', 'hand', 'O', 'Grip strength R/L: ___/___lbs. Pinch strength: ___/___lbs.');
    insertNoteBank.run('OT', 'hand', 'O', 'Fine motor coordination: Pt completed ___ with ___ accuracy.');
    insertNoteBank.run('OT', 'hand', 'O', 'Pt demonstrated ___ grasp pattern for functional tasks.');
    insertNoteBank.run('OT', 'cognition', 'O', 'Pt oriented to person, place, time, situation: ___.');
    insertNoteBank.run('OT', 'cognition', 'O', 'Attention/concentration: Pt sustained attention for ___ min on ___ task.');
    insertNoteBank.run('OT', 'cognition', 'O', 'Pt followed ___-step commands with ___ verbal cues.');
    insertNoteBank.run('OT', 'sensory', 'O', 'Sensation intact/impaired to light touch, sharp/dull in ___.');
    insertNoteBank.run('OT', 'visual', 'O', 'Visual-perceptual assessment: ___ noted.');
    insertNoteBank.run('OT', 'UE_function', 'O', 'UE AROM: shoulder flexion ___°, abduction ___°, elbow flexion ___°.');
    insertNoteBank.run('OT', 'home_safety', 'O', 'Home safety evaluation: identified ___ barriers to independence.');

    // Assessment
    insertNoteBank.run('OT', 'progress', 'A', 'Pt making progress toward functional independence in ___.');
    insertNoteBank.run('OT', 'progress', 'A', 'Pt demonstrates improved ___ since initial evaluation.');
    insertNoteBank.run('OT', 'progress', 'A', 'Pt continues to require skilled OT for ADL training and ___.');
    insertNoteBank.run('OT', 'response', 'A', 'Pt tolerated treatment well, demonstrating ___ carryover of techniques.');
    insertNoteBank.run('OT', 'response', 'A', 'Adaptive equipment trial: Pt benefited from use of ___ for ___.');

    // Plan
    insertNoteBank.run('OT', 'next_session', 'P', 'Continue current POC. Focus on ___ training next session.');
    insertNoteBank.run('OT', 'next_session', 'P', 'Progress ADL training. Introduce ___ next visit.');
    insertNoteBank.run('OT', 'HEP', 'P', 'Updated HEP: added ___ exercises for ___.');
    insertNoteBank.run('OT', 'equipment', 'P', 'Recommend adaptive equipment: ___ for improved independence.');
    insertNoteBank.run('OT', 'discharge', 'P', 'Approaching discharge. Plan D/C when Pt achieves ___ with ADLs.');
    insertNoteBank.run('OT', 'discharge', 'P', 'Continue OT ___ x/week for ___ weeks. Reassess at that time.');

    // ── ST Note Bank ──
    // Subjective
    insertNoteBank.run('ST', 'speech', 'S', 'Pt reports difficulty being understood by communication partners.');
    insertNoteBank.run('ST', 'speech', 'S', 'Pt/caregiver reports improved speech clarity since last session.');
    insertNoteBank.run('ST', 'language', 'S', 'Pt reports word-finding difficulties in conversation.');
    insertNoteBank.run('ST', 'language', 'S', 'Pt/caregiver reports difficulty following complex directions.');
    insertNoteBank.run('ST', 'swallowing', 'S', 'Pt reports coughing/choking during meals with ___ consistency.');
    insertNoteBank.run('ST', 'swallowing', 'S', 'Pt reports food sticking in throat during meals.');
    insertNoteBank.run('ST', 'voice', 'S', 'Pt reports hoarseness/vocal fatigue, especially with ___.');
    insertNoteBank.run('ST', 'cognition', 'S', 'Pt/caregiver reports difficulty with memory, attention, and problem-solving.');
    insertNoteBank.run('ST', 'general', 'S', 'Pt reports no new complaints or concerns.');
    insertNoteBank.run('ST', 'fluency', 'S', 'Pt reports increased stuttering frequency in ___ situations.');

    // Objective
    insertNoteBank.run('ST', 'speech', 'O', 'Pt produced ___% intelligible speech in structured sentences.');
    insertNoteBank.run('ST', 'speech', 'O', 'Pt produced ___% intelligible speech in conversation.');
    insertNoteBank.run('ST', 'speech', 'O', 'Articulation: ___ errors noted on ___ sounds in ___ position(s).');
    insertNoteBank.run('ST', 'speech', 'O', 'Speech rate: ___ (WNL/slow/fast). Prosody: ___.');
    insertNoteBank.run('ST', 'language', 'O', 'Auditory comprehension: Pt followed ___-step commands with ___% accuracy.');
    insertNoteBank.run('ST', 'language', 'O', 'Expressive language: Pt named ___/10 objects. Word retrieval: ___.');
    insertNoteBank.run('ST', 'language', 'O', 'Reading comprehension: ___% accuracy at ___ level.');
    insertNoteBank.run('ST', 'language', 'O', 'Written expression: Pt wrote ___ with ___ errors in ___.');
    insertNoteBank.run('ST', 'voice', 'O', 'Voice quality: ___. Pitch: ___. Loudness: ___. MPT: ___ seconds.');
    insertNoteBank.run('ST', 'voice', 'O', 'S/Z ratio: ___. CAPE-V severity: ___.');
    insertNoteBank.run('ST', 'fluency', 'O', 'Fluency: ___% syllables stuttered. Types of disfluencies: ___.');
    insertNoteBank.run('ST', 'swallowing', 'O', 'Oral motor exam: lip closure ___, tongue ROM ___, jaw strength ___.');
    insertNoteBank.run('ST', 'swallowing', 'O', 'Pt tolerated ___ consistency with ___ swallow strategy.');
    insertNoteBank.run('ST', 'swallowing', 'O', 'Signs/symptoms of aspiration: ___ during trial with ___.');
    insertNoteBank.run('ST', 'cognition', 'O', 'Attention: Pt sustained attention for ___ min on ___ task.');
    insertNoteBank.run('ST', 'cognition', 'O', 'Memory: Pt recalled ___/5 items after ___ min delay.');
    insertNoteBank.run('ST', 'cognition', 'O', 'Problem-solving: Pt identified ___/5 safety concerns in ___ scenario.');

    // Assessment
    insertNoteBank.run('ST', 'progress', 'A', 'Pt making progress toward communication/swallowing goals.');
    insertNoteBank.run('ST', 'progress', 'A', 'Pt demonstrates improved ___ compared to initial evaluation.');
    insertNoteBank.run('ST', 'progress', 'A', 'Pt continues to require skilled ST for ___.');
    insertNoteBank.run('ST', 'response', 'A', 'Pt responded well to ___ approach for ___.');
    insertNoteBank.run('ST', 'response', 'A', 'Pt tolerated treatment well with no adverse reactions.');

    // Plan
    insertNoteBank.run('ST', 'next_session', 'P', 'Continue current POC. Focus on ___ next session.');
    insertNoteBank.run('ST', 'next_session', 'P', 'Progress ___ tasks to ___ level. Increase complexity of ___.');
    insertNoteBank.run('ST', 'HEP', 'P', 'Updated HEP: added ___ practice activities.');
    insertNoteBank.run('ST', 'caregiver', 'P', 'Caregiver education provided on ___ strategies.');
    insertNoteBank.run('ST', 'discharge', 'P', 'Pt approaching discharge criteria. Plan to D/C in ___ sessions.');
    insertNoteBank.run('ST', 'discharge', 'P', 'Continue ST ___ x/week for ___ weeks. Reassess at that time.');
  });

  seedTransaction();
}

// Seed universal quick chips (ALL disciplines, favorited by default)
export function seedDefaultQuickChips(db: BetterSqlite3.Database): void {
  const defaultChips = [
    { discipline: 'ALL', section: 'S', category: 'general', phrase: 'Pt was ready for therapy.' },
    { discipline: 'ALL', section: 'A', category: 'response', phrase: 'Pt responded well to tx.' },
    { discipline: 'ALL', section: 'P', category: 'next_session', phrase: 'Continue current POC.' },
  ];

  const insertChip = db.prepare(
    'INSERT INTO note_bank (discipline, category, section, phrase, is_default, is_favorite) VALUES (?, ?, ?, ?, 1, 1)'
  );

  for (const chip of defaultChips) {
    // Only insert if this exact phrase doesn't already exist
    const exists = db.prepare(
      'SELECT id FROM note_bank WHERE discipline = ? AND section = ? AND phrase = ?'
    ).get(chip.discipline, chip.section, chip.phrase);
    if (!exists) {
      insertChip.run(chip.discipline, chip.category, chip.section, chip.phrase);
    }
  }
}

// Seed common payers for V3 insurance billing
export function seedPayers(db: BetterSqlite3.Database): void {
  // Check if payers table exists and has data
  try {
    const hasData = db.prepare('SELECT COUNT(*) as count FROM payers').get() as any;
    if (hasData.count > 0) return;
  } catch {
    // Table doesn't exist yet (migrations haven't run)
    return;
  }

  const insertPayer = db.prepare(
    'INSERT INTO payers (name, edi_payer_id, clearinghouse, enrollment_required, enrollment_status, notes) VALUES (?, ?, ?, ?, ?, ?)'
  );

  const commonPayers = [
    { name: 'Medicare', edi_payer_id: 'CMS', clearinghouse: '', enrollment_required: 1, notes: 'Federal Medicare program' },
    { name: 'Medicaid (California)', edi_payer_id: '', clearinghouse: '', enrollment_required: 1, notes: 'Medi-Cal' },
    { name: 'Blue Shield of California', edi_payer_id: '94146', clearinghouse: '', enrollment_required: 1, notes: '' },
    { name: 'Blue Cross of California', edi_payer_id: '47198', clearinghouse: '', enrollment_required: 1, notes: '' },
    { name: 'Aetna', edi_payer_id: '60054', clearinghouse: '', enrollment_required: 1, notes: '' },
    { name: 'Cigna', edi_payer_id: '62308', clearinghouse: '', enrollment_required: 1, notes: '' },
    { name: 'UnitedHealthcare', edi_payer_id: '87726', clearinghouse: '', enrollment_required: 1, notes: '' },
    { name: 'Anthem', edi_payer_id: '47198', clearinghouse: '', enrollment_required: 1, notes: '' },
    { name: 'Humana', edi_payer_id: '61101', clearinghouse: '', enrollment_required: 1, notes: '' },
    { name: 'Kaiser Permanente', edi_payer_id: '94154', clearinghouse: '', enrollment_required: 1, notes: '' },
    { name: 'TRICARE', edi_payer_id: '99726', clearinghouse: '', enrollment_required: 1, notes: 'Military health system' },
  ];

  const seedTransaction = db.transaction(() => {
    for (const payer of commonPayers) {
      insertPayer.run(payer.name, payer.edi_payer_id, payer.clearinghouse, payer.enrollment_required, 'not_started', payer.notes);
    }
  });

  seedTransaction();
}

// Seed MFT discipline data (note bank, goals bank, CPT codes)
// Runs separately from seedDefaultData so existing users get MFT phrases on update
export function seedMFTData(db: BetterSqlite3.Database): void {
  const hasData = db.prepare(
    "SELECT COUNT(*) as count FROM note_bank WHERE discipline = 'MFT'"
  ).get() as any;
  if (hasData.count > 0) return;

  const insertNoteBank = db.prepare(
    'INSERT INTO note_bank (discipline, category, section, phrase, is_default) VALUES (?, ?, ?, ?, 1)'
  );

  const seedTransaction = db.transaction(() => {
    // ── MFT Note Bank ──
    // Subjective / Data / Behavior (mapped to 'S' field)
    insertNoteBank.run('MFT', 'presenting_problem', 'S', 'Client reports increased conflict with ___ (spouse/partner/family member) regarding ___.');
    insertNoteBank.run('MFT', 'presenting_problem', 'S', 'Client reports feelings of ___ (anxiety/depression/hopelessness) related to relationship difficulties.');
    insertNoteBank.run('MFT', 'presenting_problem', 'S', 'Client describes pattern of ___ (avoidance/withdrawal/escalation) during disagreements.');
    insertNoteBank.run('MFT', 'presenting_problem', 'S', 'Client reports difficulty communicating needs to ___.');
    insertNoteBank.run('MFT', 'presenting_problem', 'S', 'Client reports trauma history impacting current relationship functioning.');
    insertNoteBank.run('MFT', 'mood', 'S', 'Client presents with ___ mood and ___ affect.');
    insertNoteBank.run('MFT', 'mood', 'S', 'Client reports mood has been ___ since last session.');
    insertNoteBank.run('MFT', 'mood', 'S', 'Client denies suicidal/homicidal ideation.');
    insertNoteBank.run('MFT', 'family', 'S', 'Client reports family dynamics have ___ (improved/worsened/remained the same) since last session.');
    insertNoteBank.run('MFT', 'family', 'S', 'Client reports stressor related to ___ (parenting/finances/extended family/transitions).');
    insertNoteBank.run('MFT', 'family', 'S', 'Client reports using coping strategies discussed in previous session with ___ effectiveness.');
    insertNoteBank.run('MFT', 'general', 'S', 'Client was on time and engaged in session.');
    insertNoteBank.run('MFT', 'general', 'S', 'Client reports no new complaints or concerns since last session.');
    insertNoteBank.run('MFT', 'general', 'S', 'Client reports medication changes: ___.');
    insertNoteBank.run('MFT', 'general', 'S', 'Client reports sleep has been ___ (adequate/poor/disrupted).');

    // Objective / Intervention (mapped to 'O' field)
    insertNoteBank.run('MFT', 'intervention', 'O', 'Therapist utilized ___ (CBT/DBT/EFT/Gottman/structural/narrative) techniques to address ___.');
    insertNoteBank.run('MFT', 'intervention', 'O', 'Therapist facilitated communication exercise between ___ and ___.');
    insertNoteBank.run('MFT', 'intervention', 'O', 'Therapist provided psychoeducation on ___ (attachment styles/communication patterns/trauma responses/family systems).');
    insertNoteBank.run('MFT', 'intervention', 'O', 'Therapist used reflective listening and reframing to address cognitive distortions.');
    insertNoteBank.run('MFT', 'intervention', 'O', 'Therapist guided client through ___ (grounding/relaxation/mindfulness) exercise.');
    insertNoteBank.run('MFT', 'intervention', 'O', 'Therapist explored family-of-origin patterns contributing to current relational dynamics.');
    insertNoteBank.run('MFT', 'intervention', 'O', 'Therapist conducted risk assessment; client denies SI/HI, no plan or intent.');
    insertNoteBank.run('MFT', 'mental_status', 'O', 'Mental status: Client was alert and oriented x4. Appearance: ___. Thought process: ___.');
    insertNoteBank.run('MFT', 'mental_status', 'O', 'Affect was ___ (congruent/incongruent) with reported mood.');
    insertNoteBank.run('MFT', 'mental_status', 'O', 'Judgment and insight: ___.');
    insertNoteBank.run('MFT', 'observation', 'O', 'Client demonstrated ___ (improved/limited) ability to identify emotional triggers during session.');
    insertNoteBank.run('MFT', 'observation', 'O', 'Client and ___ demonstrated ___ (improved/limited) use of active listening skills during joint session.');
    insertNoteBank.run('MFT', 'observation', 'O', 'Client became visibly ___ (tearful/agitated/withdrawn) when discussing ___.');

    // Assessment / Response (mapped to 'A' field)
    insertNoteBank.run('MFT', 'progress', 'A', 'Client is making ___ (good/moderate/limited) progress toward treatment goals.');
    insertNoteBank.run('MFT', 'progress', 'A', 'Client demonstrates improved insight into relational patterns.');
    insertNoteBank.run('MFT', 'progress', 'A', 'Client continues to require therapeutic support for ___.');
    insertNoteBank.run('MFT', 'progress', 'A', 'Clinical presentation is consistent with diagnosis of ___.');
    insertNoteBank.run('MFT', 'progress', 'A', 'Client has met ___ of ___ treatment objectives to date.');
    insertNoteBank.run('MFT', 'response', 'A', 'Client was receptive to therapeutic interventions and engaged in session.');
    insertNoteBank.run('MFT', 'response', 'A', 'Client demonstrated resistance to exploring ___; continued gentle exploration recommended.');
    insertNoteBank.run('MFT', 'response', 'A', 'Prognosis is ___ (good/fair/guarded) given current engagement and progress.');
    insertNoteBank.run('MFT', 'risk', 'A', 'Risk level assessed as ___ (low/moderate/high). Safety plan ___ (in place/reviewed/updated).');

    // Plan (mapped to 'P' field) — used for SOAP/BIRP; hidden for DAP
    insertNoteBank.run('MFT', 'next_session', 'P', 'Continue individual/couples/family therapy ___ x/week.');
    insertNoteBank.run('MFT', 'next_session', 'P', 'Next session will focus on ___.');
    insertNoteBank.run('MFT', 'next_session', 'P', 'Continue current treatment plan. Review progress toward goals next session.');
    insertNoteBank.run('MFT', 'homework', 'P', 'Client assigned homework: ___.');
    insertNoteBank.run('MFT', 'homework', 'P', 'Client to practice ___ (communication technique/coping skill) between sessions.');
    insertNoteBank.run('MFT', 'referral', 'P', 'Referral placed for ___ (psychiatric evaluation/group therapy/substance abuse assessment).');
    insertNoteBank.run('MFT', 'discharge', 'P', 'Client approaching treatment goals. Discuss discharge planning in upcoming sessions.');
    insertNoteBank.run('MFT', 'discharge', 'P', 'Recommend step-down to ___ frequency as goals are met.');
  });

  seedTransaction();
}

// Seed goal-category-aligned note bank phrases for Quick Chips intelligence
// Runs separately so existing users get these phrases on update
export function seedCategoryAlignedPhrases(db: BetterSqlite3.Database): void {
  // Check if we already seeded these (use a sentinel phrase)
  const sentinel = db.prepare(
    "SELECT id FROM note_bank WHERE discipline = 'ST' AND category = 'Articulation' AND section = 'O' AND phrase LIKE 'Produced target phonemes%'"
  ).get();
  if (sentinel) return;

  const ins = db.prepare(
    'INSERT INTO note_bank (discipline, category, section, phrase, is_default, is_favorite) VALUES (?, ?, ?, ?, 1, 0)'
  );

  const safeInsert = (discipline: string, category: string, section: string, phrase: string) => {
    const exists = db.prepare(
      'SELECT id FROM note_bank WHERE discipline = ? AND section = ? AND phrase = ?'
    ).get(discipline, section, phrase);
    if (!exists) {
      ins.run(discipline, category, section, phrase);
    }
  };

  const tx = db.transaction(() => {
    // ── ST Objective by goal category ──
    safeInsert('ST', 'Articulation', 'O', 'Produced target phonemes in ___ position with ___% accuracy.');
    safeInsert('ST', 'Articulation', 'O', 'Demonstrated improved intelligibility at ___ level.');
    safeInsert('ST', 'Articulation', 'O', 'Self-corrected articulatory errors with ___ cueing.');
    safeInsert('ST', 'Articulation', 'O', 'Required phonetic placement cues for target sounds.');
    safeInsert('ST', 'Articulation', 'O', 'Imitated target sounds with visual model.');

    safeInsert('ST', 'Language Comprehension', 'O', 'Followed ___-step directions with ___% accuracy.');
    safeInsert('ST', 'Language Comprehension', 'O', 'Identified ___ in presented material with ___% accuracy.');
    safeInsert('ST', 'Language Comprehension', 'O', 'Answered ___-questions about presented material with ___% accuracy.');
    safeInsert('ST', 'Language Comprehension', 'O', 'Required repetition/rephrasing of instructions.');
    safeInsert('ST', 'Language Comprehension', 'O', 'Demonstrated understanding of ___ concepts.');

    safeInsert('ST', 'Language Expression', 'O', 'Produced ___ sentences in structured tasks.');
    safeInsert('ST', 'Language Expression', 'O', 'Used targeted vocabulary in structured tasks with ___% accuracy.');
    safeInsert('ST', 'Language Expression', 'O', 'Self-corrected grammatical errors with ___ cueing.');
    safeInsert('ST', 'Language Expression', 'O', 'Named items in categories with ___ cueing.');
    safeInsert('ST', 'Language Expression', 'O', 'Demonstrated improved word retrieval with ___ cues.');

    safeInsert('ST', 'Fluency', 'O', 'Used ___ fluency strategy during structured tasks.');
    safeInsert('ST', 'Fluency', 'O', 'Demonstrated ___ disfluencies during ___ tasks.');
    safeInsert('ST', 'Fluency', 'O', 'Self-monitored speech rate during structured tasks.');
    safeInsert('ST', 'Fluency', 'O', 'Transferred fluency strategies to ___ context.');

    safeInsert('ST', 'Voice', 'O', 'Maintained appropriate vocal quality during sustained phonation.');
    safeInsert('ST', 'Voice', 'O', 'Demonstrated improved breath support for connected speech.');
    safeInsert('ST', 'Voice', 'O', 'Used resonant voice techniques during ___ tasks.');

    safeInsert('ST', 'Feeding/Swallowing', 'O', 'Tolerated ___ diet consistency without s/s aspiration.');
    safeInsert('ST', 'Feeding/Swallowing', 'O', 'Demonstrated safe swallow with ___ strategy.');
    safeInsert('ST', 'Feeding/Swallowing', 'O', 'No overt signs/symptoms of aspiration observed.');

    safeInsert('ST', 'Cognitive-Communication', 'O', 'Recalled ___/___ items after ___ presentation.');
    safeInsert('ST', 'Cognitive-Communication', 'O', 'Sustained attention for ___ minutes on ___ task.');
    safeInsert('ST', 'Cognitive-Communication', 'O', 'Demonstrated improved problem-solving with ___ cues.');
    safeInsert('ST', 'Cognitive-Communication', 'O', 'Used compensatory memory strategies with ___ prompting.');

    safeInsert('ST', 'Pragmatics', 'O', 'Maintained ___ during structured interaction.');
    safeInsert('ST', 'Pragmatics', 'O', 'Used appropriate communicative functions in context.');
    safeInsert('ST', 'Pragmatics', 'O', 'Demonstrated improved social inference skills.');

    // ── ST Assessment by goal category ──
    safeInsert('ST', 'Articulation', 'A', 'Performance reflects ___ from baseline articulatory accuracy.');
    safeInsert('ST', 'Articulation', 'A', 'Skilled intervention required for phoneme-specific error patterns.');
    safeInsert('ST', 'Articulation', 'A', 'Articulatory placement therapy yielding measurable gains.');

    safeInsert('ST', 'Language Comprehension', 'A', 'Receptive language gains support continued skilled intervention.');
    safeInsert('ST', 'Language Comprehension', 'A', 'Performance suggests ___ comprehension skills.');

    safeInsert('ST', 'Language Expression', 'A', 'Expressive language skills demonstrate response to skilled intervention.');
    safeInsert('ST', 'Language Expression', 'A', 'Continued deficits in ___ warrant ongoing treatment.');

    safeInsert('ST', 'general', 'A', 'Patient demonstrates motivation and active participation.');
    safeInsert('ST', 'general', 'A', 'Skilled therapeutic intervention continues to be medically necessary.');
    safeInsert('ST', 'general', 'A', 'Progress toward goals supports continuation of current POC.');
    safeInsert('ST', 'general', 'A', 'Performance variability indicates need for continued skilled intervention.');
    safeInsert('ST', 'general', 'A', 'Cueing level has ___, indicating ___ progress.');

    // ── PT Objective by goal category ──
    safeInsert('PT', 'Mobility', 'O', 'Ambulated ___ with ___ and ___ assist.');
    safeInsert('PT', 'Mobility', 'O', 'Negotiated stairs ___ steps with ___ and ___ assist.');
    safeInsert('PT', 'Mobility', 'O', 'Demonstrated improved gait pattern with ___ deviation.');

    safeInsert('PT', 'Strength', 'O', 'Demonstrated ___/5 MMT for ___.');
    safeInsert('PT', 'Strength', 'O', 'Completed ___ reps of ___ with ___ resistance.');
    safeInsert('PT', 'Strength', 'O', 'Maintained form throughout strengthening protocol.');

    safeInsert('PT', 'Balance', 'O', 'Maintained ___ standing balance for ___ seconds.');
    safeInsert('PT', 'Balance', 'O', 'Completed ___ with score of ___.');
    safeInsert('PT', 'Balance', 'O', 'Demonstrated improved weight shifting in ___ direction.');

    safeInsert('PT', 'ROM', 'O', 'Achieved ___° ___ at ___ for ___.');
    safeInsert('PT', 'ROM', 'O', 'Demonstrated improved flexibility with sustained stretching.');

    safeInsert('PT', 'Gait', 'O', 'Gait speed measured at ___ m/s.');
    safeInsert('PT', 'Gait', 'O', 'Reduced compensatory movement pattern during ambulation.');
    safeInsert('PT', 'Gait', 'O', 'Demonstrated improved heel strike and push-off mechanics.');

    safeInsert('PT', 'Transfers', 'O', 'Completed ___ transfer with ___ assist.');
    safeInsert('PT', 'Transfers', 'O', 'Required ___ cueing for safe body mechanics.');

    // ── OT Objective by goal category ──
    safeInsert('OT', 'ADLs', 'O', 'Completed ___ with ___ assist.');
    safeInsert('OT', 'ADLs', 'O', 'Demonstrated improved sequencing for ___ task.');
    safeInsert('OT', 'ADLs', 'O', 'Used adaptive equipment for ___ with ___ independence.');

    safeInsert('OT', 'Fine Motor', 'O', 'Demonstrated ___ grasp pattern for functional task.');
    safeInsert('OT', 'Fine Motor', 'O', 'Completed ___ task in ___ seconds.');
    safeInsert('OT', 'Fine Motor', 'O', 'Improved bilateral coordination during ___ task.');

    safeInsert('OT', 'Sensory Processing', 'O', 'Tolerated ___ input for ___ without behavioral response.');
    safeInsert('OT', 'Sensory Processing', 'O', 'Demonstrated improved self-regulation after sensory diet activities.');

    safeInsert('OT', 'Cognitive', 'O', 'Completed ___ with ___ cueing level.');
    safeInsert('OT', 'Cognitive', 'O', 'Demonstrated improved safety awareness during ___ task.');

    // ── MFT Assessment by goal category ──
    safeInsert('MFT', 'Depression', 'A', 'Patient reports ___ in depressive symptoms since last session.');
    safeInsert('MFT', 'Depression', 'A', 'PHQ-9 score: ___, indicating ___ severity.');

    safeInsert('MFT', 'Anxiety', 'A', 'GAD-7 score: ___, indicating ___ severity.');
    safeInsert('MFT', 'Anxiety', 'A', 'Client demonstrated use of ___ techniques during session.');

    safeInsert('MFT', 'Coping Skills', 'A', 'Client identified ___ new coping strategies during session.');
    safeInsert('MFT', 'Coping Skills', 'A', 'Demonstrated improved distress tolerance using ___ skill.');

    safeInsert('MFT', 'Trauma', 'A', 'Client engaged in trauma processing using ___ approach.');
    safeInsert('MFT', 'Trauma', 'A', 'Window of tolerance ___ during session.');
  });

  tx();
}

// Discipline-specific CPT code sets
function getCPTCodesForDiscipline(discipline: string): Array<{ cpt_code: string; description: string; default_units: number; amount: number; is_timed: number | null }> {
  const ptOtShared = [
    { cpt_code: '97110', description: 'Therapeutic exercises', default_units: 1, amount: 50.00, is_timed: 1 },
    { cpt_code: '97112', description: 'Neuromuscular reeducation', default_units: 1, amount: 50.00, is_timed: 1 },
    { cpt_code: '97116', description: 'Gait training', default_units: 1, amount: 50.00, is_timed: 1 },
    { cpt_code: '97140', description: 'Manual therapy', default_units: 1, amount: 55.00, is_timed: 1 },
    { cpt_code: '97530', description: 'Therapeutic activities', default_units: 1, amount: 50.00, is_timed: 1 },
    { cpt_code: '97535', description: 'Self-care/home management training', default_units: 1, amount: 50.00, is_timed: 1 },
    { cpt_code: '97542', description: 'Wheelchair management training', default_units: 1, amount: 45.00, is_timed: 1 },
    { cpt_code: '97750', description: 'Physical performance test', default_units: 1, amount: 60.00, is_timed: 1 },
    { cpt_code: '97533', description: 'Sensory integration', default_units: 1, amount: 50.00, is_timed: 1 },
  ];

  switch (discipline) {
    case 'PT':
      return [
        ...ptOtShared,
        { cpt_code: '97161', description: 'PT evaluation - low complexity', default_units: 1, amount: 150.00, is_timed: 0 },
        { cpt_code: '97162', description: 'PT evaluation - moderate complexity', default_units: 1, amount: 175.00, is_timed: 0 },
        { cpt_code: '97163', description: 'PT evaluation - high complexity', default_units: 1, amount: 200.00, is_timed: 0 },
        { cpt_code: '97164', description: 'PT re-evaluation', default_units: 1, amount: 100.00, is_timed: 0 },
      ];
    case 'OT':
      return [
        ...ptOtShared,
        { cpt_code: '97165', description: 'OT evaluation - low complexity', default_units: 1, amount: 150.00, is_timed: 0 },
        { cpt_code: '97166', description: 'OT evaluation - moderate complexity', default_units: 1, amount: 175.00, is_timed: 0 },
        { cpt_code: '97167', description: 'OT evaluation - high complexity', default_units: 1, amount: 200.00, is_timed: 0 },
        { cpt_code: '97168', description: 'OT re-evaluation', default_units: 1, amount: 100.00, is_timed: 0 },
      ];
    case 'ST':
      return [
        { cpt_code: '92507', description: 'Speech/language treatment', default_units: 1, amount: 75.00, is_timed: 1 },
        { cpt_code: '92508', description: 'Speech/language treatment (group)', default_units: 1, amount: 50.00, is_timed: 0 },
        { cpt_code: '92521', description: 'Evaluation of speech fluency', default_units: 1, amount: 150.00, is_timed: 0 },
        { cpt_code: '92522', description: 'Evaluation of speech production', default_units: 1, amount: 150.00, is_timed: 0 },
        { cpt_code: '92523', description: 'Speech/language evaluation', default_units: 1, amount: 200.00, is_timed: 0 },
        { cpt_code: '92524', description: 'Behavioral/qualitative voice analysis', default_units: 1, amount: 150.00, is_timed: 0 },
        { cpt_code: '92526', description: 'Oral function treatment', default_units: 1, amount: 75.00, is_timed: 1 },
        { cpt_code: '92610', description: 'Swallowing function evaluation', default_units: 1, amount: 175.00, is_timed: 0 },
        { cpt_code: '97129', description: 'Cognitive function intervention, first 15 min', default_units: 1, amount: 50.00, is_timed: 1 },
        { cpt_code: '97130', description: 'Cognitive function intervention, add-on 15 min', default_units: 1, amount: 38.00, is_timed: 1 },
        { cpt_code: '92609', description: 'Therapeutic service for AAC device', default_units: 1, amount: 125.00, is_timed: 0 },
        { cpt_code: '92618', description: 'Re-evaluation of AAC device', default_units: 1, amount: 100.00, is_timed: 0 },
      ];
    case 'MFT':
      return [
        { cpt_code: '90791', description: 'Psychiatric diagnostic evaluation', default_units: 1, amount: 200.00, is_timed: null },
        { cpt_code: '90834', description: 'Psychotherapy, 45 minutes', default_units: 1, amount: 130.00, is_timed: null },
        { cpt_code: '90837', description: 'Psychotherapy, 60 minutes', default_units: 1, amount: 170.00, is_timed: null },
        { cpt_code: '90832', description: 'Psychotherapy, 30 minutes', default_units: 1, amount: 85.00, is_timed: null },
        { cpt_code: '90847', description: 'Family psychotherapy, with patient', default_units: 1, amount: 160.00, is_timed: null },
        { cpt_code: '90846', description: 'Family psychotherapy, without patient', default_units: 1, amount: 150.00, is_timed: null },
        { cpt_code: '90853', description: 'Group psychotherapy', default_units: 1, amount: 55.00, is_timed: null },
      ];
    default: // MULTI or unknown — broad set
      return [
        { cpt_code: '97110', description: 'Therapeutic exercises', default_units: 1, amount: 50.00, is_timed: 1 },
        { cpt_code: '97530', description: 'Therapeutic activities', default_units: 1, amount: 50.00, is_timed: 1 },
        { cpt_code: '97140', description: 'Manual therapy', default_units: 1, amount: 55.00, is_timed: 1 },
        { cpt_code: '92507', description: 'Speech/language treatment', default_units: 1, amount: 75.00, is_timed: 1 },
        { cpt_code: '92523', description: 'Speech/language evaluation', default_units: 1, amount: 200.00, is_timed: 0 },
        { cpt_code: '97161', description: 'PT evaluation - low complexity', default_units: 1, amount: 150.00, is_timed: 0 },
        { cpt_code: '97165', description: 'OT evaluation - low complexity', default_units: 1, amount: 150.00, is_timed: 0 },
        { cpt_code: '90834', description: 'Psychotherapy, 45 minutes', default_units: 1, amount: 130.00, is_timed: null },
      ];
  }
}

// Seed fee schedule entries — discipline-aware
export function seedFeeSchedule(db: BetterSqlite3.Database, discipline?: string): void {
  try {
    const hasData = db.prepare('SELECT COUNT(*) as count FROM fee_schedule').get() as any;
    if (hasData.count > 0) return;
  } catch {
    return;
  }

  // Determine discipline from practice table or settings
  let disc = discipline;
  if (!disc) {
    try {
      const practiceRow = db.prepare("SELECT discipline FROM practice WHERE id = 1").get() as any;
      disc = practiceRow?.discipline;
    } catch { /* practice table may not exist yet */ }
    if (!disc) {
      try {
        const settingsRow = db.prepare("SELECT value FROM settings WHERE key = 'provider_discipline'").get() as any;
        disc = settingsRow?.value;
      } catch { /* ignore */ }
    }
    disc = disc || 'ST';
  }

  const codes = getCPTCodesForDiscipline(disc || 'ST');
  const today = new Date().toISOString().slice(0, 10);
  const insertFee = db.prepare(
    'INSERT INTO fee_schedule (cpt_code, description, default_units, amount, effective_date, is_timed) VALUES (?, ?, ?, ?, ?, ?)'
  );

  const tx = db.transaction(() => {
    for (const fee of codes) {
      insertFee.run(fee.cpt_code, fee.description, fee.default_units, fee.amount, today, fee.is_timed);
    }
  });
  tx();
}

// Reset fee schedule to discipline defaults (called when discipline changes)
export function resetFeeSchedule(db: BetterSqlite3.Database, discipline: string): void {
  try {
    db.prepare('DELETE FROM fee_schedule').run();
  } catch {
    return;
  }
  // Force re-seed by calling with discipline
  const codes = getCPTCodesForDiscipline(discipline);
  const today = new Date().toISOString().slice(0, 10);
  const insertFee = db.prepare(
    'INSERT INTO fee_schedule (cpt_code, description, default_units, amount, effective_date, is_timed) VALUES (?, ?, ?, ?, ?, ?)'
  );
  const tx = db.transaction(() => {
    for (const fee of codes) {
      insertFee.run(fee.cpt_code, fee.description, fee.default_units, fee.amount, today, fee.is_timed);
    }
  });
  tx();
}

// Auto-fix: detect mismatched fee schedule on startup
export function autoFixFeeSchedule(db: BetterSqlite3.Database): void {
  try {
    const feeCount = (db.prepare('SELECT COUNT(*) as count FROM fee_schedule').get() as any)?.count || 0;
    if (feeCount === 0) return; // Will be seeded by seedFeeSchedule

    // Get discipline from practice table first, then settings
    let discipline: string | undefined;
    try {
      const practiceRow = db.prepare("SELECT discipline FROM practice WHERE id = 1").get() as any;
      discipline = practiceRow?.discipline;
    } catch { /* practice table may not exist yet */ }
    if (!discipline) {
      try {
        const settingsRow = db.prepare("SELECT value FROM settings WHERE key = 'provider_discipline'").get() as any;
        discipline = settingsRow?.value;
      } catch { /* ignore */ }
    }
    if (!discipline) return;

    // Get expected CPT codes for this discipline
    const expectedCodes = getCPTCodesForDiscipline(discipline).map(c => c.cpt_code);
    if (expectedCodes.length === 0) return;

    // Get current CPT codes in the fee schedule
    const currentCodes = (db.prepare('SELECT cpt_code FROM fee_schedule WHERE deleted_at IS NULL').all() as any[])
      .map((r: any) => r.cpt_code);

    // Check if ANY expected code is present — if none match, codes are from wrong discipline
    const hasAnyExpected = currentCodes.some((c: string) => expectedCodes.includes(c));
    if (!hasAnyExpected && currentCodes.length > 0) {
      // Complete mismatch — reset to correct discipline
      db.prepare('DELETE FROM fee_schedule').run();
      seedFeeSchedule(db, discipline);
    }
  } catch {
    // Silently fail
  }
}

// Backfill missing CPT codes into existing fee schedules (e.g. 92609/92618 for AAC)
export function backfillMissingCPTCodes(db: BetterSqlite3.Database): void {
  try {
    const feeCount = (db.prepare('SELECT COUNT(*) as count FROM fee_schedule').get() as any)?.count || 0;
    if (feeCount === 0) return; // Will be seeded fresh by seedFeeSchedule

    // Get discipline
    let discipline: string | undefined;
    try {
      const practiceRow = db.prepare("SELECT discipline FROM practice WHERE id = 1").get() as any;
      discipline = practiceRow?.discipline;
    } catch { /* practice table may not exist yet */ }
    if (!discipline) {
      try {
        const settingsRow = db.prepare("SELECT value FROM settings WHERE key = 'provider_discipline'").get() as any;
        discipline = settingsRow?.value;
      } catch { /* ignore */ }
    }
    if (!discipline) return;

    const expectedCodes = getCPTCodesForDiscipline(discipline);
    if (expectedCodes.length === 0) return;

    const currentCodes = new Set(
      (db.prepare('SELECT cpt_code FROM fee_schedule').all() as any[]).map((r: any) => r.cpt_code)
    );

    const today = new Date().toISOString().slice(0, 10);
    const insertFee = db.prepare(
      'INSERT INTO fee_schedule (cpt_code, description, default_units, amount, effective_date, is_timed) VALUES (?, ?, ?, ?, ?, ?)'
    );

    for (const code of expectedCodes) {
      if (!currentCodes.has(code.cpt_code)) {
        insertFee.run(code.cpt_code, code.description, code.default_units, code.amount, today, code.is_timed);
      }
    }
  } catch {
    // Silently fail
  }
}

// ══════════════════════════════════════════════════════════════════════
// Pediatric & AAC Content Seed
// ══════════════════════════════════════════════════════════════════════

export function seedPediatricContent(db: BetterSqlite3.Database): void {
  // Sentinel: skip if already seeded
  const sentinel = db.prepare(
    "SELECT id FROM note_bank WHERE discipline = 'ST' AND category = 'peds' AND section = 'S' AND phrase LIKE 'Caregiver reports ___ (new words%'"
  ).get();
  if (sentinel) return;

  const ins = db.prepare(
    'INSERT INTO note_bank (discipline, category, section, phrase, is_default, is_favorite) VALUES (?, ?, ?, ?, 1, 0)'
  );
  const safeInsert = (discipline: string, category: string, section: string, phrase: string) => {
    const exists = db.prepare(
      'SELECT id FROM note_bank WHERE discipline = ? AND section = ? AND phrase = ?'
    ).get(discipline, section, phrase);
    if (!exists) {
      ins.run(discipline, category, section, phrase);
    }
  };

  const tx = db.transaction(() => {
    // ── ST Pediatric Subjective ──
    safeInsert('ST', 'peds', 'S', 'Caregiver reports ___ (new words/sounds/behaviors) since last session.');
    safeInsert('ST', 'peds', 'S', 'Caregiver reports concerns regarding ___ (speech clarity/language development/feeding/social communication).');
    safeInsert('ST', 'peds', 'S', 'Per parent report, child is using ___ words/signs at home.');
    safeInsert('ST', 'peds', 'S', 'Teacher reports child is ___ (participating in circle time/following classroom routines/struggling with ___).');
    safeInsert('ST', 'peds', 'S', 'Caregiver reports child has been practicing ___ at home.');
    safeInsert('ST', 'peds', 'S', 'Child arrived cooperative/fussy/tired and required ___ to engage in session.');
    safeInsert('ST', 'peds', 'S', 'Caregiver reports no new concerns since last session.');
    safeInsert('ST', 'peds', 'S', 'Per IEP team feedback, child is ___ in the classroom setting.');

    // ── ST Pediatric Feeding Subjective ──
    safeInsert('ST', 'peds_feeding', 'S', 'Caregiver reports child is accepting/refusing ___ textures at mealtimes.');
    safeInsert('ST', 'peds_feeding', 'S', 'Caregiver reports child is a picky eater with limited diet of ___ foods.');
    safeInsert('ST', 'peds_feeding', 'S', 'Per parent, child gags/coughs/vomits with ___ food textures.');
    safeInsert('ST', 'peds_feeding', 'S', 'Caregiver reports mealtime duration of ___ minutes with ___ (refusal behaviors/gagging/throwing food).');

    // ── ST AAC Subjective ──
    safeInsert('ST', 'aac', 'S', 'Caregiver reports child is using AAC device at home for ___ (requests/comments/greetings).');
    safeInsert('ST', 'aac', 'S', 'Caregiver reports ___ (increased/decreased) AAC use since last session.');
    safeInsert('ST', 'aac', 'S', 'Per teacher/aide, child uses AAC device in classroom for ___.');
    safeInsert('ST', 'aac', 'S', 'Caregiver reports communication partner training has been ___ (helpful/challenging).');

    // ── ST Pediatric Objective ──
    safeInsert('ST', 'peds', 'O', 'Child produced ___ different words/word approximations during session.');
    safeInsert('ST', 'peds', 'O', 'Child demonstrated joint attention for ___ exchanges during ___ activity.');
    safeInsert('ST', 'peds', 'O', 'Child used ___ (gestures/signs/words/word combinations) to communicate ___ (wants/needs/comments).');
    safeInsert('ST', 'peds', 'O', 'MLU measured at ___ morphemes during ___ (structured/play-based) activity.');
    safeInsert('ST', 'peds', 'O', 'Child followed ___-step directions with ___% accuracy given ___ cues.');
    safeInsert('ST', 'peds', 'O', 'Child identified ___/___ vocabulary items in structured activity.');
    safeInsert('ST', 'peds', 'O', 'Child initiated communication ___ times during ___ minute session.');
    safeInsert('ST', 'peds', 'O', 'Child imitated ___ (sounds/words/phrases) with ___ (spontaneous/modeled) production.');
    safeInsert('ST', 'peds', 'O', 'Child engaged in parallel/interactive play for ___ minutes.');
    safeInsert('ST', 'peds', 'O', 'Child demonstrated turn-taking for ___ exchanges with ___ cueing.');
    safeInsert('ST', 'peds', 'O', 'Child used ___ word combinations (e.g., agent+action, action+object) with ___% spontaneity.');
    safeInsert('ST', 'peds', 'O', 'Child answered wh-questions (who/what/where/when/why) with ___% accuracy.');
    safeInsert('ST', 'peds', 'O', 'Child retold narrative with ___/___ story elements (character, setting, problem, resolution).');

    // ── ST Phonological Awareness Objective ──
    safeInsert('ST', 'Phonological Awareness', 'O', 'Child identified ___/___ rhyming pairs. Segmented syllables in ___-syllable words with ___% accuracy.');
    safeInsert('ST', 'Phonological Awareness', 'O', 'Child demonstrated phonological awareness: ___ (initial sound identification/blending/segmenting) with ___% accuracy.');

    // ── ST Pediatric Feeding Objective ──
    safeInsert('ST', 'peds_feeding', 'O', 'Child accepted ___/___ food items presented. Tolerated ___ texture(s) without adverse response.');
    safeInsert('ST', 'peds_feeding', 'O', 'Child demonstrated ___ (anterior/lateral/rotary) chew pattern for ___ textures.');
    safeInsert('ST', 'peds_feeding', 'O', 'Oral motor exam: lip closure ___, tongue lateralization ___, jaw grading ___.');
    safeInsert('ST', 'peds_feeding', 'O', 'Child used ___ (fingers/utensil) for self-feeding with ___ accuracy.');
    safeInsert('ST', 'peds_feeding', 'O', 'Child tolerated ___ (food exploration/touching/smelling/tasting) with ___ (minimal/moderate/significant) behavioral response.');
    safeInsert('ST', 'peds_feeding', 'O', 'Sensory-based food exposure: child ___ (touched/smelled/licked/tasted/chewed/swallowed) ___ novel foods.');

    // ── ST AAC Objective ──
    safeInsert('ST', 'aac', 'O', 'Child navigated to target symbol on AAC device with ___ (independent/physical/gestural/verbal) cueing.');
    safeInsert('ST', 'aac', 'O', 'Child produced ___ (single symbol/multi-symbol) messages using AAC device for ___ (requesting/commenting/answering/greeting).');
    safeInsert('ST', 'aac', 'O', 'Child combined ___ symbols on AAC device to create ___ (2-word/3-word) phrases.');
    safeInsert('ST', 'aac', 'O', 'Aided language input provided by clinician during ___ activity. Child observed/imitated ___ of modeled symbols.');
    safeInsert('ST', 'aac', 'O', 'Child used core vocabulary words (___, ___, ___) across ___ activities.');
    safeInsert('ST', 'aac', 'O', 'Child demonstrated multimodal communication using ___ (AAC/gestures/vocalizations/signs) across ___ contexts.');
    safeInsert('ST', 'aac', 'O', 'Communication partner training: caregiver demonstrated ___ (modeling/expectant delay/expansion) with ___% accuracy.');

    // ── ST Pediatric Pragmatics Objective ──
    safeInsert('ST', 'peds_pragmatics', 'O', 'Child maintained topic for ___ conversational turns with ___ cueing.');
    safeInsert('ST', 'peds_pragmatics', 'O', 'Child used appropriate greetings/farewells with ___ (spontaneous/prompted) production.');
    safeInsert('ST', 'peds_pragmatics', 'O', 'Child identified emotions in ___ (pictures/stories/role-play) with ___% accuracy.');
    safeInsert('ST', 'peds_pragmatics', 'O', 'Child demonstrated perspective-taking by ___ with ___ cueing.');
    safeInsert('ST', 'peds_pragmatics', 'O', 'Child demonstrated appropriate play skills: ___ (functional/symbolic/pretend) play observed.');

    // ── ST Pediatric Assessment ──
    safeInsert('ST', 'peds', 'A', 'Child is making ___ (good/steady/slow) progress toward communication goals.');
    safeInsert('ST', 'peds', 'A', 'Performance reflects emerging ___ (language/speech/social communication) skills.');
    safeInsert('ST', 'peds', 'A', 'Child demonstrates developmental gains in ___ compared to initial evaluation.');
    safeInsert('ST', 'peds', 'A', 'Child responded well to ___ (play-based/naturalistic/structured) intervention approach.');
    safeInsert('ST', 'peds', 'A', 'Skilled intervention continues to be necessary for ___ (language stimulation/articulation/AAC training/feeding therapy).');
    safeInsert('ST', 'peds', 'A', 'Caregiver carryover of strategies is ___ (excellent/improving/limited), impacting generalization of skills.');

    // ── ST AAC Assessment ──
    safeInsert('ST', 'aac', 'A', 'Child demonstrates increased communicative competence with AAC system.');
    safeInsert('ST', 'aac', 'A', 'AAC system continues to be appropriate for child\'s communication needs. ___ (No/Minor/Significant) modifications recommended.');
    safeInsert('ST', 'aac', 'A', 'Communication partner training is yielding ___ (positive/variable) results in generalization of AAC use.');

    // ── ST Pediatric Feeding Assessment ──
    safeInsert('ST', 'peds_feeding', 'A', 'Child demonstrates ___ (expanded/unchanged/reduced) food repertoire compared to baseline.');
    safeInsert('ST', 'peds_feeding', 'A', 'Feeding therapy is targeting ___ (oral motor skills/texture tolerance/self-feeding/mealtime behavior).');

    // ── ST Pediatric Plan ──
    safeInsert('ST', 'peds', 'P', 'Continue current POC. Focus on ___ in next session using ___ (play-based/structured/naturalistic) approach.');
    safeInsert('ST', 'peds', 'P', 'Caregiver education provided: ___ (language stimulation strategies/aided language input/feeding strategies).');
    safeInsert('ST', 'peds', 'P', 'Home practice recommendations: ___.');
    safeInsert('ST', 'peds', 'P', 'Coordinate with ___ (classroom teacher/OT/PT/BCBA) regarding ___.');
    safeInsert('ST', 'peds', 'P', 'IEP meeting scheduled/recommended to discuss ___.');

    // ── ST AAC Plan ──
    safeInsert('ST', 'aac', 'P', 'Continue AAC training. Add ___ vocabulary to device for next session.');
    safeInsert('ST', 'aac', 'P', 'Communication partner training: practice ___ (modeling/expectant delay/aided language input) at home.');
    safeInsert('ST', 'aac', 'P', 'Program AAC device with ___ (core words/fringe vocabulary/activity-specific pages) before next session.');
    safeInsert('ST', 'aac', 'P', 'AAC device adjustment: ___ (layout change/vocabulary expansion/access method modification) recommended.');

    // ── ST Pediatric Feeding Plan ──
    safeInsert('ST', 'peds_feeding', 'P', 'Continue feeding therapy. Advance food exposure hierarchy to ___.');
    safeInsert('ST', 'peds_feeding', 'P', 'Caregiver education on ___ (mealtime positioning/food presentation/responsive feeding strategies).');

    // ── OT Pediatric Subjective ──
    safeInsert('OT', 'peds', 'S', 'Caregiver reports child has been ___ (more/less) independent with ___ since last session.');
    safeInsert('OT', 'peds', 'S', 'Teacher reports child is ___ (having difficulty with/improving in) ___ (handwriting/classroom participation/self-care tasks).');
    safeInsert('OT', 'peds_sensory', 'S', 'Caregiver reports child is ___ (avoiding/seeking) ___ sensory input.');
    safeInsert('OT', 'peds', 'S', 'Caregiver reports meltdowns/behavioral challenges during ___ (transitions/dressing/grooming).');
    safeInsert('OT', 'peds', 'S', 'Caregiver reports child has limited food repertoire of ___ items.');

    // ── OT Pediatric Objective ──
    safeInsert('OT', 'peds_fine_motor', 'O', 'Child demonstrated ___ grasp on writing tool. Letter formation: ___ accuracy.');
    safeInsert('OT', 'peds_fine_motor', 'O', 'Child cut along ___ (straight/curved/complex) line within ___" accuracy.');
    safeInsert('OT', 'peds_fine_motor', 'O', 'Child completed ___ (bead stringing/lacing/pegboard) in ___ with ___ hand dominance.');
    safeInsert('OT', 'peds_fine_motor', 'O', 'Bilateral coordination: child demonstrated ___ pattern during ___ task.');
    safeInsert('OT', 'peds_sensory', 'O', 'Child tolerated ___ sensory input for ___ (seconds/minutes) with ___ (calm/dysregulated) response.');
    safeInsert('OT', 'peds_sensory', 'O', 'Child used ___ self-regulation strategy with ___ cueing.');
    safeInsert('OT', 'peds_sensory', 'O', 'Arousal level: child presented as ___ (under-responsive/over-responsive/well-regulated) during ___ activity.');
    safeInsert('OT', 'peds_sensory', 'O', 'Sensory diet activities ___ (facilitated/did not facilitate) improved attention and regulation for ___ min.');
    safeInsert('OT', 'peds_ADL', 'O', 'Child completed ___ (buttoning/zipping/snapping/shoe tying) with ___ assist.');
    safeInsert('OT', 'peds_ADL', 'O', 'Child demonstrated ___ (age-appropriate/emerging/delayed) self-feeding skills with ___ utensil.');
    safeInsert('OT', 'peds_play', 'O', 'Child engaged in ___ (constructive/pretend/cooperative) play for ___ minutes.');
    safeInsert('OT', 'peds_visual_motor', 'O', 'Child copied ___ (shapes/letters/designs) with ___ accuracy. Spatial organization: ___.');

    // ── OT Pediatric Assessment ──
    safeInsert('OT', 'peds', 'A', 'Child demonstrates ___ gains in ___ (fine motor/sensory processing/self-care) since evaluation.');
    safeInsert('OT', 'peds', 'A', 'Skilled OT continues to be necessary for ___ (sensory integration/fine motor/ADL training/handwriting).');
    safeInsert('OT', 'peds', 'A', 'Child responded well to ___ (sensory diet/therapeutic play/structured task) approach.');

    // ── OT Pediatric Plan ──
    safeInsert('OT', 'peds', 'P', 'Continue current POC. Focus on ___ using ___ (sensory integration/play-based/task-specific) approach.');
    safeInsert('OT', 'peds', 'P', 'Home program updated: ___ (sensory diet/fine motor activities/handwriting practice).');
    safeInsert('OT', 'peds', 'P', 'Classroom accommodations recommended: ___.');
    safeInsert('OT', 'peds', 'P', 'Coordinate with ___ (teacher/SLP/PT/parent) regarding ___.');

    // ── PT Pediatric Subjective ──
    safeInsert('PT', 'peds', 'S', 'Caregiver reports child is ___ (crawling/cruising/walking) at home with ___ (independence/assistance).');
    safeInsert('PT', 'peds', 'S', 'Caregiver reports concerns with ___ (balance/coordination/motor milestones/gait pattern).');
    safeInsert('PT', 'peds', 'S', 'Caregiver reports child is ___ (keeping up with/falling behind) peers in gross motor activities.');
    safeInsert('PT', 'peds', 'S', 'Per school, child has difficulty with ___ (PE/playground/stairs/sitting at desk).');

    // ── PT Pediatric Objective ──
    safeInsert('PT', 'peds_gross_motor', 'O', 'Child demonstrated ___ (rolling/crawling/pulling to stand/cruising/independent walking) with ___ quality of movement.');
    safeInsert('PT', 'peds_gross_motor', 'O', 'Child walked ___ feet with ___ (narrow/wide) base of support and ___ (reciprocal/non-reciprocal) arm swing.');
    safeInsert('PT', 'peds_gross_motor', 'O', 'Child navigated stairs with ___ pattern (step-to/reciprocal) and ___ (railing/hand-hold/independent).');
    safeInsert('PT', 'peds_gross_motor', 'O', 'Child maintained ___ (sitting/standing/single-leg stance) balance for ___ seconds.');
    safeInsert('PT', 'peds_gross_motor', 'O', 'Gross motor skills: child performed ___ (jumping/hopping/skipping/galloping/ball skills) with ___ proficiency.');
    safeInsert('PT', 'peds_gross_motor', 'O', 'Postural control: child demonstrated ___ (head control/trunk stability/core strength) during ___ activity.');
    safeInsert('PT', 'peds_gross_motor', 'O', 'Child transitioned between positions (floor-to-stand) using ___ pattern with ___ assist.');

    // ── PT Pediatric Assessment ──
    safeInsert('PT', 'peds', 'A', 'Child demonstrates ___ gains in gross motor skills since initial evaluation.');
    safeInsert('PT', 'peds', 'A', 'Skilled PT continues to be necessary for ___ (gross motor development/balance training/gait training/strengthening).');
    safeInsert('PT', 'peds', 'A', 'Child responded well to ___ (neurodevelopmental/play-based/task-specific) intervention approach.');

    // ── PT Pediatric Plan ──
    safeInsert('PT', 'peds', 'P', 'Continue current POC. Focus on ___ using ___ (play-based/NDT/task-specific) approach.');
    safeInsert('PT', 'peds', 'P', 'Home program updated: ___ (tummy time/balance activities/strengthening exercises).');
    safeInsert('PT', 'peds', 'P', 'Coordinate with ___ (OT/teacher/orthotist) regarding ___.');
  });

  tx();
}
