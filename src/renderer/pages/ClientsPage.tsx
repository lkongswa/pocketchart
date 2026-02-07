import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Plus, Users, Eye } from 'lucide-react';
import type { Client, ClientStatus, Discipline } from '../../shared/types';
import ClientFormModal from '../components/ClientFormModal';

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

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [disciplineFilter, setDisciplineFilter] = useState<string>('');
  const [modalOpen, setModalOpen] = useState(false);

  const loadClients = useCallback(async () => {
    setLoading(true);
    try {
      const filters: { status?: string; discipline?: string; search?: string } = {};
      if (statusFilter) filters.status = statusFilter;
      if (disciplineFilter) filters.discipline = disciplineFilter;
      if (search.trim()) filters.search = search.trim();
      const data = await window.api.clients.list(filters);
      setClients(data);
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
      return new Date(dateStr).toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="p-6">
      {/* Header */}
      <div className="page-header">
        <h1 className="page-title">Clients</h1>
        <button className="btn-primary gap-2" onClick={() => setModalOpen(true)}>
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
          className="select w-auto"
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
          className="select w-auto"
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
          <button className="btn-primary gap-2" onClick={() => setModalOpen(true)}>
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
                  className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-gray-50/50 cursor-pointer transition-colors"
                  onClick={() => navigate(`/clients/${client.id}`)}
                >
                  <td className="table-cell font-medium">
                    {client.last_name}, {client.first_name}
                  </td>
                  <td className="table-cell text-[var(--color-text-secondary)]">
                    {formatDate(client.dob)}
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
                    <button
                      className="btn-ghost btn-sm gap-1.5"
                      onClick={(e) => {
                        e.stopPropagation();
                        navigate(`/clients/${client.id}`);
                      }}
                    >
                      <Eye size={14} />
                      View
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add Client Modal */}
      <ClientFormModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        onSave={handleClientSaved}
      />
    </div>
  );
};

export default ClientsPage;
