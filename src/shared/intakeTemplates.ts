// Default intake form template definitions
// These are seeded into the database on migration 44

export interface DefaultIntakeTemplate {
  name: string;
  slug: string;
  description: string;
  sort_order: number;
  sections: Array<{
    id: string;
    title: string;
    content: string;
    enabled: boolean;
    sort_order: number;
  }>;
}

export const DEFAULT_INTAKE_TEMPLATES: DefaultIntakeTemplate[] = [
  {
    name: 'Patient Information',
    slug: 'patient_information',
    description: 'Demographics, emergency contact, and medical history',
    sort_order: 1,
    sections: [
      {
        id: 'pi_demographics',
        title: 'Patient Demographics',
        content: `Date: {{date}}

Patient Name: {{client_first_name}} {{client_last_name}}
Date of Birth: {{client_dob}}
Phone: {{client_phone}}
Email: {{client_email}}
Address: {{client_address}}, {{client_city}}, {{client_state}} {{client_zip}}
Gender: {{client_gender}}

Employer: _______________________________________________
Occupation: _____________________________________________`,
        enabled: true,
        sort_order: 1,
      },
      {
        id: 'pi_emergency_contact',
        title: 'Emergency Contact',
        content: `Name: ___________________________________________________
Relationship: ___________________________________________
Phone: __________________________________________________
Address: ________________________________________________`,
        enabled: true,
        sort_order: 2,
      },
      {
        id: 'pi_insurance',
        title: 'Insurance Information',
        content: `Primary Insurance: {{client_insurance_payer}}
Member ID: {{client_insurance_member_id}}
Group Number: {{client_insurance_group}}

Policy Holder Name: _____________________________________
Relationship to Patient: ________________________________
Policy Holder DOB: ______________________________________

Secondary Insurance: ____________________________________
Member ID: ______________________________________________
Group Number: ___________________________________________`,
        enabled: true,
        sort_order: 3,
      },
      {
        id: 'pi_medical_history',
        title: 'Medical History',
        content: `Primary Diagnosis: {{client_primary_dx}}
Referring Physician: {{client_referring_physician}}

Current Medications (list all):
_________________________________________________________
_________________________________________________________
_________________________________________________________

Allergies:
_________________________________________________________

Previous surgeries or hospitalizations:
_________________________________________________________
_________________________________________________________

Do you have any of the following conditions?
[ ] Diabetes    [ ] Heart Disease    [ ] High Blood Pressure
[ ] Arthritis   [ ] Cancer           [ ] Stroke
[ ] Seizures    [ ] Thyroid Issues   [ ] Respiratory Problems
[ ] Other: ______________________________________________`,
        enabled: true,
        sort_order: 4,
      },
    ],
  },
  {
    name: 'Consent to Treat',
    slug: 'consent_to_treat',
    description: 'Informed consent for evaluation and treatment services',
    sort_order: 2,
    sections: [
      {
        id: 'ctt_consent',
        title: 'Consent for Treatment',
        content: `I, _______________________________, hereby authorize {{practice_name}} and its licensed practitioners to evaluate and treat me (or the minor named below) for the conditions identified through evaluation and as prescribed by my referring physician.

I understand that:

1. The nature and purpose of the proposed treatment has been explained to me.
2. Treatment may include but is not limited to: therapeutic exercises, manual therapy, modalities (heat, cold, electrical stimulation, ultrasound), functional training, and patient education.
3. Potential risks may include but are not limited to: soreness, increased pain, fatigue, or in rare cases, injury.
4. I have the right to refuse any treatment at any time.
5. I understand that results cannot be guaranteed.
6. I consent to the release of medical information necessary for treatment, payment, or healthcare operations as permitted by law.

For minors: I am the parent/legal guardian of the patient named below and have the authority to consent to treatment.

Patient Name (minor): ___________________________________`,
        enabled: true,
        sort_order: 1,
      },
      {
        id: 'ctt_signature',
        title: 'Signature',
        content: `_________________________________________    ____________
Patient/Guardian Signature                    Date

_________________________________________
Printed Name

_________________________________________
Relationship to Patient (if applicable)`,
        enabled: true,
        sort_order: 2,
      },
    ],
  },
  {
    name: 'HIPAA Notice',
    slug: 'hipaa_notice',
    description: 'Notice of Privacy Practices acknowledgment',
    sort_order: 3,
    sections: [
      {
        id: 'hipaa_notice',
        title: 'Notice of Privacy Practices',
        content: `THIS NOTICE DESCRIBES HOW MEDICAL INFORMATION ABOUT YOU MAY BE USED AND DISCLOSED AND HOW YOU CAN GET ACCESS TO THIS INFORMATION. PLEASE REVIEW IT CAREFULLY.

Our Commitment to Your Privacy:
{{practice_name}} is dedicated to maintaining the privacy of your protected health information (PHI). We are required by law to maintain the privacy of PHI, provide you with notice of our legal duties and privacy practices, and follow the terms of the Notice currently in effect.

How We May Use and Disclose Your PHI:
- Treatment: To provide, coordinate, or manage your healthcare.
- Payment: To bill and collect payment for services provided.
- Healthcare Operations: For quality assessment, licensing, and business management.
- As Required by Law: When required by federal, state, or local law.
- Public Health Activities: To report diseases, injuries, and vital events.

Your Rights Regarding Your PHI:
- Right to inspect and copy your health records.
- Right to request amendments to your records.
- Right to an accounting of disclosures.
- Right to request restrictions on certain uses and disclosures.
- Right to request confidential communications.
- Right to receive a paper copy of this notice.

Contact Information:
Privacy Officer: {{practice_name}}
Phone: {{practice_phone}}
Address: {{practice_address}}, {{practice_city}}, {{practice_state}} {{practice_zip}}`,
        enabled: true,
        sort_order: 1,
      },
      {
        id: 'hipaa_acknowledgment',
        title: 'Acknowledgment',
        content: `I acknowledge that I have received a copy of {{practice_name}}'s Notice of Privacy Practices. I understand that I may request a copy of this notice at any time.

_________________________________________    ____________
Patient/Guardian Signature                    Date

_________________________________________
Printed Name

[ ] Patient refused to sign acknowledgment
    Staff Initials: ____  Date: ____________`,
        enabled: true,
        sort_order: 2,
      },
    ],
  },
  {
    name: 'Financial Agreement',
    slug: 'financial_agreement',
    description: 'Payment terms, cancellation policy, and financial responsibility',
    sort_order: 4,
    sections: [
      {
        id: 'fa_terms',
        title: 'Financial Terms',
        content: `Thank you for choosing {{practice_name}} for your care. We are committed to providing you with the best possible service. Please read and understand the following financial policies:

Payment Responsibility:
- Payment is due at the time of service unless other arrangements have been made.
- We accept cash, check, and major credit cards.
- For insurance patients: You are responsible for any co-payments, deductibles, co-insurance, and non-covered services.
- If your insurance company does not pay within 60 days, the balance becomes your responsibility.

Insurance:
- We will file claims on your behalf as a courtesy.
- You are responsible for providing accurate and current insurance information.
- Authorization for treatment does not guarantee payment by your insurance company.
- You are responsible for understanding your insurance benefits and limitations.`,
        enabled: true,
        sort_order: 1,
      },
      {
        id: 'fa_cancellation',
        title: 'Cancellation Policy',
        content: `- Please provide at least 24 hours notice for cancellations.
- Late cancellations (less than 24 hours) may result in a cancellation fee.
- Repeated no-shows may result in discharge from our practice.
- We understand that emergencies happen and will consider each situation individually.`,
        enabled: true,
        sort_order: 2,
      },
      {
        id: 'fa_signature',
        title: 'Agreement Signature',
        content: `I have read and understand the financial policies outlined above. I agree to be financially responsible for charges not covered by my insurance.

I authorize {{practice_name}} to release any medical information necessary to process insurance claims on my behalf.

_________________________________________    ____________
Patient/Guardian Signature                    Date

_________________________________________
Printed Name`,
        enabled: true,
        sort_order: 3,
      },
    ],
  },
  {
    name: 'Release of Information',
    slug: 'release_of_information',
    description: 'Authorization to release or obtain medical records',
    sort_order: 5,
    sections: [
      {
        id: 'roi_authorization',
        title: 'Authorization',
        content: `Patient Name: {{client_first_name}} {{client_last_name}}
Date of Birth: {{client_dob}}

I hereby authorize the release of my medical information as described below:

Release FROM:
Name/Facility: __________________________________________
Address: ________________________________________________
Phone: __________________  Fax: _________________________

Release TO:
Name/Facility: __________________________________________
Address: ________________________________________________
Phone: __________________  Fax: _________________________

Information to be released:
[ ] Complete Medical Records
[ ] Office/Progress Notes      [ ] Evaluation Reports
[ ] Lab Results                [ ] Imaging Reports
[ ] Surgical Records           [ ] Discharge Summary
[ ] Other: ______________________________________________

Date Range: From ______________ To ______________

Purpose of Disclosure:
[ ] Continuity of Care    [ ] Insurance/Billing
[ ] Legal                 [ ] Personal Request
[ ] Other: ______________________________________________`,
        enabled: true,
        sort_order: 1,
      },
      {
        id: 'roi_terms',
        title: 'Terms & Signature',
        content: `- This authorization is valid for one year from the date of signature unless otherwise specified: Expiration Date: ______________
- I understand that I may revoke this authorization at any time by providing written notice.
- I understand that information released may be subject to re-disclosure and no longer protected by HIPAA.
- I understand that treatment or payment will not be conditioned on signing this authorization.
- A photocopy of this authorization shall be as valid as the original.

_________________________________________    ____________
Patient/Guardian Signature                    Date

_________________________________________
Printed Name

_________________________________________
Relationship to Patient (if applicable)`,
        enabled: true,
        sort_order: 2,
      },
    ],
  },
  {
    name: 'Assignment of Benefits',
    slug: 'assignment_of_benefits',
    description: 'Authorization for insurance payment directly to provider',
    sort_order: 6,
    sections: [
      {
        id: 'aob_assignment',
        title: 'Assignment of Benefits',
        content: `Patient Name: {{client_first_name}} {{client_last_name}}
Date of Birth: {{client_dob}}
Insurance Company: {{client_insurance_payer}}
Member ID: {{client_insurance_member_id}}
Group Number: {{client_insurance_group}}

I hereby assign and authorize payment of medical/surgical benefits to {{practice_name}} for services rendered. I understand that I am financially responsible for any charges not covered by my insurance.

I authorize {{practice_name}} to:
1. File insurance claims on my behalf.
2. Receive payment directly from my insurance company.
3. Release any medical information necessary to process claims.
4. Act as my authorized representative in appeals or disputes with my insurance company regarding claims for services rendered.

I understand that:
- This assignment does not relieve me of my financial obligation.
- I am responsible for any co-payments, deductibles, and non-covered services.
- This assignment remains in effect until revoked by me in writing.`,
        enabled: true,
        sort_order: 1,
      },
      {
        id: 'aob_signature',
        title: 'Signature',
        content: `_________________________________________    ____________
Patient/Guardian Signature                    Date

_________________________________________
Printed Name

_________________________________________    ____________
Witness Signature                             Date`,
        enabled: true,
        sort_order: 2,
      },
    ],
  },
];
