import { useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { supabase } from './services/supabase';
import { useAuthStore } from './store/authStore';
import { useSettingsStore } from './store/settingsStore';
import { ThemeProvider, useTheme, type Theme } from './contexts/ThemeProvider';
import { AppErrorBoundary } from './components/ErrorBoundary';
import CommandPalette from './components/CommandPalette';

/**
 * Applies the admin-configured site theme (settings → general.theme) the first
 * time it loads, but only when the visitor has not explicitly chosen a theme
 * themselves. Once a user picks a theme it wins over the site default.
 * Also applies the admin-configured brand color (settings → general.primaryColor)
 * by switching the accent to the derived "custom" scale.
 */
function SiteThemeSync() {
  const { setTheme } = useTheme();
  const settings = useSettingsStore((s) => s.settings);

  useEffect(() => {
    const siteTheme = settings?.general?.theme;
    if (siteTheme !== 'light' && siteTheme !== 'dark' && siteTheme !== 'system') return;
    const hasPreference = localStorage.getItem('gaming-hub-theme') !== null;
    if (hasPreference) return;
    setTheme(siteTheme as Theme);
  }, [settings, setTheme]);

  useEffect(() => {
    const root = window.document.documentElement;
    const primaryColor = settings?.general?.primaryColor;
    if (!primaryColor || !/^#?[0-9a-fA-F]{6}$/.test(primaryColor)) return;
    const hex = primaryColor.startsWith('#') ? primaryColor : `#${primaryColor}`;
    // Inline styles outrank the html[data-accent="..."] stylesheet rules, so the
    // admin brand color wins regardless of the active accent swatch.
    const set = (name: string, mix: string) => root.style.setProperty(name, mix);
    set('--color-accent-500', hex);
    set('--color-accent-600', `color-mix(in srgb, ${hex} 82%, black)`);
    set('--color-accent-700', `color-mix(in srgb, ${hex} 64%, black)`);
    set('--color-accent-800', `color-mix(in srgb, ${hex} 46%, black)`);
    set('--color-accent-900', `color-mix(in srgb, ${hex} 28%, black)`);
    set('--color-accent-400', `color-mix(in srgb, ${hex} 82%, white)`);
    set('--color-accent-300', `color-mix(in srgb, ${hex} 64%, white)`);
    set('--color-accent-200', `color-mix(in srgb, ${hex} 46%, white)`);
    set('--color-accent-100', `color-mix(in srgb, ${hex} 28%, white)`);
    set('--color-accent-50', `color-mix(in srgb, ${hex} 14%, white)`);
  }, [settings]);

  return null;
}

export function App() {
  const setSession = useAuthStore((s) => s.setSession);
  const setUser = useAuthStore((s) => s.setUser);
  const setLoading = useAuthStore((s) => s.setLoading);
  const loadSettings = useSettingsStore((s) => s.loadSettings);

  useEffect(() => {
    loadSettings();
  }, [loadSettings]);

  useEffect(() => {
    let active = true;

    supabase.auth.getSession().then(({ data: { session } }) => {
      if (!active) return;
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [setSession, setUser, setLoading]);

  return (
    <ThemeProvider defaultTheme="dark" storageKey="gaming-hub-theme">
      <SiteThemeSync />
      <AppErrorBoundary>
        <RouterProvider router={router} />
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
        <CommandPalette />
      </AppErrorBoundary>
    </ThemeProvider>
  );
}

export default App;
