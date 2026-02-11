import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createHashRouter, RouterProvider, Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { getSectionForPath } from './hooks/useSectionColor';
import {
  LayoutDashboard,
  Users,
  Calendar,
  Settings,
  ClipboardList,
  HelpCircle,
  DollarSign,
  Building2,
  Shield,
  Car,
  FileSpreadsheet,
  FileText,
  ChevronLeft,
  ChevronRight,
  Lock,
} from 'lucide-react';
import DashboardPage from './pages/DashboardPage';
import ClientsPage from './pages/ClientsPage';
import ClientDetailPage from './pages/ClientDetailPage';
import NoteFormPage from './pages/NoteFormPage';
import EvalFormPage from './pages/EvalFormPage';
import CalendarPage from './pages/CalendarPage';
import SettingsPage from './pages/SettingsPage';
import SuperbillPage from './pages/SuperbillPage';
import HelpPage from './pages/HelpPage';
import BillingPage from './pages/BillingPage';
import ContractedEntitiesPage from './pages/ContractedEntitiesPage';
import EntityDetailPage from './pages/EntityDetailPage';
import VaultPage from './pages/VaultPage';
import MileagePage from './pages/MileagePage';
import YearEndSummaryPage from './pages/YearEndSummaryPage';
import NotesOverviewPage from './pages/NotesOverviewPage';
import EvalsQueuePage from './pages/EvalsQueuePage';
import PinLockScreen from './components/PinLockScreen';
import ErrorBoundary from './components/ErrorBoundary';
import OnboardingScreen from './components/OnboardingScreen';
import UpdateNotification from './components/UpdateNotification';
import FloatingWidget from './components/FloatingWidget';
import UnlicensedLandingPage from './components/UnlicensedLandingPage';
import TrialBadge from './components/TrialBadge';
import { useTier } from './hooks/useTier';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  /** Match paths that start with this prefix for active highlighting */
  matchPrefix?: string;
}

interface NavGroup {
  title: string;
  items: NavItem[];
  /** Color accent for the group title and border */
  color?: string;
}

const navGroups: NavGroup[] = [
  {
    title: 'Clinical',
    color: '#14b8a6', // teal (matches logo)
    items: [
      { to: '/', label: 'Dashboard', icon: <LayoutDashboard size={18} /> },
      { to: '/clients', label: 'Clients', icon: <Users size={18} />, matchPrefix: '/clients' },
      { to: '/calendar', label: 'Calendar', icon: <Calendar size={18} /> },
      { to: '/notes', label: 'Notes / PRs', icon: <FileText size={18} /> },
      { to: '/evals', label: 'Evals / Recerts', icon: <ClipboardList size={18} /> },
    ],
  },
  {
    title: 'Business',
    color: '#2563eb', // deep blue
    items: [
      { to: '/billing', label: 'Billing', icon: <DollarSign size={18} /> },
      { to: '/entities', label: 'Contracts', icon: <Building2 size={18} />, matchPrefix: '/entities' },
      { to: '/mileage', label: 'Mileage', icon: <Car size={18} /> },
      { to: '/reports', label: 'Year-End Summary', icon: <FileSpreadsheet size={18} /> },
    ],
  },
  {
    title: 'Professional',
    color: '#8b5cf6', // violet
    items: [
      { to: '/vault', label: 'My Vault', icon: <Shield size={18} /> },
    ],
  },
  {
    title: 'Settings',
    color: '#6b7280', // gray
    items: [
      { to: '/help', label: 'Help', icon: <HelpCircle size={18} /> },
      { to: '/settings', label: 'Settings', icon: <Settings size={18} /> },
    ],
  },
];

/** Convert hex to rgba with alpha */
function hexToRgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Darken a hex color by a percentage (0-1) */
function darkenHex(hex: string, amount: number): string {
  const r = Math.max(0, Math.round(parseInt(hex.slice(1, 3), 16) * (1 - amount)));
  const g = Math.max(0, Math.round(parseInt(hex.slice(3, 5), 16) * (1 - amount)));
  const b = Math.max(0, Math.round(parseInt(hex.slice(5, 7), 16) * (1 - amount)));
  return `rgb(${r}, ${g}, ${b})`;
}

