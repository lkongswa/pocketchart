# PocketChart EMR — Master Reference Document

**Version:** 1.2  
**Date:** March 8, 2026  
**Maintained by:** Lyda / Pocket Chart, LLC — update this file after each major feature completion  
**Confidential — For Internal Use**

> **For CC:** This is the canonical reference document. After completing any significant feature or architectural change, update the relevant section(s) of this file. Add new handoff documents to the `/docs` folder and reference them here.

---

# PART 1: TECHNICAL DOCUMENTATION

*Audience: Future CTO, technical hires, development partners, Claude Code*

---

## 1.1 Architecture Overview

PocketChart is a desktop EMR application built on Electron (Chromium + Node.js), targeting solo therapy practitioners across PT, OT, SLP, and MFT disciplines. The architecture follows a strict **local-first** philosophy: all clinical data lives on the user's machine in a SQLite database, never touching external servers for core functionality.

### Technology Stack

| Layer | Technology | Purpose |
|-------|-----------|---------|
| Desktop Framework | Electron (Windows/Mac) | Cross-platform desktop shell |
| Frontend | React + TypeScript | Renderer process UI |
| Styling | Tailwind CSS + CSS custom properties | Theming, section-color system |
| State Management | React hooks + local component state | UI state |
| Database | SQLite (better-sqlite3) | All persistent clinical/billing data |
| IPC Bridge | Electron contextBridge + safeHandle pattern | Secure main↔renderer communication |
| Payment Processing | Stripe API (via main process) | Client payment collection |
| Licensing | Lemon Squeezy API | License key validation and tier gating |
| PDF Generation | jsPDF | Chart exports, superbills, invoices, CMS-1500 |
| Auto-Updates | electron-updater → GitHub Releases | Silent background updates |
| Secure Storage | OS Keychain (macOS) / Credential Manager (Windows) | API keys, sensitive credentials |
| E-Signature | Dropbox Sign API | Document signing workflows |
| Fax | SRFax API | HIPAA-compliant fax send/receive |
| Clearinghouse | Claim.MD API | 837P submission, eligibility, remittance (V3) |
| Code Signing | Azure Trusted Signing (~$10/month) | Windows installer signing |

### Process Architecture

PocketChart follows Electron's two-process model with strict security separation:

**Main Process (Node.js)** handles all data operations, file system access, database queries, Stripe API calls, license validation, PDF generation, and security (PIN hashing via HMAC-SHA256). Every database operation goes through a `safeHandle()` wrapper that provides error handling and tier-gating enforcement.

**Renderer Process (Chromium/React)** handles the UI layer only. It communicates with the main process exclusively through a typed IPC bridge (`window.api.*`). The renderer never has direct access to the database, file system, or external APIs — this is a deliberate security boundary.

**IPC Namespaces:**

- `window.api.clients.*` — Client CRUD, search, status changes
- `window.api.notes.*` — SOAP notes, progress reports, discharge summaries
- `window.api.goals.*` — STG/LTG goals, status updates, bank templates
- `window.api.evals.*` — Evaluations, objective assessments
- `window.api.appointments.*` — Scheduling, calendar, status tracking
- `window.api.invoices.*` — Invoice generation, status management
- `window.api.payments.*` — Payment recording, matching to invoices
- `window.api.feeSchedule.*` — CPT code rates
- `window.api.stripe.*` — Payment links, status checks, key management
- `window.api.security.*` — PIN set/verify/remove, timeout, recovery
- `window.api.backup.*` — Database export, CSV export, bulk PDF/ZIP export
- `window.api.settings.*` — Practice info, preferences, feature flags
- `window.api.license.*` — Activation, status, tier checking
- `window.api.compliance.*` — Visit counting, progress/recert tracking
- `window.api.entities.*` — Contracted entities, entity fee schedules
- `window.api.vault.*` — Professional credential document storage
- `window.api.mileage.*` — Trip logging, export
- `window.api.commLog.*` — Client communication tracking
- `window.api.documents.*` — Client document upload/categorization
- `window.api.superbill.*` — Superbill PDF generation
- `window.api.logo.*` — Practice logo upload/management
- `window.api.storage.*` — Data location, cloud detection, BAA warnings
- `window.api.shell.*` — External link opening
- `window.api.dashboard.*` — Overview metrics, alerts panel
- `window.api.waitlist.*` — Waitlist management (Pro)
- `window.api.goodFaithEstimate.*` — GFE builder
- `window.api.claims.*` — Insurance claim lifecycle (V3, activating)

### Database Schema

The SQLite database uses a migration system (`database.ts`) with versioned schema changes. Key tables:

**Core Clinical Tables:**

- `clients` — Patient demographics, diagnosis (ICD-10), insurance info, status (active/discharged/hold), discipline, contact info. V3-ready fields: gender, address components, payer ID, subscriber ID, group number, subscriber relationship, subscriber name/DOB.
- `notes` — SOAP/DAP/BIRP treatment notes. Fields: date of service, time in/out, CPT codes (JSON array supporting multiple lines), subjective/objective/assessment/plan sections (format-agnostic — all formats map to same 4 fields), signature data (typed + image), signed_at timestamp for immutability. Includes entity_id for contractor linkage, rate_override with required reason, charge_amount, place_of_service, cpt_modifiers, diagnosis_pointers, and note_type discriminator (soap/progress_report/discharge).
- `evaluations` — Initial/re-evaluation documentation. Structured content stored as JSON including discipline-specific objective assessment fields (ROM/MMT/balance for PT; ADLs/fine motor for OT; speech/language/fluency for ST; presenting problem/mental status/risk assessment for MFT). Includes rehabilitation potential, precautions, and plan of care fields for Medicare compliance.
- `goals` — STG/LTG goals with status tracking (active/met/discontinued/modified), target dates, category classification, and text content.
- `progress_report_goals` — Per-session goal performance data linked to progress report notes.
- `discharge_goals` — Final goal statuses for discharge summaries (met/partially_met/not_met/discontinued/deferred).
- `staged_goals` — Goals prepared during progress reports for future promotion to active status.
- `note_goals` — Per-session goal performance data for Quick Chips (accuracy %, cueing level, cue type, trials). Pro only.
- `chip_banks` — Quick Chips phrase banks by SOAP section and discipline. Pro only.

