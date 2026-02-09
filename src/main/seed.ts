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
    // Format: No subject prefix (GoalBuilder adds "Patient/Client will"), no trailing timeframe (GoalBuilder adds it).
    // Use {target} / {baseline} for percentage fields that map to the CLOF/Target sliders.
    // Use ___ for free-text placeholders that QuickChips or manual entry can fill.

    // PT Goals
    insertGoalsBank.run('PT', 'Mobility', 'ambulate ___ ft with ___ device and ___ assist');
    insertGoalsBank.run('PT', 'Mobility', 'ambulate on level surfaces with normalized gait pattern, no device');
    insertGoalsBank.run('PT', 'Mobility', 'navigate stairs with ___ assist and ___ railing');
    insertGoalsBank.run('PT', 'Mobility', 'perform sit-to-stand from standard height chair with ___ assist');
    insertGoalsBank.run('PT', 'Strength', 'demonstrate ___ strength of ___/5 in ___');
    insertGoalsBank.run('PT', 'Strength', 'improve grip strength to ___ lbs bilaterally');
    insertGoalsBank.run('PT', 'ROM', 'achieve ___ AROM of ___ degrees');
    insertGoalsBank.run('PT', 'ROM', 'demonstrate functional ROM for ___');
    insertGoalsBank.run('PT', 'Balance', 'maintain static standing balance for ___ seconds without LOB');
    insertGoalsBank.run('PT', 'Balance', 'achieve Berg Balance Scale score of ___/56');
    insertGoalsBank.run('PT', 'Balance', 'perform dynamic balance activities with ___ LOB');
    insertGoalsBank.run('PT', 'Pain Management', 'report pain reduction to ___/10 with functional activities');
    insertGoalsBank.run('PT', 'Functional Activity', 'independently perform HEP with correct form');
    insertGoalsBank.run('PT', 'Functional Activity', 'return to ___ (work/sport/activity) without limitations');
    insertGoalsBank.run('PT', 'Transfers', 'complete bed mobility with ___ assist');
    insertGoalsBank.run('PT', 'Transfers', 'perform all transfers with ___ assist');

    // OT Goals
    insertGoalsBank.run('OT', 'ADLs', 'complete upper body dressing with ___ assist');
    insertGoalsBank.run('OT', 'ADLs', 'complete lower body dressing with ___ assist');
    insertGoalsBank.run('OT', 'ADLs', 'complete grooming tasks with ___ assist');
    insertGoalsBank.run('OT', 'ADLs', 'complete bathing with ___ assist');
    insertGoalsBank.run('OT', 'ADLs', 'independently feed self with ___ setup');
    insertGoalsBank.run('OT', 'ADLs', 'prepare a simple meal with ___ assist');
    insertGoalsBank.run('OT', 'ADLs', 'manage medications with ___ assist');
    insertGoalsBank.run('OT', 'ADLs', 'perform light housekeeping with ___ assist');
    insertGoalsBank.run('OT', 'Fine Motor', 'demonstrate functional grasp/release for ___ tasks');
    insertGoalsBank.run('OT', 'Fine Motor', 'improve fine motor coordination for ___');
    insertGoalsBank.run('OT', 'Fine Motor', 'achieve grip strength of ___ lbs for functional tasks');
    insertGoalsBank.run('OT', 'Cognitive', 'follow ___-step commands with ___ cues');
    insertGoalsBank.run('OT', 'Cognitive', 'demonstrate improved sequencing for ___-step tasks');
    insertGoalsBank.run('OT', 'Cognitive', 'utilize compensatory strategies for ___ with ___ cues');
    insertGoalsBank.run('OT', 'Upper Extremity', 'achieve functional AROM of ___ for ___');
    insertGoalsBank.run('OT', 'Self-Care', 'demonstrate safe ___ techniques with ___ cues');

    // ST Goals
    insertGoalsBank.run('ST', 'Articulation', 'produce target sounds in ___ position with {target} accuracy at ___ level');
    insertGoalsBank.run('ST', 'Articulation', 'produce {target} intelligible speech in ___ context');
    insertGoalsBank.run('ST', 'Language Expression', 'name ___ items in ___ categories with {target} accuracy');
    insertGoalsBank.run('ST', 'Language Expression', 'produce grammatically correct sentences of ___+ words');
    insertGoalsBank.run('ST', 'Language Expression', 'use ___ word retrieval strategies with ___ cues');
    insertGoalsBank.run('ST', 'Language Comprehension', 'follow ___-step commands with {target} accuracy');
    insertGoalsBank.run('ST', 'Language Comprehension', 'answer ___ questions about ___ with {target} accuracy');
    insertGoalsBank.run('ST', 'Language Comprehension', 'identify main idea in ___ with {target} accuracy');
    insertGoalsBank.run('ST', 'Voice', 'demonstrate appropriate vocal quality during ___ tasks');
    insertGoalsBank.run('ST', 'Voice', 'maintain adequate breath support for ___');
    insertGoalsBank.run('ST', 'Fluency', 'use ___ fluency strategy with {target} success in ___ context');
    insertGoalsBank.run('ST', 'Fluency', 'demonstrate {target} fluent speech in ___ speaking tasks');
    insertGoalsBank.run('ST', 'Feeding/Swallowing', 'safely tolerate ___ consistency with ___ strategy');
    insertGoalsBank.run('ST', 'Feeding/Swallowing', 'demonstrate safe swallow with ___ diet with no s/s aspiration');
    insertGoalsBank.run('ST', 'Cognitive-Communication', 'recall ___/5 items after ___ delay with ___ cues');
    insertGoalsBank.run('ST', 'Cognitive-Communication', 'sustain attention for ___ min on ___ task');
    insertGoalsBank.run('ST', 'Cognitive-Communication', 'identify ___/5 safety concerns in functional scenarios');
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
    // Format: No "Client will" prefix (GoalBuilder adds discipline-appropriate subject).
    // No trailing "within ___ weeks" (GoalBuilder adds timeframe from slider).
    insertGoalsBank.run('MFT', 'Depression', 'report reduction in depressive symptoms to a PHQ-9 score of ___ or below');
    insertGoalsBank.run('MFT', 'Depression', 'identify ___ positive coping strategies for managing depressive episodes');
    insertGoalsBank.run('MFT', 'Depression', 'engage in ___ pleasurable activities per week as reported in session');

    insertGoalsBank.run('MFT', 'Anxiety', 'report reduction in anxiety symptoms to a GAD-7 score of ___ or below');
    insertGoalsBank.run('MFT', 'Anxiety', 'demonstrate use of ___ anxiety management techniques in daily life');
    insertGoalsBank.run('MFT', 'Anxiety', 'reduce avoidance behaviors related to ___ as evidenced by ___');

    insertGoalsBank.run('MFT', 'Trauma', 'demonstrate reduction in trauma-related symptoms as measured by ___');
    insertGoalsBank.run('MFT', 'Trauma', 'develop and utilize a safety plan for managing trauma triggers');
    insertGoalsBank.run('MFT', 'Trauma', 'process traumatic experiences as evidenced by decreased avoidance and intrusive symptoms');

    insertGoalsBank.run('MFT', 'Relationship', 'demonstrate improved communication skills as evidenced by ___');
    insertGoalsBank.run('MFT', 'Relationship', 'reduce frequency of escalated conflicts from ___ to ___ per week');
    insertGoalsBank.run('MFT', 'Relationship', 'identify and modify ___ negative interaction patterns');
    insertGoalsBank.run('MFT', 'Relationship', 'report improved relationship satisfaction as measured by ___');

    insertGoalsBank.run('MFT', 'Family Systems', 'establish and maintain ___ healthy boundaries as evidenced by ___');
    insertGoalsBank.run('MFT', 'Family Systems', 'demonstrate improved conflict resolution skills');
    insertGoalsBank.run('MFT', 'Family Systems', 'increase frequency of positive interactions to ___ per week');
    insertGoalsBank.run('MFT', 'Family Systems', 'implement ___ consistent parenting strategies as discussed in session');

    insertGoalsBank.run('MFT', 'Coping Skills', 'identify and practice ___ healthy coping mechanisms for managing ___');
    insertGoalsBank.run('MFT', 'Coping Skills', 'demonstrate ability to use grounding techniques when experiencing ___');
    insertGoalsBank.run('MFT', 'Coping Skills', 'develop a personalized wellness plan including ___ self-care activities');

    insertGoalsBank.run('MFT', 'Self-Esteem', 'identify ___ personal strengths and report improved self-perception');
    insertGoalsBank.run('MFT', 'Self-Esteem', 'challenge ___ negative self-beliefs per session as evidenced by cognitive restructuring');

    insertGoalsBank.run('MFT', 'Grief', 'process grief related to ___ as evidenced by decreased emotional distress');
    insertGoalsBank.run('MFT', 'Grief', 'identify ___ healthy ways to honor/memorialize their loss');

    insertGoalsBank.run('MFT', 'Behavioral', 'reduce frequency of ___ (target behavior) from ___ to ___ per week');
    insertGoalsBank.run('MFT', 'Behavioral', 'increase frequency of ___ (replacement behavior) to ___ per week');
    insertGoalsBank.run('MFT', 'Behavioral', 'identify ___ triggers for maladaptive behaviors and develop alternative responses');
  });

  seedTransaction();
}

