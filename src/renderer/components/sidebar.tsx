import { useEffect, useState } from 'react';
import { LayoutDashboard, FileText, IndianRupee, BellRing, Settings, ShieldCheck, Calculator, Banknote, LineChart, CalendarDays } from 'lucide-react';
import { useRouter, type Route } from '@/lib/router';
import { cn } from '@/lib/utils';
import { HelpDialog } from './help-dialog';

const nav: { key: Route['name']; label: string; path: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'dashboard', label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { key: 'policies', label: 'Policies', path: '/policies', icon: FileText },
  { key: 'mutual-funds', label: 'Mutual funds', path: '/mutual-funds', icon: LineChart },
  { key: 'payments', label: 'Payments', path: '/payments', icon: IndianRupee },
  { key: 'repayments', label: 'Repayments', path: '/repayments', icon: Banknote },
  { key: 'calendar', label: 'Calendar', path: '/calendar', icon: CalendarDays },
  { key: 'reminders', label: 'Reminders', path: '/reminders', icon: BellRing },
  { key: 'valuation', label: 'Valuation', path: '/valuation', icon: Calculator },
  { key: 'settings', label: 'Settings', path: '/settings', icon: Settings },
];

const matches = (active: Route, key: Route['name']): boolean => {
  if (active.name === key) return true;
  if (key === 'policies' && (active.name === 'policy-new' || active.name === 'policy-detail')) return true;
  if (
    key === 'mutual-funds' &&
    (active.name === 'mutual-fund-new' || active.name === 'mutual-fund-detail')
  )
    return true;
  if (
    key === 'calendar' &&
    (active.name === 'calendar-new' || active.name === 'calendar-detail')
  )
    return true;
  return false;
};

// Small live counts for the Policies / Mutual funds nav badges.
// Refreshes on mount and whenever the window regains focus, so adding
// or deleting an item elsewhere is reflected without a full reload.
const useNavCounts = () => {
  const [policies, setPolicies] = useState<number | null>(null);
  const [funds, setFunds] = useState<number | null>(null);

  const refresh = async () => {
    try {
      const [p, f] = await Promise.all([
        window.policyhub.policies.list(),
        window.policyhub.mutualFunds.list(),
      ]);
      setPolicies(Array.isArray(p) ? p.length : 0);
      setFunds(Array.isArray(f) ? f.length : 0);
    } catch {
      /* ignore — non-fatal, just don't show counts */
    }
  };

  useEffect(() => {
    refresh();
    const onFocus = () => refresh();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  return {
    policies,
    funds,
    refresh,
  };
};

export const Sidebar = ({ collapsed }: { collapsed: boolean }) => {
  const { route, navigate } = useRouter();
  const counts = useNavCounts();
  // Re-fetch counts whenever the user changes route — covers the case
  // where they add a policy in the form page and come back.
  useEffect(() => {
    counts.refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [route.name]);
  const countFor = (key: Route['name']): number | null => {
    if (key === 'policies') return counts.policies;
    if (key === 'mutual-funds') return counts.funds;
    return null;
  };
  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r bg-card/40 transition-[width] duration-200',
        collapsed ? 'w-14' : 'w-60',
      )}
    >
      <div
        className={cn(
          'flex h-14 items-center gap-2 border-b drag-region',
          collapsed ? 'justify-center px-0' : 'px-4',
        )}
      >
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <ShieldCheck className="h-4 w-4" />
        </div>
        {!collapsed && (
          <div className="leading-tight">
            <div className="text-sm font-semibold">PolicyHub</div>
            <div className="text-[10px] text-muted-foreground">Local-first policy CRM</div>
          </div>
        )}
      </div>
      <nav className={cn('flex flex-col gap-1 no-drag', collapsed ? 'p-2' : 'p-3')}>
        {nav.map((item) => {
          const Icon = item.icon;
          const active = matches(route, item.key);
          const count = countFor(item.key);
          return (
            <button
              key={item.key}
              onClick={() => navigate(item.path)}
              title={
                collapsed
                  ? count !== null
                    ? `${item.label} (${count})`
                    : item.label
                  : undefined
              }
              aria-label={item.label}
              className={cn(
                'flex items-center rounded-md text-sm font-medium transition-colors',
                collapsed ? 'justify-center px-2 py-2' : 'gap-2 px-3 py-2',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && (
                <>
                  <span className="flex-1 text-left">{item.label}</span>
                  {count !== null && (
                    <span
                      className={cn(
                        'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums',
                        active
                          ? 'bg-primary/20 text-primary'
                          : 'bg-muted text-muted-foreground',
                      )}
                    >
                      {count}
                    </span>
                  )}
                </>
              )}
            </button>
          );
        })}
      </nav>
      <div
        className={cn(
          'mt-auto flex flex-col gap-1 border-t no-drag',
          collapsed ? 'px-2 py-2' : 'px-3 py-2',
        )}
      >
        <HelpDialog collapsed={collapsed} />
      </div>
      {!collapsed && (
        <div className="p-3 text-[11px] text-muted-foreground">
          Data lives on this machine. Backups in Settings.
        </div>
      )}
    </aside>
  );
};
