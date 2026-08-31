import { App as CapApp } from '@capacitor/app';
import { StatusBar, Style } from '@capacitor/status-bar';
import { SplashScreen } from '@capacitor/splash-screen';
import { Keyboard } from '@capacitor/keyboard';
import { isNativePlatform } from './platform';
import { router } from '../../router';
import { useAuthStore } from '../../store/authStore';
import { supabase } from '../supabase';

let isInitialized = false;

/**
 * Initializes native Capacitor services (Back Button, Deep Linking, Status Bar, Splash Screen).
 * Safely no-ops in standard web browsers.
 */
export async function initCapacitorServices(): Promise<void> {
  if (!isNativePlatform() || isInitialized) return;
  isInitialized = true;

  try {
    // 1. Status Bar Setup
    await StatusBar.setStyle({ style: Style.Dark });
    await StatusBar.setBackgroundColor({ color: '#070b14' });
    await StatusBar.setOverlaysWebView({ overlay: false });
  } catch {
    // Graceful fallback if status bar features are unsupported on current device
  }

  try {
    // 2. Hide Splash Screen after layout is ready
    await SplashScreen.hide();
  } catch {
    // Splash screen no-op
  }

  try {
    // 3. Configure Keyboard
    await Keyboard.setAccessoryBarVisible({ isVisible: false });
  } catch {
    // Keyboard plugin fallback
  }

  // 4. Android Hardware Back Button Handling
  CapApp.addListener('backButton', ({ canGoBack }) => {
    const currentPath = window.location.pathname;
    const rootPaths = ['/', '/login', '/signup', '/2fa'];

    if (rootPaths.includes(currentPath) || !canGoBack) {
      // Minimize app when at root level
      void CapApp.minimizeApp();
    } else {
      // Navigate to previous route in React Router
      void router.navigate(-1);
    }
  });

  // 5. Deep Linking & App Links (Password reset, auth redirects, etc.)
  CapApp.addListener('appUrlOpen', (data) => {
    try {
      const url = new URL(data.url);
      const pathname = url.pathname;
      const search = url.search;
      const hash = url.hash;

      // Handle Password Recovery deep links
      if (
        pathname === '/reset-password' ||
        search.includes('type=recovery') ||
        hash.includes('type=recovery')
      ) {
        // Enforce strict password recovery state: NEVER auto-log in
        useAuthStore.getState().setIsPasswordRecovery(true);
        useAuthStore.getState().setSession(null);
        useAuthStore.getState().setUser(null);

        const target = `/reset-password${search}${hash}`;
        void router.navigate(target, { replace: true });
        return;
      }

      // Handle other application routes
      if (pathname && pathname !== '/') {
        void router.navigate(`${pathname}${search}${hash}`);
      }
    } catch {
      // If parsing fails, attempt relative path navigation
      const slug = data.url.split('://')[1] || '';
      if (slug) {
        const path = slug.startsWith('/') ? slug : `/${slug}`;
        void router.navigate(path);
      }
    }
  });

  // 6. Native App Lifecycle (Foreground / Background)
  CapApp.addListener('appStateChange', (state) => {
    if (state.isActive) {
      // When resuming from background, verify auth session validity
      void supabase.auth.getSession().then(({ data: { session } }) => {
        if (!useAuthStore.getState().isPasswordRecovery) {
          useAuthStore.getState().setSession(session);
          useAuthStore.getState().setUser(session?.user ?? null);
        }
      });
    }
  });
}
