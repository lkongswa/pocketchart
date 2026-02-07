// Common ICD-10 codes used in therapy settings (PT, OT, ST, MFT)
// This is a curated subset for quick lookup / auto-populate

export interface ICD10Entry {
  code: string;
  description: string;
}

export const ICD10_CODES: ICD10Entry[] = [
  // ── Musculoskeletal (M codes) ──
  { code: 'M54.5', description: 'Low back pain' },
  { code: 'M54.50', description: 'Low back pain, unspecified' },
  { code: 'M54.51', description: 'Vertebrogenic low back pain' },
  { code: 'M54.59', description: 'Other low back pain' },
  { code: 'M54.2', description: 'Cervicalgia' },
  { code: 'M54.6', description: 'Pain in thoracic spine' },
  { code: 'M54.9', description: 'Dorsalgia, unspecified' },
  { code: 'M25.511', description: 'Pain in right shoulder' },
  { code: 'M25.512', description: 'Pain in left shoulder' },
  { code: 'M25.519', description: 'Pain in unspecified shoulder' },
  { code: 'M25.551', description: 'Pain in right hip' },
  { code: 'M25.552', description: 'Pain in left hip' },
  { code: 'M25.559', description: 'Pain in unspecified hip' },
  { code: 'M25.561', description: 'Pain in right knee' },
  { code: 'M25.562', description: 'Pain in left knee' },
  { code: 'M25.569', description: 'Pain in unspecified knee' },
  { code: 'M25.571', description: 'Pain in right ankle and foot' },
  { code: 'M25.572', description: 'Pain in left ankle and foot' },
  { code: 'M25.531', description: 'Pain in right wrist' },
  { code: 'M25.532', description: 'Pain in left wrist' },
  { code: 'M25.521', description: 'Pain in right elbow' },
  { code: 'M25.522', description: 'Pain in left elbow' },
  { code: 'M79.3', description: 'Panniculitis, unspecified' },
  { code: 'M79.1', description: 'Myalgia' },
  { code: 'M62.81', description: 'Muscle weakness (generalized)' },
  { code: 'M62.838', description: 'Other muscle spasm' },
  { code: 'M75.10', description: 'Rotator cuff tear, unspecified' },
  { code: 'M75.11', description: 'Incomplete rotator cuff tear, right' },
  { code: 'M75.12', description: 'Incomplete rotator cuff tear, left' },
  { code: 'M75.100', description: 'Unspecified rotator cuff tear, right' },
  { code: 'M75.102', description: 'Unspecified rotator cuff tear, left' },
  { code: 'M23.50', description: 'Chronic instability of knee, unspecified' },
  { code: 'M17.11', description: 'Primary osteoarthritis, right knee' },
  { code: 'M17.12', description: 'Primary osteoarthritis, left knee' },
  { code: 'M16.11', description: 'Primary osteoarthritis, right hip' },
  { code: 'M16.12', description: 'Primary osteoarthritis, left hip' },
  { code: 'M19.011', description: 'Primary osteoarthritis, right shoulder' },
  { code: 'M19.012', description: 'Primary osteoarthritis, left shoulder' },
  { code: 'M48.06', description: 'Spinal stenosis, lumbar region' },
  { code: 'M48.02', description: 'Spinal stenosis, cervical region' },
  { code: 'M51.16', description: 'Intervertebral disc degeneration, lumbar' },
  { code: 'M51.17', description: 'Intervertebral disc degeneration, lumbosacral' },
  { code: 'M47.816', description: 'Spondylosis without myelopathy, lumbar' },
  { code: 'M47.812', description: 'Spondylosis without myelopathy, cervical' },

  // ── Pain (G89 codes) ──
  { code: 'G89.29', description: 'Other chronic pain' },
  { code: 'G89.4', description: 'Chronic pain syndrome' },
  { code: 'G89.11', description: 'Acute pain due to trauma' },

  // ── Neurological (G codes) ──
  { code: 'G81.90', description: 'Hemiplegia, unspecified' },
  { code: 'G81.91', description: 'Hemiplegia, right dominant' },
  { code: 'G81.92', description: 'Hemiplegia, left dominant' },
  { code: 'G81.93', description: 'Hemiplegia, right nondominant' },
  { code: 'G81.94', description: 'Hemiplegia, left nondominant' },
  { code: 'G82.20', description: 'Paraplegia, unspecified' },
  { code: 'G35', description: 'Multiple sclerosis' },
  { code: 'G20', description: "Parkinson's disease" },
  { code: 'G40.909', description: 'Epilepsy, unspecified, not intractable' },
  { code: 'G43.909', description: 'Migraine, unspecified, not intractable' },

  // ── Stroke / CVA ──
  { code: 'I63.9', description: 'Cerebral infarction, unspecified' },
  { code: 'I69.351', description: 'Hemiplegia following cerebral infarction, right' },
  { code: 'I69.352', description: 'Hemiplegia following cerebral infarction, left' },
  { code: 'I69.354', description: 'Hemiplegia following cerebral infarction, right nondominant' },
  { code: 'I69.30', description: 'Unspecified sequelae of cerebral infarction' },
  { code: 'I69.398', description: 'Other sequelae of cerebral infarction' },

  // ── Fractures (S/M codes) ──
  { code: 'M80.00XA', description: 'Age-related osteoporosis with pathological fracture' },
  { code: 'S72.001A', description: 'Fracture of unspecified part of neck of right femur' },
  { code: 'S72.002A', description: 'Fracture of unspecified part of neck of left femur' },
  { code: 'S42.001A', description: 'Fracture of unspecified part of right clavicle' },
  { code: 'S42.002A', description: 'Fracture of unspecified part of left clavicle' },

  // ── Balance & Falls ──
  { code: 'R26.81', description: 'Unsteadiness on feet' },
  { code: 'R26.2', description: 'Difficulty in walking, not elsewhere classified' },
  { code: 'R26.0', description: 'Ataxic gait' },
  { code: 'R26.89', description: 'Other abnormalities of gait and mobility' },
  { code: 'R29.6', description: 'Repeated falls' },
  { code: 'Z91.81', description: 'History of falling' },
  { code: 'W19.XXXA', description: 'Unspecified fall, initial encounter' },

  // ── Post-surgical / Post-op ──
  { code: 'Z96.641', description: 'Presence of right artificial hip joint' },
  { code: 'Z96.642', description: 'Presence of left artificial hip joint' },
  { code: 'Z96.651', description: 'Presence of right artificial knee joint' },
  { code: 'Z96.652', description: 'Presence of left artificial knee joint' },
  { code: 'Z87.39', description: 'Personal history of other musculoskeletal disorders' },
  { code: 'Z47.1', description: 'Aftercare following joint replacement surgery' },
  { code: 'Z48.89', description: 'Encounter for other aftercare following surgery' },

  // ── Speech & Language ──
  { code: 'R13.10', description: 'Dysphagia, unspecified' },
  { code: 'R13.11', description: 'Dysphagia, oral phase' },
  { code: 'R13.12', description: 'Dysphagia, oropharyngeal phase' },
  { code: 'R13.13', description: 'Dysphagia, pharyngeal phase' },
  { code: 'R13.14', description: 'Dysphagia, pharyngoesophageal phase' },
  { code: 'R13.19', description: 'Other dysphagia' },
  { code: 'R47.01', description: 'Aphasia' },
  { code: 'R47.02', description: 'Dysphasia' },
  { code: 'R47.1', description: 'Dysarthria and anarthria' },
  { code: 'R47.89', description: 'Other speech disturbances' },
  { code: 'R48.8', description: 'Other symbolic dysfunctions' },
  { code: 'F80.0', description: 'Phonological disorder' },
  { code: 'F80.1', description: 'Expressive language disorder' },
  { code: 'F80.2', description: 'Mixed receptive-expressive language disorder' },
  { code: 'F80.81', description: 'Childhood onset fluency disorder (stuttering)' },
  { code: 'F80.82', description: 'Social pragmatic communication disorder' },
  { code: 'F80.89', description: 'Other developmental disorders of speech and language' },
  { code: 'F80.9', description: 'Developmental disorder of speech and language, unspecified' },
  { code: 'R49.0', description: 'Dysphonia' },
  { code: 'R49.8', description: 'Other voice and resonance disorders' },
  { code: 'J38.3', description: 'Other diseases of vocal cords' },

  // ── Cognitive ──
  { code: 'R41.0', description: 'Disorientation, unspecified' },
  { code: 'R41.3', description: 'Other amnesia' },
  { code: 'R41.840', description: 'Attention and concentration deficit' },
  { code: 'R41.841', description: 'Cognitive communication deficit' },
  { code: 'R41.844', description: 'Frontal lobe and executive function deficit' },
  { code: 'F06.70', description: 'Mild neurocognitive disorder, unspecified' },
  { code: 'G31.84', description: 'Mild cognitive impairment' },

  // ── Developmental (Pediatric) ──
  { code: 'F82', description: 'Specific developmental disorder of motor function' },
  { code: 'F84.0', description: 'Autistic disorder' },
  { code: 'F88', description: 'Other disorders of psychological development' },
  { code: 'F89', description: 'Unspecified disorder of psychological development' },
  { code: 'F90.0', description: 'ADHD, predominantly inattentive type' },
  { code: 'F90.1', description: 'ADHD, predominantly hyperactive type' },
  { code: 'F90.2', description: 'ADHD, combined type' },
  { code: 'F90.9', description: 'ADHD, unspecified type' },
  { code: 'R62.0', description: 'Delayed milestone in childhood' },
  { code: 'R62.50', description: 'Unspecified lack of expected normal physiological development' },
  { code: 'Q67.4', description: 'Other congenital deformities of skull, face and jaw' },

  // ── Mental Health (MFT) ──
  { code: 'F32.0', description: 'Major depressive disorder, single episode, mild' },
  { code: 'F32.1', description: 'Major depressive disorder, single episode, moderate' },
  { code: 'F32.2', description: 'Major depressive disorder, single episode, severe' },
  { code: 'F32.9', description: 'Major depressive disorder, single episode, unspecified' },
  { code: 'F33.0', description: 'Major depressive disorder, recurrent, mild' },
  { code: 'F33.1', description: 'Major depressive disorder, recurrent, moderate' },
  { code: 'F33.2', description: 'Major depressive disorder, recurrent, severe' },
  { code: 'F33.9', description: 'Major depressive disorder, recurrent, unspecified' },
  { code: 'F41.0', description: 'Panic disorder without agoraphobia' },
  { code: 'F41.1', description: 'Generalized anxiety disorder' },
  { code: 'F41.9', description: 'Anxiety disorder, unspecified' },
  { code: 'F43.10', description: 'Post-traumatic stress disorder, unspecified' },
  { code: 'F43.11', description: 'Post-traumatic stress disorder, acute' },
  { code: 'F43.12', description: 'Post-traumatic stress disorder, chronic' },
  { code: 'F43.20', description: 'Adjustment disorder, unspecified' },
  { code: 'F43.21', description: 'Adjustment disorder with depressed mood' },
  { code: 'F43.22', description: 'Adjustment disorder with anxiety' },
  { code: 'F43.23', description: 'Adjustment disorder with mixed anxiety and depressed mood' },
  { code: 'F43.25', description: 'Adjustment disorder with mixed disturbance of emotions and conduct' },
  { code: 'F60.3', description: 'Borderline personality disorder' },
  { code: 'F31.9', description: 'Bipolar disorder, unspecified' },
  { code: 'F31.30', description: 'Bipolar disorder, current episode depressed, mild or moderate, unspecified' },
  { code: 'F31.81', description: 'Bipolar II disorder' },
  { code: 'F42.2', description: 'Mixed obsessional thoughts and acts' },
  { code: 'F50.00', description: 'Anorexia nervosa, unspecified' },
  { code: 'F50.2', description: 'Bulimia nervosa' },
  { code: 'F50.81', description: 'Binge eating disorder' },
  { code: 'F10.10', description: 'Alcohol use disorder, mild' },
  { code: 'F10.20', description: 'Alcohol use disorder, moderate' },
  { code: 'F19.10', description: 'Other substance use disorder, mild' },
  { code: 'F19.20', description: 'Other substance use disorder, moderate' },
  { code: 'Z63.0', description: 'Problems in relationship with spouse or partner' },
  { code: 'Z62.898', description: 'Other specified problems related to upbringing' },
  { code: 'Z62.820', description: 'Parent-biological child conflict' },
  { code: 'Z63.8', description: 'Other specified problems related to primary support group' },
  { code: 'Z65.9', description: 'Problem related to unspecified psychosocial circumstances' },
  { code: 'Z56.9', description: 'Unspecified problems related to employment' },
  { code: 'Z60.0', description: 'Problems of adjustment to life-cycle transitions' },
  { code: 'Z73.0', description: 'Burn-out' },

  // ── OT specific ──
  { code: 'G56.00', description: 'Carpal tunnel syndrome, unspecified upper limb' },
  { code: 'G56.01', description: 'Carpal tunnel syndrome, right upper limb' },
  { code: 'G56.02', description: 'Carpal tunnel syndrome, left upper limb' },
  { code: 'M65.30', description: 'Trigger finger, unspecified finger' },
  { code: 'M65.311', description: 'Trigger thumb, right thumb' },
  { code: 'M65.312', description: 'Trigger thumb, left thumb' },
  { code: 'M77.10', description: 'Lateral epicondylitis, unspecified elbow' },
  { code: 'M77.11', description: 'Lateral epicondylitis, right elbow' },
  { code: 'M77.12', description: 'Lateral epicondylitis, left elbow' },
  { code: 'S62.90XA', description: 'Unspecified fracture of unspecified wrist and hand' },

  // ── Misc / General ──
  { code: 'R53.1', description: 'Weakness' },
  { code: 'R53.81', description: 'Other malaise' },
  { code: 'R53.83', description: 'Other fatigue' },
  { code: 'M21.6X9', description: 'Other acquired deformities of ankle and foot' },
  { code: 'Z87.11', description: 'Personal history of peptic ulcer disease' },
  { code: 'Z96.1', description: 'Presence of intraocular lens' },
];