const Sidebar: React.FC = () => {
  const location = useLocation();
  const [appVersion, setAppVersion] = useState('');
  const [logoHover, setLogoHover] = useState(false);

  useEffect(() => {
    window.api.app.getVersion().then((v) => setAppVersion(v)).catch(() => {});
  }, []);

  const handleLockClick = () => {
    window.dispatchEvent(new CustomEvent('pocketchart:lock'));
  };

  const isActive = (item: NavItem): boolean => {
    if (item.matchPrefix) {
      return location.pathname.startsWith(item.matchPrefix);
    }
    return location.pathname === item.to;
  };

  // Determine which group the current route belongs to
  const activeSection = useMemo(() => getSectionForPath(location.pathname), [location.pathname]);

  return (
    <aside className="fixed top-0 left-0 h-full w-[240px] bg-[var(--color-surface)] border-r border-[var(--color-border)] flex flex-col z-10">
      {/* Logo / App Name — click to lock */}
      <button
        className="flex items-center gap-3 px-5 py-5 border-b border-[var(--color-border)] w-full text-left hover:bg-gray-50/50 transition-colors cursor-pointer"
        onClick={handleLockClick}
        onMouseEnter={() => setLogoHover(true)}
        onMouseLeave={() => setLogoHover(false)}
        title="Click to lock (Ctrl+L)"
      >
        <div className="relative flex items-center justify-center w-9 h-9 rounded-lg bg-[var(--color-primary)] text-white">
          {logoHover ? <Lock size={18} /> : <ClipboardList size={20} />}
          {logoHover && (
            <div className="absolute inset-0 rounded-lg bg-black/20" />
          )}
        </div>
        <div>
          <h1 className="text-base font-bold text-[var(--color-text)] leading-tight">
            PocketChart
          </h1>
          <p className="text-xs text-[var(--color-text-secondary)] leading-tight">
            {logoHover ? 'Click to lock' : 'Therapy Notes'}
          </p>
        </div>
      </button>

      {/* Grouped Navigation */}
      <nav className="flex-1 px-3 py-3 overflow-y-auto space-y-1">
        {navGroups.map((group) => {
          const groupColor = group.color || '#6b7280';
          const isActiveGroup = activeSection.section === group.title;
          return (
            <div key={group.title} className="mb-1">
              <div className="px-3 py-1.5 flex items-center gap-1.5">
                <span
                  className="w-2 h-2 rounded-full flex-shrink-0"
                  style={{ backgroundColor: groupColor }}
                />
                <p
                  className="text-[10px] font-semibold uppercase tracking-wider"
                  style={{ color: isActiveGroup ? darkenHex(groupColor, 0.15) : undefined, opacity: isActiveGroup ? 1 : 0.6 }}
                >
                  {group.title}
                </p>
              </div>
              <div
                className="rounded-lg border overflow-hidden"
                style={{
                  backgroundColor: hexToRgba(groupColor, 0.06),
                  borderColor: hexToRgba(groupColor, 0.25),
                }}
              >
                {group.items.map((item) => {
                  const active = isActive(item);
                  return (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      className={`flex items-center gap-2.5 px-3 py-2 text-sm transition-colors ${
                        active
                          ? 'text-white font-medium'
                          : 'text-[var(--color-text)] hover:bg-white/50'
                      }`}
                      style={active ? { backgroundColor: groupColor } : undefined}
                    >
                      {item.icon}
                      <span>{item.label}</span>
                    </NavLink>
                  );
                })}
              </div>
            </div>
          );
        })}
      </nav>

      {/* Trial Badge + Footer */}
      <div className="px-3 py-3 border-t border-[var(--color-border)] space-y-2">
        <TrialBadge />
        <p className="text-xs text-[var(--color-text-secondary)] px-2">
          {appVersion ? `v${appVersion}` : ''}
        </p>
      </div>
    </aside>
  );
};

/** Top bar with colored accent + back/forward navigation */
const TopNavBar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const section = useMemo(() => getSectionForPath(location.pathname), [location.pathname]);

  return (
    <div className="flex-shrink-0">
      <div
        className="h-1 w-full"
        style={{ backgroundColor: section.color }}
      />
      <div className="flex items-center gap-1 px-3 py-1 bg-[var(--color-surface)] border-b border-[var(--color-border)]">
        <button
          onClick={() => navigate(-1)}
          className="p-1 rounded hover:bg-gray-100 text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
          title="Go back"
        >
          <ChevronLeft size={16} />
        </button>
        <button
          onClick={() => navigate(1)}
          className="p-1 rounded hover:bg-gray-100 text-[var(--color-text-secondary)] hover:text-[var(--color-text)] transition-colors"
          title="Go forward"
        >
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
};

const AppLayout: React.FC = () => {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="ml-[240px] flex-1 overflow-y-auto min-h-screen flex flex-col">
        <TopNavBar />
        <div className="flex-1">
          <Outlet />
        </div>
      </main>
    </div>
  );
};

