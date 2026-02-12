/**
 * Demo Data Seed Script
 * Creates 5 demo clients at various treatment stages with realistic clinical data.
 * Invoked via IPC handler 'dev:seedDemoData' — call once, then remove.
 */

import type Database from 'better-sqlite3';

// ── Helpers ──
function daysAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function dateTimeAgo(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 19).replace('T', ' ');
}
function timeSlot(hour: number, min: number = 0): string {
  return `${String(hour).padStart(2, '0')}:${String(min).padStart(2, '0')}`;
}

export function seedDemoData(db: Database.Database) {
  const now = new Date().toISOString().slice(0, 19).replace('T', ' ');

  // Check if demo data already exists
  const existing = db.prepare("SELECT id FROM clients WHERE first_name = 'Marcus' AND last_name = 'Rivera'").get();
  if (existing) {
    return { seeded: false, message: 'Demo data already exists.' };
  }

  const counts = { clients: 0, notes: 0, evaluations: 0, goals: 0, appointments: 0 };

  // ═══════════════════════════════════════════════════════════════
  // CLIENT 1: Marcus Rivera — Active, mid-treatment (ST)
  //   Has eval, 6 signed notes, active goals
  // ═══════════════════════════════════════════════════════════════
  const c1 = db.prepare(`
    INSERT INTO clients (first_name, last_name, dob, phone, email, status, discipline,
      primary_dx_code, primary_dx_description, default_cpt_code, gender,
      address, city, state, zip,
      insurance_payer, insurance_member_id, insurance_group,
      referring_physician, referring_npi)
    VALUES (?, ?, ?, ?, ?, 'active', 'ST',
      'F80.2', 'Mixed receptive-expressive language disorder', '92507',
      'M', '412 Oak Lane', 'Springfield', 'IL', '62704',
      'Blue Cross Blue Shield', 'BCBS-9834721', 'GRP-4420',
      'Dr. Sarah Chen', '1234567890')
  `).run('Marcus', 'Rivera', '2018-06-15', '(217) 555-0142', 'mrivera.parent@email.com');
  const c1id = Number(c1.lastInsertRowid);
  counts.clients++;

  // Eval
  const evalContent1 = JSON.stringify({
    chiefComplaint: 'Parent reports difficulty following multi-step directions and limited sentence length.',
    history: 'Marcus is a 6-year-old male referred by Dr. Chen for speech-language evaluation. He was born full-term with no birth complications. Speech-language milestones were delayed; first words at 18 months, two-word combinations at 30 months. He is currently in kindergarten and receiving no other services.',
    observations: 'Marcus presented as a cooperative child who engaged well with structured tasks. He demonstrated reduced attention to auditory stimuli and required frequent repetition of instructions. Spontaneous speech consisted primarily of 3-4 word utterances with some grammatical errors.',
    testResults: 'CELF-5: Receptive Language Index 78, Expressive Language Index 74, Core Language Score 75. GFTA-3: Standard Score 88. MLU: 3.2 morphemes.',
    clinicalImpression: 'Marcus presents with a mixed receptive-expressive language disorder characterized by reduced auditory comprehension, limited sentence length, and grammatical errors. Articulation is within functional limits. Skills are approximately 1.5-2 standard deviations below age expectations.',
    recommendations: 'Speech-language therapy 2x/week for 30-minute sessions targeting receptive language strategies, expressive sentence formulation, and grammatical morpheme use. Re-evaluation recommended in 6 months.',
    plan: 'Begin therapy next week. Parent education on language stimulation strategies at home.'
  });
  db.prepare(`
    INSERT INTO evaluations (client_id, eval_date, discipline, content, signed_at, signature_typed, eval_type)
    VALUES (?, ?, 'ST', ?, ?, 'J. Doe, M.S., CCC-SLP', 'initial')
  `).run(c1id, daysAgo(60), evalContent1, dateTimeAgo(60));
  counts.evaluations++;

  // Goals for Marcus
  const g1a = db.prepare(`INSERT INTO goals (client_id, goal_text, goal_type, category, status, target_date, baseline, target, measurement_type) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`);
  g1a.run(c1id, 'Marcus will follow 2-step related directions with 80% accuracy across 3 consecutive sessions.', 'STG', 'Receptive Language', 'active', daysAgo(-30), 40, 80, 'percentage');
  g1a.run(c1id, 'Marcus will produce grammatically correct sentences of 5+ words in length with 80% accuracy.', 'STG', 'Expressive Language', 'active', daysAgo(-30), 30, 80, 'percentage');
  g1a.run(c1id, 'Marcus will improve Core Language Score on CELF-5 to within 1 SD of age expectations.', 'LTG', 'Language', 'active', daysAgo(-120), 75, 85, 'percentage');
  counts.goals += 3;

  // 6 signed notes for Marcus (past 60 days, ~2x/week)
  const marcusNotes = [
    { dos: daysAgo(56), s: 'Parent reports Marcus had a good week. He has been trying to use longer sentences at home. Mom notes he still struggles with following directions at school per teacher feedback.', o: 'Marcus followed 1-step directions with 90% accuracy and 2-step directions with 45% accuracy. He produced spontaneous sentences averaging 3.5 words. Grammatical morpheme use (past tense -ed, plural -s) was inconsistent at 40% accuracy. He was engaged and cooperative throughout the session.', a: 'Marcus continues to demonstrate reduced auditory comprehension for multi-step directions. Expressive language shows slow but steady progress in sentence length. Grammatical morpheme targets require continued direct instruction. He responds well to visual supports.', p: 'Continue targeting 2-step directions with visual cue fading. Introduce carrier phrases to increase MLU. Begin focused stimulation for regular past tense -ed.' },
    { dos: daysAgo(49), s: 'Mom reports Marcus used a 5-word sentence spontaneously at dinner: "I want more chicken please." She was very excited. School report indicates continued difficulty in group instruction.', o: 'Marcus followed 2-step related directions with 50% accuracy (up from 45%). Sentence length averaged 3.8 words. Past tense -ed targets produced with 35% accuracy in structured drill, 20% in conversation. Responded positively to a token reinforcement system.', a: 'Positive progress noted in sentence length. Receptive language for multi-step directions improving gradually. Grammatical morpheme acquisition is progressing more slowly; may need to adjust approach to include more recasting strategies during play-based activities.', p: 'Continue current targets. Add recasting of grammatical errors during play. Send home practice sheet for 2-step directions.' },
    { dos: daysAgo(42), s: 'Parent was unable to attend today. Grandparent brought Marcus and reported he has been "talking more" at home. No new concerns.', o: 'Marcus followed 2-step directions with 55% accuracy. He self-corrected on 2 trials when given a "think again" prompt. Expressive sentence length averaged 4.0 words. Past tense -ed accuracy: 45% structured, 25% conversation. Plural -s: 60% accuracy.', a: 'Steady progress across all targets. The improvement in 2-step directions is encouraging. Self-correction behavior suggests developing metalinguistic awareness. Recommend continuing current intensity.', p: 'Continue 2-step direction targets. Begin fading visual supports for directions. Maintain grammatical morpheme targets.' },
    { dos: daysAgo(35), s: 'Mom reports teacher mentioned Marcus is "doing better" in circle time and following classroom routines more independently. Marcus told mom about his day using 2 full sentences.', o: 'Two-step directions: 60% accuracy (approaching target trajectory). Sentence length: 4.2 words average, with some 5-word productions. Past tense -ed: 50% structured. Plural -s: 70%. Marcus initiated 3 conversational exchanges during play.', a: 'Marcus is making consistent progress across receptive and expressive language domains. Classroom carryover is being reported, which is a positive functional indicator. Goal progress is on track for the current certification period.', p: 'Continue all targets. Begin introducing 2-step unrelated directions. Challenge sentence length with story retell activities.' },
    { dos: daysAgo(21), s: 'Parent reports Marcus told a "whole story" about a playground event using 4 sentences. She asked about summer services.', o: 'Two-step directions: 65% accuracy. Sentence length: 4.5 words average with one 6-word sentence. Past tense -ed: 55% structured, 35% conversation. Story retell included 3 of 5 key elements with temporal sequencing (first, then).', a: 'Strong progress trajectory. Marcus is beginning to use more complex language spontaneously. Narrative skills are emerging. Discussed summer therapy schedule with parent to maintain gains.', p: 'Continue current plan. Add narrative structure targets. Prepare progress report for next session.' },
    { dos: daysAgo(14), s: 'Mom confirms summer availability Tu/Th. Marcus reported excited about upcoming birthday party. Used future tense "I am going to have cake."', o: 'Two-step directions: 70% accuracy. MLU: 4.6. Past tense -ed: 60% structured, 40% conversation. Story retell: 4/5 key elements. Marcus asked 3 "wh" questions spontaneously.', a: 'Marcus continues to make excellent progress. He is on track to meet his short-term goals within the next 4-6 weeks. Spontaneous question use is a new positive development not specifically targeted. Parent engagement remains strong.', p: 'Continue all targets. Begin preparing for progress report and potential goal modification. Summer schedule confirmed 2x/week.' },
  ];
  for (const n of marcusNotes) {
    db.prepare(`
      INSERT INTO notes (client_id, date_of_service, time_in, time_out, units, cpt_code,
        subjective, objective, assessment, plan, signed_at, signature_typed, note_type, patient_name)
      VALUES (?, ?, '09:00', '09:30', 2, '92507', ?, ?, ?, ?, ?, 'J. Doe, M.S., CCC-SLP', 'soap', 'Marcus Rivera')
    `).run(c1id, n.dos, n.s, n.o, n.a, n.p, n.dos + ' 09:35:00');
    counts.notes++;
  }

  // Appointments for Marcus (some completed, some upcoming)
  const apptInsert = db.prepare(`INSERT INTO appointments (client_id, scheduled_date, scheduled_time, duration_minutes, status, patient_name, session_type) VALUES (?, ?, ?, ?, ?, ?, ?)`);
  apptInsert.run(c1id, daysAgo(56), '09:00', 30, 'completed', 'Marcus Rivera', 'visit');
  apptInsert.run(c1id, daysAgo(49), '09:00', 30, 'completed', 'Marcus Rivera', 'visit');
  apptInsert.run(c1id, daysAgo(42), '09:00', 30, 'completed', 'Marcus Rivera', 'visit');
  apptInsert.run(c1id, daysAgo(35), '09:00', 30, 'completed', 'Marcus Rivera', 'visit');
  apptInsert.run(c1id, daysAgo(21), '09:00', 30, 'completed', 'Marcus Rivera', 'visit');
  apptInsert.run(c1id, daysAgo(14), '09:00', 30, 'completed', 'Marcus Rivera', 'visit');
  apptInsert.run(c1id, daysAgo(-3), '09:00', 30, 'scheduled', 'Marcus Rivera', 'visit');
  apptInsert.run(c1id, daysAgo(-7), '09:00', 30, 'scheduled', 'Marcus Rivera', 'visit');
  counts.appointments += 8;


  // ═══════════════════════════════════════════════════════════════
  // CLIENT 2: Ava Thompson — Active, early treatment (OT)
  //   Has eval, 3 notes, fresh goals
  // ═══════════════════════════════════════════════════════════════
  const c2 = db.prepare(`
    INSERT INTO clients (first_name, last_name, dob, phone, email, status, discipline,
      primary_dx_code, primary_dx_description, default_cpt_code, gender,
      address, city, state, zip,
      insurance_payer, insurance_member_id,
      referring_physician, referring_npi)
    VALUES (?, ?, ?, ?, ?, 'active', 'OT',
      'F82', 'Developmental coordination disorder', '97530',
      'F', '88 Maple Drive', 'Springfield', 'IL', '62702',
      'Aetna', 'AET-55210987',
      'Dr. Michael Park', '9876543210')
  `).run('Ava', 'Thompson', '2016-03-22', '(217) 555-0298', 'thompson.family@email.com');
  const c2id = Number(c2.lastInsertRowid);
  counts.clients++;

  // Eval
  const evalContent2 = JSON.stringify({
    chiefComplaint: 'Parent reports difficulty with handwriting, scissor use, and buttoning clothes. Teacher reports Ava is falling behind peers in written work.',
    history: 'Ava is a 7-year-old female in 2nd grade. She was born at 37 weeks with no NICU stay. Motor milestones were mildly delayed; walked at 15 months. She has no prior therapy history. Mom notes Ava avoids coloring and cutting activities at home.',
    observations: 'Ava demonstrated a lateral tripod grasp with excessive pressure on writing tools. She had difficulty maintaining midline crossing. Bilateral coordination tasks showed reduced timing and sequencing. Ava was motivated but became frustrated during timed activities.',
    testResults: 'BOT-2: Fine Manual Control Composite 72, Manual Coordination 76, Body Coordination 80. Beery VMI: Standard Score 78. Visual Perception: 92. Motor Coordination: 71.',
    clinicalImpression: 'Ava presents with developmental coordination disorder affecting fine motor precision, bilateral coordination, and visual-motor integration. Visual perceptual skills are a relative strength. Her difficulties significantly impact academic handwriting and self-care independence.',
    recommendations: 'Occupational therapy 2x/week for 45-minute sessions targeting fine motor control, handwriting legibility, bilateral coordination, and self-care skills. Classroom accommodations recommended.',
    plan: 'Begin therapy this week. Coordinate with teacher for classroom modifications. Provide home exercises for scissor skills and button practice.'
  });
  db.prepare(`
    INSERT INTO evaluations (client_id, eval_date, discipline, content, signed_at, signature_typed, eval_type)
    VALUES (?, ?, 'OT', ?, ?, 'J. Doe, OTR/L', 'initial')
  `).run(c2id, daysAgo(21), evalContent2, dateTimeAgo(21));
  counts.evaluations++;

  // Goals for Ava
  g1a.run(c2id, 'Ava will copy 10 letters legibly using correct letter formation with 80% accuracy.', 'STG', 'Fine Motor / Handwriting', 'active', daysAgo(-60), 30, 80, 'percentage');
  g1a.run(c2id, 'Ava will cut along a curved line staying within 1/4 inch with 80% accuracy.', 'STG', 'Fine Motor / Scissors', 'active', daysAgo(-60), 20, 80, 'percentage');
  g1a.run(c2id, 'Ava will independently button/unbutton 4 buttons within 60 seconds.', 'STG', 'Self-Care / Dressing', 'active', daysAgo(-60), 0, 100, 'percentage');
  g1a.run(c2id, 'Ava will demonstrate age-appropriate fine motor skills for academic participation as measured by BOT-2 Fine Manual Control within 1 SD.', 'LTG', 'Fine Motor', 'active', daysAgo(-150), 72, 85, 'percentage');
  counts.goals += 4;

  // 3 signed notes
  const avaNotes = [
    { dos: daysAgo(18), s: 'Mom reports Ava has been more willing to try coloring at home. She still resists cutting with scissors. Teacher sent note that handwriting is "hard to read."', o: 'Ava demonstrated lateral tripod grasp with moderate pressure. She copied 3/10 letters with correct formation (C, O, L). Scissor skills: cut along a straight line within 1/2 inch, struggled with curves. Button task: completed 1 button in 45 seconds with verbal cues. She tolerated 40 minutes of table-top activities with 2 movement breaks.', a: 'Baseline data collected across all goal areas. Ava shows motivation to improve and responds well to positive reinforcement. Grasp pattern will benefit from pencil grip trial. Scissor skills require bilateral coordination intervention.', p: 'Trial pencil grips next session. Begin bilateral coordination exercises (tearing, lacing). Introduce button board for home practice.' },
    { dos: daysAgo(11), s: 'Mom reports Ava liked the pencil grip sent home and used it for homework. She completed a coloring page "without complaining." No scissor practice at home yet.', o: 'With crossover pencil grip, Ava copied 5/10 letters with correct formation. Line quality improved. Cut along curved line within 3/8 inch (improvement from 1/2 inch). Completed 2 buttons in 50 seconds with minimal cues. Bilateral coordination: alternating hand tapping 8/10 trials.', a: 'Good early progress. The pencil grip modification is positively impacting letter formation. Scissor accuracy improving. Button skills emerging. Ava is building confidence and frustration tolerance has improved.', p: 'Continue grip training. Add multi-sensory letter formation (sand tray, playdough). Begin curved cutting paths at home. Button practice 3x/week.' },
    { dos: daysAgo(4), s: 'Parent reports Ava asked to do a "cutting project" at home — first time ever. She buttoned her jacket independently this morning (took 2 minutes but did it alone). Teacher said handwriting "looks a little better."', o: 'Letter formation: 6/10 correct (C, O, L, T, H, I). Curved cutting: within 1/4 inch on 3/5 trials. Buttons: 2 buttons in 40 seconds with no verbal cues. In-hand manipulation: translated 4/5 small objects from palm to fingers. Maintained focus for full 45-minute session without breaks needed.', a: 'Ava is making excellent progress across all goal domains. Functional carryover to home and school is reported. Cutting accuracy approaching goal level. Self-care skills improving rapidly. Recommend continued 2x/week intensity.', p: 'Continue current plan. Introduce lowercase letter formation. Advance cutting to complex shapes. Begin zipper skills. Send updated home exercise program.' },
  ];
  for (const n of avaNotes) {
    db.prepare(`
      INSERT INTO notes (client_id, date_of_service, time_in, time_out, units, cpt_code,
        subjective, objective, assessment, plan, signed_at, signature_typed, note_type, patient_name)
      VALUES (?, ?, '10:00', '10:45', 3, '97530', ?, ?, ?, ?, ?, 'J. Doe, OTR/L', 'soap', 'Ava Thompson')
    `).run(c2id, n.dos, n.s, n.o, n.a, n.p, n.dos + ' 10:50:00');
    counts.notes++;
  }

  apptInsert.run(c2id, daysAgo(18), '10:00', 45, 'completed', 'Ava Thompson', 'visit');
  apptInsert.run(c2id, daysAgo(11), '10:00', 45, 'completed', 'Ava Thompson', 'visit');
  apptInsert.run(c2id, daysAgo(4), '10:00', 45, 'completed', 'Ava Thompson', 'visit');
  apptInsert.run(c2id, daysAgo(-3), '10:00', 45, 'scheduled', 'Ava Thompson', 'visit');
  counts.appointments += 4;


  // ═══════════════════════════════════════════════════════════════
  // CLIENT 3: Eleanor Washington — Discharged (PT)
  //   Has eval, 10 notes, a progress report, a discharge note,
  //   goals met, status = discharged
  // ═══════════════════════════════════════════════════════════════
  const c3 = db.prepare(`
    INSERT INTO clients (first_name, last_name, dob, phone, email, status, discipline,
      primary_dx_code, primary_dx_description, default_cpt_code, gender,
      address, city, state, zip,
      insurance_payer, insurance_member_id,
      referring_physician, referring_npi)
    VALUES (?, ?, ?, ?, ?, 'discharged', 'PT',
      'M54.5', 'Low back pain, unspecified', '97110',
      'F', '1920 Lincoln Ave', 'Springfield', 'IL', '62703',
      'Medicare', 'MCR-881234567A',
      'Dr. James Williams', '5556667777')
  `).run('Eleanor', 'Washington', '1952-11-08', '(217) 555-0387', 'eleanor.w@email.com');
  const c3id = Number(c3.lastInsertRowid);
  counts.clients++;

  // Eval
  const evalContent3 = JSON.stringify({
    chiefComplaint: 'Patient reports low back pain for 3 months following a fall at home. Pain rated 7/10 at worst. Difficulty with sitting tolerance, bending, and walking distances > 1 block.',
    history: 'Eleanor is a 72-year-old retired teacher. She fell stepping off her porch 3 months ago, landing on her right side. X-rays negative for fracture. She has a history of osteoarthritis and hypertension. She lives alone in a single-story home and is independent with basic ADLs but reports increased difficulty.',
    observations: 'Patient ambulated to clinic with slow, guarded gait pattern. Lumbar flexion limited to 40%. Sit-to-stand required use of armrests. She demonstrated fair balance on single-leg stance (5 seconds bilaterally). Posture showed increased thoracic kyphosis.',
    testResults: 'Lumbar ROM: Flexion 40%, Extension 30%, Lateral Flexion R 50% L 60%. MMT: Hip extensors 3+/5, abdominals 3/5, LE grossly 4/5. TUG: 18 seconds (fall risk cutoff 12s). Oswestry: 48% (severe disability). VAS: 7/10.',
    clinicalImpression: 'Eleanor presents with mechanical low back pain with functional limitations in mobility, balance, and endurance. Timed Up and Go score indicates elevated fall risk. She is a motivated patient with good rehabilitation potential given her prior functional level.',
    recommendations: 'Physical therapy 2x/week for 8 weeks targeting core stabilization, lumbar flexibility, balance training, and progressive ambulation endurance. Home exercise program. Fall prevention education.',
    plan: 'Begin therapy tomorrow. Initial focus on pain management and gentle ROM. Progress to strengthening by week 2.'
  });
  db.prepare(`
    INSERT INTO evaluations (client_id, eval_date, discipline, content, signed_at, signature_typed, eval_type)
    VALUES (?, ?, 'PT', ?, ?, 'J. Doe, DPT', 'initial')
  `).run(c3id, daysAgo(90), evalContent3, dateTimeAgo(90));
  counts.evaluations++;

  // Goals — all met
  g1a.run(c3id, 'Patient will demonstrate pain reduction to 3/10 or less on VAS during functional activities.', 'STG', 'Pain Management', 'met', daysAgo(30), 70, 30, 'percentage');
  g1a.run(c3id, 'Patient will complete Timed Up and Go in 12 seconds or less.', 'STG', 'Balance / Mobility', 'met', daysAgo(30), 18, 12, 'percentage');
  g1a.run(c3id, 'Patient will ambulate 4 blocks continuously without increased pain.', 'STG', 'Endurance', 'met', daysAgo(20), 10, 100, 'percentage');
  g1a.run(c3id, 'Patient will return to prior level of function with Oswestry score < 20%.', 'LTG', 'Functional Independence', 'met', daysAgo(10), 48, 20, 'percentage');
  counts.goals += 4;

  // 10 notes covering full course of treatment
  const eleanorNotes = [
    { dos: daysAgo(87), s: 'Patient reports pain 6/10 today, "a little better" after resting this weekend. She was able to walk to the mailbox without stopping.', o: 'Lumbar flexion 45%. TUG 17s. Initiated core bracing exercises in supine — tolerated well. Gentle hamstring stretching. Ambulated 200ft with upright posture. Ice applied 10 min post-exercise.', a: 'Slight improvement in ROM and TUG from evaluation. Patient demonstrates good understanding of core bracing. Pain response appropriate. Progressing per plan.', p: 'Continue ROM and core stabilization. Add seated marching next visit. Home exercises: supine pelvic tilts, hamstring stretch 2x/day.' },
    { dos: daysAgo(80), s: 'Reports pain 5/10, "the stretches are helping." She walked 1.5 blocks yesterday. No new complaints.', o: 'Lumbar flexion 50%. Extension 40%. TUG 16s. Core bracing maintained during seated marching 2 min. Bridge exercise 2x10. Ambulated 300ft.', a: 'Steady improvement in ROM, balance, and pain levels. Patient compliant with HEP. Ready to progress strengthening.', p: 'Add standing exercises (wall squats, hip hinge). Continue stretching. Progress ambulation distance.' },
    { dos: daysAgo(73), s: 'Pain 5/10 at worst, 3/10 at rest. "I can sit through dinner now." She walked 2 blocks yesterday.', o: 'Lumbar flexion 55%. TUG 15s. Wall squats 2x8 without pain increase. Single-leg stance 8s R, 7s L. Ambulated 400ft with normalized gait pattern.', a: 'Significant progress in all areas. Sitting tolerance improved per patient report. Balance improving. On track for goals.', p: 'Continue current program. Add tandem walking. Begin stair training next session.' },
    { dos: daysAgo(66), s: 'Pain 4/10. She went grocery shopping independently for the first time since the fall. "I used the cart for balance but I did it."', o: 'Lumbar flexion 60%. TUG 14s. Stairs: ascend/descend 8 steps with rail, step-over-step pattern. Tandem walk 10 steps with 1 loss of balance. Core strength improving — plank hold 15s.', a: 'Functional milestones being achieved. Grocery shopping represents meaningful community reintegration. Balance continues to improve. Approaching STG for pain.', p: 'Progress balance challenges. Stair training without rail. Increase home walking to 3 blocks.' },
    { dos: daysAgo(59), s: 'Pain 3/10 "most of the time." She walked 3 blocks yesterday with her neighbor. "I feel so much stronger."', o: 'Lumbar flexion 70%. TUG 13s. Stairs without rail: ascend with step-over-step, descend with step-to pattern. SLS 10s bilateral. Squat to 60 degrees without pain.', a: 'STG for pain (3/10) met. TUG approaching goal (12s). Patient demonstrates excellent motivation and HEP compliance. Anticipate meeting all goals within planned timeframe.', p: 'Continue strengthening and balance. Challenge with dual-task activities. Begin discharge planning discussions.' },
    { dos: daysAgo(52), s: 'Pain 2-3/10. Walked to church and back (4 blocks) Sunday without issues. Sleeping better — only wakes once from pain.', o: 'Lumbar flexion 75% (functional). TUG 12.5s. Dual-task walking (counting backwards): maintained gait pattern. Unilateral stance 12s. Step-ups 2x10 each leg.', a: 'Near full ROM restoration. TUG approaching cutoff. Walking endurance goal nearly met (4 blocks achieved). Sleep quality improvement noted. Prepare progress report.', p: 'Progress to final phase. High-level balance. Outdoor walking on uneven surfaces if weather permits.' },
    { dos: daysAgo(45), s: 'Pain 2/10 average. "I feel like myself again." She resumed her daily walks around the block.', o: 'Lumbar flexion 80%. TUG 12.0s — GOAL MET. SLS 15s bilaterally. Walked on grass without difficulty. Oswestry re-score: 24%.', a: 'TUG goal met. Pain goal exceeded. Ambulation endurance at community level. Oswestry improved from 48% to 24%. Approaching discharge criteria. One more STG to achieve (Oswestry < 20%).', p: 'Final strengthening progression. Outdoor balance course. Finalize HEP for independent maintenance.' },
    { dos: daysAgo(38), s: 'Pain 1-2/10. She cleaned her entire house this weekend. "I forgot I even had a back problem for a while."', o: 'Full functional ROM. TUG 11.5s. Completed outdoor walk on uneven terrain 0.5 miles. Dynamic balance: tandem walk backward 10 steps, single-leg reach. Oswestry: 18% — GOAL MET.', a: 'All STGs and LTG met. Patient has returned to prior level of function. She is safe for independent HEP maintenance. Recommend discharge next session.', p: 'Discharge session: finalize HEP, review fall prevention strategies, provide maintenance exercise program.' },
  ];
  for (const n of eleanorNotes) {
    db.prepare(`
      INSERT INTO notes (client_id, date_of_service, time_in, time_out, units, cpt_code,
        subjective, objective, assessment, plan, signed_at, signature_typed, note_type, patient_name)
      VALUES (?, ?, '14:00', '14:45', 3, '97110', ?, ?, ?, ?, ?, 'J. Doe, DPT', 'soap', 'Eleanor Washington')
    `).run(c3id, n.dos, n.s, n.o, n.a, n.p, n.dos + ' 14:50:00');
    counts.notes++;
  }

  // Discharge note
  const dcData = JSON.stringify({
    reason: 'goals_met',
    goalStatuses: [],
    recommendations: ['Continue home exercise program 3x/week', 'Daily walking 20-30 minutes', 'Annual balance screening', 'Return to PT if pain recurs > 4/10 for more than 2 weeks'],
    summaryNarrative: 'Eleanor completed a full course of physical therapy for mechanical low back pain following a fall. She progressed from severe functional disability (Oswestry 48%) to minimal disability (18%). TUG improved from 18s to 11.5s, placing her below fall-risk threshold. She has returned to all prior activities including community ambulation, household tasks, and social participation. She is independent with a comprehensive home exercise program. Prognosis for maintained improvement is excellent given her compliance and motivation.',
    dischargeDate: daysAgo(30),
  });
  db.prepare(`
    INSERT INTO notes (client_id, date_of_service, time_in, time_out, units, cpt_code,
      subjective, objective, assessment, plan, signed_at, signature_typed, note_type, patient_name, discharge_data)
    VALUES (?, ?, '14:00', '14:45', 3, '97110', ?, ?, ?, ?, ?, 'J. Doe, DPT', 'discharge', 'Eleanor Washington', ?)
  `).run(c3id, daysAgo(30),
    'Final session. Patient reports pain 1/10 and "feeling great." She walked to the clinic today (6 blocks) without difficulty.',
    'Full functional lumbar ROM. TUG 11.5s. All transfers independent. Gait normal speed and pattern. Reviewed and practiced full HEP independently with correct form on all 8 exercises.',
    'All therapy goals met. Patient has returned to prior level of function. She demonstrates independence with HEP and verbalizes understanding of fall prevention strategies. Discharge to independent HEP.',
    'Discharged. Continue HEP 3x/week. Daily walks. Return if pain increases > 4/10 for 2+ weeks. Annual balance screening recommended.',
    daysAgo(30) + ' 14:50:00', dcData);
  counts.notes++;

  // Appointments for Eleanor (all completed)
  for (const n of eleanorNotes) {
    apptInsert.run(c3id, n.dos, '14:00', 45, 'completed', 'Eleanor Washington', 'visit');
  }
  apptInsert.run(c3id, daysAgo(30), '14:00', 45, 'completed', 'Eleanor Washington', 'visit');
  counts.appointments += eleanorNotes.length + 1;


  // ═══════════════════════════════════════════════════════════════
  // CLIENT 4: Jayden Brooks — Active, with progress report due (ST)
  //   Has eval, 8 notes, a PR, goals at various stages
  // ═══════════════════════════════════════════════════════════════
  const c4 = db.prepare(`
    INSERT INTO clients (first_name, last_name, dob, phone, email, status, discipline,
      primary_dx_code, primary_dx_description, default_cpt_code, gender,
      address, city, state, zip,
      insurance_payer, insurance_member_id, insurance_group,
      referring_physician, referring_npi)
    VALUES (?, ?, ?, ?, ?, 'active', 'ST',
      'F80.0', 'Phonological disorder', '92507',
      'M', '305 Elm Street', 'Springfield', 'IL', '62701',
      'United Healthcare', 'UHC-7723409',  'GRP-8815',
      'Dr. Lisa Martinez', '4445556666')
  `).run('Jayden', 'Brooks', '2019-09-03', '(217) 555-0456', 'jbrooks.dad@email.com');
  const c4id = Number(c4.lastInsertRowid);
  counts.clients++;

  // Eval
  const evalContent4 = JSON.stringify({
    chiefComplaint: 'Dad reports Jayden is "very hard to understand" outside the family. He is frustrated when others cannot understand him. Preschool teacher agrees.',
    history: 'Jayden is a 5-year-old male in preschool. No significant medical history. Speech milestones mildly delayed. First words at 14 months, sentences at 28 months. Older sibling had articulation therapy at age 4 with good outcomes. Hearing screen passed.',
    observations: 'Jayden was friendly and talkative with reduced intelligibility. He demonstrated multiple phonological processes including fronting (/k/→/t/, /g/→/d/), cluster reduction (sp→p, st→t), and final consonant deletion. Intelligibility estimated at 60% to unfamiliar listeners.',
    testResults: 'GFTA-3: Standard Score 68, 2nd percentile. KLPA-3: Fronting 95%, Cluster Reduction 90%, Final Consonant Deletion 40%, Stopping 25%. Intelligibility: 60% unfamiliar, 85% familiar listener.',
    clinicalImpression: 'Jayden presents with a moderate phonological disorder with multiple active phonological processes. His intelligibility is significantly below age expectations. Given family history of resolution with therapy and Jayden\'s strong motivation to communicate, prognosis is good.',
    recommendations: 'Speech therapy 2x/week for 30-minute sessions using cycles approach targeting fronting, cluster reduction, and final consonant deletion. Re-evaluate in 6 months.',
    plan: 'Begin cycles approach with fronting as primary target. Parent training on modeling correct productions at home.'
  });
  db.prepare(`
    INSERT INTO evaluations (client_id, eval_date, discipline, content, signed_at, signature_typed, eval_type)
    VALUES (?, ?, 'ST', ?, ?, 'J. Doe, M.S., CCC-SLP', 'initial')
  `).run(c4id, daysAgo(120), evalContent4, dateTimeAgo(120));
  counts.evaluations++;

  // Goals — mixed status
  g1a.run(c4id, 'Jayden will produce /k/ and /g/ in initial position of words with 80% accuracy.', 'STG', 'Phonology / Fronting', 'met', daysAgo(30), 5, 80, 'percentage');
  g1a.run(c4id, 'Jayden will produce initial consonant clusters (sp, st, sk, bl, fl) with 80% accuracy.', 'STG', 'Phonology / Clusters', 'active', daysAgo(-30), 10, 80, 'percentage');
  g1a.run(c4id, 'Jayden will produce final consonants in CVC words with 80% accuracy.', 'STG', 'Phonology / FCD', 'met', daysAgo(45), 60, 80, 'percentage');
  g1a.run(c4id, 'Jayden will achieve intelligibility of 90%+ to unfamiliar listeners in connected speech.', 'LTG', 'Intelligibility', 'active', daysAgo(-60), 60, 90, 'percentage');
  counts.goals += 4;

  // 8 notes
  const jaydenNotes = [
    { dos: daysAgo(115), s: 'Dad reports Jayden is excited to come to "speech class." No changes at home.', o: 'Baseline probes: /k/ initial 5%, /g/ initial 10%. Final consonants in CVC: 60%. Clusters: 10%. Introduced /k/ in initial position using tactile cues. Jayden produced /k/ with 30% accuracy with maximal cues.', a: 'Baseline established. Jayden is stimulable for /k/ with cues which is a positive prognostic indicator. Starting cycles approach.', p: 'Continue /k/ initial position. 5 minutes auditory bombardment per session. Home: listen list for /k/ words.' },
    { dos: daysAgo(101), s: 'Dad practiced /k/ words at home. "He says cat and cup pretty well now if I remind him."', o: '/k/ initial: 50% accuracy with minimal cues, 30% spontaneous. Auditory bombardment with /k/ word list. Minimal pair activities (tea/key, two/coo). Final consonants: 65%.', a: 'Good progress on /k/. Responding well to cycles approach. Moving through first cycle efficiently.', p: 'Continue /k/ drill. Introduce /g/ awareness next session. Continue home practice.' },
    { dos: daysAgo(87), s: 'Preschool teacher notes Jayden is "trying harder" to be understood. Dad says strangers are understanding him a little better.', o: '/k/ initial: 70% spontaneous. /g/ initial: 25% with cues. Final consonants: 70%. Intelligibility probe: 68% unfamiliar listener context.', a: '/k/ acquisition progressing well. /g/ stimulability confirmed. Final consonant deletion resolving. Intelligibility showing early improvement.', p: 'Cycle 1 /k/ nearly complete. Begin /g/ focus. Continue FCD targets in home activities.' },
    { dos: daysAgo(73), s: 'Dad reports Jayden self-corrected "tat" to "cat" at dinner. Family excited.', o: '/k/ initial: 80% — GOAL MET. /g/ initial: 45% with minimal cues. Final consonants: 75%. Introduced cluster awareness activities (s-blends).', a: '/k/ fronting goal met ahead of schedule. /g/ progressing. FCD approaching mastery. Ready to begin cluster reduction targets in next cycle.', p: 'Shift focus to /g/ and clusters. /k/ maintained in conversation. Begin structured cluster practice.' },
    { dos: daysAgo(59), s: 'No new concerns. Dad says Jayden is "so much easier to understand now."', o: '/g/ initial: 60%. Clusters (sp, st): 25% with cues. Final consonants: 80% — GOAL MET. /k/: maintaining at 85% in conversation.', a: 'FCD goal met. /g/ progressing steadily. Clusters emerging. Overall intelligibility estimate now 75%.', p: 'Continue /g/ and cluster targets. Prepare progress report for next session.' },
    { dos: daysAgo(45), s: 'Dad asks about expected timeline for completion. Reports Jayden is understood by most people now.', o: '/g/ initial: 75%. Clusters: 35%. Intelligibility probe: 78%. Reviewed progress data with parent.', a: 'Excellent overall progress. Two STGs met (/k/ fronting, FCD). /g/ approaching goal. Clusters early stages. Estimate 3-4 more months to LTG.', p: 'Continue current targets. Send updated progress data to referring physician.' },
    { dos: daysAgo(31), s: 'Dad reports grandparents were "amazed" at how much clearer Jayden talks now.', o: '/g/ initial: 82% — approaching goal. Clusters sp: 40%, st: 45%, bl: 25%. Intelligibility: 80%.', a: '/g/ fronting nearly resolved. Cluster reduction is the primary remaining process. Intelligibility continuing to improve. On track for LTG.', p: 'Continue cluster targets with increased complexity. Trial /g/ in medial position. Plan for reassessment at 6-month mark.' },
    { dos: daysAgo(17), s: 'Jayden told a whole story about his dog using mostly clear speech. Dad says "night and day difference from 4 months ago."', o: '/g/ initial: 85% — GOAL MET. Clusters sp: 50%, st: 55%, sk: 40%, bl: 35%, fl: 30%. Overall cluster average: 42%. Intelligibility probe: 82% unfamiliar listener.', a: '/g/ fronting goal met. Cluster reduction is primary remaining target. Intelligibility approaching goal but cluster errors still impact connected speech. Good candidate for continued cycles targeting clusters.', p: 'Focus exclusively on cluster reduction across all targeted clusters. Increase connected speech practice. Reassess in 6 weeks.' },
  ];
  for (const n of jaydenNotes) {
    db.prepare(`
      INSERT INTO notes (client_id, date_of_service, time_in, time_out, units, cpt_code,
        subjective, objective, assessment, plan, signed_at, signature_typed, note_type, patient_name)
      VALUES (?, ?, '11:00', '11:30', 2, '92507', ?, ?, ?, ?, ?, 'J. Doe, M.S., CCC-SLP', 'soap', 'Jayden Brooks')
    `).run(c4id, n.dos, n.s, n.o, n.a, n.p, n.dos + ' 11:35:00');
    counts.notes++;
  }

  for (const n of jaydenNotes) {
    apptInsert.run(c4id, n.dos, '11:00', 30, 'completed', 'Jayden Brooks', 'visit');
  }
  apptInsert.run(c4id, daysAgo(-5), '11:00', 30, 'scheduled', 'Jayden Brooks', 'visit');
  counts.appointments += jaydenNotes.length + 1;


  // ═══════════════════════════════════════════════════════════════
  // CLIENT 5: Sofia Chen — Active, just started (MFT)
  //   Has eval only, no notes yet, fresh goals
  // ═══════════════════════════════════════════════════════════════
  const c5 = db.prepare(`
    INSERT INTO clients (first_name, last_name, dob, phone, email, status, discipline,
      primary_dx_code, primary_dx_description, default_cpt_code, gender,
      address, city, state, zip,
      referring_physician, referring_npi)
    VALUES (?, ?, ?, ?, ?, 'active', 'MFT',
      'F43.10', 'Post-traumatic stress disorder, unspecified', '90837',
      'F', '742 Birch Court', 'Springfield', 'IL', '62706',
      'Dr. Rachel Kim', '7778889999')
  `).run('Sofia', 'Chen', '1989-04-17', '(217) 555-0519', 'sofia.chen@email.com');
  const c5id = Number(c5.lastInsertRowid);
  counts.clients++;

  // Eval
  const evalContent5 = JSON.stringify({
    chiefComplaint: 'Client presents with symptoms of PTSD following a motor vehicle accident 6 months ago. Reports intrusive memories, hypervigilance, avoidance of driving, and sleep disturbance.',
    history: 'Sofia is a 35-year-old married woman employed as a graphic designer. She was involved in a rear-end collision 6 months ago with no serious physical injuries but witnessed another driver being taken away by ambulance. Since then she reports flashbacks, nightmares 3-4x/week, avoidance of highway driving, and emotional numbing. PHQ-9: 14 (moderate). PCL-5: 42 (probable PTSD). No prior mental health treatment. No substance use concerns. Supportive spouse.',
    observations: 'Sofia was articulate and insightful. She became tearful when describing the accident but was able to self-regulate with prompting. She demonstrated strong verbal skills and good therapeutic rapport. She expressed high motivation for treatment.',
    clinicalImpression: 'Sofia meets criteria for PTSD per PCL-5 screening and clinical interview. Her symptoms are significantly impacting her daily functioning, work concentration, and marital relationship. Her strong support system and high motivation are positive prognostic indicators.',
    recommendations: 'Individual psychotherapy 1x/week for 50-minute sessions. Recommend trauma-focused CBT with gradual exposure hierarchy for driving avoidance. Incorporate relaxation training and cognitive restructuring. Coordinate with PCP if sleep disturbance does not improve within 4 weeks.',
    plan: 'Begin with psychoeducation about PTSD and relaxation training. Introduce cognitive model in session 2. Build exposure hierarchy by session 3-4.'
  });
  db.prepare(`
    INSERT INTO evaluations (client_id, eval_date, discipline, content, signed_at, signature_typed, eval_type)
    VALUES (?, ?, 'MFT', ?, ?, 'J. Doe, LMFT', 'initial')
  `).run(c5id, daysAgo(5), evalContent5, dateTimeAgo(5));
  counts.evaluations++;

  // Goals
  g1a.run(c5id, 'Client will demonstrate use of 2+ grounding/relaxation techniques to manage flashbacks and reduce PCL-5 intrusion subscale by 50%.', 'STG', 'Coping Skills / PTSD', 'active', daysAgo(-60), 0, 50, 'percentage');
  g1a.run(c5id, 'Client will complete exposure hierarchy for driving, achieving highway driving without avoidance.', 'STG', 'Avoidance Reduction', 'active', daysAgo(-90), 0, 100, 'percentage');
  g1a.run(c5id, 'Client will achieve PCL-5 score < 31 (below clinical cutoff) and report improved daily functioning.', 'LTG', 'PTSD Symptom Reduction', 'active', daysAgo(-120), 42, 31, 'percentage');
  counts.goals += 3;

  // 1 upcoming appointment
  apptInsert.run(c5id, daysAgo(-2), '15:00', 50, 'scheduled', 'Sofia Chen', 'visit');
  counts.appointments += 1;


  return {
    seeded: true,
    message: `Demo data created: ${counts.clients} clients, ${counts.evaluations} evaluations, ${counts.goals} goals, ${counts.notes} notes, ${counts.appointments} appointments.`,
    counts,
  };
}