**Scheduling:**

- `appointments` — Date/time, client linkage, status (scheduled/completed/cancelled/no-show), visit type (telehealth/home/office/community), entity linkage, linked note ID.

**Billing & Financial:**

- `fee_schedule` — CPT code rates with descriptions, default units, effective dates.
- `invoices` — Invoice generation with line items, status workflow (draft/sent/outstanding/paid/void), Stripe payment link tracking, entity linkage.
- `invoice_items` — Individual line items linked to notes, with CPT codes, units, and pricing.
- `payments` — Payment records with method (cash/check/credit_card/stripe/insurance/other), Stripe payment intent tracking, invoice matching.

**Pro Module Tables:**

- `contracted_entities` — Agency/company records with contact info, billing address, notes.
- `entity_fee_schedules` — Per-entity custom rates by service type with unit types.
- `entity_documents` — Contracts, W9s, credentialing docs with expiration tracking.
- `vault_documents` — Provider professional credentials (licenses, certifications, insurance, DEA) with expiration dates and reminder windows.
- `compliance_tracking` — Per-client compliance settings. Medicare presets with configurable thresholds. Visit counters, date tracking, physician order requirements. *(Now also accessible at Basic tier.)*
- `authorizations` — Insurance authorization tracking. *(Now also accessible at Basic tier.)*
- `mileage_log` — IRS-compliant trip records.
- `communication_log` — Client communication records (phone/email/fax/letter/in-person) with fax type + direction fields for future fax integration.
- `waitlist` — Waitlist entries with priority, contact info, and notes. Pro only.

**V3-Ready Tables (schema exists, activating in V3):**

- `claims` — Insurance claim lifecycle (837P generation through remittance). Fields for EDI content, payer routing, status tracking, adjustment amounts.
- `claim_lines` — Individual claim line items with service-level detail.
- `payers` — Insurance company directory with EDI payer IDs, clearinghouse routing, enrollment status.

**Support Tables:**

- `note_bank` — Reusable documentation phrases by discipline, SOAP section, and category.
- `goals_bank` — Reusable goal templates by discipline and category.
- `client_documents` — Uploaded documents with structured categorization (signed_poc, recertification, physician_order, prior_authorization, intake_form, correspondence, discharge_summary, other). Includes certification period dates, physician name, sent/received dates, fax_confirmation_id — architected for fax integration.
- `audit_log` — Tamper-evident trail of every delete operation. Entity type, action, old/new values, timestamps. Covers: note_deleted, evaluation_deleted, appointment_deleted, document_deleted, invoice_deleted, communication_deleted, vault_document_deleted, mileage_deleted, fee_schedule_deleted, entity_deleted, entity_document_deleted, payer_deleted, client_archived.
- `settings` — Key-value store for application settings, PIN hash/salt, feature flags.
- `practice` — Single-row table for practice information (name, address, NPI, taxonomy, logo, provider credentials).

### Soft Delete Convention

Every table with user-created records includes a `deleted_at DATETIME DEFAULT NULL` column. Records are never hard-deleted. All list queries include `WHERE deleted_at IS NULL`. Every delete operation writes to the `audit_log` table.

### Tier Gating Architecture

The application supports three tiers: `unlicensed`, `basic`, and `pro`.

**Gating is enforced at two levels:**
1. **Main process:** `requireTier('pro')` at the top of Pro-only IPC handlers.
2. **Renderer:** `useTier()` hook provides `tier` and `hasFeature()` to React components. Pro features show a lock icon with upgrade prompt — visible but disabled, never hidden.

**Current `PRO_FEATURES` set in `useTier.ts`:**
```typescript
const PRO_FEATURES = new Set([
  'contractor_module',
  'professional_vault',
  'stripe_billing',
  'mileage_tracking',
  'communication_log',
  'caseload_dashboard',  // Basic gets basic_alerts; full dashboard remains Pro
  'batch_invoicing',
  'tax_summary',
  'quick_chips',
  'waitlist',
  'revenue_pipeline',
]);
// NOTE: compliance_engine was REMOVED from this set per tier restructuring.
// Compliance tracking (compliance_tracking, authorizations tables) is now Basic tier.
```

**License validation flow:** License key → Lemon Squeezy API validation (main process) → response includes product/variant/status → tier stored locally → periodic re-validation every 7-14 days when online → grace period for offline use.

### Section Color System

| Section | Color | Purpose |
|---------|-------|---------|
| Clinical | Teal | Notes, evaluations, goals, documentation |
| Calendar | Blue | Scheduling, appointments |
| Business | Amber | Billing, invoices, payments, mileage |
| Professional | Violet | Vault, credentials, compliance |
| Settings | Gray | Configuration, preferences |

Status indicators use a traffic-light system (green/yellow/red) that coexists with section colors.

### Build & Distribution

**Build:** `electron-builder` for Windows (.exe) and Mac (.dmg) from the same codebase. GitHub Actions for automated builds.

**Auto-Update:** `electron-updater` checks GitHub Releases on launch. Silent download with user-prompted install.

**Distribution flow:** User buys on Lemon Squeezy OR downloads via lead magnet → installs → enters license key → app validates → all future updates from GitHub Releases automatically.

