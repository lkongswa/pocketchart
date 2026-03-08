import React, { useEffect, useRef, useCallback } from 'react';

export interface ContextMenuItem {
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  className?: string;
  dividerBefore?: boolean;
}

interface ContextMenuProps {
  x: number;
  y: number;
  items: ContextMenuItem[];
  onClose: () => void;
}

export default function ContextMenu({ x, y, items, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);

  // Adjust position if menu would overflow viewport
  const getPosition = useCallback(() => {
    const menuWidth = 200;
    const menuHeight = items.length * 36 + 8;
    const adjX = x + menuWidth > window.innerWidth ? x - menuWidth : x;
    const adjY = y + menuHeight > window.innerHeight ? Math.max(4, y - menuHeight) : y;
    return { top: adjY, left: adjX };
  }, [x, y, items.length]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  const pos = getPosition();

  return (
    <div
      ref={menuRef}
      className="fixed z-50 bg-white rounded-lg shadow-xl border border-[var(--color-border)] py-1 min-w-[180px]"
      style={{ top: pos.top, left: pos.left }}
    >
      {items.map((item, i) => (
        <React.Fragment key={i}>
          {item.dividerBefore && (
            <div className="border-t border-[var(--color-border)] my-1" />
          )}
          <button
            className={`w-full text-left px-3 py-2 text-sm hover:bg-gray-50 flex items-center gap-2 transition-colors ${item.className || ''}`}
            onClick={() => {
              item.onClick();
              onClose();
            }}
          >
            {item.icon}
            {item.label}
          </button>
        </React.Fragment>
      ))}
    </div>
  );
}
