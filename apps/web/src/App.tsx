import React, { useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { supabase } from './services/supabase';
import { useAuthStore } from './store/authStore';
import { ThemeProvider } from './contexts/ThemeProvider';

export function App() {
  const { setSession, setUser, setLoading } = useAuthStore();

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, [setSession, setUser, setLoading]);

  return (
    <ThemeProvider defaultTheme="dark" storageKey="gaming-hub-theme">
      <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
      <RouterProvider router={router} />
    </ThemeProvider>
  );
}

export default App;
