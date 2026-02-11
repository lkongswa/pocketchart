import React from 'react';

interface FieldBlockProps {
  label?: string;
  children: React.ReactNode;
  className?: string;
}

const FieldBlock: React.FC<FieldBlockProps> = ({ label, children, className = '' }) => (
  <div className={`p-2.5 rounded-lg bg-gray-50 border border-[var(--color-border)] ${className}`}>
    {label && (
      <label className="block text-[10px] font-semibold text-[var(--color-text-secondary)] mb-1.5">
        {label}
      </label>
    )}
    {children}
  </div>
);

export default FieldBlock;
