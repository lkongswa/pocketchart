import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, Plus, Users, Eye, Tag, FileText, ClipboardList, Receipt } from 'lucide-react';
import type { Client, ClientStatus, Discipline } from '../../shared/types';
import ClientFormModal from '../components/ClientFormModal';
import TrialExpiredModal from '../components/TrialExpiredModal';
import ContextMenu, { type ContextMenuItem } from '../components/ContextMenu';
import { useTrialGuard } from '../hooks/useTrialGuard';

const statusBadgeClass: Record<ClientStatus, string> = {
  active: 'badge-active',
  discharged: 'badge-discharged',
  hold: 'badge-hold',
};

const statusLabel: Record<ClientStatus, string> = {
  active: 'Active',
  discharged: 'Discharged',
  hold: 'On Hold',
};

const disciplineBadgeClass: Record<Discipline, string> = {
  PT: 'badge-pt',
  OT: 'badge-ot',
  ST: 'badge-st',
  MFT: 'badge-mft',
};

const ClientsPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { guardAction, showExpiredModal, dismissExpiredModal } = useTrialGuard();

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [disciplineFilter, setDisciplineFilter] = useState<string>('');
  const [modalOpen, setModalOpen] = useState(false);
  const [discountClientIds, setDiscountClientIds] = useState<Set<number>>(new Set());

  // Compliance badges state
  const [clientAlerts, setClientAlerts] = useState<Map<number, string[]>>(new Map());

  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; client: Client } | null>(null);

  // Auto-open modal for waitlist conversion
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    if (params.get('fromWaitlist') === '1') {
      setModalOpen(true);
      // Clean the URL param without triggering navigation
      navigate('/clients', { replace: true });
    }
  }, [location.search]);

  const loadClients = useCallback(async () => {
    setLoading(true);
    try {
      const filters: { status?: string; discipline?: string; search?: string } = {};
      if (statusFilter) filters.status = statusFilter;
      if (disciplineFilter) filters.discipline = disciplineFilter;
      if (search.trim()) filters.search = search.trim();
      const data = await window.api.clients.list(filters);
      setClients(data);

      // Load which clients have active discounts
      const ids = new Set<number>();
      for (const c of data) {
        try {
          const d = await window.api.clientDiscounts.getActive(c.id);
          if (d && d.length > 0) ids.add(c.id);
        } catch { /* ignore */ }
      }
      setDiscountClientIds(ids);

      // Load compliance alerts for badges
      try {
        const alertData = await window.api.dashboard.getBasicAlerts();
        const alertMap = new Map<number, string[]>();
        const addAlert = (clientId: number, alertType: string) => {
          const existing = alertMap.get(clientId) || [];
          if (!existing.includes(alertType)) existing.push(alertType);
          alertMap.set(clientId, existing);
        };
        for (const a of (alertData.complianceAlerts || [])) addAlert(a.client_id, a.alert_type || 'compliance');
        for (const o of (alertData.expiringOrders || [])) addAlert(o.client_id, 'order_expiring');
        for (const a of (alertData.authorizationAlerts || [])) addAlert(a.client_id, 'auth_low');
        for (const n of (alertData.unsignedNotes || [])) addAlert(n.client_id, 'unsigned_note');
        setClientAlerts(alertMap);
      } catch { /* alerts are advisory, don't block page */ }
    } catch (err) {
      console.error('Failed to load clients:', err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter, disciplineFilter, search]);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const handleClientSaved = () => {
    loadClients();
  };

  const formatDate = (dateStr: string): string => {
    if (!dateStr) return '--';
    try {
      // Handle both date-only ("2025-01-15") and datetime ("2025-01-15 14:30:00") strings
      const normalized = dateStr.includes('T') || dateStr.includes(' ')
        ? dateStr.replace(' ', 'T')
        : dateStr + 'T00:00:00';
      return new Date(normalized).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  const getContextMenuItems = (client: Client): ContextMenuItem[] => [
    { label: 'New Note', icon: <FileText size={14} />, onClick: () => navigate(`/clients/${client.id}/note/new`) },
    { label: 'New Eval', icon: <ClipboardList size={14} />, onClick: () => navigate(`/clients/${client.id}/eval/new`) },
    { label: 'View Chart', icon: <Eye size={14} />, onClick: () => navigate(`/clients/${client.id}`) },
    { label: 'Generate Superbill', icon: <Receipt size={14} />, onClick: () => navigate(`/clients/${client.id}/superbill`), dividerBefore: true },
  ];

  // Helper: render compliance alert dots for a client
  const renderAlertDots = (clientId: number) => {
    const alerts = clientAlerts.get(clientId);
    if (!alerts || alerts.length === 0) return null;
    const hasOverdue = alerts.some(a => a.includes('overdue'));
    const hasDueSoon = alerts.some(a => a.includes('due') && !a.includes('overdue'));
    const hasUnsigned = alerts.includes('unsigned_note');
    const hasAuth = alerts.includes('auth_low');
    const hasOrder = alerts.includes('order_expiring');
    return (
      <>
        {hasOverdue && <span className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" title="Compliance item overdue" />}
        {(hasDueSoon || hasOrder || hasAuth) && !hasOverdue && <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" title="Compliance item due soon" />}
        {hasUnsigned && <span className="w-1.5 h-1.5 rounded-full bg-blue-400 flex-shrink-0" title="Has unsigned notes" />}
      </>
    );
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Clients</h1>
        <button className="btn-primary gap-2" onClick={() => { if (guardAction()) setModalOpen(true); }}>
          <Plus size={18} />
          Add Client
        </button>
      </div>

      {/* Filters Row */}
      <div className="flex items-center gap-4 mb-6">
        {/* Search */}
        <div className="relative flex-1 max-w-md">
          <Search
            size={16}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--color-text-secondary)]"
          />
          <input
            type="text"
            className="input pl-9"
            placeholder="Search clients by name..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>

        {/* Status Filter */}
        <select
          className="select-bare w-auto text-xs py-1.5 px-3"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
        >
          <option value="">All Statuses</option>
          <option value="active">Active</option>
          <option value="discharged">Discharged</option>
          <option value="hold">On Hold</option>
        </select>

        {/* Discipline Filter */}
        <select
          className="select-bare w-auto text-xs py-1.5 px-3"
          value={disciplineFilter}
          onChange={(e) => setDisciplineFilter(e.target.value)}
        >
          <option value="">All Disciplines</option>
          <option value="PT">PT</option>
          <option value="OT">OT</option>
          <option value="ST">ST</option>
        </select>
      </div>

      {/* Client Table */}
      {loading ? (
        <div className="card p-12 text-center text-[var(--color-text-secondary)]">
          Loading clients...
        </div>
      ) : clients.length === 0 ? (
        <div className="card p-12 text-center">
          <Users size={48} className="mx-auto text-[var(--color-text-secondary)] mb-4 opacity-40" />
          <h3 className="text-lg font-semibold text-[var(--color-text)] mb-2">No clients found</h3>
          <p className="text-sm text-[var(--color-text-secondary)] mb-6">
            {search || statusFilter || disciplineFilter
              ? 'Try adjusting your search or filters.'
              : 'Get started by adding your first client.'}
          </p>
          <button className="btn-primary gap-2" onClick={() => { if (guardAction()) setModalOpen(true); }}>
            <Plus size={18} />
            Add Client
          </button>
        </div>
      ) : (
        <div className="card overflow-hidden">
          <table className="w-full">
            <thead>
              <tr className="border-b border-[var(--color-border)]">
                <th className="table-header">Name</th>
                <th className="table-header">DOB</th>
                <th className="table-header">Discipline</th>
                <th className="table-header">Diagnosis</th>
                <th className="table-header">Status</th>
                <th className="table-header">Last Updated</th>
                <th className="table-header">Actions</th>
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr
                  key={client.id}
                  className="group border-b border-[var(--color-border)] last:border-b-0 hover:bg-gray-50/50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/clients/${client.id}`)}
                  onContextMenu={(e) => {
                    e.preventDefault();
                    setContextMenu({ x: e.clientX, y: e.clientY, client });
                  }}
                >
                  <td className="table-cell font-medium">
                    <span className="flex items-center gap-1.5">
                      {client.last_name}, {client.first_name}
                      {(!client.dob || !client.primary_dx_code) && (
                        <span className="w-2 h-2 rounded-full bg-red-400 flex-shrink-0" title="Chart incomplete — missing required fields" />
                      )}
                      {renderAlertDots(client.id)}
                      {discountClientIds.has(client.id) && (
                        <span title="Active discount/package"><Tag size={12} className="text-emerald-500 flex-shrink-0" /></span>
                      )}
                    </span>
                  </td>
                  <td className="table-cell text-[var(--color-text-secondary)]">
                    {client.dob ? (() => { try { const d = new Date(client.dob + 'T00:00:00'); return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()}`; } catch { return client.dob; } })() : '--'}
                  </td>
                  <td className="table-cell">
                    <span className={disciplineBadgeClass[client.discipline]}>
                      {client.discipline}
                    </span>
                  </td>
                  <td className="table-cell text-[var(--color-text-secondary)]">
                    {client.primary_dx_description || client.primary_dx_code || '--'}
                  </td>
                  <td className="table-cell">
                    <span className={statusBadgeClass[client.status]}>
                      {statusLabel[client.status]}
                    </span>
                  </td>
                  <td className="table-cell text-[var(--color-text-secondary)]">
                    {formatDate(client.updated_at)}
                  </td>
                  <td className="table-cell">
                    <div className="flex items-center gap-1">
                      <button
                        className="btn-ghost p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="New Note"
                        onClick={(e) => { e.stopPropagation(); navigate(`/clients/${client.id}/note/new`); }}
                      >
                        <FileText size={14} />
                      </button>
                      <button
                        className="btn-ghost p-1.5 opacity-0 group-hover:opacity-100 transition-opacity"
                        title="New Eval"
                        onClick={(e) => { e.stopPropagation(); navigate(`/clients/${client.id}/eval/new`); }}
                      >
                        <ClipboardList size={14} />
                      </button>
                      <button
                        className="btn-ghost p-1.5"
                        title="View Chart"
                        onClick={(e) => { e.stopPropagation(); navigate(`/clients/${client.id}`); }}
                      >
                        <Eye size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Right-click context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          items={getContextMenuItems(contextMenu.client)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Add Client Modal */}
      <ClientFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleClientSaved}
      />

      {/* Trial Expired Modal */}
      {showExpiredModal && <TrialExpiredModal onClose={dismissExpiredModal} />}
    </div>
  );
};

export default ClientsPage;
