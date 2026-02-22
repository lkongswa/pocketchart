import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  PenLine,
  Shield,
  FileText,
  Clock,
  ClipboardList,
  ChevronRight,
  CheckCircle,
} from 'lucide-react';
import { useTier } from '../hooks/useTier';
import type { BasicAlerts } from '../../shared/types';

interface AlertItem {
  key: string;
  category: string;
  urgency: 'overdue' | 'due_soon' | 'upcoming';
  icon: React.ReactNode;
  label: string;
  detail: string;
  onClick: () => void;
}

interface AlertCategory {
  id: string;
  label: string;
  icon: React.ReactNode;
  items: AlertItem[];
  highestUrgency: 'overdue' | 'due_soon' | 'upcoming';
}

const URGENCY_ORDER = { overdue: 0, due_soon: 1, upcoming: 2 } as const;

export default function BasicAlertsPanel() {
  const navigate = useNavigate();
  const { isBasicOrHigher } = useTier();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());

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
          category: 'unsigned',
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
        const isRecert = a.alert_type.includes('recert');
        items.push({
          key: `compliance-${a.client_id}-${a.alert_type}-${a.detail}`,
          category: 'compliance',
          urgency: isOverdue ? 'overdue' : 'due_soon',
          icon: <Shield size={14} />,
          label: isRecert
            ? `Recertification ${isOverdue ? 'overdue' : 'due soon'} — ${a.client_name}`
            : `Progress report ${isOverdue ? 'overdue' : 'due soon'} — ${a.client_name}`,
          detail: a.detail,
          onClick: () => isRecert
            ? navigate(`/clients/${a.client_id}/eval/new?type=reassessment`)
            : navigate(`/clients/${a.client_id}/note/new?type=progress_report`),
        });
      }

      // Expiring physician orders
      for (const o of data.expiringOrders) {
        const expDate = new Date(o.physician_order_expiration);
        const daysUntil = Math.ceil((expDate.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        items.push({
          key: `order-${o.client_id}`,
          category: 'orders',
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
          category: 'auth',
          urgency: isOverdue ? 'overdue' : 'due_soon',
          icon: <Clock size={14} />,
          label: `Authorization running low — ${a.client_name}`,
          detail,
          onClick: () => navigate(`/clients/${a.client_id}`),
        });
      }

      // Incomplete charts
      for (const c of data.incompleteCharts) {
        items.push({
          key: `chart-${c.clientId}`,
          category: 'charts',
          urgency: 'upcoming',
          icon: <ClipboardList size={14} />,
          label: `Incomplete chart — ${c.clientName}`,
          detail: `Missing: ${c.missingFields.join(', ')}`,
          onClick: () => navigate(`/clients/${c.clientId}`),
        });
      }

      setAlerts(items);
    } catch (err) {
      console.error('Failed to load basic alerts:', err);
    } finally {
      setLoading(false);
    }
  };

  const toggleCategory = (id: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!isBasicOrHigher || loading) return null;

  // Build categories from alerts
  const categoryDefs: { id: string; label: string; icon: React.ReactNode }[] = [
    { id: 'unsigned', label: 'Unsigned Notes', icon: <PenLine size={15} /> },
    { id: 'compliance', label: 'Compliance Alerts', icon: <Shield size={15} /> },
    { id: 'orders', label: 'Expiring Orders', icon: <FileText size={15} /> },
    { id: 'auth', label: 'Authorization Alerts', icon: <Clock size={15} /> },
    { id: 'charts', label: 'Incomplete Charts', icon: <ClipboardList size={15} /> },
  ];

  const categories: AlertCategory[] = categoryDefs
    .map((def) => {
      const items = alerts.filter((a) => a.category === def.id);
      if (items.length === 0) return null;
      const highestUrgency = items.reduce<'overdue' | 'due_soon' | 'upcoming'>(
        (best, item) => (URGENCY_ORDER[item.urgency] < URGENCY_ORDER[best] ? item.urgency : best),
        'upcoming'
      );
      return { ...def, items, highestUrgency };
    })
    .filter(Boolean) as AlertCategory[];

  // Hide entirely when nothing needs attention (1D dashboard polish)
  if (categories.length === 0) {
    return null;
  }

  const urgencyStyles = {
    overdue: {
      bg: 'bg-red-50 hover:bg-red-100',
      border: 'border-red-200',
      icon: 'text-red-500',
      text: 'text-red-800',
      detail: 'text-red-600',
      dot: 'bg-red-500',
      badge: 'bg-red-100 text-red-700',
    },
    due_soon: {
      bg: 'bg-amber-50 hover:bg-amber-100',
      border: 'border-amber-200',
      icon: 'text-amber-500',
      text: 'text-amber-800',
      detail: 'text-amber-600',
      dot: 'bg-amber-500',
      badge: 'bg-amber-100 text-amber-700',
    },
    upcoming: {
      bg: 'bg-gray-50 hover:bg-gray-100',
      border: 'border-gray-200',
      icon: 'text-gray-400',
      text: 'text-gray-700',
      detail: 'text-gray-500',
      dot: 'bg-gray-400',
      badge: 'bg-gray-100 text-gray-600',
    },
  };

  const totalCount = categories.reduce((sum, c) => sum + c.items.length, 0);

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2 mb-3">
        <AlertTriangle size={16} className="text-amber-500" />
        <h2 className="text-sm font-semibold text-[var(--color-text)]">
          Needs Attention ({totalCount})
        </h2>
      </div>
      <div className="space-y-2">
        {categories.map((cat) => {
          const expanded = expandedCategories.has(cat.id);
          const style = urgencyStyles[cat.highestUrgency];
          return (
            <div key={cat.id}>
              <button
                className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg border cursor-pointer transition-colors ${
                  expanded ? 'bg-white border-[var(--color-border)]' : `${style.bg} ${style.border}`
                }`}
                onClick={() => toggleCategory(cat.id)}
              >
                <div className={`flex-shrink-0 ${style.icon}`}>{cat.icon}</div>
                <span className="text-sm font-medium text-[var(--color-text)] flex-1 text-left">{cat.label}</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${style.badge}`}>
                  {cat.items.length}
                </span>
                <ChevronRight
                  size={14}
                  className={`text-gray-400 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
                />
              </button>
              {expanded && (
                <div className="mt-1 ml-2 space-y-1">
                  {cat.items.map((item) => {
                    const itemStyle = urgencyStyles[item.urgency];
                    return (
                      <div
                        key={item.key}
                        className={`flex items-center gap-3 px-3 py-2 rounded-lg border cursor-pointer transition-colors ${itemStyle.bg} ${itemStyle.border}`}
                        onClick={item.onClick}
                      >
                        <div className={`flex-shrink-0 ${itemStyle.icon}`}>{item.icon}</div>
                        <div className="flex-1 min-w-0">
                          <p className={`text-xs font-medium ${itemStyle.text} truncate`}>{item.label}</p>
                          <p className={`text-xs ${itemStyle.detail} truncate`}>{item.detail}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
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
