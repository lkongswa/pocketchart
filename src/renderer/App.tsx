import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createHashRouter, RouterProvider, Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { getSectionForPath } from './hooks/useSectionColor';
import { useLocalPreference } from './hooks/useLocalPreference';
import { useAccessibilityPrefs } from './hooks/useAccessibilityPrefs';
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
  MessageSquare,
  CheckCircle,
  Printer,
} from 'lucide-react';
import FeedbackModal from './components/FeedbackModal';
import FaxPage from './pages/FaxPage';
import IntakeFormsPage from './pages/IntakeFormsPage';
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
import PassphraseScreen from './components/PassphraseScreen';
import MigrationScreen from './components/MigrationScreen';
import ErrorBoundary from './components/ErrorBoundary';
import OnboardingScreen from './components/OnboardingScreen';
import IntegrityWarningDialog from './components/IntegrityWarningDialog';
import RecoveryKeyCeremony from './components/RecoveryKeyCeremony';
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
      { to: '/intake-forms', label: 'Intake Forms', icon: <FileText size={18} /> },
    ],
  },
  {
    title: 'Business',
    color: '#2563eb', // deep blue
    items: [
      { to: '/billing', label: 'Billing', icon: <DollarSign size={18} /> },
      { to: '/fax', label: 'Fax Center', icon: <Printer size={18} /> },
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

const COLLAPSIBLE_GROUPS = new Set(['Business', 'Professional']);

const Sidebar: React.FC = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [appVersion, setAppVersion] = useState('');
  const [logoHover, setLogoHover] = useState(false);
  const [showFeedback, setShowFeedback] = useState(false);
  const { tier } = useTier();

  // Gear menu
  const [gearOpen, setGearOpen] = useState(false);
  const gearRef = useRef<HTMLDivElement>(null);

  // Collapsible groups — store array of expanded group titles
  const [expandedGroups, setExpandedGroups] = useLocalPreference<string[]>(
    'sidebar-expanded-groups',
    tier === 'pro' ? ['Clinical', 'Business', 'Professional'] : ['Clinical']
  );

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

  const activeSection = useMemo(() => getSectionForPath(location.pathname), [location.pathname]);

  const isGroupExpanded = useCallback(
    (title: string) => !COLLAPSIBLE_GROUPS.has(title) || expandedGroups.includes(title),
    [expandedGroups]
  );

  const toggleGroup = useCallback(
    (title: string) => {
      setExpandedGroups((prev) =>
        prev.includes(title) ? prev.filter((t) => t !== title) : [...prev, title]
      );
    },
    [setExpandedGroups]
  );

  // Auto-expand group when navigating to a route within it
  useEffect(() => {
    const section = getSectionForPath(location.pathname);
    if (COLLAPSIBLE_GROUPS.has(section.section) && !expandedGroups.includes(section.section)) {
      setExpandedGroups((prev) => [...prev, section.section]);
    }
  }, [location.pathname]);

  // Close gear menu on click outside
  useEffect(() => {
    if (!gearOpen) return;
    const handler = (e: MouseEvent) => {
      if (gearRef.current && !gearRef.current.contains(e.target as Node)) {
        setGearOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [gearOpen]);

  // Close gear menu on navigation
  useEffect(() => {
    setGearOpen(false);
  }, [location.pathname]);

  const isOnSettingsRoute = location.pathname === '/help' || location.pathname === '/settings';

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
          const collapsible = COLLAPSIBLE_GROUPS.has(group.title);
          const expanded = isGroupExpanded(group.title);
          return (
            <div key={group.title} className="mb-1">
              {collapsible ? (
                <button
                  className="w-full px-3 py-1.5 flex items-center gap-1.5 hover:bg-white/30 rounded transition-colors"
                  onClick={() => toggleGroup(group.title)}
                >
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: groupColor }}
                  />
                  <p
                    className="text-[10px] font-semibold uppercase tracking-wider flex-1 text-left"
                    style={{ color: isActiveGroup ? darkenHex(groupColor, 0.15) : undefined, opacity: isActiveGroup ? 1 : 0.6 }}
                  >
                    {group.title}
                  </p>
                  <ChevronRight
                    size={12}
                    className={`text-gray-400 transition-transform duration-150 ${expanded ? 'rotate-90' : ''}`}
                  />
                </button>
              ) : (
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
              )}
              {expanded && (
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
              )}
            </div>
          );
        })}
      </nav>

      {/* Footer: Trial Badge + Gear Menu + Version */}
      <div className="px-3 py-3 border-t border-[var(--color-border)] space-y-2">
        <TrialBadge />
        <div className="relative" ref={gearRef}>
          <button
            onClick={() => setGearOpen((o) => !o)}
            className={`w-full flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
              isOnSettingsRoute || gearOpen
                ? 'bg-gray-100 text-[var(--color-primary)]'
                : 'text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-secondary)] hover:text-[var(--color-text)]'
            }`}
            title="Settings & Help"
          >
            <Settings size={14} />
          </button>
          {gearOpen && (
            <div className="absolute bottom-full left-0 right-0 mb-1 bg-[var(--color-surface)] border border-[var(--color-border)] rounded-lg shadow-lg overflow-hidden z-50">
              <button
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--color-text)] hover:bg-gray-50 transition-colors"
                onClick={() => { navigate('/help'); setGearOpen(false); }}
              >
                <HelpCircle size={15} className="text-[var(--color-text-secondary)]" />
                Help
              </button>
              <button
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--color-text)] hover:bg-gray-50 transition-colors"
                onClick={() => { navigate('/settings'); setGearOpen(false); }}
              >
                <Settings size={15} className="text-[var(--color-text-secondary)]" />
                Settings
              </button>
              <div className="border-t border-[var(--color-border)]" />
              <button
                className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-[var(--color-text)] hover:bg-gray-50 transition-colors"
                onClick={() => { setShowFeedback(true); setGearOpen(false); }}
              >
                <MessageSquare size={15} className="text-[var(--color-text-secondary)]" />
                Report Issue
              </button>
            </div>
          )}
        </div>
        <p className="text-xs text-[var(--color-text-secondary)] px-2">
          {appVersion ? `v${appVersion}` : ''}
        </p>
      </div>
      {showFeedback && <FeedbackModal onClose={() => setShowFeedback(false)} />}
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
      { path: '/fax', element: <FaxPage /> },
      { path: '/intake-forms', element: <IntakeFormsPage /> },
      { path: '/mileage', element: <MileagePage /> },
      { path: '/reports', element: <YearEndSummaryPage /> },
      { path: '/help', element: <HelpPage /> },
      { path: '/settings', element: <SettingsPage /> },
    ],
  },
]);

