import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Building2, Plus, Trash2, DollarSign, FileText, FolderOpen,
  Upload, Eye, Edit, Phone, Mail, MapPin, Calendar, CheckSquare, Square,
  FileCheck, RefreshCw, Receipt, ChevronDown, ChevronRight, Download, Send,
  UserPlus, Pencil,
} from 'lucide-react';
import type { ContractedEntity, EntityFeeSchedule, EntityDocument, EntityDocumentCategory, Appointment, Invoice, InvoiceItem, InvoiceStatus, ContractorPatient } from '@shared/types';
import EntityFormModal from '../components/EntityFormModal';
import AppointmentModal from '../components/AppointmentModal';
import ContractorPatientEditModal from '../components/ContractorPatientEditModal';
import { useSectionColor } from '../hooks/useSectionColor';

type Tab = 'overview' | 'appointments' | 'invoices';

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

const BILLING_CYCLE_LABELS: Record<string, string> = {
  weekly: 'Weekly', biweekly: 'Bi-weekly', monthly: 'Monthly', custom: 'Custom',
};

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft:    { bg: 'bg-gray-100',    text: 'text-gray-700' },
  sent:     { bg: 'bg-blue-100',    text: 'text-blue-700' },
  paid:     { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  partial:  { bg: 'bg-amber-100',   text: 'text-amber-700' },
  void:     { bg: 'bg-red-100',     text: 'text-red-700' },
  overdue:  { bg: 'bg-red-100',     text: 'text-red-700' },
};