/**
 * Lookup ICD-10 description by code (case-insensitive, partial match)
 */
export function lookupICD10(code: string): ICD10Entry | undefined {
  if (!code) return undefined;
  const upper = code.toUpperCase().replace(/\s/g, '');
  return ICD10_CODES.find(e => e.code.toUpperCase().replace(/\./g, '').replace(/\s/g, '') === upper.replace(/\./g, ''))
    || ICD10_CODES.find(e => e.code.toUpperCase() === upper);
}

/**
 * Search ICD-10 codes by code prefix or description text
 */
export function searchICD10(query: string, limit = 10): ICD10Entry[] {
  if (!query || query.length < 2) return [];
  const q = query.toLowerCase();
  const results: ICD10Entry[] = [];

  // Exact code match first
  for (const entry of ICD10_CODES) {
    if (entry.code.toLowerCase() === q) {
      results.push(entry);
    }
  }

  // Code prefix match
  for (const entry of ICD10_CODES) {
    if (entry.code.toLowerCase().startsWith(q) && !results.includes(entry)) {
      results.push(entry);
      if (results.length >= limit) return results;
    }
  }

  // Description match
  for (const entry of ICD10_CODES) {
    if (entry.description.toLowerCase().includes(q) && !results.includes(entry)) {
      results.push(entry);
      if (results.length >= limit) return results;
    }
  }

  return results;
}
