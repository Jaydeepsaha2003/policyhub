import { LayoutDashboard, FileText, IndianRupee, BellRing, Settings, ShieldCheck } from 'lucide-react';
import { useRouter, type Route } from '@/lib/router';
import { cn } from '@/lib/utils';

const nav: { key: Route['name']; label: string; path: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: 'dashboard', label: 'Dashboard', path: '/', icon: LayoutDashboard },
  { key: 'policies', label: 'Policies', path: '/policies', icon: FileText },
  { key: 'payments', label: 'Payments', path: '/payments', icon: IndianRupee },
  { key: 'reminders', label: 'Reminders', path: '/reminders', icon: BellRing },
  { key: 'settings', label: 'Settings', path: '/settings', icon: Settings },
];

const matches = (active: Route, key: Route['name']): boolean => {
  if (active.name === key) return true;
  if (key === 'policies' && (active.name === 'policy-new' || active.name === 'policy-detail')) return true;
  return false;
};

export const Sidebar = () => {
  const { route, navigate } = useRouter();
  return (
    <aside className="flex h-full w-60 flex-col border-r bg-card/40">
      <div className="flex h-14 items-center gap-2 border-b px-4 drag-region">
        <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
          <ShieldCheck className="h-4 w-4" />
        </div>
        <div className="leading-tight">
          <div className="text-sm font-semibold">PolicyHub</div>
          <div className="text-[10px] text-muted-foreground">Local-first policy CRM</div>
        </div>
      </div>
      <nav className="flex flex-col gap-1 p-3 no-drag">
        {nav.map((item) => {
          const Icon = item.icon;
          const active = matches(route, item.key);
          return (
            <button
              key={item.key}
              onClick={() => navigate(item.path)}
              className={cn(
                'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                active
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground',
              )}
            >
              <Icon className="h-4 w-4" />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="mt-auto p-3 text-[11px] text-muted-foreground">
        Data lives on this machine. Backups in Settings.
      </div>
    </aside>
  );
};
