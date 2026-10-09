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

function UserPresenceHeartbeat() {
  const session = useAuthStore((s) => s.session);

  useEffect(() => {
    if (!session?.access_token) return;

    const sendHeartbeat = () => {
      if (typeof document !== 'undefined' && document.hidden) return;
      apiClient.post('/users/heartbeat', {}).catch(() => {});
    };

    sendHeartbeat();

    const onVisibilityChange = () => {
      if (typeof document !== 'undefined' && !document.hidden) {
        sendHeartbeat();
      }
    };

    document.addEventListener('visibilitychange', onVisibilityChange);
    window.addEventListener('focus', sendHeartbeat);
    const interval = setInterval(sendHeartbeat, 25_000);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      window.removeEventListener('focus', sendHeartbeat);
    };
  }, [session?.access_token]);

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
          useAuthStore.getState().clearAuth();
          setIsPasswordRecovery(true);
          setRecoverySession(session);
          setSession(null);
          setUser(null);
        } else if (session) {
          const status = await useAuthStore.getState().verifySession(session);
          if (active && status === 'mfa_pending' && window.location.pathname !== '/2fa') {
            void router.navigate('/2fa', { replace: true });
          }
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
        useAuthStore.getState().clearAuth();
        setIsPasswordRecovery(true);
        setRecoverySession(session);
        setSession(null);
        setUser(null);
        setLoading(false);
        if (window.location.pathname !== '/reset-password') {
          void router.navigate('/reset-password', { replace: true });
        }
      } else if (event === 'SIGNED_OUT') {
        useAuthStore.getState().clearAuth();
      } else if (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'USER_UPDATED') {
        if (useAuthStore.getState().isPasswordRecovery || isRecoveryTarget() || window.location.pathname === '/reset-password') {
          setRecoverySession(session);
          setSession(null);
          setUser(null);
          setLoading(false);
        } else {
          // Run outside the Supabase callback: refreshing SDK state within its
          // synchronous auth callback can deadlock the provider's internal lock.
          void Promise.resolve().then(() => active ? useAuthStore.getState().verifySession(session) : 'superseded').then((status) => {
            if (active && status === 'mfa_pending' && !['/login', '/2fa'].includes(window.location.pathname)) {
              void router.navigate('/2fa', { replace: true });
            }
          }).catch((error) => logAuthError('VerifySession', error));
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
      <UserPresenceHeartbeat />
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