const App: React.FC = () => {
  // Apply accessibility preferences (theme, font size, contrast, motion) to <html>
  useAccessibilityPrefs();

  const [isLocked, setIsLocked] = useState(false);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [timeoutMinutes, setTimeoutMinutes] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [encryptionStatus, setEncryptionStatus] = useState<'loading' | 'needs_setup' | 'needs_passphrase' | 'needs_migration' | 'unlocked'>('loading');
  const [dbReady, setDbReady] = useState(false);
  const [integrityWarning, setIntegrityWarning] = useState<{
    quickCheckPassed: boolean;
    quickCheckResult: string;
    fullCheckPassed?: boolean;
    fullCheckResult?: string;
    fullCheckRan: boolean;
  } | null>(null);
  const [pendingRecoveryKey, setPendingRecoveryKey] = useState<string | null>(null);
  const lastActivityRef = useRef<number>(Date.now());
  const { tier, trialActive, trialExpired, loading: tierLoading } = useTier();
  const [globalToast, setGlobalToast] = useState<string | null>(null);

  /**
   * Load PIN/security state from the database.
   * Called only after the DB is open (db:ready event).
   */
  const loadSecurityState = async () => {
    try {
      const enabled = await window.api.security.isPinEnabled();
      const timeout = await window.api.security.getTimeoutMinutes();
      setPinEnabled(enabled);
      setTimeoutMinutes(timeout);
      if (enabled) {
        setIsLocked(true);
      }
    } catch (err) {
      console.error('Failed to load security settings:', err);
    }
  };

  // Initialize app state on mount
  useEffect(() => {
    const init = async () => {
      try {
        const status = await window.api.encryption.getStatus();
        if (status.needsSetup) {
          // First run — no DB. Show onboarding (practice info + PIN, no encryption).
          setEncryptionStatus('needs_setup');
          setShowOnboarding(true);
        } else if (status.needsPassphrase) {
          // V2: DB is still encrypted from a previous version — need one-time passphrase
          // to decrypt it to plaintext. After this, passphrase will never be asked again.
          setEncryptionStatus('needs_passphrase');
        } else {
          // DB is already open as plaintext — db:ready event will fire
          setEncryptionStatus('unlocked');
        }
      } catch (err) {
        console.error('Failed to check encryption status:', err);
        setEncryptionStatus('needs_passphrase');
      } finally {
        setInitialLoading(false);
      }
    };
    init();

    // Listen for DB ready signal from main process
    const cleanup = window.api.encryption.onDbReady(async () => {
      setDbReady(true);
      setEncryptionStatus('unlocked');
      loadSecurityState();

      // Trigger tier re-fetch now that license:getStatus IPC handler is registered
      window.dispatchEvent(new Event('pocketchart:tier-changed'));

      // Check for pending recovery key (from Settings restore + app restart)
      try {
        const key = await window.api.restore.getPendingRecoveryKey();
        if (key) {
          setPendingRecoveryKey(key);
        }
      } catch {}

      // Run startup integrity checks
      try {
        const result = await window.api.integrity.startupCheck();
        if (!result.quickCheckPassed || (result.fullCheckRan && !result.fullCheckPassed)) {
          setIntegrityWarning(result);
        }
      } catch (err) {
        console.error('Integrity check failed to run:', err);
      }
    });

    return cleanup;
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

  // Lock on system suspend / screen lock (laptop lid close, etc.)
  useEffect(() => {
    if (!pinEnabled) return;
    const cleanup = window.api.system.onLock(() => {
      setIsLocked(true);
    });
    return cleanup;
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

    const events = ['mousemove', 'mousedown', 'keydown'];
    const passiveEvents = ['scroll', 'touchstart'];
    events.forEach(event => document.addEventListener(event, resetActivity, true));
    passiveEvents.forEach(event => document.addEventListener(event, resetActivity, { capture: true, passive: true }));

    const intervalId = setInterval(() => {
      if (isLocked) return;
      const elapsed = Date.now() - lastActivityRef.current;
      if (elapsed >= timeoutMinutes * 60 * 1000) {
        setIsLocked(true);
      }
    }, 10000);

    return () => {
      events.forEach(event => document.removeEventListener(event, resetActivity, true));
      passiveEvents.forEach(event => document.removeEventListener(event, resetActivity, true));
      clearInterval(intervalId);
    };
  }, [pinEnabled, timeoutMinutes, isLocked]);

  // Global toast auto-dismiss
  useEffect(() => {
    if (globalToast) {
      const timer = setTimeout(() => setGlobalToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [globalToast]);

  // Background payment status polling (every 5 minutes)
  useEffect(() => {
    if (!dbReady) return;

    let interval: ReturnType<typeof setInterval> | null = null;

    const checkPendingPayments = async () => {
      try {
        const hasStripe = await window.api.secureStorage.exists('stripe_secret_key');
        if (!hasStripe) return;

        const result = await window.api.stripe.checkAllPendingPayments();
        if (result.paid && result.paid.length > 0) {
          for (const payment of result.paid) {
            setGlobalToast(
              `Payment received: ${payment.invoiceNumber} — $${payment.amount.toFixed(2)}`
            );
          }
          // Notify open pages to refresh
          window.dispatchEvent(new Event('pocketchart:payments-received'));
        }
      } catch (err) {
        console.error('Background payment check failed:', err);
      }
    };

    // Check shortly after app loads (5 second delay to not compete with startup)
    const startTimer = setTimeout(() => {
      checkPendingPayments();
      interval = setInterval(checkPendingPayments, 5 * 60 * 1000);
    }, 5000);

    return () => {
      clearTimeout(startTimer);
      if (interval) clearInterval(interval);
    };
  }, [dbReady]);

  // Background fax status polling (every 3 minutes)
  useEffect(() => {
    if (!dbReady) return;

    let interval: ReturnType<typeof setInterval> | null = null;

    const checkFaxes = async () => {
      try {
        const faxStatus = await window.api.fax.getProviderStatus();
        if (!faxStatus.configured) return;

        await window.api.fax.pollStatuses();
        const result = await window.api.fax.pollInbox();
        if (result.newFaxes > 0) {
          setGlobalToast(`${result.newFaxes} new fax${result.newFaxes > 1 ? 'es' : ''} received`);
        }
      } catch (err) {
        console.error('Background fax check failed:', err);
      }
    };

    const startTimer = setTimeout(() => {
      checkFaxes();
      interval = setInterval(checkFaxes, 3 * 60 * 1000);
    }, 10000);

    return () => {
      clearTimeout(startTimer);
      if (interval) clearInterval(interval);
    };
  }, [dbReady]);

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
    setEncryptionStatus('unlocked');
    setDbReady(true);
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

  const handlePassphraseUnlock = () => {
    setEncryptionStatus('unlocked');
    setDbReady(true);
    // Security state will be loaded via the db:ready listener
  };

  // Unlicensed users see only the activation/export landing page
  // Exception: trial-expired users get view-only mode (full app with creation blocked)
  // Only gate AFTER db is ready — before that, license status is unknown
  if (dbReady && tier === 'unlicensed' && !trialExpired && !showOnboarding) {
    return (
      <ErrorBoundary>
        <UnlicensedLandingPage />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      {/* Gate 1: First-run onboarding (includes passphrase setup + recovery ceremony + PIN) */}
      {showOnboarding && <OnboardingScreen onComplete={handleOnboardingComplete} />}

      {/* Gate 2: One-time passphrase for decrypting legacy encrypted DB */}
      {!showOnboarding && encryptionStatus === 'needs_passphrase' && (
        <PassphraseScreen onUnlock={handlePassphraseUnlock} />
      )}

      {/* Gate 4: PIN lock screen (after DB is unlocked) */}
      {isLocked && pinEnabled && !showOnboarding && encryptionStatus === 'unlocked' && (
        <PinLockScreen onUnlock={handleUnlock} />
      )}

      {/* Gate 5: Pending recovery key ceremony (after Settings restore + app restart) */}
      {pendingRecoveryKey && (
        <div className="fixed inset-0 z-[9998] flex items-center justify-center bg-[var(--color-bg)] overflow-y-auto">
          <div className="max-w-lg w-full px-8 py-8">
            <RecoveryKeyCeremony
              recoveryKey={pendingRecoveryKey}
              onComplete={async () => {
                try {
                  await window.api.restore.clearPendingRecoveryKey();
                } catch {}
                setPendingRecoveryKey(null);
              }}
            />
          </div>
        </div>
      )}

      {/* Gate 6: Integrity check warning */}
      {integrityWarning && (
        <IntegrityWarningDialog
          quickCheckPassed={integrityWarning.quickCheckPassed}
          quickCheckResult={integrityWarning.quickCheckResult}
          fullCheckPassed={integrityWarning.fullCheckPassed}
          fullCheckResult={integrityWarning.fullCheckResult}
          fullCheckRan={integrityWarning.fullCheckRan}
          onDismiss={() => setIntegrityWarning(null)}
        />
      )}

      {/* Main app (only renders meaningful content after DB is ready) */}
      <RouterProvider router={router} />
      <FloatingWidget />
      <UpdateNotification />

      {/* Global payment toast */}
      {globalToast && (
        <div className="fixed top-4 right-4 z-[9999] flex items-center gap-2 bg-emerald-600 text-white px-4 py-3 rounded-lg shadow-lg animate-fade-in">
          <CheckCircle className="w-4 h-4" />
          <span className="text-sm font-medium">{globalToast}</span>
        </div>
      )}
    </ErrorBoundary>
  );
};

export default App;