**Trial flow:** Lemon Squeezy lead magnet captures email and delivers installer. 30-day in-app trial activated automatically, no payment required upfront.

**Code Signing:** Azure Trusted Signing for Windows installer (~$10/month).

---

## 1.2 Current Feature Inventory

### Shipped Features (V1 + V2)

#### Clinical Documentation

- **SOAP / DAP / BIRP Notes** — Multi-format support mapping to same 4 DB fields. Multi-line CPT codes with per-line units and modifiers. Time in/out. Goals addressed checkboxes. Note Bank phrase suggestions. Draft saving. Sign-to-lock immutability with typed + drawn signature. NPI and provider info auto-stamped.
- **Quick Chips (Pro)** — Chip banks per SOAP section with tap-to-insert phrases. Goal-linked data collection panel with accuracy %, cueing level, cue type, trials. Auto-generated skilled Objective/Assessment language from structured data. Chip bank management UI in Settings.
- **Evaluations** — Discipline-specific objective assessment fields. Structured content for Medicare POC compliance. Sign-to-lock with signature capture. PDF exports as "Initial Evaluation / Plan of Care."
- **Goals (STG/LTG)** — With target dates, status tracking, Goals Bank.
- **Progress Reports** — Toggle-within-SOAP architecture. Pre-populated sections with goal status dropdowns, visit count, date range, frequency/duration confirmation. Signs as both session note and progress report.
- **Discharge Summaries** — Supports billed and administrative discharges. Blocking validation: all goals require terminal status. Automatically sets client status to "discharged."
- **Document Management** — Per-client document uploads with structured categorization architected for Medicare audit readiness.
- **Intake Form PDF Generator** — Generates professional intake/consent forms from client data.
- **Good Faith Estimate Builder** — GFE compliant with No Surprises Act requirements.

#### Scheduling & Calendar

- **Calendar Views** — Day, week, and month views.
- **Appointment Management** — Status tracking, visit type classification, direct note linking, entity linkage.
- **Payment Indicators** — Calendar appointments show payment status badges.

#### Client Management

- **Demographics** — V3-ready fields for EDI/837P claim generation.
- **Status Workflow** — Active → Discharged (via discharge summary) or Hold.
- **Client Detail Page** — Unified view with tabs for demographics, notes, evaluations, goals, documents, appointments, and billing.

#### Billing & Invoices

- **Fee Schedule** — CPT code rates with discipline-specific seed data.
- **Invoice Generation** — From signed notes with auto-populated CPT codes. Multi-line item support. Entity-aware.
- **Invoice Workflow** — Draft → Sent → Outstanding → Paid/Void. PDF generation.
- **Stripe Integration** — API key in OS secure storage. Payment link generation, status polling, auto-record payments. No PHI transmitted.
- **Payment Recording** — Manual entry for cash/check/other. Invoice matching.
- **Late Cancel / No-Show Fees** — Configurable amounts with auto-prompt.
- **Superbill Generation** — Professional PDF superbills with all required insurance fields.
- **CMS-1500 Generation** — Paper claim form PDF generation for insurance billing.
- **Revenue Pipeline (Pro)** — Visual pipeline tracking outstanding revenue by stage.

#### Contractor Module (Pro)

- **Contracted Entities** — CRUD for agencies the therapist contracts with.
- **Entity Fee Schedules** — Custom per-entity rates by service type.
- **Entity Documents** — Upload contracts, W9s, credentialing documents with expiration tracking.
- **Entity-Linked Notes** — Rate overrides with required reason documentation.
- **Batch Invoicing** — Generate invoices for all uninvoiced notes per entity for a date range.

#### Waitlist (Pro)

- Per-client waitlist entries with priority and contact info. Integrated with client management.

#### Professional Vault (Pro)

- **Credential Storage** — Licenses, certifications, insurance policies, continuing education records.
- **Expiration Tracking** — Alerts when credentials approach expiration.
- **Credentialing Packet Export** — Bundle selected documents into a single PDF.
- **Cloud Storage BAA Guidance** — Informational system for cloud provider BAA requirements.

#### Compliance Engine (Basic + Pro)

> **Note:** Compliance tracking was moved from Pro to Basic in the tier restructuring. No Basic user should risk a Medicare compliance miss because a safety feature was paywalled.

- **Per-Client Configuration** — Medicare presets or custom intervals.
- **Progress Report Tracking** — Dual-threshold: 10-visit AND 30-day since last progress report. Configurable thresholds. Visit counter increments on note signature only.
- **Notification Tiers** — Green → Yellow (80%+ threshold) → Red-Due → Red-Overdue (persistent banner, non-blocking).
- **90-Day Recertification Tracking** — Date-based. Resets when signed recertification is uploaded.
- **Physician Order Tracking** — Per-client with expiration tracking.
- **Authorization Tracking** — Visits authorized vs. used. Alerts at 80% usage and <30 days remaining.
- **Basic Alerts Panel (Basic + Pro)** — Home screen panel showing: unsigned notes, compliance alerts (progress report/recert due), expiring physician orders, authorization alerts. Color-coded by urgency. IPC handler: `dashboard:getBasicAlerts`.
- **Full Caseload Dashboard (Pro only)** — Extends Basic Alerts with: outstanding invoices, expiring credentials, entity-level summaries, today's appointments.

#### Security & Access Control

- **PIN Protection** — HMAC-SHA256 with random salt.
- **Auto-Lock** — Configurable inactivity timeout (5/10/15/30 min).
- **Quick Lock** — Ctrl+L or sidebar logo click.
- **PIN Recovery** — File-based 8-character code valid 15 minutes.
- **Signed Note Immutability** — UI AND backend enforced. `signed_at` as the point of no return.
- **Completeness Check on Signing** — Pre-sign validation for blocking errors (empty sections, missing goal data) and non-blocking warnings (short sections, copy-paste detection). Runs via `runSignValidation()` in `NoteFormPage.tsx`.
- **Secure API Key Storage** — OS-level keychain/credential manager.

