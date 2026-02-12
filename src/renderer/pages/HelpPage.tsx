import React, { useState, useMemo } from 'react';
import { useSectionColor } from '../hooks/useSectionColor';
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
  DollarSign,
  Car,
  FileSpreadsheet,
  MessageSquare,
  Briefcase,
  CheckSquare,
  Scale,
  MessageCircle,
  Key,
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
          <B>PocketChart</B> is an offline-first clinical documentation app built for PT, OT, ST,
          and MFT therapists. All your data is stored locally on your computer — nothing is ever
          sent to an external server.
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

  /* 2 — Licensing & Device Limits ----------------------------------- */
  {
    id: 'licensing-devices',
    icon: <Key className="w-5 h-5 text-[var(--color-primary)]" />,
    title: 'Licensing & Device Limits',
    keywords: ['license', 'activation', 'device', 'limit', 'deactivate', 'key', 'pro', 'basic', 'subscription'],
    content: (
      <>
        <p>
          PocketChart requires a license key to unlock features. You can purchase a license
          from our website and activate it in <B>Settings → License & Activation</B>.
        </p>

        <p className="font-medium text-[var(--color-text)] mt-3">Device limits</p>
        <ul className="list-disc list-inside space-y-1.5 ml-1">
          <li>
            Your license key can be active on up to <B>2 devices</B> at a time (for example,
            your office computer and a laptop).
          </li>
          <li>
            To move PocketChart to a new device, go to <B>Settings → License → Deactivate
            This Device</B> on the old computer first. This frees up an activation slot
            for the new one.
          </li>
          <li>
            If you no longer have access to an old device (lost, broken, or replaced),
            contact <B>support@pocketchart.app</B> and we can reset your activation remotely.
          </li>
        </ul>

        <p className="font-medium text-[var(--color-text)] mt-3">Plan types</p>
        <ul className="list-disc list-inside space-y-1.5 ml-1">
          <li>
            <B>Basic</B> — Core documentation features: client management, clinical notes,
            evaluations, goals, calendar, and data export.
          </li>
          <li>
            <B>Pro</B> — Everything in Basic plus billing & invoices, contracted entities,
            compliance tracking, professional vault, mileage tracking, communication log,
            and year-end summary.
          </li>
        </ul>

        <p className="font-medium text-[var(--color-text)] mt-3">Uninstalling without deactivating</p>
        <p>
          If you uninstall PocketChart or replace your computer without deactivating first,
          the activation slot stays consumed. You can either: (a) reinstall PocketChart on
          the old machine and deactivate through Settings, or (b) email{' '}
          <B>support@pocketchart.app</B> and we will reset your activation remotely.
        </p>
      </>
    ),
  },

  /* 3 — Security & Privacy ---------------------------------------- */
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
            <B>Quick Lock</B> — Click the <B>PocketChart logo</B> in the sidebar (or press{' '}
            <B>Ctrl+L</B>) to instantly lock the app. The logo shows a lock icon on hover as
            a visual cue.
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
            <B>Database Encryption</B> — PocketChart encrypts your entire database using
            AES-256 encryption, protected by a passphrase that only you know. Your passphrase
            is never stored or transmitted — it is used to derive an encryption key locally on
            your device.
          </li>
          <li>
            <B>Recovery Key</B> — During setup, PocketChart generates a one-time recovery key.
            This is the <B>only way</B> to regain access to your data if you forget your
            passphrase. Store your recovery key in a secure location such as a fireproof safe,
            locked filing cabinet, or practice succession plan. PocketChart cannot recover your
            data without either your passphrase or recovery key.
          </li>
          <li>
            <B>Change Passphrase & Recovery Key</B> — You can change your encryption passphrase
            or generate a new recovery key at any time from <B>Settings &gt; Security</B>.
            Changing your passphrase does not require re-encrypting the entire database.
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
            <B>Passphrase & Recovery Key</B> — Choose a strong passphrase (12+ characters
            recommended) and store your recovery key securely. If you lose both your passphrase
            and recovery key, your data <B>cannot be recovered</B> by anyone — including
            PocketChart.
          </li>
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

        <p className="font-medium text-[var(--color-text)] mt-3">Cloud backup guidance:</p>
        <p>
          PocketChart stores all data on your computer and never sends clinical data to external
          servers. If you want to back up your data to a cloud service, you may choose to place
          your PocketChart data folder inside a cloud-synced directory. Before doing so:
        </p>
        <ul className="list-disc list-inside space-y-1.5 ml-1 mt-1.5">
          <li>
            Your cloud provider must support HIPAA compliance (Google Workspace, Dropbox Business,
            Microsoft 365 Business, or similar business-tier plans).
          </li>
          <li>
            You must sign a <B>Business Associate Agreement (BAA)</B> with your cloud provider
            through their admin console.
          </li>
          <li>
            Apple iCloud does <B>not</B> support BAAs and should not be used to store clinical data.
          </li>
          <li>
            Free-tier cloud accounts (personal Gmail, free Dropbox, etc.) cannot be HIPAA-compliant.
          </li>
          <li>
            PocketChart will detect cloud-synced folders and provide guidance, but ultimately
            compliance is your responsibility.
          </li>
        </ul>

        <p className="font-medium text-[var(--color-text)] mt-3">Export security note:</p>
        <p>
          When you export PDFs, superbills, CMS-1500 forms, or database backups, these files are
          saved outside the PocketChart database. If your data folder is synced to a cloud service,
          exported files will also be synced. Ensure any location where you save exports meets the
          same HIPAA compliance standards as your main data storage.
        </p>
      </>
    ),
  },

  /* 3 — Regulatory Compliance & Direct Access ---------------------- */
  {
    id: 'regulatory-compliance',
    icon: <Scale className="w-5 h-5 text-[var(--color-primary)]" />,
    title: 'Regulatory Compliance & Direct Access',
    keywords: ['direct access', 'referral', 'regulation', 'state law', 'practice act', 'physician', 'prescription', 'disclaimer', 'liability', 'compliance', 'payer', 'licensure'],
    content: (
      <>
        <p>
          PocketChart includes a <B>compliance engine</B> that checks your state's direct-access rules
          based on your discipline and practice state. When a referral may be required, PocketChart
          displays a prompt to help you stay on track.
        </p>

        <div className="mt-3 p-3 rounded-lg border border-amber-200 bg-amber-50/60">
          <p className="font-medium text-amber-800 text-sm mb-2">Important Disclaimer</p>
          <p className="text-amber-900 text-xs leading-relaxed">
            PocketChart's compliance prompts and direct-access rules are provided as
            <B> informational guidance only</B> and do not constitute legal advice. State practice
            acts, payer requirements, and direct-access regulations change frequently and vary by
            state, discipline, setting, and payer. <B>You are solely responsible</B> for verifying
            that your practice complies with all applicable state laws, licensure board requirements,
            payer contracts, and institutional policies. PocketChart makes no warranty that its
            built-in rules are current, complete, or applicable to your specific situation.
          </p>
        </div>

        <p className="font-medium text-[var(--color-text)] mt-3">What PocketChart does:</p>
        <ul className="list-disc list-inside space-y-1.5 ml-1">
          <li>
            <B>State-based referral prompts</B> — Based on your state and discipline, PocketChart
            alerts you when a physician referral or order may be required before initiating treatment.
          </li>
          <li>
            <B>Compliance tracking</B> — Track visit limits, progress report intervals, and
            recertification deadlines per client.
          </li>
          <li>
            <B>Physician order tracking</B> — Monitor whether a current physician order is on file
            and when it needs to be renewed.
          </li>
          <li>
            <B>Conservative defaults</B> — When PocketChart is unsure about a state's rules, it
            defaults to requiring a referral to err on the side of caution.
          </li>
        </ul>

        <p className="font-medium text-[var(--color-text)] mt-3">What you are responsible for:</p>
        <ul className="list-disc list-inside space-y-1.5 ml-1">
          <li>
            <B>Verifying state regulations</B> — Check your state's current practice act and any
            recent legislative changes that may affect direct-access rules.
          </li>
          <li>
            <B>Payer-specific requirements</B> — Some payers (e.g., Medicare, Medicaid, certain
            private insurers) have referral or authorization requirements that go beyond state law.
            These are your responsibility to follow.
          </li>
          <li>
            <B>Scope of practice</B> — Ensure you are practicing within the scope defined by your
            state licensure board and professional credentials.
          </li>
          <li>
            <B>Institutional policies</B> — If you work within a facility or agency, their policies
            may impose additional requirements beyond state and payer rules.
          </li>
          <li>
            <B>Consulting legal counsel</B> — For questions about specific regulatory situations,
            consult a healthcare attorney or your professional licensing board.
          </li>
        </ul>
      </>
    ),
  },

  /* 4 — Your Data: Backups, Uninstall & Reinstall ------------------ */
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
            Use <B>Settings &gt; Backup & Export &gt; Export Database</B> to create a .pcbackup file
            on your old computer. This contains your encrypted database and keystore.
          </li>
          <li>
            Copy the .pcbackup file to the new computer via USB drive, cloud storage, or any file
            transfer method.
          </li>
          <li>
            Install PocketChart on the new computer. On the welcome screen, choose{' '}
            <B>Restore from Backup</B>, select your .pcbackup file, and enter your passphrase.
          </li>
          <li>
            You can also restore from <B>Settings &gt; Backup & Export &gt; Restore Database from Backup</B>{' '}
            at any time after setup.
          </li>
        </ul>

        <p className="font-medium text-[var(--color-text)] mt-3">Importing specific clients</p>
        <ul className="list-disc list-inside space-y-1.5 ml-1">
          <li>
            Use <B>Settings &gt; Backup & Export &gt; Import Clients from Backup</B> to bring specific
            clients (and all their notes, evaluations, goals, appointments, and billing data) from a
            backup into your current database.
          </li>
          <li>
            This is useful if you need to merge data from two PocketChart databases — for example,
            receiving client records from a colleague.
          </li>
          <li>
            Imported clients are added as new records; they will not overwrite any existing clients.
          </li>
        </ul>

        <p className="font-medium text-[var(--color-text)] mt-3">What if I lose my computer?</p>
        <ul className="list-disc list-inside space-y-1.5 ml-1">
          <li>
            Install PocketChart on a new computer.
          </li>
          <li>
            On the welcome screen, choose <B>Restore from Backup</B>.
          </li>
          <li>
            Select your .pcbackup file and enter the passphrase that was active when the backup was created.
          </li>
          <li>
            A new recovery key will be generated — write it down and store it securely.
          </li>
        </ul>

        <div className="mt-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
          <p className="text-xs text-blue-800">
            <B>Single-device use:</B> PocketChart is designed to be used on one computer at a time.
            Do not copy the database file to a second computer and work on both simultaneously —
            this creates two divergent medical records that cannot be merged. If you need to switch
            computers, always export your database from the old machine first, then set up the new
            machine with that export.
          </p>
        </div>

        <p className="font-medium text-[var(--color-text)] mt-3">Backup best practices</p>
        <ul className="list-disc list-inside space-y-1.5 ml-1">
          <li>
            <B>Back up regularly</B> — at least weekly, or after every session day. Use{' '}
            <B>Export Database</B> in Settings. The .pcbackup format includes both your encrypted
            database and the keystore needed to restore it.
          </li>
          <li>
            Store backup copies in a <B>separate location</B> from your computer (external drive,
            cloud storage, etc.) so you are protected if your hard drive fails.
          </li>
          <li>
            <B>Remember your passphrase.</B> You need your passphrase to restore from a backup. If you
            forget it, your backup cannot be decrypted. Store your recovery key in a safe place as
            a last resort.
          </li>
          <li>
            If you choose to use a cloud-synced location for automatic off-site backup, your data
            will be transmitted to that provider's servers. Ensure you have a signed BAA and a
            business-tier account with the cloud provider before doing so. See the{' '}
            <B>Security, Privacy & Your Responsibilities</B> section above for details.
          </li>
        </ul>

        <p className="font-medium text-[var(--color-text)] mt-3">Solo practitioner continuity planning</p>
        <ul className="list-disc list-inside space-y-1.5 ml-1">
          <li>
            As a solo practitioner, your PocketChart database may be the <B>only copy</B> of
            your clients' clinical records. HIPAA requires that patients can access their records
            even if you are unable to practice.
          </li>
          <li>
            <B>Designate a trusted person</B> (spouse, attorney, or practice successor) who knows
            the location of your database backups and how to access them in an emergency.
          </li>
          <li>
            Keep a current database backup in a <B>secure location separate from your primary
            computer</B> — such as an encrypted USB drive in a safe, or a HIPAA-compliant
            cloud folder with BAA.
          </li>
          <li>
            Consider documenting your PocketChart data location and PIN in your professional
            estate plan or succession documents.
          </li>
          <li>
            Remember: anyone with your .pcbackup file <B>and your passphrase</B> can restore your data.
            The backup + passphrase <B>is</B> the continuity plan — keep both current and accessible
            to the right person.
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
      <div className="space-y-3">
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
        <p className="font-medium text-[var(--color-text)] mt-3">Payment Indicators on Calendar</p>
        <ul className="list-disc list-inside space-y-1.5 ml-1">
          <li>
            <B>Green $ circle</B> — Payment received (the linked invoice is marked as paid).
          </li>
          <li>
            <B>Hollow $ circle</B> — A note exists for the appointment but payment has not yet been
            received.
          </li>
          <li>
            <B>No indicator</B> — The appointment has not yet been completed or there is no linked
            note.
          </li>
        </ul>
      </div>
    ),
  },

  /* 6 — Writing SOAP Notes ---------------------------------------- */
  {
    id: 'soap-notes',
    icon: <FileText className="w-5 h-5 text-[var(--color-primary)]" />,
    title: 'Writing Clinical Notes',
    keywords: ['note', 'soap', 'dap', 'birp', 'subjective', 'objective', 'assessment', 'plan', 'data', 'intervention', 'response', 'behavior', 'cpt', 'sign', 'draft', 'phrase', 'note bank', 'format'],
    content: (
      <ul className="list-disc list-inside space-y-1.5 ml-1">
        <li>
          To create a new note, go to a client's detail page and click <B>New Note</B>. You
          can also start a note directly from a completed appointment.
        </li>
        <li>
          PocketChart supports three <B>note formats</B>: <B>SOAP</B> (Subjective, Objective,
          Assessment, Plan), <B>DAP</B> (Data, Assessment, Plan — common for MFT), and{' '}
          <B>BIRP</B> (Behavior, Intervention, Response, Plan). Choose your preferred format in{' '}
          <B>Settings &gt; Note Format</B>.
        </li>
        <li>
          The default format is based on your discipline (SOAP for PT/OT/ST, DAP for MFT), but you
          can change it at any time. All formats map to the same underlying data so switching
          formats does not affect existing notes.
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
          for ST; presenting problem, mental status, risk assessment, relationship dynamics for MFT).
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
          Both banks come pre-loaded with common phrases and goals for PT, OT, ST, and MFT. You can
          add, edit, or delete entries to customize them for your practice.
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
            <B>Discipline</B> — Select your discipline (PT, OT, ST, MFT, or Multi-Discipline). This
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

  /* 12 — Notes Overview --------------------------------------------- */
  {
    id: 'notes-overview',
    icon: <FileText className="w-5 h-5 text-[var(--color-primary)]" />,
    title: 'Notes Overview',
    keywords: ['notes', 'overview', 'drafts', 'overdue', 'unsigned', 'missing', 'due'],
    content: (
      <div className="space-y-3">
        <p>
          The <B>Notes Overview</B> page gives you a bird's-eye view of all notes across every
          client in one centralized location.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <B>Tab views</B> — Switch between <B>Due</B>, <B>Drafts</B>, <B>Overdue</B>, and{' '}
            <B>All</B> tabs to quickly focus on the notes that need your attention.
          </li>
          <li>
            <B>Missing notes</B> — Completed appointments that do not yet have a linked note are
            surfaced automatically so nothing slips through the cracks.
          </li>
          <li>
            <B>Search & filter</B> — Use the search bar to filter notes by client name, date, or
            keywords.
          </li>
          <li>
            <B>Invoice status badges</B> — Each note displays a badge indicating whether an invoice
            has been created, is outstanding, or has been paid.
          </li>
        </ul>
      </div>
    ),
  },

  /* 13 — Billing & Invoices (Pro) ----------------------------------- */
  {
    id: 'billing-invoices',
    icon: <DollarSign className="w-5 h-5 text-[var(--color-primary)]" />,
    title: 'Billing & Invoices',
    keywords: ['billing', 'invoice', 'payment', 'stripe', 'fee schedule', 'charge', 'receipt', 'outstanding'],
    content: (
      <div className="space-y-3">
        <p className="text-xs text-purple-600 font-medium mb-2">This feature is available in PocketChart Pro.</p>
        <p>
          The <B>Billing & Invoices</B> module lets you manage your entire invoicing workflow
          without leaving PocketChart.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <B>Dashboard summary</B> — See total outstanding, paid this month, and overdue invoices
            at a glance from the billing dashboard.
          </li>
          <li>
            <B>Fee schedule</B> — Define your standard rates per CPT code in <B>Settings &gt; Fee
            Schedule</B>. These rates auto-populate when creating invoices.
          </li>
          <li>
            <B>Create invoices from notes</B> — Generate an invoice directly from a signed note.
            CPT codes, units, and rates are pulled in automatically.
          </li>
          <li>
            <B>Invoice statuses</B> — Track each invoice as <B>Draft</B>, <B>Sent</B>,{' '}
            <B>Outstanding</B>, <B>Paid</B>, or <B>Void</B>.
          </li>
          <li>
            <B>Stripe integration</B> — Connect your Stripe account to accept online payments.
            Invoices are updated automatically when a payment is received.
          </li>
          <li>
            <B>Record payments</B> — Manually record cash, check, or other payment types against an
            invoice.
          </li>
          <li>
            <B>PDF generation</B> — Download a professional PDF invoice to send to clients or
            insurance companies.
          </li>
        </ul>
      </div>
    ),
  },

  /* 14 — Contracted Entities (Pro) ---------------------------------- */
  {
    id: 'contracted-entities',
    icon: <Briefcase className="w-5 h-5 text-[var(--color-primary)]" />,
    title: 'Contracted Entities',
    keywords: ['contractor', 'entity', 'agency', 'home health', 'hospice', 'contract', 'batch invoice'],
    content: (
      <div className="space-y-3">
        <p className="text-xs text-purple-600 font-medium mb-2">This feature is available in PocketChart Pro.</p>
        <p>
          <B>Contracted Entities</B> lets you manage the companies and agencies you contract with
          (e.g., home health agencies, hospice providers, skilled nursing facilities).
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <B>Add contracted companies</B> — Store contact information, contract details, and notes
            for each entity you work with.
          </li>
          <li>
            <B>Per-entity fee schedules</B> — Set custom rates for each contracted entity that
            override your default fee schedule.
          </li>
          <li>
            <B>Per-entity documents</B> — Upload and manage contracts, agreements, and other
            documents specific to each entity.
          </li>
          <li>
            <B>Contracted visit notes</B> — Link notes and appointments to a contracted entity so
            you can track work performed for each company.
          </li>
          <li>
            <B>Rate auto-population</B> — When creating an invoice for a contracted visit, the
            entity's custom rates are used automatically.
          </li>
          <li>
            <B>Calendar purple coding</B> — Appointments linked to a contracted entity appear in
            purple on the calendar for easy visual identification.
          </li>
          <li>
            <B>Batch invoicing</B> — Generate a single invoice covering multiple visits for a
            contracted entity over a date range.
          </li>
        </ul>
      </div>
    ),
  },

  /* 15 — Professional Vault (Pro) ----------------------------------- */
  {
    id: 'professional-vault',
    icon: <Shield className="w-5 h-5 text-[var(--color-primary)]" />,
    title: 'Professional Vault',
    keywords: ['vault', 'credential', 'license', 'certification', 'expiration', 'credentialing', 'packet', 'baa'],
    content: (
      <div className="space-y-3">
        <p className="text-xs text-purple-600 font-medium mb-2">This feature is available in PocketChart Pro.</p>
        <p>
          The <B>Professional Vault</B> is your central repository for licenses, certifications,
          insurance policies, and other professional documents.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <B>Central document repository</B> — Store all your professional documents in one
            organized location with categories and labels.
          </li>
          <li>
            <B>Predefined types</B> — Choose from common document types such as State License, NPI
            Confirmation, CPR Certification, Liability Insurance, and more.
          </li>
          <li>
            <B>Expiration tracking</B> — Set expiration dates on credentials and receive alerts as
            renewal deadlines approach.
          </li>
          <li>
            <B>Color-coded alerts</B> — Documents are color-coded by status: green for current,
            yellow for expiring soon, and red for expired.
          </li>
          <li>
            <B>Credentialing packet export</B> — Export a complete credentialing packet as a single
            PDF containing all your selected professional documents.
          </li>
          <li>
            <B>Cloud Storage & BAA</B> — If you use a cloud-synced data folder, PocketChart provides
            guidance on obtaining a Business Associate Agreement (BAA) from your cloud provider for
            HIPAA compliance.
          </li>
        </ul>
      </div>
    ),
  },

  /* 16 — Compliance Tracking (Pro) ---------------------------------- */
  {
    id: 'compliance-tracking',
    icon: <CheckSquare className="w-5 h-5 text-[var(--color-primary)]" />,
    title: 'Compliance Tracking',
    keywords: ['compliance', 'medicare', 'progress report', 'recertification', 'authorization', 'visits', 'threshold'],
    content: (
      <div className="space-y-3">
        <p className="text-xs text-purple-600 font-medium mb-2">This feature is available in PocketChart Pro.</p>
        <p>
          <B>Compliance Tracking</B> helps you stay on top of visit limits, recertification
          deadlines, and documentation requirements for each client.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <B>Per-client compliance settings</B> — Configure compliance rules individually for each
            client based on their payer requirements.
          </li>
          <li>
            <B>Medicare presets</B> — Apply standard Medicare compliance rules with one click,
            including progress report intervals and recertification periods.
          </li>
          <li>
            <B>Visit counter</B> — Track the number of visits completed against authorized or
            expected totals for each certification period.
          </li>
          <li>
            <B>Progress report alerts</B> — Receive reminders when a progress report is due based on
            visit count or time interval thresholds.
          </li>
          <li>
            <B>Recertification tracking</B> — Track certification period start and end dates with
            alerts as the recertification deadline approaches.
          </li>
          <li>
            <B>Physician order tracking</B> — Monitor whether current physician orders are on file
            and when they need to be renewed.
          </li>
          <li>
            <B>Authorization tracking</B> — Track insurance authorizations including authorized visit
            counts, date ranges, and remaining visits.
          </li>
        </ul>

        <div className="mt-3 p-3 bg-amber-50 rounded-lg border border-amber-200">
          <p className="text-xs text-amber-800">
            <B>Important:</B> PocketChart ships with Medicare compliance thresholds current as of
            February 2026 (progress reports every 10 visits or 30 days; recertification every 90 days).
            CMS may update these requirements at any time. You can adjust thresholds per client in
            their compliance settings. Verify current CMS requirements at{' '}
            <button
              className="text-amber-700 underline hover:text-amber-900"
              onClick={() => window.api.shell.openExternal('https://www.cms.gov/Medicare/Billing/TherapyServices')}
            >
              cms.gov/Medicare/Billing/TherapyServices
            </button>{' '}
            and update your settings if needed.
          </p>
        </div>
      </div>
    ),
  },

  /* 17 — Mileage Tracking (Pro) ------------------------------------- */
  {
    id: 'mileage-tracking',
    icon: <Car className="w-5 h-5 text-[var(--color-primary)]" />,
    title: 'Mileage Tracking',
    keywords: ['mileage', 'miles', 'drive', 'travel', 'reimbursement', 'irs', 'deductible', 'tax'],
    content: (
      <div className="space-y-3">
        <p className="text-xs text-purple-600 font-medium mb-2">This feature is available in PocketChart Pro.</p>
        <p>
          <B>Mileage Tracking</B> records your travel for client visits so you can claim
          reimbursements or tax deductions accurately.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <B>Calendar view</B> — View your logged trips on a monthly calendar alongside your
            appointments.
          </li>
          <li>
            <B>Adding trips</B> — Log a trip by entering the origin, destination, and miles driven.
            Trips can be linked to a specific appointment.
          </li>
          <li>
            <B>Reimbursable vs. non-reimbursable</B> — Categorize each trip as reimbursable (paid
            back by an entity) or non-reimbursable (personal tax deduction).
          </li>
          <li>
            <B>Monthly summary</B> — See total miles, total reimbursable miles, and estimated
            deduction amount based on the current IRS mileage rate.
          </li>
          <li>
            <B>CSV export</B> — Export your mileage log as a CSV file for tax preparation or
            submission to a contracted entity.
          </li>
          <li>
            <B>Entity linking</B> — Associate trips with a contracted entity for per-entity mileage
            reporting and reimbursement tracking.
          </li>
        </ul>
      </div>
    ),
  },

  /* 18 — Year-End Summary (Pro) ------------------------------------- */
  {
    id: 'year-end-summary',
    icon: <FileSpreadsheet className="w-5 h-5 text-[var(--color-primary)]" />,
    title: 'Year-End Summary',
    keywords: ['year end', 'tax', 'summary', 'revenue', 'annual', 'report', 'csv', 'pdf'],
    content: (
      <div className="space-y-3">
        <p className="text-xs text-purple-600 font-medium mb-2">This feature is available in PocketChart Pro.</p>
        <p>
          The <B>Year-End Summary</B> compiles your annual practice data into a comprehensive report
          for tax preparation and business review.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <B>Revenue breakdown by entity</B> — See total revenue earned from each contracted
            entity and from private-pay clients.
          </li>
          <li>
            <B>Mileage summary</B> — View total miles driven for the year, broken down by
            reimbursable and deductible categories.
          </li>
          <li>
            <B>Visits by entity</B> — Review the total number of visits completed for each entity
            and overall for the year.
          </li>
          <li>
            <B>CSV / PDF export</B> — Export the year-end summary as a CSV spreadsheet or a
            formatted PDF report for your records or accountant.
          </li>
          <li>
            <B>Historical year selection</B> — Generate summaries for any previous year, not just the
            current one, to review past performance.
          </li>
        </ul>
      </div>
    ),
  },

  /* 19 — Communication Log (Pro) ------------------------------------ */
  {
    id: 'communication-log',
    icon: <MessageSquare className="w-5 h-5 text-[var(--color-primary)]" />,
    title: 'Communication Log',
    keywords: ['communication', 'phone', 'email', 'fax', 'call', 'message', 'log', 'contact'],
    content: (
      <div className="space-y-3">
        <p className="text-xs text-purple-600 font-medium mb-2">This feature is available in PocketChart Pro.</p>
        <p>
          The <B>Communication Log</B> provides a timestamped record of all communications related
          to a client's care. This is not a messaging tool — it is a documentation log for liability
          and compliance purposes.
        </p>
        <ul className="list-disc pl-5 space-y-1">
          <li>
            <B>Per-client log</B> — Each client has their own communication log accessible from
            their detail page.
          </li>
          <li>
            <B>Communication types</B> — Log entries as <B>Phone</B>, <B>Email</B>, <B>Fax</B>,{' '}
            <B>In-Person</B>, or <B>Other</B> to categorize the method of communication.
          </li>
          <li>
            <B>Direction</B> — Mark each entry as <B>Incoming</B> or <B>Outgoing</B> to track who
            initiated the communication.
          </li>
          <li>
            <B>Contact name</B> — Record who you communicated with (e.g., physician, case manager,
            family member, insurance representative).
          </li>
          <li>
            <B>Liability documentation</B> — Maintain a defensible record of all clinical
            communications including date, time, participants, and a summary of what was discussed.
          </li>
        </ul>
      </div>
    ),
  },

  /* 20 — Getting Help & Support Scope -------------------------------- */
  {
    id: 'support-scope',
    icon: <MessageCircle className="w-5 h-5 text-[var(--color-primary)]" />,
    title: 'Getting Help & Support Scope',
    keywords: ['support', 'help', 'contact', 'email', 'question', 'compliance', 'legal', 'advice'],
    content: (
      <div className="space-y-3">
        <p>
          For technical support, feature questions, or bug reports, email{' '}
          <button
            className="text-[var(--color-primary)] underline hover:opacity-80"
            onClick={() => window.api.shell.openExternal('mailto:support@pocketchart.app')}
          >
            support@pocketchart.app
          </button>.
        </p>
        <div className="p-3 bg-red-50 rounded-lg border border-red-200">
          <p className="text-xs text-red-800">
            <B>Protect patient privacy:</B> When contacting support, please do not include patient
            names, dates of birth, diagnosis codes, or other Protected Health Information (PHI) in
            your message. If you need to share a screenshot, please blur or redact any
            patient-identifying information before sending.
          </p>
        </div>
        <div className="p-3 bg-amber-50 rounded-lg border border-amber-200">
          <p className="text-xs text-amber-800">
            <B>Please note:</B> PocketChart support can help with how the software works — installation,
            features, billing, and troubleshooting. We <B>cannot</B> provide guidance on clinical
            documentation practices, Medicare/Medicaid compliance questions, state regulatory
            requirements, HIPAA compliance for your practice, or legal advice of any kind. For these
            questions, please consult your compliance officer, licensing board, professional association,
            or legal counsel.
          </p>
        </div>
      </div>
    ),
  },
];

/* ------------------------------------------------------------------ */
/*  Main Help page component                                           */
/* ------------------------------------------------------------------ */

export default function HelpPage() {
  const sectionColor = useSectionColor();
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
          <HelpCircle className="w-7 h-7" style={{ color: sectionColor.color }} />
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
