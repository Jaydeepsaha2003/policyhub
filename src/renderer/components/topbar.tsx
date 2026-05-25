import { Moon, Sun, Plus, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { Button } from './ui/button';
import { useTheme } from './theme-provider';
import { useRouter } from '@/lib/router';

const titleFor = (name: string): string => {
  switch (name) {
    case 'dashboard':
      return 'Dashboard';
    case 'policies':
      return 'Policies';
    case 'policy-new':
      return 'New policy';
    case 'policy-detail':
      return 'Policy detail';
    case 'payments':
      return 'Payments';
    case 'reminders':
      return 'Reminders';
    case 'valuation':
      return 'Valuation';
    case 'repayments':
      return 'Repayments';
    case 'settings':
      return 'Settings';
    default:
      return '';
  }
};

type Props = {
  sidebarCollapsed: boolean;
  onToggleSidebar: () => void;
};

export const Topbar = ({ sidebarCollapsed, onToggleSidebar }: Props) => {
  const { route, navigate } = useRouter();
  const { effectiveTheme, setTheme } = useTheme();
  return (
    <header className="flex h-14 items-center justify-between border-b px-6 drag-region">
      <div className="flex items-center gap-2 no-drag">
        <Button
          variant="ghost"
          size="icon"
          aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          onClick={onToggleSidebar}
        >
          {sidebarCollapsed ? (
            <PanelLeftOpen className="h-4 w-4" />
          ) : (
            <PanelLeftClose className="h-4 w-4" />
          )}
        </Button>
        <h1 className="text-lg font-semibold tracking-tight">{titleFor(route.name)}</h1>
      </div>
      <div className="flex items-center gap-2 no-drag">
        {(route.name === 'dashboard' || route.name === 'policies') && (
          <Button size="sm" onClick={() => navigate('/policies/new')}>
            <Plus className="h-4 w-4" />
            New policy
          </Button>
        )}
        <Button
          variant="ghost"
          size="icon"
          aria-label="Toggle theme"
          onClick={() => setTheme(effectiveTheme === 'dark' ? 'light' : 'dark')}
        >
          {effectiveTheme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
      </div>
    </header>
  );
};
