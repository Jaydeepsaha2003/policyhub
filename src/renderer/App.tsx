import { useEffect, useState } from 'react';
import { RouterProvider, useRouter } from './lib/router';
import { Sidebar } from './components/sidebar';
import { Topbar } from './components/topbar';
import { SetupWizard } from './pages/setup-wizard';
import { DashboardPage } from './pages/dashboard';
import { PoliciesPage } from './pages/policies';
import { PolicyFormPage } from './pages/policy-form';
import { PolicyDetailPage } from './pages/policy-detail';
import { PaymentsPage } from './pages/payments';
import { RemindersPage } from './pages/reminders';
import { ValuationPage } from './pages/valuation';
import { RepaymentsPage } from './pages/repayments';
import { MutualFundsPage } from './pages/mutual-funds';
import { MutualFundFormPage } from './pages/mutual-fund-form';
import { MutualFundDetailPage } from './pages/mutual-fund-detail';
import { CalendarPage } from './pages/calendar';
import { CalendarFormPage } from './pages/calendar-form';
import { CalendarDetailPage } from './pages/calendar-detail';
import { SettingsPage } from './pages/settings';
import { Loader2 } from 'lucide-react';

const PageSwitch = () => {
  const { route } = useRouter();
  switch (route.name) {
    case 'dashboard':
      return <DashboardPage />;
    case 'policies':
      return <PoliciesPage />;
    case 'policy-new':
      return <PolicyFormPage mode="create" />;
    case 'policy-detail':
      return <PolicyDetailPage id={route.id} />;
    case 'mutual-funds':
      return <MutualFundsPage />;
    case 'mutual-fund-new':
      return <MutualFundFormPage mode="create" />;
    case 'mutual-fund-detail':
      return <MutualFundDetailPage id={route.id} />;
    case 'calendar':
      return <CalendarPage />;
    case 'calendar-new':
      return <CalendarFormPage mode="create" />;
    case 'calendar-detail':
      return <CalendarDetailPage id={route.id} />;
    case 'payments':
      return <PaymentsPage />;
    case 'reminders':
      return <RemindersPage />;
    case 'valuation':
      return <ValuationPage />;
    case 'repayments':
      return <RepaymentsPage />;
    case 'settings':
      return <SettingsPage />;
  }
};

const SIDEBAR_COLLAPSED_KEY = 'policyhub.sidebarCollapsed';

const Shell = ({ onSetupComplete }: { onSetupComplete: () => void }) => {
  const [collapsed, setCollapsed] = useState<boolean>(() => {
    try {
      return localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === '1';
    } catch {
      return false;
    }
  });
  const toggle = () => {
    setCollapsed((c) => {
      const next = !c;
      try {
        localStorage.setItem(SIDEBAR_COLLAPSED_KEY, next ? '1' : '0');
      } catch {
        // ignore
      }
      return next;
    });
  };
  return (
    <div className="flex h-screen w-screen overflow-hidden">
      <Sidebar collapsed={collapsed} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar sidebarCollapsed={collapsed} onToggleSidebar={toggle} />
        <main className="flex-1 overflow-auto bg-background">
          <div className="mx-auto w-full max-w-7xl p-6">
            <PageSwitch />
          </div>
        </main>
      </div>
      {/* onSetupComplete is unused here but kept for future re-checks */}
      <div className="hidden">{onSetupComplete.name}</div>
    </div>
  );
};

export const App = () => {
  const [setupChecked, setSetupChecked] = useState(false);
  const [setupComplete, setSetupComplete] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s: any = await window.policyhub.settings.get();
        if (cancelled) return;
        setSetupComplete(Boolean(s?.setupComplete));
      } catch {
        // ignore; show wizard
      } finally {
        if (!cancelled) setSetupChecked(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (!setupChecked) {
    return (
      <div className="flex h-screen w-screen items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!setupComplete) {
    return <SetupWizard onDone={() => setSetupComplete(true)} />;
  }

  return (
    <RouterProvider>
      <Shell onSetupComplete={() => setSetupComplete(true)} />
    </RouterProvider>
  );
};
