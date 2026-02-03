import React, { useState, useEffect, useRef } from 'react';
import { HashRouter, Routes, Route, NavLink, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Users,
  Calendar,
  Settings,
  ClipboardList,
  HelpCircle,
  DollarSign,
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
import PinLockScreen from './components/PinLockScreen';
import ErrorBoundary from './components/ErrorBoundary';
import OnboardingScreen from './components/OnboardingScreen';
import UpdateNotification from './components/UpdateNotification';

interface NavItem {
  to: string;
  label: string;
  icon: React.ReactNode;
  /** Match paths that start with this prefix for active highlighting */
  matchPrefix?: string;
}

const navItems: NavItem[] = [
  { to: '/', label: 'Dashboard', icon: <LayoutDashboard size={20} /> },
  { to: '/clients', label: 'Clients', icon: <Users size={20} />, matchPrefix: '/clients' },
  { to: '/calendar', label: 'Calendar', icon: <Calendar size={20} /> },
  { to: '/billing', label: 'Billing', icon: <DollarSign size={20} /> },
  { to: '/help', label: 'Help', icon: <HelpCircle size={20} /> },
  { to: '/settings', label: 'Settings', icon: <Settings size={20} /> },
];

const Sidebar: React.FC = () => {
  const location = useLocation();
  const [appVersion, setAppVersion] = useState('');

  useEffect(() => {
    window.api.app.getVersion().then((v) => setAppVersion(v)).catch(() => {});
  }, []);

  const isActive = (item: NavItem): boolean => {
    if (item.matchPrefix) {
      return location.pathname.startsWith(item.matchPrefix);
    }
    return location.pathname === item.to;
  };

  return (
    <aside className="fixed top-0 left-0 h-full w-[240px] bg-[var(--color-surface)] border-r border-[var(--color-border)] flex flex-col z-10">
      {/* Logo / App Name */}
      <div className="flex items-center gap-3 px-5 py-5 border-b border-[var(--color-border)]">
        <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-[var(--color-primary)] text-white">
          <ClipboardList size={20} />
        </div>
        <div>
          <h1 className="text-base font-bold text-[var(--color-text)] leading-tight">
            PocketChart
          </h1>
          <p className="text-xs text-[var(--color-text-secondary)] leading-tight">
            Therapy Notes
          </p>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={isActive(item) ? 'sidebar-link-active' : 'sidebar-link'}
          >
            {item.icon}
            <span>{item.label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Footer */}
      <div className="px-5 py-3 border-t border-[var(--color-border)]">
        <p className="text-xs text-[var(--color-text-secondary)]">
          {appVersion ? `v${appVersion}` : ''}
        </p>
      </div>
    </aside>
  );
};

const AppLayout: React.FC = () => {
  return (
    <div className="flex min-h-screen">
      <Sidebar />
      <main className="ml-[240px] flex-1 overflow-y-auto min-h-screen">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/clients" element={<ClientsPage />} />
          <Route path="/clients/:id" element={<ClientDetailPage />} />
          <Route path="/clients/:id/note/new" element={<NoteFormPage />} />
          <Route path="/clients/:id/note/:noteId" element={<NoteFormPage />} />
          <Route path="/clients/:id/eval/new" element={<EvalFormPage />} />
          <Route path="/clients/:id/eval/:evalId" element={<EvalFormPage />} />
          <Route path="/clients/:id/superbill" element={<SuperbillPage />} />
          <Route path="/calendar" element={<CalendarPage />} />
          <Route path="/billing" element={<BillingPage />} />
          <Route path="/help" element={<HelpPage />} />
          <Route path="/settings" element={<SettingsPage />} />
        </Routes>
      </main>
    </div>
  );
};

const App: React.FC = () => {
  const [isLocked, setIsLocked] = useState(false);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [timeoutMinutes, setTimeoutMinutes] = useState(0);
  const [initialLoading, setInitialLoading] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const lastActivityRef = useRef<number>(Date.now());

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

  if (initialLoading) {
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

  return (
    <ErrorBoundary>
      {showOnboarding && <OnboardingScreen onComplete={handleOnboardingComplete} />}
      <HashRouter>
        {isLocked && pinEnabled && !showOnboarding && <PinLockScreen onUnlock={handleUnlock} />}
        <AppLayout />
      </HashRouter>
      <UpdateNotification />
    </ErrorBoundary>
  );
};

export default App;
