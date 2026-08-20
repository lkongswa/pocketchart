import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, User, Building2, LayoutDashboard, Calendar, FileText, ClipboardList,
  Receipt, Settings, FolderOpen, Car, Printer, FileInput, BarChart3, HelpCircle,
} from 'lucide-react';
import type { ContractedEntity } from '@shared/types';

/**
 * CommandPalette — Ctrl+K quick-jump overlay. Type a few letters to jump to any
 * client chart, contracted agency, or app page from anywhere in the app.
 */

interface PaletteItem {
  key: string;
  label: string;
  sub?: string;
  path: string;
  group: 'Pages' | 'Clients' | 'Agencies';
  icon: React.ReactNode;
}

const PAGES: { label: string; path: string; icon: React.ReactNode }[] = [
  { label: 'Dashboard',           path: '/',             icon: <LayoutDashboard size={15} /> },
  { label: 'Calendar',            path: '/calendar',     icon: <Calendar size={15} /> },
  { label: 'Clients',             path: '/clients',      icon: <User size={15} /> },
  { label: 'Contracted Entities', path: '/entities',     icon: <Building2 size={15} /> },
  { label: 'Notes',               path: '/notes',        icon: <FileText size={15} /> },
  { label: 'Evaluations Queue',   path: '/evals',        icon: <ClipboardList size={15} /> },
  { label: 'Billing',             path: '/billing',      icon: <Receipt size={15} /> },
  { label: 'Intake Forms',        path: '/intake-forms', icon: <FileInput size={15} /> },
  { label: 'Fax',                 path: '/fax',          icon: <Printer size={15} /> },
  { label: 'Professional Vault',  path: '/vault',        icon: <FolderOpen size={15} /> },
  { label: 'Mileage',             path: '/mileage',      icon: <Car size={15} /> },
  { label: 'Reports',             path: '/reports',      icon: <BarChart3 size={15} /> },
  { label: 'Settings',            path: '/settings',     icon: <Settings size={15} /> },
  { label: 'Help',                path: '/help',         icon: <HelpCircle size={15} /> },
];

// startsWith beats includes; both are case-insensitive.
function matchRank(label: string, q: string): number {
  const l = label.toLowerCase();
  if (l.startsWith(q)) return 0;
  const words = l.split(/\s+/);
  if (words.some((w) => w.startsWith(q))) return 1;
  if (l.includes(q)) return 2;
  return -1;
}

export default function CommandPalette() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(0);
  const [clients, setClients] = useState<any[]>([]);
  const [entities, setEntities] = useState<ContractedEntity[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // Global Ctrl/Cmd+K toggle.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Load fresh data each time the palette opens (cheap; both are local queries).
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setSelected(0);
    setTimeout(() => inputRef.current?.focus(), 0);
    window.api.clients.list().then(setClients).catch(() => setClients([]));
    // Pro-gated; non-pro tiers just get no agency results.
    window.api.contractedEntities.list().then(setEntities).catch(() => setEntities([]));
  }, [open]);

  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase();

    const rankAndSort = <T,>(list: T[], labelOf: (x: T) => string): { item: T; rank: number }[] =>
      list
        .map((item) => ({ item, rank: matchRank(labelOf(item), q) }))
        .filter((x) => x.rank >= 0)
        .sort((a, b) => a.rank - b.rank || labelOf(a.item).localeCompare(labelOf(b.item)));

    const pageItems: PaletteItem[] = (q ? rankAndSort(PAGES, (p) => p.label).map((x) => x.item) : PAGES)
      .map((p) => ({ key: `page:${p.path}`, label: p.label, path: p.path, group: 'Pages' as const, icon: p.icon }));

    if (!q) return pageItems; // no query → just the page list

    const clientItems: PaletteItem[] = rankAndSort(clients, (c) => `${c.first_name} ${c.last_name}`)
      .slice(0, 8)
      .map(({ item: c }) => ({
        key: `client:${c.id}`,
        label: `${c.first_name} ${c.last_name}`,
        sub: c.status !== 'active' ? c.status : undefined,
        path: `/clients/${c.id}`,
        group: 'Clients' as const,
        icon: <User size={15} />,
      }));

    const entityItems: PaletteItem[] = rankAndSort(entities, (e) => e.name)
      .slice(0, 8)
      .map(({ item: e }) => ({
        key: `entity:${e.id}`,
        label: e.name,
        sub: e.contact_name || undefined,
        path: `/entities/${e.id}`,
        group: 'Agencies' as const,
        icon: <Building2 size={15} />,
      }));

    return [...clientItems, ...entityItems, ...pageItems.slice(0, 5)];
  }, [query, clients, entities]);

  const go = useCallback((item: PaletteItem) => {
    setOpen(false);
    navigate(item.path);
  }, [navigate]);

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') { setOpen(false); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setSelected((s) => Math.min(s + 1, items.length - 1)); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setSelected((s) => Math.max(s - 1, 0)); }
    if (e.key === 'Enter' && items[selected]) { e.preventDefault(); go(items[selected]); }
  };

  // Keep the highlighted row in view while arrowing through a long list.
  useEffect(() => {
    listRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [selected]);

  if (!open) return null;

  let lastGroup: string | null = null;

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] bg-black/30" onClick={() => setOpen(false)}>
      <div
        className="w-full max-w-lg bg-[var(--color-surface)] rounded-xl shadow-2xl border border-[var(--color-border)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 py-3 border-b border-[var(--color-border)]">
          <Search size={16} className="text-[var(--color-text-secondary)] flex-shrink-0" />
          <input
            ref={inputRef}
            className="flex-1 bg-transparent outline-none text-sm text-[var(--color-text)] placeholder:text-[var(--color-text-secondary)]"
            placeholder="Jump to a client, agency, or page…"
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelected(0); }}
            onKeyDown={onInputKeyDown}
          />
          <kbd className="text-[10px] text-[var(--color-text-secondary)] border border-[var(--color-border)] rounded px-1.5 py-0.5">esc</kbd>
        </div>
        <div ref={listRef} className="max-h-[50vh] overflow-y-auto py-1">
          {items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-[var(--color-text-secondary)]">No matches.</p>
          ) : (
            items.map((item, i) => {
              const header = item.group !== lastGroup ? item.group : null;
              lastGroup = item.group;
              return (
                <React.Fragment key={item.key}>
                  {header && (
                    <p className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]">{header}</p>
                  )}
                  <button
                    data-selected={i === selected}
                    className={`w-full flex items-center gap-2.5 px-4 py-2 text-left text-sm transition-colors ${
                      i === selected ? 'bg-[var(--color-primary)]/10 text-[var(--color-text)]' : 'text-[var(--color-text)] hover:bg-[var(--color-bg)]'
                    }`}
                    onClick={() => go(item)}
                    onMouseMove={() => setSelected(i)}
                  >
                    <span className="text-[var(--color-text-secondary)] flex-shrink-0">{item.icon}</span>
                    <span className="truncate">{item.label}</span>
                    {item.sub && <span className="ml-auto text-xs text-[var(--color-text-secondary)] capitalize flex-shrink-0">{item.sub}</span>}
                  </button>
                </React.Fragment>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