// Seed goal-category-aligned note bank phrases for Quick Chips intelligence
// Runs separately so existing users get these phrases on update
export function seedCategoryAlignedPhrases(db: Database.Database): void {
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
function getCPTCodesForDiscipline(discipline: string): Array<{ cpt_code: string; description: string; default_units: number; amount: number }> {
  const ptOtShared = [
    { cpt_code: '97110', description: 'Therapeutic exercises', default_units: 1, amount: 50.00 },
    { cpt_code: '97112', description: 'Neuromuscular reeducation', default_units: 1, amount: 50.00 },
    { cpt_code: '97116', description: 'Gait training', default_units: 1, amount: 50.00 },
    { cpt_code: '97140', description: 'Manual therapy', default_units: 1, amount: 55.00 },
    { cpt_code: '97530', description: 'Therapeutic activities', default_units: 1, amount: 50.00 },
    { cpt_code: '97535', description: 'Self-care/home management training', default_units: 1, amount: 50.00 },
    { cpt_code: '97542', description: 'Wheelchair management training', default_units: 1, amount: 45.00 },
    { cpt_code: '97750', description: 'Physical performance test', default_units: 1, amount: 60.00 },
    { cpt_code: '97533', description: 'Sensory integration', default_units: 1, amount: 50.00 },
  ];

  switch (discipline) {
    case 'PT':
      return [
        ...ptOtShared,
        { cpt_code: '97161', description: 'PT evaluation - low complexity', default_units: 1, amount: 150.00 },
        { cpt_code: '97162', description: 'PT evaluation - moderate complexity', default_units: 1, amount: 175.00 },
        { cpt_code: '97163', description: 'PT evaluation - high complexity', default_units: 1, amount: 200.00 },
        { cpt_code: '97164', description: 'PT re-evaluation', default_units: 1, amount: 100.00 },
      ];
    case 'OT':
      return [
        ...ptOtShared,
        { cpt_code: '97165', description: 'OT evaluation - low complexity', default_units: 1, amount: 150.00 },
        { cpt_code: '97166', description: 'OT evaluation - moderate complexity', default_units: 1, amount: 175.00 },
        { cpt_code: '97167', description: 'OT evaluation - high complexity', default_units: 1, amount: 200.00 },
        { cpt_code: '97168', description: 'OT re-evaluation', default_units: 1, amount: 100.00 },
      ];
    case 'ST':
      return [
        { cpt_code: '92507', description: 'Speech/language treatment', default_units: 1, amount: 75.00 },
        { cpt_code: '92508', description: 'Speech/language treatment (group)', default_units: 1, amount: 50.00 },
        { cpt_code: '92521', description: 'Evaluation of speech fluency', default_units: 1, amount: 150.00 },
        { cpt_code: '92522', description: 'Evaluation of speech production', default_units: 1, amount: 150.00 },
        { cpt_code: '92523', description: 'Speech/language evaluation', default_units: 1, amount: 200.00 },
        { cpt_code: '92524', description: 'Behavioral/qualitative voice analysis', default_units: 1, amount: 150.00 },
        { cpt_code: '92526', description: 'Oral function treatment', default_units: 1, amount: 75.00 },
        { cpt_code: '92610', description: 'Swallowing function evaluation', default_units: 1, amount: 175.00 },
        { cpt_code: '97129', description: 'Cognitive function intervention, first 15 min', default_units: 1, amount: 50.00 },
        { cpt_code: '97130', description: 'Cognitive function intervention, add-on 15 min', default_units: 1, amount: 38.00 },
      ];
    case 'MFT':
      return [
        { cpt_code: '90791', description: 'Psychiatric diagnostic evaluation', default_units: 1, amount: 200.00 },
        { cpt_code: '90834', description: 'Psychotherapy, 45 minutes', default_units: 1, amount: 130.00 },
        { cpt_code: '90837', description: 'Psychotherapy, 60 minutes', default_units: 1, amount: 170.00 },
        { cpt_code: '90832', description: 'Psychotherapy, 30 minutes', default_units: 1, amount: 85.00 },
        { cpt_code: '90847', description: 'Family psychotherapy, with patient', default_units: 1, amount: 160.00 },
        { cpt_code: '90846', description: 'Family psychotherapy, without patient', default_units: 1, amount: 150.00 },
        { cpt_code: '90853', description: 'Group psychotherapy', default_units: 1, amount: 55.00 },
      ];
    default: // MULTI or unknown — broad set
      return [
        { cpt_code: '97110', description: 'Therapeutic exercises', default_units: 1, amount: 50.00 },
        { cpt_code: '97530', description: 'Therapeutic activities', default_units: 1, amount: 50.00 },
        { cpt_code: '97140', description: 'Manual therapy', default_units: 1, amount: 55.00 },
        { cpt_code: '92507', description: 'Speech/language treatment', default_units: 1, amount: 75.00 },
        { cpt_code: '92523', description: 'Speech/language evaluation', default_units: 1, amount: 200.00 },
        { cpt_code: '97161', description: 'PT evaluation - low complexity', default_units: 1, amount: 150.00 },
        { cpt_code: '97165', description: 'OT evaluation - low complexity', default_units: 1, amount: 150.00 },
        { cpt_code: '90834', description: 'Psychotherapy, 45 minutes', default_units: 1, amount: 130.00 },
      ];
  }
}

// Seed fee schedule entries — discipline-aware
export function seedFeeSchedule(db: Database.Database, discipline?: string): void {
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
    'INSERT INTO fee_schedule (cpt_code, description, default_units, amount, effective_date) VALUES (?, ?, ?, ?, ?)'
  );

  const tx = db.transaction(() => {
    for (const fee of codes) {
      insertFee.run(fee.cpt_code, fee.description, fee.default_units, fee.amount, today);
    }
  });
  tx();
}

// Reset fee schedule to discipline defaults (called when discipline changes)
export function resetFeeSchedule(db: Database.Database, discipline: string): void {
  try {
    db.prepare('DELETE FROM fee_schedule').run();
  } catch {
    return;
  }
  // Force re-seed by calling with discipline
  const codes = getCPTCodesForDiscipline(discipline);
  const today = new Date().toISOString().slice(0, 10);
  const insertFee = db.prepare(
    'INSERT INTO fee_schedule (cpt_code, description, default_units, amount, effective_date) VALUES (?, ?, ?, ?, ?)'
  );
  const tx = db.transaction(() => {
    for (const fee of codes) {
      insertFee.run(fee.cpt_code, fee.description, fee.default_units, fee.amount, today);
    }
  });
  tx();
}

// Auto-fix: detect mismatched fee schedule on startup
export function autoFixFeeSchedule(db: Database.Database): void {
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