const EntityDetailPage: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const sectionColor = useSectionColor();
  const entityId = Number(id);

  const [entity, setEntity] = useState<ContractedEntity | null>(null);
  const [tab, setTab] = useState<Tab>('overview');
  const [loading, setLoading] = useState(true);
  const [editModalOpen, setEditModalOpen] = useState(false);

  // Fee schedule state
  const [feeSchedule, setFeeSchedule] = useState<EntityFeeSchedule[]>([]);
  const [showFeeForm, setShowFeeForm] = useState(false);
  const [feeServiceType, setFeeServiceType] = useState('');
  const [feeCptCode, setFeeCptCode] = useState('');
  const [feeDescription, setFeeDescription] = useState('');
  const [feeRate, setFeeRate] = useState('');
  const [feeUnit, setFeeUnit] = useState('per_visit');

  // Documents state
  const [documents, setDocuments] = useState<EntityDocument[]>([]);

  // Appointments tab state
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [apptLoading, setApptLoading] = useState(false);
  const [contractorPatients, setContractorPatients] = useState<ContractorPatient[]>([]);
  const [selectedApptIds, setSelectedApptIds] = useState<Set<number>>(new Set());
  const [apptFilter, setApptFilter] = useState<'unbilled' | 'all' | 'invoiced'>('unbilled');
  const [generatingInvoice, setGeneratingInvoice] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [toast, setToast] = useState<string | null>(null);

  // Edit-appointment modal state — clicking a row in the appointments table opens this
  // so the user can fix patient/date/time/modality/rate without bouncing to the calendar.
  const [editingAppt, setEditingAppt] = useState<Appointment | null>(null);

  // Invoices tab state
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoicesLoading, setInvoicesLoading] = useState(false);
  const [editingInvoice, setEditingInvoice] = useState<Invoice | null>(null);
  const [editInvoiceStatus, setEditInvoiceStatus] = useState('');
  const [editInvoiceDate, setEditInvoiceDate] = useState('');
  const [editInvoiceDue, setEditInvoiceDue] = useState('');
  const [editInvoiceNotes, setEditInvoiceNotes] = useState('');
  const [editInvoiceItems, setEditInvoiceItems] = useState<(InvoiceItem & { _kept: boolean })[]>([]);
  const [deletingInvoiceId, setDeletingInvoiceId] = useState<number | null>(null);
  const [invoiceSaving, setInvoiceSaving] = useState(false);
  const [statusUpdatingId, setStatusUpdatingId] = useState<number | null>(null);

  // Email-invoice dialog state
  const [emailingInvoice, setEmailingInvoice] = useState<Invoice | null>(null);
  const [emailPrep, setEmailPrep] = useState<{
    emailConfigured: boolean; fromAddress: string; filename: string;
    alreadyEmailedAt: string | null; alreadyEmailedTo: string | null;
  } | null>(null);
  const [emailTo, setEmailTo] = useState('');
  const [emailSubject, setEmailSubject] = useState('');
  const [emailBody, setEmailBody] = useState('');
  const [emailLoading, setEmailLoading] = useState(false);
  const [emailSending, setEmailSending] = useState(false);

  // Overview pipeline stats (all appts, loaded on mount)
  const [overviewAppts, setOverviewAppts] = useState<Appointment[]>([]);
  const [overviewMonth, setOverviewMonth] = useState<string>(() => new Date().toISOString().slice(0, 7)); // 'YYYY-MM'
  const [showScheduledList, setShowScheduledList] = useState(true);
  const [showCompletedList, setShowCompletedList] = useState(true);

  // Modal state
  const [showFeeModal, setShowFeeModal] = useState(false);
  const [showDocsModal, setShowDocsModal] = useState(false);
  const [editingPatient, setEditingPatient] = useState<ContractorPatient | null>(null);

  const loadEntity = useCallback(async () => {
    setLoading(true);
    try {
      const data = await window.api.contractedEntities.get(entityId);
      setEntity(data);
    } catch (err) {
      console.error('Failed to load entity:', err);
    } finally {
      setLoading(false);
    }
  }, [entityId]);

  const loadFeeSchedule = useCallback(async () => {
    try {
      const data = await window.api.contractedEntities.listFeeSchedule(entityId);
      setFeeSchedule(data);
    } catch (err) {
      console.error('Failed to load fee schedule:', err);
    }
  }, [entityId]);

  const loadDocuments = useCallback(async () => {
    try {
      const data = await window.api.entityDocuments.list(entityId);
      setDocuments(data);
    } catch (err) {
      console.error('Failed to load documents:', err);
    }
  }, [entityId]);

  const loadAppointments = useCallback(async () => {
    setApptLoading(true);
    try {
      const filterArg =
        apptFilter === 'unbilled' ? { invoiced: false } :
        apptFilter === 'invoiced' ? { invoiced: true } :
        undefined;
      const data = await window.api.contractedEntities.listAppointments(entityId, filterArg);
      setAppointments(data);
      setSelectedApptIds(new Set());
    } catch (err) {
      console.error('Failed to load appointments:', err);
    } finally {
      setApptLoading(false);
    }
  }, [entityId, apptFilter]);

  const loadContractorPatients = useCallback(async () => {
    try {
      const data = await window.api.contractorPatients.list(entityId);
      setContractorPatients(data || []);
    } catch {
      setContractorPatients([]);
    }
  }, [entityId]);

  const loadInvoices = useCallback(async () => {
    setInvoicesLoading(true);
    try {
      const data = await window.api.invoices.list({ entityId });
      setInvoices(data);
    } catch (err) {
      console.error('Failed to load invoices:', err);
    } finally {
      setInvoicesLoading(false);
    }
  }, [entityId]);

  const loadOverviewAppts = useCallback(async () => {
    try {
      const data = await window.api.contractedEntities.listAppointments(entityId);
      setOverviewAppts(data);
    } catch { /* non-critical */ }
  }, [entityId]);

  const handleQuickStatusChange = useCallback(async (appt: Appointment, newStatus: 'scheduled' | 'completed') => {
    try {
      await window.api.appointments.update(appt.id, { ...appt, status: newStatus });
      setOverviewAppts(prev => prev.map(a => a.id === appt.id ? { ...a, status: newStatus } : a));
    } catch (err) { console.error('Status update failed:', err); }
  }, []);

  useEffect(() => {
    loadEntity();
    loadFeeSchedule();
    loadDocuments();
    loadOverviewAppts();
  }, [loadEntity, loadFeeSchedule, loadDocuments, loadOverviewAppts]);

  useEffect(() => {
    if (tab === 'appointments') {
      loadAppointments();
      loadContractorPatients();
    }
  }, [tab, loadAppointments, loadContractorPatients]);

  useEffect(() => {
    if (tab === 'invoices') loadInvoices();
  }, [tab, loadInvoices]);

  useEffect(() => {
    if (toast) {
      const t = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(t);
    }
  }, [toast]);

  const handleAddFeeEntry = async () => {
    if (!feeServiceType.trim() || !feeRate) return;
    try {
      await window.api.contractedEntities.createFeeScheduleEntry({
        entity_id: entityId,
        service_type: feeServiceType.trim(),
        cpt_code: feeCptCode.trim(),
        description: feeDescription.trim(),
        default_rate: parseFloat(feeRate),
        unit: feeUnit,
      } as any);
      setFeeServiceType(''); setFeeCptCode(''); setFeeDescription(''); setFeeRate(''); setFeeUnit('per_visit');
      setShowFeeForm(false);
      loadFeeSchedule();
    } catch (err) {
      console.error('Failed to add fee entry:', err);
    }
  };

  const handleDeleteFeeEntry = async (feeId: number) => {
    try {
      await window.api.contractedEntities.deleteFeeScheduleEntry(feeId);
      loadFeeSchedule();
    } catch (err) {
      console.error('Failed to delete fee entry:', err);
    }
  };

  const handleUploadDocument = async (category?: EntityDocumentCategory) => {
    try {
      await window.api.entityDocuments.upload({ entityId, category });
      loadDocuments();
    } catch (err) {
      console.error('Failed to upload document:', err);
    }
  };

  const handleOpenDocument = async (docId: number) => {
    try { await window.api.entityDocuments.open(docId); } catch (err) { console.error(err); }
  };

  const handleDeleteDocument = async (docId: number) => {
    try { await window.api.entityDocuments.delete(docId); loadDocuments(); } catch (err) { console.error(err); }
  };

  const handleDeleteEntity = async () => {
    if (!entity) return;
    const confirmed = window.confirm(`Are you sure you want to delete "${entity.name}"? This will archive the entity.`);
    if (!confirmed) return;
    try {
      await window.api.contractedEntities.delete(entityId);
      navigate('/entities');
    } catch (err) {
      console.error('Failed to delete entity:', err);
    }
  };

  const toggleAppt = (apptId: number) => {
    setSelectedApptIds((prev) => {
      const next = new Set(prev);
      if (next.has(apptId)) next.delete(apptId); else next.add(apptId);
      return next;
    });
  };

  const toggleAllAppts = () => {
    const uninvoiced = appointments.filter((a) => !a.contract_invoice_id);
    if (selectedApptIds.size === uninvoiced.length) {
      setSelectedApptIds(new Set());
    } else {
      setSelectedApptIds(new Set(uninvoiced.map((a) => a.id)));
    }
  };

  const handleDownloadInvoice = async (invoiceId: number) => {
    try {
      const { base64Pdf, filename } = await window.api.invoices.generatePdf(invoiceId);
      await window.api.invoices.savePdf({ base64Pdf, filename });
    } catch (err) {
      console.error('Failed to generate invoice PDF:', err);
    }
  };

  const handleDownloadNote = async (noteId: number) => {
    try {
      const { base64Pdf, filename } = await window.api.notes.generatePdf(noteId);
      await window.api.notes.savePdf({ base64Pdf, filename });
    } catch (err: any) {
      console.error('Failed to generate note PDF:', err);
      setToast(err?.message || 'Failed to download note PDF');
    }
  };

  // Build a packet of all signed notes for the selected appointments.
  // Requires all selected notes to belong to the same patient (the backend enforces this);
  // for entity work the natural use case is "give me everything for kid X" so we group by
  // contractor_patient_id and bail with a clear message if the selection spans patients.
  const handleDownloadNotesPacket = async () => {
    const selected = appointments.filter(a => selectedApptIds.has(a.id) && a.note_id);
    if (selected.length === 0) {
      setToast('Selected appointments have no notes attached');
      return;
    }
    const patientKeys = new Set(selected.map(a => `${(a as any).contractor_patient_id || ''}|${a.client_id || ''}`));
    if (patientKeys.size > 1) {
      setToast('Bulk PDF only works for one patient at a time — narrow your selection');
      return;
    }
    try {
      const noteIds = selected.map(a => a.note_id as number);
      const { base64Pdf, filename } = await window.api.notes.generateBulkPdf(noteIds);
      await window.api.notes.savePdf({ base64Pdf, filename });
    } catch (err: any) {
      console.error('Failed to generate notes packet:', err);
      setToast(err?.message || 'Failed to download notes packet');
    }
  };

  const openEditInvoice = async (inv: Invoice) => {
    setEditingInvoice(inv);
    setEditInvoiceStatus(inv.status);
    setEditInvoiceDate(inv.invoice_date || '');
    setEditInvoiceDue((inv as any).due_date || '');
    setEditInvoiceNotes((inv as any).notes || '');
    try {
      const full = await window.api.invoices.get(inv.id);
      setEditInvoiceItems((full.items || []).map((it) => ({ ...it, _kept: true })));
    } catch (err) {
      console.error('Failed to load invoice items:', err);
      setEditInvoiceItems([]);
    }
  };

  const handleEditItemChange = (itemId: number, field: 'service_date' | 'amount' | '_kept', value: any) => {
    setEditInvoiceItems((prev) => prev.map((it) => {
      if (it.id !== itemId) return it;
      if (field === 'amount') {
        const amount = typeof value === 'number' ? value : parseFloat(value) || 0;
        return { ...it, amount, unit_price: amount, units: 1 };
      }
      return { ...it, [field]: value };
    }));
  };

  const editInvoiceSubtotal = editInvoiceItems
    .filter((it) => it._kept)
    .reduce((s, it) => s + (it.amount || 0), 0);

  const handleSaveInvoice = async () => {
    if (!editingInvoice) return;
    setInvoiceSaving(true);
    try {
      // 1) Replace items first (updates appt links + recomputes totals)
      const itemsPayload = editInvoiceItems
        .filter((it) => it._kept)
        .map((it) => ({
          appointment_id: it.appointment_id ?? null,
          description: it.description,
          service_date: it.service_date,
          units: it.units ?? 1,
          unit_price: it.unit_price ?? it.amount ?? 0,
          amount: it.amount ?? 0,
        }));
      await window.api.invoices.replaceItems(editingInvoice.id, itemsPayload);

      // 2) Update invoice fields (status, dates, notes). Don't pass totals — replaceItems set them.
      await window.api.invoices.update(editingInvoice.id, {
        status: editInvoiceStatus as any,
        invoice_date: editInvoiceDate,
        due_date: editInvoiceDue,
        notes: editInvoiceNotes,
      });
      setEditingInvoice(null);
      loadInvoices();
      loadAppointments();
    } catch (err) {
      console.error('Failed to update invoice:', err);
    } finally {
      setInvoiceSaving(false);
    }
  };

  const handleInlineStatusChange = async (inv: Invoice, newStatus: InvoiceStatus) => {
    if (newStatus === inv.status) return;
    setStatusUpdatingId(inv.id);
    try {
      await window.api.invoices.update(inv.id, { status: newStatus });
      setInvoices((prev) => prev.map((i) => i.id === inv.id ? { ...i, status: newStatus } : i));
      setToast(`Invoice ${inv.invoice_number} → ${newStatus}`);
    } catch (err: any) {
      setToast(err?.message || 'Failed to update status');
    } finally {
      setStatusUpdatingId(null);
    }
  };

  const handleFinalizeInvoice = async (inv: Invoice) => {
    try {
      await window.api.invoices.update(inv.id, { ...inv, status: 'sent' });
      setToast(`Invoice ${inv.invoice_number} finalized`);
      loadInvoices();
    } catch (err: any) {
      setToast(err?.message || 'Failed to finalize invoice');
    }
  };

  // Open the email dialog: ask the backend to merge the template with this invoice's
  // fields and prefill the recipient (entity billing contact), subject, and body.
  const openEmailInvoice = async (inv: Invoice) => {
    setEmailingInvoice(inv);
    setEmailPrep(null);
    setEmailTo('');
    setEmailSubject('');
    setEmailBody('');
    setEmailLoading(true);
    try {
      const prep = await window.api.invoices.prepareEmail(inv.id);
      setEmailPrep({
        emailConfigured: prep.emailConfigured,
        fromAddress: prep.fromAddress,
        filename: prep.filename,
        alreadyEmailedAt: prep.alreadyEmailedAt,
        alreadyEmailedTo: prep.alreadyEmailedTo,
      });
      setEmailTo(prep.to || '');
      setEmailSubject(prep.subject || '');
      setEmailBody(prep.bodyText || '');
    } catch (err: any) {
      setToast(err?.message || 'Failed to prepare invoice email');
      setEmailingInvoice(null);
    } finally {
      setEmailLoading(false);
    }
  };

  const handleSendInvoiceEmail = async () => {
    if (!emailingInvoice) return;
    const to = emailTo.trim();
    if (!to) { setToast('Enter a recipient email address'); return; }
    setEmailSending(true);
    try {
      const res = await window.api.invoices.email({
        invoiceId: emailingInvoice.id,
        to,
        subject: emailSubject,
        bodyText: emailBody,
      });
      if (res.success) {
        setToast(`Invoice ${emailingInvoice.invoice_number} emailed to ${to}`);
        // Reflect new status + emailed stamp in the row without a full reload.
        setInvoices((prev) => prev.map((i) => i.id === emailingInvoice.id
          ? { ...i, status: res.status, emailed_at: res.emailedAt, emailed_to: res.emailedTo }
          : i));
        setEmailingInvoice(null);
      } else {
        setToast(res.error || 'Failed to send email');
      }
    } catch (err: any) {
      setToast(err?.message || 'Failed to send email');
    } finally {
      setEmailSending(false);
    }
  };

  const handleDeleteInvoice = async (invoiceId: number) => {
    try {
      await window.api.invoices.delete(invoiceId);
      setDeletingInvoiceId(null);
      loadInvoices();
      // Refresh appointments so they show as uninvoiced again
      loadAppointments();
      setOverviewAppts(prev => prev.map(a => a.contract_invoice_id === invoiceId ? { ...a, contract_invoice_id: undefined } as any : a));
    } catch (err) {
      console.error('Failed to delete invoice:', err);
    }
  };

  const handleGenerateInvoice = async () => {
    if (!selectedApptIds.size) return;
    setGeneratingInvoice(true);
    try {
      await window.api.contractedEntities.createInvoiceFromAppointments(
        entityId, Array.from(selectedApptIds), invoiceDate
      );
      setToast(`Invoice created for ${selectedApptIds.size} appointment${selectedApptIds.size > 1 ? 's' : ''}`);
      loadAppointments();
      if (tab === 'invoices') loadInvoices();
    } catch (err: any) {
      setToast(err?.message || 'Failed to create invoice');
    } finally {
      setGeneratingInvoice(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <div className="card p-12 text-center text-[var(--color-text-secondary)]">Loading entity...</div>
      </div>
    );
  }

  if (!entity) {
    return (
      <div className="p-6">
        <div className="card p-12 text-center">
          <h3 className="text-lg font-semibold text-[var(--color-text)] mb-2">Entity not found</h3>
          <button className="btn-primary" onClick={() => navigate('/entities')}>Back to Entities</button>
        </div>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: React.ElementType }[] = [
    { key: 'overview',     label: 'Overview',      icon: Building2 },
    { key: 'appointments', label: 'Appointments',  icon: Calendar },
    { key: 'invoices',     label: 'Invoices',      icon: Receipt },
  ];

  const uninvoicedAppts = appointments.filter((a) => !a.contract_invoice_id);
  const selectedTotal = appointments
    .filter((a) => selectedApptIds.has(a.id))
    .reduce((sum, a) => sum + (a.entity_rate || 0), 0);

  return (
    <div className="p-6">
      {toast && (
        <div className="fixed top-4 right-4 z-50 flex items-center gap-2 bg-emerald-600 text-white px-4 py-3 rounded-lg shadow-lg">
          <FileCheck size={16} />
          <span className="text-sm font-medium">{toast}</span>
        </div>
      )}

      <button className="btn-ghost btn-sm gap-1.5 mb-4" onClick={() => navigate('/entities')}>
        <ArrowLeft size={16} />
        Back to Entities
      </button>

      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-4">
          <div className="w-14 h-14 rounded-xl bg-[var(--color-primary)]/10 flex items-center justify-center flex-shrink-0">
            <Building2 size={26} style={{ color: sectionColor.color }} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-[var(--color-text)]">{entity.name}</h1>
            {entity.contact_name && (
              <p className="text-sm text-[var(--color-text-secondary)] mt-0.5">{entity.contact_name}</p>
            )}
            <div className="flex items-center flex-wrap gap-2 mt-2">
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                {BILLING_CYCLE_LABELS[entity.billing_cycle] || 'Monthly'} billing
              </span>
              <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${entity.requires_notes ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                {entity.requires_notes ? 'Docs in PocketChart' : 'External docs'}
              </span>
              <button
                onClick={() => setShowFeeModal(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-700 hover:bg-emerald-100 transition-colors"
              >
                <DollarSign size={11} />
                {feeSchedule.length === 0 ? 'No rates' : `${feeSchedule.length} rate${feeSchedule.length !== 1 ? 's' : ''}`}
                {feeSchedule.length > 0 && ` · ${formatCurrency(Math.min(...feeSchedule.map(f => f.default_rate)))}${feeSchedule.length > 1 ? `–${formatCurrency(Math.max(...feeSchedule.map(f => f.default_rate)))}` : ''}`}
              </button>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button className="btn-ghost btn-sm" onClick={() => setShowDocsModal(true)} title="Documents">
            <FolderOpen size={16} />
          </button>
          <button className="btn-secondary btn-sm gap-1.5" onClick={() => setEditModalOpen(true)}>
            <Edit size={14} /> Edit
          </button>
          <button className="btn-danger btn-sm gap-1.5" onClick={handleDeleteEntity}>
            <Trash2 size={14} /> Archive
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-6 border-b border-[var(--color-border)]">
        {tabs.map((t) => {
          const Icon = t.icon;
          return (
            <button
              key={t.key}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                tab === t.key
                  ? 'border-[var(--color-primary)] text-[var(--color-primary)]'
                  : 'border-transparent text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
              }`}
              onClick={() => setTab(t.key)}
            >
              <Icon size={16} />
              {t.label}
            </button>
          );
        })}
      </div>

      {/* ── Overview Tab ── */}
      {tab === 'overview' && (() => {
        // Compute pipeline stats for the selected month
        const monthAppts = overviewAppts.filter((a) => a.scheduled_date.startsWith(overviewMonth));
        const scheduled  = monthAppts.filter((a) => a.status === 'scheduled');
        const completed  = monthAppts.filter((a) => a.status === 'completed');
        const invoiced   = completed.filter((a) => Boolean(a.contract_invoice_id));
        const unbilled   = completed.filter((a) => !a.contract_invoice_id);
        const noShow     = monthAppts.filter((a) => a.status === 'no-show');

        const totalRevenue  = completed.reduce((s, a) => s + (a.entity_rate || 0), 0);
        const invoicedVal   = invoiced.reduce((s, a) => s + (a.entity_rate || 0), 0);
        const unbilledVal   = unbilled.reduce((s, a) => s + (a.entity_rate || 0), 0);
        const scheduledVal  = scheduled.reduce((s, a) => s + (a.entity_rate || 0), 0);
        const totalVisits   = monthAppts.filter((a) => a.status !== 'cancelled').length;
        const completionPct = totalVisits > 0 ? Math.round((completed.length / totalVisits) * 100) : 0;
        const invoicedPct   = completed.length > 0 ? Math.round((invoiced.length / completed.length) * 100) : 0;

        // Month display helpers
        const [yr, mo] = overviewMonth.split('-').map(Number);
        const monthLabel = new Date(yr, mo - 1, 1).toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
        const prevMonth = mo === 1 ? `${yr - 1}-12` : `${yr}-${String(mo - 1).padStart(2, '0')}`;
        const nextMonth = mo === 12 ? `${yr + 1}-01` : `${yr}-${String(mo + 1).padStart(2, '0')}`;
        const isCurrentMonth = overviewMonth === new Date().toISOString().slice(0, 7);

        return (
          <div className="space-y-5">
            {/* Month navigator */}
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-[var(--color-text)]">Revenue Pipeline</h3>
              <div className="flex items-center gap-1">
                <button className="btn-ghost btn-sm px-2 text-[var(--color-text-secondary)]" onClick={() => setOverviewMonth(prevMonth)}>‹</button>
                <span className="text-sm font-medium text-[var(--color-text)] min-w-[110px] text-center">{monthLabel}</span>
                <button className="btn-ghost btn-sm px-2 text-[var(--color-text-secondary)]" onClick={() => setOverviewMonth(nextMonth)} disabled={isCurrentMonth}>›</button>
              </div>
            </div>

            {/* Two-card pipeline layout */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

              {/* Visits card */}
              <div className="card overflow-hidden">
                <div className="px-5 py-4 flex items-center gap-2 border-b border-[var(--color-border)]">
                  <Calendar size={15} className="text-[var(--color-text-secondary)]" />
                  <span className="text-sm font-semibold text-[var(--color-text)]">Visits</span>
                </div>
                <div className="grid grid-cols-2 divide-x divide-[var(--color-border)]">
                  {/* Scheduled column */}
                  <div className="flex flex-col">
                    <div className="px-5 py-4 border-l-2 border-l-blue-400">
                      <p className="text-xs font-medium text-blue-600 mb-1">Scheduled</p>
                      <p className="text-xl font-bold text-[var(--color-text)]">
                        {scheduledVal > 0 ? formatCurrency(scheduledVal) : '—'}
                      </p>
                      <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                        {scheduled.length} {scheduled.length === 1 ? 'visit' : 'visits'}
                      </p>
                    </div>
                    {scheduled.length > 0 && (
                      <>
                        <button
                          className="px-5 py-2.5 flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)] border-t border-[var(--color-border)] hover:bg-[var(--color-bg)]/60 transition-colors text-left"
                          onClick={() => setShowScheduledList(v => !v)}
                        >
                          {showScheduledList
                            ? <ChevronDown size={13} />
                            : <ChevronRight size={13} />}
                          {scheduled.length} scheduled
                        </button>
                        {showScheduledList && scheduled.map((appt) => (
                          <div key={appt.id} className="flex items-center justify-between px-5 py-2.5 border-t border-[var(--color-border)] hover:bg-[var(--color-bg)]/50 transition-colors">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-[var(--color-text)] truncate">
                                {appt.contractor_patient_name || appt.patient_name || '—'}
                              </p>
                              <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                                {appt.scheduled_date}{appt.entity_rate ? ` · ${formatCurrency(appt.entity_rate)}` : ''}
                              </p>
                            </div>
                            <button
                              onClick={() => handleQuickStatusChange(appt, 'completed')}
                              className="flex-shrink-0 ml-3 text-[var(--color-text-secondary)] hover:text-emerald-500 transition-colors"
                              title="Mark as completed"
                            >
                              <Square size={15} />
                            </button>
                          </div>
                        ))}
                      </>
                    )}
                  </div>

                  {/* Completed column */}
                  <div className="flex flex-col">
                    <div className="px-5 py-4 border-l-2 border-l-emerald-400">
                      <p className="text-xs font-medium text-emerald-600 mb-1">Completed</p>
                      <p className="text-xl font-bold text-[var(--color-text)]">
                        {totalRevenue > 0 ? formatCurrency(totalRevenue) : '—'}
                      </p>
                      <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                        {completed.length > 0
                          ? `${completed.length} ${completed.length === 1 ? 'visit' : 'visits'}${completionPct < 100 ? `, ${completionPct}%` : ''}`
                          : 'none yet'}
                      </p>
                    </div>
                    {completed.length > 0 && (
                      <>
                        <button
                          className="px-5 py-2.5 flex items-center gap-1.5 text-xs text-[var(--color-text-secondary)] border-t border-[var(--color-border)] hover:bg-[var(--color-bg)]/60 transition-colors text-left"
                          onClick={() => setShowCompletedList(v => !v)}
                        >
                          {showCompletedList
                            ? <ChevronDown size={13} />
                            : <ChevronRight size={13} />}
                          {completed.length} completed
                        </button>
                        {showCompletedList && completed.map((appt) => (
                          <div key={appt.id} className="flex items-center justify-between px-5 py-2.5 border-t border-[var(--color-border)] hover:bg-[var(--color-bg)]/50 transition-colors">
                            <div className="min-w-0">
                              <p className="text-sm font-medium text-[var(--color-text)] truncate">
                                {appt.contractor_patient_name || appt.patient_name || '—'}
                              </p>
                              <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                                {appt.scheduled_date}
                                {appt.contract_invoice_id
                                  ? ' · Invoiced'
                                  : appt.entity_rate ? ` · ${formatCurrency(appt.entity_rate)}` : ''}
                              </p>
                            </div>
                            <button
                              onClick={() => handleQuickStatusChange(appt, 'scheduled')}
                              className="flex-shrink-0 ml-3 text-emerald-500 hover:text-[var(--color-text-secondary)] transition-colors"
                              title="Move back to scheduled"
                            >
                              <CheckSquare size={15} />
                            </button>
                          </div>
                        ))}
                      </>
                    )}
                  </div>
                </div>

                {totalVisits === 0 && (
                  <p className="px-5 py-4 text-sm text-[var(--color-text-secondary)] border-t border-[var(--color-border)]">
                    No appointments in {monthLabel}.
                  </p>
                )}
              </div>

              {/* Billing card */}
              <div className="card overflow-hidden">
                <div className="px-5 py-4 flex items-center gap-2 border-b border-[var(--color-border)]">
                  <DollarSign size={15} className="text-[var(--color-text-secondary)]" />
                  <span className="text-sm font-semibold text-[var(--color-text)]">Billing</span>
                </div>
                <div className="grid grid-cols-2 divide-x divide-[var(--color-border)]">
                  <div className="px-5 py-4 border-l-2 border-l-amber-400">
                    <p className="text-xs font-medium text-amber-600 mb-1">Unbilled</p>
                    <p className="text-xl font-bold text-[var(--color-text)]">
                      {unbilledVal > 0 ? formatCurrency(unbilledVal) : '—'}
                    </p>
                    <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                      {unbilled.length} ready
                    </p>
                  </div>
                  <div className="px-5 py-4 border-l-2 border-l-purple-400">
                    <p className="text-xs font-medium text-purple-600 mb-1">Invoiced</p>
                    <p className="text-xl font-bold text-[var(--color-text)]">
                      {invoicedVal > 0 ? formatCurrency(invoicedVal) : '—'}
                    </p>
                    <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                      {invoiced.length} sent
                    </p>
                  </div>
                </div>
                <div className="px-5 py-4 border-t border-[var(--color-border)]">
                  {unbilled.length === 0 && invoiced.length === 0 ? (
                    <p className="text-sm text-[var(--color-text-secondary)] text-center py-2">Nothing ready to bill yet</p>
                  ) : (
                    <div className="space-y-2">
                      {unbilled.length > 0 && (
                        <div>
                          <div className="flex justify-between text-xs text-[var(--color-text-secondary)] mb-1">
                            <span>Revenue invoiced</span>
                            <span>{formatCurrency(invoicedVal)} / {formatCurrency(totalRevenue)}</span>
                          </div>
                          <div className="h-1.5 bg-[var(--color-bg)] rounded-full overflow-hidden">
                            <div className="h-full bg-purple-400 rounded-full transition-all"
                              style={{ width: totalRevenue > 0 ? `${Math.round((invoicedVal / totalRevenue) * 100)}%` : '0%' }} />
                          </div>
                        </div>
                      )}
                      {noShow.length > 0 && (
                        <p className="text-xs text-[var(--color-text-secondary)]">
                          {noShow.length} no-show{noShow.length > 1 ? 's' : ''} this month
                        </p>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Contact + billing details row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <div className="card p-5 space-y-3">
                <h3 className="section-title">Contact</h3>
                {entity.contact_phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone size={14} className="text-[var(--color-text-secondary)]" />
                    {entity.contact_phone}
                  </div>
                )}
                {entity.contact_email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail size={14} className="text-[var(--color-text-secondary)]" />
                    {entity.contact_email}
                  </div>
                )}
                {(entity.billing_address_street || entity.billing_address_city) && (
                  <div className="flex items-start gap-2 text-sm">
                    <MapPin size={14} className="text-[var(--color-text-secondary)] mt-0.5" />
                    <div>
                      {entity.billing_address_street && <p>{entity.billing_address_street}</p>}
                      <p>{[entity.billing_address_city, entity.billing_address_state, entity.billing_address_zip].filter(Boolean).join(', ')}</p>
                    </div>
                  </div>
                )}
                {entity.notes && (
                  <div className="border-t border-[var(--color-border)] pt-3">
                    <p className="text-xs font-medium text-[var(--color-text-secondary)] mb-1">Notes</p>
                    <p className="text-sm text-[var(--color-text)]">{entity.notes}</p>
                  </div>
                )}
              </div>
              <div className="card p-5 space-y-3">
                <h3 className="section-title">Billing Settings</h3>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[var(--color-text-secondary)]">Invoice Cycle</span>
                  <span className="text-sm font-medium text-[var(--color-text)]">
                    {BILLING_CYCLE_LABELS[entity.billing_cycle] || 'Monthly'}
                    {entity.billing_cycle === 'monthly' && ` (day ${entity.billing_day})`}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[var(--color-text-secondary)]">Documentation</span>
                  <span className={`text-sm font-medium ${entity.requires_notes ? 'text-blue-600' : 'text-[var(--color-text)]'}`}>
                    {entity.requires_notes ? 'In PocketChart' : 'External system'}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[var(--color-text-secondary)]">Fee Entries</span>
                  <span className="text-sm font-medium text-[var(--color-text)]">{feeSchedule.length}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-[var(--color-text-secondary)]">Documents</span>
                  <span className="text-sm font-medium text-[var(--color-text)]">{documents.length}</span>
                </div>
              </div>
            </div>
          </div>
        );
      })()}


      {/* ── Appointments Tab ── */}
      {tab === 'appointments' && (() => {
        const todayStr = new Date().toISOString().slice(0, 10);
        const patientsWithFutureAppts = new Set(
          overviewAppts
            .filter((a) => a.status === 'scheduled' && a.scheduled_date >= todayStr && a.contractor_patient_id != null)
            .map((a) => a.contractor_patient_id as number)
        );
        const unscheduledPatients = contractorPatients.filter((p) => !patientsWithFutureAppts.has(p.id));

        const handleSchedulePatient = (p: ContractorPatient) => {
          navigate('/calendar', {
            state: {
              prefillAppt: {
                entity_id: entityId,
                contractor_patient_id: p.id,
                contractor_patient_name: p.name,
              },
            },
          });
        };

        return (
        <div>
          {/* Unscheduled patients */}
          {unscheduledPatients.length > 0 && (
            <div className="card mb-4 p-4">
              <div className="flex items-center justify-between mb-1">
                <h3 className="text-sm font-medium flex items-center gap-2">
                  <UserPlus size={14} className="text-purple-500" />
                  Unscheduled Patients
                  <span className="text-xs font-normal text-[var(--color-text-secondary)]">({unscheduledPatients.length})</span>
                </h3>
              </div>
              <p className="text-xs text-[var(--color-text-secondary)] mb-2">
                Added (e.g., from waitlist) but not yet on the calendar.
              </p>
              <div className="space-y-0.5">
                {unscheduledPatients.map((p) => (
                  <div key={p.id} className="flex items-center justify-between px-2 py-1.5 rounded hover:bg-[var(--color-bg)] transition-colors">
                    <div className="min-w-0">
                      <div className="text-sm font-medium truncate flex items-center gap-2">
                        {p.name}
                        {!p.dob && (
                          <span className="text-[10px] uppercase tracking-wide text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded" title="No DOB on file — click the pencil to add one (shows on PDF notes)">
                            No DOB
                          </span>
                        )}
                      </div>
                      {(p.phone || p.notes) && (
                        <div className="text-xs text-[var(--color-text-secondary)] truncate">
                          {p.phone ? p.phone : ''}
                          {p.phone && p.notes ? ' · ' : ''}
                          {p.notes}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <button
                        className="btn-ghost btn-sm p-1.5 text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                        onClick={() => setEditingPatient(p)}
                        title={`Edit ${p.name} (DOB, MRN, phone, notes)`}
                      >
                        <Pencil size={13} />
                      </button>
                      <button
                        className="btn-ghost btn-sm gap-1.5 text-purple-700 hover:bg-purple-50"
                        onClick={() => handleSchedulePatient(p)}
                        title={`Schedule appointment for ${p.name}`}
                      >
                        <Calendar size={13} /> Schedule
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Header + controls */}
          <div className="flex items-center justify-between mb-4 gap-3 flex-wrap">
            <div className="flex items-center gap-3">
              <h3 className="section-title">Appointments</h3>
              <div className="inline-flex items-center rounded-full border border-[var(--color-border)] bg-[var(--color-bg)] p-0.5">
                {(['unbilled', 'all', 'invoiced'] as const).map((opt) => (
                  <button
                    key={opt}
                    className={`text-xs px-2.5 py-1 rounded-full transition-colors capitalize ${
                      apptFilter === opt
                        ? opt === 'invoiced'
                          ? 'bg-purple-100 text-purple-700'
                          : opt === 'all'
                          ? 'bg-white text-[var(--color-text)] shadow-sm'
                          : 'bg-amber-100 text-amber-700'
                        : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text)]'
                    }`}
                    onClick={() => setApptFilter(opt)}
                  >
                    {opt === 'unbilled' ? 'Unbilled only' : opt === 'invoiced' ? 'Invoiced only' : 'All'}
                  </button>
                ))}
              </div>
              <button className="btn-ghost btn-sm" onClick={loadAppointments} title="Refresh">
                <RefreshCw size={13} />
              </button>
            </div>

            {selectedApptIds.size > 0 && (() => {
              const notesInSelection = appointments
                .filter(a => selectedApptIds.has(a.id) && a.note_id)
                .length;
              return (
              <div className="flex items-center gap-3">
                {notesInSelection > 0 && (
                  <button
                    className="btn-secondary btn-sm gap-1.5"
                    onClick={handleDownloadNotesPacket}
                    title="Download a single PDF packet of notes for this patient"
                  >
                    <Download size={14} />
                    Notes Packet ({notesInSelection})
                  </button>
                )}
                <input
                  type="date"
                  className="input text-sm"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
                <button
                  className="btn-primary btn-sm gap-1.5"
                  onClick={handleGenerateInvoice}
                  disabled={generatingInvoice}
                >
                  <Receipt size={14} />
                  {generatingInvoice ? 'Generating…' : `Generate Invoice (${formatCurrency(selectedTotal)})`}
                </button>
              </div>
              );
            })()}
          </div>

          {apptLoading ? (
            <div className="card p-8 text-center text-[var(--color-text-secondary)]">Loading appointments…</div>
          ) : appointments.length === 0 ? (
            <div className="card p-8 text-center">
              <Calendar size={32} className="mx-auto text-[var(--color-text-secondary)] mb-3 opacity-40" />
              <p className="text-sm text-[var(--color-text-secondary)]">
                {apptFilter === 'unbilled' ? 'No unbilled appointments. All caught up!'
                  : apptFilter === 'invoiced' ? 'No invoiced appointments yet.'
                  : 'No appointments found.'}
              </p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    <th className="table-header w-10">
                      <button onClick={toggleAllAppts}>
                        {selectedApptIds.size === uninvoicedAppts.length && uninvoicedAppts.length > 0
                          ? <CheckSquare size={15} className="text-[var(--color-primary)]" />
                          : <Square size={15} className="text-[var(--color-text-secondary)]" />}
                      </button>
                    </th>
                    <th className="table-header">Date</th>
                    <th className="table-header">Time</th>
                    <th className="table-header">Patient</th>
                    <th className="table-header">Status</th>
                    <th className="table-header text-right">Rate</th>
                    <th className="table-header">Invoice</th>
                    <th className="table-header w-12 text-center">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {appointments.map((appt) => {
                    const isInvoiced = Boolean(appt.contract_invoice_id);
                    const isSelected = selectedApptIds.has(appt.id);
                    return (
                      <tr
                        key={appt.id}
                        className={`border-b border-[var(--color-border)] last:border-b-0 transition-colors cursor-pointer ${
                          isSelected ? 'bg-purple-50/60' : 'hover:bg-[var(--color-bg)]/50'
                        }`}
                        onClick={() => setEditingAppt(appt)}
                        title="Click to edit appointment"
                      >
                        <td className="table-cell" onClick={(e) => e.stopPropagation()}>
                          {!isInvoiced && (
                            <button onClick={() => toggleAppt(appt.id)}>
                              {isSelected
                                ? <CheckSquare size={15} className="text-[var(--color-primary)]" />
                                : <Square size={15} className="text-[var(--color-text-secondary)]" />}
                            </button>
                          )}
                        </td>
                        <td className="table-cell font-medium">{appt.scheduled_date}</td>
                        <td className="table-cell text-[var(--color-text-secondary)] text-sm">
                          {(() => {
                            const [h, m] = appt.scheduled_time.split(':').map(Number);
                            const suffix = h >= 12 ? 'PM' : 'AM';
                            const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
                            return `${h12}:${String(m).padStart(2, '0')} ${suffix}`;
                          })()}
                        </td>
                        <td className="table-cell">
                          {appt.patient_name?.trim() || <span className="text-[var(--color-text-secondary)] italic">—</span>}
                        </td>
                        <td className="table-cell">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
                            appt.status === 'completed' ? 'bg-emerald-100 text-emerald-700' :
                            appt.status === 'cancelled' ? 'bg-gray-100 text-gray-500' :
                            'bg-blue-100 text-blue-700'
                          }`}>
                            {appt.status}
                          </span>
                        </td>
                        <td className="table-cell text-right font-medium">
                          {appt.entity_rate ? formatCurrency(appt.entity_rate) : '—'}
                        </td>
                        <td className="table-cell">
                          {isInvoiced ? (
                            <span className="text-xs text-emerald-600 font-medium">Invoiced</span>
                          ) : (
                            <span className="text-xs text-[var(--color-text-secondary)]">Unbilled</span>
                          )}
                        </td>
                        <td className="table-cell text-center" onClick={(e) => e.stopPropagation()}>
                          {appt.note_id ? (
                            <button
                              className="btn-ghost btn-sm p-1 text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                              onClick={() => handleDownloadNote(appt.note_id as number)}
                              title="Download note as PDF"
                            >
                              <Download size={13} />
                            </button>
                          ) : (
                            <span className="text-[var(--color-text-secondary)]/40 text-xs">—</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                {selectedApptIds.size > 0 && (
                  <tfoot>
                    <tr className="border-t-2 border-[var(--color-border)] bg-purple-50/40">
                      <td colSpan={5} className="table-cell text-sm font-medium text-purple-700">
                        {selectedApptIds.size} selected
                      </td>
                      <td className="table-cell text-right text-sm font-bold text-purple-700">
                        {formatCurrency(selectedTotal)}
                      </td>
                      <td />
                      <td />
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
        </div>
        );
      })()}

      {/* ── Invoices Tab ── */}
      {tab === 'invoices' && (
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="section-title">Invoices</h3>
            <button className="btn-ghost btn-sm" onClick={loadInvoices} title="Refresh">
              <RefreshCw size={13} />
            </button>
          </div>

          {invoicesLoading ? (
            <div className="card p-8 text-center text-[var(--color-text-secondary)]">Loading invoices…</div>
          ) : invoices.length === 0 ? (
            <div className="card p-8 text-center">
              <Receipt size={32} className="mx-auto text-[var(--color-text-secondary)] mb-3 opacity-40" />
              <p className="text-sm text-[var(--color-text-secondary)]">
                No invoices yet. Go to Appointments to generate one.
              </p>
            </div>
          ) : (
            <div className="card overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-[var(--color-border)]">
                    <th className="table-header">Invoice #</th>
                    <th className="table-header">Date</th>
                    <th className="table-header">Status</th>
                    <th className="table-header text-right">Amount</th>
                    <th className="table-header w-10" />
                  </tr>
                </thead>
                <tbody>
                  {invoices.map((inv) => {
                    const sc = STATUS_COLORS[inv.status] || STATUS_COLORS.draft;
                    return (
                      <tr key={inv.id} className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-bg)]/50">
                        <td className="table-cell font-mono text-sm font-medium">{inv.invoice_number}</td>
                        <td className="table-cell text-[var(--color-text-secondary)]">{inv.invoice_date}</td>
                        <td className="table-cell">
                          <select
                            value={inv.status}
                            onChange={(e) => handleInlineStatusChange(inv, e.target.value as InvoiceStatus)}
                            disabled={statusUpdatingId === inv.id}
                            className={`inline-flex items-center pl-2 pr-6 py-0.5 rounded-full text-xs font-medium capitalize border-0 cursor-pointer focus:outline-none focus:ring-1 focus:ring-[var(--color-primary)] ${sc.bg} ${sc.text} appearance-none bg-no-repeat bg-right`}
                            style={{
                              backgroundImage: `url("data:image/svg+xml;charset=US-ASCII,%3Csvg xmlns='http://www.w3.org/2000/svg' width='8' height='8' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='3'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E")`,
                              backgroundPosition: 'right 0.4rem center',
                              backgroundSize: '0.6em',
                            }}
                            title="Change status"
                          >
                            <option value="draft">Draft</option>
                            <option value="sent">Sent</option>
                            <option value="paid">Paid</option>
                            <option value="partial">Partial</option>
                            <option value="void">Void</option>
                            <option value="overdue">Overdue</option>
                          </select>
                        </td>
                        <td className="table-cell text-right font-medium">{formatCurrency(inv.total_amount)}</td>
                        <td className="table-cell">
                          <div className="flex items-center gap-0.5 justify-end">
                            {inv.status === 'draft' && (
                              <button
                                className="btn-primary btn-sm gap-1 mr-1"
                                onClick={() => handleFinalizeInvoice(inv)}
                                title="Finalize invoice (mark as sent)"
                              >
                                <Send size={12} />
                                Finalize
                              </button>
                            )}
                            <button
                              className={`btn-ghost btn-sm hover:text-[var(--color-primary)] ${(inv as any).emailed_at ? 'text-emerald-600' : 'text-[var(--color-text-secondary)]'}`}
                              onClick={() => openEmailInvoice(inv)}
                              title={(inv as any).emailed_at
                                ? `Emailed ${new Date((inv as any).emailed_at).toLocaleDateString()}${(inv as any).emailed_to ? ' to ' + (inv as any).emailed_to : ''} — click to resend`
                                : 'Email invoice'}
                            >
                              <Mail size={14} />
                            </button>
                            <button
                              className="btn-ghost btn-sm text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                              onClick={() => handleDownloadInvoice(inv.id)}
                              title="Download PDF"
                            >
                              <Download size={14} />
                            </button>
                            <button
                              className="btn-ghost btn-sm text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                              onClick={() => openEditInvoice(inv)}
                              title="Edit invoice"
                            >
                              <Edit size={14} />
                            </button>
                            <button
                              className="btn-ghost btn-sm text-[var(--color-text-secondary)] hover:text-red-500"
                              onClick={() => setDeletingInvoiceId(inv.id)}
                              title="Delete invoice"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ── Edit Invoice Modal ── */}
      {editingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setEditingInvoice(null)}>
          <div className="absolute inset-0 bg-black/40 pointer-events-none" />
          <div className="relative z-10 bg-[var(--color-surface)] rounded-xl shadow-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-[var(--color-border)]">
              <h3 className="text-base font-semibold text-[var(--color-text)]">Edit Invoice {editingInvoice.invoice_number}</h3>
            </div>

            <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
              {/* Top row: status, dates */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="label">Status</label>
                  <select className="select w-full" value={editInvoiceStatus} onChange={e => setEditInvoiceStatus(e.target.value)}>
                    <option value="draft">Draft</option>
                    <option value="sent">Sent</option>
                    <option value="paid">Paid</option>
                    <option value="partial">Partial</option>
                    <option value="void">Void</option>
                    <option value="overdue">Overdue</option>
                  </select>
                </div>
                <div>
                  <label className="label">Invoice Date</label>
                  <input type="date" className="input" value={editInvoiceDate} onChange={e => setEditInvoiceDate(e.target.value)} />
                </div>
                <div>
                  <label className="label">Due Date</label>
                  <input type="date" className="input" value={editInvoiceDue} onChange={e => setEditInvoiceDue(e.target.value)} />
                </div>
              </div>

              {/* Line items */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="label mb-0">Line Items</label>
                  <span className="text-xs text-[var(--color-text-secondary)]">
                    Uncheck to remove (visits return to uninvoiced)
                  </span>
                </div>
                {editInvoiceItems.length === 0 ? (
                  <div className="card p-6 text-center text-sm text-[var(--color-text-secondary)]">
                    No line items.
                  </div>
                ) : (
                  <div className="card overflow-hidden">
                    <table className="w-full">
                      <thead>
                        <tr className="border-b border-[var(--color-border)] bg-[var(--color-bg)]/40">
                          <th className="table-header w-8"></th>
                          <th className="table-header">Patient / Description</th>
                          <th className="table-header w-36">Service Date</th>
                          <th className="table-header w-28 text-right">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {editInvoiceItems.map((it) => (
                          <tr
                            key={it.id}
                            className={`border-b border-[var(--color-border)] last:border-b-0 ${!it._kept ? 'opacity-40 line-through' : ''}`}
                          >
                            <td className="table-cell">
                              <button
                                type="button"
                                onClick={() => handleEditItemChange(it.id, '_kept', !it._kept)}
                                className="text-[var(--color-text-secondary)] hover:text-[var(--color-primary)]"
                                title={it._kept ? 'Remove from invoice' : 'Restore to invoice'}
                              >
                                {it._kept ? <CheckSquare size={16} /> : <Square size={16} />}
                              </button>
                            </td>
                            <td className="table-cell text-sm">{it.description || '—'}</td>
                            <td className="table-cell">
                              <input
                                type="date"
                                className="input text-sm py-1"
                                value={it.service_date || ''}
                                disabled={!it._kept}
                                onChange={(e) => handleEditItemChange(it.id, 'service_date', e.target.value)}
                              />
                            </td>
                            <td className="table-cell">
                              <input
                                type="number"
                                step="0.01"
                                className="input text-sm py-1 text-right"
                                value={it.amount ?? 0}
                                disabled={!it._kept}
                                onChange={(e) => handleEditItemChange(it.id, 'amount', e.target.value)}
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                      <tfoot>
                        <tr className="border-t-2 border-[var(--color-border)] bg-[var(--color-bg)]/30">
                          <td className="table-cell" colSpan={3}>
                            <span className="text-sm font-semibold text-[var(--color-text)]">New Total</span>
                          </td>
                          <td className="table-cell text-right text-sm font-bold text-purple-700">
                            {formatCurrency(editInvoiceSubtotal)}
                          </td>
                        </tr>
                      </tfoot>
                    </table>
                  </div>
                )}
              </div>

              <div>
                <label className="label">Notes</label>
                <textarea className="input min-h-[70px] resize-y" value={editInvoiceNotes} onChange={e => setEditInvoiceNotes(e.target.value)} placeholder="Internal notes…" />
              </div>
            </div>

            <div className="px-6 py-3 border-t border-[var(--color-border)] flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setEditingInvoice(null)}>Cancel</button>
              <button className="btn-primary" onClick={handleSaveInvoice} disabled={invoiceSaving}>
                {invoiceSaving ? 'Saving…' : 'Save Changes'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Delete Invoice Confirmation ── */}
      {deletingInvoiceId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => setDeletingInvoiceId(null)}>
          <div className="absolute inset-0 bg-black/40 pointer-events-none" />
          <div className="relative z-10 bg-[var(--color-surface)] rounded-xl shadow-xl w-full max-w-sm mx-4 p-6" onClick={e => e.stopPropagation()}>
            <h3 className="text-base font-semibold text-[var(--color-text)] mb-2">Delete Invoice?</h3>
            <p className="text-sm text-[var(--color-text-secondary)] mb-5">
              This will permanently delete the invoice and return all linked visits to uninvoiced status.
            </p>
            <div className="flex justify-end gap-2">
              <button className="btn-secondary" onClick={() => setDeletingInvoiceId(null)}>Cancel</button>
              <button
                className="btn-primary bg-red-500 hover:bg-red-600 border-red-500 hover:border-red-600"
                onClick={() => handleDeleteInvoice(deletingInvoiceId)}
              >
                Delete Invoice
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Email Invoice Dialog ── */}
      {emailingInvoice && (
        <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={() => !emailSending && setEmailingInvoice(null)}>
          <div className="absolute inset-0 bg-black/40 pointer-events-none" />
          <div className="relative z-10 bg-[var(--color-surface)] rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[90vh] flex flex-col" onClick={e => e.stopPropagation()}>
            <div className="flex items-center gap-2 px-6 py-4 border-b border-[var(--color-border)]">
              <Mail size={18} className="text-[var(--color-primary)]" />
              <h3 className="text-base font-semibold text-[var(--color-text)]">Email Invoice {emailingInvoice.invoice_number}</h3>
            </div>

            {emailLoading || !emailPrep ? (
              <div className="px-6 py-10 text-center text-sm text-[var(--color-text-secondary)]">Preparing email…</div>
            ) : !emailPrep.emailConfigured ? (
              <div className="px-6 py-8 text-center">
                <Mail size={32} className="mx-auto text-[var(--color-text-secondary)] mb-3 opacity-40" />
                <p className="text-sm text-[var(--color-text)] font-medium mb-1">Email isn't set up yet</p>
                <p className="text-sm text-[var(--color-text-secondary)] mb-5">
                  Connect your email account in <strong>Settings → Email</strong> to send invoices from your own address.
                </p>
                <div className="flex justify-center gap-2">
                  <button className="btn-secondary" onClick={() => setEmailingInvoice(null)}>Close</button>
                  <button className="btn-primary" onClick={() => navigate('/settings?section=email')}>Go to Settings</button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-4">
                  {emailPrep.alreadyEmailedAt && (
                    <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-800 text-xs">
                      <RefreshCw size={14} className="mt-0.5 flex-shrink-0" />
                      <span>
                        Already emailed on {new Date(emailPrep.alreadyEmailedAt).toLocaleDateString()}
                        {emailPrep.alreadyEmailedTo ? ` to ${emailPrep.alreadyEmailedTo}` : ''}. Sending again will resend it.
                      </span>
                    </div>
                  )}

                  <div>
                    <label className="label">To</label>
                    <input
                      type="email"
                      className="input w-full"
                      value={emailTo}
                      onChange={(e) => setEmailTo(e.target.value)}
                      placeholder="billing@agency.com"
                    />
                    {!emailTo.trim() && (
                      <p className="text-xs text-amber-600 mt-1">No billing email on file for this agency — enter one above.</p>
                    )}
                    {emailPrep.fromAddress && (
                      <p className="text-xs text-[var(--color-text-secondary)] mt-1">Sending from {emailPrep.fromAddress}</p>
                    )}
                  </div>

                  <div>
                    <label className="label">Subject</label>
                    <input className="input w-full" value={emailSubject} onChange={(e) => setEmailSubject(e.target.value)} />
                  </div>

                  <div>
                    <label className="label">Message</label>
                    <textarea
                      className="input w-full text-sm"
                      rows={6}
                      value={emailBody}
                      onChange={(e) => setEmailBody(e.target.value)}
                    />
                  </div>

                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-[var(--color-bg)] border border-[var(--color-border)] text-sm">
                    <FileText size={15} className="text-[var(--color-primary)] flex-shrink-0" />
                    <span className="text-[var(--color-text)] truncate">{emailPrep.filename}</span>
                    <span className="ml-auto text-xs text-[var(--color-text-secondary)] whitespace-nowrap">PDF attached</span>
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-[var(--color-border)]">
                  <button className="btn-secondary" onClick={() => setEmailingInvoice(null)} disabled={emailSending}>Cancel</button>
                  <button
                    className="btn-primary gap-1.5"
                    onClick={handleSendInvoiceEmail}
                    disabled={emailSending || !/^\S+@\S+\.\S+$/.test(emailTo.trim())}
                  >
                    <Send size={14} />
                    {emailSending ? 'Sending…' : 'Send Invoice'}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* ── Fee Schedule Modal ── */}
      {showFeeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => { setShowFeeModal(false); setShowFeeForm(false); }} />
          <div className="relative bg-[var(--color-surface)] rounded-2xl shadow-2xl w-full max-w-2xl mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-2">
                <DollarSign size={18} className="text-emerald-600" />
                <h3 className="text-base font-semibold text-[var(--color-text)]">Fee Schedule — {entity.name}</h3>
              </div>
              <button className="btn-primary btn-sm gap-1.5" onClick={() => setShowFeeForm(v => !v)}>
                <Plus size={14} /> Add Rate
              </button>
            </div>

            {showFeeForm && (
              <div className="px-6 py-4 border-b border-[var(--color-border)] bg-[var(--color-bg)]/50 space-y-3">
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="label">Service Type *</label>
                    <select className="select w-full" value={feeServiceType} onChange={(e) => setFeeServiceType(e.target.value)}>
                      <option value="">Select...</option>
                      <option value="eval">Evaluation</option>
                      <option value="treatment">Treatment</option>
                      <option value="reassessment">Reassessment</option>
                      <option value="discharge">Discharge</option>
                    </select>
                  </div>
                  <div>
                    <label className="label">CPT Code</label>
                    <input className="input w-full" value={feeCptCode} onChange={(e) => setFeeCptCode(e.target.value)} placeholder="e.g. 97110" />
                  </div>
                  <div>
                    <label className="label">Rate *</label>
                    <input className="input w-full" type="number" step="0.01" placeholder="130.00" value={feeRate} onChange={(e) => setFeeRate(e.target.value)} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Description</label>
                    <input className="input w-full" value={feeDescription} onChange={(e) => setFeeDescription(e.target.value)} placeholder="Initial Evaluation" />
                  </div>
                  <div>
                    <label className="label">Unit</label>
                    <select className="select w-full" value={feeUnit} onChange={(e) => setFeeUnit(e.target.value)}>
                      <option value="per_visit">Per Visit</option>
                      <option value="per_hour">Per Hour</option>
                      <option value="per_unit">Per Unit</option>
                    </select>
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button className="btn-secondary btn-sm" onClick={() => setShowFeeForm(false)}>Cancel</button>
                  <button className="btn-primary btn-sm" onClick={handleAddFeeEntry} disabled={!feeServiceType || !feeRate}>Add Rate</button>
                </div>
              </div>
            )}

            <div className="max-h-[50vh] overflow-y-auto">
              {feeSchedule.length === 0 ? (
                <div className="px-6 py-10 text-center">
                  <DollarSign size={28} className="mx-auto text-[var(--color-text-secondary)] mb-2 opacity-30" />
                  <p className="text-sm text-[var(--color-text-secondary)]">No rates yet. Add your first rate above.</p>
                </div>
              ) : (
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-[var(--color-border)]">
                      <th className="table-header">Service</th>
                      <th className="table-header">CPT</th>
                      <th className="table-header">Description</th>
                      <th className="table-header">Rate</th>
                      <th className="table-header">Unit</th>
                      <th className="table-header w-10" />
                    </tr>
                  </thead>
                  <tbody>
                    {feeSchedule.map((fee) => (
                      <tr key={fee.id} className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-bg)]/50">
                        <td className="table-cell font-medium capitalize">{fee.service_type}</td>
                        <td className="table-cell font-mono text-sm text-[var(--color-text-secondary)]">{fee.cpt_code || '—'}</td>
                        <td className="table-cell text-[var(--color-text-secondary)]">{fee.description || '—'}</td>
                        <td className="table-cell font-semibold text-emerald-700">{formatCurrency(fee.default_rate)}</td>
                        <td className="table-cell text-[var(--color-text-secondary)] capitalize">{fee.unit.replace('_', ' ')}</td>
                        <td className="table-cell">
                          <button className="btn-ghost btn-sm text-red-400 hover:text-red-600" onClick={() => handleDeleteFeeEntry(fee.id)}>
                            <Trash2 size={14} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="px-6 py-3 border-t border-[var(--color-border)] flex justify-end">
              <button className="btn-secondary btn-sm" onClick={() => { setShowFeeModal(false); setShowFeeForm(false); }}>Done</button>
            </div>
          </div>
        </div>
      )}

      {/* ── Documents Modal ── */}
      {showDocsModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setShowDocsModal(false)} />
          <div className="relative bg-[var(--color-surface)] rounded-2xl shadow-2xl w-full max-w-xl mx-4 overflow-hidden">
            <div className="flex items-center justify-between px-6 py-4 border-b border-[var(--color-border)]">
              <div className="flex items-center gap-2">
                <FolderOpen size={18} className="text-[var(--color-text-secondary)]" />
                <h3 className="text-base font-semibold text-[var(--color-text)]">Documents — {entity.name}</h3>
              </div>
              <div className="flex gap-2">
                <button className="btn-secondary btn-sm gap-1.5" onClick={() => handleUploadDocument('contract')}>
                  <Upload size={13} /> Contract
                </button>
                <button className="btn-secondary btn-sm gap-1.5" onClick={() => handleUploadDocument('w9')}>
                  <Upload size={13} /> W-9
                </button>
                <button className="btn-primary btn-sm gap-1.5" onClick={() => handleUploadDocument()}>
                  <Upload size={13} /> Upload
                </button>
              </div>
            </div>

            <div className="max-h-[50vh] overflow-y-auto p-4">
              {documents.length === 0 ? (
                <div className="py-10 text-center">
                  <FolderOpen size={28} className="mx-auto text-[var(--color-text-secondary)] mb-2 opacity-30" />
                  <p className="text-sm text-[var(--color-text-secondary)]">No documents yet. Upload contracts, W-9s, or credentialing docs.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {documents.map((doc) => (
                    <div key={doc.id} className="flex items-center justify-between p-3 rounded-lg border border-[var(--color-border)] hover:bg-[var(--color-bg)]/50">
                      <div className="flex items-center gap-3 min-w-0">
                        <FileText size={16} className="text-[var(--color-text-secondary)] flex-shrink-0" />
                        <div className="min-w-0">
                          <p className="text-sm font-medium text-[var(--color-text)] truncate">{doc.original_name || doc.filename}</p>
                          <p className="text-xs text-[var(--color-text-secondary)] capitalize">{doc.category} · {new Date(doc.uploaded_at).toLocaleDateString()}</p>
                        </div>
                      </div>
                      <div className="flex gap-1 flex-shrink-0 ml-3">
                        <button className="btn-ghost btn-sm" onClick={() => handleOpenDocument(doc.id)}><Eye size={14} /></button>
                        <button className="btn-ghost btn-sm text-red-400 hover:text-red-600" onClick={() => handleDeleteDocument(doc.id)}><Trash2 size={14} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="px-6 py-3 border-t border-[var(--color-border)] flex justify-end">
              <button className="btn-secondary btn-sm" onClick={() => setShowDocsModal(false)}>Done</button>
            </div>
          </div>
        </div>
      )}

      <EntityFormModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        onSave={() => { loadEntity(); }}
        entity={entity}
      />

      {/* Edit contractor patient modal — pencil icon in Unscheduled Patients launches this. */}
      <ContractorPatientEditModal
        patient={editingPatient}
        onClose={() => setEditingPatient(null)}
        onSaved={(updated) => {
          setContractorPatients(prev => prev.map(p => p.id === updated.id ? updated : p));
        }}
      />

      {/* Edit-appointment modal — opens when the user clicks a row in the appointments table. */}
      <AppointmentModal
        isOpen={editingAppt !== null}
        onClose={() => setEditingAppt(null)}
        appointment={editingAppt}
        onSave={async (data) => {
          if (!editingAppt) return;
          await window.api.appointments.update(editingAppt.id, data);
          // Refresh both the Appointments table and the Overview pipeline stats so
          // any rate / status / patient changes flow through immediately.
          await loadAppointments();
          await loadOverviewAppts().catch(() => {});
        }}
        onSaveBatch={async (items) => {
          // Used when the user opts an existing appointment into a recurring
          // series during edit — the modal updates the original via onSave and
          // then batch-creates the additional dates through this callback.
          await window.api.appointments.createBatch(items);
          await loadAppointments();
          await loadOverviewAppts().catch(() => {});
        }}
      />
    </div>
  );
};

export default EntityDetailPage;
