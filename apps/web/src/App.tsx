import { useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { supabase } from './services/supabase';
import { useAuthStore } from './store/authStore';
import { useSettingsStore } from './store/settingsStore';
import { ThemeProvider } from './contexts/ThemeProvider';
import { AppErrorBoundary } from './components/ErrorBoundary';
import CommandPalette from './components/CommandPalette';

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
      <AppErrorBoundary>
        <RouterProvider router={router} />
        <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
        <CommandPalette />
      </AppErrorBoundary>
    </ThemeProvider>
  );
}

export default App;
