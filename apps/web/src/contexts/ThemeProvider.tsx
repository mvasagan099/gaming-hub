import React, { createContext, useContext, useEffect, useMemo, useState } from 'react';

export type Theme = 'light' | 'dark' | 'system';
export type Accent = 'indigo' | 'violet' | 'emerald' | 'amber' | 'rose' | 'cyan';
export type Contrast = 'normal' | 'high';

export const ACCENTS: Accent[] = ['indigo', 'violet', 'emerald', 'amber', 'rose', 'cyan'];

export const ACCENT_SWATCHES: Record<Accent, string> = {
  indigo: 'bg-indigo-500',
  violet: 'bg-violet-500',
  emerald: 'bg-emerald-500',
  amber: 'bg-amber-500',
  rose: 'bg-rose-500',
  cyan: 'bg-cyan-500',
};

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  defaultAccent?: Accent;
  storageKey?: string;
};

type ThemeProviderState = {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  accent: Accent;
  setAccent: (accent: Accent) => void;
  contrast: Contrast;
  setContrast: (contrast: Contrast) => void;
  /** Resolved color scheme ('light' | 'dark'), honoring the 'system' option. */
  effectiveTheme: 'light' | 'dark';
};

const initialState: ThemeProviderState = {
  theme: 'dark',
  setTheme: () => null,
  accent: 'indigo',
  setAccent: () => null,
  contrast: 'normal',
  setContrast: () => null,
  effectiveTheme: 'dark',
};

const ThemeProviderContext = createContext<ThemeProviderState>(initialState);

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const value = localStorage.getItem(key) as T | null;
  return value && allowed.includes(value) ? value : fallback;
}

export function ThemeProvider({
  children,
  defaultTheme = 'dark',
  defaultAccent = 'indigo',
  storageKey = 'vite-ui-theme',
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(
    () => readStored<Theme>(storageKey, ['light', 'dark', 'system'], defaultTheme)
  );
  const [accent, setAccent] = useState<Accent>(
    () => readStored<Accent>('vite-ui-accent', ACCENTS, defaultAccent)
  );
  const [contrast, setContrast] = useState<Contrast>(
    () => readStored<Contrast>('vite-ui-contrast', ['normal', 'high'], 'normal')
  );
  const [systemPrefersDark, setSystemPrefersDark] = useState(
    () => window.matchMedia('(prefers-color-scheme: dark)').matches
  );

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = (event: MediaQueryListEvent) => setSystemPrefersDark(event.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const effectiveTheme: 'light' | 'dark' =
    theme === 'system' ? (systemPrefersDark ? 'dark' : 'light') : theme;

  useEffect(() => {
    const root = window.document.documentElement;

    root.classList.remove('light', 'dark');
    root.classList.add(effectiveTheme);
    root.setAttribute('data-accent', accent);
    root.setAttribute('data-contrast', contrast);
    root.dataset.theme = effectiveTheme;
  }, [effectiveTheme, accent, contrast]);

  const value = useMemo(
    () => ({
      theme,
      accent,
      contrast,
      effectiveTheme,
      setTheme: (next: Theme) => {
        localStorage.setItem(storageKey, next);
        setTheme(next);
      },
      setAccent: (next: Accent) => {
        localStorage.setItem('vite-ui-accent', next);
        setAccent(next);
      },
      setContrast: (next: Contrast) => {
        localStorage.setItem('vite-ui-contrast', next);
        setContrast(next);
      },
    }),
    [theme, accent, contrast, effectiveTheme, storageKey]
  );

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);
  if (context === undefined)
    throw new Error('useTheme must be used within a ThemeProvider');
  return context;
};
