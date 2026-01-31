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
