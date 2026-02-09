import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  PenLine,
  Shield,
  FileText,
  Clock,
  ClipboardList,
} from 'lucide-react';
import { useTier } from '../hooks/useTier';
import type { BasicAlerts } from '../../shared/types';

interface AlertItem {
  key: string;
  urgency: 'overdue' | 'due_soon' | 'upcoming';
  icon: React.ReactNode;
  label: string;
  detail: string;
  onClick: () => void;
}

export default function BasicAlertsPanel() {
  const navigate = useNavigate();
  const { isBasicOrHigher } = useTier();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isBasicOrHigher) {
      setLoading(false);
      return;
    }
    loadAlerts();
  }, [isBasicOrHigher]);

  const loadAlerts = async () => {
    try {
      const data = await window.api.dashboard.getBasicAlerts();
      const items: AlertItem[] = [];

      // Unsigned notes
      for (const n of data.unsignedNotes) {
        items.push({
          key: `unsigned-${n.id}`,
          urgency: 'due_soon',
          icon: <PenLine size={14} />,
          label: `Unsigned note — ${n.client_name}`,
          detail: formatDate(n.date_of_service),
          onClick: () => navigate(`/clients/${n.client_id}/note/${n.id}`),
        });
      }

      // Compliance alerts
      for (const a of data.complianceAlerts) {
        const isOverdue = a.alert_type.includes('overdue');
        items.push({
          key: `compliance-${a.client_id}-${a.alert_type}-${a.detail}`,
          urgency: isOverdue ? 'overdue' : 'due_soon',
          icon: <Shield size={14} />,
          label: a.alert_type.includes('recert')
            ? `Recertification ${isOverdue ? 'overdue' : 'due soon'} — ${a.client_name}`
            : `Progress report ${isOverdue ? 'overdue' : 'due soon'} — ${a.client_name}`,
          detail: a.detail,
          onClick: () => navigate(`/clients/${a.client_id}`),
        });
      }

      // Expiring physician orders
      for (const o of data.expiringOrders) {
        const expDate = new Date(o.physician_order_expiration);
        const daysUntil = Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        items.push({
          key: `order-${o.client_id}`,
          urgency: daysUntil <= 0 ? 'overdue' : 'due_soon',
          icon: <FileText size={14} />,
          label: `Physician order ${daysUntil <= 0 ? 'expired' : 'expiring'} — ${o.client_name}`,
          detail: daysUntil <= 0
            ? `Expired ${formatDate(o.physician_order_expiration)}`
            : `Expires ${formatDate(o.physician_order_expiration)} (${daysUntil} days)`,
          onClick: () => navigate(`/clients/${o.client_id}`),
        });
      }

      // Authorization alerts
      for (const a of data.authorizationAlerts) {
        const visitsLow = a.units_approved > 0 && a.units_used / a.units_approved >= 0.8;
        const endSoon = a.end_date && new Date(a.end_date).getTime() - Date.now() < 30 * 24 * 60 * 60 * 1000;
        const daysLeft = a.end_date ? Math.ceil((new Date(a.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) : null;
        const isOverdue = daysLeft !== null && daysLeft <= 0;

        let detail = '';
        if (visitsLow) detail += `${a.units_used}/${a.units_approved} visits used`;
        if (visitsLow && endSoon) detail += ' · ';
        if (endSoon && daysLeft !== null) detail += isOverdue ? `Expired ${formatDate(a.end_date)}` : `Expires in ${daysLeft} days`;

        items.push({
          key: `auth-${a.client_id}-${a.end_date}`,
          urgency: isOverdue ? 'overdue' : 'due_soon',
          icon: <Clock size={14} />,
          label: `Authorization running low — ${a.client_name}`,
          detail,
          onClick: () => navigate(`/clients/${a.client_id}`),
        });
      }

      // Incomplete charts (critical only — missing DOB or diagnosis)
      for (const c of data.incompleteCharts) {
        items.push({
          key: `chart-${c.clientId}`,
          urgency: 'upcoming',
          icon: <ClipboardList size={14} />,
          label: `Incomplete chart — ${c.clientName}`,
          detail: `Missing: ${c.missingFields.join(', ')}`,
          onClick: () => navigate(`/clients/${c.clientId}`),
        });
      }

      // Sort by urgency: overdue first, then due_soon, then upcoming
      const urgencyOrder = { overdue: 0, due_soon: 1, upcoming: 2 };
      items.sort((a, b) => urgencyOrder[a.urgency] - urgencyOrder[b.urgency]);

      setAlerts(items);
    } catch (err) {
      console.error('Failed to load basic alerts:', err);
    } finally {
      setLoading(false);
    }
  };

  if (!isBasicOrHigher || loading) return null;
  if (alerts.length === 0) return null;

  const urgencyStyles = {
    overdue: {
      bg: 'bg-red-50 hover:bg-red-100',
      border: 'border-red-200',
      icon: 'text-red-500',
      text: 'text-red-800',
      detail: 'text-red-600',
    },
    due_soon: {
      bg: 'bg-amber-50 hover:bg-amber-100',
      border: 'border-amber-200',
      icon: 'text-amber-500',
      text: 'text-amber-800',
      detail: 'text-amber-600',
    },
    upcoming: {
      bg: 'bg-gray-50 hover:bg-gray-100',
      border: 'border-gray-200',
      icon: 'text-gray-400',
      text: 'text-gray-700',
      detail: 'text-gray-500',
    },
  };

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={16} className="text-amber-500" />
        <h2 className="text-sm font-semibold text-[var(--color-text)]">
          Needs Attention ({alerts.length})
        </h2>
      </div>
      <div className="space-y-1.5">
        {alerts.map((item) => {
          const style = urgencyStyles[item.urgency];
          return (
            <div
              key={item.key}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${style.bg} ${style.border}`}
              onClick={item.onClick}
            >
              <div className={`flex-shrink-0 ${style.icon}`}>{item.icon}</div>
              <div className="flex-1 min-w-0">
                <p className={`text-xs font-medium ${style.text} truncate`}>{item.label}</p>
                <p className={`text-xs ${style.detail} truncate`}>{item.detail}</p>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function formatDate(dateStr: string): string {
  if (!dateStr) return '';
  const d = new Date(dateStr + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