#### E-Signature (Dropbox Sign)

- Document signing workflows via Dropbox Sign API. Direct from user's machine — no Pocket Chart, LLC server in data path (zero-knowledge preserved).

#### Fax (SRFax)

- HIPAA-compliant fax send/receive via SRFax API. SRFax signs BAAs.
- **Sending:** Generate PDF locally → API call to SRFax → auto-create Communication Log entry with status.
- **Receiving:** PocketChart polls for incoming faxes → smart matching to recent outgoing → suggest client → "File as Signed POC?" one-click filing.
- Architecture fully pre-built: Communication Log has fax type + direction fields, client_documents has fax_confirmation_id, category system is clean.

#### Data Management & Export

- **Database Backup** — Full SQLite database export. Cloud sync detection with BAA warnings.
- **CSV Export** — All active clients.
- **Bulk Chart Export** — ZIP of individual client chart PDFs. "If it's empty, it doesn't exist" — blank fields omitted.
- **Single Chart PDF** — Individual client chart with all documentation.

#### Settings & Configuration

- Practice information, provider info (NPI, taxonomy, license), discipline selection, session defaults, note format, data storage location with cloud detection.

#### Licensing & Onboarding

- **Onboarding Wizard** — EULA acceptance → discipline + state + NPI → PIN setup.
- **License Activation** — Lemon Squeezy validation → tier assignment.
- **Trial Mode** — 30-day in-app trial, no payment required. Unlicensed users see export-only access (no data loss).

---

## 1.3 Multi-Discipline Support

PocketChart supports four disciplines with a platform architecture that makes adding new disciplines a content package, not a code change:

| Discipline | Taxonomy Code | Default Note Format | Eval Fields | CPT Seed Data |
|-----------|---------------|--------------------|-----------|----|
| PT | 225100000X | SOAP | ROM, MMT, posture, gait, balance, functional mobility, pain | 97161-97163, 97110, 97112, 97116, 97140, 97530, 97542, 97750, 97760-97763 |
| OT | 225X00000X | SOAP | ADLs, hand function, cognition, sensory, visual-perceptual, home safety | Same rehab codes as PT |
| SLP | 235Z00000X | SOAP | Speech intelligibility, language comprehension/expression, voice, fluency, swallowing, cognition-communication | Same rehab codes as PT |
| MFT | 101YM0800X | DAP | Presenting problem, mental status exam, risk assessment, relationship dynamics, treatment modality | 90791, 90834, 90837, 90839, 90840, 90846, 90847, 90853, 96130, 96131, 96136, 96137 |

**Expansion path:** LCSW and LPC share MFT's CPT codes and note formats — adding them requires only a new taxonomy code and credential label. This expands addressable market from ~65,000 to ~215,000+ solo practitioners.

**Pediatric/AAC content expansion:** Additional chip bank and note bank content for pediatric SLP and AAC users has been added in V2.

---

## 1.4 V3 Insurance Billing — Active Development

**Branch:** `v3-insurance`  
**Ship target:** Before CMS publishes proposed 2027 CPT rates (summer 2026)  
**Strategic context:** CPT 92507 restructuring effective January 2027 is creating urgency. Therapists panicking about reimbursement cuts + EMR subscription costs. PocketChart at $249/year is positioned as the lifeline.

### Architecture: Local-First Insurance Billing

```
PocketChart (local)           Claim.MD              Payers
┌──────────────┐  ──HTTPS──▶ ┌────────────┐  ──── ▶ Medicare
│ Generate 837P│              │ Validate & │         Medicaid
│ locally      │  ◀──HTTPS── │ Route      │  ◀────  BCBS/Aetna
│ Parse 835    │   999/277/   │            │         etc.
└──────────────┘   835        └────────────┘
```

**No PHI stored on Pocket Chart, LLC servers.** PocketChart generates EDI data locally and sends directly to Claim.MD from the user's machine.

**Clearinghouse: Claim.MD**
- REST API, per-claim pricing ($0.25–0.35)
- Covers Medicare, most Medicaid, commercial payers
- 270/271 eligibility included, 835 ERA included
- Signs BAAs with users

### V3 UI Changes

**Billing Page Restructuring:**
```
BillingPage.tsx
├── Tab bar: [Direct Pay] [Insurance 🔒PRO]
├── DirectPayTab (existing BillingPage content)
│   └── Sub-tabs: Invoices | Payments | Analytics | Stripe
└── InsuranceTab (new)
    └── Sub-sections: Eligibility | Claims | Remittance | Denials
```

**Contracts Page:** Add Contract Revenue Summary header showing visits, expected revenue, invoiced vs. uninvoiced per entity with time-period filters.

### V3 Insurance Features

**Eligibility Verification (270/271):**
- One-click eligibility check per client
- Speech/PT/OT therapy benefit parsing (visits remaining, copay, deductible, auth requirements)
- Save eligibility snapshot to client record
- Pre-appointment eligibility reminders
- Batch eligibility check for full caseload

**Electronic Claims (837P):**
- 837P file generator (transform notes/client/practice data into X12 format locally)
- Pre-submit validation with plain-English error messages
- Claims lifecycle tracking: Draft → Submitted → Accepted/Rejected → Paid/Denied
- `claims` + `claim_lines` tables (already in schema, activating now)

**Remittance Processing (835 ERA):**
- Parse ERA files from Claim.MD
- Auto-post payments to invoices
- Flag underpayments and adjustments
- PR-* codes routed to patient responsibility, CO-* to write-off or secondary

