import React, { useState, useMemo } from 'react';
import {
  HelpCircle,
  Compass,
  Users,
  Calendar,
  FileText,
  ClipboardList,
  Target,
  Settings,
  Receipt,
  Search,
  Shield,
  FolderOpen,
  BookOpen,
  HardDrive,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface HelpSectionData {
  id: string;
  icon: React.ReactNode;
  title: string;
  keywords: string[];          // extra terms the search can match on
  content: React.ReactNode;
}

/* ------------------------------------------------------------------ */
/*  Reusable styled helpers                                            */
/* ------------------------------------------------------------------ */

const B = ({ children }: { children: React.ReactNode }) => (
  <span className="text-sm font-medium text-[var(--color-text)]">{children}</span>
);

function HelpSection({ section, defaultOpen }: { section: HelpSectionData; defaultOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(defaultOpen ?? true);
  return (
    <div className="card mb-4 overflow-hidden">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center gap-2 p-5 text-left hover:bg-[var(--color-bg-secondary)]/50 transition-colors"
      >
        {section.icon}
        <h2 className="section-title mb-0 flex-1">{section.title}</h2>
        {isOpen
          ? <ChevronDown className="w-4 h-4 text-[var(--color-text-secondary)]" />
          : <ChevronRight className="w-4 h-4 text-[var(--color-text-secondary)]" />
        }
      </button>
      {isOpen && (
        <div className="px-5 pb-5 text-sm text-[var(--color-text-secondary)] space-y-2">
          {section.content}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  All help sections                                                  */
/* ------------------------------------------------------------------ */

const allSections: HelpSectionData[] = [
  /* 1 — Getting Started ------------------------------------------- */
  {
    id: 'getting-started',
    icon: <Compass className="w-5 h-5 text-[var(--color-primary)]" />,
    title: 'Getting Started',
    keywords: ['welcome', 'onboarding', 'first launch', 'setup', 'navigation', 'sidebar', 'pin'],
    content: (
      <>
        <p>
          <B>PocketChart</B> is an offline-first clinical documentation app built for PT, OT, and
          ST therapists. All your data is stored locally on your computer — nothing is ever sent to
          an external server.
        </p>
        <ul className="list-disc list-inside space-y-1.5 ml-1">
          <li>
            On first launch you will be guided through a short <B>onboarding</B> that recommends
            setting a 4-digit PIN to protect your data. You can skip this step and configure a PIN
            later in <B>Settings &gt; Security</B>.
          </li>
          <li>
            Use the <B>sidebar</B> on the left to navigate between pages: Dashboard, Clients,
            Calendar, Note Bank, Goals Bank, Settings, and Help.
          </li>
          <li>
            Start by going to <B>Settings</B> to enter your practice name, NPI, discipline, and
            provider credentials.
          </li>
          <li>
            Next, add your first client from the <B>Clients</B> page, then schedule appointments
            and begin writing notes.
          </li>
          <li>
            The <B>Dashboard</B> shows a quick overview of active clients, notes written this week,
            upcoming appointments, and goals met this month. Each card is clickable and will take
            you directly to the relevant page.
          </li>
        </ul>
      </>
    ),
  },

  /* 2 — Security & Privacy ---------------------------------------- */
  {
    id: 'security-privacy',
    icon: <Shield className="w-5 h-5 text-[var(--color-primary)]" />,
    title: 'Security, Privacy & Your Responsibilities',
    keywords: ['hipaa', 'pin', 'lock', 'password', 'timeout', 'auto-lock', 'privacy', 'encryption', 'backup', 'compliance', 'delete', 'soft delete', 'retention'],
    content: (
      <>
        <p>
          PocketChart stores all data locally on your device. While PocketChart provides tools to
          help protect client information, <B>you are ultimately responsible</B> for ensuring your
          use of this software complies with HIPAA, state regulations, and your organization's
          policies.
        </p>

        <p className="font-medium text-[var(--color-text)] mt-3">What PocketChart does:</p>
        <ul className="list-disc list-inside space-y-1.5 ml-1">
          <li>
            <B>PIN Protection</B> — Set a 4-digit PIN in <B>Settings &gt; Security</B> to prevent
            unauthorized access when you step away from your computer.
          </li>
          <li>
            <B>Auto-Lock</B> — Configure an inactivity timeout (5, 10, 15, or 30 minutes) so
            PocketChart automatically locks itself and requires the PIN to re-enter.
          </li>
          <li>
            <B>Data Retention</B> — When you delete a client, note, evaluation, goal, document, or
            appointment, PocketChart performs a <B>soft delete</B>. The record is hidden from the
            interface but retained in the database to comply with HIPAA record-retention guidelines
            (typically 6–7 years). Records are never permanently erased.
          </li>
          <li>
            <B>Signed Notes & Evaluations</B> — Once signed, clinical documentation is locked and
            cannot be edited, preserving an unalterable record.
          </li>
          <li>
            <B>Local Storage</B> — Your database never leaves your machine unless you choose to
            place it in a cloud-synced folder.
          </li>
          <li>
            <B>PIN Recovery</B> — If you forget your PIN, click <B>Forgot PIN?</B> on the lock
            screen. PocketChart will create a recovery file in your data folder. Open the file,
            copy the 8-character code, and enter it to reset your PIN. This proves you have access
            to the computer's file system (the same level of access as the data itself). The code
            expires after 15 minutes.
          </li>
        </ul>

        <p className="font-medium text-[var(--color-text)] mt-3">What you are responsible for:</p>
        <ul className="list-disc list-inside space-y-1.5 ml-1">
          <li>
            <B>Device Security</B> — Use a strong Windows/Mac login password, enable full-disk
            encryption (BitLocker on Windows, FileVault on Mac), and keep your operating system
            up to date.
          </li>
          <li>
            <B>Regular Backups</B> — Use <B>Settings &gt; Backup & Export &gt; Export Database</B> on
            a regular schedule. Store backups in a secure, HIPAA-appropriate location.
          </li>
          <li>
            <B>Physical Security</B> — Do not leave your computer unattended and unlocked in public
            or shared spaces. Enable the auto-lock timeout.
          </li>
          <li>
            <B>Network Awareness</B> — If you place your data folder on a cloud drive (Google Drive,
            OneDrive, Dropbox) for backup, ensure your cloud account uses strong credentials and
            two-factor authentication. Understand that the data will then reside on that cloud
            provider's servers.
          </li>
          <li>
            <B>Compliance</B> — Consult your compliance officer, legal counsel, or professional
            association to confirm your overall workflow meets all applicable regulations.
          </li>
        </ul>
      </>
    ),
  },

  /* 3 — Your Data: Backups, Uninstall & Reinstall ------------------ */
  {
    id: 'data-backup-uninstall',
    icon: <HardDrive className="w-5 h-5 text-[var(--color-primary)]" />,
    title: 'Your Data: Backups, Uninstall & Reinstall',
    keywords: ['uninstall', 'reinstall', 'backup', 'restore', 'data', 'move', 'new computer', 'transfer', 'lost', 'where', 'folder', 'database', 'appdata', 'cloud', 'recovery'],
    content: (
      <>
        <p>
          Your PocketChart database and uploaded documents are stored in a <B>separate data folder</B> on
          your computer — they are <B>not</B> inside the PocketChart application itself. This means your
          data is safe even if the app is uninstalled.
        </p>

        <p className="font-medium text-[var(--color-text)] mt-3">Where is my data?</p>
        <ul className="list-disc list-inside space-y-1.5 ml-1">
          <li>
            By default, your data is stored in your system's app-data folder (on Windows, typically{' '}
            <B>C:\Users\YourName\AppData\Roaming\PocketChart</B>).
          </li>
          <li>
            You can see (and change) the exact location anytime in <B>Settings &gt; Data Storage</B>.
          </li>
          <li>
            If you moved your data to a custom folder or a cloud-synced folder (Google Drive, OneDrive,
            Dropbox), your data lives in that location instead.
          </li>
        </ul>

        <p className="font-medium text-[var(--color-text)] mt-3">What happens if I uninstall PocketChart?</p>
        <ul className="list-disc list-inside space-y-1.5 ml-1">
          <li>
            <B>Your data is NOT deleted.</B> Uninstalling only removes the application files. Your
            database, client documents, and settings remain untouched in the data folder.
          </li>
          <li>
            When you reinstall PocketChart, it automatically finds your existing data in the default
            location and picks up right where you left off.
          </li>
          <li>
            If you had moved your data to a custom location, go to <B>Settings &gt; Data Storage</B>{' '}
            after reinstalling and point PocketChart to that folder again.
          </li>
        </ul>

        <p className="font-medium text-[var(--color-text)] mt-3">Moving to a new computer</p>
        <ul className="list-disc list-inside space-y-1.5 ml-1">
          <li>
            Use <B>Settings &gt; Backup & Export &gt; Export Database</B> to create a backup file
            (.db) on your old computer.
          </li>
          <li>
            Copy the backup file (and your uploaded documents folder) to the new computer via USB
            drive, cloud storage, or any file transfer method.
          </li>
          <li>
            Install PocketChart on the new computer, then place the backup file in the data folder
            or use a cloud-synced folder that both machines can access.
          </li>
        </ul>

        <p className="font-medium text-[var(--color-text)] mt-3">Backup best practices</p>
        <ul className="list-disc list-inside space-y-1.5 ml-1">
          <li>
            <B>Back up regularly</B> — at least weekly, or after every session day. Use{' '}
            <B>Export Database</B> in Settings.
          </li>
          <li>
            Store backup copies in a <B>separate location</B> from your computer (external drive,
            cloud storage, etc.) so you are protected if your hard drive fails.
          </li>
          <li>
            For automatic off-site backup, set your PocketChart data folder to a cloud-synced
            location (Google Drive, OneDrive, or Dropbox). The data will sync automatically every
            time you use the app.
          </li>
        </ul>
      </>
    ),
  },

  /* 4 — Managing Clients ------------------------------------------ */
  {
    id: 'managing-clients',
    icon: <Users className="w-5 h-5 text-[var(--color-primary)]" />,
    title: 'Managing Clients',
    keywords: ['client', 'patient', 'add', 'edit', 'demographics', 'insurance', 'diagnosis', 'referring provider', 'status', 'active', 'discharged', 'hold', 'search'],
    content: (
      <ul className="list-disc list-inside space-y-1.5 ml-1">
        <li>
          Click <B>Add Client</B> on the Clients page to create a new record with demographics,
          diagnosis codes, insurance details, and referring provider information.
        </li>
        <li>
          Each client has a status: <B>Active</B>, <B>Discharged</B>, or <B>Hold</B>. Update the
          status from the client detail page as their care progresses.
        </li>
        <li>
          Use the search bar at the top of the Clients page to find clients by name. You can also
          filter the list by status or discipline.
        </li>
        <li>
          Click on any client row to open their detail page where you can view notes, evaluations,
          goals, appointments, and documents.
        </li>
        <li>
          On the client detail page, each overview card (<B>Demographics</B>, <B>Insurance</B>,{' '}
          <B>Diagnosis</B>, <B>Referring Provider</B>) is clickable — click any card to quickly
          edit that section's information.
        </li>
      </ul>
    ),
  },

  /* 4 — Client Documents ------------------------------------------ */
  {
    id: 'client-documents',
    icon: <FolderOpen className="w-5 h-5 text-[var(--color-primary)]" />,
    title: 'Client Documents',
    keywords: ['upload', 'file', 'pdf', 'image', 'document', 'attachment', 'intake', 'referral', 'prescription'],
    content: (
      <ul className="list-disc list-inside space-y-1.5 ml-1">
        <li>
          From a client's detail page, go to the <B>Documents</B> tab to upload and manage files
          such as referral letters, prescriptions, intake forms, and imaging reports.
        </li>
        <li>
          Supported file types include PDFs, images (PNG, JPG), and common document formats.
          Files are stored locally alongside your database.
        </li>
        <li>
          Each document can be assigned a <B>category</B> (e.g., Referral, Prescription, Intake
          Form, Other) to keep records organized.
        </li>
        <li>
          Click on any document to open it with your system's default viewer. Documents remain on
          disk even if the client record is deleted (soft delete) to comply with retention policies.
        </li>
      </ul>
    ),
  },

  /* 5 — Calendar & Appointments ----------------------------------- */
  {
    id: 'calendar-appointments',
    icon: <Calendar className="w-5 h-5 text-[var(--color-primary)]" />,
    title: 'Calendar & Appointments',
    keywords: ['schedule', 'appointment', 'drag', 'drop', 'day', 'week', 'month', 'view', 'session', 'reschedule', 'no-show', 'cancelled'],
    content: (
      <ul className="list-disc list-inside space-y-1.5 ml-1">
        <li>
          Open the <B>Calendar</B> page to see appointments in day, week, or month view. Switch
          views using the toggle at the top.
        </li>
        <li>
          Create a new appointment by clicking on a time slot or using the <B>Add Appointment</B>{' '}
          button. Select the client, date, time, and duration.
        </li>
        <li>
          Drag and drop appointments to reschedule them to a different time or day.
        </li>
        <li>
          Each appointment has a status: <B>Scheduled</B>, <B>Completed</B>, <B>Cancelled</B>, or{' '}
          <B>No-Show</B>. Mark the status after each session.
        </li>
        <li>
          The default session length can be changed in <B>Settings &gt; Session Defaults</B> (30,
          45, 50, or 60 minutes).
        </li>
      </ul>
    ),
  },

  /* 6 — Writing SOAP Notes ---------------------------------------- */
  {
    id: 'soap-notes',
    icon: <FileText className="w-5 h-5 text-[var(--color-primary)]" />,
    title: 'Writing SOAP Notes',
    keywords: ['note', 'soap', 'subjective', 'objective', 'assessment', 'plan', 'cpt', 'sign', 'draft', 'phrase', 'note bank'],
    content: (
      <ul className="list-disc list-inside space-y-1.5 ml-1">
        <li>
          To create a new note, go to a client's detail page and click <B>New SOAP Note</B>. You
          can also start a note directly from a completed appointment.
        </li>
        <li>
          Each note has four sections: <B>Subjective</B> (patient's reported symptoms and
          concerns), <B>Objective</B> (measurable findings and observations), <B>Assessment</B>{' '}
          (clinical interpretation of progress), and <B>Plan</B> (next steps and treatment plan).
        </li>
        <li>
          Add one or more <B>CPT codes</B> to each note for billing accuracy.
        </li>
        <li>
          As you type, PocketChart suggests phrases from the <B>Note Bank</B>. Click a suggestion
          to insert it, saving time on repetitive documentation. Favorite the phrases you use
          most so they appear first.
        </li>
        <li>
          When finished, click <B>Sign Note</B> to finalize. Signed notes are locked and cannot be
          edited, preserving a complete clinical record.
        </li>
        <li>
          You can save a note as a <B>draft</B> and return to it later before signing.
        </li>
      </ul>
    ),
  },

  /* 7 — Evaluations ----------------------------------------------- */
  {
    id: 'evaluations',
    icon: <ClipboardList className="w-5 h-5 text-[var(--color-primary)]" />,
    title: 'Evaluations',
    keywords: ['evaluation', 'initial', 're-evaluation', 'rom', 'mmt', 'balance', 'adl', 'fine motor', 'speech', 'sign'],
    content: (
      <ul className="list-disc list-inside space-y-1.5 ml-1">
        <li>
          Create an evaluation from a client's detail page by clicking <B>New Evaluation</B>.
          Evaluations are separate from SOAP notes and are used for initial and re-evaluation
          documentation.
        </li>
        <li>
          The evaluation form includes discipline-specific objective assessment fields (e.g., ROM,
          MMT, balance for PT; ADLs, fine motor for OT; speech fluency, language comprehension
          for ST).
        </li>
        <li>
          Fill in the relevant sections including history, prior level of function, objective
          measures, assessment, and plan of care.
        </li>
        <li>
          Once complete, click <B>Sign Evaluation</B> to finalize. Like notes, signed evaluations
          are locked to maintain documentation integrity.
        </li>
      </ul>
    ),
  },

  /* 8 — Goals ----------------------------------------------------- */
  {
    id: 'goals',
    icon: <Target className="w-5 h-5 text-[var(--color-primary)]" />,
    title: 'Goals',
    keywords: ['goal', 'stg', 'ltg', 'short-term', 'long-term', 'met', 'discontinued', 'in progress', 'target date', 'goals bank', 'template'],
    content: (
      <ul className="list-disc list-inside space-y-1.5 ml-1">
        <li>
          Add goals to a client from their detail page. Each goal is categorized as a{' '}
          <B>Short-Term Goal (STG)</B> or <B>Long-Term Goal (LTG)</B> with a target date.
        </li>
        <li>
          Use the <B>Goals Bank</B> page to browse and manage reusable goal templates organized by
          discipline and category (e.g., Articulation, Cognition, Mobility). Select a template to
          quickly populate a new goal.
        </li>
        <li>
          Track goal progress by updating the status: <B>In Progress</B>, <B>Met</B>,{' '}
          <B>Not Met</B>, or <B>Discontinued</B>.
        </li>
        <li>
          Goals are visible on the client detail page and can be referenced when writing SOAP
          notes to document progress toward each goal.
        </li>
        <li>
          Create your own custom goal templates in the Goals Bank for phrases you use often.
        </li>
      </ul>
    ),
  },

  /* 9 — Note Bank & Goals Bank ------------------------------------ */
  {
    id: 'documentation-banks',
    icon: <BookOpen className="w-5 h-5 text-[var(--color-primary)]" />,
    title: 'Note Bank & Goals Bank',
    keywords: ['note bank', 'goals bank', 'template', 'phrase', 'favorite', 'category', 'reusable', 'custom'],
    content: (
      <ul className="list-disc list-inside space-y-1.5 ml-1">
        <li>
          The <B>Note Bank</B> is a library of reusable SOAP phrases organized by discipline,
          section (Subjective, Objective, Assessment, Plan), and category. Use it to speed up note
          writing with consistent, professional language.
        </li>
        <li>
          Mark your most-used phrases as <B>Favorites</B> so they appear at the top of suggestions
          when writing notes.
        </li>
        <li>
          The <B>Goals Bank</B> stores reusable goal templates organized by discipline and category.
          Templates can be applied directly when adding goals to a client.
        </li>
        <li>
          Both banks come pre-loaded with common phrases and goals for PT, OT, and ST. You can add,
          edit, or delete entries to customize them for your practice.
        </li>
        <li>
          You can also manage the Note Bank and Goals Bank from <B>Settings &gt; Documentation
          Bank</B>.
        </li>
      </ul>
    ),
  },

  /* 10 — Settings & Data ------------------------------------------ */
  {
    id: 'settings-data',
    icon: <Settings className="w-5 h-5 text-[var(--color-primary)]" />,
    title: 'Settings & Data',
    keywords: ['settings', 'practice', 'npi', 'tax id', 'license', 'discipline', 'logo', 'signature', 'backup', 'export', 'csv', 'zip', 'data', 'storage', 'cloud', 'version'],
    content: (
      <>
        <p>
          Settings are organized into collapsible sections. Click any section header to expand or
          collapse it.
        </p>
        <ul className="list-disc list-inside space-y-1.5 ml-1">
          <li>
            <B>Practice Information</B> — Enter your practice name, address, and phone number.
            Upload a <B>practice logo</B> (PNG or JPG, recommended 300 x 100 px) that will appear
            on superbills and exported documents.
          </li>
          <li>
            <B>Provider Information</B> — Enter your NPI number, Tax ID, license number, and
            license state. These appear on superbills.
          </li>
          <li>
            <B>Discipline</B> — Select your discipline (PT, OT, ST, or Multi-Discipline). This
            filters the Note Bank, Goals Bank, and evaluation fields to show only relevant content.
          </li>
          <li>
            <B>Session Defaults</B> — Set your preferred default session length (30, 45, 50, or 60
            minutes). This pre-fills the duration when creating new appointments.
          </li>
          <li>
            <B>Signature</B> — Enter your name and credentials (e.g., "PT, DPT") and draw your
            signature. This pre-fills the signature block on notes and evaluations.
          </li>
          <li>
            <B>Data Storage</B> — All data is stored in a local database on your computer. You can
            change the storage location or place it in a cloud-synced folder for off-site backup.
          </li>
          <li>
            <B>Backup & Export</B> — Export a full database backup (.db file), export all clients as
            a spreadsheet (CSV), or export all client charts as a ZIP of PDFs. Back up regularly.
          </li>
        </ul>
      </>
    ),
  },

  /* 11 — Superbills ----------------------------------------------- */
  {
    id: 'superbills',
    icon: <Receipt className="w-5 h-5 text-[var(--color-primary)]" />,
    title: 'Superbills',
    keywords: ['superbill', 'billing', 'insurance', 'claim', 'reimbursement', 'pdf', 'cpt', 'npi', 'tax id', 'download'],
    content: (
      <ul className="list-disc list-inside space-y-1.5 ml-1">
        <li>
          A <B>superbill</B> is a summary document used to submit claims to insurance companies for
          reimbursement. PocketChart generates superbills as downloadable PDFs.
        </li>
        <li>
          To create a superbill, go to a client's detail page and click <B>Generate Superbill</B>.
          Select the date range for the billing period.
        </li>
        <li>
          PocketChart automatically pulls in your practice information (name, NPI, Tax ID) and the
          client's diagnosis and insurance details.
        </li>
        <li>
          Review the selected notes and session dates included in the superbill. You can add or
          remove individual sessions before generating the document.
        </li>
        <li>
          Click <B>Download PDF</B> to save the superbill. You can then print it or send it
          electronically to the insurance provider.
        </li>
      </ul>
    ),
  },
];

/* ------------------------------------------------------------------ */
/*  Main Help page component                                           */
/* ------------------------------------------------------------------ */

export default function HelpPage() {
  const [searchQuery, setSearchQuery] = useState('');

  /* ---- Filter sections based on search query ---- */
  const filteredSections = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return allSections;

    return allSections.filter((section) => {
      // search in title
      if (section.title.toLowerCase().includes(q)) return true;
      // search in keywords
      if (section.keywords.some((kw) => kw.toLowerCase().includes(q))) return true;
      // search in rendered text content — extract text from ReactNode
      const textContent = extractText(section.content).toLowerCase();
      return textContent.includes(q);
    });
  }, [searchQuery]);

  return (
    <div className="p-6 max-w-3xl mx-auto">
      {/* Page Header */}
      <div className="page-header">
        <div className="flex items-center gap-3">
          <HelpCircle className="w-7 h-7 text-[var(--color-primary)]" />
          <h1 className="page-title">Help & Instructions</h1>
        </div>
      </div>

      {/* Search Bar */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--color-text-secondary)]" />
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search help topics... (e.g. &quot;PIN&quot;, &quot;backup&quot;, &quot;superbill&quot;)"
          className="w-full pl-10 pr-4 py-2.5 rounded-lg border border-[var(--color-border)] bg-[var(--color-bg)] text-sm text-[var(--color-text)] placeholder-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-primary)]/30 focus:border-[var(--color-primary)] transition-all"
        />
        {searchQuery && (
          <button
            onClick={() => setSearchQuery('')}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
          >
            Clear
          </button>
        )}
      </div>

      {/* Search result count */}
      {searchQuery && (
        <p className="text-xs text-[var(--color-text-secondary)] mb-4">
          {filteredSections.length === 0
            ? 'No matching topics found. Try a different search term.'
            : `Showing ${filteredSections.length} of ${allSections.length} topics`}
        </p>
      )}

      {/* Help Sections */}
      {filteredSections.map((section) => (
        <HelpSection key={section.id} section={section} defaultOpen={!!searchQuery || undefined} />
      ))}

      {/* Updates info — not a collapsible section, just a small note */}
      <div className="card p-5 mb-4">
        <div className="flex items-center gap-2 mb-3">
          <Settings className="w-5 h-5 text-[var(--color-primary)]" />
          <h2 className="section-title mb-0">Updates</h2>
        </div>
        <div className="text-sm text-[var(--color-text-secondary)] space-y-2">
          <p>
            PocketChart checks for updates automatically when you launch the app. If an update is
            available, you will see a notification in the bottom-right corner of the screen.
          </p>
          <ul className="list-disc list-inside space-y-1.5 ml-1">
            <li>
              Click <B>Download Update</B> to begin downloading. You can continue working while it
              downloads.
            </li>
            <li>
              Once the download is complete, click <B>Restart Now</B> to apply the update, or choose
              "Later" and the update will be installed the next time you close and reopen PocketChart.
            </li>
            <li>
              Updates never affect your data. Your database and documents remain untouched.
            </li>
          </ul>
        </div>
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-[var(--color-text-secondary)] mt-8 pb-4">
        <p>PocketChart &mdash; Built for therapists, by therapists.</p>
        <p className="mt-1">
          Need more help? Reach out to us at{' '}
          <span className="text-[var(--color-primary)]">support@pocketchart.app</span>
        </p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Utility: recursively extract text from React nodes for searching   */
/* ------------------------------------------------------------------ */

function extractText(node: React.ReactNode): string {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(extractText).join(' ');
  if (React.isValidElement(node)) {
    const { children } = node.props as { children?: React.ReactNode };
    return extractText(children);
  }
  return '';
}
