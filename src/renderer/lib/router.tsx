import * as React from 'react';

// Tiny hash-based router. Routes:
//   #/                       Dashboard
//   #/policies               Policies list
//   #/policies/new           Add policy
//   #/policies/:id           Policy detail
//   #/payments               Payments
//   #/reminders              Reminders
//   #/settings               Settings

export type Route =
  | { name: 'dashboard' }
  | { name: 'policies' }
  | { name: 'policy-new' }
  | { name: 'policy-detail'; id: string }
  | { name: 'payments' }
  | { name: 'reminders' }
  | { name: 'settings' };

const parse = (hash: string): Route => {
  const h = hash.replace(/^#/, '');
  if (!h || h === '/') return { name: 'dashboard' };
  const parts = h.split('/').filter(Boolean);
  if (parts[0] === 'policies') {
    if (parts[1] === 'new') return { name: 'policy-new' };
    if (parts[1]) return { name: 'policy-detail', id: parts[1] };
    return { name: 'policies' };
  }
  if (parts[0] === 'payments') return { name: 'payments' };
  if (parts[0] === 'reminders') return { name: 'reminders' };
  if (parts[0] === 'settings') return { name: 'settings' };
  return { name: 'dashboard' };
};

const RouterContext = React.createContext<{
  route: Route;
  navigate: (path: string) => void;
} | null>(null);

export const RouterProvider = ({ children }: { children: React.ReactNode }) => {
  const [route, setRoute] = React.useState<Route>(() => parse(window.location.hash));

  React.useEffect(() => {
    const handler = () => setRoute(parse(window.location.hash));
    window.addEventListener('hashchange', handler);
    return () => window.removeEventListener('hashchange', handler);
  }, []);

  const navigate = React.useCallback((path: string) => {
    const target = path.startsWith('#') ? path : `#${path.startsWith('/') ? path : '/' + path}`;
    if (window.location.hash === target) {
      setRoute(parse(target));
    } else {
      window.location.hash = target;
    }
  }, []);

  return (
    <RouterContext.Provider value={{ route, navigate }}>{children}</RouterContext.Provider>
  );
};

export const useRouter = () => {
  const ctx = React.useContext(RouterContext);
  if (!ctx) throw new Error('useRouter must be used inside RouterProvider');
  return ctx;
};