**Denial Management:**
- Denial code translation table (100+ codes → plain English + "what to do")
- Key codes: CO-4, CO-16, CO-29, CO-50/96, CO-97, PR-1/2/3, OA-23
- One-click resubmit with suggested fixes
- Denial pattern alerts per payer

**"Will I Get Paid?" Compliance Board:**
- Per-client visual board auto-populated from therapist actions
- Slots: Physician Order, Initial Evaluation, POC, Progress Report, 90-Day Recertification, Authorization, Discharge Summary
- Each slot fills automatically as documents are created/uploaded
- Templates for Medicare, Medicaid, Commercial, Private Pay

**Insurance Setup (Settings):**
- Claim.MD API key entry → stored in OS secure storage (same pattern as Stripe)
- "Test Connection" button
- Payer enrollment status table
- BAA acknowledgment checkbox required before credential save

**Authorization Management:**
- Auto-decrement on note signature
- Dashboard alert at >80% used or <30 days remaining
- Link to eligibility check for re-authorization

### Schema Fields Already in Place for V3

All these columns exist in the current database:

| Table | Field | Purpose |
|-------|-------|---------|
| `practice` | city, state, zip, taxonomy_code | 837P EDI |
| `clients` | gender, city, state, zip, insurance_payer_id, subscriber_relationship, subscriber_first/last_name, subscriber_dob | 837P EDI |
| `notes` | cpt_modifiers, charge_amount, place_of_service, diagnosis_pointers | 837P EDI |
| `client_documents` | certification_period_start/end, received_date, sent_date, physician_name, fax_confirmation_id | Medicare audit, fax integration |

---

## 1.5 Security Architecture

### Current Security State

- PIN protection with HMAC-SHA256 (random salt)
- Auto-lock on inactivity (configurable)
- Quick lock (Ctrl+L)
- File-based PIN recovery (8-character code, 15 min validity)
- Signed note immutability enforced at both UI and main process
- Completeness check on signing (blocking errors + non-blocking warnings)
- API keys stored in OS-level secure storage (Keychain / Credential Manager)
- Soft delete everywhere for HIPAA record retention
- Audit log covering all destructive operations

### SQLCipher Database Encryption (V3 — planned)

**Current state:** SQLite database stores PHI in plaintext on disk. The app has application-layer PIN protection but the .db file is readable with direct filesystem access.

**Planned:** AES-256 encryption at the database level via SQLCipher. Drop-in replacement for better-sqlite3 — same API, same schema, same migrations.

**Key design:**
- User sets an **encryption passphrase** (separate from PIN) at first launch
- Passphrase → PBKDF2 → derived key (never stored)
- Two-key architecture: random master key encrypted twice — once with passphrase-derived key, once with recovery key
- Either credential can unlock the database; changing passphrase only re-wraps the master key

**Recovery Key System (ships with SQLCipher):**
- 32-character alphanumeric recovery key generated at setup
- Mandatory "ceremony" UX: display key → print or save PDF → verify first 8 characters before proceeding
- Recovery Key PDF includes practice name, date, key, and secure storage instructions
- Recovery key is never stored on user's system or transmitted to Pocket Chart, LLC servers
- Forgot passphrase flow: enter recovery key → set new passphrase → optionally generate new recovery key

**App startup flow (post-encryption):**
1. App launches → passphrase entry screen
2. Enter passphrase → derive key → open database
3. If successful → PIN screen (if PIN set) → app loads
4. Forgot passphrase → recovery key flow

**Marketing claim unlocked:** "Your data is encrypted on your device with a key only you hold. We literally cannot access your patient data — even if we wanted to. That's not a policy. It's math."

### Mac-Specific Storage Safety (V3 — Mac build prerequisite)

- Default data path on macOS: `~/Library/Application Support/PocketChart/` (NOT synced by iCloud)
- Enhanced iCloud sync detection: check for `.iCloud` extended attribute
- iCloud warning escalated to **blocking dialog** (user must explicitly acknowledge risk)
- Cloud detection runs at first launch against the DEFAULT path, not just on manual change

### Cloud Storage Warning Language

**Current language (Settings page):** Neutral; places responsibility on user. Warns iCloud cannot be made HIPAA-compliant and recommends a different location for those cases.

**Warning dialogs:** BAA-capable providers (Google Drive, OneDrive, Dropbox) → informational with checklist. iCloud → strong blocking warning with "Choose Different Location" as primary button.

---

# PART 2: COMPLIANCE & REGULATORY DOCUMENTATION

*Audience: Legal counsel, compliance officers, Medicare auditors, prospective enterprise customers*

---

## 2.1 Regulatory Framework

PocketChart is:
- A clinical documentation tool
- A practice management aid
- A billing/invoicing system

PocketChart is NOT:
- A certified EHR (not ONC-certified)
- A medical device (not FDA-regulated)
- A cloud-hosted service
- A clearinghouse (V3 integrates *with* clearinghouses, does not operate as one)

---

## 2.2 HIPAA Compliance — Zero-Knowledge Architecture

### The Local-First Advantage

All PHI is stored exclusively on the user's device. PocketChart does not transmit, host, or store PHI on any external server.

**HIPAA implications:**
- **No BAA required from PocketChart.** PocketChart does not meet the definition of Business Associate under 45 CFR 160.103.
- **No HIPAA hosting liability.** The covered entity (therapist) retains full custody of their data.
- **No breach notification obligations on PocketChart's part.**

### Data That Stays Local (Never Transmitted by PocketChart)

All clinical data: notes, evaluations, goals, appointments, documents, billing records, and all client/patient information.

### Data That May Be Transmitted (by user action)

