import Database from 'better-sqlite3';

export function seedDefaultData(db: Database.Database): void {
  const hasData = db.prepare('SELECT COUNT(*) as count FROM note_bank').get() as any;
  if (hasData.count > 0) return;

  const insertNoteBank = db.prepare(
    'INSERT INTO note_bank (discipline, category, section, phrase, is_default) VALUES (?, ?, ?, ?, 1)'
  );

  const insertGoalsBank = db.prepare(
    'INSERT INTO goals_bank (discipline, category, goal_template, is_default) VALUES (?, ?, ?, 1)'
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

    // ── Goals Bank ──
    // PT Goals
    insertGoalsBank.run('PT', 'mobility', 'Pt will ambulate ___ ft with ___ device and ___ assist in ___ weeks.');
    insertGoalsBank.run('PT', 'mobility', 'Pt will ambulate on level surfaces with normalized gait pattern, no device, within ___ weeks.');
    insertGoalsBank.run('PT', 'mobility', 'Pt will navigate stairs with ___ assist and ___ railing in ___ weeks.');
    insertGoalsBank.run('PT', 'mobility', 'Pt will perform sit-to-stand from standard height chair with ___ assist in ___ weeks.');
    insertGoalsBank.run('PT', 'strength', 'Pt will demonstrate ___ strength of ___/5 in ___ within ___ weeks.');
    insertGoalsBank.run('PT', 'strength', 'Pt will improve grip strength to ___lbs bilaterally within ___ weeks.');
    insertGoalsBank.run('PT', 'ROM', 'Pt will achieve ___ AROM of ___ degrees within ___ weeks.');
    insertGoalsBank.run('PT', 'ROM', 'Pt will demonstrate functional ROM for ___ within ___ weeks.');
    insertGoalsBank.run('PT', 'balance', 'Pt will maintain static standing balance for ___ seconds without LOB within ___ weeks.');
    insertGoalsBank.run('PT', 'balance', 'Pt will achieve Berg Balance Scale score of ___/56 within ___ weeks.');
    insertGoalsBank.run('PT', 'balance', 'Pt will perform dynamic balance activities with ___ LOB in ___ weeks.');
    insertGoalsBank.run('PT', 'pain', 'Pt will report pain reduction to ___/10 with functional activities within ___ weeks.');
    insertGoalsBank.run('PT', 'function', 'Pt will independently perform HEP with correct form within ___ weeks.');
    insertGoalsBank.run('PT', 'function', 'Pt will return to ___ (work/sport/activity) without limitations within ___ weeks.');
    insertGoalsBank.run('PT', 'transfers', 'Pt will complete bed mobility with ___ assist within ___ weeks.');
    insertGoalsBank.run('PT', 'transfers', 'Pt will perform all transfers with ___ assist within ___ weeks.');

    // OT Goals
    insertGoalsBank.run('OT', 'ADL', 'Pt will complete upper body dressing with ___ assist within ___ weeks.');
    insertGoalsBank.run('OT', 'ADL', 'Pt will complete lower body dressing with ___ assist within ___ weeks.');
    insertGoalsBank.run('OT', 'ADL', 'Pt will complete grooming tasks with ___ assist within ___ weeks.');
    insertGoalsBank.run('OT', 'ADL', 'Pt will complete bathing with ___ assist within ___ weeks.');
    insertGoalsBank.run('OT', 'ADL', 'Pt will independently feed self with ___ setup within ___ weeks.');
    insertGoalsBank.run('OT', 'IADL', 'Pt will prepare a simple meal with ___ assist within ___ weeks.');
    insertGoalsBank.run('OT', 'IADL', 'Pt will manage medications with ___ assist within ___ weeks.');
    insertGoalsBank.run('OT', 'IADL', 'Pt will perform light housekeeping with ___ assist within ___ weeks.');
    insertGoalsBank.run('OT', 'hand_function', 'Pt will demonstrate functional grasp/release for ___ tasks within ___ weeks.');
    insertGoalsBank.run('OT', 'hand_function', 'Pt will improve fine motor coordination for ___ within ___ weeks.');
    insertGoalsBank.run('OT', 'hand_function', 'Pt will achieve grip strength of ___lbs for functional tasks within ___ weeks.');
    insertGoalsBank.run('OT', 'cognition', 'Pt will follow ___-step commands with ___ cues within ___ weeks.');
    insertGoalsBank.run('OT', 'cognition', 'Pt will demonstrate improved sequencing for ___-step tasks within ___ weeks.');
    insertGoalsBank.run('OT', 'cognition', 'Pt will utilize compensatory strategies for ___ with ___ cues within ___ weeks.');
    insertGoalsBank.run('OT', 'UE_function', 'Pt will achieve functional AROM of ___ for ___ within ___ weeks.');
    insertGoalsBank.run('OT', 'safety', 'Pt will demonstrate safe ___ techniques with ___ cues within ___ weeks.');

    // ST Goals
    insertGoalsBank.run('ST', 'articulation', 'Pt will produce target sounds in ___ position with ___% accuracy at ___ level within ___ weeks.');
    insertGoalsBank.run('ST', 'articulation', 'Pt will produce ___% intelligible speech in ___ context within ___ weeks.');
    insertGoalsBank.run('ST', 'language_expression', 'Pt will name ___ items in ___ categories with ___% accuracy within ___ weeks.');
    insertGoalsBank.run('ST', 'language_expression', 'Pt will produce grammatically correct sentences of ___+ words within ___ weeks.');
    insertGoalsBank.run('ST', 'language_expression', 'Pt will use ___ word retrieval strategies with ___ cues within ___ weeks.');
    insertGoalsBank.run('ST', 'language_comprehension', 'Pt will follow ___-step commands with ___% accuracy within ___ weeks.');
    insertGoalsBank.run('ST', 'language_comprehension', 'Pt will answer ___ questions about ___ with ___% accuracy within ___ weeks.');
    insertGoalsBank.run('ST', 'language_comprehension', 'Pt will identify main idea in ___ with ___% accuracy within ___ weeks.');
    insertGoalsBank.run('ST', 'voice', 'Pt will demonstrate appropriate vocal quality during ___ tasks within ___ weeks.');
    insertGoalsBank.run('ST', 'voice', 'Pt will maintain adequate breath support for ___ within ___ weeks.');
    insertGoalsBank.run('ST', 'fluency', 'Pt will use ___ fluency strategy with ___% success in ___ context within ___ weeks.');
    insertGoalsBank.run('ST', 'fluency', 'Pt will demonstrate ___% fluent speech in ___ speaking tasks within ___ weeks.');
    insertGoalsBank.run('ST', 'swallowing', 'Pt will safely tolerate ___ consistency with ___ strategy within ___ weeks.');
    insertGoalsBank.run('ST', 'swallowing', 'Pt will demonstrate safe swallow with ___ diet with no s/s aspiration within ___ weeks.');
    insertGoalsBank.run('ST', 'cognition', 'Pt will recall ___/5 items after ___ delay with ___ cues within ___ weeks.');
    insertGoalsBank.run('ST', 'cognition', 'Pt will sustain attention for ___ min on ___ task within ___ weeks.');
    insertGoalsBank.run('ST', 'cognition', 'Pt will identify ___/5 safety concerns in functional scenarios within ___ weeks.');
  });

  seedTransaction();
}

