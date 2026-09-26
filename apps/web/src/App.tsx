import { useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import { RouterProvider } from 'react-router-dom';
import { router } from './router';
import { supabase } from './services/supabase';
import { useAuthStore } from './store/authStore';
import { logAuthError } from './lib/authErrors';
import { useSettingsStore } from './store/settingsStore';
import { ThemeProvider, useTheme, type Theme } from './contexts/ThemeProvider';
import { AppErrorBoundary } from './components/ErrorBoundary';
import CommandPalette from './components/CommandPalette';
import { MfaVerificationModal } from './components/auth/MfaVerificationModal';
import { initCapacitorServices } from './services/native/capacitorAppService';
import { useAppVersionStore } from './store/appVersionStore';
import { UpdateRequiredScreen } from './components/UpdateRequiredScreen';
import { FullPageLoader } from './components/auth/ProtectedRoute';
import { apiClient } from './services/api/client';

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
    // Set custom accent variable so html[data-accent="custom"] can use it
    // without overriding user swatch selections (emerald, rose, amber, cyan, violet, indigo).
    root.style.setProperty('--custom-accent', hex);
  }, [settings]);

  return null;
}

export function App() {
  const setSession = useAuthStore((s) => s.setSession);
  const setUser = useAuthStore((s) => s.setUser);
  const setLoading = useAuthStore((s) => s.setLoading);
  const setIsPasswordRecovery = useAuthStore((s) => s.setIsPasswordRecovery);
  const setRecoverySession = useAuthStore((s) => s.setRecoverySession);
  const loadSettings = useSettingsStore((s) => s.loadSettings);

  // Version gate state — must be read before rendering any routes
  const versionStatus = useAppVersionStore((s) => s.status);
  const checkVersion = useAppVersionStore((s) => s.check);

  useEffect(() => {
    void initCapacitorServices();
    loadSettings();
    // Run the Android version check immediately on mount.
    // On web this is an instant no-op returning 'ok'.
    void checkVersion();
  }, [loadSettings, checkVersion]);

  useEffect(() => {
    let active = true;

    const isRecoveryTarget = () => {
      const hash = typeof window !== 'undefined' ? window.location.hash || '' : '';
      const search = typeof window !== 'undefined' ? window.location.search || '' : '';
      const pathname = typeof window !== 'undefined' ? window.location.pathname || '' : '';
      return (
        hash.includes('type=recovery') ||
        search.includes('type=recovery') ||
        search.includes('next=%2Freset-password') ||
        search.includes('next=/reset-password') ||
        (pathname === '/reset-password' && (search.includes('code=') || hash.includes('access_token') || hash.includes('type=recovery')))
      );
    };

    supabase.auth
      .getSession()
      .then(async ({ data: { session } }) => {
        if (!active) return;
        if (isRecoveryTarget()) {
          setIsPasswordRecovery(true);
          setRecoverySession(session);
          setSession(null);
          setUser(null);
        } else if (session) {
          const isMfaPending =
            sessionStorage.getItem('mfa_pending') === 'true' ||
            window.location.pathname === '/2fa';

          if (isMfaPending) {
            try {
              const res = await apiClient.post<{ status: string; requiresTwoFactor?: boolean }>(
                '/auth/session',
                { token: session.access_token },
                session.access_token,
              );
              if (res.requiresTwoFactor || res.status === 'mfa_required') {
                sessionStorage.setItem('mfa_pending', 'true');
                setIsPasswordRecovery(false);
                setRecoverySession(null);
                setSession(null);
                setUser(null);
                useAuthStore.getState().setIsMfaRequired(true);
                useAuthStore.getState().setPendingMfaSession(session);
                if (window.location.pathname !== '/2fa') {
                  void router.navigate('/2fa', { replace: true });
                }
                return;
              } else {
                sessionStorage.removeItem('mfa_pending');
              }
            } catch (err) {
              sessionStorage.setItem('mfa_pending', 'true');
              setIsPasswordRecovery(false);
              setRecoverySession(null);
              setSession(null);
              setUser(null);
              useAuthStore.getState().setIsMfaRequired(true);
              useAuthStore.getState().setPendingMfaSession(session);
              if (window.location.pathname !== '/2fa') {
                void router.navigate('/2fa', { replace: true });
              }
              return;
            }
          }

          setIsPasswordRecovery(false);
          setRecoverySession(null);
          setSession(session);
          setUser(session?.user ?? null);
        } else {
          setIsPasswordRecovery(false);
          setRecoverySession(null);
          setSession(null);
          setUser(null);
        }
      })
      .catch((err) => {
        logAuthError('RestoreSession', err);
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;

      if (event === 'PASSWORD_RECOVERY') {
        setIsPasswordRecovery(true);
        setRecoverySession(session);
        setSession(null);
        setUser(null);
        setLoading(false);
        if (window.location.pathname !== '/reset-password') {
          void router.navigate('/reset-password', { replace: true });
        }
      } else if (event === 'SIGNED_IN') {
        // If recovery flow is active or user is on /reset-password, do not treat as standard app login
        if (useAuthStore.getState().isPasswordRecovery || isRecoveryTarget() || window.location.pathname === '/reset-password') {
          setIsPasswordRecovery(true);
          setRecoverySession(session);
          setSession(null);
          setUser(null);
          setLoading(false);
        } else if (useAuthStore.getState().isMfaRequired) {
          // Login-time 2FA is pending: hold the raw Supabase session in
          // pendingMfaSession WITHOUT promoting it to session. This prevents
          // PublicOnlyRoute from seeing a live session and redirecting to /.
          // LoginPage will call setSession(pendingMfaSession) only after TOTP succeeds.
          useAuthStore.getState().setPendingMfaSession(session);
          setLoading(false);
        } else {
          setIsPasswordRecovery(false);
          setRecoverySession(null);
          setSession(session);
          setUser(session?.user ?? null);
          setLoading(false);
        }
      } else if (event === 'SIGNED_OUT') {
        setIsPasswordRecovery(false);
        setRecoverySession(null);
        setSession(null);
        setUser(null);
        setLoading(false);
      } else if (event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        if (useAuthStore.getState().isPasswordRecovery) {
          setRecoverySession(session);
        } else {
          setSession(session);
          setUser(session?.user ?? null);
        }
      }
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, [setSession, setUser, setLoading, setIsPasswordRecovery, setRecoverySession]);

  return (
    <ThemeProvider defaultTheme="dark" storageKey="gaming-hub-theme">
      <SiteThemeSync />
      <AppErrorBoundary>
        {/* Android version gate: hard-locked state renders ONLY the update screen.
            Web browsers always pass through (versionStatus is immediately 'ok'). */}
        {versionStatus === 'hard-locked' ? (
          <UpdateRequiredScreen />
        ) : versionStatus === 'checking' ? (
          <FullPageLoader />
        ) : (
          <>
            <RouterProvider router={router} />
            <Toaster position="top-right" toastOptions={{ duration: 3000 }} />
            <CommandPalette />
            <MfaVerificationModal />
          </>
        )}
      </AppErrorBoundary>
    </ThemeProvider>
  );
}

export default App;
