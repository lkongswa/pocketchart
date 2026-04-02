import React from 'react';
import { CheckCircle, AlertCircle, AlertTriangle, ChevronRight } from 'lucide-react';
import type { CompletenessResult } from '../hooks/useChartCompleteness';

interface ChartCompletenessProps {
  result: CompletenessResult;
  onCompleteChart: () => void;
}

/**
 * Chart completeness indicator for the Client Detail Page.
 * Displays a status-appropriate message with missing field details.
 *
 * - Complete:        Small green checkmark, minimal footprint
 * - Needs attention: Amber indicator with missing field list
 * - Critical:        Red indicator emphasizing required fields
 */
export default function ChartCompleteness({ result, onCompleteChart }: ChartCompletenessProps) {
  const { complete, total, missing, status } = result;

  if (status === 'complete') {
    return (
      <div className="flex items-center gap-1.5 text-green-600">
        <CheckCircle className="w-3.5 h-3.5" />
        <span className="text-xs font-medium">Chart Complete</span>
      </div>
    );
  }

  if (status === 'critical') {
    const requiredMissing = missing.filter(m => m.priority === 'required');
    return (
      <div className="rounded-lg border border-red-200 bg-red-50/60 px-3.5 py-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <AlertCircle className="w-4 h-4 text-red-500 flex-shrink-0 mt-0.5" />
            <div className="min-w-0">
              <p className="text-xs font-semibold text-red-800">
                Chart Incomplete — Missing Required Fields
              </p>
              <p className="text-[11px] text-red-700 mt-0.5">
                {requiredMissing.map(m => m.field).join(' and ')} {requiredMissing.length === 1 ? 'is' : 'are'} needed for compliant documentation.
              </p>
              {missing.length > requiredMissing.length && (
                <p className="text-[11px] text-red-600/70 mt-0.5">
                  +{missing.length - requiredMissing.length} recommended field{missing.length - requiredMissing.length > 1 ? 's' : ''} also missing
                </p>
              )}
            </div>
          </div>
          <button
            onClick={onCompleteChart}
            className="flex items-center gap-1 text-xs font-medium text-red-700 hover:text-red-800 whitespace-nowrap flex-shrink-0"
          >
            Complete Chart
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    );
  }

  // needs-attention
  const missingNames = missing.map(m => m.field);
  return (
    <div className="rounded-lg border border-amber-200 bg-amber-50/60 px-3.5 py-2.5">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-2 min-w-0">
          <AlertTriangle className="w-4 h-4 text-amber-500 flex-shrink-0 mt-0.5" />
          <div className="min-w-0">
            <p className="text-xs font-medium text-amber-800">
              {complete} of {total} fields complete
            </p>
            <p className="text-[11px] text-amber-700 mt-0.5">
              Missing: {missingNames.join(', ')}
            </p>
          </div>
        </div>
        <button
          onClick={onCompleteChart}
          className="flex items-center gap-1 text-xs font-medium text-amber-700 hover:text-amber-800 whitespace-nowrap flex-shrink-0"
        >
          Complete Chart
          <ChevronRight className="w-3.5 h-3.5" />
        </button>
      </div>
    </div>
  );
}