// Seed universal quick chips (ALL disciplines, favorited by default)
export function seedDefaultQuickChips(db: Database.Database): void {
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
export function seedPayers(db: Database.Database): void {
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
export function seedMFTData(db: Database.Database): void {
  const hasData = db.prepare(
    "SELECT COUNT(*) as count FROM note_bank WHERE discipline = 'MFT'"
  ).get() as any;
  if (hasData.count > 0) return;

  const insertNoteBank = db.prepare(
    'INSERT INTO note_bank (discipline, category, section, phrase, is_default) VALUES (?, ?, ?, ?, 1)'
  );

  const insertGoalsBank = db.prepare(
    'INSERT INTO goals_bank (discipline, category, goal_template, is_default) VALUES (?, ?, ?, 1)'
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

    // ── MFT Goals Bank ──
    insertGoalsBank.run('MFT', 'depression', 'Client will report reduction in depressive symptoms to a PHQ-9 score of ___ or below within ___ weeks.');
    insertGoalsBank.run('MFT', 'depression', 'Client will identify ___ positive coping strategies for managing depressive episodes within ___ weeks.');
    insertGoalsBank.run('MFT', 'depression', 'Client will engage in ___ pleasurable activities per week as reported in session within ___ weeks.');

    insertGoalsBank.run('MFT', 'anxiety', 'Client will report reduction in anxiety symptoms to a GAD-7 score of ___ or below within ___ weeks.');
    insertGoalsBank.run('MFT', 'anxiety', 'Client will demonstrate use of ___ anxiety management techniques in daily life within ___ weeks.');
    insertGoalsBank.run('MFT', 'anxiety', 'Client will reduce avoidance behaviors related to ___ as evidenced by ___ within ___ weeks.');

    insertGoalsBank.run('MFT', 'trauma', 'Client will demonstrate reduction in trauma-related symptoms as measured by ___ within ___ weeks.');
    insertGoalsBank.run('MFT', 'trauma', 'Client will develop and utilize a safety plan for managing trauma triggers within ___ weeks.');
    insertGoalsBank.run('MFT', 'trauma', 'Client will process traumatic experiences as evidenced by decreased avoidance and intrusive symptoms within ___ weeks.');

    insertGoalsBank.run('MFT', 'relationship', 'Client/couple will demonstrate improved communication skills as evidenced by ___ within ___ weeks.');
    insertGoalsBank.run('MFT', 'relationship', 'Client/couple will reduce frequency of escalated conflicts from ___ to ___ per week within ___ weeks.');
    insertGoalsBank.run('MFT', 'relationship', 'Client/couple will identify and modify ___ negative interaction patterns within ___ weeks.');
    insertGoalsBank.run('MFT', 'relationship', 'Client/couple will report improved relationship satisfaction as measured by ___ within ___ weeks.');

    insertGoalsBank.run('MFT', 'family_systems', 'Family will establish and maintain ___ healthy boundaries as evidenced by ___ within ___ weeks.');
    insertGoalsBank.run('MFT', 'family_systems', 'Family members will demonstrate improved conflict resolution skills within ___ weeks.');
    insertGoalsBank.run('MFT', 'family_systems', 'Family will increase frequency of positive interactions to ___ per week within ___ weeks.');
    insertGoalsBank.run('MFT', 'family_systems', 'Parent(s) will implement ___ consistent parenting strategies as discussed in session within ___ weeks.');

    insertGoalsBank.run('MFT', 'coping_skills', 'Client will identify and practice ___ healthy coping mechanisms for managing ___ within ___ weeks.');
    insertGoalsBank.run('MFT', 'coping_skills', 'Client will demonstrate ability to use grounding techniques when experiencing ___ within ___ weeks.');
    insertGoalsBank.run('MFT', 'coping_skills', 'Client will develop a personalized wellness plan including ___ self-care activities within ___ weeks.');

    insertGoalsBank.run('MFT', 'self_esteem', 'Client will identify ___ personal strengths and report improved self-perception within ___ weeks.');
    insertGoalsBank.run('MFT', 'self_esteem', 'Client will challenge ___ negative self-beliefs per session as evidenced by cognitive restructuring within ___ weeks.');

    insertGoalsBank.run('MFT', 'grief', 'Client will process grief related to ___ as evidenced by decreased emotional distress within ___ weeks.');
    insertGoalsBank.run('MFT', 'grief', 'Client will identify ___ healthy ways to honor/memorialize their loss within ___ weeks.');

    insertGoalsBank.run('MFT', 'behavioral', 'Client will reduce frequency of ___ (target behavior) from ___ to ___ per week within ___ weeks.');
    insertGoalsBank.run('MFT', 'behavioral', 'Client will increase frequency of ___ (replacement behavior) to ___ per week within ___ weeks.');
    insertGoalsBank.run('MFT', 'behavioral', 'Client will identify ___ triggers for maladaptive behaviors and develop alternative responses within ___ weeks.');
  });

  seedTransaction();

  // ── MFT CPT Codes in Fee Schedule ──
  try {
    const hasFeeData = db.prepare(
      "SELECT COUNT(*) as count FROM fee_schedule WHERE cpt_code = '90834'"
    ).get() as any;
    if (hasFeeData.count === 0) {
      const insertFee = db.prepare(
        'INSERT INTO fee_schedule (cpt_code, description, default_units, amount, effective_date) VALUES (?, ?, ?, ?, ?)'
      );
      const today = new Date().toISOString().slice(0, 10);

      const mftCPTCodes = [
        { cpt_code: '90791', description: 'Psychiatric diagnostic evaluation', default_units: 1, amount: 200.00 },
        { cpt_code: '90834', description: 'Psychotherapy, 45 minutes', default_units: 1, amount: 130.00 },
        { cpt_code: '90837', description: 'Psychotherapy, 60 minutes', default_units: 1, amount: 170.00 },
        { cpt_code: '90832', description: 'Psychotherapy, 30 minutes', default_units: 1, amount: 85.00 },
        { cpt_code: '90847', description: 'Family psychotherapy, with patient', default_units: 1, amount: 160.00 },
        { cpt_code: '90846', description: 'Family psychotherapy, without patient', default_units: 1, amount: 150.00 },
        { cpt_code: '90839', description: 'Psychotherapy for crisis, first 60 min', default_units: 1, amount: 200.00 },
        { cpt_code: '90840', description: 'Psychotherapy for crisis, add-on 30 min', default_units: 1, amount: 100.00 },
        { cpt_code: '90853', description: 'Group psychotherapy', default_units: 1, amount: 55.00 },
        { cpt_code: '96156', description: 'Health behavior assessment/reassessment', default_units: 1, amount: 150.00 },
        { cpt_code: '96158', description: 'Health behavior intervention, first 30 min', default_units: 1, amount: 75.00 },
        { cpt_code: '96159', description: 'Health behavior intervention, add-on 15 min', default_units: 1, amount: 38.00 },
      ];

      const feeTransaction = db.transaction(() => {
        for (const fee of mftCPTCodes) {
          insertFee.run(fee.cpt_code, fee.description, fee.default_units, fee.amount, today);
        }
      });
      feeTransaction();
    }
  } catch {
    // Fee schedule table may not exist yet
  }
}

// Seed common fee schedule entries for V2 billing
export function seedFeeSchedule(db: Database.Database): void {
  // Check if fee_schedule table exists and has data
  try {
    const hasData = db.prepare('SELECT COUNT(*) as count FROM fee_schedule').get() as any;
    if (hasData.count > 0) return;
  } catch {
    // Table doesn't exist yet (migrations haven't run)
    return;
  }

  const insertFee = db.prepare(
    'INSERT INTO fee_schedule (cpt_code, description, default_units, amount, effective_date) VALUES (?, ?, ?, ?, ?)'
  );

  const commonCPTCodes = [
    // Speech Therapy
    { cpt_code: '92507', description: 'Speech/language treatment', default_units: 1, amount: 75.00 },
    { cpt_code: '92508', description: 'Speech/language treatment (group)', default_units: 1, amount: 50.00 },
    { cpt_code: '92521', description: 'Evaluation of speech fluency', default_units: 1, amount: 150.00 },
    { cpt_code: '92522', description: 'Evaluation of speech production', default_units: 1, amount: 150.00 },
    { cpt_code: '92523', description: 'Speech/language evaluation', default_units: 1, amount: 200.00 },
    { cpt_code: '92524', description: 'Behavioral/qualitative voice analysis', default_units: 1, amount: 150.00 },
    { cpt_code: '92526', description: 'Oral function treatment', default_units: 1, amount: 75.00 },
    { cpt_code: '92610', description: 'Swallowing function evaluation', default_units: 1, amount: 175.00 },
    // Physical/Occupational Therapy
    { cpt_code: '97110', description: 'Therapeutic exercises', default_units: 1, amount: 50.00 },
    { cpt_code: '97112', description: 'Neuromuscular reeducation', default_units: 1, amount: 50.00 },
    { cpt_code: '97116', description: 'Gait training', default_units: 1, amount: 50.00 },
    { cpt_code: '97140', description: 'Manual therapy', default_units: 1, amount: 50.00 },
    { cpt_code: '97530', description: 'Therapeutic activities', default_units: 1, amount: 50.00 },
    { cpt_code: '97533', description: 'Sensory integration', default_units: 1, amount: 50.00 },
    { cpt_code: '97535', description: 'Self-care/home management training', default_units: 1, amount: 50.00 },
    { cpt_code: '97542', description: 'Wheelchair management training', default_units: 1, amount: 50.00 },
    { cpt_code: '97750', description: 'Physical performance test', default_units: 1, amount: 75.00 },
    { cpt_code: '97755', description: 'Assistive technology assessment', default_units: 1, amount: 100.00 },
    { cpt_code: '97760', description: 'Orthotic management/training', default_units: 1, amount: 50.00 },
    { cpt_code: '97761', description: 'Prosthetic training', default_units: 1, amount: 50.00 },
    // Evaluations
    { cpt_code: '97161', description: 'PT evaluation - low complexity', default_units: 1, amount: 125.00 },
    { cpt_code: '97162', description: 'PT evaluation - moderate complexity', default_units: 1, amount: 150.00 },
    { cpt_code: '97163', description: 'PT evaluation - high complexity', default_units: 1, amount: 175.00 },
    { cpt_code: '97164', description: 'PT re-evaluation', default_units: 1, amount: 100.00 },
    { cpt_code: '97165', description: 'OT evaluation - low complexity', default_units: 1, amount: 125.00 },
    { cpt_code: '97166', description: 'OT evaluation - moderate complexity', default_units: 1, amount: 150.00 },
    { cpt_code: '97167', description: 'OT evaluation - high complexity', default_units: 1, amount: 175.00 },
    { cpt_code: '97168', description: 'OT re-evaluation', default_units: 1, amount: 100.00 },
  ];

  const today = new Date().toISOString().slice(0, 10);

  const seedTransaction = db.transaction(() => {
    for (const fee of commonCPTCodes) {
      insertFee.run(fee.cpt_code, fee.description, fee.default_units, fee.amount, today);
    }
  });

  seedTransaction();
}
