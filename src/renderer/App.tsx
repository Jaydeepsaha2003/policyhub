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

const Shell = ({ onSetupComplete }: { onSetupComplete: () => void }) => (
  <div className="flex h-screen w-screen overflow-hidden">
    <Sidebar />
    <div className="flex min-w-0 flex-1 flex-col">
      <Topbar />
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
