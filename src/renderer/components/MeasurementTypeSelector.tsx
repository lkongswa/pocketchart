import React, { useState } from 'react';
import type { Discipline, MeasurementType } from '../../shared/types';
import { MEASUREMENT_TYPE_LABELS } from '../../shared/types';
import { DISCIPLINE_MEASUREMENT_OPTIONS } from '../../shared/goal-metrics';

interface MeasurementTypeSelectorProps {
  currentType: MeasurementType;
  discipline: Discipline;
  onChange: (type: MeasurementType) => void;
  disabled?: boolean;
}

const MeasurementTypeSelector: React.FC<MeasurementTypeSelectorProps> = ({
  currentType,
  discipline,
  onChange,
  disabled = false,
}) => {
  const [expanded, setExpanded] = useState(false);
  const options = DISCIPLINE_MEASUREMENT_OPTIONS[discipline] || [];

  // Short label for collapsed view
  const shortLabel = MEASUREMENT_TYPE_LABELS[currentType]?.split(' (')[0] || currentType;

  if (disabled) {
    return (
      <div className="text-[10px] text-[var(--color-text-secondary)]">
        Measured by: <span className="font-semibold">{shortLabel}</span>
      </div>
    );
  }

  if (!expanded) {
    return (
      <div className="text-[10px] text-[var(--color-text-secondary)]">
        Measured by: <span className="font-semibold">{shortLabel}</span>
        {' '}
        <button
          type="button"
          className="text-[var(--color-primary)] hover:underline"
          onClick={() => setExpanded(true)}
        >
          (change)
        </button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-[var(--color-text-secondary)] shrink-0">Measured by:</span>
      <select
        className="select text-xs py-0.5 px-1.5"
        value={currentType}
        onChange={(e) => {
          onChange(e.target.value as MeasurementType);
          setExpanded(false);
        }}
        onBlur={() => setExpanded(false)}
        autoFocus
      >
        {options.map(type => (
          <option key={type} value={type}>
            {MEASUREMENT_TYPE_LABELS[type]?.split(' (')[0] || type}
          </option>
        ))}
      </select>
    </div>
  );
};

export default MeasurementTypeSelector;