| Data | Destination | Purpose | Contains PHI? |
|------|-------------|---------|---------------|
| Payment amount, client name, generic description | Stripe | Process client payments | No |
| License key | Lemon Squeezy | Validate software license | No |
| Version number | GitHub/Update server | Check for app updates | No |
| EDI 837P claims, fax documents, e-signature docs | Claim.MD / SRFax / Dropbox Sign | User's own integrations | PHI flows direct from user's machine to service — never through Pocket Chart, LLC |

### Stripe Payment Processing — No BAA Required

Payment processing is exempt from Business Associate requirements under HIPAA Section 1179. Implementation safeguards: generic invoice descriptions ("Therapy Services — [date]"), Stripe metadata contains only invoice ID and client ID (never clinical data), no raw card numbers stored.

### Google Workspace BAA

`support@pocketchart.app` is hosted on Google Workspace with a signed BAA. Support emails that inadvertently contain PHI are covered. Policy: instruct users not to include PHI in support emails, delete any PHI received after resolution.

---

## 2.3 HIPAA Development Guardrails

> See `/docs/pocketchart-hipaa-guardrails.md` for the full developer checklist.

**The 10 Guardrails (summary):**

1. **No company infrastructure in the data path.** All API calls (fax, e-signature, clearinghouse) go directly from user's machine to service. No PocketChart relay servers.
2. **No telemetry that captures PHI.** Crash reporting, analytics, error logs must never include clinical data, patient identifiers, or request/response bodies from integration calls.
3. **Audit all outbound network calls.** Minimum necessary calls, all documented.
4. **License validation payload audit.** Must send ONLY the license key — no practice name, email, or identifying information.
5. **Support channel PHI policy.** Never receive PHI through support. Use demo data for troubleshooting. If PHI received, delete immediately and notify user.
6. **Integration setup disclaimers are mandatory.** Required checkbox acknowledgment before saving credentials for any integration that handles PHI.
7. **No feature should compromise zero-knowledge.** Before shipping any feature: "Does this cause PHI to flow through Pocket Chart, LLC infrastructure?" If yes, redesign.
8. **Error handling must not leak PHI into logs.** Log status codes and error codes only — never request/response bodies.
9. **Credential storage is local and encrypted.** All third-party API credentials stored on user's machine only, never transmitted to Pocket Chart, LLC.
10. **V4 cloud transition is a different world.** The zero-knowledge architecture applies to V1–V3. V4 triggers full HIPAA Business Associate obligations (SOC 2, BAAs, security officer, breach notification, etc.).

**Pre-shipping checklist for any integration feature:**
- [ ] Data path is user's machine → third-party service (no PocketChart server in the middle)
- [ ] Error handling logs metadata only (no PHI in log output)
- [ ] Credentials stored locally and encrypted
- [ ] User acknowledgment/disclaimer with BAA checkbox required before credential save
- [ ] No telemetry captures integration payloads
- [ ] Feature does not compromise zero-knowledge position (Guardrail 7 check)

---

## 2.4 Medicare Compliance

| Medicare Requirement | PocketChart Implementation | Status |
|---------------------|----------------------------|--------|
| Physician Order / Referral | Per-client tracking with expiration dates, document upload category | ✅ Built |
| Initial Evaluation / Plan of Care | Eval form with all required elements; PDF exports as "Initial Evaluation / Plan of Care" | ✅ Built |
| Progress Reports (10-visit/30-day) | Dual-threshold compliance engine — now Basic tier | ✅ Built |
| 90-Day Recertification | Date-based tracking, dashboard alerts, MD signature tracking | ✅ Built |
| Skilled Documentation Language | Note Bank + Quick Chips (Pro) with skilled terminology | ✅ Built |
| KX Modifier | Schema-ready for automatic application in V3 claim generation | 🔋 V3 |
| CPT Code Accuracy | Multi-line CPT, per-line units, modifiers, place of service | ✅ Built |
| Discharge Summary | Comprehensive workflow with required terminal goal statuses | ✅ Built |
| Record Retention | Soft delete everywhere; signed notes permanently immutable | ✅ Built |
| NPI on All Documentation | Auto-stamped on all notes, evals, superbills, PDFs | ✅ Built |

---

# PART 3: PRODUCT & BUSINESS DOCUMENTATION

*Audience: Marketing, sales, investors, strategic partners*

---

## 3.1 Product Positioning

**Core positioning:** Local-first architecture (PHI never touches company infrastructure — zero-knowledge), one-time purchase model for Basic, built by a practicing SLP.

**Tagline:** "Stop paying monthly to be annoyed."

**The real competition:** Subscription fatigue and "Google Docs and a prayer" workarounds — not SimplePractice or TherapyNotes feature parity.

**Target user:** Solo practitioner who is frustrated with EMR subscription costs ($600–1,200/year), vendor lock-in, VC-driven price increases, and tools built by people who've never treated a patient.

**Lyda's credibility as a practicing SLP** is a genuine differentiator. More authentic than competitors who write about clinician pain points without having lived them.

---

## 3.2 Pricing & Tiers

**PocketChart Basic — $149 one-time**

The complete clinical documentation and compliance tool. A solo therapist can start and run a fully compliant practice on Basic alone. "Full Medicare compliance tracking included. Not upsold. Not locked. Included."

**PocketChart Pro — $249/year**

Everything in Basic, plus the tools to run the *business* side of a therapy practice. "Pro costs less than one patient visit per month."

**Guiding principle for tier assignment:**
- **Basic = "You won't get in trouble."** Safety, compliance, complete documentation.
- **Pro = "You'll be amazing."** Speed, polish, business operations.

**Full Tier Feature Map:**

