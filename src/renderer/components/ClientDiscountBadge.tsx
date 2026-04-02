import React from 'react';
import { Package, DollarSign, Percent, Tag } from 'lucide-react';
import type { ClientDiscount } from '../../shared/types';

interface ClientDiscountBadgeProps {
  discount: ClientDiscount;
  compact?: boolean;
}

export default function ClientDiscountBadge({ discount, compact }: ClientDiscountBadgeProps) {
  const { discount_type, status } = discount;

  if (status !== 'active' && status !== 'exhausted') return null;

  // Determine remaining sessions for urgency coloring
  let remaining = Infinity;
  let total = 0;
  let used = 0;

  if (discount_type === 'package') {
    total = discount.total_sessions || 0;
    used = discount.sessions_used || 0;
    remaining = total - used;
  } else if (discount_type === 'flat_rate') {
    total = discount.flat_rate_sessions || 0;
    used = discount.flat_rate_sessions_used || 0;
    remaining = total > 0 ? total - used : Infinity;
  }

  // Color by status/urgency
  let colorClasses = 'bg-emerald-100 text-emerald-700'; // active
  if (status === 'exhausted') {
    colorClasses = 'bg-gray-100 text-gray-600';
  } else if (remaining <= 2 && remaining !== Infinity) {
    colorClasses = 'bg-amber-100 text-amber-700';
  }

  // Icon
  const Icon = discount_type === 'package' ? Package
    : discount_type === 'flat_rate' ? DollarSign
    : discount_type === 'persistent' ? Percent
    : Tag;

  // Label
  let label = discount.label || '';
  if (!label) {
    if (discount_type === 'package') {
      label = `${discount.paid_sessions}+${(discount.total_sessions || 0) - (discount.paid_sessions || 0)} Package`;
    } else if (discount_type === 'flat_rate') {
      label = `$${discount.flat_rate}/session`;
    } else if (discount_type === 'persistent') {
      label = discount.discount_percent
        ? `${discount.discount_percent}% off`
        : `$${discount.discount_fixed} off`;
    }
  }

  if (compact) {
    return (
      <span className={`badge text-xs ${colorClasses}`}>
        <Icon size={10} className="mr-0.5" />
        {discount_type === 'package' || discount_type === 'flat_rate'
          ? `${remaining}/${total}`
          : label}
      </span>
    );
  }

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${colorClasses}`}>
      <Icon size={12} />
      <span>{label}</span>
      {(discount_type === 'package' || discount_type === 'flat_rate') && total > 0 && (
        <span className="opacity-70">({used}/{total} used)</span>
      )}
    </div>
  );
}
