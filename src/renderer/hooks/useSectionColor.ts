import { createContext, useContext } from 'react';
import { useLocation } from 'react-router-dom';

export interface SectionColorInfo {
  /** Hex color for the current section */
  color: string;
  /** Section name (e.g. 'Clinical', 'Business') */
  section: string;
}

/** Route prefix → section mapping */
const ROUTE_SECTIONS: { prefix: string; section: string; color: string }[] = [
  // Clinical (sky blue)
  { prefix: '/clients', section: 'Clinical', color: '#0ea5e9' },
  { prefix: '/calendar', section: 'Clinical', color: '#0ea5e9' },
  { prefix: '/notes', section: 'Clinical', color: '#0ea5e9' },
  // Business (amber)
  { prefix: '/billing', section: 'Business', color: '#f59e0b' },
  { prefix: '/entities', section: 'Business', color: '#f59e0b' },
  { prefix: '/mileage', section: 'Business', color: '#f59e0b' },
  { prefix: '/reports', section: 'Business', color: '#f59e0b' },
  // Professional (violet)
  { prefix: '/vault', section: 'Professional', color: '#8b5cf6' },
  // Settings (gray)
  { prefix: '/help', section: 'Settings', color: '#6b7280' },
  { prefix: '/settings', section: 'Settings', color: '#6b7280' },
  // Dashboard (Clinical)
  { prefix: '/', section: 'Clinical', color: '#0ea5e9' },
];

export function getSectionForPath(pathname: string): SectionColorInfo {
  // Try longest prefix match first (more specific routes)
  for (const route of ROUTE_SECTIONS) {
    if (route.prefix === '/') continue; // Skip root, handle last
    if (pathname.startsWith(route.prefix)) {
      return { color: route.color, section: route.section };
    }
  }
  // Default: dashboard = Clinical
  return { color: '#0ea5e9', section: 'Clinical' };
}

export function useSectionColor(): SectionColorInfo {
  const location = useLocation();
  return getSectionForPath(location.pathname);
}