| Feature | Basic | Pro |
|---------|:-----:|:---:|
| SOAP / DAP / BIRP notes | ✅ | ✅ |
| Note bank phrase insertion | ✅ | ✅ |
| Evaluation templates (PT/OT/SLP/MFT) | ✅ | ✅ |
| Goal tracking (STG/LTG) | ✅ | ✅ |
| Quick Chips + auto-generated skilled docs | 🔒 | ✅ |
| Skilled language check on signing | — | 🔋 Future |
| Medicare compliance toggle (per client) | ✅ | ✅ |
| Progress report tracking (10-visit/30-day) | ✅ | ✅ |
| 90-day recertification tracking | ✅ | ✅ |
| Authorization tracking | ✅ | ✅ |
| Pre-populated progress report template | ✅ | ✅ |
| Discharge workflow | ✅ | ✅ |
| Completeness check on signing | ✅ | ✅ |
| Basic alerts panel (compliance-only) | ✅ | ✅ |
| Full caseload dashboard | 🔒 | ✅ |
| Superbill generation | ✅ | ✅ |
| CMS-1500 generation | ✅ | ✅ |
| Good Faith Estimate builder | ✅ | ✅ |
| Fee schedule | ✅ | ✅ |
| Intake form PDF generator | ✅ | ✅ |
| Stripe invoicing + payment links | 🔒 | ✅ |
| Revenue Pipeline | 🔒 | ✅ |
| Contractor module | 🔒 | ✅ |
| Waitlist | 🔒 | ✅ |
| Credential vault | 🔒 | ✅ |
| Mileage tracking | 🔒 | ✅ |
| Communication log | 🔒 | ✅ |
| Year-end tax summary | 🔒 | ✅ |
| Batch invoicing | 🔒 | ✅ |
| E-signature (Dropbox Sign) | ✅ | ✅ |
| Fax (SRFax) | ✅ | ✅ |
| Local encrypted SQLite storage | ✅ | ✅ |
| PDF export (single + bulk ZIP) | ✅ | ✅ |
| PIN lock + auto-lock | ✅ | ✅ |
| Auto-update | ✅ | ✅ |
| Audit log | ✅ | ✅ |
| Insurance billing (V3) | 🔒 | ✅ |

**Legend:** ✅ = Included | 🔒 = Visible but locked (ProFeatureGate) | 🔋 = Backlog

---

## 3.3 Competitive Positioning

**Competitor failure patterns that shaped PocketChart's design:**
- SimplePractice: aggressive price increases, VC-driven ToS surprises, collapsed support, suspected data monetization
- Most cloud EMRs: they hold your encryption keys — their server = their custody

**Key differentiators:**
- Zero-knowledge architecture (structural, not just a policy claim)
- One-time purchase for full clinical documentation (no subscription fatigue)
- Built by a practicing SLP (real clinical credibility)
- Compliance as a safety feature, not an upsell
- Local data ownership — your data is yours, always exportable

| Competitor | Price | PocketChart Advantage |
|------------|-------|----------------------|
| SimplePractice | $50-90/mo | Lower cost, own your data, simpler |
| TherapyNotes | $50-60/mo | Modern UI, lower cost |
| WebPT | Enterprise pricing | Simpler, therapy-agnostic, affordable |
| Jane App | Canadian, limited US billing | US-focused, local data |
| TheraNest | Limited features | More complete feature set |
| Spreadsheets + prayer | Free but painful | Actually works, still affordable |

---

## 3.4 Distribution & Marketing