const router = createHashRouter([
  {
    element: <AppLayout />,
    children: [
      { path: '/', element: <DashboardPage /> },
      { path: '/clients', element: <ClientsPage /> },
      { path: '/clients/:id', element: <ClientDetailPage /> },
      { path: '/clients/:id/note/new', element: <NoteFormPage /> },
      { path: '/clients/:id/note/:noteId', element: <NoteFormPage /> },
      { path: '/clients/:id/eval/new', element: <EvalFormPage /> },
      { path: '/clients/:id/eval/:evalId', element: <EvalFormPage /> },
      { path: '/clients/:id/superbill', element: <SuperbillPage /> },
      { path: '/evals', element: <EvalsQueuePage /> },
      { path: '/notes', element: <NotesOverviewPage /> },
      { path: '/calendar', element: <CalendarPage /> },
      { path: '/billing', element: <BillingPage /> },
      { path: '/entities', element: <ContractedEntitiesPage /> },
      { path: '/entities/:id', element: <EntityDetailPage /> },
      { path: '/vault', element: <VaultPage /> },
      { path: '/mileage', element: <MileagePage /> },
      { path: '/reports', element: <YearEndSummaryPage /> },
      { path: '/help', element: <HelpPage /> },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
]);

const App: React.FC = () => {
  const [isLocked, setIsLocked] = useState(false);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [timeoutMinutes, setTimeoutMinutes] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const lastActivityRef = useRef<number>(Date.now());
  const { tier, trialActive, trialExpired, loading: tierLoading } = useTier();

  // Initialize lock state on mount
  useEffect(() => {
    const init = async () => {
      try {
        const enabled = await window.api.security.isPinEnabled();
        const timeout = await window.api.security.getTimeoutMinutes();
        const onboardingDone = await window.api.settings.get('onboarding_complete');
        setPinEnabled(enabled);
        setTimeoutMinutes(timeout);
        if (enabled) {
          setIsLocked(true);
        }
        // Show onboarding on first launch (no onboarding flag and no PIN)
        if (!onboardingDone && !enabled) {
          setShowOnboarding(true);
        }
      } catch (err) {
        console.error('Failed to load security settings:', err);
      } finally {
        setInitialLoading(false);
      }
    };
    init();
  }, []);

  // Listen for security settings changes from SettingsPage
  useEffect(() => {
    const handleSecurityChange = async () => {
      try {
        const enabled = await window.api.security.isPinEnabled();
        const timeout = await window.api.security.getTimeoutMinutes();
        setPinEnabled(enabled);
        setTimeoutMinutes(timeout);
      } catch (err) {
        console.error('Failed to refresh security settings:', err);
      }
    };
    window.addEventListener('pocketchart:security-changed', handleSecurityChange);
    return () => window.removeEventListener('pocketchart:security-changed', handleSecurityChange);
  }, []);

  // Listen for lock event (from sidebar logo click)
  useEffect(() => {
    const handleLock = () => {
      if (pinEnabled) {
        setIsLocked(true);
      }
    };
    window.addEventListener('pocketchart:lock', handleLock);
    return () => window.removeEventListener('pocketchart:lock', handleLock);
  }, [pinEnabled]);

  // Ctrl+L keyboard shortcut to lock
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'l') {
        e.preventDefault();
        if (pinEnabled && !isLocked) {
          setIsLocked(true);
        }
      }
    };
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, [pinEnabled, isLocked]);

  // Activity tracking and auto-timeout
  useEffect(() => {
    if (!pinEnabled || timeoutMinutes <= 0) return;

    const resetActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const events = ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'];
    events.forEach(event => document.addEventListener(event, resetActivity, true));

    const intervalId = setInterval(() => {
      if (isLocked) return;
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= timeoutMinutes * 60 * 1000) {
        setIsLocked(true);
      }
    }, 10000);

    return () => {
      events.forEach(event => document.removeEventListener(event, resetActivity, true));
      clearInterval(intervalId);
    };
  }, [pinEnabled, timeoutMinutes, isLocked]);

  const handleUnlock = () => {
    setIsLocked(false);
    lastActivityRef.current = Date.now();
  };

  if (initialLoading || tierLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--color-bg)]">
        <div className="text-[var(--color-text-secondary)]">Loading...</div>
      </div>
    );
  }

  const handleOnboardingComplete = async () => {
    setShowOnboarding(false);
    // Refresh security state in case user set a PIN during onboarding
    try {
      const enabled = await window.api.security.isPinEnabled();
      setPinEnabled(enabled);
      if (enabled) {
        // Don't lock — they just entered it
        setIsLocked(false);
      }
    } catch {}
  };

  // Unlicensed users see only the activation/export landing page
  // Exception: trial-expired users get view-only mode (full app with creation blocked)
  if (tier === 'unlicensed' && !trialExpired && !showOnboarding) {
    return (
      <ErrorBoundary>
        <UnlicensedLandingPage />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      {showOnboarding && <OnboardingScreen onComplete={handleOnboardingComplete} />}
      {isLocked && pinEnabled && !showOnboarding && <PinLockScreen onUnlock={handleUnlock} />}
      <RouterProvider router={router} />
      <FloatingWidget />
      <UpdateNotification />
    </ErrorBoundary>
  );
};

export default App;
