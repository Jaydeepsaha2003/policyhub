import * as React from 'react';

type Theme = 'light' | 'dark' | 'system';
type Ctx = {
  theme: Theme;
  effectiveTheme: 'light' | 'dark';
  setTheme: (t: Theme) => void;
};

const ThemeContext = React.createContext<Ctx | null>(null);

const resolveSystem = (): 'light' | 'dark' =>
  window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

const apply = (effective: 'light' | 'dark') => {
  const el = document.documentElement;
  if (effective === 'dark') el.classList.add('dark');
  else el.classList.remove('dark');
};

export const ThemeProvider = ({ children }: { children: React.ReactNode }) => {
  const [theme, setThemeState] = React.useState<Theme>('system');
  const [effective, setEffective] = React.useState<'light' | 'dark'>(resolveSystem());

  // On mount, fetch persisted theme from main.
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const s: any = await window.policyhub.settings.get();
        if (cancelled) return;
        const t = (s?.theme ?? 'system') as Theme;
        setThemeState(t);
      } catch {
        // settings may not be readable yet
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  React.useEffect(() => {
    const next = theme === 'system' ? resolveSystem() : theme;
    setEffective(next);
    apply(next);
  }, [theme]);

  React.useEffect(() => {
    if (theme !== 'system') return;
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const handler = () => {
      const next = resolveSystem();
      setEffective(next);
      apply(next);
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [theme]);

  const setTheme = React.useCallback((t: Theme) => {
    setThemeState(t);
    window.policyhub.settings.update({ theme: t }).catch(() => {});
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, effectiveTheme: effective, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const ctx = React.useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used inside ThemeProvider');
  return ctx;
};