**Primary acquisition:** SLP/therapy Facebook groups (word-of-mouth, organic posts from Lyda's authentic practitioner voice)

**LinkedIn presence:** Building. Text-only for thought leadership, single reusable Canva template for product/pricing posts, carousel PDFs for clinical education.

**Marketing site:** pocketchart.app (Carrd)

**Payments & distribution:** Lemon Squeezy (sales, lead magnet, license activation, EULA/ToS acceptance)

**Trial flow:** Email capture via Lemon Squeezy lead magnet → installer download → 30-day in-app trial → no payment required upfront

**Post-purchase automation:** Make.com for Facebook post scheduling

**Capterra listing:** Resubmission planned once V2 is fully live with screenshots and reviews. In-app review prompt planned (trigger: 50 notes signed, 30 days active, or first batch invoice) → 4-5 stars routes to Capterra, 1-3 stars routes to internal feedback form.

---

## 3.5 Strategic Opportunities

**CPT 92507 Restructuring (January 2027):**
CMS is restructuring CPT 92507 into a 10-code system. This is a confirmed first-mover content and tooling opportunity. PocketChart has a window to be the first EMR that fully supports the new code structure before competing platforms catch up. Ship window: before summer 2026 when proposed 2027 rates publish.

Content angle: "Here's how the new SLP billing codes work, and here's how PocketChart handles it automatically."

---

# PART 4: ROADMAP

---

## 4.1 V2 — Status: Complete (Active Commercial Release)

All V2 features shipped:
- Quick Chips (Pro)
- Revenue Pipeline (Pro)
- CMS-1500 generation
- Stripe integration
- SRFax fax integration
- Intake form PDF generator
- Good Faith Estimate builder
- Audit trail (complete)
- E-signature via Dropbox Sign
- Claim.MD clearinghouse integration foundation
- Contractor module
- Compliance engine moved to Basic tier
- Waitlist (Pro)
- Pediatric/AAC content expansion
- Basic Alerts Panel (Basic + Pro)
- Completeness check on signing (Basic + Pro)
- Tier restructuring (compliance_engine removed from PRO_FEATURES)
- Security language updates (Settings, cloud detection warnings, EULA)
- Support email PHI policy operational

---

## 4.2 V3 — Insurance Billing (Active Development)

**Branch:** `v3-insurance`  
**Target:** Summer 2026 (before CMS publishes proposed 2027 rates)

Core V3 deliverables:
- [ ] Billing page restructure (Direct Pay / Insurance tabs)
- [ ] Claim.MD API integration + Settings setup flow
- [ ] 837P electronic claim generation (local)
- [ ] Claim submission + 999/277 acknowledgment handling
- [ ] Eligibility verification (270/271) with plain-English benefit display
- [ ] ERA/835 remittance processing + auto-posting
- [ ] Denial management (plain-English translations + resubmit workflow)
- [ ] "Will I Get Paid?" Compliance Board
- [ ] Authorization management (V3 tier integration)
- [ ] KX modifier automatic application
- [ ] SQLCipher database encryption + recovery key system
- [ ] Mac default storage path (`~/Library/Application Support/PocketChart/`)
- [ ] Enhanced iCloud sync detection (blocking dialog)
- [ ] Contract Revenue Summary on Contracted Entities page

V3 is Pro-only. Basic users see Insurance tab locked with ProFeatureGate.

---

## 4.3 V4 — Multi-Provider / Practice Management (12-24 months)

**Architecture shift:** Local SQLite → cloud-hosted PostgreSQL for multi-user support.

**V4 prerequisites (significant):**
- HIPAA-compliant cloud hosting (AWS/GCP with BAA)
- User authentication (Auth0 or Clerk)
- SOC 2 Type 1 certification
- Designated HIPAA Security Officer
- Breach notification procedures
- Cyber insurance upgrade
- BAAs with every customer
- Complete re-evaluation of all HIPAA guardrails

**Schema already prepared:**
- `user_id` columns on notes, appointments (nullable, ready for backfill)
- `assigned_user_id` on clients
- `created_by_user_id` on notes
- Audit log table exists

**Pricing:** $79/mo base + $29/user

---

## 4.4 V5 — Enterprise (24+ months)

Multi-location support, advanced reporting, custom workflow builder, API for third-party integrations, white-label options, SOC 2 Type 1, custom pricing.

---

## 4.5 Success Metrics by Version

| Metric | V2 Target | V3 Target | V4 Target |
|--------|----------|----------|----------|
| Paid licenses / users | 30% upgrade to Pro | 50% of Pro enable insurance | 10 practices |
| Revenue | $5,000 MRR | $15,000 MRR | $50,000 MRR |
| Churn | <5% monthly | <5% monthly | <5% monthly |
| Quality | 4.5+ stars (Capterra) | 95%+ first-pass claim rate | HIPAA audit pass |

---

# PART 5: DESIGN PRINCIPLES & UX PHILOSOPHY

---

## 5.1 Core Principles

**"Fix it from here":** Users should never have to leave their current context to complete a related action. Every workflow should be completable from the screen the user is already on.

**"Build as you go":** The app should grow from actual clinical use, not require upfront configuration. A new user who adds one client and writes one note should immediately see value — they shouldn't need to spend an hour configuring before they can work.

**"If it's empty, it doesn't exist":** PDF exports and documents should never show placeholder text, blanks, or N/A fields. Empty fields are omitted from exports for professional appearance.

**"Compliance should feel like the app helping you, not homework":** The app nudges toward compliance through contextual prompts and visual indicators. Compliance features are never the source of friction — they relieve it.

**Lyda absorbs all complexity so users experience simplicity.** Advanced features are accessible but never block the default workflow.

---

## 5.2 Pro Feature Gate UX

- Pro features are **visible but locked** for Basic users — never hidden.
- Lock icon + upgrade prompt on hover/focus.
- Subtle post-sign nudge for Quick Chips (Basic only): small dismissible hint after signing, max once per week. Never nagging.
- Quick Chips on note form: dimmed with ProFeatureGate overlay. Prompt: "PocketChart Pro auto-generates skilled documentation from quick taps. Upgrade to write better notes in half the time."

---

## 5.3 The Upgrade Journey

1. Month 1: Basic user writes notes manually. Compliance engine keeps them on schedule. Trust earned.
2. Month 3: User spends 20 min/note, unsure about skilled language quality. Pain felt.
3. Month 4: User sees Quick Chips in the locked Pro preview. "$249/year to cut my note time in half? That's less than one session."

The upgrade path is a growth story, not a bait-and-switch.

---

# APPENDIX: INFRASTRUCTURE & TOOLING

## Business Infrastructure

| Tool | Purpose |
|------|---------|
| Google Workspace | support@pocketchart.app; BAA signed |
| Lemon Squeezy | Sales, lead magnet, license activation, EULA/ToS acceptance in purchase flow |
| Carrd | pocketchart.app marketing site |
| GitHub / GitHub Actions | Version control, automated builds, releases |
| Azure Trusted Signing | Windows code signing (~$10/month) |
| Make.com | Facebook post automation |
| Canva | Marketing image creation (bulk) |
| Descript | Screen recording / training videos |

## Development Tools

| Tool | Purpose |
|------|---------|
| Claude Code (CC) | Primary development partner |
| Electron + React + SQLite | Core app stack |
| Stripe | Client payment collection within app |
| Dropbox Sign | E-signature workflows |
| SRFax | HIPAA-compliant fax |
| Claim.MD | Insurance clearinghouse (V3) |

## Legal / Compliance Status

- EULA acceptance embedded in Lemon Squeezy purchase flow ✅
- Audit log with hash chain ✅
- HIPAA position documented (zero-knowledge) ✅
- ToS updated for California auto-renewal compliance ✅
- Google Workspace BAA signed ✅
- iCloud warning language in place ✅
- Support email PHI policy operational ✅

---

*This document represents the cumulative strategic, technical, and clinical domain knowledge behind PocketChart. Every feature exists because it solves a real problem in the therapy practitioner workflow. Every architectural decision accounts for its impact 2–3 versions into the future. Every compliance feature is grounded in actual Medicare/HIPAA regulatory requirements.*

*Maintained by: Lyda / Claude Code — update after each major feature completion.*  
*Last Updated: March 8, 2026*
