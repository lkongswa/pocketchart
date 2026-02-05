import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  LayoutDashboard, AlertTriangle, FileText, Shield, Clock,
  CreditCard, Calendar, ChevronRight,
} from 'lucide-react';
import type { DashboardOverview } from '@shared/types';
import ProFeatureGate from '../components/ProFeatureGate';

const formatCurrency = (amount: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);

export default function CaseloadDashboardPage() {
  const navigate = useNavigate();
  const [data, setData] = useState<DashboardOverview | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function load() {
      try {
        const overview = await window.api.dashboard.getOverview();
        setData(overview);
      } catch (err) {
        console.error('Failed to load dashboard:', err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const content = (
    <div className="p-6">
      <div className="mb-6">
        <h1 className="page-title flex items-center gap-2">
          <LayoutDashboard className="w-6 h-6 text-[var(--color-primary)]" />
          Caseload Dashboard
        </h1>
        <p className="text-sm text-[var(--color-text-secondary)]">
          Needs Attention — items requiring your action.
        </p>
      </div>

      {loading ? (
        <div className="card p-12 text-center text-[var(--color-text-secondary)]">Loading dashboard...</div>
      ) : !data ? (
        <div className="card p-12 text-center text-[var(--color-text-secondary)]">Failed to load dashboard data.</div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Today's Appointments */}
          <div className="card p-5">
            <h3 className="section-title flex items-center gap-2 mb-3">
              <Calendar size={16} className="text-[var(--color-primary)]" />
              Today's Appointments ({data.todayAppointments.length})
            </h3>
            {data.todayAppointments.length === 0 ? (
              <p className="text-sm text-[var(--color-text-secondary)]">No appointments today.</p>
            ) : (
              <div className="space-y-2">
                {data.todayAppointments.slice(0, 5).map((appt) => (
                  <div key={appt.id} className="flex items-center justify-between p-2 rounded-lg bg-[var(--color-bg)]">
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text)]">
                        {appt.first_name} {appt.last_name}
                      </p>
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        {appt.scheduled_time} · {appt.duration_minutes}min
                      </p>
                    </div>
                    <span className={`badge text-xs ${
                      appt.status === 'completed' ? 'bg-green-100 text-green-700' :
                      appt.status === 'cancelled' ? 'bg-red-100 text-red-700' :
                      'bg-blue-100 text-blue-700'
                    }`}>
                      {appt.status}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Unsigned Notes */}
          <div className="card p-5">
            <h3 className="section-title flex items-center gap-2 mb-3">
              <FileText size={16} className="text-amber-500" />
              Unsigned Notes ({data.unsignedNotes.length})
            </h3>
            {data.unsignedNotes.length === 0 ? (
              <p className="text-sm text-[var(--color-text-secondary)]">All notes are signed.</p>
            ) : (
              <div className="space-y-2">
                {data.unsignedNotes.slice(0, 5).map((note) => (
                  <button
                    key={note.id}
                    className="w-full flex items-center justify-between p-2 rounded-lg bg-amber-50/50 hover:bg-amber-50 transition-colors text-left"
                    onClick={() => navigate(`/clients/${note.client_id}/note/${note.id}`)}
                  >
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text)]">{note.client_name}</p>
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        {new Date(note.date_of_service + 'T00:00:00').toLocaleDateString()}
                      </p>
                    </div>
                    <ChevronRight size={14} className="text-[var(--color-text-secondary)]" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Compliance Alerts */}
          <div className="card p-5">
            <h3 className="section-title flex items-center gap-2 mb-3">
              <AlertTriangle size={16} className="text-red-500" />
              Compliance Alerts ({data.complianceAlerts.length})
            </h3>
            {data.complianceAlerts.length === 0 ? (
              <p className="text-sm text-[var(--color-text-secondary)]">No compliance alerts.</p>
            ) : (
              <div className="space-y-2">
                {data.complianceAlerts.slice(0, 5).map((alert, idx) => (
                  <button
                    key={idx}
                    className="w-full flex items-center justify-between p-2 rounded-lg bg-red-50/50 hover:bg-red-50 transition-colors text-left"
                    onClick={() => navigate(`/clients/${alert.client_id}`)}
                  >
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text)]">{alert.client_name}</p>
                      <p className="text-xs text-red-600">{alert.detail}</p>
                    </div>
                    <ChevronRight size={14} className="text-[var(--color-text-secondary)]" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Expiring Credentials */}
          <div className="card p-5">
            <h3 className="section-title flex items-center gap-2 mb-3">
              <Shield size={16} className="text-amber-500" />
              Expiring Credentials ({data.expiringCredentials.length})
            </h3>
            {data.expiringCredentials.length === 0 ? (
              <p className="text-sm text-[var(--color-text-secondary)]">No credentials expiring soon.</p>
            ) : (
              <div className="space-y-2">
                {data.expiringCredentials.slice(0, 5).map((doc) => (
                  <div key={doc.id} className="flex items-center justify-between p-2 rounded-lg bg-amber-50/50">
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text)]">
                        {doc.custom_label || doc.original_name}
                      </p>
                      <p className="text-xs text-amber-600">
                        Expires {doc.expiration_date ? new Date(doc.expiration_date + 'T00:00:00').toLocaleDateString() : 'unknown'}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Outstanding Invoices */}
          <div className="card p-5">
            <h3 className="section-title flex items-center gap-2 mb-3">
              <CreditCard size={16} className="text-green-500" />
              Outstanding Invoices ({data.outstandingInvoices.length})
            </h3>
            {data.outstandingInvoices.length === 0 ? (
              <p className="text-sm text-[var(--color-text-secondary)]">No outstanding invoices.</p>
            ) : (
              <div className="space-y-2">
                {data.outstandingInvoices.slice(0, 5).map((inv) => (
                  <div key={inv.id} className="flex items-center justify-between p-2 rounded-lg bg-[var(--color-bg)]">
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text)]">
                        Invoice #{inv.invoice_number}
                      </p>
                      <p className="text-xs text-[var(--color-text-secondary)]">
                        {inv.entity_name || `Client #${inv.client_id}`}
                      </p>
                    </div>
                    <span className="text-sm font-semibold text-green-600">
                      {formatCurrency(inv.total_amount)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Expiring Physician Orders */}
          <div className="card p-5">
            <h3 className="section-title flex items-center gap-2 mb-3">
              <Clock size={16} className="text-purple-500" />
              Expiring Physician Orders ({data.expiringOrders.length})
            </h3>
            {data.expiringOrders.length === 0 ? (
              <p className="text-sm text-[var(--color-text-secondary)]">No orders expiring soon.</p>
            ) : (
              <div className="space-y-2">
                {data.expiringOrders.slice(0, 5).map((order) => (
                  <button
                    key={order.id}
                    className="w-full flex items-center justify-between p-2 rounded-lg bg-purple-50/50 hover:bg-purple-50 transition-colors text-left"
                    onClick={() => navigate(`/clients/${order.client_id}`)}
                  >
                    <div>
                      <p className="text-sm font-medium text-[var(--color-text)]">
                        Client #{order.client_id}
                      </p>
                      <p className="text-xs text-purple-600">
                        Order expires {order.physician_order_expiration
                          ? new Date(order.physician_order_expiration + 'T00:00:00').toLocaleDateString()
                          : 'date unknown'}
                      </p>
                    </div>
                    <ChevronRight size={14} className="text-[var(--color-text-secondary)]" />
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );

  return (
    <ProFeatureGate feature="caseload_dashboard">
      {content}
    </ProFeatureGate>
  );
}
